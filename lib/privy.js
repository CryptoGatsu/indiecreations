// Server-side only: checks a Privy login. The browser sends its Privy identity token; it is a JWT signed by Privy for
// this app that lists the user's linked accounts (email, embedded and linked wallets), so the server learns who they
// are and which wallets are theirs without calling Privy's API.
//
// NEXT_PUBLIC_PRIVY_APP_ID turns Privy sign-in on. PRIVY_VERIFICATION_KEY (the app's verification key from the Privy
// dashboard, a PEM public key) checks the token offline; without it the key is fetched from Privy's JWKS endpoint.
import { verifyIdentityToken } from '@privy-io/node';
import { createRemoteJWKSet } from 'jose';

import { PRIVY_APP_ID, privyEnabled } from './privyClient';

export { PRIVY_APP_ID, privyEnabled };

let jwks = null;
function verificationKey() {
  const pem = process.env.PRIVY_VERIFICATION_KEY;
  // env values often arrive with literal "\n" instead of line breaks
  if (pem) return pem.replace(/\\n/g, '\n');
  jwks ||= createRemoteJWKSet(new URL(`https://api.privy.io/v1/apps/${PRIVY_APP_ID}/jwks.json`));
  return jwks;
}

const EVM = /^0x[0-9a-fA-F]{40}$/;
const SOLANA = /^[1-9A-HJ-NP-Za-km-z]{32,44}$/;

// { privyId, email, wallets: [{ chain: 'evm' | 'solana', address, type: 'embedded' | 'linked' }] }, or throws.
// EVM addresses are lowercased (the site keys everything by lowercase address); Solana addresses are case-sensitive.
export async function verifyPrivyLogin(identityToken) {
  if (!privyEnabled) throw new Error('Privy sign-in is not switched on.');
  if (typeof identityToken !== 'string' || identityToken.length > 20_000) throw new Error('Invalid identity token.');
  const user = await verifyIdentityToken({
    identity_token: identityToken,
    app_id: PRIVY_APP_ID,
    verification_key: verificationKey(),
  });

  let email = null;
  const wallets = [];
  for (const a of user.linked_accounts || []) {
    if (a.type === 'email' && !email && typeof a.address === 'string') email = a.address.toLowerCase();
    if (a.type !== 'wallet' || typeof a.address !== 'string') continue;
    const type = a.wallet_client_type === 'privy' || a.connector_type === 'embedded' ? 'embedded' : 'linked';
    if (a.chain_type === 'ethereum' && EVM.test(a.address)) wallets.push({ chain: 'evm', address: a.address.toLowerCase(), type });
    if (a.chain_type === 'solana' && SOLANA.test(a.address)) wallets.push({ chain: 'solana', address: a.address, type });
  }
  if (!/^did:privy:[A-Za-z0-9]+$/.test(user.id || '')) throw new Error('Invalid identity token.');
  return { privyId: user.id, email, wallets };
}
