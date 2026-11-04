import { useCallback, useEffect, useState } from 'react';
import { APPLICATION_REASONS, RULES } from '../lib/platform/guidelines';
import { AGE_RATINGS } from '../lib/platform/listing';
import { shortAddress } from '../lib/config';

// The studio's store queues on /admin: developer applications, game builds, and the adult lane (PLATFORM_SPEC 15).
// Approve in one click, or turn down with the codes that apply and an optional note; every decision is logged.

function Decide({ kind, id, reasons, onDone }) {
  const [codes, setCodes] = useState([]);
  const [note, setNote] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(null);
  const decide = async (approve) => {
    setBusy(true);
    setError(null);
    try {
      const res = await fetch('/api/admin/store', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ kind, id, approve, codes, note }),
      });
      const out = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(out.error || 'Could not save the decision.');
      onDone();
    } catch (err) {
      setError(err.message);
      setBusy(false);
    }
  };
  return (
    <div className="review-decide">
      <div className="review-codes">
        {reasons.map((r) => (
          <label key={r.code} className="small" title={r.body}>
            <input
              type="checkbox"
              checked={codes.includes(r.code)}
              onChange={() => setCodes((c) => (c.includes(r.code) ? c.filter((x) => x !== r.code) : [...c, r.code]))}
            />{' '}
            {r.code} {r.title}
          </label>
        ))}
      </div>
      <textarea rows={2} placeholder="Note for the developer (optional)" value={note} maxLength={2000} onChange={(e) => setNote(e.target.value)} />
      <div className="admin-row">
        <button className="btn btn-primary btn-sm" disabled={busy} onClick={() => decide(true)}>
          Approve
        </button>
        <button className="btn btn-ghost btn-sm" disabled={busy || !codes.length} onClick={() => decide(false)}>
          Turn down{codes.length ? ` (${codes.join(', ')})` : ''}
        </button>
        {error && <span className="error small">{error}</span>}
      </div>
    </div>
  );
}

function Application({ a, reload }) {
  return (
    <div className="review-item">
      <div className="review-head">
        <strong>{a.profile.studioName}</strong>
        <span className="muted small">
          {a.account.email || 'no email'} · applied {new Date(a.createdAt).toLocaleString()}
          {a.resubmission ? ' · free resubmission' : ''}
        </span>
      </div>
      <p className="small">{a.profile.pastWork}</p>
      <p className="small">
        {a.profile.links.map((l) => (
          <a key={l} href={l} target="_blank" rel="noreferrer nofollow" className="review-link">
            {l}
          </a>
        ))}
      </p>
      <p className="muted small">
        Contact {a.profile.contactEmail} · payout {shortAddress(a.profile.payoutWalletEvm)} · wallets{' '}
        {a.account.wallets.map((w) => `${w.chain === 'evm' ? shortAddress(w.address) : w.address.slice(0, 6) + '…'} (${w.type})`).join(', ')}
        {a.burnTx ? ` · burn ${a.burnTx.slice(0, 10)}…` : ''}
      </p>
      <Decide kind="application" id={a.id} reasons={APPLICATION_REASONS} onDone={reload} />
    </div>
  );
}

function Build({ b, reload }) {
  const [playing, setPlaying] = useState(false);
  const l = b.listing;
  return (
    <div className="review-item">
      <div className="review-head">
        <strong>
          {l.title} <span className="muted">version {b.version}</span>
        </strong>
        <span className="muted small">
          {b.studio || 'unknown studio'} · {b.isUpdate ? 'update to a live game' : 'new game'} · /{b.game?.slug} · sent{' '}
          {new Date(b.submittedAt).toLocaleString()}
        </span>
      </div>
      <div className="review-listing">
        {l.capsule && <img src={l.capsule} alt="" className="review-capsule" />}
        <div>
          <p className="small">
            <strong>{l.tagline}</strong>
          </p>
          <p className="small review-desc">{l.description}</p>
          <p className="muted small">
            {l.priceUsdCents ? `$${(l.priceUsdCents / 100).toFixed(2)}` : 'Free'} · {AGE_RATINGS.find((a) => a.key === l.ageRating)?.label} ·{' '}
            {l.tags.join(', ')} · works in {l.browsers.join(', ')}
            {l.aiDisclosure ? ` · AI: ${l.aiDisclosure}` : ' · no AI disclosed'}
            {l.adult ? ` · ADULT${l.adultDeclaration ? ' (all characters declared adult)' : ''}` : ''}
            {l.trailerUrl ? (
              <>
                {' · '}
                <a href={l.trailerUrl} target="_blank" rel="noreferrer nofollow">
                  trailer
                </a>
              </>
            ) : null}
          </p>
        </div>
      </div>
      <div className="review-shots">
        {l.screenshots.map((s) => (
          <a key={s} href={s} target="_blank" rel="noreferrer">
            <img src={s} alt="" />
          </a>
        ))}
      </div>
      <p className="small">
        {b.fileCount} files, {(b.sizeBytes / 1048576).toFixed(1)} MB ·{' '}
        <button className="link-button" onClick={() => setPlaying((p) => !p)}>
          {playing ? 'Close the game' : 'Play it here'}
        </button>{' '}
        ·{' '}
        <a href={b.entryUrl} target="_blank" rel="noreferrer">
          open in a new tab
        </a>
      </p>
      {playing && (
        <iframe
          className="review-frame"
          src={b.entryUrl}
          title={l.title}
          sandbox="allow-scripts allow-same-origin allow-pointer-lock"
          allow="fullscreen; gamepad; autoplay"
        />
      )}
      <Decide kind="build" id={b.id} reasons={RULES} onDone={reload} />
    </div>
  );
}

