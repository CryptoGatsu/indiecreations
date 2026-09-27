// Server-side only: who may use the studio admin page (/admin), and everything it shows.
//
// Admins: the treasury wallet, the dev wallet, and any wallet in ADMIN_WALLETS (comma separated). They sign a free
// message to get a 2-hour admin cookie; the list is checked again on every request.
import { erc20Abi, isAddress } from 'viem';
import { privateKeyToAccount } from 'viem/accounts';
import { DEV_WALLET, TOKEN_ADDRESS } from './config';
import { getDecimals, publicClient } from './holder';
import { ADMIN_COOKIE, readAdminToken } from './session';
import { TREASURY } from './shop';
import { REVSHARE_ADDRESS, REVSHARE_BPS, REVSHARE_MIN_USD, revshareAbi } from './revshare';
import { economyStats } from './revshareJob';
import { indexState } from './chainIndex';
import { rest, persistent } from './supabase';
import { DOWNLOAD_BUILD } from './build';
import { downloadStats, recentDownloads } from './downloadStore';
import { playerCounts } from './presence';

const MIN_INTERVAL_SECONDS = 20 * 24 * 60 * 60; // RevenueShare.MIN_INTERVAL
const LOW_GAS_WEI = 10n ** 15n; // 0.001 ETH: warn below this

export const ADMINS = new Set(
  [DEV_WALLET, TREASURY, ...(process.env.ADMIN_WALLETS || '').split(',')]
    .map((a) => String(a || '').trim())
    .filter((a) => isAddress(a))
    .map((a) => a.toLowerCase())
);
export const isAdmin = (address) => ADMINS.has(String(address || '').toLowerCase());

// The signed-in admin's address, or null (and the response already sent) when the request is not from an admin.
export async function requireAdmin(req, res) {
  const token = await readAdminToken(req.cookies[ADMIN_COOKIE]);
  if (!token || !isAdmin(token.address)) {
    res.status(401).json({ error: 'Sign in with an admin wallet.' });
    return null;
  }
  return token.address;
}

function publisherKeyAddress() {
  const key = process.env.REVSHARE_PUBLISHER_KEY || '';
  if (!key) return null;
  try {
    return privateKeyToAccount(key.startsWith('0x') ? key : `0x${key}`).address;
  } catch {
    return 'invalid';
  }
}

async function recentOrders(limit = 25) {
  if (!persistent) return [];
  return rest(
    `shop_orders?select=id,game,item_id,wallet,usd_cents,amount_raw,status,tx_hash,created_at,paid_at&order=created_at.desc&limit=${limit}`
  );
}

// Everything the admin page shows, plus plain-language warnings about anything that would stop the next payout.
export async function adminStatus() {
  const warnings = [];
  const decimals = TOKEN_ADDRESS ? await getDecimals() : 18;
  const out = {
    decimals,
    token: TOKEN_ADDRESS,
    treasury: { address: TREASURY },
    contract: { address: REVSHARE_ADDRESS },
    publisher: {},
    config: {
      startMonth: process.env.REVSHARE_START_MONTH || null,
      minUsd: REVSHARE_MIN_USD,
      percent: REVSHARE_BPS / 100,
      cronSecretSet: Boolean(process.env.CRON_SECRET),
      admins: [...ADMINS],
    },
  };

  // on-chain: treasury and the payout contract
  const erc = (functionName, args) => publicClient.readContract({ address: TOKEN_ADDRESS, abi: erc20Abi, functionName, args });
  out.treasury.balanceRaw = await erc('balanceOf', [TREASURY]);
  if (REVSHARE_ADDRESS) {
    const rs = (functionName) => publicClient.readContract({ address: REVSHARE_ADDRESS, abi: revshareAbi, functionName });
    const [owner, root, last, claimed, held, allowance, block] = await Promise.all([
      rs('owner'), rs('merkleRoot'), rs('lastPublishedAt'), rs('totalClaimed'),
      erc('balanceOf', [REVSHARE_ADDRESS]), erc('allowance', [TREASURY, REVSHARE_ADDRESS]), publicClient.getBlock(),
    ]);
    out.treasury.allowanceRaw = allowance;
    out.contract = {
      address: REVSHARE_ADDRESS,
      owner,
      merkleRoot: root,
      lastPublishedAt: Number(last) || null,
      nextPublishAllowedAt: Number(last) ? Number(last) + MIN_INTERVAL_SECONDS : null,
      totalClaimedRaw: claimed,
      heldRaw: held,
      chainTime: Number(block.timestamp),
    };
    const keyAddress = publisherKeyAddress();
    out.publisher = {
      address: owner,
      ethWei: await publicClient.getBalance({ address: owner }),
      keySet: Boolean(keyAddress),
      keyMatchesOwner: Boolean(keyAddress && keyAddress !== 'invalid' && keyAddress.toLowerCase() === owner.toLowerCase()),
    };
    if (!out.publisher.keySet) warnings.push('REVSHARE_PUBLISHER_KEY is not set in Vercel: payouts will be worked out but not published.');
    else if (!out.publisher.keyMatchesOwner) warnings.push(`The publisher key in Vercel does not belong to the contract owner (${owner}): publishing will fail.`);
    if (out.publisher.ethWei < LOW_GAS_WEI) warnings.push(`The publisher wallet ${owner} is low on ETH for gas. Send it a little ETH on Robinhood Chain.`);
  } else {
    warnings.push('NEXT_PUBLIC_REVSHARE_ADDRESS is not set: holder rewards are switched off.');
  }
  if (!out.config.cronSecretSet) warnings.push('CRON_SECRET is not set: the daily job cannot run.');
  if (!out.config.startMonth) warnings.push('REVSHARE_START_MONTH is not set: no month will ever pay out.');

  // the daily job and the payouts
  if (persistent) {
    const [stats, state, head] = await Promise.all([economyStats(), indexState(), publicClient.getBlockNumber()]);
    out.stats = stats;
    out.index = state ? { block: state.block, updatedAt: state.updatedAt, head, behind: head - state.block } : { block: null, head };
    if (!state) warnings.push('The daily job has not run yet: no transfers copied.');
    else if (Date.now() - Date.parse(state.updatedAt) > 36 * 3600e3) {
      warnings.push(`The daily job last ran ${new Date(state.updatedAt).toUTCString()}: check the Vercel cron.`);
    }
    const pool = stats.next.poolRaw;
    if (REVSHARE_ADDRESS && stats.next.pendingUsdCents >= stats.next.minUsdCents) {
      if (out.treasury.allowanceRaw < pool) warnings.push('The treasury has not approved enough for the next payout: use "Approve payouts" below.');
      if (out.treasury.balanceRaw < pool) warnings.push('The treasury does not hold enough $CREATIONS for the next payout.');
    }
    // the optional sections never take the page down: they just say what failed
    out.orders = await recentOrders().catch((err) => {
      warnings.push(`Shop orders could not be loaded: ${err.message}`);
      return [];
    });
    out.players = await playerCounts().catch((err) => {
      warnings.push(`Player counts could not be loaded: ${err.message}`);
      return {};
    });
    if (DOWNLOAD_BUILD) {
      try {
        out.downloads = { build: DOWNLOAD_BUILD, stats: await downloadStats(DOWNLOAD_BUILD), recent: await recentDownloads(DOWNLOAD_BUILD, 20) };
      } catch (err) {
        warnings.push(`Playtest downloads could not be loaded: ${err.message}`);
      }
    }
  } else {
    warnings.push('Supabase is not configured: shop, payouts and stats are off.');
  }

  out.warnings = warnings;
  return out;
}

