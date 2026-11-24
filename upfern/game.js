// Upfern — an original endless jumping game.
// Pip, a little seed sprout, bounces by itself; you steer it from leaf to leaf.
// Physics run at a fixed 120 steps per second and the drawing is interpolated between
// steps, so movement looks equally smooth on 60 Hz, 120 Hz and 144 Hz screens.
const $ = (id) => document.getElementById(id);
const canvas = $('game');
const g = canvas.getContext('2d');
const W = canvas.width, H = canvas.height;
const STEP = 1 / 120;
const GRAVITY = 2100, JUMP = -980, SPRING = -1500, MAX_FALL = 1300;
const ACCEL = 2600, MAX_VX = 380, BRAKE = 2400;
const PW = 80, PH = 14; // leaf (platform) size
const PX = 15; // half the width of Pip's feet for landing checks
const START_Y = 640; // Pip's feet at the start
const PX_PER_M = 16;

let state = 'ready', pip, prevPip, cam, prevCam, leaves, bugs, topY, best = 0, height, acc = 0, last = 0, keys = { left: false, right: false }, touches = new Map();
let squash = 0, clock = 0, deathSpin = 0;
try { best = +localStorage.getItem('upfern-best') || 0; } catch { /* storage blocked */ }
$('best').textContent = best + ' m';

const rand = (a, b) => a + Math.random() * (b - a);
const wrapDist = (a, b) => {
  const d = Math.abs(a - b) % W;
  return Math.min(d, W - d);
};
const difficulty = () => Math.min(1, height / 4500); // reaches full difficulty at about 280 m

/* ---------- world generation (every leaf on the main path is always reachable) ---------- */
let pathX = W / 2;
function addRow() {
  const d = difficulty();
  const gap = rand(58 + 45 * d, 96 + 70 * d); // the highest jump is 228 px; gaps stay well below that
  topY -= gap;
  // keep the next leaf within reach sideways (screen wrap counts)
  const fromX = pathX;
  let x;
  for (let k = 0; k < 20; k++) {
    x = rand(PW / 2 + 4, W - PW / 2 - 4);
    if (wrapDist(x, pathX) <= (gap > 130 ? 190 : 260)) break;
  }
  pathX = x;
  const r = Math.random();
  let type = 'normal';
  if (r < 0.07 + 0.28 * d) type = 'moving';
  const leaf = { x, y: topY, w: PW, type, vx: type === 'moving' ? (Math.random() < 0.5 ? -1 : 1) * rand(60, 90 + 80 * d) : 0, spring: null, broken: false, fall: 0 };
  if (type === 'normal' && Math.random() < 0.07) leaf.spring = { off: rand(-PW / 2 + 14, PW / 2 - 14), t: 0 };
  leaves.push(leaf);
  // brown leaves are extra decoys: they crumble, so they are never the only way up
  if (Math.random() < 0.16 + 0.2 * d) {
    let bx = rand(PW / 2 + 4, W - PW / 2 - 4);
    if (Math.abs(bx - x) < PW + 10) bx = (bx + W / 2) % (W - PW) + PW / 2;
    leaves.push({ x: bx, y: topY + gap * rand(0.35, 0.65), w: PW, type: 'break', vx: 0, spring: null, broken: false, fall: 0 });
  }
  // thornbugs appear higher up, away from the leaves you need
  if (height > 90 * PX_PER_M && Math.random() < 0.04 + 0.07 * d) {
    // it bobs 34 px each way, so keep its whole range clear of the take-off and landing leaves
    for (let k = 0; k < 24; k++) {
      const bx = rand(40, W - 40);
      if (wrapDist(bx, x) >= 140 && wrapDist(bx, fromX) >= 140) {
        bugs.push({ x: bx, y: topY + gap / 2, base: bx, t: rand(0, 6), dead: false, vy: 0 });
        break;
      }
    }
  }
}

function reset() {
  pip = { x: W / 2, y: START_Y, vx: 0, vy: JUMP, face: 1 };
  prevPip = { ...pip };
  cam = 0;
  prevCam = 0;
  height = 0;
  squash = 0;
  deathSpin = 0;
  leaves = [{ x: W / 2, y: START_Y + 4, w: W + 40, type: 'ground', vx: 0, spring: null, broken: false, fall: 0 }];
  bugs = [];
  topY = START_Y + 4;
  pathX = W / 2;
  while (topY > cam - 200) addRow();
  updateHud();
}
function updateHud() {
  const m = Math.floor(height / PX_PER_M);
  $('score').textContent = m + ' m';
  $('best').textContent = Math.max(best, m) + ' m';
}

