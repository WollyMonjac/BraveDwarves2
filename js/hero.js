// Hero (Dwarf1 = wizard, Dwarf2 = warrior) - sub_419a10 / sub_419ab0 / sub_419ec0 / sub_418bb0
import { Creature } from './creature.js';
import { G } from './globals.js';
import { input } from './input.js';

const f32 = Math.fround;

export class Hero extends Creature {
  constructor(type) {
    super(type);
    this.initState = 2;
    this.state = 2;
    this.team = 0;
    this.immune = 0;
    this.speed = 3;
    this.stairSpeed = 2;
    this.mass = 288;
    this.sight = 48;
    this.rideLifts = 1;
    this.roomSwitch = 1;
    this.effectEnd = 0;
    this.slot = 0;
    this.checkHead = G.world ? G.world.checkHead : 1;
    this.slots[0].count = 500;
    this.slots[0].level = 1;
    this.inWater = 0;
  }

  update() {
    const w = G.world;
    this.heroUpdate();
    // sub_418bb0: secret blocks revealed by the hero
    if (w.room && w.room.checkHiddenBlocks(this)) this.snapUp();
  }

  heroUpdate() {
    const w = G.world;
    const walk = Math.trunc(this.speed - this.slow * this.speed * 0.5);
    const stair = Math.trunc(this.stairSpeed - this.slow * this.stairSpeed * 0.5);
    if (w.ringOfFire) w.weapons.fire(this, 0, this.special);
    const wt = this.water(Math.trunc(this.y / 16), Math.trunc(this.x / 16));
    if (wt) {
      if (!this.toggle) w.sound('Level.WaterSplash', 100, 50);
      this.toggle = 1;
    } else this.toggle = 0;
    if (input.nextWeapon()) this.nextSlot();
    if (this.onLift && this.lift) {
      this.x = Math.trunc(this.lift.x - this.liftDX);
      this.y = Math.trunc(this.lift.y - this.liftDY);
    }
    if (this.state === 1) this.state = this.prevState;
    switch (this.state) {
      case 2:
        if (this.attacking) break;
        if (input.jump()) { this.state = 4; this.vy = this.mass; this.onLift = 0; }
        if (input.up() && this.stairsHere() && this.stair === 2) { this.state = 6; this.startStairs(); }
        if (input.down() && this.stairsHere() && this.stair === 3) { this.state = 6; this.startStairs(); }
        // fallthrough to horizontal movement
        this.airMove(walk);
        break;
      case 3: case 4:
        this.airMove(walk);
        break;
      case 6:
        if (this.attacking) break;
        if (input.right()) {
          this.x += stair; this.dir = 1; this.stair = (this.stairDir !== 1 ? 1 : 0) + 2;
        } else if (input.left()) {
          this.x -= stair; this.dir = 0; this.stair = (this.stairDir !== 0 ? 1 : 0) + 2;
        } else {
          if (input.up()) {
            if (this.stairDir === 1) { this.x += stair; this.dir = 1; }
            if (this.stairDir === 0) { this.dir = 0; this.x -= stair; }
            this.stair = 2;
          }
          if (input.down()) {
            if (this.stairDir === 1) { this.x -= stair; this.dir = 0; }
            if (this.stairDir === 0) { this.x += stair; this.dir = 1; }
            this.stair = 3;
          }
          this.stairsMove();
        }
        break;
    }
    if (this.effect && this.effectEnd < this.now) { this.effect = 0; this.effect2 = 0; }
    const s = this.slots[this.slot];
    if (s.next < this.now) this.canFire = 1;
    if (input.fire() && this.canFire) this.attacking = 1;
    if (this.attacking) {
      if (this.canFire) {
        const res = w.weapons.fire(this, this.dir ? 0 : 180, s);
        if (res) { this.strikeTime = this.now + res.delay; this.canFire = 0; }
      }
      if (this.anim.eventIs(this.def.anim, 'StrikeEnd')) this.attacking = 0;
    }
    this.physics();
  }

  airMove(walk) {
    if (input.right()) {
      this.dir = 1;
      if (!this.wallAhead()) { this.x += walk; if (this.onLift) this.liftDX -= walk; }
    }
    if (input.left()) {
      this.dir = 0;
      if (!this.wallAhead()) { this.x -= walk; if (this.onLift) this.liftDX += walk; }
    }
  }

  // sub_419ec0
  damage(d) {
    if (this.invuln) return;
    if (!(d > 0)) return;
    if (this.effect) return;
    this.effectEnd = this.now + 1000;
    this.effect = 1;
    this.effect2 = 1;
    super.damage(d);
  }
}
