// Game rendering (sub_40ffa0 draw part): prerendered room, coronas/fire, vertex lighting, sprites, HUD.
import { A } from './assets.js';
import { G, rnd } from './globals.js';
import { drawSpr, drawSprPart, drawElement, drawNumber, makeCanvas, W, PLAY_H } from './gfx.js';
import { LG_W, LG_H, addLight, BELT } from './world.js';
import { tdiv } from './creature.js';

let roomCanvas = null, roomCtx = null;
let lightCanvas = null, lightCtx = null, lightImg = null;
let tintCache = new Map();
let fireCanvas = null, fireCtx = null, fireImg = null;
let fireBuf = new Uint8Array(64 * 66), fireT = 0;
let coronaFrame = 0;
let hudRoomCache = null;

function ensure() {
  if (roomCanvas) return;
  roomCanvas = makeCanvas(800, 544); roomCtx = roomCanvas.getContext('2d');
  lightCanvas = makeCanvas(LG_W, LG_H); lightCtx = lightCanvas.getContext('2d');
  lightImg = lightCtx.createImageData(LG_W, LG_H);
  fireCanvas = makeCanvas(64, 64); fireCtx = fireCanvas.getContext('2d');
  fireImg = fireCtx.createImageData(64, 64);
}

// sub_425990 : background tiles + every visible element
export function prerender(world) {
  ensure();
  const room = world.room;
  const c = roomCtx;
  c.globalCompositeOperation = 'source-over';
  c.fillStyle = '#000'; c.fillRect(0, 0, 800, 544);
  let bgName = (room.bg || '').toLowerCase();
  if (!A.el.bg[bgName]) bgName = (world.defaultBg || 'back01').toLowerCase();
  if (!A.el.bg[bgName]) bgName = 'back01';
  const bg = A.bgImg[bgName], bgd = A.el.bg[bgName];
  if (bg && bgd) {
    for (let y = 0; y < 544; y += bgd[2]) for (let x = 0; x < 800; x += bgd[1]) c.drawImage(bg, x, y);
  }
  for (const el of room.elements) {
    if (!(el.flags & 1) || !(el.flags & 8)) continue;
    if (world.parentOption && (el.flags & 0x400)) continue;
    const name = room.hasGate ? world.elementName(el) : el.name;
    const lname = name.toLowerCase();
    if (A.el.frames[lname]) drawElement(c, name, el.x, el.y);
    else if (A.el.bg[lname] && A.bgImg[lname]) c.drawImage(A.bgImg[lname], el.x, el.y);
  }
  world.redraw = false;
}

// ---------------------------------------------------------------- coronas (D3D\corona32.bmp) and fire (sub_41db80)
const CORONA_RECT = { 1: [0, 0, 32, 32], 3: [96, 0, 64, 64], 5: [160, 0, 64, 64] };
const CORONA_HALF = { 1: 16, 3: 48, 5: 64 };
const CORONA_JIT = { 1: 2, 3: 2, 5: 0 };
function tinted(type, col) {
  const key = type + ':' + col.join(',');
  let cv = tintCache.get(key);
  if (cv) return cv;
  const r = CORONA_RECT[type];
  cv = makeCanvas(r[2], r[3]);
  const cx = cv.getContext('2d');
  drawSprPart(cx, 'd3d/corona32.bmp', r[0], r[1], r[2], r[3], 0, 0);
  cx.globalCompositeOperation = 'multiply';
  cx.fillStyle = `rgb(${col[0]},${col[1]},${col[2]})`;
  cx.fillRect(0, 0, r[2], r[3]);
  cx.globalCompositeOperation = 'destination-in';
  drawSprPart(cx, 'd3d/corona32.bmp', r[0], r[1], r[2], r[3], 0, 0);
  tintCache.set(key, cv);
  return cv;
}

function updateFire() {
  // sub_41da50: scroll up, add hot spots, blur with cooling, palette lookup
  const now = performance.now();
  if (now - fireT < 33) return;
  fireT = now;
  const b = fireBuf;
  b.copyWithin(0, 64, 64 * 64);
  const n1 = (rnd() & 3) * 2 + 24;
  for (let i = 0; i < n1; i++) b[61 * 64 + 16 + (rnd() & 31)] = 200 + (rnd() % 55);
  const n2 = ((rnd() & 3) + 12) >> 1;
  for (let i = 0; i < n2; i++) b[60 * 64 + 24 + (rnd() & 15)] = 200 + (rnd() % 55);
  const o = new Uint8Array(64 * 66);
  for (let i = 65; i < 64 * 64 - 2; i++) {
    let s = b[i - 65] + b[i - 64] + b[i - 63] + b[i - 1] + b[i + 1] + b[i + 63] + b[i + 64] + b[i + 65];
    if (s) { s >>= 3; if (s > 5) s -= 5; }
    o[i] = s;
  }
  fireBuf = o;
  const d = fireImg.data;
  for (let i = 0; i < 64 * 64; i++) {
    const v = o[i];
    let r, g, bl;
    if (v >= 128) { r = g = bl = 255; } else if (v < 64) { r = v; g = v >> 2; bl = 0; } else { r = v; g = v >> 1; bl = 0; }
    // MODULATE4X
    d[i * 4] = Math.min(255, r * 4); d[i * 4 + 1] = Math.min(255, g * 4); d[i * 4 + 2] = Math.min(255, bl * 4); d[i * 4 + 3] = 255;
  }
  fireCtx.putImageData(fireImg, 0, 0);
}

