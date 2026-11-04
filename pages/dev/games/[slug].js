import Head from 'next/head';
import Link from 'next/link';
import { useRouter } from 'next/router';
import { useCallback, useEffect, useState } from 'react';
import StoreGate from '../../../components/StoreGate';
import { BUILD_STATUS, Codes } from '../../../components/devShared';
import { AGE_RATINGS, BROWSERS, TAGS, listingProblems } from '../../../lib/platform/listing';
import { buildPrefix, mediaPrefix, extOf } from '../../../lib/platform/files';
import { checkImage, eachLimit, randomName, readBuildZip, uploadFile } from '../../../lib/platform/uploadClient';

// One game for its developer: the store page and build of the version being worked on, sending it for review,
// and the history of every version with the reviewer's codes and notes.

export default function GameEditor() {
  const { query } = useRouter();
  return (
    <div className="container page">
      <Head>
        <title>Edit game - Indie Creations developers</title>
      </Head>
      <StoreGate title="Your game">{() => (query.slug ? <Editor slug={query.slug} /> : null)}</StoreGate>
    </div>
  );
}

async function api(slug, method, body) {
  const res = await fetch(`/api/dev/games/${slug}`, {
    method,
    headers: { 'Content-Type': 'application/json' },
    body: body ? JSON.stringify(body) : undefined,
  });
  const out = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(out.error || 'Something went wrong.');
  return out;
}

function Editor({ slug }) {
  const [data, setData] = useState(null);
  const [error, setError] = useState(null);
  const load = useCallback(() => {
    api(slug, 'GET')
      .then(setData)
      .catch((err) => setError(err.message));
  }, [slug]);
  useEffect(load, [load]);

  if (error) return <p className="error">{error}</p>;
  if (!data) return <p className="muted">Loading…</p>;
  const { game, builds, storage } = data;
  const open = builds.find((b) => b.status === 'draft' || b.status === 'submitted');
  const latest = builds[0];
  const title = game.listing?.title || latest?.listing?.title || game.slug;

  return (
    <>
      <div className="page-head">
        <div>
          <p className="eyebrow">
            <Link href="/dev">Developer dashboard</Link> / {game.slug}
          </p>
          <h1>{title}</h1>
          <p className="muted">
            {game.status === 'live' ? (
              <>
                On the store: <Link href={`/games/${game.slug}`}>indiecreations.fun/games/{game.slug}</Link>
              </>
            ) : (
              'Not on the store yet. It appears once a version is approved.'
            )}
          </p>
        </div>
      </div>

      {latest?.status === 'rejected' && !open && (
        <div className="card review-result">
          <span className="pill">Version {latest.version}: changes needed</span>
          <Codes codes={latest.rejectionCodes} />
          {latest.reviewerNotes && <p className="notice small">Reviewer: {latest.reviewerNotes}</p>}
        </div>
      )}

      {open?.status === 'draft' && <Draft slug={slug} game={game} build={open} storage={storage} reload={load} />}
      {open?.status === 'submitted' && <Waiting slug={slug} build={open} reload={load} />}
      {!open && (
        <div className="card">
          <h3>{game.status === 'live' ? 'Update this game' : 'Try again'}</h3>
          <p className="muted">
            Start a new version: change the store page, upload a new build, and send it for review. Updates are free.
            Players keep the current approved version until the new one passes.
          </p>
          <StartUpdate slug={slug} reload={load} />
        </div>
      )}

      <h2 className="dev-head">Versions</h2>
      <div className="rewards-history">
        {builds.map((b) => (
          <div className="rewards-row" key={b.id}>
            <span>Version {b.version}</span>
            <span className="muted">
              {BUILD_STATUS[b.status]}
              {b.fileCount ? ` · ${b.fileCount} files, ${(b.sizeBytes / 1048576).toFixed(1)} MB` : ''}
              {b.rejectionCodes.length ? ` · ${b.rejectionCodes.join(', ')}` : ''}
            </span>
            <strong>
              {b.submittedAt ? new Date(b.submittedAt).toLocaleDateString() : new Date(b.createdAt).toLocaleDateString()}
            </strong>
          </div>
        ))}
      </div>
    </>
  );
}

function StartUpdate({ slug, reload }) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(null);
  return (
    <div className="admin-row">
      <button
        className="btn btn-primary"
        disabled={busy}
        onClick={async () => {
          setBusy(true);
          try {
            await api(slug, 'POST', { action: 'update' });
            reload();
          } catch (err) {
            setError(err.message);
            setBusy(false);
          }
        }}
      >
        Start a new version
      </button>
      {error && <span className="error small">{error}</span>}
    </div>
  );
}

function Waiting({ slug, build, reload }) {
  const [busy, setBusy] = useState(false);
  return (
    <div className="card">
      <span className="pill">Version {build.version}: in review</span>
      <h3>Sent for review {new Date(build.submittedAt).toLocaleString()}.</h3>
      <p className="muted">The studio checks it against the guidelines. You&apos;ll see the result here.</p>
      <button
        className="btn btn-ghost btn-sm"
        disabled={busy}
        onClick={async () => {
          setBusy(true);
          await api(slug, 'POST', { action: 'withdraw' }).catch(() => {});
          reload();
        }}
      >
        Pull it back to make changes
      </button>
    </div>
  );
}

