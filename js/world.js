// Episode world: rooms, hero, lifts, teleports, keys and the per-frame game tick (sub_4072b0).
import { A, ini, starFind, tok, atoi, S } from './assets.js';
import { G, rnd } from './globals.js';
import { loadAnimDef } from './anim.js';
import { Slot, Creature } from './creature.js';
import { Hero } from './hero.js';
import { CREATURE_CLASSES } from './monsters.js';
import { Room } from './room.js';
import { Items } from './items.js';
import { Weapons } from './weapons.js';
import { Effects } from './effects.js';
import { playSound, playMusicList } from './audio.js';
import { input } from './input.js';

const f32 = Math.fround;

export const CREATURE_NAMES = ['', 'Dwarf1', 'Dwarf2', 'Orc', 'Pikeman', 'Skeleton', 'Bat', 'Fish', 'Archer', 'Dendroid',
  'Zealot', 'Spider', 'Snake', 'Frog', 'Lepr', 'WoodArcher', 'Bee', 'Ghost', 'Fly', '-bb-\\Gribarus', 'Helicopter',
  '-bb-\\Golem', '-bb-\\Knight', '-bb-\\Golem2']; // g_4a5240

const BELT = ['ItemBowl', 'ItemHammer', 'ItemPin', 'Ring1', 'Ring2', 'Ring3', 'Ring4', 'Ring5']; // g_4a53c8

// sub_404180 : creature definitions (Creature.ini + DefWeapon.ini + CreaturesHP.ini)
export function loadCreatureDefs() {
  if (G.cdefs.length) return;
  const hpT = ini('Creatures\\CreaturesHP.ini');
  const hp = (hpT && hpT['Hit points']) || {};
  for (let t = 1; t < CREATURE_NAMES.length; t++) {
    const name = CREATURE_NAMES[t];
    const dir = 'Creatures\\' + name + '\\';
    const anim = loadAnimDef(dir + 'Creature.ini', dir);
    const weapons = [0, 1, 2, 3, 4, 5].map(() => new Slot());
    let offX = 0, offY = 0;
    const dw = ini(dir + 'DefWeapon.ini');
    const blk = dw && starFind(dw, 'DEFAULT_WEAPON');
    if (blk) {
      for (const [k, a] of blk[2]) {
        if (k === 'OFFSETX') offX = atoi(a);
        else if (k === 'OFFSETY') offY = atoi(a);
        else if (/^SLOT[1-6]$/.test(k)) {
          const t2 = tok(a, ' ,\t');
          const s = weapons[atoi(k.slice(4)) - 1];
          s.name = (t2[0] || '').toLowerCase();
          s.level = atoi(t2[1]);
        }
      }
    }
    const hk = Object.keys(hp).find(k => k.toLowerCase() === name.toLowerCase());
    G.cdefs[t] = { type: t, name, anim, hp: hk ? atoi(hp[hk]) : 100, weapons, offX, offY };
  }
}

