// Server-side only: becoming a developer on the store (PLATFORM_SPEC section 4).
// Apply with a profile and a $50 burn; the studio approves or turns it down with a reason. A rejected application gets
// one free resubmission; after that, applying again takes a new burn.
import { rest } from '../supabase';
import { FREE_RESUBMISSIONS } from './config';
import { applicationCodes } from './guidelines';
import { StoreError } from './auth';
import { spendBurn, unspendBurn, unusedBurn, verifyBurn } from './burns';
import { logAdmin } from './adminLog';

const q = encodeURIComponent;

const toApplication = (r) =>
  r && {
    id: r.id,
    status: r.status,
    profile: r.profile_snapshot,
    burnTx: r.burn_tx,
    rejectionCodes: r.rejection_codes || [],
    note: r.note || null,
    resubmission: r.resubmission,
    createdAt: r.created_at,
    decidedAt: r.decided_at,
  };

async function latestApplication(userId) {
  const [row] = await rest(`dev_applications?user_id=eq.${q(userId)}&select=*&order=created_at.desc&limit=1`);
  return row || null;
}

// A rejected application can be sent again free once: the free one is the application right after a paid one.
function freeResubmission(latest) {
  if (!latest || latest.status !== 'rejected') return false;
  return FREE_RESUBMISSIONS > 0 && !latest.resubmission;
}

export async function devState(account) {
  const latest = await latestApplication(account.id);
  const [profile] = await rest(`dev_profiles?user_id=eq.${q(account.id)}&select=*`);
  const isDeveloper = account.roles.includes('developer');
  const waiting = latest?.status === 'submitted';
  return {
    isDeveloper,
    application: toApplication(latest),
    profile: profile || null,
    canApply: !isDeveloper && !waiting,
    needsBurn: !isDeveloper && !waiting && !freeResubmission(latest),
    unusedBurn: await unusedBurn(account, 'dev_apply'),
  };
}

