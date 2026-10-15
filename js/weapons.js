// Weapons and projectiles.
// Definitions: sub_42a420 (Weapon\<name><level>.ini). Firing: sub_42aff0 / sub_428e70.
// Projectiles: 100 slots, alloc sub_42b160, free sub_428dc0, update sub_42cb60, collision sub_42ab30, draw sub_428ca0.
import { ini, atoi, atof, tok } from './assets.js';
import { loadAnimDef, AnimPlayer } from './anim.js';
import { G, rnd } from './globals.js';
import { drawSpr } from './gfx.js';

const f32 = Math.fround;
const DEG = 0.01745329238474369;
const tr = Math.trunc;
const cosd = a => Math.cos(a * DEG);
const sind = a => Math.sin(a * DEG);

// weapon type table (index = type id, 0 unused)
export const WEAPON_TYPES = [
  '', 'bt_crescent', 'bt_fireball', 'bt_sabre', 'bt_club', 'bt_tooth', 'bt_arrow', 'bt_stardance', 'bt_astralrain',
  'bt_summon_bat', 'bt_charge', 'bt_lepr', 'bt_circular', 'bt_barrel', 'bt_roller', 'bt_roller2', 'bt_golem',
  'bt_explode', 'bt_gribarus', 'bt_helicopter1', 'bt_helicopter2', 'bt_summon_chopper', 'bt_storm', 'bt_storm1',
  'bt_storm2', 'bt_storm3', 'bt_hammer', 'bt_stone_rain', 'bt_stone', 'bt_knight_foot', 'bt_axe', 'bt_ghost',
  'bt_storm99', 'bt_ice',
];
const STORM_CHILD = ['bt_storm1', 'bt_storm2', 'bt_storm3']; // g_4a7000

function parseDef(type, name, tree) {
  const d = {
    name, type, reload: 0, unlimited: 0, strength: 0, range: 0, speed: 0.5, dcolor: 0, ddelay: 0, dradius: 0, flags: 0,
    movement: 'straight', mp1: 0, mp2: 0, effect: '', ep1: 0, ep2: 0, start: 'direct', sp1: 0, sp2: 0,
    hit: 'flash', hp1: 0, hp2: 0, sound: '',
  };
  const blk = tree.find(n => n[0] === 'WEAPON');
  if (!blk) return d;
  const toks = a => tok(a, ' ,\t');
  for (const [k, a] of blk[2]) {
    const t1 = tok(a, ' ,')[0];
    switch (k) {
      case 'NAME': d.name = a.trim() || d.name; break;
      case 'STRENGTH': d.strength = atoi(t1); break;
      case 'SOLID': d.flags = (d.flags & ~1) | (atoi(t1) & 1); break;
      case 'INVISIBLE': d.flags = (d.flags & ~2) | ((atoi(t1) << 1) & 2); break;
      case 'IGNORE_OBSTACLES': d.flags = (d.flags & ~4) | ((atoi(t1) << 2) & 4); break;
      case 'SHOW_HIDDEN_ITEMS': d.flags = (d.flags & ~8) | ((atoi(t1) << 3) & 8); break;
      case 'RANGE': d.range = f32(atoi(t1)); break;
      case 'SPEED': { let s = f32(atof(t1)); if (s === 0) s = 1; d.speed = f32(s * 0.5); break; }
      case 'RELOADTIME': d.reload = atoi(t1); break;
      case 'UNLIMITED': d.unlimited = 1; break;
      case 'DYNAMIC_COLOR': {
        const t = toks(a);
        d.dcolor = ((0xff000000 | ((atoi(t[0]) & 255) << 16) | ((atoi(t[1]) & 255) << 8) | (atoi(t[2]) & 255)) >>> 0);
        break;
      }
      case 'DYNAMIC_RADIUS': d.dradius = atoi(t1); break;
      case 'DYNAMIC_DELAY': d.ddelay = atoi(t1); break;
      case 'MOVEMENT': { const t = toks(a); if (t[0]) { d.movement = t[0].toLowerCase(); if (t[1] !== undefined) d.mp1 = atoi(t[1]); if (t[2] !== undefined) d.mp2 = atoi(t[2]); } break; }
      case 'MOVE_EFFECT': { const t = toks(a); if (t[0]) { d.effect = t[0].toLowerCase(); if (t[1] !== undefined) d.ep1 = atoi(t[1]); if (t[2] !== undefined) d.ep2 = atoi(t[2]); } break; }
      case 'MOVE_START': { const t = toks(a); if (t[0]) { d.start = t[0].toLowerCase(); if (t[1] !== undefined) d.sp1 = atoi(t[1]); if (t[2] !== undefined) d.sp2 = atoi(t[2]); } break; }
      case 'HIT_EFFECT': { const t = toks(a); if (t[0]) { d.hit = t[0].toLowerCase(); if (t[1] !== undefined) d.hp1 = atoi(t[1]); if (t[2] !== undefined) d.hp2 = atoi(t[2]); } break; }
      case 'SOUND': d.sound = a.trim(); break;
    }
  }
  return d;
}

