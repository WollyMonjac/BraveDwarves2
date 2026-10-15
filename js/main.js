// Entry point: canvas scaling, fixed 60 Hz game loop, input wiring and touch controls.
import { A, loadCore } from './assets.js';
import { G, srand } from './globals.js';
import { initInput, beginTick, endTick, setVirtual, clearVirtual, input } from './input.js';
import { initAudioDefs, unlockAudio, updateMusic, pauseAllAudio, audioSettings, applyVolumes } from './audio.js';
import { keys as keyMap } from './input.js';
import { Screens, setScreenHost } from './screens.js';
import { loadSettings } from './settings.js';

const canvas = document.getElementById('screen');
const ctx = canvas.getContext('2d', { alpha: false });
ctx.imageSmoothingEnabled = true;
const errEl = document.getElementById('err');

const host = {
  canvas, ctx, screen: null,
  set(s) {
    if (this.screen && this.screen.leave) this.screen.leave();
    this.screen = s;
    if (s.enter) s.enter();
    document.body.classList.toggle('ingame', !!s.ingame);
    clearVirtual();
  },
  pointer: null,
};
setScreenHost(host);
window.BD2 = { G, host };

// ------------------------------------------------------------------ layout
function isTouch() { return ('ontouchstart' in window) || navigator.maxTouchPoints > 0; }
const wrapEl = document.getElementById('wrap');
function resize() {
  const vw = wrapEl.clientWidth || window.innerWidth, vh = wrapEl.clientHeight || window.innerHeight;
  const s = Math.max(0.1, Math.min(vw / 800, vh / 600));
  canvas.style.width = Math.floor(800 * s) + 'px';
  canvas.style.height = Math.floor(600 * s) + 'px';
  document.body.classList.toggle('portrait', isTouch() && window.innerHeight > window.innerWidth * 1.05);
  document.body.classList.toggle('touch', isTouch());
}
window.addEventListener('resize', resize);
if (window.ResizeObserver) new ResizeObserver(resize).observe(wrapEl);
window.addEventListener('orientationchange', () => setTimeout(resize, 200));
resize();

window.bd2Fullscreen = () => {
  const el = document.documentElement;
  const req = el.requestFullscreen || el.webkitRequestFullscreen;
  if (req) {
    const p = req.call(el, { navigationUI: 'hide' });
    if (p && p.then) p.then(() => { try { screen.orientation.lock('landscape').catch(() => {}); } catch (e) {} }).catch(() => {});
  }
};

// canvas pointer -> game coordinates (menus are clickable / tappable)
function toGame(e) {
  const r = canvas.getBoundingClientRect();
  return { x: (e.clientX - r.left) * 800 / r.width, y: (e.clientY - r.top) * 600 / r.height };
}
canvas.addEventListener('pointerdown', e => {
  unlockAudio();
  try { canvas.focus({ preventScroll: true }); } catch (err) { /* old browsers */ }
  const p = toGame(e);
  host.pointer = { x: p.x, y: p.y, down: true, click: true };
  if (host.screen && host.screen.click) host.screen.click(p.x, p.y);
});
canvas.addEventListener('pointermove', e => {
  const p = toGame(e);
  host.pointer = Object.assign(host.pointer || {}, { x: p.x, y: p.y, moved: true });
  if (host.screen && host.screen.hover) host.screen.hover(p.x, p.y);
});
window.addEventListener('keydown', () => unlockAudio(), { once: false });
window.addEventListener('touchend', () => unlockAudio(), { passive: true });
window.addEventListener('click', () => unlockAudio());
window.addEventListener('wheel', e => { if (host.screen && host.screen.wheel) host.screen.wheel(e.deltaY); }, { passive: true });

