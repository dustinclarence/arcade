// Marble Spiral — shoot marbles into a rolling chain and make groups of 3+.
const $ = (id) => document.getElementById(id);
const canvas = $('game');
const g = canvas.getContext('2d');
const W = canvas.width, H = canvas.height, CX = W / 2, CY = H / 2;
const R = 13, D = 26.5;
const COLORS = ['#ff5a4f', '#ffc857', '#4fd1b5', '#5b8cff', '#c77dff'];

/* ---------- spiral path with arc-length lookup ---------- */
const PTS = [];
(() => {
  const turns = 2.35, steps = 3000, r0 = 268, r1 = 92;
  let len = 0, prev = null;
  for (let i = 0; i <= steps; i++) {
    const t = i / steps;
    const th = t * turns * Math.PI * 2 - Math.PI / 2;
    const r = r0 - (r0 - r1) * t;
    const p = { x: CX + Math.cos(th) * r, y: CY + Math.sin(th) * r };
    if (prev) len += Math.hypot(p.x - prev.x, p.y - prev.y);
    p.s = len;
    PTS.push(p);
    prev = p;
  }
})();
const PATH_LEN = PTS[PTS.length - 1].s;
function at(s) {
  if (s <= 0) return PTS[0];
  if (s >= PATH_LEN) return PTS[PTS.length - 1];
  let lo = 0, hi = PTS.length - 1;
  while (hi - lo > 1) {
    const mid = (lo + hi) >> 1;
    if (PTS[mid].s < s) lo = mid;
    else hi = mid;
  }
  const a = PTS[lo], b = PTS[hi], k = (s - a.s) / (b.s - a.s || 1);
  return { x: a.x + (b.x - a.x) * k, y: a.y + (b.y - a.y) * k };
}

/* ---------- game state ---------- */
let state = 'ready', chain, headS, shot, current, next, aim = { x: CX, y: 0 }, score, level = 1, lastTime = 0, popups, rushing;

function colorsInPlay() {
  const set = [...new Set(chain.map((m) => m.c))];
  return set.length ? set : COLORS.slice(0, 3 + Math.min(2, level));
}
const pick = () => {
  const cs = colorsInPlay();
  return cs[Math.floor(Math.random() * cs.length)];
};
function buildChain() {
  const n = 34 + level * 8;
  const palette = COLORS.slice(0, Math.min(5, 3 + level));
  chain = [];
  for (let i = 0; i < n; i++) {
    // small runs of the same colour make the game feel fair
    const c = i > 0 && Math.random() < 0.45 ? chain[i - 1].c : palette[Math.floor(Math.random() * palette.length)];
    chain.push({ c, s: -i * D });
  }
  headS = 0;
  rushing = true;
}
function startLevel() {
  buildChain();
  shot = null;
  current = pick();
  next = pick();
  popups = [];
  updateHud();
}
function updateHud() {
  $('score').textContent = score;
  $('left').textContent = chain.length;
  $('level').textContent = level;
}

/* ---------- matching ---------- */
function runAround(i) {
  let a = i, b = i;
  while (a > 0 && chain[a - 1].c === chain[i].c) a--;
  while (b < chain.length - 1 && chain[b + 1].c === chain[i].c) b++;
  return [a, b];
}
function resolve(i, combo = 1) {
  if (i < 0 || i >= chain.length) return;
  const [a, b] = runAround(i);
  const n = b - a + 1;
  if (n < 3) return;
  const p = at(chain[a].s);
  chain.splice(a, n);
  const pts = n * 10 * combo;
  score += pts;
  popups.push({ x: p.x, y: p.y, text: combo > 1 ? `+${pts} combo!` : `+${pts}`, life: 1 });
  // chain reaction: the two pieces that now touch may match
  if (a > 0 && a < chain.length && chain[a - 1].c === chain[a].c) resolve(a, combo + 1);
  updateHud();
}

