import { useEffect, useState } from 'react';
import Link from 'next/link';
import { TOKEN_TICKER } from '../lib/config';
import { CREATOR_PERCENT, ITEMS_MAX, ITEM_USD_MAX, ITEM_USD_MIN } from '../lib/creations';

// The creator's side of a game's store (/create): add, edit and take items off sale, see what sold and what they
// earned. A new item only does something once the game knows about it, so each one offers to have Claude build it in.
const usd = (n) => n.toLocaleString('en-US', { style: 'currency', currency: 'USD' });
const tokens = (v) => Number(v || 0).toLocaleString('en-US', { maximumFractionDigits: 2 });

async function send(url, method, body) {
  const res = await fetch(url, { method, headers: { 'Content-Type': 'application/json' }, body: body && JSON.stringify(body) });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.error || 'Could not save.');
  return data;
}

function ItemForm({ initial, submitLabel, onSubmit, onCancel }) {
  const [name, setName] = useState(initial?.name || '');
  const [description, setDescription] = useState(initial?.description || '');
  const [price, setPrice] = useState(initial ? String(initial.usd) : '');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(null);

  const submit = async (e) => {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      await onSubmit({ name, description, usd: Number(price) });
    } catch (err) {
      setError(err.message);
      setBusy(false);
    }
  };

  return (
    <form className="creations-item-form" onSubmit={submit}>
      <label className="field">
        Name
        <input className="admin-input" value={name} maxLength={40} onChange={(e) => setName(e.target.value)} placeholder="Golden ship skin" required />
      </label>
      <label className="field">
        What it does in the game
        <textarea value={description} maxLength={200} onChange={(e) => setDescription(e.target.value)} placeholder="Turns your ship gold with a sparkling trail." />
      </label>
      <label className="field creations-price">
        Price (US dollars, paid in {TOKEN_TICKER})
        <input
          className="admin-input"
          type="number"
          min={ITEM_USD_MIN}
          max={ITEM_USD_MAX}
          step="0.01"
          value={price}
          onChange={(e) => setPrice(e.target.value)}
          placeholder="2.00"
          required
        />
      </label>
      <div className="actions">
        <button className="btn btn-primary btn-sm" disabled={busy}>{busy ? 'Saving…' : submitLabel}</button>
        {onCancel && <button type="button" className="btn btn-ghost btn-sm" onClick={onCancel}>Cancel</button>}
      </div>
      {error && <p className="error small">{error}</p>}
    </form>
  );
}

export default function StoreManager({ game, store, reload, onBuild, building }) {
  const [adding, setAdding] = useState(false);
  const [editing, setEditing] = useState(null);
  const [note, setNote] = useState(null);
  const [earnings, setEarnings] = useState(null);

  useEffect(() => {
    fetch('/api/creations/earnings', { cache: 'no-store' })
      .then((r) => (r.ok ? r.json() : null))
      .then(setEarnings)
      .catch(() => {});
  }, [store]);

  if (!store) return null;
  const base = `/api/creations/${game.id}/items`;
  const act = async (fn, ok) => {
    setNote(null);
    try {
      await fn();
      if (ok) setNote({ text: ok });
      await reload();
    } catch (err) {
      setNote({ error: err.message });
    }
  };
  const build = (item) =>
    onBuild(`Add the store item "${item.name}" (id ${item.id}) to the game${item.description ? `: ${item.description}` : ''}.`);

  return (
    <section className="card creations-store-manager">
      <div className="creations-store-head">
        <h2>Your store</h2>
        <p className="muted small">
          Sell items for this game. Players pay in {TOKEN_TICKER}; you get {CREATOR_PERCENT}% of every sale, paid with
          the monthly payout and claimed on <Link href="/rewards">Rewards</Link>. The rest goes to the Indie Creations
          treasury, which shares its revenue with holders.
          {!game.published && ' The store opens when the game is published.'}
        </p>
      </div>

      <div className="creations-stat-grid creations-store-stats">
        <div className="creations-stat"><strong>{(store.sales?.sold || 0).toLocaleString('en-US')}</strong><span>items sold</span></div>
        <div className="creations-stat"><strong>{usd((store.sales?.usdCents || 0) / 100)}</strong><span>in sales</span></div>
        <div className="creations-stat"><strong>{tokens(store.sales?.earned)}</strong><span>{TOKEN_TICKER} earned (your {CREATOR_PERCENT}%)</span></div>
        {earnings && !earnings.unavailable && (
          <div className="creations-stat">
            <strong>{tokens(earnings.waiting.amount)}</strong>
            <span>{TOKEN_TICKER} in your next payout (all your games)</span>
          </div>
        )}
      </div>

      {store.items.length > 0 && (
        <ul className="creations-store-list">
          {store.items.map((item) =>
            editing === item.id ? (
              <li key={item.id}>
                <ItemForm
                  initial={item}
                  submitLabel="Save"
                  onCancel={() => setEditing(null)}
                  onSubmit={async (v) => {
                    await send(`${base}/${item.id}`, 'PATCH', v);
                    setEditing(null);
                    await reload();
                    setNote({ text: `Saved. If what it does changed, build it into the game again.` });
                  }}
                />
              </li>
            ) : (
              <li key={item.id}>
                <div className="creations-store-row">
                  <div>
                    <strong>{item.name}</strong> <span className="muted small">· {usd(item.usd)} · {item.sold} sold</span>
                    {!item.available && <span className="pill creations-pill-off">Off sale</span>}
                    {item.description && <p className="muted small">{item.description}</p>}
                    <p className="muted small mono">{item.id}</p>
                  </div>
                  <div className="creations-store-row-actions">
                    <button type="button" className="btn btn-ghost btn-sm" disabled={building} onClick={() => build(item)}>
                      Build into the game
                    </button>
                    <button type="button" className="link-button small" onClick={() => setEditing(item.id)}>Edit</button>
                    <button
                      type="button"
                      className="link-button small"
                      onClick={() => act(() => send(`${base}/${item.id}`, 'PATCH', { available: !item.available }), item.available ? 'Taken off sale.' : 'Back on sale.')}
                    >
                      {item.available ? 'Take off sale' : 'Put on sale'}
                    </button>
                    {item.sold === 0 && (
                      <button
                        type="button"
                        className="link-button small"
                        onClick={() => window.confirm(`Delete "${item.name}"?`) && act(() => send(`${base}/${item.id}`, 'DELETE'), 'Deleted.')}
                      >
                        Delete
                      </button>
                    )}
                  </div>
                </div>
              </li>
            )
          )}
        </ul>
      )}

      {adding ? (
        <ItemForm
          submitLabel="Add item"
          onCancel={() => setAdding(false)}
          onSubmit={async (v) => {
            const { item } = await send(base, 'POST', v);
            setAdding(false);
            await reload();
            setNote({ text: `Added. Now build "${item.name}" into the game so it does something.`, item });
          }}
        />
      ) : (
        store.items.length < ITEMS_MAX &&
        !game.hidden && (
          <button type="button" className="btn btn-ghost btn-sm" onClick={() => setAdding(true)}>
            Add an item
          </button>
        )
      )}

      {note?.text && (
        <p className="small creations-store-note">
          {note.text}{' '}
          {note.item && (
            <button type="button" className="link-button small" disabled={building} onClick={() => build(note.item)}>
              Build it in now
            </button>
          )}
        </p>
      )}
      {note?.error && <p className="error small">{note.error}</p>}
    </section>
  );
}
