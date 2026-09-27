import { indexTransfers } from '../../../lib/chainIndex';
import { settle, treasuryReadiness } from '../../../lib/revshareJob';
import { persistent } from '../../../lib/revshareStore';

// The holder revenue share's daily job (vercel.json schedules it): copy new $creations transfers from the chain, then
// close and publish the next finished month if there is one. Safe to run any number of times.
//
// Vercel Cron calls it with `Authorization: Bearer <CRON_SECRET>`. The same header works by hand, e.g. to catch the
// transfer copy up faster on the first run. Add ?dry=1 to see the next month's split without saving or publishing.
export const config = { maxDuration: 300 };

const json = (res, status, body) =>
  res.status(status).setHeader('Content-Type', 'application/json').send(
    JSON.stringify(body, (_, v) => (typeof v === 'bigint' ? v.toString() : v))
  );

export default async function handler(req, res) {
  const secret = process.env.CRON_SECRET;
  if (!secret || req.headers.authorization !== `Bearer ${secret}`) return json(res, 401, { error: 'Unauthorized' });
  if (!persistent) return json(res, 503, { error: 'Supabase is not configured.' });

  const started = Date.now();
  try {
    // Copying transfers gets at most two minutes. A month is only closed by a run that caught up early, so the
    // payout itself always has the rest of the time limit; otherwise it waits for the next run.
    const index = await indexTransfers({ deadline: started + 120_000 });
    const result =
      index.caughtUp && Date.now() - started < 60_000
        ? await settle({ dryRun: Boolean(req.query.dry) })
        : { waiting: 'still copying transfers; the payout step runs once the copy is caught up' };
    const treasury = await treasuryReadiness().catch(() => null);
    return json(res, 200, { index, settle: result, treasury, ms: Date.now() - started });
  } catch (err) {
    console.error('revshare cron failed:', err);
    return json(res, 500, { error: err.shortMessage || err.message });
  }
}
