// Screens: title, main menu, character/episode selection, game (with map, message and pause overlays),
// shop, completed, high scores, options, help, credits and the end screen.
import { A, S, loadEpisode, loadEpisodePic, ini, tok, atoi } from './assets.js';
import { G, rnd, srand } from './globals.js';
import { loadAnimDef, AnimPlayer } from './anim.js';
import { drawSpr, drawSprPart, drawNumber, wrapText, textWidth } from './gfx.js';
import { input, keys as keyMap, DIK_NAMES } from './input.js';
import { World, BELT } from './world.js';
import { drawWorld, drawHUD, drawMapCells } from './render.js';
import { playMusicList, stopMusic, audioSettings, applyVolumes, playSound } from './audio.js';
import { settings, saveSettings, qualifies, addScore } from './settings.js';
import { saveGame, loadGame, saveSummary } from './savegame.js';

let host = null;
export function setScreenHost(h) { host = h; }

const MENU_MUSIC = ['Mines2,120', 'Mines2,120', 'Shop,180'];

// ------------------------------------------------------------------ text helpers
const FONT = { z: 'BDZepplin, Georgia, serif', t: 'BDTahoma, Tahoma, Verdana, sans-serif' };
function rgb(c) { return '#' + c.toString(16).padStart(6, '0'); }
// sub_40cb90 drawn twice: black at +1, then colored (baseline at y)
export function T(ctx, s, x, y, size, color = 0xffffff, font = 'z', align = 'left') {
  ctx.save();
  ctx.font = `${size}px ${FONT[font]}`;
  ctx.textBaseline = 'alphabetic';
  ctx.textAlign = align;
  const lines = String(s).split('\n');
  let yy = y;
  for (const line of lines) {
    // inline color codes <0xRRGGBB>
    const parts = line.split(/(<0x[0-9a-fA-F]{6}>)/);
    let total = 0;
    for (const p of parts) if (!/^<0x/.test(p)) total += ctx.measureText(p).width;
    let cx = align === 'center' ? x - total / 2 : align === 'right' ? x - total : x;
    ctx.textAlign = 'left';
    let col = rgb(color);
    for (const p of parts) {
      const m = p.match(/^<0x([0-9a-fA-F]{6})>$/);
      if (m) { col = '#' + m[1]; continue; }
      if (!p) continue;
      ctx.fillStyle = '#000'; ctx.fillText(p, cx + 1, yy + 1);
      ctx.fillStyle = col; ctx.fillText(p, cx, yy);
      cx += ctx.measureText(p).width;
    }
    yy += Math.round(size * 1.2);
  }
  ctx.restore();
}
function tw(ctx, s, size, font = 'z') { return textWidth(ctx, s, size, FONT[font]); }
function fmt(s, ...a) { let i = 0; return String(s).replace(/%d|%s/g, () => String(a[i++])); }
function pic(name) { return A.pics[name]; }

// animated menu arrow (Items\ArrowRight.anm / ArrowUp.anm)
class Arrow {
  constructor(file) { this.def = loadAnimDef('Items\\' + file + '.anm', 'Items\\'); this.p = new AnimPlayer(); this.t = 0; }
  draw(ctx, x, y, animate = true) {
    if (animate) this.p.set(this.def, 'GO', G.time); else { this.p.frame = 0; this.p.t0 = G.time; }
    const fi = this.p.frameInfo(this.def, 0);
    if (fi) drawSpr(ctx, fi.key, x, y, fi.flip);
  }
  get w() { return this.def.bw; }
}

// held-key repeat used by every menu (counter > 9); a fresh key press always moves at once
const EDGE = { up: 'mUp', down: 'mDown', left: 'mLeft', right: 'mRight' };
export function navKey(dir, cntObj) {
  if (input[EDGE[dir]]()) { cntObj.cnt = 0; return true; }
  if (cntObj.cnt > 9 && input[dir]()) { cntObj.cnt = 0; return true; }
  return false;
}
class MenuNav {
  constructor(n, wrap = true) { this.n = n; this.sel = 0; this.cnt = 0; this.wrap = wrap; }
  step(prevKey = 'up', nextKey = 'down') {
    this.cnt++;
    let moved = false;
    if (navKey(prevKey, this)) { this.sel--; if (this.sel < 0) this.sel = this.n - 1; moved = true; }
    else if (navKey(nextKey, this)) { this.sel++; if (this.sel >= this.n) this.sel = 0; moved = true; }
    return moved;
  }
}
const pressFire = () => input.mFire() || input.pressed(28) || input.pressed(156);

// clickable regions for touch / mouse
function hit(list, x, y) { for (const r of list) if (x >= r[0] && x < r[0] + r[2] && y >= r[1] && y < r[1] + r[3]) return r[4]; return -1; }

// ================================================================== Title (sub_417950)
function TitleScreen() {
  let t = 0, go = false;
  return {
    enter() { t = 0; playMusicList(MENU_MUSIC); },
    update() { t++; if (t > 10 && (input.any() || go)) host.set(MenuScreen()); },
    draw(ctx) {
      ctx.drawImage(pic('title1'), 0, 0);
      if (t > 60 && (Math.floor(t / 40) & 1)) T(ctx, S('AnyKey', 'Press any key'), 400, 585, 20, 0xffff00, 'z', 'center');
    },
    click() { go = true; },
  };
}

