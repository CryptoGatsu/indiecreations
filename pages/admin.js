import { useCallback, useEffect, useState } from 'react';
import Head from 'next/head';
import { erc20Abi, formatEther, formatUnits, isAddress, parseUnits } from 'viem';
import { useAccount, useSignMessage, useSwitchChain, useWaitForTransactionReceipt, useWriteContract } from 'wagmi';
import ConnectButton from '../components/ConnectButton';
import { dollars } from '../components/EconomyStats';
import { buildAdminSignInMessage } from '../lib/authMessage';
import { LINKS, TOKEN_ADDRESS, TOKEN_TICKER, robinhoodChain, shortAddress } from '../lib/config';
import { revshareAbi } from '../lib/revshare';

// Studio admin: holder payouts, treasury approval, the payout wallet, the daily job, shop orders and playtest
// downloads. Only wallets on the admin list (lib/admin.js) get past the sign-in; on-chain actions are signed by the
// connected wallet itself, so approving and replacing the payout wallet need the treasury wallet connected.

const tokens = (raw, d = 18, digits = 2) =>
  Number(formatUnits(BigInt(raw || 0), d)).toLocaleString('en-US', { maximumFractionDigits: digits });
const when = (t) => (t ? new Date(typeof t === 'number' ? t * 1000 : t).toLocaleString('en-US', { dateStyle: 'medium', timeStyle: 'short' }) : '—');
const addr = (a) => (a ? <a href={`${LINKS.explorer}/address/${a}`} target="_blank" rel="noreferrer" className="mono">{shortAddress(a)}</a> : '—');
const tx = (h) => (h ? <a href={`${LINKS.explorer}/tx/${h}`} target="_blank" rel="noreferrer" className="mono">{h.slice(0, 10)}…</a> : '—');
const same = (a, b) => Boolean(a && b && a.toLowerCase() === b.toLowerCase());

function SignIn({ onSignedIn }) {
  const { address, isConnected } = useAccount();
  const { signMessageAsync } = useSignMessage();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(null);

  const signIn = async () => {
    setBusy(true);
    setError(null);
    try {
      const issuedAt = new Date().toISOString();
      const signature = await signMessageAsync({ message: buildAdminSignInMessage(address, issuedAt) });
      const res = await fetch('/api/admin/signin', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ address, issuedAt, signature }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error || 'Sign-in failed.');
      onSignedIn();
    } catch (err) {
      setError(err.shortMessage || err.message);
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="gate">
      <h1>Studio admin</h1>
      <p className="muted">Connect a studio wallet (the treasury or the dev wallet) and sign a free message. No transaction.</p>
      {isConnected ? (
        <button className="btn btn-primary" onClick={signIn} disabled={busy}>
          {busy ? 'Check your wallet…' : `Sign in as ${shortAddress(address)}`}
        </button>
      ) : (
        <ConnectButton />
      )}
      {error && <p className="error small">{error}</p>}
    </div>
  );
}

