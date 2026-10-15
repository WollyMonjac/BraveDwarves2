// Monster constructors (sub_41a970.. sub_417ef0) and per-type update functions (vtable[0]).
import { Creature, c16, tdiv } from './creature.js';
import { G, rnd } from './globals.js';

const f32 = Math.fround;
const pan = x => Math.trunc(x * 100 / 800);
const fireDir = c => (c.dir !== 0 ? 0 : 180);

// arrived at / outside the flight segment (ox,oy)->(tx,ty)
function offSegment(c) {
  const x0 = Math.min(c.ox, c.tx), x1 = Math.max(c.ox, c.tx);
  const y0 = Math.min(c.oy, c.ty), y1 = Math.max(c.oy, c.ty);
  return (!c.ox && !c.oy) || c.x <= x0 || c.x >= x1 || c.y <= y0 || c.y >= y1;
}

function monsterBase(c, type) {
  // sub_41a030
  c.baseSpeed = 2; c.speed = 2; c.stairSpeed = 2; c.agitated = 0; c.f360 = 32; c.mass = 160;
  c.hp = 100; c.maxhp = 100;
  for (const s of c.slots) s.count = 99999999;
  c.sight = tdiv(c.width, 4);
}

// -------------------------------------------------------------------- generic walkers (vtable 0x491420)
export class Orc extends Creature {
  constructor(t = 3) {
    super(t); monsterBase(this, t);
    this.initState = this.state = 2;
    this.jumpWalls = this.useStairs = this.dropLedges = this.melee = this.seek = this.jumpGaps = 1;
  }
}
export class Pikeman extends Creature {
  constructor(t = 4) { super(t); monsterBase(this, t); this.initState = this.state = 2; this.melee = 1; this.moveAttack = 0; }
}
export class Skeleton extends Creature {
  constructor(t = 5) {
    super(t); monsterBase(this, t);
    this.initState = this.state = 2;
    this.jumpWalls = this.useStairs = this.dropLedges = this.melee = 1;
    this.speed = 3;
  }
}
export class Fish extends Creature {
  constructor(t = 7) {
    super(t); monsterBase(this, t);
    this.initState = this.state = 9;
    this.f318 = this.melee = this.gravity = this.immune = 1;
    this.moveAttack = 0;
    this.baseSpeed = this.speed = f32((rnd() & 1) + 2);
  }
}
export class Zealot extends Creature {
  constructor(t = 10) {
    super(t); monsterBase(this, t);
    this.initState = this.state = 9;
    this.f318 = this.ranged = this.seek = 1;
  }
}
// Golem (21) and Golem2 (23): stationary bosses with the generic AI
export class Golem extends Creature {
  constructor(t = 21) {
    super(t); monsterBase(this, t);
    this.seek = 0; this.noAnim = 0; this.gravity = 0; this.speed = 0;
    this.state = 2; this.sight = 800; this.ranged = 1; this.alwaysAttack = 1;
  }
}

// -------------------------------------------------------------------- Bat (sub_418860 / sub_418670)
export class Bat extends Creature {
  constructor(t = 6) {
    super(t); monsterBase(this, t);
    this.initState = this.state = 8;
    this.altSpeed = f32((rnd() & 1) + 4);
    this.f314 = this.seek = this.flock = this.perch = this.agitated = 1;
    this.moveAttack = this.melee = 0;
  }
  update() {
    const w = G.world;
    const t = this.findTarget();
    const f2 = this.flockHasAgitated2();
    if (this.alive) {
      let skip = false;
      const a = this.agitated;
      if (a !== -1) {
        if (a <= 0 || a > 2) skip = true;
        else if (offSegment(this)) {
          this.pickFlightPoint();
          if (!f2) {
            const hy = this.y - this.height;
            if (this.y <= this.height || (!(this.cell(c16(hy), c16(this.x)) & 1) && (this.cell(c16(hy - 1), c16(this.x)) & 1))) {
              this.agitated = -1; this.speed = 0;
            }
          }
        }
      }
      if (!skip) {
        if (this.distTo(t) < 200) {
          if (this.agitated <= 0) w.sound('Creatures.Bat', 100, pan(this.x));
          if (this.agitated < 2) { this.agitated = 2; this.pickFlightPoint(); }
          this.speed = this.altSpeed;
          this.agitated = 2;
          this.flockAlert();
        } else if (this.agitated === 2) this.agitated = 1;
      }
    }
    if (this.room === w.room && this.alive) w.weapons.fire(this, fireDir(this), this.slots[this.slot]);
    this.ai();
  }
}

