// Input: keyboard (DirectInput-style scancodes), gamepad and touch controls.
const DIK = {
  Escape: 1, Digit1: 2, Digit2: 3, Digit3: 4, Digit4: 5, Digit5: 6, Digit6: 7, Digit7: 8, Digit8: 9, Digit9: 10, Digit0: 11,
  Minus: 12, Equal: 13, Backspace: 14, Tab: 15, KeyQ: 16, KeyW: 17, KeyE: 18, KeyR: 19, KeyT: 20, KeyY: 21, KeyU: 22,
  KeyI: 23, KeyO: 24, KeyP: 25, BracketLeft: 26, BracketRight: 27, Enter: 28, ControlLeft: 29, KeyA: 30, KeyS: 31,
  KeyD: 32, KeyF: 33, KeyG: 34, KeyH: 35, KeyJ: 36, KeyK: 37, KeyL: 38, Semicolon: 39, Quote: 40, Backquote: 41,
  ShiftLeft: 42, Backslash: 43, KeyZ: 44, KeyX: 45, KeyC: 46, KeyV: 47, KeyB: 48, KeyN: 49, KeyM: 50, Comma: 51,
  Period: 52, Slash: 53, ShiftRight: 54, NumpadMultiply: 55, AltLeft: 56, Space: 57, CapsLock: 58, F1: 59, F2: 60,
  F3: 61, F4: 62, F5: 63, F6: 64, F7: 65, F8: 66, F9: 67, F10: 68, Numpad7: 71, Numpad8: 72, Numpad9: 73,
  NumpadSubtract: 74, Numpad4: 75, Numpad5: 76, Numpad6: 77, NumpadAdd: 78, Numpad1: 79, Numpad2: 80, Numpad3: 81,
  Numpad0: 82, NumpadDecimal: 83, F11: 87, F12: 88, NumpadEnter: 156, ControlRight: 157, NumpadDivide: 181,
  AltRight: 184, Pause: 197, Home: 199, ArrowUp: 200, PageUp: 201, ArrowLeft: 203, ArrowRight: 205, End: 207,
  ArrowDown: 208, PageDown: 209, Insert: 210, Delete: 211,
};
export const DIK_NAMES = {};
for (const [k, v] of Object.entries(DIK)) DIK_NAMES[v] = k.replace(/^Key/, '').replace(/^Digit/, '').replace(/^Arrow/, '');

const held = new Uint8Array(256);     // like 0x9838a8 state
const pressed = new Uint8Array(256);  // like 0x9837a8 (edge, cleared each tick)
const virt = { left: 0, right: 0, up: 0, down: 0, jump: 0, fire: 0, next: 0, map: 0, esc: 0, enter: 0 };
const virtPrev = { ...virt };
let lastKeyCode = 0;
let anyPressed = false;
let pad = { left: 0, right: 0, up: 0, down: 0, jump: 0, fire: 0, next: 0, map: 0, esc: 0, enter: 0 };
let padPrev = { ...pad };

export const keys = {
  left: 203, right: 205, up: 200, down: 208, jump: 57, fire: 29, next: 44, map: 15,
};

function code(e) {
  let c = DIK[e.code];
  if (!c && e.key === 'Escape') c = 1;
  return c || 0;
}

export function initInput(target) {
  window.addEventListener('keydown', e => {
    const c = code(e);
    if (c) {
      if (!held[c]) pressed[c] = 1;
      held[c] = 1;
      lastKeyCode = c;
      anyPressed = true;
    }
    // prevent browser shortcuts for game keys
    if (['Tab', 'Space', 'ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight', 'F6', 'F9', 'F10', 'Backspace'].includes(e.code)
        || (e.ctrlKey && ['ArrowLeft', 'ArrowRight', 'ArrowUp', 'ArrowDown', 'Space'].includes(e.code))) e.preventDefault();
    if (e.code === 'AltLeft' || e.code === 'AltRight') e.preventDefault();
  }, { passive: false });
  window.addEventListener('keyup', e => {
    const c = code(e);
    if (c) held[c] = 0;
  });
  window.addEventListener('blur', () => { held.fill(0); for (const k in virt) virt[k] = 0; });
}

