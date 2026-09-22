import Head from 'next/head';
import GameCard from '../../components/GameCard';
import { GAMES } from '../../lib/games';
import { TOKEN_TICKER } from '../../lib/config';

export default function Games() {
  return (
    <>
      <Head>
        <title>Games - Indie Creations</title>
      </Head>
      <div className="container page">
        <div className="page-head">
          <div>
            <p className="eyebrow">Games</p>
            <h1>Everything we&apos;re making.</h1>
            <p className="muted">
              Each game has its own page and its own cosmetics shop. Holders of {TOKEN_TICKER} play every release
              free.
            </p>
          </div>
        </div>
        <div className="games-grid">
          {GAMES.map((game) => (
            <GameCard game={game} key={game.slug} />
          ))}
        </div>
      </div>
    </>
  );
}