// Sends one on-chain call from the connected wallet and reports when it is mined.
function useChainAction(onDone) {
  const { chainId } = useAccount();
  const { switchChainAsync } = useSwitchChain();
  const { writeContractAsync } = useWriteContract();
  const [hash, setHash] = useState(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(null);
  const { isSuccess, isError } = useWaitForTransactionReceipt({ hash, chainId: robinhoodChain.id });

  useEffect(() => {
    if (isSuccess || isError) {
      setBusy(false);
      if (isSuccess) onDone?.();
      if (isError) setError('The transaction failed on-chain.');
    }
  }, [isSuccess, isError]); // eslint-disable-line react-hooks/exhaustive-deps

  const send = async (call) => {
    setBusy(true);
    setError(null);
    setHash(null);
    try {
      if (chainId !== robinhoodChain.id) await switchChainAsync({ chainId: robinhoodChain.id });
      setHash(await writeContractAsync({ ...call, chainId: robinhoodChain.id }));
    } catch (err) {
      setError(err.shortMessage || 'Cancelled.');
      setBusy(false);
    }
  };
  return { send, busy, error, hash, done: isSuccess };
}

// The transaction link as soon as it is sent, so it can be checked on the explorer even if the wait drags on.
function ActionStatus({ action }) {
  return (
    <>
      {action.hash && !action.done && !action.error && <p className="small">Sent: {tx(action.hash)}. Waiting for it to confirm…</p>}
      {action.done && <p className="small">Done: {tx(action.hash)}</p>}
      {action.error && <p className="error small">{action.error}</p>}
    </>
  );
}

function Warnings({ list }) {
  if (!list?.length) return <div className="notice admin-ok">Everything needed for the next payout is in place.</div>;
  return (
    <div className="admin-warnings">
      {list.map((w) => (
        <p key={w}>⚠ {w}</p>
      ))}
    </div>
  );
}

function Payouts({ s }) {
  const d = s.decimals;
  const next = s.stats?.next;
  const c = s.contract;
  return (
    <section className="card admin-card">
      <h2>Holder payouts</h2>
      <dl className="receipt">
        <div><dt>Contract</dt><dd>{addr(c.address)}</dd></div>
        <div><dt>Holder share</dt><dd>{s.config.percent}% of revenue, from the treasury</dd></div>
        <div><dt>Minimum before a payout</dt><dd>${s.config.minUsd}</dd></div>
        <div><dt>First paying month</dt><dd>{s.config.startMonth || 'not set'}</dd></div>
        {next && <div><dt>Revenue waiting for the next payout</dt><dd>{dollars(next.pendingUsdCents)} of {dollars(next.minUsdCents)}</dd></div>}
        {next && <div><dt>Next payout would take from the treasury</dt><dd>{tokens(next.poolRaw, d)} {TOKEN_TICKER}</dd></div>}
        <div><dt>Last payout published</dt><dd>{when(c.lastPublishedAt)}</dd></div>
        <div><dt>Contract allows the next payout</dt><dd>{c.nextPublishAllowedAt ? when(c.nextPublishAllowedAt) : 'any time'}</dd></div>
        <div><dt>Claimed by holders so far</dt><dd>{tokens(c.totalClaimedRaw, d)} {TOKEN_TICKER}</dd></div>
        <div><dt>Waiting in the contract to be claimed</dt><dd>{tokens(c.heldRaw, d)} {TOKEN_TICKER}</dd></div>
      </dl>
    </section>
  );
}

function Treasury({ s, refresh }) {
  const { address } = useAccount();
  const d = s.decimals;
  const t = s.treasury;
  const isTreasury = same(address, t.address);
  const [amount, setAmount] = useState('5000000');
  const action = useChainAction(refresh);
  const valid = /^\d+(\.\d+)?$/.test(amount);

  const approve = (value) =>
    action.send({ address: TOKEN_ADDRESS, abi: erc20Abi, functionName: 'approve', args: [s.contract.address, value] });

  return (
    <section className="card admin-card">
      <h2>Treasury and approvals</h2>
      <dl className="receipt">
        <div><dt>Treasury</dt><dd>{addr(t.address)}</dd></div>
        <div><dt>Holds</dt><dd>{tokens(t.balanceRaw, d)} {TOKEN_TICKER}</dd></div>
        <div><dt>Approved for payouts</dt><dd>{tokens(t.allowanceRaw, d)} {TOKEN_TICKER}</dd></div>
      </dl>
      <h3>Approve payouts</h3>
      <p className="muted small">
        The payout contract can take at most this much from the treasury, ever, until you approve again. A few months of
        payouts is a sensible amount: top it up when it runs low. Setting it replaces the current amount.
      </p>
      {!s.contract.address ? (
        <p className="muted small">The payout contract is not configured.</p>
      ) : !isTreasury ? (
        <div className="notice">
          <p className="small">Connect the treasury wallet {shortAddress(t.address)} to approve. You are connected as {address ? shortAddress(address) : 'nothing'}.</p>
          <ConnectButton className="btn btn-ghost btn-sm" label="Switch wallet" />
        </div>
      ) : (
        <>
          <div className="admin-row">
            <input className="admin-input" inputMode="decimal" value={amount} onChange={(e) => setAmount(e.target.value.replace(/[, ]/g, ''))} aria-label={`Amount of ${TOKEN_TICKER}`} />
            <span className="muted small">{TOKEN_TICKER}</span>
          </div>
          <div className="admin-row">
            {['1000000', '5000000', '10000000'].map((v) => (
              <button key={v} className="btn btn-ghost btn-sm" onClick={() => setAmount(v)}>
                {Number(v).toLocaleString('en-US')}
              </button>
            ))}
          </div>
          <div className="admin-row">
            <button className="btn btn-primary" disabled={!valid || action.busy} onClick={() => approve(parseUnits(amount, d))}>
              {action.busy ? 'Confirming…' : `Approve ${valid ? Number(amount).toLocaleString('en-US') : ''} ${TOKEN_TICKER}`}
            </button>
            <button className="btn btn-ghost" disabled={action.busy} onClick={() => approve(0n)}>
              Revoke (set to 0)
            </button>
          </div>
        </>
      )}
      <ActionStatus action={action} />
    </section>
  );
}

function Publisher({ s, refresh }) {
  const { address } = useAccount();
  const p = s.publisher;
  const isTreasury = same(address, s.treasury.address);
  const [next, setNext] = useState('');
  const [sure, setSure] = useState(false);
  const action = useChainAction(refresh);

  return (
    <section className="card admin-card">
      <h2>Payout wallet</h2>
      <p className="muted small">The wallet the daily job publishes payouts from. It never holds {TOKEN_TICKER}, only a little ETH for gas.</p>
      <dl className="receipt">
        <div><dt>Wallet (contract owner)</dt><dd>{addr(p.address)}</dd></div>
        <div><dt>ETH for gas</dt><dd>{p.ethWei != null ? Number(formatEther(BigInt(p.ethWei))).toFixed(5) : '—'} ETH</dd></div>
        <div><dt>Key in Vercel</dt><dd>{!p.keySet ? 'missing' : p.keyMatchesOwner ? 'set, matches the owner ✓' : 'set, but for a different wallet ✗'}</dd></div>
      </dl>
      <h3>Replace the payout wallet</h3>
      <p className="muted small">
        Only if its key may have leaked, or to move to a new one. Then put the new wallet&apos;s key in Vercel as
        REVSHARE_PUBLISHER_KEY and redeploy. The treasury can always do this.
      </p>
      {!isTreasury ? (
        <p className="muted small">Connect the treasury wallet to replace it.</p>
      ) : (
        <>
          <input className="admin-input" placeholder="New payout wallet 0x…" value={next} onChange={(e) => setNext(e.target.value.trim())} />
          <label className="small admin-check">
            <input type="checkbox" checked={sure} onChange={(e) => setSure(e.target.checked)} /> I have the new wallet&apos;s key and will put it in Vercel.
          </label>
          <button
            className="btn btn-ghost"
            disabled={!isAddress(next) || !sure || action.busy}
            onClick={() => action.send({ address: s.contract.address, abi: revshareAbi, functionName: 'transferOwnership', args: [next] })}
          >
            {action.busy ? 'Confirming…' : 'Replace payout wallet'}
          </button>
        </>
      )}
      <ActionStatus action={action} />
    </section>
  );
}

function Job({ s, refresh }) {
  const [busy, setBusy] = useState(null);
  const [result, setResult] = useState(null);
  const run = async (dry) => {
    setBusy(dry ? 'dry' : 'run');
    setResult(null);
    try {
      const res = await fetch('/api/admin/run', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ dry }) });
      setResult(await res.json());
      refresh();
    } catch (err) {
      setResult({ error: err.message });
    } finally {
      setBusy(null);
    }
  };
  const i = s.index;
  const r = result?.settle;
  return (
    <section className="card admin-card">
      <h2>Daily job</h2>
      <p className="muted small">Runs by itself every day. Running it here does exactly the same and is safe to repeat.</p>
      <dl className="receipt">
        <div><dt>Transfers copied up to block</dt><dd>{i?.block ?? 'not started'}</dd></div>
        <div><dt>Chain is at block</dt><dd>{i?.head ?? '—'}{i?.behind != null ? ` (${i.behind} behind)` : ''}</dd></div>
        <div><dt>Last run</dt><dd>{when(i?.updatedAt)}</dd></div>
      </dl>
      <div className="admin-row">
        <button className="btn btn-ghost" disabled={!!busy} onClick={() => run(true)}>{busy === 'dry' ? 'Working…' : 'Preview next payout'}</button>
        <button className="btn btn-primary" disabled={!!busy} onClick={() => run(false)}>{busy === 'run' ? 'Running… (up to a few minutes)' : 'Run now'}</button>
      </div>
      {result && (
        <div className="notice admin-result">
          {result.error && <p className="error small">{result.error}</p>}
          {result.index && <p className="small">Copied {result.index.saved} new transfers{result.index.caughtUp ? ', caught up' : ', still catching up (run again)'}.</p>}
          {r?.waiting && <p className="small">Waiting: {r.waiting}</p>}
          {r?.carried && <p className="small">{r.month} carried over: {r.note}</p>}
          {r?.dryRun && (
            <p className="small">
              Preview of {r.month}: {r.status === 'carried' ? `would carry over (${r.note})` : `${tokens(r.paidOutRaw, s.decimals)} ${TOKEN_TICKER} to ${r.holders} holders`}. Nothing saved.
            </p>
          )}
          {r?.published && <p className="small">{r.month} published {r.txHash ? tx(r.txHash) : ''}</p>}
          {r?.error && <p className="error small">{r.error}</p>}
        </div>
      )}
    </section>
  );
}

