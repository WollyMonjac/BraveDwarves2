// Items: definitions (Items.ini), instances in rooms, keys, pickup and effects.
// sub_4223d0, sub_424860, sub_422830, sub_423060, sub_424a10, sub_424d80, sub_4226c0
import { ini, starAll, atoi, tok } from './assets.js';
import { loadAnimDef, AnimPlayer } from './anim.js';
import { G, rnd } from './globals.js';
import { drawSpr } from './gfx.js';

const f32 = Math.fround;

// sub_404930: triangle wave over the frame counter
export function tri(n) {
  if (!n) return 0;
  const v = G.frame % n;
  if (!((Math.trunc(G.frame / n)) & 1)) return n - v;
  return v;
}

export class Items {
  constructor(world) {
    this.world = world;
    this.defs = [];
    this.byName = new Map();
    const tree = ini('Items\\Items.ini');
    for (const [k, a, ch] of tree) {
      if (k !== 'ITEM') continue;
      const d = { name: a.trim(), animFile: '', sound: '', score: 0, fly: 0, shine: 0, notTouch: 0, respawn: 0, effect: null };
      for (const [k2, a2] of ch) {
        if (k2 === 'ANIMATION_FILE') d.animFile = a2.trim();
        else if (k2 === 'SOUND') d.sound = a2.trim();
        else if (k2 === 'SCORE') d.score = atoi(a2);
        else if (k2 === 'FLY') d.fly = atoi(a2);
        else if (k2 === 'SHINE') d.shine = atoi(a2);
        else if (k2 === 'NOT_TOUCH') d.notTouch = atoi(a2);
        else if (k2 === 'RESPAWNTIME') d.respawn = atoi(a2);
        else if (k2 === 'PICKUP_EFFECT') {
          const t = tok(a2, ' ,\t');
          d.effect = { name: t[0] || '', args: [atoi(t[1]), atoi(t[2]), atoi(t[3]), atoi(t[4])] };
        }
      }
      d.anim = loadAnimDef('Items\\' + d.animFile + '.anm', 'Items\\');
      if (d.anim.missing) continue;   // "Can't load animation file for item"
      d.index = this.defs.length + 1;
      this.defs.push(d);
      this.byName.set(d.name.toLowerCase(), d);
    }
  }
  def(name) { return this.byName.get(String(name).toLowerCase()) || null; }

  // sub_424860
  make(room, def, x, y, score, delay) {
    return {
      used: 1, room, active: 1, secret: 0, def, score, x: f32(x), y: f32(y), rx: room ? room.rx : 0, ry: room ? room.ry : 0,
      count: 0, respawnAt: 0, expiry: G.time + delay, phase: rnd() & 15, anim: new AnimPlayer(), event: '',
      mode: 0, tx: 0, ty: 0, vx: 0, vy: 0, f74: 0,
    };
  }

  // sub_422a20
  startBounce(it) {
    it.mode = 2;
    it.vy = -10 - (rnd() % 5);
    it.f74 = 1;
    const v = (rnd() % 5) + 1;
    it.vx = it.x > 400 ? -v : v;
  }

  playSound(it) {
    if (it.def.sound) this.world.sound(it.def.sound, 100, Math.trunc(it.x * 0.125));
  }

  // sub_422830 movement
  move(it, room) {
    if (it.mode === 0) {
      if (!(it.x >= 0 && it.x < 800 && it.y >= 0 && it.y < 544)) it.used = 0;
    } else if (it.mode === 1) {
      const dx = it.tx - it.x, dy = it.ty - it.y;
      if (Math.abs(Math.trunc(dx)) < 8 && Math.abs(Math.trunc(dy)) < 8) { it.mode = 0; it.x = f32(it.tx); it.y = f32(it.ty); return; }
      const l = Math.sqrt(dx * dx + dy * dy) || 1;
      it.x = f32(dx / l * 8 + it.x); it.y = f32(dy / l * 8 + it.y);
    } else if (it.mode === 2) {
      it.x = f32(it.vx + it.x);
      it.y = f32(it.y + it.vy);
      it.vy++;
      if (it.vy > 15) it.vy = 15;
      if (it.vy > 10) {
        const c = Math.trunc(it.x / 16), r = Math.trunc(it.y / 16);
        if (c >= 0 && c < 50 && r >= 0 && r < 35) {
          if (!(room.cellFlags(r, c) & 1)) it.f74 = 0;
          else if (!it.f74) { it.mode = 0; it.y = f32(r * 16 - 16); }
        }
      }
    }
  }

