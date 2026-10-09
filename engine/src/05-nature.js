// ------------------------------------------------------------------------------------------------------ models
// Procedural props as single vertex-coloured geometries, ready for instancing. All stand on y = 0, about 1 unit
// per metre (a pine is ~8 m). Colours are multiplied by the instance colour, for variety.
function paint(geo, color, jitter = 0, r = Math.random) {
  const g = geo.index ? geo.toNonIndexed() : geo;
  const n = g.attributes.position.count;
  const c = new Float32Array(n * 3);
  const base = col(color);
  for (let i = 0; i < n; i += 3) {
    const k = 1 + (r() - 0.5) * jitter;
    for (let v = 0; v < 3 && i + v < n; v++) c.set([base.r * k, base.g * k, base.b * k], (i + v) * 3);
  }
  g.setAttribute('color', new THREE.BufferAttribute(c, 3));
  g.deleteAttribute('uv');
  return g;
}
function wobble(geo, amount, seed = 1, freq = 1.4) {
  const nz = makeNoise(seed);
  const p = geo.attributes.position;
  for (let i = 0; i < p.count; i++) {
    const x = p.getX(i);
    const y = p.getY(i);
    const z = p.getZ(i);
    const d = nz.simplex3(x * freq, y * freq, z * freq) * amount;
    const l = Math.hypot(x, y, z) || 1;
    p.setXYZ(i, x + (x / l) * d, y + (y / l) * d, z + (z / l) * d);
  }
  geo.computeVertexNormals();
  return geo;
}
const merge = (parts) => {
  const g = mergeGeometries(parts.map((p) => (p.index ? p.toNonIndexed() : p)), false);
  g.computeVertexNormals();
  return g;
};
const at = (geo, x, y, z, rx = 0, ry = 0, rz = 0, s = 1) => {
  geo.applyMatrix4(new THREE.Matrix4().compose(new THREE.Vector3(x, y, z), new THREE.Quaternion().setFromEuler(new THREE.Euler(rx, ry, rz)), new THREE.Vector3(s, s, s)));
  return geo;
};

