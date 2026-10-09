import { useCallback, useEffect, useMemo, useState } from 'react';
import Head from 'next/head';
import Link from 'next/link';
import { useRouter } from 'next/router';
import CreationStats, { useGamePresence } from '../../components/CreationStats';
import CreatorStore, { useCreatorStore } from '../../components/CreatorStore';
import useProfile from '../../components/useProfile';
import GameSandbox from '../../components/GameSandbox';
import ShareGame from '../../components/ShareGame';
import { LINKS, shortAddress } from '../../lib/config';
import { rawUrl } from '../../lib/creations';

const SITE = 'https://www.indiecreations.fun';

// Only what a link preview needs, rendered on the server so X, Discord and the like see it: the share card as the image.
export async function getServerSideProps({ params, res }) {
  const { isGameId } = await import('../../lib/creations');
  const { getGame } = await import('../../lib/creationStore');
  const { gameView, isPublic } = await import('../../lib/creators');
  let meta = null;
  try {
    const game = isGameId(params.id) ? await getGame(params.id) : null;
    if (isPublic(game)) {
      const v = gameView(game);
      meta = { title: v.title, description: v.description || 'A community game made with Claude.', image: `${SITE}${v.card}`, url: `${SITE}/community/${v.id}` };
      res.setHeader('Cache-Control', 'public, s-maxage=60, stale-while-revalidate=600');
    }
  } catch (err) {
    console.error('community game meta failed:', err);
  }
  return { props: { meta } };
}

function PreviewMeta({ meta }) {
  if (!meta) return null;
  return (
    <Head>
      <title>{`${meta.title} · Community games · Indie Creations`}</title>
      <meta name="description" content={meta.description} />
      <meta property="og:title" content={meta.title} key="og:title" />
      <meta property="og:description" content={meta.description} key="og:description" />
      <meta property="og:image" content={meta.image} key="og:image" />
      <meta property="og:image:width" content="1200" />
      <meta property="og:image:height" content="630" />
      <meta property="og:url" content={meta.url} />
      <meta name="twitter:card" content="summary_large_image" key="twitter:card" />
      <meta name="twitter:image" content={meta.image} />
    </Head>
  );
}

