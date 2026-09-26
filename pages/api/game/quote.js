import { createQuote, ShopError } from '../../../lib/shop';
import { readPlayerWallet } from '../../../lib/session';

// POST { itemId } (signed in to the browser games) -> a 10 minute quote: exactly how much $creations to send to the
// treasury, from the signed-in wallet. The cosmetic goes to that same wallet once the payment is seen on-chain
// (POST /api/shop/confirm { orderId, txHash }).
export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).end();
  res.setHeader('Cache-Control', 'no-store');

  const wallet = await readPlayerWallet(req.cookies);
  if (!wallet) return res.status(401).json({ error: 'Sign in with your wallet first.' });

  try {
    const { itemId } = req.body || {};
    return res.status(200).json(await createQuote({ ownerId: wallet, itemId, wallet }));
  } catch (err) {
    if (err instanceof ShopError) return res.status(err.status).json({ error: err.message });
    console.error('game quote failed:', err);
    return res.status(500).json({ error: 'Could not create a quote. Try again shortly.' });
  }
}
