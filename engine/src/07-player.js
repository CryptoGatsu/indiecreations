// ------------------------------------------------------------------------------------------------------- input
// Keyboard, mouse (drag or pointer lock) and touch (virtual joystick on the left, look on the right, buttons).
const BINDINGS = {
  up: ['KeyW', 'ArrowUp', 'KeyZ'],
  down: ['KeyS', 'ArrowDown'],
  left: ['KeyA', 'ArrowLeft', 'KeyQ'],
  right: ['KeyD', 'ArrowRight'],
  jump: ['Space'],
  run: ['ShiftLeft', 'ShiftRight'],
  action: ['KeyE', 'Enter'],
  attack: ['KeyF', 'Mouse0'],
  alt: ['KeyR', 'Mouse2'],
  pause: ['Escape', 'KeyP'],
};
const input = {
  isTouch: typeof matchMedia === 'function' && matchMedia('(pointer: coarse)').matches,
  down: new Set(),
  edges: new Set(),
  look: { x: 0, y: 0 },
  zoom: 0,
  stick: { x: 0, y: 0 },
  pointer: { x: 0, y: 0, down: false },
  dragLook: true,
  bind(name, codes) {
    BINDINGS[name] = codes;
  },
  held(name) {
    return (BINDINGS[name] || [name]).some((c) => input.down.has(c));
  },
  // true once per press
  pressed(name) {
    const hit = (BINDINGS[name] || [name]).some((c) => input.edges.has(c));
    if (hit) (BINDINGS[name] || [name]).forEach((c) => input.edges.delete(c));
    return hit;
  },
  axis() {
    let x = (input.held('right') ? 1 : 0) - (input.held('left') ? 1 : 0) + input.stick.x;
    let y = (input.held('up') ? 1 : 0) - (input.held('down') ? 1 : 0) + input.stick.y;
    const l = Math.hypot(x, y);
    if (l > 1) {
      x /= l;
      y /= l;
    }
    return { x, y };
  },
  takeLook() {
    const l = { x: input.look.x, y: input.look.y };
    input.look.x = input.look.y = 0;
    return l;
  },
  touchButtons: [],
};
let inputReady = false;
function initInput() {
  if (inputReady) return;
  inputReady = true;
  const press = (code) => {
    if (!input.down.has(code)) input.edges.add(code);
    input.down.add(code);
  };
  addEventListener('keydown', (e) => {
    if (['Space', 'ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight'].includes(e.code)) e.preventDefault();
    press(e.code);
  });
  addEventListener('keyup', (e) => input.down.delete(e.code));
  addEventListener('blur', () => input.down.clear());
  addEventListener('mousedown', (e) => {
    if (e.target.closest && e.target.closest('button, .ic-ui')) return;
    press(`Mouse${e.button}`);
    input.pointer.down = true;
  });
  addEventListener('mouseup', (e) => {
    input.down.delete(`Mouse${e.button}`);
    input.pointer.down = false;
  });
  addEventListener('mousemove', (e) => {
    input.pointer.x = (e.clientX / innerWidth) * 2 - 1;
    input.pointer.y = -(e.clientY / innerHeight) * 2 + 1;
    if (document.pointerLockElement || (input.dragLook && input.down.has('Mouse0'))) {
      input.look.x += e.movementX;
      input.look.y += e.movementY;
    }
  });
  addEventListener('wheel', (e) => (input.zoom += Math.sign(e.deltaY)), { passive: true });
  addEventListener('contextmenu', (e) => e.preventDefault());
  addEventListener('touchstart', () => input.isTouch || setTouch(), { once: true, passive: true });
  if (input.isTouch) setTouch();
}