const MODELS = {
  pine(r, c) {
    const parts = [paint(at(new THREE.CylinderGeometry(0.18, 0.32, 3, 7), 0, 1.5, 0), c.trunk || '#5a3a24', 0.2, r)];
    const tiers = 4 + Math.floor(r() * 2);
    for (let i = 0; i < tiers; i++) {
      const t = i / tiers;
      const rad = lerp(2.4, 0.7, t) * (0.9 + r() * 0.2);
      const cone = wobble(new THREE.ConeGeometry(rad, 2.6 - t * 0.8, 9, 2), 0.18, r() * 1000);
      parts.push(paint(at(cone, 0, 2.4 + i * 1.35, 0, 0, r() * 3), col(c.leaves || '#2e5a2a').multiplyScalar(0.85 + t * 0.35), 0.18, r));
    }
    return merge(parts);
  },
  oak(r, c) {
    const parts = [paint(wobble(at(new THREE.CylinderGeometry(0.28, 0.5, 3.4, 8, 3), 0, 1.7, 0), 0.08, r() * 99), c.trunk || '#5a4030', 0.2, r)];
    for (let i = 0; i < 2; i++) parts.push(paint(at(new THREE.CylinderGeometry(0.1, 0.18, 1.8, 6), 0, 3.2, 0, 0, i * 2.4 + r(), 0.9), c.trunk || '#5a4030', 0.2, r));
    const blobs = 5 + Math.floor(r() * 3);
    for (let i = 0; i < blobs; i++) {
      const a = (i / blobs) * Math.PI * 2 + r();
      const d = i === 0 ? 0 : 1.1 + r() * 0.6;
      const s = i === 0 ? 2.1 : 1.3 + r() * 0.6;
      const blob = wobble(new THREE.IcosahedronGeometry(s, 2), 0.35, r() * 1000, 0.9);
      parts.push(paint(at(blob, Math.cos(a) * d, 4.4 + r() * 1.2 + (i === 0 ? 0.6 : 0), Math.sin(a) * d), col(c.leaves || '#4a7a2a').multiplyScalar(0.85 + r() * 0.3), 0.15, r));
    }
    return merge(parts);
  },
  birch(r, c) {
    const parts = [paint(at(new THREE.CylinderGeometry(0.14, 0.22, 6, 7), 0, 3, 0), c.trunk || '#e8e4dc', 0.3, r)];
    for (let i = 0; i < 4; i++) {
      const blob = wobble(new THREE.IcosahedronGeometry(1 + r() * 0.5, 1), 0.25, r() * 1000);
      parts.push(paint(at(blob, (r() - 0.5) * 1.4, 4.6 + i * 0.7, (r() - 0.5) * 1.4, 0, 0, 0, 1 - i * 0.12), c.leaves || '#8ab040', 0.2, r));
    }
    return merge(parts);
  },
  palm(r, c) {
    const parts = [];
    const segs = 8;
    const bend = 0.6 + r() * 0.6;
    let top = new THREE.Vector3();
    for (let i = 0; i < segs; i++) {
      const t = i / segs;
      const x = Math.pow(t, 2) * bend * 2;
      const seg = at(new THREE.CylinderGeometry(0.2 - t * 0.06, 0.24 - t * 0.06, 0.95, 7), x, 0.45 + i * 0.85, 0, 0, 0, -t * bend * 0.5);
      parts.push(paint(seg, i % 2 ? c.trunk || '#8a6a44' : '#7a5a38', 0.1, r));
      top = new THREE.Vector3(x, 0.9 + i * 0.85, 0);
    }
    for (let i = 0; i < 7; i++) {
      const a = (i / 7) * Math.PI * 2 + r() * 0.4;
      const leaf = new THREE.PlaneGeometry(0.9, 3.4, 1, 4);
      const p = leaf.attributes.position;
      for (let k = 0; k < p.count; k++) {
        const y = p.getY(k) + 1.7;
        p.setXYZ(k, p.getX(k) * (1 - y / 3.6), y, -Math.pow(y / 3.4, 2) * 1.4);
      }
      leaf.computeVertexNormals();
      parts.push(paint(at(leaf, top.x, top.y, top.z, -0.9, a, 0), c.leaves || '#3a8a2a', 0.2, r));
    }
    parts.push(paint(at(new THREE.IcosahedronGeometry(0.28, 0), top.x + 0.2, top.y - 0.2, 0.1), '#5a3a1a', 0.1, r));
    return merge(parts);
  },
  cherry(r, c) {
    return MODELS.oak(r, { trunk: c.trunk || '#4a3030', leaves: c.leaves || '#f2a8c8' });
  },
  dead(r, c) {
    const parts = [paint(wobble(at(new THREE.CylinderGeometry(0.15, 0.35, 4.2, 6, 3), 0, 2.1, 0), 0.1, r() * 99), c.trunk || '#4a4038', 0.2, r)];
    for (let i = 0; i < 5; i++) parts.push(paint(at(new THREE.CylinderGeometry(0.04, 0.1, 1.6 + r(), 5), 0, 2 + i * 0.5, 0, (r() - 0.5) * 2, r() * 6, 0.8 + r() * 0.6), c.trunk || '#4a4038', 0.2, r));
    return merge(parts);
  },
  bush(r, c) {
    const parts = [];
    for (let i = 0; i < 4; i++) parts.push(paint(wobble(at(new THREE.IcosahedronGeometry(0.6 + r() * 0.4, 1), (r() - 0.5) * 1.2, 0.5 + r() * 0.3, (r() - 0.5) * 1.2), 0.2, r() * 999), col(c.leaves || '#3e6a2a').multiplyScalar(0.85 + r() * 0.3), 0.2, r));
    if (c.berries) for (let i = 0; i < 6; i++) parts.push(paint(at(new THREE.IcosahedronGeometry(0.09, 0), (r() - 0.5) * 1.6, 0.6 + r() * 0.6, (r() - 0.5) * 1.6), c.berries, 0, r));
    return merge(parts);
  },
  rock(r, c) {
    const g = wobble(new THREE.IcosahedronGeometry(1, 2), 0.35, r() * 1000, 1.1);
    g.scale(1 + r() * 0.6, 0.55 + r() * 0.4, 1 + r() * 0.5);
    g.translate(0, 0.25, 0);
    const p = paint(g, c.color || '#7a766e', 0.22, r);
    p.computeVertexNormals();
    return p;
  },
  boulder(r, c) {
    const g = MODELS.rock(r, c);
    g.scale(2.6, 2.4, 2.6);
    return g;
  },
  grass(r, c) {
    const parts = [];
    const blades = 7;
    for (let i = 0; i < blades; i++) {
      const h = 0.5 + r() * 0.6;
      const b = new THREE.ConeGeometry(0.05, h, 3, 1, true);
      b.translate(0, h / 2, 0);
      const pg = b.toNonIndexed();
      const n = pg.attributes.position.count;
      const cc = new Float32Array(n * 3);
      const lo = col(c.base || '#2a4a18');
      const hi = col(c.tip || '#9ac84a');
      for (let k = 0; k < n; k++) {
        const t = pg.attributes.position.getY(k) / h;
        const cl = lo.clone().lerp(hi, t);
        cc.set([cl.r, cl.g, cl.b], k * 3);
      }
      pg.setAttribute('color', new THREE.BufferAttribute(cc, 3));
      pg.deleteAttribute('uv');
      parts.push(at(pg, (r() - 0.5) * 0.5, 0, (r() - 0.5) * 0.5, (r() - 0.5) * 0.5, r() * 6, (r() - 0.5) * 0.5));
    }
    return mergeGeometries(parts, false);
  },
  flower(r, c) {
    const parts = [paint(at(new THREE.CylinderGeometry(0.02, 0.025, 0.5, 4), 0, 0.25, 0), '#3a6a2a', 0, r)];
    const petal = c.color || r.pick(['#ff6a8a', '#ffd84a', '#ffffff', '#b88aff', '#ff9a4a']);
    for (let i = 0; i < 5; i++) parts.push(paint(at(new THREE.SphereGeometry(0.07, 5, 3), Math.cos((i / 5) * 6.28) * 0.08, 0.52, Math.sin((i / 5) * 6.28) * 0.08, 0, 0, 0, 1), petal, 0.1, r));
    parts.push(paint(at(new THREE.SphereGeometry(0.05, 5, 3), 0, 0.54, 0), '#ffcc33', 0, r));
    return merge(parts);
  },
  mushroom(r, c) {
    const cap = new THREE.SphereGeometry(0.45, 12, 6, 0, Math.PI * 2, 0, Math.PI / 2);
    cap.scale(1, 0.7, 1);
    return merge([paint(at(new THREE.CylinderGeometry(0.12, 0.16, 0.6, 8), 0, 0.3, 0), '#efe6d6', 0.05, r), paint(at(cap, 0, 0.58, 0), c.color || '#c8302a', 0.1, r)]);
  },
  crystal(r, c) {
    const parts = [];
    for (let i = 0; i < 5; i++) {
      const h = 0.8 + r() * 1.6;
      const g = new THREE.CylinderGeometry(0, 0.22, h * 0.3, 6);
      g.translate(0, h + h * 0.15, 0);
      const body = new THREE.CylinderGeometry(0.22, 0.22, h, 6);
      body.translate(0, h / 2, 0);
      parts.push(paint(at(merge([body, g]), (r() - 0.5) * 0.6, 0, (r() - 0.5) * 0.6, (r() - 0.5) * 0.7, 0, (r() - 0.5) * 0.7), c.color || '#7ad8ff', 0.15, r));
    }
    return merge(parts);
  },
  cactus(r, c) {
    const cap = (h) => merge([at(new THREE.CylinderGeometry(0.32, 0.32, h, 10), 0, h / 2, 0), at(new THREE.SphereGeometry(0.32, 10, 5, 0, 6.3, 0, 1.6), 0, h, 0)]);
    const parts = [paint(cap(3 + r()), c.color || '#4a8a3a', 0.08, r)];
    for (const s of [-1, 1])
      if (r() < 0.8) {
        const y = 1.1 + r() * 0.8;
        parts.push(paint(at(new THREE.CylinderGeometry(0.2, 0.2, 0.8, 8), s * 0.55, y, 0, 0, 0, Math.PI / 2), c.color || '#4a8a3a', 0.08, r));
        parts.push(paint(at(cap(0.9 + r() * 0.5), s * 0.9, y, 0), c.color || '#4a8a3a', 0.08, r));
      }
    return merge(parts);
  },
  fern(r, c) {
    const parts = [];
    for (let i = 0; i < 8; i++) {
      const leaf = new THREE.PlaneGeometry(0.25, 1.2, 1, 3);
      const p = leaf.attributes.position;
      for (let k = 0; k < p.count; k++) {
        const y = p.getY(k) + 0.6;
        p.setXYZ(k, p.getX(k) * (1 - y / 1.3), y, Math.pow(y, 2) * 0.35);
      }
      parts.push(paint(at(leaf, 0, 0, 0, -0.5, (i / 8) * 6.28 + r() * 0.3, 0), c.leaves || '#3a7a2a', 0.2, r));
    }
    return merge(parts);
  },
};