// -------------------------------------------------------------------- Bee (sub_418a90 / sub_4188f0)
export class Bee extends Creature {
  constructor(t = 16) {
    super(t); monsterBase(this, t);
    this.initState = this.state = 8;
    this.altSpeed = f32(this.baseSpeed + 3);
    this.f314 = this.seek = this.flock = this.agitated = 1;
    this.moveAttack = this.melee = 0;
    this.speed = 0;
  }
  update() {
    const w = G.world;
    const t = this.findTarget();
    const f2 = this.flockHasAgitated2();
    if (this.alive) {
      const a = this.agitated;
      let skip = false;
      if (a) {
        if (a < 0 || a > 2) skip = true;
        else if (offSegment(this)) {
          this.pickFlightPoint();
          if (!f2) {
            if (this.speed !== 0) this.toggle = 0;
            this.speed = this.toggle ? this.baseSpeed : 0;
          } else this.speed = this.altSpeed;
        }
      }
      if (!skip) {
        if (this.distTo(t) < 200) {
          if (this.agitated < 2) { this.agitated = 2; this.pickFlightPoint(); }
          this.agitated = 2;
          this.speed = this.altSpeed;
          this.flockAlert();
        } else if (this.agitated === 2) this.agitated = 1;
      }
    }
    if (t && this.speed === 0) this.dir = t.x >= this.x ? 1 : 0;
    if (this.room === w.room && this.alive) w.weapons.fire(this, fireDir(this), this.slots[this.slot]);
    this.ai();
  }
}

// -------------------------------------------------------------------- Fly (sub_418dd0 / sub_418d10)
export class Fly extends Creature {
  constructor(t = 18) {
    super(t); monsterBase(this, t);
    this.initState = this.state = 8;
    this.baseSpeed = this.speed = 2;
    this.f314 = 1; this.melee = 0; this.alive = 0; this.agitated = 1;
    for (let i = 0; i < 5; i++) this.slots[i].level = 0;
    this.slot = rnd() & 1;
    this.slots[this.slot].level = 1;
  }
  update() {
    if (this.state === 7) { this.ai(); return; }
    if (offSegment(this)) {
      this.pickFlightPoint();
      if (this.speed !== 0) this.toggle = 0;
      this.speed = this.toggle ? this.baseSpeed : 0;
    }
    this.ai();
  }
}

// -------------------------------------------------------------------- Archer (sub_418410 / sub_418450)
export class Archer extends Creature {
  constructor(t = 8) {
    super(t); monsterBase(this, t);
    this.baseSpeed = this.speed = this.savedSpeed = 0;
    this.initState = this.state = 0;
    this.alive = 0;
    this.ranged = 1;
  }
  update() {
    const w = G.world;
    const t = this.findTarget();
    this.noAnim = 1;
    if (this.state === 1) this.state = this.prevState;
    const a = this.def.anim;
    switch (this.state) {
      case 0:
        this.alive = 0; this.ranged = 0;
        if (t && this.toggle) {
          this.dir = this.dirTo(t);
          this.state = 10;
          w.sound('Creatures.Skel_Archer', 100, pan(this.x));
        }
        this.anim.set(a, 'Wait', this.now);
        break;
      case 2:
        this.noAnim = 0; this.ranged = 1;
        if (!this.attacking && !this.toggle) {
          this.state = 11;
          w.sound('Creatures.Skel_Down', 100, pan(this.x));
        }
        break;
      case 10:
        this.ranged = 0;
        if (this.anim.eventIs(a, 'RiseEnd')) { this.state = 2; this.ranged = 1; }
        this.anim.set(a, 'RISE', this.now);
        this.alive = 1; this.canFire = 1;
        break;
      case 11:
        this.ranged = 0;
        if (this.anim.eventIs(a, 'DownEnd')) { this.state = 0; this.alive = 0; }
        this.anim.set(a, 'DOWN', this.now);
        break;
    }
    this.ai();
  }
}

