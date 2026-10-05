import { formatUnits } from 'viem';
import { holderWallet } from '../../../lib/creators';
import { creatorPayoutStatus } from '../../../lib/revshareJob';
import { getDecimals } from '../../../lib/holder';
import { CREATOR_PERCENT } from '../../../lib/creations';

// GET -> the signed-in creator's store earnings: { percent, earned, waiting, payoutsOn }. Their cut of every sale is
// added to their claim on /rewards with each monthly payout; `waiting` is what the next payout will add.
export default async function handler(req, res) {
  if (req.method !== 'GET') return res.status(405).end();
  res.setHeader('Cache-Control', 'no-store');
  const wallet = await holderWallet(req);
  if (!wallet) return res.status(401).json({ error: 'Verify your wallet first.' });
  try {
    const [s, decimals] = await Promise.all([creatorPayoutStatus(wallet), getDecimals().catch(() => 18)]);
    const view = (t) => ({ orders: t.orders, usdCents: t.usdCents, amount: formatUnits(t.raw, decimals) });
    return res.status(200).json({ percent: CREATOR_PERCENT, earned: view(s.earned), waiting: view(s.waiting), payoutsOn: s.payoutsOn });
  } catch (err) {
    console.error('creator earnings failed:', err);
    return res.status(200).json({ percent: CREATOR_PERCENT, unavailable: true });
  }
}