export class World {
  constructor(ep, heroType, settings = {}) {
    G.world = this;
    this.ep = ep;
    this.settings = settings;
    const E = ep.episode['Brave Dwarves'] || {};
    this.E = E;
    this.name = E.Name || ep.name;
    const pair = (s, d) => { const t = tok(s || d, ' ,'); return t.map(v => atoi(v)); };
    [this.startRX, this.startRY] = pair(E['World start'], '0,0');
    [this.startX, this.startY] = pair(E['Player start'], '100,100');
    this.border = pair(E.Border, '0,0,50,50');
    this.liftName = E['Lift name'] || '';
    this.doorName = E['Door name'] || '';
    this.defaultBg = E['Default background'] || 'Back01';
    this.checkHead = atoi(E['Check head'] || '0');
    this.mainKeys = atoi(E['Main keys'] || '0');
    this.gateOpen = E['Gate Opened'] || '';
    this.gateClosed = E['Gate Closed'] || '';
    this.parentOption = settings.child ? 1 : 0;

    this.score = 0; this.lives = 1; this.keys = 0;
    this.heroType = heroType;
    this.pinActive = 0; this.greed = 0; this.ringOfFire = 0; this.noScore = 0;
    this.gemCounter = 0; this.secretTotal = 0; this.itemsCollected = 0; this.secretCollected = 0;
    this.itemsTotal = 0;
    this.bossTimer = 0; this.gameOver = 0; this.completed = 0;
    this.betTotal = 0; this.winTotal = 0;
    this.startTime = G.time;
    this.rooms = new Map();
    this.room = null; this.rx = 0; this.ry = 0;
    this.activeRooms = [];
    this.hero = null;
    this.keyItems = [];
    this.keyCandidates = [];
    this.collectKeys = false;
    this.lifts = []; this.waypoints = []; this.teleports = []; this.tpTime = -1e9;
    this.dyn = Array.from({ length: 64 }, () => ({ on: 0, r: 0, g: 0, b: 0, radius: 0, x: 0, y: 0, delay: 0, step: 0 }));
    this.redraw = true;
    this.message = null;       // {text}
    this.events = [];          // for the screen layer: 'shop', 'completed', 'gameover', 'message'
    this.mapAll = 0; this.mapKeys = 0; this.mapTeleports = 0;
    this.hpShown = 0;

    loadCreatureDefs();
    this.fx = new Effects(this);
    this.items = new Items(this);
    this.weapons = new Weapons(this);

    // sub_41fa00 : load every room inside the border
    this.collectKeys = true;
    const [bx0, by0, bx1, by1] = this.border;
    for (let ry = by0; ry < by1; ry++) {
      for (let rx = bx0; rx < bx1; rx++) {
        const d = ep.rooms[rx + '_' + ry];
        if (!d) continue;
        const room = new Room(this, rx, ry, d);
        this.rooms.set(rx + '_' + ry, room);
      }
    }
    this.collectKeys = false;
    this.setupKeys();
    this.buildMapInfo();
    this.loadLifts();
    this.loadTeleports();
    this.music = (ep.music && ep.music.length) ? ep.music : [];
    // global_sounds.ini: ambient sounds played everywhere unless the room excludes them
    this.globalSounds = Object.entries(ep.globalSounds || {}).map(([k, v]) => ({
      id: atoi(k.replace(/\D+/g, '')), name: v.Name, x: atoi(v.PosX), y: atoi(v.PosY), vol: atoi(v.Volume || '100'),
      pmin: atoi(v.Period_min), pmax: atoi(v.Period_max), next: 0,
    }));

    // sub_406500 : enter the start room and create the hero
    this.switchRoom(this.startRX, this.startRY, this.startX, this.startY);
    this.hero = this.createCreature(this.room, this.startX, this.startY, heroType, 0);
    this.lives = 1;
  }

  roomAt(rx, ry) { return this.rooms.get(rx + '_' + ry) || null; }

  // sub_4250a0
  setupKeys() {
    const c = this.keyCandidates;
    const n = c.length;
    if (n > 1) {
      for (let i = 20000; i > 0; i--) {
        const k = rnd() % (n - 1);
        const t = c[k]; c[k] = c[k + 1]; c[k + 1] = t;
      }
    }
    const def = this.items.def('KeyMain');
    if (!def) return;
    for (let j = 0; j < this.mainKeys && j < n; j++) {
      const k = c[j];
      const it = this.items.make(null, def, k.x, k.y, def.score, 1e12);
      it.rx = k.rx; it.ry = k.ry; it.active = 1;
      this.keyItems.push(it);
    }
  }

  // sub_423360
  keyTaken(rx, ry) {
    for (const k of this.keyItems) if (k.used && k.rx === rx && k.ry === ry) k.used = 0;
    if (this.keys >= this.mainKeys) {
      this.showMessage(S('AllKeys', 'You have just found all the keys\n Find opened door to exit from level.\n\n Good luck'));
      this.redraw = true;
    }
  }

  showMessage(text) { this.message = { text }; this.events.push('message'); }

