// ----------------------------------------------------------------------------------------------------- terrain
// Biomes: colour bands by height (0 = water level, 1 = highest) and what steep slopes show.
const BIOMES = {
  temperate: { bands: [[0, '#c2b280'], [0.04, '#5d8a35'], [0.35, '#4a7a2c'], [0.6, '#6b6250'], [0.78, '#8a8580'], [0.9, '#f2f5f8']], cliff: '#6e665c' },
  forest: { bands: [[0, '#b8a878'], [0.04, '#3e6b26'], [0.45, '#2f5a20'], [0.8, '#4a5a30'], [0.95, '#6a6a58']], cliff: '#5a5248' },
  desert: { bands: [[0, '#d8b878'], [0.3, '#e2c48a'], [0.6, '#c99a5e'], [0.85, '#a8704a']], cliff: '#a0603a' },
  snow: { bands: [[0, '#9aa8b8'], [0.05, '#e8eef6'], [0.5, '#f4f8ff'], [1, '#ffffff']], cliff: '#6a7480' },
  autumn: { bands: [[0, '#c2b280'], [0.04, '#8a7a2a'], [0.3, '#a8642a'], [0.6, '#7a5a3a'], [0.85, '#d8d2c8']], cliff: '#6a5a4a' },
  volcanic: { bands: [[0, '#2a2220'], [0.3, '#3a302c'], [0.7, '#4a3a34'], [0.9, '#6a4030']], cliff: '#1e1816' },
  alien: { bands: [[0, '#3a2a5a'], [0.1, '#6a3a8a'], [0.4, '#2a8a8a'], [0.7, '#c86aa8'], [0.9, '#f0d8ff']], cliff: '#4a2a5a' },
  candy: { bands: [[0, '#ffd8ec'], [0.1, '#a8f0c8'], [0.4, '#ffb8d8'], [0.7, '#c8b8ff'], [0.9, '#ffffff']], cliff: '#ff98c8' },
  moon: { bands: [[0, '#5a5a60'], [0.5, '#8a8a90'], [1, '#c0c0c6']], cliff: '#4a4a50' },
  tropical: { bands: [[0, '#f0dca8'], [0.06, '#5aa83a'], [0.4, '#3a8a2a'], [0.75, '#5a6a3a'], [0.9, '#7a7a6a']], cliff: '#6a5a48' },
};

function bandColor(bands, t) {
  if (t <= bands[0][0]) return col(bands[0][1]);
  for (let i = 1; i < bands.length; i++) {
    if (t <= bands[i][0]) {
      const k = smoothstep(bands[i][0] - 0.05, bands[i][0], t);
      return col(bands[i - 1][1]).lerp(col(bands[i][1]), k);
    }
  }
  return col(bands[bands.length - 1][1]);
}

