import Head from 'next/head';
import GameCard from '../../components/GameCard';
import { GAMES } from '../../lib/games';
import { TOKEN_TICKER } from '../../lib/config';

export default function Games() {
  return (
    <>
      <Head>
        <title>Store - Indie Creations</title>
      </Head>
      <div className="container page">
        <div className="page-head">
          <div>
            <p className="eyebrow">Store</p>
            <h1>Games on Indie Creations.</h1>
            <p className="muted">
              Play right in your browser. The store opens to independent developers soon; until then, these are the
              studio&apos;s own games, with cosmetics paid in {TOKEN_TICKER}.
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
