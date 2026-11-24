// Dama (checkers): forced captures, multi-jumps, kings, computer opponent.
const $ = (id) => document.getElementById(id);
const boardEl = $('board');
const RED = 'r', WHITE = 'w';
const isRed = (p) => p === 'r' || p === 'R';
const isKing = (p) => p === 'R' || p === 'W';
const colorOf = (p) => (p ? (isRed(p) ? RED : WHITE) : null);

let board, turn, history, selected, mode = 'cpu', level = 'easy', last = null, busy = false, over = false;

function newBoard() {
  const b = Array.from({ length: 8 }, () => Array(8).fill(null));
  for (let r = 0; r < 8; r++)
    for (let c = 0; c < 8; c++) {
      if ((r + c) % 2 === 0) continue;
      if (r < 3) b[r][c] = 'w';
      else if (r > 4) b[r][c] = 'r';
    }
  return b;
}
const clone = (b) => b.map((row) => row.slice());
const inside = (r, c) => r >= 0 && r < 8 && c >= 0 && c < 8;
function dirs(p) {
  if (isKing(p)) return [[-1, -1], [-1, 1], [1, -1], [1, 1]];
  return isRed(p) ? [[-1, -1], [-1, 1]] : [[1, -1], [1, 1]];
}

// All full capture sequences starting from (r,c).
function jumps(b, r, c, p, path = [], caps = []) {
  const out = [];
  for (const [dr, dc] of dirs(p)) {
    const mr = r + dr, mc = c + dc, lr = r + 2 * dr, lc = c + 2 * dc;
    if (!inside(lr, lc) || b[lr][lc] || !b[mr][mc] || colorOf(b[mr][mc]) === colorOf(p)) continue;
    if (caps.some(([a, d]) => a === mr && d === mc)) continue;
    const nb = clone(b);
    nb[r][c] = null;
    nb[mr][mc] = null;
    const promote = !isKing(p) && ((isRed(p) && lr === 0) || (!isRed(p) && lr === 7));
    const np = promote ? p.toUpperCase() : p;
    nb[lr][lc] = np;
    const seq = { path: [...path, [lr, lc]], caps: [...caps, [mr, mc]] };
    const more = promote ? [] : jumps(nb, lr, lc, np, seq.path, seq.caps);
    if (more.length) out.push(...more);
    else out.push(seq);
  }
  return out;
}

function legalMoves(b, color) {
  const caps = [], steps = [];
  for (let r = 0; r < 8; r++)
    for (let c = 0; c < 8; c++) {
      const p = b[r][c];
      if (colorOf(p) !== color) continue;
      for (const j of jumps(b, r, c, p)) caps.push({ from: [r, c], ...j });
      for (const [dr, dc] of dirs(p)) {
        const nr = r + dr, nc = c + dc;
        if (inside(nr, nc) && !b[nr][nc]) steps.push({ from: [r, c], path: [[nr, nc]], caps: [] });
      }
    }
  return caps.length ? caps : steps; // captures are compulsory
}

function apply(b, m) {
  const nb = clone(b);
  let [r, c] = m.from;
  let p = nb[r][c];
  nb[r][c] = null;
  for (const [cr, cc] of m.caps) nb[cr][cc] = null;
  [r, c] = m.path[m.path.length - 1];
  if (!isKing(p) && ((isRed(p) && r === 0) || (!isRed(p) && r === 7))) p = p.toUpperCase();
  nb[r][c] = p;
  return nb;
}

/* ---------- computer player ---------- */
function evaluate(b) {
  let s = 0;
  for (let r = 0; r < 8; r++)
    for (let c = 0; c < 8; c++) {
      const p = b[r][c];
      if (!p) continue;
      let v = isKing(p) ? 175 : 100;
      if (!isKing(p)) v += (isRed(p) ? 7 - r : r) * 4; // advancing men
      if (c === 0 || c === 7) v += 4;
      s += isRed(p) ? -v : v; // positive is good for White (the computer)
    }
  return s;
}
function search(b, depth, color, alpha, beta) {
  const moves = legalMoves(b, color);
  if (!moves.length) return color === WHITE ? -100000 : 100000;
  if (depth === 0) return evaluate(b);
  if (color === WHITE) {
    let best = -Infinity;
    for (const m of moves) {
      best = Math.max(best, search(apply(b, m), depth - 1, RED, alpha, beta));
      alpha = Math.max(alpha, best);
      if (alpha >= beta) break;
    }
    return best;
  }
  let best = Infinity;
  for (const m of moves) {
    best = Math.min(best, search(apply(b, m), depth - 1, WHITE, alpha, beta));
    beta = Math.min(beta, best);
    if (alpha >= beta) break;
  }
  return best;
}
function cpuMove() {
  const moves = legalMoves(board, WHITE);
  if (level === 'easy' && Math.random() < 0.35) return moves[Math.floor(Math.random() * moves.length)];
  const depth = level === 'hard' ? 6 : 2;
  let best = null, bestV = -Infinity;
  for (const m of moves) {
    const v = search(apply(board, m), depth - 1, RED, -Infinity, Infinity) + Math.random();
    if (v > bestV) { bestV = v; best = m; }
  }
  return best;
}

