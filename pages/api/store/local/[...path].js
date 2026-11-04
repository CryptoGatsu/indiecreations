import { BUILD_TYPES, extOf, localRead, storageMode } from '../../../../lib/platform/storage';

// GET -> a locally stored upload (development and tests only; production files are served by Blob).
export default function handler(req, res) {
  if (storageMode !== 'local') return res.status(404).end();
  const pathname = (req.query.path || []).join('/');
  if (!/^games\//.test(pathname)) return res.status(404).end();
  let file = null;
  try {
    file = localRead(pathname);
  } catch {}
  if (!file) return res.status(404).end();
  res.setHeader('Content-Type', BUILD_TYPES[extOf(pathname)] || 'application/octet-stream');
  res.setHeader('Cache-Control', 'no-store');
  // game frames run in an opaque origin (lib/platform/frame.js), so their requests here are cross-origin, like Blob's
  res.setHeader('Access-Control-Allow-Origin', '*');
  return res.status(200).send(file);
}