// -------------------------------------------------------------------- WoodArcher (sub_418c40 / sub_418c00)
export class WoodArcher extends Creature {
  constructor(t = 15) {
    super(t); monsterBase(this, t);
    this.initState = this.state = 2;
    this.baseSpeed = this.speed = 0;
    this.ranged = 1;
  }
  update() {
    const d = this.dirTo(this.findTarget());
    if (d !== 4 && this.dir !== d && !this.attacking) this.turn();
    this.ai();
  }
}

// -------------------------------------------------------------------- Dendroid (sub_418b50 / sub_418b00)
export class Dendroid extends Creature {
  constructor(t = 9) { super(t); monsterBase(this, t); this.initState = this.state = 2; this.melee = 0; }
  update() {
    const w = G.world;
    if (this.room === w.room && this.alive) w.weapons.fire(this, fireDir(this), this.slots[this.slot]);
    this.ai();
  }
}

// -------------------------------------------------------------------- Snake (sub_41aad0 / sub_41aa80)
export class Snake extends Creature {
  constructor(t = 12) {
    super(t); monsterBase(this, t);
    this.initState = this.state = 2;
    this.melee = 1; this.moveAttack = 0;
    this.baseSpeed = this.speed = 0;
  }
  update() {
    if (this.findTarget()) this.speed = (this.toggle && !this.attacking) ? 2 : 0;
    this.ai();
  }
}

// -------------------------------------------------------------------- Spider (sub_41ac70 / sub_41ab20)
export class Spider extends Creature {
  constructor(t = 11) {
    super(t); monsterBase(this, t);
    this.initState = this.state = 12;
    this.melee = 0; this.gravity = 0; this.moveAttack = 0;
    this.baseSpeed = this.speed = 4;
    this.dir = 3;
    this.ax = 0; this.ay = 0; // 0x4fc / 0x500 anchor
  }
  update() {
    const w = G.world;
    const t = this.findTarget();
    if (this.state === 1) this.state = this.prevState;
    if (this.state === 2) {
      if (this.groundBelow(0) || this.y >= 544) this.dir = 2;
      if (this.ay > this.y) { this.y = this.ay; this.state = 12; this.dir = 3; }
    } else if (this.state === 12) {
      this.ax = this.x; this.ay = this.y; this.dir = 3;
      if (this.canSee(t) && !this.losBlocked(this.x, this.y, t.x, t.y - tdiv(t.height, 2))) {
        this.state = 2;
        w.sound('Creatures.Spider', 100, pan(this.x));
      }
    }
    if (this.room === w.room && this.alive) w.weapons.fire(this, fireDir(this), this.slots[this.slot]);
    this.ai();
  }
}

// -------------------------------------------------------------------- Frog (sub_418f70 / sub_418e80)
export class Frog extends Creature {
  constructor(t = 13) {
    super(t); monsterBase(this, t);
    this.initState = this.state = 2;
    this.speed = this.baseSpeed;
    this.melee = 0; this.moveAttack = 1;
  }
  update() {
    const w = G.world;
    if (this.state !== 1) {
      if (this.state === 2 && this.anim.eventIs(this.def.anim, 'GoBegin') && !this.toggle && !this.attacking) {
        if (this.speed !== 0 && this.room === w.room) w.sound('Creatures.Frog', 100, pan(this.x));
        this.speed = 0;
      }
    } else if (this.toggle) this.speed = this.baseSpeed;
    if (this.room === w.room && this.alive) w.weapons.fire(this, fireDir(this), this.slots[this.slot]);
    this.ai();
  }
}

// -------------------------------------------------------------------- Lepr (sub_419fd0 / sub_419f20)
export class Lepr extends Creature {
  constructor(t = 14) {
    super(t); monsterBase(this, t);
    this.initState = this.state = 9;
    this.f318 = this.ranged = this.seek = 1;
    this.savedSpeed = this.baseSpeed = this.speed = 0;
  }
  update() {
    const t = this.findTarget();
    if (!this.oy) { this.oy = this.y - 20; this.ty = this.y + 20; }
    if (this.attacking || this.state !== 1) { this.ai(); return; }
    if (G.frame & 1) this.y = this.y + 1 - (this.ty < this.oy ? 2 : 0);
    this.py = this.y;
    if (this.y === this.ty) { const v = this.ty; this.ty = this.oy; this.oy = v; }
    if (t) this.dir = this.dirTo(t);
    else this.dir = this.toggle ? 0 : 1;
    this.ai();
  }
}

