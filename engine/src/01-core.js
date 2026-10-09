// IC3D: the studio's world-building kit for community games. Served inline with every game that uses it (see
// lib/creationAI.js wrapGame), after the import map, so it shares the game's Three.js. Exposes window.IC3D.
// Keep the API backward compatible: published games depend on it.
import * as THREE from 'three';
import { Sky } from 'three/addons/objects/Sky.js';
import { Water } from 'three/addons/objects/Water.js';
import { EffectComposer } from 'three/addons/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/addons/postprocessing/RenderPass.js';
import { UnrealBloomPass } from 'three/addons/postprocessing/UnrealBloomPass.js';
import { OutputPass } from 'three/addons/postprocessing/OutputPass.js';
import { ShaderPass } from 'three/addons/postprocessing/ShaderPass.js';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { RoundedBoxGeometry } from 'three/addons/geometries/RoundedBoxGeometry.js';

const VERSION = 1;

// ------------------------------------------------------------------------------------------------------ helpers
const clamp = (v, a = 0, b = 1) => Math.min(b, Math.max(a, v));
const lerp = (a, b, t) => a + (b - a) * t;
const smoothstep = (a, b, v) => {
  const t = clamp((v - a) / (b - a));
  return t * t * (3 - 2 * t);
};
// frame-rate independent smoothing toward a target
const damp = (a, b, lambda, dt) => lerp(a, b, 1 - Math.exp(-lambda * dt));
const col = (c) => (c instanceof THREE.Color ? c.clone() : new THREE.Color(c));

