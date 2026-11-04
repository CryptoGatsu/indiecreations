import { requireAdmin } from '../../../lib/admin';
import { sendError } from '../../../lib/platform/auth';
import { decideApplication, listApplications } from '../../../lib/platform/devs';
import { decideBuild, reviewQueue } from '../../../lib/platform/storeGames';
import { burnLog } from '../../../lib/platform/burns';
import { recentAdminLog } from '../../../lib/platform/adminLog';
import { publicNetwork } from '../../../lib/platform/network';
import { persistent } from '../../../lib/supabase';

// GET -> the store's review queues: developer applications, builds, the adult lane, plus the burn and admin logs.
// POST { kind: 'application' | 'build', id, approve, codes[], note } -> one decision (logged).
export default async function handler(req, res) {
  res.setHeader('Cache-Control', 'no-store');
  const admin = await requireAdmin(req, res);
  if (!admin) return;
  if (!persistent) return res.status(503).json({ error: 'The store database is not switched on.' });
  try {
    if (req.method === 'GET') {
      const [applications, builds, adultBuilds, burns, log] = await Promise.all([
        listApplications('submitted'),
        reviewQueue({ adult: false }),
        reviewQueue({ adult: true }),
        burnLog(50),
        recentAdminLog(30),
      ]);
      return res.status(200).json({ applications, builds, adultBuilds, burns, log, network: publicNetwork() });
    }
    if (req.method === 'POST') {
      const { kind, id, approve, codes, note } = req.body || {};
      if (kind === 'application') return res.status(200).json({ application: await decideApplication(admin, id, { approve: Boolean(approve), codes, note }) });
      if (kind === 'build') {
        const build = await decideBuild(admin, id, { approve: Boolean(approve), codes, note });
        // an approved version reaches the store, home and game pages now, not at their next minute's refresh
        if (approve && build.slug) {
          await Promise.allSettled([res.revalidate('/games'), res.revalidate('/'), res.revalidate(`/games/${build.slug}`)]);
        }
        return res.status(200).json({ build });
      }
      return res.status(400).json({ error: 'Unknown decision.' });
    }
    return res.status(405).end();
  } catch (err) {
    return sendError(res, err, 'store review');
  }
}
