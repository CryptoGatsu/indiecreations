import { requireAccount, sendError } from '../../../../lib/platform/auth';
import { createGame, devGames } from '../../../../lib/platform/storeGames';

// GET -> this developer's games. POST { slug, title, burn?: { quoteId, tx } } -> creates a game (takes the $50 burn).
export default async function handler(req, res) {
  res.setHeader('Cache-Control', 'no-store');
  const account = await requireAccount(req, res, { role: 'developer' });
  if (!account) return;
  try {
    if (req.method === 'GET') return res.status(200).json({ games: await devGames(account) });
    if (req.method === 'POST') {
      const { slug, title, burn } = req.body || {};
      return res.status(200).json({ game: await createGame(account, { slug, title }, burn) });
    }
    return res.status(405).end();
  } catch (err) {
    return sendError(res, err, 'developer games');
  }
}
