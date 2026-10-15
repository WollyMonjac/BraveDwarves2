// Room (one screen of an episode): elements, collision grid, lights, items, monsters.
// Ported from sub_425cb0 (LVL loader), sub_41f2c0 (element instance), sub_4235a0 (grid), sub_422c50 (sort).
import { A } from './assets.js';
import { G, rnd } from './globals.js';

export const COLS = 50, ROWS = 35;
const GEM_NAMES = ['GemWhite', 'GemRed', 'GemGreen', 'GemBlue', 'GemPurple']; // g_4a6c58

export class Room {
  constructor(world, rx, ry, data) {
    this.world = world;
    this.rx = rx; this.ry = ry;
    this.data = data;
    this.visited = false;
    this.ambient = data.amb;          // [r,g,b]
    this.lightMode = data.f12;
    this.bg = data.bg || 'Back01';
    this.flags = new Uint8Array(COLS * ROWS);
    this.waterG = new Uint8Array(COLS * ROWS);
    this.hostileG = new Int16Array(COLS * ROWS);
    this.elements = [];
    this.lights = [];
    this.monsters = [];
    this.items = [];          // room items (max 256)
    this.hidden = [];         // hidden gems inside blocks (max 256)
    this.rects = [];          // breakable / hidden blocks (max 32)
    this.sounds = [];
    this.extra = (data.x || []).slice(0, 8);
    this.boss = 0;            // field_15cbc
    this.scoreTotal = 0;      // field_15918: total item score in the room
    this.hasGate = false;
    this.load();
  }

  load() {
    const d = this.data, w = this.world;
    // lights
    for (const l of d.lights) {
      if (this.lights.length >= 31) break;
      const col = l[0] >>> 0;
      this.lights.push({ x: l[1], y: l[2], r: l[3], cr: (col >>> 16) & 255, cg: (col >>> 8) & 255, cb: col & 255, type: l[4], link: l[5] });
    }
    // elements
    for (const e of d.el) {
      const [name, x, y, lflags, sortp] = e;
      if (this.elements.length >= 400) break;
      const def = A.el.defs[name.toLowerCase()];
      if (!def) continue;
      const sz = elementSize(name);
      if (!sz) continue;
      const inst = { name, lname: name.toLowerCase(), def, x, y, w: sz[0], h: sz[1], flags: 0, sort: def.sort, water: 0, hostile: def.hostile };
      let f = ((def.obstacle & 1) << 2) | 9;
      f = (f & ~0x20) | ((def.ladder << 5) & 0x20);
      f = (f & ~0x400) | ((def.terrific << 10) & 0x400);
      // LVL record flag bits
      const b = lflags;
      const set = (mask, bit) => { f = (f & ~mask) | ((b >> bit) & 1 ? mask : 0); };
      set(0x200, 6); set(0x100, 5); set(0x80, 4); set(0x4, 0); set(0x10, 2); set(0x8, 1); set(0x40, 3);
      inst.flags = f;
      inst.water = def.water;
      inst.sort = sortp || def.sort;
      if (w.gateOpen && name.toLowerCase() === w.gateOpen.toLowerCase()) this.hasGate = true;
      // gems inside rock
      if (def.gem && !(f & 0x200)) {
        const w16 = inst.w - 16, h16 = inst.h - 16;
        if (w16 > 0 && h16 > 0) {
          const r1 = rnd(), r2 = rnd();
          const gx = r1 % (w16 - 8) + x + 8;
          const gy = r2 % (h16 - 8) + y + 8;
          this.addHidden(gx, gy, GEM_NAMES[w.gemCounter % 5]);
          w.gemCounter++;
          w.secretTotal++;
        }
      }
      this.elements.push(inst);
      if (f & 0x100) this.addRect(1, inst);
      if (f & 0x200) this.addRect(2, inst);
    }
    // stable sort by priority, descending (sub_422c50)
    this.elements.forEach((e, i) => e._i = i);
    this.elements.sort((a, b) => (b.sort - a.sort) || (a._i - b._i));
    // fix rect element references after sort
    for (const r of this.rects) r.el = r.elRef;
    // monsters
    for (const m of d.mon) {
      const [type, dir, x, y, hp, mflags] = m;
      const c = w.createCreature(this, x, y, type, dir);
      if (c) {
        c.boss = mflags & 1;
        c.hp = c.maxhp = Math.fround(hp);
        c.spawnX = x; c.spawnY = y;
        if (c.boss) this.boss = 1;
      }
    }
    // items
    for (const it of d.it) {
      const [name, x, y, score] = it;
      const item = this.spawnItem(x, y, name, score, 86400000);
      const idef = w.items.def(name);
      const isKey = idef && idef.effect && idef.effect.name.toUpperCase() === 'ADD_EPISODE_KEY';
      if (idef && !idef.notTouch && !isKey) {
        this.scoreTotal += score;
        if (item) w.itemsTotal++;
      }
    }
    // items are kept sorted by y (bubble sort in sub_425cb0)
    this.items.sort((a, b) => a.y - b.y);
    // ambient sounds
    for (const s of d.snd) {
      if (this.sounds.length >= 8) break;
      this.sounds.push({ name: s[0], x: s[1], y: s[2], vol: s[3], pmin: s[4], pmax: s[5], next: 0 });
    }
  }