const URL_RE = /^https?:\/\/[^\s<>"]{3,200}$/i;
const EMAIL_RE = /^[^\s@]{1,64}@[^\s@]{1,190}\.[a-z]{2,24}$/i;

function cleanProfile(account, form) {
  const studioName = String(form.studioName || '').trim().replace(/\s+/g, ' ');
  if (studioName.length < 2 || studioName.length > 60) throw new StoreError(400, 'Studio name: 2 to 60 characters.');
  const links = (Array.isArray(form.links) ? form.links : [])
    .map((l) => String(l || '').trim())
    .filter(Boolean);
  if (!links.length) throw new StoreError(400, 'Add at least one link to your work (a portfolio, itch.io, Steam, GitHub, socials).');
  if (links.length > 5) throw new StoreError(400, 'At most 5 links.');
  if (links.some((l) => !URL_RE.test(l))) throw new StoreError(400, 'Links must be full web addresses (https://...).');
  const contactEmail = String(form.contactEmail || account.email || '').trim().toLowerCase();
  if (!EMAIL_RE.test(contactEmail)) throw new StoreError(400, 'Add a contact email.');
  const pastWork = String(form.pastWork || '').trim();
  if (pastWork.length < 20 || pastWork.length > 2000) throw new StoreError(400, 'Past work: 20 to 2,000 characters.');
  const payout = String(form.payoutWalletEvm || account.primaryWallet || '').toLowerCase();
  if (!account.wallets.some((w) => w.chain === 'evm' && w.address === payout)) {
    throw new StoreError(400, 'Your payout wallet must be one of your linked wallets.');
  }
  const sol = form.payoutWalletSol ? String(form.payoutWalletSol) : null;
  if (sol && !account.wallets.some((w) => w.chain === 'solana' && w.address === sol)) {
    throw new StoreError(400, 'Your Solana payout wallet must be one of your linked wallets.');
  }
  return { studioName, links, contactEmail, pastWork, payoutWalletEvm: payout, payoutWalletSol: sol };
}

// form: { studioName, links[], contactEmail, pastWork, payoutWalletEvm?, payoutWalletSol? }
// burn: { quoteId, tx } of a $50 burn, unless this is the free resubmission or an earlier burn is still unused.
export async function submitApplication(account, form, burn) {
  if (account.roles.includes('developer')) throw new StoreError(409, 'You are already a developer.');
  const latest = await latestApplication(account.id);
  if (latest?.status === 'submitted') throw new StoreError(409, 'Your application is already waiting for review.');
  const profile = cleanProfile(account, form || {});

  const free = freeResubmission(latest);
  let spent = null;
  if (!free) {
    if (burn?.quoteId && burn?.tx) await verifyBurn(account, { quoteId: burn.quoteId, tx: burn.tx, purpose: 'dev_apply' });
    const available = await unusedBurn(account, 'dev_apply');
    if (!available) throw new StoreError(402, 'Applying takes a $50 $CREATIONS burn.');
    spent = await spendBurn(account, available.id, 'dev_apply');
  }

  try {
    await rest('dev_profiles?on_conflict=user_id', {
      method: 'POST',
      headers: { Prefer: 'resolution=merge-duplicates,return=minimal' },
      body: JSON.stringify({
        user_id: account.id,
        studio_name: profile.studioName,
        links: profile.links,
        contact_email: profile.contactEmail,
        past_work: profile.pastWork,
        payout_wallet_evm: profile.payoutWalletEvm,
        payout_wallet_sol: profile.payoutWalletSol,
        status: 'applied',
        updated_at: new Date().toISOString(),
      }),
    });
    const [row] = await rest('dev_applications', {
      method: 'POST',
      headers: { Prefer: 'return=representation' },
      body: JSON.stringify({
        user_id: account.id,
        profile_snapshot: profile,
        burn_id: spent ? spent.id : latest.burn_id,
        burn_tx: spent ? spent.tx : latest.burn_tx,
        resubmission: free,
      }),
    });
    return toApplication(row);
  } catch (err) {
    if (spent) await unspendBurn(spent.id);
    if (err.status === 409) throw new StoreError(409, 'Your application is already waiting for review.');
    throw err;
  }
}

// ---- studio admin

export async function listApplications(status = 'submitted') {
  const rows = await rest(`dev_applications?status=eq.${q(status)}&select=*&order=created_at.asc&limit=100`);
  if (!rows.length) return [];
  const ids = [...new Set(rows.map((r) => r.user_id))];
  const [users, wallets] = await Promise.all([
    rest(`users?id=in.(${ids.map(q).join(',')})&select=id,email,primary_wallet,created_at`),
    rest(`wallets?user_id=in.(${ids.map(q).join(',')})&select=user_id,chain,address,type`),
  ]);
  const byId = Object.fromEntries(users.map((u) => [u.id, u]));
  return rows.map((r) => ({
    ...toApplication(r),
    account: {
      id: r.user_id,
      email: byId[r.user_id]?.email || null,
      primaryWallet: byId[r.user_id]?.primary_wallet || null,
      joinedAt: byId[r.user_id]?.created_at,
      wallets: wallets.filter((w) => w.user_id === r.user_id).map(({ chain, address, type }) => ({ chain, address, type })),
    },
  }));
}

export async function decideApplication(admin, id, { approve, codes = [], note = '' }) {
  if (!/^[0-9a-f-]{36}$/.test(String(id))) throw new StoreError(400, 'Invalid application.');
  const cleanCodes = [...new Set((codes || []).filter((c) => applicationCodes.includes(c)))];
  const cleanNote = String(note || '').trim().slice(0, 1000) || null;
  if (!approve && !cleanCodes.length) throw new StoreError(400, 'Pick at least one reason for turning it down.');

  const rows = await rest(`dev_applications?id=eq.${q(id)}&status=eq.submitted`, {
    method: 'PATCH',
    headers: { Prefer: 'return=representation' },
    body: JSON.stringify({
      status: approve ? 'approved' : 'rejected',
      rejection_codes: approve ? [] : cleanCodes,
      note: cleanNote,
      decided_at: new Date().toISOString(),
      decided_by: admin,
    }),
  });
  const app = rows[0];
  if (!app) throw new StoreError(409, 'That application was already decided.');

  if (approve) {
    const [user] = await rest(`users?id=eq.${q(app.user_id)}&select=roles`);
    const roles = [...new Set([...(user?.roles || ['player']), 'developer'])];
    await rest(`users?id=eq.${q(app.user_id)}`, {
      method: 'PATCH',
      headers: { Prefer: 'return=minimal' },
      body: JSON.stringify({ roles, updated_at: new Date().toISOString() }),
    });
  }
  await rest(`dev_profiles?user_id=eq.${q(app.user_id)}`, {
    method: 'PATCH',
    headers: { Prefer: 'return=minimal' },
    body: JSON.stringify({ status: approve ? 'approved' : 'rejected', updated_at: new Date().toISOString() }),
  });
  await logAdmin(admin, approve ? 'application.approve' : 'application.reject', app.id, { codes: cleanCodes, note: cleanNote });
  return toApplication(app);
}