let touchUi = null;
function setTouch() {
  input.isTouch = true;
  if (touchUi) return;
  injectCss();
  touchUi = document.createElement('div');
  touchUi.className = 'ic-touch';
  touchUi.innerHTML = '<div class="ic-stick"><div class="ic-knob"></div></div><div class="ic-tbtns"></div>';
  document.body.appendChild(touchUi);
  const stick = touchUi.querySelector('.ic-stick');
  const knob = touchUi.querySelector('.ic-knob');
  let stickId = null;
  let lookId = null;
  let sx = 0;
  let sy = 0;
  let lx = 0;
  let ly = 0;
  addEventListener(
    'touchstart',
    (e) => {
      for (const t of e.changedTouches) {
        if (t.target.closest && t.target.closest('button, .ic-ui')) continue;
        if (t.clientX < innerWidth * 0.45 && stickId === null) {
          stickId = t.identifier;
          sx = t.clientX;
          sy = t.clientY;
          Object.assign(stick.style, { left: `${sx - 60}px`, top: `${sy - 60}px`, opacity: 1 });
        } else if (lookId === null) {
          lookId = t.identifier;
          lx = t.clientX;
          ly = t.clientY;
        }
      }
    },
    { passive: true }
  );
  addEventListener(
    'touchmove',
    (e) => {
      for (const t of e.changedTouches) {
        if (t.identifier === stickId) {
          const dx = clamp((t.clientX - sx) / 50, -1, 1);
          const dy = clamp((t.clientY - sy) / 50, -1, 1);
          input.stick.x = dx;
          input.stick.y = -dy;
          knob.style.transform = `translate(${dx * 36}px, ${dy * 36}px)`;
        } else if (t.identifier === lookId) {
          input.look.x += (t.clientX - lx) * 1.6;
          input.look.y += (t.clientY - ly) * 1.6;
          lx = t.clientX;
          ly = t.clientY;
        }
      }
    },
    { passive: true }
  );
  const end = (e) => {
    for (const t of e.changedTouches) {
      if (t.identifier === stickId) {
        stickId = null;
        input.stick.x = input.stick.y = 0;
        knob.style.transform = '';
        stick.style.opacity = 0.35;
      }
      if (t.identifier === lookId) lookId = null;
    }
  };
  addEventListener('touchend', end);
  addEventListener('touchcancel', end);
  input.touchButtons.forEach(([n, l]) => addTouchButton(n, l));
}
// IC3D.input.button(name, label): an on-screen button on touch devices that acts like the named binding
function addTouchButton(name, label) {
  if (!input.touchButtons.some(([n]) => n === name)) input.touchButtons.push([name, label]);
  if (!touchUi) return;
  const wrap = touchUi.querySelector('.ic-tbtns');
  if (wrap.querySelector(`[data-b="${name}"]`)) return;
  const b = document.createElement('button');
  b.className = 'ic-tbtn';
  b.dataset.b = name;
  b.textContent = label || name;
  const code = `Touch:${name}`;
  BINDINGS[name] = [...(BINDINGS[name] || []), code];
  b.addEventListener('touchstart', (e) => {
    e.preventDefault();
    input.edges.add(code);
    input.down.add(code);
  });
  b.addEventListener('touchend', () => input.down.delete(code));
  wrap.appendChild(b);
}
input.button = addTouchButton;

