import crypto from 'crypto';
import https from 'https';
import { rest } from '../../../lib/supabase';
import { listPrefix } from '../../../lib/platform/storage';

// TEMPORARY diagnostic (remove after debugging): GET ?build=<uuid> -> how each stored file of that build comes back
// from storage when asked the way a browser asks (raw bytes, not decoded): status, headers, size, checksum.
// Reveals nothing but file names and checksums, and only to someone who already has the build's id.
const AE = 'gzip, deflate, br, zstd';

function raw(url) {
  return new Promise((resolve, reject) => {
    const req = https.get(
      url,
      { headers: { 'accept-encoding': AE, origin: 'null', 'sec-fetch-mode': 'cors', 'user-agent': 'Mozilla/5.0 Chrome/131.0 Safari/537.36' } },
      (res) => {
        const chunks = [];
        res.on('data', (c) => chunks.push(c));
        res.on('end', () => resolve({ res, buf: Buffer.concat(chunks) }));
        res.on('error', reject);
      }
    );
    req.on('error', reject);
  });
}

export default async function handler(req, res) {
  res.setHeader('Cache-Control', 'no-store');
  const id = String(req.query.build || '');
  if (!/^[0-9a-f-]{36}$/.test(id)) return res.status(404).end();
  const [b] = await rest(`builds?id=eq.${id}&select=storage_prefix`);
  if (!b) return res.status(404).end();
  const files = await listPrefix(b.storage_prefix);
  const out = [];
  for (const f of files) {
    if (!/\.(unityweb|js)$/.test(f.pathname)) continue;
    const { res: r, buf } = await raw(f.url);
    out.push({
      path: f.pathname.slice(b.storage_prefix.length),
      listed: f.size,
      status: r.statusCode,
      headers: r.headers,
      gotRaw: buf.length,
      sha: crypto.createHash('sha256').update(buf).digest('hex').slice(0, 16),
      head: buf.subarray(0, 8).toString('hex'),
    });
  }
  return res.status(200).json(out);
}
