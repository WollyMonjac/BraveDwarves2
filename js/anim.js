// Animation definitions (*.anm / Creature.ini) and players, ported from sub_41b7d0/sub_41b250/sub_41b550/sub_41b0a0.
import { A, ini, starFind, starAll, atoi, tok } from './assets.js';

const cache = new Map();

// path: ini path (e.g. 'Creatures\\Dwarf1\\Creature.ini'), dir: base dir for bitmaps (e.g. 'Creatures\\Dwarf1\\')
export function loadAnimDef(path, dir) {
  const key = path.toLowerCase();
  if (cache.has(key)) return cache.get(key);
  const tree = ini(path);
  const def = parseAnimDef(tree, dir);
  def.path = path;
  cache.set(key, def);
  return def;
}

export function parseAnimDef(tree, dir) {
  const def = {
    bw: 0, bh: 0, walkSpeed: 0, width: 16, height: 0,
    surfaces: [], anims: [{ name: '', frames: [{ s: 0, i: 0, delay: 0, event: '' }], count: 0, goto: '' }],
    byName: new Map(),
  };
  if (!tree) { def.missing = true; return def; }
  const params = starFind(tree, 'PARAMS');
  if (params) {
    for (const [k, a] of params[2]) {
      if (k === 'BITMAP_SIZE') {
        const t = tok(a, ' ,');
        def.bw = atoi(t[0]); def.bh = atoi(t[1]);
        if (!def.height) def.height = def.bh;
        if (!def.width) def.width = def.bw;
      } else if (k === 'WALK_SPEED') def.walkSpeed = atoi(tok(a, ' ,')[0]);
      else if (k === 'WIDTH') def.width = atoi(tok(a, ' ,')[0]);
      else if (k === 'HEIGHT') def.height = atoi(tok(a, ' ,')[0]);
    }
  }
  const base = (dir || '').replace(/\\/g, '/').toLowerCase();
  for (const [k, a, ch] of tree) {
    if (k !== 'SURFACE') continue;
    const surf = { name: a.trim(), cols: 1, rows: 1, dirOffset: 0, frames: [] };
    let flip = 0;
    for (const [k2, a2] of ch) {
      if (k2 === 'SIZE') { const t = tok(a2, ' ,'); surf.cols = atoi(t[0]) || 1; surf.rows = atoi(t[1]) || 1; break; }
    }
    for (const [k2, a2] of ch) {
      if (k2 === 'FILES') {
        for (const f of tok(a2, ', ')) surf.frames.push({ key: (base + f.replace(/\\/g, '/') + '.bmp').toLowerCase(), flip });
      } else if (k2 === 'DIRECTION_OFFSET') surf.dirOffset = atoi(tok(a2, ' ,')[0]);
      else if (k2 === 'FLIP_X') flip = 1;
      else if (k2 === 'FLIP_NONE') flip = 0;
      else if (k2 === 'FLIP_Y') flip = 2;
    }
    surf.capacity = surf.cols * surf.rows;
    def.surfaces.push(surf);
  }
  for (const [k, a, ch] of tree) {
    if (k !== 'ANIMATION') continue;
    const name = tok(a, ' ')[0] || '';
    const an = { name, frames: [], count: 0, goto: '' };
    let delay = 0;
    for (const [k2, a2] of ch) {
      if (k2 === 'FRAME') {
        const t = tok(a2, ', \t');
        const s = findSurface(def, t[0]);
        const i = atoi(t[1]);
        const d = t[2] !== undefined ? atoi(t[2]) : 0;
        an.frames.push({ s, i, delay: d || delay, event: '', eargs: [0, 0, 0] });
      } else if (k2 === 'DELAY') delay = atoi(tok(a2, ', ')[0]);
      else if (k2 === 'GOTO') an.goto = tok(a2, ', \t')[0] || '';
      else if (k2 === 'EVENT') {
        const t = tok(a2, ', \t');
        if (an.frames.length && t[0]) {
          const fr = an.frames[an.frames.length - 1];
          fr.event = t[0];
          fr.eargs = [atoi(t[1]), atoi(t[2]), atoi(t[3])];
        }
      }
    }
    an.count = an.frames.length;
    if (!an.frames.length) an.frames.push({ s: 0, i: 0, delay: 0, event: '' });
    def.anims.push(an);
    const lk = name.toLowerCase();
    if (!def.byName.has(lk)) def.byName.set(lk, def.anims.length - 1);
  }
  return def;
}

function findSurface(def, name) {
  if (!name) return -1;
  const ln = name.toLowerCase();
  for (let i = 0; i < def.surfaces.length; i++) if (def.surfaces[i].name.toLowerCase() === ln) return i;
  return -1;
}

export function findAnim(def, name) {
  if (!name) return 0;
  const v = def.byName.get(String(name).toLowerCase());
  return v === undefined ? 0 : v;
}

export class AnimPlayer {
  constructor() { this.anim = 0; this.t0 = 0; this.frame = 0; this.dir = 0; }
  // sub_41b0a0: returns true when animation switched
  set(def, name, now) {
    if (name) {
      const idx = findAnim(def, name);
      if (idx !== this.anim) { this.anim = idx; this.frame = 0; this.t0 = now; return true; }
    }
    const an = def.anims[this.anim] || def.anims[0];
    const fr = an.frames[this.frame] || an.frames[0];
    if (now - this.t0 >= fr.delay) {
      this.t0 = now;
      this.frame++;
      if (this.frame >= an.count) {
        if (an.goto) {
          this.anim = findAnim(def, an.goto); this.frame = 0; this.t0 = now; return true;
        }
        this.frame = 0;
      }
    }
    return false;
  }
  event(def) {
    const an = def.anims[this.anim] || def.anims[0];
    const fr = an.frames[this.frame];
    return fr ? fr.event : '';
  }
  eventIs(def, name) { return this.event(def).toLowerCase() === name.toLowerCase(); }
  animName(def) { return (def.anims[this.anim] || def.anims[0]).name; }
  // returns {key, flip} or null (sub_41b160)
  frameInfo(def, dir) {
    const an = def.anims[this.anim] || def.anims[0];
    const fr = an.frames[this.frame] || an.frames[0];
    const surf = def.surfaces[fr.s];
    if (!surf) return null;
    let idx = fr.i;
    if (surf.dirOffset) idx += (dir === undefined ? this.dir : dir) * surf.dirOffset;
    if (idx < 0 || idx >= surf.frames.length || idx >= surf.capacity) return null;
    return surf.frames[idx];
  }
}
