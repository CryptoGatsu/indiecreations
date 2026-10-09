import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import Head from 'next/head';
import Link from 'next/link';
import { useRouter } from 'next/router';
import ConnectButton from '../components/ConnectButton';
import CreationStats, { Cover, LiveCount } from '../components/CreationStats';
import { useCreatorStore } from '../components/CreatorStore';
import GameSandbox from '../components/GameSandbox';
import StoreManager from '../components/StoreManager';
import useHolderSession from '../components/useHolderSession';
import { Mark } from '../components/Logo';
import { LINKS, TOKEN_TICKER, shortAddress } from '../lib/config';
import { CREATOR_TIERS, MIN_CREATOR_TOKENS, PROMPT_MAX, rawUrl } from '../lib/creations';

// The creator studio: holders describe a game, Claude writes it, they play it here, ask for changes, and publish it to
// /community. How many games a wallet may have depends on what it holds (lib/creations.js).

const IDEAS = [
  'A neon space shooter: dodge asteroids that speed up every 10 seconds, collect shield orbs, and fight a boss every minute.',
  'A cosy low-poly fishing game on a lake at sunset. Cast, wait for the bobber to dip, reel in with timing. Rare fish glow.',
  'An endless runner through a candy forest. Jump and slide past obstacles, collect sweets, speed builds up over time.',
  'A top-down arena where waves of slimes split in two when hit. Survive as long as you can; power-ups drop every wave.',
  'A marble rolling puzzle: tilt the floating maze to guide the marble to the goal before the timer runs out. 5 levels.',
];

const n = (v) => Number(v).toLocaleString('en-US', { maximumFractionDigits: 0 });
const ago = (date) => {
  const s = Math.max(0, Math.round((Date.now() - new Date(date).getTime()) / 1000));
  if (s < 60) return 'just now';
  if (s < 3600) return `${Math.floor(s / 60)} min ago`;
  if (s < 86400) return `${Math.floor(s / 3600)} h ago`;
  return `${Math.floor(s / 86400)} d ago`;
};

// Starts a generation (or picks one up again: { jobId }) and follows its progress. A big game is written over several
// server runs: when one runs out of time it says 'continue', and the next picks up from the text saved so far. The
// server keeps writing when the connection drops (a phone locks, Safari's "Load failed"), so this reconnects with the
// run's id until it can carry on or hear how it ended. Resolves the saved game; throws with a message for the creator.
class StudioError extends Error {}

// Resolves after `ms`, or sooner when the tab comes back into view or the network returns.
const pause = (ms) =>
  new Promise((resolve) => {
    const done = () => {
      clearTimeout(timer);
      document.removeEventListener('visibilitychange', onVisible);
      window.removeEventListener('online', done);
      resolve();
    };
    const onVisible = () => document.visibilityState === 'visible' && done();
    const timer = setTimeout(done, ms);
    document.addEventListener('visibilitychange', onVisible);
    window.addEventListener('online', done);
  });

// One request, following its stream: { game } | { next: jobId } | { busy } (another run holds it) | { lost }
async function attempt(request, on) {
  let res;
  try {
    res = await fetch('/api/creations/generate', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(request),
    });
  } catch {
    return { lost: true };
  }
  if (res.status === 409) return { busy: true };
  if (!res.ok) {
    const data = await res.json().catch(() => ({}));
    throw new StudioError(data.error || 'Could not start. Try again.');
  }
  let next = null;
  try {
    const reader = res.body.getReader();
    const decoder = new TextDecoder();
    let buffer = '';
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      buffer += decoder.decode(value, { stream: true });
      let i;
      while ((i = buffer.indexOf('\n')) >= 0) {
        const line = buffer.slice(0, i).trim();
        buffer = buffer.slice(i + 1);
        if (!line) continue;
        const msg = JSON.parse(line);
        if (msg.type === 'job') on.job(msg.jobId);
        if (msg.type === 'progress') on.progress(msg.chars);
        if (msg.type === 'continue') next = msg.jobId;
        if (msg.type === 'done') return { game: msg.game };
        if (msg.type === 'error') throw new StudioError(msg.error);
      }
    }
  } catch (err) {
    if (err instanceof StudioError) throw err;
    return { lost: true };
  }
  return next ? { next } : { lost: true };
}

