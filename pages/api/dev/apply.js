import { requireAccount, sendError } from '../../../lib/platform/auth';
import { submitApplication } from '../../../lib/platform/devs';

// POST { form: { studioName, links[], contactEmail, pastWork, payoutWalletEvm, payoutWalletSol }, burn?: { quoteId, tx } }
// -> sends a developer application to the studio's review queue.
export default async function handler(req, res) {
  res.setHeader('Cache-Control', 'no-store');
  if (req.method !== 'POST') return res.status(405).end();
  const account = await requireAccount(req, res);
  if (!account) return;
  try {
    return res.status(200).json({ application: await submitApplication(account, req.body?.form, req.body?.burn) });
  } catch (err) {
    return sendError(res, err, 'developer application');
  }
}
