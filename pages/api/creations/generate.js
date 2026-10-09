import { isGameId, PROMPT_MAX, MIN_CREATOR_TOKENS } from '../../../lib/creations';
import crypto from 'crypto';
import { addVersion, claimJob, createGame, getGame, getHtml, getJob, JOB_TTL_MS, logGeneration, persistent, saveJob } from '../../../lib/creationStore';
import { aiConfigured, generateGame, GenerationCutOff, GenerationError, HTML_MAX } from '../../../lib/creationAI';
import { listItems } from '../../../lib/creatorStore';
import { creatorStatus, gameView, holderWallet, SITE_PER_DAY, siteUsedToday } from '../../../lib/creators';

// POST { prompt, id? } -> makes a new game from a prompt, or (with id) a new version of one of the holder's games.
// POST { jobId }       -> picks a run up again: carries on one that was cut off, or replays how it finished.
// Writing a game takes a few minutes, so the answer streams as newline-delimited JSON:
//   { type: 'job', jobId }         first: the run's id, so a page that loses the connection can pick it up again
//   { type: 'progress', chars }    the code written so far (a few times a second)
//   { type: 'continue', jobId }    this function run is out of time; what was written is saved, POST { jobId } to go on
//   { type: 'done', game }         saved; game.version is the new version
//   { type: 'error', error }       nothing saved; the message is meant for the creator
// A big game can take longer than one function may run, so it is written over as many runs as it needs: each one
// stops a little before the platform's limit, saves the text so far, and the next continues from exactly there, at the
// same effort (the PLAN comment at the top of the game keeps the passes consistent). A game is only
// given up on when two runs in a row add almost nothing, it passes HTML_MAX, or MAX_LEGS runs (a safety net).
// Every run is a row in creations_jobs from the start. A server run carries on when the browser goes away (a phone
// locks, a tab is closed), so the row holds a lease while one works on it (409 to anyone else) and keeps the outcome,
// and the studio picks unfinished runs up again when it next loads (pages/api/creations/mine.js lists them).
// Checks before any tokens are spent: a verified holder session, enough $CREATIONS for the games they'd have
// (lib/creations.js tiers), their daily allowance, and the site's. A continuation counts as the same generation.
export const config = { maxDuration: 300 };

// keep in step with maxDuration: stop, save and say so before the platform cuts off (shorter in development, to try it)
const LEG_MS = (process.env.NODE_ENV !== 'production' && Number(process.env.CREATIONS_LEG_MS)) || (300 - 20) * 1000;
const MAX_LEGS = 12;
const STALL_CHARS = Math.round(LEG_MS / 560); // a run that adds less than this (500 characters in 280 s) made no real progress
const LEASE_MS = LEG_MS + 30_000; // a run's hold on its job; lapses on its own if the function dies

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
  if (!status.unlimited && (await siteUsedToday()) >= SITE_PER_DAY) {
    throw new Refusal(429, 'The studio has made all the games it can for today. Try again tomorrow.');
  }
}

// A run that already finished: tell the page how, in the same stream format.
async function replay(res, result) {
  const game = result.gameId ? await getGame(result.gameId) : null;
  res.writeHead(200, { 'Content-Type': 'application/x-ndjson; charset=utf-8' });
  if (game) res.end(`${JSON.stringify({ type: 'done', game: gameView(game, { full: true }) })}\n`);
  else res.end(`${JSON.stringify({ type: 'error', error: result.error || 'That game is gone.' })}\n`);
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
  let job = null; // the run being picked up again
  let game = null;
  let prompt;
  let baseVersion = null;
  try {
    if (body.jobId !== undefined) {
      job = await getJob(body.jobId);
      if (!job || job.wallet !== wallet) return res.status(404).json({ error: 'That run has expired. Start it again.' });
      if (job.result) return replay(res, job.result);
      if (Date.now() - Date.parse(job.updated_at) > JOB_TTL_MS) {
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
  } catch (err) {
    if (err instanceof Refusal) return res.status(err.status).json({ error: err.message });
    console.error('creation checks failed:', err);
    return res.status(500).json({ error: 'Could not check your holdings. Try again shortly.' });
  }

  const until = () => new Date(Date.now() + LEASE_MS).toISOString();
  let row;
  try {
    if (job) {
      if (!(await claimJob(job.id, until()))) {
        return res.status(409).json({ error: 'This game is still being written.', running: true });
      }
      row = job;
    } else {
      await logGeneration(wallet, game?.id || null, game ? 'edit' : 'create');
      row = await saveJob({
        id: crypto.randomUUID(),
        wallet,
        game_id: game?.id || null,
        base_version: game ? baseVersion : null,
        request: prompt,
        partial: '',
        legs: 0,
        stalls: 0,
        running_until: until(),
        result: null,
        created_at: new Date().toISOString(),
      });
    }
  } catch (err) {
    console.error('creation job start failed:', err);
    return res.status(500).json({ error: 'Could not start. Try again shortly.' });
  }
  // how the run ended, kept for a page that lost the connection; the text is no longer needed
  const finish = (result) => saveJob({ ...row, partial: '', running_until: null, result }).catch((e) => console.error('creation job finish failed:', e));

  res.writeHead(200, { 'Content-Type': 'application/x-ndjson; charset=utf-8', 'X-Accel-Buffering': 'no' });
  const send = (obj) => res.write(`${JSON.stringify(obj)}\n`);
  send({ type: 'job', jobId: row.id });
  send({ type: 'progress', chars: row.partial.length });

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
      partial: row.partial,
      onProgress,
      signal: abort.signal,
    });
    // an edit keeps the game's name: the creator may have renamed it
    const saved = game
      ? await addVersion(game, { request: prompt, ...result, title: game.title })
      : await createGame({ owner: wallet, prompt, ...result });
    await finish({ gameId: saved.id, version: saved.version });
    console.log(JSON.stringify({ evt: 'creation-done', job: row.id, leg: row.legs + 1, chars: result.html.length, ms: Date.now() - started }));
    send({ type: 'done', game: gameView(saved, { full: true }) });
  } catch (err) {
    if (err instanceof GenerationCutOff) {
      const legs = row.legs + 1;
      const before = row.partial.length;
      const stalls = err.text.length - before < STALL_CHARS ? row.stalls + 1 : 0;
      console.log(JSON.stringify({ evt: 'creation-leg', job: row.id, leg: legs, before, after: err.text.length, ms: Date.now() - started, stalls }));
      if (stalls >= 2 || legs >= MAX_LEGS || err.text.length > HTML_MAX) {
        const why = err.text.length > HTML_MAX || legs >= MAX_LEGS ? 'The game got too big to finish.' : 'Claude got stuck writing this one.';
        const error = `${why} Try describing it a little differently, or start smaller and add to it with changes.`;
        await finish({ error });
        send({ type: 'error', error });
      } else {
        try {
          await saveJob({ ...row, partial: err.text, legs, stalls, running_until: null });
          send({ type: 'continue', jobId: row.id, chars: err.text.length, legs });
        } catch (saveErr) {
          console.error('creation job save failed:', saveErr);
          send({ type: 'error', error: 'Something went wrong writing the game. Try again.' });
        }
      }
    } else {
      const error = err instanceof GenerationError ? err.message : 'Something went wrong writing the game. Try again.';
      if (!(err instanceof GenerationError)) console.error('creation generate failed:', err);
      await finish({ error });
      send({ type: 'error', error });
    }
  } finally {
    clearTimeout(timer);
    clearInterval(heartbeat);
    res.end();
  }
}