// one shared clock for every swaying material
const windTime = { value: 0 };
function windMaterial(o = {}) {
  const m = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: o.roughness ?? 0.85, metalness: 0, side: o.side ?? THREE.FrontSide, flatShading: o.flat ?? false, emissive: o.emissive ? col(o.emissive) : new THREE.Color(0), emissiveIntensity: o.emissiveIntensity ?? 1 });
  const strength = o.wind ?? 1;
  if (strength > 0)
    m.onBeforeCompile = (s) => {
      s.uniforms.uWind = windTime;
      s.vertexShader = s.vertexShader
        .replace('#include <common>', '#include <common>\nuniform float uWind;')
        .replace(
          '#include <begin_vertex>',
          `#include <begin_vertex>
          #ifdef USE_INSTANCING
            vec3 ip = vec3(instanceMatrix[3][0], instanceMatrix[3][1], instanceMatrix[3][2]);
          #else
            vec3 ip = vec3(0.0);
          #endif
          float hw = max(position.y, 0.0);
          float sway = sin(uWind * 1.6 + ip.x * 0.35 + ip.z * 0.27) + 0.4 * sin(uWind * 3.7 + ip.x * 1.1);
          transformed.x += sway * hw * hw * ${(0.006 * strength).toFixed(4)};
          transformed.z += cos(uWind * 1.3 + ip.z * 0.31) * hw * hw * ${(0.004 * strength).toFixed(4)};`
        );
    };
  return m;
}

