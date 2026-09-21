import { STEAM_COOKIE, readSteamToken, steamCookieHeader } from '../../../lib/session';

// GET -> the Steam account signed in on this browser, DELETE -> sign out of Steam here.
export default async function handler(req, res) {
  if (req.method === 'DELETE') {
    res.setHeader('Set-Cookie', steamCookieHeader('', 0));
    return res.status(200).json({ steam: null });
  }

  if (req.method !== 'GET') return res.status(405).end();

  const steam = await readSteamToken(req.cookies[STEAM_COOKIE]);
  res.setHeader('Cache-Control', 'no-store');
  return res
    .status(200)
    .json({ steam: steam ? { steamId: steam.steamId, name: steam.name, avatar: steam.avatar } : null });
}
