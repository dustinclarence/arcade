// Moonlit Cash Run — 16-bit style city chase with a big map and a chase camera.
const $ = (id) => document.getElementById(id);
const canvas = $('game');
const g = canvas.getContext('2d');
g.imageSmoothingEnabled = false;
const VW = canvas.width, VH = canvas.height;
const T = 48; // tile size in pixels
const MAP = 99; // 99 x 99 tiles: 14 x 14 city blocks
const ROUND_TIME = 150;

/* ---------- city map ---------- */
// 0 = road, 1 = building, 2 = park, 3 = river
const map = [];
const BUILD_COLORS = ['#3a2f5c', '#2c4a6e', '#5a2f4a', '#2f5a52', '#4a3f2c', '#3c3a66'];
const NEON = ['#ff4fd8', '#4ff0ff', '#ffd84f', '#7dff6a', '#ff6a4f'];
const RIVER = [45, 46, 47]; // rows of water; the roads that cross them become bridges
for (let y = 0; y < MAP; y++) {
  map.push([]);
  for (let x = 0; x < MAP; x++) {
    const road = x % 7 < 2 || y % 7 < 2;
    if (road) map[y].push(0);
    else if (RIVER.includes(y)) map[y].push(3);
    else {
      const bx = Math.floor(x / 7), by = Math.floor(y / 7);
      map[y].push((bx * 3 + by * 5) % 7 === 0 ? 2 : 1);
    }
  }
}
const solidTile = (tx, ty) => tx < 0 || ty < 0 || tx >= MAP || ty >= MAP || map[ty][tx] !== 0;
const solidAt = (x, y) => solidTile(Math.floor(x / T), Math.floor(y / T));
const roadTiles = [];
for (let y = 0; y < MAP; y++) for (let x = 0; x < MAP; x++) if (!map[y][x]) roadTiles.push([x, y]);
const tileCenter = (tx, ty) => ({ x: tx * T + T / 2, y: ty * T + T / 2 });

/* ---------- state ---------- */
let state = 'ready', car, cops, bag, cash, bags, lives, timeLeft, invuln, dist, distTimer = 0, lastTime = 0, keys = {}, popups, sirenT = 0;
let camMode = 'chase'; // 'chase' = behind the car, 'top' = classic top-down
let steerSens = 1; // steering sensitivity (0.5 = gentle, 2 = sharp), saved on this device
try {
  const saved = parseFloat(localStorage.getItem('cashrun-steer'));
  if (saved >= 0.5 && saved <= 2) steerSens = saved;
} catch { /* storage blocked */ }
let camAngle = -Math.PI / 2;
try {
  if (localStorage.getItem('cashrun-camera') === 'top') camMode = 'top';
} catch { /* storage blocked */ }
const START = { x: 7 * T + T / 2, y: T }; // on the first east-west road

function reset() {
  cash = 0;
  bags = 0;
  lives = 3;
  timeLeft = ROUND_TIME;
  popups = [];
  respawn();
  placeBag();
  updateHud();
}
function respawn() {
  car = { x: START.x + T * 3, y: START.y, a: 0, v: 0 };
  camAngle = car.a;
  invuln = 2;
  cops = [];
  syncCops();
}
const wanted = () => Math.min(5, 1 + Math.floor(bags / 2));
function updateHud() {
  $('cash').textContent = '$' + cash.toLocaleString();
  $('wanted').textContent = '★'.repeat(wanted()) + '☆'.repeat(5 - wanted());
  $('lives').textContent = '♥'.repeat(lives) || '0';
  $('time').textContent = Math.ceil(timeLeft);
}
// A random road tile between minTiles and maxTiles away from the car.
function roadTileBetween(minTiles, maxTiles) {
  for (let i = 0; i < 400; i++) {
    const [tx, ty] = roadTiles[Math.floor(Math.random() * roadTiles.length)];
    const c = tileCenter(tx, ty);
    const d = Math.hypot(c.x - car.x, c.y - car.y) / T;
    if (d >= minTiles && d <= maxTiles) return [tx, ty];
  }
  return roadTiles[Math.floor(Math.random() * roadTiles.length)];
}
function placeBag() {
  const [tx, ty] = roadTileBetween(9, 22);
  bag = tileCenter(tx, ty);
}
function syncCops() {
  while (cops.length < wanted()) {
    const [tx, ty] = roadTileBetween(13, 26);
    const c = tileCenter(tx, ty);
    cops.push({ x: c.x, y: c.y, tx, ty, a: 0 });
  }
}

