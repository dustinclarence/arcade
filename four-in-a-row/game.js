// Four in a Row: 7 x 6 grid, computer uses minimax with alpha-beta pruning.
const $ = (id) => document.getElementById(id);
const COLS = 7, ROWS = 6, YOU = 1, OPP = 2;
let grid, turn, over, busy, mode = 'cpu', level = 'hard', lastDrop = null, winCells = [];
let humanFirst = true; // Red always drops first; you choose Red (first) or Yellow (second)
const firstP = () => (mode === 'two' || humanFirst ? YOU : OPP);
const colorName = (p) => (p === firstP() ? 'Red' : 'Yellow');
const score = { you: 0, opp: 0, draw: 0 };

const boardEl = $('board');
for (let c = 0; c < COLS; c++) {
  const col = document.createElement('button');
  col.type = 'button';
  col.className = 'col';
  col.dataset.c = c;
  for (let r = 0; r < ROWS; r++) {
    const cell = document.createElement('div');
    cell.className = 'cell';
    col.append(cell);
  }
  boardEl.append(col);
}

const lowest = (g, c) => {
  for (let r = ROWS - 1; r >= 0; r--) if (!g[r][c]) return r;
  return -1;
};
function lineAt(g, r, c) {
  const p = g[r][c];
  for (const [dr, dc] of [[0, 1], [1, 0], [1, 1], [1, -1]]) {
    const cells = [[r, c]];
    for (const s of [1, -1]) {
      let rr = r + dr * s, cc = c + dc * s;
      while (rr >= 0 && rr < ROWS && cc >= 0 && cc < COLS && g[rr][cc] === p) {
        cells.push([rr, cc]);
        rr += dr * s;
        cc += dc * s;
      }
    }
    if (cells.length >= 4) return cells;
  }
  return null;
}
const full = (g) => g[0].every(Boolean);

/* ---------- AI ---------- */
function scoreWindow(w, me) {
  const mine = w.filter((x) => x === me).length, theirs = w.filter((x) => x && x !== me).length, empty = 4 - mine - theirs;
  if (mine === 4) return 1000;
  if (mine === 3 && empty === 1) return 6;
  if (mine === 2 && empty === 2) return 2;
  if (theirs === 3 && empty === 1) return -8;
  return 0;
}
function heuristic(g, me) {
  let s = 0;
  for (let r = 0; r < ROWS; r++) if (g[r][3] === me) s += 3;
  for (let r = 0; r < ROWS; r++)
    for (let c = 0; c < COLS; c++)
      for (const [dr, dc] of [[0, 1], [1, 0], [1, 1], [1, -1]]) {
        const w = [];
        for (let k = 0; k < 4; k++) {
          const rr = r + dr * k, cc = c + dc * k;
          if (rr < 0 || rr >= ROWS || cc < 0 || cc >= COLS) break;
          w.push(g[rr][cc]);
        }
        if (w.length === 4) s += scoreWindow(w, me);
      }
  return s;
}
const ORDER = [3, 2, 4, 1, 5, 0, 6];
function minimax(g, depth, alpha, beta, maximizing, me) {
  const other = me === OPP ? YOU : OPP;
  if (depth === 0 || full(g)) return heuristic(g, me);
  let best = maximizing ? -Infinity : Infinity;
  for (const c of ORDER) {
    const r = lowest(g, c);
    if (r < 0) continue;
    g[r][c] = maximizing ? me : other;
    let v;
    if (lineAt(g, r, c)) v = maximizing ? 100000 + depth : -100000 - depth;
    else v = minimax(g, depth - 1, alpha, beta, !maximizing, me);
    g[r][c] = 0;
    if (maximizing) { best = Math.max(best, v); alpha = Math.max(alpha, v); }
    else { best = Math.min(best, v); beta = Math.min(beta, v); }
    if (alpha >= beta) break;
  }
  return best;
}
function cpuColumn() {
  const valid = ORDER.filter((c) => lowest(grid, c) >= 0);
  if (level === 'easy' && Math.random() < 0.45) return valid[Math.floor(Math.random() * valid.length)];
  const depth = level === 'hard' ? 6 : 2;
  let bestC = valid[0], bestV = -Infinity;
  for (const c of valid) {
    const r = lowest(grid, c);
    grid[r][c] = OPP;
    const v = lineAt(grid, r, c) ? 1e6 : minimax(grid, depth - 1, -Infinity, Infinity, false, OPP);
    grid[r][c] = 0;
    if (v > bestV) { bestV = v; bestC = c; }
  }
  return bestC;
}

