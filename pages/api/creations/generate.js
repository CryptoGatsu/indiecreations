import { isGameId, PROMPT_MAX, MIN_CREATOR_TOKENS } from '../../../lib/creations';
import { addVersion, createGame, getGame, getHtml, logGeneration, persistent } from '../../../lib/creationStore';
import { aiConfigured, generateGame, GenerationError } from '../../../lib/creationAI';
import { listItems } from '../../../lib/creatorStore';
import { creatorStatus, gameView, holderWallet, SITE_PER_DAY, siteUsedToday } from '../../../lib/creators';

// POST { prompt, id? } -> makes a new game from a prompt, or (with id) a new version of one of the holder's games.
// Writing a game takes a few minutes, so the answer streams as newline-delimited JSON:
//   { type: 'progress', chars }   the code written so far (a few times a second)
//   { type: 'done', game }        saved; game.version is the new version
//   { type: 'error', error }      nothing saved; the message is meant for the creator
// Checks before any tokens are spent: a verified holder session, enough $CREATIONS for the games they'd have
// (lib/creations.js tiers), their daily allowance, and the site's.
export const config = { maxDuration: 300 };

const GENERATION_TIMEOUT_MS = 285_000; // finish (and say so) before the platform cuts the function off

export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).end();
  res.setHeader('Cache-Control', 'no-store');

  const wallet = await holderWallet(req);
  if (!wallet) return res.status(401).json({ error: 'Verify your wallet first.' });
  if (!aiConfigured()) return res.status(503).json({ error: 'Game creation is switched off right now.' });
  if (!persistent && process.env.NODE_ENV === 'production') {
    return res.status(503).json({ error: 'Game creation is not set up yet.' });
  }

  const prompt = typeof req.body?.prompt === 'string' ? req.body.prompt.trim() : '';
  if (prompt.length < 3) return res.status(400).json({ error: 'Describe the game (or the change) you want.' });
  if (prompt.length > PROMPT_MAX) return res.status(400).json({ error: `Keep it under ${PROMPT_MAX} characters.` });
  const id = req.body?.id;
  if (id !== undefined && !isGameId(id)) return res.status(400).json({ error: 'Invalid game.' });

  let game = null;
  try {
    if (id) {
      game = await getGame(id);
      if (!game || game.owner !== wallet) return res.status(404).json({ error: 'Game not found.' });
      if (game.hidden) return res.status(403).json({ error: 'The studio took this game down, so it cannot be edited.' });
    }

    const status = await creatorStatus(wallet);
    const owned = status.games.length;
    if (status.slots === 0) {
      return res.status(403).json({ error: `Creating games takes at least ${MIN_CREATOR_TOKENS.toLocaleString('en-US')} $CREATIONS.` });
    }
    if (!game && owned >= status.slots) {
      return res.status(403).json({
        error: `Your holdings allow ${status.slots} game${status.slots === 1 ? '' : 's'} and you have ${owned}. Delete one, or hold more $CREATIONS for another.`,
      });
    }
    if (game && owned > status.slots) {
      return res.status(403).json({
        error: `Your holdings allow ${status.slots} game${status.slots === 1 ? '' : 's'} but you have ${owned}. Delete ${owned - status.slots} to keep editing, or hold more $CREATIONS.`,
      });
    }
    if (status.usedToday >= status.perDay) {
      return res.status(429).json({ error: `That's your ${status.perDay} generations for today. Come back tomorrow.` });
    }
    if ((await siteUsedToday()) >= SITE_PER_DAY) {
      return res.status(429).json({ error: 'The studio has made all the games it can for today. Try again tomorrow.' });
    }

    await logGeneration(wallet, game?.id || null, game ? 'edit' : 'create');
  } catch (err) {
    console.error('creation checks failed:', err);
    return res.status(500).json({ error: 'Could not check your holdings. Try again shortly.' });
  }

  res.writeHead(200, { 'Content-Type': 'application/x-ndjson; charset=utf-8', 'X-Accel-Buffering': 'no' });
  const send = (obj) => res.write(`${JSON.stringify(obj)}\n`);
  send({ type: 'progress', chars: 0 });

  let last = 0;
  const onProgress = (chars) => {
    const now = Date.now();
    if (now - last < 400) return;
    last = now;
    send({ type: 'progress', chars });
  };

  const abort = new AbortController();
  const timer = setTimeout(() => abort.abort(), GENERATION_TIMEOUT_MS);
  // keeps the connection busy while Claude is still thinking and no code has arrived yet
  const heartbeat = setInterval(() => send({ type: 'progress', chars: -1 }), 10_000);

  try {
    let current = null;
    if (game) {
      current = await getHtml(game.id, game.version);
      if (!current) throw new GenerationError('The current version could not be loaded. Try again.');
    }
    // the store's items on sale, so every change keeps them working (and a new one can be built in)
    const items = game ? (await listItems(game.id)).filter((i) => i.available).map(({ id, name, description }) => ({ id, name, description })) : [];
    const result = await generateGame({
      request: prompt,
      current,
      originalPrompt: game?.prompt,
      items,
      onProgress,
      signal: abort.signal,
    });
    // an edit keeps the game's name: the creator may have renamed it
    const saved = game
      ? await addVersion(game, { request: prompt, ...result, title: game.title })
      : await createGame({ owner: wallet, prompt, ...result });
    send({ type: 'done', game: gameView(saved, { full: true }) });
  } catch (err) {
    if (err instanceof GenerationError) send({ type: 'error', error: err.message });
    else {
      console.error('creation generate failed:', err);
      send({ type: 'error', error: 'Something went wrong writing the game. Try again.' });
    }
  } finally {
    clearTimeout(timer);
    clearInterval(heartbeat);
    res.end();
  }
}