/* ---------- police pathfinding (breadth-first search from the player) ---------- */
function buildDistanceField() {
  dist = Array.from({ length: MAP }, () => new Array(MAP).fill(Infinity));
  const sx = Math.max(0, Math.min(MAP - 1, Math.floor(car.x / T))), sy = Math.max(0, Math.min(MAP - 1, Math.floor(car.y / T)));
  const q = [[sx, sy]];
  dist[sy][sx] = 0;
  for (let h = 0; h < q.length; h++) {
    const [x, y] = q[h];
    for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
      const nx = x + dx, ny = y + dy;
      if (solidTile(nx, ny) || dist[ny][nx] !== Infinity) continue;
      dist[ny][nx] = dist[y][x] + 1;
      q.push([nx, ny]);
    }
  }
}

/* ---------- update ---------- */
function update(dt) {
  if (state !== 'play') return;
  timeLeft -= dt;
  invuln = Math.max(0, invuln - dt);
  sirenT += dt;
  if (timeLeft <= 0) return endGame(true);

  // player car
  const ACC = 430, MAX = 290, REV = -150;
  if (keys.up) car.v = Math.min(MAX, car.v + ACC * dt);
  else if (keys.down) car.v = Math.max(REV, car.v - ACC * 1.4 * dt);
  else car.v *= Math.pow(0.35, dt);
  const steer = (keys.right ? 1 : 0) - (keys.left ? 1 : 0);
  // Steering grows with speed and flips when reversing, like a real car. It never drops to zero,
  // so the car can always turn its nose away from a wall or out of a corner, even when stopped.
  const speedFactor = Math.min(1, Math.abs(car.v) / 90);
  const turnDir = car.v < -8 ? -1 : 1;
  car.a += steer * 2.8 * steerSens * dt * turnDir * Math.max(0.6, speedFactor);

  // Move in small sub-steps so the car can never pass through a wall between frames.
  const blocked = (x, y) => [[x + 11, y + 11], [x - 11, y + 11], [x + 11, y - 11], [x - 11, y - 11]].some(([px, py]) => solidAt(px, py));
  const travel = Math.abs(car.v) * dt;
  const steps = Math.max(1, Math.ceil(travel / 4));
  const sx = (Math.cos(car.a) * car.v * dt) / steps, sy = (Math.sin(car.a) * car.v * dt) / steps;
  let bumped = false;
  for (let k = 0; k < steps; k++) {
    // each axis is resolved on its own, so the car slides along walls instead of sticking
    if (!blocked(car.x + sx, car.y)) car.x += sx;
    else {
      bumped = true;
      // corner assist: if only a building corner is in the way, ease the car around it
      for (const n of [3, -3, 6, -6, 9, -9]) if (!blocked(car.x, car.y + n) && !blocked(car.x + sx, car.y + n)) { car.y += Math.sign(n) * Math.min(Math.abs(n), 2); break; }
    }
    if (!blocked(car.x, car.y + sy)) car.y += sy;
    else {
      bumped = true;
      for (const n of [3, -3, 6, -6, 9, -9]) if (!blocked(car.x + n, car.y) && !blocked(car.x + n, car.y + sy)) { car.x += Math.sign(n) * Math.min(Math.abs(n), 2); break; }
    }
  }
  // Safety net: if the car ever ends up inside a building, push it back to the nearest free spot.
  if (blocked(car.x, car.y)) {
    outer: for (let r = 2; r <= 24; r += 2)
      for (const [dx, dy] of [[r, 0], [-r, 0], [0, r], [0, -r], [r, r], [-r, r], [r, -r], [-r, -r]])
        if (!blocked(car.x + dx, car.y + dy)) { car.x += dx; car.y += dy; break outer; }
  }
  // scraping a wall slows the car gently instead of stopping it dead
  if (bumped) car.v *= Math.pow(0.25, dt);

  // the chase camera turns smoothly to follow the car
  let diff = car.a - camAngle;
  diff = Math.atan2(Math.sin(diff), Math.cos(diff));
  camAngle += diff * Math.min(1, dt * 5);

  // cash bag
  if (Math.hypot(bag.x - car.x, bag.y - car.y) < 30) {
    const gain = 250 + wanted() * 150;
    cash += gain;
    bags++;
    popups.push({ x: bag.x, y: bag.y, text: `+$${gain}`, life: 1.2 });
    placeBag();
    syncCops();
    updateHud();
  }

  // police
  distTimer -= dt;
  if (distTimer <= 0 || !dist) {
    buildDistanceField();
    distTimer = 0.25;
  }
  const copSpeed = 130 + wanted() * 18;
  for (const c of cops) {
    const close = Math.hypot(car.x - c.x, car.y - c.y) < T * 1.6;
    let target;
    if (close) target = { x: car.x, y: car.y };
    else {
      const ctr = tileCenter(c.tx, c.ty);
      if (Math.hypot(ctr.x - c.x, ctr.y - c.y) < 4) {
        let best = null, bd = dist[c.ty]?.[c.tx] ?? Infinity;
        for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
          const d = dist[c.ty + dy]?.[c.tx + dx];
          if (d !== undefined && d < bd) { bd = d; best = [c.tx + dx, c.ty + dy]; }
        }
        if (best) [c.tx, c.ty] = best;
      }
      target = tileCenter(c.tx, c.ty);
    }
    const dx = target.x - c.x, dy = target.y - c.y, d = Math.hypot(dx, dy) || 1;
    const step = Math.min(d, copSpeed * dt);
    c.x += (dx / d) * step;
    c.y += (dy / d) * step;
    if (d > 0.5) c.a = Math.atan2(dy, dx);
    if (close) {
      c.tx = Math.floor(c.x / T);
      c.ty = Math.floor(c.y / T);
    }
    if (!invuln && Math.hypot(car.x - c.x, car.y - c.y) < 26) return busted();
  }
  popups.forEach((p) => (p.life -= dt));
  popups = popups.filter((p) => p.life > 0);
  updateHud();
}
function busted() {
  lives--;
  updateHud();
  if (lives <= 0) return endGame(false);
  state = 'busted';
  $('ov-title').textContent = 'Busted! 🚓';
  $('ov-text').textContent = `You have ${lives} ${lives === 1 ? 'life' : 'lives'} left. Your cash is safe.`;
  $('start').textContent = 'Keep driving';
  $('overlay').hidden = false;
  $('start').focus();
}
function endGame(survived) {
  state = 'over';
  $('sr').textContent = `Game over. Cash ${cash}.`;
  $('ov-title').textContent = survived ? 'Time! You got away 🏁' : 'Game over';
  $('ov-text').textContent = `You grabbed ${bags} cash bag${bags === 1 ? '' : 's'} worth $${cash.toLocaleString()}.`;
  $('start').textContent = 'Play again';
  $('overlay').hidden = false;
  $('start').focus();
}