export function setVirtual(name, v) { virt[name] = v ? 1 : 0; if (v) anyPressed = true; }
export function clearVirtual() { for (const k in virt) virt[k] = 0; }

function pollPad() {
  padPrev = pad;
  pad = { left: 0, right: 0, up: 0, down: 0, jump: 0, fire: 0, next: 0, map: 0, esc: 0, enter: 0 };
  const pads = navigator.getGamepads ? navigator.getGamepads() : [];
  for (const p of pads) {
    if (!p) continue;
    const ax = p.axes[0] || 0, ay = p.axes[1] || 0;
    const b = i => p.buttons[i] && p.buttons[i].pressed;
    pad.left |= ax < -0.4 || b(14); pad.right |= ax > 0.4 || b(15);
    pad.up |= ay < -0.4 || b(12); pad.down |= ay > 0.4 || b(13);
    pad.jump |= b(0); pad.fire |= b(2) || b(1) || b(7); pad.next |= b(3) || b(5); pad.map |= b(8) || b(4);
    pad.esc |= b(9); pad.enter |= b(0) || b(9);
  }
  for (const k in pad) if (pad[k] && !padPrev[k]) anyPressed = true;
}

// call once per logic tick, after the game consumed edge events
export function endTick() {
  pressed.fill(0);
  Object.assign(virtPrev, virt);
  anyPressed = false;
}
export function beginTick() { pollPad(); }

const H = c => held[c] !== 0;
export const input = {
  left: () => H(keys.left) || H(203) || H(75) || virt.left || pad.left,
  right: () => H(keys.right) || H(205) || H(77) || virt.right || pad.right,
  up: () => H(keys.up) || H(200) || H(72) || virt.up || pad.up,
  down: () => H(keys.down) || H(208) || H(80) || virt.down || pad.down,
  jump: () => H(keys.jump) || virt.jump || pad.jump,
  fire: () => H(keys.fire) || H(157) || H(45) || virt.fire || pad.fire,
  // edge-triggered
  nextWeapon: () => pressed[keys.next] || (virt.next && !virtPrev.next) || (pad.next && !padPrev.next),
  map: () => pressed[keys.map] || pressed[50] || (virt.map && !virtPrev.map) || (pad.map && !padPrev.map),
  esc: () => pressed[1] || (virt.esc && !virtPrev.esc) || (pad.esc && !padPrev.esc),
  pressed: c => pressed[c] !== 0,
  held: c => held[c] !== 0,
  // menu navigation (edge)
  mUp: () => pressed[200] || pressed[72] || (virt.up && !virtPrev.up) || (pad.up && !padPrev.up),
  mDown: () => pressed[208] || pressed[80] || (virt.down && !virtPrev.down) || (pad.down && !padPrev.down),
  mLeft: () => pressed[203] || pressed[75] || (virt.left && !virtPrev.left) || (pad.left && !padPrev.left),
  mRight: () => pressed[205] || pressed[77] || (virt.right && !virtPrev.right) || (pad.right && !padPrev.right),
  mEnter: () => pressed[28] || pressed[156] || pressed[57] || (virt.enter && !virtPrev.enter) || (pad.enter && !padPrev.enter) || (virt.fire && !virtPrev.fire) || (virt.jump && !virtPrev.jump),
  mFire: () => pressed[keys.fire] || pressed[157] || pressed[45] || pressed[28] || pressed[57] || (virt.fire && !virtPrev.fire) || (pad.fire && !padPrev.fire) || (virt.jump && !virtPrev.jump) || (pad.jump && !padPrev.jump),
  any: () => anyPressed,
  lastKey: () => lastKeyCode,
  takeKey: () => { const k = lastKeyCode; lastKeyCode = 0; return k; },
  clearPressed: () => pressed.fill(0),
};
