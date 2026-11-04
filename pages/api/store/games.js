import { readAccount, sendError } from '../../../lib/platform/auth';
import { liveGames, ownsGame, liveGame } from '../../../lib/platform/storeGames';
import { persistent } from '../../../lib/supabase';

// GET -> every game live on the store (adult games only for accounts that opted in).
// GET ?slug=... -> that game, and whether the signed-in account has it in its library.
export default async function handler(req, res) {
  if (req.method !== 'GET') return res.status(405).end();
  if (!persistent) return res.status(200).json({ games: [] });
  try {
    const account = await readAccount(req).catch(() => null);
    if (typeof req.query.slug === 'string') {
      res.setHeader('Cache-Control', 'no-store');
      const game = await liveGame(req.query.slug);
      if (!game) return res.status(404).json({ error: 'Not on the store.' });
      const owned = account ? await ownsGame(account, game.id) : false;
      // adult store pages only for accounts that opted in
      const { id, devId, ...visible } = game;
      const show = !game.adult || account?.adultOptIn;
      return res
        .status(200)
        .json({ owned, signedIn: Boolean(account), developer: account?.id === devId, game: show ? visible : null });
    }
    res.setHeader('Cache-Control', 'no-store');
    return res.status(200).json({ games: await liveGames({ adult: Boolean(account?.adultOptIn) }) });
  } catch (err) {
    return sendError(res, err, 'store games');
  }
}