const GIVE_UP_MS = 40 * 60 * 1000; // reconnecting this long without hearing from the server: stop and say so

async function runGeneration(body, { onProgress, onState }) {
  let request = body;
  let jobId = body.jobId || null;
  let part = 1;
  let quietSince = null;
  for (;;) {
    const r = await attempt(request, {
      job: (id) => (jobId = id),
      progress: (chars) => {
        quietSince = null;
        onState(null);
        if (chars >= 0) onProgress(chars, part);
      },
    });
    if (r.game) return r.game;
    if (r.next) {
      part += 1;
      request = { jobId: r.next };
      continue;
    }
    if (!jobId) throw new Error('The connection dropped before your game started. Try again.');
    quietSince ||= Date.now();
    if (Date.now() - quietSince > GIVE_UP_MS) {
      throw new Error('Lost touch with the studio. Refresh the page in a minute: your game may still be finishing.');
    }
    onState(r.busy ? 'running' : 'reconnecting');
    request = { jobId };
    await pause(r.busy ? 10_000 : 4_000);
  }
}

function useGeneration() {
  const [busy, setBusy] = useState(false);
  const [chars, setChars] = useState(0);
  const [part, setPart] = useState(1);
  const [started, setStarted] = useState(0);
  const [state, setState] = useState(null); // 'reconnecting' | 'running' (elsewhere, out of sight) | null
  const [error, setError] = useState(null);

  const run = async (body, since = Date.now()) => {
    setBusy(true);
    setError(null);
    setChars(0);
    setPart(1);
    setState(null);
    setStarted(since);
    try {
      return await runGeneration(body, {
        onProgress: (c, p) => {
          setChars(c);
          setPart(p);
        },
        onState: setState,
      });
    } catch (err) {
      setError(err.message);
      return null;
    } finally {
      setBusy(false);
      setState(null);
    }
  };
  return { busy, chars, part, started, state, error, run, clearError: () => setError(null) };
}

// Picks up the holder's unfinished run (me.pending) once, when it belongs here: `gameId` null for a new game.
function useResume(me, gameId, gen, onDone) {
  const resumed = useRef(null);
  const pending = me?.pending;
  useEffect(() => {
    if (!pending || (pending.gameId || null) !== gameId || gen.busy || resumed.current === pending.jobId) return;
    resumed.current = pending.jobId;
    gen.run({ jobId: pending.jobId }, Date.parse(pending.startedAt) || Date.now()).then((game) => game && onDone(game, pending));
  }, [pending, gameId, gen, onDone]);
}

function Progress({ gen, verb }) {
  const [, tick] = useState(0);
  useEffect(() => {
    if (!gen.busy) return undefined;
    const t = setInterval(() => tick((x) => x + 1), 1000);
    return () => clearInterval(t);
  }, [gen.busy]);
  if (!gen.busy) return null;
  const secs = Math.floor((Date.now() - gen.started) / 1000);
  return (
    <div className="creations-progress" role="status">
      <span className="live-dot" />
      <div>
        <strong>
          {gen.state === 'reconnecting'
            ? 'Reconnecting… your game is still being written.'
            : gen.state === 'running'
              ? 'Still writing your game…'
              : gen.chars
                ? `${verb}… ${n(gen.chars)} characters of code`
                : 'Claude is planning the game…'}
        </strong>
        <p className="muted small">
          {Math.floor(secs / 60)}:{String(secs % 60).padStart(2, '0')} ·{' '}
          {gen.part > 1 ? `a big one: still going (part ${gen.part}).` : 'usually 2 to 6 minutes, longer for big games.'} If you
          leave or lock your phone, it picks up here when you come back.
        </p>
      </div>
    </div>
  );
}

function Gate({ s }) {
  return (
    <div className="container page">
      <div className="gate">
        <Mark size={44} />
        <h1>Make a game</h1>
        <p className="muted">
          Describe a game and Claude builds it in 3D, ready to play in the browser. Publish it and anyone can play.
          Creating takes at least {n(MIN_CREATOR_TOKENS)} {TOKEN_TICKER}.
        </p>
        {!s.isConnected ? (
          <ConnectButton />
        ) : (
          <>
            <button className="btn btn-primary" onClick={s.verify} disabled={s.verifying}>
              {s.verifying ? 'Check your wallet…' : 'Verify holdings'}
            </button>
            <p className="muted small">Connected as {shortAddress(s.address)}. Verifying is a free signature, not a transaction.</p>
          </>
        )}
        {s.result?.error && <p className="error small">{s.result.error}</p>}
        {s.result?.balance !== undefined && (
          <div className="notice">
            <p>This wallet holds {n(s.result.balance)} {TOKEN_TICKER}.</p>
            <a href={LINKS.pons} target="_blank" rel="noreferrer" className="btn btn-ghost btn-sm">Get {TOKEN_TICKER}</a>
          </div>
        )}
        <Link href="/community" className="small">Play games holders have made</Link>
      </div>
    </div>
  );
}

