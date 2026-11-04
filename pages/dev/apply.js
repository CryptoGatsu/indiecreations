import Head from 'next/head';
import Link from 'next/link';
import { useRouter } from 'next/router';
import { useState } from 'react';
import StoreGate from '../../components/StoreGate';
import BurnStep from '../../components/BurnStep';
import { useDevState } from '../../components/devShared';
import { shortAddress } from '../../lib/config';

// Apply to publish on the store: a studio profile and a $50 $CREATIONS burn (PLATFORM_SPEC section 4).

export default function Apply() {
  return (
    <div className="container page">
      <Head>
        <title>Apply - Indie Creations developers</title>
      </Head>
      <StoreGate title="Apply to publish">{(account) => <ApplyForm account={account} />}</StoreGate>
    </div>
  );
}

function ApplyForm({ account }) {
  const router = useRouter();
  const { state, error } = useDevState();
  const last = state?.application?.profile;
  const [form, setForm] = useState(null);
  const [burn, setBurn] = useState(null);
  const [status, setStatus] = useState(null);
  const [busy, setBusy] = useState(false);

  if (error) return <p className="error">{error}</p>;
  if (!state) return <p className="muted">Loading…</p>;
  if (state.isDeveloper || !state.canApply) {
    return (
      <div className="gate">
        <h1>{state.isDeveloper ? "You're a developer." : 'Your application is in review.'}</h1>
        <Link href="/dev" className="btn btn-primary">
          Go to your dashboard
        </Link>
      </div>
    );
  }

  const f = form || {
    studioName: last?.studioName || '',
    links: last?.links?.length ? [...last.links, ''].slice(0, 5) : ['', ''],
    contactEmail: last?.contactEmail || account.email || '',
    pastWork: last?.pastWork || '',
    payoutWalletEvm: last?.payoutWalletEvm || account.primaryWallet || '',
  };
  const set = (k, v) => setForm({ ...f, [k]: v });
  const evm = account.wallets.filter((w) => w.chain === 'evm');
  const burnReady = !state.needsBurn || state.unusedBurn || burn;

  const submit = async (e) => {
    e.preventDefault();
    setBusy(true);
    setStatus(null);
    try {
      const res = await fetch('/api/dev/apply', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ form: { ...f, links: f.links.filter(Boolean) }, burn }),
      });
      const out = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(out.error || 'Could not send the application.');
      router.push('/dev');
    } catch (err) {
      setStatus(err.message);
      setBusy(false);
    }
  };

  return (
    <>
      <div className="page-head">
        <div>
          <p className="eyebrow">Developers</p>
          <h1>Apply to publish.</h1>
          <p className="muted">
            Tell the studio who you are and what you make. Approval turns your account into a developer account.{' '}
            <Link href="/developers">How publishing works</Link>
          </p>
        </div>
      </div>
      <form className="dev-form" onSubmit={submit}>
        <div className="card profile-form">
          <label className="field">
            <span>Studio or developer name</span>
            <input className="admin-input" value={f.studioName} maxLength={60} onChange={(e) => set('studioName', e.target.value)} />
          </label>
          <div className="field">
            <span>Links to your work (portfolio, itch.io, Steam, GitHub, socials)</span>
            {f.links.map((l, i) => (
              <input
                key={i}
                className="admin-input"
                placeholder="https://"
                value={l}
                onChange={(e) => set('links', f.links.map((x, j) => (j === i ? e.target.value : x)))}
              />
            ))}
            {f.links.length < 5 && (
              <button type="button" className="link-button small" onClick={() => set('links', [...f.links, ''])}>
                Add a link
              </button>
            )}
          </div>
          <label className="field">
            <span>Contact email</span>
            <input className="admin-input" type="email" value={f.contactEmail} onChange={(e) => set('contactEmail', e.target.value)} />
          </label>
          <label className="field">
            <span>
              Past work <span className="muted small">{f.pastWork.length}/2000</span>
            </span>
            <textarea
              rows={5}
              maxLength={2000}
              placeholder="Games you've made or worked on, and what you plan to publish here."
              value={f.pastWork}
              onChange={(e) => set('pastWork', e.target.value)}
            />
          </label>
          <label className="field">
            <span>Payout wallet (Robinhood Chain)</span>
            <select className="admin-input" value={f.payoutWalletEvm} onChange={(e) => set('payoutWalletEvm', e.target.value)}>
              {evm.map((w) => (
                <option key={w.address} value={w.address}>
                  {shortAddress(w.address)} ({w.type === 'embedded' ? 'made for you' : 'linked'})
                </option>
              ))}
            </select>
            <span className="muted small">Your 80% of every sale is paid here. Only wallets linked to your account can be used.</span>
          </label>
        </div>

        {state.needsBurn && !state.unusedBurn ? (
          burn ? (
            <p className="notice small">Burn confirmed. Send your application below.</p>
          ) : (
            <BurnStep purpose="dev_apply" usd={state.burnUsd.dev_apply} account={account} network={state.network} onDone={setBurn} />
          )
        ) : (
          <p className="notice small">
            {state.unusedBurn
              ? 'You already have a confirmed burn waiting: it will be used for this application.'
              : 'This resubmission is free.'}
          </p>
        )}

        <div className="admin-row">
          <button className="btn btn-primary" type="submit" disabled={busy || !burnReady}>
            {busy ? 'Sending…' : 'Send application'}
          </button>
          {status && <span className="error small">{status}</span>}
        </div>
      </form>
    </>
  );
}
