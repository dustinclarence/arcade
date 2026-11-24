// Sky Stack — drop swinging floors to build a tower.
const $ = (id) => document.getElementById(id);
const canvas = $('game');
const g = canvas.getContext('2d');
const W = canvas.width, H = canvas.height;
const BW = 132, BH = 46, TOP_Y = 430; // tower top is drawn at this screen height
const PALETTE = ['#ff7a59', '#4fd1b5', '#5b8cff', '#ffc857', '#ff6b9a', '#9b8cff'];

let state = 'ready', tower, lives, best = 0, swingT, falling, camera, camTarget, popups, debris, raf = 0, lastTime = 0, combo;
// Tower sway: the tower pivots at its base. It leans towards its heavy side (centre of mass),
// sways more the taller it gets, and every landing gives it a wobble that slowly dies down.
let lean = 0, kick = 0, kickV = 0, swayClock = 0, theta = 0;
try { best = +localStorage.getItem('stack-best') || 0; } catch { /* storage blocked */ }
$('best').textContent = best;

function reset() {
  tower = [{ x: W / 2, color: '#2a3550' }]; // the foundation
  lives = 3;
  swingT = 0;
  falling = null;
  camera = 0;
  camTarget = 0;
  popups = [];
  debris = [];
  combo = 0;
  lean = kick = kickV = swayClock = theta = 0;
  updateHud();
}
const floors = () => tower.length - 1;
function updateHud() {
  $('floors').textContent = floors();
  $('lives').textContent = '♥'.repeat(lives) || '0';
  $('best').textContent = best;
}

// crane geometry
const pivot = () => ({ x: W / 2, y: 40 });
function hanging() {
  const speed = 1.6 + Math.min(2.2, floors() * 0.06);
  const amp = 0.55 + Math.min(0.3, floors() * 0.01);
  const a = Math.sin(swingT * speed) * amp;
  const L = 150;
  const p = pivot();
  return { x: p.x + Math.sin(a) * L, y: p.y + Math.cos(a) * L, a };
}

function drop() {
  if (state !== 'play' || falling) return;
  const h = hanging();
  falling = { x: h.x, y: h.y, vy: 0, color: PALETTE[floors() % PALETTE.length] };
}

/* ---------- sway geometry ---------- */
const pivotPt = () => ({ x: tower[0].x, y: TOP_Y + camera - BH }); // top of the foundation
// screen position of a point given in the tower's own (unrotated) frame
function toScreen(lx, ly) {
  const P = pivotPt(), c = Math.cos(theta), sn = Math.sin(theta);
  return { x: P.x + lx * c - ly * sn, y: P.y + lx * sn + ly * c };
}
// where the top surface of the tower is right now (it moves while the tower sways)
function topNow() {
  const n = floors();
  const top = tower[tower.length - 1];
  return toScreen(top.x - tower[0].x, -n * BH);
}
// Centre-of-mass check: if the floors above any level have their centre of mass beyond the
// edge of the floor that holds them up, they tip over. Returns that level, or -1 if stable.
function unstableLevel() {
  for (let i = 0; i < tower.length - 1; i++) {
    const above = tower.slice(i + 1);
    const com = above.reduce((s2, f) => s2 + f.x, 0) / above.length;
    const half = i === 0 ? BW / 2 + 10 : BW / 2;
    if (Math.abs(com - tower[i].x) > half) return i;
  }
  return -1;
}
function topple(level) {
  const n = floors();
  for (let i = tower.length - 1; i > level; i--) {
    const f = tower[i];
    const pos = toScreen(f.x - tower[0].x, -(i - 1) * BH - BH / 2);
    const side = Math.sign(f.x - tower[level].x) || 1;
    debris.push({ x: pos.x, y: pos.y, vy: -60 - (i - level) * 10, vx: side * (2.5 + Math.random()), rot: theta, color: f.color });
  }
  tower.length = level + 1;
  popups.push({ text: n - level > 1 ? `${n - level} floors toppled!` : 'It toppled!', x: W / 2, y: 140, life: 1.2, bad: true });
  kickV += 0.6 * (Math.random() < 0.5 ? -1 : 1);
  camTarget = floors() * BH;
}

