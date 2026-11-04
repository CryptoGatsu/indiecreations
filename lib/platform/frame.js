// Server-side only: the page a store game runs in.
//
// Vercel Blob never serves HTML as a page (it sends every .html as a download, with headers that forbid framing), so
// the site serves each build's index.html itself, from /api/store/frame/<buildId>. Everything else in the build (scripts,
// wasm, data, images) still loads straight from Blob: the page gets a <base> pointing at the build's folder there.
//
// The page is served on indiecreations.fun, so it is always sandboxed WITHOUT allow-same-origin (by its own
// Content-Security-Policy, which holds even when it's opened in a tab): the game runs in an opaque origin and can't
// read the site's cookies or call its APIs as the player. Its localStorage and sessionStorage are kept in memory for
// the session (a shim); Cache Storage looks absent and IndexedDB refuses to open. A dedicated play domain (PLATFORM_SPEC) lifts both limits later.
import { rest } from '../supabase';
import { readAdminToken, ADMIN_COOKIE } from '../session';
import { isAdmin } from '../adminList';
import { readAccount, StoreError } from './auth';
import { playable } from './storeGames';
import { isBlobStorage, localRead, storageMode } from './storage';
import { FRAME_SANDBOX, frameUrl } from './files';

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;

export { frameUrl };

export const FRAME_HEADERS = {
  'Content-Type': 'text/html; charset=utf-8',
  'Content-Security-Policy': `sandbox ${FRAME_SANDBOX}; frame-ancestors 'self'`,
  'Cache-Control': 'private, no-store',
  'Referrer-Policy': 'no-referrer',
  'X-Content-Type-Options': 'nosniff',
};

// In an opaque origin, touching localStorage or Cache Storage throws; many games (and Unity's loader) don't expect that.
// localStorage and sessionStorage are kept in memory instead; Cache Storage looks absent.
const STORAGE_SHIM =
  '<script>(function(){function m(){var d=Object.create(null);return{getItem:function(k){k=String(k);return k in d?d[k]:null},' +
  'setItem:function(k,v){d[String(k)]=String(v)},removeItem:function(k){delete d[String(k)]},clear:function(){d=Object.create(null)},' +
  'key:function(i){return Object.keys(d)[i]||null},get length(){return Object.keys(d).length}}}' +
  "['localStorage','sessionStorage'].forEach(function(n){try{window[n].length}catch(e){try{Object.defineProperty(window,n,{value:m(),configurable:true})}catch(x){}}});" +
  // merely reading window.caches throws here, which stalls Unity's loader cache; absent, it's skipped. (IndexedDB stays:
  // its open() throws, which Unity's PlayerPrefs storage handles by keeping them for the session only.)
  "try{window.caches}catch(e){try{Object.defineProperty(window,'caches',{value:undefined,configurable:true})}catch(x){}}})();</script>";

const escapeAttr = (s) => String(s).replace(/&/g, '&amp;').replace(/"/g, '&quot;').replace(/</g, '&lt;');

// The build's index.html with its own <base> tags replaced by one pointing at the build's folder in storage.
export function framePage(html, baseHref) {
  const head = `<base href="${escapeAttr(baseHref)}">${STORAGE_SHIM}`;
  const out = String(html).replace(/<base\b[^>]*>/gi, '');
  if (/<head\b[^>]*>/i.test(out)) return out.replace(/<head\b[^>]*>/i, (m) => m + head);
  if (/<html\b[^>]*>/i.test(out)) return out.replace(/<html\b[^>]*>/i, (m) => `${m}<head>${head}</head>`);
  return head + out;
}

// { html, baseHref } for a build this request may open, or throws a StoreError.
// The live build of a game: whoever may play it (same rules as /play). Any other build (in review, a draft, an old
// version): the studio's admins and the game's own developer only.
export async function frameFor(req, buildId) {
  if (!UUID.test(String(buildId))) throw new StoreError(404, 'No such build.');
  const [b] = await rest(`builds?id=eq.${buildId}&select=id,game_id,status,entry_url,storage_prefix`);
  if (!b || !b.entry_url) throw new StoreError(404, 'No such build.');
  const [g] = await rest(`games?id=eq.${b.game_id}&select=id,slug,dev_id,current_build`);
  if (!g) throw new StoreError(404, 'No such build.');

  const admin = await readAdminToken(req.cookies?.[ADMIN_COOKIE]).catch(() => null);
  const isStudio = Boolean(admin && isAdmin(admin.address));
  const account = await readAccount(req).catch(() => null);
  const isDeveloper = Boolean(account && account.id === g.dev_id);
  if (!isStudio && !isDeveloper) {
    if (b.status !== 'approved' || g.current_build !== b.id) throw new StoreError(404, 'No such build.');
    const out = await playable(account, g.slug);
    if (out.error) throw new StoreError(out.status, out.error);
  }

  const prefix = b.storage_prefix;
  if (isBlobStorage) {
    const res = await fetch(b.entry_url, { cache: 'no-store' });
    if (!res.ok) throw new StoreError(502, 'The game files could not be loaded.');
    return { html: await res.text(), baseHref: b.entry_url.replace(/[^/]*$/, '') };
  }
  if (storageMode === 'local') {
    const file = localRead(`${prefix}index.html`);
    if (!file) throw new StoreError(404, 'No such build.');
    return { html: file.toString('utf8'), baseHref: `/api/store/local/${prefix}` };
  }
  throw new StoreError(404, 'Uploads are not switched on.');
}
