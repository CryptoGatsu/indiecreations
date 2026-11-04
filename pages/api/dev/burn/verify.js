import { requireAccount, sendError } from '../../../../lib/platform/auth';
import { verifyBurn } from '../../../../lib/platform/burns';

// POST { quoteId, tx } -> checks the burn on chain and records it (safe to repeat). The burn is then spent by the
// application or the new game it was for.
export default async function handler(req, res) {
  res.setHeader('Cache-Control', 'no-store');
  if (req.method !== 'POST') return res.status(405).end();
  const account = await requireAccount(req, res);
  if (!account) return;
  try {
    return res.status(200).json({ burn: await verifyBurn(account, { quoteId: req.body?.quoteId, tx: req.body?.tx }) });
  } catch (err) {
    return sendError(res, err, 'burn verify');
  }
}