function Tiers({ me }) {
  const studio = me.balance === null;
  return (
    <section className="card creations-tiers">
      <div>
        <p className="eyebrow">Your game slots</p>
        <p className="creations-big">
          {me.unlimited ? `${me.games.length} / ∞` : `${me.games.length} / ${me.slots}`}
        </p>
        {me.unlimited ? (
          <p className="muted small">Dev wallet: unlimited games and generations.</p>
        ) : (
          <>
            <p className="muted small">
              {studio ? 'Studio wallet.' : `You hold ${n(me.balance)} ${TOKEN_TICKER}.`}{' '}
              {me.next && `Hold ${n(me.next.min)} for ${me.next.games} game${me.next.games === 1 ? '' : 's'}.`}
            </p>
            <p className="muted small">
              Generations today: {Math.min(me.usedToday, me.perDay)} / {me.perDay} (a new game or a change each count once).
            </p>
          </>
        )}
      </div>
      <ul className="creations-tier-list">
        {[...CREATOR_TIERS].reverse().map((t) => (
          <li key={t.min} className={me.unlimited || me.slots >= t.games ? 'tier-on' : ''}>
            <span>{n(t.min)}+</span>
            <span>{t.games} game{t.games === 1 ? '' : 's'}</span>
          </li>
        ))}
      </ul>
    </section>
  );
}

function NewGame({ me, onCreated }) {
  const gen = useGeneration();
  const [prompt, setPrompt] = useState('');
  const full = !me.unlimited && me.games.length >= me.slots;
  const outOfToday = !me.unlimited && me.usedToday >= me.perDay;

  // a new game still being written when the page was left (or the connection dropped): carry on with it here
  const pendingHere = me.pending && !me.pending.gameId ? me.pending : null;
  useEffect(() => {
    if (pendingHere) setPrompt((p) => p || pendingHere.request);
  }, [pendingHere]);
  useResume(me, null, gen, (game) => onCreated(game));

  const submit = async (e) => {
    e.preventDefault();
    const game = await gen.run({ prompt });
    if (game) onCreated(game);
  };

  // "Make a random game": Claude invents an idea nobody has made yet (/api/creations/idea), then it is made like any
  // other prompt, which stays in the box so the creator can see what they got.
  const [ideaBusy, setIdeaBusy] = useState(null); // 'single' | 'multi'
  const [ideaError, setIdeaError] = useState(null);
  const [idea, setIdea] = useState(null);
  const random = async (mode) => {
    setIdeaBusy(mode);
    setIdeaError(null);
    setIdea(null);
    try {
      const res = await fetch('/api/creations/idea', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ mode }),
      });
      const d = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(d.error || 'Could not come up with an idea. Try again.');
      setPrompt(d.prompt);
      setIdea(d);
      setIdeaBusy(null);
      const game = await gen.run({ prompt: d.prompt });
      if (game) onCreated(game);
    } catch (err) {
      setIdeaError(err.message);
      setIdeaBusy(null);
    }
  };

  if (!me.unlimited && me.slots === 0) {
    return (
      <div className="card notice">
        <p>Creating games takes at least {n(MIN_CREATOR_TOKENS)} {TOKEN_TICKER}.</p>
        <a href={LINKS.pons} target="_blank" rel="noreferrer" className="btn btn-primary btn-sm">Get {TOKEN_TICKER}</a>
      </div>
    );
  }
  if (full) {
    return (
      <p className="muted small creations-note">
        All your game slots are in use. Delete a game to make a new one, or hold more {TOKEN_TICKER} for another slot.
      </p>
    );
  }

  return (
    <form className="card creations-new" onSubmit={submit}>
      <h2>New game</h2>
      <p className="muted small">
        Say what you play, how you win or lose, and the look. Everything is built from code: 3D shapes, colours,
        particles and synth sounds, no uploaded art.
      </p>
      <textarea
        value={prompt}
        onChange={(e) => setPrompt(e.target.value)}
        placeholder={IDEAS[0]}
        maxLength={PROMPT_MAX}
        disabled={gen.busy}
        required
      />
      <div className="creations-ideas">
        {IDEAS.slice(1).map((idea) => (
          <button type="button" key={idea} className="link-button small" disabled={gen.busy} onClick={() => setPrompt(idea)}>
            {idea.split(':')[0].split('.')[0]}
          </button>
        ))}
      </div>
      <div className="actions">
        <button className="btn btn-primary" disabled={gen.busy || ideaBusy || outOfToday || prompt.trim().length < 3}>
          {gen.busy ? 'Making your game…' : 'Make my game'}
        </button>
        <span className="muted small">or</span>
        <button type="button" className="btn btn-ghost" disabled={gen.busy || ideaBusy || outOfToday} onClick={() => random('single')}>
          {ideaBusy === 'single' ? 'Thinking of one…' : '🎲 Make a random single-player'}
        </button>
        <button type="button" className="btn btn-ghost" disabled={gen.busy || ideaBusy || outOfToday} onClick={() => random('multi')}>
          {ideaBusy === 'multi' ? 'Thinking of one…' : '🎲 Make a random multiplayer'}
        </button>
        {outOfToday && <span className="muted small">That's today's generations used. Come back tomorrow.</span>}
      </div>
      {idea && (
        <p className="small creations-idea">
          Random {idea.mode === 'multi' ? 'online multiplayer' : 'single-player'} idea: <strong>{idea.title}</strong>
        </p>
      )}
      {ideaError && <p className="error small">{ideaError}</p>}
      <Progress gen={gen} verb="Writing your game" />
      {gen.error && <p className="error small">{gen.error}</p>}
    </form>
  );
}