function drawFlames(ctx, world) {
  coronaFrame++;
  ctx.save();
  ctx.globalCompositeOperation = 'lighter';
  let i = 0;
  for (const c of world.coronas || []) {
    let half = CORONA_HALF[c.type];
    const jit = CORONA_JIT[c.type] ? rnd() % CORONA_JIT[c.type] : 0;
    if (c.type === 5) {
      const v = (i * 32) + coronaFrame;
      half = (v & 32) ? (v & 31) : 32 - (v & 31);
      if (!half) {
        c.x = (rnd() & 31) + c.bx - 16;
        c.y = (rnd() & 31) + c.by - 16;
      }
    }
    i++;
    if (half <= 0) continue;
    ctx.drawImage(tinted(c.type, c.color), c.x - half, c.y + jit - half, half * 2, half * 2);
  }
  if (world.fires && world.fires.length) {
    updateFire();
    for (const f of world.fires) ctx.drawImage(fireCanvas, 0, 0, 64, 62, f.x - f.w, f.y - f.h * 2, f.w * 2, f.h * 2);
  }
  ctx.restore();
}

// sub_427f00 + sub_4280b0 : static grid + dynamic lights, multiplied over the room
function drawLighting(ctx, world) {
  const base = world.lightGrid;
  if (!base || window.BD2_NOLIGHT) return;
  const g = new Int32Array(base.length);
  for (let i = 1; i < 64; i++) {
    const d = world.dyn[i];
    if (d.on) addLight(g, d.x, d.y, d.radius, d.r, d.g, d.b, null);
  }
  const px = lightImg.data;
  for (let i = 0, n = LG_W * LG_H; i < n; i++) {
    px[i * 4] = Math.min(255, base[i * 3] + g[i * 3]);
    px[i * 4 + 1] = Math.min(255, base[i * 3 + 1] + g[i * 3 + 1]);
    px[i * 4 + 2] = Math.min(255, base[i * 3 + 2] + g[i * 3 + 2]);
    px[i * 4 + 3] = 255;
  }
  lightCtx.putImageData(lightImg, 0, 0);
  ctx.save();
  ctx.beginPath(); ctx.rect(0, 0, 800, PLAY_H); ctx.clip();
  ctx.globalCompositeOperation = 'multiply';
  ctx.imageSmoothingEnabled = true;
  ctx.drawImage(lightCanvas, 0, 0, LG_W, LG_H, -8, -8, LG_W * 16, LG_H * 16);
  ctx.restore();
}

function drawLifts(ctx, world) {
  const ox = world.rx * 800, oy = world.ry * 544;
  for (const L of world.lifts) {
    if (!L.active) continue;
    const x0 = Math.trunc(L.x - L.w / 2), y0 = Math.trunc(L.y);
    if (x0 + L.w <= ox || x0 >= ox + 800 || y0 + L.h <= oy || y0 >= oy + 544) continue;
    drawSpr(ctx, world.liftSprite, x0 - ox, y0 - oy);
  }
}

function drawCreatures(ctx, world) {
  const list = world.room.monsters;
  const all = list.concat([world.hero]);
  for (const c of all) {
    if (!c || c.state === 7) continue;
    if (c.effect2 && !(G.frame & 4)) continue;
    c.draw(ctx, drawSpr);
  }
}

function drawBossBar(ctx, world) {
  const b = world.room.bossHP();
  if (!b || b[1] <= 0) return;
  const [hp, max] = b;
  ctx.drawImage(A.pics.boss_hpmax, 200, 50);
  const w = Math.max(0, Math.trunc(hp * 360 / max));
  if (w > 0) ctx.drawImage(A.pics.boss_hp, 0, 0, w, 40, 220, 50, w, 40);
}

export function drawWorld(ctx, world) {
  ensure();
  if (world.redraw) prerender(world);
  ctx.drawImage(roomCanvas, 0, 0);
  drawFlames(ctx, world);
  drawLighting(ctx, world);
  world.items.draw(ctx, world.room);
  drawLifts(ctx, world);
  drawCreatures(ctx, world);
  world.fx.draw(ctx);
  world.weapons.draw(ctx);
  world.fx.drawNumbers(ctx);
  drawBossBar(ctx, world);
}

// ---------------------------------------------------------------- HUD panel (sub_405e50)
const FRM = 'panel/panelsprites.frm';
function frm(name) {
  const t = A.ini[FRM];
  if (!t) return null;
  for (const s of Object.values(t.data)) if (s.name && s.name.toLowerCase() === name.toLowerCase()) return s.rectsx.split(',').map(v => parseInt(v, 10));
  return null;
}
const BELT_ICON = {
  itembowl: 'shop/icons/bowl.bmp', itemhammer: 'shop/icons/hammer.bmp', itempin: 'shop/icons/pin.bmp',
  ring1: 'shop/icons/ring0011.bmp', ring2: 'shop/icons/ring0022.bmp', ring3: 'shop/icons/ring0033.bmp',
  ring4: 'shop/icons/ring0044.bmp', ring5: 'shop/icons/ring0055.bmp',
};

