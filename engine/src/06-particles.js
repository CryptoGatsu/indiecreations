// --------------------------------------------------------------------------------------------------- particles
// GPU points with per-particle colour, size and fade. Presets describe how particles are born and move.
const PARTICLES = {
  fire: { colors: ['#ffc860', '#ff7a20', '#d8381a'], size: [0.45, 0.95], life: [0.5, 1.1], speed: [0.3, 0.9], up: 1.8, spread: 0.4, grow: -0.7, additive: true, opacity: 0.7, spawnRadius: 0.5, rate: 45 },
  smoke: { colors: ['#5a5a5a', '#8a8a8a'], size: [1.5, 3], life: [2, 4], speed: [0.4, 1], up: 1.2, spread: 0.6, grow: 1.4, opacity: 0.45, rate: 12 },
  sparks: { colors: ['#fff2b0', '#ffb040'], size: [0.15, 0.3], life: [0.4, 0.9], speed: [4, 10], up: 3, spread: 1, gravity: -12, additive: true, rate: 40 },
  magic: { colors: ['#9a7aff', '#4ad8ff', '#ff7af0'], size: [0.3, 0.7], life: [0.8, 1.6], speed: [0.5, 1.5], up: 0.8, spread: 1, swirl: 3, additive: true, rate: 40 },
  snow: { colors: ['#ffffff', '#e8f0ff'], size: [0.15, 0.35], life: [6, 10], speed: [0, 0.3], gravity: -1.2, drift: 0.6, weather: true, area: 60, rate: 220 },
  rain: { colors: ['#a8c0e0'], size: [0.08, 0.12], life: [1, 1.5], speed: [0, 0], gravity: -40, weather: true, area: 50, opacity: 0.6, rate: 900, stretch: true },
  dust: { colors: ['#e8d8b8', '#ffffff'], size: [0.06, 0.14], life: [4, 8], speed: [0.05, 0.2], drift: 0.3, weather: true, area: 30, opacity: 0.5, rate: 30, additive: true },
  fireflies: { colors: ['#d8ff6a', '#ffe86a'], size: [0.2, 0.35], life: [3, 6], speed: [0.2, 0.6], drift: 0.8, weather: true, area: 40, additive: true, blink: true, rate: 20 },
  leaves: { colors: ['#d8742a', '#c8a42a', '#a8402a', '#6a8a2a'], size: [0.3, 0.5], life: [5, 9], speed: [0, 0.4], gravity: -0.9, drift: 1.4, weather: true, area: 40, rate: 25 },
  bubbles: { colors: ['#bfefff'], size: [0.15, 0.4], life: [2, 4], speed: [0.2, 0.5], up: 1.5, drift: 0.3, opacity: 0.6, rate: 20 },
  confetti: { colors: ['#ff4a6a', '#ffd84a', '#4ad8ff', '#6aff8a', '#c87aff'], size: [0.25, 0.4], life: [1.5, 2.5], speed: [6, 12], up: 6, spread: 1, gravity: -9, drift: 1, rate: 0 },
  explosion: { colors: ['#fff2b0', '#ffa030', '#ff4a10', '#5a3a2a'], size: [1, 3], life: [0.5, 1.3], speed: [4, 14], spread: 1, gravity: -3, grow: 0.8, additive: true, rate: 0 },
  heal: { colors: ['#6aff9a', '#c8ffd8'], size: [0.3, 0.6], life: [0.8, 1.4], speed: [0.5, 1.2], up: 2, spread: 0.6, additive: true, rate: 30 },
};

const particleVS = `attribute float aSize; attribute float aAlpha; attribute vec3 aColor; varying float vAlpha; varying vec3 vColor;
uniform float uScale;
void main(){ vAlpha = aAlpha; vColor = aColor; vec4 mv = modelViewMatrix * vec4(position, 1.0); gl_PointSize = aSize * uScale / -mv.z; gl_Position = projectionMatrix * mv; }`;
const particleFS = `uniform sampler2D map; uniform float uLight; varying float vAlpha; varying vec3 vColor;
void main(){ vec4 t = texture2D(map, gl_PointCoord); if (t.a * vAlpha < 0.01) discard; gl_FragColor = vec4(vColor * uLight, t.a * vAlpha);
#include <tonemapping_fragment>
#include <colorspace_fragment>
}`;