// ------------------------------------------------------------------ touch controls
function initTouch() {
  const pad = document.getElementById('dpad');
  const knob = pad.querySelector('.knob');
  let padId = null;
  const setDir = (dx, dy) => {
    const r = pad.getBoundingClientRect();
    const rad = r.width / 2;
    let nx = dx / rad, ny = dy / rad;
    const len = Math.hypot(nx, ny);
    if (len > 1) { nx /= len; ny /= len; }
    knob.style.transform = `translate(${nx * rad * 0.55}px, ${ny * rad * 0.55}px)`;
    const dead = 0.32;
    setVirtual('left', nx < -dead);
    setVirtual('right', nx > dead);
    setVirtual('up', ny < -0.45);
    setVirtual('down', ny > 0.45);
  };
  const center = () => { const r = pad.getBoundingClientRect(); return [r.left + r.width / 2, r.top + r.height / 2]; };
  pad.addEventListener('pointerdown', e => {
    unlockAudio();
    padId = e.pointerId; pad.setPointerCapture(e.pointerId);
    const [cx, cy] = center(); setDir(e.clientX - cx, e.clientY - cy);
    e.preventDefault();
  });
  pad.addEventListener('pointermove', e => {
    if (e.pointerId !== padId) return;
    const [cx, cy] = center(); setDir(e.clientX - cx, e.clientY - cy);
    e.preventDefault();
  });
  const release = e => {
    if (e.pointerId !== padId) return;
    padId = null;
    knob.style.transform = '';
    setVirtual('left', 0); setVirtual('right', 0); setVirtual('up', 0); setVirtual('down', 0);
  };
  pad.addEventListener('pointerup', release);
  pad.addEventListener('pointercancel', release);
  for (const b of document.querySelectorAll('#touch .btn')) {
    const name = b.dataset.btn;
    const on = e => { unlockAudio(); b.classList.add('on'); setVirtual(name, 1); b.setPointerCapture && b.setPointerCapture(e.pointerId); e.preventDefault(); };
    const off = e => { b.classList.remove('on'); setVirtual(name, 0); e.preventDefault(); };
    b.addEventListener('pointerdown', on);
    b.addEventListener('pointerup', off);
    b.addEventListener('pointercancel', off);
    b.addEventListener('lostpointercapture', off);
  }
  document.addEventListener('contextmenu', e => e.preventDefault());
}

// ------------------------------------------------------------------ loop
const STEP = 1000 / 60;
let last = 0, acc = 0;
function frame(t) {
  requestAnimationFrame(frame);
  if (!last) last = t;
  let dt = t - last; last = t;
  if (dt > 250) dt = 250;
  acc += dt;
  let n = 0;
  const t0 = performance.now();
  try {
    while (acc >= STEP && n < 6) {
      beginTick();
      G.time += STEP;
      if (host.screen && host.screen.update) host.screen.update();
      endTick();
      acc -= STEP; n++;
    }
    if (n >= 6) acc = 0;
    if (host.screen && host.screen.draw) host.screen.draw(ctx);
    updateMusic();
    const pf = window.BD2.perf || (window.BD2.perf = { avg: 0, max: 0, n: 0 });
    const ms = performance.now() - t0;
    pf.avg = pf.avg * 0.95 + ms * 0.05; pf.n++; if (pf.n > 60) pf.max = Math.max(pf.max * 0.999, ms);
  } catch (e) {
    console.error(e);
    errEl.textContent = 'Viga: ' + e.message;
  }
}

document.addEventListener('visibilitychange', () => {
  pauseAllAudio(document.hidden);
  last = 0; acc = 0;
  if (document.hidden && host.screen && host.screen.autoPause) host.screen.autoPause();
});

async function boot() {
  initInput();
  initTouch();
  G.settings = loadSettings();
  audioSettings.music = G.settings.music; audioSettings.sfx = G.settings.sfx;
  Object.assign(keyMap, G.settings.keys);
  srand(Date.now() & 0x7fffffff);
  // loading screen while assets download
  ctx.fillStyle = '#000'; ctx.fillRect(0, 0, 800, 600);
  ctx.fillStyle = '#f2d27a'; ctx.font = '28px Georgia, serif'; ctx.textAlign = 'center';
  ctx.fillText('Laetakse...', 400, 300);
  const bar = p => {
    ctx.fillStyle = '#000'; ctx.fillRect(200, 330, 400, 14);
    ctx.strokeStyle = '#a07a30'; ctx.strokeRect(200.5, 330.5, 400, 14);
    ctx.fillStyle = '#e0b040'; ctx.fillRect(202, 332, 396 * p, 10);
  };
  bar(0);
  await loadCore(bar);
  ctx.textAlign = 'left';
  initAudioDefs();
  const qs = new URLSearchParams(location.search);
  if (qs.get('ep')) await Screens.quickStart(qs.get('ep'), +(qs.get('hero') || 1));
  else host.set(Screens.title());
  requestAnimationFrame(frame);
}

boot().catch(e => { console.error(e); errEl.textContent = 'Laadimine ebaõnnestus: ' + e.message; });