// IC3D.createTerrain(world, { size, resolution, height, seed, shape, biome, waterLevel, flatten, heightFn, texture })
function createTerrain(world, o = {}) {
  const size = o.size || 400;
  const res = Math.min(o.resolution || (world.quality === 'high' ? 320 : world.quality === 'medium' ? 224 : 150), 512);
  const height = o.height ?? 30;
  const seed = o.seed ?? 1;
  const n = makeNoise(seed);
  const shape = o.shape || 'hills';
  const f = (o.frequency || 1) / size;
  const flats = o.flatten || [];
  const waterLevel = o.waterLevel ?? null;

  function rawHeight(x, z) {
    if (typeof o.heightFn === 'function') return o.heightFn(x, z, n);
    let h;
    switch (shape) {
      case 'mountains':
        h = Math.pow(n.ridged2(x * f * 1.3, z * f * 1.3, 5, 2, 0.45), 1.8) * 1.1 + (n.fbm2(x * f * 1.5, z * f * 1.5, 3) * 0.5 + 0.5) * 0.15;
        break;
      case 'islands': {
        const d = Math.hypot(x, z) / (size * 0.5);
        h = (n.fbm2(x * f * 3, z * f * 3, 6) * 0.5 + 0.55) * (1 - smoothstep(0.35, 0.95, d)) - 0.18 + Math.pow(n.ridged2(x * f * 4, z * f * 4, 4), 3) * 0.35 * (1 - d);
        break;
      }
      case 'plains':
        h = n.fbm2(x * f * 2, z * f * 2, 4) * 0.15 + 0.15;
        break;
      case 'dunes':
        h = (Math.abs(Math.sin((x * 0.6 + z + n.fbm2(x * f * 3, z * f * 3, 3) * size * 0.15) * f * 18)) * 0.35 + n.fbm2(x * f * 2, z * f * 2, 3) * 0.4 + 0.3) * 0.8;
        break;
      case 'canyon': {
        const v = n.fbm2(x * f * 2.5, z * f * 2.5, 5) * 0.5 + 0.5;
        const steps = 5;
        const s = v * steps;
        h = (Math.floor(s) + smoothstep(0.75, 1, s - Math.floor(s))) / steps;
        h -= Math.max(0, 0.35 - Math.abs(n.fbm2(x * f * 1.5 + 9, z * f * 1.5, 3)) * 4) * 0.6;
        break;
      }
      case 'crater': {
        const d = Math.hypot(x, z) / (size * 0.5);
        h = 0.3 + n.fbm2(x * f * 4, z * f * 4, 5) * 0.12 - Math.exp(-d * d * 18) * 0.3 + Math.exp(-Math.pow((d - 0.35) * 9, 2)) * 0.25;
        break;
      }
      case 'flat':
        h = 0;
        break;
      default: // hills
        h = n.fbm2(x * f * 2.5, z * f * 2.5, 6) * 0.5 + 0.5;
        h = h * h * 1.2 + n.ridged2(x * f * 4, z * f * 4, 4) * 0.12;
    }
    return h * height;
  }

  function shapedHeight(x, z) {
    let h = rawHeight(x, z);
    for (const p of flats) {
      const d = Math.hypot(x - p.x, z - p.z);
      const r = p.radius || 10;
      const k = 1 - smoothstep(r, r + (p.blend ?? r * 0.8), d);
      if (k > 0) h = lerp(h, p.height ?? rawHeight(p.x, p.z), k);
    }
    return h;
  }

  const verts = res + 1;
  const H = new Float32Array(verts * verts);
  const cell = size / res;
  let minH = Infinity;
  let maxH = -Infinity;
  for (let j = 0; j < verts; j++)
    for (let i = 0; i < verts; i++) {
      const h = shapedHeight(-size / 2 + i * cell, -size / 2 + j * cell);
      H[j * verts + i] = h;
      minH = Math.min(minH, h);
      maxH = Math.max(maxH, h);
    }

  // smooth sharp ridges so they don't alias against the grid
  for (let pass = 0; pass < (o.smooth ?? (shape === 'mountains' ? 3 : shape === 'canyon' ? 2 : 1)); pass++) {
    const S = H.slice();
    for (let j = 1; j < res; j++)
      for (let i = 1; i < res; i++) {
        const k = j * verts + i;
        H[k] = (S[k] * 4 + S[k - 1] + S[k + 1] + S[k - verts] + S[k + verts]) / 8;
      }
  }
  minH = Infinity;
  maxH = -Infinity;
  for (let k = 0; k < H.length; k++) {
    if (H[k] < minH) minH = H[k];
    if (H[k] > maxH) maxH = H[k];
  }
  const geo = new THREE.PlaneGeometry(size, size, res, res);
  geo.rotateX(-Math.PI / 2);
  const pos = geo.attributes.position;
  for (let k = 0; k < pos.count; k++) pos.setY(k, H[k]);
  // normals straight from the height field (central differences): smooth across the grid's diagonals, where averaged
  // face normals alternate along folds and shade as a saw-tooth
  const nrmA = geo.attributes.normal;
  for (let j = 0; j < verts; j++)
    for (let i = 0; i < verts; i++) {
      const hx = H[j * verts + Math.min(res, i + 1)] - H[j * verts + Math.max(0, i - 1)];
      const hz = H[Math.min(res, j + 1) * verts + i] - H[Math.max(0, j - 1) * verts + i];
      const dx = (Math.min(res, i + 1) - Math.max(0, i - 1)) * cell;
      const dz = (Math.min(res, j + 1) - Math.max(0, j - 1)) * cell;
      const nx = -hx / dx;
      const nz = -hz / dz;
      const l = Math.hypot(nx, 1, nz);
      nrmA.setXYZ(j * verts + i, nx / l, 1 / l, nz / l);
    }
  nrmA.needsUpdate = true;

  const biome = typeof o.biome === 'object' ? o.biome : BIOMES[o.biome || 'temperate'] || BIOMES.temperate;
  const base = waterLevel ?? minH;
  const colors = new Float32Array(pos.count * 3);
  for (let k = 0; k < pos.count; k++) {
    const x = pos.getX(k);
    const z = pos.getZ(k);
    const t = clamp((H[k] - base) / Math.max(1e-3, maxH - base) + n.fbm2(x * 0.05, z * 0.05, 2) * 0.04);
    const c = bandColor(biome.bands, t);
    const v = 0.88 + n.fbm2(x * 0.08, z * 0.08, 3) * 0.14;
    c.multiplyScalar(v);
    colors.set([c.r, c.g, c.b], k * 3);
  }
  geo.setAttribute('color', new THREE.BufferAttribute(colors, 3));

  const detail = makeTexture(o.texture || (o.biome === 'desert' || o.biome === 'candy' ? 'sand' : o.biome === 'snow' ? 'snow' : 'noise'), {});
  const rep = size / (o.textureScale || 6);
  const tmap = (t) => {
    const c = t.clone();
    c.repeat.set(rep, rep);
    c.needsUpdate = true;
    return c;
  };
  const mat = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.95, metalness: 0, normalMap: tmap(detail.normalMap), normalScale: new THREE.Vector2(0.6, 0.6) });
  if (o.texture) mat.map = tmap(detail.map);
  // cliffs: steep ground turns to rock per pixel (from the smooth normal), with a rock texture projected from three
  // sides so it never stretches on vertical faces
  const rock = makeTexture('rock');
  const cliffU = { value: col(biome.cliff) };
  mat.onBeforeCompile = (sh) => {
    sh.uniforms.uCliff = cliffU;
    sh.uniforms.uRock = { value: rock.map };
    sh.vertexShader = sh.vertexShader
      .replace('#include <common>', '#include <common>\nvarying vec3 vWPos;')
      .replace('#include <worldpos_vertex>', '#include <worldpos_vertex>\nvWPos = (modelMatrix * vec4(transformed, 1.0)).xyz;');
    sh.fragmentShader = sh.fragmentShader
      .replace('#include <common>', '#include <common>\nvarying vec3 vWPos; uniform vec3 uCliff; uniform sampler2D uRock;')
      .replace(
        '#include <normal_fragment_begin>',
        `#include <normal_fragment_begin>
        vec3 wN = normalize(inverseTransformDirection(normal, viewMatrix));
        float wobbleC = sin(vWPos.x * 0.21 + sin(vWPos.z * 0.17) * 2.0) * 0.04 + sin(vWPos.z * 0.33) * 0.03;
        float cliffK = smoothstep(0.2, 0.62, 1.0 - wN.y + wobbleC);
        vec3 bw = pow(abs(wN), vec3(4.0)); bw /= (bw.x + bw.y + bw.z);
        vec3 rk = texture2D(uRock, vWPos.zy * 0.12).rgb * bw.x + texture2D(uRock, vWPos.xz * 0.12).rgb * bw.y + texture2D(uRock, vWPos.xy * 0.12).rgb * bw.z;
        diffuseColor.rgb = mix(diffuseColor.rgb, uCliff * rk * 2.2, cliffK);`
      );
  };
  const mesh = new THREE.Mesh(geo, mat);
  mesh.receiveShadow = true;
  mesh.castShadow = o.castShadow ?? false; // self-shadowing terrain saw-tooths under a low sun; its shading shows the shape
  mesh.name = 'terrain';
  world.scene.add(mesh);

  // exact height on the mesh's triangles (PlaneGeometry splits each cell along b-d)
  function heightAt(x, z) {
    const gx = (x + size / 2) / cell;
    const gz = (z + size / 2) / cell;
    if (gx < 0 || gz < 0 || gx > res || gz > res) return shapedHeight(x, z);
    const i = Math.min(Math.floor(gx), res - 1);
    const j = Math.min(Math.floor(gz), res - 1);
    const u = gx - i;
    const v = gz - j;
    const ha = H[j * verts + i];
    const hb = H[(j + 1) * verts + i];
    const hc = H[(j + 1) * verts + i + 1];
    const hd = H[j * verts + i + 1];
    if (u + v <= 1) return ha + (hd - ha) * u + (hb - ha) * v;
    return hc + (hb - hc) * (1 - u) + (hd - hc) * (1 - v);
  }
  function normalAt(x, z) {
    const e = cell;
    return new THREE.Vector3(heightAt(x - e, z) - heightAt(x + e, z), 2 * e, heightAt(x, z - e) - heightAt(x, z + e)).normalize();
  }
  const slopeAt = (x, z) => 1 - normalAt(x, z).y;
  // a random spot that fits: { minHeight, maxHeight, maxSlope, near: {x, z, radius}, avoid: [{x, z, radius}], margin, rng }
  function randomPoint(q = {}) {
    const r = q.rng || Math.random;
    const margin = q.margin ?? size * 0.04;
    for (let tries = 0; tries < 60; tries++) {
      let x;
      let z;
      if (q.near) {
        const a = r() * Math.PI * 2;
        const d = Math.sqrt(r()) * (q.near.radius || 20);
        x = q.near.x + Math.cos(a) * d;
        z = q.near.z + Math.sin(a) * d;
      } else {
        x = (r() - 0.5) * (size - margin * 2);
        z = (r() - 0.5) * (size - margin * 2);
      }
      const y = heightAt(x, z);
      if (q.minHeight !== undefined && y < q.minHeight) continue;
      if (q.maxHeight !== undefined && y > q.maxHeight) continue;
      if (waterLevel !== null && q.dry !== false && y < waterLevel + 0.3) continue;
      if (q.maxSlope !== undefined && slopeAt(x, z) > q.maxSlope) continue;
      if (q.avoid && q.avoid.some((a) => Math.hypot(a.x - x, a.z - z) < (a.radius || 5))) continue;
      return new THREE.Vector3(x, y, z);
    }
    return null;
  }
  // stand an object on the ground at (x, z), optionally tilted to the slope
  function place(obj, x, z, { offset = 0, align = false } = {}) {
    obj.position.set(x, heightAt(x, z) + offset, z);
    if (align) obj.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), normalAt(x, z));
    return obj;
  }

  return { mesh, size, height, waterLevel, minHeight: minH, maxHeight: maxH, heightAt, normalAt, slopeAt, randomPoint, place, noise: n };
}