// ================================================================== Main menu (sub_411c70 / sub_412190)
const MENU_ITEMS = ['Menu_Begin', 'Menu_Load', 'Menu_Score', 'Menu_Options', 'Menu_Help', 'Menu_Credits', 'Menu_ExitGame'];
function MenuScreen() {
  const arrow = new Arrow('ArrowRight');
  const nav = new MenuNav(7);
  let loadMode = false;
  let regions = [];
  const choose = i => {
    if (loadMode) {
      if (i < 0 || i > 4) return;
      const s = settings().saves[i];
      if (!s) return;
      startFromSave(i);
      return;
    }
    switch (i) {
      case 0: host.set(EpisodeScreen()); break;
      case 1: loadMode = true; nav.n = 5; nav.sel = 0; break;
      case 2: host.set(ScoreScreen(null)); break;
      case 3: host.set(OptionsScreen(() => MenuScreen())); break;
      case 4: host.set(HelpScreen()); break;
      case 5: host.set(CreditsScreen()); break;
      case 6: host.set(TitleScreen()); break;
    }
  };
  return {
    enter() { playMusicList(MENU_MUSIC); nav.sel = 0; },
    update() {
      nav.step();
      if (input.esc() && loadMode) { loadMode = false; nav.n = 7; nav.sel = 1; return; }
      if (pressFire()) choose(nav.sel);
    },
    draw(ctx) {
      ctx.drawImage(pic('menu1'), 0, 0);
      regions = [];
      if (!loadMode) {
        MENU_ITEMS.forEach((k, i) => {
          T(ctx, S(k), 300, 300 + 35 * i, 32, 0xffff00);
          regions.push([280, 300 + 35 * i - 32, 360, 35, i]);
        });
        arrow.draw(ctx, 300 - arrow.w, nav.sel * 35 + 258, nav.cnt > 30);
      } else {
        T(ctx, S('ExitMenu_Load'), 400, 230, 32, 0xffffff, 't', 'center');
        const saves = settings().saves;
        for (let i = 0; i < 5; i++) {
          T(ctx, fmt('%d. %s', i + 1, saves[i] ? saveSummary(saves[i]) : '.'), 250, 300 + 35 * i, 20, saves[i] ? 0xffffff : 0x909090, 't');
          regions.push([230, 300 + 35 * i - 26, 520, 35, i]);
        }
        arrow.draw(ctx, 250 - 50 - arrow.w + 30, nav.sel * 35 + 258, nav.cnt > 30);
        T(ctx, S('Help_Esc', 'ESCAPE - back'), 400, 580, 18, 0xffffff, 't', 'center');
        regions.push([0, 540, 800, 60, 99]);
      }
    },
    click(x, y) {
      const i = hit(regions, x, y);
      if (i === 99) { loadMode = false; nav.n = 7; nav.sel = 1; return; }
      if (i >= 0) { nav.sel = i; choose(i); }
    },
  };
}

// ================================================================== Character + episode select (sub_40dfd0 / sub_40e440)
function EpisodeScreen() {
  const up = new Arrow('ArrowUp'), right = new Arrow('ArrowRight');
  let mode = 1, sel = 0, cnt = 0, hero = 1, t = 0;
  const eps = A.episodes;
  const done = settings().completed;
  const unlocked = i => i === 0 || !!done[eps[i - 1]] || !!settings().unlockAll;
  let regions = [];
  const start = async i => {
    if (i === eps.length) { host.set(MenuScreen()); return; }
    if (!unlocked(i)) return;
    host.set(LoadingScreen(eps[i], hero));
  };
  eps.forEach(e => loadEpisodePic(e).catch(() => {}));
  return {
    enter() { mode = 1; sel = 0; t = 0; },
    update() {
      t++; cnt++;
      if (input.esc()) { if (mode === 0) { mode = 1; sel = hero - 1; } else host.set(MenuScreen()); return; }
      const c = { cnt };
      if (mode === 1) {
        if (navKey('left', c)) sel = 0;
        else if (navKey('right', c)) sel = 1;
        cnt = c.cnt;
        if (t > 5 && pressFire()) { hero = sel + 1; mode = 0; sel = 0; cnt = 0; }
      } else {
        if (navKey('up', c)) { sel--; if (sel < 0) sel = eps.length; }
        else if (navKey('down', c)) { sel++; if (sel > eps.length) sel = 0; }
        cnt = c.cnt;
        if (t > 5 && pressFire()) start(sel);
      }
    },
    draw(ctx) {
      ctx.drawImage(pic('menu1'), 0, 0);
      regions = [];
      if (mode === 1) {
        ctx.drawImage(pic('portrait1'), 200, 300);
        ctx.drawImage(pic('portrait2'), 450, 300);
        up.draw(ctx, sel * 250 + 230, 450, cnt > 20);
        T(ctx, S('Character_Select'), 400, 560, 26, 0xffffff, 'z', 'center');
        regions.push([200, 300, 150, 150, 0], [450, 300, 150, 150, 1]);
      } else {
        const p = sel < eps.length ? A.pics['ep_' + eps[sel].toLowerCase()] : null;
        if (p) { ctx.drawImage(p, 100, 203); drawSpr(ctx, 'pics/episodeframe.bmp', 84, 187); }
        T(ctx, S('Episode_Select'), 120, 500, 26, 0xffffff);
        eps.forEach((e, i) => {
          const col = done[e] ? 0x00ff00 : unlocked(i) ? 0xffff00 : 0x8a8a8a;
          T(ctx, S('Episode_' + e, e), 450, 220 + 22 * i, 22, col);
          regions.push([440, 220 + 22 * i - 20, 340, 22, i]);
        });
        T(ctx, S('Back'), 450, 220 + 22 * eps.length, 22, 0xff8aff);
        regions.push([440, 220 + 22 * eps.length - 20, 340, 22, eps.length]);
        right.draw(ctx, 450 - right.w, sel * 22 + 180, cnt > 30);
        if (sel < eps.length) {
          if (done[eps[sel]]) T(ctx, S('Episode_OK'), 220, 440, 22, 0x00ff00, 'z', 'center');
          else if (!unlocked(sel)) T(ctx, S('Episode_Prev').replace(/\\n/g, '\n'), 220, 430, 18, 0xff8080, 'z', 'center');
        }
      }
    },
    click(x, y) {
      const i = hit(regions, x, y);
      if (i < 0) return;
      if (mode === 1) { hero = i + 1; sel = 0; mode = 0; cnt = 0; }
      else { if (sel === i) start(i); else sel = i; }
    },
  };
}

