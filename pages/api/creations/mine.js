import { creatorStatus, gameView, holderWallet } from '../../../lib/creators';
import { aiConfigured } from '../../../lib/creationAI';
import { JOB_TTL_MS, pendingJob, presenceStats, statsFor } from '../../../lib/creationStore';

// GET -> the signed-in holder's games, how many their holdings allow, today's allowance, and a game still being written
// (pending: the studio picks it up again, e.g. after the phone locked or the page was reloaded mid-run).
export default async function handler(req, res) {
  if (req.method !== 'GET') return res.status(405).end();
  res.setHeader('Cache-Control', 'no-store');
  const wallet = await holderWallet(req);
  if (!wallet) return res.status(401).json({ error: 'Verify your wallet first.' });
  try {
    const [s, stats, job] = await Promise.all([
      creatorStatus(wallet),
      presenceStats().catch(() => ({})),
      pendingJob(wallet, JOB_TTL_MS).catch(() => null),
    ]);
    return res.status(200).json({
      address: wallet,
      balance: Number.isFinite(s.balance) ? s.balance : null, // null: a studio wallet
      unlimited: s.unlimited, // the dev wallet: slots and perDay are null (no limit)
      slots: s.unlimited ? null : s.slots,
      next: s.next,
      usedToday: s.usedToday,
      perDay: s.unlimited ? null : s.perDay,
      available: aiConfigured(),
      games: s.games.map((g) => gameView(g, { full: true, stats: statsFor(stats, g.id) })),
      pending: job && { jobId: job.id, gameId: job.game_id, request: job.request, startedAt: job.created_at },
    });
  } catch (err) {
    console.error('creations mine failed:', err);
    return res.status(500).json({ error: 'Could not check your holdings. Try again shortly.' });
  }
}
