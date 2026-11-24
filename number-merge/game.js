// Number Merge — slide and merge tiles (2048 rules).
// Every tile is its own element with a stable id, so it can slide smoothly from
// its old square to its new one. Merges pop after the slide, then the new tile appears.
const $ = (id) => document.getElementById(id);
const N = 4;
const SLIDE_MS = 130; // matches --slide in style.css
const reduceMotion = () => matchMedia('(prefers-reduced-motion: reduce)').matches;

let grid, score, best = 0, prev = null, won = false, keepGoing = false;
let tiles = new Map(); // id -> { id, v, i, el }
let nextId = 1;
let settle = null; // finishes the current animation immediately when a new move comes in
try { best = +localStorage.getItem('merge-best') || 0; } catch { /* storage blocked */ }

const gridEl = $('grid');
const layer = document.createElement('div');
layer.className = 'tiles';
for (let i = 0; i < N * N; i++) {
  const c = document.createElement('div');
  c.className = 'cell';
  gridEl.append(c);
}
gridEl.append(layer);

/* ---------- tile elements ---------- */
function place(t) {
  t.el.style.setProperty('--x', t.i % N);
  t.el.style.setProperty('--y', Math.floor(t.i / N));
}
function paint(t) {
  t.el.textContent = t.v;
  t.el.dataset.v = t.v;
  t.el.classList.toggle('big', t.v > 2048);
}
function makeTile(v, i, cls = '') {
  const el = document.createElement('div');
  el.className = 'tile ' + cls;
  const t = { id: nextId++, v, i, el };
  place(t);
  paint(t);
  layer.append(el);
  tiles.set(t.id, t);
  return t;
}
function rebuild() {
  layer.replaceChildren();
  tiles = new Map();
  grid.forEach((v, i) => v && makeTile(v, i));
}

function addTile() {
  const empty = [];
  grid.forEach((v, i) => !v && empty.push(i));
  if (!empty.length) return null;
  const i = empty[Math.floor(Math.random() * empty.length)];
  grid[i] = Math.random() < 0.9 ? 2 : 4;
  return i;
}
function lineIndexes(dir, k) {
  // the 4 cell indexes of row/column k, ordered in the direction tiles slide towards
  const idx = [];
  for (let j = 0; j < N; j++) {
    if (dir === 'left') idx.push(k * N + j);
    if (dir === 'right') idx.push(k * N + (N - 1 - j));
    if (dir === 'up') idx.push(j * N + k);
    if (dir === 'down') idx.push((N - 1 - j) * N + k);
  }
  return idx;
}

/* Works out the move. Returns null if nothing moves, otherwise the plan for animating it. */
function plan(dir) {
  const at = new Map();
  for (const t of tiles.values()) at.set(t.i, t);
  const moves = []; // { t, to }
  const merges = []; // { keep, gone, v }
  let gained = 0;
  const out = Array(N * N).fill(0);
  for (let k = 0; k < N; k++) {
    const idx = lineIndexes(dir, k);
    const line = idx.map((i) => at.get(i)).filter(Boolean);
    let slot = 0;
    for (let j = 0; j < line.length; j++) {
      const a = line[j], b = line[j + 1];
      const to = idx[slot];
      if (b && a.v === b.v) {
        moves.push({ t: a, to }, { t: b, to });
        merges.push({ keep: a, gone: b, v: a.v * 2 });
        out[to] = a.v * 2;
        gained += a.v * 2;
        j++;
      } else {
        moves.push({ t: a, to });
        out[to] = a.v;
      }
      slot++;
    }
  }
  const moved = moves.some((m) => m.t.i !== m.to) || merges.length > 0;
  return moved ? { moves, merges, gained, out } : null;
}

