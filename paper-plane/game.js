// Paper Plane Dash — one-tap flyer.
const $ = (id) => document.getElementById(id);
const canvas = $('game');
const g = canvas.getContext('2d');
const W = canvas.width, H = canvas.height, GROUND = H - 70;
const GRAVITY = 1500, LIFT = -430, PW = 70;

let state = 'ready', plane, pillars, score, best = 0, spawnT, scroll, lastTime = 0, flash = 0;
try { best = +localStorage.getItem('plane-best') || 0; } catch { /* storage blocked */ }
$('best').textContent = best;

function reset() {
  plane = { x: 120, y: H / 2 - 40, vy: 0 };
  pillars = [];
  score = 0;
  spawnT = 0.6;
  scroll = 0;
  $('score').textContent = 0;
}
function gap() {
  return Math.max(150, 200 - score * 2.2);
}
function speed() {
  return Math.min(260, 170 + score * 3);
}
function flap() {
  if (state === 'ready') return;
  if (state === 'play') plane.vy = LIFT;
}

function die() {
  state = 'over';
  flash = 1;
  if (score > best) {
    best = score;
    try { localStorage.setItem('plane-best', best); } catch { /* ignore */ }
    $('best').textContent = best;
  }
  $('sr').textContent = `Crashed. Score ${score}.`;
  setTimeout(() => {
    $('ov-title').textContent = 'Crash landing!';
    $('ov-text').textContent = `You flew through ${score} gap${score === 1 ? '' : 's'}.${score >= best && score > 0 ? ' New best!' : ` Best: ${best}.`}`;
    $('start').textContent = 'Fly again';
    $('overlay').hidden = false;
    $('start').focus();
  }, 550);
}

function update(dt) {
  scroll += speed() * dt;
  if (state !== 'play') return;
  plane.vy += GRAVITY * dt;
  plane.y += plane.vy * dt;
  spawnT -= dt;
  if (spawnT <= 0) {
    const gp = gap();
    const top = 70 + Math.random() * (GROUND - gp - 140);
    pillars.push({ x: W + 20, top, gap: gp, passed: false });
    spawnT = 1.45;
  }
  pillars.forEach((p) => (p.x -= speed() * dt));
  pillars = pillars.filter((p) => p.x > -PW - 10);
  // scoring + collisions (slightly forgiving hit box)
  const r = { x: plane.x - 18, y: plane.y - 9, w: 36, h: 18 };
  for (const p of pillars) {
    if (!p.passed && p.x + PW < plane.x) {
      p.passed = true;
      score++;
      $('score').textContent = score;
    }
    const inX = r.x + r.w > p.x + 4 && r.x < p.x + PW - 4;
    if (inX && (r.y < p.top || r.y + r.h > p.top + p.gap)) return die();
  }
  if (plane.y < 14) {
    // the top of the screen is a soft ceiling, not a crash
    plane.y = 14;
    plane.vy = Math.max(0, plane.vy);
  }
  if (plane.y + 9 > GROUND) return die();
}

