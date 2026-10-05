import { listPublic, presenceStats, statsFor } from '../../../lib/creationStore';
import { gameView } from '../../../lib/creators';

// GET ?sort=popular|new -> { games }: the community games anyone can play, with who is playing them.
export default async function handler(req, res) {
  if (req.method !== 'GET') return res.status(405).end();
  try {
    const sort = req.query.sort === 'new' ? 'new' : 'popular';
    const [games, stats] = await Promise.all([listPublic({ sort }), presenceStats().catch(() => ({}))]);
    res.setHeader('Cache-Control', 'public, max-age=0, s-maxage=15, stale-while-revalidate=30');
    return res.status(200).json({ games: games.map((g) => gameView(g, { stats: statsFor(stats, g.id) })) });
  } catch (err) {
    console.error('creations list failed:', err);
    return res.status(200).json({ games: [] });
  }
}