/* ---------- one physics step ---------- */
function update(dt) {
  clock += dt;
  squash = Math.max(0, squash - dt * 5);
  for (const l of leaves) {
    if (l.type === 'moving') {
      l.x += l.vx * dt;
      if (l.x < l.w / 2) { l.x = l.w / 2; l.vx = Math.abs(l.vx); }
      if (l.x > W - l.w / 2) { l.x = W - l.w / 2; l.vx = -Math.abs(l.vx); }
    }
    if (l.broken) { l.fall += 900 * dt; l.y += l.fall * dt; }
    if (l.spring) l.spring.t = Math.max(0, l.spring.t - dt * 4);
  }
  for (const b of bugs) {
    b.t += dt;
    if (b.dead) { b.vy += GRAVITY * dt; b.y += b.vy * dt; }
    else b.x = b.base + Math.sin(b.t * 1.6) * 34;
  }
  if (state !== 'play' && state !== 'falling') return;

  // steering
  const dir = (keys.right || [...touches.values()].includes('right') ? 1 : 0) - (keys.left || [...touches.values()].includes('left') ? 1 : 0);
  if (state === 'play' && dir) {
    pip.vx += dir * ACCEL * dt;
    pip.face = dir;
  } else {
    const s = Math.sign(pip.vx);
    pip.vx -= s * Math.min(Math.abs(pip.vx), BRAKE * dt);
  }
  pip.vx = Math.max(-MAX_VX, Math.min(MAX_VX, pip.vx));
  pip.x += pip.vx * dt;
  if (pip.x < 0) pip.x += W; // wrap around the sides
  if (pip.x >= W) pip.x -= W;

  const oldY = pip.y;
  pip.vy = Math.min(MAX_FALL, pip.vy + GRAVITY * dt);
  pip.y += pip.vy * dt;

  if (state === 'play') {
    // land only when falling onto the top of a leaf (Pip passes up through leaves)
    if (pip.vy > 0) {
      for (const l of leaves) {
        if (l.broken || oldY > l.y || pip.y < l.y) continue;
        const half = l.w / 2 + PX;
        if (!(Math.abs(pip.x - l.x) < half || Math.abs(pip.x + W - l.x) < half || Math.abs(pip.x - W - l.x) < half)) continue;
        if (l.type === 'break') {
          l.broken = true; // it crumbles and Pip keeps falling
          continue;
        }
        pip.y = l.y;
        if (l.spring && Math.abs(pip.x - (l.x + l.spring.off)) < 20) {
          pip.vy = SPRING;
          l.spring.t = 1;
        } else pip.vy = JUMP;
        squash = 1;
        break;
      }
    }
    // thornbugs
    for (const b of bugs) {
      if (b.dead) continue;
      const dx = Math.min(Math.abs(pip.x - b.x), Math.abs(pip.x + W - b.x), Math.abs(pip.x - W - b.x));
      const dy = pip.y - 22 - b.y;
      if (dx < 34 && Math.abs(dy) < 36) {
        if (pip.vy > 0 && oldY <= b.y - 4) {
          b.dead = true; // squashed from above
          b.vy = 200;
          pip.vy = JUMP * 1.08;
          squash = 1;
        } else {
          state = 'falling'; // hit from the side or below
          pip.vy = Math.max(pip.vy, 100);
          $('sr').textContent = 'A thornbug got you!';
        }
      }
    }
  }

  // camera follows upward only, keeping Pip in the upper half of the screen
  const target = pip.y - H * 0.45;
  if (target < cam) cam += (target - cam) * Math.min(1, dt * 12);
  height = Math.max(height, START_Y - pip.y);
  while (topY > cam - 200) addRow();
  leaves = leaves.filter((l) => l.y < cam + H + 80);
  bugs = bugs.filter((b) => b.y < cam + H + 120);
  if (state === 'falling') deathSpin += dt * 8;
  if (pip.y > cam + H + 60) endGame();
}

