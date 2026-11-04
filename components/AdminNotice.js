import { useEffect, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/router';
import useProfile from './useProfile';
import useStoreAccount from './useStoreAccount';

// For studio admins only (the server decides, /api/admin/notice): an Admin button in the header, and a notice after
// signing in when developer applications or game builds are waiting for review. Dismissed, it stays away for the
// browser session until something new is waiting.

const shared = { key: null, data: null, loading: null, listeners: new Set() };

function load(key, force = false) {
  if (!force && shared.key === key && (shared.data || shared.loading)) return;
  shared.key = key;
  shared.loading = fetch('/api/admin/notice', { cache: 'no-store' })
    .then((r) => r.json())
    .catch(() => ({ admin: false }))
    .then((data) => {
      if (shared.key !== key) return;
      shared.data = data;
      shared.listeners.forEach((fn) => fn(data));
    })
    .finally(() => {
      shared.loading = null;
    });
}

function useAdmin() {
  const { address } = useProfile();
  const { account } = useStoreAccount();
  const router = useRouter();
  const [data, setData] = useState(shared.data);
  const key = `${account?.id || ''}|${address || ''}`;
  // admins: recount on every page change (reviewing on /admin shrinks the queue)
  useEffect(() => {
    if (shared.data?.admin && shared.key === key && !shared.loading) load(key, true);
  }, [router.asPath]); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => {
    shared.listeners.add(setData);
    if (key === '|') {
      shared.key = key;
      shared.data = { admin: false };
      setData(shared.data);
    } else load(key);
    return () => shared.listeners.delete(setData);
  }, [key]);
  return data?.admin ? data : null;
}

const plural = (n, one, many) => `${n} ${n === 1 ? one : many}`;

export function AdminButton() {
  const admin = useAdmin();
  if (!admin) return null;
  const { applications, builds, adult } = admin.pending;
  const total = applications + builds + adult;
  return (
    <Link href="/admin" className="btn btn-ghost btn-sm admin-btn" title={total ? `${total} waiting for review` : 'Studio admin'}>
      Admin
      {total > 0 && <span className="admin-badge">{total}</span>}
    </Link>
  );
}

export function AdminToast() {
  const admin = useAdmin();
  const router = useRouter();
  const [hidden, setHidden] = useState(true);
  const p = admin?.pending;
  const total = p ? p.applications + p.builds + p.adult : 0;
  const counts = p ? [p.applications, p.builds, p.adult] : null;

  // shown again only when a queue grew since it was last dismissed in this browser session
  useEffect(() => {
    if (!counts || !total) return setHidden(true);
    let seen = [0, 0, 0];
    try {
      seen = JSON.parse(sessionStorage.getItem('ic-admin-notice') || '[0,0,0]');
    } catch {}
    setHidden(!counts.some((n, i) => n > (seen[i] || 0)));
    // reviewed items leave the queue: remember the smaller numbers, so the next arrival counts as new
    const lower = counts.map((n, i) => Math.min(n, seen[i] || 0));
    try {
      sessionStorage.setItem('ic-admin-notice', JSON.stringify(lower));
    } catch {}
  }, [counts?.join(','), total]); // eslint-disable-line react-hooks/exhaustive-deps

  const dismiss = () => {
    setHidden(true);
    try {
      sessionStorage.setItem('ic-admin-notice', JSON.stringify(counts));
    } catch {}
  };

  if (!admin || !total || hidden || router.pathname === '/admin') return null;
  const parts = [
    p.builds && plural(p.builds, 'game build', 'game builds'),
    p.adult && plural(p.adult, 'adult-lane build', 'adult-lane builds'),
    p.applications && plural(p.applications, 'developer application', 'developer applications'),
  ].filter(Boolean);
  return (
    <div className="admin-toast" role="status">
      <div>
        <strong>Waiting for review</strong>
        <p className="small">{parts.join(' · ')}</p>
      </div>
      <div className="admin-toast-actions">
        <Link href="/admin" className="btn btn-primary btn-sm" onClick={dismiss}>
          Open admin
        </Link>
        <button className="link-button small" onClick={dismiss}>
          Later
        </button>
      </div>
    </div>
  );
}
