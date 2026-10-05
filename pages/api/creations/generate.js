import { isGameId, PROMPT_MAX, MIN_CREATOR_TOKENS } from '../../../lib/creations';
import crypto from 'crypto';
import { addVersion, createGame, deleteJob, getGame, getHtml, getJob, logGeneration, persistent, saveJob } from '../../../lib/creationStore';
import { aiConfigured, generateGame, GenerationCutOff, GenerationError, HTML_MAX } from '../../../lib/creationAI';
import { listItems } from '../../../lib/creatorStore';
import { creatorStatus, gameView, holderWallet, SITE_PER_DAY, siteUsedToday } from '../../../lib/creators';

// POST { prompt, id? } -> makes a new game from a prompt, or (with id) a new version of one of the holder's games.
// POST { jobId }       -> carries on a run that was cut off (see 'continue' below).
// Writing a game takes a few minutes, so the answer streams as newline-delimited JSON:
//   { type: 'progress', chars }    the code written so far (a few times a second)
//   { type: 'continue', jobId }    this function run is out of time; what was written is saved, POST { jobId } to go on
//   { type: 'done', game }         saved; game.version is the new version
//   { type: 'error', error }       nothing saved; the message is meant for the creator
// A big game can take longer than one function may run, so it is written over as many runs as it needs: each one
// stops a little before the platform's limit, saves the text so far, and the next continues from exactly there, at low
// effort (the plan is already in the text, so it writes instead of thinking it all through again). A game is only
// given up on when two runs in a row add almost nothing, it passes HTML_MAX, or MAX_LEGS runs (a safety net).
// Checks before any tokens are spent: a verified holder session, enough $CREATIONS for the games they'd have
// (lib/creations.js tiers), their daily allowance, and the site's. A continuation counts as the same generation.
export const config = { maxDuration: 300 };

// keep in step with maxDuration: stop, save and say so before the platform cuts off (shorter in development, to try it)
const LEG_MS = (process.env.NODE_ENV !== 'production' && Number(process.env.CREATIONS_LEG_MS)) || (300 - 20) * 1000;
const MAX_LEGS = 12;
const STALL_CHARS = Math.round(LEG_MS / 560); // a run that adds less than this (500 characters in 280 s) made no real progress
const JOB_TTL_MS = 30 * 60 * 1000; // an unfinished run can be continued for this long

class Refusal extends Error {
  constructor(status, message) {
    super(message);
    this.status = status;
  }
}

// Throws a Refusal when this wallet may not run this generation right now.
async function checkAllowed(wallet, game, { fresh }) {
  const status = await creatorStatus(wallet);
  const owned = status.games.length;
  const plural = status.slots === 1 ? '' : 's';
  if (status.slots === 0) {
    throw new Refusal(403, `Creating games takes at least ${MIN_CREATOR_TOKENS.toLocaleString('en-US')} $CREATIONS.`);
  }
  if (!game && owned >= status.slots) {
    throw new Refusal(403, `Your holdings allow ${status.slots} game${plural} and you have ${owned}. Delete one, or hold more $CREATIONS for another.`);
  }
  if (game && owned > status.slots) {
    throw new Refusal(403, `Your holdings allow ${status.slots} game${plural} but you have ${owned}. Delete ${owned - status.slots} to keep editing, or hold more $CREATIONS.`);
  }
  if (!fresh) return;
  if (status.usedToday >= status.perDay) {
    throw new Refusal(429, `That's your ${status.perDay} generations for today. Come back tomorrow.`);
  }
  if ((await siteUsedToday()) >= SITE_PER_DAY) {
    throw new Refusal(429, 'The studio has made all the games it can for today. Try again tomorrow.');
  }
}

