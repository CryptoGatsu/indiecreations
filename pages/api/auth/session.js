import { SESSION_COOKIE, readSessionToken, sessionCookieHeader } from '../../../lib/session';

// GET -> current session, DELETE -> sign out.
export default async function handler(req, res) {
  if (req.method === 'DELETE') {
    res.setHeader('Set-Cookie', sessionCookieHeader('', 0));
    return res.status(200).json({ address: null });
  }

  if (req.method !== 'GET') return res.status(405).end();

  const session = await readSessionToken(req.cookies[SESSION_COOKIE]);
  res.setHeader('Cache-Control', 'no-store');
  return res.status(200).json({ address: session ? session.address : null });
}