// IC3D.particles(world, { preset, at (Vector3 | Object3D), rate, color(s), size, area, max }) ->
//   { emit(count, position?), start(), stop(), points, dispose() }
function createParticles(world, o = {}) {
  const p = { ...(PARTICLES[o.preset] || PARTICLES.magic), ...o };
  if (o.color) p.colors = [o.color];
  const max = o.max || Math.max(64, Math.ceil(p.rate * p.life[1] * 1.2) + (p.rate === 0 ? 400 : 0));
  const pos = new Float32Array(max * 3);
  const vel = new Float32Array(max * 3);
  const colr = new Float32Array(max * 3);
  const size = new Float32Array(max);
  const size0 = new Float32Array(max);
  const alpha = new Float32Array(max);
  const age = new Float32Array(max).fill(1e9);
  const life = new Float32Array(max).fill(1);
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.BufferAttribute(pos, 3).setUsage(THREE.DynamicDrawUsage));
  geo.setAttribute('aColor', new THREE.BufferAttribute(colr, 3).setUsage(THREE.DynamicDrawUsage));
  geo.setAttribute('aSize', new THREE.BufferAttribute(size, 1).setUsage(THREE.DynamicDrawUsage));
  geo.setAttribute('aAlpha', new THREE.BufferAttribute(alpha, 1).setUsage(THREE.DynamicDrawUsage));
  const mat = new THREE.ShaderMaterial({
    uniforms: { map: { value: dotTexture() }, uScale: { value: window.innerHeight * 0.5 }, uLight: { value: 1 } },
    vertexShader: particleVS,
    fragmentShader: particleFS,
    transparent: true,
    depthWrite: false,
    blending: p.additive ? THREE.AdditiveBlending : THREE.NormalBlending,
  });
  const points = new THREE.Points(geo, mat);
  points.frustumCulled = false;
  world.scene.add(points);
  const palette = p.colors.map((c) => col(c));
  let next = 0;
  let running = p.rate > 0 && o.autoStart !== false;
  let carry = 0;
  const tmp = new THREE.Vector3();
  const origin = () => {
    if (p.weather) return world.camera.position;
    if (!p.at) return tmp.set(0, 0, 0);
    return p.at.isVector3 ? p.at : p.at.getWorldPosition(tmp);
  };

  function spawn(from) {
    const i = next;
    next = (next + 1) % max;
    const R = Math.random;
    const o3 = i * 3;
    if (p.weather) {
      const a = p.area;
      pos[o3] = from.x + (R() - 0.5) * a;
      pos[o3 + 1] = from.y + R() * a * 0.5 + (p.gravity ? a * 0.15 : -a * 0.1);
      pos[o3 + 2] = from.z + (R() - 0.5) * a;
    } else {
      const sp = p.spawnRadius ?? 0.2;
      pos[o3] = from.x + (R() - 0.5) * sp;
      pos[o3 + 1] = from.y + (R() - 0.5) * sp;
      pos[o3 + 2] = from.z + (R() - 0.5) * sp;
    }
    const s = lerp(p.speed[0], p.speed[1], R());
    const dir = new THREE.Vector3((R() - 0.5) * 2, (R() - 0.5) * 2, (R() - 0.5) * 2).normalize().multiplyScalar(s * (p.spread ?? 1));
    vel[o3] = dir.x;
    vel[o3 + 1] = dir.y + (p.up || 0);
    vel[o3 + 2] = dir.z;
    const c = palette[Math.floor(R() * palette.length)];
    colr.set([c.r, c.g, c.b], o3);
    size0[i] = lerp(p.size[0], p.size[1], R()) * (p.scale || 1);
    life[i] = lerp(p.life[0], p.life[1], R());
    age[i] = 0;
  }

  const unsub = world.onUpdate((dt, t) => {
    mat.uniforms.uScale.value = window.innerHeight * 0.5 * world.renderer.getPixelRatio();
    // glowing particles shine on their own; smoke, snow and leaves take the scene's light
    mat.uniforms.uLight.value = p.additive ? 1 : clamp(world.hemi.intensity * 0.9 + (world.sun.visible ? world.sun.intensity * 0.15 : 0), 0.12, 1.2);
    if (running && p.rate > 0) {
      carry += p.rate * dt;
      const from = origin();
      while (carry >= 1) {
        spawn(from);
        carry--;
      }
    }
    for (let i = 0; i < max; i++) {
      if (age[i] > life[i]) {
        alpha[i] = 0;
        continue;
      }
      age[i] += dt;
      const k = age[i] / life[i];
      const o3 = i * 3;
      vel[o3 + 1] += (p.gravity || 0) * dt * (p.stretch ? 0 : 1);
      if (p.drift) {
        vel[o3] += Math.sin(t * 1.3 + i) * p.drift * dt;
        vel[o3 + 2] += Math.cos(t * 1.1 + i * 1.7) * p.drift * dt;
      }
      if (p.swirl) {
        const x = vel[o3];
        vel[o3] = x * Math.cos(p.swirl * dt) - vel[o3 + 2] * Math.sin(p.swirl * dt);
        vel[o3 + 2] = x * Math.sin(p.swirl * dt) + vel[o3 + 2] * Math.cos(p.swirl * dt);
      }
      if (p.drag !== 0) {
        const d = 1 - (p.drag ?? 0.6) * dt * (p.gravity ? 0.2 : 1);
        vel[o3] *= d;
        vel[o3 + 2] *= d;
        if (!p.gravity) vel[o3 + 1] *= d;
      }
      pos[o3] += vel[o3] * dt;
      pos[o3 + 1] += (p.stretch ? p.gravity : vel[o3 + 1]) * dt;
      pos[o3 + 2] += vel[o3 + 2] * dt;
      size[i] = size0[i] * Math.max(0.05, 1 + (p.grow || 0) * k);
      let a = (p.opacity ?? 1) * Math.min(1, k * 8) * (1 - k * k);
      if (p.blink) a *= 0.5 + 0.5 * Math.sin(t * 4 + i * 2.1);
      alpha[i] = a;
    }
    geo.attributes.position.needsUpdate = true;
    geo.attributes.aSize.needsUpdate = true;
    geo.attributes.aAlpha.needsUpdate = true;
    geo.attributes.aColor.needsUpdate = true;
  });

  return {
    points,
    emit(count = 20, at = null) {
      const from = at ? (at.isVector3 ? at : at.getWorldPosition(new THREE.Vector3())) : origin().clone();
      for (let i = 0; i < count; i++) spawn(from);
    },
    start() {
      running = true;
    },
    stop() {
      running = false;
    },
    set position(v) {
      p.at = v;
    },
    dispose() {
      unsub();
      world.remove(points);
    },
  };
}

// IC3D.burst(world, position, { preset: 'explosion' | 'sparks' | 'confetti' | 'magic' | 'smoke' | 'heal', count, color })
// One-shot effect; systems are pooled per preset and colour.
const burstPools = new WeakMap();
function burst(world, position, o = {}) {
  const preset = o.preset || 'sparks';
  let pools = burstPools.get(world);
  if (!pools) burstPools.set(world, (pools = new Map()));
  const key = `${preset}:${o.color || ''}:${o.scale || 1}`;
  if (!pools.has(key)) pools.set(key, createParticles(world, { preset, rate: 0, color: o.color, scale: o.scale, max: 600 }));
  const sys = pools.get(key);
  const count = o.count ?? (preset === 'explosion' ? 80 : 40);
  sys.emit(count, position.isVector3 ? position : new THREE.Vector3(...position));
  if (preset === 'explosion') {
    if (!pools.has('smoke:')) pools.set('smoke:', createParticles(world, { preset: 'smoke', rate: 0, max: 300 }));
    pools.get('smoke:').emit(Math.round(count / 4), position);
  }
}
