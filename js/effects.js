// Particles (sub_41d0b0/sub_41d670/sub_40e940), explosions (sub_41d120), sparkles (sub_41d1e0)
// and floating score numbers (sub_428780/sub_428690/sub_428710).
import { G, rnd } from './globals.js';
import { drawSprPart, drawNumber } from './gfx.js';

const f32 = Math.fround;

export class Effects {
  constructor(world) {
    this.world = world;
    this.parts = Array.from({ length: 300 }, () => ({ type: 0, frame: 0, x: 0, y: 0, vx: 0, vy: 0, life: 0, sub: 0 }));
    this.nums = Array.from({ length: 32 }, () => ({ on: 0, x: 0, y: 0, v: 0, vx: 0, sp: 0, cnt: 0 }));
  }
  clear() {
    for (const p of this.parts) p.type = 0;
    for (const n of this.nums) n.on = 0;
  }

  // sub_41d080: wipe the first n particle slots
  clearFirst(n) { for (let i = 0; i < Math.min(n, 300); i++) this.parts[i].type = 0; }

  // sub_41d0b0
  add(x, y, type, frame) {
    for (const p of this.parts) {
      if (p.type) continue;
      p.type = type; p.x = f32(x); p.y = f32(y); p.frame = frame; p.vx = 0; p.vy = -1; p.life = 150; p.sub = 1;
      return p;
    }
    return null;
  }

  // sub_41d120
  explosion(x, y, type, a3) {
    let size = type;
    if (type === 253) size = 8; else if (type === 254) size = 16; else if (type === 255) size = 32;
    for (const p of this.parts) if (p.type < 128) { p.type = 0; break; }
    const p = this.add(x - size, y - size, type, 0);
    if (!p) return;
    p.vx = 0;
    p.life = 48;
    p.frame = 0;
    p.vy = a3 === 255 ? (type !== 255 ? 1 : 0) - 3 : a3;
  }

  // sub_41d1e0
  sparkle(x, y) {
    const p = this.add(x, y, 100, 0);
    if (p) { p.vx = 0; p.vy = 0; p.life = 72; p.frame = 0; }
  }

  // movement particles (weapons MOVE_EFFECT): row = particle row in particles.pcx
  spark(x, y, row, vx = 0, vy = 0) {
    const p = this.add(x, y, row, 0);
    if (p) { p.vx = f32(vx); p.vy = f32(vy); p.sub = 2; }
    return p;
  }

  // sub_41d670
  update(room) {
    if (!(G.frame & 3) && room && room.waterCells && room.waterCells.length) {
      const wc = room.waterCells[rnd() % room.waterCells.length];
      const t = wc[1];
      const type = t === 1 ? 1 : t === 2 ? 2 : t === 3 ? 3 : 0;
      this.add((wc[0] % 50) * 16, Math.trunc(wc[0] / 50) * 16, type, 0);
    }
    for (const p of this.parts) {
      if (!p.type) continue;
      p.x = f32(p.vx + p.x);
      p.y = f32(p.vy + p.y);
      let c = Math.trunc(p.x * 0.0625), r = Math.trunc(p.y * 0.0625);
      if (c < 0) c = 0; if (r < 0) r = 0; if (c >= 50) c = 49; if (r >= 35) r = 34;
      const fl = room ? room.cellFlags(r, c) : 0, wt = room ? room.cellWater(r, c) : 0;
      let kill = false;
      switch (p.type) {
        case 1: case 2: case 3:
          if ((fl & 1) || !wt) { kill = true; break; }
          if (--p.sub === 0) {
            p.frame++; p.sub = 2; p.vy = -3;
            if (p.frame > 20) kill = true;
          } else p.vy = 0;
          break;
        case 4: case 5: case 6:
          if (--p.sub === 0) { p.frame++; p.sub = 2; if (p.frame > 20) kill = true; }
          break;
        case 100:
          p.frame = 6 - Math.trunc(p.life / 6);
          if (p.life) p.life--;
          if (p.frame < 0) p.frame = 0;
          break;
        case 253: case 254: case 255:
          p.frame = 5 - (p.life >> 3);
          if (p.life) p.life--;
          if (p.frame < 0) p.frame = 0;
          break;
        default:
          // weapon move-effect sparks (rows 7..20 of particles.pcx)
          if (--p.sub <= 0) { p.frame++; p.sub = 2; if (p.frame > 20) kill = true; }
          break;
      }
      if (kill) { p.type = 0; continue; }
      p.life--;
      if (p.life <= 0) p.type = 0;
    }
  }

  // sub_40e940
  draw(ctx) {
    for (const p of this.parts) {
      if (!p.type || !p.frame) continue;
      const x = Math.trunc(p.x), y = Math.trunc(p.y), d = p.frame;
      if (p.type >= 1 && p.type <= 20) {
        drawSprPart(ctx, 'particles.pcx', d * 5 - 5, p.type * 5 - 5, 5, 5, x, y);
      } else if (p.type === 100) {
        drawSprPart(ctx, 'stars.bmp', d * 12 - 12, 0, 12, 12, x, y);
      } else if (p.type === 253) {
        drawSprPart(ctx, 'explode.pcx', (d + 24) * 16, 32, 16, 16, x, y);
      } else if (p.type === 254) {
        drawSprPart(ctx, 'explode.pcx', (d + 12) * 32, 0, 32, 32, x, y);
      } else if (p.type === 255) {
        drawSprPart(ctx, 'explode.pcx', d * 64, 0, 64, 64, x, y);
      }
    }
  }

  // sub_428780
  floatNumber(x, y, v) {
    for (let i = 0; i < this.nums.length; i++) {
      const n = this.nums[i];
      if (n.on) continue;
      n.on = 1; n.x = x; n.y = y; n.v = v; n.cnt = 0;
      n.sp = (i & 1 ? 1 : 0) - 3;
      n.vx = (rnd() % 6) - 3;
      if (v < 0) n.sp = -n.sp * 2;
      return;
    }
  }
  // sub_428690
  updateNumbers() {
    for (const n of this.nums) {
      if (!n.on) continue;
      n.x += n.vx;
      n.y = n.v <= 0 ? n.y - n.sp : n.y + n.sp;
      if (++n.cnt > 10) { n.sp++; n.cnt = 0; }
      if (n.x < 0 || n.x >= 800 || n.y < 0 || n.y >= 600) n.on = 0;
    }
  }
  // sub_428710
  drawNumbers(ctx) {
    for (const n of this.nums) {
      if (!n.on || !n.v) continue;
      drawNumber(ctx, Math.abs(n.v), n.x, n.y, n.v > 0 ? 'digits1' : 'digitsRed');
    }
  }
}
