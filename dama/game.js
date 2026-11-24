// Dama (Filipino checkers): men capture both ways, flying kings, compulsory maximum capture.
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
const DIAGS = [[-1, -1], [-1, 1], [1, -1], [1, 1]];
// Ordinary pieces ("men") step diagonally forward only.
const forward = (p) => (isRed(p) ? [[-1, -1], [-1, 1]] : [[1, -1], [1, 1]]);

/*
  Filipino Dama capture rules used in this version:
  - Men capture forward AND backward by jumping an adjacent opponent.
  - A king ("dama") is a flying king: it moves any distance along an open
    diagonal, and captures by jumping one opponent piece at any distance,
    landing on any empty square beyond it.
  - Captured pieces stay on the board until the whole move ends, so they
    cannot be jumped twice and they block the path.
  - A capture sequence continues as long as captures are possible.
  - A man is crowned only if its move ENDS on the far row.
*/
function captureSeqs(b, r, c, p, caps, path) {
  const out = [];
  const isCap = (rr, cc) => caps.some(([a, d]) => a === rr && d === cc);
  for (const [dr, dc] of DIAGS) {
    if (isKing(p)) {
      let rr = r + dr, cc = c + dc;
      while (inside(rr, cc) && !b[rr][cc]) { rr += dr; cc += dc; }
      if (!inside(rr, cc) || colorOf(b[rr][cc]) === colorOf(p) || isCap(rr, cc)) continue;
      let lr = rr + dr, lc = cc + dc;
      while (inside(lr, lc) && !b[lr][lc]) {
        const seq = { caps: [...caps, [rr, cc]], path: [...path, [lr, lc]] };
        const more = captureSeqs(b, lr, lc, p, seq.caps, seq.path);
        out.push(...(more.length ? more : [seq]));
        lr += dr; lc += dc;
      }
    } else {
      const mr = r + dr, mc = c + dc, lr = r + 2 * dr, lc = c + 2 * dc;
      if (!inside(lr, lc) || b[lr][lc] || !b[mr][mc] || colorOf(b[mr][mc]) === colorOf(p) || isCap(mr, mc)) continue;
      const seq = { caps: [...caps, [mr, mc]], path: [...path, [lr, lc]] };
      const more = captureSeqs(b, lr, lc, p, seq.caps, seq.path);
      out.push(...(more.length ? more : [seq]));
    }
  }
  return out;
}

function legalMoves(b, color) {
  const caps = [], steps = [];
  for (let r = 0; r < 8; r++)
    for (let c = 0; c < 8; c++) {
      const p = b[r][c];
      if (colorOf(p) !== color) continue;
      const work = clone(b);
      work[r][c] = null; // the moving piece leaves its square
      for (const seq of captureSeqs(work, r, c, p, [], [])) caps.push({ from: [r, c], ...seq });
      for (const [dr, dc] of isKing(p) ? DIAGS : forward(p)) {
        let nr = r + dr, nc = c + dc;
        while (inside(nr, nc) && !b[nr][nc]) {
          steps.push({ from: [r, c], path: [[nr, nc]], caps: [] });
          if (!isKing(p)) break;
          nr += dr; nc += dc;
        }
      }
    }
  if (!caps.length) return steps;
  // Captures are compulsory, and you must take the route that captures the most pieces.
  const most = Math.max(...caps.map((m) => m.caps.length));
  return caps.filter((m) => m.caps.length === most);
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
      let v = isKing(p) ? 260 : 100; // flying kings are very strong
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
  const depth = level === 'hard' ? 5 : 2;
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
    setStatus(moves[0].caps.length && isHumanTurn() ? `${who} You must capture, taking the most pieces you can (pieces with a yellow ring).` : who);
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
      setStatus(moves[0]?.caps.length ? 'You must capture! Choose a piece with a yellow ring (it takes the most pieces).' : 'That piece cannot move. Pick another one.');
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