function endGame() {
  state = 'over';
  const m = Math.floor(height / PX_PER_M);
  const newBest = m > best;
  if (newBest) {
    best = m;
    try { localStorage.setItem('upfern-best', best); } catch { /* ignore */ }
  }
  updateHud();
  $('sr').textContent = `Climb over. You reached ${m} metres.`;
  $('ov-title').textContent = 'Climb over';
  $('ov-text').textContent = `Pip reached ${m} m.${newBest && m > 0 ? ' New best!' : ` Best: ${best} m.`}`;
  $('start').textContent = 'Climb again';
  $('overlay').hidden = false;
  $('start').focus();
}

/* ---------- drawing ---------- */
function drawSky(c) {
  const h = Math.min(1, height / 6000);
  const sky = g.createLinearGradient(0, 0, 0, H);
  sky.addColorStop(0, `hsl(${200 + h * 40}, ${60 - h * 20}%, ${Math.max(12, 62 - h * 48)}%)`);
  sky.addColorStop(1, `hsl(${160 + h * 70}, ${55 - h * 15}%, ${Math.max(20, 80 - h * 50)}%)`);
  g.fillStyle = sky;
  g.fillRect(0, 0, W, H);
  if (h > 0.35) {
    g.fillStyle = `rgba(255,255,255,${Math.min(0.85, (h - 0.35) * 2)})`;
    for (let i = 0; i < 46; i++) {
      const y = (((i * 131 - c * 0.08) % H) + H) % H;
      g.fillRect((i * 97) % W, y, 2, 2);
    }
  }
  // soft clouds drifting past at different depths
  g.fillStyle = 'rgba(255,255,255,0.16)';
  for (let i = 0; i < 5; i++) {
    const y = (((i * 210 - c * 0.35) % (H + 140)) + H + 140) % (H + 140) - 70;
    const x = (i * 157 + 40) % W;
    g.beginPath();
    g.ellipse(x, y, 70, 18, 0, 0, Math.PI * 2);
    g.ellipse(x + 40, y - 8, 40, 14, 0, 0, Math.PI * 2);
    g.fill();
  }
  // fern fronds on both edges (parallax)
  g.fillStyle = 'rgba(20, 70, 50, 0.35)';
  for (let i = 0; i < 6; i++) {
    const y = (((i * 150 - c * 0.6) % (H + 150)) + H + 150) % (H + 150) - 75;
    for (const side of [0, 1]) {
      g.save();
      g.translate(side ? W : 0, y);
      g.scale(side ? -1 : 1, 1);
      g.beginPath();
      g.moveTo(0, 0);
      g.quadraticCurveTo(46, -18, 64, -52);
      g.quadraticCurveTo(28, -26, 0, -16);
      g.fill();
      g.restore();
    }
  }
}

function drawLeaf(l, y) {
  const x = l.x;
  if (l.type === 'ground') {
    g.fillStyle = '#2f7d4f';
    g.fillRect(-20, y, W + 40, H);
    g.fillStyle = '#4fbf6a';
    g.fillRect(-20, y, W + 40, 10);
    return;
  }
  const colors = { normal: ['#4fbf6a', '#2f8c4c'], moving: ['#5b9cff', '#2f62c4'], break: ['#b07a45', '#7a4f26'] };
  const [top, edge] = colors[l.type];
  g.save();
  if (l.broken) {
    g.globalAlpha = Math.max(0, 1 - l.fall / 700);
  }
  const w = l.w, hw = w / 2;
  g.fillStyle = edge;
  g.beginPath();
  g.ellipse(x, y + PH / 2 + 2, hw, PH / 2 + 1, 0, 0, Math.PI * 2);
  g.fill();
  g.fillStyle = top;
  g.beginPath();
  g.ellipse(x, y + PH / 2 - 1, hw - 1, PH / 2, 0, 0, Math.PI * 2);
  g.fill();
  // leaf vein
  g.strokeStyle = 'rgba(255,255,255,0.35)';
  g.lineWidth = 1.5;
  g.beginPath();
  g.moveTo(x - hw + 8, y + PH / 2 - 1);
  g.lineTo(x + hw - 8, y + PH / 2 - 1);
  g.stroke();
  if (l.type === 'break') {
    g.strokeStyle = 'rgba(40, 20, 5, 0.7)';
    g.beginPath();
    g.moveTo(x - 10, y + 1);
    g.lineTo(x - 4, y + 8);
    g.lineTo(x + 3, y + 3);
    g.moveTo(x + 14, y + 2);
    g.lineTo(x + 18, y + 10);
    g.stroke();
  }
  if (l.type === 'moving') {
    g.fillStyle = 'rgba(255,255,255,0.6)';
    for (const s of [-1, 1]) {
      g.beginPath();
      g.moveTo(x + s * (hw - 4), y + PH / 2 - 1);
      g.lineTo(x + s * (hw - 11), y + PH / 2 - 5);
      g.lineTo(x + s * (hw - 11), y + PH / 2 + 3);
      g.fill();
    }
  }
  g.restore();
  if (l.spring) {
    const sx = x + l.spring.off;
    const ext = l.spring.t * 12; // the spring stretches up when used
    g.strokeStyle = '#c9ced8';
    g.lineWidth = 3;
    g.beginPath();
    for (let k = 0; k <= 4; k++) {
      const yy = y - 2 - k * (3 + ext / 4);
      g.lineTo(sx + (k % 2 ? 7 : -7), yy);
    }
    g.stroke();
    g.fillStyle = '#ffc857';
    g.fillRect(sx - 11, y - 18 - ext, 22, 6);
  }
}

