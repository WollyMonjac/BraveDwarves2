// Creature base class: physics, collision and the generic monster AI.
// Ported from BraveDwarves2.exe (sub_401f30 .. sub_404380, sub_41a030, sub_41a0b0).
import { AnimPlayer } from './anim.js';
import { G, rnd } from './globals.js';

const SW = 800, SH = 544;
export const tdiv = (a, b) => Math.trunc(a / b);
export const c16 = v => Math.trunc(v / 16);
const f32 = Math.fround;

// Animation name tables (0x4a52a0..)
const STRIKE = ['Strike1', 'Strike2', 'Strike3', 'Strike4', 'Strike5', 'Strike6'];
const GO = ['Go1', 'Go2', 'Go3', 'Go4', 'Go5', 'Go6'];
const STAY = ['Stay1', 'Stay2', 'Stay3', 'Stay4', 'Stay5', 'Stay6'];
const BONUS = ['Stay', 'Stay', 'Stay']; // table 0x4a5318 (all three entries point to "Stay")

export class Slot {
  constructor() { this.item = 0; this.name = ''; this.level = 0; this.count = 0; this.next = 0; }
  copy(o) { this.item = o.item; this.name = o.name; this.level = o.level; this.count = o.count; this.next = o.next; return this; }
  clear() { this.item = 0; this.name = ''; this.level = 0; this.count = 0; this.next = 0; }
}

export class Creature {
  // sub_401f30 + sub_41a030
  constructor(type) {
    const def = G.cdefs[type];
    this.def = def;
    this.anim = new AnimPlayer();
    this.type = type;
    this.room = null;
    this.now = G.time;
    this.width = def ? def.anim.width : 16;
    this.height = def ? def.anim.height : 0;
    this.dir = 0;
    this.toggle = 1;              // 0x28
    this.toggleTime = 0;          // 0x2c
    this.speed = 2;               // 0x30
    this.savedSpeed = 0;          // 0x34
    this.altSpeed = 0;            // 0x38
    this.baseSpeed = 2;           // 0x3c
    this.mass = 160;              // 0x40
    this.x = 0; this.y = 0;       // 0x44 0x48
    this.px = 0; this.py = 0;     // 0x4c 0x50
    this.spawnX = -1; this.spawnY = -1; // 0x54 0x58
    this.tx = 0; this.ty = 0;     // 0x5c 0x60 flight target
    this.ox = 0; this.oy = 0;     // 0x64 0x68 flight origin
    this.vy = 0;                  // 0x6c
    this.stairSpeed = 2;          // 0x70
    this.sight = 0;               // 0x74
    this.respawnTime = 0;         // 0x78
    this.hp = def ? def.hp : 100; this.maxhp = this.hp;
    this.attacking = 0;           // 0x84
    this.canFire = 1;             // 0x88
    this.alive = 1;               // 0x8c
    this.agitated = 0;            // 0x90
    this.summoned = 0;            // 0x94
    this.deathTime = 0;           // 0x98
    this.lastTurn = 0;            // 0x9c
    this.slot = 0;                // 0xa0
    this.slots = [0, 1, 2, 3, 4, 5].map(() => new Slot());
    if (def) for (let i = 0; i < 6; i++) this.slots[i].copy(def.weapons[i]);
    this.slot = 0;
    this.special = new Slot();    // 0x1c4: ring of fire weapon
    this.special.name = 'bt_stardance'; this.special.level = 1; this.special.count = 9999999;
    this.offX = def ? def.offX : 0; this.offY = def ? def.offY : 0; // 0x2e8 0x2ec
    // behaviour flags
    this.team = 1;            // 0x2f0
    this.jumpWalls = 0;       // 0x2f4
    this.jumpGaps = 0;        // 0x2f8
    this.useStairs = 0;       // 0x2fc
    this.dropLedges = 0;      // 0x300
    this.melee = 0;           // 0x304
    this.moveAttack = 0;      // 0x308
    this.ranged = 0;          // 0x30c
    this.seek = 0;            // 0x310
    this.f314 = 0;            // 0x314
    this.f318 = 0;            // 0x318
    this.gravity = 1;         // 0x31c
    this.flock = 0;           // 0x320
    this.rideLifts = 0;       // 0x324
    this.immune = 1;          // 0x328
    this.checkHead = 1;       // 0x32c
    this.roomSwitch = 0;      // 0x330
    this.perch = 0;           // 0x334
    this.boss = 0;            // 0x338
    this.f33c = 0;            // 0x33c
    this.invuln = 0;          // 0x340
    this.alwaysAttack = 0;    // 0x344
    this.noAnim = 0;          // 0x348
    this.stair = 4;           // 0x350 (2 up, 3 down, 4 none)
    this.stairDir = 4;        // 0x354
    this.sx = 0; this.sy = 0; // 0x358 0x35c
    this.state = 2;           // 0x364
    this.prevState = 0;       // 0x368
    this.deadPrevState = 0;   // 0x36c
    this.initState = 0;       // 0x370
    this.fallTime = 0;        // 0x378
    this.bonus = 0;           // 0x37c
    this.idleAnim = BONUS[0]; // 0x380
    this.strikeTime = 0;      // 0x38c
    this.effectEnd = 0; this.effect = 0; this.effect2 = 0; // 0x390 0x394 0x398
    this.slow = 0;            // 0x39c
    this.slowEnd = 0;         // 0x3a0
    this.onLift = 0; this.lift = null; this.liftDX = 0; this.liftDY = 0; this.pliftDX = 0; this.pliftDY = 0;
    this.memory = Array.from({ length: 20 }, () => ({ on: 0, t: 0, x: 0, y: 0 }));
  }

