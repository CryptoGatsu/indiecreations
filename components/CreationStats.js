import { useEffect, useState } from 'react';
import { PING_MS } from '../lib/creations';

// The numbers under a community game: who is playing it, how much, and the prompts it was made from (unless its
// creator keeps them private). `owner` asks as the creator (never cached, always with the prompts). Refreshes every
// 30 seconds while the page is in front, so "playing now" stays live.
const REFRESH_MS = 30_000;

const n = (v) => Number(v || 0).toLocaleString('en-US');
const date = (d) => new Date(d).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
export function duration(minutes) {
  const m = Math.round(minutes || 0);
  if (m < 60) return `${m} min`;
  const h = Math.floor(m / 60);
  if (h < 100) return m % 60 ? `${h} h ${m % 60} min` : `${h} h`;
  return `${n(h)} h`;
}

// "3 playing now" (live) or "12 players today"; nothing when nobody has played lately.
export function LiveCount({ stats }) {
  if (!stats || (!stats.now && !stats.day)) return null;
  return (
    <p className="player-count small">
      {stats.now > 0 ? (
        <>
          <span className="live-dot" aria-hidden="true" />
          {n(stats.now)} playing now
        </>
      ) : (
        `${n(stats.day)} player${stats.day === 1 ? '' : 's'} today`
      )}
    </p>
  );
}

function Stat({ label, value, live = false }) {
  return (
    <div className="creations-stat">
      <strong>
        {live && <span className="live-dot" aria-hidden="true" />}
        {value}
      </strong>
      <span>{label}</span>
    </div>
  );
}

function Prompt({ version, text, when, live }) {
  return (
    <li>
      <div className="creations-prompt-head">
        <strong>{version === 1 ? 'First prompt' : `Change ${version - 1}`}</strong>
        <span className="muted small">
          v{version} · {date(when)}
          {live && ' · live'}
        </span>
      </div>
      <p>{text}</p>
    </li>
  );
}

export default function CreationStats({ id, owner = false, refreshKey = 0 }) {
  const [s, setS] = useState(null);

  useEffect(() => {
    let alive = true;
    const load = () =>
      fetch(`/api/creations/${id}/stats${owner ? '?owner=1' : ''}`, { cache: 'no-store' })
        .then((r) => (r.ok ? r.json() : null))
        .then((d) => alive && d && setS(d))
        .catch(() => {});
    load();
    const t = setInterval(() => document.visibilityState === 'visible' && load(), REFRESH_MS);
    return () => {
      alive = false;
      clearInterval(t);
    };
  }, [id, owner, refreshKey]);

  if (!s) return null;
  const p = s.prompts;
  const firstMissing = p && (p.firstKept === null || p.firstKept > 1);

  return (
    <section className="card creations-stats">
      <h2>Game stats</h2>
      <div className="creations-stat-grid">
        <Stat label="playing now" value={n(s.now)} live={s.now > 0} />
        <Stat label="players today" value={n(s.day)} />
        <Stat label="players all time" value={n(s.players)} />
        <Stat label="plays" value={n(s.plays)} />
        <Stat label="time played" value={duration(s.minutes)} />
        <Stat label="average per player" value={duration(s.avgMinutes)} />
        <Stat label={s.versions === 1 ? 'prompt to make it' : 'prompts to make it'} value={n(s.versions)} />
        <Stat label="lines of code" value={n(s.lines)} />
      </div>
      <p className="muted small">
        Made {date(s.createdAt)} · updated {date(s.updatedAt)} · playing v{s.liveVersion} · players are counted once a
        minute while the game is open
      </p>

      <h3>How it was made</h3>
      {s.promptsHidden ? (
        <p className="muted small">The creator keeps their prompts private.</p>
      ) : (
        <ol className="creations-prompts">
          {firstMissing && <Prompt version={1} text={p.first} when={s.createdAt} live={s.liveVersion === 1} />}
          {firstMissing && p.firstKept > 2 && (
            <li className="muted small">Changes 1 to {p.firstKept - 2} are no longer kept.</li>
          )}
          {p.list.map((v) => (
            <Prompt key={v.version} version={v.version} text={v.request} when={v.created_at} live={v.version === s.liveVersion} />
          ))}
        </ol>
      )}
    </section>
  );
}

// The page around a public game: tells the site this browser is playing it once the game has loaded, then once a
// minute while the tab is in front (and for 5 more minutes after switching away). The id is random and stays in this
// browser - the same one the studio's own games use (/presence.js).
const GRACE_MS = 5 * 60 * 1000;
export function useGamePresence(id, playing) {
  useEffect(() => {
    if (!id || !playing) return undefined;
    let visitor;
    try {
      visitor = localStorage.getItem('ic_visitor');
      if (!/^[a-z0-9]{16,40}$/.test(visitor || '')) {
        visitor = (Math.random().toString(36).slice(2) + Math.random().toString(36).slice(2) + Date.now().toString(36)).slice(0, 32);
        localStorage.setItem('ic_visitor', visitor);
      }
    } catch {
      visitor = (Math.random().toString(36).slice(2) + Math.random().toString(36).slice(2)).slice(0, 24);
    }
    let lastVisible = Date.now();
    const ping = () => {
      if (document.visibilityState === 'visible') lastVisible = Date.now();
      if (Date.now() - lastVisible > GRACE_MS) return;
      fetch(`/api/creations/${id}/presence`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ visitor }),
        keepalive: true,
      }).catch(() => {});
    };
    ping();
    const t = setInterval(ping, PING_MS);
    document.addEventListener('visibilitychange', ping);
    return () => {
      clearInterval(t);
      document.removeEventListener('visibilitychange', ping);
    };
  }, [id, playing]);
}