function drawBug(b, y) {
  g.save();
  g.translate(b.x, y);
  if (b.dead) g.rotate(Math.PI);
  // wings
  g.fillStyle = 'rgba(220, 240, 255, 0.55)';
  const flap = Math.sin(b.t * 30) * 4;
  g.beginPath();
  g.ellipse(-12, -14 - flap, 12, 7, -0.5, 0, Math.PI * 2);
  g.ellipse(12, -14 - flap, 12, 7, 0.5, 0, Math.PI * 2);
  g.fill();
  // spiky body
  g.fillStyle = '#7b3fa0';
  g.beginPath();
  for (let k = 0; k < 16; k++) {
    const a = (k / 16) * Math.PI * 2;
    const r = k % 2 ? 15 : 20;
    g.lineTo(Math.cos(a) * r, Math.sin(a) * r);
  }
  g.closePath();
  g.fill();
  g.fillStyle = '#a65fd0';
  g.beginPath();
  g.arc(0, 0, 13, 0, Math.PI * 2);
  g.fill();
  // grumpy eyes
  g.fillStyle = '#fff';
  g.beginPath();
  g.arc(-5, -2, 4, 0, Math.PI * 2);
  g.arc(5, -2, 4, 0, Math.PI * 2);
  g.fill();
  g.fillStyle = '#1b0f24';
  g.beginPath();
  g.arc(-5, -1, 2, 0, Math.PI * 2);
  g.arc(5, -1, 2, 0, Math.PI * 2);
  g.fill();
  g.strokeStyle = '#1b0f24';
  g.lineWidth = 2;
  g.beginPath();
  g.moveTo(-9, -8);
  g.lineTo(-2, -6);
  g.moveTo(9, -8);
  g.lineTo(2, -6);
  g.stroke();
  g.restore();
}

