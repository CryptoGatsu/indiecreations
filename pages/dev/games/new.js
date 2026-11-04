import Head from 'next/head';
import Link from 'next/link';
import { useRouter } from 'next/router';
import { useState } from 'react';
import StoreGate from '../../../components/StoreGate';
import BurnStep from '../../../components/BurnStep';
import { useDevState } from '../../../components/devShared';

// A new game: its title and web address, and the $50 new-game burn. The store page and build come next.

const slugify = (s) =>
  s
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 40);

export default function NewGame() {
  return (
    <div className="container page">
      <Head>
        <title>New game - Indie Creations developers</title>
      </Head>
      <StoreGate title="New game">{(account) => <NewGameForm account={account} />}</StoreGate>
    </div>
  );
}

function NewGameForm({ account }) {
  const router = useRouter();
  const { state, error } = useDevState();
  const [title, setTitle] = useState('');
  const [slug, setSlug] = useState('');
  const [slugEdited, setSlugEdited] = useState(false);
  const [burn, setBurn] = useState(null);
  const [status, setStatus] = useState(null);
  const [busy, setBusy] = useState(false);

  if (error) return <p className="error">{error}</p>;
  if (!state) return <p className="muted">Loading…</p>;
  if (!state.isDeveloper) {
    return (
      <div className="gate">
        <h1>New games need a developer account.</h1>
        <Link href="/dev" className="btn btn-primary">
          Developer dashboard
        </Link>
      </div>
    );
  }

  const create = async (e) => {
    e.preventDefault();
    setBusy(true);
    setStatus(null);
    try {
      const res = await fetch('/api/dev/games', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ slug, title, burn }),
      });
      const out = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(out.error || 'Could not create the game.');
      router.push(`/dev/games/${out.game.slug}`);
    } catch (err) {
      setStatus(err.message);
      setBusy(false);
    }
  };

  const haveBurn = burn || state.unusedBurn;
  return (
    <>
      <div className="page-head">
        <div>
          <p className="eyebrow">Developers</p>
          <h1>A new game.</h1>
          <p className="muted">
            Name it and pick its web address. Next you&apos;ll fill in the store page, upload the build and send it for
            review. Updates after the first approval are free.
          </p>
        </div>
      </div>
      <form className="dev-form" onSubmit={create}>
        <div className="card profile-form">
          <label className="field">
            <span>Title</span>
            <input
              className="admin-input"
              value={title}
              maxLength={60}
              onChange={(e) => {
                setTitle(e.target.value);
                if (!slugEdited) setSlug(slugify(e.target.value));
              }}
            />
          </label>
          <label className="field">
            <span>Web address</span>
            <div className="slug-input">
              <span className="muted">indiecreations.fun/games/</span>
              <input
                className="admin-input mono"
                value={slug}
                maxLength={40}
                onChange={(e) => {
                  setSlugEdited(true);
                  setSlug(slugify(e.target.value));
                }}
              />
            </div>
            <span className="muted small">3 to 40 lowercase letters, numbers and dashes. It can't be changed later.</span>
          </label>
        </div>
        {state.unusedBurn ? (
          <p className="notice small">You already have a confirmed burn waiting: it will be used for this game.</p>
        ) : burn ? (
          <p className="notice small">Burn confirmed. Create the game below.</p>
        ) : (
          <BurnStep purpose="new_game" usd={state.burnUsd.new_game} account={account} network={state.network} onDone={setBurn} />
        )}
        <div className="admin-row">
          <button className="btn btn-primary" type="submit" disabled={busy || !haveBurn || slug.length < 3 || title.trim().length < 2}>
            {busy ? 'Creating…' : 'Create the game'}
          </button>
          {status && <span className="error small">{status}</span>}
        </div>
      </form>
    </>
  );
}