function GameList({ games }) {
  if (!games.length) return null;
  return (
    <section className="creations-mine">
      <h2>Your games</h2>
      <div className="creations-grid">
        {games.map((g) => (
          <Link href={`/create?game=${g.id}`} key={g.id} className="card creations-item">
            <Cover game={g} />
            <span className={g.hidden ? 'pill' : g.published ? 'pill pill-solid' : 'pill'}>
              {g.hidden ? 'Taken down' : g.published ? 'Published' : 'Draft'}
            </span>
            <h3>{g.title}</h3>
            <p className="muted small">{g.description || g.prompt}</p>
            <LiveCount stats={g.stats} />
            <p className="muted small">
              v{g.version} · {n(g.plays)} plays · updated {ago(g.updatedAt)}
            </p>
          </Link>
        ))}
      </div>
    </section>
  );
}

function Editor({ id, me, reload }) {
  const router = useRouter();
  const gen = useGeneration();
  const [data, setData] = useState(null);
  const [loadError, setLoadError] = useState(null);
  const [preview, setPreview] = useState(null); // version shown in the frame
  const [errors, setErrors] = useState([]);
  const [change, setChange] = useState('');
  const [title, setTitle] = useState('');
  const [note, setNote] = useState(null);
  const changeBox = useRef(null);

  // the store: the preview gets every item unlocked (or none), so the creator can try both sides
  const { data: store, reload: reloadStore } = useCreatorStore(id);
  const [unlockAll, setUnlockAll] = useState(true);
  const previewStore = useMemo(
    () => (store ? { items: store.items.filter((i) => i.available), owned: unlockAll ? store.items.map((i) => i.id) : [] } : null),
    [store, unlockAll]
  );
  const onOpenStore = useCallback(() => document.getElementById('store-manager')?.scrollIntoView({ behavior: 'smooth' }), []);
  const buildIn = useCallback((prompt) => {
    setChange(prompt);
    changeBox.current?.scrollIntoView({ behavior: 'smooth', block: 'center' });
    changeBox.current?.focus({ preventScroll: true });
  }, []);

  const load = useCallback(async () => {
    const res = await fetch(`/api/creations/${id}`);
    const d = await res.json().catch(() => ({}));
    if (!res.ok || !d.owner) return setLoadError(d.error || 'Game not found.');
    setData(d);
    setTitle(d.game.title);
    setPreview((p) => p ?? d.game.version);
  }, [id]);

  useEffect(() => {
    load();
  }, [load]);

  // a change still being written when the page was left (or the connection dropped): carry on with it here
  useResume(me, id, gen, async (updated) => {
    setPreview(updated.version);
    await load();
    reload();
  });

  const onError = useCallback((msg) => setErrors((list) => (list.includes(msg) ? list : [...list, msg].slice(-5))), []);

  // Cover screenshot. With no cover yet (or an automatic one of an older version), one is taken a few seconds after the
  // live version loads, and again while the creator plays if the game was still showing a blank screen.
  const sandbox = useRef(null);
  const [loadedAt, setLoadedAt] = useState(0);
  const [coverBusy, setCoverBusy] = useState(false);
  const onLoaded = useCallback(() => setLoadedAt(Date.now()), []);
  const saveCover = useCallback(
    async (manual) => {
      const image = await sandbox.current?.takeSnapshot();
      if (!image) return false;
      const res = await fetch(`/api/creations/${id}/thumbnail`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ version: preview, image, manual }),
      });
      const d = await res.json().catch(() => ({}));
      if (!res.ok) return false;
      if (d.thumb) {
        setData((old) => ({ ...old, game: { ...old.game, thumb: d.thumb, thumbVersion: d.thumbVersion, thumbManual: d.thumbManual } }));
        reload();
      }
      return true;
    },
    [id, preview, reload]
  );
  const needsCover = Boolean(
    data && preview === data.game.version && !data.game.hidden &&
      (!data.game.thumb || (!data.game.thumbManual && data.game.thumbVersion < data.game.version))
  );
  useEffect(() => {
    if (!loadedAt || !needsCover) return undefined;
    let stop = false;
    const timers = [4000, 12000, 25000, 45000, 75000].map((ms) =>
      setTimeout(async () => {
        if (stop) return;
        if (await saveCover(false)) stop = true;
      }, ms)
    );
    return () => {
      stop = true;
      timers.forEach(clearTimeout);
    };
  }, [loadedAt, needsCover, saveCover]);

  if (loadError) {
    return (
      <div className="container page">
        <p className="error">{loadError}</p>
        <Link href="/create" className="btn btn-ghost btn-sm">Back to your games</Link>
      </div>
    );
  }
  if (!data) return <div className="container page"><p className="muted">Loading…</p></div>;

  const { game, versions } = data;
  const overSlots = me && !me.unlimited && me.games.length > me.slots;
  const outOfToday = me && !me.unlimited && me.usedToday >= me.perDay;
  const shareUrl = typeof window !== 'undefined' ? `${window.location.origin}/community/${game.id}` : `/community/${game.id}`;

  const patch = async (body, ok) => {
    setNote(null);
    const res = await fetch(`/api/creations/${id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    });
    const d = await res.json().catch(() => ({}));
    if (!res.ok) return setNote({ error: d.error || 'Could not save.' });
    setData((old) => ({ ...old, game: d.game }));
    if (ok) setNote({ text: ok });
    reload();
  };

  const applyChange = async (request) => {
    const updated = await gen.run({ id, prompt: request });
    if (!updated) return;
    setChange('');
    setErrors([]);
    setPreview(updated.version);
    await load();
    reload();
  };

  const remove = async () => {
    if (!window.confirm(`Delete "${game.title}" and all its versions? This can't be undone.`)) return;
    const res = await fetch(`/api/creations/${id}`, { method: 'DELETE' });
    if (!res.ok) return setNote({ error: 'Could not delete. Try again.' });
    reload();
    router.push('/create');
  };

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(shareUrl);
      setNote({ text: 'Link copied.' });
    } catch {
      setNote({ text: shareUrl });
    }
  };

  const fixErrors = () => {
    setChange(`The game shows ${errors.length === 1 ? 'this error' : 'these errors'}. Please fix ${errors.length === 1 ? 'it' : 'them'}:\n${errors.join('\n')}`);
    changeBox.current?.focus();
  };

  return (
    <div className="container page">
      <Head>
        <title>{`${game.title} · Create · Indie Creations`}</title>
      </Head>
      <div className="page-head">
        <div>
          <p className="eyebrow">
            <Link href="/create">Your games</Link> · v{preview}
            {preview !== game.version && ' (preview of an older version)'}
          </p>
          <h1>{game.title}</h1>
          <p className="muted">{game.description}</p>
        </div>
        <span className={game.published && !game.hidden ? 'pill pill-solid' : 'pill'}>
          {game.hidden ? 'Taken down by the studio' : game.published ? 'Published' : 'Draft: only you can see it'}
        </span>
      </div>

      <GameSandbox
        ref={sandbox}
        onLoaded={onLoaded}
        key={preview}
        src={rawUrl(game.id, preview)}
        title={game.title}
        onError={onError}
        store={previewStore}
        onOpenStore={onOpenStore}
        net={{ gameId: game.id, version: preview, wallet: game.owner }}
      />
      {store?.items.length > 0 && (
        <label className="creations-check small creations-unlock">
          <input type="checkbox" checked={unlockAll} onChange={(e) => setUnlockAll(e.target.checked)} />
          Preview with every store item unlocked
        </label>
      )}

      {errors.length > 0 && (
        <div className="card creations-errors">
          <h3>The game hit {errors.length === 1 ? 'an error' : 'errors'}</h3>
          <ul>
            {errors.map((e) => <li key={e} className="mono small">{e}</li>)}
          </ul>
          <div className="actions">
            <button type="button" className="btn btn-primary btn-sm" onClick={fixErrors} disabled={gen.busy}>Ask Claude to fix it</button>
            <button type="button" className="btn btn-ghost btn-sm" onClick={() => setErrors([])}>Dismiss</button>
          </div>
        </div>
      )}

      <div className="creations-editor">
        <form
          className="card"
          onSubmit={(e) => {
            e.preventDefault();
            applyChange(change);
          }}
        >
          <h2>Change something</h2>
          <p className="muted small">
            Ask for anything: &ldquo;make the enemies slower&rdquo;, &ldquo;add a double jump&rdquo;, &ldquo;switch to a
            night theme&rdquo;. Each change makes a new version; older ones stay in the history below.
          </p>
          <textarea
            ref={changeBox}
            value={change}
            onChange={(e) => setChange(e.target.value)}
            placeholder="What should change?"
            maxLength={PROMPT_MAX}
            disabled={gen.busy || game.hidden}
            required
          />
          <div className="actions">
            <button className="btn btn-primary" disabled={gen.busy || game.hidden || overSlots || outOfToday || change.trim().length < 3}>
              {gen.busy ? 'Working…' : 'Make the change'}
            </button>
            {outOfToday && <span className="muted small">That's today's generations used.</span>}
            {overSlots && <span className="error small">Your holdings allow {me.slots} game{me.slots === 1 ? '' : 's'}: delete one to keep editing.</span>}
          </div>
          <Progress gen={gen} verb="Updating your game" />
          {gen.error && <p className="error small">{gen.error}</p>}
        </form>

        <aside className="card creations-side">
          <h3>Publishing</h3>
          {game.hidden ? (
            <p className="muted small">The studio took this game down after reports. It can't be published again.</p>
          ) : game.published ? (
            <>
              <p className="muted small">Anyone can play it on the community page. New versions go live as soon as they're made.</p>
              <div className="actions">
                <Link href={`/community/${game.id}`} className="btn btn-ghost btn-sm">Open</Link>
                <button type="button" className="btn btn-ghost btn-sm" onClick={copy}>Copy link</button>
                <button type="button" className="btn btn-ghost btn-sm" onClick={() => patch({ published: false }, 'Unpublished.')}>Unpublish</button>
              </div>
            </>
          ) : (
            <>
              <p className="muted small">Only you can see it. Publish it to put it on the community page.</p>
              <button type="button" className="btn btn-primary btn-sm" onClick={() => patch({ published: true }, 'Published.')}>Publish</button>
            </>
          )}

          <label className="creations-check small">
            <input
              type="checkbox"
              checked={game.showPrompts}
              onChange={(e) => patch({ showPrompts: e.target.checked }, e.target.checked ? 'Your prompts show on the game page.' : 'Your prompts are private.')}
            />
            Show my prompts in the game&apos;s stats
          </label>

          <h3>Cover</h3>
          {game.thumb ? (
            <img className="creations-cover-preview" src={game.thumb} alt={`${game.title} cover`} width={640} height={360} />
          ) : (
            <p className="muted small">No cover yet. It's taken from the game automatically once it shows something.</p>
          )}
          <button
            type="button"
            className="btn btn-ghost btn-sm"
            disabled={coverBusy || game.hidden}
            onClick={async () => {
              setCoverBusy(true);
              const ok = await saveCover(true);
              setCoverBusy(false);
              setNote(ok ? { text: 'Cover updated.' } : { error: 'The game was showing a blank screen. Play it to a good moment and try again.' });
            }}
          >
            {coverBusy ? 'Taking it…' : 'Use what\'s on screen now'}
          </button>

          <h3>Name</h3>
          <form
            className="creations-rename"
            onSubmit={(e) => {
              e.preventDefault();
              patch({ title }, 'Renamed.');
            }}
          >
            <input className="admin-input" value={title} maxLength={60} onChange={(e) => setTitle(e.target.value)} aria-label="Game name" />
            <button className="btn btn-ghost btn-sm" disabled={!title.trim() || title === game.title}>Save</button>
          </form>

          {note?.text && <p className="small">{note.text}</p>}
          {note?.error && <p className="error small">{note.error}</p>}

          <h3>History</h3>
          <ol className="creations-versions">
            {versions.map((v) => (
              <li key={v.version} className={v.version === preview ? 'version-on' : ''}>
                <div>
                  <strong>v{v.version}</strong>
                  {v.version === game.version && <span className="muted small"> · live</span>}
                  <p className="muted small">{v.request}</p>
                  <p className="muted small">{ago(v.created_at)}</p>
                </div>
                <div className="creations-version-actions">
                  {v.version !== preview && (
                    <button type="button" className="link-button small" onClick={() => { setErrors([]); setPreview(v.version); }}>Preview</button>
                  )}
                  {v.version !== game.version && (
                    <button type="button" className="link-button small" onClick={() => patch({ version: v.version }, `v${v.version} is live again.`)}>Restore</button>
                  )}
                </div>
              </li>
            ))}
          </ol>

          <button type="button" className="link-button small creations-delete" onClick={remove}>Delete this game</button>
        </aside>
      </div>

      <div id="store-manager">
        <StoreManager game={game} store={store} reload={reloadStore} onBuild={buildIn} building={gen.busy} />
      </div>

      <CreationStats id={game.id} owner refreshKey={`${game.version}:${game.versions}:${game.showPrompts}`} />
    </div>
  );
}

