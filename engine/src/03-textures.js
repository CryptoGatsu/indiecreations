// --------------------------------------------------------------------------------------------------- textures
// Seamless procedural PBR textures: colour, normal and roughness maps from a height field, made on a canvas.
// Each kind: h(u,v,n) -> height 0..1, c(h,u,v,n) -> [r,g,b] 0..1, plus roughness/metalness and optional glow.
const tn = makeNoise(4242);
const mix3 = (a, b, t) => [lerp(a[0], b[0], t), lerp(a[1], b[1], t), lerp(a[2], b[2], t)];
const hex3 = (h) => {
  const c = col(h);
  return [c.r, c.g, c.b].map((v) => Math.pow(v, 1 / 2.2)); // canvas works in sRGB
};
const cells = (u, v, n, jitter = 0.8) => {
  // distance to the nearest and second-nearest feature point on a tiling grid (Worley)
  const x = u * n;
  const y = v * n;
  const xi = Math.floor(x);
  const yi = Math.floor(y);
  let d1 = 9;
  let d2 = 9;
  for (let j = -1; j <= 1; j++)
    for (let i = -1; i <= 1; i++) {
      const cx = xi + i;
      const cy = yi + j;
      const wx = ((cx % n) + n) % n;
      const wy = ((cy % n) + n) % n;
      const px = cx + 0.5 + (tn.tile2(wx * 7.1, wy * 3.3, 1e6) - 0.5) * jitter;
      const py = cy + 0.5 + (tn.tile2(wx * 2.9, wy * 8.7, 1e6) - 0.5) * jitter;
      const d = Math.hypot(px - x, py - y);
      if (d < d1) [d1, d2] = [d, d1];
      else if (d < d2) d2 = d;
    }
  return [d1, d2];
};

