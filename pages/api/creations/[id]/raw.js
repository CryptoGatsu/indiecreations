import { isGameId } from '../../../../lib/creations';
import { getGame, getHtml } from '../../../../lib/creationStore';
import { canManage, isPublic } from '../../../../lib/creators';
import { GAME_CSP, wrapGame } from '../../../../lib/creationAI';

// GET ?v=<version> -> the game itself, as a sandboxed HTML document. This is the ONLY way a community game is served:
// the Content-Security-Policy below gives it an opaque origin, so even opened directly in a tab it can't read the
// site's cookies, use a visitor's session or reach any server. Public games serve their current version to everyone;
// the owner and the studio can also load drafts and older versions (?v=).
export default async function handler(req, res) {
  if (req.method !== 'GET') return res.status(405).end();
  const { id } = req.query;
  const fail = (code, text) => {
    res.setHeader('Cache-Control', 'no-store');
    res.setHeader('Content-Security-Policy', GAME_CSP);
    return res.status(code).setHeader('Content-Type', 'text/plain; charset=utf-8').send(text);
  };

  try {
    if (!isGameId(id)) return fail(404, 'Game not found.');
    const game = await getGame(id);
    if (!game) return fail(404, 'Game not found.');

    const asked = Number(req.query.v);
    const wantsOther = Number.isInteger(asked) && asked > 0 && asked !== game.version;
    let privileged = false;
    if (!isPublic(game) || wantsOther) {
      const { owner, admin } = await canManage(req, game);
      privileged = owner || admin;
      if (!privileged) return fail(isPublic(game) ? 403 : 404, 'Game not found.');
    }

    const html = await getHtml(id, wantsOther ? asked : game.version);
    if (!html) return fail(404, 'That version is gone.');

    res.setHeader('Content-Type', 'text/html; charset=utf-8');
    res.setHeader('Content-Security-Policy', GAME_CSP);
    res.setHeader('X-Content-Type-Options', 'nosniff');
    res.setHeader('Referrer-Policy', 'no-referrer');
    res.setHeader('Cross-Origin-Opener-Policy', 'same-origin');
    res.setHeader(
      'Permissions-Policy',
      'camera=(), microphone=(), geolocation=(), payment=(), usb=(), serial=(), hid=(), display-capture=(), publickey-credentials-get=()'
    );
    // a takedown has to reach players within a minute, so public copies are only cached briefly
    res.setHeader('Cache-Control', privileged ? 'private, no-store' : 'public, max-age=0, s-maxage=60');
    return res.status(200).send(wrapGame(html));
  } catch (err) {
    console.error('creation raw failed:', err);
    return fail(500, 'Could not load the game.');
  }
}
