// 祈福时的「福气降临」：全屏金色光尘自上飘落，每拜一次浮起一组吉字光轮
// （福 · 财 · 寿 · 禄 · 才，字不同、外圈光效也不同）。
// 用 2D 画布叠加在三维场景之上，不参与 Three 的渲染管线，用完即停。
const canvas = document.querySelector('#blessing');
const ctx = canvas ? canvas.getContext('2d') : null;
const reduced = !!(window.matchMedia && matchMedia('(prefers-reduced-motion: reduce)').matches);

let W = 0, H = 0, dpr = 1;
let running = false, raf = 0, lastT = 0;
let wash = 0, washTarget = 0;      // 顶部暖光强度
let spawnAcc = 0;
let loopNow = performance.now();   // 当前帧时间，福字打点与绘制共用这一条时间线
const motes = [];
const glyphs = [];

/* ---------- 光点贴图：画一次，之后只做 drawImage ---------- */
let sprite = null;
function makeSprite() {
  const c = document.createElement('canvas');
  c.width = c.height = 32;
  const g = c.getContext('2d');
  const grad = g.createRadialGradient(16, 16, 0, 16, 16, 16);
  grad.addColorStop(0, 'rgba(255,244,214,1)');
  grad.addColorStop(.32, 'rgba(255,211,136,.78)');
  grad.addColorStop(.68, 'rgba(255,186,96,.22)');
  grad.addColorStop(1, 'rgba(255,170,70,0)');
  g.fillStyle = grad;
  g.fillRect(0, 0, 32, 32);
  sprite = c;
}
function resize() {
  if (!canvas) return;
  dpr = Math.min(1.6, window.devicePixelRatio || 1);
  W = canvas.clientWidth || window.innerWidth;
  H = canvas.clientHeight || window.innerHeight;
  canvas.width = Math.round(W * dpr);
  canvas.height = Math.round(H * dpr);
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
}

/* ---------- 光尘 ---------- */
function addMote(burst) {
  if (motes.length > 150) return;
  const cx = W * .5, top = H * .30;
  const life = 3.4 + Math.random() * 3.4;
  motes.push(burst ? {
    x: cx + (Math.random() - .5) * W * .26,
    y: top + (Math.random() - .5) * H * .18,
    vx: (Math.random() - .5) * 26,
    vy: 18 + Math.random() * 46,
    size: 3 + Math.random() * 7,
    age: Math.random() * .5,
    life,
    sway: 4 + Math.random() * 12,
    phase: Math.random() * 6.283,
    freq: .5 + Math.random() * 1.1,
    bright: .55 + Math.random() * .45
  } : {
    x: Math.random() * W,
    y: -H * .04 + Math.random() * H * .12,
    vx: (Math.random() - .5) * 10,
    vy: 12 + Math.random() * 30,
    size: 2 + Math.random() * 6,
    age: 0,
    life,
    sway: 6 + Math.random() * 14,
    phase: Math.random() * 6.283,
    freq: .4 + Math.random() * .9,
    bright: .35 + Math.random() * .45
  });
}

/* ---------- 吉字光轮：福 · 财 · 寿 · 禄 · 才，各有身形 ---------- */
// motif 决定字外那一圈的形态，tint 是字面的金箔渐变，glow 是背后光晕的色相
const CHARS = [
  { ch: '福', motif: 'rings',  scale: 1.00, glow: '255,196,110',
    tint: ['255,246,214', '255,224,168', '230,174,104'] },
  { ch: '财', motif: 'rays',   scale: 0.96, glow: '255,180,88',
    tint: ['255,240,196', '255,206,116', '212,148,68'] },
  { ch: '寿', motif: 'petals', scale: 1.02, glow: '255,212,152',
    tint: ['255,250,226', '248,226,180', '206,166,112'] },
  { ch: '禄', motif: 'halo',   scale: 0.98, glow: '212,234,152',
    tint: ['246,255,226', '220,238,180', '158,184,114'] },
  { ch: '才', motif: 'rays',   scale: 0.94, glow: '246,230,198',
    tint: ['255,250,232', '246,232,206', '204,184,148'] }
];
let charIdx = -1;

