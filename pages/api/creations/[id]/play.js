import { isGameId } from '../../../../lib/creations';
import { countPlay, getGame } from '../../../../lib/creationStore';
import { isPublic } from '../../../../lib/creators';

// POST -> counts a play of a public game (sent once per visit by its page).
export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).end();
  const { id } = req.query;
  try {
    if (!isGameId(id)) return res.status(204).end();
    const game = await getGame(id);
    if (isPublic(game)) await countPlay(id);
  } catch (err) {
    console.error('creation play failed:', err);
  }
  return res.status(204).end(); // a lost count never shows up as an error
}