// ================================================================== Loading (progress bar) then the game
function LoadingScreen(ep, hero, after) {
  let p = 0, started = false, err = null;
  return {
    enter() {
      stopMusic();
      loadEpisode(ep).then(data => {
        p = 0.6;
        setTimeout(() => {
          try {
            srand((Date.now() ^ (Math.random() * 1e9)) & 0x7fffffff);
            const w = new World(data, hero, { child: settings().child });
            w.epKey = ep;
            if (after) after(w);
            host.set(GameScreen(w));
          } catch (e) { console.error(e); err = e; }
        }, 30);
      }).catch(e => { err = e; });
      started = true;
    },
    update() { if (p < 0.55) p += 0.02; },
    draw(ctx) {
      ctx.drawImage(pic('loading'), 0, 0);
      const b1 = pic('progressbar1'), b2 = pic('progressbar2');
      if (b1 && b2) {
        ctx.drawImage(b1, 0, 500);
        const w = Math.floor(800 * p);
        if (w > 0) ctx.drawImage(b2, 0, 0, w, 80, 0, 500, w, 80);
      }
      if (err) T(ctx, 'Viga: ' + err.message, 400, 470, 18, 0xff6060, 't', 'center');
    },
  };
}

function startFromSave(slot) {
  const s = settings().saves[slot];
  if (!s) return;
  host.set(LoadingScreen(s.ep, s.hero, w => loadGame(w, s)));
}

// ================================================================== Game (sub_40ffa0 / sub_4072b0 modes)
function GameScreen(world) {
  let mode = 0;           // 0 play, 1 map, 2 message, 3 pause menu, 4 save/load
  const arrow = new Arrow('ArrowRight');
  const pause = new MenuNav(5);
  let saveMode = 0, saveNav = new MenuNav(6);
  let regions = [];
  let msgT = 0;
  let toast = null;
  const S2 = n => settings().saves[n];
  const doSave = n => { settings().saves[n] = saveGame(world); saveSettings(); toast = { text: 'Salvestatud', t: 90 }; mode = 0; };
  const doLoad = n => { const s = S2(n); if (s) startFromSave(n); };
  const quitToScores = () => host.set(ScoreScreen(world.score, world));
  // sub_405c30: typed cheat codes
  let typed = '';
  const CHEATS = ['giveallkeys', 'givemoney', 'theend', 'givemap', 'givecompass', 'givependant'];
  const onChar = e => {
    if (e.key.length !== 1) return;
    typed = (typed + e.key.toLowerCase()).slice(-20);
    const i = CHEATS.findIndex(c => typed.endsWith(c));
    if (i >= 0) { typed = ''; world.cheated = (world.cheated || 0) + 1; world.cheat(i); }
  };
  const scr = {
    ingame: true,
    enter() { if (world.music.length) playMusicList(world.music); window.addEventListener('keydown', onChar); },
    leave() { window.removeEventListener('keydown', onChar); },
    autoPause() { if (mode === 0) { mode = 3; pause.sel = 0; pause.cnt = 0; } },
    update() {
      if (toast && --toast.t <= 0) toast = null;
      if (mode === 3) {
        pause.step();
        if (input.esc()) { mode = 0; return; }
        if (pressFire()) {
          switch (pause.sel) {
            case 0: mode = 0; break;
            case 1: host.set(OptionsScreen(() => scr)); break;
            case 2: mode = 4; saveMode = 1; saveNav.sel = 0; break;
            case 3: mode = 4; saveMode = 0; saveNav.sel = 0; break;
            case 4: quitToScores(); break;
          }
        }
        return;
      }
      if (mode === 4) {
        saveNav.step();
        if (input.esc()) { mode = 3; return; }
        if (pressFire()) {
          if (saveNav.sel === 5) { mode = 3; return; }
          if (saveMode) doSave(saveNav.sel); else doLoad(saveNav.sel);
        }
        return;
      }
      if (mode === 1) { if (input.map() || input.esc() || input.mFire()) mode = 0; return; }
      if (mode === 2) {
        msgT++;
        if (msgT > 10 && (input.mFire() || input.jump() || input.esc())) { mode = 0; world.message = null; input.clearPressed(); }
        return;
      }
      // play
      if (input.esc() || input.pressed(68) || input.pressed(197)) { mode = 3; pause.sel = 0; pause.cnt = 0; return; }
      if (world.gameOver && (input.mFire() || input.jump())) { quitToScores(); return; }
      if (input.map()) { mode = 1; return; }
      if (input.pressed(64)) { doSave(0); return; }          // F6 quick save
      if (input.pressed(67) && S2(0)) { doLoad(0); return; }  // F9 quick load
      world.tick();
      for (const ev of world.events.splice(0)) {
        if (ev === 'message') { mode = 2; msgT = 0; }
        else if (ev === 'shop') host.set(ShopScreen(world, scr));
        else if (ev === 'completed') {
          settings().completed[world.epKey] = 1; saveSettings();
          host.set(CompletedScreen(world));
          return;
        }
      }
    },
    draw(ctx) {
      drawWorld(ctx, world);
      regions = [];
      if (mode === 1) drawMap(ctx, world);
      else if (mode === 2) drawMessage(ctx, world.message ? world.message.text : '');
      else if (mode === 3) {
        const mx = (800 - 356) >> 1;
        drawSpr(ctx, 'map/message.bmp', mx, 0);
        ['ExitMenu_No', 'ExitMenu_Options', 'ExitMenu_Save', 'ExitMenu_Load', 'ExitMenu_Yes'].forEach((k, i) => {
          T(ctx, S(k), mx + 80, 150 + 50 * i, 28, 0xaf7000);
          regions.push([mx + 40, 150 + 50 * i - 34, 300, 46, i]);
        });
        arrow.draw(ctx, mx - arrow.w + 80, pause.sel * 50 + 108, pause.cnt > 120);
      } else if (mode === 4) {
        const mx = (800 - 356) >> 1;
        drawSpr(ctx, 'map/message.bmp', mx, 0);
        T(ctx, S(saveMode ? 'ExitMenu_Save' : 'ExitMenu_Load'), 400, 100, 26, 0xaf7000, 'z', 'center');
        for (let i = 0; i < 5; i++) {
          const s = S2(i);
          T(ctx, `${i + 1}. ${s ? saveSummary(s) : '.'}`, mx + 70, 160 + 45 * i, 17, s ? 0x5a3000 : 0x907050, 't');
          regions.push([mx + 30, 160 + 45 * i - 30, 320, 45, i]);
        }
        T(ctx, S('Back'), mx + 70, 160 + 45 * 5, 22, 0xaf7000);
        regions.push([mx + 30, 160 + 45 * 5 - 30, 320, 45, 5]);
        arrow.draw(ctx, mx + 70 - arrow.w, saveNav.sel * 45 + 160 - 42, true);
      }
      if (world.gameOver && mode === 0) {
        T(ctx, S('GameOver', 'GAME OVER'), 400, 300, 54, 0xffffff, 'z', 'center');
        T(ctx, S('AnyKey'), 400, 350, 28, 0xffffff, 'z', 'center');
      }
      if (toast) T(ctx, toast.text, 400, 40, 22, 0xffff00, 't', 'center');
      drawHUD(ctx, world);
    },
    click(x, y) {
      if (mode === 3) { const i = hit(regions, x, y); if (i >= 0) { pause.sel = i; input.clearPressed(); setTimeout(() => {}, 0); fakeFire(); } }
      else if (mode === 4) { const i = hit(regions, x, y); if (i >= 0) { saveNav.sel = i; fakeFire(); } }
      else if (mode === 1 || mode === 2) fakeFire();
      else if (world.gameOver) quitToScores();
    },
  };
  return scr;
}
// a tap acts like pressing Enter for one tick
let fakeFireFlag = false;
function fakeFire() { fakeFireFlag = true; }
const _mFire = input.mFire;
input.mFire = () => { if (fakeFireFlag) { fakeFireFlag = false; return true; } return _mFire(); };