/* ---------- camera ---------- */
// Chase camera: the car sits low on the screen, pointing up, and the city turns around it.
const CHASE_X = VW / 2, CHASE_Y = VH * 0.68;
function applyCamera() {
  if (camMode === 'chase') {
    g.translate(CHASE_X, CHASE_Y);
    g.rotate(-camAngle - Math.PI / 2);
    g.translate(-car.x, -car.y);
  } else {
    const camX = Math.max(0, Math.min(MAP * T - VW, car.x - VW / 2));
    const camY = Math.max(0, Math.min(MAP * T - VH, car.y - VH / 2));
    g.translate(-camX, -camY);
  }
}
function worldToScreen(x, y) {
  if (camMode === 'chase') {
    const a = -camAngle - Math.PI / 2, dx = x - car.x, dy = y - car.y;
    return { x: CHASE_X + dx * Math.cos(a) - dy * Math.sin(a), y: CHASE_Y + dx * Math.sin(a) + dy * Math.cos(a) };
  }
  const camX = Math.max(0, Math.min(MAP * T - VW, car.x - VW / 2));
  const camY = Math.max(0, Math.min(MAP * T - VH, car.y - VH / 2));
  return { x: x - camX, y: y - camY };
}

/* ---------- drawing (world coordinates) ---------- */
function drawCity() {
  const reach = Math.hypot(VW, VH) * 0.85; // enough to cover the rotated view
  const x0 = Math.floor((car.x - reach) / T), x1 = Math.ceil((car.x + reach) / T);
  const y0 = Math.floor((car.y - reach) / T), y1 = Math.ceil((car.y + reach) / T);
  for (let ty = y0; ty <= y1; ty++)
    for (let tx = x0; tx <= x1; tx++) {
      const sx = tx * T, sy = ty * T;
      if (tx < 0 || ty < 0 || tx >= MAP || ty >= MAP) {
        g.fillStyle = '#05070d';
        g.fillRect(sx, sy, T + 1, T + 1);
        continue;
      }
      const t = map[ty][tx];
      if (t === 0) {
        const bridge = RIVER.includes(ty);
        g.fillStyle = bridge ? '#3a3340' : '#20232e';
        g.fillRect(sx, sy, T + 1, T + 1);
        if (bridge) {
          g.fillStyle = '#8a7a6a';
          if (tx % 7 === 0) g.fillRect(sx, sy, 4, T + 1);
          if (tx % 7 === 1) g.fillRect(sx + T - 4, sy, 4, T + 1);
        }
        // dashed centre line along each 2-tile-wide road
        g.fillStyle = '#e8d36a';
        if (ty % 7 === 1 && tx % 7 >= 2 && tx % 2 === 0) g.fillRect(sx + 10, sy - 2, 24, 4);
        if (tx % 7 === 1 && ty % 7 >= 2 && ty % 2 === 0) g.fillRect(sx - 2, sy + 10, 4, 24);
        if (tx % 7 < 2 && ty % 7 < 2) {
          g.fillStyle = 'rgba(255,255,255,0.08)';
          for (let i = 0; i < 6; i++) g.fillRect(sx + 4 + i * 7, sy + 4, 4, T - 8); // crossing
        }
      } else if (t === 3) {
        g.fillStyle = '#16365a';
        g.fillRect(sx, sy, T + 1, T + 1);
        g.fillStyle = 'rgba(120, 190, 255, 0.25)';
        if ((tx + ty * 3) % 4 === 0) g.fillRect(sx + 8, sy + 14, 18, 3);
        if ((tx * 5 + ty) % 5 === 0) g.fillRect(sx + 22, sy + 32, 14, 3);
      } else {
        g.fillStyle = '#6b6f80'; // sidewalk
        g.fillRect(sx, sy, T + 1, T + 1);
        const inner = 6;
        if (t === 2) {
          g.fillStyle = '#2f7d4a';
          g.fillRect(sx + inner, sy + inner, T - inner * 2, T - inner * 2);
          if ((tx + ty) % 2 === 0) {
            g.fillStyle = '#1f5a34';
            g.fillRect(sx + 18, sy + 12, 12, 12);
            g.fillStyle = '#3fae6a';
            g.fillRect(sx + 14, sy + 8, 20, 10);
          }
        } else {
          const bx = Math.floor(tx / 7), by = Math.floor(ty / 7);
          g.fillStyle = BUILD_COLORS[(bx * 7 + by * 3) % BUILD_COLORS.length];
          g.fillRect(sx + inner, sy + inner, T - inner * 2, T - inner * 2);
          g.fillStyle = 'rgba(0,0,0,0.25)';
          g.fillRect(sx + inner, sy + T - inner - 6, T - inner * 2, 6);
          g.fillStyle = (tx * 13 + ty * 7) % 3 ? 'rgba(255, 220, 140, 0.75)' : 'rgba(120, 220, 255, 0.6)';
          for (let i = 0; i < 2; i++) for (let j = 0; j < 2; j++) if ((tx + ty + i + j) % 3) g.fillRect(sx + 12 + i * 14, sy + 12 + j * 12, 8, 6);
          if (tx % 7 === 2 && ty % 7 === 2) {
            g.fillStyle = NEON[(bx + by) % NEON.length];
            g.fillRect(sx + 4, sy + 2, T - 8, 4);
          }
        }
      }
    }
}
function drawCar(x, y, a, body, roof, cop) {
  g.save();
  g.translate(x, y);
  g.rotate(a);
  g.fillStyle = 'rgba(0,0,0,0.35)';
  g.fillRect(-15, -9, 32, 20);
  g.fillStyle = body;
  g.fillRect(-16, -10, 32, 20);
  g.fillStyle = roof;
  g.fillRect(-6, -8, 14, 16);
  g.fillStyle = '#9fe7ff';
  g.fillRect(6, -7, 5, 14); // windscreen
  g.fillStyle = '#ffef9a';
  g.fillRect(14, -9, 3, 4);
  g.fillRect(14, 5, 3, 4); // headlights
  if (!cop) {
    // headlight beams light the road ahead
    g.fillStyle = 'rgba(255, 240, 170, 0.12)';
    g.beginPath();
    g.moveTo(16, -8);
    g.lineTo(90, -34);
    g.lineTo(90, 34);
    g.lineTo(16, 8);
    g.closePath();
    g.fill();
  } else {
    const on = Math.floor(sirenT * 8) % 2;
    g.fillStyle = on ? '#ff3b3b' : '#3b7bff';
    g.fillRect(-2, -8, 5, 8);
    g.fillStyle = on ? '#3b7bff' : '#ff3b3b';
    g.fillRect(-2, 0, 5, 8);
  }
  g.restore();
}
function drawBag(x, y, t) {
  const bob = Math.sin(t / 200) * 3;
  g.fillStyle = 'rgba(255, 216, 79, 0.25)';
  g.beginPath();
  g.arc(x, y, 22 + Math.sin(t / 150) * 3, 0, Math.PI * 2);
  g.fill();
  g.fillStyle = '#c9a227';
  g.fillRect(x - 10, y - 8 + bob, 20, 18);
  g.fillStyle = '#ffe07a';
  g.fillRect(x - 6, y - 12 + bob, 12, 6);
}
function drawArrow() {
  const dx = bag.x - car.x, dy = bag.y - car.y;
  if (Math.hypot(dx, dy) < 150) return;
  const a = Math.atan2(dy, dx);
  g.save();
  g.translate(car.x + Math.cos(a) * 56, car.y + Math.sin(a) * 56);
  g.rotate(a);
  g.fillStyle = '#ffd84f';
  g.strokeStyle = '#1b1406';
  g.lineWidth = 2;
  g.beginPath();
  g.moveTo(16, 0);
  g.lineTo(-9, -11);
  g.lineTo(-3, 0);
  g.lineTo(-9, 11);
  g.closePath();
  g.fill();
  g.stroke();
  g.restore();
}