  // sub_41e510 : map cells (exists / walls)
  buildMapInfo() {
    this.mapInfo = new Map();
    for (const room of this.rooms.values()) {
      room.buildGrid();
      const { rx, ry } = room;
      let f = 3;
      const L = this.roomAt(rx - 1, ry), R = this.roomAt(rx + 1, ry), U = this.roomAt(rx, ry - 1), D = this.roomAt(rx, ry + 1);
      const runOpen = (get, n) => { let k = 0; for (let i = 0; i < n; i++) { if (get(i) === 'open') { if (++k === 4) return true; } else if (get(i) === 'stairs') return true; else k = 0; } return false; };
      if (rx && L && runOpen(r => (room.cellFlags(r, 0) & 1) ? 'solid' : 'open', 35)) f &= ~2;
      f |= 4;
      if (R && runOpen(r => (room.cellFlags(r, 49) & 1) ? 'solid' : 'open', 35)) f &= ~4;
      f |= 8;
      if (ry && U && runOpen(c => (room.cellFlags(0, c) & 2) ? 'stairs' : (room.cellFlags(0, c) & 1) ? 'solid' : 'open', 50)) f &= ~8;
      f |= 16;
      if (D && runOpen(c => (room.cellFlags(34, c) & 2) ? 'stairs' : (room.cellFlags(34, c) & 1) ? 'solid' : 'open', 50)) f &= ~16;
      this.mapInfo.set(rx + '_' + ry, f);
    }
  }

  // sub_426c90
  loadLifts() {
    const ep = this.ep.episode;
    for (let i = 1; ep['Waypoint ' + i]; i++) {
      const s = ep['Waypoint ' + i];
      const wp = { wx: atoi(s.worldx ?? -1), wy: atoi(s.worldy ?? -1), px: atoi(s.positionx ?? -1), py: atoi(s.positiony ?? -1), uin: atoi(s.uin ?? 0) };
      wp.X = wp.wx * 800 + wp.px; wp.Y = wp.wy * 544 + wp.py;
      if (!wp.uin) { do { wp.uin = rnd() % 1000; } while (this.waypoints.some(w => w.uin === wp.uin)); }
      this.waypoints.push(wp);
    }
    for (let i = 1; ep['Lift ' + i]; i++) {
      const s = ep['Lift ' + i];
      let lift = null;
      for (let k = 1; s['Waypoint ' + k] !== undefined; k++) {
        const uin = atoi(s['Waypoint ' + k]);
        if (k === 1) {
          const wp = this.waypoints.find(w => w.uin === uin);
          if (!wp) continue;
          lift = { active: 1, name: s.Name || '', x: f32(wp.X), y: f32(wp.Y), w: 128, h: 32, list: [uin], idx: 1, speed: 2 };
          this.lifts.push(lift);
        } else if (lift && lift.list.length < 32) lift.list.push(uin);
      }
    }
    this.liftSprite = 'lifts/' + this.liftName.toLowerCase() + '.bmp';
  }

  // sub_426930
  updateLifts() {
    for (const L of this.lifts) {
      const wp = this.waypoints.find(w => w.uin === L.list[L.idx % L.list.length]);
      if (!wp) continue;
      const dx = f32(wp.X - L.x), dy = wp.Y - L.y, sp = L.speed;
      if (Math.abs(dx) < sp && Math.abs(dy) < sp) {
        L.y = f32(wp.Y); L.x = f32(wp.X);
        L.idx++;
        if (L.idx === L.list.length) L.idx = 0;
      } else {
        const k = sp / Math.sqrt(dy * dy + dx * dx);
        L.x = f32(dx * k + L.x);
        L.y = f32(dy * k + L.y);
      }
    }
  }

  // sub_4289e0
  loadTeleports() {
    const ep = this.ep.episode;
    for (let i = 1; ep['Teleport ' + i]; i++) {
      const s = ep['Teleport ' + i];
      const tp = {
        active: 1, rx: atoi(s.worldx ?? -1), ry: atoi(s.worldy ?? -1), px: atoi(s.positionx ?? -1), py: atoi(s.positiony ?? -1),
        uin: atoi(s.uin ?? 0), dest: atoi(s.dest ?? 0), type: atoi(s['activation type'] ?? 0), disabled: atoi(s.disabled ?? 1),
      };
      if (tp.type === 3) tp.disabled = 1;
      this.teleports.push(tp);
    }
  }
  // sub_428850
  teleportAt(rx, ry, x, y) {
    for (const t of this.teleports) {
      if (t.active && t.rx === rx && t.ry === ry && x >= t.px && x < t.px + 64 && y >= t.py && y < t.py + 64) return t;
    }
    return null;
  }