// message window (sub_40f550)
function drawMessage(ctx, text) {
  const mx = (800 - 356) >> 1;
  drawSpr(ctx, 'map/message.bmp', mx, 0);
  const lines = [];
  for (const l of String(text).replace(/\\n/g, '\n').split('\n')) lines.push(...wrapText(ctx, l, 260, 20, FONT.t));
  lines.forEach((l, i) => T(ctx, l, mx + 50, 120 + i * 26, 20, 0xaf7000, 't'));
  T(ctx, S('PressFire', 'Press fire to continue'), mx + 50, 400, 15, 0xaf7000, 't');
}

// full map (sub_40ec30)
function drawMap(ctx, w) {
  drawSpr(ctx, 'map/gamemap.bmp', 0, 0);
  const [bx0, by0, bx1, by1] = w.border;
  const x0 = Math.trunc(((bx0 - bx1) * 9 + 800) / 2);
  drawMapCells(ctx, w, x0, 120 + by0 * 9, bx0, by0, bx1 - bx0, by1 - by0);
  T(ctx, fmt(S('MapKeys', 'Keys: %d / %d'), w.keys, w.mainKeys), 120, 455, 22, 0xffff00, 't');
  T(ctx, fmt(S('MapScore', 'Score: %d'), w.score), 520, 455, 22, 0xffff00, 't');
}

