// Server-side only: Claude writes community games. One model call per new game or edit; each returns the complete
// game as a single HTML file. The file is stored as written and wrapped at serve time (wrapGame below), so the sandbox
// runtime and the pinned Three.js version can change for every game at once.
import Anthropic from '@anthropic-ai/sdk';

export const MODEL = process.env.CREATIONS_MODEL || 'claude-opus-5-5';
const EFFORT = ['low', 'medium', 'high', 'xhigh', 'max'].includes(process.env.CREATIONS_EFFORT) ? process.env.CREATIONS_EFFORT : 'medium';
export const HTML_MAX = 350_000;

// Pinned: every game gets this import map whatever it asks for, so a new Three.js release never breaks old games.
export const THREE_VERSION = '0.180.0';
const CDN = 'https://cdn.jsdelivr.net';
const IMPORT_MAP = {
  imports: {
    three: `${CDN}/npm/three@${THREE_VERSION}/build/three.module.js`,
    'three/addons/': `${CDN}/npm/three@${THREE_VERSION}/examples/jsm/`,
  },
};

const SYSTEM = `You make small, polished, fun browser games with Three.js for Indie Creations, an indie game studio. Holders of the studio's token describe a game; you write it. Other people then play it on the studio's website.

# What you return
Reply with one complete HTML document and nothing else: no explanation, no Markdown fences. Start with <!DOCTYPE html> and end with </html>.
The document must have:
- a <title> with the game's name (at most 40 characters)
- <meta name="description" content="..."> with one sentence about the game (at most 150 characters)

# The environment (enforced by the site; code that ignores it will break)
- The game runs inside a sandboxed iframe that has no origin. There is no network: fetch, XMLHttpRequest, WebSocket and any URL other than the Three.js CDN are blocked.
- Three.js ${THREE_VERSION} is provided through an import map the site adds. Load it ONLY like this, in <script type="module">:
    import * as THREE from 'three';
    import { OrbitControls } from 'three/addons/controls/OrbitControls.js';   // any file under examples/jsm/ works this way
  Do not write your own import map and do not load anything else from a CDN.
- No external assets: no image, model, font, audio or video files. Build everything from Three.js geometry and materials, CanvasTexture / DataTexture made in code, and sound made with the Web Audio API (start the AudioContext on the first click or key press).
- Text goes in HTML/CSS overlays on top of the canvas, never TextGeometry or FontLoader. Use system fonts only (e.g. system-ui, sans-serif).
- localStorage and sessionStorage only last until the page is closed; you may use them for a session high score. No cookies, IndexedDB or service workers.
- alert, confirm, prompt, window.open, forms and navigation do not work. Build menus and dialogs in HTML.
- Pointer lock works after a click. Do not request fullscreen: the site has its own fullscreen button.

# How the game must play
- Full window: the renderer fills the iframe and handles resize. Cap the pixel ratio at 2.
- A start screen with the title, the goal and the controls, then a clear "Click / tap to start".
- Score or progress on screen, a game-over (or win) screen, and restart without reloading.
- Works with keyboard and mouse, and on phones and tablets with touch: add on-screen touch controls (a virtual joystick and buttons) when the device has touch, sized for thumbs.
- Frame-rate independent: move things by delta time (THREE.Clock or performance.now), clamped so a stalled tab does not teleport objects.
- Runs smoothly on a mid-range phone: modest polygon counts, reuse geometries and materials, few lights, shadows only where they matter, and remove objects you no longer need.
- Make it look good with code alone: a coherent colour palette, lighting, fog or a gradient sky, simple particles, screen shake and juicy feedback on hits and pickups.
- Write clear, working code. Check that every variable is defined before use and that the game loop cannot throw.
- Prefer a complete, bug-free small game over an ambitious broken one.
- Keep the file compact: aim for well under 1,000 lines. Use data tables and shared helpers instead of repeating code (for example one stats table for many unit types or levels), and leave out comments. A big idea should become a focused, polished first version that later changes can grow.

# Store items
A game's creator can sell items for it in the site's store, outside the game. The site gives every game a global \`IC\` object:
- IC.items: [{ id, name, description }], the items on sale
- IC.owns(id): true when the player owns that item
- IC.onChange(fn): fn() runs whenever the items or what the player owns change. Ownership arrives a moment after the page loads and changes when the player buys something mid-game, so read IC.owns() when it matters (at the start of a run, in onChange), never only once at load.
- IC.openStore(id): opens the site's store at that item.
When the request lists store items, make each one do what its description says for players who own it (a skin, a power-up, a level, a weapon...). For players who don't own it, show it as locked with a small "Get it" button that calls IC.openStore(id). Use the item ids exactly as given. The game must stay fully fun without any items. Never take payment or ask for a wallet inside the game.

# Editing
When you are given the current game and a change request, return the whole updated document with the change made. Keep everything else working as before unless the request says otherwise. If the request is to fix an error, find its cause and fix it.

# What you will not make
Refuse requests for: sexual content; graphic gore; hate or harassment, or games about real, private people; content that copies real brands, logos or trademarked characters; anything that imitates a wallet, a crypto exchange, a login screen, or asks the player for passwords, seed phrases, private keys or personal details; gambling for real value; anything that tries to break out of the sandbox, track players or reach the network.
Cartoon combat and fantasy violence are fine. To refuse, reply with exactly one line: REFUSED: <a short, friendly reason the person can act on>`;