export class Weapons {
  constructor(world) {
    this.world = world;
    this.byName = new Map();   // lower name -> [lvl0, lvl1, lvl2]
    this.anims = [];           // per type
    this.proj = new Array(100).fill(null);
    this.stormGroup = 0;       // g_10d5558
    this.storm99Group = 0;     // g_10d555c
    this.rotate = 0;           // g_14b1df8
    this.last = null;          // g_10d54c8
    this.iceCols = new Array(20).fill(null);
    for (let t = 1; t < WEAPON_TYPES.length; t++) {
      const name = WEAPON_TYPES[t];
      const anim = loadAnimDef('Weapon\\Images\\' + name + '.anm', 'Weapon\\Images\\');
      this.anims[t] = anim;
      const lv = [];
      for (let l = 0; l < 3; l++) {
        const tree = ini('Weapon\\' + name + l + '.ini');
        if (tree) lv[l] = parseDef(t, name, tree);
        else lv[l] = lv[0] ? { ...lv[0] } : null;
        if (lv[l]) lv[l].anim = anim;
      }
      if (lv[0]) this.byName.set(name, lv);
    }
  }

  // sub_428e10
  def(name, level) {
    const lv = this.byName.get(String(name).toLowerCase());
    if (!lv) return null;
    return lv[level] || lv[0] || null;
  }
  icon(name) { return 'weapon/icons/' + String(name).toLowerCase() + '.bmp'; }

  // sub_428f90
  range(slot) {
    const d = this.def(slot.name, slot.level - 1);
    return d ? tr(d.range) : 0;
  }

  // sub_4285a0
  angleTo(dx, dy) {
    let x = f32(dx), y = f32(dy);
    const l = Math.sqrt(x * x + y * y);
    if (l !== 0) { x = f32(x / l); y = f32(y / l); }
    let a = Math.acos(Math.max(-1, Math.min(1, x))) * 57.2957763671875;
    if (dy < 0) a = 360 - a;
    return tr(a);
  }

  // sound of a weapon (sub_429020)
  playSound(name, level, x) {
    const d = this.def(name, level);
    if (d && d.sound) this.world.sound(d.sound, 100, tr(x * 100 / 800));
  }

  // sub_42aff0 : creature fires the weapon in `slot`
  fire(c, angle, slot) {
    const now = G.time;
    if (!slot || !slot.name) return null;
    if (!(slot.count > 0)) return null;
    const d = this.def(slot.name, slot.level - 1);
    if (!d) return null;
    if (!(now >= slot.next)) return null;
    slot.next = d.reload + now;
    const delay = d.reload;
    const x = c.offX * (c.dir !== 0 ? 1 : -1) + c.x;
    const y = c.offY + c.y;
    const fn = START[d.start];
    if (!fn) return { delay };
    fn.call(this, slot.name, slot.level - 1, x, y, angle, c.team, d, c);
    this.playSound(slot.name, slot.level - 1, x);
    if (!d.unlimited) slot.count--;
    return { delay };
  }

  // sub_428e70 : fire without an owner (items, bosses)
  fireNamed(name, level, x, y, angle, team) {
    const d = this.def(name, level);
    if (!d) return;
    const fn = START[d.start];
    if (fn) fn.call(this, name, level, x, y, angle, team, d, null);
  }

  // sub_42b160
  alloc(name, level, x, y, angle, team, sound) {
    let idx = this.proj.indexOf(null);
    if (idx < 0) return null;
    const d = this.def(name, level);
    if (!d) return null;
    if (sound) this.playSound(name, level, x);
    angle = angle % 360; if (angle < 0) angle += 360;
    const p = {
      d, type: d.type, strength: d.strength, range: d.range, speed: d.speed, dcolor: d.dcolor, ddelay: d.ddelay,
      dradius: d.dradius, flags: d.flags, movement: d.movement, mp1: d.mp1, mp2: d.mp2, effect: d.effect,
      ep1: d.ep1, ep2: d.ep2, start: d.start, sp1: d.sp1, sp2: d.sp2, hit: d.hit, hp1: d.hp1, hp2: d.hp2,
      team, x: f32(tr(x)), y: f32(y), angle: f32(angle), f0: 0, f4: 0, f8: 0, anim: new AnimPlayer(),
      steps: 0, maxSteps: 0, lastHit: -1, vx: 0, vy: 0, owner: null, f128: 0, f12c: 0, f130: 0, dir: 0,
    };
    p.anim.anim = 0; p.anim.t0 = 0;
    p.maxSteps = tr(p.range / f32(p.speed + p.speed));
    this.proj[idx] = p;
    return p;
  }