// -------------------------------------------------------------------------------------------------- controller
// IC3D.createController(world, { mode: 'third' | 'first' | 'top', target, terrain, ground(x, z), speed, runSpeed,
//   jump, gravity, height, radius, colliders, bounds, cameraDistance, cameraHeight, pointerLock, swim })
function createController(world, o = {}) {
  initInput();
  const mode = o.mode || 'third';
  const target = o.target || new THREE.Object3D();
  if (!target.parent) world.scene.add(target);
  const terrain = o.terrain || null;
  const groundAt = o.ground || (terrain ? terrain.heightAt : () => 0);
  const height = o.height ?? 1.8;
  const radius = o.radius ?? 0.4;
  const colliders = [];
  const vel = new THREE.Vector3();
  const camPos = new THREE.Vector3().copy(world.camera.position);
  const bounds = o.bounds ?? (terrain ? terrain.size / 2 - 2 : Infinity);
  const waterLevel = o.waterLevel ?? (terrain ? terrain.waterLevel : null);
  if (o.touchButtons !== false) addTouchButton('jump', '⤒');
  const ctl = {
    mode,
    object: target,
    velocity: vel,
    yaw: o.yaw ?? 0,
    pitch: mode === 'top' ? 0.9 : 0.25,
    grounded: false,
    swimming: false,
    enabled: true,
    speed: o.speed ?? 6,
    runSpeed: o.runSpeed ?? 11,
    jumpSpeed: o.jump ?? 8,
    gravity: o.gravity ?? 24,
    cameraDistance: o.cameraDistance ?? (mode === 'top' ? 22 : 7),
    cameraHeight: o.cameraHeight ?? 1.6,
    moving: 0,
    onJump: null,
    onLand: null,
    colliders,
    // { x, z, radius, top? } circles, Box3s, or Object3Ds (boxed once; { object, dynamic: true } to re-box each frame)
    addCollider(c) {
      if (Array.isArray(c)) c.forEach(ctl.addCollider);
      else if (c.isBox3) colliders.push({ box: c });
      else if (c.isObject3D) colliders.push({ box: new THREE.Box3().setFromObject(c) });
      else if (c.object) colliders.push({ box: new THREE.Box3().setFromObject(c.object), object: c.object, dynamic: c.dynamic });
      else colliders.push(c);
      return ctl;
    },
    removeCollider(obj) {
      const i = colliders.findIndex((c) => c === obj || c.object === obj);
      if (i >= 0) colliders.splice(i, 1);
    },
    setPosition(x, y, z) {
      target.position.set(x, y ?? groundAt(x, z), z);
      vel.set(0, 0, 0);
    },
    dispose: null,
  };
  (o.colliders || []).forEach((c) => ctl.addCollider(c));
  if (mode === 'first') target.visible = o.showTarget ?? false;
  if (o.pointerLock ?? mode === 'first') {
    world.renderer.domElement.addEventListener('click', () => {
      if (ctl.enabled && !document.pointerLockElement) world.renderer.domElement.requestPointerLock?.();
    });
  }
  let coyote = 0;
  let buffer = 0;
  let wasGrounded = true;

  function groundHere(p) {
    let g = groundAt(p.x, p.z);
    for (const c of colliders) {
      if (c.box) {
        const b = c.box;
        if (p.x > b.min.x - radius * 0.3 && p.x < b.max.x + radius * 0.3 && p.z > b.min.z - radius * 0.3 && p.z < b.max.z + radius * 0.3 && p.y >= b.max.y - 0.45) g = Math.max(g, b.max.y);
      } else if (c.top !== undefined && c.top < 50 && Math.hypot(p.x - c.x, p.z - c.z) < c.radius && p.y >= c.top - 0.45) g = Math.max(g, c.top);
    }
    return g;
  }
  function pushOut(p) {
    for (const c of colliders) {
      if (c.dynamic && c.object) c.box.setFromObject(c.object);
      if (c.box) {
        const b = c.box;
        if (p.y >= b.max.y - 0.45 || p.y + height <= b.min.y) continue;
        const cx = clamp(p.x, b.min.x, b.max.x);
        const cz = clamp(p.z, b.min.z, b.max.z);
        const dx = p.x - cx;
        const dz = p.z - cz;
        const d = Math.hypot(dx, dz);
        if (d < radius) {
          if (d > 1e-5) {
            p.x = cx + (dx / d) * radius;
            p.z = cz + (dz / d) * radius;
          } else {
            const ex = [p.x - b.min.x, b.max.x - p.x, p.z - b.min.z, b.max.z - p.z];
            const m = ex.indexOf(Math.min(...ex));
            if (m === 0) p.x = b.min.x - radius;
            if (m === 1) p.x = b.max.x + radius;
            if (m === 2) p.z = b.min.z - radius;
            if (m === 3) p.z = b.max.z + radius;
          }
        }
      } else {
        if (c.top !== undefined && p.y >= c.top - 0.45) continue;
        const dx = p.x - c.x;
        const dz = p.z - c.z;
        const d = Math.hypot(dx, dz);
        const min = c.radius + radius;
        if (d < min && d > 1e-5) {
          p.x = c.x + (dx / d) * min;
          p.z = c.z + (dz / d) * min;
        }
      }
    }
  }

  const fwd = new THREE.Vector3();
  const right = new THREE.Vector3();
  ctl.update = (dt) => {
    const look = input.takeLook();
    ctl.cameraDistance = clamp(ctl.cameraDistance + input.zoom * (mode === 'top' ? 2 : 0.8), 2.5, mode === 'top' ? 60 : 20);
    input.zoom = 0;
    if (ctl.enabled) {
      const sens = o.sensitivity ?? 0.0028;
      ctl.yaw -= look.x * sens;
      if (mode !== 'top') ctl.pitch = clamp(ctl.pitch + look.y * sens * (mode === 'first' ? -1 : 1), mode === 'first' ? -1.45 : -0.35, mode === 'first' ? 1.45 : 1.25);
    }
    const p = target.position;
    const ax = ctl.enabled ? input.axis() : { x: 0, y: 0 };
    const yaw = mode === 'top' ? o.topYaw ?? 0 : ctl.yaw;
    fwd.set(-Math.sin(yaw), 0, -Math.cos(yaw));
    right.set(Math.cos(yaw), 0, -Math.sin(yaw));
    const running = ctl.enabled && input.held('run');
    const top = (ctl.swimming ? 0.55 : 1) * (running ? ctl.runSpeed : ctl.speed);
    const want = new THREE.Vector3().addScaledVector(fwd, ax.y * top).addScaledVector(right, ax.x * top);
    const k = ctl.grounded || ctl.swimming ? 14 : 3.5;
    vel.x = damp(vel.x, want.x, k, dt);
    vel.z = damp(vel.z, want.z, k, dt);

    if (ctl.enabled && input.pressed('jump')) buffer = 0.14;
    buffer -= dt;
    coyote = ctl.grounded ? 0.12 : coyote - dt;
    if (buffer > 0 && (coyote > 0 || ctl.swimming)) {
      vel.y = ctl.swimming ? ctl.jumpSpeed * 0.6 : ctl.jumpSpeed;
      buffer = 0;
      coyote = 0;
      ctl.grounded = false;
      if (ctl.onJump) ctl.onJump();
    }
    vel.y -= ctl.gravity * dt * (ctl.swimming ? 0.15 : 1);
    if (ctl.swimming) vel.y = damp(vel.y, (waterLevel - height * 0.55 - p.y) * 3, 4, dt);

    p.x += vel.x * dt;
    p.z += vel.z * dt;
    p.y += vel.y * dt;
    pushOut(p);
    if (Number.isFinite(bounds)) {
      p.x = clamp(p.x, -bounds, bounds);
      p.z = clamp(p.z, -bounds, bounds);
    }
    const g = groundHere(p);
    ctl.swimming = o.swim !== false && waterLevel !== null && g < waterLevel - height * 0.5 && p.y < waterLevel - height * 0.3;
    if (p.y <= g && !ctl.swimming) {
      p.y = g;
      if (vel.y < 0) vel.y = 0;
      ctl.grounded = true;
    } else if (p.y - g > 0.15 || vel.y > 0) ctl.grounded = false;
    if (ctl.grounded && !wasGrounded && ctl.onLand) ctl.onLand();
    wasGrounded = ctl.grounded;

    const hs = Math.hypot(vel.x, vel.z);
    ctl.moving = clamp(hs / ctl.runSpeed);
    if (hs > 0.3 && mode !== 'first') {
      const face = Math.atan2(vel.x, vel.z);
      let d = face - target.rotation.y;
      d = Math.atan2(Math.sin(d), Math.cos(d));
      target.rotation.y += d * Math.min(1, dt * 12);
    }
    if (mode === 'first') target.rotation.y = ctl.yaw + Math.PI;
    if (target.userData.animate) target.userData.animate(dt, ctl.moving, ctl.grounded, ctl.swimming);

    // camera
    const cam = world.camera;
    if (mode === 'first') {
      cam.position.set(p.x, p.y + height * 0.92, p.z);
      cam.rotation.set(ctl.pitch, ctl.yaw, 0, 'YXZ');
    } else {
      const pivot = new THREE.Vector3(p.x, p.y + ctl.cameraHeight, p.z);
      const dist = ctl.cameraDistance;
      const pitch = mode === 'top' ? o.topPitch ?? 0.95 : ctl.pitch;
      const want2 = new THREE.Vector3(Math.sin(yaw) * Math.cos(pitch) * dist, Math.sin(pitch) * dist, Math.cos(yaw) * Math.cos(pitch) * dist).add(pivot);
      const floor = groundAt(want2.x, want2.z) + 0.6;
      if (want2.y < floor) want2.y = floor;
      camPos.lerp(want2, 1 - Math.exp(-dt * 10));
      cam.position.copy(camPos);
      cam.lookAt(pivot);
    }
  };
  ctl.dispose = world.onUpdate(ctl.update);
  world.follow(target);
  camPos.copy(target.position).add(new THREE.Vector3(0, 4, 8));
  return ctl;
}

