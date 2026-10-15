// Casino slot machine in the shop (sub_4114f0 / sub_4118a0 / sub_411630 / sub_4117f0 / sub_41169f).
import { A, S, atoi } from './assets.js';
import { G, rnd } from './globals.js';
import { loadAnimDef, AnimPlayer } from './anim.js';
import { drawSpr, drawSprPart, drawNumber } from './gfx.js';
import { input } from './input.js';
import { playSound, playMusicList } from './audio.js';

export function SlotMachine(world, back, ui) {
  const { T, pic, hit, pressFire } = ui;
  const arrowDef = loadAnimDef('Items\\ArrowLeft.anm', 'Items\\');
  const ap = new AnimPlayer();
  let sel = 0, cnt = 0, bet = 0, state = 0, chain = 200;
  const reel = [(rnd() % 6) * 80, (rnd() % 6) * 80, (rnd() % 6) * 80];
  const left = [0, 0, 0];
  let regions = [];
  const BETS = [1, 2, 3, 4, 5].map(i => atoi(S('Slot_Bet' + i)) || [100, 500, 1000, 5000, 10000][i - 1]);

  const choose = i => {
    if (i <= 4) {
      const v = BETS[i] + bet;
      if (v <= world.score) { bet = v; playSound('Shop.Cash', 100, 50); }
    } else if (i === 5) bet = 0;
    else if (i === 6) { if (bet) { state = 1; playSound('Shop.Chain', 100, 50); } }
    else { bet = 0; back(); }
  };
  const evaluate = () => {
    world.score -= bet;
    const s = reel.map(p => Math.trunc(p / 80));
    let zeros = s.filter(v => v === 0).length, mult = 0;
    if (zeros === 1) mult = 1; else if (zeros === 2) mult = 2; else if (zeros === 3) mult = 4;
    else if (s[0] === s[1] && s[1] === s[2]) mult = [0, 5, 8, 10, 12, 20][s[0]];
    const win = bet * mult;
    world.score += win;
    world.winTotal += win;
    state = 0;
    if (bet > world.score) bet = 0;
  };

  return {
    enter() { playMusicList(['Forest,180']); },
    update() {
      cnt++;
      if (state === 0) {
        if (chain < 200) chain += 2; else chain = 200;
        const c = { cnt };
        if (ui.navKey('down', c)) sel = (sel + 1) % 8;
        else if (ui.navKey('up', c)) sel = (sel + 7) % 8;
        cnt = c.cnt;
        if (pressFire()) { cnt = 0; choose(sel); }
      } else if (state === 1) {
        chain -= 20;
        if (chain <= 0) {
          state = 2;
          left[0] = ((rnd() % 7) + 8) * 80;
          left[1] = ((rnd() % 5) + 5) * 80 + left[0];
          left[2] = ((rnd() % 5) + 5) * 80 + left[1];
        }
      } else if (state === 2) {
        chain = Math.min(200, chain + 2);
        for (let i = 0; i < 3; i++) if (left[i]) { reel[i] = (reel[i] + 20) % 480; left[i] -= 20; }
        if (!left[0] && !left[1] && !left[2]) { world.betTotal += bet; evaluate(); }
        else playSound('Shop.Chain2', 100, 50);
      }
      if (input.esc() && state === 0) { bet = 0; back(); }
    },
    draw(ctx) {
      ctx.drawImage(pic('slot'), 0, 0);
      // lever chain
      if (chain > 0) drawSprPart(ctx, 'shop/slotmachine/chain.bmp', 0, 200 - chain, 200, chain, 660, 182);
      // reels
      for (let i = 0; i < 3; i++) {
        const x = 278 + i * 94;
        const p = reel[i], idx = Math.trunc(p / 80), off = p % 80;
        ctx.save(); ctx.beginPath(); ctx.rect(x, 325, 80, 80); ctx.clip();
        drawSpr(ctx, 'shop/slotmachine/pic0' + (idx + 1) + '.bmp', x, 325 + off);
        drawSpr(ctx, 'shop/slotmachine/pic0' + ((idx + 1) % 6 + 1) + '.bmp', x, 325 + off - 80);
        ctx.restore();
      }
      regions = [];
      for (let i = 0; i < 8; i++) {
        const y = 65 + 22 * i;
        T(ctx, S('Slot_Bet' + (i + 1)), 290, y + 18, 20, y >= 175 ? 0xffee97 : 0xfbd197, 't', 'right');
        regions.push([120, y, 175, 22, i]);
      }
      if (state === 0) {
        if (cnt > 60) ap.set(arrowDef, 'GO', G.time); else { ap.frame = 0; }
        const fi = ap.frameInfo(arrowDef, 0);
        if (fi) drawSpr(ctx, fi.key, 290, sel * 22 + 25, fi.flip);
      }
      drawNumber(ctx, bet, 390, 258, 'digits1');
      drawNumber(ctx, world.score, 390, 278, 'digits1');
    },
    click(x, y) {
      if (state !== 0) return;
      if (x > 640 && y > 150 && y < 420) { choose(6); return; }
      const i = hit(regions, x, y);
      if (i >= 0) { sel = i; choose(i); }
    },
  };
}
