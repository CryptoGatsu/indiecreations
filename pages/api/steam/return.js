import { verifySteamAssertion, fetchSteamProfile } from '../../../lib/steam';
import { createSteamToken, steamCookieHeader } from '../../../lib/session';

// GET -> where Steam sends the player back. Confirms the login with Steam, then sets the Steam cookie.
export default async function handler(req, res) {
  if (req.method !== 'GET') return res.status(405).end();

  const secure = process.env.NODE_ENV === 'production' ? '; Secure' : '';
  const clearState = `ic_steam_state=; Path=/api/steam; HttpOnly; SameSite=Lax; Max-Age=0${secure}`;

  try {
    const state = req.cookies.ic_steam_state;
    if (!state || state !== req.query.state) throw new Error('state mismatch');

    const steamId = await verifySteamAssertion(req, req.query);
    if (!steamId) throw new Error('assertion rejected');

    const profile = await fetchSteamProfile(steamId);
    res.setHeader('Set-Cookie', [
      clearState,
      steamCookieHeader(await createSteamToken({ steamId, ...profile })),
    ]);
    res.redirect(302, '/shop');
  } catch (err) {
    console.error('steam sign-in failed:', err.message);
    // readable by the page (not HttpOnly) so the shop can say the sign-in failed without a query string in the URL
    res.setHeader('Set-Cookie', [clearState, `ic_steam_error=1; Path=/; SameSite=Lax; Max-Age=30${secure}`]);
    res.redirect(302, '/shop');
  }
}