  // sub_403440
  createCreature(room, x, y, type, dir) {
    if (!room || !G.cdefs[type]) return null;
    let c;
    if (type === 1 || type === 2) c = new Hero(type);
    else {
      const K = CREATURE_CLASSES[type];
      if (!K) return null;
      c = new K(type);
    }
    c.x = x; c.y = y; c.dir = dir; c.room = room;
    if (type === 1 || type === 2) { this.hero = c; return c; }
    if (!room.addMonster(c)) return null;
    return c;
  }

  // sub_426470
  switchRoom(rx, ry, x, y) {
    const R = this.roomAt(rx, ry);
    if (!R) { // no room there: keep the hero inside the current screen
      if (this.hero) {
        this.hero.x = Math.max(10, Math.min(790, this.hero.x));
        this.hero.y = Math.max(10, Math.min(543, this.hero.y));
      }
      return;
    }
    const activate = r => {
      const i = this.activeRooms.indexOf(r);
      if (i >= 0) this.activeRooms.splice(i, 1);
      r.buildGrid();
      this.activeRooms.unshift(r);
      if (this.activeRooms.length > 5) this.activeRooms.length = 5;
    };
    for (const n of [this.roomAt(rx, ry - 1), this.roomAt(rx, ry + 1), this.roomAt(rx - 1, ry), this.roomAt(rx + 1, ry)]) if (n) activate(n);
    activate(R);
    const old = this.hero ? this.hero.room : null;
    this.rx = rx; this.ry = ry; this.room = R;
    // sub_423530
    R.visited = 1;
    for (const s of R.sounds) s.next = (s.pmin && s.pmax) ? rnd() % (s.pmax - s.pmin) + s.pmin + G.time : G.time;
    this.setupRoomLights(R);
    this.fx.clear();
    if (this.hero) {
      this.hero.x = x; this.hero.y = y;
      if (old) {
        for (const m of old.monsters) {
          if (m && m.alive && m.followHero) {
            const c = this.createCreature(R, x, y, m.type, 0);
            if (c) { c.team = m.team; c.summoned = m.summoned; c.deathTime = m.deathTime; c.hp = m.hp; }
          }
        }
      }
      this.hero.room = R;
    }
    this.weapons.clear();
    this.redraw = true;
    this.events.push('room');
  }

  // sub_428190 : coronas / fire emitters and the static light grid for the current room
  setupRoomLights(R) {
    this.coronas = []; this.fires = [];
    const lights = R.lights.slice();
    for (const l of R.lights) {
      const t = l.type;
      if (t === 1 || t === 3 || t === 5) this.coronas.push({ x: l.x, y: l.y, bx: l.x, by: l.y, type: t, color: [l.cr, l.cg, l.cb] });
      if (t === 2 || t === 4 || t === 6) {
        const wh = t === 2 ? [32, 32] : t === 4 ? [16, 32] : [4, 16];
        this.fires.push({ x: l.x, y: l.y, w: wh[0], h: wh[1] });
        if (lights.length < 31) lights.push({ x: l.x, y: l.y, r: 64, cr: 255, cg: 255, cb: 255, type: 0 });
      }
    }
    this.lightGrid = computeLightGrid(R, lights, this.parentOption);
    for (const d of this.dyn) d.on = 0;
  }

  // sub_4275d0
  dynLight(x, y, radius, color, delay) {
    if (!(color & 0xffffff)) return;
    if (delay < 1) delay = 1;
    for (let i = 1; i < 64; i++) {
      const d = this.dyn[i];
      if (d.on) continue;
      d.r = (color >>> 16) & 255; d.g = (color >>> 8) & 255; d.b = color & 255;
      d.x = x; d.y = y; d.radius = radius; d.delay = delay; d.step = Math.trunc(radius / delay); d.on = 1;
      return;
    }
  }
  // decay (end of sub_427f00)
  decayDynLights() {
    for (let i = 1; i < 64; i++) {
      const d = this.dyn[i];
      if (!d.on) continue;
      d.radius -= d.step;
      if (--d.delay === 0) d.on = 0;
    }
  }

  addScore(n) { this.score += n; if (this.score < 0) this.score = 0; }
  sound(name, vol = 100, pan = 50) { playSound(name, vol, pan); }