  // sub_428dc0 : destroy (runs the hit effect)
  free(p) {
    const i = this.proj.indexOf(p);
    if (i < 0) return;
    const fn = HIT[p.hit];
    if (fn) fn.call(this, p);
    this.proj[i] = null;
  }

  clear() { this.proj.fill(null); }

  // projectile half sizes
  half(p) { const a = p.d.anim; return [a.bw >>> 1, a.bh >>> 1]; }

  // ---------------------------------------------------------------- per frame (sub_42cb60)
  update() {
    const w = this.world;
    const room = w.room;
    for (let pass = 0; pass < 2; pass++) {
      this.collide();
      for (let i = 0; i < 100; i++) {
        const p = this.proj[i];
        if (!p) continue;
        const a = p.d.anim;
        if (!(p.flags & 2)) {
          const n = a.anims.length - 1;
          if (n > 0) {
            const idx = tr(n * ((tr(tr(360 / n) / 2) + tr(p.angle)) % 360) / 360);
            p.anim.set(a, 'GO' + idx, G.time);
          }
          p.anim.dir = 0;
        }
        if (p.range !== f32(p.speed + p.speed)) {
          const mv = MOVE[p.movement];
          if (mv) mv.call(this, p);
          if (this.proj[i] !== p) continue;
        }
        if (p.flags & 8) room.revealHidden(tr(p.x), tr(p.y), Math.max(a.bw, a.bh));
        if (!room.blockHit(p.x, p.y, a.bw, a.bh)) {
          if (!(p.flags & 4)) this.free(p);
          continue;
        }
        if (!(p.flags & 4)) {
          const cx = tr(p.x), cy = tr(p.y);
          if (cx >= 0 && cx < 800 && cy >= 0 && cy < 544 && (room.cellFlags(cy >> 4, cx >> 4) & 1)) { this.free(p); continue; }
        }
        if (pass === 1) {
          let x0 = 0, y0 = 0, x1 = 800, y1 = 600;
          if (p.flags & 4) { x0 = -800; y0 = -600; x1 = 1600; y1 = 1200; }
          if (x0 > p.x || x1 <= p.x || y0 > p.y || y1 <= p.y) this.free(p);
        } else {
          if (p.steps) {
            let dec = tr(p.speed); if (!dec) dec = 1;
            p.range = f32(p.range - dec);
            if (p.steps >= p.maxSteps) { this.free(p); continue; }
          }
          p.steps++;
          const fx = EFFECT[p.effect];
          if (fx) fx.call(this, p);
          if (p.dradius) w.dynLight(tr(p.x), tr(p.y), p.dradius, p.dcolor, p.ddelay);
        }
      }
    }
  }

  // sub_42ab30
  collide() {
    const w = this.world, room = w.room, hero = w.hero;
    if (!room) return;
    for (let i = 0; i < 100; i++) {
      const p = this.proj[i];
      if (!p) continue;
      if (p.steps < 2 && !(p.flags & 2)) continue;
      const [hw, hh] = this.half(p);
      const px = tr(p.x), py = tr(p.y);
      const X0 = px - hw, X1 = hw + px, Y0 = py - hh, Y1 = hh + py;
      const cx = [X0, X1, X0, X1], cy = [Y0, Y0, Y1, Y1];
      if (p.team) {
        if (hero && hero.alive && hero.room === room) {
          const ha = hero.def.anim;
          const bw = tr((ha.bw >>> 1) * 80 / 100), bh2 = ha.bh >>> 1, bh = tr(bh2 * 80 / 100);
          const hcy = hero.y - bh2;
          let hit = false;
          for (let k = 0; k < 4; k++) {
            if (cx[k] >= hero.x - bw && cx[k] < bw + hero.x && cy[k] >= hcy - bh && cy[k] < bh + hcy) { hit = true; break; }
          }
          if (hit) {
            hero.damage(p.strength);
            if (p.hit === 'slow' && !hero.slow) { hero.slow = 1; hero.slowEnd = hero.now + 1000; }
            if (!(p.flags & 1)) { this.free(p); continue; }
          }
        }
        // allies of the hero (summoned team-0 creatures)
        let gone = false;
        for (const m of room.monsters) {
          if (!m || !m.alive || m.team) continue;
          if (this.overlap(m, cx, cy, X0, X1, Y0, Y1) && p.lastHit !== G.frame) {
            p.lastHit = G.frame;
            m.damage(p.strength);
            if (!(p.flags & 1)) { this.free(p); gone = true; break; }
          }
        }
        if (gone) continue;
      } else {
        for (const m of room.monsters) {
          if (!m || !m.alive || !m.team) continue;
          if (this.overlap(m, cx, cy, X0, X1, Y0, Y1) && p.lastHit !== G.frame) {
            p.lastHit = G.frame;
            m.damage(p.strength);
            if (!(p.flags & 1)) { this.free(p); break; }
          }
        }
      }
    }
  }

