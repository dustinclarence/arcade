// Pixel Snake
const $ = (id) => document.getElementById(id);
const canvas = $('game');
const g = canvas.getContext('2d');
const N = 20, S = canvas.width / N;
const SPEEDS = { slow: 150, normal: 105, fast: 72 };
const DIRS = { up: [0, -1], down: [0, 1], left: [-1, 0], right: [1, 0] };
let speedKey = 'normal', snake, dir, queue, food, score, best = 0, running = false, paused = false, tick = 0;
// Smooth movement: the game logic still moves one square per step, but every frame draws the
// snake part-way between its previous and next squares, so it glides instead of jumping.
let prev = null, lastStep = 0, delay = 105, raf = 0;
try { best = +localStorage.getItem('snake-best') || 0; } catch { /* storage blocked */ }
$('best').textContent = best;

function placeFood() {
  do food = [Math.floor(Math.random() * N), Math.floor(Math.random() * N)];
  while (snake.some(([x, y]) => x === food[0] && y === food[1]));
}
function reset() {
  snake = [[9, 10], [8, 10], [7, 10]];
  prev = snake.map((p) => p.slice());
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
  prev = snake.map((p) => p.slice());
  snake.unshift(head);
  if (willEat) {
    score += 10;
    $('score').textContent = score;
    placeFood();
  } else snake.pop();
  tick++;
  delay = Math.max(48, SPEEDS[speedKey] - Math.floor(score / 50) * 4);
}

function loop(now) {
  raf = requestAnimationFrame(loop);
  if (!running || paused) return;
  let guard = 0;
  while (running && now - lastStep >= delay && guard++ < 5) {
    lastStep += delay;
    step();
  }
  if (now - lastStep > delay * 5) lastStep = now; // tab was in the background: don't fast-forward
  if (running) draw(false, Math.max(0, Math.min(1, (now - lastStep) / delay)));
}

function gameOver() {
  running = false;
  prev = snake.map((p) => p.slice());
  if (score > best) {
    best = score;
    try { localStorage.setItem('snake-best', best); } catch { /* ignore */ }
    $('best').textContent = best;
  }
  draw(true);
  $('sr').textContent = `Game over. Score ${score}.`;
  overlay('Game over', `You scored ${score} points (length ${snake.length}).${score >= best && score > 0 ? ' New best!' : ''}`, 'Play again');
}

function draw(dead = false, alpha = 1) {
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
  // snake: each segment drawn part-way between its last square and its new one
  // Path: the head part-way into its new square, then the real squares of the body, then the
  // tail part-way out of its old square. Because the middle uses real squares, turns stay square.
  const a = alpha;
  const c = ([x, y]) => [x * S + S / 2, y * S + S / 2];
  const lerp = (p, q) => [(p[0] + (q[0] - p[0]) * a) * S + S / 2, (p[1] + (q[1] - p[1]) * a) * S + S / 2];
  const n = snake.length;
  const pts = [lerp(prev[0] || snake[0], snake[0])];
  for (let i = 1; i < n; i++) pts.push(c(snake[i]));
  const oldTail = prev[prev.length - 1] || snake[n - 1];
  if (prev.length >= n) pts.push(lerp(oldTail, snake[n - 1]));
  g.lineCap = 'round';
  g.lineJoin = 'round';
  g.lineWidth = S - 4;
  for (let i = pts.length - 1; i > 0; i--) {
    const t = i / pts.length;
    g.strokeStyle = dead ? '#7a8398' : `hsl(${150 - t * 40}, 70%, ${58 - t * 18}%)`;
    g.beginPath();
    g.moveTo(pts[i][0], pts[i][1]);
    g.lineTo(pts[i - 1][0], pts[i - 1][1]);
    g.stroke();
  }
  const [hx, hy] = pts[0];
  g.fillStyle = dead ? '#7a8398' : 'hsl(150, 70%, 58%)';
  g.beginPath();
  g.arc(hx, hy, S / 2 - 1, 0, Math.PI * 2);
  g.fill();
  // eyes on the head
  const [dx, dy] = DIRS[dir];
  g.fillStyle = '#0f1420';
  for (const s of [-1, 1]) {
    const ex = hx + dx * 4 + (dy ? s * 5 : 0);
    const ey = hy + dy * 4 + (dx ? s * 5 : 0);
    g.beginPath();
    g.arc(ex, ey, 2.6, 0, Math.PI * 2);
    g.fill();
  }
}

function start() {
  reset();
  running = true;
  paused = false;
  $('overlay').hidden = true;
  delay = SPEEDS[speedKey];
  lastStep = performance.now() + 300; // short pause before the first move
  draw();
  canvas.focus?.();
}
function togglePause() {
  if (!running) return;
  paused = !paused;
  if (paused) {
    overlay('Paused', 'Take a breather.', 'Resume');
  } else {
    $('overlay').hidden = true;
    lastStep = performance.now();
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
raf = requestAnimationFrame(loop);
// test hook (read-only view of the game, used by automated checks)
window.__snake = { get: () => ({ snake, food, dir, running, N }), turn, start };


// ?demo=1 shows a still mid-game scene (used for the portfolio preview image).
if (new URLSearchParams(location.search).get('demo') === '1') {
  snake = [[12, 8], [11, 8], [10, 8], [9, 8], [9, 9], [9, 10], [9, 11], [10, 11], [11, 11], [12, 11], [13, 11], [13, 12], [13, 13]];
  prev = snake.map((p) => p.slice());
  dir = 'right';
  food = [15, 8];
  score = 100;
  $('score').textContent = score;
  $('overlay').hidden = true;
  draw();
}