function rng(seed = 1) {
  let s = (typeof seed === 'string' ? [...seed].reduce((h, ch) => (Math.imul(h ^ ch.charCodeAt(0), 16777619) >>> 0), 2166136261) : seed) >>> 0;
  const next = () => {
    s = (s + 0x6d2b79f5) >>> 0;
    let t = s;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
  next.range = (a, b) => a + (b - a) * next();
  next.int = (a, b) => Math.floor(a + (b - a + 1) * next());
  next.pick = (arr) => arr[Math.floor(next() * arr.length)];
  next.sign = () => (next() < 0.5 ? -1 : 1);
  return next;
}

// Reports an error from a frame callback once, the way an uncaught error would be, and keeps the loop running.
const reported = new Set();
function report(err) {
  const key = String(err && err.message);
  if (reported.has(key)) return;
  reported.add(key);
  if (typeof reportError === 'function') reportError(err);
  else setTimeout(() => { throw err; });
}

// ------------------------------------------------------------------------------------------------------- noise
// Seeded 2D/3D simplex noise (-1..1), fractal sums, and tileable value noise for textures.
function makeNoise(seed = 1337) {
  const r = rng(seed);
  const p = new Uint8Array(512);
  const perm = [...Array(256).keys()];
  for (let i = 255; i > 0; i--) {
    const j = Math.floor(r() * (i + 1));
    [perm[i], perm[j]] = [perm[j], perm[i]];
  }
  for (let i = 0; i < 512; i++) p[i] = perm[i & 255];
  const g3 = [1, 1, 0, -1, 1, 0, 1, -1, 0, -1, -1, 0, 1, 0, 1, -1, 0, 1, 1, 0, -1, -1, 0, -1, 0, 1, 1, 0, -1, 1, 0, 1, -1, 0, -1, -1];
  const F2 = 0.5 * (Math.sqrt(3) - 1);
  const G2 = (3 - Math.sqrt(3)) / 6;
  function simplex2(xin, yin) {
    const s = (xin + yin) * F2;
    const i = Math.floor(xin + s);
    const j = Math.floor(yin + s);
    const t = (i + j) * G2;
    const x0 = xin - (i - t);
    const y0 = yin - (j - t);
    const i1 = x0 > y0 ? 1 : 0;
    const j1 = x0 > y0 ? 0 : 1;
    const x1 = x0 - i1 + G2;
    const y1 = y0 - j1 + G2;
    const x2 = x0 - 1 + 2 * G2;
    const y2 = y0 - 1 + 2 * G2;
    const ii = i & 255;
    const jj = j & 255;
    let n = 0;
    let t0 = 0.5 - x0 * x0 - y0 * y0;
    if (t0 > 0) {
      const g = (p[ii + p[jj]] % 12) * 3;
      t0 *= t0;
      n += t0 * t0 * (g3[g] * x0 + g3[g + 1] * y0);
    }
    let t1 = 0.5 - x1 * x1 - y1 * y1;
    if (t1 > 0) {
      const g = (p[ii + i1 + p[jj + j1]] % 12) * 3;
      t1 *= t1;
      n += t1 * t1 * (g3[g] * x1 + g3[g + 1] * y1);
    }
    let t2 = 0.5 - x2 * x2 - y2 * y2;
    if (t2 > 0) {
      const g = (p[ii + 1 + p[jj + 1]] % 12) * 3;
      t2 *= t2;
      n += t2 * t2 * (g3[g] * x2 + g3[g + 1] * y2);
    }
    return 70 * n;
  }
  function simplex3(x, y, z) {
    const F3 = 1 / 3;
    const G3 = 1 / 6;
    const s = (x + y + z) * F3;
    const i = Math.floor(x + s);
    const j = Math.floor(y + s);
    const k = Math.floor(z + s);
    const t = (i + j + k) * G3;
    const x0 = x - (i - t);
    const y0 = y - (j - t);
    const z0 = z - (k - t);
    let i1, j1, k1, i2, j2, k2;
    if (x0 >= y0) {
      if (y0 >= z0) [i1, j1, k1, i2, j2, k2] = [1, 0, 0, 1, 1, 0];
      else if (x0 >= z0) [i1, j1, k1, i2, j2, k2] = [1, 0, 0, 1, 0, 1];
      else [i1, j1, k1, i2, j2, k2] = [0, 0, 1, 1, 0, 1];
    } else if (y0 < z0) [i1, j1, k1, i2, j2, k2] = [0, 0, 1, 0, 1, 1];
    else if (x0 < z0) [i1, j1, k1, i2, j2, k2] = [0, 1, 0, 0, 1, 1];
    else [i1, j1, k1, i2, j2, k2] = [0, 1, 0, 1, 1, 0];
    const pts = [
      [x0, y0, z0, 0, 0, 0],
      [x0 - i1 + G3, y0 - j1 + G3, z0 - k1 + G3, i1, j1, k1],
      [x0 - i2 + 2 * G3, y0 - j2 + 2 * G3, z0 - k2 + 2 * G3, i2, j2, k2],
      [x0 - 1 + 3 * G3, y0 - 1 + 3 * G3, z0 - 1 + 3 * G3, 1, 1, 1],
    ];
    const ii = i & 255;
    const jj = j & 255;
    const kk = k & 255;
    let n = 0;
    for (const [px, py, pz, a, b, c] of pts) {
      let tt = 0.6 - px * px - py * py - pz * pz;
      if (tt > 0) {
        const g = (p[ii + a + p[jj + b + p[kk + c]]] % 12) * 3;
        tt *= tt;
        n += tt * tt * (g3[g] * px + g3[g + 1] * py + g3[g + 2] * pz);
      }
    }
    return 32 * n;
  }
  // fractal sum, roughly -1..1
  function fbm2(x, y, octaves = 5, lacunarity = 2, gain = 0.5) {
    let a = 1;
    let f = 1;
    let sum = 0;
    let norm = 0;
    for (let o = 0; o < octaves; o++) {
      sum += a * simplex2(x * f, y * f);
      norm += a;
      a *= gain;
      f *= lacunarity;
    }
    return sum / norm;
  }
  // sharp mountain ridges, 0..1
  function ridged2(x, y, octaves = 5, lacunarity = 2, gain = 0.5) {
    let a = 0.5;
    let f = 1;
    let sum = 0;
    let norm = 0;
    let weight = 1;
    for (let o = 0; o < octaves; o++) {
      const s0 = simplex2(x * f, y * f);
      let v = 1 - Math.sqrt(s0 * s0 + 0.012); // a rounded crest: a sharp one zig-zags along the terrain grid
      v *= v * weight;
      weight = clamp(v * 2);
      sum += v * a;
      norm += a;
      a *= gain;
      f *= lacunarity;
    }
    return sum / norm;
  }
  // tileable value noise on a period (for seamless textures), 0..1
  function tile2(x, y, period) {
    const xi = Math.floor(x);
    const yi = Math.floor(y);
    const fx = x - xi;
    const fy = y - yi;
    const h = (a, b) => p[(p[((a % period) + period) % period & 255] + (((b % period) + period) % period)) & 255] / 255;
    const u = fx * fx * fx * (fx * (fx * 6 - 15) + 10);
    const v = fy * fy * fy * (fy * (fy * 6 - 15) + 10);
    return lerp(lerp(h(xi, yi), h(xi + 1, yi), u), lerp(h(xi, yi + 1), h(xi + 1, yi + 1), u), v);
  }
  function tileFbm(u, v, base = 4, octaves = 5) {
    let a = 0.5;
    let sum = 0;
    let norm = 0;
    let period = base;
    for (let o = 0; o < octaves; o++) {
      sum += a * tile2(u * period, v * period, period);
      norm += a;
      a *= 0.5;
      period *= 2;
    }
    return sum / norm;
  }
  return { simplex2, simplex3, fbm2, ridged2, tile2, tileFbm };
}
const noise = makeNoise(1337);
