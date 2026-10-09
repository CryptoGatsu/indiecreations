// ---------------------------------------------------------------------------------------------------------- ui
// A polished default look for menus and HUDs. Every element has the ic-ui class (clicks on it don't reach the game).
let cssDone = false;
function injectCss() {
  if (cssDone) return;
  cssDone = true;
  const s = document.createElement('style');
  s.textContent = `
.ic-ui{position:fixed;z-index:20;font-family:system-ui,-apple-system,'Segoe UI',sans-serif;color:#fff;box-sizing:border-box}
.ic-ui *{box-sizing:border-box}
.ic-screen{inset:0;display:flex;align-items:center;justify-content:center;padding:20px;background:radial-gradient(ellipse at center,rgba(10,12,24,.35),rgba(5,6,14,.82));backdrop-filter:blur(3px);transition:opacity .35s}
.ic-screen.ic-hidden{opacity:0;pointer-events:none}
.ic-card{max-width:560px;width:100%;text-align:center;padding:34px 30px;border-radius:22px;background:linear-gradient(160deg,rgba(255,255,255,.14),rgba(255,255,255,.04));border:1px solid rgba(255,255,255,.18);box-shadow:0 30px 80px rgba(0,0,0,.45)}
.ic-title{margin:0 0 8px;font-size:clamp(34px,7vw,64px);font-weight:900;letter-spacing:-.02em;line-height:1;background:linear-gradient(180deg,#fff,var(--ic-accent,#9fd8ff));-webkit-background-clip:text;background-clip:text;color:transparent;filter:drop-shadow(0 4px 18px rgba(0,0,0,.35))}
.ic-sub{margin:0 0 18px;font-size:17px;opacity:.85;line-height:1.45}
.ic-controls{display:flex;flex-wrap:wrap;gap:8px;justify-content:center;margin:0 0 22px;font-size:13px;opacity:.9}
.ic-controls span{padding:6px 10px;border-radius:999px;background:rgba(255,255,255,.1);border:1px solid rgba(255,255,255,.14)}
.ic-controls b{font-weight:700;margin-right:5px}
.ic-btn{appearance:none;border:0;cursor:pointer;font:inherit;font-weight:800;font-size:18px;padding:14px 34px;border-radius:14px;color:#0b1020;background:linear-gradient(180deg,#fff,var(--ic-accent,#9fd8ff));box-shadow:0 10px 30px rgba(0,0,0,.35),inset 0 -3px 0 rgba(0,0,0,.15);transition:transform .12s}
.ic-btn:hover{transform:translateY(-2px) scale(1.03)}.ic-btn:active{transform:scale(.97)}
.ic-btn.ic-ghost{background:rgba(255,255,255,.12);color:#fff;border:1px solid rgba(255,255,255,.25);box-shadow:none}
.ic-row{display:flex;gap:10px;justify-content:center;flex-wrap:wrap}
.ic-hud{top:14px;left:14px;display:flex;flex-direction:column;gap:8px;pointer-events:none;font-weight:700;text-shadow:0 2px 8px rgba(0,0,0,.6)}
.ic-pill{padding:8px 14px;border-radius:12px;background:rgba(8,10,20,.45);border:1px solid rgba(255,255,255,.12);backdrop-filter:blur(6px);font-size:15px}
.ic-bar{width:min(260px,40vw)}.ic-bar-l{font-size:12px;opacity:.85;margin-bottom:4px}
.ic-bar-t{height:12px;border-radius:999px;background:rgba(0,0,0,.45);overflow:hidden;border:1px solid rgba(255,255,255,.18)}
.ic-bar-f{height:100%;border-radius:999px;transition:width .25s;box-shadow:inset 0 -3px 0 rgba(0,0,0,.2)}
.ic-toast{left:50%;top:18%;transform:translate(-50%,-10px);padding:12px 22px;border-radius:14px;background:rgba(8,10,20,.7);border:1px solid rgba(255,255,255,.2);font-weight:800;font-size:20px;opacity:0;transition:all .3s;pointer-events:none;text-align:center}
.ic-toast.ic-on{opacity:1;transform:translate(-50%,0)}
.ic-hint{left:50%;bottom:18%;transform:translateX(-50%);padding:9px 16px;border-radius:12px;background:rgba(8,10,20,.6);border:1px solid rgba(255,255,255,.2);font-weight:700;pointer-events:none}
.ic-hint kbd{display:inline-block;padding:1px 7px;margin:0 3px;border-radius:6px;background:#fff;color:#111;font:inherit;font-weight:800}
.ic-dialog{left:50%;bottom:24px;transform:translateX(-50%);width:min(680px,calc(100% - 24px));padding:16px 20px;border-radius:18px;background:linear-gradient(160deg,rgba(14,18,34,.88),rgba(8,10,20,.92));border:1px solid rgba(255,255,255,.18);box-shadow:0 20px 50px rgba(0,0,0,.5)}
.ic-dialog h4{margin:0 0 6px;color:var(--ic-accent,#9fd8ff);font-size:15px;letter-spacing:.04em;text-transform:uppercase}
.ic-dialog p{margin:0 0 12px;font-size:17px;line-height:1.5}
.ic-dialog .ic-row{justify-content:flex-start}.ic-dialog .ic-btn{font-size:15px;padding:9px 16px}
.ic-obj{top:14px;right:14px;max-width:min(320px,45vw);pointer-events:none}
.ic-obj h5{margin:0 0 6px;font-size:12px;opacity:.7;letter-spacing:.08em;text-transform:uppercase}
.ic-obj li{list-style:none;margin:3px 0;font-size:14px}.ic-obj ul{margin:0;padding:0}.ic-obj .ic-done{opacity:.55;text-decoration:line-through}
.ic-touch{position:fixed;inset:0;pointer-events:none;z-index:15}
.ic-stick{position:absolute;left:40px;bottom:40px;top:auto;width:120px;height:120px;border-radius:50%;background:rgba(255,255,255,.08);border:2px solid rgba(255,255,255,.25);opacity:.35}
.ic-knob{position:absolute;left:35px;top:35px;width:50px;height:50px;border-radius:50%;background:rgba(255,255,255,.45)}
.ic-tbtns{position:absolute;right:20px;bottom:28px;display:flex;flex-direction:column-reverse;gap:14px;pointer-events:auto}
.ic-tbtn{width:72px;height:72px;border-radius:50%;border:2px solid rgba(255,255,255,.35);background:rgba(255,255,255,.14);color:#fff;font-size:22px;font-weight:800;touch-action:none;user-select:none}
`;
  document.head.appendChild(s);
}
function el(cls, html = '', parent = document.body) {
  injectCss();
  const d = document.createElement('div');
  d.className = `ic-ui ${cls}`;
  d.innerHTML = html;
  parent.appendChild(d);
  return d;
}
const esc = (t) => String(t).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]);