let client = null;
const anthropic = () => (client ||= new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY }));

export const aiConfigured = () => Boolean(process.env.ANTHROPIC_API_KEY);

export class GenerationError extends Error {}

// A run that had to stop before the game was finished (the function's time ran out, or the reply hit its length
// limit). `text` is everything written so far: the next run continues from it.
export class GenerationCutOff extends Error {
  constructor(text) {
    super('cut off');
    this.text = text;
  }
}

// Joins a continuation onto what was written before. Claude is asked to carry on from the exact next character, but
// may repeat the end of the cut-off text or open a code fence; both are trimmed.
export function stitch(before, after) {
  let next = after.replace(/^\s*```[a-z]*\n/i, '');
  const max = Math.min(4000, before.length, next.length);
  for (let k = max; k >= 24; k--) {
    if (before.endsWith(next.slice(0, k))) {
      next = next.slice(k);
      break;
    }
  }
  return before + next;
}

// items: the store's items ({ id, name, description }), so every edit keeps them working
function userMessage({ request, current, originalPrompt, items = [] }) {
  const store = items.length
    ? `Store items (use these ids):\n${items.map((i) => `- ${i.id}: ${i.name}${i.description ? ` - ${i.description}` : ''}`).join('\n')}`
    : null;
  if (!current) return [`Make this game:\n\n${request}`, store].filter(Boolean).join('\n\n');
  return [
    `The game was first described as:\n${originalPrompt}`,
    `Here is the current game:\n<current_game>\n${current}\n</current_game>`,
    store,
    `Change request:\n${request}`,
    'Return the complete updated HTML document.',
  ]
    .filter(Boolean)
    .join('\n\n');
}

// Pulls the HTML document out of the reply: from <!DOCTYPE html> (or <html>) to the last </html>.
function extractHtml(text) {
  const start = text.search(/<!doctype html|<html[\s>]/i);
  const end = text.toLowerCase().lastIndexOf('</html>');
  if (start < 0 || end < start) return null;
  return text.slice(start, end + '</html>'.length);
}

const unescape = (s) => s.replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"').replace(/&#39;/g, "'");
const clean = (s, max) => unescape(String(s || '')).replace(/\s+/g, ' ').trim().slice(0, max);

export function readMeta(html) {
  const title = clean(html.match(/<title[^>]*>([\s\S]*?)<\/title>/i)?.[1], 60);
  const description = clean(
    html.match(/<meta\s+[^>]*name=["']description["'][^>]*content=["']([^"']*)["']/i)?.[1] ||
      html.match(/<meta\s+[^>]*content=["']([^"']*)["'][^>]*name=["']description["']/i)?.[1],
    300
  );
  return { title: title || 'Untitled game', description };
}

// Runs one generation, or carries on a cut-off one (`partial`: everything written so far). onProgress(chars) is called
// as the code streams in. Resolves { html, title, description }; throws GenerationError with a message meant for the
// creator, or GenerationCutOff when this run stopped early (on `signal`, or at the length limit) and should continue.
export async function generateGame({ request, current = null, originalPrompt = null, items = [], partial = '', effort = EFFORT, onProgress, signal }) {
  let content = userMessage({ request, current, originalPrompt, items });
  if (partial) {
    content += [
      '\n\nYou already started answering this, but your reply was cut off. Everything you wrote so far:',
      `<partial_reply>\n${partial}\n</partial_reply>`,
      'Continue from exactly where it stops. Output only the rest of the document, starting with the very next character: no repetition, no explanation, no code fences.',
    ].join('\n');
  }
  let written = '';
  const stream = anthropic().beta.messages.stream(
    {
      model: MODEL,
      max_tokens: 64000,
      betas: ['server-side-fallback-2026-07-01'],
      fallbacks: 'default',
      output_config: { effort },
      system: [{ type: 'text', text: SYSTEM, cache_control: { type: 'ephemeral' } }],
      messages: [{ role: 'user', content }],
    },
    { signal }
  );
  // the current text block; after a server-side fallback a new block starts, which drops the declined attempt
  stream.on('text', (_delta, snapshot) => {
    written = snapshot;
    if (onProgress) onProgress(partial.length + snapshot.length);
  });

  let message;
  try {
    message = await stream.finalMessage();
  } catch (err) {
    if (signal?.aborted) throw new GenerationCutOff(partial ? stitch(partial, written) : written);
    if (err instanceof Anthropic.RateLimitError || err instanceof Anthropic.InternalServerError) {
      throw new GenerationError('The game studio is busy right now. Try again in a minute.');
    }
    throw err;
  }

  if (message.stop_reason === 'refusal') {
    throw new GenerationError("Claude won't make this one. Try describing a different game.");
  }

  // after a server-side fallback, only the text written after the last switch is the answer
  const blocks = message.content;
  const lastSwitch = blocks.map((b) => b.type).lastIndexOf('fallback');
  const reply = blocks
    .slice(lastSwitch + 1)
    .filter((b) => b.type === 'text')
    .map((b) => b.text)
    .join('');
  const text = partial ? stitch(partial, reply) : reply;
  if (message.stop_reason === 'max_tokens') throw new GenerationCutOff(text);

  const refused = !partial && text.trim().match(/^REFUSED:\s*(.+)$/m);
  if (refused && !/<html/i.test(text)) throw new GenerationError(refused[1].trim().slice(0, 300));

  const html = extractHtml(text);
  if (!html) throw new GenerationError('Something went wrong writing the game. Try again.');
  if (html.length > HTML_MAX) throw new GenerationError('The game got too big. Try a simpler idea or a smaller change.');
  return { html, ...readMeta(html) };
}

// ------------------------------------------------------------------------------------------------- serving a game
// Injected at the top of every game's <head>. It is the site's code, not the game's: it hides wallets, stands in for
// the storage a sandbox lacks, reports errors to the page around the iframe (the creator can send them back to
// Claude), gives the game its store (window.IC), and says 'ready' on every load, which is how that page notices the
// frame navigating somewhere else. It cannot be relied on for security on its own - the response headers in raw.js are what isolate the game.
const RUNTIME = `<script>
(function () {
  ['ethereum', 'solana', 'phantom', 'coinbaseWalletExtension', 'trustwallet', 'okxwallet', 'bitkeep', 'rabby'].forEach(function (k) {
    try { Object.defineProperty(window, k, { get: function () { return undefined; }, set: function () {}, configurable: false }); } catch (e) {}
  });
  var stop = function (e) { e.stopImmediatePropagation(); };
  window.addEventListener('eip6963:announceProvider', stop, true);
  window.addEventListener('eip6963:requestProvider', stop, true);
  function memoryStorage() {
    var m = new Map();
    return {
      getItem: function (k) { k = String(k); return m.has(k) ? m.get(k) : null; },
      setItem: function (k, v) { m.set(String(k), String(v)); },
      removeItem: function (k) { m.delete(String(k)); },
      clear: function () { m.clear(); },
      key: function (i) { return Array.from(m.keys())[i] || null; },
      get length() { return m.size; }
    };
  }
  ['localStorage', 'sessionStorage'].forEach(function (k) {
    try { window[k].length; } catch (e) { try { Object.defineProperty(window, k, { value: memoryStorage(), configurable: false }); } catch (e2) {} }
  });
  window.alert = function () {}; window.confirm = function () { return false; }; window.prompt = function () { return null; };
  var post = function (type, data) { try { parent.postMessage(Object.assign({ source: 'ic-creation', type: type }, data || {}), '*'); } catch (e) {} };
  // Browser extensions (MetaMask and other wallets) inject their own scripts into every frame, and inside the sandbox
  // they fail to reach the extension ("Failed to connect to MetaMask"). Those errors are not the game's: they are
  // dropped here so the creator isn't asked to have Claude fix them.
  var EXTENSION = /(chrome|moz|safari-web|ms-browser)-extension:\/\//;
  var WALLET = /metamask|phantom|coinbase wallet|trust wallet|rabby|okx wallet|ethereum provider|inpage\.js/i;
  var foreign = function (msg, file, stack) {
    return EXTENSION.test(file || '') || EXTENSION.test(stack || '') || WALLET.test(msg || '') || (msg === 'Script error.' && !file);
  };
  window.addEventListener('error', function (e) {
    var msg = e.message || (e.target && e.target.src ? 'Could not load ' + e.target.src : 'Error');
    if (foreign(e.message, e.filename || (e.target && e.target.src), e.error && e.error.stack)) return;
    post('error', { message: String(msg).slice(0, 300), line: e.lineno || 0 });
  }, true);
  window.addEventListener('unhandledrejection', function (e) {
    var r = e.reason;
    var msg = String((r && r.message) || r || 'Unhandled promise rejection');
    if (foreign(msg, '', r && r.stack)) return;
    post('error', { message: msg.slice(0, 300), line: 0 });
  });
  window.addEventListener('load', function () { post('loaded'); });
  // The store: the page around the game sends the items and what this player owns (after 'ready', and again after a
  // purchase). Only messages from that page count. Ownership here unlocks things in a game the player runs themselves,
  // so it needs no more proof than that: the purchase itself is checked on-chain by the site.
  var items = [], owned = [], listeners = [];
  window.addEventListener('message', function (e) {
    if (e.source !== window.parent || !e.data || e.data.source !== 'ic-page' || e.data.type !== 'store') return;
    items = Array.isArray(e.data.items) ? e.data.items : [];
    owned = Array.isArray(e.data.owned) ? e.data.owned : [];
    listeners.slice().forEach(function (fn) { try { fn(); } catch (err) { setTimeout(function () { throw err; }); } });
  });
  var IC = {
    owns: function (id) { return owned.indexOf(id) >= 0; },
    onChange: function (fn) { if (typeof fn === 'function') listeners.push(fn); },
    openStore: function (id) { post('open-store', { itemId: typeof id === 'string' ? id.slice(0, 20) : null }); }
  };
  Object.defineProperty(IC, 'items', { get: function () { return items.map(function (i) { return Object.assign({}, i); }); } });
  Object.defineProperty(IC, 'owned', { get: function () { return owned.slice(); } });
  try { Object.defineProperty(window, 'IC', { value: Object.freeze(IC), configurable: false, writable: false }); } catch (e) {}
  post('ready');
})();
</script>
<script type="importmap">${JSON.stringify(IMPORT_MAP)}</script>`;

// The stored game, ready to serve: the game's own import maps and <base> tags removed, the runtime and our import map
// first in <head>.
export function wrapGame(html) {
  const body = html
    .replace(/<script\b[^>]*type\s*=\s*["']?importmap["']?[^>]*>[\s\S]*?<\/script>/gi, '')
    .replace(/<base\b[^>]*>/gi, '');
  const head = body.match(/<head\b[^>]*>/i);
  if (head) return body.replace(head[0], `${head[0]}\n${RUNTIME}`);
  const htmlTag = body.match(/<html\b[^>]*>/i);
  if (htmlTag) return body.replace(htmlTag[0], `${htmlTag[0]}\n<head>${RUNTIME}</head>`);
  return `<!DOCTYPE html><head>${RUNTIME}</head>${body}`;
}

// The headers that make a game safe to serve from the site's own domain. `sandbox` gives the document an opaque
// origin even when the URL is opened directly, so it can't read the site's cookies or call its APIs as the visitor;
// the rest keeps it from loading anything but the pinned Three.js and from talking to any server.
export const GAME_CSP = [
  'sandbox allow-scripts allow-pointer-lock',
  "default-src 'none'",
  `script-src 'unsafe-inline' ${CDN}/npm/three@${THREE_VERSION}/`,
  "style-src 'unsafe-inline'",
  'img-src data: blob:',
  'media-src data: blob:',
  'font-src data:',
  'connect-src data: blob:',
  'worker-src blob:',
  "base-uri 'none'",
  "form-action 'none'",
  "frame-ancestors 'self'",
].join('; ');