// One community game: the game in its sandbox, who made it, and a way to report it.
export default function CommunityGame({ meta }) {
  const { query, isReady } = useRouter();
  const [data, setData] = useState(null);
  const [error, setError] = useState(null);
  const [reporting, setReporting] = useState(false);
  const [reason, setReason] = useState('');
  const [reportNote, setReportNote] = useState(null);
  const [loaded, setLoaded] = useState(false);
  const profile = useProfile(); // names the player in online rooms
  const onLoaded = useCallback(() => setLoaded(true), []);
  // only published games count players: a creator opening their draft here doesn't
  useGamePresence(data?.game?.published && !data.game.hidden ? data.game.id : null, loaded);

  // the creator's store: what this player owns goes into the game, and the game can ask to open the store
  const { data: store, reload: reloadStore } = useCreatorStore(data?.game?.id);
  const gameStore = useMemo(() => (store ? { items: store.items.filter((i) => i.available), owned: store.owned } : null), [store]);
  const [focus, setFocus] = useState(undefined);
  const onOpenStore = useCallback((itemId) => setFocus(itemId), []);
  const onFocusDone = useCallback(() => setFocus(undefined), []);

  useEffect(() => {
    if (!isReady) return;
    fetch(`/api/creations/${query.id}`)
      .then(async (r) => {
        const d = await r.json().catch(() => ({}));
        if (!r.ok) throw new Error(d.error || 'Game not found.');
        setData(d);
        // one play per visit
        const key = `ic-played-${query.id}`;
        try {
          if (sessionStorage.getItem(key)) return;
          sessionStorage.setItem(key, '1');
        } catch {}
        fetch(`/api/creations/${query.id}/play`, { method: 'POST' }).catch(() => {});
      })
      .catch((err) => setError(err.message));
  }, [isReady, query.id]);

  const report = async (e) => {
    e.preventDefault();
    const res = await fetch(`/api/creations/${query.id}/report`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ reason }),
    });
    const d = await res.json().catch(() => ({}));
    if (!res.ok) return setReportNote({ error: d.error || 'Could not send the report.' });
    setReporting(false);
    setReportNote({ text: 'Thanks. The studio will take a look.' });
  };

  if (error) {
    return (
      <div className="container page">
        <div className="gate">
          <h1>Game not found</h1>
          <p className="muted">It may have been unpublished or removed.</p>
          <Link href="/community" className="btn btn-primary">More community games</Link>
        </div>
      </div>
    );
  }
  if (!data) {
    return (
      <div className="container page">
        <PreviewMeta meta={meta} />
        <p className="muted">Loading…</p>
      </div>
    );
  }

  const { game } = data;
  return (
    <div className="container page">
      <PreviewMeta meta={meta} />
      <Head>
        <title>{`${game.title} · Community games · Indie Creations`}</title>
        <meta name="description" content={game.description} />
      </Head>
      <div className="page-head">
        <div>
          <p className="eyebrow"><Link href="/community">Community games</Link></p>
          <h1>{game.title}</h1>
          <p className="muted">{game.description}</p>
          <p className="muted small">
            Made by{' '}
            <a href={`${LINKS.explorer}/address/${game.owner}`} target="_blank" rel="noreferrer" className="mono">{shortAddress(game.owner)}</a>{' '}
            with Claude
            {game.hidden ? ' · Taken down' : !game.published && ' · Draft: only you can see it'}
          </p>
        </div>
        <div className="actions creations-head-actions">
          {data.owner && <Link href={`/create?game=${game.id}`} className="btn btn-ghost btn-sm">Edit</Link>}
          <ShareGame game={game} />
          <Link href="/create" className="btn btn-primary btn-sm">Make your own</Link>
        </div>
      </div>

      <GameSandbox
        src={rawUrl(game.id, game.version)}
        title={game.title}
        onLoaded={onLoaded}
        store={gameStore}
        onOpenStore={onOpenStore}
        net={{
          gameId: game.id,
          version: game.version,
          wallet: profile.address,
          room: typeof query.room === 'string' ? query.room.toUpperCase() : null,
          inviteUrl: game.published && !game.hidden ? (code) => `${window.location.origin}/community/${game.id}?room=${code}` : null,
        }}
      />

      <CreatorStore gameId={game.id} store={store} reload={reloadStore} focus={focus} onFocusDone={onFocusDone} />

      <CreationStats id={game.id} />

      {data.admin && data.reports?.length > 0 && (
        <div className="card creations-errors">
          <h3>Reports (studio only)</h3>
          <ul>
            {data.reports.map((r) => (
              <li key={r.reporter} className="small">{new Date(r.at).toLocaleString()}: {r.reason || 'no reason given'}</li>
            ))}
          </ul>
        </div>
      )}

      <div className="creations-report">
        {reportNote?.text ? (
          <p className="muted small">{reportNote.text}</p>
        ) : reporting ? (
          <form onSubmit={report} className="card">
            <h3>Report this game</h3>
            <p className="muted small">Offensive, broken, or asking for something it shouldn&apos;t (like a seed phrase)? Tell the studio.</p>
            <textarea value={reason} onChange={(e) => setReason(e.target.value)} maxLength={500} placeholder="What's wrong with it?" />
            <div className="actions">
              <button className="btn btn-primary btn-sm">Send report</button>
              <button type="button" className="btn btn-ghost btn-sm" onClick={() => setReporting(false)}>Cancel</button>
            </div>
            {reportNote?.error && <p className="error small">{reportNote.error}</p>}
          </form>
        ) : (
          <button type="button" className="link-button small" onClick={() => setReporting(true)}>Report this game</button>
        )}
      </div>
    </div>
  );
}