  get world() { return G.world; }

  // ---------------- grid helpers
  cell(row, col) { return this.room ? this.room.cellFlags(row, col) : 0; }
  water(row, col) { return this.room ? this.room.cellWater(row, col) : 0; }

  // sub_402bf0 : standing on ground (with y offset)
  groundBelow(off = 0) {
    const half = tdiv(this.width, 2);
    const r = c16(this.y + off + 1);
    let c0 = c16(this.x - half), c1 = c16(this.x + half);
    if (r >= 35) return 0;
    if (c0 < 0) c0 = 0;
    if (c1 >= 49) c1 = 49;
    let ra = r < 0 ? 0 : r; if (ra >= 34) ra = 34;
    let rb = r - 1 < 0 ? 0 : r - 1; if (rb >= 34) rb = 34;
    for (let c = c0; c <= c1; c++) {
      if (this.cell(ra, c) & 1) {
        if (!(this.cell(rb, c) & 1)) return 1;
        if (this.type !== 1 && this.type !== 2) return 1;
      }
    }
    return 0;
  }

  // sub_402cd0 : wall ahead in facing direction
  wallAhead() {
    let col;
    if (this.dir === 1) col = c16(tdiv(this.width, 2) + this.x) + 1;
    else if (this.dir === 0) col = c16(this.x - tdiv(this.width, 2)) - 1;
    else return 0;
    let r1;
    if (this.state === 2 && !this.onLift) r1 = c16(this.y) - 1;
    else r1 = c16(this.y);
    let r0 = this.checkHead ? c16(this.y - this.height) : r1;
    if (col >= 49) col = 49;
    if (col < 0) col = 0;
    if (r0 < 0) r0 = 0;
    if (r1 >= 34) r1 = 34;
    for (let r = r0; r <= r1; r++) if (this.cell(r, col) & 1) return 1;
    return 0;
  }

  // sub_403040 : snap up out of solid ground
  snapUp() {
    const half = tdiv(this.width, 2);
    let c0 = c16(this.x - half); if (c0 < 0) c0 = 0;
    let c1 = c16(this.x + half); if (c1 >= 49) c1 = 49;
    let y1 = this.y;
    for (let guard = 0; guard < 2000; guard++) {
      const r = c16(y1);
      let solid = false;
      for (let c = c0; c <= c1; c++) if (this.cell(r, c) & 1) { solid = true; break; }
      if (!solid) break;
      y1--;
    }
    if (this.state === 3 && this.y - y1 > 10) return 0;
    this.y = y1;
    return 1;
  }

  // sub_402fa0 : ceiling hit (head)
  ceiling() {
    const half = tdiv(this.width, 2);
    let c0 = c16(this.x - half); if (c0 < 0) c0 = 0;
    let c1 = c16(this.x + half); if (c1 >= 49) c1 = 49;
    const r = c16(this.y - this.height);
    if (r < 0) return 0;
    for (let c = c0; c <= c1; c++) {
      if (c >= 0 && c < 50 && (this.cell(r, c) & 1)) {
        if (!r) return 1;
        if (this.checkHead) return 1;
      }
    }
    return 0;
  }

