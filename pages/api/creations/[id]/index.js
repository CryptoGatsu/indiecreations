import { isGameId, TITLE_MAX } from '../../../../lib/creations';
import { deleteGame, getGame, listReports, listVersions, updateGame } from '../../../../lib/creationStore';
import { canManage, gameView, isPublic } from '../../../../lib/creators';

// GET    -> { game } (+ versions and reports for its owner / the studio). Drafts and taken-down games are only
//           visible to them.
// PATCH  { title?, published?, version?, showPrompts? } (owner) / { hidden? } (studio) -> { game }
// DELETE -> removes the game and every version of it (owner or studio)
export default async function handler(req, res) {
  res.setHeader('Cache-Control', 'no-store');
  const { id } = req.query;
  try {
    if (!isGameId(id)) return res.status(404).json({ error: 'Game not found.' });
    const game = await getGame(id);
    if (!game) return res.status(404).json({ error: 'Game not found.' });
    const { owner, admin } = await canManage(req, game);
    const manager = owner || admin;

    if (req.method === 'GET') {
      if (!isPublic(game) && !manager) return res.status(404).json({ error: 'Game not found.' });
      if (!manager) return res.status(200).json({ game: gameView(game), owner: false });
      const [versions, reports] = await Promise.all([listVersions(id), admin ? listReports(id) : []]);
      return res.status(200).json({ game: gameView(game, { full: true }), versions, reports, owner, admin });
    }

    if (req.method === 'PATCH') {
      if (!manager) return res.status(403).json({ error: 'Only the creator can change this game.' });
      const body = req.body || {};
      const patch = {};
      if (owner) {
        if (typeof body.title === 'string') {
          const title = body.title.replace(/\s+/g, ' ').trim().slice(0, TITLE_MAX);
          if (!title) return res.status(400).json({ error: 'Give the game a name.' });
          patch.title = title;
        }
        if (typeof body.published === 'boolean') patch.published = body.published;
        if (typeof body.showPrompts === 'boolean') patch.show_prompts = body.showPrompts;
        if (body.version !== undefined) {
          const v = Number(body.version);
          const kept = await listVersions(id);
          if (!kept.some((k) => k.version === v)) return res.status(400).json({ error: 'That version is gone.' });
          patch.version = v;
        }
      }
      if (admin && typeof body.hidden === 'boolean') patch.hidden = body.hidden;
      if (!Object.keys(patch).length) return res.status(400).json({ error: 'Nothing to change.' });
      if (patch.published && game.hidden && !admin) {
        return res.status(403).json({ error: 'The studio took this game down. It cannot be published again.' });
      }
      const updated = await updateGame(id, patch);
      return res.status(200).json({ game: gameView(updated, { full: true }) });
    }

    if (req.method === 'DELETE') {
      if (!manager) return res.status(403).json({ error: 'Only the creator can delete this game.' });
      await deleteGame(id);
      return res.status(200).json({ ok: true });
    }

    return res.status(405).end();
  } catch (err) {
    console.error('creation request failed:', err);
    return res.status(500).json({ error: 'Something went wrong. Try again.' });
  }
}
