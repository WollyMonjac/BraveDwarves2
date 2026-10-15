// Persistent settings, episode progress, high scores and save games (localStorage instead of the registry/ini files).
const KEY = 'bd2web.v1';

const DEFAULTS = {
  music: 70, sfx: 100, detail: 2, child: 0, gamepad: 1, swap: 0,
  keys: { left: 203, right: 205, up: 200, down: 208, jump: 57, fire: 29, next: 44, map: 15 },
  completed: {},          // episode name -> 1
  scores: [],             // [{name, score}]
  saves: [null, null, null, null, null],
  lastName: '',
};

let cache = null;
function read() {
  try { const s = localStorage.getItem(KEY); return s ? JSON.parse(s) : null; } catch (e) { return null; }
}
export function loadSettings() {
  const s = read() || {};
  cache = Object.assign(JSON.parse(JSON.stringify(DEFAULTS)), s);
  cache.keys = Object.assign({}, DEFAULTS.keys, s.keys || {});
  if (!Array.isArray(cache.saves) || cache.saves.length !== 5) cache.saves = [null, null, null, null, null];
  if (!cache.scores.length) {
    // default table
    cache.scores = [
      { name: 'Vivarus', score: 50000 }, { name: 'Gribarus', score: 40000 }, { name: 'Golem', score: 30000 },
      { name: 'Knight', score: 25000 }, { name: 'Zealot', score: 20000 }, { name: 'Orc', score: 15000 },
      { name: 'Pikeman', score: 10000 }, { name: 'Skeleton', score: 7500 }, { name: 'Bat', score: 5000 },
      { name: 'Frog', score: 2500 },
    ];
  }
  return cache;
}
export function saveSettings() {
  try { localStorage.setItem(KEY, JSON.stringify(cache)); } catch (e) { /* private mode */ }
}
export function settings() { return cache || loadSettings(); }

export function qualifies(score) {
  const s = settings().scores;
  return score > 0 && (s.length < 10 || score > s[s.length - 1].score);
}
export function addScore(name, score) {
  const s = settings().scores;
  s.push({ name: name || '...', score });
  s.sort((a, b) => b.score - a.score);
  s.length = Math.min(10, s.length);
  saveSettings();
  return s.findIndex(e => e.name === name && e.score === score);
}