  // sub_402e60 : stairs at feet
  stairsHere() {
    const col = c16(this.x), row = c16(this.y);
    if (this.type !== 1 && this.type !== 2) {
      if (this.cell(c16(this.y + 1), col) & 4) return 0;
      if (this.cell(row, col) & 4) return 0;
    }
    if (!(this.cell(c16(this.y + 1), col) & 2) && !(this.cell(row, col) & 2)) { this.stair = 4; return 0; }
    if (this.stair !== 4) return 1;
    this.stair = ((~this.cell(row, col) & 2) | 4) >> 1;
    if (this.cell(row - 1, col + 1) & 2) this.stairDir = 1;
    if (this.cell(row - 1, col - 1) & 2) this.stairDir = 0;
    if (this.cell(row + 2, col - 1) & 2) this.stairDir = 1;
    if (this.cell(row + 2, col + 1) & 2) this.stairDir = 0;
    return 1;
  }

  // sub_403130 : anchor for stairs movement
  startStairs() {
    const col = c16(this.x);
    let row = c16(this.y);
    if (!(this.cell(row, col) & 2)) row++;
    const x16 = col * 16;
    if (this.stairDir === 1) {
      if (this.cell(row, col + 1) & 2) { this.sy = row * 16; this.sx = x16 + 24; return; }
    } else {
      if (!(this.cell(row, col + 1) & 2)) { this.sy = row * 16; this.sx = x16 - 8; return; }
    }
    this.sy = row * 16; this.sx = x16 + 8;
  }

  // sub_4031e0 : follow the 45-degree stair line
  stairsMove() {
    if (!(this.cell(c16(this.y), c16(this.x)) & 2) && this.stair === 3 && !this.stairDir && this.x <= this.sx) return;
    let ny = this.y;
    if (this.stairDir === 0) ny = this.sy - this.sx + this.x;
    else if (this.stairDir === 1) ny = this.sy + this.sx - this.x;
    if (ny > this.y) { if (this.stair === 2) return; }
    else if (ny < this.y) { if (this.stair === 3) return; }
    this.y = ny;
  }

  // sub_402dd0 : still on stair cells below
  onStairs() {
    const half = tdiv(this.width, 2);
    const yy = this.y + 1;
    if (yy >= SH) return 1;
    let c0 = c16(this.x - half); if (c0 < 0) c0 = 0;
    let c1 = c16(this.x + half); if (c1 >= 49) c1 = 49;
    const r = c16(yy);
    for (let c = c0; c <= c1; c++) if (this.cell(r, c) & 2) return 1;
    return 0;
  }

  // sub_402af0 : free space above to jump over an obstacle
  canJumpUp() {
    let col = this.dir === 0 ? c16(this.x - tdiv(this.width, 2)) - 1 : c16(tdiv(this.width, 2) + this.x) + 1;
    let r0 = c16(this.y - this.height) - 4;
    let r1 = c16(this.y) - 4;
    if (col < 0) col = 0; if (col >= 49) col = 49;
    if (r0 < 0) r0 = 0;
    if (r1 >= 34) r1 = 34;
    for (let r = r0; r <= r1; r++) if (this.cell(r, col) & 1) return 0;
    return 1;
  }

  // sub_402960 : gap ahead that can be jumped
  canJumpGap() {
    const d = this.dir ? 1 : -1;
    let col = c16(this.x);
    const row = c16(this.y + 1);
    let n = 0;
    if (col < 0) return 0;
    while (col < 50 && !(this.cell(row, col) & 1)) { col += d; n++; if (col < 0) break; }
    if (col <= 0 || col >= 49 || n > 5) return 0;
    const c0 = c16(this.x);
    const c1 = c16(d * 80) + c0;
    let lo = Math.min(c0, c1), hi = Math.max(c0, c1);
    let r0 = c16(this.y - this.height - 64), r1 = c16(this.y);
    if (lo < 0) lo = 0; if (lo >= 49) lo = 49;
    if (hi < 0) hi = 0; if (hi >= 49) hi = 49;
    if (r0 < 0) r0 = 0; if (r0 >= 34) r0 = 34;
    for (let c = lo; c < hi; c++) for (let r = r0; r < r1; r++) if (this.cell(r, c) & 1) return 0;
    return 1;
  }

