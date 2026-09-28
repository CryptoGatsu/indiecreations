import { ADMIN_COOKIE, readAdminToken, readPlayerWallet } from '../../lib/session';
import { isAdmin } from '../../lib/admin';
import { ProfileError, addComment, deleteComment, favoriteCounts, listComments, persistent } from '../../lib/profiles';
import { GAME_SLUGS } from '../../lib/profileRules';

// GET ?game=<slug>&before=<iso> -> { comments, favorites, more }: newest 20, and how many players favourited the game.
// POST { game, body } -> posts a comment as the signed-in wallet.
// DELETE ?id=<uuid> -> deletes a comment: its author, or a studio admin.
export default async function handler(req, res) {
  res.setHeader('Cache-Control', 'no-store');
  if (!persistent) return res.status(req.method === 'GET' ? 200 : 503).json(req.method === 'GET' ? { comments: [], favorites: 0 } : { error: 'Comments are not switched on yet.' });
  try {
    if (req.method === 'GET') {
      const game = String(req.query.game || '');
      if (!GAME_SLUGS.includes(game)) return res.status(400).json({ error: 'Unknown game.' });
      const before = typeof req.query.before === 'string' && !Number.isNaN(Date.parse(req.query.before)) ? req.query.before : null;
      const [comments, favs, admin] = await Promise.all([
        listComments(game, before),
        favoriteCounts(),
        readAdminToken(req.cookies[ADMIN_COOKIE]),
      ]);
      const canModerate = Boolean(admin && isAdmin(admin.address)); // studio admins get a delete button on every comment
      return res.status(200).json({ comments, favorites: favs[game] || 0, more: comments.length === 20, canModerate });
    }

    const address = await readPlayerWallet(req.cookies);
    if (req.method === 'POST') {
      if (!address) return res.status(401).json({ error: 'Sign in with your wallet to comment.' });
      const { game, body } = req.body || {};
      return res.status(201).json({ comment: await addComment(address, String(game || ''), body) });
    }
    if (req.method === 'DELETE') {
      const admin = await readAdminToken(req.cookies[ADMIN_COOKIE]);
      const adminAddress = admin && isAdmin(admin.address) ? admin.address : null;
      if (!address && !adminAddress) return res.status(401).json({ error: 'Sign in first.' });
      await deleteComment(String(req.query.id || ''), adminAddress || address, { admin: Boolean(adminAddress) });
      return res.status(200).json({ ok: true });
    }
    return res.status(405).end();
  } catch (err) {
    if (err instanceof ProfileError) return res.status(err.status).json({ error: err.message });
    console.error('comments failed:', err);
    return res.status(500).json({ error: 'Something went wrong. Try again.' });
  }
}
