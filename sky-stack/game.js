// Sky Stack — drop swinging floors to build a tower.
const $ = (id) => document.getElementById(id);
const canvas = $('game');
const g = canvas.getContext('2d');
const W = canvas.width, H = canvas.height;
const BW = 132, BH = 46, TOP_Y = 430; // tower top is drawn at this screen height
const PALETTE = ['#ff7a59', '#4fd1b5', '#5b8cff', '#ffc857', '#ff6b9a', '#9b8cff'];

let state = 'ready', tower, lives, best = 0, swingT, falling, camera, camTarget, popups, debris, raf = 0, lastTime = 0, combo;
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

function land() {
  const top = tower[tower.length - 1];
  const dx = falling.x - top.x;
  if (Math.abs(dx) < BW * 0.78) {
    let x = falling.x;
    let text = 'Nice!';
    if (Math.abs(dx) < 7) {
      x = top.x;
      combo++;
      text = combo > 1 ? `Perfect ×${combo}!` : 'Perfect!';
    } else combo = 0;
    tower.push({ x, color: falling.color });
    popups.push({ text, x, y: TOP_Y - BH, life: 1 });
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
  // tower
  tower.forEach((f, i) => {
    const y = TOP_Y + camera - (i - 0) * BH + BH * 0;
    if (y < -BH || y > H + BH) return;
    if (i === 0) {
      g.fillStyle = '#2a3550';
      g.fillRect(f.x - BW / 2 - 10, y - BH, BW + 20, BH + 200);
    } else drawFloor(f.x, y, f.color);
  });
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
    const top = tower[tower.length - 1];
    g.setLineDash([6, 8]);
    g.strokeStyle = 'rgba(255,255,255,0.25)';
    g.beginPath();
    g.moveTo(top.x, TOP_Y - BH - 4);
    g.lineTo(top.x, h.y + 6);
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
  if (falling) {
    falling.vy += 1600 * dt;
    falling.y += falling.vy * dt;
    const landY = TOP_Y + camera - floors() * BH - BH; // bottom of the next floor = top of the tower
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


// ?demo=1 shows a still mid-game scene (used for the portfolio preview image).
if (new URLSearchParams(location.search).get('demo') === '1') {
  reset();
  const offs = [0, 6, -4, 10, 2, -8, 5];
  offs.forEach((o, i) => tower.push({ x: W / 2 + o, color: PALETTE[i % PALETTE.length] }));
  camera = camTarget = floors() * BH;
  swingT = 0.55;
  state = 'play';
  updateHud();
  $('overlay').hidden = true;
  cancelAnimationFrame(raf);
  draw();
}
