import Link from 'next/link';
import PlayerCount, { usePlayerCounts } from './PlayerCount';

// One game, as shown on the home page and the games list: art, status, tagline, and the two places to go next.
export default function GameCard({ game }) {
  const counts = usePlayerCounts();
  return (
    <article className="game-card">
      <Link href={`/games/${game.slug}`} className="game-card-art" aria-label={game.name}>
        <img src={game.hero} alt="" loading="lazy" />
      </Link>
      <div className="game-card-body">
        <span className="pill">
          <span className="dot" />
          {game.store ? (game.status === 'abandoned' ? 'Abandoned' : game.priceUsdCents ? 'On the store' : 'Free on the store') : game.status}
        </span>
        <h3>{game.name}</h3>
        {game.store && <p className="small muted">by {game.studio}</p>}
        <p className="muted">{game.tagline}</p>
        {(game.play || game.store) && <PlayerCount slug={game.slug} counts={counts} />}
        <div className="actions">
          <Link href={`/games/${game.slug}`} className="btn btn-primary btn-sm">
            About the game
          </Link>
          {game.store ? (
            <Link href={`/play/${game.slug}`} className="btn btn-ghost btn-sm">
              {game.priceUsdCents ? `$${(game.priceUsdCents / 100).toFixed(2)}` : 'Play free'}
            </Link>
          ) : game.play ? (
            <a href={game.play} className="btn btn-ghost btn-sm">
              Play in browser
            </a>
          ) : !game.shop && game.steam ? (
            <a href={game.steam} target="_blank" rel="noreferrer" className="btn btn-ghost btn-sm">
              Wishlist on Steam
            </a>
          ) : (
            <Link href={`/shop?game=${game.slug}`} className="btn btn-ghost btn-sm">
              Cosmetics
            </Link>
          )}
        </div>
      </div>
    </article>
  );
}