  // sub_404110 : distance down to ground straight below
  dropDist() {
    let yy = this.y;
    if (yy >= SH) return 0x7fffffff;
    for (;;) {
      if (this.water(c16(yy), c16(this.x))) return 0x7fffffff;
      if (this.groundBelow(yy - this.y)) return yy - this.y;
      yy += 16;
      if (yy >= SH) return 0x7fffffff;
    }
  }

  // sub_401730 : "stuck" memory / random toggle -> decide to try something
  chance() {
    if (this.toggle) return 1;
    for (const m of this.memory) if (m.on && m.t + 3000 < this.now) m.on = 0;
    for (const m of this.memory) {
      if (m.on && this.x >= m.x - 8 && this.x < m.x + 8 && this.y >= m.y - 8 && this.y < m.y + 8) return 1;
    }
    for (const m of this.memory) if (!m.on) { m.x = this.x; m.y = this.y; m.on = 1; m.t = this.now; }
    return 0;
  }

  // sub_401a10 : turn around (500 ms cooldown)
  turn(force = false) {
    if (this.lastTurn + 500 >= this.now && !force) return;
    if (this.dir === 0) this.dir = 1;
    else if (this.dir === 1) this.dir = 0;
    if (!force) this.lastTurn = this.now;
  }

  // sub_4016f0 : next weapon/slot
  nextSlot() {
    let v = this.slot;
    for (let guard = 0; guard < 12; guard++) {
      v++;
      const s = this.slots[v % 6];
      if (!s.level) continue;
      if (!s.item) break;
    }
    this.slot = v % 6;
  }

  // sub_401a60
  dirTo(t) { if (!t) return 4; return this.x < t.x ? 1 : 0; }
  // sub_402bb0
  distTo(t) { if (!t) return 0x7fffffff; const dx = t.x - this.x, dy = t.y - this.y; return Math.trunc(Math.sqrt(dx * dx + dy * dy)); }

  // sub_4026f0 : line of sight blocked?
  losBlocked(x0, y0, x1, y1) {
    const dx = x1 - x0, dy = y1 - y0;
    const len = Math.trunc(Math.sqrt(dx * dx + dy * dy));
    if (len <= 0) return 0;
    let ax = 0, ay = 0;
    for (let t = 0; t < len; t += 4) {
      const yy = y0 + tdiv(ay, len), xx = x0 + tdiv(ax, len);
      if (yy < 0) return 1;
      if (this.cell(c16(yy), c16(xx)) & 1) return 1;
      ax += dx * 4; ay += dy * 4;
    }
    return 0;
  }

  // vtable[7] sub_4027c0 : can see / reach target
  canSee(t) {
    if (!t) return 0;
    if (this.seek) {
      const y0 = Math.max(0, this.y - tdiv(this.height, 2));
      const y1 = Math.max(0, t.y - tdiv(t.height, 2));
      return this.losBlocked(this.x, y0, t.x, y1) ? 0 : 1;
    }
    const half = tdiv(t.width, 2);
    const tl = t.x - half, tr = t.x + half, ttop = t.y - t.height;
    let l, r, top, bot;
    if (this.dir === 0) { r = this.x; top = this.y - this.height; l = this.x - 800; bot = this.y; }
    else if (this.dir === 1) { l = this.x; top = this.y - this.height; r = this.x + 800; bot = this.y; }
    else if (this.dir === 3) { r = this.x + this.width; l = this.x - this.width; top = this.y; bot = this.y + 600; }
    else return 0;
    if (tr < r) r = tr;
    if (tl > l) l = tl;
    if (r - l < 0) return 0;
    let b2 = t.y >= bot ? bot : t.y;
    if (ttop > top) top = ttop;
    if (b2 - top < 0) return 0;
    if (!this.gravity) return 1;
    if (this.losBlocked(this.x, this.y - tdiv(this.height, 2), t.x, t.y - tdiv(t.height, 2))) return 0;
    if (this.losBlocked(this.x, this.y, t.x, t.y - tdiv(t.height, 2))) return 0;
    return 1;
  }

  // sub_422e90: hero if in same room
  heroHere() { const h = G.world && G.world.hero; return h && h.room === this.room ? h : null; }

