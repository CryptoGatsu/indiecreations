import { isAddress, getAddress } from 'viem';
import { buildPlayerSignInMessage, MESSAGE_MAX_AGE_MS } from '../../../lib/authMessage';
import { publicClient } from '../../../lib/holder';
import { createPlayerToken, playerCookieHeader } from '../../../lib/session';

// POST { address, issuedAt, signature } -> signs this browser in to the browser games as that wallet (a free signature,
// no balance needed), so the cosmetics it owns come with it. Sets the ic_player cookie.
// GET ?address=0x... -> { message, issuedAt }: the exact text to sign (the page has no checksum code of its own).
export default async function handler(req, res) {
  res.setHeader('Cache-Control', 'no-store');
  if (req.method === 'GET') {
    const raw = typeof req.query.address === 'string' ? req.query.address : '';
    if (!isAddress(raw, { strict: false })) return res.status(400).json({ error: 'Invalid address.' });
    const issuedAt = new Date().toISOString();
    return res.status(200).json({ issuedAt, message: buildPlayerSignInMessage(getAddress(raw), issuedAt) });
  }
  if (req.method !== 'POST') return res.status(405).end();

  const { address, issuedAt, signature } = req.body || {};
  if (!isAddress(address || '', { strict: false }) || typeof signature !== 'string' || typeof issuedAt !== 'string') {
    return res.status(400).json({ error: 'Invalid request.' });
  }
  const age = Date.now() - Date.parse(issuedAt);
  if (!(age >= -60_000 && age <= MESSAGE_MAX_AGE_MS)) {
    return res.status(400).json({ error: 'The signature expired. Please try again.' });
  }

  try {
    const wallet = getAddress(address);
    // verifyMessage also covers smart-contract wallets (ERC-1271)
    const valid = await publicClient.verifyMessage({ address: wallet, message: buildPlayerSignInMessage(wallet, issuedAt), signature });
    if (!valid) return res.status(401).json({ error: 'The signature did not match the wallet.' });
    res.setHeader('Set-Cookie', playerCookieHeader(await createPlayerToken(wallet)));
    return res.status(200).json({ address: wallet.toLowerCase() });
  } catch (err) {
    console.error('game sign-in failed:', err);
    return res.status(500).json({ error: 'Could not check the signature. Try again shortly.' });
  }
}
