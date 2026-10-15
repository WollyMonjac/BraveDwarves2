// Asset loading for the Brave Dwarves 2 web port.
export const A = {
  ini: null,        // path(lowercase) -> {type:'star'|'sect', data}
  texts: null,      // path -> text
  spr: null,        // {pages:[img], frames:{key:[page,x,y,w,h,ox,oy,fw,fh]}}
  el: null,         // {pages:[img], frames, bg:{name:[file,w,h]}, defs, groups}
  bgImg: {},        // name -> img
  pics: {},         // name -> img
  episodes: null,   // list of episode paths
  ep: {},           // name -> episode json
  str: {},          // localized strings
};

const BASE = 'assets/';

export function loadImage(url) {
  return new Promise((res, rej) => {
    const img = new Image();
    img.decoding = 'async';
    img.onload = () => res(img);
    img.onerror = () => rej(new Error('Failed to load ' + url));
    img.src = url;
  });
}

export async function loadJSON(path) {
  const r = await fetch(BASE + path);
  if (!r.ok) throw new Error('Failed to load ' + path);
  return r.json();
}

function parseStrings(text) {
  const out = {};
  for (const line of text.split(/\r?\n/)) {
    const m = line.match(/^\s*:>\s*([^=\s]+)\s*=\s?(.*)$/);
    if (m) out[m[1]] = m[2].replace(/\s+$/, '').replace(/\\n/g, '\n');
  }
  return out;
}

export async function loadCore(progress) {
  const steps = [];
  let done = 0;
  const total = 9;
  const tick = () => { done++; progress && progress(done / total); };
  const p1 = loadJSON('data/ini.json').then(j => { A.ini = j; tick(); });
  const p2 = loadJSON('data/texts.json').then(j => { A.texts = j; A.str = parseStrings(j['texts/eng/str_eng.txt'] || ''); tick(); });
  const p3 = loadJSON('data/sprites.json').then(async j => {
    const pages = await Promise.all(Array.from({ length: j.pages }, (_, i) => loadImage(BASE + 'gfx/spr' + i + '.webp')));
    A.spr = { pages, frames: j.frames }; tick();
  });
  const p4 = loadJSON('data/elements.json').then(async j => {
    const pages = await Promise.all(Array.from({ length: j.pages }, (_, i) => loadImage(BASE + 'gfx/el' + i + '.webp')));
    A.el = { pages, frames: j.frames, bg: j.bg, defs: j.defs, groups: j.groups }; tick();
    await Promise.all(Object.entries(j.bg).map(async ([name, v]) => { A.bgImg[name] = await loadImage(BASE + 'gfx/' + v[0]); }));
    tick();
  });
  const p5 = loadJSON('data/episodes.json').then(j => { A.episodes = j.episodes; tick(); });
  const picNames = ['title1', 'menu1', 'loading', 'progressbar1', 'progressbar2', 'shop1', 'shop2', 'slot', 'score', 'theend',
    'credits', 'portrait1', 'portrait2', 'boss_hp', 'boss_hpmax', 'help8'];
  const p6 = Promise.all(picNames.map(async n => { A.pics[n] = await loadImage(BASE + 'pics/' + n + '.jpg'); })).then(tick);
  const p7 = loadFonts().then(tick);
  await Promise.all([p1, p2, p3, p4, p5, p6, p7]);
  tick();
}

// fonts are fetched as data so they load under strict font-src policies too
async function loadFonts() {
  const one = async (family, file) => {
    try {
      const r = await fetch(BASE + 'fonts/' + file);
      const buf = await r.arrayBuffer();
      const f = new FontFace(family, buf);
      await f.load();
      document.fonts.add(f);
    } catch (e) { console.warn('font load failed', file, e); }
  };
  await Promise.all([one('BDTahoma', 'tahoma.ttf'), one('BDZepplin', 'zepplin.ttf')]);
}

export async function loadEpisode(name) {
  const key = name.toLowerCase();
  if (A.ep[key]) return A.ep[key];
  const j = await loadJSON('data/ep_' + key + '.json');
  A.ep[key] = j;
  return j;
}

export async function loadEpisodePic(name) {
  const key = 'ep_' + name.toLowerCase();
  if (!A.pics[key]) A.pics[key] = await loadImage(BASE + 'pics/' + key + '.jpg');
  return A.pics[key];
}

// ---- ini helpers
export function ini(path) {
  const e = A.ini[path.toLowerCase().replace(/\\/g, '/')];
  return e ? e.data : null;
}
export function starFind(tree, key, name) {
  if (!tree) return null;
  key = key.toUpperCase();
  for (const n of tree) if (n[0] === key && (name === undefined || n[1].toLowerCase() === name.toLowerCase())) return n;
  return null;
}
export function starAll(tree, key) {
  key = key.toUpperCase();
  return tree ? tree.filter(n => n[0] === key) : [];
}
export function atoi(s) {
  const m = String(s || '').match(/^\s*([+-]?\d+)/);
  return m ? parseInt(m[1], 10) : 0;
}
export function atof(s) {
  const m = String(s || '').match(/^\s*([+-]?(\d+\.?\d*|\.\d+)(e[+-]?\d+)?)/i);
  return m ? parseFloat(m[1]) : 0;
}
// strtok-like split on any of chars
export function tok(s, chars) {
  const re = new RegExp('[' + chars.replace(/[\]\\^-]/g, '\\$&') + ']+');
  return String(s || '').split(re).filter(x => x.length);
}
export function S(key, fallback) {
  return A.str[key] !== undefined ? A.str[key] : (fallback !== undefined ? fallback : key);
}