/* ---------- UI ---------- */
function setStatus(t, cls = '') {
  $('status').textContent = t;
  $('status').className = 'status ' + cls;
}
function render() {
  [...boardEl.children].forEach((col, c) => {
    const free = lowest(grid, c);
    col.disabled = over || busy || free < 0 || (mode === 'cpu' && turn === OPP);
    col.setAttribute('aria-label', `Column ${c + 1}${free < 0 ? ', full' : ''}`);
    [...col.children].forEach((cell, r) => {
      cell.classList.toggle('preview', r === free && !over);
      const v = grid[r][c];
      const disc = cell.firstElementChild;
      if (!v) { disc?.remove(); return; }
      if (!disc) {
        const d = document.createElement('div');
        d.className = 'disc ' + (v === firstP() ? 'red' : 'yellow');
        if (lastDrop && lastDrop[0] === r && lastDrop[1] === c && !matchMedia('(prefers-reduced-motion: reduce)').matches) {
          d.classList.add('drop');
          d.style.setProperty('--from', `${-(r + 1) * 115}%`);
          d.style.setProperty('--t', `${0.18 + r * 0.05}s`);
        }
        cell.append(d);
      }
      cell.firstElementChild.classList.toggle('win', winCells.some(([a, b]) => a === r && b === c));
      cell.firstElementChild.classList.toggle('last', !!lastDrop && lastDrop[0] === r && lastDrop[1] === c && !winCells.length);
    });
  });
  $('s-you').textContent = score.you;
  $('s-opp').textContent = score.opp;
  $('s-draw').textContent = score.draw;
  $('you-label').textContent = mode === 'cpu' ? `You (${colorName(YOU)})` : 'Red';
  $('opp-label').textContent = mode === 'cpu' ? `Computer (${colorName(OPP)})` : 'Yellow';
}

function drop(c) {
  const r = lowest(grid, c);
  if (r < 0 || over) return;
  grid[r][c] = turn;
  lastDrop = [r, c];
  const line = lineAt(grid, r, c);
  if (line) {
    over = true;
    winCells = line;
    if (turn === YOU) score.you++;
    else score.opp++;
    setStatus(mode === 'cpu' ? (turn === YOU ? 'You win! 🎉 Press New game to play again.' : 'The computer wins. Try again!') : `${colorName(turn)} wins! 🎉`, turn === YOU || mode === 'two' ? 'win' : 'lose');
  } else if (full(grid)) {
    over = true;
    score.draw++;
    setStatus('It\'s a draw. Press New game to play again.');
  } else {
    turn = turn === YOU ? OPP : YOU;
    setStatus(mode === 'cpu' ? (turn === YOU ? 'Your turn. Choose a column.' : 'Computer is thinking…') : `${colorName(turn)}'s turn.`);
  }
  render();
  if (!over && mode === 'cpu' && turn === OPP) {
    busy = true;
    render();
    setTimeout(() => {
      busy = false;
      drop(cpuColumn());
    }, 500);
  }
}

boardEl.addEventListener('click', (e) => {
  const col = e.target.closest('.col');
  if (col && !col.disabled) drop(+col.dataset.c);
});
document.addEventListener('keydown', (e) => {
  if (e.key >= '1' && e.key <= '7' && !busy && !(mode === 'cpu' && turn === OPP)) drop(+e.key - 1);
  if (e.key.toLowerCase() === 'n') start();
});

function start() {
  grid = Array.from({ length: ROWS }, () => Array(COLS).fill(0));
  turn = firstP();
  over = false;
  busy = false;
  lastDrop = null;
  winCells = [];
  setStatus(mode === 'cpu' ? (turn === YOU ? 'Your turn. You are Red, so you go first.' : 'The computer is Red and goes first…') : "Red's turn.");
  render();
  if (mode === 'cpu' && turn === OPP) {
    busy = true;
    render();
    setTimeout(() => {
      busy = false;
      drop(cpuColumn());
    }, 600);
  }
}
$('new').addEventListener('click', start);
$('reset').addEventListener('click', () => {
  score.you = score.opp = score.draw = 0;
  render();
});
document.querySelectorAll('[data-mode]').forEach((b) =>
  b.addEventListener('click', () => {
    mode = b.dataset.mode;
    document.querySelectorAll('[data-mode]').forEach((x) => x.setAttribute('aria-pressed', String(x === b)));
    score.you = score.opp = score.draw = 0;
    start();
  }),
);
document.querySelectorAll('[data-side]').forEach((b) =>
  b.addEventListener('click', () => {
    humanFirst = b.dataset.side === 'first';
    document.querySelectorAll('[data-side]').forEach((x) => x.setAttribute('aria-pressed', String(x === b)));
    start();
  }),
);
document.querySelectorAll('[data-level]').forEach((b) =>
  b.addEventListener('click', () => {
    level = b.dataset.level;
    document.querySelectorAll('[data-level]').forEach((x) => x.setAttribute('aria-pressed', String(x === b)));
  }),
);
start();