// ================================================================== Shop (sub_4169e0 / sub_417210 / sub_416df0)
function loadProducts(heroType) {
  const tree = ini('Shop\\Shop.ini') || [];
  const out = [];
  for (const [k, a, ch] of tree) {
    if (k !== 'PRODUCT') continue;
    const p = { name: a.trim(), image: '', price: 0, qty: 0, who: 0, kind: 1, weapon: '', time: 0 };
    for (const [k2, a2] of ch) {
      if (k2 === 'IMAGE') p.image = a2.trim();
      else if (k2 === 'PRICE') p.price = atoi(a2);
      else if (k2 === 'QUANTITY') p.qty = atoi(a2);
      else if (k2 === 'WHO_CAN_BUY') p.who = atoi(a2);
      else if (k2 === 'TIME') p.time = atoi(a2);
      else if (k2 === 'BUY_EVENT') {
        const t = tok(a2, ' ,\t');
        if ((t[0] || '').toLowerCase() === 'addweapon') { p.kind = 0; p.weapon = (t[1] || '').toLowerCase(); } else p.kind = 1;
      }
    }
    if (!p.who || p.who === heroType) out.push(p);
  }
  return out;
}
const SHOP_AX = [40, 70, 180, 290, 400, 510, 620, 680], SHOP_AY = [300, 100, 100, 100, 100, 100, 100, 300];
function ShopScreen(world, gameScr) {
  const h = world.hero;
  const viv = loadAnimDef('Creatures\\Vivarus\\Creature.ini', 'Creatures\\Vivarus\\');
  const vivP = new AnimPlayer();
  const dw = h.type === 1 ? 'Dwarf1' : 'Dwarf2';
  const hero = loadAnimDef('Creatures\\' + dw + '\\InShop.ini', 'Creatures\\' + dw + '\\');
  const heroP = new AnimPlayer();
  const up = new Arrow('ArrowUp');
  let state = 0, hx = 800, sel = 0, cnt = 0, nextWave = 0, waveN = 0, askAt = 0, askN = 0, vivAnim = 'Stay';
  const bg = ((G.time - world.startTime) % 600000) < 300000 ? 'shop2' : 'shop1';
  // pick 6 random different products (sub_416ce0)
  const all = loadProducts(world.heroType).filter(p =>
    !(p.name === 'ItemMap' && world.mapAll) && !(p.name === 'ItemCompass' && world.mapKeys) && !(p.name === 'ItemPendant' && world.mapTeleports));
  const shelf = [];
  for (let guard = 0; shelf.length < 6 && guard < 10000; guard++) {
    const p = all[rnd() % all.length];
    if (!shelf.includes(p)) shelf.push(p);
  }
  shelf.forEach(p => { p.active = 1; });
  let regions = [];
  const leave = () => { state = 1; heroP.set(hero, 'GO1', G.time); };
  const buy = i => {
    const p = shelf[i];
    if (!p || !p.active) return;
    if (p.price > world.score) return;
    const slots = h.slots;
    let ok = false;
    if (p.kind === 0) {
      let free = 0;
      for (let j = 0; j < 6; j++) {
        if (!slots[j].level && !free) free = j;
        if (slots[j].name === p.weapon) { slots[j].count += p.qty; ok = true; break; }
      }
      if (!ok && free) {
        const s = slots[free];
        s.name = p.weapon; s.level = 1; s.count = p.qty; s.item = 0; s.next = 0;
        ok = true;
      }
    } else {
      const belt = ['Ring1', 'Ring2', 'Ring3', 'Ring4', 'Ring5', 'ItemPin', 'ItemBowl'];
      if (belt.includes(p.name)) {
        let s = null;
        for (let j = 0; j < 6; j++) {
          if (!slots[j].level && !s) s = slots[j];
          if (slots[j].name === p.name) { s = slots[j]; break; }
        }
        if (s) { s.item = 1; s.name = p.name; s.count = p.time * 60; s.level = 1; ok = true; }
      } else if (p.name === 'ItemLife') { world.lives++; ok = true; }
      else if (p.name === 'ItemCompass') { world.mapKeys = 1; ok = true; }
      else if (p.name === 'ItemMap') { world.mapAll = 1; ok = true; }
      else if (p.name === 'ItemPendant') { world.mapTeleports = 1; ok = true; }
    }
    if (ok) {
      p.active = 0;
      world.score -= p.price;
      playSound('Shop.Cash', 100, 50);
    }
    h.hp = h.maxhp;
  };
  return {
    ingame: false,
    enter() { playMusicList(['Shop,180']); heroP.set(hero, 'Go1', G.time); vivP.set(viv, 'Stay', G.time); askAt = G.time + 2000; },
    update() {
      if (G.time > nextWave && state !== 1) {
        playSound('Shop.Wave', (rnd() % 20) + 80, rnd() % 100);
        nextWave = (rnd() % 6000) + G.time + 1500;
        if (!(++waveN % 3)) playSound('Shop.Gulls', (rnd() % 20) + 80, rnd() % 100);
      }
      if (state === 0) { hx -= 2; if (hx - 400 < 60) { state = 2; heroP.set(hero, 'Stay', G.time); } }
      else if (state === 1) { hx += 2; if (hx > 800) { host.set(gameScr); return; } }
      else if (state === 2) {
        cnt++;
        const c = { cnt };
        if (navKey('right', c)) sel = (sel + 1) % 8;
        else if (navKey('left', c)) sel = (sel + 7) % 8;
        cnt = c.cnt;
        {
          if (pressFire() || input.mUp()) {
            cnt = 0;
            if (sel >= 1 && sel <= 6) buy(sel - 1);
            else if (sel === 7) leave();
            else host.set(SlotMachineScreen(world));
          }
        }
      }
      if (input.esc()) leave();
    },
    draw(ctx) {
      ctx.drawImage(pic(bg), 0, 0);
      drawSpr(ctx, 'shop/board.bmp', 0, 50);
      // shelf items
      for (let k = 0; k < 6; k++) {
        const p = shelf[k];
        const x = 70 + 110 * k;
        if (p && p.active) drawSpr(ctx, 'shop/' + p.image.toLowerCase() + '.bmp', x, 100);
        else drawSpr(ctx, 'shop/shelf.bmp', x, 100);
      }
      T(ctx, S('ShopTitle'), 390, 60 + 22, 30, 0xff8f00, 'z', 'center');
      regions = [];
      for (let k = 0; k < 6; k++) {
        const p = shelf[k];
        const x = SHOP_AX[k + 1], y = SHOP_AY[k + 1];
        regions.push([x, y, 100, 140, k + 1]);
        if (!p || !p.active) continue;
        T(ctx, String(p.price), x + 10, y + 90 + 18, 20, 0xffffff);
        const nm = S(p.name, p.name);
        const lines = wrapText(ctx, nm, 96, 16, FONT.z);
        lines.slice(0, 2).forEach((l, j) => T(ctx, l, x + 6, y + 125 + 16 + j * 16, 15, 0xffffff));
      }
      T(ctx, S('ShopGame'), SHOP_AX[0], SHOP_AY[0] + 18, 20, 0xff8f00);
      T(ctx, S('ShopExit'), SHOP_AX[7], SHOP_AY[7] + 18, 20, 0xff8f00);
      regions.push([SHOP_AX[0] - 10, SHOP_AY[0] - 10, 110, 50, 0], [SHOP_AX[7] - 10, SHOP_AY[7] - 10, 120, 50, 7]);
      // merchant
      if (vivAnim !== 'Stay' && vivP.event(viv) === '') { /* keep */ }
      if (G.time > askAt) { askAt = G.time + (rnd() % 3000) + 2000; vivAnim = ['Ask1', 'Ask2', 'Ask3'][++askN % 3]; vivP.set(viv, vivAnim, G.time); }
      else vivP.set(viv, null, G.time);
      let fi = vivP.frameInfo(viv, 0);
      if (fi) drawSpr(ctx, fi.key, 400, 497 - viv.bh, fi.flip);
      drawHUD(ctx, world);
      heroP.set(hero, null, G.time);
      fi = heroP.frameInfo(hero, 0);
      if (fi) drawSpr(ctx, fi.key, hx, 497 - hero.bh, fi.flip);
      if (state === 2) {
        const yo = sel >= 1 && sel < 7 ? 150 : 20;
        up.draw(ctx, SHOP_AX[sel], SHOP_AY[sel] + yo, cnt > 20);
      }
    },
    click(x, y) {
      if (state !== 2) return;
      const i = hit(regions, x, y);
      if (i < 0) return;
      sel = i; cnt = 10;
      if (i >= 1 && i <= 6) buy(i - 1);
      else if (i === 7) leave();
      else host.set(SlotMachineScreen(world));
    },
  };
}