function Draft({ slug, game, build, storage, reload }) {
  const [listing, setListing] = useState(build.listing);
  const [saved, setSaved] = useState(true);
  const [status, setStatus] = useState(null);
  const [busy, setBusy] = useState(false);
  const problems = listingProblems({ ...listing, title: listing.title || '', tagline: listing.tagline || '', description: listing.description || '' });

  const set = (k, v) => {
    setListing((l) => ({ ...l, [k]: v }));
    setSaved(false);
  };
  const toggle = (k, v) => set(k, listing[k].includes(v) ? listing[k].filter((x) => x !== v) : [...listing[k], v]);

  const save = async (next = listing) => {
    setBusy(true);
    setStatus(null);
    try {
      const out = await api(slug, 'PUT', { listing: next });
      setListing(out.build.listing);
      setSaved(true);
      setStatus({ ok: true, text: 'Saved.' });
      return true;
    } catch (err) {
      setStatus({ text: err.message });
      return false;
    } finally {
      setBusy(false);
    }
  };

  const addImage = async (file, kind) => {
    try {
      const type = checkImage(file);
      setStatus({ text: 'Uploading…', muted: true });
      const ext = extOf(file.name) === 'jpeg' ? 'jpg' : extOf(file.name);
      const url = await uploadFile(storage, `${mediaPrefix(game.id)}${randomName()}.${ext}`, file, type);
      const next = kind === 'capsule' ? { ...listing, capsule: url } : { ...listing, screenshots: [...listing.screenshots, url].slice(0, 10) };
      setListing(next);
      await save(next);
    } catch (err) {
      setStatus({ text: err.message });
    }
  };

  const submit = async () => {
    if (!saved && !(await save())) return;
    setBusy(true);
    setStatus(null);
    try {
      await api(slug, 'POST', { action: 'submit' });
      reload();
    } catch (err) {
      setStatus({ text: err.message });
      setBusy(false);
    }
  };

  const free = !listing.priceUsdCents;
  return (
    <>
      <div className="card profile-form">
        <p className="eyebrow">Version {build.version}: store page</p>
        <label className="field">
          <span>Title</span>
          <input className="admin-input" value={listing.title} maxLength={60} onChange={(e) => set('title', e.target.value)} />
        </label>
        <label className="field">
          <span>Tagline</span>
          <input className="admin-input" value={listing.tagline} maxLength={120} onChange={(e) => set('tagline', e.target.value)} />
        </label>
        <label className="field">
          <span>
            Description <span className="muted small">{listing.description.length}/5000</span>
          </span>
          <textarea rows={8} maxLength={5000} value={listing.description} onChange={(e) => set('description', e.target.value)} />
        </label>
        <div className="field">
          <span>Tags (up to 6)</span>
          <div className="shop-chips profile-favorites">
            {TAGS.map((t) => (
              <button
                type="button"
                key={t}
                aria-pressed={listing.tags.includes(t)}
                className={`shop-sort-btn ${listing.tags.includes(t) ? 'shop-sort-btn-on' : ''}`}
                onClick={() => toggle('tags', t)}
              >
                {t}
              </button>
            ))}
          </div>
        </div>
        <div className="dev-two">
          <label className="field">
            <span>Age rating</span>
            <select className="admin-input" value={listing.ageRating} onChange={(e) => set('ageRating', e.target.value)}>
              {AGE_RATINGS.map((a) => (
                <option key={a.key} value={a.key}>
                  {a.label}
                </option>
              ))}
            </select>
          </label>
          <div className="field">
            <span>Price</span>
            <div className="admin-row">
              <label className="small">
                <input type="checkbox" checked={free} onChange={(e) => set('priceUsdCents', e.target.checked ? 0 : 499)} /> Free
              </label>
              {!free && (
                <>
                  <span>$</span>
                  <input
                    className="admin-input price-input"
                    type="number"
                    min="0.99"
                    max="999.99"
                    step="0.01"
                    value={(listing.priceUsdCents / 100).toFixed(2)}
                    onChange={(e) => set('priceUsdCents', Math.round(Number(e.target.value) * 100))}
                  />
                </>
              )}
            </div>
            {!free && <span className="muted small">Paid games go on sale when checkout opens.</span>}
          </div>
        </div>
        <div className="field">
          <span>Works in</span>
          <div className="admin-row">
            {BROWSERS.map((b) => (
              <label className="small" key={b}>
                <input type="checkbox" checked={listing.browsers.includes(b)} onChange={() => toggle('browsers', b)} /> {b}
              </label>
            ))}
          </div>
        </div>
        <label className="field">
          <span>AI-generated art or audio (Q4: say what, or leave empty)</span>
          <input className="admin-input" value={listing.aiDisclosure} maxLength={500} onChange={(e) => set('aiDisclosure', e.target.value)} />
        </label>
        <label className="field">
          <span>Trailer (YouTube link, optional)</span>
          <input className="admin-input" value={listing.trailerUrl} placeholder="https://youtu.be/…" onChange={(e) => set('trailerUrl', e.target.value)} />
        </label>
        <div className="field">
          <label className="small">
            <input type="checkbox" checked={listing.adult} onChange={(e) => set('adult', e.target.checked)} /> This game has adult
            content (18+). It goes to the adult review lane and is hidden from players who haven&apos;t opted in.
          </label>
          {listing.adult && (
            <label className="small">
              <input type="checkbox" checked={listing.adultDeclaration} onChange={(e) => set('adultDeclaration', e.target.checked)} /> I
              confirm every character in this game is an adult and is shown as one.
            </label>
          )}
        </div>

        <div className="field">
          <span>Cover image (16:9, shown on the store)</span>
          {listing.capsule && <img className="dev-capsule" src={listing.capsule} alt="" />}
          <input type="file" accept="image/png,image/jpeg,image/webp,image/gif" onChange={(e) => e.target.files[0] && addImage(e.target.files[0], 'capsule')} />
        </div>
        <div className="field">
          <span>Screenshots (at least 3, from the real game)</span>
          <div className="dev-shots">
            {listing.screenshots.map((s) => (
              <figure key={s}>
                <img src={s} alt="" />
                <button type="button" className="link-button small" onClick={() => set('screenshots', listing.screenshots.filter((x) => x !== s))}>
                  Remove
                </button>
              </figure>
            ))}
          </div>
          {listing.screenshots.length < 10 && (
            <input type="file" accept="image/png,image/jpeg,image/webp,image/gif" onChange={(e) => e.target.files[0] && addImage(e.target.files[0], 'shot')} />
          )}
        </div>
        <div className="admin-row">
          <button className="btn btn-ghost" disabled={busy || saved} onClick={() => save()}>
            {saved ? 'Saved' : 'Save store page'}
          </button>
          {status && <span className={`small ${status.ok ? '' : status.muted ? 'muted' : 'error'}`}>{status.text}</span>}
        </div>
      </div>

      <BuildUpload slug={slug} game={game} build={build} storage={storage} reload={reload} />

      <div className="card">
        <h3>Send for review</h3>
        {problems.length || !build.entryUrl ? (
          <ul className="code-list muted small">
            {!build.entryUrl && <li>Upload the game build.</li>}
            {problems.map((p) => (
              <li key={p}>{p}</li>
            ))}
          </ul>
        ) : (
          <p className="muted">Everything is in place. The studio reviews it against the guidelines (Q1 to Q8).</p>
        )}
        <button className="btn btn-primary" disabled={busy || problems.length > 0 || !build.entryUrl} onClick={submit}>
          Send version {build.version} for review
        </button>
      </div>
    </>
  );
}

