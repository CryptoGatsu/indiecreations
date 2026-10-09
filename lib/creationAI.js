// Server-side only: Claude writes community games. One model call per new game or edit; each returns the complete
// game as a single HTML file. The file is stored as written and wrapped at serve time (wrapGame below), so the sandbox
// runtime and the pinned Three.js version can change for every game at once.
import Anthropic from '@anthropic-ai/sdk';
import { ENGINE_SOURCE } from './engineSource';

export const MODEL = process.env.CREATIONS_MODEL || 'claude-opus-5-5';
// Low by default: each server run has under 5 minutes, and thinking that hasn't turned into written code by then is
// lost (the next run starts over). Planning happens in writing instead, in the game's PLAN comment, which carries over.
const EFFORT = ['low', 'medium', 'high', 'xhigh', 'max'].includes(process.env.CREATIONS_EFFORT) ? process.env.CREATIONS_EFFORT : 'low';
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

const SYSTEM = `You are a world-class game developer and technical artist making browser games with Three.js for Indie Creations, an indie game studio. Holders of the studio's token describe a game or a whole world; you build it. Other people then play it on the studio's website.

Your bar: the first version should look and feel like a finished indie release. Someone who types one prompt should get a beautiful, rich, playable result without asking for "better graphics" afterwards. When the request describes a world, build a world.

# What you return
Reply with one complete HTML document and nothing else: no explanation, no Markdown fences. Start with <!DOCTYPE html> and end with </html>.
Right after <!DOCTYPE html>, write a short plan as an HTML comment (at most 25 lines): <!-- PLAN: the fantasy in one line; regions or levels and their landmarks; art direction (sky preset and time, palette, mood, materials); characters and creatures; core loop, goals and progression; controls; the systems you will write --> Then write the game, following the plan. Do not plan at length in your head before writing: start the document within your first minute and work out details as you write each part (each writing pass has a few minutes, and only written text carries over to the next). A big game is written over several passes automatically, so length is not a limit; the plan keeps the passes consistent.
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

# IC3D: the studio's world kit (use it for every 3D game)
The site adds a tested engine to every game that mentions IC3D: a global \`IC3D\` object, ready when your module runs, sharing your Three.js. It gives you film-quality defaults in a few lines (physically based sky and lighting, soft shadows, reflections from the sky, bloom, colour grading, ACES tone mapping, adaptive resolution for phones) so your effort goes into the world and the game. Use it instead of setting up renderers, skies, terrain, foliage, input, sound or menus yourself. Everything below exists exactly as written; do not guess other functions.

World and rendering
- const world = IC3D.createWorld({ sky, time, dayLength, fog: { density, color } | false, bloom: { strength, radius, threshold } | false, grade: { saturation, contrast, vignette, warmth }, exposure, camera: { fov, near, far, position: [x,y,z] }, quality: 'auto' }) starts the render loop.
  sky presets: 'day', 'morning', 'dawn', 'sunset', 'dusk', 'night', 'overcast', 'storm', 'space', 'underwater', 'alien', 'candy', 'void', or a custom gradient { top, horizon, bottom, fog, light, time }.
  world.scene, world.camera, world.renderer, world.sun (shadow-casting DirectionalLight), world.hemi, world.quality ('high' | 'medium' | 'low'), world.time (seconds).
  world.onUpdate((dt, time) => {...}) returns an unsubscribe function: put ALL per-frame logic here (dt is clamped). world.paused = true freezes updates (menus, dialogue).
  world.setTime(hours 0-24) moves the sun (6 sunrise, 12 noon, 17.6 golden hour, 23 night with stars and moonlight). dayLength: seconds per full day cycle (0 = fixed time). world.setSky(preset).
  world.follow(object) keeps the shadow area on the player (createController does this). world.add(...objects), world.remove(object) (removes and disposes). world.shake(amount = 0.4, seconds = 0.35).
Terrain, water and sky
- const terrain = IC3D.createTerrain(world, { size: 400, height: 30, shape, biome, waterLevel, seed, flatten: [{ x, z, radius, height, blend }], heightFn: (x, z, noise) => y, frequency, resolution, texture, castShadow })
  shapes: 'hills', 'mountains', 'islands', 'plains', 'dunes', 'canyon', 'crater', 'flat'. biomes: 'temperate', 'forest', 'desert', 'snow', 'autumn', 'volcanic', 'alien', 'candy', 'moon', 'tropical', or { bands: [[0..1, colour], ...], cliff: colour }. Steep slopes automatically become textured rock.
  Use flatten for towns, arenas, camps and building sites. terrain.heightAt(x, z), terrain.normalAt(x, z), terrain.slopeAt(x, z), terrain.place(object, x, z, { offset, align }) stands an object on the ground, terrain.randomPoint({ minHeight, maxHeight, maxSlope, near: { x, z, radius }, avoid: [{ x, z, radius }], rng }) returns a Vector3 or null, terrain.size, terrain.mesh, terrain.noise.
- IC3D.createWater(world, { level, size, color, opacity, waveScale, distortion, speed, lava: true }) (reflective on high quality). IC3D.createClouds(world, { count, height, area, color, opacity, speed }).
Nature and props (instanced, so thousands are cheap; counts scale down on phones automatically)
- const forest = IC3D.scatter(world, terrain, { type, count, seed, scale: [min, max], colors: { leaves, trunk, color, base, tip, berries }, minHeight, maxHeight, maxSlope, area: { x, z, radius }, avoid: [{ x, z, radius }], collide }) returns { meshes, points, colliders }.
  types: 'pine', 'oak', 'birch', 'palm', 'cherry', 'dead', 'bush', 'rock', 'boulder', 'grass', 'flower', 'mushroom', 'crystal', 'cactus', 'fern'. Grass and flowers sway in the wind. Pass forest.colliders to the controller.
- IC3D.model(type, { seed, colors }) returns one Mesh of any of those types to place yourself (a lone great tree, a crystal on an altar).
Materials (procedural PBR textures: colour + normal + roughness maps, seamless)
- IC3D.material(kind, { color, repeat, emissive, emissiveIntensity, ...MeshStandardMaterial options }) kinds: 'grass', 'dirt', 'sand', 'snow', 'rock', 'stone', 'cobble', 'brick', 'wood', 'planks', 'bark', 'metal', 'rust', 'scifi' (panels with glowing strips), 'tiles', 'marble', 'ice', 'lava' (glows), 'fabric', 'leaves', 'noise'. color tints it. repeat tiles it (about one repeat per 2-4 m of surface).
- IC3D.glow(color, intensity) is an emissive material that blooms: lamps, windows at night, crystals, magic, lasers, neon, eyes.
- IC3D.RoundedBoxGeometry(width, height, depth, segments, radius) and IC3D.mergeGeometries(list) for building props.
Characters and creatures
- IC3D.createCharacter({ style: 'human' | 'knight' | 'robot' | 'alien' | 'wizard', colors: { skin, shirt, pants, hair, shoes, accent }, cape: color, scale }) returns a Group about 1.8 m tall (feet at y = 0) that animates walking, running, jumping and swimming when a controller moves it. character.userData.hand.add(item) holds a sword or torch; character.userData.swing() plays an attack swing; character.userData.parts has { body, head, armL, armR, legL, legR }.
- IC3D.wander(world, object, { terrain, center, radius, speed, pause }) makes NPCs and animals roam; returns { active, stop }.
- For animals, monsters, vehicles, ships and machines, build your own models from several primitives (bodies, heads, legs, wings, wheels) with PBR materials, and animate them in onUpdate.
Player control
- const player = IC3D.createController(world, { mode: 'third' | 'first' | 'top', target: character, terrain, speed, runSpeed, jump, gravity, height, radius, colliders, bounds, cameraDistance, cameraHeight, sensitivity, pointerLock, swim, touchButtons }) gives WASD/arrows + mouse look (drag, or pointer lock in first person), Shift to run, Space to jump (with coyote time), swimming, collisions, a camera that follows and never goes under ground, and a virtual joystick + jump button on touch screens.
  colliders: { x, z, radius, top } circles (scatter returns these), THREE.Box3, or any Object3D (boxed once; { object, dynamic: true } re-boxes each frame). You can stand on boxes and rocks. player.addCollider(c), player.removeCollider(obj), player.setPosition(x, y, z), player.object, player.velocity, player.grounded, player.swimming, player.moving (0..1), player.yaw, player.enabled = false (cutscenes, dialogue), player.onJump = fn, player.onLand = fn.
- IC3D.input: input.held(name), input.pressed(name) (true once per press), input.axis() -> { x, y }, input.pointer { x, y, down } in -1..1, input.isTouch, input.button(name, label) adds an on-screen touch button, input.bind(name, ['KeyE']) rebinds. Built-in names: up, down, left, right, jump (Space), run (Shift), action (E / Enter), attack (F / left click), alt (R / right click), pause (Escape / P). Raw codes like 'KeyQ' or 'Digit1' work too. Add touch buttons for every action the game needs (input.button('attack', '⚔')).
Effects and feedback
- IC3D.particles(world, { preset, at: Vector3 | Object3D, rate, color, size, area, max, scale }) returns { emit(count, position), start(), stop(), dispose() }. presets: 'fire', 'smoke', 'sparks', 'magic', 'snow', 'rain', 'dust', 'fireflies', 'leaves', 'bubbles', 'confetti', 'explosion', 'heal'. snow, rain, dust, fireflies and leaves fill the air around the camera as weather.
- IC3D.burst(world, position, { preset: 'explosion' | 'sparks' | 'confetti' | 'magic' | 'smoke' | 'heal', count, color, scale }) for one-shot hits, pickups and deaths.
- IC3D.popup(world, position, text, { color, size }) rising text (+10, -25, LEVEL UP). IC3D.label(text, { color, background, size }) a camera-facing name tag or sign (a Sprite; add it to an object).
- Lights: add THREE.PointLight to fires, lamps, crystals and windows (a few, with distance set) for pools of warm light, especially at dusk and night.
Sound (Web Audio, starts on the first click)
- IC3D.sound.play(name, { volume, pitch }) names: jump, land, step, coin, pickup, powerup, hit, hurt, explosion, laser, shoot, swing, whoosh, click, open, win, lose, magic, splash, bounce, engine, bell.
- IC3D.sound.music('calm' | 'adventure' | 'tense' | 'space' | 'mystery' | 'upbeat' | 'none'), IC3D.sound.ambience('wind' | 'ocean' | 'rain' | 'forest' | 'cave' | 'fire' | 'space' | 'city' | 'none'), IC3D.sound.volume(v). Start music and ambience when the player presses Play.
Interface (styled, glassy, responsive; clicks on it never reach the game)
- IC3D.ui.screen({ title, subtitle, html, controls: [['WASD', 'move'], ['Space', 'jump']], button: 'Play', buttons: [{ label, onClick, ghost }], onStart, accent }) a full-screen menu; returns { show(patch), hide(), el }. Use it for the start screen, pause, game over and victory.
- IC3D.ui.hud() -> { set(key, html) } pills in the top-left (score, coins, time). IC3D.ui.bar({ label, color, max, value }) -> { set(v) } health / stamina / XP bars. IC3D.ui.toast(text, ms). IC3D.ui.hint('Press [E] to talk') (null hides it). IC3D.ui.dialog({ name, text, choices }) -> Promise<choice index> for NPC conversations. IC3D.ui.objectives(title, ['Find the key', ...]) -> { done(i), set(list) } a quest tracker.
Utilities
- IC3D.rng(seed) seeded random (r(), r.range(a, b), r.int(a, b), r.pick(list)), IC3D.noise.simplex2 / simplex3 / fbm2 / ridged2, IC3D.makeNoise(seed), IC3D.clamp, IC3D.lerp, IC3D.damp(a, b, lambda, dt), IC3D.smoothstep, IC3D.dispose(object).

A typical start:
  import * as THREE from 'three';
  const world = IC3D.createWorld({ sky: 'sunset', fog: { density: 0.004 } });
  const terrain = IC3D.createTerrain(world, { size: 500, height: 40, shape: 'islands', biome: 'tropical', waterLevel: 2, flatten: [{ x: 0, z: 0, radius: 18, height: 6 }] });
  IC3D.createWater(world, { level: 2 });
  const palms = IC3D.scatter(world, terrain, { type: 'palm', count: 120, maxHeight: 8 });
  IC3D.scatter(world, terrain, { type: 'grass', count: 8000 });
  IC3D.createClouds(world);
  const hero = IC3D.createCharacter({ colors: { shirt: '#d84a3a' } });
  terrain.place(hero, 0, 0); world.add(hero);
  const player = IC3D.createController(world, { target: hero, terrain, colliders: palms.colliders });
  world.onUpdate((dt, t) => { /* game logic */ });

# Art direction (this is what makes it look professional)
- Choose a strong look up front: a sky preset and time of day that suit the mood (golden-hour 'sunset' and 'morning' flatter almost everything; 'night' with lamps, fires and fireflies is magical), a palette of 3-5 harmonious colours plus one accent, and fog density for depth (0.002 open vistas, 0.006 cosy valleys, 0.015+ mist and caves).
- Never leave flat, empty or untextured ground. Use terrain with a biome; dress it in layers: big landmarks (towers, ruins, giant trees, mountains), medium props (houses, rocks, bushes, fences, lamps), and fine detail (grass, flowers, ferns, pebbles, particles in the air).
- Give surfaces materials: IC3D.material('stone' / 'planks' / 'brick' / 'metal' / 'scifi' ...) on buildings and props instead of plain colours. Build props from several parts with bevels (RoundedBoxGeometry), trims, roofs, window frames, beams, railings; vary scale, rotation and tint; group them into believable places (a village square, a harbour, a camp, a temple courtyard, a space station hub).
- Light the scene with intent: the sun from createWorld, then warm point lights on fires, lanterns and windows, IC3D.glow on anything that should shine (it blooms), and a time of day that casts long shadows.
- Fill the air: fireflies at dusk, dust in deserts, snow on mountains, leaves in autumn forests, embers near lava, bubbles underwater. Add clouds and water where they make sense.
- Life: characters with distinct colours and names (labels), NPCs that wander, animals, swaying foliage, drifting clouds, a sound bed (ambience + music).
- Juice every action: sound, particles, a popup or toast, a small shake on big hits, squash-and-stretch or scale pops on pickups.
- Composition: place the player so the first frame looks great; frame a landmark in the distance; lead the eye with paths, light and colour.

# How the game must play
- Scale to the request. "A game where..." gets a complete, polished game. "A world..." / "an open world..." / "an RPG..." gets a world: several distinct regions or levels with their own look, landmarks worth walking to, characters to meet, things to collect or discover, a goal and progression (quests, levels, upgrades, unlocks), and a satisfying ending or endless mode.
- A start screen (IC3D.ui.screen) with the title, the goal and the controls; then "Play". Score or progress on screen; a game-over or victory screen; restart without reloading.
- Works with keyboard and mouse, and on phones and tablets with touch: IC3D.createController adds a joystick and jump button; add buttons for other actions with IC3D.input.button. Size UI for thumbs.
- Smooth on a mid-range phone: use scatter for repeated things (it instances), share geometries and materials, keep point lights to a handful, never create geometries or materials inside onUpdate, remove what you no longer need (world.remove).
- Without IC3D (only when the request is truly 2D or abstract): the renderer fills the window, handles resize and caps the pixel ratio at 2; movement uses delta time clamped against stalled tabs.
- Write clear, working code: define every variable before use, guard against missing objects, and make sure the game loop cannot throw. Ambitious AND working: test the logic in your head as you write; a broken game is worth nothing.
- Use data tables and helpers for repeated content (one table of enemy types, items or regions driving the code) rather than copy-pasted blocks. Comments only where they help.

# Multiplayer
Online multiplayer works through the site, with the global \`IC.net\` object (the game itself still has no network):
- \`await IC.net.join()\` quick-matches the player into an open room of this game, or into the room from their invite link, and resolves { room, me, players, host }. \`IC.net.join({ maxPlayers: 4 })\` sets the room size (2 to 8, default 8). \`IC.net.join({ room: 'ABCDE' })\` joins a room by its 5-letter code.
- \`IC.net.send(type, data)\` sends a small JSON message (under 8 KB; at most about 20 a second, extra ones are dropped) to everyone else in the room. \`IC.net.on(type, fn(data, fromId))\` receives them.
- \`IC.net.onPlayers(fn(players, hostId))\` runs whenever someone joins or leaves; players are [{ id, name }]. \`IC.net.me\` is this player's id. \`IC.net.isHost\` is true for exactly one player (the one in the room longest), and passes to someone else if they leave.
- \`IC.net.leave()\` leaves the room. \`IC.net.room\` is the current room code.
How to build an online game:
- Start on a menu with "Play online" (calls IC.net.join()) and a solo mode against CPU players, so it is fun with one person and while waiting. Show the room code and the player names once joined, and a "Start" for the host when enough players are in.
- The host owns shared state (round timer, score, enemies, pickups, who won) and sends a compact snapshot about 10 times a second. Each player owns their own character: they send their position, direction and actions about 10 to 15 times a second, and everyone smoothly interpolates the others between updates.
- When a player joins mid-game the host sends them the current state; when a player leaves their character disappears cleanly. If the host leaves, the new host (onPlayers tells you) takes over from the last state it had.
- Never let another player's message change anything except their own character and their own actions.
Local multiplayer (same device) only when the request asks for it: then each player gets their own keys (for example WASD + Space and the arrow keys + Enter) and their own on-screen controls on touch devices.

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
// Claude), gives the game its store (window.IC), takes cover screenshots when the page asks, and says 'ready' on every
// load, which is how that page notices the frame navigating somewhere else. It cannot be relied on for security on its own - the response headers in raw.js are what isolate the game.
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

  // Online multiplayer (IC.net): the page around the game relays to the other players (lib/gameNet.js). The game
  // itself still has no network; it only talks to that page.
  var net = { room: null, me: null, players: [], host: null }, netOn = {}, playersFns = [], joinWait = [];
  var copyPlayers = function () { return net.players.map(function (p) { return { id: p.id, name: p.name }; }); };
  var callPlayers = function () {
    playersFns.slice().forEach(function (fn) { try { fn(copyPlayers(), net.host); } catch (err) { setTimeout(function () { throw err; }); } });
  };
  window.addEventListener('message', function (e) {
    if (e.source !== window.parent || !e.data || e.data.source !== 'ic-page' || e.data.type !== 'net') return;
    var d = e.data;
    if (d.ev === 'joined') {
      net.room = d.room; net.me = d.me; net.players = d.players || []; net.host = d.host;
      var info = { room: net.room, me: net.me, players: copyPlayers(), host: net.host };
      joinWait.splice(0).forEach(function (w) { w.resolve(info); });
      callPlayers();
    } else if (d.ev === 'players') {
      net.players = d.players || []; net.host = d.host;
      callPlayers();
    } else if (d.ev === 'message') {
      (netOn[d.msgType] || []).slice().forEach(function (fn) {
        try { fn(d.data, d.from); } catch (err) { setTimeout(function () { throw err; }); }
      });
    } else if (d.ev === 'left') {
      net.room = null; net.players = []; net.host = null;
      callPlayers();
    } else if (d.ev === 'error') {
      joinWait.splice(0).forEach(function (w) { w.reject(new Error(d.message || 'Could not join')); });
    }
  });
  var NET = {
    join: function (opts) {
      opts = opts || {};
      return new Promise(function (resolve, reject) {
        joinWait.push({ resolve: resolve, reject: reject });
        post('net', { op: 'join', room: typeof opts.room === 'string' ? opts.room.toUpperCase().slice(0, 5) : null, maxPlayers: Number(opts.maxPlayers) || null });
      });
    },
    send: function (type, data) {
      try { post('net', { op: 'send', msgType: String(type).slice(0, 40), data: JSON.parse(JSON.stringify(data === undefined ? null : data)) }); } catch (err) {}
    },
    on: function (type, fn) { if (typeof fn === 'function') (netOn[type] = netOn[type] || []).push(fn); },
    onPlayers: function (fn) { if (typeof fn === 'function') playersFns.push(fn); },
    leave: function () { post('net', { op: 'leave' }); }
  };
  Object.defineProperty(NET, 'room', { get: function () { return net.room; } });
  Object.defineProperty(NET, 'me', { get: function () { return net.me; } });
  Object.defineProperty(NET, 'players', { get: copyPlayers });
  Object.defineProperty(NET, 'host', { get: function () { return net.host; } });
  Object.defineProperty(NET, 'isHost', { get: function () { return Boolean(net.me) && net.me === net.host; } });
  IC.net = Object.freeze(NET);
  try { Object.defineProperty(window, 'IC', { value: Object.freeze(IC), configurable: false, writable: false }); } catch (e) {}

  // Cover screenshots: when the page asks, the next frame the game draws is copied from its biggest canvas, cropped
  // to 16:9 and sent back as a 640x360 JPEG. It has to happen right after the game's own frame callback: a WebGL
  // canvas can only be read before the browser presents it. A near-uniform image (a black loading screen) is reported
  // as blank instead, so the page can try again later.
  // Browsers stop drawing frames in a game that is scrolled out of view, and a WebGL canvas can't be read between
  // frames, so about once a second the last good frame is kept aside; a request that gets no fresh frame uses it.
  // Every frame callback also gets a turn at a pending request: some games draw from more than one callback.
  var shotTries = 0, lastGood = null, lastKept = 0;
  var rawRAF = window.requestAnimationFrame.bind(window);
  window.requestAnimationFrame = function (cb) {
    return rawRAF(function (t) {
      cb(t);
      if (shotTries > 0) attempt();
      else if (t - lastKept > 1000) { lastKept = t; var g = grab(); if (g) lastGood = g; }
    });
  };
  function attempt() {
    var g = grab();
    if (g) { lastGood = g; shotTries = 0; post('snapshot', { image: g.toDataURL('image/jpeg', 0.82) }); }
    else if (--shotTries <= 0) fallback();
  }
  function fallback() {
    shotTries = 0;
    post('snapshot', lastGood ? { image: lastGood.toDataURL('image/jpeg', 0.82) } : { blank: true });
  }
  // the game's biggest canvas, cropped to 16:9 on a fresh 640x360 canvas; null when it is blank
  function grab() {
    var best = null, area = 0;
    Array.prototype.forEach.call(document.querySelectorAll('canvas'), function (c) {
      var a = c.width * c.height;
      if (a > area) { area = a; best = c; }
    });
    if (!best || !best.width || !best.height) return null;
    try {
      var out = document.createElement('canvas');
      out.width = 640; out.height = 360;
      var ctx = out.getContext('2d');
      var sr = best.width / best.height, dr = 640 / 360, sw, sh, sx, sy;
      if (sr > dr) { sh = best.height; sw = sh * dr; sx = (best.width - sw) / 2; sy = 0; }
      else { sw = best.width; sh = sw / dr; sx = 0; sy = (best.height - sh) / 2; }
      ctx.fillStyle = '#000';
      ctx.fillRect(0, 0, 640, 360);
      ctx.drawImage(best, sx, sy, sw, sh, 0, 0, 640, 360);
      // blank = every colour channel nearly flat (a uniform loading screen); colour changes count, not just brightness
      var px = ctx.getImageData(0, 0, 640, 360).data, n = 0, sum = [0, 0, 0], sq = [0, 0, 0], sd = 0;
      for (var i = 0; i < px.length; i += 4 * 97) {
        for (var k = 0; k < 3; k++) { sum[k] += px[i + k]; sq[k] += px[i + k] * px[i + k]; }
        n++;
      }
      for (var c = 0; c < 3; c++) { var m = sum[c] / n; sd = Math.max(sd, Math.sqrt(Math.max(0, sq[c] / n - m * m))); }
      return sd < 6 ? null : out;
    } catch (e) {
      return null;
    }
  }
  window.addEventListener('message', function (e) {
    if (e.source !== window.parent || !e.data || e.data.source !== 'ic-page' || e.data.type !== 'snapshot') return;
    shotTries = 30;
    // no fresh frame in time (the game is scrolled away or paused): the last good one, if any
    setTimeout(function () { if (shotTries > 0) fallback(); }, 1500);
  });
  post('ready');
})();
</script>
<script type="importmap">${JSON.stringify(IMPORT_MAP)}</script>`;

