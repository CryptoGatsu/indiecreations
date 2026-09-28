// DeathRace3000's game server, for the browser build in /public/deathrace3000 (its dr-config.js points here).
//
//   config            network, contracts, entry price, cosmetics
//   price             $CREATIONS price used for quotes (fixed on testnet)
//   rpc               JSON-RPC proxy: reads, plus eth_sendRawTransaction for transactions the player's wallet signed
//   profile           racer name for a game wallet (signed by it); profile/link adds the player's MetaMask
//   faucet            TESTNET ONLY: mock $CREATIONS + a little test ETH
//   cosmetic/quote    operator-signed price quote for CosmeticShop.buy
//   heat/current, heat?id=, heat/joined, heat/result
//   tick              settles / refunds heats that are due (also run by every heat request; Supabase pg_cron pings it)
// The operator key never leaves the server; players' own keys never reach it.
import { getAddress, isAddress, verifyMessage, parseEther } from 'viem';
import { drConfig } from '../../../lib/deathrace/config';
import { chainClients, deployerWrite, quoteSignature, tokenAbi } from '../../../lib/deathrace/chain';
import * as db from '../../../lib/deathrace/store';
import { COSMETICS, cosmetic, HEAT_ENTRY_USD, tokenPrice, usdToRaw } from '../../../lib/deathrace/catalog';
import { currentHeat, heatView, viewHeat, joined, submit, tick } from '../../../lib/deathrace/heats';

export const config = { maxDuration: 60, api: { bodyParser: { sizeLimit: '4mb' } } };

function json(res, code, obj) {
  res.setHeader('Cache-Control', 'no-store');
  res.status(code).send(JSON.stringify(obj, (k, v) => (typeof v === 'bigint' ? v.toString() : v)));
}

const fresh = (issuedAt) => Number.isFinite(Number(issuedAt)) && Math.abs(Date.now() / 1000 - Number(issuedAt)) <= 600;

const profileMessage = (name, address, issuedAt) =>
  `DeathRace3000 profile\nName: ${name}\nGame wallet: ${address}\nChain: ${drConfig().chainId}\nIssued: ${issuedAt}`;
const linkMessage = (linked, address, issuedAt) =>
  `DeathRace3000: link ${linked} to game wallet ${address}\nChain: ${drConfig().chainId}\nIssued: ${issuedAt}`;

const RPC_METHODS = new Set([
  'eth_chainId', 'net_version', 'eth_blockNumber', 'eth_getBalance', 'eth_call', 'eth_estimateGas', 'eth_gasPrice',
  'eth_maxPriorityFeePerGas', 'eth_feeHistory', 'eth_getTransactionCount', 'eth_getTransactionReceipt',
  'eth_getTransactionByHash', 'eth_getBlockByNumber', 'eth_getCode', 'eth_sendRawTransaction',
]);

async function rpcProxy(req, res) {
  const b = req.body;
  const calls = Array.isArray(b) ? b : [b];
  if (!b || calls.length > 20 || calls.some((c) => !c || !RPC_METHODS.has(c.method))) return json(res, 403, { error: 'method not allowed' });
  try {
    const r = await fetch(drConfig().serverRpc, {
      method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(b), signal: AbortSignal.timeout(20_000),
    });
    res.setHeader('Cache-Control', 'no-store');
    res.setHeader('Content-Type', 'application/json');
    res.status(r.status).send(await r.text());
  } catch (e) { json(res, 502, { error: 'rpc unreachable: ' + e.message }); }
}

async function configRoute(res) {
  const cfg = drConfig();
  const price = await tokenPrice().catch(() => null);
  json(res, 200, {
    network: cfg.key, chainId: cfg.chainId, chainName: cfg.name, testnet: cfg.testnet, explorer: cfg.explorer,
    publicRpc: cfg.rpc, token: cfg.dep.token, heats: cfg.dep.heats, shop: cfg.dep.shop, treasury: cfg.dep.treasury,
    entryUsd: HEAT_ENTRY_USD, usdPerToken: price ? price.usd : null, faucet: cfg.testnet,
    cosmetics: COSMETICS.map(({ id, usd, name }) => ({ id, usd, name })),
  });
}

async function saveProfile(req, res) {
  const b = req.body || {};
  const name = String(b.name || '').trim();
  if (!/^[A-Za-z0-9_]{3,16}$/.test(name)) return json(res, 400, { error: 'Names are 3–16 letters, numbers or _.' });
  if (!isAddress(b.address || '')) return json(res, 400, { error: 'bad address' });
  const address = getAddress(b.address);
  if (!fresh(b.issuedAt)) return json(res, 400, { error: 'stale signature' });
  const ok = await verifyMessage({ address, message: profileMessage(name, address, b.issuedAt), signature: b.signature }).catch(() => false);
  if (!ok) return json(res, 401, { error: 'bad signature' });
  try {
    const p = await db.saveProfileName(drConfig().key, address, name);
    json(res, 200, { address, name: p.name, linked: p.linked || undefined });
  } catch (e) { json(res, e.status === 409 ? 409 : 500, { error: e.message }); }
}