function BuildUpload({ slug, game, build, storage, reload }) {
  const [progress, setProgress] = useState(null);
  const [error, setError] = useState(null);

  const pick = async (file) => {
    setError(null);
    try {
      setProgress({ text: 'Reading the zip…' });
      const { files, size } = await readBuildZip(file);
      const prefix = buildPrefix(game.id, build.id);
      await eachLimit(
        files,
        4,
        (f) => uploadFile(storage, prefix + f.path, f.data, f.contentType),
        (done, total) => setProgress({ text: `Uploading ${done} of ${total} files (${(size / 1048576).toFixed(1)} MB)…`, pct: done / total })
      );
      setProgress({ text: 'Checking the upload…' });
      await api(slug, 'POST', { action: 'finalize' });
      setProgress(null);
      reload();
    } catch (err) {
      setProgress(null);
      setError(err.message);
    }
  };

  return (
    <div className="card">
      <h3>Game build</h3>
      <p className="muted small">
        A zip of your web build with <span className="mono">index.html</span> at the top (Unity WebGL or HTML5). For Unity,
        build with <strong>Decompression Fallback</strong> on (or without compression): the store can&apos;t add the
        special headers compressed Unity builds need. Uploading again replaces this version&apos;s files.
      </p>
      {build.entryUrl && (
        <p className="small">
          Uploaded: {build.fileCount} files, {(build.sizeBytes / 1048576).toFixed(1)} MB.{' '}
          <a href={build.entryUrl} target="_blank" rel="noreferrer">
            Test it
          </a>
        </p>
      )}
      <input type="file" accept=".zip,application/zip" disabled={Boolean(progress)} onChange={(e) => e.target.files[0] && pick(e.target.files[0])} />
      {progress && (
        <div className="upload-progress">
          <div style={{ width: `${Math.round((progress.pct || 0) * 100)}%` }} />
          <span className="small muted">{progress.text}</span>
        </div>
      )}
      {error && <p className="error small">{error}</p>}
    </div>
  );
}