// 轮流出现，偶尔跳一位，既不会连着两次同一个字，也不至于每次都按死顺序
function nextChar() {
  charIdx = (charIdx + 1 + (Math.random() < .38 ? 1 : 0)) % CHARS.length;
  return CHARS[charIdx];
}

function pushGlyph(spec, size, x, y, alpha, life) {
  glyphs.push({
    t0: loopNow,
    spec,
    life,
    x, y, size: size * spec.scale, alpha,
    spin: (Math.random() - .5) * .5
  });
}

// 每一拜都是「一群」吉字：主字居中，旁边再浮几枚小字，而不是孤零零一个
function addGlyph(strong) {
  // 手机上靠宽度定字径，桌面上用高度封顶，两边看着都不会太小
  const base = Math.max(72, Math.min(W * .30, H * .21, 260));
  const cy = H * (strong ? .365 : .35);
  pushGlyph(nextChar(), base, W * (.5 + (Math.random() - .5) * .05), cy, 1, strong ? 4.2 : 3.3);

  const comp = base * (strong ? .54 : .46);
  // 横排不能顶到屏幕边：先按字径留出余量，再决定往两边推多远
  const off = Math.min(base * 1.45, W * .5 - comp * .62 - W * .055);
  if (strong) {
    pushGlyph(nextChar(), comp, W * .5 - off, cy + base * .30, .74, 3.5);
    pushGlyph(nextChar(), comp, W * .5 + off, cy + base * .22, .74, 3.5);
  } else {
    const side = Math.random() < .5 ? -1 : 1;
    pushGlyph(nextChar(), comp, W * .5 + side * off, cy + base * .26, .62, 3.2);
  }
  while (glyphs.length > 6) glyphs.shift();
}

/* ---------- 绘制 ---------- */
function drawWash(k) {
  if (k <= .002) return;
  const g = ctx.createLinearGradient(0, 0, 0, H * .62);
  g.addColorStop(0, `rgba(255,216,152,${.17 * k})`);
  g.addColorStop(.45, `rgba(255,199,124,${.07 * k})`);
  g.addColorStop(1, 'rgba(255,190,110,0)');
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, W, H * .62);

  const cx = W * .5, cy = H * .12;
  const rg = ctx.createRadialGradient(cx, cy, 0, cx, cy, H * .66);
  rg.addColorStop(0, `rgba(255,231,180,${.20 * k})`);
  rg.addColorStop(.55, `rgba(255,206,138,${.07 * k})`);
  rg.addColorStop(1, 'rgba(255,196,120,0)');
  ctx.fillStyle = rg;
  ctx.fillRect(0, 0, W, H);
}

