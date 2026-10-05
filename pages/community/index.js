import { useEffect, useState } from 'react';
import Head from 'next/head';
import Link from 'next/link';
import { shortAddress, TOKEN_TICKER } from '../../lib/config';
import { MIN_CREATOR_TOKENS, tileColors } from '../../lib/creations';

// Community games: made by holders with a prompt (/create), free for anyone to play.
export default function Community() {
  const [sort, setSort] = useState('popular');
  const [games, setGames] = useState(null);

  useEffect(() => {
    setGames(null);
    fetch(`/api/creations?sort=${sort}`)
      .then((r) => r.json())
      .then((d) => setGames(d.games || []))
      .catch(() => setGames([]));
  }, [sort]);

  return (
    <div className="container page">
      <Head>
        <title>Community games · Indie Creations</title>
        <meta name="description" content={`Browser games made by ${TOKEN_TICKER} holders with a single prompt. Free to play.`} />
      </Head>
      <div className="page-head">
        <div>
          <p className="eyebrow">Community</p>
          <h1>Games made by holders.</h1>
          <p className="muted">
            Every game here started as a prompt from a {TOKEN_TICKER} holder and was built by Claude. Free to play in
            your browser. Hold {MIN_CREATOR_TOKENS.toLocaleString('en-US')} {TOKEN_TICKER} to make your own.
          </p>
        </div>
        <Link href="/create" className="btn btn-primary">Make a game</Link>
      </div>

      <div className="shop-tabs creations-sort" role="tablist">
        {[['popular', 'Most played'], ['new', 'Newest']].map(([key, label]) => (
          <button
            key={key}
            role="tab"
            aria-selected={sort === key}
            className={sort === key ? 'shop-tab shop-tab-on' : 'shop-tab'}
            onClick={() => setSort(key)}
          >
            {label}
          </button>
        ))}
      </div>

      {games === null ? (
        <p className="muted">Loading…</p>
      ) : games.length === 0 ? (
        <div className="card empty">
          <p className="muted">No community games yet. Be the first to make one.</p>
          <Link href="/create" className="btn btn-primary btn-sm">Make a game</Link>
        </div>
      ) : (
        <div className="creations-grid">
          {games.map((g) => {
            const c = tileColors(g.id);
            return (
              <Link href={`/community/${g.id}`} key={g.id} className="card creations-card">
                <span className="creations-tile" style={{ background: `linear-gradient(135deg, ${c.from}, ${c.to})` }}>
                  {g.title}
                </span>
                <h3>{g.title}</h3>
                <p className="muted small">{g.description}</p>
                <p className="muted small">
                  by {shortAddress(g.owner)} · {g.plays.toLocaleString('en-US')} plays
                </p>
              </Link>
            );
          })}
        </div>
      )}
    </div>
  );
}
