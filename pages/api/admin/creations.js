import { requireAdmin } from '../../../lib/admin';
import { listForAdmin } from '../../../lib/creationStore';
import { gameView } from '../../../lib/creators';

// GET -> community games for moderation: reported ones first, then the newest (admins only). Taking one down or
// putting it back is a PATCH { hidden } to /api/creations/<id>.
export default async function handler(req, res) {
  if (req.method !== 'GET') return res.status(405).end();
  res.setHeader('Cache-Control', 'no-store');
  if (!(await requireAdmin(req, res))) return;
  try {
    const games = await listForAdmin();
    return res.status(200).json({ games: games.map((g) => gameView(g, { full: true })) });
  } catch (err) {
    console.error('admin creations failed:', err);
    return res.status(500).json({ error: err.message });
  }
}
