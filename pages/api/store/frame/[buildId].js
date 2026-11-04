import { FRAME_HEADERS, frameFor, framePage } from '../../../../lib/platform/frame';
import { StoreError } from '../../../../lib/platform/auth';
import { persistent } from '../../../../lib/supabase';

// GET -> the page a store game runs in (its index.html, sandboxed, loading the rest of the build from storage).
// Opened in the /play and review frames, or in a tab. See lib/platform/frame.js.
const message = (text) =>
  `<!doctype html><meta charset="utf-8"><body style="margin:0;display:grid;place-items:center;height:100vh;background:#0b0b0d;color:#ddd;font:15px system-ui,sans-serif;text-align:center;padding:16px">${text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')}</body>`;

export default async function handler(req, res) {
  if (req.method !== 'GET' && req.method !== 'HEAD') return res.status(405).end();
  for (const [k, v] of Object.entries(FRAME_HEADERS)) res.setHeader(k, v);
  if (!persistent) return res.status(404).send(message('The store is not switched on yet.'));
  try {
    const { html, baseHref } = await frameFor(req, String(req.query.buildId || ''));
    return res.status(200).send(framePage(html, baseHref));
  } catch (err) {
    if (err instanceof StoreError) return res.status(err.status).send(message(err.message));
    console.error('store frame failed:', err);
    return res.status(500).send(message('Something went wrong loading this game. Try again shortly.'));
  }
}
