import Head from 'next/head';
import Link from 'next/link';
import { useRouter } from 'next/router';
import { useEffect, useRef, useState } from 'react';
import { FRAME_SANDBOX } from '../../lib/platform/files';

// Plays a store game. The build is served from the games storage domain (never indiecreations.fun) inside a sandboxed
// frame that can't navigate the store or reach its cookies (PLATFORM_SPEC section 6). The store frame itself counts
// the player for "N playing now", so developers don't need to add anything to their build.

function visitorId() {
  try {
    let id = localStorage.getItem('ic_visitor');
    if (!/^[a-z0-9]{16,40}$/.test(id || '')) {
      id = (Math.random().toString(36).slice(2) + Math.random().toString(36).slice(2) + Date.now().toString(36)).slice(0, 32);
      localStorage.setItem('ic_visitor', id);
    }
    return id;
  } catch {
    return (Math.random().toString(36).slice(2) + Math.random().toString(36).slice(2)).slice(0, 24);
  }
}

function usePresence(slug, active) {
  useEffect(() => {
    if (!slug || !active) return;
    const id = visitorId();
    let lastVisible = Date.now();
    const ping = () => {
      if (document.visibilityState === 'visible') lastVisible = Date.now();
      if (Date.now() - lastVisible > 5 * 60 * 1000) return;
      fetch('/api/presence', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ game: slug, id }),
        keepalive: true,
      }).catch(() => {});
    };
    ping();
    const t = setInterval(ping, 60_000);
    return () => clearInterval(t);
  }, [slug, active]);
}

export default function Play() {
  const { query } = useRouter();
  const slug = typeof query.slug === 'string' ? query.slug : null;
  const [state, setState] = useState(null);
  const frame = useRef(null);

  useEffect(() => {
    if (!slug) return;
    fetch(`/api/store/play?slug=${encodeURIComponent(slug)}`, { cache: 'no-store' })
      .then(async (r) => {
        const out = await r.json().catch(() => ({}));
        setState(r.ok ? { game: out.game } : { error: out.error || 'This game can’t be played right now.', status: r.status });
      })
      .catch(() => setState({ error: 'This game can’t be played right now.' }));
  }, [slug]);
  usePresence(slug, Boolean(state?.game));

  const fullscreen = () => frame.current?.requestFullscreen?.().catch(() => {});

  return (
    <div className="container page play-page">
      <Head>
        <title>{state?.game ? `${state.game.name} - Indie Creations` : 'Play - Indie Creations'}</title>
      </Head>
      {!state ? (
        <p className="muted">Loading…</p>
      ) : state.error ? (
        <div className="gate">
          <h1>Can&apos;t play this yet</h1>
          <p className="muted">{state.error}</p>
          <Link href={`/games/${slug}`} className="btn btn-primary">
            Back to the game
          </Link>
        </div>
      ) : (
        <>
          <div className="play-bar">
            <div>
              <strong>{state.game.name}</strong> <span className="muted small">by {state.game.studio}</span>
            </div>
            <div className="admin-row">
              <button className="btn btn-ghost btn-sm" onClick={fullscreen}>
                Full screen
              </button>
              <Link href={`/games/${slug}`} className="btn btn-ghost btn-sm">
                Store page
              </Link>
            </div>
          </div>
          <iframe
            ref={frame}
            className="game-frame play-frame"
            src={state.game.entryUrl}
            title={state.game.name}
            sandbox={FRAME_SANDBOX}
            allow="fullscreen; gamepad; autoplay; clipboard-write"
            referrerPolicy="no-referrer"
          />
        </>
      )}
    </div>
  );
}
