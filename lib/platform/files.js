// Browser-safe: what may be uploaded to the store and where it goes (used by the upload page and the server alike).
//
// Paths: games/<game id>/builds/<build id>/<file path in the build>   games/<game id>/media/<random>.<ext>
export const MAX_BUILD_FILE_BYTES = 300 * 1024 * 1024;
export const MAX_BUILD_BYTES = 800 * 1024 * 1024;
export const MAX_BUILD_FILES = 3000;
export const MAX_IMAGE_BYTES = 5 * 1024 * 1024;

// What a web game build may contain (PLATFORM_SPEC 20: file-type allowlist, no executables).
export const BUILD_TYPES = {
  html: 'text/html', htm: 'text/html', js: 'text/javascript', mjs: 'text/javascript',
  css: 'text/css', json: 'application/json', wasm: 'application/wasm', data: 'application/octet-stream',
  unityweb: 'application/octet-stream', mem: 'application/octet-stream', symbols: 'application/octet-stream',
  bin: 'application/octet-stream', map: 'application/json', txt: 'text/plain', md: 'text/plain', xml: 'application/xml',
  csv: 'text/csv', webmanifest: 'application/manifest+json',
  png: 'image/png', jpg: 'image/jpeg', jpeg: 'image/jpeg', webp: 'image/webp', gif: 'image/gif', svg: 'image/svg+xml',
  ico: 'image/x-icon', bmp: 'image/bmp', avif: 'image/avif', ktx2: 'image/ktx2', basis: 'application/octet-stream',
  mp3: 'audio/mpeg', ogg: 'audio/ogg', wav: 'audio/wav', m4a: 'audio/mp4', aac: 'audio/aac', flac: 'audio/flac',
  mp4: 'video/mp4', webm: 'video/webm', ogv: 'video/ogg',
  woff: 'font/woff', woff2: 'font/woff2', ttf: 'font/ttf', otf: 'font/otf', eot: 'application/vnd.ms-fontobject',
  glb: 'model/gltf-binary', gltf: 'model/gltf+json', atlas: 'text/plain', fnt: 'text/plain', tmx: 'application/xml',
  br: 'application/octet-stream', gz: 'application/octet-stream',
};
export const IMAGE_TYPES = { png: 'image/png', jpg: 'image/jpeg', jpeg: 'image/jpeg', webp: 'image/webp', gif: 'image/gif' };

export const extOf = (p) => (/\.([a-z0-9]+)$/i.exec(p)?.[1] || '').toLowerCase();

// A safe relative path inside a build: plain segments, no "..", no hidden files, an allowed type.
export function cleanBuildPath(rel) {
  const p = String(rel || '');
  if (!p || p.length > 300 || p.startsWith('/') || p.includes('\\')) return null;
  const parts = p.split('/');
  if (parts.length > 12) return null;
  if (parts.some((s) => !s || s === '.' || s === '..' || s.startsWith('.') || !/^[A-Za-z0-9 _().@+\-]+(\.[A-Za-z0-9_\-]+)*$/.test(s))) return null;
  return BUILD_TYPES[extOf(p)] ? p : null;
}

// Where a build is played: the site serves its index.html (lib/platform/frame.js); the rest loads from storage.
export const frameUrl = (buildId) => `/api/store/frame/${buildId}`;
// What a game may do in its frame. Never allow-same-origin: the frame page is served from the site's own domain.
export const FRAME_SANDBOX = 'allow-scripts allow-pointer-lock allow-forms allow-popups allow-modals allow-orientation-lock allow-downloads';

export const buildPrefix = (gameId, buildId) => `games/${gameId}/builds/${buildId}/`;
export const mediaPrefix = (gameId) => `games/${gameId}/media/`;

// What a pathname a browser wants to upload to is: { kind: 'build', gameId, buildId, rel } or { kind: 'media', gameId, name }.
export function parseUploadPath(pathname) {
  let m = /^games\/([0-9a-f-]{36})\/builds\/([0-9a-f-]{36})\/(.+)$/.exec(String(pathname));
  if (m) {
    const rel = cleanBuildPath(m[3]);
    return rel ? { kind: 'build', gameId: m[1], buildId: m[2], rel, contentType: BUILD_TYPES[extOf(rel)] } : null;
  }
  m = /^games\/([0-9a-f-]{36})\/media\/([0-9a-f]{16,40})\.(png|jpg|jpeg|webp|gif)$/.exec(String(pathname));
  if (m) return { kind: 'media', gameId: m[1], name: `${m[2]}.${m[3]}`, contentType: IMAGE_TYPES[m[3]] };
  return null;
}