  overlap(m, cx, cy, X0, X1, Y0, Y1) {
    const a = m.def.anim;
    const hw = tr((a.bw >>> 1) * 80 / 100), bh2 = a.bh >>> 1, hh = tr(bh2 * 80 / 100);
    const my = m.y - bh2;
    const mx0 = m.x - hw, mx1 = hw + m.x, my0 = my - hh, my1 = my + hh;
    for (let k = 0; k < 4; k++) if (cx[k] >= mx0 && cx[k] < mx1 && cy[k] >= my0 && cy[k] < my1) return true;
    const inY = v => v >= Y0 && v < Y1;
    if (mx0 >= X0 && mx0 < X1 && (inY(my0) || inY(my1))) return true;
    if (mx1 >= X0 && mx1 < X1 && (inY(my0) || inY(my1))) return true;
    return false;
  }

  // sub_428ca0
  draw(ctx) {
    for (const p of this.proj) {
      if (!p || (p.flags & 2)) continue;
      const a = p.d.anim;
      const fi = p.anim.frameInfo(a, 0);
      if (!fi) continue;
      drawSpr(ctx, fi.key, tr(p.x - (a.bw >>> 1)), tr(p.y - (a.bh >>> 1)), fi.flip);
    }
  }

  // ---------------------------------------------------------------- helpers for ground-bound projectiles
  // sub_42b220 : ground under projectile
  ground(p) {
    const room = this.world.room;
    const [hw, hh] = this.half(p);
    let c0 = tr((p.x - hw) * 0.0625), c1 = tr((hw + p.x) * 0.0625);
    let r = tr((hh + p.y + 1) * 0.0625);
    if (c0 < 0) c0 = 0; if (c1 >= 49) c1 = 49;
    if (r < 0) r = 0; if (r >= 34) r = 34;
    for (let c = c0; c <= c1; c++) if (room.cellFlags(r, c) & 1) return 1;
    return 0;
  }
  // sub_42b420 : wall ahead
  wall(p) {
    const room = this.world.room;
    const [hw, hh] = this.half(p);
    let col;
    if (p.dir === 0) col = tr((p.x - hw) * 0.0625 - 1);
    else if (p.dir === 1) col = tr((hw + p.x) * 0.0625 + 1);
    else return 0;
    let r0 = tr((p.y - hh) * 0.0625), r1 = tr((hh + p.y) * 0.0625 - 1);
    if (col >= 49) col = 49; if (col < 0) col = 0;
    if (r0 < 0) r0 = 0; if (r1 >= 34) r1 = 34;
    for (let r = r0; r <= r1; r++) if (room.cellFlags(r, col) & 1) return 1;
    return 0;
  }
  // sub_42b310 : snap up out of the ground
  snap(p) {
    const room = this.world.room;
    const [hw, hh] = this.half(p);
    let c0 = tr((p.x - hw) * 0.0625), c1 = tr((hw + p.x) * 0.0625);
    if (c0 < 0) c0 = 0; if (c1 >= 49) c1 = 49;
    let yy = tr(hh + p.y);
    while (yy >= 0) {
      const r = yy >> 4;
      let solid = false;
      for (let c = c0; c <= c1; c++) if (room.cellFlags(r, c) & 1) { solid = true; break; }
      if (!solid) { p.y = f32(yy - hh); return; }
      yy--;
    }
    p.y = -1;
  }
  // sub_428fc0 : reverse
  reverse(p) {
    p.angle = tr(p.angle) !== 180 ? 180 : 0;
    if (p.dir === 0) p.dir = 1; else if (p.dir === 1) p.dir = 0;
  }
  straight(p) {
    p.x = f32(cosd(p.angle) * p.speed + p.x);
    p.y = f32(sind(p.angle) * p.speed + p.y);
  }
  // turn angle by `step` toward point (tx,ty) (cross product sign)
  steer(p, tx, ty, step) {
    const dx = tx - p.x, dy = ty - p.y;
    const c = cosd(p.angle), s = sind(p.angle);
    if (c * dy - s * dx > 0) p.angle = f32(p.angle + step); else p.angle = f32(p.angle - step);
    if (p.angle < 0) p.angle = f32(p.angle + 360);
    p.angle = tr(p.angle) % 360;
  }
}

