import { creatorStatus, gameView, holderWallet } from '../../../lib/creators';
import { aiConfigured } from '../../../lib/creationAI';
import { presenceStats, statsFor } from '../../../lib/creationStore';

// GET -> the signed-in holder's games, how many their holdings allow, and today's allowance.
export default async function handler(req, res) {
  if (req.method !== 'GET') return res.status(405).end();
  res.setHeader('Cache-Control', 'no-store');
  const wallet = await holderWallet(req);
  if (!wallet) return res.status(401).json({ error: 'Verify your wallet first.' });
  try {
    const [s, stats] = await Promise.all([creatorStatus(wallet), presenceStats().catch(() => ({}))]);
    return res.status(200).json({
      address: wallet,
      balance: Number.isFinite(s.balance) ? s.balance : null, // null: a studio wallet
      slots: s.slots,
      next: s.next,
      usedToday: s.usedToday,
      perDay: s.perDay,
      available: aiConfigured(),
      games: s.games.map((g) => gameView(g, { full: true, stats: statsFor(stats, g.id) })),
    });
  } catch (err) {
    console.error('creations mine failed:', err);
    return res.status(500).json({ error: 'Could not check your holdings. Try again shortly.' });
  }
}