function drawGlyph(g, now) {
  const age = Math.max(0, (now - g.t0) / 1000);
  const k = age / g.life;
  if (k >= 1) return false;
  const fade = (k < .16 ? k / .16 : (k > .66 ? 1 - (k - .66) / .34 : 1)) * (g.alpha || 1);
  const drop = (1 - Math.min(1, age / .55)) ** 2;      // 从上方落定
  const sink = k > .66 ? (k - .66) / .34 * H * .018 : 0;  // 随后缓缓沉下去
  const y = g.y - drop * H * .07 + sink;
  const s = g.size;
  const spec = g.spec;
  const ringK = Math.max(0, Math.min(1, age / 1.6));

  ctx.globalCompositeOperation = 'lighter';
  // 背后的柔和光晕
  const halo = ctx.createRadialGradient(g.x, y, 0, g.x, y, Math.max(1, s * 1.7));
  halo.addColorStop(0, `rgba(${spec.glow},${.26 * fade})`);
  halo.addColorStop(.45, `rgba(${spec.glow},${.10 * fade})`);
  halo.addColorStop(1, `rgba(${spec.glow},0)`);
  ctx.fillStyle = halo;
  ctx.beginPath(); ctx.arc(g.x, y, s * 1.7, 0, 6.2832); ctx.fill();

  // 字外那一圈，随字而变
  if (spec.motif === 'rings') {
    // 光轮：两圈缓缓外扩的细环
    for (const [mul, a] of [[1.02, .45], [1.34, .22]]) {
      ctx.beginPath();
      ctx.arc(g.x, y, Math.max(.6, s * (.46 + .62 * ringK) * mul), 0, 6.2832);
      ctx.strokeStyle = `rgba(${spec.glow},${a * fade * (1 - ringK * .55)})`;
      ctx.lineWidth = 1.4;
      ctx.stroke();
    }
  } else if (spec.motif === 'rays') {
    // 光芒：一圈缓缓转动的细长光束，往外长出去（窄屏收短，别射到屏幕外）
    const n = 18, r0 = s * .40;
    const r1 = Math.min(s * (.52 + 1.02 * ringK), W * .30);
    for (let i = 0; i < n; i++) {
      const a = i / n * 6.2832 + age * .30;
      const len = r1 * (.86 + .16 * Math.sin(age * 2.2 + i * 1.7));
      ctx.beginPath();
      ctx.moveTo(g.x + Math.cos(a) * r0, y + Math.sin(a) * r0);
      ctx.lineTo(g.x + Math.cos(a) * len, y + Math.sin(a) * len);
      ctx.strokeStyle = `rgba(${spec.glow},${.30 * fade * (1 - ringK * .5)})`;
      ctx.lineWidth = 1.2;
      ctx.stroke();
    }
  } else if (spec.motif === 'petals') {
    // 莲瓣：一圈细密小点，慢慢铺开、旋转
    const n = 28, r = s * (.50 + .46 * ringK);
    for (let i = 0; i < n; i++) {
      const a = i / n * 6.2832 - age * .18;
      const d = 1.3 + 1.2 * (.5 + .5 * Math.sin(age * 2.6 + i * .9));
      ctx.beginPath();
      ctx.arc(g.x + Math.cos(a) * r, y + Math.sin(a) * r, d, 0, 6.2832);
      ctx.fillStyle = `rgba(${spec.glow},${.42 * fade * (1 - ringK * .45)})`;
      ctx.fill();
    }
  } else {
    // halo：两圈反向转动的虚线环
    ctx.save();
    ctx.setLineDash([s * .07, s * .12]);
    for (const [dir, mul, a] of [[1, 1.06, .34], [-1, 1.28, .18]]) {
      ctx.beginPath();
      ctx.arc(g.x, y, Math.max(.6, s * (.46 + .55 * ringK) * mul), 0, 6.2832);
      ctx.strokeStyle = `rgba(${spec.glow},${a * fade * (1 - ringK * .5)})`;
      ctx.lineWidth = 1.6;
      ctx.lineDashOffset = dir * age * s * .55;
      ctx.stroke();
    }
    ctx.restore();
  }

  // 字
  ctx.globalCompositeOperation = 'source-over';
  ctx.save();
  ctx.translate(g.x, y);
  ctx.rotate(g.spin * .02 * Math.sin(age * 1.2));
  ctx.font = `${s}px "STSong","SimSun","Songti SC",serif`;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.shadowColor = `rgba(${spec.glow},.85)`;
  ctx.shadowBlur = s * .40;
  // 金箔感的上下渐变，比纯色更有厚度
  const ink = ctx.createLinearGradient(0, -s * .5, 0, s * .5);
  ink.addColorStop(0, `rgba(${spec.tint[0]},${.94 * fade})`);
  ink.addColorStop(.55, `rgba(${spec.tint[1]},${.9 * fade})`);
  ink.addColorStop(1, `rgba(${spec.tint[2]},${.86 * fade})`);
  ctx.fillStyle = ink;
  ctx.fillText(spec.ch, 0, 0);
  ctx.restore();
  ctx.globalAlpha = 1;
  return true;
}

