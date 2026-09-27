import { requireAdmin } from '../../../lib/admin';
import { runJob } from '../../../lib/revshareJob';
import { persistent } from '../../../lib/revshareStore';

// POST { dry } -> runs the daily revenue share job now (admins only). With dry: works out the next month and shows
// it without saving or publishing anything. Without: exactly what the daily cron does, so it is safe to repeat.
export const config = { maxDuration: 300 };

export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).end();
  res.setHeader('Cache-Control', 'no-store');
  const admin = await requireAdmin(req, res);
  if (!admin) return;
  if (!persistent) return res.status(503).json({ error: 'Supabase is not configured.' });
  try {
    const result = await runJob({ dryRun: Boolean(req.body?.dry) });
    console.log(`revshare job run by admin ${admin}${req.body?.dry ? ' (dry)' : ''}`);
    return res.status(200).send(JSON.stringify(result, (_, v) => (typeof v === 'bigint' ? v.toString() : v)));
  } catch (err) {
    console.error('admin job run failed:', err);
    return res.status(500).json({ error: err.shortMessage || err.message });
  }
}