export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).end();
  res.setHeader('Cache-Control', 'no-store');

  const wallet = await holderWallet(req);
  if (!wallet) return res.status(401).json({ error: 'Verify your wallet first.' });
  if (!aiConfigured()) return res.status(503).json({ error: 'Game creation is switched off right now.' });
  if (!persistent && process.env.NODE_ENV === 'production') {
    return res.status(503).json({ error: 'Game creation is not set up yet.' });
  }

  const body = req.body || {};
  let job = null;
  let game = null;
  let prompt;
  let baseVersion = null;
  try {
    if (body.jobId !== undefined) {
      job = await getJob(body.jobId);
      if (!job || job.wallet !== wallet || Date.now() - Date.parse(job.updated_at) > JOB_TTL_MS) {
        return res.status(404).json({ error: 'That run has expired. Start it again.' });
      }
      prompt = job.request;
      baseVersion = job.base_version;
      if (job.game_id) game = await getGame(job.game_id);
      if (job.game_id && !game) return res.status(404).json({ error: 'Game not found.' });
    } else {
      prompt = typeof body.prompt === 'string' ? body.prompt.trim() : '';
      if (prompt.length < 3) return res.status(400).json({ error: 'Describe the game (or the change) you want.' });
      if (prompt.length > PROMPT_MAX) return res.status(400).json({ error: `Keep it under ${PROMPT_MAX} characters.` });
      if (body.id !== undefined && !isGameId(body.id)) return res.status(400).json({ error: 'Invalid game.' });
      if (body.id) {
        game = await getGame(body.id);
        if (!game) return res.status(404).json({ error: 'Game not found.' });
        baseVersion = game.version;
      }
    }
    if (game && game.owner !== wallet) return res.status(404).json({ error: 'Game not found.' });
    if (game?.hidden) return res.status(403).json({ error: 'The studio took this game down, so it cannot be edited.' });

    await checkAllowed(wallet, game, { fresh: !job });
    if (!job) await logGeneration(wallet, game?.id || null, game ? 'edit' : 'create');
  } catch (err) {
    if (err instanceof Refusal) return res.status(err.status).json({ error: err.message });
    console.error('creation checks failed:', err);
    return res.status(500).json({ error: 'Could not check your holdings. Try again shortly.' });
  }

  res.writeHead(200, { 'Content-Type': 'application/x-ndjson; charset=utf-8', 'X-Accel-Buffering': 'no' });
  const send = (obj) => res.write(`${JSON.stringify(obj)}\n`);
  send({ type: 'progress', chars: job ? job.partial.length : 0 });

  let last = 0;
  const onProgress = (chars) => {
    const now = Date.now();
    if (now - last < 400) return;
    last = now;
    send({ type: 'progress', chars });
  };

  const started = Date.now();
  const abort = new AbortController();
  const timer = setTimeout(() => abort.abort(), LEG_MS);
  // keeps the connection busy while Claude is still thinking and no code has arrived yet
  const heartbeat = setInterval(() => send({ type: 'progress', chars: -1 }), 10_000);

  try {
    let current = null;
    if (game) {
      current = await getHtml(game.id, baseVersion);
      if (!current) throw new GenerationError('The version this change started from is gone. Try the change again.');
    }
    // the store's items on sale, so every change keeps them working (and a new one can be built in)
    const items = game ? (await listItems(game.id)).filter((i) => i.available).map(({ id, name, description }) => ({ id, name, description })) : [];
    const result = await generateGame({
      request: prompt,
      current,
      originalPrompt: game?.prompt,
      items,
      partial: job?.partial || '',
      ...(job ? { effort: 'low' } : {}),
      onProgress,
      signal: abort.signal,
    });
    // an edit keeps the game's name: the creator may have renamed it
    const saved = game
      ? await addVersion(game, { request: prompt, ...result, title: game.title })
      : await createGame({ owner: wallet, prompt, ...result });
    if (job) await deleteJob(job.id).catch(() => {});
    console.log(JSON.stringify({ evt: 'creation-done', job: job?.id || null, leg: (job?.legs || 0) + 1, chars: result.html.length, ms: Date.now() - started }));
    send({ type: 'done', game: gameView(saved, { full: true }) });
  } catch (err) {
    if (err instanceof GenerationCutOff) {
      const legs = (job?.legs || 0) + 1;
      const before = job?.partial.length || 0;
      const stalls = err.text.length - before < STALL_CHARS ? (job?.stalls || 0) + 1 : 0;
      console.log(JSON.stringify({ evt: 'creation-leg', job: job?.id || null, leg: legs, before, after: err.text.length, ms: Date.now() - started, stalls }));
      if (stalls >= 2 || legs >= MAX_LEGS || err.text.length > HTML_MAX) {
        if (job) await deleteJob(job.id).catch(() => {});
        const why = err.text.length > HTML_MAX || legs >= MAX_LEGS ? 'The game got too big to finish.' : 'Claude got stuck writing this one.';
        send({ type: 'error', error: `${why} Try describing it a little differently, or start smaller and add to it with changes.` });
      } else {
        try {
          const saved = await saveJob({
            id: job?.id || crypto.randomUUID(),
            wallet,
            game_id: game?.id || null,
            base_version: game ? baseVersion : null,
            request: prompt,
            partial: err.text,
            legs,
            stalls,
            created_at: job?.created_at || new Date().toISOString(),
          });
          send({ type: 'continue', jobId: saved.id, chars: err.text.length, legs });
        } catch (saveErr) {
          console.error('creation job save failed:', saveErr);
          send({ type: 'error', error: 'Something went wrong writing the game. Try again.' });
        }
      }
    } else if (err instanceof GenerationError) send({ type: 'error', error: err.message });
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
