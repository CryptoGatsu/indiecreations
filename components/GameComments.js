import { useCallback, useEffect, useState } from 'react';
import Link from 'next/link';
import Avatar from './Avatar';
import useProfile from './useProfile';
import { COMMENT_MAX, shownName } from '../lib/profileRules';

export function timeAgo(iso) {
  const s = Math.max(1, Math.floor((Date.now() - Date.parse(iso)) / 1000));
  if (s < 60) return 'just now';
  const units = [['year', 31536000], ['month', 2592000], ['week', 604800], ['day', 86400], ['hour', 3600], ['minute', 60]];
  for (const [u, n] of units) if (s >= n) return `${Math.floor(s / n)} ${u}${Math.floor(s / n) === 1 ? '' : 's'} ago`;
  return 'just now';
}

// Under each game: a favourite button with the count, and the comments. Signed-in players (the free wallet sign-in)
// can comment and favourite; everyone can read.
export default function GameComments({ game }) {
  const me = useProfile();
  const [comments, setComments] = useState(null);
  const [favorites, setFavorites] = useState(0);
  const [more, setMore] = useState(false);
  const [canModerate, setCanModerate] = useState(false);
  const [text, setText] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(null);

  const load = useCallback(async (before = null) => {
    const res = await fetch(`/api/comments?game=${game.slug}${before ? `&before=${encodeURIComponent(before)}` : ''}`);
    const out = await res.json().catch(() => ({ comments: [] }));
    setComments((c) => (before ? [...(c || []), ...(out.comments || [])] : out.comments || []));
    setFavorites(out.favorites || 0);
    setMore(Boolean(out.more));
    setCanModerate(Boolean(out.canModerate));
  }, [game.slug]);

  useEffect(() => {
    load();
  }, [load]);

  const isFavorite = Boolean(me.profile?.favorites?.includes(game.slug));
  const toggleFavorite = async () => {
    if (!me.address) return;
    const on = !isFavorite;
    setFavorites((n) => Math.max(0, n + (on ? 1 : -1)));
    const res = await fetch('/api/profile/favorite', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ game: game.slug, favorite: on }),
    });
    const out = await res.json().catch(() => ({}));
    if (res.ok) me.update({ ...(me.profile || {}), address: me.address, favorites: out.favorites });
    else setFavorites((n) => Math.max(0, n + (on ? -1 : 1)));
  };

  const post = async (e) => {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      const res = await fetch('/api/comments', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ game: game.slug, body: text }),
      });
      const out = await res.json();
      if (!res.ok) throw new Error(out.error || 'Could not post.');
      setText('');
      setComments((c) => [{ ...out.comment, author: me.profile }, ...(c || [])]);
      if (!me.profile) me.refresh();
    } catch (err) {
      setError(err.message);
    } finally {
      setBusy(false);
    }
  };

  const remove = async (id) => {
    if (!window.confirm('Delete this comment?')) return;
    const res = await fetch(`/api/comments?id=${id}`, { method: 'DELETE' });
    if (res.ok) setComments((c) => c.filter((x) => x.id !== id));
  };

  const signInHref = `/profile?next=${encodeURIComponent(`/games/${game.slug}#comments`)}`;

  return (
    <section className="game-community" id="comments">
      <div className="game-community-head">
        <h2>Players talking</h2>
        {me.address ? (
          <button type="button" className={`fav-button ${isFavorite ? 'fav-on' : ''}`} aria-pressed={isFavorite} onClick={toggleFavorite}>
            {isFavorite ? '♥' : '♡'} Favourite · {favorites}
          </button>
        ) : (
          <Link href={signInHref} className="fav-button">
            ♡ Favourite · {favorites}
          </Link>
        )}
      </div>

      {me.address ? (
        <form className="comment-form" onSubmit={post}>
          <Avatar address={me.address} profile={me.profile} size={40} />
          <div className="comment-form-main">
            <textarea
              value={text}
              maxLength={COMMENT_MAX}
              rows={3}
              placeholder={`Say something about ${game.name}`}
              onChange={(e) => setText(e.target.value)}
            />
            <div className="admin-row">
              <button className="btn btn-primary btn-sm" disabled={busy || !text.trim()}>
                {busy ? 'Posting…' : 'Post'}
              </button>
              <span className="muted small">
                Posting as {shownName(me.profile, me.address)} · {text.length}/{COMMENT_MAX}
              </span>
              {error && <span className="error small">{error}</span>}
            </div>
          </div>
        </form>
      ) : (
        <div className="notice comment-signin">
          <p>Sign in with your wallet to comment and favourite games. It is a free message, not a transaction.</p>
          <Link href={signInHref} className="btn btn-primary btn-sm">
            Sign in
          </Link>
        </div>
      )}

      {comments === null ? (
        <p className="muted">Loading comments…</p>
      ) : comments.length === 0 ? (
        <p className="muted">No comments yet. Be the first.</p>
      ) : (
        <div className="comment-list">
          {comments.map((c) => (
            <article className="comment" key={c.id}>
              <Link href={`/u/${c.address}`} className="comment-avatar">
                <Avatar address={c.address} profile={c.author} size={40} />
              </Link>
              <div className="comment-main">
                <div className="comment-meta">
                  <Link href={`/u/${c.address}`}>
                    <strong>{shownName(c.author, c.address)}</strong>
                  </Link>
                  <span className="muted small">{timeAgo(c.createdAt)}</span>
                  {(me.address === c.address || canModerate) && (
                    <button className="link-button small" onClick={() => remove(c.id)}>
                      Delete
                    </button>
                  )}
                </div>
                <p className="comment-body">{c.body}</p>
              </div>
            </article>
          ))}
          {more && (
            <button className="btn btn-ghost btn-sm" onClick={() => load(comments[comments.length - 1].createdAt)}>
              Older comments
            </button>
          )}
        </div>
      )}
    </section>
  );
}
