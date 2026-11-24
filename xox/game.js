// XOX (tic-tac-toe) with an unbeatable minimax computer.
const $ = (id) => document.getElementById(id);
const LINES = [[0, 1, 2], [3, 4, 5], [6, 7, 8], [0, 3, 6], [1, 4, 7], [2, 5, 8], [0, 4, 8], [2, 4, 6]];
const X_SVG = '<svg viewBox="0 0 100 100" aria-hidden="true"><path class="x" d="M22 22 78 78M78 22 22 78"/></svg>';
const O_SVG = '<svg viewBox="0 0 100 100" aria-hidden="true"><circle class="o" cx="50" cy="50" r="30"/></svg>';
let cells, turn, over, busy, mode = 'cpu', level = 'easy', winLine = null, starter = 'X';
const score = { X: 0, O: 0, draw: 0 };

const boardEl = $('board');
for (let i = 0; i < 9; i++) {
  const b = document.createElement('button');
  b.type = 'button';
  b.className = 'cellx';
  b.dataset.i = i;
  boardEl.append(b);
}

const winner = (c) => {
  for (const l of LINES) if (c[l[0]] && c[l[0]] === c[l[1]] && c[l[1]] === c[l[2]]) return { p: c[l[0]], line: l };
  return null;
};
function minimax(c, player) {
  const w = winner(c);
  if (w) return w.p === 'O' ? 10 : -10;
  if (c.every(Boolean)) return 0;
  const scores = [];
  for (let i = 0; i < 9; i++) {
    if (c[i]) continue;
    c[i] = player;
    scores.push(minimax(c, player === 'O' ? 'X' : 'O') * 0.9);
    c[i] = null;
  }
  return player === 'O' ? Math.max(...scores) : Math.min(...scores);
}
function cpuPick() {
  const free = cells.map((v, i) => (v ? -1 : i)).filter((i) => i >= 0);
  if (level === 'easy') {
    // Easy: wins or blocks when it sees it, otherwise plays randomly.
    for (const who of ['O', 'X'])
      for (const i of free) {
        cells[i] = who;
        const w = winner(cells);
        cells[i] = null;
        if (w && Math.random() < 0.8) return i;
      }
    return free[Math.floor(Math.random() * free.length)];
  }
  let best = free[0], bestV = -Infinity;
  for (const i of free) {
    cells[i] = 'O';
    const v = minimax(cells, 'X') + Math.random() * 0.01;
    cells[i] = null;
    if (v > bestV) { bestV = v; best = i; }
  }
  return best;
}

function setStatus(t, cls = '') {
  $('status').textContent = t;
  $('status').className = 'status ' + cls;
}
function render() {
  [...boardEl.children].forEach((b, i) => {
    const v = cells[i];
    if ((b.dataset.v || '') !== (v || '')) b.innerHTML = v === 'X' ? X_SVG : v === 'O' ? O_SVG : '';
    b.dataset.v = v || '';
    b.disabled = !!v || over || busy || (mode === 'cpu' && turn === 'O');
    b.classList.toggle('win', !!winLine && winLine.includes(i));
    b.setAttribute('aria-label', `Square ${i + 1}${v ? ', ' + v : ', empty'}`);
  });
  $('s-x').textContent = score.X;
  $('s-o').textContent = score.O;
  $('s-draw').textContent = score.draw;
  $('o-label').textContent = mode === 'cpu' ? 'O (computer)' : 'O (player 2)';
}
function place(i) {
  if (cells[i] || over) return;
  cells[i] = turn;
  const w = winner(cells);
  if (w) {
    over = true;
    winLine = w.line;
    score[w.p]++;
    if (mode === 'cpu') setStatus(w.p === 'X' ? 'You win! 🎉 Press Next round to play again.' : 'The computer wins this round. Press Next round to try again.', w.p === 'X' ? 'win' : 'lose');
    else setStatus(`${w.p} wins! 🎉 Press Next round to play again.`, 'win');
  } else if (cells.every(Boolean)) {
    over = true;
    score.draw++;
    setStatus("It's a draw! Press Next round to play again.");
  } else {
    turn = turn === 'X' ? 'O' : 'X';
    setStatus(mode === 'cpu' ? (turn === 'X' ? 'Your turn. You are X.' : 'Computer is thinking…') : `${turn}'s turn.`);
  }
  render();
  if (!over && mode === 'cpu' && turn === 'O') {
    busy = true;
    render();
    setTimeout(() => {
      busy = false;
      place(cpuPick());
    }, 420);
  }
}
boardEl.addEventListener('click', (e) => {
  const b = e.target.closest('.cellx');
  if (b && !b.disabled) place(+b.dataset.i);
});
document.addEventListener('keydown', (e) => {
  if (e.key >= '1' && e.key <= '9' && !busy && !(mode === 'cpu' && turn === 'O')) place(+e.key - 1);
  if (e.key.toLowerCase() === 'n') start();
});

function start() {
  cells = Array(9).fill(null);
  // In 2-player mode, the starting player alternates each round.
  turn = mode === 'two' ? starter : 'X';
  if (mode === 'two') starter = starter === 'X' ? 'O' : 'X';
  over = false;
  busy = false;
  winLine = null;
  setStatus(mode === 'cpu' ? 'Your turn. You are X.' : `${turn} starts this round.`);
  render();
}
$('new').addEventListener('click', start);
$('reset').addEventListener('click', () => {
  score.X = score.O = score.draw = 0;
  render();
});
document.querySelectorAll('[data-mode]').forEach((b) =>
  b.addEventListener('click', () => {
    mode = b.dataset.mode;
    document.querySelectorAll('[data-mode]').forEach((x) => x.setAttribute('aria-pressed', String(x === b)));
    score.X = score.O = score.draw = 0;
    starter = 'X';
    start();
  }),
);
document.querySelectorAll('[data-level]').forEach((b) =>
  b.addEventListener('click', () => {
    level = b.dataset.level;
    document.querySelectorAll('[data-level]').forEach((x) => x.setAttribute('aria-pressed', String(x === b)));
    start();
  }),
);
start();
window.__xox = { minimax, winner };
