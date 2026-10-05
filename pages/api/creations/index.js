import { listPublic } from '../../../lib/creationStore';
import { gameView } from '../../../lib/creators';

// GET ?sort=popular|new -> { games }: the community games anyone can play.
export default async function handler(req, res) {
  if (req.method !== 'GET') return res.status(405).end();
  try {
    const sort = req.query.sort === 'new' ? 'new' : 'popular';
    const games = await listPublic({ sort });
    res.setHeader('Cache-Control', 's-maxage=30, stale-while-revalidate=60');
    return res.status(200).json({ games: games.map((g) => gameView(g)) });
  } catch (err) {
    console.error('creations list failed:', err);
    return res.status(200).json({ games: [] });
  }
}