const ui = {
  // full-screen menu: { title, subtitle, html, controls: [['WASD', 'move'], ...], button, buttons: [{ label, onClick, ghost }], onStart, accent }
  screen(o = {}) {
    const controls = (o.controls || []).map(([k, v]) => `<span><b>${esc(k)}</b>${esc(v)}</span>`).join('');
    const d = el(
      'ic-screen',
      `<div class="ic-card">${o.title ? `<h1 class="ic-title">${esc(o.title)}</h1>` : ''}${o.subtitle ? `<p class="ic-sub">${esc(o.subtitle)}</p>` : ''}${o.html || ''}${controls ? `<div class="ic-controls">${controls}</div>` : ''}<div class="ic-row"></div></div>`
    );
    if (o.accent) d.style.setProperty('--ic-accent', o.accent);
    const row = d.querySelector('.ic-row');
    const buttons = o.buttons || [{ label: o.button || (input.isTouch ? 'Tap to play' : 'Play'), onClick: o.onStart }];
    buttons.forEach((b) => {
      const btn = document.createElement('button');
      btn.className = `ic-btn${b.ghost ? ' ic-ghost' : ''}`;
      btn.textContent = b.label;
      btn.onclick = (e) => {
        e.stopPropagation();
        sound.play('click');
        if (b.close !== false) api.hide();
        if (b.onClick) b.onClick();
      };
      row.appendChild(btn);
    });
    const api = {
      el: d,
      show(patch) {
        if (patch && patch.title) d.querySelector('.ic-title').textContent = patch.title;
        if (patch && patch.subtitle) d.querySelector('.ic-sub').textContent = patch.subtitle;
        d.classList.remove('ic-hidden');
      },
      hide() {
        d.classList.add('ic-hidden');
      },
      remove: () => d.remove(),
    };
    return api;
  },
  // HUD in the top-left: ui.hud() -> { set(key, html) } (one pill per key)
  hud() {
    const d = ui._hudCol();
    const pills = {};
    return {
      el: d,
      set(key, html) {
        if (!pills[key]) {
          pills[key] = document.createElement('div');
          pills[key].className = 'ic-pill';
          d.appendChild(pills[key]);
        }
        pills[key].innerHTML = html;
        pills[key].style.display = html === null ? 'none' : '';
      },
    };
  },
  // ui.bar({ label, color, max, value, parent }) -> { set(value) } (health, stamina, xp...)
  bar(o = {}) {
    const d = el('ic-bar', `${o.label ? `<div class="ic-bar-l">${esc(o.label)}</div>` : ''}<div class="ic-bar-t"><div class="ic-bar-f"></div></div>`, o.parent || ui._hudCol());
    d.style.position = 'static';
    const f = d.querySelector('.ic-bar-f');
    f.style.background = o.color || 'linear-gradient(90deg,#ff5a5a,#ff9a6a)';
    const api = {
      el: d,
      max: o.max ?? 100,
      set(v) {
        f.style.width = `${clamp(v / api.max) * 100}%`;
      },
    };
    api.set(o.value ?? api.max);
    return api;
  },
  _hudCol() {
    if (!ui._col) ui._col = el('ic-hud');
    return ui._col;
  },
  toast(text, ms = 1800) {
    const d = el('ic-toast', esc(text));
    requestAnimationFrame(() => d.classList.add('ic-on'));
    setTimeout(() => {
      d.classList.remove('ic-on');
      setTimeout(() => d.remove(), 400);
    }, ms);
  },
  // an interaction hint: ui.hint('Press [E] to open') (keys in [] become key caps); ui.hint(null) hides it
  hint(text) {
    if (!ui._hint) ui._hint = el('ic-hint');
    ui._hint.style.display = text ? '' : 'none';
    if (text) ui._hint.innerHTML = esc(text).replace(/\[(.+?)\]/g, '<kbd>$1</kbd>');
  },
  // NPC dialogue: ui.dialog({ name, text, choices: ['Yes', 'No'] }) -> Promise<choice index> (no choices: Continue)
  dialog(o = {}) {
    if (ui._dialog) ui._dialog.remove();
    return new Promise((resolve) => {
      const d = el('ic-dialog', `${o.name ? `<h4>${esc(o.name)}</h4>` : ''}<p></p><div class="ic-row"></div>`);
      ui._dialog = d;
      const p = d.querySelector('p');
      const full = String(o.text || '');
      let i = 0;
      const type = setInterval(() => {
        i += 2;
        p.textContent = full.slice(0, i);
        if (i >= full.length) clearInterval(type);
      }, 16);
      const row = d.querySelector('.ic-row');
      (o.choices && o.choices.length ? o.choices : ['Continue']).forEach((c, k) => {
        const b = document.createElement('button');
        b.className = `ic-btn${k ? ' ic-ghost' : ''}`;
        b.textContent = c;
        b.onclick = (e) => {
          e.stopPropagation();
          clearInterval(type);
          sound.play('click');
          d.remove();
          ui._dialog = null;
          resolve(k);
        };
        row.appendChild(b);
      });
    });
  },
  // a quest list in the top-right: ui.objectives('Quest', ['Find the key', ...]) -> { done(i), set(list) }
  objectives(title, list = []) {
    const d = el('ic-obj ic-pill');
    let items = list.map((t) => ({ t, done: false }));
    const draw = () => (d.innerHTML = `<h5>${esc(title)}</h5><ul>${items.map((x) => `<li class="${x.done ? 'ic-done' : ''}">${x.done ? '✓' : '◆'} ${esc(x.t)}</li>`).join('')}</ul>`);
    draw();
    return {
      el: d,
      done(i) {
        if (items[i]) items[i].done = true;
        draw();
      },
      set(next) {
        items = next.map((t) => (typeof t === 'string' ? { t, done: false } : t));
        draw();
      },
    };
  },
};

