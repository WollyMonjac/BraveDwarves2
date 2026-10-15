// Shared global state (mirrors the original's globals)
export const G = {
  world: null,      // current World (episode in progress)
  time: 0,          // game clock in ms (advances 1000/60 per logic tick)
  frame: 0,         // logic frame counter (g_76cb20)
  cdefs: [],        // creature definitions per type
  turnFlag: false,  // g_4b6354
  settings: null,
};

// MSVC rand()
let seed = 1;
export function srand(s) { seed = s >>> 0; }
export function rnd() {
  seed = (Math.imul(seed, 214013) + 2531011) >>> 0;
  return (seed >>> 16) & 0x7fff;
}
