import { useEffect, useState } from 'react';

// Players per browser game from /api/presence: { [slug]: { now, day, month } }. One request per page however many
// cards ask, refreshed every 30 seconds while the page is in front, so someone joining shows up without a reload.
const REFRESH_MS = 30_000;
const shared = { counts: null, at: 0, loading: null, listeners: new Set(), timer: null };

function refresh() {
  if (shared.loading) return shared.loading;
  shared.loading = fetch('/api/presence', { cache: 'no-store' })
    .then((r) => r.json())
    .then((c) => {
      shared.counts = c;
      shared.at = Date.now();
      shared.listeners.forEach((fn) => fn(c));
    })
    .catch(() => {})
    .finally(() => {
      shared.loading = null;
    });
  return shared.loading;
}

export function usePlayerCounts() {
  const [counts, setCounts] = useState(shared.counts);
  useEffect(() => {
    shared.listeners.add(setCounts);
    if (!shared.counts || Date.now() - shared.at > REFRESH_MS) refresh();
    else setCounts(shared.counts);
    if (!shared.timer) {
      shared.timer = setInterval(() => {
        if (document.visibilityState === 'visible') refresh();
      }, REFRESH_MS);
    }
    return () => {
      shared.listeners.delete(setCounts);
      if (!shared.listeners.size && shared.timer) {
        clearInterval(shared.timer);
        shared.timer = null;
      }
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
