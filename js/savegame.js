// Save games: a snapshot of the world state stored in localStorage (the original wrote .sav files).
import { G } from './globals.js';
import { S } from './assets.js';

function slotOut(s) { return [s.item, s.name, s.level, s.count]; }
function slotIn(s, a) { s.item = a[0]; s.name = a[1]; s.level = a[2]; s.count = a[3]; s.next = 0; }

export function saveGame(w) {
  const h = w.hero;
  const rooms = {};
  for (const [k, r] of w.rooms) {
    rooms[k] = {
      v: r.visited ? 1 : 0, b: r.boss,
      it: r.items.filter(i => i.used).map(i => [i.def.name, Math.round(i.x), Math.round(i.y), i.score, i.active, i.count, i.secret, Math.max(0, i.respawnAt - G.time), i.expiry - G.time > 1e8 ? -1 : Math.max(0, i.expiry - G.time)]),
      hd: r.hidden.map(g => [g.on, g.def.name, g.x, g.y]),
      rc: r.rects.map(x => [x.active, x.hits]),
      mo: r.monsters.map(m => m && !m.summoned && m.type > 0 ? [m.type, m.x, m.y, Math.round(m.hp), m.alive, m.state, m.dir, Math.max(0, m.respawnTime - G.time), m.maxhp] : null),
    };
  }
  return {
    v: 1, ep: w.epKey, hero: w.heroType, date: Date.now(),
    score: w.score, lives: w.lives, keys: w.keys, rx: w.rx, ry: w.ry,
    played: G.time - w.startTime,
    stats: [w.itemsCollected, w.secretCollected, w.itemsTotal, w.secretTotal, w.betTotal, w.winTotal, w.gemCounter],
    map: [w.mapAll, w.mapKeys, w.mapTeleports],
    h: { x: h.x, y: h.y, hp: h.hp, dir: h.dir, slot: h.slot, slots: h.slots.map(slotOut) },
    k: w.keyItems.map(k => [k.used, k.active, k.rx, k.ry, k.x, k.y]),
    tp: w.teleports.map(t => t.disabled),
    rooms,
  };
}

export function loadGame(w, s) {
  w.score = s.score; w.lives = s.lives; w.keys = s.keys;
  w.startTime = G.time - (s.played || 0);
  [w.itemsCollected, w.secretCollected, w.itemsTotal, w.secretTotal, w.betTotal, w.winTotal, w.gemCounter] = s.stats;
  [w.mapAll, w.mapKeys, w.mapTeleports] = s.map;
  const kdef = w.items.def('KeyMain');
  w.keyItems = s.k.map(a => {
    const it = w.items.make(null, kdef, a[4], a[5], kdef ? kdef.score : 0, 1e12);
    it.used = a[0]; it.active = a[1]; it.rx = a[2]; it.ry = a[3];
    return it;
  });
  s.tp.forEach((d, i) => { if (w.teleports[i]) w.teleports[i].disabled = d; });
  for (const [k, rs] of Object.entries(s.rooms)) {
    const r = w.rooms.get(k);
    if (!r) continue;
    r.visited = rs.v; r.boss = rs.b;
    r.items = [];
    for (const a of rs.it) {
      const def = w.items.def(a[0]);
      if (!def) continue;
      const it = w.items.make(r, def, a[1], a[2], a[3], a[8] < 0 ? 86400000 : a[8]);
      it.active = a[4]; it.count = a[5]; it.secret = a[6]; it.respawnAt = a[7] ? G.time + a[7] : 0;
      r.items.push(it);
    }
    r.hidden = rs.hd.map(a => ({ on: a[0], def: w.items.def(a[1]), x: a[2], y: a[3], phase: 0 })).filter(g => g.def);
    rs.rc.forEach((a, i) => {
      const rc = r.rects[i];
      if (!rc) return;
      rc.active = a[0]; rc.hits = a[1];
      if (rc.active) rc.el.flags |= 12; else rc.el.flags &= ~0xC;
    });
    r.monsters = [];
    for (const a of rs.mo) {
      if (!a) continue;
      const c = w.createCreature(r, a[1], a[2], a[0], a[6]);
      if (!c) continue;
      c.hp = Math.fround(a[3]); c.maxhp = Math.fround(a[8]); c.alive = a[4]; c.state = a[5];
      c.respawnTime = G.time + a[7];
      const d = w.ep.rooms[k].mon.find(m => m[0] === a[0]);
      if (d) { c.spawnX = d[2]; c.spawnY = d[3]; c.boss = d[5] & 1; }
    }
  }
  w.switchRoom(s.rx, s.ry, s.h.x, s.h.y);
  const h = w.hero;
  h.x = s.h.x; h.y = s.h.y; h.hp = Math.fround(s.h.hp); h.dir = s.h.dir; h.slot = s.h.slot;
  s.h.slots.forEach((a, i) => slotIn(h.slots[i], a));
  h.state = 2;
  w.redraw = true;
}

export function saveSummary(s) {
  const d = new Date(s.date);
  const pad = n => String(n).padStart(2, '0');
  return `${S('Episode_' + s.ep, s.ep)} – ${s.score} (${pad(d.getDate())}.${pad(d.getMonth() + 1)} ${pad(d.getHours())}:${pad(d.getMinutes())})`;
}
