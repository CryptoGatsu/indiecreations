import { useEffect, useState } from 'react';

const SITE = 'https://www.indiecreations.fun';
const n = (v) => Number(v || 0).toLocaleString('en-US');

// "Share" for a public community game: shows its share card (cover, players, prompts; pages/api/creations/[id]/card.js)
// and passes the game's link on. The link's preview on X, Discord and the like is the same card (og:image).
export default function ShareGame({ game, className = 'btn btn-ghost btn-sm' }) {
  const [open, setOpen] = useState(false);
  if (!game?.card) return null;
  return (
    <>
      <button type="button" className={className} onClick={() => setOpen(true)}>Share</button>
      {open && <ShareDialog game={game} onClose={() => setOpen(false)} />}
    </>
  );
}

function ShareDialog({ game, onClose }) {
  const url = `${SITE}/community/${game.id}`;
  const [stats, setStats] = useState(null);
  const [note, setNote] = useState(null);
  const [cardFailed, setCardFailed] = useState(false);
  const canShare = typeof navigator !== 'undefined' && Boolean(navigator.share);

  useEffect(() => {
    fetch(`/api/creations/${game.id}/stats`, { cache: 'no-store' })
      .then((r) => (r.ok ? r.json() : null))
      .then(setStats)
      .catch(() => {});
  }, [game.id]);
  useEffect(() => {
    const onKey = (e) => e.key === 'Escape' && onClose();
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);

  const players = stats?.players ?? 0;
  const prompts = stats?.versions ?? game.versions ?? 1;
  const text = stats
    ? `Play "${game.title}" on Indie Creations: ${n(players)} ${players === 1 ? 'player has' : 'players have'} played it, and it took ${n(prompts)} ${prompts === 1 ? 'prompt' : 'prompts'} to make with Claude.`
    : `Play "${game.title}" on Indie Creations, made with Claude.`;

  const cardFile = async () => {
    const blob = await (await fetch(game.card)).blob();
    return new File([blob], `${game.title.replace(/[^\w-]+/g, '-').slice(0, 40) || 'game'}.png`, { type: 'image/png' });
  };

  const share = async () => {
    try {
      const file = await cardFile().catch(() => null);
      const withFile = file && navigator.canShare?.({ files: [file] });
      await navigator.share(withFile ? { files: [file], title: game.title, text: `${text} ${url}` } : { title: game.title, text, url });
    } catch (err) {
      if (err?.name !== 'AbortError') setNote('Could not open sharing here. Copy the link instead.');
    }
  };
  const copy = async () => {
    try {
      await navigator.clipboard.writeText(url);
      setNote('Link copied.');
    } catch {
      setNote(url);
    }
  };
  const download = async () => {
    try {
      const file = await cardFile();
      const a = document.createElement('a');
      a.href = URL.createObjectURL(file);
      a.download = file.name;
      a.click();
      setTimeout(() => URL.revokeObjectURL(a.href), 10_000);
    } catch {
      setNote('Could not download the card. Try again.');
    }
  };
  const xUrl = `https://x.com/intent/post?text=${encodeURIComponent(`${text} 🎮`)}&url=${encodeURIComponent(url)}`;

  return (
    <div className="modal-backdrop" onClick={onClose}>
      <div className="modal share-modal" role="dialog" aria-modal="true" aria-label={`Share ${game.title}`} onClick={(e) => e.stopPropagation()}>
        <div className="modal-head">
          <h3>Share this game</h3>
          <button className="modal-close" onClick={onClose} aria-label="Close">×</button>
        </div>
        {!cardFailed && (
          // eslint-disable-next-line @next/next/no-img-element
          <img className="share-card" src={game.card} width={1200} height={630} alt={`${game.title}: share card`} onError={() => setCardFailed(true)} />
        )}
        <p className="share-stats">
          <span><strong>{stats ? n(players) : '…'}</strong> {players === 1 ? 'player has' : 'players have'} played</span>
          <span><strong>{n(prompts)}</strong> {prompts === 1 ? 'prompt' : 'prompts'} to make it</span>
        </p>
        <div className="share-actions">
          {canShare && <button type="button" className="btn btn-primary" onClick={share}>Share…</button>}
          <a className={canShare ? 'btn btn-ghost' : 'btn btn-primary'} href={xUrl} target="_blank" rel="noreferrer">Post on X</a>
          <button type="button" className="btn btn-ghost" onClick={copy}>Copy link</button>
          <button type="button" className="btn btn-ghost" onClick={download}>Download card</button>
        </div>
        {note && <p className="muted small modal-error">{note}</p>}
      </div>
    </div>
  );
}
