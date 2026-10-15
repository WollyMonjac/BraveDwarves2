// Drawing helpers: sprite atlas frames, elements, digits, text.
import { A } from './assets.js';

export const W = 800, H = 600, PLAY_H = 544;

// Draw a sprite atlas frame. (x,y) = top-left of the full (untrimmed) frame.
export function drawSpr(ctx, key, x, y, flip = 0, alpha = 1) {
  const f = A.spr.frames[key];
  if (!f) return false;
  const [p, ax, ay, w, h, ox, oy, fw, fh] = f;
  const img = A.spr.pages[p];
  if (alpha !== 1) { ctx.save(); ctx.globalAlpha = alpha; }
  if (flip === 1) {
    ctx.save();
    ctx.translate(Math.round(x) + fw - ox, Math.round(y) + oy);
    ctx.scale(-1, 1);
    ctx.drawImage(img, ax, ay, w, h, 0, 0, w, h);
    ctx.restore();
  } else if (flip === 2) {
    ctx.save();
    ctx.translate(Math.round(x) + ox, Math.round(y) + fh - oy);
    ctx.scale(1, -1);
    ctx.drawImage(img, ax, ay, w, h, 0, 0, w, h);
    ctx.restore();
  } else {
    ctx.drawImage(img, ax, ay, w, h, Math.round(x) + ox, Math.round(y) + oy, w, h);
  }
  if (alpha !== 1) ctx.restore();
  return true;
}

// Draw part of a sprite (source rect relative to the untrimmed frame)
export function drawSprPart(ctx, key, sx, sy, sw, sh, dx, dy, dw, dh) {
  const f = A.spr.frames[key];
  if (!f) return false;
  const [p, ax, ay, w, h, ox, oy] = f;
  // intersect source rect with trimmed rect
  let x0 = Math.max(sx, ox), y0 = Math.max(sy, oy);
  let x1 = Math.min(sx + sw, ox + w), y1 = Math.min(sy + sh, oy + h);
  if (x1 <= x0 || y1 <= y0) return true;
  const kx = (dw === undefined ? 1 : dw / sw), ky = (dh === undefined ? 1 : dh / sh);
  ctx.drawImage(A.spr.pages[p], ax + (x0 - ox), ay + (y0 - oy), x1 - x0, y1 - y0,
    dx + (x0 - sx) * kx, dy + (y0 - sy) * ky, (x1 - x0) * kx, (y1 - y0) * ky);
  return true;
}

export function sprSize(key) {
  const f = A.spr.frames[key];
  return f ? [f[7], f[8]] : [0, 0];
}

export function drawElement(ctx, name, x, y, flip = 0) {
  const f = A.el.frames[name.toLowerCase()];
  if (!f) return false;
  const [p, ax, ay, w, h, ox, oy, fw, fh] = f;
  ctx.drawImage(A.el.pages[p], ax, ay, w, h, x + ox, y + oy, w, h);
  return true;
}

export function elementSize(name) {
  const k = name.toLowerCase();
  const f = A.el.frames[k];
  if (f) return [f[7], f[8]];
  const b = A.el.bg[k];
  if (b) return [b[1], b[2]];
  return null;
}

// Frame-file helpers (*.frm): returns rect [x,y,w,h]
export function frmRect(path, name) {
  const t = A.ini[path.toLowerCase().replace(/\\/g, '/')];
  if (!t) return null;
  for (const sec of Object.values(t.data)) {
    if (sec.name && sec.name.toLowerCase() === name.toLowerCase()) {
      const r = (sec.rectsx || sec.rect || '').split(',').map(v => parseInt(v, 10));
      return r;
    }
  }
  return null;
}

// Digits from fonts/digits.pcx (frm: digits1 0,0,10,20 ; digits2 0,20 ; digitsRed 0,40 ; weapondigits 0,60,8,11)
export function drawNumber(ctx, n, x, y, which = 'digits1', align = 'left') {
  const r = frmRect('fonts/digits.frm', which);
  if (!r) return 0;
  const s = String(Math.max(0, Math.floor(n)));
  const cw = r[2], ch = r[3];
  let w = s.length * (cw + 1);
  let cx = align === 'center' ? x - (w >> 1) : align === 'right' ? x - w : x;
  for (const c of s) {
    const d = c.charCodeAt(0) - 48;
    drawSprPart(ctx, 'fonts/digits.pcx', r[0] + d * cw, r[1], cw, ch, cx, y);
    cx += cw + 1;
  }
  return w;
}

// Text drawing with the game's inline color codes <0xRRGGBB>
export function drawText(ctx, text, x, y, opts = {}) {
  const size = opts.size || 16;
  const font = opts.font || 'BDTahoma, Tahoma, Verdana, sans-serif';
  ctx.save();
  ctx.font = `${opts.bold ? 'bold ' : ''}${size}px ${font}`;
  ctx.textBaseline = 'top';
  let color = opts.color || '#ffffff';
  const parts = String(text).split(/(<0x[0-9a-fA-F]{6}>)/);
  // measure for alignment
  let total = 0;
  for (const p of parts) if (!/^<0x/.test(p)) total += ctx.measureText(p).width;
  let cx = opts.align === 'center' ? x - total / 2 : opts.align === 'right' ? x - total : x;
  for (const p of parts) {
    const m = p.match(/^<0x([0-9a-fA-F]{6})>$/);
    if (m) { color = '#' + m[1]; continue; }
    if (!p) continue;
    if (opts.shadow !== false) {
      ctx.fillStyle = 'rgba(0,0,0,0.85)';
      ctx.fillText(p, cx + 1, y + 1);
    }
    ctx.fillStyle = color;
    ctx.fillText(p, cx, y);
    cx += ctx.measureText(p).width;
  }
  ctx.restore();
  return total;
}

export function textWidth(ctx, text, size = 16, font = 'BDTahoma, Tahoma, sans-serif', bold = false) {
  ctx.save();
  ctx.font = `${bold ? 'bold ' : ''}${size}px ${font}`;
  const w = ctx.measureText(String(text).replace(/<0x[0-9a-fA-F]{6}>/g, '')).width;
  ctx.restore();
  return w;
}

// word-wrap text into lines (respects \n)
export function wrapText(ctx, text, maxW, size = 16, font = 'BDTahoma, Tahoma, sans-serif') {
  ctx.save();
  ctx.font = `${size}px ${font}`;
  const lines = [];
  for (const para of String(text).split('\n')) {
    const words = para.split(' ');
    let line = '';
    for (const w of words) {
      const t = line ? line + ' ' + w : w;
      if (ctx.measureText(t.replace(/<0x[0-9a-fA-F]{6}>/g, '')).width > maxW && line) { lines.push(line); line = w; }
      else line = t;
    }
    lines.push(line);
  }
  ctx.restore();
  return lines;
}

export function makeCanvas(w, h) {
  const c = document.createElement('canvas');
  c.width = w; c.height = h;
  return c;
}
