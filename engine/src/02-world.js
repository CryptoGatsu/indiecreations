// ------------------------------------------------------------------------------------------------------- world
// Quality: 'high' | 'medium' | 'low'. 'auto' picks by device, and the frame rate then tunes the resolution.
function pickQuality(q) {
  if (q === 'high' || q === 'medium' || q === 'low') return q;
  const touch = typeof matchMedia === 'function' && matchMedia('(pointer: coarse)').matches;
  const cores = navigator.hardwareConcurrency || 4;
  if (touch) return cores >= 8 ? 'medium' : 'low';
  return cores >= 6 ? 'high' : 'medium';
}

// Sky looks by sun height. Each: [elevation, turbidity, rayleigh, mie, sun colour, sky light, ground light, fog]
const SKY_KEYS = [
  [-12, 2, 0.4, 0.004, '#3a4a7a', '#0d1630', '#05070d', '#070b18'],
  [-3, 6, 2.5, 0.01, '#ff7a45', '#3a3f6a', '#1a1420', '#2a2238'],
  [2, 8, 3, 0.012, '#ff9a5a', '#8a7aa8', '#3a2a2a', '#9a6a5a'],
  [8, 5, 2, 0.007, '#ffc28a', '#b0bcd8', '#5a4a3a', '#a8907e'],
  [20, 3, 1.2, 0.004, '#fff0dc', '#bcd4f0', '#6a5a48', '#94a8bc'],
  [60, 2, 0.9, 0.003, '#ffffff', '#c4dcff', '#6e6250', '#8aa4c0'],
];
const PRESETS = {
  day: { time: 11 },
  morning: { time: 8 },
  dawn: { time: 6.4 },
  sunset: { time: 17.6 },
  dusk: { time: 18.2 },
  night: { time: 23 },
  overcast: { gradient: ['#a7b0ba', '#c9d0d6', '#7d8580'], light: 0.55, fog: '#b9c0c6', time: 12 },
  storm: { gradient: ['#3d4550', '#6b7480', '#2a2f33'], light: 0.35, fog: '#59616b', time: 12 },
  space: { gradient: ['#000005', '#04040e', '#000000'], stars: 1, light: 0.9, fog: null, time: 12, nebula: true },
  underwater: { gradient: ['#0a3a5a', '#11709a', '#04182a'], light: 0.6, fog: '#0e5a7e', time: 12, density: 0.025 },
  alien: { gradient: ['#3a1450', '#e2648a', '#1a0a20'], light: 0.8, fog: '#a04a78', time: 16 },
  candy: { gradient: ['#8fd3ff', '#ffd1ec', '#c8a2ff'], light: 1, fog: '#ffd6ee', time: 12 },
  void: { gradient: ['#05060a', '#101320', '#000000'], light: 0.5, fog: '#0b0d16', time: 12 },
};

function sampleKeys(elev) {
  const k = SKY_KEYS;
  if (elev <= k[0][0]) return k[0];
  for (let i = 1; i < k.length; i++) {
    if (elev <= k[i][0]) {
      const a = k[i - 1];
      const b = k[i];
      const t = (elev - a[0]) / (b[0] - a[0]);
      return a.map((v, j) => (typeof v === 'number' ? lerp(v, b[j], t) : `#${col(v).lerp(col(b[j]), t).getHexString()}`));
    }
  }
  return k[k.length - 1];
}

const gradientSkyMaterial = (top, horizon, bottom) =>
  new THREE.ShaderMaterial({
    uniforms: { top: { value: col(top) }, horizon: { value: col(horizon) }, bottom: { value: col(bottom) }, sunDir: { value: new THREE.Vector3(0, 1, 0) }, sunGlow: { value: 0.35 } },
    vertexShader: 'varying vec3 vDir; void main(){ vDir = normalize(position); vec4 p = projectionMatrix * modelViewMatrix * vec4(position,1.0); gl_Position = p.xyww; }',
    fragmentShader:
      'uniform vec3 top; uniform vec3 horizon; uniform vec3 bottom; uniform vec3 sunDir; uniform float sunGlow; varying vec3 vDir;' +
      'void main(){ float h = normalize(vDir).y; vec3 c = h > 0.0 ? mix(horizon, top, pow(clamp(h,0.0,1.0), 0.6)) : mix(horizon, bottom, pow(clamp(-h,0.0,1.0), 0.5));' +
      ' float s = max(dot(normalize(vDir), normalize(sunDir)), 0.0); c += vec3(1.0,0.9,0.7) * pow(s, 64.0) * sunGlow * 2.0 + vec3(1.0,0.8,0.6) * pow(s, 6.0) * sunGlow * 0.25;' +
      ' gl_FragColor = vec4(c, 1.0);\n#include <tonemapping_fragment>\n#include <colorspace_fragment>\n}',
    side: THREE.BackSide,
    depthWrite: false,
    fog: false,
  });