// Pip: a round seed with a two-leaf sprout, big eyes and tiny boots.
function drawPip(x, feetY, vy, face) {
  const stretch = Math.max(-0.18, Math.min(0.18, -vy / 5000));
  const sq = squash * 0.22;
  const sx = 1 + sq - stretch * 0.6, sy = 1 - sq + stretch;
  g.save();
  g.translate(x, feetY);
  if (state === 'falling' || state === 'over') g.rotate(deathSpin);
  g.scale(sx, sy);
  // boots
  g.fillStyle = '#2f5d3a';
  g.beginPath();
  g.ellipse(-9, -4, 8, 5, 0, 0, Math.PI * 2);
  g.ellipse(9, -4, 8, 5, 0, 0, Math.PI * 2);
  g.fill();
  // seed body
  g.fillStyle = '#c98b4a';
  g.beginPath();
  g.ellipse(0, -24, 18, 21, 0, 0, Math.PI * 2);
  g.fill();
  g.fillStyle = '#e8b679';
  g.beginPath();
  g.ellipse(0, -19, 11, 13, 0, 0, Math.PI * 2);
  g.fill();
  // sprout: two leaves on a little stem
  g.strokeStyle = '#3f9f5a';
  g.lineWidth = 3;
  g.beginPath();
  g.moveTo(0, -44);
  g.lineTo(0, -52);
  g.stroke();
  g.fillStyle = '#5ccf74';
  const sway = Math.sin(clock * 6) * 0.15 - face * 0.1;
  for (const s of [-1, 1]) {
    g.save();
    g.translate(0, -52);
    g.rotate(s * 0.7 + sway);
    g.beginPath();
    g.ellipse(s * 8, 0, 9, 4.5, 0, 0, Math.PI * 2);
    g.fill();
    g.restore();
  }
  // eyes look the way Pip is moving
  const look = face * 2.5;
  g.fillStyle = '#fff';
  g.beginPath();
  g.ellipse(-6 + look, -29, 5, 6, 0, 0, Math.PI * 2);
  g.ellipse(6 + look, -29, 5, 6, 0, 0, Math.PI * 2);
  g.fill();
  g.fillStyle = '#1b1408';
  g.beginPath();
  g.arc(-6 + look * 1.5, -28 + (vy > 300 ? 2 : 0), 2.6, 0, Math.PI * 2);
  g.arc(6 + look * 1.5, -28 + (vy > 300 ? 2 : 0), 2.6, 0, Math.PI * 2);
  g.fill();
  // cheeks
  g.fillStyle = 'rgba(255, 122, 89, 0.45)';
  g.beginPath();
  g.arc(-11, -20, 3, 0, Math.PI * 2);
  g.arc(11, -20, 3, 0, Math.PI * 2);
  g.fill();
  g.restore();
}

function draw(alpha) {
  const c = prevCam + (cam - prevCam) * alpha;
  let px = prevPip.x + (pip.x - prevPip.x) * alpha;
  if (Math.abs(pip.x - prevPip.x) > W / 2) px = pip.x; // wrapped this step: don't slide across the screen
  const py = prevPip.y + (pip.y - prevPip.y) * alpha;
  drawSky(c);
  for (const l of leaves) {
    const y = l.y - c;
    if (y > -40 && y < H + 40) drawLeaf(l, y);
  }
  for (const b of bugs) {
    const y = b.y - c;
    if (y > -40 && y < H + 40) drawBug(b, y);
  }
  const sy = py - c;
  drawPip(px, sy, pip.vy, pip.face);
  // when Pip is near an edge, draw it on the other side too (screen wrap)
  if (px < 30) drawPip(px + W, sy, pip.vy, pip.face);
  if (px > W - 30) drawPip(px - W, sy, pip.vy, pip.face);
  // height counter
  if (state === 'play' || state === 'falling') {
    g.fillStyle = '#fff';
    g.strokeStyle = 'rgba(0,0,0,0.3)';
    g.lineWidth = 5;
    g.font = '700 30px Fredoka, sans-serif';
    g.textAlign = 'left';
    const t = Math.floor(height / PX_PER_M) + ' m';
    g.strokeText(t, 16, 42);
    g.fillText(t, 16, 42);
  }
  if (state === 'paused') {
    g.fillStyle = 'rgba(10, 13, 22, 0.55)';
    g.fillRect(0, 0, W, H);
    g.fillStyle = '#fff';
    g.font = '700 40px Fredoka, sans-serif';
    g.textAlign = 'center';
    g.fillText('Paused', W / 2, H / 2);
    g.font = '700 18px Nunito, sans-serif';
    g.fillText('Press P to keep climbing', W / 2, H / 2 + 34);
  }
}

/* ---------- main loop: fixed physics steps, smooth drawing ---------- */
function loop(t) {
  requestAnimationFrame(loop);
  const frame = Math.min(0.1, (t - last) / 1000 || 0);
  last = t;
  if (state === 'paused') return draw(1);
  acc += frame;
  while (acc >= STEP) {
    prevPip = { ...pip };
    prevCam = cam;
    update(STEP);
    acc -= STEP;
  }
  if (state === 'ready') {
    // idle bounce on the ground before the climb starts
    if (pip.y >= START_Y) pip.vy = JUMP * 0.55;
  }
  draw(acc / STEP);
  if (state === 'play') updateHud();
}