// IC3D.label(text, { color, background, size }) -> a Sprite that always faces the camera (names, signs, damage numbers)
function label(text, o = {}) {
  const c = document.createElement('canvas');
  const g = c.getContext('2d');
  const fs = 64;
  g.font = `800 ${fs}px system-ui, sans-serif`;
  const w = Math.ceil(g.measureText(text).width) + 48;
  c.width = w;
  c.height = fs + 36;
  g.font = `800 ${fs}px system-ui, sans-serif`;
  if (o.background !== false) {
    g.fillStyle = o.background || 'rgba(10,12,24,0.6)';
    const r = 24;
    g.beginPath();
    g.roundRect ? g.roundRect(0, 0, w, c.height, r) : g.rect(0, 0, w, c.height);
    g.fill();
  }
  g.fillStyle = o.color || '#ffffff';
  g.textAlign = 'center';
  g.textBaseline = 'middle';
  g.fillText(text, w / 2, c.height / 2 + 4);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  const s = new THREE.Sprite(new THREE.SpriteMaterial({ map: t, transparent: true, depthWrite: false, fog: false }));
  const h = o.size ?? 0.5;
  s.scale.set((h * w) / c.height, h, 1);
  s.renderOrder = 10;
  return s;
}

// IC3D.popup(world, position, text, { color }) -> a label that rises and fades (damage, +10, "Level up!")
function popup(world, position, text, o = {}) {
  const s = label(text, { background: false, color: o.color || '#ffe66a', size: o.size ?? 0.7 });
  s.position.copy(position);
  world.scene.add(s);
  let t = 0;
  const stop = world.onUpdate((dt) => {
    t += dt;
    s.position.y += dt * 1.4;
    s.material.opacity = 1 - t / 1.1;
    if (t > 1.1) {
      stop();
      world.remove(s);
    }
  });
  return s;
}

// --------------------------------------------------------------------------------------------------- the export
const IC3D = {
  VERSION,
  THREE,
  createWorld,
  createTerrain,
  createWater,
  createClouds,
  scatter,
  model: makeModel,
  models: Object.keys(MODELS),
  texture: makeTexture,
  material: makeMaterial,
  textures: Object.keys(KINDS),
  glow: glowMaterial,
  particles: createParticles,
  burst,
  createController,
  createCharacter,
  wander,
  input,
  sound,
  ui,
  label,
  popup,
  biomes: Object.keys(BIOMES),
  skies: Object.keys(PRESETS),
  RoundedBoxGeometry,
  mergeGeometries,
  noise,
  makeNoise,
  rng,
  clamp,
  lerp,
  damp,
  smoothstep,
  dispose: disposeObject,
};
initInput();
window.IC3D = Object.freeze(IC3D);