  // vtable[6] sub_404380 : find target
  findTarget() {
    let best = null;
    const room = this.room;
    if (this.team) {
      const h = this.heroHere();
      best = h && h.alive ? h : null;
    } else if (room) {
      for (const m of room.monsters) if (m && m.team) { best = m; break; }
    }
    if (!room) return best;
    const flag = this.team === 0 ? 1 : 0;
    for (const c of room.monsters) {
      if (!c || c.team === this.team || !c.alive) continue;
      if (this.canSee(c)) {
        if (this.distTo(c) < this.sight) {
          if (!best) return c;
          if (!this.canSee(best)) return c;
          if (this.distTo(best) >= this.sight) return c;
          if (c === room.nearest(this.x, this.y, flag)) return c;
        }
      }
      if (this.canSee(c)) {
        if (!this.canSee(best)) return c;
        if (c === room.nearest(this.x, this.y, flag)) return c;
      }
      if (best === room.nearest(this.x, this.y, flag)) return c;
    }
    return best;
  }

  // sub_4040d0
  inRange(t) { if (!t) return 0; if (!this.canSee(t)) return 0; return this.distTo(t) < this.sight ? 1 : 0; }

  // vtable[2] sub_404330
  damage(d) {
    if (this.invuln) return;
    if (!this.alive) return;
    this.hp = f32(this.hp - d);
    if (this.hp <= 0) { this.die(); return; }
    if (this.flock) this.flockAlert();
  }

  // sub_404070
  flockAlert() {
    if (G.world.pinActive) return;
    for (const c of this.room.monsters) {
      if (c && c.alive && c.type === this.type && c !== this && c.agitated <= 0) {
        c.agitated = 1;
        c.speed = c.altSpeed;
        c.pickFlightPoint();
      }
    }
  }

  // vtable[3] sub_403fa0
  die() {
    this.deadPrevState = this.state;
    this.state = 7;
    this.respawnTime = this.now + 180000;
    this.attacking = 0;
    this.alive = 0;
    const w = G.world;
    if (this.room === w.room) w.fx.explosion(this.x, this.y, 255, 255);
    const sc = Math.trunc(this.maxhp * 0.5);
    if (!this.summoned && !w.noScore) {
      w.addScore(sc);
      w.fx.floatNumber(this.x, this.y, sc);
    }
    if (this.summoned) this.type = -1;
  }

  // sub_401800 : lift under feet (world coordinates)
  liftUnder() {
    const w = G.world;
    const half = tdiv(this.width, 2);
    const wx0 = this.x - half + w.rx * 800, wx1 = this.x + half + w.rx * 800;
    const wy = w.ry * 544 + this.y;
    for (const L of w.lifts) {
      if (!L.active) continue;
      const lx0 = Math.trunc(L.x - tdiv(L.w, 2));
      const lx1 = Math.trunc(tdiv(L.w, 2) + L.x);
      const ly0 = Math.trunc(L.y);
      const ly1 = Math.trunc(L.h + L.y);
      const a = Math.max(lx0, wx0), b = Math.min(lx1, wx1);
      if (Math.trunc(b - a) < 0) continue;
      if (ly0 <= wy && ly1 > wy) return L;
    }
    return null;
  }

  // sub_401940 : attach to lift
  attachLift() {
    const L = this.lift;
    const top = Math.trunc(L.y) + 1, bot = Math.trunc(L.h + L.y);
    const off = G.world.ry * 544;
    let wy = this.y + off;
    if (wy >= top) { while (wy < bot) { wy--; if (wy < top) break; } }
    this.y = wy - off;
    this.liftDX = Math.trunc(L.x - this.x);
    this.liftDY = Math.trunc(L.y - this.y);
  }