// IC3D.model(type, { seed, colors }) -> a Mesh you can place yourself
function makeModel(type, o = {}) {
  const r = rng(o.seed ?? Math.floor(Math.random() * 1e9));
  const build = MODELS[type] || MODELS.rock;
  const geo = build(r, o.colors || o);
  const mesh = new THREE.Mesh(geo, windMaterial({ wind: 0, ...o, emissive: type === 'crystal' ? o.color || '#7ad8ff' : o.emissive, emissiveIntensity: type === 'crystal' ? 0.8 : o.emissiveIntensity, side: type === 'palm' || type === 'fern' ? THREE.DoubleSide : THREE.FrontSide }));
  mesh.castShadow = true;
  mesh.receiveShadow = true;
  return mesh;
}

// IC3D.scatter(world, terrain, { type, count, variants, colors, scale: [min, max], minHeight, maxHeight, maxSlope,
//   area: { x, z, radius }, avoid: [{x, z, radius}], seed, collide }) -> { meshes, points, colliders }
// Fills the terrain with instanced props. Counts scale down on lower quality.
function scatter(world, terrain, o = {}) {
  const type = o.type || 'pine';
  const q = world.quality === 'high' ? 1 : world.quality === 'medium' ? 0.6 : 0.35;
  const count = Math.max(1, Math.round((o.count ?? 200) * (o.exact ? 1 : q)));
  const r = rng(o.seed ?? 99);
  const variants = o.variants ?? (type === 'grass' || type === 'flower' ? 2 : 3);
  const isSmall = ['grass', 'flower', 'fern', 'mushroom'].includes(type);
  const wind = o.wind ?? (['rock', 'boulder', 'crystal', 'cactus', 'mushroom', 'dead'].includes(type) ? 0 : isSmall ? 2.5 : 1);
  const scaleR = o.scale || (isSmall ? [0.8, 1.4] : type === 'rock' ? [0.5, 2.2] : [0.75, 1.35]);
  const pts = [];
  for (let i = 0; i < count; i++) {
    const p = terrain.randomPoint({ rng: r, minHeight: o.minHeight, maxHeight: o.maxHeight, maxSlope: o.maxSlope ?? (isSmall ? 0.35 : 0.3), near: o.area, avoid: o.avoid });
    if (p) pts.push(p);
  }
  const meshes = [];
  const colliders = [];
  const dummy = new THREE.Object3D();
  const per = Math.ceil(pts.length / variants);
  for (let v = 0; v < variants; v++) {
    const geo = (MODELS[type] || MODELS.rock)(rng((o.seed ?? 99) * 31 + v), o.colors || {});
    const mat = windMaterial({ wind, emissive: type === 'crystal' ? (o.colors && o.colors.color) || '#7ad8ff' : null, emissiveIntensity: type === 'crystal' ? 0.9 : 1, side: type === 'palm' || type === 'fern' || type === 'grass' ? THREE.DoubleSide : THREE.FrontSide });
    const chunk = pts.slice(v * per, (v + 1) * per);
    if (!chunk.length) continue;
    const im = new THREE.InstancedMesh(geo, mat, chunk.length);
    chunk.forEach((p, i) => {
      const s = lerp(scaleR[0], scaleR[1], r());
      dummy.position.set(p.x, p.y - (isSmall ? 0.02 : 0.1 * s), p.z);
      dummy.rotation.set(0, r() * Math.PI * 2, 0);
      if (type === 'rock' || type === 'boulder') dummy.rotation.set((r() - 0.5) * 0.4, r() * 6.28, (r() - 0.5) * 0.4);
      dummy.scale.setScalar(s);
      dummy.updateMatrix();
      im.setMatrixAt(i, dummy.matrix);
      im.setColorAt(i, new THREE.Color(1, 1, 1).multiplyScalar(0.85 + r() * 0.3));
      if (o.collide ?? !isSmall) colliders.push({ x: p.x, z: p.z, radius: (type === 'rock' ? 0.9 : type === 'boulder' ? 2.4 : type === 'bush' ? 0.7 : 0.45) * s, top: p.y + (type === 'rock' ? 0.7 * s : type === 'boulder' ? 2.2 * s : 99) });
    });
    im.castShadow = !isSmall || world.quality === 'high';
    im.receiveShadow = true;
    im.instanceMatrix.needsUpdate = true;
    if (im.instanceColor) im.instanceColor.needsUpdate = true;
    im.computeBoundingSphere();
    world.scene.add(im);
    meshes.push(im);
  }
  return { meshes, points: pts, colliders };
}