  // sub_423930 (per active room)
  updateRoom(room) {
    const cur = room === this.room;
    const list = room.monsters;
    const n = list.length;
    for (let i = 0; i < n + (cur ? 1 : 0); i++) {
      const c = i === n ? this.hero : list[i];
      if (!c) continue;
      c.dt = G.time - c.now;
      c.now = G.time;
      c.update();
      if (c.type === -1 && i < n) list[i] = null;
    }
    this.items.updateRoom(room, cur);
  }

  // ------------------------------------------------------------------ sub_4072b0 (gameplay part)
  tick() {
    const h = this.hero;
    G.frame++;
    this.updateLifts();
    for (const r of this.activeRooms.slice()) this.updateRoom(r);
    this.items.updateKeys();
    this.items.pickup(h, this.room);
    this.weapons.update();
    this.fx.update(this.room);
    this.ambientSounds();
    // hero light
    const wet = this.room.cellWater(Math.max(0, Math.min(34, h.y >> 4)), Math.max(0, Math.min(49, h.x >> 4)));
    this.dynLight(h.x, h.y - 40, 100, wet ? 0xff0000c8 : 0xffffffff, 1);
    // death
    if (h.hp <= 0) {
      if (this.lives) {
        this.lives--;
        h.hp = h.maxhp; h.state = 2; h.alive = 1;
      } else if (!this.gameOver) {
        this.gameOver = 1;
        this.events.push('gameover');
      }
    }
    // teleports
    if (h.hp !== 0 && G.time - this.tpTime >= 5000) {
      const tp = this.teleportAt(this.rx, this.ry, h.x, h.y);
      if (tp) {
        const dest = this.teleports.find(t => t.active && t.uin === tp.dest);
        const go = () => { this.tpTime = G.time; this.sound('Level.Teleport', 100, 50); this.switchRoom(dest.rx, dest.ry, dest.px + 32, dest.py + 62); };
        switch (tp.type) {
          case 0: if (!tp.disabled && dest && input.down()) go(); break;
          case 1: if (!tp.disabled && dest) go(); break;
          case 2: if (input.down() && !tp.disabled) { this.tpTime = G.time; this.sound('Level.Teleport', 100, 50); this.events.push('shop'); } break;
          case 3: if (input.down() && dest && this.keys >= this.mainKeys) go(); break;
        }
      }
    }
    // belt items
    this.pinActive = 0; this.greed = 0; h.invuln = 0; this.ringOfFire = 0;
    let strong = 0;
    if (h.state !== 7) {
      h.immune = 0;
      for (let k = 0; k < 6; k++) {
        const s = h.slots[k];
        if (s.level && s.item) {
          s.count--;
          if (s.name === 'ItemBowl') {
            if (!(G.frame & 63) && h.hp < h.maxhp) {
              h.hp = f32(h.hp + 1);
              if (s.count-- === 1) s.clear();
            }
          } else if (s.name === 'ItemPin') this.pinActive = 1;
          else if (s.name === 'Ring3') h.immune = 1;
          else if (s.name === 'Ring2') this.greed = 1;
          else if (s.name === 'Ring1') h.invuln = 1;
          else if (s.name === 'Ring4') strong = 1;
          else if (s.name === 'Ring5') this.ringOfFire = 1;
        }
        if (!s.count) {
          if (k === h.slot && !s.item) h.slot = 0;
          s.clear();
        }
      }
    }
    if (strong) h.maxhp = 200;
    else { h.maxhp = 100; if (h.hp > h.maxhp) h.hp = h.maxhp; }
    // boss room finished
    if (h.state !== 7 && !this.room.nearest(0, 0, 1) && this.room.boss === 1) {
      this.room.boss = 0;
      this.bossTimer = 600;
    }
    if (this.bossTimer) {
      if (--this.bossTimer === 0) { this.completed = 1; this.events.push('completed'); }
    }
    // floating numbers are updated in the draw pass in the original (sub_428690)
    this.fx.updateNumbers();
    this.decayDynLights();
  }

  // sub_425190
  ambientSounds() {
    const t = G.time;
    for (const s of this.room.sounds) {
      if (t >= s.next) {
        this.sound(s.name, s.vol, Math.trunc(s.x * 100 / 800));
        const span = s.pmax - s.pmin;
        s.next = (span > 0 ? rnd() % span : 0) + s.pmin + t;
      }
    }
    for (const g of this.globalSounds) {
      if (t < g.next) continue;
      g.next = rnd() % (g.pmax + 1 - g.pmin) + g.pmin + t;
      if (!this.room.extra.includes(g.id)) this.sound(g.name, g.vol, Math.trunc(g.x * 100 / 800));
    }
  }

