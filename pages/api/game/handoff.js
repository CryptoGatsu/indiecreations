import { readPlayerWallet, createPlayerHandoffToken, HANDOFF_TTL_SECONDS } from '../../../lib/session';

// POST { to? } (signed in) -> { url, expiresIn }: a short-lived link that signs the SAME wallet in on another browser.
// Phones: a wallet's in-app browser can't turn sideways, so players sign in (and pay) there, then carry the sign-in to
// Safari / Chrome, where the game runs in landscape. `to` is the page to land on (a path on this site).
export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).end();
  res.setHeader('Cache-Control', 'no-store');

  const address = await readPlayerWallet(req.cookies);
  if (!address) return res.status(401).json({ error: 'Sign in with your wallet first.' });

  const to = typeof req.body?.to === 'string' && /^\/[a-z0-9\-/]*$/i.test(req.body.to) ? req.body.to : '/';
  const token = await createPlayerHandoffToken(address);
  const proto = req.headers['x-forwarded-proto'] || 'https';
  const origin = `${proto}://${req.headers.host}`;
  return res.status(200).json({
    url: `${origin}/api/game/redeem?t=${encodeURIComponent(token)}&to=${encodeURIComponent(to)}`,
    expiresIn: HANDOFF_TTL_SECONDS,
  });
}