// a lumpy cloud puff: many soft blobs on one canvas
let puffTex = null;
function puffTexture() {
  if (puffTex) return puffTex;
  const c = document.createElement('canvas');
  c.width = c.height = 128;
  const g = c.getContext('2d');
  const r = rng(77);
  for (let i = 0; i < 26; i++) {
    const x = 64 + (r() - 0.5) * 70;
    const y = 70 + (r() - 0.5) * 34;
    const rad = 14 + r() * 22;
    const grd = g.createRadialGradient(x, y - rad * 0.3, 0, x, y, rad);
    const shade = Math.round(225 + r() * 30);
    grd.addColorStop(0, `rgba(${shade},${shade},${shade},0.55)`);
    grd.addColorStop(1, 'rgba(255,255,255,0)');
    g.fillStyle = grd;
    g.fillRect(0, 0, 128, 128);
  }
  puffTex = new THREE.CanvasTexture(c);
  puffTex.colorSpace = THREE.SRGBColorSpace;
  return puffTex;
}

// IC3D.createClouds(world, { count, height, area, color, opacity, speed })
function createClouds(world, o = {}) {
  const r = rng(o.seed ?? 5);
  const count = o.count ?? 24;
  const area = o.area ?? 800;
  const group = new THREE.Group();
  const mat = new THREE.SpriteMaterial({ map: puffTexture(), color: col(o.color || '#ffffff'), transparent: true, opacity: o.opacity ?? 0.9, depthWrite: false, fog: false });
  for (let i = 0; i < count; i++) {
    const cloud = new THREE.Group();
    const puffs = 9 + Math.floor(r() * 7);
    for (let k = 0; k < puffs; k++) {
      const s = new THREE.Sprite(mat);
      const sz = 22 + r() * 30;
      s.scale.set(sz * 1.6, sz, 1);
      s.position.set((r() - 0.5) * 50, (r() - 0.5) * 6, (r() - 0.5) * 22);
      cloud.add(s);
    }
    cloud.position.set((r() - 0.5) * area, (o.height ?? 140) + r() * 40, (r() - 0.5) * area);
    group.add(cloud);
  }
  world.scene.add(group);
  world.onUpdate((dt) => {
    for (const c of group.children) {
      c.position.x += dt * (o.speed ?? 3);
      if (c.position.x > area / 2) c.position.x -= area;
    }
    mat.color.copy(col(o.color || '#ffffff')).lerp(world.sun.color, 0.25).multiplyScalar(clamp(0.35 + world.sun.intensity * 0.3 + world.hemi.intensity * 0.3, 0.15, 1.3));
  });
  return group;
}
