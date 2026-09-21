import crypto from 'crypto';
import { steamLoginUrl } from '../../../lib/steam';

// GET -> sends the player to Steam's own sign-in page.
export default function handler(req, res) {
  if (req.method !== 'GET') return res.status(405).end();

  // Ties the return trip to this browser, so a Steam login started elsewhere can't be finished here
  // (which would quietly sign a buyer in as someone else's Steam account).
  const state = crypto.randomBytes(16).toString('hex');
  const secure = process.env.NODE_ENV === 'production' ? '; Secure' : '';
  res.setHeader(
    'Set-Cookie',
    `ic_steam_state=${state}; Path=/api/steam; HttpOnly; SameSite=Lax; Max-Age=600${secure}`
  );
  res.redirect(302, steamLoginUrl(req, state));
}