// The stored game, ready to serve: the game's own import maps and <base> tags removed, the runtime and our import map
// first in <head>, then IC3D (engine/, the world-building kit) for games that use it. Module scripts run in document
// order, so window.IC3D is ready before the game's own module runs.
export function wrapGame(html) {
  const body = html
    .replace(/<script\b[^>]*type\s*=\s*["']?importmap["']?[^>]*>[\s\S]*?<\/script>/gi, '')
    .replace(/<base\b[^>]*>/gi, '');
  const head = /\bIC3D\b/.test(body) ? `${RUNTIME}\n<script type="module">${ENGINE_SOURCE}</script>` : RUNTIME;
  const headTag = body.match(/<head\b[^>]*>/i);
  if (headTag) return body.replace(headTag[0], () => `${headTag[0]}\n${head}`);
  const htmlTag = body.match(/<html\b[^>]*>/i);
  if (htmlTag) return body.replace(htmlTag[0], () => `${htmlTag[0]}\n<head>${head}</head>`);
  return `<!DOCTYPE html><head>${head}</head>${body}`;
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

// ------------------------------------------------------------------------------------------------- random ideas
// A fresh game idea for "Make a random game": something nobody has made yet. Claude sees every title already used
// and a couple of random seeds to push it somewhere new. Resolves { title, prompt }.
const SEEDS = [
  'underwater', 'volcano', 'space station', 'haunted mansion', 'candy world', 'tiny insects', 'giant robots', 'desert ruins',
  'neon city', 'frozen tundra', 'sky islands', 'jungle temple', 'pirate seas', 'medieval castle', 'cyberpunk', 'farm',
  'kitchen', 'toy box', 'dinosaurs', 'deep forest', 'circus', 'asteroid belt', 'ancient Egypt', 'arctic research base',
  'magnetism', 'gravity flips', 'time rewind', 'shrinking and growing', 'light and shadow', 'colour matching', 'rhythm',
  'stacking', 'bouncing', 'slingshots', 'grappling hooks', 'portals', 'mirrors', 'weather control', 'trains', 'balloons',
  'sumo', 'racing', 'tower defence', 'stealth', 'puzzle', 'sports', 'survival', 'rhythm action', 'physics toy', 'arena brawler',
  'dungeon crawler', 'golf', 'fishing', 'snowball fight', 'tag', 'capture the flag', 'king of the hill', 'co-op building',
];
const pick = (list, n) => [...list].sort(() => Math.random() - 0.5).slice(0, n);

const IDEA_SCHEMA = {
  type: 'object',
  properties: {
    title: { type: 'string', description: 'The game name, at most 40 characters' },
    prompt: { type: 'string', description: 'The game described in 3 to 6 sentences: the world and its look (setting, time of day, mood, palette), what you play, the goal and progression, how you win or lose, and the controls' },
  },
  required: ['title', 'prompt'],
  additionalProperties: false,
};

export async function inventGameIdea({ mode, used }) {
  const multi = mode === 'multi';
  const seeds = pick(SEEDS, 2);
  const message = await anthropic().beta.messages.create({
    model: MODEL,
    max_tokens: 4000,
    betas: ['server-side-fallback-2026-07-01'],
    fallbacks: 'default',
    output_config: { effort: 'low', format: { type: 'json_schema', schema: IDEA_SCHEMA } },
    system:
      'You invent original, exciting browser game ideas for Indie Creations. Another model then builds each idea as a single-file Three.js game with the studio\'s world kit: procedural terrain and biomes (islands, mountains, dunes, canyons, craters), forests and foliage, water, skies from dawn to starry night, weather and particles, animated characters, PBR materials, bloom, synthesised music and sound. No image or audio files and no network, but rich, beautiful 3D worlds are well within reach. Each idea should have a vivid setting and art direction, one clear hook that makes it fun, and a goal with progression.',
    messages: [
      {
        role: 'user',
        content: [
          multi
            ? 'Invent an ONLINE MULTIPLAYER game for 2 to 8 players on their own devices, matched into rooms automatically, with a solo mode against CPU players. Say in the prompt that it is online multiplayer, how many players a room holds, and how a round is won.'
            : 'Invent a SINGLE-PLAYER game.',
          `Use these as loose inspiration: ${seeds.join(', ')}.`,
          'It must be clearly different from every game that already exists. Do not reuse or closely echo any of these titles or their concepts:',
          used.length ? used.slice(0, 400).map((t) => `- ${t}`).join('\n') : '(none yet)',
        ].join('\n\n'),
      },
    ],
  });
  if (message.stop_reason === 'refusal') throw new GenerationError('Could not come up with an idea right now. Try again.');
  const text = message.content.filter((b) => b.type === 'text').map((b) => b.text).join('');
  let idea;
  try {
    idea = JSON.parse(text);
  } catch {
    throw new GenerationError('Could not come up with an idea right now. Try again.');
  }
  const title = String(idea.title || '').replace(/\s+/g, ' ').trim().slice(0, 60);
  const prompt = String(idea.prompt || '').replace(/\s+/g, ' ').trim().slice(0, 1800);
  if (title.length < 2 || prompt.length < 30) throw new GenerationError('Could not come up with an idea right now. Try again.');
  return { title, prompt };
}