/* ---------- minimap (drawn once, then copied each frame) ---------- */
const MINI = 140;
const miniBase = document.createElement('canvas');
miniBase.width = miniBase.height = MINI;
(() => {
  const m = miniBase.getContext('2d');
  const S = MINI / MAP;
  m.fillStyle = 'rgba(5, 7, 13, 0.85)';
  m.fillRect(0, 0, MINI, MINI);
  for (let y = 0; y < MAP; y++)
    for (let x = 0; x < MAP; x++) {
      if (map[y][x] === 0) m.fillStyle = '#4a5068';
      else if (map[y][x] === 3) m.fillStyle = '#1f4f80';
      else continue;
      m.fillRect(x * S, y * S, Math.ceil(S), Math.ceil(S));
    }
})();
function drawMinimap() {
  const S = MINI / MAP, ox = VW - MINI - 10, oy = VH - MINI - 10;
  g.drawImage(miniBase, ox, oy);
  g.strokeStyle = 'rgba(255,255,255,0.25)';
  g.strokeRect(ox - 0.5, oy - 0.5, MINI + 1, MINI + 1);
  const dot = (px, py, c, r) => {
    g.fillStyle = c;
    g.fillRect(ox + (px / T) * S - r, oy + (py / T) * S - r, r * 2, r * 2);
  };
  dot(bag.x, bag.y, '#ffd84f', 3);
  cops.forEach((c) => dot(c.x, c.y, '#ff3b3b', 2.5));
  // the player is a small arrow showing which way the car faces
  g.save();
  g.translate(ox + (car.x / T) * S, oy + (car.y / T) * S);
  g.rotate(car.a);
  g.fillStyle = '#4ff0ff';
  g.beginPath();
  g.moveTo(5, 0);
  g.lineTo(-4, -3.5);
  g.lineTo(-4, 3.5);
  g.closePath();
  g.fill();
  g.restore();
}

