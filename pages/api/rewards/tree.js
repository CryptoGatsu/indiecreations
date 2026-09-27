import { epochTree, persistent } from '../../../lib/revshareStore';

// GET ?month=YYYY-MM -> the full Merkle tree of that payout (every wallet's running total), so anyone can rebuild the
// root with OpenZeppelin's StandardMerkleTree.load() and compare it with the one on the contract.
export default async function handler(req, res) {
  if (req.method !== 'GET') return res.status(405).end();
  const month = String(req.query.month || '');
  if (!/^\d{4}-(0[1-9]|1[0-2])$/.test(month)) return res.status(400).json({ error: 'Use ?month=YYYY-MM.' });
  if (!persistent) return res.status(404).json({ error: 'No payouts yet.' });
  const tree = await epochTree(month).catch(() => null);
  if (!tree) return res.status(404).json({ error: 'No payout for that month.' });
  res.setHeader('Cache-Control', 's-maxage=86400');
  return res.status(200).json(tree);
}
