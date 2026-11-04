import { isAdmin } from '../../../lib/adminList';
import { readAccount } from '../../../lib/platform/auth';
import { ADMIN_COOKIE, readAdminToken, readPlayerWallet } from '../../../lib/session';
import { persistent, rest } from '../../../lib/supabase';

// GET -> { admin: false } or { admin: true, pending: { applications, builds, adult } } for the header's Admin button and
// the sign-in notice. Admin means a wallet this browser has proven it controls is on the admin list: one linked to the
// signed-in store account, the wallet sign-in (ic_player), or an admin page session. Nobody else learns anything,
// not even whether an address is an admin.
async function adminWallet(req) {
  const account = await readAccount(req).catch(() => null);
  const linked = (account?.wallets || []).find((w) => w.chain === 'evm' && isAdmin(w.address));
  if (linked) return linked.address;
  const player = await readPlayerWallet(req.cookies).catch(() => null);
  if (player && isAdmin(player)) return player;
  const token = await readAdminToken(req.cookies[ADMIN_COOKIE]).catch(() => null);
  if (token && isAdmin(token.address)) return token.address;
  return null;
}

export default async function handler(req, res) {
  res.setHeader('Cache-Control', 'private, no-store');
  if (req.method !== 'GET') return res.status(405).end();
  try {
    if (!(await adminWallet(req))) return res.status(200).json({ admin: false });
    if (!persistent) return res.status(200).json({ admin: true, pending: { applications: 0, builds: 0, adult: 0 } });
    const [applications, builds] = await Promise.all([
      rest('dev_applications?status=eq.submitted&select=id&limit=500'),
      rest('builds?status=eq.submitted&select=id,listing&limit=500'),
    ]);
    const adult = builds.filter((b) => b.listing?.adult === true).length;
    return res.status(200).json({
      admin: true,
      pending: { applications: applications.length, builds: builds.length - adult, adult },
    });
  } catch (err) {
    console.error('admin notice failed:', err);
    return res.status(200).json({ admin: false });
  }
}
