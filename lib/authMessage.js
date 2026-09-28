import { robinhoodChain } from './config';

// Sign-in message. The server rebuilds it from (address, issuedAt) so the
// client can never get an arbitrary message accepted.
export const MESSAGE_MAX_AGE_MS = 5 * 60 * 1000;

export function buildSignInMessage(address, issuedAt) {
  return [
    'Indie Creations: verify wallet for playtest access.',
    '',
    'Signing is free and does not send a transaction.',
    '',
    `Wallet: ${address}`,
    `Chain ID: ${robinhoodChain.id}`,
    `Issued At: ${issuedAt}`,
  ].join('\n');
}

// Sign-in for your profile on the site and for the browser games (cosmetics follow your wallet). Rebuilt server-side.
export function buildPlayerSignInMessage(address, issuedAt) {
  return [
    'Indie Creations: sign in.',
    '',
    'This proves you own this wallet, for your profile and the cosmetics you own.',
    'Signing is free and does not send a transaction.',
    '',
    `Wallet: ${address}`,
    `Chain ID: ${robinhoodChain.id}`,
    `Issued At: ${issuedAt}`,
  ].join('\n');
}

// Sign-in for the studio admin page. Rebuilt server-side like the others.
export function buildAdminSignInMessage(address, issuedAt) {
  return [
    'Indie Creations: sign in to the studio admin page.',
    '',
    'Signing is free and does not send a transaction.',
    '',
    `Wallet: ${address}`,
    `Chain ID: ${robinhoodChain.id}`,
    `Issued At: ${issuedAt}`,
  ].join('\n');
}
