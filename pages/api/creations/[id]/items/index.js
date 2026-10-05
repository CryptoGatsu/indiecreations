import { formatUnits } from 'viem';
import { ITEMS_MAX, isGameId, orderGameName } from '../../../../../lib/creations';
import { getGame } from '../../../../../lib/creationStore';
import { cleanItem, createItem, itemView, listItems, salesOf } from '../../../../../lib/creatorStore';
import { canManage, isPublic } from '../../../../../lib/creators';
import { listOwned, shopStatus } from '../../../../../lib/shop';
import { getDecimals } from '../../../../../lib/holder';
import { readPlayerWallet } from '../../../../../lib/session';

// GET  -> the game's store: { open, items, owned, player } (+ sales for its creator and the studio)
// POST { name, description, usd } (the game's creator) -> { item }
//
// Items are paid through the site's checkout (POST /api/creations/<id>/quote, then /api/shop/confirm); the creator's
// cut of each sale is paid to them with the monthly payout (lib/revshareJob.js).
export default async function handler(req, res) {
  res.setHeader('Cache-Control', 'no-store');
  const { id } = req.query;
  try {
    if (!isGameId(id)) return res.status(404).json({ error: 'Game not found.' });
    const game = await getGame(id);
    if (!game) return res.status(404).json({ error: 'Game not found.' });
    const { owner, admin } = await canManage(req, game);
    const manager = owner || admin;

    if (req.method === 'GET') {
      if (!isPublic(game) && !manager) return res.status(404).json({ error: 'Game not found.' });
      const [items, sales, player] = await Promise.all([listItems(id), salesOf(id), readPlayerWallet(req.cookies)]);
      const owned = player ? await listOwned(player, orderGameName(id)) : [];
      const out = {
        open: isPublic(game) && shopStatus().open,
        items: items.filter((i) => manager || i.available || owned.includes(i.id)).map((i) => itemView(i, sales)),
        owned,
        player,
      };
      if (manager) {
        const decimals = await getDecimals().catch(() => 18);
        out.sales = {
          sold: sales.total.sold,
          usdCents: sales.total.usdCents,
          earned: formatUnits(sales.total.earnedRaw, decimals),
        };
      }
      return res.status(200).json(out);
    }

    if (req.method === 'POST') {
      if (!owner) return res.status(403).json({ error: 'Only the creator can add items.' });
      if (game.hidden) return res.status(403).json({ error: 'The studio took this game down.' });
      const items = await listItems(id);
      if (items.length >= ITEMS_MAX) return res.status(400).json({ error: `A store holds up to ${ITEMS_MAX} items.` });
      const { value, error } = cleanItem(req.body || {});
      if (error) return res.status(400).json({ error });
      const item = await createItem({ gameId: id, name: value.name, description: value.description, usdCents: value.usd_cents });
      return res.status(200).json({ item: itemView(item) });
    }

    return res.status(405).end();
  } catch (err) {
    console.error('creation items failed:', err);
    return res.status(500).json({ error: 'Something went wrong. Try again.' });
  }
}
