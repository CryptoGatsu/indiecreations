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
          {game.status}
        </span>
        <h3>{game.name}</h3>
        <p className="muted">{game.tagline}</p>
        {game.play && <PlayerCount slug={game.slug} counts={counts} />}
        <div className="actions">
          <Link href={`/games/${game.slug}`} className="btn btn-primary btn-sm">
            About the game
          </Link>
          {game.play ? (
            <a href={game.play} className="btn btn-ghost btn-sm">
              Play in browser
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
