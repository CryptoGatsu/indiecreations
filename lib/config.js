import { defineChain, isAddress } from 'viem';

// ---------------------------------------------------------------------------
// $creations token on Robinhood Chain, launched through PONS Launchpad.
// NEXT_PUBLIC_TOKEN_ADDRESS can override it (e.g. to test against another token).
// ---------------------------------------------------------------------------
const TOKEN_ADDRESS_RAW =
  process.env.NEXT_PUBLIC_TOKEN_ADDRESS || '0xB9195597f91f179EBB05D3F1765B35C3d8491aCb';

export const TOKEN_ADDRESS = isAddress(TOKEN_ADDRESS_RAW) ? TOKEN_ADDRESS_RAW : null;
export const TOKEN_TICKER = '$creations';

// Minimum whole-token balance needed to unlock the playtest area.
export const MIN_TOKENS = Number(process.env.NEXT_PUBLIC_MIN_TOKENS || 5_000_000);

// Wallets that always get into the playtest area, whatever they hold (the studio's own dev wallet, testers...).
// They still have to sign the message, so only the wallet's owner can use the pass.
// More can be added without a code change: ALLOWLIST_WALLETS="0xabc...,0xdef..."
const ALLOWLIST_RAW = [
  '0xab0823CFC0bCb52edB35a7706862352E04DF7D79', // dev wallet
  ...(process.env.ALLOWLIST_WALLETS || '').split(','),
];
export const ALLOWLIST = new Set(
  ALLOWLIST_RAW.map((a) => a.trim()).filter((a) => isAddress(a)).map((a) => a.toLowerCase())
);
export const isAllowlisted = (address) => ALLOWLIST.has(String(address || '').toLowerCase());

export const robinhoodChain = defineChain({
  id: 4663,
  name: 'Robinhood Chain',
  nativeCurrency: { name: 'Ether', symbol: 'ETH', decimals: 18 },
  rpcUrls: {
    default: {
      http: [process.env.NEXT_PUBLIC_RPC_URL || 'https://rpc.mainnet.chain.robinhood.com'],
    },
  },
  blockExplorers: {
    default: { name: 'Blockscout', url: 'https://robinhoodchain.blockscout.com' },
  },
});

export const LINKS = {
  // The token's own page on PONS; falls back to the launchpad index without a CA.
  pons: `https://www.ponsfamily.com/launchpad/${TOKEN_ADDRESS || ''}`,
  x: 'https://x.com/IndieCreations_',
  explorer: robinhoodChain.blockExplorers.default.url,
  tokenExplorer: TOKEN_ADDRESS
    ? `${robinhoodChain.blockExplorers.default.url}/token/${TOKEN_ADDRESS}`
    : null,
};

export const shortAddress = (a) => (a ? `${a.slice(0, 6)}…${a.slice(-4)}` : '');
