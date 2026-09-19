import { defineChain, isAddress } from 'viem';

// ---------------------------------------------------------------------------
// $creations token — paste the contract address here once the PONS launch is
// live (or set NEXT_PUBLIC_TOKEN_ADDRESS in the environment). While this is
// empty the playtest area stays locked for everyone and the site shows
// "CA announced at launch".
// ---------------------------------------------------------------------------
const TOKEN_ADDRESS_RAW = process.env.NEXT_PUBLIC_TOKEN_ADDRESS || '';

export const TOKEN_ADDRESS = isAddress(TOKEN_ADDRESS_RAW) ? TOKEN_ADDRESS_RAW : null;
export const TOKEN_TICKER = '$creations';

// Minimum whole-token balance needed to unlock the playtest area.
export const MIN_TOKENS = Number(process.env.NEXT_PUBLIC_MIN_TOKENS || 5_000_000);

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
  pons: 'https://www.ponslaunchpad.com/',
  explorer: robinhoodChain.blockExplorers.default.url,
  tokenExplorer: TOKEN_ADDRESS
    ? `${robinhoodChain.blockExplorers.default.url}/token/${TOKEN_ADDRESS}`
    : null,
};

export const shortAddress = (a) => (a ? `${a.slice(0, 6)}…${a.slice(-4)}` : '');