function draw(t) {
  g.fillStyle = '#05070d';
  g.fillRect(0, 0, VW, VH);
  g.save();
  applyCamera();
  drawCity();
  drawBag(bag.x, bag.y, t);
  cops.forEach((c) => drawCar(c.x, c.y, c.a, '#f1f1f1', '#1b1b22', true));
  if (!(invuln > 0 && Math.floor(t / 100) % 2)) drawCar(car.x, car.y, car.a, '#ff4fd8', '#7a1f6a', false);
  drawArrow();
  g.restore();
  // pop-up text is drawn upright on top of the rotated world
  popups.forEach((p) => {
    const s = worldToScreen(p.x, p.y);
    g.globalAlpha = Math.max(0, Math.min(1, p.life));
    g.fillStyle = '#ffd84f';
    g.font = '700 20px monospace';
    g.textAlign = 'center';
    g.fillText(p.text, s.x, s.y - (1.2 - p.life) * 40);
    g.globalAlpha = 1;
  });
  drawMinimap();
  // distance to the next bag
  const meters = Math.round(Math.hypot(bag.x - car.x, bag.y - car.y) / T) * 10;
  g.fillStyle = 'rgba(5, 7, 13, 0.7)';
  g.fillRect(10, 10, 170, 30);
  g.fillStyle = '#ffd84f';
  g.font = '700 15px monospace';
  g.textAlign = 'left';
  g.fillText(`Next cash: ${meters} m`, 20, 31);
  // vignette for a night-time feel
  const v = g.createRadialGradient(VW / 2, VH / 2, VH * 0.3, VW / 2, VH / 2, VW * 0.7);
  v.addColorStop(0, 'rgba(0,0,0,0)');
  v.addColorStop(1, 'rgba(0,0,20,0.45)');
  g.fillStyle = v;
  g.fillRect(0, 0, VW, VH);
}
function loop(t) {
  const dt = Math.min(0.033, (t - lastTime) / 1000 || 0);
  lastTime = t;
  update(dt);
  draw(t);
  requestAnimationFrame(loop);
}

