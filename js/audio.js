// Sound effects (DirectSound groups, sub_40a390/sub_40a3d0) and music playlists (music_list.ini + Music.ini).
import { ini, starAll, tok, atoi } from './assets.js';

let ctx = null, master = null, sfxGain = null, musicGain = null;
const groups = ['Items', 'Level', 'Creatures', 'Mines', 'Forest', 'Weapon', 'Shop']; // Castle/Cave are never loaded
const defs = new Map();        // 'items.goldencoins' -> {file, max, buffer, playing: []}
const loading = new Map();
export const audioSettings = { sfx: 100, music: 70, swap: false, enabled: true };

function fileKey(path) {
  return ('sound/' + path).replace(/\\/g, '/').toLowerCase().replace(/\.[a-z0-9]+$/, '').replace(/[^a-z0-9_]+/g, '_');
}

export function initAudioDefs() {
  for (const g of groups) {
    const tree = ini('Sound\\' + g + '.ini');
    if (!tree) continue;
    for (const [k, a, ch] of tree) {
      if (k !== 'SOUND') continue;
      let file = '', max = 1;
      for (const [k2, a2] of ch) {
        if (k2 === 'FILE') file = a2.trim();
        else if (k2 === 'MAX_SOURCES') max = atoi(a2) || 1;
      }
      if (!file) continue;
      defs.set((g + '.' + a.trim()).toLowerCase(), { file: fileKey(file), max, buffer: null, playing: [] });
    }
  }
}

export function unlockAudio() {
  if (!ctx) {
    const AC = window.AudioContext || window.webkitAudioContext;
    if (!AC) return;
    ctx = new AC();
    master = ctx.createGain(); master.connect(ctx.destination);
    sfxGain = ctx.createGain(); sfxGain.connect(master);
    musicGain = ctx.createGain(); musicGain.connect(master);
    applyVolumes();
    ensureMusicEl();
    // preload all effects
    for (const d of defs.values()) loadBuffer(d.file).then(b => { d.buffer = b; }).catch(() => {});
  }
  if (ctx.state === 'suspended') ctx.resume();
  resumeMusic();
}
export function applyVolumes() {
  if (!ctx) return;
  sfxGain.gain.value = audioSettings.enabled ? audioSettings.sfx / 100 : 0;
  musicGain.gain.value = audioSettings.enabled ? audioSettings.music / 100 : 0;
}

function loadBuffer(key) {
  if (loading.has(key)) return loading.get(key);
  const p = fetch('assets/snd/' + key + '.mp3').then(r => {
    if (!r.ok) throw new Error('missing ' + key);
    return r.arrayBuffer();
  }).then(ab => new Promise((res, rej) => ctx.decodeAudioData(ab, res, rej)));
  loading.set(key, p);
  return p;
}

// sub_40aa80(name, volume 0..100, pan 0..100)
export function playSound(name, vol = 100, pan = 50) {
  if (!ctx || !name) return;
  const d = defs.get(String(name).toLowerCase());
  if (!d || !d.buffer) return;
  const now = ctx.currentTime;
  d.playing = d.playing.filter(p => p.end > now);
  if (d.playing.length >= d.max) return;
  if (audioSettings.swap) pan = 100 - pan;
  const src = ctx.createBufferSource();
  src.buffer = d.buffer;
  const g = ctx.createGain();
  // DirectSound: volume in 1/100 dB = (vol-100)*40
  g.gain.value = Math.pow(10, ((Math.max(0, Math.min(100, vol)) - 100) * 40) / 2000);
  let node = g;
  if (ctx.createStereoPanner) {
    const p = ctx.createStereoPanner();
    p.pan.value = Math.max(-1, Math.min(1, (pan - 50) / 35));
    g.connect(p); node = p;
  }
  src.connect(g);
  node.connect(sfxGain);
  src.start();
  d.playing.push({ end: now + d.buffer.duration });
}

// ------------------------------------------------------------------ music
let musicDefs = null;
function musicFile(name) {
  if (!musicDefs) {
    musicDefs = new Map();
    const tree = ini('Music\\Music.ini') || [];
    for (const [k, a, ch] of tree) {
      if (k !== 'MUSIC') continue;
      const f = ch.find(c => c[0] === 'FILE');
      if (f) musicDefs.set(a.trim().toLowerCase(), f[1].trim().toLowerCase().replace(/\.mo3$/, '') + '.mp3');
    }
  }
  return musicDefs.get(String(name).toLowerCase()) || null;
}