const KINDS = {
  grass: {
    h: (u, v) => tn.tileFbm(u, v, 8, 5) * 0.6 + tn.tileFbm(u * 1, v * 4, 32, 2) * 0.4,
    c: (h, u, v) => mix3(hex3('#2f5a1e'), hex3('#7fae3e'), clamp(h * 1.4 - 0.2 + (tn.tileFbm(u, v, 3, 3) - 0.5) * 0.6)),
    rough: 0.95,
  },
  dirt: { h: (u, v) => tn.tileFbm(u, v, 6, 6), c: (h) => mix3(hex3('#4a3324'), hex3('#8a6a4a'), h), rough: 1 },
  sand: {
    h: (u, v) => 0.5 + 0.25 * Math.sin((v + tn.tileFbm(u, v, 3, 3) * 0.3) * Math.PI * 2 * 9) + (tn.tileFbm(u, v, 32, 2) - 0.5) * 0.5,
    c: (h) => mix3(hex3('#c9a46a'), hex3('#ecd3a0'), h),
    rough: 0.95,
  },
  snow: { h: (u, v) => tn.tileFbm(u, v, 5, 5), c: (h) => mix3(hex3('#cbd8ea'), hex3('#ffffff'), h), rough: 0.7 },
  rock: {
    h: (u, v) => {
      const [d1, d2] = cells(u, v, 6, 0.9);
      return clamp((d2 - d1) * 1.6) * 0.5 + tn.tileFbm(u, v, 8, 5) * 0.5;
    },
    c: (h, u, v) => mix3(hex3('#4a4a4e'), hex3('#a09a92'), clamp(h + (tn.tileFbm(u, v, 2, 3) - 0.5) * 0.5)),
    rough: 0.9,
  },
  stone: {
    h: (u, v) => {
      const [d1, d2] = cells(u, v, 5, 0.7);
      return smoothstep(0.02, 0.18, d2 - d1) * (0.75 + tn.tileFbm(u, v, 16, 3) * 0.25);
    },
    c: (h, u, v) => mix3(hex3('#3a3836'), mix3(hex3('#8a8580'), hex3('#b3aca2'), tn.tileFbm(u, v, 5, 2)), h),
    rough: 0.85,
  },
  cobble: {
    h: (u, v) => {
      const [d1, d2] = cells(u, v, 8, 0.6);
      return Math.pow(smoothstep(0.0, 0.35, d2 - d1), 0.6);
    },
    c: (h, u, v) => mix3(hex3('#2c2a28'), mix3(hex3('#6e6862'), hex3('#9c948a'), tn.tileFbm(u, v, 8, 2)), h),
    rough: 0.85,
  },
  brick: {
    h: (u, v) => {
      const rows = 8;
      const y = v * rows;
      const x = u * 4 + (Math.floor(y) % 2) * 0.5;
      const ex = Math.min(x - Math.floor(x), 1 - (x - Math.floor(x))) * 4;
      const ey = Math.min(y - Math.floor(y), 1 - (y - Math.floor(y)));
      return smoothstep(0.02, 0.08, Math.min(ex / 4, ey)) * (0.85 + tn.tileFbm(u, v, 16, 3) * 0.15);
    },
    c: (h, u, v) => (h < 0.5 ? hex3('#b8b0a4') : mix3(hex3('#7a2e20'), hex3('#b5583a'), tn.tile2(Math.floor(u * 4 + (Math.floor(v * 8) % 2) * 0.5) * 3.7, Math.floor(v * 8) * 5.1, 1e6))),
    rough: 0.9,
  },
  wood: {
    h: (u, v) => 0.5 + 0.5 * Math.sin((u * 10 + tn.tileFbm(u, v, 2, 4) * 3) * Math.PI * 2),
    c: (h) => mix3(hex3('#5a3a20'), hex3('#a8784a'), h),
    rough: 0.75,
  },
  planks: {
    h: (u, v) => {
      const x = u * 5;
      const e = Math.min(x - Math.floor(x), 1 - (x - Math.floor(x)));
      return smoothstep(0, 0.04, e) * (0.7 + 0.3 * Math.sin((v * 6 + tn.tileFbm(u, v, 4, 4) * 2 + Math.floor(x) * 0.37) * Math.PI * 2) * 0.5 + 0.15);
    },
    c: (h, u) => mix3(hex3('#3a2412'), mix3(hex3('#7a5030'), hex3('#a87850'), tn.tile2(Math.floor(u * 5) * 4.3, 1, 1e6)), h),
    rough: 0.7,
  },
  bark: {
    h: (u, v) => tn.tileFbm(u * 1, v * 0.25, 12, 4) * 0.7 + Math.abs(Math.sin(u * Math.PI * 16 + tn.tileFbm(u, v, 3, 3) * 4)) * 0.3,
    c: (h) => mix3(hex3('#2e2016'), hex3('#6e5038'), h),
    rough: 1,
  },
  metal: {
    h: (u, v) => 0.5 + (tn.tileFbm(u, v * 0.02, 64, 2) - 0.5) * 0.3,
    c: (h) => mix3(hex3('#7d838a'), hex3('#c3c8ce'), h),
    rough: 0.35,
    metal: 1,
  },
  rust: {
    h: (u, v) => tn.tileFbm(u, v, 6, 6),
    c: (h, u, v) => (tn.tileFbm(u, v, 3, 4) > 0.5 ? mix3(hex3('#5a2a12'), hex3('#a8541e'), h) : mix3(hex3('#5c6268'), hex3('#8a9096'), h)),
    rough: 0.8,
    metal: 0.6,
  },
  scifi: {
    h: (u, v) => {
      const g = (t, n) => Math.min(t * n - Math.floor(t * n), 1 - (t * n - Math.floor(t * n)));
      return smoothstep(0, 0.03, Math.min(g(u, 4), g(v, 4))) * (0.9 + 0.1 * smoothstep(0, 0.03, Math.min(g(u, 16), g(v, 2))));
    },
    c: (h, u, v) => mix3(hex3('#1c2028'), mix3(hex3('#5a6474'), hex3('#7c8796'), tn.tile2(Math.floor(u * 4) * 3.1, Math.floor(v * 4) * 1.7, 1e6)), h),
    glow: (h, u, v) => (Math.abs(((v * 16) % 1) - 0.5) < 0.03 && ((Math.floor(u * 4) + Math.floor(v * 4)) % 3 === 0) ? 1 : 0),
    rough: 0.45,
    metal: 0.8,
  },
  tiles: {
    h: (u, v) => {
      const g = (t) => Math.min(t * 6 - Math.floor(t * 6), 1 - (t * 6 - Math.floor(t * 6)));
      return smoothstep(0.01, 0.06, Math.min(g(u), g(v)));
    },
    c: (h, u, v) => (h < 0.5 ? hex3('#8a8580') : mix3(hex3('#d8d2c6'), hex3('#f1ece2'), tn.tile2(Math.floor(u * 6) * 2.1, Math.floor(v * 6) * 4.7, 1e6))),
    rough: 0.3,
  },
  marble: {
    h: (u, v) => 0.5 + 0.5 * Math.sin((u + v + tn.tileFbm(u, v, 3, 6) * 2.5) * Math.PI * 4),
    c: (h) => mix3(hex3('#9a958e'), hex3('#f4f1ea'), Math.pow(h, 0.4)),
    rough: 0.2,
  },
  ice: {
    h: (u, v) => {
      const [d1, d2] = cells(u, v, 5, 1);
      return 0.7 + smoothstep(0, 0.05, d2 - d1) * 0.3;
    },
    c: (h, u, v) => mix3(hex3('#7fb4d8'), hex3('#e4f4ff'), clamp(h * tn.tileFbm(u, v, 4, 3) * 1.6)),
    rough: 0.1,
  },
  lava: {
    h: (u, v) => {
      const [d1, d2] = cells(u, v, 6, 0.9);
      return smoothstep(0.0, 0.15, d2 - d1);
    },
    c: (h) => mix3(hex3('#ff6a10'), hex3('#2a1a16'), smoothstep(0.1, 0.6, h)),
    glow: (h) => 1 - smoothstep(0.05, 0.5, h),
    rough: 0.9,
  },
  fabric: {
    h: (u, v) => 0.5 + 0.25 * Math.sin(u * Math.PI * 2 * 64) * Math.sin(v * Math.PI * 2 * 64) + (tn.tileFbm(u, v, 16, 2) - 0.5) * 0.3,
    c: (h) => mix3(hex3('#6e6a66'), hex3('#a8a39c'), h),
    rough: 1,
  },
  leaves: {
    h: (u, v) => {
      const [d1] = cells(u, v, 10, 1);
      return 1 - smoothstep(0, 0.5, d1);
    },
    c: (h, u, v) => mix3(hex3('#1e3a14'), hex3('#5c8a2a'), clamp(h * 0.8 + tn.tileFbm(u, v, 4, 3) * 0.4)),
    rough: 0.85,
  },
  noise: { h: (u, v) => tn.tileFbm(u, v, 4, 6), c: (h) => [h, h, h], rough: 0.8 },
};

