// Server-side only: which wallets are studio admins. Kept apart from lib/admin.js (which pulls in the whole payout
// stack) so sign-in routes can ask cheaply.
//
// Admins: the treasury wallet, the dev wallet, and any wallet in ADMIN_WALLETS (comma separated).
import { isAddress } from 'viem';
import { DEV_WALLET } from './config';

const TREASURY = process.env.SHOP_TREASURY_ADDRESS || '0x901fC42f24adc138F73BaC931557Ab17AfCA7093'; // as lib/shop.js

export const ADMINS = new Set(
  [DEV_WALLET, TREASURY, ...(process.env.ADMIN_WALLETS || '').split(',')]
    .map((a) => String(a || '').trim())
    .filter((a) => isAddress(a))
    .map((a) => a.toLowerCase())
);
export const isAdmin = (address) => ADMINS.has(String(address || '').toLowerCase());
