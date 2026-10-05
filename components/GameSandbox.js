import { forwardRef, useEffect, useImperativeHandle, useRef, useState } from 'react';
import { SANDBOX } from '../lib/creations';
import { createNetRelay, netPlayer } from '../lib/gameNet';

// A community game in its sandbox. The iframe gets scripts and pointer lock only; the game's own response headers
// (pages/api/creations/[id]/raw.js) isolate it as well. onError(message) hears about errors the game hits, reported by
// the site's runtime inside the game - only messages from THIS iframe are listened to.
//
// A sandboxed frame can still navigate itself. Every load of a real game announces itself ('ready', from the runtime);
// a load that doesn't is some other page the game navigated to, so it is replaced with a notice.
//
// store: { items: [{ id, name, description }], owned: [ids] } - handed to the game (window.IC inside it) on every load
// and whenever it changes. onOpenStore(itemId) runs when the game asks to show the store.
//
// ref.takeSnapshot() -> Promise<string | null>: a 640x360 JPEG data URL of what the game is showing, or null when the
// frame is blank or the game doesn't answer (the runtime inside the game does the capture).
//
// net: { gameId, version, wallet, room, inviteUrl } turns on online multiplayer: the game's IC.net calls are relayed
// to the other players (lib/gameNet.js), and a bar under the game shows the room. inviteUrl(code) makes the share
// link (only for published games: a friend can't open a draft).
const GameSandbox = forwardRef(function GameSandbox({ src, title, onError, onLoaded, store, onOpenStore, net }, ref) {
  const frame = useRef(null);
  const relay = useRef(null);
  const netRef = useRef(net);
  netRef.current = net;
  const [netState, setNetState] = useState(null);
  const [copied, setCopied] = useState(false);

  // one relay per game frame; it closes with the frame (a reload, another version, leaving the page)
  const closeRelay = () => {
    relay.current?.dispose();
    relay.current = null;
    setNetState(null);
  };
  useEffect(() => closeRelay, []);
  const relayFor = () => {
    const n = netRef.current;
    if (!n) return null;
    if (!relay.current) {
      relay.current = createNetRelay({
        gameId: n.gameId,
        version: n.version,
        player: netPlayer(n.wallet),
        roomHint: n.room,
        toGame: (msg) => frame.current?.contentWindow?.postMessage(msg, '*'),
        onState: setNetState,
      });
    }
    return relay.current;
  };
  const shot = useRef(null); // the pending takeSnapshot: { resolve, timer }

  useImperativeHandle(ref, () => ({
    takeSnapshot() {
      if (shot.current) return shot.current.promise;
      const win = frame.current?.contentWindow;
      if (!win) return Promise.resolve(null);
      let resolve;
      const promise = new Promise((r) => (resolve = r));
      const timer = setTimeout(() => finish(null), 5000);
      const finish = (image) => {
        clearTimeout(timer);
        shot.current = null;
        resolve(image);
      };
      shot.current = { promise, finish };
      win.postMessage({ source: 'ic-page', type: 'snapshot' }, '*');
      return promise;
    },
  }));
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
        closeRelay(); // a reload of the game starts with no room
      }
      if (d.type === 'net') relayFor()?.handle(d);
      if (d.type === 'snapshot' && shot.current) {
        // only a request we made counts, and only a JPEG data URL
        const ok = typeof d.image === 'string' && /^data:image\/jpeg;base64,/.test(d.image) && d.image.length < 400_000;
        shot.current.finish(ok ? d.image : null);
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
      {netState && (
        <div className="sandbox-room">
          <span className="live-dot" aria-hidden="true" />
          <span>
            Online · room <strong className="mono">{netState.room}</strong> · {netState.players.length} player
            {netState.players.length === 1 ? '' : 's'}
            {netState.players.length > 0 && <span className="muted">: {netState.players.map((p) => (p.id === netState.me ? `${p.name} (you)` : p.name)).join(', ')}</span>}
          </span>
          {net?.inviteUrl ? (
            <button
              type="button"
              className="btn btn-ghost btn-sm"
              onClick={async () => {
                const url = net.inviteUrl(netState.room);
                try {
                  if (navigator.share) await navigator.share({ title, url });
                  else await navigator.clipboard.writeText(url);
                  setCopied(true);
                  setTimeout(() => setCopied(false), 2000);
                } catch {}
              }}
            >
              {copied ? 'Link copied' : 'Invite friends'}
            </button>
          ) : (
            <span className="muted small">Open the game in another tab to test with a second player.</span>
          )}
        </div>
      )}
      <div className="sandbox-bar">
        <span className="muted small">Click the game to play. It runs sandboxed: never type a password or seed phrase into it.</span>
        {!left && <button type="button" className="btn btn-ghost btn-sm" onClick={fullscreen}>Full screen</button>}
      </div>
    </div>
  );
});

export default GameSandbox;