/* ---------- shooting ---------- */
function shoot() {
  if (state !== 'play' || shot) return;
  const ang = Math.atan2(aim.y - CY, aim.x - CX);
  shot = { x: CX + Math.cos(ang) * 30, y: CY + Math.sin(ang) * 30, vx: Math.cos(ang) * 950, vy: Math.sin(ang) * 950, c: current };
  current = next;
  next = pick();
}
function swap() {
  if (state !== 'play') return;
  [current, next] = [next, current];
}
function hitTest() {
  for (let i = 0; i < chain.length; i++) {
    const m = chain[i];
    if (m.s < 0) continue;
    const p = at(m.s);
    if (Math.hypot(p.x - shot.x, p.y - shot.y) < R * 2 - 2) {
      // insert in front of or behind the marble we hit
      const ahead = at(m.s + 6);
      const dot = (shot.x - p.x) * (ahead.x - p.x) + (shot.y - p.y) * (ahead.y - p.y);
      const idx = dot > 0 ? i : i + 1;
      const s = dot > 0 ? m.s + D : m.s - D;
      chain.splice(idx, 0, { c: shot.c, s });
      shot = null;
      resolve(idx);
      if (!chain.length) return winLevel();
      // keep current/next colours valid
      const cs = colorsInPlay();
      if (!cs.includes(current)) current = pick();
      if (!cs.includes(next)) next = pick();
      return;
    }
  }
}

function winLevel() {
  state = 'between';
  score += 100 * level;
  updateHud();
  $('ov-title').textContent = `Level ${level} cleared! 🎉`;
  $('ov-text').textContent = `Score: ${score}. The next chain is longer and faster.`;
  $('start').textContent = 'Next level';
  $('overlay').hidden = false;
  $('start').focus();
  level++;
}
function lose() {
  state = 'over';
  $('sr').textContent = `Game over. Score ${score}.`;
  $('ov-title').textContent = 'The chain reached the centre';
  $('ov-text').textContent = `Final score: ${score} (level ${level}).`;
  $('start').textContent = 'Play again';
  $('overlay').hidden = false;
  $('start').focus();
}

/* ---------- loop ---------- */
function update(dt) {
  if (state !== 'play') return;
  const speed = rushing ? 220 : 16 + level * 4;
  headS += speed * dt;
  if (rushing && headS > PATH_LEN * 0.22) rushing = false;
  // each marble eases toward its spot in the chain (head first, then spaced by D)
  chain.forEach((m, i) => {
    const target = headS - i * D;
    m.s += (target - m.s) * Math.min(1, dt * 14);
  });
  if (chain.length && chain[0].s >= PATH_LEN - 4) return lose();
  if (shot) {
    shot.x += shot.vx * dt;
    shot.y += shot.vy * dt;
    if (shot.x < -30 || shot.x > W + 30 || shot.y < -30 || shot.y > H + 30) shot = null;
    else hitTest();
  }
  popups.forEach((p) => {
    p.life -= dt;
    p.y -= dt * 30;
  });
  popups = popups.filter((p) => p.life > 0);
}

