import { isAddress, getAddress } from 'viem';
import { TOKEN_ADDRESS, MIN_TOKENS } from '../../../lib/config';
import { buildSignInMessage, MESSAGE_MAX_AGE_MS } from '../../../lib/authMessage';
import { publicClient, checkHolder } from '../../../lib/holder';
import { createSessionToken, sessionCookieHeader } from '../../../lib/session';

// POST { address, issuedAt, signature } -> verifies wallet ownership and the
// on-chain balance, then sets the session cookie that unlocks /game/*.
export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).end();

  if (!TOKEN_ADDRESS) {
    return res.status(503).json({ error: 'Playtests open once the token is live.' });
  }

  const { address, issuedAt, signature } = req.body || {};
  if (!isAddress(address || '') || typeof signature !== 'string' || typeof issuedAt !== 'string') {
    return res.status(400).json({ error: 'Invalid request.' });
  }

  const age = Date.now() - Date.parse(issuedAt);
  if (!(age >= -60_000 && age <= MESSAGE_MAX_AGE_MS)) {
    return res.status(400).json({ error: 'Signature expired. Please try again.' });
  }

  try {
    const wallet = getAddress(address);

    // publicClient.verifyMessage also covers smart-contract wallets (ERC-1271).
    const valid = await publicClient.verifyMessage({
      address: wallet,
      message: buildSignInMessage(wallet, issuedAt),
      signature,
    });
    if (!valid) return res.status(401).json({ error: 'Signature did not match wallet.' });

    const { holder, balance } = await checkHolder(wallet);
    if (!holder) {
      return res.status(403).json({ holder: false, balance, required: MIN_TOKENS });
    }

    res.setHeader('Set-Cookie', sessionCookieHeader(await createSessionToken(wallet)));
    return res.status(200).json({ holder: true, balance, address: wallet });
  } catch (err) {
    console.error('verify failed:', err);
    return res.status(500).json({ error: 'Could not verify holdings. Try again shortly.' });
  }
}