export default function StoreReview() {
  const [data, setData] = useState(null);
  const [error, setError] = useState(null);
  const [tab, setTab] = useState('builds');
  const load = useCallback(() => {
    fetch('/api/admin/store', { cache: 'no-store' })
      .then(async (r) => {
        const out = await r.json();
        if (!r.ok) throw new Error(out.error || 'Could not load the store queues.');
        setData(out);
        setError(null);
      })
      .catch((err) => setError(err.message));
  }, []);
  useEffect(load, [load]);

  const tabs = [
    ['applications', `Developer applications (${data?.applications.length ?? '…'})`],
    ['builds', `Game builds (${data?.builds.length ?? '…'})`],
    ['adult', `Adult lane (${data?.adultBuilds.length ?? '…'})`],
    ['log', 'Burns and decisions'],
  ];

  return (
    <section className="card admin-card admin-wide store-review">
      <h2>Store review</h2>
      {data?.network?.testnet && <p className="muted small">The store runs on {data.network.chainName}: burns are test burns.</p>}
      <div className="shop-chips">
        {tabs.map(([key, label]) => (
          <button key={key} className={`shop-sort-btn ${tab === key ? 'shop-sort-btn-on' : ''}`} onClick={() => setTab(key)}>
            {label}
          </button>
        ))}
        <button className="link-button small" onClick={load}>
          Refresh
        </button>
      </div>
      {error && <p className="error small">{error}</p>}
      {data && tab === 'applications' && (
        data.applications.length ? data.applications.map((a) => <Application key={a.id} a={a} reload={load} />) : <p className="muted small">No applications waiting.</p>
      )}
      {data && tab === 'builds' && (data.builds.length ? data.builds.map((b) => <Build key={b.id} b={b} reload={load} />) : <p className="muted small">No builds waiting.</p>)}
      {data && tab === 'adult' && (
        <>
          <p className="muted small">
            Stricter checks on every build and patch. Never approvable: sexual content involving minors or characters who look
            or read as minors, real people or deepfakes, non-consensual sexual content.
          </p>
          {data.adultBuilds.length ? data.adultBuilds.map((b) => <Build key={b.id} b={b} reload={load} />) : <p className="muted small">No adult builds waiting.</p>}
        </>
      )}
      {data && tab === 'log' && (
        <div className="admin-table">
          <p className="small">
            <strong>Burns</strong>
          </p>
          {data.burns.length ? (
            data.burns.map((x) => (
              <p key={x.id} className="small muted">
                {new Date(x.createdAt).toLocaleString()} · {x.purpose === 'dev_apply' ? 'developer application' : 'new game'} · ${x.usd} from{' '}
                {shortAddress(x.from)} · tx {x.tx.slice(0, 12)}… {x.used ? '' : '(not used yet)'}
              </p>
            ))
          ) : (
            <p className="muted small">No burns yet.</p>
          )}
          <p className="small">
            <strong>Decisions</strong>
          </p>
          {data.log.length ? (
            data.log.map((x) => (
              <p key={x.id} className="small muted">
                {new Date(x.created_at).toLocaleString()} · {shortAddress(x.actor)} · {x.action} · {x.details?.codes?.join(', ') || ''}{' '}
                {x.details?.note || ''}
              </p>
            ))
          ) : (
            <p className="muted small">No decisions yet.</p>
          )}
        </div>
      )}
    </section>
  );
}