function Studio({ wallet, signOut }) {
  const router = useRouter();
  const [me, setMe] = useState(null);
  const [error, setError] = useState(null);

  const load = useCallback(async () => {
    const res = await fetch('/api/creations/mine');
    const d = await res.json().catch(() => ({}));
    if (res.status === 401) return signOut();
    if (!res.ok) return setError(d.error || 'Could not load your games.');
    setError(null);
    setMe(d);
  }, [signOut]);

  useEffect(() => {
    load();
  }, [load]);

  const selected = typeof router.query.game === 'string' ? router.query.game : null;
  if (selected) return <Editor id={selected} me={me} reload={load} />;

  return (
    <div className="container page">
      <Head>
        <title>Create a game · Indie Creations</title>
      </Head>
      <div className="page-head">
        <div>
          <p className="eyebrow">Create</p>
          <h1>Make a game with a prompt.</h1>
          <p className="muted">
            Describe it, Claude builds it in 3D, you play it here and ask for changes until it&apos;s right. Then publish it
            to the <Link href="/community">community page</Link>.
          </p>
        </div>
        <span className="pill pill-solid">
          Holder verified · {shortAddress(wallet)}{' '}
          <button type="button" className="link-button small" onClick={signOut}>Sign out</button>
        </span>
      </div>

      {error && <p className="error small">{error}</p>}
      {!me ? (
        <p className="muted">Checking your holdings…</p>
      ) : !me.available ? (
        <div className="card notice"><p>Game creation is switched off right now. Check back soon.</p></div>
      ) : (
        <>
          <Tiers me={me} />
          <NewGame me={me} onCreated={(g) => { load(); router.push(`/create?game=${g.id}`); }} />
          <GameList games={me.games} />
        </>
      )}
    </div>
  );
}

export default function Create() {
  const s = useHolderSession();
  if (!s.mounted || !s.checked) return <div className="container page" />;
  if (!s.sessionAddress) return <Gate s={s} />;
  return <Studio wallet={s.sessionAddress} signOut={s.signOut} />;
}
