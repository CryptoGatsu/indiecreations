import Head from 'next/head';
import Link from 'next/link';
import { useEffect, useState } from 'react';
import StoreGate from '../components/StoreGate';

// Your library: every store game on your account (free games you added or played, and games you buy once checkout
// opens). It belongs to your account, not to one wallet.

export default function Library() {
  return (
    <div className="container page">
      <Head>
        <title>Library - Indie Creations</title>
      </Head>
      <StoreGate title="Your library">{() => <Shelf />}</StoreGate>
    </div>
  );
}

function Shelf() {
  const [games, setGames] = useState(null);
  useEffect(() => {
    fetch('/api/store/library', { cache: 'no-store' })
      .then((r) => r.json())
      .then((out) => setGames(out.games || []))
      .catch(() => setGames([]));
  }, []);
  return (
    <>
      <div className="page-head">
        <div>
          <p className="eyebrow">Library</p>
          <h1>Your games.</h1>
          <p className="muted">Everything on your account, ready to play in the browser.</p>
        </div>
      </div>
      {!games ? (
        <p className="muted">Loading…</p>
      ) : !games.length ? (
        <p className="muted">
          Nothing here yet. <Link href="/games">Browse the store</Link> and add a free game, or play one.
        </p>
      ) : (
        <div className="library-grid">
          {games.map((g) => (
            <div className="card library-card" key={g.slug}>
              <Link href={`/games/${g.slug}`}>
                <img src={g.hero} alt="" loading="lazy" />
              </Link>
              <div>
                <h3>{g.name}</h3>
                <p className="muted small">
                  {g.studio}
                  {g.source === 'developer' ? ' · your game' : ''}
                  {g.status === 'abandoned' ? ' · abandoned' : ''}
                </p>
                <Link href={`/play/${g.slug}`} className="btn btn-primary btn-sm">
                  Play
                </Link>
              </div>
            </div>
          ))}
        </div>
      )}
    </>
  );
}
