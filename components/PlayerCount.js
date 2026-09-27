import { useEffect, useState } from 'react';

// Players per browser game from /api/presence: { [slug]: { now, day, month } }. One request per page, however many
// cards ask; refreshed after a minute.
let shared = { at: 0, promise: null };
export function usePlayerCounts() {
  const [counts, setCounts] = useState(null);
  useEffect(() => {
    if (!shared.promise || Date.now() - shared.at > 60_000) {
      shared = { at: Date.now(), promise: fetch('/api/presence').then((r) => r.json()).catch(() => ({})) };
    }
    let live = true;
    shared.promise.then((c) => live && setCounts(c));
    return () => {
      live = false;
    };
  }, []);
  return counts;
}

const plural = (n, word) => `${n.toLocaleString('en-US')} ${word}${n === 1 ? '' : 's'}`;

// "12 playing now" (with a live dot), or "40 players today" when nobody is on right now. Nothing when both are 0.
export default function PlayerCount({ slug, counts, detailed = false }) {
  const c = counts?.[slug];
  if (!c || (!c.now && !c.day && !(detailed && c.month))) return null;
  return (
    <p className="player-count">
      {c.now > 0 ? (
        <>
          <span className="live-dot" aria-hidden="true" />
          {c.now.toLocaleString('en-US')} playing now
        </>
      ) : (
        `${plural(c.day, 'player')} today`
      )}
      {detailed && (
        <span className="muted">
          {' '}
          · {plural(c.day, 'player')} in the last 24 hours · {plural(c.month, 'player')} in the last 30 days
        </span>
      )}
    </p>
  );
}