export function drawHUD(ctx, world) {
  drawSpr(ctx, 'panel/panel.bmp', 0, 486);
  world.stepHpShown();
  const h = world.hero;
  const full = frm('heart_full');
  if (full && h) {
    const hh = full[3];
    const v = Math.trunc(hh * world.hpShown / (h.maxhp || 100));
    if (v > 0) drawSprPart(ctx, 'panel/panelsprites.bmp', full[0], full[1] + hh - v, full[2], v, 90, hh - v + 550);
  }
  drawNumber(ctx, world.lives, 112, 566, 'digits1');
  drawMiniMap(ctx, world, 210, 563);
  if (h) {
    let x = 276;
    for (let i = 0; i < 6; i++, x += 55) {
      const s = h.slots[i];
      if (!s.level) continue;
      if (s.item) {
        const ic = BELT_ICON[String(s.name).toLowerCase()];
        if (ic) drawSpr(ctx, ic, x, 546);
        drawNumber(ctx, Math.min(1000, Math.trunc(s.count / 60)), x + 2, 577, 'weapondigits');
      } else {
        const d = world.weapons.def(s.name, s.level - 1);
        if (!d) continue;
        drawSpr(ctx, world.weapons.icon(s.name), x, 546);
        if (i === h.slot) {
          const r = frm('select_weapon');
          if (r) drawSprPart(ctx, 'panel/panelsprites.bmp', r[0], r[1], r[2], r[3], x, 546);
        }
        if (!d.unlimited) drawNumber(ctx, Math.min(1000, s.count), x + 2, 577, 'weapondigits');
      }
    }
  }
  drawNumber(ctx, world.score, 612, 556, 'digits1');
}

// map cells (Map\cells.bmp + cells.ini)
const CELL = { left: 0, right: 10, top: 20, bottom: 30, left_solid: 40, right_solid: 50, top_solid: 60, bottom_solid: 70, cell_hasbeen: 80, cell_current: 90, cell_key: 100, cell_present: 110, cell_teleport: 120 };
export function drawCell(ctx, name, x, y) { drawSprPart(ctx, 'map/cells.bmp', CELL[name], 0, 10, 10, x, y); }

export function drawMapCells(ctx, world, x0, y0, rx0, ry0, cols, rows) {
  const vis = (rx, ry) => {
    if (rx < 0 || rx >= 80 || ry < 0 || ry >= 40) return 0;
    const f = world.mapInfo.get(rx + '_' + ry);
    if (!f || !(f & 1)) return 0;
    const room = world.roomAt(rx, ry);
    if (room && room.visited) return f;
    return world.mapAll ? f | 0x100 : 0;
  };
  // pass 1: cells, markers and open sides
  for (let j = 0; j < rows; j++) {
    for (let i = 0; i < cols; i++) {
      const rx = rx0 + i, ry = ry0 + j;
      const f = vis(rx, ry);
      if (!f) continue;
      const x = x0 + i * 9, y = y0 + j * 9;
      drawCell(ctx, (f & 0x100) ? 'cell_present' : 'cell_hasbeen', x, y);
      if (rx === world.rx && ry === world.ry) drawCell(ctx, 'cell_current', x, y);
      if (world.mapKeys && world.keyItems.some(k => k.used && k.active && k.rx === rx && k.ry === ry)) drawCell(ctx, 'cell_key', x, y);
      if (world.mapTeleports && world.teleports.some(t => t.active && t.rx === rx && t.ry === ry && t.type !== 3)) drawCell(ctx, 'cell_teleport', x, y);
      if (!(f & 2)) drawCell(ctx, 'left', x, y);
      if (!(f & 4)) drawCell(ctx, 'right', x, y);
      if (!(f & 8)) drawCell(ctx, 'top', x, y);
      if (!(f & 16)) drawCell(ctx, 'bottom', x, y);
    }
  }
  // pass 2: solid walls on top
  for (let j = 0; j < rows; j++) {
    for (let i = 0; i < cols; i++) {
      const f = vis(rx0 + i, ry0 + j);
      if (!f) continue;
      const x = x0 + i * 9, y = y0 + j * 9;
      if (f & 2) drawCell(ctx, 'left_solid', x, y);
      if (f & 4) drawCell(ctx, 'right_solid', x, y);
      if (f & 8) drawCell(ctx, 'top_solid', x, y);
      if (f & 16) drawCell(ctx, 'bottom_solid', x, y);
    }
  }
}

// sub_404bb0 : 10x5 rooms around the current one, in the panel
function drawMiniMap(ctx, world, x, y) {
  drawMapCells(ctx, world, x - 45, y - 18, world.rx - 5, world.ry - 2, 10, 5);
}

export function invalidateRoom() { if (G.world) G.world.redraw = true; }
