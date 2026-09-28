// Server-side only: chain access for DeathRace3000. Public reads, the operator's transactions (one at a time across
// every serverless instance, under a Supabase lock, so nonces never collide) and the quote signature CosmeticShop checks.
import { createPublicClient, createWalletClient, http, encodeAbiParameters, keccak256 } from 'viem';
import { drConfig, operatorAccount, deployerAccount } from './config';
import { withLock } from './store';
import ABI from './abi.json';

export const heatsAbi = ABI.heats;
export const shopAbi = ABI.shop;
export const tokenAbi = ABI.token;

let clients = null;

export function chainClients() {
  if (clients) return clients;
  const cfg = drConfig();
  const transport = http(cfg.serverRpc, { timeout: 20_000, retryCount: 2 });
  clients = { cfg, transport, pub: createPublicClient({ chain: cfg.chain, transport }) };
  return clients;
}

async function send(lockName, account, req) {
  const { cfg, transport, pub } = chainClients();
  const wallet = createWalletClient({ account, chain: cfg.chain, transport });
  return withLock(`${lockName}:${cfg.key}`, 90, 25_000, async () => {
    const hash = req.functionName
      ? await wallet.writeContract({ ...req, account })
      : await wallet.sendTransaction({ ...req, account });
    const r = await pub.waitForTransactionReceipt({ hash, timeout: 60_000 });
    if (r.status !== 'success') throw new Error(`${req.functionName || 'transfer'} reverted (${hash})`);
    return r;
  });
}

/** An operator transaction (createHeat / settle / cancel); resolves with the receipt. */
export const opWrite = (req) => send('op', operatorAccount(), req);

/** Testnet faucet transactions, from the mock token's owner. */
export function deployerWrite(req) {
  const acct = deployerAccount();
  if (!acct) throw new Error('no faucet on this network');
  return send('dep', acct, req);
}

export async function quoteSignature(buyer, itemId, amount, expiry) {
  const { dep, chainId } = drConfig();
  const hash = keccak256(encodeAbiParameters(
    [{ type: 'uint256' }, { type: 'address' }, { type: 'address' }, { type: 'uint32' }, { type: 'uint256' }, { type: 'uint64' }],
    [BigInt(chainId), dep.shop, buyer, itemId, amount, expiry]));
  return operatorAccount().signMessage({ message: { raw: hash } });
}
