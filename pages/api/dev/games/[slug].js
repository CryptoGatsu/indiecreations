import { requireAccount, sendError } from '../../../../lib/platform/auth';
import {
  devGame,
  finalizeBuild,
  saveListing,
  startUpdate,
  submitBuild,
  withdrawBuild,
} from '../../../../lib/platform/storeGames';

// GET -> the game, all its versions, and how uploads are stored.
// PUT { listing } -> saves the store page on the draft version.
// POST { action: 'update' | 'finalize' | 'submit' | 'withdraw' } -> starts an update, records the uploaded build,
// sends the draft for review, or pulls it back.
export default async function handler(req, res) {
  res.setHeader('Cache-Control', 'no-store');
  const account = await requireAccount(req, res, { role: 'developer' });
  if (!account) return;
  const { slug } = req.query;
  try {
    if (req.method === 'GET') return res.status(200).json(await devGame(account, slug));
    if (req.method === 'PUT') return res.status(200).json(await saveListing(account, slug, req.body?.listing));
    if (req.method === 'POST') {
      const action = req.body?.action;
      if (action === 'update') return res.status(200).json({ build: await startUpdate(account, slug) });
      if (action === 'finalize') return res.status(200).json({ build: await finalizeBuild(account, slug) });
      if (action === 'submit') return res.status(200).json({ build: await submitBuild(account, slug) });
      if (action === 'withdraw') return res.status(200).json({ build: await withdrawBuild(account, slug) });
      return res.status(400).json({ error: 'Unknown action.' });
    }
    return res.status(405).end();
  } catch (err) {
    return sendError(res, err, 'developer game');
  }
}
