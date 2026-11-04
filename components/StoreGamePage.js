import Head from 'next/head';
import Link from 'next/link';
import { useEffect, useState } from 'react';
import PlayerCount, { usePlayerCounts } from './PlayerCount';
import useStoreAccount from './useStoreAccount';
import { AGE_RATINGS } from '../lib/platform/listing';

// A game a developer published on the store: its approved store page, what it costs, and Play / Add to library.
// Adult games show nothing until the visitor has opted in (PLATFORM_SPEC 5.4).

const price = (cents) => (cents ? `$${(cents / 100).toFixed(2)}` : 'Free');

function Actions({ game }) {
  const { account } = useStoreAccount();
  const [owned, setOwned] = useState(null);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState(null);

  useEffect(() => {
    fetch(`/api/store/games?slug=${encodeURIComponent(game.slug)}`, { cache: 'no-store' })
      .then((r) => r.json())
      .then((out) => setOwned(Boolean(out.owned || out.developer)))
      .catch(() => setOwned(false));
  }, [game.slug, account?.id]);

  const add = async () => {
    setBusy(true);
    setMsg(null);
    try {
      const res = await fetch('/api/store/library', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ slug: game.slug }),
      });
      const out = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(out.error || 'Could not add it.');
      setOwned(true);
    } catch (err) {
      setMsg(err.message);
    } finally {
      setBusy(false);
    }
  };

  if (game.status === 'abandoned') return <p className="small muted">Not sold right now.</p>;
  const free = !game.priceUsdCents;
  return (
    <div className="store-actions">
      <p className="store-price">{price(game.priceUsdCents)}</p>
      {free || owned ? (
        <Link href={`/play/${game.slug}`} className="btn btn-primary">
          Play now
        </Link>
      ) : (
        <button className="btn btn-primary" disabled>
          Checkout opens soon
        </button>
      )}
      {free && account && owned === false && (
        <button className="btn btn-ghost" disabled={busy} onClick={add}>
          Add to library
        </button>
      )}
      {owned && <span className="pill">In your library</span>}
      {msg && <p className="error small">{msg}</p>}
    </div>
  );
}

function AdultGate({ slug, children }) {
  const { account, loading } = useStoreAccount();
  const [game, setGame] = useState(null);
  useEffect(() => {
    if (!account?.adultOptIn) return;
    fetch(`/api/store/games?slug=${encodeURIComponent(slug)}`, { cache: 'no-store' })
      .then((r) => r.json())
      .then((out) => setGame(out.game || null));
  }, [slug, account?.adultOptIn]);
  if (loading) return <p className="muted">Loading…</p>;
  if (!account?.adultOptIn) {
    return (
      <div className="gate">
        <h1>Adult content</h1>
        <p className="muted">
          This game is for adults. To see adult games, sign in and turn on adult content in your <Link href="/profile">profile</Link>.
        </p>
      </div>
    );
  }
  return game ? children(game) : <p className="muted">Loading…</p>;
}

export default function StoreGamePage({ game }) {
  if (game.adultGate) {
    return (
      <div className="container page game-page">
        <Head>
          <title>Adult game - Indie Creations</title>
          <meta name="robots" content="noindex, nofollow" />
        </Head>
        <AdultGate slug={game.slug}>{(full) => <Page game={full} />}</AdultGate>
      </div>
    );
  }
  return (
    <div className="container page game-page">
      <Page game={game} />
    </div>
  );
}

function Page({ game }) {
  const counts = usePlayerCounts();
  const [shot, setShot] = useState(null);
  const age = AGE_RATINGS.find((a) => a.key === game.ageRating)?.label;
  return (
    <>
      <Head>
        <title>{`${game.name} - Indie Creations`}</title>
        <meta name="description" content={game.tagline} />
        <meta property="og:title" content={game.name} />
        <meta property="og:description" content={game.tagline} />
        {game.hero && <meta property="og:image" content={game.hero.startsWith('http') ? game.hero : `https://www.indiecreations.fun${game.hero}`} />}
        <meta name="twitter:card" content="summary_large_image" />
        {game.adult && <meta name="robots" content="noindex, nofollow" />}
      </Head>

      {game.status === 'abandoned' && (
        <div className="notice abandoned-banner">
          <p>
            <strong>Abandoned.</strong> The developer stopped updating this game, so it isn&apos;t sold right now. It comes
            back if they ship an update that passes review.
          </p>
        </div>
      )}

      <div className="page-head">
        <div>
          <p className="eyebrow">
            {game.studio} · {game.tags.join(' · ')}
          </p>
          <h1>{game.name}</h1>
          <p className="muted">{game.tagline}</p>
          <PlayerCount slug={game.slug} counts={counts} />
        </div>
      </div>

      <div className="store-top">
        <div className="store-media">
          <img className="game-hero" src={shot || game.hero} alt="" />
          <div className="store-thumbs">
            {[game.hero, ...game.screenshots].map((s) => (
              <button key={s} className={`store-thumb ${(shot || game.hero) === s ? 'store-thumb-on' : ''}`} onClick={() => setShot(s)}>
                <img src={s} alt="" loading="lazy" />
              </button>
            ))}
          </div>
        </div>
        <aside className="card store-side">
          <Actions game={game} />
          <dl className="store-facts">
            <div>
              <dt>Developer</dt>
              <dd>{game.studio}</dd>
            </div>
            <div>
              <dt>Age rating</dt>
              <dd>{age}</dd>
            </div>
            <div>
              <dt>Plays in</dt>
              <dd>{game.browsers.join(', ')}</dd>
            </div>
            {game.lastUpdateAt && (
              <div>
                <dt>Updated</dt>
                <dd>{new Date(game.lastUpdateAt).toLocaleDateString()}</dd>
              </div>
            )}
          </dl>
          {game.trailerUrl && (
            <a href={game.trailerUrl} target="_blank" rel="noreferrer nofollow" className="small">
              Watch the trailer
            </a>
          )}
        </aside>
      </div>

      <div className="game-about">
        <div className="game-copy store-description">
          {game.description.split(/\n{2,}/).map((p, i) => (
            <p key={i}>{p}</p>
          ))}
          {game.aiDisclosure && <p className="muted small">AI-generated content: {game.aiDisclosure}</p>}
        </div>
      </div>
    </>
  );
}