// One persistent <audio> element routed through WebAudio (so volume/fades also work on iOS,
// and a single element unlocked by the first tap can switch tracks later). If the element
// cannot load the file (strict media policy), music falls back to decoded WebAudio buffers.
const music = { list: [], idx: -1, el: null, src: null, fadeGain: null, nextAt: 0, key: '', want: false, mode: 'element', file: '', buf: null, bufFile: '' };

function musicOut() {
  if (!music.fadeGain && ctx) { music.fadeGain = ctx.createGain(); music.fadeGain.connect(musicGain); }
  return music.fadeGain;
}
function ensureMusicEl() {
  if (!music.el) {
    music.el = new Audio();
    music.el.loop = true;
    music.el.preload = 'auto';
    music.el.addEventListener('error', () => {
      if (music.mode === 'element' && music.want && music.file) { music.mode = 'buffer'; startBuffer(music.file); }
    });
  }
  if (ctx && !music.src) {
    try { music.src = ctx.createMediaElementSource(music.el); music.src.connect(musicOut()); } catch (e) { /* already connected */ }
  }
  return music.el;
}
function fadeTo(v, secs) {
  const out = musicOut();
  if (!out) return;
  const g = out.gain, t = ctx.currentTime;
  g.cancelScheduledValues(t);
  g.setValueAtTime(g.value, t);
  g.linearRampToValueAtTime(v, t + secs);
}
function stopBuffer() { if (music.buf) { try { music.buf.stop(); } catch (e) { /* ignore */ } music.buf = null; } }
function startBuffer(file) {
  if (!ctx) return;
  music.bufFile = file;
  fetch('assets/music/' + file).then(r => r.arrayBuffer()).then(ab => new Promise((res, rej) => ctx.decodeAudioData(ab, res, rej))).then(b => {
    if (!music.want || music.bufFile !== file) return;
    stopBuffer();
    const src = ctx.createBufferSource();
    src.buffer = b; src.loop = true;
    src.connect(musicOut());
    musicOut().gain.value = 0; fadeTo(1, 1.5);
    src.start();
    music.buf = src;
  }).catch(() => {});
}

// tracks: ["Winter1,180", ...]
export function playMusicList(tracks) {
  const key = tracks.join('|');
  if (music.key === key && music.want) return;
  music.key = key;
  music.list = tracks.map(t => { const p = tok(t, ' ,'); return { name: p[0], secs: atoi(p[1]) || 180 }; });
  music.idx = -1;
  music.want = true;
  nextTrack();
}
export function stopMusic() {
  music.key = '';
  music.want = false;
  music.nextAt = 0;
  fadeTo(0, 0.6);
  setTimeout(() => { if (!music.want) { if (music.el) music.el.pause(); stopBuffer(); } }, 700);
}
function nextTrack() {
  if (!music.list.length) return;
  music.idx = (music.idx + 1) % music.list.length;
  const tr = music.list[music.idx];
  const f = musicFile(tr.name);
  if (!f) return;
  music.file = f;
  music.nextAt = performance.now() + tr.secs * 1000;
  const playing = music.mode === 'element' ? (music.el && !music.el.paused) : !!music.buf;
  const start = () => {
    if (!music.want || music.file !== f) return;
    if (music.mode === 'buffer') { startBuffer(f); return; }
    const el = ensureMusicEl();
    el.src = 'assets/music/' + f;
    if (music.fadeGain) { music.fadeGain.gain.value = 0; fadeTo(1, 1.5); }
    el.play().catch(() => {});
  };
  if (playing && music.fadeGain) { fadeTo(0, 0.8); setTimeout(start, 850); } else start();
}
// called from the first user gesture (iOS needs play() inside the gesture)
export function resumeMusic() {
  if (!music.want) return;
  if (music.mode === 'buffer') { if (!music.buf && music.file) startBuffer(music.file); return; }
  const el = ensureMusicEl();
  if (!el.src && music.list.length) { music.idx = -1; nextTrack(); return; }
  if (el.paused) el.play().catch(() => {});
}
export function musicState() { return music.el ? { paused: music.el.paused, src: music.el.src, t: music.el.currentTime, want: music.want, connected: !!music.src } : null; }
export function updateMusic() {
  if (music.list.length > 1 && music.nextAt && performance.now() > music.nextAt) nextTrack();
}
export function pauseAllAudio(p) {
  if (ctx) { if (p) ctx.suspend(); else ctx.resume(); }
  if (music.mode === 'element' && music.el && music.want) { if (p) music.el.pause(); else music.el.play().catch(() => {}); }
}
