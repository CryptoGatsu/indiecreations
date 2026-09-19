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