function marble(x, y, c, r = R) {
  const grad = g.createRadialGradient(x - r * 0.35, y - r * 0.4, r * 0.2, x, y, r);
  grad.addColorStop(0, '#ffffff');
  grad.addColorStop(0.25, c);
  grad.addColorStop(1, shade(c));
  g.fillStyle = grad;
  g.beginPath();
  g.arc(x, y, r, 0, Math.PI * 2);
  g.fill();
}
function shade(hex) {
  const n = parseInt(hex.slice(1), 16);
  const f = (v) => Math.max(0, Math.round(v * 0.55));
  return `rgb(${f(n >> 16)},${f((n >> 8) & 255)},${f(n & 255)})`;
}
function draw() {
  const bg = g.createRadialGradient(CX, CY, 40, CX, CY, W * 0.7);
  bg.addColorStop(0, '#24304a');
  bg.addColorStop(1, '#101626');
  g.fillStyle = bg;
  g.fillRect(0, 0, W, H);
  // track
  g.lineCap = 'round';
  g.lineJoin = 'round';
  for (const [w, col] of [[34, '#0b1020'], [26, '#2c3858']]) {
    g.strokeStyle = col;
    g.lineWidth = w;
    g.beginPath();
    PTS.forEach((p, i) => (i % 6 === 0 ? (i ? g.lineTo(p.x, p.y) : g.moveTo(p.x, p.y)) : 0));
    g.stroke();
  }
  // end hole
  const end = PTS[PTS.length - 1];
  g.fillStyle = '#000';
  g.beginPath();
  g.arc(end.x, end.y, 20, 0, Math.PI * 2);
  g.fill();
  g.strokeStyle = '#ff5a4f';
  g.lineWidth = 3;
  g.stroke();
  // danger glow as the head nears the hole
  const danger = chain.length ? chain[0].s / PATH_LEN : 0;
  if (danger > 0.8) {
    g.fillStyle = `rgba(255,90,79,${(danger - 0.8) * 1.5})`;
    g.beginPath();
    g.arc(end.x, end.y, 34, 0, Math.PI * 2);
    g.fill();
  }
  // chain
  for (let i = chain.length - 1; i >= 0; i--) {
    const m = chain[i];
    if (m.s < 0) continue;
    const p = at(m.s);
    marble(p.x, p.y, m.c);
  }
  // aim line
  if (state === 'play') {
    const ang = Math.atan2(aim.y - CY, aim.x - CX);
    g.setLineDash([4, 10]);
    g.strokeStyle = 'rgba(255,255,255,0.35)';
    g.lineWidth = 2;
    g.beginPath();
    g.moveTo(CX + Math.cos(ang) * 40, CY + Math.sin(ang) * 40);
    g.lineTo(CX + Math.cos(ang) * 320, CY + Math.sin(ang) * 320);
    g.stroke();
    g.setLineDash([]);
  }
  // shooter
  const ang = Math.atan2(aim.y - CY, aim.x - CX);
  g.save();
  g.translate(CX, CY);
  g.rotate(ang);
  g.fillStyle = '#3b4a70';
  g.beginPath();
  g.roundRect(0, -11, 44, 22, 8);
  g.fill();
  g.restore();
  g.fillStyle = '#2a3550';
  g.beginPath();
  g.arc(CX, CY, 32, 0, Math.PI * 2);
  g.fill();
  g.strokeStyle = '#ffc857';
  g.lineWidth = 3;
  g.stroke();
  marble(CX, CY, current, R + 2);
  // next marble indicator
  marble(CX + 22, CY + 22, next, 8);
  if (shot) marble(shot.x, shot.y, shot.c);
  popups.forEach((p) => {
    g.globalAlpha = Math.max(0, p.life);
    g.fillStyle = '#fff';
    g.font = '700 20px Fredoka, sans-serif';
    g.textAlign = 'center';
    g.fillText(p.text, p.x, p.y);
    g.globalAlpha = 1;
  });
}
function loop(t) {
  const dt = Math.min(0.033, (t - lastTime) / 1000 || 0);
  lastTime = t;
  update(dt);
  draw();
  requestAnimationFrame(loop);
}

/* ---------- input ---------- */
function toCanvas(e) {
  const r = canvas.getBoundingClientRect();
  return { x: ((e.clientX - r.left) / r.width) * W, y: ((e.clientY - r.top) / r.height) * H };
}
canvas.addEventListener('pointermove', (e) => (aim = toCanvas(e)));
canvas.addEventListener('pointerdown', (e) => {
  aim = toCanvas(e);
  if (e.button === 2) return swap();
  // tapping the shooter itself swaps colours
  if (Math.hypot(aim.x - CX, aim.y - CY) < 34) return swap();
  shoot();
});
canvas.addEventListener('contextmenu', (e) => e.preventDefault());
document.addEventListener('keydown', (e) => {
  if (e.key === ' ' && state === 'play') {
    e.preventDefault();
    swap();
  }
});
$('start').addEventListener('click', () => {
  if (state === 'over' || state === 'ready') {
    score = 0;
    level = 1;
  }
  startLevel();
  state = 'play';
  $('overlay').hidden = true;
});
score = 0;
startLevel();
requestAnimationFrame(loop);
// test hook (used by automated checks)
window.__marble = { get: () => ({ chain, current, shot, state, CX, CY }), at, aimAt: (x, y) => (aim = { x, y }), shoot };