// --------------------------------------------------------------------------------------------------- character
// IC3D.createCharacter({ style: 'human' | 'knight' | 'robot' | 'alien' | 'wizard', colors: { skin, shirt, pants,
//   hair, shoes, accent }, scale }) -> a Group (feet at y = 0, ~1.8 tall) that animates itself when a controller moves
//   it (or call character.userData.animate(dt, speed01, grounded)).
function createCharacter(o = {}) {
  const style = o.style || 'human';
  const c = {
    skin: style === 'robot' ? '#9aa4b0' : style === 'alien' ? '#7ad86a' : '#e8b896',
    shirt: style === 'knight' ? '#8a929c' : style === 'wizard' ? '#4a3a8a' : '#3a6ad8',
    pants: style === 'knight' ? '#6a727c' : '#2a3448',
    hair: '#3a2618',
    shoes: '#2a2018',
    accent: style === 'robot' ? '#4ad8ff' : '#d8a83a',
    ...(o.colors || {}),
  };
  const metal = style === 'robot' || style === 'knight';
  const m = (color, extra = {}) => new THREE.MeshStandardMaterial({ color: col(color), roughness: metal ? 0.4 : 0.75, metalness: metal ? 0.6 : 0, ...extra });
  const g = new THREE.Group();
  const body = new THREE.Group();
  g.add(body);
  const part = (geo, mat, x, y, z, parent = body) => {
    const mesh = new THREE.Mesh(geo, mat);
    mesh.position.set(x, y, z);
    mesh.castShadow = true;
    mesh.receiveShadow = true;
    parent.add(mesh);
    return mesh;
  };
  const limb = (x, y, len, rad, mat, footMat) => {
    const pivot = new THREE.Group();
    pivot.position.set(x, y, 0);
    body.add(pivot);
    part(new THREE.CapsuleGeometry(rad, len - rad * 2, 4, 10), mat, 0, -len / 2, 0, pivot);
    if (footMat) part(new RoundedBoxGeometry(rad * 2.2, rad * 1.4, rad * 3.2, 2, rad * 0.5), footMat, 0, -len + rad * 0.3, rad * 0.5, pivot);
    return pivot;
  };
  const torsoGeo = style === 'robot' ? new RoundedBoxGeometry(0.62, 0.72, 0.36, 3, 0.08) : new THREE.CapsuleGeometry(0.27, 0.36, 6, 14);
  part(torsoGeo, m(c.shirt), 0, 1.22, 0);
  part(new RoundedBoxGeometry(0.5, 0.18, 0.3, 2, 0.06), m(c.pants), 0, 0.9, 0);
  const headR = style === 'alien' ? 0.3 : 0.21;
  const head = part(style === 'robot' ? new RoundedBoxGeometry(0.4, 0.38, 0.38, 3, 0.08) : new THREE.SphereGeometry(headR, 24, 16), m(c.skin), 0, 1.68 + (style === 'alien' ? 0.06 : 0), 0);
  const eyeMat = style === 'robot' ? glowMaterial(c.accent, 3) : new THREE.MeshStandardMaterial({ color: '#1a1a1a', roughness: 0.3 });
  for (const s of [-1, 1]) part(new THREE.SphereGeometry(style === 'alien' ? 0.07 : 0.035, 10, 8), eyeMat, s * 0.08, 0.03, headR * 0.92, head);
  if (style === 'human' || style === 'wizard') {
    const hair = part(new THREE.SphereGeometry(0.225, 20, 12, 0, Math.PI * 2, 0, Math.PI * 0.55), m(c.hair), 0, 0.02, -0.01, head);
    hair.scale.set(1.04, 1, 1.06);
  }
  if (style === 'knight') {
    part(new THREE.CylinderGeometry(0.24, 0.24, 0.3, 16, 1, true), m(c.shirt, { side: THREE.DoubleSide }), 0, 0.02, 0, head);
    part(new THREE.ConeGeometry(0.05, 0.25, 8), m(c.accent), 0, 0.3, 0, head);
  }
  if (style === 'wizard') {
    part(new THREE.ConeGeometry(0.26, 0.55, 16), m(c.shirt), 0, 0.33, 0, head).rotation.z = 0.15;
    part(new THREE.CylinderGeometry(0.36, 0.36, 0.03, 20), m(c.shirt), 0, 0.12, 0, head);
  }
  if (style === 'alien' || style === 'robot') {
    part(new THREE.CylinderGeometry(0.012, 0.012, 0.22, 5), m(c.skin), 0, headR + 0.1, 0, head);
    part(new THREE.SphereGeometry(0.04, 8, 6), glowMaterial(c.accent, 2.5), 0, headR + 0.22, 0, head);
  }
  const armL = limb(-0.36, 1.48, 0.62, 0.075, m(style === 'robot' ? c.skin : c.shirt));
  const armR = limb(0.36, 1.48, 0.62, 0.075, m(style === 'robot' ? c.skin : c.shirt));
  for (const a of [armL, armR]) part(new THREE.SphereGeometry(0.075, 10, 8), m(c.skin), 0, -0.64, 0, a);
  const legL = limb(-0.13, 0.88, 0.86, 0.095, m(c.pants), m(c.shoes));
  const legR = limb(0.13, 0.88, 0.86, 0.095, m(c.pants), m(c.shoes));
  if (o.cape || style === 'knight') {
    const cape = part(new THREE.PlaneGeometry(0.55, 0.9, 1, 4), m(o.cape || '#a82a2a', { side: THREE.DoubleSide, metalness: 0, roughness: 0.9 }), 0, 1.05, -0.2);
    cape.rotation.x = 0.12;
  }
  g.scale.setScalar(o.scale || 1);
  g.userData.parts = { body, head, armL, armR, legL, legR };
  // hold something: character.userData.hand.add(sword)
  g.userData.hand = new THREE.Group();
  g.userData.hand.position.set(0, -0.66, 0.05);
  armR.add(g.userData.hand);
  let phase = 0;
  let swing = 0;
  g.userData.animate = (dt, speed = 0, grounded = true, swimming = false) => {
    phase += dt * (5 + speed * 7);
    const amp = grounded ? speed * 0.9 : 0.3;
    swing = damp(swing, amp, 10, dt);
    legL.rotation.x = Math.sin(phase) * swing;
    legR.rotation.x = -Math.sin(phase) * swing;
    armL.rotation.x = -Math.sin(phase) * swing * 0.8;
    armR.rotation.x = Math.sin(phase) * swing * 0.8 + (g.userData.attack || 0);
    if (!grounded && !swimming) {
      legL.rotation.x = -0.5;
      legR.rotation.x = 0.3;
      armL.rotation.z = -0.6;
      armR.rotation.z = 0.6;
    } else {
      armL.rotation.z = damp(armL.rotation.z, swimming ? -1.2 : -0.06, 8, dt);
      armR.rotation.z = damp(armR.rotation.z, swimming ? 1.2 : 0.06, 8, dt);
    }
    body.position.y = grounded ? Math.abs(Math.sin(phase)) * 0.06 * speed + Math.sin(phase * 0.3) * 0.01 : 0;
    if (g.userData.attack) g.userData.attack = Math.max(0, g.userData.attack - dt * 6);
  };
  // a quick arm swing (attacks, using things)
  g.userData.swing = () => (g.userData.attack = -1.8);
  return g;
}

