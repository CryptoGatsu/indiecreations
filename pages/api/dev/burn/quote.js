import { requireAccount, sendError } from '../../../../lib/platform/auth';
import { createBurnQuote } from '../../../../lib/platform/burns';

// POST { purpose: 'dev_apply' | 'new_game', wallet } -> the exact $CREATIONS amount to burn from that wallet, held
// for 10 minutes. A new game needs a developer account.
export default async function handler(req, res) {
  res.setHeader('Cache-Control', 'no-store');
  if (req.method !== 'POST') return res.status(405).end();
  const purpose = req.body?.purpose;
  const account = await requireAccount(req, res, { role: purpose === 'new_game' ? 'developer' : undefined });
  if (!account) return;
  try {
    return res.status(200).json({ quote: await createBurnQuote(account, { purpose, wallet: req.body?.wallet }) });
  } catch (err) {
    return sendError(res, err, 'burn quote');
  }
}