function draw(now) {
  ctx.clearRect(0, 0, W, H);
  drawWash(wash);

  // 光尘
  if (motes.length) {
    ctx.globalCompositeOperation = 'lighter';
    for (let i = motes.length - 1; i >= 0; i--) {
      const m = motes[i];
      const a = Math.min(1, m.age / .55) * Math.min(1, (m.life - m.age) / 1.3) * m.bright;
      if (a <= 0) { motes.splice(i, 1); continue; }
      ctx.globalAlpha = Math.max(0, Math.min(1, a * wash));
      ctx.drawImage(sprite, m.x - m.size / 2, m.y - m.size / 2, m.size, m.size);
    }
    ctx.globalAlpha = 1;
    ctx.globalCompositeOperation = 'source-over';
  }

  // 福字
  for (let i = glyphs.length - 1; i >= 0; i--) {
    if (!drawGlyph(glyphs[i], now)) glyphs.splice(i, 1);
  }
}

function step(now, dt) {
  wash += (washTarget - wash) * Math.min(1, dt * 2.6);

  if (!reduced && wash > .05 && washTarget > .5) {
    spawnAcc += dt;
    const gap = .12;
    while (spawnAcc > gap) { spawnAcc -= gap; addMote(false); }
  }

  for (let i = motes.length - 1; i >= 0; i--) {
    const m = motes[i];
    m.age += dt;
    m.x += (m.vx + Math.sin(m.age * m.freq * 6.283 + m.phase) * m.sway) * dt;
    m.y += m.vy * dt;
    if (m.age > m.life || m.y > H + 24) motes.splice(i, 1);
  }

  draw(now);

  const quiet = washTarget === 0 && wash < .012 && motes.length === 0 && glyphs.length === 0;
  if (quiet) {
    stopLoop();
    return;
  }
  raf = requestAnimationFrame(tick);
}

function tick(now) {
  // 低帧率下 dt 也要按真实流逝算，否则淡出会拖很久
  const dt = Math.min(.2, Math.max(.001, (now - (lastT || now)) / 1000));
  lastT = now;
  loopNow = now;
  step(now, dt);
}

function stopLoop() {
  running = false;
  if (raf) cancelAnimationFrame(raf);
  raf = 0;
  lastT = 0;
  if (ctx) ctx.clearRect(0, 0, W, H);
  if (canvas) canvas.hidden = true;
}

function ensureLoop() {
  if (!canvas || !ctx) return;
  if (!sprite) makeSprite();
  if (canvas.hidden) canvas.hidden = false;
  if (running) return;   // 已在跑就别重建画布，否则每拜一次都要清屏重分配
  resize();
  running = true;
  lastT = 0;
  raf = requestAnimationFrame(tick);
}

/* ---------- 对外接口 ---------- */
function start() {
  if (!canvas || !ctx) return;
  ensureLoop();
  washTarget = 1;
  if (!reduced) for (let i = 0; i < 26; i++) addMote(true);
}

function stop() {
  washTarget = 0;
  // 收势时把剩下的光尘与福字提前收掉，别让它们在半空挂很久
  for (const m of motes) m.life = Math.min(m.life, m.age + .55);
  for (const g of glyphs) {
    const age = Math.max(0, (loopNow - g.t0) / 1000);
    g.life = Math.min(g.life, Math.max(age + .35, g.life * .55));
  }
  if (!running) return;
}

// 每拜一次：一小簇光尘涌上来，再浮起一组吉字（一拜一个主字，连拜时满殿皆字）
function pulse(strength = 1) {
  if (!canvas || !ctx) return;
  ensureLoop();
  if (washTarget < .4) washTarget = .8;
  if (!reduced) {
    const n = Math.round(10 + 8 * Math.min(2, strength));
    for (let i = 0; i < n; i++) addMote(true);
  }
  addGlyph(strength >= 3);
}

window.addEventListener('resize', () => { if (running) resize(); });

export const blessing = { start, stop, pulse };
