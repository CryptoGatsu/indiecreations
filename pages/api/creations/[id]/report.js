import { isGameId } from '../../../../lib/creations';
import { getGame, reportGame } from '../../../../lib/creationStore';
import { reporterId } from '../../../../lib/creators';

// POST { reason } -> flags a game for the studio to look at. One report per person per game.
export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).end();
  const { id } = req.query;
  const reason = typeof req.body?.reason === 'string' ? req.body.reason.trim().slice(0, 500) : '';
  try {
    if (!isGameId(id) || !(await getGame(id))) return res.status(404).json({ error: 'Game not found.' });
    await reportGame(id, await reporterId(req), reason);
    return res.status(200).json({ ok: true });
  } catch (err) {
    console.error('creation report failed:', err);
    return res.status(500).json({ error: 'Could not send the report. Try again.' });
  }
}
