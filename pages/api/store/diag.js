import crypto from 'crypto';
import { rest } from '../../../lib/supabase';
import { listPrefix } from '../../../lib/platform/storage';

// TEMPORARY diagnostic (remove after debugging): GET ?build=<uuid> -> how each stored file of that build comes back
// from storage (status, headers, size, checksum, first bytes). Reveals nothing but file names and checksums, and only
// to someone who already has the build's id.
export default async function handler(req, res) {
  res.setHeader('Cache-Control', 'no-store');
  const id = String(req.query.build || '');
  if (!/^[0-9a-f-]{36}$/.test(id)) return res.status(404).end();
  const [b] = await rest(`builds?id=eq.${id}&select=storage_prefix`);
  if (!b) return res.status(404).end();
  const files = await listPrefix(b.storage_prefix);
  const out = [];
  for (const f of files) {
    const r = await fetch(f.url, { headers: { 'accept-encoding': 'identity' }, cache: 'no-store' });
    const buf = Buffer.from(await r.arrayBuffer());
    const h = (k) => r.headers.get(k);
    out.push({
      path: f.pathname.slice(b.storage_prefix.length),
      listed: f.size,
      status: r.status,
      type: h('content-type'),
      encoding: h('content-encoding'),
      length: h('content-length'),
      cors: h('access-control-allow-origin'),
      got: buf.length,
      sha: crypto.createHash('sha256').update(buf).digest('hex').slice(0, 16),
      head: buf.subarray(0, 8).toString('hex'),
    });
  }
  return res.status(200).json(out);
}