// ------------------------------------------------------------------ MOVEMENT handlers
const MOVE = {
  // sub_429070
  straight(p) { this.straight(p); },
  // sub_4290b0
  seek(p) {
    const room = this.world.room;
    const t = room.nearest(tr(p.x), tr(p.y), p.team === 0 ? 1 : 0);
    if (t) {
      const step = p.mp1 ? (p.mp1 >>> 0) : 10;
      this.steer(p, t.x, t.y - (t.def.anim.bh >>> 1), step);
    }
    this.straight(p);
  },
  // sub_429230
  ballistic(p) {
    const left = p.angle >= 90 && p.angle < 270;
    if (!p.steps) {
      const k = (rnd() % 5) + 5;
      if (left) { p.angle = f32(p.angle + k); if (p.angle >= 360) p.angle = f32(p.angle - 360); }
      else { p.angle = f32(p.angle - k); if (p.angle < 0) p.angle = f32(p.angle + 360); }
    }
    if (!left) {
      p.angle = f32(p.mp1 + p.angle);
      if (p.angle >= 360) p.angle = f32(p.angle - 360);
      if (p.angle > 85 && p.angle < 180) p.angle = 85;
    } else {
      p.angle = f32(p.angle - p.mp1);
      if (p.angle < 95) p.angle = 95;
    }
    this.straight(p);
  },
  // sub_428bc0
  ballistic_sl(p) {
    p.x = f32(p.vx * 0.5 + p.x);
    p.y = f32(p.vy * 0.5 + p.y);
    p.vy = f32((p.mp1 >>> 0) * 0.5 + p.vy);
  },
  // sub_4293a0
  around(p) {
    const h = this.world.hero;
    p.angle = f32(p.mp1 + p.angle);
    let r = (p.steps + 10) * 5;
    if (r > 150) r = 150;
    if (!h) return;
    p.x = f32(cosd(p.angle) * r + h.x);
    p.y = f32((h.y - 20) - sind(p.angle) * r);
  },
  // sub_42b5a0
  ball(p) {
    if (this.ground(p) && !this.wall(p)) {
      if (p.angle >= 0 && p.angle < 90) p.angle = f32(360 - p.angle * 0.6666666865348816);
      if (p.angle >= 90 && p.angle < 180) p.angle = f32((180 - p.angle) * 0.6666666865348816 + 180);
    }
    MOVE.ballistic.call(this, p);
  },
  // sub_42b650
  roller(p) {
    switch (p.f130) {
      case 1: {
        const v = p.mp1 ? (p.mp1 >>> 0) : p.speed;
        p.y = f32(tr(v) + p.y);
        if (this.ground(p)) { p.f130 = p.f128 ? 3 : 0; this.snap(p); }
        return;
      }
      case 2:
        MOVE.ballistic.call(this, p);
        if (this.ground(p)) { p.f130 = 0; p.angle = 0; }
        return;
      case 3:
        if (this.wall(p)) this.reverse(p);
      // falls through
      case 0:
        if (!this.ground(p)) { p.f130 = 1; return; }
        if (p.dir === 1) p.x = f32(p.speed + p.x);
        else if (p.dir === 0) p.x = f32(p.x - p.speed);
        if (!this.wall(p)) this.snap(p);
        return;
    }
  },
  // sub_42b760
  gribarus(p) {
    if (p.f128 === 100) {
      MOVE._orbit.call(this, p, p.mp1 >>> 0);
    } else if (p.f128 === 101) {
      MOVE.ball.call(this, p);
    } else if (p.f128 === 103) {
      MOVE.seek.call(this, p);
    }
  },
  // shared orbit used by storm children and gribarus (angle += w; circle in f4, squashed toward f8)
  _orbit(p, w) {
    let a = f32(w + p.angle);
    if (a < 0) a = f32(a + 360);
    if (a >= 360) a = f32(a - 360);
    p.angle = a;
    p.x = f32(cosd(a) * p.speed + p.x);
    const ny = f32(sind(a) * p.speed + p.f4);
    p.f4 = ny;
    p.y = f32(p.f8 - (p.f8 - ny) * 0.5);
  },
  // sub_429430
  storm(p) { MOVE._storm.call(this, p, this.stormGroup, true); },
  // sub_429900
  storm99(p) { MOVE._storm.call(this, p, this.storm99Group, !!this.world.hero); },
  _storm(p, group, doSeek) {
    if (p.f12c === 0) {
      const ox = p.x, oy = p.y;
      if (doSeek) {
        if (p.movement === 'storm') {
          if (this.world.room.nearest(tr(p.x), tr(p.y), p.team === 0 ? 1 : 0)) MOVE.seek.call(this, p);
        } else MOVE.seek.call(this, p);
      }
      const dx = p.x - ox, dy = p.y - oy;
      for (const q of this.proj) {
        if (!q || q === p || q.f128 !== group || q.f12c !== 1) continue;
        q.x = f32(dx + q.x);
        q.f4 = f32(dy + q.f4);
        q.f8 = f32(dy + q.f8);
      }
    } else if (p.f12c === 1) {
      MOVE._orbit.call(this, p, p.f0);
    }
  },
  // sub_42b850
  hammer(p) {
    const o = p.owner;
    if (o) o.slots[p.f12c].next = o.now + 100;
    if (p.f128 === 0) {
      this.straight(p);
      if (p.x > 0 && p.x < 800 && !this.wall(p)) return;
      p.f128 = 1;
    } else if (p.f128 === 1) {
      if (o) this.steer(p, o.x, o.y - (o.def.anim.bh >>> 1), 10);
      this.straight(p);
      if (o) {
        const hw = tr(o.width / 2);
        if (o.x - hw <= p.x && o.x + hw > p.x && o.y - o.height <= p.y && o.y > p.y) this.free(p);
      }
    }
  },
  // sub_42bab0
  stone_rain(p) {
    switch (p.f12c + 1) {
      case 0:
        this.straight(p); this.straight(p);
        if (this.ground(p)) return;
        if (this.wall(p)) return;
        p.f12c = 0;
        p.flags &= ~6;
        return;
      case 1: {
        this.straight(p);
        if (!this.ground(p) && !this.wall(p)) return;
        const k = (rnd() & 3) + 1;
        p.f12c = k;
        if (k === 2) p.hit = 'explode';
        else if (k === 3) { p.f130 = 0; p.f128 = 0; this.snap(p); }
        else if (k === 4) p.mp1 = 1;
        return;
      }
      case 2: case 3: this.straight(p); return;
      case 4: MOVE.roller.call(this, p); return;
      case 5: MOVE.ball.call(this, p); return;
    }
  },
  // sub_429da0
  ice(p) {
    if (p.f128 !== 1) { this.straight(p); return; }
    p.y = f32(p.y + 0.25);
    if (p.y <= 10) return;
    p.flags &= ~5;
    p.f128 = 0;
    p.maxSteps = p.f12c + p.steps;
    p.strength = 30;
  },
};