const texCache = new Map();
// IC3D.texture(kind, { size }) -> { map, normalMap, roughnessMap, emissiveMap? } (cached; repeat set by material())
function makeTexture(kind = 'noise', o = {}) {
  const spec = KINDS[kind] || KINDS.noise;
  const size = o.size || 256;
  const key = `${kind}:${size}`;
  if (texCache.has(key)) return texCache.get(key);
  const H = new Float32Array(size * size);
  for (let y = 0; y < size; y++) for (let x = 0; x < size; x++) H[y * size + x] = spec.h(x / size, y / size);
  const mk = () => {
    const c = document.createElement('canvas');
    c.width = c.height = size;
    const g = c.getContext('2d');
    return [c, g, g.createImageData(size, size)];
  };
  const [cc, cg, cd] = mk();
  const [nc, ng, nd] = mk();
  const [rc, rg, rd] = mk();
  const glow = spec.glow ? mk() : null;
  const strength = o.bump ?? 2.5;
  for (let y = 0; y < size; y++)
    for (let x = 0; x < size; x++) {
      const i = y * size + x;
      const h = H[i];
      const u = x / size;
      const v = y / size;
      const [r, g, b] = spec.c(h, u, v);
      cd.data.set([r * 255, g * 255, b * 255, 255], i * 4);
      const hl = H[y * size + ((x - 1 + size) % size)];
      const hr = H[y * size + ((x + 1) % size)];
      const hu = H[((y - 1 + size) % size) * size + x];
      const hd = H[((y + 1) % size) * size + x];
      const nx = (hl - hr) * strength;
      const ny = (hd - hu) * strength;
      const len = Math.hypot(nx, ny, 1);
      nd.data.set([(nx / len) * 127.5 + 127.5, (ny / len) * 127.5 + 127.5, (1 / len) * 127.5 + 127.5, 255], i * 4);
      const rough = clamp(spec.rough + (0.5 - h) * 0.15) * 255;
      rd.data.set([rough, rough, rough, 255], i * 4);
      if (glow) {
        const e = clamp(spec.glow(h, u, v)) * 255;
        glow[2].data.set([e, e, e, 255], i * 4);
      }
    }
  cg.putImageData(cd, 0, 0);
  ng.putImageData(nd, 0, 0);
  rg.putImageData(rd, 0, 0);
  const tex = (canvas, srgb) => {
    const t = new THREE.CanvasTexture(canvas);
    t.wrapS = t.wrapT = THREE.RepeatWrapping;
    t.colorSpace = srgb ? THREE.SRGBColorSpace : THREE.NoColorSpace;
    t.anisotropy = 8;
    t.userData.shared = true;
    return t;
  };
  const out = { map: tex(cc, true), normalMap: tex(nc, false), roughnessMap: tex(rc, false), metalness: spec.metal || 0, roughness: 1 };
  if (glow) {
    glow[1].putImageData(glow[2], 0, 0);
    out.emissiveMap = tex(glow[0], true);
  }
  texCache.set(key, out);
  return out;
}