// ================================================================== Slot machine placeholder (filled in slotmachine.js)
import { SlotMachine } from './slotmachine.js';
function SlotMachineScreen(world) {
  const prev = host.screen;
  return SlotMachine(world, () => host.set(prev), { T, pic, hit, pressFire, MenuNav, navKey });
}

// ================================================================== Completed (sub_40d020 / sub_40d180)
function CompletedScreen(world) {
  const viv = loadAnimDef('Creatures\\Vivarus\\CreatureLeft.ini', 'Creatures\\Vivarus\\');
  const vp = new AnimPlayer();
  let t = 0, askAt = 0, askN = 0;
  const epi = A.episodes.indexOf(world.epKey);
  const mins = Math.trunc((G.time - world.startTime) / 60000);
  return {
    enter() { vp.set(viv, 'Stay', G.time); askAt = G.time + 2000; },
    update() {
      t++;
      if (t > 10 && (pressFire() || input.esc())) {
        if (epi === A.episodes.length - 1) host.set(EndScreen(world));
        else host.set(ScoreScreen(world.score, world));
      }
    },
    draw(ctx) {
      ctx.drawImage(pic('score'), 0, 0);
      const ep = A.pics['ep_' + world.epKey.toLowerCase()];
      if (ep) ctx.drawImage(ep, 475, 275);
      drawSpr(ctx, 'pics/episodeframe.bmp', 459, 259);
      let y = 160;
      T(ctx, S('Completed1'), 100, y, 20, 0xffffff, 't');
      T(ctx, fmt(S('Completed2'), S('Episode_' + world.epKey, world.epKey)), 100, 200, 20, 0xffffff, 't');
      T(ctx, fmt(S('Completed3'), Math.trunc(mins / 60), mins % 60), 100, 240, 20, 0xffffff, 't');
      y = 280;
      T(ctx, fmt(S('Completed4'), world.itemsCollected, world.itemsTotal), 100, y, 20, 0xffffff, 't');
      if (world.secretTotal) { y = 320; T(ctx, fmt(S('Completed5'), world.secretCollected, world.secretTotal), 100, y, 20, 0xffffff, 't'); }
      if (world.betTotal || world.winTotal) { y += 40; T(ctx, fmt(S('Completed6'), world.betTotal, world.winTotal), 100, y, 20, 0xffffff, 't'); }
      T(ctx, fmt(S('Completed7'), world.score), 100, y + 40, 20, 0xffffff, 't');
      if (G.time > askAt) { askAt = G.time + (rnd() % 3000) + 2000; vp.set(viv, ['Ask1', 'Ask2', 'Ask3'][++askN % 3], G.time); }
      else vp.set(viv, null, G.time);
      const fi = vp.frameInfo(viv, 0);
      if (fi) drawSpr(ctx, fi.key, 380, 460 - viv.bh, fi.flip);
      T(ctx, S('AnyKey'), 400, 570, 20, 0xffffff, 't', 'center');
    },
    click() { fakeFire(); },
  };
}

// ================================================================== End (sub_40dd00)
function EndScreen(world) {
  let t = 0;
  return {
    update() { t++; if (t > 30 && (pressFire() || input.esc())) host.set(ScoreScreen(world.score, world)); },
    draw(ctx) {
      ctx.drawImage(pic('theend'), 0, 0);
      ['HappyEnd1', 'HappyEnd2', 'HappyEnd3', 'HappyEnd4'].forEach((k, i) => T(ctx, S(k), 400, 120 + i * 40, i ? 24 : 36, i ? 0xffffff : 0xffff00, 'z', 'center'));
    },
    click() { fakeFire(); },
  };
}

