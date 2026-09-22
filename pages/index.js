import Link from 'next/link';
import TokenSection from '../components/TokenSection';
import { TOKEN_TICKER } from '../lib/config';
import { GAMES } from '../lib/games';
import GameCard from '../components/GameCard';

const PERKS = [
  {
    title: 'Playtest access',
    body: 'Holders get into the playtest area and play builds while they are still being made.',
  },
  {
    title: 'Reviews that matter',
    body: 'Rate each build and leave feedback. Holder reviews decide what gets fixed and built next.',
  },
  {
    title: 'Every game, free',
    body: 'When a game ships, holders play it free. One bag, the whole catalogue.',
  },
];

// Decorative 5x5 board echoing the logo mark. 1 = ink tile.
const BOARD = [0, 1, 0, 0, 1, 1, 0, 1, 0, 0, 0, 1, 1, 0, 1, 0, 0, 1, 1, 0, 1, 0, 0, 1, 0];

export default function Home() {
  return (
    <>
      {/* HERO */}
      <section className="hero">
        <div className="container hero-inner">
          <div className="hero-copy">
            <span className="pill">
              <span className="dot" />
              Live on Robinhood Chain
            </span>
            <h1>Indie games, shaped by the people who hold them.</h1>
            <p className="lead">
              Indie Creations is a tokenized indie game studio. Hold {TOKEN_TICKER} to get into
              playtests, review every build, and play each release free.
            </p>
            <div className="actions">
              <Link href="/playtest" className="btn btn-primary">
                Enter playtest
              </Link>
              <Link href="/token" className="btn btn-ghost">
                Get {TOKEN_TICKER}
              </Link>
            </div>
          </div>

          <div className="board" aria-hidden="true">
            {BOARD.map((on, i) => (
              <span key={i} className={on ? 'tile tile-on' : 'tile'} />
            ))}
          </div>
        </div>
      </section>

      {/* GAMES */}
      <section className="section">
        <div className="container">
          <p className="eyebrow">In the studio now</p>
          <h2>What we&apos;re making.</h2>
          <div className="games-grid">
            {GAMES.map((game) => (
              <GameCard game={game} key={game.slug} />
            ))}
          </div>
        </div>
      </section>

      {/* HOLDER PERKS */}
      <section className="section">
        <div className="container">
          <p className="eyebrow">What holders get</p>
          <h2>Hold {TOKEN_TICKER}. Get a seat in the studio.</h2>
          <div className="grid-3">
            {PERKS.map((perk, i) => (
              <div className="card" key={perk.title}>
                <span className="card-index">0{i + 1}</span>
                <h3>{perk.title}</h3>
                <p className="muted">{perk.body}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      <TokenSection />
    </>
  );
}