// IC3D.wander(world, object, { terrain, center, radius, speed, pause }): NPCs and animals that roam about.
function wander(world, obj, o = {}) {
  const center = o.center || obj.position.clone();
  const radius = o.radius ?? 15;
  const speed = o.speed ?? 1.6;
  const ground = o.terrain ? o.terrain.heightAt : o.ground || (() => obj.position.y);
  const goal = new THREE.Vector3();
  let wait = Math.random() * 2;
  const pick = () => goal.set(center.x + (Math.random() - 0.5) * radius * 2, 0, center.z + (Math.random() - 0.5) * radius * 2);
  pick();
  const state = { active: true, stop: null };
  state.stop = world.onUpdate((dt) => {
    if (!state.active) return;
    const dx = goal.x - obj.position.x;
    const dz = goal.z - obj.position.z;
    const d = Math.hypot(dx, dz);
    let moving = 0;
    if (wait > 0) wait -= dt;
    else if (d < 0.5) {
      wait = (o.pause ?? 2) * (0.5 + Math.random());
      pick();
    } else {
      obj.position.x += (dx / d) * speed * dt;
      obj.position.z += (dz / d) * speed * dt;
      let a = Math.atan2(dx, dz) - obj.rotation.y;
      a = Math.atan2(Math.sin(a), Math.cos(a));
      obj.rotation.y += a * Math.min(1, dt * 6);
      moving = speed / 8;
    }
    obj.position.y = ground(obj.position.x, obj.position.z);
    if (obj.userData.animate) obj.userData.animate(dt, moving, true);
  });
  return state;
}