// IC3D.material(kind, { color, repeat, emissive, emissiveIntensity, ...MeshStandardMaterial options })
// A tinted PBR material from a procedural texture. color multiplies the texture (white keeps it as is).
function makeMaterial(kind = 'stone', o = {}) {
  const t = makeTexture(kind, o);
  const rep = o.repeat ?? 1;
  const clone = (tx) => {
    if (!tx) return null;
    const c = tx.clone();
    c.repeat.set(...(Array.isArray(rep) ? rep : [rep, rep]));
    c.needsUpdate = true;
    return c;
  };
  const opts = { ...o };
  ['repeat', 'size', 'bump'].forEach((k) => delete opts[k]);
  const m = new THREE.MeshStandardMaterial({
    map: clone(t.map),
    normalMap: clone(t.normalMap),
    roughnessMap: clone(t.roughnessMap),
    metalness: t.metalness,
    roughness: 1,
    color: o.color ?? '#ffffff',
    ...opts,
  });
  if (t.emissiveMap && o.emissive === undefined) {
    m.emissiveMap = clone(t.emissiveMap);
    m.emissive = new THREE.Color(kind === 'lava' ? '#ff5a10' : '#4ad8ff');
    m.emissiveIntensity = o.emissiveIntensity ?? 2.5;
  }
  return m;
}

// A glowing material that blooms (lamps, crystals, lasers, magic).
const glowMaterial = (color = '#66ccff', intensity = 3) => new THREE.MeshStandardMaterial({ color: '#000000', emissive: col(color), emissiveIntensity: intensity, roughness: 0.4 });