/* ---------- input ---------- */
const KEYMAP = { ArrowUp: 'up', ArrowDown: 'down', ArrowLeft: 'left', ArrowRight: 'right', w: 'up', s: 'down', a: 'left', d: 'right' };
document.addEventListener('keydown', (e) => {
  const k = KEYMAP[e.key] || KEYMAP[e.key.toLowerCase()];
  if (k) {
    e.preventDefault();
    keys[k] = true;
  }
  if (e.key.toLowerCase() === 'p') togglePause();
  if (e.key.toLowerCase() === 'c') setCamera(camMode === 'chase' ? 'top' : 'chase');
});
document.addEventListener('keyup', (e) => {
  const k = KEYMAP[e.key] || KEYMAP[e.key.toLowerCase()];
  if (k) keys[k] = false;
});
window.addEventListener('blur', () => (keys = {}));
document.querySelectorAll('.pad button').forEach((b) => {
  const k = b.dataset.dir;
  const on = (e) => {
    e.preventDefault();
    keys[k] = true;
    b.classList.add('down');
  };
  const off = () => {
    keys[k] = false;
    b.classList.remove('down');
  };
  b.addEventListener('pointerdown', on);
  b.addEventListener('pointerup', off);
  b.addEventListener('pointerleave', off);
  b.addEventListener('pointercancel', off);
});
function setCamera(mode) {
  camMode = mode;
  camAngle = car.a;
  document.querySelectorAll('[data-camera]').forEach((b) => b.setAttribute('aria-pressed', String(b.dataset.camera === mode)));
  try { localStorage.setItem('cashrun-camera', mode); } catch { /* ignore */ }
}
document.querySelectorAll('[data-camera]').forEach((b) => b.addEventListener('click', () => setCamera(b.dataset.camera)));
function togglePause() {
  if (state === 'play') {
    state = 'paused';
    $('ov-title').textContent = 'Paused';
    $('ov-text').textContent = 'The police are waiting…';
    $('start').textContent = 'Resume';
    $('overlay').hidden = false;
  } else if (state === 'paused') {
    state = 'play';
    $('overlay').hidden = true;
  }
}
$('start').addEventListener('click', () => {
  if (state === 'busted') {
    respawn();
    distTimer = 0;
    state = 'play';
  } else if (state === 'paused') {
    state = 'play';
  } else {
    reset();
    distTimer = 0;
    state = 'play';
  }
  keys = {};
  $('overlay').hidden = true;
  canvas.focus?.();
});
car = { x: START.x + T * 3, y: START.y, a: 0, v: 0 };
reset();
setCamera(camMode);
requestAnimationFrame(loop);
const sensEl = $('steer');
if (sensEl) {
  sensEl.value = String(steerSens);
  const showSens = () => {
    const v = +sensEl.value;
    $('steer-out').textContent = v === 1 ? 'Normal' : v < 1 ? `Gentle (${v.toFixed(2)}×)` : `Sharp (${v.toFixed(2)}×)`;
    sensEl.setAttribute('aria-valuetext', $('steer-out').textContent);
  };
  showSens();
  sensEl.addEventListener('input', () => {
    steerSens = +sensEl.value;
    showSens();
    try { localStorage.setItem('cashrun-steer', String(steerSens)); } catch { /* ignore */ }
  });
}
window.__city = { map, solidAt, peek: () => ({ car, bag, cops }), setCamera, setKeys: (o) => Object.assign(keys, o), step: (dt) => update(dt), setState: (v) => (state = v) };

// ?demo=1 shows a still mid-game scene (used for the portfolio preview image).
if (new URLSearchParams(location.search).get('demo') === '1') {
  reset();
  bags = 3;
  cash = 1150;
  timeLeft = 112;
  car = { x: 11 * T, y: 8 * T, a: -Math.PI / 2 + 0.15, v: 0 };
  camAngle = car.a;
  invuln = 0;
  bag = { x: 8 * T, y: 2 * T };
  cops = [
    { x: 8 * T, y: 13 * T, tx: 8, ty: 13, a: -Math.PI / 2 },
    { x: 15 * T, y: 8 * T, tx: 15, ty: 8, a: Math.PI },
  ];
  updateHud();
  state = 'demo';
  $('overlay').hidden = true;
}
