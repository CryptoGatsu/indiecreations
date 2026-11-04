// Indie Creations Store: the platform's fixed numbers (PLATFORM_SPEC section 2), in one place.
// Amounts in USD unless the name says otherwise; splits in basis points (10,000 = 100%).
import { TOKEN_ADDRESS } from '../config';

// $CREATIONS on Robinhood Chain. Hardcoded on purpose: never look a token up by name or symbol.
export const CREATIONS_TOKEN = '0xB9195597f91f179EBB05D3F1765B35C3d8491aCb';
if (TOKEN_ADDRESS && TOKEN_ADDRESS.toLowerCase() !== CREATIONS_TOKEN.toLowerCase()) {
  // lib/config.js lets NEXT_PUBLIC_TOKEN_ADDRESS override the token for local testing; the platform never does
  console.warn('NEXT_PUBLIC_TOKEN_ADDRESS differs from the platform $CREATIONS address; the platform uses its own.');
}

export const CHAIN_RH = 4663;
export const CHAIN_RH_TESTNET = 46630;
export const BURN_ADDRESS_EVM = '0x000000000000000000000000000000000000dEaD';

export const DEV_APPLY_BURN_USD = 50;
export const NEW_GAME_BURN_USD = 50;
export const FREE_RESUBMISSIONS = 1; // per burn

export const SPLIT_DEV_BPS = 8000;
export const SPLIT_HOLDERS_BPS = 200;
export const SPLIT_CURATORS_BPS = 100;
export const SPLIT_PLATFORM_BPS = 1700;

export const ESCROW_HOURS = 72;
export const REFUND_WINDOW_HOURS = 72;
export const ABANDON_REFUND_HOURS = 24;
export const MIN_PAID_PRICE_USD = 0.99;
export const SALE_COOLDOWN_DAYS = 30;

export const CURATOR_MIN_HOLD_USD = 25; // valued at the 7-day average price
export const CURATOR_MIN_REVIEWS = 5; // per month
export const CURATOR_MAX_FREE_REVIEWS = 2; // of those, at most this many for free games
export const CURATOR_REVIEW_MIN_PLAYTIME_MIN = 30;
export const CURATOR_REVIEW_MIN_PLAYTIME_MIN_FREE = 15;
export const CURATOR_REVIEW_MIN_WORDS = 150;
export const CURATOR_REVIEW_MATURITY_DAYS = 7;
export const CURATOR_MAX_POOL_SHARE_BPS = 2000;

export const HOLDER_MIN_PAYOUT_USD = 1; // smaller amounts roll over

export const DEV_BUY_CAP_BPS = 500; // of the game token's supply
export const VEST_CLIFF_DAYS = 30;
export const VEST_LINEAR_DAYS = 180;

export const DEXSCREENER_HOLD_BPS = 1000; // of dev game-sale earnings
export const DEXSCREENER_TARGET_USD = 299; // VERIFY the current Enhanced Token Info price before milestone 8

export const SHOP_TWAP_MINUTES = 30;
export const SHOP_MIN_LIQUIDITY_USD = 5000;
export const TOKEN_CHECK_CACHE_MIN = 10;

export const ABANDON_NO_UPDATE_DAYS = 90;
export const ABANDON_NO_REPLY_DAYS = 14;
export const ABANDON_BROKEN_NO_REPLY_DAYS = 7;

if (SPLIT_DEV_BPS + SPLIT_HOLDERS_BPS + SPLIT_CURATORS_BPS + SPLIT_PLATFORM_BPS !== 10_000) {
  throw new Error('The sale split must add up to 100%.');
}

// Account roles. One account can hold several; `player` is everyone's. `admin` is never stored: it comes from
// ADMIN_WALLETS (lib/admin.js) matched against the account's linked wallets, so removing a wallet there locks it out.
export const ROLES = ['player', 'curator', 'developer', 'admin'];
export const STORED_ROLES = ['player', 'curator', 'developer'];