function Months({ s }) {
  const eps = [...(s.stats?.epochs || [])].reverse();
  return (
    <section className="card admin-card admin-wide">
      <h2>Payout months</h2>
      {!eps.length ? (
        <p className="muted small">No month has closed yet. The first is {s.config.startMonth || 'not set'}.</p>
      ) : (
        <div className="admin-table">
          <div className="admin-tr admin-th"><span>Month</span><span>Revenue</span><span>Status</span><span>Paid</span><span>Holders</span><span>Proof</span></div>
          {eps.map((e) => (
            <div className="admin-tr" key={e.month}>
              <span>{e.month}</span>
              <span>{dollars(e.revenueUsdCents)}</span>
              <span>{e.status}{e.txHash ? <> · {tx(e.txHash)}</> : ''}</span>
              <span>{tokens(e.paidOutRaw, s.decimals, 0)}</span>
              <span>{e.holders}</span>
              <span>{e.root ? <a href={`/api/rewards/tree?month=${e.month}`} target="_blank" rel="noreferrer">tree</a> : '—'}</span>
            </div>
          ))}
        </div>
      )}
    </section>
  );
}

function Orders({ s }) {
  const orders = s.orders || [];
  const paid = orders.filter((o) => o.status === 'paid');
  return (
    <section className="card admin-card admin-wide">
      <h2>Shop orders</h2>
      <p className="muted small">
        Last {orders.length}: {paid.length} paid · revenue all time {dollars(s.stats?.revenue?.usdCents)} ({tokens(s.stats?.revenue?.raw, s.decimals, 0)} {TOKEN_TICKER}), burned {tokens(s.stats?.burned?.raw, s.decimals, 0)}
      </p>
      {!orders.length ? (
        <p className="muted small">No orders yet.</p>
      ) : (
        <div className="admin-table">
          <div className="admin-tr admin-th"><span>When</span><span>Game</span><span>Item</span><span>Price</span><span>Status</span><span>Wallet</span></div>
          {orders.map((o) => (
            <div className="admin-tr" key={o.id}>
              <span>{when(o.paid_at || o.created_at)}</span>
              <span>{o.game}</span>
              <span>{o.item_id}</span>
              <span>{dollars(o.usd_cents)}</span>
              <span>{o.status === 'paid' ? <>paid · {tx(o.tx_hash)}</> : o.status}</span>
              <span>{addr(o.wallet)}</span>
            </div>
          ))}
        </div>
      )}
    </section>
  );
}

