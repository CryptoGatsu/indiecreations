import Link from 'next/link';
import TokenSection from '../components/TokenSection';
import { TOKEN_TICKER, MIN_TOKENS } from '../lib/config';
import { GAMES } from '../lib/games';
import GameCard from '../components/GameCard';

const PERKS = [
  {
    title: 'One coin, every game',
    body: `${TOKEN_TICKER} is the currency of the whole studio. Every Indie Creations game runs on the same coin, so what you hold works in the game you play today and every game we ship after it.`,
  },
  {
    title: 'Cosmetics everywhere',
    body: `Hats, outfits, tool skins, armour finishes, emotes and banners are all bought with ${TOKEN_TICKER}. Shop items are priced in dollars, paid at the live price and tied to your Steam account. Cosmetics are for looking good, never for winning.`,
  },
  {
    title: 'In the game, every day',
    body: `${TOKEN_TICKER} is spent inside the games, not just held. In Agentacus, lanistas stake it on their gladiators and spectators bet from the stands, and half of every losing bet is burned. The beta runs on testnet for now.`,
  },
  {
    title: 'Playtest access',
    body: `Hold ${MIN_TOKENS.toLocaleString('en-US')} ${TOKEN_TICKER} to get into the playtest area and play builds while they are still being made.`,
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
            <h1>Indie games that share one coin.</h1>
            <p className="lead">
              Indie Creations is an independent studio making a family of games that all run on{' '}
              {TOKEN_TICKER}. Spend it on cosmetics and in-game play across every title, and hold it
              to get into playtests, review builds and play each release free. Half of the total
              supply is locked.
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
          <p className="eyebrow">What {TOKEN_TICKER} is for</p>
          <h2>The coin behind every game we make.</h2>
          <p className="lead">
            {TOKEN_TICKER} is first of all the everyday coin of the Indie Creations ecosystem: what
            players spend on cosmetics and in-game across all of our games. Holding it also gets you
            into the studio itself, from early playtests to free releases.
          </p>
          <div className="grid-3">
            {PERKS.map((perk, i) => (
              <div className="card" key={perk.title}>
                <span className="card-index">0{i + 1}</span>
                <h3>{perk.title}</h3>
                <p className="muted">{perk.body}</p>
              </div>
            ))}
          </div>

          <dl className="facts">
            <div>
              <dt>Total supply</dt>
              <dd>1,000,000,000</dd>
            </div>
            <div>
              <dt>Locked</dt>
              <dd>50% of supply</dd>
            </div>
            <div>
              <dt>Locked on</dt>
              <dd>Hoodlock</dd>
            </div>
            <div>
              <dt>Locked until</dt>
              <dd>Dec 2026</dd>
            </div>
          </dl>
        </div>
      </section>

      <TokenSection />
    </>
  );
}