// a round, soft-edged dot for points, sprites and puffs
let softDot = null;
function dotTexture() {
  if (softDot) return softDot;
  const c = document.createElement('canvas');
  c.width = c.height = 64;
  const g = c.getContext('2d');
  const grd = g.createRadialGradient(32, 32, 0, 32, 32, 32);
  grd.addColorStop(0, 'rgba(255,255,255,1)');
  grd.addColorStop(0.35, 'rgba(255,255,255,0.75)');
  grd.addColorStop(1, 'rgba(255,255,255,0)');
  g.fillStyle = grd;
  g.fillRect(0, 0, 64, 64);
  softDot = new THREE.CanvasTexture(c);
  softDot.colorSpace = THREE.SRGBColorSpace;
  return softDot;
}

function makeStars(count, radius, seed = 7) {
  const r = rng(seed);
  const pos = new Float32Array(count * 3);
  const colr = new Float32Array(count * 3);
  for (let i = 0; i < count; i++) {
    const u = r() * 2 - 1;
    const th = r() * Math.PI * 2;
    const s = Math.sqrt(1 - u * u);
    pos.set([s * Math.cos(th) * radius, Math.abs(u) * radius * (r() < 0.85 ? 1 : -1), s * Math.sin(th) * radius], i * 3);
    const c = col(r.pick(['#ffffff', '#cfe0ff', '#ffe6c8', '#d8d0ff'])).multiplyScalar(0.6 + r() * 0.8);
    colr.set([c.r, c.g, c.b], i * 3);
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  g.setAttribute('color', new THREE.BufferAttribute(colr, 3));
  const m = new THREE.PointsMaterial({ size: 2.2, sizeAttenuation: false, vertexColors: true, transparent: true, depthWrite: false, fog: false, map: dotTexture() });
  const pts = new THREE.Points(g, m);
  pts.frustumCulled = false;
  pts.renderOrder = -1;
  return pts;
}

// grading + vignette, applied after tone mapping (display space)
const GradeShader = {
  uniforms: { tDiffuse: { value: null }, saturation: { value: 1.08 }, contrast: { value: 1.05 }, vignette: { value: 0.28 }, warmth: { value: 0 } },
  vertexShader: 'varying vec2 vUv; void main(){ vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position,1.0); }',
  fragmentShader:
    'uniform sampler2D tDiffuse; uniform float saturation; uniform float contrast; uniform float vignette; uniform float warmth; varying vec2 vUv;' +
    'void main(){ vec4 c = texture2D(tDiffuse, vUv); float l = dot(c.rgb, vec3(0.2126,0.7152,0.0722));' +
    ' c.rgb = mix(vec3(l), c.rgb, saturation); c.rgb = (c.rgb - 0.5) * contrast + 0.5; c.rgb += vec3(0.04,0.01,-0.04) * warmth;' +
    ' vec2 d = vUv - 0.5; c.rgb *= 1.0 - vignette * smoothstep(0.25, 0.85, dot(d,d) * 2.2); gl_FragColor = vec4(clamp(c.rgb,0.0,1.0), c.a); }',
};

// the physical sky, with a gain so a noon sky doesn't blow out
// and its horizon melts into the fog, so distant land and sky meet without a seam
const skyGain = { value: 1 };
const skyFog = { value: new THREE.Color('#94a8bc') };
const skyFogAmount = { value: 0.85 };
function makeSky() {
  const s = new Sky();
  s.material.onBeforeCompile = (sh) => {
    sh.uniforms.skyGain = skyGain;
    sh.uniforms.skyFog = skyFog;
    sh.uniforms.skyFogAmount = skyFogAmount;
    sh.fragmentShader = sh.fragmentShader
      .replace('uniform vec3 up;', 'uniform vec3 up;\nuniform float skyGain;\nuniform vec3 skyFog;\nuniform float skyFogAmount;')
      .replace(
        'gl_FragColor = vec4( retColor, 1.0 );',
        'float hz = 1.0 - smoothstep(-0.02, 0.22, normalize(vWorldPosition - cameraPosition).y);\n' +
          'gl_FragColor = vec4( mix(retColor * skyGain, skyFog, hz * skyFogAmount), 1.0 );'
      );
  };
  return s;
}

function createWorld(o = {}) {
  const quality = pickQuality(o.quality || 'auto');
  const high = quality === 'high';
  const low = quality === 'low';
  const parent = o.parent || document.body;
  const renderer = new THREE.WebGLRenderer({ antialias: low, powerPreference: 'high-performance', preserveDrawingBuffer: false });
  const maxDpr = Math.min(window.devicePixelRatio || 1, high ? 2 : quality === 'medium' ? 1.5 : 1.25);
  let dpr = maxDpr;
  renderer.setPixelRatio(dpr);
  renderer.setSize(window.innerWidth, window.innerHeight);
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = o.exposure ?? 0.62;
  renderer.shadowMap.enabled = o.shadows !== false;
  renderer.shadowMap.type = THREE.PCFSoftShadowMap;
  Object.assign(renderer.domElement.style, { position: 'fixed', inset: '0', width: '100%', height: '100%', display: 'block', touchAction: 'none' });
  parent.appendChild(renderer.domElement);

  const scene = new THREE.Scene();
  const cam = o.camera || {};
  const camera = new THREE.PerspectiveCamera(cam.fov || 60, window.innerWidth / window.innerHeight, cam.near || 0.1, cam.far || 3000);
  camera.position.set(...(cam.position || [0, 8, 18]));
  scene.add(camera);

  // lights: sun (with shadows), sky/ground fill, and a moon for nights
  const sun = new THREE.DirectionalLight('#ffffff', 3);
  sun.castShadow = renderer.shadowMap.enabled;
  const shadowSize = high ? 4096 : quality === 'medium' ? 2048 : 1024;
  sun.shadow.mapSize.set(shadowSize, shadowSize);
  const range = o.shadowRange || (high ? 70 : 50);
  Object.assign(sun.shadow.camera, { left: -range, right: range, top: range, bottom: -range, near: 1, far: 800 });
  sun.shadow.bias = -0.0004;
  sun.shadow.normalBias = 0.04;
  scene.add(sun, sun.target);
  const hemi = new THREE.HemisphereLight('#bcd4f0', '#6a5a48', 0.7);
  scene.add(hemi);
  const moon = new THREE.DirectionalLight('#9ab0ff', 0);
  scene.add(moon, moon.target);

  // sky: physically based (Sky shader) for real skies, a gradient for stylised ones
  const skyBox = makeSky();
  const skyU = skyBox.material.uniforms;
  skyU.mieDirectionalG.value = 0.8;
  skyBox.material.depthWrite = false;
  let gradient = null;
  const stars = makeStars(high ? 3000 : 1500, 1, 11);
  stars.scale.setScalar(camera.far * 0.8);
  scene.add(stars);
  // night: a deep blue dome over the physical sky, fading in as the sun goes down
  const nightDome = new THREE.Mesh(new THREE.SphereGeometry(1, 32, 16), gradientSkyMaterial('#02040c', '#141c38', '#04050a'));
  nightDome.material.transparent = true;
  nightDome.material.uniforms.sunGlow.value = 0;
  nightDome.scale.setScalar(camera.far * 0.85);
  nightDome.renderOrder = -1.5;
  nightDome.frustumCulled = false;
  scene.add(nightDome);
  const pmrem = new THREE.PMREMGenerator(renderer);
  const envScene = new THREE.Scene();
  let envTarget = null;
  const sunDir = new THREE.Vector3();
  let preset = {};
  let elevation = 45;
  let azimuth = o.sunAzimuth ?? 150;
  let lightScale = 1;
  let lastEnvElev = null;

  // composer: HDR render (MSAA), bloom, tone mapping, grading
  let composer = null;
  let bloom = null;
  let grade = null;
  if (!low && o.post !== false) {
    const rt = new THREE.WebGLRenderTarget(1, 1, { type: THREE.HalfFloatType, samples: high ? 4 : 2 });
    composer = new EffectComposer(renderer, rt);
    composer.addPass(new RenderPass(scene, camera));
    const b = o.bloom === false ? null : { strength: 0.45, radius: 0.55, threshold: 0.9, ...(o.bloom || {}) };
    if (b) {
      bloom = new UnrealBloomPass(new THREE.Vector2(256, 256), b.strength, b.radius, b.threshold);
      composer.addPass(bloom);
    }
    composer.addPass(new OutputPass());
    grade = new ShaderPass(GradeShader);
    Object.entries(o.grade || {}).forEach(([k, v]) => grade.uniforms[k] && (grade.uniforms[k].value = v));
    composer.addPass(grade);
  }

  let fog = null;
  if (o.fog !== false) {
    fog = new THREE.FogExp2('#bcd0e6', (o.fog && o.fog.density) || 0.0018);
    scene.fog = fog;
  }

  function updateEnv(force) {
    if (!force && lastEnvElev !== null && Math.abs(lastEnvElev - elevation) < 1.5) return;
    lastEnvElev = elevation;
    envScene.clear();
    if (gradient) envScene.add(new THREE.Mesh(new THREE.SphereGeometry(10, 32, 16), gradient.material));
    else {
      const s = makeSky();
      s.scale.setScalar(100);
      Object.keys(skyU).forEach((k) => s.material.uniforms[k] && (s.material.uniforms[k].value = skyU[k].value));
      envScene.add(s);
    }
    const prev = envTarget;
    envTarget = pmrem.fromScene(envScene, 0, 0.1, 1000);
    scene.environment = envTarget.texture;
    scene.environmentIntensity = (preset.gradient ? 0.6 : 0.8) * clamp((elevation + 8) / 20, 0.1, 1);
    if (prev) prev.dispose();
  }

  // time of day: 0..24 (6 sunrise, 12 noon, 18 sunset)
  let time = 12;
  function setTime(h, force = false) {
    time = ((h % 24) + 24) % 24;
    elevation = preset.elevation ?? Math.sin(((time - 6) / 24) * Math.PI * 2) * 65;
    const phi = THREE.MathUtils.degToRad(90 - elevation);
    const theta = THREE.MathUtils.degToRad(azimuth);
    sunDir.setFromSphericalCoords(1, phi, theta);
    const [, turb, ray, mie, sunC, skyC, groundC, fogC] = sampleKeys(elevation);
    skyU.turbidity.value = turb;
    skyU.rayleigh.value = ray;
    skyU.mieCoefficient.value = mie;
    skyU.sunPosition.value.copy(sunDir);
    skyGain.value = lerp(0.9, 0.42, smoothstep(4, 40, elevation));
    const day = clamp((elevation + 4) / 14);
    sun.color.set(sunC);
    sun.intensity = 3 * day * lightScale;
    sun.visible = day > 0.01;
    moon.intensity = (1 - day) * 1.1 * lightScale;
    hemi.color.set(skyC);
    hemi.groundColor.set(groundC);
    hemi.intensity = (0.45 + 0.3 * day) * lightScale;
    stars.material.opacity = preset.stars ?? clamp(1 - (elevation + 6) / 10);
    stars.visible = stars.material.opacity > 0.01;
    if (gradient) gradient.material.uniforms.sunDir.value.copy(sunDir);
    if (fog) fog.color.set(o.fog?.color || preset.fog || fogC);
    skyFog.value.copy(fog ? fog.color : col(fogC));
    skyFogAmount.value = fog && scene.fog ? 0.85 : 0.4;
    nightDome.material.opacity = gradient ? 0 : smoothstep(3, -9, elevation);
    nightDome.visible = nightDome.material.opacity > 0.01;
    if (!gradient) renderer.toneMappingExposure = (o.exposure ?? 0.62) * lerp(1.35, 1, day);
    updateEnv(force);
  }

  function setSky(name) {
    preset = typeof name === 'object' ? { gradient: [name.top, name.horizon, name.bottom], fog: name.fog, light: name.light, time: name.time } : PRESETS[name] || PRESETS.day;
    if (gradient) {
      scene.remove(gradient);
      gradient.material.dispose();
      gradient = null;
    }
    scene.remove(skyBox);
    if (preset.gradient) {
      gradient = new THREE.Mesh(new THREE.SphereGeometry(1, 32, 16), gradientSkyMaterial(...preset.gradient));
      gradient.scale.setScalar(camera.far * 0.9);
      gradient.renderOrder = -2;
      gradient.frustumCulled = false;
      scene.add(gradient);
      scene.background = null;
    } else {
      skyBox.scale.setScalar(camera.far * 0.5);
      scene.add(skyBox);
    }
    lightScale = preset.light ?? 1;
    if (fog && preset.density) fog.density = preset.density;
    if (fog && preset.fog === null) scene.fog = null;
    else if (fog) scene.fog = fog;
    setTime(o.time ?? preset.time ?? 12, true);
  }

  // shadows follow what matters (the player); the camera's focus otherwise
  let focus = null;
  const focusPos = new THREE.Vector3();
  function placeSun() {
    if (focus) focusPos.copy(focus.isVector3 ? focus : focus.getWorldPosition(new THREE.Vector3()));
    else focusPos.copy(camera.position).add(camera.getWorldDirection(new THREE.Vector3()).multiplyScalar(range * 0.5));
    const texel = (range * 2) / shadowSize;
    focusPos.x = Math.round(focusPos.x / texel) * texel;
    focusPos.z = Math.round(focusPos.z / texel) * texel;
    const d = sunDir.y > 0.02 ? sunDir : new THREE.Vector3(0.3, 1, 0.2).normalize();
    sun.position.copy(focusPos).addScaledVector(d, 300);
    sun.target.position.copy(focusPos);
    moon.position.copy(focusPos).add(new THREE.Vector3(-0.4, 1, -0.3).multiplyScalar(300));
    moon.target.position.copy(focusPos);
  }

  // camera shake
  let shakeT = 0;
  let shakeAmt = 0;
  const shakeOff = new THREE.Vector3();

  const updates = [];
  const world = {
    THREE,
    VERSION,
    quality,
    scene,
    camera,
    renderer,
    composer,
    sun,
    moon,
    hemi,
    bloom,
    grade,
    time: 0,
    paused: false,
    dayLength: o.dayLength || 0, // seconds per in-game day; 0 = time stands still
    get timeOfDay() {
      return time;
    },
    get sunDirection() {
      return sunDir.clone();
    },
    setTime,
    setSky,
    follow(target) {
      focus = target;
    },
    onUpdate(fn) {
      updates.push(fn);
      return () => {
        const i = updates.indexOf(fn);
        if (i >= 0) updates.splice(i, 1);
      };
    },
    add(...objs) {
      scene.add(...objs);
      return objs[0];
    },
    remove(obj, dispose = true) {
      if (!obj) return;
      obj.removeFromParent();
      if (dispose) disposeObject(obj);
    },
    shake(amount = 0.4, duration = 0.35) {
      shakeAmt = Math.max(shakeAmt, amount);
      shakeT = Math.max(shakeT, duration);
    },
    render() {
      if (composer) composer.render();
      else renderer.render(scene, camera);
    },
    start() {
      renderer.setAnimationLoop(tick);
    },
    stop() {
      renderer.setAnimationLoop(null);
    },
  };

  // frame rate: lower the resolution when frames are slow, raise it back when there's headroom
  let frames = 0;
  let acc = 0;
  function adapt(dt) {
    frames++;
    acc += dt;
    if (acc < 2) return;
    const avg = acc / frames;
    frames = 0;
    acc = 0;
    if (avg > 1 / 40 && dpr > 0.6) dpr = Math.max(0.6, dpr * 0.85);
    else if (avg < 1 / 58 && dpr < maxDpr) dpr = Math.min(maxDpr, dpr * 1.08);
    else return;
    renderer.setPixelRatio(dpr);
    resize();
  }

  let last = performance.now();
  function tick(now) {
    const dt = Math.min((now - last) / 1000, 1 / 15);
    last = now;
    if (!world.paused) {
      world.time += dt;
      if (world.dayLength > 0) setTime(time + (dt / world.dayLength) * 24);
      for (let i = 0; i < updates.length; i++) {
        try {
          updates[i](dt, world.time);
        } catch (err) {
          report(err);
        }
      }
    }
    input.edges.clear(); // a press counts for the frame it happened in
    windTime.value = world.time;
    skyBox.position.copy(camera.position);
    if (gradient) gradient.position.copy(camera.position);
    stars.position.copy(camera.position);
    nightDome.position.copy(camera.position);
    stars.rotation.y = world.time * 0.002;
    placeSun();
    if (shakeT > 0) {
      shakeT -= dt;
      const a = shakeAmt * Math.max(shakeT, 0) * 3;
      shakeOff.set((Math.random() - 0.5) * a, (Math.random() - 0.5) * a, (Math.random() - 0.5) * a);
      camera.position.add(shakeOff);
      world.render();
      camera.position.sub(shakeOff);
      if (shakeT <= 0) shakeAmt = 0;
    } else world.render();
    adapt(dt);
  }

  function resize() {
    const w = window.innerWidth;
    const h = window.innerHeight;
    camera.aspect = w / h;
    camera.updateProjectionMatrix();
    renderer.setSize(w, h);
    if (composer) {
      composer.setPixelRatio(dpr);
      composer.setSize(w, h);
    }
  }
  window.addEventListener('resize', resize);
  resize();
  setSky(o.sky || 'day');
  if (o.autoStart !== false) world.start();
  return world;
}

function disposeObject(obj) {
  obj.traverse((o) => {
    if (o.geometry && !o.geometry.userData.shared) o.geometry.dispose();
    const mats = Array.isArray(o.material) ? o.material : o.material ? [o.material] : [];
    mats.forEach((m) => !m.userData.shared && m.dispose());
  });
}
