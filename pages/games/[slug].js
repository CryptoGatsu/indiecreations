import Head from 'next/head';
import Link from 'next/link';
import { GAMES, findGame } from '../../lib/games';
import { TOKEN_TICKER } from '../../lib/config';

export async function getStaticPaths() {
  return { paths: GAMES.map((g) => ({ params: { slug: g.slug } })), fallback: false };
}

export async function getStaticProps({ params }) {
  return { props: { game: findGame(params.slug) } };
}

export default function GamePage({ game }) {
  const shopHref = `/shop?game=${game.slug}`;
  return (
    <>
      <Head>
        <title>{game.name} - Indie Creations</title>
        <meta name="description" content={game.tagline} />
        <meta property="og:title" content={game.name} />
        <meta property="og:description" content={game.tagline} />
        <meta property="og:image" content={`https://www.indiecreations.fun${game.hero}`} />
        <meta name="twitter:card" content="summary_large_image" />
      </Head>

      <div className="container page game-page">
        <div className="page-head">
          <div>
            <p className="eyebrow">{game.status}</p>
            <h1>{game.name}</h1>
            <p className="muted">{game.tagline}</p>
          </div>
          <div className="actions">
            <Link href={shopHref} className="btn btn-primary">
              Cosmetics
            </Link>
            {game.steam ? (
              <a className="btn btn-ghost" href={game.steam} target="_blank" rel="noreferrer">
                Steam
              </a>
            ) : (
              <span className="pill">Steam page coming</span>
            )}
          </div>
        </div>

        <img className="game-hero" src={game.hero} alt="" />

        <div className="game-about">
          <div className="game-copy">
            {game.blurb.map((p, i) => (
              <p key={i}>{p}</p>
            ))}
            <p className="muted small">{game.players}</p>
          </div>

          <aside className="card game-shop-card">
            <span className="card-index">Shop</span>
            <h3>Hats, outfits, tool skins, titles, emotes</h3>
            <p className="muted">
              Priced in dollars, paid in {TOKEN_TICKER}, tied to your Steam account. None of it changes how the game
              plays.
            </p>
            <Link href={shopHref} className="btn btn-primary">
              Open the {game.name} shop
            </Link>
          </aside>
        </div>

        <div className="shots">
          {game.shots.map((s) => (
            <figure key={s.src}>
              <img src={s.src} alt={s.alt} loading="lazy" />
              <figcaption className="muted small">{s.alt}</figcaption>
            </figure>
          ))}
        </div>
      </div>
    </>
  );
}
