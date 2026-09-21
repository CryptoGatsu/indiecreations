import { confirmOrder, ShopError } from '../../../lib/shop';

// POST { orderId, txHash } -> checks the payment on-chain and, once it is there, delivers the cosmetic.
//   200 { state: 'delivered' }     202 { state: 'pending' } (not mined yet - ask again)     4xx { error }
//
// No cookie needed: the order already records which Steam account it is for, and the proof is the transaction
// itself. That also means a buyer who lost their session can still finish a purchase they paid for.
export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).end();
  res.setHeader('Cache-Control', 'no-store');

  try {
    const { orderId, txHash } = req.body || {};
    const result = await confirmOrder({ orderId, txHash });
    return res.status(result.state === 'delivered' ? 200 : 202).json(result);
  } catch (err) {
    if (err instanceof ShopError) return res.status(err.status).json({ error: err.message });
    console.error('confirm failed:', err);
    return res.status(500).json({ error: 'Could not check the payment. It is safe to try again.' });
  }
}
