import { adminCookieHeader } from '../../../lib/session';

// POST -> clears the admin cookie.
export default function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).end();
  res.setHeader('Set-Cookie', adminCookieHeader('', 0));
  return res.status(200).json({ ok: true });
}