function start() {
  reset();
  state = 'play';
  pip.vy = JUMP;
  acc = 0;
  $('overlay').hidden = true;
  $('sr').textContent = 'Climb started.';
}
function togglePause() {
  if (state === 'play') state = 'paused';
  else if (state === 'paused') {
    state = 'play';
    last = performance.now();
  }
}

/* ---------- controls ---------- */
$('start').addEventListener('click', (e) => {
  e.stopPropagation();
  start();
});
const KEYS = { ArrowLeft: 'left', a: 'left', A: 'left', ArrowRight: 'right', d: 'right', D: 'right' };
document.addEventListener('keydown', (e) => {
  if (KEYS[e.key]) {
    keys[KEYS[e.key]] = true;
    e.preventDefault();
  } else if (e.key === ' ' || e.key === 'Enter') {
    if (document.activeElement?.tagName === 'BUTTON' && state !== 'play') return;
    e.preventDefault();
    if (state === 'ready' || state === 'over') start();
  } else if (e.key.toLowerCase() === 'p' || e.key === 'Escape') togglePause();
  else if (e.key.toLowerCase() === 'r') start();
});
document.addEventListener('keyup', (e) => {
  if (KEYS[e.key]) keys[KEYS[e.key]] = false;
});
window.addEventListener('blur', () => {
  keys.left = keys.right = false;
  touches.clear();
  if (state === 'play') state = 'paused';
});
document.addEventListener('visibilitychange', () => {
  if (document.hidden && state === 'play') state = 'paused';
});
// touch / mouse: hold the left or right half of the game screen
const screenEl = canvas.parentElement;
screenEl.addEventListener('pointerdown', (e) => {
  if (e.target.closest('button')) return;
  const r = canvas.getBoundingClientRect();
  touches.set(e.pointerId, e.clientX < r.left + r.width / 2 ? 'left' : 'right');
  screenEl.setPointerCapture?.(e.pointerId);
});
screenEl.addEventListener('pointermove', (e) => {
  if (!touches.has(e.pointerId)) return;
  const r = canvas.getBoundingClientRect();
  touches.set(e.pointerId, e.clientX < r.left + r.width / 2 ? 'left' : 'right');
});
for (const ev of ['pointerup', 'pointercancel', 'lostpointercapture']) screenEl.addEventListener(ev, (e) => touches.delete(e.pointerId));
document.querySelectorAll('.pad button').forEach((b) => {
  const dir = b.dataset.dir;
  b.addEventListener('pointerdown', (e) => {
    e.preventDefault();
    touches.set('pad-' + e.pointerId, dir);
    b.classList.add('down');
  });
  for (const ev of ['pointerup', 'pointercancel', 'pointerleave'])
    b.addEventListener(ev, (e) => {
      touches.delete('pad-' + e.pointerId);
      b.classList.remove('down');
    });
});

reset();
requestAnimationFrame(loop);
window.__upfern = { get: () => ({ state, pip, cam, height, leaves, bugs }), keys, start, step: (n = 1) => { for (let i = 0; i < n; i++) { prevPip = { ...pip }; prevCam = cam; update(STEP); } } };

// ?demo=1 shows a still mid-climb scene (used for the portfolio preview image).
if (new URLSearchParams(location.search).get('demo') === '1') {
  reset();
  state = 'demo';
  height = 2400;
  cam = -1800;
  leaves = [
    { x: 120, y: -1260, w: PW, type: 'normal', vx: 0, spring: null, broken: false, fall: 0 },
    { x: 330, y: -1370, w: PW, type: 'moving', vx: 0, spring: null, broken: false, fall: 0 },
    { x: 200, y: -1480, w: PW, type: 'break', vx: 0, spring: null, broken: false, fall: 0 },
    { x: 380, y: -1590, w: PW, type: 'normal', vx: 0, spring: { off: 12, t: 0 }, broken: false, fall: 0 },
    { x: 150, y: -1700, w: PW, type: 'normal', vx: 0, spring: null, broken: false, fall: 0 },
  ];
  bugs = [{ x: 300, y: -1660, base: 300, t: 0.4, dead: false, vy: 0 }];
  pip = { x: 205, y: -1395, vx: 120, vy: -420, face: 1 };
  prevPip = { ...pip };
  prevCam = cam;
  $('overlay').hidden = true;
  updateHud();
  draw(1);
  state = 'demo-still';
}