// ================================================================== High scores (sub_4156a0, without the online posting)
function ScoreScreen(score, world) {
  let entering = score !== null && score !== undefined && qualifies(score) && !(world && world.cheated);
  let name = entering ? (settings().lastName || '') : '';
  let rank = -1, t = 0, caret = 0;
  let input_el = null;
  const finish = () => {
    if (!entering) return;
    entering = false;
    t = 0;
    settings().lastName = name;
    rank = addScore(name || '???', score);
    if (input_el) { input_el.remove(); input_el = null; }
  };
  const onKey = e => {
    if (!entering) return;
    if (e.key === 'Enter') { finish(); e.preventDefault(); return; }
    if (e.key === 'Backspace') { name = name.slice(0, -1); e.preventDefault(); return; }
    if (e.key.length === 1 && name.length < 16) { name += e.key; e.preventDefault(); }
  };
  return {
    enter() {
      playMusicList(MENU_MUSIC);
      window.addEventListener('keydown', onKey);
      if (entering && ('ontouchstart' in window)) {
        // on phones, a real input field brings up the on-screen keyboard
        input_el = document.createElement('input');
        Object.assign(input_el.style, { position: 'absolute', left: '50%', top: '30%', transform: 'translateX(-50%)', fontSize: '20px', zIndex: 10, width: '60%' });
        input_el.value = name; input_el.maxLength = 16;
        input_el.addEventListener('input', () => { name = input_el.value; });
        input_el.addEventListener('keydown', e => { if (e.key === 'Enter') { finish(); } e.stopPropagation(); });
        document.getElementById('wrap').appendChild(input_el);
        setTimeout(() => input_el && input_el.focus(), 50);
      }
    },
    leave() { window.removeEventListener('keydown', onKey); if (input_el) input_el.remove(); },
    update() {
      t++; caret++;
      if (entering) return;
      if (t > 15 && (pressFire() || input.esc())) host.set(MenuScreen());
    },
    draw(ctx) {
      ctx.drawImage(pic('score'), 0, 0);
      T(ctx, S('BestPlayers'), 400, 82 + 28, 30, 0xffff00, 'z', 'center');
      const list = settings().scores;
      list.forEach((e, i) => {
        const col = i === rank ? 0x00ff00 : 0xffffff;
        const y = 156 + i * 32 + 8;
        T(ctx, `${i + 1}.`, 110, y, 24, col, 'z');
        T(ctx, e.name, 160, y, 24, col, 'z');
        T(ctx, String(e.score), 690, y, 24, col, 'z', 'right');
      });
      if (entering) {
        ctx.fillStyle = 'rgba(0,40,40,0.92)'; ctx.fillRect(120, 230, 560, 120);
        ctx.strokeStyle = '#d8d040'; ctx.strokeRect(120.5, 230.5, 560, 120);
        T(ctx, S('Post_Name', 'Name:') + ' ' + name + ((caret >> 4) & 1 ? '_' : ''), 150, 280, 26, 0xffff00, 't');
        T(ctx, fmt(S('MapScore', 'Score: %d'), score), 150, 325, 22, 0xffffff, 't');
      } else T(ctx, S('AnyKey'), 400, 572, 20, 0xffffff, 'z', 'center');
    },
    click() { if (entering) finish(); else fakeFire(); },
  };
}

// ================================================================== Options (sub_412fc0 / sub_413040)
function OptionsScreen(back) {
  const st = settings();
  const arrow = new Arrow('ArrowRight');
  const rows = [
    { k: 'Option_Music', get: () => st.music + '%', adj: d => { st.music = Math.max(0, Math.min(100, st.music + d * 10)); } },
    { k: 'Option_Sound', get: () => st.sfx + '%', adj: d => { st.sfx = Math.max(0, Math.min(100, st.sfx + d * 10)); } },
    { k: 'Option_Child', get: () => S(st.child ? 'Child_ON' : 'Child_OFF'), adj: () => { st.child = st.child ? 0 : 1; } },
    { k: 'Control_Pad', get: () => S(st.gamepad ? 'GamePadOn' : 'GamePadOff'), adj: () => { st.gamepad = st.gamepad ? 0 : 1; } },
    { k: 'UnlockAll', label: 'Kõik episoodid avatud', txt: 'Lubab valida mis tahes episoodi, ilma eelmisi läbimata.', get: () => (st.unlockAll ? 'Jah' : 'Ei'), adj: () => { st.unlockAll = st.unlockAll ? 0 : 1; } },
    ...['left', 'right', 'up', 'down', 'jump', 'fire', 'next', 'map'].map(n => ({
      k: { left: 'Control_Left', right: 'Control_Right', up: 'Control_Up', down: 'Control_Down', jump: 'Control_Jump', fire: 'Control_Fire', next: 'Control_Next', map: 'Control_Map' }[n],
      get: () => DIK_NAMES[st.keys[n]] || '?', bind: n,
    })),
    { k: 'Control_back', back: true },
  ];
  const nav = new MenuNav(rows.length);
  let waiting = null, regions = [];
  const apply = () => {
    audioSettings.music = st.music; audioSettings.sfx = st.sfx; applyVolumes();
    Object.assign(keyMap, st.keys);
    saveSettings();
  };
  const activate = i => {
    const r = rows[i];
    if (r.back) { apply(); host.set(back()); return; }
    if (r.bind) { waiting = r.bind; input.takeKey(); return; }
    r.adj(1); apply();
  };
  return {
    update() {
      if (waiting) {
        const k = input.takeKey();
        if (k && k !== 1) { st.keys[waiting] = k; waiting = null; apply(); input.clearPressed(); }
        else if (k === 1) waiting = null;
        return;
      }
      nav.step();
      const r = rows[nav.sel];
      if (r.adj) {
        if (navKey('left', nav)) { r.adj(-1); apply(); }
        else if (navKey('right', nav)) { r.adj(1); apply(); }
      }
      if (input.esc()) { apply(); host.set(back()); return; }
      if (pressFire()) activate(nav.sel);
    },
    draw(ctx) {
      ctx.drawImage(pic('menu1'), 0, 0);
      ctx.fillStyle = 'rgba(0,0,0,0.55)'; ctx.fillRect(130, 168, 640, 424);
      regions = [];
      rows.forEach((r, i) => {
        const y = 198 + i * 25;
        T(ctx, r.label || S(r.k), 210, y, 20, i === nav.sel ? 0xffff00 : 0xffffff);
        if (r.get) T(ctx, waiting === r.bind && r.bind ? '...' : r.get(), 560, y, 18, 0x00ff00, 't');
        regions.push([180, y - 21, 580, 25, i]);
      });
      arrow.draw(ctx, 210 - arrow.w, nav.sel * 25 + 198 - 42, true);
      const txt = rows[nav.sel].txt || S(rows[nav.sel].k + '_TXT', '');
      if (txt && txt !== rows[nav.sel].k + '_TXT') {
        wrapText(ctx, txt, 600, 14, FONT.t).slice(0, 2).forEach((l, j) => T(ctx, l, 450, 557 + j * 17, 14, 0xffffc0, 't', 'center'));
      }
    },
    click(x, y) {
      const i = hit(regions, x, y);
      if (i < 0) return;
      nav.sel = i;
      if (rows[i].adj) { rows[i].adj(x < 590 ? 1 : 1); apply(); } else activate(i);
    },
  };
}