  // ------------------------------------------------------------------ physics (sub_4039a0)
  physics() {
    const w = G.world;
    const fallStep = 5 - Math.trunc(this.slow * 250 / 100);
    const accel = 8 - Math.trunc(this.slow * 400 / 100);
    if (this.slow && this.slowEnd < this.now) this.slow = 0;
    const lift = this.liftUnder();
    if (!this.immune) {
      const half = tdiv(this.width, 2);
      let c0 = c16(this.x - half), c1 = c16(this.x + half);
      let r0 = c16(this.y - this.height), r1 = c16(this.y);
      if (c0 < 0) c0 = 0; if (c1 >= 49) c1 = 49;
      if (r0 < 0) r0 = 0; if (r1 >= 34) r1 = 34;
      for (let c = c0; c < c1; c++) {
        let sum = 0;
        for (let r = r0; r < r1; r++) sum += this.room.cellHostile(r, c);
        if (sum) { this.damage(f32(sum * 0.1)); }
      }
    }
    switch (this.state) {
      case 2:
        if (this.gravity) {
          if (!this.onLift) this.snapUp();
          if ((!this.groundBelow(0) && this.gravity && !this.onLift) || (this.onLift && !lift)) {
            this.state = 3; this.onLift = 0;
          }
        }
        break;
      case 3: {
        this.y += fallStep;
        this.vy = f32(accel + this.vy);
        if (this.groundBelow(0)) {
          if (this.snapUp()) this.state = 2;
          G.turnFlag = true;
          const a = this.wallAhead(); this.turn(true);
          const b = this.wallAhead(); this.turn(true);
          G.turnFlag = false;
          if (a && b && !(this.type !== 1 && this.type !== 2)) this.state = 3;
        }
        if (lift && this.rideLifts) {
          this.lift = lift;
          this.attachLift();
          this.state = 2;
          this.onLift = 1;
          this.liftDX = Math.trunc(lift.x - this.x);
          this.liftDY = Math.trunc(lift.y - this.y);
        }
        break;
      }
      case 4: {
        this.y = Math.trunc(this.y - (this.vy / this.mass) * accel);
        this.vy = f32(this.vy - accel);
        if (this.vy <= 0 || this.ceiling()) this.state = 3;
        break;
      }
      case 5: {
        if (this.vy !== 0) {
          this.y = Math.trunc(this.y - (this.vy / this.mass) * accel);
          this.vy = f32(this.vy - accel);
        } else {
          this.y += fallStep;
          if (this.groundBelow(0)) { this.snapUp(); this.state = 2; }
        }
        break;
      }
      case 6:
        this.stairsMove();
        if (!this.onStairs()) { this.stair = 4; this.stairDir = 4; this.state = 2; }
        break;
    }
    if (this.state !== 3) this.fallTime = 0; else this.fallTime += 5;
    const st = this.state;
    if (((this.liftDX === this.pliftDX && this.liftDY === this.pliftDY && this.onLift) || (this.x === this.px && this.y === this.py)) && st !== 7) {
      if (st !== 1) this.prevState = st;
      this.state = 1;
      if (this.type === 1 || this.type === 2) {
        const r = rnd() % 100;
        if (!this.bonus) {
          if (r < 2) this.bonus = (rnd() & 1) + 1;
        } else if (this.anim.eventIs(this.def.anim, 'BonusEnd')) this.bonus = 0;
      }
      this.idleAnim = BONUS[this.bonus];
    }
    if (this.roomSwitch) this.checkRoomSwitch();
    if (!this.noAnim) {
      let name;
      const n = this.slot;
      if (this.attacking) name = STRIKE[n];
      else if (this.state === 1) name = (this.type === 1 || this.type === 2) ? this.idleAnim : STAY[n];
      else if (this.state === 3) name = this.fallTime > 32 ? 'Fall' : STAY[n];
      else if (this.state === 4) name = 'Jump';
      else name = GO[n];
      this.anim.set(this.def.anim, name, this.now);
    }
    this.pliftDX = this.liftDX; this.pliftDY = this.liftDY;
    this.px = this.x; this.py = this.y;
  }

  // sub_402600 : hero leaving the screen -> room switch
  checkRoomSwitch() {
    const w = G.world;
    let rx = w.rx, ry = w.ry, nx = this.x, ny = this.y, sw = 0;
    if (this.x < 0) { rx--; nx = this.x + 800; sw = 1; }
    if (this.x >= 800) { rx++; nx -= 800; sw = 1; }
    if (this.y < 0) { ry--; ny = this.y + 544; sw = 1; }
    if (this.y >= 544) { ry++; ny -= 544; sw = 1; }
    if (!sw) return;
    w.switchRoom(rx, ry, nx, ny);
    this.sx = this.x; this.sy = this.y;
    if (this.onLift && this.lift) {
      this.liftDX = Math.trunc(this.lift.x - this.x);
      this.liftDY = Math.trunc(this.lift.y - this.y);
    }
  }

  // ------------------------------------------------------------------ generic monster AI (sub_41a0b0)
  update() { this.ai(); }

