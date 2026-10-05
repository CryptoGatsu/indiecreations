import { isGameId } from '../../../../../lib/creations';
import { getGame } from '../../../../../lib/creationStore';
import { cleanItem, deleteItem, getItem, itemView, salesOf, updateItem } from '../../../../../lib/creatorStore';
import { canManage } from '../../../../../lib/creators';

// PATCH { name?, description?, usd?, available? } -> { item }   (the game's creator)
// DELETE -> removes an item nobody has bought yet; one with buyers can only be taken off sale (available: false),
//           because its buyers keep it.
export default async function handler(req, res) {
  res.setHeader('Cache-Control', 'no-store');
  const { id, itemId } = req.query;
  try {
    if (!isGameId(id)) return res.status(404).json({ error: 'Game not found.' });
    const [game, item] = await Promise.all([getGame(id), getItem(itemId)]);
    if (!game || !item || item.game_id !== id) return res.status(404).json({ error: 'Item not found.' });
    const { owner } = await canManage(req, game);
    if (!owner) return res.status(403).json({ error: 'Only the creator can change the store.' });
    if (game.hidden) return res.status(403).json({ error: 'The studio took this game down.' });

    if (req.method === 'PATCH') {
      const { value, error } = cleanItem(req.body || {}, true);
      if (error) return res.status(400).json({ error });
      if (!Object.keys(value).length) return res.status(400).json({ error: 'Nothing to change.' });
      return res.status(200).json({ item: itemView(await updateItem(itemId, value)) });
    }

    if (req.method === 'DELETE') {
      if ((await salesOf(id)).byItem[itemId]?.sold) {
        return res.status(409).json({ error: 'Players have bought this item, so it stays theirs. Take it off sale instead.' });
      }
      await deleteItem(itemId);
      return res.status(200).json({ ok: true });
    }

    return res.status(405).end();
  } catch (err) {
    console.error('creation item failed:', err);
    return res.status(500).json({ error: 'Something went wrong. Try again.' });
  }
}
