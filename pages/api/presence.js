import { PLAYABLE, clientIp, playerCounts, recordPing } from '../../lib/presence';

// POST { game, id } -> "this browser is playing <game>" (sent by /presence.js once a minute while a game is open).
// GET -> { [game slug]: { now, day, month } }: players right now, in the last 24 hours and in the last 30 days.
export default async function handler(req, res) {
  try {
    if (req.method === 'POST') {
      const { game, id } = req.body || {};
      if (!PLAYABLE.has(game) || !/^[a-z0-9]{16,40}$/.test(id || '')) return res.status(400).json({ error: 'Bad ping.' });
      await recordPing({ game, id, ip: clientIp(req) });
      return res.status(204).end();
    }
    if (req.method === 'GET') {
      res.setHeader('Cache-Control', 's-maxage=30, stale-while-revalidate=60');
      return res.status(200).json(await playerCounts());
    }
    return res.status(405).end();
  } catch (err) {
    console.error('presence failed:', err);
    // a failed ping or count never shows up as an error in the game or on the page
    return req.method === 'POST' ? res.status(204).end() : res.status(200).json({});
  }
}