// -------------------------------------------------------------------- Ghost (sub_418fc0 / sub_419070)
export class Ghost extends Creature {
  constructor(t = 17) {
    super(t); monsterBase(this, t);
    this.alive = 0; this.initState = this.state = 0;
    this.melee = 0; this.speed = 0;
    this.moveAttack = 1; this.f314 = 1;
    this.baseSpeed = 3;
    this.anim.set(this.def.anim, 'EYE_LOOK', this.now);
  }
  update() {
    const w = G.world;
    const a = this.def.anim;
    const hero = this.heroHere();
    if (!hero) { this.state = 0; return; }
    if (this.toggleTime < this.now) {
      this.toggle = this.toggle ? 0 : 1;
      this.toggleTime = (rnd() % 10000) + this.now;
      this.nextSlot();
    }
    const rr = (a0, b) => rnd() % (b - a0) + a0;
    switch (this.state) {
      case 8:
        this.ai();
        w.weapons.fire(this, fireDir(this), this.slots[this.slot]);
        if (offSegment(this)) { this.state = 11; this.speed = 0; }
        return;
      case 10:
        this.anim.set(a, 'RISE', this.now);
        if (this.anim.eventIs(a, 'END_RISE')) {
          w.sound('Creatures.Ghost', 100, pan(this.x));
          this.ox = this.x; this.oy = this.y;
          this.tx = hero.x + (rnd() % 10) - 5;
          this.ty = hero.y + (rnd() % 10) - 5;
          this.tx = Math.max(1, Math.min(799, this.tx));
          this.ty = Math.max(1, Math.min(543, this.ty));
          if (this.ox !== this.tx && this.oy !== this.ty) { this.state = 8; this.speed = this.baseSpeed; }
          this.dir = this.tx >= this.x ? 1 : 0;
        }
        return;
      case 11:
        this.anim.set(a, 'DOWN', this.now);
        if (this.anim.eventIs(a, 'END_DOWN')) {
          this.state = 0; this.speed = 0;
          this.x = rr(50, 750); this.y = rr(50, 494);
        }
        return;
      case 13:
        this.anim.set(a, 'EYE_RISE', this.now);
        if (this.anim.eventIs(a, 'END_EYE_RISE')) {
          this.canFire = 0;
          this.dir = (rnd() & 1) ? 0 : 1;
          this.state = 14;
        }
        return;
      case 14:
        this.anim.set(a, 'EYE_LOOK', this.now);
        if (this.anim.eventIs(a, 'END_EYE_LOOK')) this.canFire = 1;
        if (this.anim.eventIs(a, 'BEGIN_EYE_LOOK') && this.canFire) { this.state = 15; this.turn(); }
        if (this.anim.eventIs(a, 'SEEK') && !w.pinActive) {
          if (!this.losBlocked(this.x, this.y + this.offY, hero.x, hero.y - tdiv(hero.height, 2))) this.state = 10;
        }
        return;
      case 15:
        this.anim.set(a, 'EYE_LOOK', this.now);
        if (this.anim.eventIs(a, 'END_EYE_LOOK')) this.state = 16;
        return;
      case 16:
        this.anim.set(a, 'EYE_DOWN', this.now);
        if (this.anim.eventIs(a, 'END_EYE_DOWN')) {
          this.x = rr(50, 750); this.y = rr(50, 494);
          this.state = 0; this.toggle = 0;
        }
        return;
      case 0:
        this.anim.set(a, 'EMPTY', this.now);
        if (this.toggle) this.state = 13;
        return;
    }
  }
}

