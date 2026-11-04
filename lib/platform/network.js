// Server-side only: which chain the store's own flows (burns, and later checkout) run on.
//
// PLATFORM_NETWORK  testnet (default) | mainnet. The spec says testnet first, and mainnet only with the studio's
//                   approval, so nothing defaults to mainnet.
// On testnet the token is the mock $CREATIONS DeathRace3000 deployed (it has a faucet) at a fixed test price.
// PLATFORM_RPC_URL / PLATFORM_TOKEN override the RPC and token, for local tests against a dev chain.
import { createPublicClient, http } from 'viem';
import { robinhoodChain, robinhoodTestnet } from '../config';
import { getTokenPriceUsd } from '../price';
import { serverTransportOptions } from '../patientFetch';
import { CREATIONS_TOKEN } from './config';
import DR_DEPLOYMENTS from '../deathrace/deployments.json';

const NETWORKS = {
  testnet: {
    key: 'testnet',
    chain: robinhoodTestnet,
    token: DR_DEPLOYMENTS['46630']?.token,
    usdPerToken: 5.51 / 100000, // fixed test price (the mock token has no market), the same as DeathRace3000's
    rpc: 'https://rpc.testnet.chain.robinhood.com',
  },
  mainnet: {
    key: 'mainnet',
    chain: robinhoodChain,
    token: CREATIONS_TOKEN,
    usdPerToken: null, // live, two sources must agree (lib/price.js)
    rpc: process.env.RPC_URL || 'https://rpc.mainnet.chain.robinhood.com',
  },
};

let cached = null;
export function platformNetwork() {
  if (cached) return cached;
  const base = NETWORKS[process.env.PLATFORM_NETWORK || 'testnet'];
  if (!base) throw new Error('PLATFORM_NETWORK must be testnet or mainnet');
  const token = (process.env.PLATFORM_TOKEN || base.token || '').toLowerCase();
  const rpc = process.env.PLATFORM_RPC_URL || base.rpc;
  const client = createPublicClient({ chain: base.chain, transport: http(rpc, serverTransportOptions) });
  cached = {
    key: base.key,
    testnet: base.key === 'testnet',
    chainId: base.chain.id,
    chainName: base.chain.name,
    explorer: base.chain.blockExplorers.default.url,
    token,
    client,
    usdPerToken: base.usdPerToken,
  };
  return cached;
}

// USD per whole $CREATIONS on the store's network, or null when there is no trustworthy price right now.
export async function platformTokenPrice() {
  const net = platformNetwork();
  if (net.usdPerToken) return net.usdPerToken;
  const price = await getTokenPriceUsd();
  return price?.usd || null;
}

// What the browser needs to send a payment on the store's network.
export function publicNetwork() {
  const net = platformNetwork();
  return { key: net.key, testnet: net.testnet, chainId: net.chainId, chainName: net.chainName, token: net.token, explorer: net.explorer };
}
