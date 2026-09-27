import { getAddress, isAddress } from 'viem';
import { buildAdminSignInMessage, MESSAGE_MAX_AGE_MS } from '../../../lib/authMessage';
import { publicClient } from '../../../lib/holder';
import { isAdmin } from '../../../lib/admin';
import { adminCookieHeader, createAdminToken } from '../../../lib/session';

// POST { address, issuedAt, signature } -> checks the wallet signed the admin message and is on the admin list, then
// sets the 2-hour admin cookie.
export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).end();
  res.setHeader('Cache-Control', 'no-store');
  const { address, issuedAt, signature } = req.body || {};
  if (!isAddress(address || '') || typeof signature !== 'string' || typeof issuedAt !== 'string') {
    return res.status(400).json({ error: 'Invalid request.' });
  }
  const age = Date.now() - Date.parse(issuedAt);
  if (!(age >= -60_000 && age <= MESSAGE_MAX_AGE_MS)) return res.status(400).json({ error: 'Signature expired. Try again.' });

  try {
    const wallet = getAddress(address);
    // verifyMessage also covers smart-contract and EIP-7702 wallets
    const valid = await publicClient.verifyMessage({ address: wallet, message: buildAdminSignInMessage(wallet, issuedAt), signature });
    if (!valid) return res.status(401).json({ error: 'Signature did not match the wallet.' });
    if (!isAdmin(wallet)) return res.status(403).json({ error: 'This wallet is not a studio admin.' });
    res.setHeader('Set-Cookie', adminCookieHeader(await createAdminToken(wallet)));
    return res.status(200).json({ address: wallet });
  } catch (err) {
    console.error('admin sign-in failed:', err);
    return res.status(500).json({ error: 'Could not verify the signature. Try again.' });
  }
}
