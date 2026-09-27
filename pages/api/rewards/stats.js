import { economyStats } from '../../../lib/revshareJob';
import { persistent } from '../../../lib/revshareStore';

// GET -> the public economy numbers: revenue from every game, burns, payouts to holders, and progress to the next one.
export default async function handler(req, res) {
  if (req.method !== 'GET') return res.status(405).end();
  if (!persistent) return res.status(200).json({ unavailable: true });
  try {
    const s = await economyStats();
    res.setHeader('Cache-Control', 's-maxage=300, stale-while-revalidate=3600');
    return res.status(200).send(
      JSON.stringify(s, (_, v) => (typeof v === 'bigint' ? v.toString() : v))
    );
  } catch (err) {
    console.error('economy stats failed:', err);
    return res.status(200).json({ unavailable: true });
  }
}