function move(dir) {
  if (!$('overlay').hidden) return;
  settle?.(); // finish any animation still running, so fast key presses never skip a step
  const p = plan(dir);
  if (!p) return;
  prev = { grid: grid.slice(), score };
  grid = p.out;
  score += p.gained;
  const spawn = addTile();

  // 1) slide every tile to its new square
  for (const { t, to } of p.moves) {
    t.i = to;
    place(t);
  }
  let done = false;
  const finish = () => {
    if (done) return;
    done = true;
    settle = null;
    // 2) merges: remove the tile that was absorbed, double the one that stays, and pop it
    for (const m of p.merges) {
      m.gone.el.remove();
      tiles.delete(m.gone.id);
      m.keep.v = m.v;
      paint(m.keep);
      m.keep.el.classList.remove('merged');
      void m.keep.el.offsetWidth;
      m.keep.el.classList.add('merged');
    }
    // 3) the new tile appears last
    if (spawn !== null) makeTile(grid[spawn], spawn, 'new');
    afterMove();
  };
  settle = finish;
  updateHud();
  if (reduceMotion()) finish();
  else setTimeout(finish, SLIDE_MS);
}

function canMove() {
  for (let i = 0; i < N * N; i++) {
    if (!grid[i]) return true;
    if (i % N < N - 1 && grid[i] === grid[i + 1]) return true;
    if (i < N * (N - 1) && grid[i] === grid[i + N]) return true;
  }
  return false;
}

function updateHud() {
  $('score').textContent = score;
  if (score > best) {
    best = score;
    try { localStorage.setItem('merge-best', best); } catch { /* ignore */ }
  }
  $('best').textContent = best;
  gridEl.setAttribute('aria-label', 'Tiles: ' + grid.map((v) => v || 'empty').join(', '));
}

function afterMove() {
  const max = Math.max(...grid);
  if (max >= 2048 && !won && !keepGoing) {
    won = true;
    showOverlay('You reached 2048! 🎉', `Score: ${score}. You can keep playing for a higher score.`, 'Keep going');
    return;
  }
  if (!canMove()) showOverlay('Game over', `No moves left. Final score: ${score}.`, 'Try again');
  else $('status').textContent = `Highest tile: ${max}. Keep merging!`;
}
function showOverlay(title, text, btn) {
  $('ov-title').textContent = title;
  $('ov-text').textContent = text;
  $('again').textContent = btn;
  $('overlay').hidden = false;
  $('again').focus();
}
$('again').addEventListener('click', () => {
  $('overlay').hidden = true;
  if (won && canMove() && !keepGoing) keepGoing = true;
  else start();
});

function start() {
  settle?.();
  grid = Array(N * N).fill(0);
  score = 0;
  prev = null;
  won = false;
  keepGoing = false;
  addTile();
  addTile();
  rebuild();
  for (const t of tiles.values()) t.el.classList.add('new');
  $('overlay').hidden = true;
  $('status').textContent = 'Use the arrow keys or swipe to slide the tiles.';
  updateHud();
}
$('new').addEventListener('click', start);
$('undo').addEventListener('click', () => {
  if (!prev) return;
  settle?.();
  grid = prev.grid;
  score = prev.score;
  prev = null;
  rebuild();
  $('overlay').hidden = true;
  $('status').textContent = 'Move undone. (One undo per move.)';
  updateHud();
});

const KEYS = { ArrowUp: 'up', ArrowDown: 'down', ArrowLeft: 'left', ArrowRight: 'right', w: 'up', s: 'down', a: 'left', d: 'right' };
document.addEventListener('keydown', (e) => {
  const k = KEYS[e.key] || KEYS[e.key.toLowerCase()];
  if (k) {
    e.preventDefault();
    move(k);
  } else if (e.key.toLowerCase() === 'u') $('undo').click();
});
document.querySelectorAll('.pad button').forEach((b) => b.addEventListener('click', () => move(b.dataset.dir)));
let t0 = null;
gridEl.addEventListener('pointerdown', (e) => (t0 = [e.clientX, e.clientY]));
gridEl.addEventListener('pointerup', (e) => {
  if (!t0) return;
  const dx = e.clientX - t0[0], dy = e.clientY - t0[1];
  if (Math.max(Math.abs(dx), Math.abs(dy)) > 24) move(Math.abs(dx) > Math.abs(dy) ? (dx > 0 ? 'right' : 'left') : dy > 0 ? 'down' : 'up');
  t0 = null;
});
start();
// test hook: lets automated checks set a position and read the tile layer
window.__merge = {
  set(values) { settle?.(); grid = values.slice(); prev = null; rebuild(); updateHud(); },
  state: () => ({ grid: grid.slice(), tiles: [...tiles.values()].map((t) => [t.v, t.i]), score }),
  move,
};
