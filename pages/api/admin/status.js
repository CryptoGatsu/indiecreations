import { adminStatus, requireAdmin } from '../../../lib/admin';

// GET -> everything the admin page shows (admins only).
export default async function handler(req, res) {
  if (req.method !== 'GET') return res.status(405).end();
  res.setHeader('Cache-Control', 'no-store');
  const admin = await requireAdmin(req, res);
  if (!admin) return;
  try {
    const status = await adminStatus();
    return res.status(200).send(JSON.stringify({ admin, ...status }, (_, v) => (typeof v === 'bigint' ? v.toString() : v)));
  } catch (err) {
    console.error('admin status failed:', err);
    return res.status(500).json({ error: err.shortMessage || err.message });
  }
}
