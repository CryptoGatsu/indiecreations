import { useEffect, useRef, useState } from 'react';
import { SANDBOX } from '../lib/creations';

// A community game in its sandbox. The iframe gets scripts and pointer lock only; the game's own response headers
// (pages/api/creations/[id]/raw.js) isolate it as well. onError(message) hears about errors the game hits, reported by
// the site's runtime inside the game - only messages from THIS iframe are listened to.
//
// A sandboxed frame can still navigate itself. Every load of a real game announces itself ('ready', from the runtime);
// a load that doesn't is some other page the game navigated to, so it is replaced with a notice.
//
// store: { items: [{ id, name, description }], owned: [ids] } - handed to the game (window.IC inside it) on every load
// and whenever it changes. onOpenStore(itemId) runs when the game asks to show the store.
export default function GameSandbox({ src, title, onError, onLoaded, store, onOpenStore }) {
  const frame = useRef(null);
  const readySinceLoad = useRef(false);
  const storeRef = useRef(store);
  storeRef.current = store;

  const sendStore = () => {
    const s = storeRef.current;
    if (!s || !frame.current?.contentWindow) return;
    const items = (s.items || []).map(({ id, name, description }) => ({ id, name, description }));
    // '*': the game has an opaque origin, so there is no origin to name; only this frame receives it
    frame.current.contentWindow.postMessage({ source: 'ic-page', type: 'store', items, owned: s.owned || [] }, '*');
  };

  useEffect(sendStore, [store]);
  const [left, setLeft] = useState(false);
  const [run, setRun] = useState(0);

  useEffect(() => {
    const onMessage = (e) => {
      if (!frame.current || e.source !== frame.current.contentWindow) return;
      const d = e.data;
      if (!d || d.source !== 'ic-creation') return;
      if (d.type === 'ready') {
        readySinceLoad.current = true;
        sendStore();
      }
      if (d.type === 'open-store' && onOpenStore) onOpenStore(typeof d.itemId === 'string' ? d.itemId : null);
      // wallet extensions' own errors inside the sandbox are not the game's (the runtime filters them too)
      if (d.type === 'error' && onError && !/metamask|phantom|coinbase wallet|-extension:\/\//i.test(String(d.message))) {
        onError(String(d.message || 'Error').slice(0, 300));
      }
      if (d.type === 'loaded' && onLoaded) onLoaded();
    };
    window.addEventListener('message', onMessage);
    return () => window.removeEventListener('message', onMessage);
  }, [onError, onLoaded, onOpenStore]);

  const onLoad = () => {
    // messages posted while the page parsed can land just after the load event: give them a moment
    setTimeout(() => {
      if (!readySinceLoad.current) setLeft(true);
      readySinceLoad.current = false;
    }, 1000);
  };

  const restart = () => {
    readySinceLoad.current = false;
    setLeft(false);
    setRun((n) => n + 1);
  };

  const fullscreen = () => {
    const el = frame.current;
    if (!el) return;
    (el.requestFullscreen || el.webkitRequestFullscreen)?.call(el);
    el.focus();
  };

  return (
    <div className="sandbox">
      {left ? (
        <div className="game-frame game-frame-empty">
          <h3>The game tried to open another page</h3>
          <p className="muted">It was stopped. Community games must stay on their own page.</p>
          <button type="button" className="btn btn-ghost btn-sm" onClick={restart}>Restart the game</button>
        </div>
      ) : (
        <iframe
          key={run}
          ref={frame}
          className="game-frame"
          src={src}
          title={title}
          sandbox={SANDBOX}
          allow="fullscreen; gamepad; autoplay"
          referrerPolicy="no-referrer"
          onLoad={onLoad}
        />
      )}
      <div className="sandbox-bar">
        <span className="muted small">Click the game to play. It runs sandboxed: never type a password or seed phrase into it.</span>
        {!left && <button type="button" className="btn btn-ghost btn-sm" onClick={fullscreen}>Full screen</button>}
      </div>
    </div>
  );
}