  // per room update (part of sub_423930 + sub_423060 for the current room)
  updateRoom(room, isCurrent) {
    const w = this.world;
    const now = G.time;
    let removed = false;
    for (const it of room.items) {
      if (!it.used) continue;
      this.move(it, room);
      if (!it.used) { removed = true; continue; }
      if (now >= it.expiry) { it.used = 0; removed = true; continue; }
      if (it.def.name.toLowerCase() === 'arrowdig') {
        const box = room.breakableBox();
        if (!box) {
          w.fx.floatNumber(Math.trunc(it.x), Math.trunc(it.y), it.score);
          w.addScore(it.score);
          it.used = 0; removed = true; continue;
        }
        it.x = f32(Math.trunc((box[2] + box[0]) / 2));
        it.y = f32(Math.trunc((box[3] + box[1]) / 2));
        it.x = f32(it.x + 40);
      }
    }
    if (isCurrent) {
      for (const it of room.items) {
        if (!it.used) continue;
        if (it.active) {
          it.anim.set(it.def.anim, 'GO', now);
          it.event = it.anim.event(it.def.anim);
          if (it.event) {
            const ev = it.event.toLowerCase();
            if (ev === 'openteleport' || ev === 'closeteleport') {
              const tp = w.teleportAt(w.rx, w.ry, Math.trunc(it.x), Math.trunc(it.y));
              if (tp && tp.type !== 3) tp.disabled = ev === 'openteleport' ? 0 : 1;
            }
          }
        } else if (it.respawnAt && now >= it.respawnAt) {
          it.respawnAt = 0; it.active = 1;
        }
      }
    }
    if (removed) room.items = room.items.filter(i => i.used);
  }

  // keys (global list) animation
  updateKeys() {
    for (const k of this.world.keyItems) if (k.active) k.anim.set(k.def.anim, 'GO', G.time);
  }

  // sub_424a10
  drawList(ctx, list, filter) {
    let i = 0;
    for (const it of list) {
      i++;
      if (!it.used || !it.active || (filter && !filter(it))) continue;
      const d = it.def, a = d.anim;
      let x = Math.trunc(it.x), y = Math.trunc(it.y);
      if (d.fly) {
        const v = tri(((i - 1) & 15) + d.fly * 10);
        y -= Math.trunc(v / d.fly);
      }
      const fi = it.anim.frameInfo(a, 0);
      const left = x - (a.bw >> 1), top = y - (a.bh >> 1);
      if (fi) drawSpr(ctx, fi.key, left, top, fi.flip);
      if (d.shine && !((G.frame + i - 1) % d.shine)) {
        const hw = a.bw >> 1, hh = a.bh >> 1;
        const x0 = (hw >> 1) + left, x1 = x0 + hw, y0 = (hh >> 1) + top, y1 = hh + y0;
        if (x1 > x0 && y1 > y0) this.world.fx.sparkle(rnd() % (x1 - x0) + x0, rnd() % (y1 - y0) + y0);
      }
    }
  }
  draw(ctx, room) {
    this.drawList(ctx, room.items);
    const w = this.world;
    this.drawList(ctx, w.keyItems, k => k.rx === w.rx && k.ry === w.ry);
  }

  // sub_424d80
  pickup(hero, room) {
    const w = this.world;
    const a = hero.def.anim;
    const x0 = hero.x - (a.bw >>> 1), x1 = hero.x + (a.bw >>> 1);
    const y0 = hero.y - ((a.bh >>> 1) << 1), y1 = hero.y;
    const tryItem = (it, isKey) => {
      if (!it.used || !it.active || it.def.notTouch) return;
      if (!(x0 <= it.x && x1 > it.x && y0 <= it.y && y1 > it.y)) return;
      const sc = it.score;
      const bonus = w.greed ? Math.trunc(sc * 20 / 100) : 0;
      this.effect(it, hero);
      if (!it.active) {
        w.addScore(sc);
        w.fx.floatNumber(Math.trunc(it.x), Math.trunc(it.y), sc);
        if (bonus) { w.fx.floatNumber(Math.trunc(it.x), Math.trunc(it.y), bonus); w.addScore(bonus); }
        if (it.count === 1) { if (!it.secret) w.itemsCollected++; else w.secretCollected++; }
      }
    };
    for (const it of room.items) tryItem(it, false);
    for (const k of w.keyItems) if (k.rx === w.rx && k.ry === w.ry) tryItem(k, true);
  }

  // sub_4226c0
  effect(it, hero) {
    const w = this.world;
    const e = it.def.effect;
    if (e) {
      const n = e.name.toUpperCase();
      if (n === 'HEALTH') {
        if (hero.hp === hero.maxhp) return;
        hero.hp = f32(e.args[0] + hero.hp);
        if (!(hero.hp < hero.maxhp)) hero.hp = hero.maxhp;
      } else if (n === 'ADD_EPISODE_KEY') {
        w.keys += e.args[0];
        w.keyTaken(w.rx, w.ry);
      } else if (n === 'SURPRISE') {
        let cnt = rnd() % 4 + 1;
        while (cnt-- > 0) w.weapons.fireNamed('bt_summon_bat', 1, Math.trunc(it.x), Math.trunc(it.y), 0, 1);
      }
    }
    it.count++;
    if (it.def.sound) w.sound(it.def.sound, 100, Math.trunc(it.x * 0.125));
    it.active = 0;
    it.respawnAt = it.def.respawn ? G.time + it.def.respawn * 1000 : 0;
  }
}