function Players({ s }) {
  const rows = Object.entries(s.players || {});
  return (
    <section className="card admin-card admin-wide">
      <h2>Players</h2>
      <p className="muted small">Browsers with a game loaded and in front. At most 3 per internet connection count, so nobody can pad the numbers.</p>
      <div className="admin-table">
        <div className="admin-tr admin-tr-4 admin-th"><span>Game</span><span>Playing now</span><span>Last 24 hours</span><span>Last 30 days</span></div>
        {rows.map(([slug, c]) => (
          <div className="admin-tr admin-tr-4" key={slug}><span>{slug}</span><span>{c.now}</span><span>{c.day}</span><span>{c.month}</span></div>
        ))}
      </div>
    </section>
  );
}

function Downloads({ s }) {
  if (!s.downloads) return null;
  const { build, stats, recent } = s.downloads;
  return (
    <section className="card admin-card admin-wide">
      <h2>Playtest downloads</h2>
      <p className="muted small">
        {build.name} {build.version}: {stats.total} downloads by {stats.holders} holders, {stats.lastDay} in the last day.
      </p>
      {recent?.length > 0 && (
        <div className="admin-table">
          {recent.map((r, i) => (
            <div className="admin-tr admin-tr-2" key={i}><span>{when(r.date)}</span><span>{addr(r.wallet)}</span></div>
          ))}
        </div>
      )}
    </section>
  );
}