// -------------------------------------------------------------------- Helicopter (sub_419570 / sub_419770 / sub_4195d0)
export class Helicopter extends Creature {
  constructor(t = 20) {
    super(t); monsterBase(this, t);
    this.initState = this.state = 8;
    this.ranged = this.seek = this.moveAttack = 1;
    this.followHero = 1;   // 0x330
    this.dir = 1;
    this.baseSpeed = 3;
  }
  canSee(t) {
    this.moveAttack = this.toggle !== 0 ? 1 : 0;
    if (!t || !t.alive) return 0;
    const sx = this.x, sy = this.y - tdiv(this.height, 2);
    const a1 = G.world.weapons.angleTo(t.x - sx, t.y - sy);
    const a2 = G.world.weapons.angleTo(t.x - sx, (t.y - this.height) - sy);
    if (this.dir === 1) {
      if (((a1 >= 15 && a1 < 45) || (a2 >= 15 && a2 < 45)) && super.canSee(t)) return 1;
    } else if (((a1 >= 135 && a1 < 165) || (a2 >= 135 && a2 < 165)) && super.canSee(t)) return 1;
    return this.distTo(t) < 50 ? 1 : 0;
  }
  update() {
    let hero = this.heroHere();
    if (hero && !hero.alive) hero = null;
    const t = this.findTarget();
    if (!this.canSee(t)) this.canFire = 0;
    if (t && this.speed === 0) this.dir = t.x >= this.x ? 1 : 0;
    if (offSegment(this)) {
      const solidOrWet = () => this.water(c16(this.ty), c16(this.tx)) || (this.cell(c16(this.ty), c16(this.tx)) & 1) || this.tx === this.ox;
      if (this.team === 0 && hero) {
        do {
          do {
            const lo = hero.x - 25;
            this.tx = rnd() % (hero.x + 25 - lo) + lo;
            this.ty = (rnd() % 494) + 25;
            this.tx = Math.max(12, Math.min(788, this.tx));
            this.ty = Math.max(12, Math.min(532, this.ty));
          } while (solidOrWet());
        } while (this.ty === this.oy);
        this.ox = this.x; this.oy = this.y;
        this.speed = this.baseSpeed;
      } else {
        this.ox = this.x; this.oy = this.y;
        for (let n = 0; n < 100000; n++) {
          this.tx = (rnd() % 700) + 50;
          this.ty = (rnd() % 444) + 50;
          if (solidOrWet()) continue;
          if (this.ty !== this.oy) break;
        }
        this.toggle = 0;
        this.speed = 0;
      }
    }
    if (this.toggle) this.speed = this.baseSpeed;
    if (this.speed !== 0 && this.gravity) this.dir = this.tx >= this.x ? 1 : 0;
    this.ai();
  }
}

// -------------------------------------------------------------------- Gribarus boss (sub_417ac0 / sub_417b40 / sub_417a80)
export class Gribarus extends Creature {
  constructor(t = 19) {
    super(t); monsterBase(this, t);
    this.ranged = this.alwaysAttack = this.noAnim = 1;
    this.state = 2; this.sight = 800; this.gravity = 0;
    this.hp = this.maxhp = 100000;
    this.speed = 0;
    this.mode = 0;                 // 0x4fc
    this.threshold = (rnd() % 5) + 3; // 0x500
  }
  update() {
    const w = G.world;
    const hero = this.heroHere();
    const a = this.def.anim;
    if (hero && hero.alive) {
      if (this.anim.eventIs(a, 'End')) this.mode = rnd() % 3;
      if (this.mode === 2) {
        let n = 0;
        for (const p of w.weapons.proj) if (p && p.type === 18 && p.f128 === 100) n++;
        if (n >= this.threshold) {
          const k = (rnd() & 3) + 101;
          for (const p of w.weapons.proj) {
            if (!p || p.type !== 18 || p.f128 !== 100) continue;
            p.f128 = k;
            if (k === 101) p.mp1 = (rnd() % 3) + 1;
            else if (k === 102 || k === 104) {
              w.weapons.proj[w.weapons.proj.indexOf(p)] = null;
              w.fx.explosion(Math.trunc(p.x), Math.trunc(p.y), 253, 255);
              const c = w.createCreature(w.room, Math.trunc(p.x), Math.trunc(p.y), k === 104 ? 6 : 16, 0);
              if (c) {
                c.summoned = 1;
                c.ox = c.oy = c.tx = c.ty = 0;
                c.deathTime = G.time + (rnd() % 10000) + 5000;
                if (k === 104) { c.melee = 0; c.alive = 1; c.f34c = 1; }
              }
            }
          }
          this.threshold = (rnd() % 5) + 3;
        }
      }
    }
    this.ai();
    if (this.mode === 0) this.anim.set(a, 'Stay1', this.now);
    else if (this.mode === 1) this.anim.set(a, 'Stay2', this.now);
    else if (this.mode === 2) this.anim.set(a, 'Explode', this.now);
  }
  die() {
    const w = G.world;
    for (const p of w.weapons.proj) if (p && p.type === 18 && p.f128 === 100) w.weapons.free(p);
    super.die();
  }
}