// ------------------------------------------------------------------ MOVE_EFFECT handlers
function sparks(p, type) {
  const vx = f32(cosd(p.angle) * p.speed), vy = f32(sind(p.angle) * p.speed);
  for (let n = p.ep1; n > 0; n--) {
    const ox = (rnd() % 16) - 8;
    const x = tr(ox + p.x);
    const oy = (rnd() % 16) - 8;
    const q = this.world.fx.add(x, tr(oy + p.y), type, 3);
    if (q) { q.vx = f32(vx * 0.125); q.vy = f32(vy * 0.125); }
  }
}
const EFFECT = {
  red_particles(p) { sparks.call(this, p, 4); },
  blue_particles(p) { if (p.steps & 1) return; sparks.call(this, p, 5); },
  green_particles(p) { if (p.steps & 1) return; sparks.call(this, p, 6); },
  // sub_42a090: the y spread is read from the MOVE_START name (a bug in the original), so with a
  // non-empty start name the sparks end up far off screen. Reproduce: only spawn when that field is empty.
  white_particles(p) {
    if (p.steps & 3) return;
    if (p.start) return;
    const vx = f32(cosd(p.angle) * p.speed), vy = f32(sind(p.angle) * p.speed);
    const rx = p.ep2 || 16, ry = 16;
    for (let n = p.ep1; n > 0; n--) {
      const ox = rnd() % (rx * 2) - rx;
      const oy = rnd() % (ry * 2) - ry;
      this.world.fx.explosion(tr(ox + p.x), tr(oy + p.y), 253, 0);
    }
    void vx; void vy;
  },
};

// ------------------------------------------------------------------ HIT_EFFECT handlers
const HIT = {
  // sub_428c20
  flash(p) { this.world.dynLight(tr(p.x), tr(p.y), p.dradius * 2, p.dcolor, 25); },
  // sub_42c860
  explode(p) {
    const w = this.world;
    this.alloc('bt_explode', 0, tr(p.x), tr(p.y), 0, p.team, 1);
    w.fx.clearFirst(170);
    for (let n = 170; n > 0; n--) {
      const q = w.fx.add(tr(p.x), tr(p.y), 4, 3);
      if (q) {
        const a = f32((rnd() % 360) * DEG);
        const v = ((rnd() % 700) + 100) * 0.004999999888241291;
        q.vx = f32(Math.cos(a) * v); q.vy = f32(Math.sin(a) * v);
      }
    }
  },
  // sub_42a310
  draingold(p) {
    const w = this.world;
    const t = w.room.nearest(tr(p.x), tr(p.y), p.team === 0 ? 1 : 0);
    if (!t || (t.type !== 1 && t.type !== 2)) return;
    const dx = t.x - p.x, dy = (t.y - tr(t.height / 2)) - p.y;
    if (!(Math.sqrt(dx * dx + dy * dy) < 50)) return;
    const n = p.hp1 > 1 ? (rnd() % (p.hp1 - 1)) + 1 : 1;
    if (w.score > 0) w.fx.floatNumber(tr(p.x), tr(p.y), -n);
    w.score -= n;
    if (w.score < 0) w.score = 0;
  },
};

