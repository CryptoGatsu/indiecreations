import { readAccount, requireAccount, sendError } from '../../../lib/platform/auth';
import { addFreeGame, libraryOf } from '../../../lib/platform/storeGames';

// GET -> the signed-in account's library. POST { slug } -> adds a free game to it.
export default async function handler(req, res) {
  res.setHeader('Cache-Control', 'no-store');
  try {
    if (req.method === 'GET') {
      const account = await readAccount(req);
      return res.status(200).json({ signedIn: Boolean(account), games: account ? await libraryOf(account) : [] });
    }
    if (req.method === 'POST') {
      const account = await requireAccount(req, res);
      if (!account) return;
      await addFreeGame(account, req.body?.slug);
      return res.status(200).json({ ok: true });
    }
    return res.status(405).end();
  } catch (err) {
    return sendError(res, err, 'library');
  }
}
