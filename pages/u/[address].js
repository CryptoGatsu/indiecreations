import { useEffect, useState } from 'react';
import Head from 'next/head';
import Link from 'next/link';
import { useRouter } from 'next/router';
import { isAddress } from 'viem';
import Avatar from '../../components/Avatar';
import { LINKS, TOKEN_TICKER, shortAddress } from '../../lib/config';
import { GAMES } from '../../lib/games';
import { shownName } from '../../lib/profileRules';
import { timeAgo } from '../../components/GameComments';

// Anyone's public profile: picture, name, bio, favourite games, holder badge and recent comments.
export default function PublicProfile() {
  const router = useRouter();
  const address = typeof router.query.address === 'string' ? router.query.address : '';
  const [data, setData] = useState(null);

  useEffect(() => {
    if (!isAddress(address)) return;
    fetch(`/api/profile/${address}`)
      .then((r) => r.json())
      .then(setData)
      .catch(() => setData({ error: true }));
  }, [address]);

  if (router.isReady && !isAddress(address)) {
    return (
      <div className="container page">
        <div className="gate"><h1>No such profile</h1><p className="muted">That is not a wallet address.</p></div>
      </div>
    );
  }
  if (!data) return <div className="container page"><p className="muted">Loading…</p></div>;

  const p = data.profile;
  const name = shownName(p, data.address);
  const favorites = GAMES.filter((g) => p?.favorites?.includes(g.slug));
  const gameName = (slug) => GAMES.find((g) => g.slug === slug)?.name || slug;

  return (
    <div className="container page">
      <Head>
        <title>{`${name} · Indie Creations`}</title>
      </Head>
      <div className="profile-public">
        <Avatar address={data.address} profile={p} size={112} />
        <div>
          <h1>{name}</h1>
          <p className="muted small">
            <a className="mono" href={`${LINKS.explorer}/address/${data.address}`} target="_blank" rel="noreferrer">
              {shortAddress(data.address)}
            </a>
            {data.holder && <span className="pill pill-solid profile-badge">{TOKEN_TICKER} holder</span>}
            {p?.joinedAt && <> · joined {new Date(p.joinedAt).toLocaleDateString('en-US', { month: 'long', year: 'numeric' })}</>}
          </p>
          {p?.bio && <p className="profile-bio">{p.bio}</p>}
        </div>
      </div>

      {favorites.length > 0 && (
        <section className="profile-section">
          <h2>Favourite games</h2>
          <div className="profile-fav-list">
            {favorites.map((g) => (
              <Link key={g.slug} href={`/games/${g.slug}`} className="profile-fav">
                <img src={g.hero} alt="" loading="lazy" />
                <span>♥ {g.name}</span>
              </Link>
            ))}
          </div>
        </section>
      )}

      <section className="profile-section">
        <h2>Comments</h2>
        {data.comments?.length ? (
          <div className="comment-list">
            {data.comments.map((c) => (
              <article className="comment" key={c.id}>
                <div className="comment-meta">
                  <Link href={`/games/${c.game}#comments`}>{gameName(c.game)}</Link>
                  <span className="muted small">{timeAgo(c.createdAt)}</span>
                </div>
                <p className="comment-body">{c.body}</p>
              </article>
            ))}
          </div>
        ) : (
          <p className="muted">No comments yet.</p>
        )}
      </section>
    </div>
  );
}
