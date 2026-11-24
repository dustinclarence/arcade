// Pixel Snake
const $ = (id) => document.getElementById(id);
const canvas = $('game');
const g = canvas.getContext('2d');
const N = 20, S = canvas.width / N;
const SPEEDS = { slow: 150, normal: 105, fast: 72 };
const DIRS = { up: [0, -1], down: [0, 1], left: [-1, 0], right: [1, 0] };
let speedKey = 'normal', snake, dir, queue, food, score, best = 0, timer = 0, running = false, paused = false, tick = 0;
try { best = +localStorage.getItem('snake-best') || 0; } catch { /* storage blocked */ }
$('best').textContent = best;

function placeFood() {
  do food = [Math.floor(Math.random() * N), Math.floor(Math.random() * N)];
  while (snake.some(([x, y]) => x === food[0] && y === food[1]));
}
function reset() {
  snake = [[9, 10], [8, 10], [7, 10]];
  dir = 'right';
  queue = [];
  score = 0;
  tick = 0;
  $('score').textContent = 0;
  placeFood();
}
function overlay(title, text, btn) {
  $('ov-title').textContent = title;
  $('ov-text').textContent = text;
  $('start').textContent = btn;
  $('overlay').hidden = false;
  $('start').focus();
}

function step() {
  if (queue.length) {
    const next = queue.shift();
    const [dx, dy] = DIRS[next], [cx, cy] = DIRS[dir];
    if (dx !== -cx || dy !== -cy) dir = next;
  }
  const [dx, dy] = DIRS[dir];
  const head = [snake[0][0] + dx, snake[0][1] + dy];
  const hitWall = head[0] < 0 || head[1] < 0 || head[0] >= N || head[1] >= N;
  const willEat = head[0] === food[0] && head[1] === food[1];
  const body = willEat ? snake : snake.slice(0, -1);
  if (hitWall || body.some(([x, y]) => x === head[0] && y === head[1])) return gameOver();
  snake.unshift(head);
  if (willEat) {
    score += 10;
    $('score').textContent = score;
    placeFood();
  } else snake.pop();
  tick++;
  draw();
  const delay = Math.max(48, SPEEDS[speedKey] - Math.floor(score / 50) * 4);
  timer = setTimeout(step, delay);
}

function gameOver() {
  running = false;
  if (score > best) {
    best = score;
    try { localStorage.setItem('snake-best', best); } catch { /* ignore */ }
    $('best').textContent = best;
  }
  draw(true);
  $('sr').textContent = `Game over. Score ${score}.`;
  overlay('Game over', `You scored ${score} points (length ${snake.length}).${score >= best && score > 0 ? ' New best!' : ''}`, 'Play again');
}

function draw(dead = false) {
  // checkerboard grass
  for (let y = 0; y < N; y++)
    for (let x = 0; x < N; x++) {
      g.fillStyle = (x + y) % 2 ? '#1c2a3f' : '#18243a';
      g.fillRect(x * S, y * S, S, S);
    }
  // food: an apple
  const [fx, fy] = food;
  const pulse = 1 + Math.sin(tick / 2) * 0.06;
  g.fillStyle = '#ff5a4f';
  g.beginPath();
  g.arc(fx * S + S / 2, fy * S + S / 2 + 1, (S / 2.6) * pulse, 0, Math.PI * 2);
  g.fill();
  g.fillStyle = '#4fd1b5';
  g.fillRect(fx * S + S / 2, fy * S + 3, 3, 6);
  // snake
  snake.forEach(([x, y], i) => {
    const t = i / snake.length;
    g.fillStyle = dead ? '#7a8398' : `hsl(${150 - t * 40}, 70%, ${58 - t * 18}%)`;
    const pad = i === 0 ? 1 : 2;
    g.beginPath();
    g.roundRect(x * S + pad, y * S + pad, S - pad * 2, S - pad * 2, 6);
    g.fill();
  });
  // eyes on the head
  const [hx, hy] = snake[0];
  const [dx, dy] = DIRS[dir];
  g.fillStyle = '#0f1420';
  for (const s of [-1, 1]) {
    const ex = hx * S + S / 2 + dx * 4 + (dy ? s * 5 : 0);
    const ey = hy * S + S / 2 + dy * 4 + (dx ? s * 5 : 0);
    g.beginPath();
    g.arc(ex, ey, 2.6, 0, Math.PI * 2);
    g.fill();
  }
}

function start() {
  clearTimeout(timer);
  reset();
  running = true;
  paused = false;
  $('overlay').hidden = true;
  draw();
  timer = setTimeout(step, 400);
  canvas.focus?.();
}
function togglePause() {
  if (!running) return;
  paused = !paused;
  if (paused) {
    clearTimeout(timer);
    overlay('Paused', 'Take a breather.', 'Resume');
  } else {
    $('overlay').hidden = true;
    timer = setTimeout(step, 200);
  }
}
function turn(d) {
  if (!running || paused) return;
  if (queue.length < 3) queue.push(d);
}

$('start').addEventListener('click', () => (paused ? togglePause() : start()));
const KEYS = { ArrowUp: 'up', ArrowDown: 'down', ArrowLeft: 'left', ArrowRight: 'right', w: 'up', s: 'down', a: 'left', d: 'right' };
document.addEventListener('keydown', (e) => {
  const k = KEYS[e.key] || KEYS[e.key.toLowerCase()];
  if (k) {
    e.preventDefault();
    turn(k);
  } else if (e.key === ' ' || e.key.toLowerCase() === 'p') {
    e.preventDefault();
    if (running) togglePause();
    else start();
  }
});
document.querySelectorAll('.pad button').forEach((b) =>
  b.addEventListener('pointerdown', (e) => {
    e.preventDefault();
    turn(b.dataset.dir);
  }),
);
let touch = null;
canvas.addEventListener('touchstart', (e) => (touch = [e.touches[0].clientX, e.touches[0].clientY]), { passive: true });
canvas.addEventListener('touchend', (e) => {
  if (!touch) return;
  const dx = e.changedTouches[0].clientX - touch[0], dy = e.changedTouches[0].clientY - touch[1];
  if (Math.max(Math.abs(dx), Math.abs(dy)) > 24) turn(Math.abs(dx) > Math.abs(dy) ? (dx > 0 ? 'right' : 'left') : dy > 0 ? 'down' : 'up');
  touch = null;
});
document.querySelectorAll('[data-speed]').forEach((b) =>
  b.addEventListener('click', () => {
    speedKey = b.dataset.speed;
    document.querySelectorAll('[data-speed]').forEach((x) => x.setAttribute('aria-pressed', String(x === b)));
  }),
);
reset();
draw();
