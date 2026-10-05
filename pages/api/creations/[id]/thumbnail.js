import { isGameId } from '../../../../lib/creations';
import { getGame, getThumb, saveThumb } from '../../../../lib/creationStore';
import { canManage, isPublic } from '../../../../lib/creators';

// GET  -> the game's cover screenshot (JPEG). Public games for everyone, drafts for their creator and the studio.
// POST { version, image, manual } (the game's creator) -> saves a new cover. `image` is a JPEG data URL the studio took
//      from the game's canvas (components/GameSandbox.js). Only JPEGs of a sensible size are kept.
export const config = { api: { bodyParser: { sizeLimit: '512kb' } } };

const MAX_BYTES = 250_000;

export default async function handler(req, res) {
  const { id } = req.query;
  try {
    if (!isGameId(id)) return res.status(404).end();
    const game = await getGame(id);
    if (!game) return res.status(404).end();

    if (req.method === 'GET') {
      if (!isPublic(game)) {
        const { owner, admin } = await canManage(req, game);
        if (!owner && !admin) return res.status(404).end();
      }
      const thumb = await getThumb(id);
      if (!thumb) return res.status(404).end();
      res.setHeader('Content-Type', 'image/jpeg');
      res.setHeader('X-Content-Type-Options', 'nosniff');
      // the URL carries ?t=<when it was taken>, so a cached copy is never stale
      res.setHeader('Cache-Control', isPublic(game) ? 'public, max-age=86400, s-maxage=86400' : 'private, max-age=60');
      return res.status(200).send(Buffer.from(thumb.image, 'base64'));
    }

    if (req.method === 'POST') {
      res.setHeader('Cache-Control', 'no-store');
      const { owner } = await canManage(req, game);
      if (!owner) return res.status(403).json({ error: 'Only the creator can set the cover.' });
      const { version, image, manual } = req.body || {};
      const m = typeof image === 'string' && image.match(/^data:image\/jpeg;base64,([A-Za-z0-9+/]+=*)$/);
      if (!m) return res.status(400).json({ error: 'Not a JPEG image.' });
      const bytes = Buffer.from(m[1], 'base64');
      if (bytes.length < 2000 || bytes.length > MAX_BYTES || bytes[0] !== 0xff || bytes[1] !== 0xd8 || bytes[2] !== 0xff) {
        return res.status(400).json({ error: 'Not a usable JPEG image.' });
      }
      const v = Number(version);
      if (!Number.isInteger(v) || v < 1 || v > game.versions) return res.status(400).json({ error: 'Invalid version.' });
      // an automatic cover never replaces one the creator picked by hand
      if (!manual && game.thumb_manual) return res.status(200).json({ kept: true });
      const at = await saveThumb(id, { version: v, image: m[1], manual: Boolean(manual) });
      return res.status(200).json({ thumb: `/api/creations/${id}/thumbnail?t=${Date.parse(at)}`, thumbVersion: v, thumbManual: Boolean(manual) });
    }

    return res.status(405).end();
  } catch (err) {
    console.error('creation thumbnail failed:', err);
    return res.status(500).end();
  }
}