/* ---------- UI ---------- */
function count(color) {
  return board.flat().filter((p) => colorOf(p) === color).length;
}
function setStatus(text, cls = '') {
  const s = $('status');
  s.textContent = text;
  s.className = 'status ' + cls;
}
function render() {
  const moves = over ? [] : legalMoves(board, turn);
  const mustFrom = moves.length && moves[0].caps.length ? moves.map((m) => m.from.join()) : [];
  const targets = selected ? moves.filter((m) => m.from[0] === selected[0] && m.from[1] === selected[1]) : [];
  boardEl.replaceChildren();
  for (let r = 0; r < 8; r++)
    for (let c = 0; c < 8; c++) {
      const sq = document.createElement('button');
      sq.type = 'button';
      sq.className = 'sq' + ((r + c) % 2 ? ' dark' : '');
      sq.dataset.r = r;
      sq.dataset.c = c;
      const p = board[r][c];
      const name = 'abcdefgh'[c] + (8 - r);
      let label = name;
      if (p) {
        const d = document.createElement('div');
        d.className = 'piece ' + (isRed(p) ? 'red' : 'white');
        if (isKing(p)) d.textContent = '★';
        sq.append(d);
        label += `, ${isRed(p) ? 'red' : 'white'} ${isKing(p) ? 'king' : 'piece'}`;
      }
      if (selected && selected[0] === r && selected[1] === c) sq.classList.add('sel');
      if (!selected && mustFrom.includes(`${r},${c}`) && isHumanTurn()) sq.classList.add('must');
      if (last && last.some(([a, b]) => a === r && b === c)) sq.classList.add('last');
      if (targets.some((m) => { const [a, b] = m.path[m.path.length - 1]; return a === r && b === c; })) {
        const dot = document.createElement('span');
        dot.className = 'dot';
        sq.append(dot);
        label += ', you can move here';
      }
      if ((r + c) % 2 === 0) sq.tabIndex = -1;
      sq.setAttribute('aria-label', label);
      boardEl.append(sq);
    }
  $('red-count').textContent = count(RED);
  $('white-count').textContent = count(WHITE);
}
const isHumanTurn = () => mode === 'two' || turn === RED;

function play(m) {
  history.push({ board: clone(board), turn, last });
  board = apply(board, m);
  last = [m.from, ...m.path];
  selected = null;
  turn = turn === RED ? WHITE : RED;
  checkEnd();
  render();
  if (!over && mode === 'cpu' && turn === WHITE) {
    busy = true;
    setStatus('Computer is thinking…');
    setTimeout(() => {
      const cm = cpuMove();
      busy = false;
      play(cm);
    }, 450);
  }
}

function checkEnd() {
  const moves = legalMoves(board, turn);
  if (moves.length) {
    const who = mode === 'cpu' ? (turn === RED ? 'Your turn.' : 'Computer to move.') : `${turn === RED ? 'Red' : 'White'} to move.`;
    setStatus(moves[0].caps.length && isHumanTurn() ? `${who} You must capture (pieces with a yellow ring).` : who);
    return;
  }
  over = true;
  const winner = turn === RED ? WHITE : RED;
  if (mode === 'cpu') setStatus(winner === RED ? 'You win! 🎉 Press New game to play again.' : 'The computer wins. Try again!', winner === RED ? 'win' : 'lose');
  else setStatus(`${winner === RED ? 'Red' : 'White'} wins! 🎉`, 'win');
}

boardEl.addEventListener('click', (e) => {
  const sq = e.target.closest('.sq');
  if (!sq || busy || over || !isHumanTurn()) return;
  const r = +sq.dataset.r, c = +sq.dataset.c;
  const moves = legalMoves(board, turn);
  if (selected) {
    const m = moves.find((mv) => mv.from[0] === selected[0] && mv.from[1] === selected[1] && mv.path[mv.path.length - 1][0] === r && mv.path[mv.path.length - 1][1] === c);
    if (m) return play(m);
  }
  if (colorOf(board[r][c]) === turn) {
    if (moves.some((m) => m.from[0] === r && m.from[1] === c)) {
      selected = [r, c];
      setStatus('Now click a green dot to move.');
    } else {
      selected = null;
      setStatus(moves[0]?.caps.length ? 'You must capture! Choose a piece with a yellow ring.' : 'That piece cannot move. Pick another one.');
    }
  } else selected = null;
  render();
  boardEl.querySelector(`[data-r="${r}"][data-c="${c}"]`)?.focus();
});

function start() {
  board = newBoard();
  turn = RED;
  history = [];
  selected = null;
  last = null;
  over = false;
  busy = false;
  setStatus(mode === 'cpu' ? 'Your turn. Pick a red piece.' : 'Red to move.');
  render();
}
$('new').addEventListener('click', start);
$('undo').addEventListener('click', () => {
  if (busy || !history.length) return;
  let steps = mode === 'cpu' ? (turn === RED ? 2 : 1) : 1;
  while (steps-- && history.length) ({ board, turn, last } = history.pop());
  over = false;
  selected = null;
  checkEnd();
  render();
});
document.querySelectorAll('[data-mode]').forEach((b) =>
  b.addEventListener('click', () => {
    mode = b.dataset.mode;
    document.querySelectorAll('[data-mode]').forEach((x) => x.setAttribute('aria-pressed', String(x === b)));
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
window.__dama = { legalMoves, apply, newBoard };
