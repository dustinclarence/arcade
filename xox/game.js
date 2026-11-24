// XOX (tic-tac-toe) with an unbeatable minimax computer.
const $ = (id) => document.getElementById(id);
const LINES = [[0, 1, 2], [3, 4, 5], [6, 7, 8], [0, 3, 6], [1, 4, 7], [2, 5, 8], [0, 4, 8], [2, 4, 6]];
const X_SVG = '<svg viewBox="0 0 100 100" aria-hidden="true"><path class="x" d="M22 22 78 78M78 22 22 78"/></svg>';
const O_SVG = '<svg viewBox="0 0 100 100" aria-hidden="true"><circle class="o" cx="50" cy="50" r="30"/></svg>';
let cells, turn, over, busy, mode = 'cpu', level = 'easy', winLine = null, starter = 'X';
let lastI = -1;
let human = 'X'; // vs computer: X always goes first, you choose X (first) or O (second)
const cpu = () => (human === 'X' ? 'O' : 'X');
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
// Scores a position for the computer `me` (+10 = computer wins, -10 = computer loses).
function minimax(c, player, me = 'O') {
  const w = winner(c);
  if (w) return w.p === me ? 10 : -10;
  if (c.every(Boolean)) return 0;
  const scores = [];
  for (let i = 0; i < 9; i++) {
    if (c[i]) continue;
    c[i] = player;
    scores.push(minimax(c, player === 'O' ? 'X' : 'O', me) * 0.9);
    c[i] = null;
  }
  return player === me ? Math.max(...scores) : Math.min(...scores);
}
function cpuPick() {
  const free = cells.map((v, i) => (v ? -1 : i)).filter((i) => i >= 0);
  if (level === 'easy') {
    // Easy: wins or blocks when it sees it, otherwise plays randomly.
    for (const who of [cpu(), human])
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
    cells[i] = cpu();
    const v = minimax(cells, human, cpu()) + Math.random() * 0.01;
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
    b.disabled = !!v || over || busy || (mode === 'cpu' && turn !== human);
    b.classList.toggle('win', !!winLine && winLine.includes(i));
    b.classList.toggle('last', i === lastI && !winLine);
    b.setAttribute('aria-label', `Square ${i + 1}${v ? ', ' + v : ', empty'}`);
  });
  $('s-x').textContent = score.X;
  $('s-o').textContent = score.O;
  $('s-draw').textContent = score.draw;
  $('x-label').textContent = mode === 'cpu' ? (human === 'X' ? 'X (you)' : 'X (computer)') : 'X (player 1)';
  $('o-label').textContent = mode === 'cpu' ? (human === 'O' ? 'O (you)' : 'O (computer)') : 'O (player 2)';
}
function place(i) {
  if (cells[i] || over) return;
  cells[i] = turn;
  lastI = i;
  const w = winner(cells);
  if (w) {
    over = true;
    winLine = w.line;
    score[w.p]++;
    if (mode === 'cpu') setStatus(w.p === human ? 'You win! 🎉 Press Next round to play again.' : 'The computer wins this round. Press Next round to try again.', w.p === human ? 'win' : 'lose');
    else setStatus(`${w.p} wins! 🎉 Press Next round to play again.`, 'win');
  } else if (cells.every(Boolean)) {
    over = true;
    score.draw++;
    setStatus("It's a draw! Press Next round to play again.");
  } else {
    turn = turn === 'X' ? 'O' : 'X';
    setStatus(mode === 'cpu' ? (turn === human ? `Your turn. You are ${human}.` : 'Computer is thinking…') : `${turn}'s turn.`);
  }
  render();
  if (!over && mode === 'cpu' && turn === cpu()) {
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
  if (e.key >= '1' && e.key <= '9' && !busy && !over && !(mode === 'cpu' && turn !== human)) place(+e.key - 1);
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
  lastI = -1;
  setStatus(mode === 'cpu' ? (human === 'X' ? 'Your turn. You are X, so you go first.' : 'You are O. The computer (X) goes first…') : `${turn} starts this round.`);
  render();
  if (mode === 'cpu' && turn === cpu()) {
    busy = true;
    render();
    setTimeout(() => {
      busy = false;
      place(cpuPick());
    }, 500);
  }
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
document.querySelectorAll('[data-side]').forEach((b) =>
  b.addEventListener('click', () => {
    human = b.dataset.side;
    document.querySelectorAll('[data-side]').forEach((x) => x.setAttribute('aria-pressed', String(x === b)));
    score.X = score.O = score.draw = 0;
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