  addRect(type, inst) {
    if (this.rects.length >= 32) return;
    const r = { active: 0, type, x: inst.x, y: inst.y, w: inst.w, h: inst.h, elRef: inst, el: inst, hits: 5 };
    if (type === 1) { inst.flags |= 12; r.hits = 5; r.active = 1; }
    else { inst.flags &= ~0xC; r.active = 0; }
    this.rects.push(r);
  }

  addHidden(x, y, name) {
    if (this.hidden.length >= 256) return;
    const idef = this.world.items.def(name);
    if (!idef) return;
    this.hidden.push({ on: 1, def: idef, x, y, phase: rnd() & 15 });
  }

  spawnItem(x, y, name, score, delay) {
    const idef = this.world.items.def(name);
    if (!idef) return null;
    // sub_424860: while the episode loads, main keys become candidate positions instead of items
    const w = this.world;
    if (w.collectKeys && idef.effect && idef.effect.name.toUpperCase() === 'ADD_EPISODE_KEY') {
      if (w.keyCandidates.length < 64) w.keyCandidates.push({ rx: this.rx, ry: this.ry, x, y });
      return null;
    }
    if (this.items.length >= 256) {
      const free = this.items.find(i => !i.used);
      if (!free) return null;
      this.items.splice(this.items.indexOf(free), 1);
    }
    const it = this.world.items.make(this, idef, x, y, score, delay);
    this.items.push(it);
    return it;
  }

  // ------------------------------------------------------------ grid
  buildGrid() {
    this.flags.fill(0); this.waterG.fill(0); this.hostileG.fill(0);
    for (const e of this.elements) {
      const f = e.flags;
      if (!(f & 1)) continue;
      if (!((f & 0x24) || e.water)) continue;
      const c0 = Math.trunc(e.x / 16), r0 = Math.trunc(e.y / 16);
      const cn = Math.trunc(e.w / 16), rn = Math.trunc(e.h / 16);
      for (let r = r0; r < r0 + rn; r++) {
        if (r < 0 || r >= ROWS) continue;
        for (let c = c0; c < c0 + cn; c++) {
          if (c < 0 || c >= COLS) continue;
          const i = r * COLS + c;
          if (f & 4) this.flags[i] |= 1;
          if (f & 0x20) { this.flags[i] |= 2; if (f & 0x40) this.flags[i] |= 4; }
          this.waterG[i] = e.water & 255;
          this.hostileG[i] = e.hostile;
        }
      }
    }
    this.waterCells = [];
    for (let i = 0; i < COLS * ROWS; i++) if (this.waterG[i]) this.waterCells.push([i, this.waterG[i]]);
  }
  cellFlags(r, c) { return (r < 0 || c < 0 || r >= ROWS || c >= COLS) ? 0 : this.flags[r * COLS + c]; }
  cellWater(r, c) { return (r < 0 || c < 0 || r >= ROWS || c >= COLS) ? 0 : this.waterG[r * COLS + c]; }
  cellHostile(r, c) { return (r < 0 || c < 0 || r >= ROWS || c >= COLS) ? 0 : this.hostileG[r * COLS + c]; }

  // sub_423c10: nearest creature of team `flag` (flag 0 also considers the hero)
  nearest(x, y, flag) {
    let best = null, bd = 1000000;
    const h = this.world.hero;
    if (!flag && h) { best = h; bd = Math.sqrt((h.y - y) ** 2 + (h.x - x) ** 2); }
    for (const m of this.monsters) {
      if (!m || m.team !== flag || m.type === 1 || m.type === 2 || !m.alive) continue;
      const d = Math.fround(Math.sqrt((m.x - x) ** 2 + (m.y - y) ** 2));
      if (d < bd) { bd = d; best = m; }
    }
    return best;
  }

  // sub_4233d0: boss hp
  bossHP() {
    let r = null;
    for (const m of this.monsters) if (m && m.boss) r = [Math.trunc(m.hp), Math.trunc(m.maxhp)];
    return r;
  }