  // HUD heart animation (sub_405e50)
  stepHpShown() {
    const target = this.hero ? Math.max(0, Math.trunc(this.hero.hp)) : 0;
    if (this.hpShown > target) this.hpShown--;
    else if (this.hpShown < target) this.hpShown++;
  }

  // gate drawn closed until all keys are collected
  elementName(el) {
    if (this.gateOpen && el.lname === this.gateOpen.toLowerCase() && this.keys < this.mainKeys) return this.gateClosed;
    return el.name;
  }

  // cheats (sub_405bb0)
  cheat(n) {
    switch (n) {
      case 0: this.keys = this.mainKeys; this.redraw = true; break;
      case 1: this.score += 10000; break;
      case 2: this.bossTimer = 60; break;
      case 3: this.mapAll = 1; break;
      case 4: this.mapKeys = 1; break;
      case 5: this.mapTeleports = 1; break;
    }
  }
}

// sub_427e10 / sub_427b30 / sub_427420 : vertex light grid (51x36 vertices, 16 px apart)
export const LG_W = 51, LG_H = 36;
export function computeLightGrid(room, lights, parent) {
  const g = new Int32Array(LG_W * LG_H * 3);
  let [ar, ag, ab] = room.ambient;
  if (parent) { ar = Math.min(255, ar + 50); ag = Math.min(255, ag + 50); ab = Math.min(255, ab + 50); }
  for (let i = 0; i < LG_W * LG_H; i++) { g[i * 3] = ar; g[i * 3 + 1] = ag; g[i * 3 + 2] = ab; }
  for (const l of lights) addLight(g, l.x, l.y, l.r, l.cr, l.cg, l.cb, room);
  // 3x3 box blur on inner vertices
  const src = g.slice();
  for (let y = 1; y < LG_H - 1; y++) {
    for (let x = 1; x < LG_W - 1; x++) {
      for (let k = 0; k < 3; k++) {
        let s = 0;
        for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) s += src[((y + dy) * LG_W + x + dx) * 3 + k];
        g[(y * LG_W + x) * 3 + k] = Math.trunc(s / 9);
      }
    }
  }
  return g;
}

function occluded(room, x0, y0, x1, y1) {
  const dx = x1 - x0, dy = y1 - y0;
  const len = Math.trunc(Math.sqrt(dx * dx + dy * dy));
  if (len <= 0) return false;
  let ax = 0, ay = 0;
  for (let t = 0; t < len; t += 4) {
    const yy = Math.trunc(ay / len) + y0, xx = Math.trunc(ax / len) + x0;
    if (room.cellFlags(yy >> 4, xx >> 4) & 1) return true;
    ax += dx * 4; ay += dy * 4;
  }
  return false;
}

export function addLight(g, lx, ly, r, cr, cg, cb, room) {
  if (!(r > 0)) return;
  const c0 = Math.max(0, Math.trunc((lx - r) / 16) - 1), c1 = Math.min(LG_W, Math.trunc((lx + r) / 16) + 1);
  const r0 = Math.max(0, Math.trunc((ly - r) / 16) - 1), r1 = Math.min(LG_H, Math.trunc((ly + r) / 16) + 1);
  for (let j = r0; j < r1; j++) {
    const vy = j * 16;
    for (let k = c0; k < c1; k++) {
      const vx = k * 16;
      if (room && occluded(room, lx, ly, vx, vy)) continue;
      const d = Math.sqrt((ly - vy) ** 2 + (lx - vx) ** 2);
      const f = 1 - d / r;
      let a = Math.trunc(cr * f), b = Math.trunc(cg * f), c = Math.trunc(cb * f);
      if (a < 0) a = 0; if (b < 0) b = 0; if (c < 0) c = 0;
      const i = (j * LG_W + k) * 3;
      g[i] = Math.min(255, g[i] + a); g[i + 1] = Math.min(255, g[i + 1] + b); g[i + 2] = Math.min(255, g[i + 2] + c);
    }
  }
}

export { BELT };
