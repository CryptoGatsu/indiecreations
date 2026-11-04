import Link from 'next/link';
import TokenSection from '../components/TokenSection';
import { TOKEN_TICKER, MIN_TOKENS } from '../lib/config';
import { GAMES } from '../lib/games';
import { privyEnabled } from '../lib/privyClient';
import GameCard from '../components/GameCard';
import StoreSplit from '../components/StoreSplit';
import EconomyStats, { useEconomyStats } from '../components/EconomyStats';

// How the store works, for each kind of visitor (PLATFORM_SPEC). Store features that aren't open yet say so.
const AUDIENCES = [
  {
    title: 'For players',
    body: `Play indie games right in your browser, nothing to install. Paid games are priced in dollars and paid in stablecoins (USDG on Robinhood Chain, USDC on Solana), and if you haven't played a minute you can get your money back within 72 hours.`,
  },
  {
    title: 'For developers',
    body: 'Publish your web game and keep 80% of every sale, paid out automatically after a 72-hour refund window. Run an in-game shop with no store fee, and launch your own game token if you want one.',
    link: { href: '/developers', label: 'How publishing works' },
  },
  {
    title: 'For holders and curators',
    body: `${TOKEN_TICKER} holders share 2% of every sale. Players who hold ${TOKEN_TICKER} and write real, played-in reviews share another 1% as curators.`,
    link: { href: '/rewards', label: 'Holder rewards' },
  },
];

const PERKS = [
  {
    title: 'Burned to publish',
    body: `Developers burn $50 of ${TOKEN_TICKER} to join the store and another $50 for every new game they submit. Every burn is permanent and counted on the site.`,
  },
  {
    title: 'A share of every sale',
    body: `Once the store opens, 2% of every game sold goes to ${TOKEN_TICKER} holders each month, paid in USDG and weighted by how much each wallet held through the month.`,
  },
  {
    title: 'Curator rewards',
    body: `Hold at least $25 of ${TOKEN_TICKER} and write five qualifying reviews a month, each after real playtime, to share the 1% curator pool.`,
  },
  {
    title: 'Cosmetics in studio games',
    body: `Indie Creations' own games sell their cosmetics for ${TOKEN_TICKER}: hats, outfits and tool skins in My Favorite Sheep, items in Don't Worry, You're Safe! and more. Cosmetics are for looking good, never for winning.`,
  },
  {
    title: 'Playtest access',
    body: `Hold ${MIN_TOKENS.toLocaleString('en-US')} ${TOKEN_TICKER} to get into the playtest area and play studio builds while they are still being made.`,
  },
  {
    title: 'Make your own game',
    body: `Holders can make browser games with a prompt in Create, publish them to Community, and sell items in them.`,
  },
];

// Decorative 5x5 board echoing the logo mark. 1 = ink tile.
const BOARD = [0, 1, 0, 0, 1, 1, 0, 1, 0, 0, 0, 1, 1, 0, 1, 0, 0, 1, 1, 0, 1, 0, 0, 1, 0];

export async function getStaticProps() {
  const { storeGamesForPages } = await import('../lib/platform/storeList');
  return { props: { storeGames: await storeGamesForPages() }, revalidate: 60 };
}

export default function Home({ storeGames = [] }) {
  const economy = useEconomyStats();

  return (
    <>
      {/* HERO */}
      <section className="hero">
        <div className="container hero-inner">
          <div className="hero-copy">
            <span className="pill">
              <span className="dot" />
              Store opening soon
            </span>
            <h1>An indie game store, built on crypto.</h1>
            <p className="lead">
              Play indie web games right in your browser and pay with stablecoins. Developers keep 80% of every sale,{' '}
              {TOKEN_TICKER} holders share 2% and curators who review games share 1%.
              {privyEnabled ? ' Sign in with your email or a wallet.' : ''} The store opens to independent developers
              soon; the studio&apos;s own games are playable now.
            </p>
            <div className="actions">
              <Link href="/games" className="btn btn-primary">
                Browse games
              </Link>
              <Link href="/developers" className="btn btn-ghost">
                Publish your game
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
          <p className="eyebrow">Play now</p>
          <h2>On the store.</h2>
          <div className="games-grid">
            {GAMES.map((game) => (
              <GameCard game={game} key={game.slug} />
            ))}
            {storeGames.slice(0, 6).map((game) => (
              <GameCard game={game} key={game.slug} />
            ))}
          </div>
        </div>
      </section>

      {/* HOW THE STORE WORKS */}
      <section className="section">
        <div className="container">
          <p className="eyebrow">How the store works</p>
          <h2>Every sale, split four ways.</h2>
          <p className="lead">
            Games are priced in dollars and paid in stablecoins. Each sale waits 72 hours in escrow, so a player who
            hasn&apos;t played can get a refund, then splits automatically.
          </p>
          <StoreSplit />
          <div className="grid-3">
            {AUDIENCES.map((a, i) => (
              <div className="card" key={a.title}>
                <span className="card-index">0{i + 1}</span>
                <h3>{a.title}</h3>
                <p className="muted">{a.body}</p>
                {a.link && (
                  <Link href={a.link.href} className="small">
                    {a.link.label}
                  </Link>
                )}
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* HOLDER PERKS */}
      <section className="section">
        <div className="container">
          <p className="eyebrow">What {TOKEN_TICKER} is for</p>
          <h2>The coin behind the store.</h2>
          <p className="lead">
            {TOKEN_TICKER} is burned every time a developer joins the store or submits a game, and its holders share in
            every sale. It is also the coin of the studio&apos;s own games, from cosmetics to playtests.
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
              <dt>Where it is locked</dt>
              <dd>42% Hoodlock · 8% PONS liquidity locker</dd>
            </div>
            <div>
              <dt>Network</dt>
              <dd>Robinhood Chain</dd>
            </div>
          </dl>
        </div>
      </section>

      {/* ECONOMY: live totals, shown once there is data */}
      {economy && (
        <section className="section">
          <div className="container">
            <p className="eyebrow">The economy so far</p>
            <h2>Every game, one set of books.</h2>
            <p className="lead">
              Revenue from every game and every {TOKEN_TICKER} burned, counted live from the shop and the chain. A
              share of that revenue goes back to holders.
            </p>
            <EconomyStats stats={economy} />
            <div className="actions">
              <Link href="/rewards" className="btn btn-ghost">
                See holder rewards
              </Link>
            </div>
          </div>
        </section>
      )}

      <TokenSection />
    </>
  );
}
