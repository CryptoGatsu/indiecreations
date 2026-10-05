import { isGameId } from '../../../../lib/creations';
import { getGame, recordPresence } from '../../../../lib/creationStore';
import { isPublic, presenceIpHash } from '../../../../lib/creators';

// POST { visitor } -> "this browser is playing this game". Sent once a minute by the game's page while it is in
// front (pages/community/[id].js), with a random id the browser keeps. Feeds the stats under each game: playing now,
// players, time played. Only public games count, so a creator testing a draft doesn't add to them.
const lastPing = new Map(); // `${id}:${visitor}` -> ms, so a burst of pings from one tab costs one write
const publicGames = new Map(); // id -> { ok, at }: whether the game is public, rechecked every minute

async function isPlayable(id) {
  const hit = publicGames.get(id);
  if (hit && Date.now() - hit.at < 60_000) return hit.ok;
  const ok = isPublic(await getGame(id));
  if (publicGames.size > 5000) publicGames.clear();
  publicGames.set(id, { ok, at: Date.now() });
  return ok;
}

export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).end();
  const { id } = req.query;
  const visitor = req.body?.visitor;
  if (!isGameId(id) || !/^[a-z0-9]{16,40}$/.test(visitor || '')) return res.status(400).json({ error: 'Bad ping.' });
  try {
    const key = `${id}:${visitor}`;
    const now = Date.now();
    if (now - (lastPing.get(key) || 0) < 30_000) return res.status(204).end();
    lastPing.set(key, now);
    if (lastPing.size > 50_000) lastPing.clear();
    if (await isPlayable(id)) await recordPresence(id, visitor, presenceIpHash(req));
  } catch (err) {
    console.error('creation presence failed:', err);
  }
  return res.status(204).end(); // a lost ping never shows up as an error
}
