import { readAccount, sendError } from '../../../lib/platform/auth';
import { playable } from '../../../lib/platform/storeGames';
import { persistent } from '../../../lib/supabase';

// GET ?slug=... -> { game: { name, studio, entryUrl } } when this visitor may play it (free games: anyone; signed-in
// players get it added to their library), or an error saying why not (paid and not owned, adult, abandoned).
export default async function handler(req, res) {
  res.setHeader('Cache-Control', 'no-store');
  if (req.method !== 'GET') return res.status(405).end();
  if (!persistent) return res.status(404).json({ error: 'The store is not switched on yet.' });
  try {
    const account = await readAccount(req).catch(() => null);
    const out = await playable(account, String(req.query.slug || ''));
    if (out.error) return res.status(out.status).json({ error: out.error });
    return res.status(200).json(out);
  } catch (err) {
    return sendError(res, err, 'play');
  }
}
