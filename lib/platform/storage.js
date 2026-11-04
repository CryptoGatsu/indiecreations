// Server-side only: where game builds and store-page images are kept.
//
// Production: a PUBLIC Vercel Blob store (GAMES_BLOB_READ_WRITE_TOKEN, the "indiecreations-games" store, connected
// with the GAMES_BLOB prefix). Files are served from the Blob domain, never from indiecreations.fun, so a game can
// never read the store's cookies. Browsers upload straight to Blob with a short token the site issues per file
// (/api/store/upload), so builds never pass through a serverless function.
// Local development and tests: STORE_LOCAL_STORAGE=<folder> keeps files on disk and serves them from
// /api/store/local/... (same origin: for testing only, refused in production).
import fs from 'fs';
import path from 'path';

// Two ways to reach the Blob store: a read-write token (GAMES_BLOB_READ_WRITE_TOKEN), or the newer keyless connection
// (GAMES_BLOB_STORE_ID, signed in with the deployment's own Vercel OIDC token; uploads then use presigned URLs whose
// completion callbacks are checked with GAMES_BLOB_WEBHOOK_PUBLIC_KEY). Connecting the store in the dashboard sets one
// or the other.
export const BLOB_TOKEN = process.env.GAMES_BLOB_READ_WRITE_TOKEN || '';
export const BLOB_STORE_ID = process.env.GAMES_BLOB_STORE_ID || '';
export const BLOB_WEBHOOK_PUBLIC_KEY = process.env.GAMES_BLOB_WEBHOOK_PUBLIC_KEY || '';
export const blobAuthKind = BLOB_TOKEN ? 'token' : BLOB_STORE_ID ? 'oidc' : null;
// Options that point a @vercel/blob server call at the games store (never at the playtest store's default env).
export const blobAuth = () => (BLOB_TOKEN ? { token: BLOB_TOKEN } : { storeId: BLOB_STORE_ID });
export const LOCAL_DIR =
  process.env.STORE_LOCAL_STORAGE && process.env.VERCEL_ENV !== 'production' ? path.resolve(process.env.STORE_LOCAL_STORAGE) : '';
// What the browser uploads with: 'blob' (client token), 'blob-presigned' (presigned URL), 'local', or 'off'.
export const storageMode = blobAuthKind === 'token' ? 'blob' : blobAuthKind === 'oidc' ? 'blob-presigned' : LOCAL_DIR ? 'local' : 'off';
export const isBlobStorage = storageMode === 'blob' || storageMode === 'blob-presigned';

export {
  MAX_BUILD_FILE_BYTES,
  MAX_BUILD_BYTES,
  MAX_BUILD_FILES,
  MAX_IMAGE_BYTES,
  BUILD_TYPES,
  IMAGE_TYPES,
  extOf,
  cleanBuildPath,
  buildPrefix,
  mediaPrefix,
  parseUploadPath,
} from './files';
import { MAX_BUILD_FILES } from './files';

// ---- local backend (development and tests only)
function localFile(pathname) {
  const full = path.resolve(LOCAL_DIR, pathname);
  if (!full.startsWith(LOCAL_DIR + path.sep)) throw new Error('bad path');
  return full;
}
export function localWrite(pathname, buffer) {
  const full = localFile(pathname);
  fs.mkdirSync(path.dirname(full), { recursive: true });
  fs.writeFileSync(full, buffer);
}
export function localRead(pathname) {
  const full = localFile(pathname);
  return fs.existsSync(full) && fs.statSync(full).isFile() ? fs.readFileSync(full) : null;
}

// Every file stored under a prefix: [{ pathname, url, size }].
export async function listPrefix(prefix) {
  if (isBlobStorage) {
    const { list } = await import('@vercel/blob');
    const out = [];
    let cursor;
    do {
      const page = await list({ prefix, cursor, limit: 1000, ...blobAuth() });
      for (const b of page.blobs) out.push({ pathname: b.pathname, url: b.url, size: b.size });
      cursor = page.hasMore ? page.cursor : undefined;
    } while (cursor && out.length <= MAX_BUILD_FILES);
    return out;
  }
  if (storageMode === 'local') {
    const root = localFile(prefix.replace(/\/$/, '') + '/x').replace(/[/\\]x$/, '');
    if (!fs.existsSync(root)) return [];
    const out = [];
    const walk = (dir) => {
      for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
        const full = path.join(dir, e.name);
        if (e.isDirectory()) walk(full);
        else {
          const pathname = path.relative(LOCAL_DIR, full).split(path.sep).join('/');
          out.push({ pathname, url: `/api/store/local/${pathname}`, size: fs.statSync(full).size });
        }
      }
    };
    walk(root);
    return out;
  }
  return [];
}

// The public URL a stored file is served from (for a pathname the site uploaded or listed).
export function publicUrl(pathname, listed) {
  if (listed?.url) return listed.url;
  if (storageMode === 'local') return `/api/store/local/${pathname}`;
  return null;
}