async function linkProfile(req, res) {
  const b = req.body || {};
  if (!isAddress(b.address || '') || !isAddress(b.linked || '')) return json(res, 400, { error: 'bad address' });
  const address = getAddress(b.address), linked = getAddress(b.linked);
  if (!fresh(b.issuedAt)) return json(res, 400, { error: 'stale signature' });
  const ok = await verifyMessage({ address: linked, message: linkMessage(linked, address, b.issuedAt), signature: b.signature }).catch(() => false);
  if (!ok) return json(res, 401, { error: 'bad signature' });
  const p = await db.linkProfile(drConfig().key, address, linked);
  json(res, 200, { address, name: p.name || undefined, linked: p.linked });
}

async function faucet(req, res) {
  const cfg = drConfig();
  if (!cfg.testnet) return json(res, 404, { error: 'no faucet on mainnet' });
  const b = req.body || {};
  if (!isAddress(b.address || '')) return json(res, 400, { error: 'bad address' });
  const to = getAddress(b.address);
  if (!(await db.claimFaucet(cfg.key, to, 300))) return json(res, 429, { error: 'Faucet: once every 5 minutes per wallet.' });
  try {
    const { pub } = chainClients();
    const amount = 2_000_000n * 10n ** 18n;   // ~$110 at the test price
    const r1 = await deployerWrite({ address: cfg.dep.token, abi: tokenAbi, functionName: 'mint', args: [to, amount] });
    let gasTx = null;
    if ((await pub.getBalance({ address: to })) < parseEther('0.0005')) {
      gasTx = (await deployerWrite({ to, value: parseEther('0.001') })).transactionHash;
    }
    json(res, 200, { ok: true, tokensRaw: amount, mintTx: r1.transactionHash, gasTx });
  } catch (e) {
    await db.releaseFaucet(cfg.key, to);
    json(res, 502, { error: 'Faucet failed: ' + (e.shortMessage || e.message) });
  }
}

async function cosmeticQuote(req, res) {
  const b = req.body || {};
  const item = cosmetic(b.itemId);
  if (!item) return json(res, 404, { error: 'unknown item' });
  if (!isAddress(b.address || '')) return json(res, 400, { error: 'bad address' });
  const price = await tokenPrice();
  if (!price) return json(res, 503, { error: 'No reliable $CREATIONS price right now, try again in a minute.' });
  const amount = usdToRaw(item.usd, price.usd);
  const expiry = BigInt(Math.floor(Date.now() / 1000) + 300);
  const signature = await quoteSignature(getAddress(b.address), item.id, amount, expiry);
  json(res, 200, { itemId: item.id, usd: item.usd, amountRaw: amount, expiry, signature, shop: drConfig().dep.shop });
}

export default async function handler(req, res) {
  const path = (req.query.path || []).join('/');
  const post = req.method === 'POST';
  try {
    if (path === 'config') return await configRoute(res);
    if (path === 'price') { const p = await tokenPrice(); return json(res, p ? 200 : 503, p || { error: 'no price' }); }
    if (path === 'rpc' && post) return await rpcProxy(req, res);
    if (path === 'profile' && post) return await saveProfile(req, res);
    if (path === 'profile') {
      const a = String(req.query.address || '');
      if (!isAddress(a)) return json(res, 200, {});
      const p = await db.getProfile(drConfig().key, a);
      return json(res, 200, p ? { address: p.address, name: p.name || undefined, linked: p.linked || undefined } : {});
    }
    if (path === 'profile/link' && post) return await linkProfile(req, res);
    if (path === 'faucet' && post) return await faucet(req, res);
    if (path === 'cosmetic/quote' && post) return await cosmeticQuote(req, res);
    if (path === 'heat/current') return json(res, 200, await heatView(await currentHeat()));
    if (path === 'heat') return json(res, 200, (await viewHeat(Number(req.query.id))) || { error: 'unknown heat' });
    if (path === 'heat/joined' && post) return json(res, 200, await joined(Number(req.body.heatId), req.body.address));
    if (path === 'heat/result' && post) return json(res, 200, await submit(Number(req.body.heatId), req.body));
    if (path === 'tick') { await tick(true); return json(res, 200, { ok: true }); }
    if (path.startsWith('x/') || path.startsWith('moonpay/')) return json(res, 503, { error: 'Coming soon.' });
    json(res, 404, { error: 'not found' });
  } catch (e) {
    console.error(`deathrace ${path}:`, e.shortMessage || e.message);
    json(res, 400, { error: e.shortMessage || e.message || String(e) });
  }
}
