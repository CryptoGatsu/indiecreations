import { readPlayerHandoffToken, createPlayerToken, playerCookieHeader } from '../../../lib/session';

// GET ?t=<hand-off token>&to=<path> -> signs this browser in as the wallet that made the link, then opens the game.
export default async function handler(req, res) {
  if (req.method !== 'GET') return res.status(405).end();
  res.setHeader('Cache-Control', 'no-store');

  const to = typeof req.query.to === 'string' && /^\/[a-z0-9\-/]*$/i.test(req.query.to) ? req.query.to : '/';
  const data = await readPlayerHandoffToken(typeof req.query.t === 'string' ? req.query.t : '');
  if (!data) return res.redirect(302, `${to}${to.includes('?') ? '&' : '?'}signin=expired`);

  res.setHeader('Set-Cookie', playerCookieHeader(await createPlayerToken(data.address)));
  return res.redirect(302, to);
}