function drawPillar(x, y, h, cap) {
  const grad = g.createLinearGradient(x, 0, x + PW, 0);
  grad.addColorStop(0, '#3fae7a');
  grad.addColorStop(0.5, '#6ad49d');
  grad.addColorStop(1, '#2f8c60');
  g.fillStyle = grad;
  g.fillRect(x, y, PW, h);
  g.fillStyle = 'rgba(0,0,0,0.18)';
  for (let yy = y + 30; yy < y + h; yy += 46) g.fillRect(x, yy, PW, 5); // bamboo rings
  g.fillStyle = '#2f8c60';
  g.fillRect(x - 6, cap, PW + 12, 16);
}
function drawPlane() {
  g.save();
  g.translate(plane.x, plane.y);
  g.rotate(Math.max(-0.5, Math.min(0.9, plane.vy / 700)));
  g.fillStyle = '#ffffff';
  g.beginPath();
  g.moveTo(24, 0);
  g.lineTo(-20, -14);
  g.lineTo(-10, 0);
  g.lineTo(-20, 12);
  g.closePath();
  g.fill();
  g.fillStyle = '#d6dcea';
  g.beginPath();
  g.moveTo(24, 0);
  g.lineTo(-10, 0);
  g.lineTo(-20, 12);
  g.closePath();
  g.fill();
  g.strokeStyle = '#ff7a59';
  g.lineWidth = 2;
  g.beginPath();
  g.moveTo(-10, 0);
  g.lineTo(24, 0);
  g.stroke();
  g.restore();
}
function draw() {
  const sky = g.createLinearGradient(0, 0, 0, H);
  sky.addColorStop(0, '#5b8cff');
  sky.addColorStop(1, '#ffd3a1');
  g.fillStyle = sky;
  g.fillRect(0, 0, W, H);
  // sun
  g.fillStyle = 'rgba(255, 236, 170, 0.9)';
  g.beginPath();
  g.arc(W - 90, 120, 46, 0, Math.PI * 2);
  g.fill();
  // clouds and hills with parallax
  g.fillStyle = 'rgba(255,255,255,0.75)';
  for (let i = 0; i < 5; i++) {
    const x = ((i * 160 - scroll * 0.2) % (W + 200) + W + 200) % (W + 200) - 100;
    g.beginPath();
    g.ellipse(x, 90 + (i % 3) * 70, 60, 20, 0, 0, Math.PI * 2);
    g.fill();
  }
  g.fillStyle = '#7bc7a0';
  for (let i = 0; i < 6; i++) {
    const x = ((i * 140 - scroll * 0.45) % (W + 280) + W + 280) % (W + 280) - 140;
    g.beginPath();
    g.ellipse(x, GROUND + 10, 120, 70, 0, Math.PI, 0);
    g.fill();
  }
  pillars.forEach((p) => {
    drawPillar(p.x, 0, p.top, p.top - 16);
    drawPillar(p.x, p.top + p.gap, GROUND - p.top - p.gap, p.top + p.gap);
  });
  // ground
  g.fillStyle = '#e8c27a';
  g.fillRect(0, GROUND, W, H - GROUND);
  g.fillStyle = '#d4a85c';
  for (let x = -((scroll) % 40); x < W; x += 40) g.fillRect(x, GROUND, 20, 8);
  drawPlane();
  // big score
  if (state === 'play') {
    g.fillStyle = '#fff';
    g.strokeStyle = 'rgba(0,0,0,0.25)';
    g.lineWidth = 6;
    g.font = '700 56px Fredoka, sans-serif';
    g.textAlign = 'center';
    g.strokeText(score, W / 2, 90);
    g.fillText(score, W / 2, 90);
  }
  if (flash > 0) {
    g.fillStyle = `rgba(255,255,255,${flash})`;
    g.fillRect(0, 0, W, H);
  }
}
function loop(t) {
  const dt = Math.min(0.033, (t - lastTime) / 1000 || 0);
  lastTime = t;
  if (state === 'ready') plane.y = H / 2 - 40 + Math.sin(t / 300) * 10; // hover before take-off
  update(dt);
  flash = Math.max(0, flash - dt * 3);
  draw();
  requestAnimationFrame(loop);
}
function start() {
  reset();
  state = 'play';
  plane.vy = LIFT;
  $('overlay').hidden = true;
}
$('start').addEventListener('click', (e) => {
  e.stopPropagation();
  start();
});
canvas.parentElement.addEventListener('pointerdown', (e) => {
  if (e.target.closest('button')) return;
  flap();
});
document.addEventListener('keydown', (e) => {
  if (e.key === ' ' || e.key === 'ArrowUp' || e.key.toLowerCase() === 'w') {
    if (document.activeElement?.tagName === 'BUTTON' && state !== 'play') return;
    e.preventDefault();
    if (state === 'play') flap();
    else if (!$('overlay').hidden) start();
  }
  if (e.key.toLowerCase() === 'r') start();
});
reset();
requestAnimationFrame(loop);


// ?demo=1 shows a still mid-game scene (used for the portfolio preview image).
if (new URLSearchParams(location.search).get('demo') === '1') {
  reset();
  state = 'demo';
  score = 7;
  $('score').textContent = score;
  plane.y = 300;
  plane.vy = -120;
  pillars = [{ x: 190, top: 200, gap: 190, passed: false }, { x: 430, top: 140, gap: 190, passed: false }];
  scroll = 300;
  $('overlay').hidden = true;
}
