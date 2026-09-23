import { SESSION_COOKIE, readSessionToken } from '../../../lib/session';
import { isAllowlisted } from '../../../lib/config';
import { DOWNLOAD_BUILD } from '../../../lib/build';
import { downloadStats, recentDownloads } from '../../../lib/downloadStore';

// GET -> the public download counter { total, holders, lastDay }.
// GET ?detail=1 -> the same plus the recent download log, for the studio's allowlisted wallets only.
export default async function handler(req, res) {
  if (req.method !== 'GET') return res.status(405).end();
  if (!DOWNLOAD_BUILD) return res.status(200).json({ total: 0, holders: 0, lastDay: 0 });

  try {
    if (req.query.detail) {
      const session = await readSessionToken(req.cookies[SESSION_COOKIE]);
      if (!session || !isAllowlisted(session.address)) return res.status(403).json({ error: 'Studio wallets only.' });
      res.setHeader('Cache-Control', 'no-store');
      const [stats, recent] = await Promise.all([downloadStats(DOWNLOAD_BUILD), recentDownloads(DOWNLOAD_BUILD)]);
      return res.status(200).json({ ...stats, recent });
    }
    res.setHeader('Cache-Control', 's-maxage=60, stale-while-revalidate=300');
    return res.status(200).json(await downloadStats(DOWNLOAD_BUILD));
  } catch (err) {
    console.error('download stats failed:', err);
    return res.status(200).json({ total: 0, holders: 0, lastDay: 0, unavailable: true });
  }
}