  ai() {
    const w = G.world;
    let spd = Math.trunc(this.speed);
    let hero = this.heroHere();
    if (hero && !hero.alive) hero = null;
    if (this.summoned) {
      if (!hero || this.deathTime < this.now) { this.die(); return; }
    }
    if (this.state === 7) {
      if (this.respawnTime >= this.now || hero) return;
      // respawn
      this.speed = this.baseSpeed;
      this.x = this.spawnX; this.y = this.spawnY;
      this.state = this.initState;
      this.hp = this.maxhp;
      this.alive = 1;
      if (this.flock) { this.agitated = 1; this.speed = this.altSpeed; }
      this.ox = 0; this.oy = 0;
      if (this.hp < this.maxhp) this.hp = f32(this.hp + 1);
    } else if (!hero) {
      if (this.hp < this.maxhp) this.hp = f32(this.hp + 1);
    }
    if (this.state === 1) this.state = this.prevState;
    if (this.toggleTime < this.now) {
      this.toggle = this.toggle ? 0 : 1;
      this.toggleTime = this.now + ((rnd() % 5) + 3) * 1000;
      this.nextSlot();
    }
    const target = this.findTarget();
    let doTurn = false;
    switch (this.state) {
      case 2: {
        if (this.dir === 0) { if (!this.wallAhead()) this.x -= spd; }
        else if (this.dir === 1) { if (!this.wallAhead()) this.x += spd; }
        else if (this.dir === 2) this.y -= spd;
        else if (this.dir === 3) this.y += spd;
        if (!this.gravity) break;
        if (this.wallAhead()) {
          if (this.jumpWalls && this.canJumpUp() && (this.chance() || (this.seek && this.canSee(target)))) {
            this.state = 4; this.vy = this.mass;
          } else {
            // push out of the wall and turn
            let tries = 0;
            while (this.wallAhead() && tries < 100000) {
              if (this.dir === 0) this.x++; else if (this.dir === 1) this.x--; else break;
              tries++;
            }
            this.turn();
            break;
          }
        }
        // ledge ahead?
        const d16 = this.dir === 1 ? 16 : (this.dir === 0 ? -16 : 0);
        this.x += d16;
        if (this.dropDist() > 16) {
          if (!this.dropLedges || this.dropDist() === 0x7fffffff || !this.chance()) doTurn = true;
          if (this.jumpGaps && this.canJumpGap() && (this.chance() || (this.seek && this.canSee(target)))) {
            this.state = 5; this.vy = this.mass; doTurn = false;
          }
        }
        this.x -= d16;
        if (doTurn) this.turn();
        if (this.useStairs && this.stairsHere() && !this.attacking) {
          if ((this.stair === 2 && this.dir === this.stairDir) || (this.stair === 3 && this.dir !== this.stairDir)) {
            if (this.chance()) {
              if (!(this.seek && this.canSee(target))) { this.state = 6; this.startStairs(); }
            }
          }
        }
        break;
      }
      case 4: case 5:
        if (!this.wallAhead()) this.x += this.dir === 0 ? -spd : spd;
        break;
      case 6:
        this.x += this.dir === 1 ? spd : -spd;
        this.stairsMove();
        break;
      case 8: {
        if (this.ty === this.oy || this.tx === this.ox || this.speed === 0) break;
        const dy = this.ty - this.oy, dx = this.tx - this.ox;
        if (Math.abs(dx) > Math.abs(dy)) {
          if (this.tx > this.ox) this.x += spd; else this.x -= spd;
          this.y = Math.trunc((this.x - this.ox) * dy / dx + this.oy);
        } else {
          if (this.ty > this.oy) this.y += spd; else this.y -= spd;
          this.x = Math.trunc((this.y - this.oy) * dx / dy + this.ox);
        }
        break;
      }
      case 9:
        if (this.dir === 1) { if (!this.wallAhead()) this.x += spd; }
        else if (this.dir === 0) { if (!this.wallAhead()) this.x -= spd; }
        if (this.wallAhead()) this.turn();
        break;
    }
    // keep inside the screen
    const half = tdiv(this.width, 2);
    if (this.x + half > 800) { this.dir = 0; this.stair = (this.stair === 2 ? 1 : 0) + 2; }
    if (this.x - half < 0) { this.dir = 1; this.stair = (this.stair === 2 ? 1 : 0) + 2; }
    if (target && (this.state === 2 || this.state === 9 || this.state === 8)) {
      if (this.melee || this.ranged) {
        this.sight = Math.trunc(w.weapons.range(this.slots[this.slot]) * 80 / 100);
        if (this.canFire && !this.attacking) {
          if (!this.inRange(target) && !this.alwaysAttack) {
            this.attacking = 0;
            if (!this.moveAttack && this.speed === 0) this.speed = this.savedSpeed;
          } else {
            if (!this.moveAttack && this.speed !== 0) { this.savedSpeed = this.speed; this.speed = 0; }
            if (this.gravity && this.dirTo(target) !== this.dir) this.turn();
            this.attacking = 1;
          }
        }
        if (this.attacking) {
          if (this.canFire && this.anim.eventIs(this.def.anim, 'StrikeHit')) {
            let ang;
            if (this.seek) ang = w.weapons.angleTo(target.x - this.x, target.y - this.y);
            else ang = this.dir ? 0 : 180;
            const res = w.weapons.fire(this, ang, this.slots[this.slot]);
            this.strikeTime = this.now + (res ? res.delay : 0);
            this.canFire = 0;
          }
          if (this.anim.eventIs(this.def.anim, 'StrikeEnd')) {
            this.attacking = 0;
            if (!this.moveAttack && this.speed === 0) this.speed = this.savedSpeed;
            if (this.gravity && this.dirTo(target) !== this.dir) this.turn();
          }
        }
      }
    } else if (this.attacking) {
      this.attacking = 0;
      if (!this.moveAttack && this.speed === 0) this.speed = this.savedSpeed;
    }
    if ((this.melee || this.ranged) && this.slots[this.slot].next < this.now) this.canFire = 1;
    this.physics();
  }