// -------------------------------------------------------------------- Knight boss (sub_417ef0 / sub_417f40 / sub_417e80)
export class Knight extends Creature {
  constructor(t = 22) {
    super(t); monsterBase(this, t);
    this.seek = 0; this.alwaysAttack = 0; this.speed = 0;
    this.state = 2; this.sight = 800; this.ranged = 1; this.gravity = 1;
  }
  damage(d) {
    const st = this.state, ps = this.prevState;
    if (st === 18 || (st === 1 && ps === 18)) d = f32(d * 0.10000000149011612);
    if ((st === 2 || st === 18 || (st === 1 && (ps === 2 || ps === 18))) && !this.attacking) {
      this.state = 18;
      this.toggleTime = this.now + 1000;
    }
    super.damage(d);
  }
  update() {
    const w = G.world;
    const a = this.def.anim;
    const hero = this.heroHere();
    if (this.state === 1) this.state = this.prevState;
    switch (this.state) {
      case 18: {
        this.noAnim = 1;
        this.slot = 1;
        this.speed = 0;
        w.weapons.fire(this, fireDir(this), this.slots[1]);
        if (hero) {
          this.dir = this.dirTo(hero);
          this.slot = 0;
          if (this.inRange(hero)) { this.state = 2; this.slot = 0; }
          if ((rnd() % 100) < 5 && this.toggle) {
            this.state = 2; this.toggle = 1;
            this.update();
            return;
          }
        }
        if (this.now > this.toggleTime) this.state = 2;
        this.anim.set(a, 'Block', this.now);
        this.ai();
        return;
      }
      case 2: {
        this.noAnim = 0; this.slot = 0; this.speed = 0;
        if (this.toggle && hero && !this.attacking) {
          this.dir = this.dirTo(hero);
          const d = this.distTo(hero);
          if (d > 55) {
            this.toggle = 0; this.state = 4;
            let v;
            if (d < 120) v = Math.trunc((d - 50) * 50 / 65) + 50;
            else if (d < 210) v = Math.trunc((d - 115) * 50 / 90) + 100;
            else if (d < 310) v = Math.trunc((d - 205) * 50 / 100) + 150;
            else if (d < 450) v = Math.trunc((d - 305) * 50 / 140) + 200;
            else v = 251;
            this.vy = f32(v);
          }
        }
        this.ai();
        return;
      }
      case 3:
        if (!this.wallAhead()) this.x = Math.trunc(this.dir === 0 ? this.x - this.speed : this.x + this.speed);
      // falls through
      case 4: {
        this.noAnim = 1;
        if (this.speed !== 0 && this.groundBelow(5)) {
          this.toggleTime = this.now + 1000;
          this.y += 5;
          this.state = 18;
          this.slot = 0;
          w.weapons.fire(this, fireDir(this), this.slots[0]);
        }
        this.speed = 6;
        if (this.state === 4) {
          if (this.vy >= 150 && this.vy < 300) { this.slot = 1; w.weapons.fire(this, fireDir(this), this.slots[1]); this.anim.set(a, 'Jump0', this.now); }
          if (this.state === 4 && this.vy >= 0 && this.vy < 150) { this.slot = 1; w.weapons.fire(this, fireDir(this), this.slots[1]); this.anim.set(a, 'Jump1', this.now); }
        }
        if (this.state === 3) {
          if (this.vy >= 0 && this.vy < 150) { this.slot = 1; w.weapons.fire(this, fireDir(this), this.slots[1]); this.anim.set(a, 'Jump2', this.now); }
          if (this.state === 3 && this.vy >= 150 && this.vy < 300) this.anim.set(a, 'Jump3', this.now);
        }
        this.ai();
        return;
      }
      default:
        this.ai();
    }
  }
}

export const CREATURE_CLASSES = {
  3: Orc, 4: Pikeman, 5: Skeleton, 6: Bat, 7: Fish, 8: Archer, 9: Dendroid, 10: Zealot, 11: Spider, 12: Snake,
  13: Frog, 14: Lepr, 15: WoodArcher, 16: Bee, 17: Ghost, 18: Fly, 19: Gribarus, 20: Helicopter, 21: Golem,
  22: Knight, 23: Golem,
};