  // sub_422f50: first active breakable block (used by ArrowDig items)
  breakableBox() {
    for (const r of this.rects) if (r.type === 1 && r.active) return [r.x, r.y, r.x + r.w, r.y + r.h];
    return null;
  }

  addMonster(c) {
    const i = this.monsters.indexOf(null);
    if (i >= 0) { this.monsters[i] = c; return true; }
    if (this.monsters.length >= 32) return false;
    this.monsters.push(c);
    return true;
  }

  aliveMonsters() { return this.monsters.filter(m => m && m.alive && m.state !== 7 && m.type > 0); }

  // sub_425b40 : hidden blocks appear when the hero steps into them
  checkHiddenBlocks(hero) {
    for (const r of this.rects) {
      if (r.type === 2 && !r.active && hero.x >= r.x && hero.x < r.w + r.x && hero.y >= r.y && hero.y < Math.trunc(r.h / 2) + r.y) {
        r.el.flags |= 12;
        r.active = 1;
        const w = this.world;
        w.dirtyRect = [r.x, r.y, r.x + r.w, r.y + r.h];
        w.redraw = true;
        for (let i = 0; i < 4; i++) {
          const ex = rnd() % (r.w) + r.x;
          const ey = rnd() % (r.h || 1) + r.y;
          w.fx.explosion(ex, ey, 255, 255);
        }
        this.removeItemsNear('ArrowJump', r.x + (r.w >> 1), r.y + 100, 100);
        w.sound('Level.BlockShow', 100, 50);
        return 1;
      }
    }
    return 0;
  }

  // sub_424530
  removeItemsNear(name, x, y, rad) {
    const d = this.world.items.def(name);
    if (!d) return;
    for (const it of this.items) {
      if (it.def === d && Math.abs(it.x - x) < rad && Math.abs(it.y - y) < rad) it.used = 0;
    }
    this.items = this.items.filter(i => i.used);
  }

  // projectile vs breakable blocks (sub_423ce0). returns true if projectile survives
  blockHit(px, py, fw, fh) {
    const hw = fw >> 1, hh = fh >> 1;
    const pts = [[0, 0], [0, 16], [0, -16], [16, 0], [-16, 0]];
    for (const k of [1, 2, 4]) {
      const a = Math.trunc(hw / k), b = Math.trunc(hh / k);
      pts.push([-a, -b], [a, -b], [a, b], [-a, b]);
    }
    for (const r of this.rects) {
      if (r.type !== 1 || !r.active) continue;
      let hit = false;
      for (const [dx, dy] of pts) {
        const x = px + dx, y = py + dy;
        if (x >= r.x && x < r.x + r.w && y >= r.y && y < r.y + r.h) { hit = true; break; }
      }
      if (!hit) continue;
      const w = this.world;
      if (--r.hits !== 0) {
        w.fx.explosion(Math.trunc(px), Math.trunc(py), 254, 255);
        w.sound('Level.EmptyBlockHit', 100, 50);
        return false;
      }
      r.el.flags &= ~0xC;
      w.dirtyRect = [r.x, r.y, r.x + r.w, r.y + r.h];
      w.redraw = true;
      r.active = 0;
      for (let i = 0; i < 4; i++) w.fx.explosion(rnd() % (r.w || 1) + r.x, rnd() % (r.h || 1) + r.y, 255, 255);
      w.sound('Level.EmptyBlockBlow', 100, 50);
      w.fx.floatNumber(r.x, r.y, 50);
      w.addScore(50);
      return false;
    }
    return true;
  }

  // sub_425460 : reveal hidden gems near (x,y)
  revealHidden(x, y, rad) {
    for (const h of this.hidden) {
      if (!h.on) continue;
      const d = Math.trunc(Math.sqrt((h.x - x) ** 2 + (h.y - y) ** 2));
      if (d > rad) continue;
      h.on = 0;
      const c = Math.trunc(h.x / 16);
      let r = Math.trunc(h.y / 16);
      if (c < 0 || c >= COLS) continue;
      if (r < 0) r = 0;
      if (r >= ROWS) continue;
      if (this.cellFlags(r, c) & 1) {
        const it = this.spawnItem(h.x, h.y, h.def.name, h.def.score, 30000);
        if (it) {
          it.secret = 1;
          this.world.items.startBounce(it);
          this.world.items.playSound(it);
        }
      }
    }
  }
}

export function elementSize(name) {
  const k = name.toLowerCase();
  const f = A.el.frames[k];
  if (f) return [f[7], f[8]];
  const b = A.el.bg[k];
  if (b) return [b[1], b[2]];
  return null;
}