// ------------------------------------------------------------------ MOVE_START handlers
// signature: (name, level, x, y, angle, team, def, owner)
const facing = a => (a >= 90 && a <= 270 ? 0 : 1);
const START = {
  // sub_42bbc0
  direct(name, level, x, y, angle, team, d, owner) {
    const p = this.alloc(name, level, x, y, angle, team, 0);
    if (p) { p.dir = facing(angle); p.owner = owner; p.f128 = 0; p.f12c = 0; }
    this.last = p;
  },
  // sub_42bc30
  multi(name, level, x, y, angle, team, d, owner) {
    const n = d.sp1, step = d.sp2;
    let a = angle - ((step * (n - 1)) >> 1);
    for (let i = n; i > 0; i--) {
      const p = this.alloc(name, level, x, y, a, team, 0);
      if (p) p.owner = owner;
      this.last = p;
      a += step;
    }
  },
  // sub_42bcb0
  multirotate(name, level, x, y, angle, team, d, owner) {
    const n = d.sp1, step = d.sp2;
    this.rotate += 10;
    let a = this.rotate - ((step * (n - 1)) >> 1) + angle;
    for (let i = n; i > 0; i--) {
      const p = this.alloc(name, level, x, y, a, team, 0);
      if (p) p.owner = owner;
      this.last = p;
      a += step;
    }
  },
  // sub_42bd40
  multinew(name, level, x, y, angle, team, d, owner) {
    for (const q of this.proj) if (q && q.type === d.type) this.free(q);
    START.multi.call(this, name, level, x, y, angle, team, d, owner);
  },
  // sub_42bdb0
  rain(name, level, x, y, angle, team, d, owner) {
    for (let i = d.sp1; i > 0; i--) {
      const px = (rnd() % 1200) - 200;
      const p = this.alloc(name, level, px, -10, angle, team, 0);
      if (p) { p.dir = facing(angle); p.owner = owner; p.f128 = 0; p.f12c = 0; }
      this.last = p;
    }
  },
  // sub_42a180
  summon(name, level, x, y, angle, team, d, owner) {
    const w = this.world;
    const c = w.createCreature(w.room, tr(x), tr(y), d.sp1, 0);
    if (!c) return;
    c.summoned = 1;
    c.team = team;
    const t = w.room.nearest(tr(x), tr(y), team === 0 ? 1 : 0);
    if (d.sp1 === 6) {
      c.ox = tr(x); c.oy = tr(y);
      this.playSound(name, level, x);
      c.agitated = -1;
      c.deathTime = G.time + (rnd() % 10000) + 5000;
      c.speed = c.altSpeed;
      if (t) {
        c.tx = t.x; if (c.tx === tr(x)) c.tx++;
        c.ty = t.y; if (c.ty === tr(y)) c.ty++;
      } else {
        do { c.tx = (rnd() % 700) + 50; } while (c.tx === tr(x));
        do { c.ty = (rnd() % 444) + 50; } while (c.ty === tr(y));
      }
      w.sound('Creatures.Bat', 100, tr(c.x * 100 / 800));
    } else if (d.sp1 === 20) {
      c.deathTime = G.time + (rnd() % 10000) + 25000;
      c.speed = c.baseSpeed;
      c.ox = 0; c.oy = 0;
    }
    if (c.gravity) c.dir = c.tx >= c.x ? 1 : 0;
  },
  // sub_42bfa0
  ballistic(name, level, x, y, angle, team, d, owner) {
    const v = d.sp1 ? d.sp1 : rnd() % 10;
    const a = (angle >= 90 && angle < 270) ? v + 180 : 360 - v;
    const p = this.alloc(name, level, x, y, a, team, 0);
    if (p) { p.owner = owner; p.f130 = 2; p.dir = facing(angle); }
    this.last = p;
  },
  // sub_42be60
  ballistic_sl(name, level, x, y, angle, team, d, owner) {
    const t = this.world.room.nearest(tr(x), tr(y), team === 0 ? 1 : 0);
    if (!t) return;
    const p = this.alloc(name, level, x, y, angle, team, 0);
    if (p) {
      p.owner = owner;
      p.vx = f32(d.sp2 >>> 0);
      const t1 = Math.abs(tr(x) - t.x) / p.vx;
      const n2 = t1 + t1;
      let sum = 0;
      if (1 < n2) {
        const p1 = d.sp1 >>> 0;
        for (let i = 1; i < n2; i++) sum += p1 * i * 0.25;
      }
      p.vy = f32(((t.y - tr(y)) - sum) / t1);
      if (t.x < tr(x)) p.vx = f32(-p.vx);
    }
    this.last = p;
  },
  // sub_42c050
  roller(name, level, x, y, angle, team, d, owner) {
    const p = this.alloc(name, level, x, y, angle, team, 0);
    if (p) { p.dir = facing(angle); p.f130 = 0; p.f128 = 0; this.snap(p); p.owner = owner; }
    this.last = p;
  },
  // sub_42c0d0
  golem(name, level, x, y, angle, team, d, owner) {
    const p = this.alloc(name, level, x, y, angle, team, 0);
    if (p) { p.f130 = 3; p.dir = facing(angle); p.f128 = 1; p.owner = owner; this.snap(p); }
    this.last = p;
  },
  // sub_42c150
  gribarus(name, level, x, y, angle, team, d, owner) {
    const p = this.alloc(name, level, x, y, angle, team, 0);
    if (p) { p.f128 = 100; p.angle = f32(d.sp1 >>> 0); p.owner = owner; p.f8 = p.f4 = f32(tr(y)); }
    this.last = p;
  },
  // sub_42c1d0
  helicopter(name, level, x, y, angle, team, d, owner) {
    const v3 = rnd() % (d.sp2 * 2) + d.sp1;
    let a = v3 - d.sp2;
    if (v3 === d.sp2) a = rnd() % 10;
    if (angle >= 90 && angle < 270) a = 180 - a;
    const p = this.alloc(name, level, x, y, a, team, 0);
    if (p) p.owner = owner;
    this.last = p;
  },
  // sub_42c260
  storm(name, level, x, y, angle, team, d, owner) {
    for (const q of this.proj) if (q && q.f128 === this.stormGroup) this.free(q);
    this.stormGroup++;
    const lead = this.alloc(name, level, x, y, 0, team, 0);
    if (lead) { lead.flags |= 7; lead.f128 = this.stormGroup; lead.f12c = 0; lead.owner = owner; }
    let c = null;
    for (let k = 0, i = 0; k < 4500; k += 150, i++) {
      c = this.alloc(STORM_CHILD[rnd() % 3], level, x, y, 0, team, 0);
      if (!c) continue;
      const off = tr(k / 30);
      c.f8 = c.f4 = f32(c.y - off);
      c.f0 = f32(14 - off * 0.006666666828095913 * 6);
      c.speed = f32(i * 0.03333333507180214 * 5 + 6);
      c.f128 = this.stormGroup;
      c.f12c = 1;
      c.owner = owner;
      c.movement = 'storm';
      if (rnd() % 300 > 0) {
        let j = 0;
        do { MOVE.storm.call(this, c); j++; } while (j < rnd() % 300);
      }
    }
    this.last = c;
  },
  // sub_42c410
  storm99(name, level, x, y, angle, team, d, owner) {
    for (const q of this.proj) if (q && q.f128 === this.storm99Group) this.free(q);
    this.storm99Group++;
    const lead = this.alloc(name, level, x, y, 0, team, 0);
    if (lead) { lead.flags |= 7; lead.f128 = this.storm99Group; lead.f12c = 0; lead.owner = owner; }
    let c = null;
    for (let k = 0, i = 0; k < 4500; k += 150, i++) {
      c = this.alloc(name, level, x, y, 0, team, 0);
      if (!c) continue;
      const off = tr(k / 30);
      c.f8 = c.f4 = f32(c.y - off);
      c.f0 = f32(14 - off * 0.006666666828095913 * 6);
      c.speed = f32(i * 0.03333333507180214 * 5 + 6);
      c.f128 = this.storm99Group;
      c.f12c = 1;
      c.owner = owner;
      c.flags |= 5;
      if (rnd() % 300 > 0) {
        let j = 0;
        do { MOVE.storm99.call(this, c); j++; } while (j < rnd() % 300);
      }
    }
    this.last = c;
    if (owner) owner.nextSlot();
  },
  // sub_42c5d0
  hammer(name, level, x, y, angle, team, d, owner) {
    const p = this.alloc(name, level, x, y, angle, team, 0);
    if (p) { p.dir = facing(angle); p.owner = owner; p.f128 = 0; p.f12c = owner ? owner.slot : 0; }
    this.last = p;
  },
  // sub_42c640
  stone_rain(name, level, x, y, angle, team, d, owner) {
    const n = d.sp1;
    const a = !angle ? 90 - d.sp2 : d.sp2 + 90;
    if (!n) return;
    for (let k = 1; k <= n; k++) {
      const p = this.alloc(name, level, tr(800 * k / n), -(rnd() % 100), a, team, 0);
      if (p) {
        p.dir = facing(a); p.owner = owner; p.f128 = 0;
        p.f12c = -1; p.flags |= 6;
      }
      this.last = p;
    }
  },
  // sub_42c720
  ice(name, level, x, y, angle, team, d, owner) {
    const cols = this.iceCols; cols.fill(null);
    for (const q of this.proj) if (q && q.type === 33) { const c = tr(q.x / 40); if (c >= 0 && c < 20) cols[c] = q; }
    for (let i = 0; i < 19; i++) {
      if (cols[i]) continue;
      const r = rnd() % 100;
      if (!(r < tr(d.sp1 * i * 2 / 20))) continue;
      const p = this.alloc(name, level, x, y, angle, team, 0);
      if (!p) continue;
      p.f12c = p.maxSteps;
      p.y = -50; p.angle = 90; p.x = f32(i * 40 + 20);
      p.f128 = 1; p.maxSteps = 1000000; p.flags |= 5; p.strength = 0;
      this.last = p;
    }
  },
};
