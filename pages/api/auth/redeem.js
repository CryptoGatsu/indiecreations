import { readHandoffToken, createSessionToken, sessionCookieHeader } from '../../../lib/session';
import { checkHolder } from '../../../lib/holder';

// GET ?t=<hand-off token> -> signs this browser in as the wallet that made the link, then opens the game full screen.
export default async function handler(req, res) {
  if (req.method !== 'GET') return res.status(405).end();
  res.setHeader('Cache-Control', 'no-store');

  const data = await readHandoffToken(typeof req.query.t === 'string' ? req.query.t : '');
  if (!data) return res.redirect(302, '/playtest?link=expired');

  try {
    const { holder } = await checkHolder(data.address);
    if (!holder) return res.redirect(302, '/playtest?link=notholder');
  } catch (err) {
    // the wallet was verified minutes ago when the link was made; an RPC hiccup shouldn't strand the player
    console.error('redeem balance re-check failed (continuing):', err);
  }

  res.setHeader('Set-Cookie', sessionCookieHeader(await createSessionToken(data.address)));
  return res.redirect(302, '/play');
}
