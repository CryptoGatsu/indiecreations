// Server-side only: which Robinhood Chain network DeathRace3000 runs on, its contracts, and the keys that act for it.
//
// DR_NETWORK        testnet (default) | mainnet
// DR_OPERATOR_KEY   opens / settles heats and signs cosmetic price quotes (needs a little ETH for gas)
// DR_DEPLOYER_KEY   testnet only: owner of the mock $CREATIONS, pays out the test faucet
// Contract addresses come from deployments.json (written by DeathRace3000's tools/web/chain/deploy.mjs).
import { defineChain } from 'viem';
import { privateKeyToAccount } from 'viem/accounts';
import DEPLOYMENTS from './deployments.json';

/** Indie Creations treasury: every cosmetic sale and the heat rake land here. */
export const TREASURY = '0x901fC42f24adc138F73BaC931557Ab17AfCA7093';

const NETWORKS = {
  testnet: {
    key: 'testnet', chainId: 46630, name: 'Robinhood Chain Testnet', testnet: true,
    rpc: 'https://rpc.testnet.chain.robinhood.com',
    explorer: 'https://explorer.testnet.chain.robinhood.com',
    usdPerToken: 5.51 / 100000,   // fixed test price: mock tokens have no market
  },
  mainnet: {
    key: 'mainnet', chainId: 4663, name: 'Robinhood Chain', testnet: false,
    rpc: 'https://rpc.mainnet.chain.robinhood.com',
    explorer: 'https://robinhoodchain.blockscout.com',
    usdPerToken: null,            // live price (lib/price.js)
  },
};

let cached = null;

export function drConfig() {
  if (cached) return cached;
  const net = NETWORKS[process.env.DR_NETWORK || 'testnet'];
  if (!net) throw new Error('DR_NETWORK must be testnet or mainnet');
  const dep = DEPLOYMENTS[String(net.chainId)];
  if (!dep) throw new Error(`DeathRace3000 is not deployed on ${net.name} yet`);
  // server reads may use the site's private RPC on mainnet
  const serverRpc = !net.testnet && process.env.RPC_URL ? process.env.RPC_URL : net.rpc;
  const chain = defineChain({
    id: net.chainId, name: net.name,
    nativeCurrency: { name: 'Ether', symbol: 'ETH', decimals: 18 },
    rpcUrls: { default: { http: [serverRpc] } },
    blockExplorers: { default: { name: 'Explorer', url: net.explorer } },
    testnet: net.testnet,
  });
  cached = { ...net, serverRpc, chain, dep };
  return cached;
}

const key = (v) => (v && /^0x[0-9a-fA-F]{64}$/.test(v.trim()) ? v.trim() : null);

export function operatorAccount() {
  const k = key(process.env.DR_OPERATOR_KEY);
  if (!k) throw new Error('DeathRace3000 operator is not configured');
  const acct = privateKeyToAccount(k);
  if (acct.address.toLowerCase() !== drConfig().dep.operator.toLowerCase()) throw new Error('operator key does not match the deployment');
  return acct;
}

export function deployerAccount() {
  if (!drConfig().testnet) return null;
  const k = key(process.env.DR_DEPLOYER_KEY);
  return k ? privateKeyToAccount(k) : null;
}