function land() {
  const top = tower[tower.length - 1];
  const surf = topNow();
  const dx = falling.x - surf.x;
  if (Math.abs(dx) < BW * 0.78) {
    let x = top.x + dx;
    let text = 'Nice!';
    if (Math.abs(dx) < 7) {
      x = top.x;
      combo++;
      text = combo > 1 ? `Perfect ×${combo}!` : 'Perfect!';
    } else combo = 0;
    tower.push({ x, color: falling.color });
    // the landing pushes the tower sideways: off-centre drops make it wobble more
    kickV += (dx / BW) * 1.1 + (Math.random() - 0.5) * 0.05;
    const lvl = unstableLevel();
    if (lvl >= 0) {
      lives--;
      combo = 0;
      topple(lvl);
      falling = null;
      updateHud();
      if (lives <= 0) return endGame();
      return;
    }
    popups.push({ text, x: surf.x, y: TOP_Y - BH, life: 1 });
    camTarget = floors() * BH;
    if (floors() > best) {
      best = floors();
      try { localStorage.setItem('stack-best', best); } catch { /* ignore */ }
    }
  } else {
    lives--;
    combo = 0;
    debris.push({ x: falling.x, y: TOP_Y - BH, vy: 2, vx: dx > 0 ? 3 : -3, rot: 0, color: falling.color });
    popups.push({ text: 'Missed!', x: falling.x, y: TOP_Y - BH * 1.5, life: 1, bad: true });
    if (lives <= 0) {
      falling = null;
      updateHud();
      return endGame();
    }
  }
  falling = null;
  updateHud();
}

function endGame() {
  state = 'over';
  $('sr').textContent = `Game over. You built ${floors()} floors.`;
  $('ov-title').textContent = 'Tower complete!';
  $('ov-text').textContent = `You built ${floors()} floors.${floors() >= best && floors() > 0 ? ' New best!' : ` Best: ${best}.`}`;
  $('start').textContent = 'Build again';
  $('overlay').hidden = false;
  $('start').focus();
}

/* ---------- drawing ---------- */
function drawFloor(x, y, color, alpha = 1) {
  g.globalAlpha = alpha;
  g.fillStyle = color;
  g.fillRect(x - BW / 2, y - BH, BW, BH);
  g.fillStyle = 'rgba(0,0,0,0.18)';
  g.fillRect(x - BW / 2, y - 6, BW, 6);
  g.fillStyle = 'rgba(255, 244, 200, 0.85)';
  for (let i = 0; i < 4; i++) g.fillRect(x - BW / 2 + 12 + i * 30, y - BH + 11, 18, 18);
  g.globalAlpha = 1;
}
function draw() {
  const height = camera / (BH * 40);
  const sky = g.createLinearGradient(0, 0, 0, H);
  sky.addColorStop(0, `hsl(${215 + height * 30}, ${55 - Math.min(35, height * 30)}%, ${Math.max(8, 30 - height * 18)}%)`);
  sky.addColorStop(1, `hsl(${20 + height * 180}, 70%, ${Math.max(14, 62 - height * 40)}%)`);
  g.fillStyle = sky;
  g.fillRect(0, 0, W, H);
  // stars appear higher up
  if (height > 0.3) {
    g.fillStyle = `rgba(255,255,255,${Math.min(0.8, height - 0.3)})`;
    for (let i = 0; i < 40; i++) g.fillRect((i * 97) % W, (i * 53 + camera * 0.2) % (H * 0.6), 2, 2);
  }
  // clouds drift past
  g.fillStyle = 'rgba(255,255,255,0.12)';
  for (let i = 0; i < 4; i++) {
    const cy = ((i * 170 + camera * 0.6) % (H + 120)) - 60;
    const cx = (i * 130 + 60) % W;
    g.beginPath();
    g.ellipse(cx, cy, 70, 18, 0, 0, Math.PI * 2);
    g.fill();
  }
  // ground + skyline
  const groundY = TOP_Y + camera;
  if (groundY < H + 200) {
    g.fillStyle = '#1a2236';
    for (let i = 0; i < 9; i++) {
      const bh = 60 + ((i * 37) % 90);
      g.fillRect(i * 58 - 10, groundY - bh + BH, 50, bh + 300);
    }
    g.fillStyle = '#121826';
    g.fillRect(0, groundY + BH * 0, W, H);
  }
  // tower: the foundation stays put, the floors above rotate around its top (the sway)
  const base = tower[0];
  const by = TOP_Y + camera;
  if (by > -BH && by < H + BH * 6) {
    g.fillStyle = '#2a3550';
    g.fillRect(base.x - BW / 2 - 10, by - BH, BW + 20, BH + 200);
  }
  const P = pivotPt();
  g.save();
  g.translate(P.x, P.y);
  g.rotate(theta);
  for (let i = 1; i < tower.length; i++) {
    const ly = -(i - 1) * BH; // bottom of floor i in the tower's frame
    if (P.y + ly < -BH * 3 || P.y + ly > H + BH * 3) continue;
    drawFloor(tower[i].x - base.x, ly, tower[i].color);
  }
  g.restore();
  // crane
  const p = pivot();
  g.strokeStyle = '#ffc857';
  g.lineWidth = 6;
  g.beginPath();
  g.moveTo(0, p.y - 18);
  g.lineTo(W, p.y - 18);
  g.stroke();
  g.fillStyle = '#ffc857';
  g.fillRect(p.x - 14, p.y - 26, 28, 18);
  if (state === 'play' && !falling) {
    const h = hanging();
    g.strokeStyle = '#d8d2c4';
    g.lineWidth = 2;
    g.beginPath();
    g.moveTo(p.x, p.y - 8);
    g.lineTo(h.x, h.y - BH);
    g.stroke();
    drawFloor(h.x, h.y, PALETTE[floors() % PALETTE.length]);
    // guide line to help aim
    const surf = topNow();
    g.setLineDash([6, 8]);
    g.strokeStyle = 'rgba(255,255,255,0.25)';
    g.beginPath();
    g.moveTo(surf.x, surf.y - 4);
    g.lineTo(surf.x, h.y + 6);
    g.stroke();
    g.setLineDash([]);
  }
  if (falling) drawFloor(falling.x, falling.y, falling.color);
  debris.forEach((d) => {
    g.save();
    g.translate(d.x, d.y);
    g.rotate(d.rot);
    drawFloor(0, BH / 2, d.color, 0.8);
    g.restore();
  });
  popups.forEach((pp) => {
    g.globalAlpha = Math.max(0, pp.life);
    g.fillStyle = pp.bad ? '#ff7a59' : '#ffffff';
    g.font = '700 26px Fredoka, sans-serif';
    g.textAlign = 'center';
    g.fillText(pp.text, pp.x, pp.y);
    g.globalAlpha = 1;
  });
  // floor counter
  g.fillStyle = 'rgba(255,255,255,0.9)';
  g.font = '700 22px Fredoka, sans-serif';
  g.textAlign = 'left';
  g.fillText(`${floors()} floors`, 16, H - 18);
}