// ------------------------------------------------------------------------------------------------------- water
let waterNormals = null;
function waterNormalTexture() {
  if (waterNormals) return waterNormals;
  const size = 256;
  const data = new Uint8Array(size * size * 4);
  const hgt = (x, y) => tn.tileFbm(x / size, y / size, 6, 4) * 0.7 + tn.tileFbm(x / size, y / size, 16, 2) * 0.3;
  for (let y = 0; y < size; y++)
    for (let x = 0; x < size; x++) {
      const nx = (hgt((x - 1 + size) % size, y) - hgt((x + 1) % size, y)) * 6;
      const ny = (hgt(x, (y - 1 + size) % size) - hgt(x, (y + 1) % size)) * 6;
      const l = Math.hypot(nx, ny, 1);
      data.set([(nx / l) * 127.5 + 127.5, (ny / l) * 127.5 + 127.5, (1 / l) * 127.5 + 127.5, 255], (y * size + x) * 4);
    }
  waterNormals = new THREE.DataTexture(data, size, size);
  waterNormals.wrapS = waterNormals.wrapT = THREE.RepeatWrapping;
  waterNormals.needsUpdate = true;
  return waterNormals;
}

// IC3D.createWater(world, { level, size, color, opacity, reflections })
function createWater(world, o = {}) {
  const size = o.size || 2000;
  const level = o.level ?? 0;
  const color = col(o.color || '#1b6a8a');
  const geo = new THREE.PlaneGeometry(size, size);
  geo.rotateX(-Math.PI / 2);
  let mesh;
  if ((o.reflections ?? world.quality === 'high') && !o.lava) {
    mesh = new Water(new THREE.PlaneGeometry(size, size), {
      textureWidth: 512,
      textureHeight: 512,
      waterNormals: waterNormalTexture(),
      sunDirection: world.sunDirection,
      sunColor: '#ffffff',
      waterColor: color,
      distortionScale: o.distortion ?? 2.5,
      fog: !!world.scene.fog,
      alpha: o.opacity ?? 1,
    });
    mesh.rotation.x = -Math.PI / 2;
    mesh.material.uniforms.size.value = o.waveScale ?? 6;
    world.onUpdate((dt) => {
      mesh.material.uniforms.time.value += dt * (o.speed ?? 0.6);
      mesh.material.uniforms.sunDirection.value.copy(world.sunDirection);
      mesh.material.uniforms.sunColor.value.copy(world.sun.color).multiplyScalar(world.sun.visible ? 1 : 0.15);
    });
  } else {
    const nm = waterNormalTexture().clone();
    nm.repeat.set(size / 30, size / 30);
    nm.needsUpdate = true;
    const mat = new THREE.MeshPhysicalMaterial({
      color,
      roughness: o.lava ? 0.8 : 0.06,
      metalness: 0,
      transparent: !o.lava,
      opacity: o.opacity ?? 0.86,
      normalMap: nm,
      normalScale: new THREE.Vector2(0.35, 0.35),
      envMapIntensity: 1.2,
      ...(o.lava ? { emissive: col(o.color || '#ff5a10'), emissiveIntensity: 1.6, emissiveMap: makeTexture('lava').emissiveMap } : {}),
    });
    mesh = new THREE.Mesh(geo, mat);
    world.onUpdate((dt, t) => {
      nm.offset.set(t * 0.01 * (o.speed ?? 1), t * 0.006 * (o.speed ?? 1));
    });
  }
  mesh.position.y = level;
  mesh.receiveShadow = !o.reflections;
  mesh.name = 'water';
  world.scene.add(mesh);
  return mesh;
}