  // sub_402200 : pick a new flight destination (bats, bees...)
  pickFlightPoint() {
    const rand = (n) => rnd() % n;
    const solid = (x, y) => this.cell(c16(y), c16(x)) & 1;
    const wet = (x, y) => this.water(c16(y), c16(x));
    const mode = this.agitated;
    let ok = false;
    if (mode > 0 && mode <= 2) {
      const t = this.findTarget();
      if (t && this.flockHasAgitated2()) {
        for (let n = 999; n > 0; n--) {
          let x = rand(200) + t.x - 100;
          let y = rand(200) + (t.y - tdiv(t.height, 2)) - 100;
          x = Math.min(750, Math.max(50, x)); y = Math.min(494, Math.max(50, y));
          this.tx = x; this.ty = y;
          if (x !== this.x && y !== this.y && !wet(x, y) && !solid(x, y)) { ok = true; break; }
        }
        if (!ok) this.ty = this.height;
      } else {
        for (let n = 1000; n > 0 && !ok; n--) {
          this.tx = rand(700) + 50; this.ty = rand(444) + 50;
          if (solid(this.tx, this.ty) || wet(this.tx, this.ty)) continue;
          if (this.perch) {
            while (!solid(this.tx, this.ty) && this.ty >= 0) { this.ty -= 16; if (this.ty < 0) break; }
            if (this.ty < 0) continue;
            while (this.ty < 544 && solid(this.tx, this.ty)) this.ty++;
            if (this.ty >= 544) continue;
            this.ty += this.height;
          }
          ok = true;
        }
        if (!ok) {
          for (let n = 0; n < 10000; n++) {
            this.tx = rand(700) + 50; this.ty = rand(444) + 50;
            if (!wet(this.tx, this.ty) && !solid(this.tx, this.ty)) break;
          }
        }
      }
    } else if (mode === 0) {
      for (let n = 1000; n > 0; n--) {
        this.tx = rand(700) + 50; this.ty = rand(444) + 50;
        if (!wet(this.tx, this.ty) && !solid(this.tx, this.ty) && this.tx !== this.ox && this.ty !== this.oy) break;
      }
    }
    if (this.perch) this.dir = this.tx >= this.x ? 1 : 0;
    this.ox = this.x; this.oy = this.y;
  }

  // sub_4019b0
  flockHasAgitated2() {
    if (G.world.pinActive) return 0;
    for (const c of this.room.monsters) if (c && c.alive && c.type === this.type && c.agitated === 2) return 1;
    return 0;
  }

  // drawing (sub_422d70)
  draw(ctx, drawSprFn) {
    const fi = this.anim.frameInfo(this.def.anim, this.dir);
    if (!fi) return;
    const a = this.def.anim;
    const left = this.x - tdiv(a.bw, 2);
    const top = this.y - a.bh + 2;
    drawSprFn(ctx, fi.key, left, top, fi.flip);
  }
}