function loop(t) {
  const dt = Math.min(0.033, (t - lastTime) / 1000 || 0);
  lastTime = t;
  if (state === 'play') swingT += dt;
  // sway physics
  const n = floors();
  if (n > 0) {
    const com = tower.slice(1).reduce((s2, f) => s2 + f.x, 0) / n - tower[0].x;
    const k = 30 / (1 + n * 0.06); // taller towers are springier and slower
    const target = Math.max(-0.12, Math.min(0.12, (com / BW) * 0.05 * (1 + n * 0.05)));
    lean += (target - lean) * Math.min(1, dt * 2.5);
    kickV += (-k * kick - 1.5 * kickV) * dt;
    kick += kickV * dt;
    swayClock += dt * (2.3 / (1 + n * 0.02));
    const idle = Math.min(0.06, n * 0.0022 + (Math.abs(com) / BW) * 0.05) * Math.sin(swayClock);
    theta = Math.max(-0.4, Math.min(0.4, lean + kick + idle));
  } else {
    lean = kick = kickV = theta = 0;
  }
  if (falling) {
    falling.vy += 1600 * dt;
    falling.y += falling.vy * dt;
    const landY = topNow().y; // the top of the tower, wherever the sway has moved it
    if (falling.y >= landY) {
      falling.y = landY;
      land();
    }
  }
  camera += (camTarget - camera) * Math.min(1, dt * 6);
  debris.forEach((d) => {
    d.vy += 900 * dt;
    d.y += d.vy * dt;
    d.x += d.vx;
    d.rot += d.vx * 0.01;
  });
  debris = debris.filter((d) => d.y < H + 200);
  popups.forEach((pp) => {
    pp.life -= dt * 1.2;
    pp.y -= dt * 40;
  });
  popups = popups.filter((pp) => pp.life > 0);
  draw();
  raf = requestAnimationFrame(loop);
}

function start() {
  reset();
  state = 'play';
  $('overlay').hidden = true;
}
$('start').addEventListener('click', (e) => {
  e.stopPropagation();
  start();
});
canvas.parentElement.addEventListener('pointerdown', (e) => {
  if (e.target.closest('button')) return;
  drop();
});
document.addEventListener('keydown', (e) => {
  if (e.key === ' ' || e.key === 'Enter') {
    if (document.activeElement?.tagName === 'BUTTON' && state !== 'play') return;
    e.preventDefault();
    if (state === 'play') drop();
    else start();
  }
  if (e.key.toLowerCase() === 'r') start();
});
reset();
raf = requestAnimationFrame(loop);
window.__stack = { get: () => ({ tower, theta, lives, state, falling }), drop, start, unstableLevel, hanging, topNow };


// ?demo=1 shows a still mid-game scene (used for the portfolio preview image).
if (new URLSearchParams(location.search).get('demo') === '1') {
  reset();
  const offs = [0, 6, -4, 10, 2, -8, 5];
  offs.forEach((o, i) => tower.push({ x: W / 2 + o, color: PALETTE[i % PALETTE.length] }));
  camera = camTarget = floors() * BH;
  theta = 0.03;
  swingT = 0.55;
  state = 'play';
  updateHud();
  $('overlay').hidden = true;
  cancelAnimationFrame(raf);
  draw();
}
