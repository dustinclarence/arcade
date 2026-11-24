// Neon Getaway — 16-bit style top-down city chase.
const $ = (id) => document.getElementById(id);
const canvas = $('game');
const g = canvas.getContext('2d');
g.imageSmoothingEnabled = false;
const VW = canvas.width, VH = canvas.height;
const T = 48, MAP = 43; // tile size and map size (tiles)
const ROUND_TIME = 120;

/* ---------- city map ---------- */
// 0 = road, 1 = building, 2 = park
const map = [];
const BUILD_COLORS = ['#3a2f5c', '#2c4a6e', '#5a2f4a', '#2f5a52', '#4a3f2c', '#3c3a66'];
const NEON = ['#ff4fd8', '#4ff0ff', '#ffd84f', '#7dff6a', '#ff6a4f'];
for (let y = 0; y < MAP; y++) {
  map.push([]);
  for (let x = 0; x < MAP; x++) {
    const road = x % 7 < 2 || y % 7 < 2;
    if (road) map[y].push(0);
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
let state = 'ready', car, cops, bag, cash, bags, lives, timeLeft, invuln, dist, distTimer, lastTime = 0, keys = {}, popups, sirenT = 0;
const START = { x: T, y: T * 1 + T / 2 };

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
  car = { x: START.x + T * 3, y: T, a: 0, v: 0 };
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
function farRoadTile(minDist) {
  for (let i = 0; i < 200; i++) {
    const [tx, ty] = roadTiles[Math.floor(Math.random() * roadTiles.length)];
    const c = tileCenter(tx, ty);
    if (Math.hypot(c.x - car.x, c.y - car.y) > minDist) return [tx, ty];
  }
  return roadTiles[0];
}
function placeBag() {
  const [tx, ty] = farRoadTile(T * 10);
  bag = tileCenter(tx, ty);
}
function syncCops() {
  while (cops.length < wanted()) {
    const [tx, ty] = farRoadTile(T * 12);
    const c = tileCenter(tx, ty);
    cops.push({ x: c.x, y: c.y, tx, ty, a: 0 });
  }
}

/* ---------- police pathfinding (distance field from the player) ---------- */
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
  const up = keys.up, down = keys.down, left = keys.left, right = keys.right;
  const ACC = 420, MAX = 280, REV = -140;
  if (up) car.v = Math.min(MAX, car.v + ACC * dt);
  else if (down) car.v = Math.max(REV, car.v - ACC * 1.3 * dt);
  else car.v *= Math.pow(0.35, dt);
  const steer = (right ? 1 : 0) - (left ? 1 : 0);
  car.a += steer * 3.1 * dt * Math.max(-1, Math.min(1, car.v / 120));
  const nx = car.x + Math.cos(car.a) * car.v * dt, ny = car.y + Math.sin(car.a) * car.v * dt;
  const corners = (x, y) => [[x + 12, y + 12], [x - 12, y + 12], [x + 12, y - 12], [x - 12, y - 12]];
  if (!corners(nx, car.y).some(([x, y]) => solidAt(x, y))) car.x = nx;
  else car.v *= -0.25;
  if (!corners(car.x, ny).some(([x, y]) => solidAt(x, y))) car.y = ny;
  else car.v *= -0.25;

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
  if (distTimer <= 0) {
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
    c.a = Math.atan2(dy, dx);
    if (close) {
      c.tx = Math.floor(c.x / T);
      c.ty = Math.floor(c.y / T);
    }
    if (!invuln && Math.hypot(car.x - c.x, car.y - c.y) < 26) return busted();
  }
  popups.forEach((p) => {
    p.life -= dt;
    p.y -= dt * 30;
  });
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

/* ---------- drawing ---------- */
function drawCity(camX, camY) {
  const x0 = Math.floor(camX / T), y0 = Math.floor(camY / T);
  for (let ty = y0 - 1; ty <= y0 + VH / T + 1; ty++)
    for (let tx = x0 - 1; tx <= x0 + VW / T + 1; tx++) {
      const sx = tx * T - camX, sy = ty * T - camY;
      if (tx < 0 || ty < 0 || tx >= MAP || ty >= MAP) {
        g.fillStyle = '#05070d';
        g.fillRect(sx, sy, T, T);
        continue;
      }
      const t = map[ty][tx];
      if (t === 0) {
        g.fillStyle = '#20232e';
        g.fillRect(sx, sy, T, T);
        // lane markings in the middle of each 2-tile-wide road
        g.fillStyle = '#e8d36a';
        if (ty % 7 === 1 && tx % 7 >= 2 && tx % 4 === 0) g.fillRect(sx + 8, sy - 2, 20, 4);
        if (tx % 7 === 1 && ty % 7 >= 2 && ty % 4 === 0) g.fillRect(sx - 2, sy + 8, 4, 20);
        if (tx % 7 < 2 && ty % 7 < 2) {
          g.fillStyle = 'rgba(255,255,255,0.08)';
          for (let i = 0; i < 6; i++) g.fillRect(sx + 4 + i * 7, sy + 4, 4, T - 8); // crossing
        }
      } else {
        // sidewalk edge
        g.fillStyle = '#6b6f80';
        g.fillRect(sx, sy, T, T);
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
          const col = BUILD_COLORS[(bx * 7 + by * 3) % BUILD_COLORS.length];
          g.fillStyle = col;
          g.fillRect(sx + inner, sy + inner, T - inner * 2, T - inner * 2);
          g.fillStyle = 'rgba(0,0,0,0.25)';
          g.fillRect(sx + inner, sy + T - inner - 6, T - inner * 2, 6);
          // lit windows
          g.fillStyle = (tx * 13 + ty * 7) % 3 ? 'rgba(255, 220, 140, 0.75)' : 'rgba(120, 220, 255, 0.6)';
          for (let i = 0; i < 2; i++) for (let j = 0; j < 2; j++) if ((tx + ty + i + j) % 3) g.fillRect(sx + 12 + i * 14, sy + 12 + j * 12, 8, 6);
          // neon sign on some corners
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
  g.translate(Math.round(x), Math.round(y));
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
  if (cop) {
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
  g.fillStyle = '#2f5a22';
  g.font = '700 12px monospace';
  g.textAlign = 'center';
  g.fillText('$', x, y + 6 + bob);
}
function drawArrow(camX, camY) {
  const dx = bag.x - car.x, dy = bag.y - car.y;
  if (Math.hypot(dx, dy) < 160) return;
  const a = Math.atan2(dy, dx);
  const cx = car.x - camX + Math.cos(a) * 54, cy = car.y - camY + Math.sin(a) * 54;
  g.save();
  g.translate(cx, cy);
  g.rotate(a);
  g.fillStyle = '#ffd84f';
  g.beginPath();
  g.moveTo(14, 0);
  g.lineTo(-8, -10);
  g.lineTo(-3, 0);
  g.lineTo(-8, 10);
  g.closePath();
  g.fill();
  g.restore();
}
function drawMinimap() {
  const S = 2.6, size = MAP * S, ox = VW - size - 10, oy = VH - size - 10;
  g.fillStyle = 'rgba(5, 7, 13, 0.75)';
  g.fillRect(ox - 4, oy - 4, size + 8, size + 8);
  for (let y = 0; y < MAP; y++)
    for (let x = 0; x < MAP; x++)
      if (!map[y][x]) {
        g.fillStyle = '#3a3f52';
        g.fillRect(ox + x * S, oy + y * S, S, S);
      }
  const dot = (px, py, c, r) => {
    g.fillStyle = c;
    g.fillRect(ox + (px / T) * S - r, oy + (py / T) * S - r, r * 2, r * 2);
  };
  dot(bag.x, bag.y, '#ffd84f', 3);
  cops.forEach((c) => dot(c.x, c.y, '#ff3b3b', 2));
  dot(car.x, car.y, '#4ff0ff', 3);
}
function draw(t) {
  const camX = Math.max(0, Math.min(MAP * T - VW, car.x - VW / 2));
  const camY = Math.max(0, Math.min(MAP * T - VH, car.y - VH / 2));
  drawCity(camX, camY);
  drawBag(bag.x - camX, bag.y - camY, t);
  cops.forEach((c) => drawCar(c.x - camX, c.y - camY, c.a, '#f1f1f1', '#1b1b22', true));
  if (!(invuln > 0 && Math.floor(t / 100) % 2)) drawCar(car.x - camX, car.y - camY, car.a, '#ff4fd8', '#7a1f6a', false);
  drawArrow(camX, camY);
  popups.forEach((p) => {
    g.globalAlpha = Math.max(0, p.life);
    g.fillStyle = '#ffd84f';
    g.font = '700 18px monospace';
    g.textAlign = 'center';
    g.fillText(p.text, p.x - camX, p.y - camY);
    g.globalAlpha = 1;
  });
  drawMinimap();
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
});
car = { x: START.x + T * 3, y: T, a: 0, v: 0 };
reset();
distTimer = 0;
requestAnimationFrame(loop);
window.__city = { map, solidAt, peek: () => ({ car, bag, cops }) };


// ?demo=1 shows a still mid-game scene (used for the portfolio preview image).
if (new URLSearchParams(location.search).get('demo') === '1') {
  reset();
  bags = 3;
  cash = 1150;
  timeLeft = 87;
  car = { x: 11 * T, y: 8 * T, a: 0, v: 0 };
  invuln = 0;
  bag = { x: 15 * T, y: 8 * T };
  cops = [
    { x: 6 * T, y: 8 * T, tx: 6, ty: 8, a: 0 },
    { x: 8 * T, y: 4 * T, tx: 8, ty: 4, a: Math.PI / 2 },
  ];
  updateHud();
  state = 'demo';
  $('overlay').hidden = true;
}