// ================================================================== Help (sub_4105f0 / sub_410790): texts/eng/hp1..hp9
function HelpScreen() {
  const pages = [];
  for (let i = 1; i <= 9; i++) { const t = A.texts['texts/eng/hp' + i + '.txt']; if (t) pages.push(t); }
  let page = 0, t = 0;
  const go = d => { page = Math.max(0, Math.min(pages.length - 1, page + d)); };
  return {
    update() {
      t++;
      if (input.esc()) { host.set(MenuScreen()); return; }
      if (input.pressed(209) || input.mRight() || input.mDown() || (t > 5 && pressFire())) { if (page === pages.length - 1 && pressFire()) { host.set(MenuScreen()); return; } go(1); }
      if (input.pressed(201) || input.mLeft() || input.mUp()) go(-1);
    },
    draw(ctx) {
      ctx.drawImage(pic('menu1'), 0, 0);
      ctx.fillStyle = 'rgba(0,30,30,0.82)'; ctx.fillRect(60, 130, 680, 420);
      ctx.strokeStyle = '#c8b040'; ctx.strokeRect(60.5, 130.5, 680, 420);
      const raw = pages[page] || '';
      let y = 165;
      for (const para of raw.replace(/\r/g, '').split('\n')) {
        const p = para.replace(/\[[^\]]*\]/g, '').trimEnd();
        if (!p) { y += 10; continue; }
        for (const l of wrapText(ctx, p, 640, 17, FONT.t)) { if (y < 530) T(ctx, l, 80, y, 17, 0xffffff, 't'); y += 21; }
      }
      if (page === 7 && pic('help8')) ctx.drawImage(pic('help8'), 540, 340);
      T(ctx, fmt(S('Help_Page', 'Page %d/%d'), page + 1, pages.length), 400, 575, 18, 0xffff00, 't', 'center');
      T(ctx, '◀', 90, 578, 26, 0xffff00, 't', 'center');
      T(ctx, '▶', 710, 578, 26, 0xffff00, 't', 'center');
      T(ctx, '✕', 760, 120, 26, 0xffffff, 't', 'center');
    },
    click(x, y) {
      if (x > 720 && y < 140) { host.set(MenuScreen()); return; }
      if (x < 400) go(-1); else { if (page === pages.length - 1) host.set(MenuScreen()); else go(1); }
    },
  };
}

// ================================================================== Credits (sub_40d4b0 / sub_40d340)
function CreditsScreen() {
  const text = (A.texts['texts/eng/credits_eng.txt'] || '').replace(/\r/g, '').split('\n');
  let y = 600, t = 0;
  return {
    update() { t++; y -= 0.6; if (y < -text.length * 26 - 50) y = 600; if (t > 10 && (pressFire() || input.esc())) host.set(MenuScreen()); },
    draw(ctx) {
      ctx.drawImage(pic('credits'), 0, 0);
      ctx.save(); ctx.beginPath(); ctx.rect(0, 120, 800, 440); ctx.clip();
      text.forEach((l, i) => { const yy = y + i * 26; if (yy > 100 && yy < 600) T(ctx, l.trim(), 400, yy, 20, /^[A-ZÄÖÜÕ0-9 .,:-]+$/.test(l.trim()) ? 0xffff00 : 0xffffff, 't', 'center'); });
      ctx.restore();
    },
    click() { fakeFire(); },
  };
}

export const Screens = {
  title: TitleScreen,
  menu: MenuScreen,
  async quickStart(ep, hero) {
    const data = await loadEpisode(ep);
    await loadEpisodePic(ep).catch(() => {});
    const w = new World(data, hero, { child: settings().child });
    w.epKey = A.episodes.find(e => e.toLowerCase() === ep.toLowerCase()) || ep;
    host.set(GameScreen(w));
  },
};