export default function Admin() {
  const [mounted, setMounted] = useState(false);
  const [status, setStatus] = useState(undefined); // undefined: loading, null: signed out
  const [error, setError] = useState(null);

  const load = useCallback(async () => {
    try {
      const res = await fetch('/api/admin/status');
      if (res.status === 401) return setStatus(null);
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Could not load.');
      setError(null);
      setStatus(data);
    } catch (err) {
      setError(err.message);
    }
  }, []);

  useEffect(() => {
    setMounted(true);
    load();
  }, [load]);

  const signOut = async () => {
    await fetch('/api/admin/signout', { method: 'POST' });
    setStatus(null);
  };

  return (
    <div className="container page">
      <Head>
        <title>Studio admin · Indie Creations</title>
        <meta name="robots" content="noindex, nofollow" />
      </Head>
      {!mounted || status === undefined ? (
        <p className="muted">Loading…</p>
      ) : status === null ? (
        <SignIn onSignedIn={load} />
      ) : (
        <>
          <div className="page-head">
            <div>
              <p className="eyebrow">Studio admin</p>
              <h1>Payouts and the shop</h1>
              <p className="muted small">Signed in as {shortAddress(status.admin)}. <button className="link-button" onClick={signOut}>Sign out</button> · <button className="link-button" onClick={load}>Refresh</button></p>
            </div>
          </div>
          {error && <p className="error small">{error}</p>}
          <Warnings list={status.warnings} />
          <div className="admin-grid">
            <Payouts s={status} />
            <Treasury s={status} refresh={load} />
            <Job s={status} refresh={load} />
            <Publisher s={status} refresh={load} />
            <Players s={status} />
            <Months s={status} />
            <Orders s={status} />
            <Downloads s={status} />
          </div>
          <p className="muted small admin-foot">
            Admin wallets: {status.config.admins.map((a) => shortAddress(a)).join(', ')}. Add more with ADMIN_WALLETS in Vercel.
          </p>
        </>
      )}
    </div>
  );
}
