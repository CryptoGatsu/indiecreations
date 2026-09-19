import { SESSION_COOKIE, readSessionToken, createHandoffToken, HANDOFF_TTL_SECONDS } from '../../../lib/session';

// POST (with a holder session) -> { url, expiresIn }: a personal link that signs the SAME wallet in on another browser.
// Wallet in-app browsers (MetaMask, Trust...) can't rotate or go full screen, so holders verify there and play in
// Safari / Chrome. The link is only good for a few minutes and the wallet is re-checked when it is opened.
export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).end();
  res.setHeader('Cache-Control', 'no-store');

  const session = await readSessionToken(req.cookies[SESSION_COOKIE]);
  if (!session) return res.status(401).json({ error: 'No holder session.' });

  const token = await createHandoffToken(session.address);
  const proto = req.headers['x-forwarded-proto'] || 'https';
  const origin = `${proto}://${req.headers.host}`;
  return res.status(200).json({
    url: `${origin}/api/auth/redeem?t=${encodeURIComponent(token)}`,
    expiresIn: HANDOFF_TTL_SECONDS,
  });
}
