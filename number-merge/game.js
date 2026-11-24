// Number Merge — slide and merge tiles (2048 rules).
const $ = (id) => document.getElementById(id);
const N = 4;
let grid, score, best = 0, prev = null, won = false, keepGoing = false, fresh = new Set(), merged = new Set();
try { best = +localStorage.getItem('merge-best') || 0; } catch { /* storage blocked */ }

const gridEl = $('grid');
for (let i = 0; i < N * N; i++) {
  const t = document.createElement('div');
  t.className = 'tile';
  gridEl.append(t);
}

function addTile() {
  const empty = [];
  grid.forEach((v, i) => !v && empty.push(i));
  if (!empty.length) return;
  const i = empty[Math.floor(Math.random() * empty.length)];
  grid[i] = Math.random() < 0.9 ? 2 : 4;
  fresh.add(i);
}
function lineIndexes(dir, k) {
  // returns the 4 cell indexes of row/column k, ordered in the direction tiles slide towards
  const idx = [];
  for (let j = 0; j < N; j++) {
    if (dir === 'left') idx.push(k * N + j);
    if (dir === 'right') idx.push(k * N + (N - 1 - j));
    if (dir === 'up') idx.push(j * N + k);
    if (dir === 'down') idx.push((N - 1 - j) * N + k);
  }
  return idx;
}
function slide(dir) {
  let moved = false, gained = 0;
  merged = new Set();
  fresh = new Set();
  const before = grid.slice();
  for (let k = 0; k < N; k++) {
    const idx = lineIndexes(dir, k);
    const vals = idx.map((i) => grid[i]).filter(Boolean);
    const out = [];
    for (let j = 0; j < vals.length; j++) {
      if (vals[j] === vals[j + 1]) {
        out.push(vals[j] * 2);
        gained += vals[j] * 2;
        merged.add(idx[out.length - 1]);
        j++;
      } else out.push(vals[j]);
    }
    idx.forEach((i, j) => {
      const v = out[j] || 0;
      if (grid[i] !== v) moved = true;
      grid[i] = v;
    });
  }
  if (!moved) return false;
  prev = { grid: before, score };
  score += gained;
  addTile();
  return true;
}
function canMove() {
  for (let i = 0; i < N * N; i++) {
    if (!grid[i]) return true;
    if (i % N < N - 1 && grid[i] === grid[i + 1]) return true;
    if (i < N * (N - 1) && grid[i] === grid[i + N]) return true;
  }
  return false;
}

function render() {
  [...gridEl.children].forEach((t, i) => {
    const v = grid[i];
    t.textContent = v || '';
    t.dataset.v = v || '';
    t.className = 'tile' + (v > 2048 ? ' big' : '') + (fresh.has(i) ? ' new' : '') + (merged.has(i) ? ' merged' : '');
  });
  $('score').textContent = score;
  if (score > best) {
    best = score;
    try { localStorage.setItem('merge-best', best); } catch { /* ignore */ }
  }
  $('best').textContent = best;
  gridEl.setAttribute('aria-label', 'Tiles: ' + grid.map((v) => v || 'empty').join(', '));
}

function move(dir) {
  if (!$('overlay').hidden) return;
  if (!slide(dir)) return;
  render();
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
  grid = Array(N * N).fill(0);
  score = 0;
  prev = null;
  won = false;
  keepGoing = false;
  fresh = new Set();
  merged = new Set();
  addTile();
  addTile();
  $('overlay').hidden = true;
  $('status').textContent = 'Use the arrow keys or swipe to slide the tiles.';
  render();
}
$('new').addEventListener('click', start);
$('undo').addEventListener('click', () => {
  if (!prev) return;
  grid = prev.grid;
  score = prev.score;
  prev = null;
  fresh = new Set();
  merged = new Set();
  $('overlay').hidden = true;
  $('status').textContent = 'Move undone. (One undo per move.)';
  render();
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
