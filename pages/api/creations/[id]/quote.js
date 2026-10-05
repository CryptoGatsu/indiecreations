import { isGameId, isItemId } from '../../../../lib/creations';
import { getItem } from '../../../../lib/creatorStore';
import { createQuote, ShopError } from '../../../../lib/shop';
import { readPlayerWallet } from '../../../../lib/session';

// POST { itemId } (signed in as a player) -> a 10 minute quote for an item in this game's store: exactly how much
// $CREATIONS to send to the treasury, from the signed-in wallet. The item goes to that wallet once the payment is seen
// on-chain (POST /api/shop/confirm { orderId, txHash }). The creator's cut is recorded on the order.
export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).end();
  res.setHeader('Cache-Control', 'no-store');

  const wallet = await readPlayerWallet(req.cookies);
  if (!wallet) return res.status(401).json({ error: 'Sign in with your wallet first.' });

  try {
    const { id } = req.query;
    const { itemId } = req.body || {};
    if (!isGameId(id) || !isItemId(itemId)) return res.status(400).json({ error: 'Invalid item.' });
    const item = await getItem(itemId);
    if (!item || item.game_id !== id) return res.status(404).json({ error: 'That item does not exist.' });
    return res.status(200).json(await createQuote({ ownerId: wallet, itemId, wallet }));
  } catch (err) {
    if (err instanceof ShopError) return res.status(err.status).json({ error: err.message });
    console.error('creation quote failed:', err);
    return res.status(500).json({ error: 'Could not create a quote. Try again shortly.' });
  }
}
