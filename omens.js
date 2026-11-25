/* 瑞兆 · 十二种「遇见」
 *
 * 中国传统的吉兆/福兆，各自有兆象与所主之事。这一模块做三件事：
 *   1. 一次来访随机遇上 1–2 种瑞兆；
 *   2. 每种瑞兆有自己的画布特效（云气、仙禽、瑞兽、花木、星斗、钟声波纹）；
 *   3. 遇上即加「八德」buff（福 禄 寿 财 慧 康 喜 和），累计保存在本机。
 *
 * 坐标与 blessing.js 一致：一张覆盖全屏的 2D 画布叠在 three.js 场景之上。
 */
import {Q} from './quality.js?v=20261112h';

const canvas = document.querySelector('#omen');
const ctx = canvas ? canvas.getContext('2d') : null;
const reduced = !!(window.matchMedia && matchMedia('(prefers-reduced-motion: reduce)').matches);

const BUFFS = [
  ['fu', '福'], ['lu', '禄'], ['shou', '寿'], ['cai', '财'],
  ['hui', '慧'], ['kang', '康'], ['xi', '喜'], ['he', '和']
];

/* ---------- 兆象表 ---------- */
const OMENS = [
  { id: 'xiangyun', name: '祥云绕殿', fx: 'cloud', buff: { fu: 2 }, tint: [255, 214, 150],
    text: '五色云自西来，绕檐三匝不散。' },
  { id: 'ziqi', name: '紫气东来', fx: 'mist', buff: { hui: 2 }, tint: [186, 158, 226],
    text: '紫气浮关，关令望而知有真人过。' },
  { id: 'xianhe', name: '瑞鹤翔集', fx: 'crane', buff: { shou: 2 }, tint: [255, 247, 226],
    text: '鹤鸣于九皋，声闻于天，主寿考。' },
  { id: 'bailu', name: '白鹿衔芝', fx: 'deer', buff: { lu: 2 }, tint: [246, 238, 214],
    text: '鹿者禄兽，芝为仙草，衔芝而至。' },
  { id: 'jinli', name: '锦鲤跃波', fx: 'fish', buff: { cai: 2 }, tint: [255, 168, 104],
    text: '鱼跃于渊，利涉大川，主丰盈。' },
  { id: 'xique', name: '喜鹊登枝', fx: 'magpie', buff: { xi: 2 }, tint: [232, 238, 244],
    text: '仰见鹊噪，俗谓喜事将至。' },
  { id: 'bianfu', name: '蝙蝠来朝', fx: 'bat', buff: { fu: 1 }, tint: [206, 174, 158],
    text: '蝠者福也，倒悬于梁，福到眼前。' },
  { id: 'foli', name: '五色佛光', fx: 'halo', buff: { hui: 1 }, tint: [255, 232, 182],
    text: '日轮五色，照于殿上，如佛光临。' },
  { id: 'ganlu', name: '甘露垂珠', fx: 'dew', buff: { kang: 2 }, tint: [206, 234, 238],
    text: '天降甘露，草木皆润，主安健。' },
  { id: 'guizi', name: '桂子天香', fx: 'blossom', buff: { cai: 1, hui: 1 }, tint: [255, 226, 154],
    text: '桂子月中落，天香云外飘，主科名。' },
  { id: 'bingdi', name: '并蒂莲开', fx: 'lotus', buff: { he: 2 }, tint: [255, 202, 206],
    text: '莲开并蒂，一茎两花，家和事兴。' },
  { id: 'beidou', name: '北斗垂光', fx: 'star', buff: { shou: 1, lu: 1 }, tint: [204, 222, 255],
    text: '北斗七星，斗柄东指，主寿与禄。' },
  { id: 'zhongming', name: '钟鸣谷应', fx: 'bell', buff: { hui: 1, kang: 1 }, tint: [255, 224, 168],
    text: '一杵霜钟，山谷皆应，闻者心定。' }
];

/* ---------- 画布基础 ---------- */
let W = 0, H = 0, dpr = 1;
let running = false, raf = 0, lastT = 0, loopNow = performance.now();
let veil = 0, veilTarget = 0;
const acts = [];   // 正在演出的瑞兆
const bits = [];   // 光点、花瓣、露珠

function resize() {
  if (!canvas) return;
  dpr = Math.min(Q.omenDpr, window.devicePixelRatio || 1);
  W = canvas.clientWidth || window.innerWidth;
  H = canvas.clientHeight || window.innerHeight;
  canvas.width = Math.round(W * dpr);
  canvas.height = Math.round(H * dpr);
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
}
function soft(x, y, r, rgb, a) {
  const g = ctx.createRadialGradient(x, y, 0, x, y, Math.max(1, r));
  g.addColorStop(0, `rgba(${rgb},${a})`);
  g.addColorStop(.45, `rgba(${rgb},${a * .38})`);
  g.addColorStop(1, `rgba(${rgb},0)`);
  ctx.fillStyle = g;
  ctx.beginPath(); ctx.arc(x, y, r, 0, 6.2832); ctx.fill();
}
const pick = (a) => a[Math.floor(Math.random() * a.length)];
const rand = (a, b) => a + Math.random() * (b - a);

/* ---------- 粒子 ---------- */
function addBit(o) {
  if (bits.length > 260) return;
  bits.push(o);
}
function petalRain(tint, n, size = 5) {
  for (let i = 0; i < n; i++) {
    addBit({
      kind: 'petal', x: rand(0, W), y: rand(-H * .25, -10),
      vx: rand(-26, 14), vy: rand(34, 78), rot: rand(0, 6.28),
      spin: rand(-2.4, 2.4), size: size * rand(.7, 1.35),
      age: 0, life: rand(4.2, 7), tint
    });
  }
}
function moteBurst(x, y, n, tint, spread = 90) {
  for (let i = 0; i < n; i++) {
    const a = rand(0, 6.283), v = rand(10, spread);
    addBit({
      kind: 'mote', x, y, vx: Math.cos(a) * v, vy: Math.sin(a) * v - 12,
      size: rand(1.4, 4.2), age: 0, life: rand(1.2, 2.6), tint
    });
  }
}

/* ---------- 演出 ---------- */
function play(o) {
  if (!canvas || !ctx) return;
  ensureLoop();
  veilTarget = Math.max(veilTarget, .9);
  acts.push({
    kind: o.fx, tint: o.tint, t0: loopNow,
    life: o.fx === 'mist' ? 9.5 : o.fx === 'bell' ? 7.5 : 7,
    s: Math.random()
  });
  showToast(o);
  // 各兆象的随行元素（鹤、鹊、蝠成群的样子已经画在各自的绘制器里）
  if (o.fx === 'blossom') petalRain(o.tint, 46, 5.4);
  if (o.fx === 'dew') for (let i = 0; i < 34; i++) addBit({
    kind: 'drop', x: rand(W * .1, W * .9), y: rand(-H * .3, -10),
    vx: rand(-6, 6), vy: rand(90, 170), size: rand(2.2, 4.6), age: -rand(0, 1.6),
    life: rand(3.6, 5.6), tint: o.tint
  });
  if (o.fx === 'halo') moteBurst(W * .5, H * .42, 46, o.tint, 150);
  if (o.fx === 'cloud') for (let i = 0; i < 16; i++) addBit({
    kind: 'mote', x: rand(0, W), y: rand(H * .06, H * .45), vx: rand(-14, 20),
    vy: rand(4, 16), size: rand(2, 5), age: 0, life: rand(3, 6), tint: o.tint
  });
}

/* ---------- 绘制各兆象 ---------- */
// 一遍柔光托底、一遍实形压上，边缘过渡开，才不像贴上去的色块
function inkGrad(tint, alpha, a, b, edge = .40) {
  const g = ctx.createLinearGradient(a[0], a[1], b[0], b[1]);
  g.addColorStop(0, `rgba(255,253,244,${alpha})`);
  g.addColorStop(.44, `rgba(${tint},${alpha * .92})`);
  g.addColorStop(1, `rgba(${tint},${alpha * edge})`);
  return g;
}
function glow(tint, alpha, blur) {
  ctx.shadowColor = `rgba(${tint},${.38 * alpha})`;
  ctx.shadowBlur = blur;
}
// 翼羽的分缝：沿翼面扫几道极淡的线，翅膀才不是一整块
function quills(tint, alpha, ax, ay, bx, by, n = 5, bend = .16) {
  ctx.strokeStyle = `rgba(${tint},${alpha})`;
  ctx.lineWidth = .017;
  ctx.lineCap = 'round';
  for (let i = 0; i < n; i++) {
    const u = (i + .5) / n;
    const x0 = ax + (bx - ax) * u * .28, y0 = ay + (by - ay) * u * .28;
    const x1 = ax + (bx - ax) * (.42 + u * .58), y1 = ay + (by - ay) * (.42 + u * .58);
    ctx.beginPath();
    ctx.moveTo(x0, y0);
    ctx.quadraticCurveTo((x0 + x1) * .5, (y0 + y1) * .5 - bend * Math.abs(bx - ax) * .12, x1, y1);
    ctx.stroke();
  }
}
const fadeK = (k, inK = 4, outK = 4) => Math.min(1, k * inK) * Math.min(1, (1 - k) * outK);

/* 瑞鹤：三只成「人」字，丹顶、细腿后拖 */
function craneOne(cx, cy, s, dir, t, alpha) {
  const flap = Math.sin(t * 5.2);
  const up = -.30 - flap * .30;
  ctx.save();
  ctx.translate(cx, cy);
  ctx.scale(dir * s, s);
  glow([255, 240, 214], alpha, 15);

  // 远翼：向后掠，翼尖随拍翅起伏
  ctx.beginPath();
  ctx.moveTo(-.02, -.05);
  ctx.quadraticCurveTo(-.46, up, -1.04, up + .10);
  ctx.quadraticCurveTo(-.58, -.01, -.06, .03);
  ctx.closePath();
  ctx.fillStyle = inkGrad([252, 243, 226], alpha * .90, [0, -.2], [-1.02, .06], .3);
  ctx.fill();

  // 近翼：压在下方，相位错开半拍
  const dn = .18 + flap * .26;
  ctx.beginPath();
  ctx.moveTo(.04, .02);
  ctx.quadraticCurveTo(-.34, dn, -.94, dn + .28);
  ctx.quadraticCurveTo(-.44, .14, -.02, .09);
  ctx.closePath();
  ctx.fillStyle = inkGrad([255, 247, 232], alpha * .96, [0, 0], [-.92, dn + .26], .36);
  ctx.fill();

  // 躯干
  ctx.beginPath();
  ctx.ellipse(-.02, 0, .40, .135, -.04, 0, 6.2832);
  ctx.fillStyle = inkGrad([255, 250, 238], alpha, [0, -.14], [0, .13], .62);
  ctx.fill();

  // 尾羽
  ctx.beginPath();
  ctx.moveTo(-.32, -.03); ctx.lineTo(-.66, -.10); ctx.lineTo(-.63, .07); ctx.closePath();
  ctx.fillStyle = `rgba(236, 226, 208,${alpha * .78})`;
  ctx.fill();

  // 长颈：S 形，越往头越细
  ctx.beginPath();
  ctx.moveTo(.26, -.07);
  ctx.quadraticCurveTo(.62, -.10, .80, -.17);
  ctx.quadraticCurveTo(.94, -.21, 1.02, -.22);
  ctx.quadraticCurveTo(.92, -.13, .76, -.09);
  ctx.quadraticCurveTo(.56, -.04, .26, .03);
  ctx.closePath();
  ctx.fillStyle = inkGrad([255, 252, 242], alpha, [.3, -.1], [1.02, -.2], .55);
  ctx.fill();

  // 头、丹顶、喙
  ctx.beginPath(); ctx.arc(1.03, -.225, .058, 0, 6.2832);
  ctx.fillStyle = `rgba(255, 253, 246,${alpha})`; ctx.fill();
  ctx.beginPath(); ctx.arc(.995, -.272, .034, 0, 6.2832);
  ctx.fillStyle = `rgba(196, 74, 58,${alpha * .88})`; ctx.fill();   // 丹顶
  ctx.beginPath();
  ctx.moveTo(1.07, -.245); ctx.lineTo(1.40, -.30); ctx.lineTo(1.07, -.198); ctx.closePath();
  ctx.fillStyle = `rgba(226, 198, 150,${alpha * .9})`; ctx.fill();

  // 双翼的翎
  quills([236, 222, 196], alpha * .22, -.06, -.02, -1.0, up + .08, 5, .10);

  // 后拖的长腿
  ctx.strokeStyle = `rgba(228, 204, 168,${alpha * .78})`;
  ctx.lineWidth = .026; ctx.lineCap = 'round';
  for (const o of [0, .045]) {
    ctx.beginPath();
    ctx.moveTo(-.28, .05);
    ctx.quadraticCurveTo(-.66, .08 + o, -1.05, .17 + o);
    ctx.stroke();
  }
  ctx.restore();
}
function drawCrane(a, k, age) {
  const dir = a.s > .45 ? 1 : -1;
  const t = Math.min(1, k * 1.32);
  const x = dir > 0 ? W * (-.22 + t * 1.46) : W * (1.22 - t * 1.46);
  const y = H * (.32 + a.s * .07) - Math.sin(t * 2.0 + a.s * 5) * H * .03;
  const s = Math.max(62, Math.min(W, H) * .145);
  const alpha = fadeK(k, 3.4, 4.0);
  if (alpha < .01) return;
  // 云气先在下面托一层，鹤才像从云里出来
  for (let i = 0; i < 3; i++) {
    ctx.save();
    ctx.translate(x - s * (.2 + i * .7), y + s * (.25 + i * .1));
    ctx.scale(3.2, .9);
    soft(0, 0, s * (.55 - i * .1), [255, 232, 196], .10 * alpha);
    ctx.restore();
  }
  // 后面两只应落在头雁的「后方」，方向随飞行朝向翻转，否则会叠在一起
  const flock = [
    { back: 0, dy: 0, sc: 1, ph: 0 },
    { back: 2.00, dy: .92, sc: .74, ph: 1.15 },
    { back: 2.70, dy: -.60, sc: .68, ph: 2.30 }
  ];
  for (const f of flock) {
    craneOne(x - dir * f.back * s, y + f.dy * s, s * f.sc, dir, age * 1.1 + f.ph, alpha * (f.sc === 1 ? 1 : .84));
  }
}

/* 喜鹊登枝：梅枝横斜，两只落在枝上对望，长尾垂下 */
function magpieOne(cx, cy, s, dir, alpha, t) {
  const bob = Math.sin(t * 1.6) * .02;
  ctx.save();
  ctx.translate(cx, cy + bob * s);
  ctx.scale(dir * s, s);
  // 长尾：两枚长羽斜垂
  ctx.beginPath();
  ctx.moveTo(-.06, .02);
  ctx.quadraticCurveTo(-.34, .34, -.52, .74);
  ctx.quadraticCurveTo(-.30, .40, .02, .10);
  ctx.closePath();
  ctx.fillStyle = `rgba(42, 51, 62,${alpha * .88})`; ctx.fill();
  ctx.beginPath();
  ctx.moveTo(-.10, .04);
  ctx.quadraticCurveTo(-.40, .30, -.62, .62);
  ctx.quadraticCurveTo(-.34, .32, -.02, .09);
  ctx.closePath();
  ctx.fillStyle = `rgba(56, 66, 80,${alpha * .72})`; ctx.fill();

  // 躯干
  ctx.beginPath();
  ctx.ellipse(0, 0, .30, .19, -.16, 0, 6.2832);
  ctx.fillStyle = inkGrad([46, 55, 68], alpha * .95, [0, -.2], [0, .18], .55);
  ctx.fill();
  // 白腹
  ctx.beginPath();
  ctx.ellipse(.02, .09, .19, .10, -.10, 0, 6.2832);
  ctx.fillStyle = `rgba(250, 248, 240,${alpha * .82})`; ctx.fill();
  // 白肩斑
  ctx.beginPath();
  ctx.ellipse(-.10, -.02, .10, .05, -.4, 0, 6.2832);
  ctx.fillStyle = `rgba(250, 248, 240,${alpha * .70})`; ctx.fill();

  // 头颈
  ctx.beginPath();
  ctx.ellipse(.28, -.22, .13, .12, -.3, 0, 6.2832);
  ctx.fillStyle = `rgba(38, 46, 58,${alpha * .95})`; ctx.fill();
  // 喙
  ctx.beginPath();
  ctx.moveTo(.38, -.26); ctx.lineTo(.52, -.30); ctx.lineTo(.38, -.20); ctx.closePath();
  ctx.fillStyle = `rgba(64, 60, 52,${alpha})`; ctx.fill();
  // 翅
  ctx.beginPath();
  ctx.moveTo(-.14, -.08);
  ctx.quadraticCurveTo(-.02, -.24, .16, -.16);
  ctx.quadraticCurveTo(.02, -.02, -.14, -.02);
  ctx.closePath();
  ctx.fillStyle = `rgba(30, 38, 50,${alpha * .9})`; ctx.fill();
  // 腿：抓在枝上
  ctx.strokeStyle = `rgba(70, 66, 56,${alpha * .9})`; ctx.lineWidth = .022;
  for (const lx of [-.04, .05]) {
    ctx.beginPath(); ctx.moveTo(lx, .14); ctx.lineTo(lx + .01, .26); ctx.stroke();
  }
  ctx.restore();
}
function drawMagpie(a, k, age) {
  const alpha = fadeK(k, 4.2, 3.2);
  if (alpha < .01) return;
  const s = Math.max(46, Math.min(W, H) * .105);
  const dir = a.s > .5 ? 1 : -1;
  const grow = Math.min(1, k * 2.2);           // 枝条先长出来
  // 老枝：自一侧横斜而上，用叠段做出收分
  const bx0 = W * (dir > 0 ? -.02 : 1.02), bx1 = W * (dir > 0 ? .98 : .02);
  const by0 = H * .70, by1 = H * .46;
  const cxp = (bx0 + bx1) / 2, cyp = H * .40;
  const bez = u => [
    (1 - u) * (1 - u) * bx0 + 2 * (1 - u) * u * cxp + u * u * bx1,
    (1 - u) * (1 - u) * by0 + 2 * (1 - u) * u * cyp + u * u * by1
  ];
  ctx.save();
  ctx.lineCap = 'round';
  ctx.strokeStyle = `rgba(52, 42, 36,${alpha * .88})`;
  const segs = 30;
  for (let i = 0; i < segs; i++) {
    const u0 = i / segs * grow, u1 = (i + 1) / segs * grow;
    const [x0, y0] = bez(u0), [x1, y1] = bez(u1);
    ctx.lineWidth = Math.max(1.5, s * (.26 - u0 * .17));
    ctx.beginPath(); ctx.moveTo(x0, y0); ctx.lineTo(x1, y1); ctx.stroke();
  }
  // 小杈：三处，各带一根副梢与两枚花苞
  for (const u of [.30, .46, .63]) {
    if (u > grow) continue;
    const [x, y] = bez(u);
    ctx.strokeStyle = `rgba(58, 46, 38,${alpha * .82})`;
    ctx.lineWidth = Math.max(1.2, s * .05);
    ctx.beginPath();
    ctx.moveTo(x, y);
    ctx.quadraticCurveTo(x + dir * s * .34, y - s * .30, x + dir * s * .72, y - s * .46);
    ctx.stroke();
    // 副梢
    ctx.lineWidth = Math.max(.9, s * .026);
    ctx.beginPath();
    ctx.moveTo(x + dir * s * .34, y - s * .22);
    ctx.quadraticCurveTo(x + dir * s * .46, y - s * .38, x + dir * s * .40, y - s * .52);
    ctx.stroke();
    // 花苞：落在枝梢上
    for (const [bx, by] of [[.70, .46], [.40, .54]]) {
      const px = x + dir * s * bx, py = y - s * by;
      ctx.beginPath(); ctx.arc(px, py, s * .038, 0, 6.2832);
      ctx.fillStyle = `rgba(255, 238, 238,${alpha * .62})`; ctx.fill();
      ctx.beginPath(); ctx.arc(px - s * .012, py - s * .012, s * .014, 0, 6.2832);
      ctx.fillStyle = `rgba(244, 206, 206,${alpha * .5})`; ctx.fill();
    }
  }
  ctx.restore();
  // 两只落在枝上，一只向左一只向右，对望
  const p1 = bez(.40), p2 = bez(.58);
  magpieOne(p1[0], p1[1] - s * .12, s * .95, -dir, alpha * .96, age + a.s * 3);
  magpieOne(p2[0], p2[1] - s * .10, s * .80, dir, alpha * .88, age + 1.7);
}

/* 五蝠：绕一圈缓缓盘旋，取「五福」之意 */
function batOne(cx, cy, s, flap, alpha, rot) {
  ctx.save();
  ctx.translate(cx, cy);
  ctx.rotate(rot);
  ctx.scale(s, s);
  // 躯干
  ctx.beginPath(); ctx.ellipse(0, 0, .16, .13, 0, 0, 6.2832);
  ctx.fillStyle = `rgba(58, 44, 40,${alpha * .92})`; ctx.fill();
  for (const dir of [-1, 1]) {
    const tipY = -.26 - flap * .30;
    ctx.beginPath();
    ctx.moveTo(dir * .10, -.05);
    ctx.quadraticCurveTo(dir * .52, tipY - .10, dir * .86, tipY * .8 + .04);
    ctx.quadraticCurveTo(dir * .70, .10, dir * .52, .16);
    ctx.quadraticCurveTo(dir * .52, .03, dir * .30, .10);
    ctx.quadraticCurveTo(dir * .26, .0, dir * .10, .05);
    ctx.closePath();
    ctx.fillStyle = inkGrad([64, 48, 42], alpha * .88, [0, -.1], [dir * .86, tipY * .6], .34);
    ctx.fill();
  }
  // 耳
  ctx.beginPath(); ctx.moveTo(-.07, -.11); ctx.lineTo(-.03, -.20); ctx.lineTo(.01, -.11); ctx.closePath();
  ctx.fillStyle = `rgba(58, 44, 40,${alpha * .9})`; ctx.fill();
  ctx.restore();
}
function drawBat(a, k, age) {
  const alpha = fadeK(k, 3, 3.6);
  if (alpha < .01) return;
  const cx = W * .5, cy = H * .40;
  const r = Math.min(W, H) * .235;
  const unit = Math.max(30, Math.min(W, H) * .075);
  // 一圈金晕，五蝠才有个「朝」的方向
  soft(cx, cy, r * 1.9, [255, 224, 168], .085 * alpha);
  soft(cx, cy, r * .55, [255, 236, 196], .09 * alpha);
  for (let i = 0; i < 5; i++) {
    const ang = i / 5 * 6.2832 + age * .28 + a.s * 2;
    const rr = r * (.62 + .38 * Math.sin(age * .8 + i * 1.9));
    const x = cx + Math.cos(ang) * rr;
    const y = cy + Math.sin(ang) * rr * .74 - Math.sin(age * 1.4 + i) * H * .02;
    const ss = unit * (.72 + .26 * Math.sin(age * .9 + i * 2.1));
    // 略微倾斜，像各自在拐弯；不倾到侧看成一条线
    const tilt = Math.max(-.24, Math.min(.24, Math.sin(ang) * .20 + Math.sin(age * 1.1 + i) * .06));
    batOne(x, y, ss, Math.sin(age * 6.4 + i * 1.7),
      alpha * (.72 + .28 * Math.sin(i * 2.2 + 1)), tilt);
  }
}

/* 白鹿衔芝 */
function drawDeer(a, k, age) {
  const t = Math.min(1, k * 1.15);
  const dir = a.s > .45 ? -1 : 1;
  const x = dir > 0 ? W * (-.14 + t * 1.32) : W * (1.14 - t * 1.32);
  const baseY = H * .80;
  const s = Math.max(64, Math.min(W, H) * .21);
  const alpha = fadeK(k, 4, 4);
  if (alpha < .01) return;
  soft(x, baseY - s * .55, s * .95, a.tint, .13 * alpha);
  ctx.save();
  ctx.translate(x, baseY);
  ctx.scale(dir * s, s);
  glow(a.tint, alpha * .72, 15);

  // 四腿：上段粗、下段细，膝与蹄各一顿
  for (const [hx, ph, front] of [[.24, 0, 1], [.14, Math.PI, 1], [-.24, Math.PI, 0], [-.34, 0, 0]]) {
    const sw = Math.sin(age * 3.2 + ph) * .055;
    const kneeX = hx + sw * .5, kneeY = -.28;
    const footX = hx + sw * 1.3, footY = -.01;
    ctx.lineCap = 'round';
    ctx.strokeStyle = `rgba(${a.tint},${alpha * (front ? .80 : .60)})`;
    ctx.lineWidth = .054;
    ctx.beginPath(); ctx.moveTo(hx, -.50); ctx.quadraticCurveTo(kneeX, kneeY + .07, kneeX + sw * .4, kneeY); ctx.stroke();
    ctx.lineWidth = .036;
    ctx.beginPath(); ctx.moveTo(kneeX + sw * .4, kneeY); ctx.quadraticCurveTo(footX, -.15, footX, footY); ctx.stroke();
    ctx.beginPath();
    ctx.ellipse(footX + .014, footY + .004, .028, .016, 0, 0, 6.2832);
    ctx.fillStyle = `rgba(228, 212, 184,${alpha * .72})`; ctx.fill();
  }

  // 躯干：一整条轮廓，前胸略丰、后臀略圆，腰身收进去
  ctx.beginPath();
  ctx.moveTo(.40, -.52);
  ctx.quadraticCurveTo(.40, -.74, .14, -.755);
  ctx.quadraticCurveTo(-.06, -.77, -.26, -.72);
  ctx.quadraticCurveTo(-.50, -.66, -.52, -.52);
  ctx.quadraticCurveTo(-.54, -.40, -.30, -.375);
  ctx.quadraticCurveTo(-.02, -.35, .16, -.395);
  ctx.quadraticCurveTo(.40, -.42, .40, -.52);
  ctx.closePath();
  ctx.fillStyle = inkGrad(a.tint, alpha, [.10, -.76], [-.20, -.36], .44);
  ctx.fill();
  // 腹下一点暗，压出体积
  ctx.beginPath();
  ctx.ellipse(-.02, -.415, .32, .045, 0, 0, 6.2832);
  ctx.fillStyle = `rgba(222, 206, 178,${alpha * .14})`; ctx.fill();

  // 颈：根部宽，向头收，略前探
  ctx.beginPath();
  ctx.moveTo(.22, -.70);
  ctx.quadraticCurveTo(.42, -.90, .56, -.995);
  ctx.lineTo(.70, -.95);
  ctx.quadraticCurveTo(.56, -.80, .40, -.55);
  ctx.closePath();
  ctx.fillStyle = inkGrad(a.tint, alpha, [.30, -.76], [.68, -.96], .50);
  ctx.fill();

  // 头与口鼻
  ctx.save();
  ctx.translate(.67, -1.00);
  ctx.rotate(-.28);
  ctx.beginPath(); ctx.ellipse(0, 0, .122, .076, 0, 0, 6.2832);
  ctx.fillStyle = inkGrad(a.tint, alpha, [-.05, -.06], [.11, .05], .60); ctx.fill();
  ctx.beginPath(); ctx.ellipse(.100, .022, .058, .040, .12, 0, 6.2832);
  ctx.fillStyle = `rgba(${a.tint},${alpha * .90})`; ctx.fill();
  ctx.beginPath(); ctx.arc(.144, .030, .010, 0, 6.2832);
  ctx.fillStyle = `rgba(120, 100, 84,${alpha * .50})`; ctx.fill();
  ctx.restore();
  // 耳：向后斜张
  ctx.beginPath();
  ctx.moveTo(.61, -1.055);
  ctx.quadraticCurveTo(.585, -1.155, .695, -1.13);
  ctx.quadraticCurveTo(.705, -1.075, .655, -1.045);
  ctx.closePath();
  ctx.fillStyle = `rgba(${a.tint},${alpha * .82})`; ctx.fill();

  // 角：两根主干，各生两杈，根粗梢细
  ctx.strokeStyle = `rgba(242, 230, 202,${alpha * .70})`;
  ctx.lineCap = 'round';
  for (const [bx, lean, len] of [[.62, -.22, .42], [.70, -.05, .38]]) {
    for (let i = 0; i < 5; i++) {
      const u0 = i / 5, u1 = (i + 1) / 5;
      ctx.lineWidth = .028 - u0 * .015;
      ctx.beginPath();
      ctx.moveTo(bx + lean * u0 * u0, -1.06 - len * u0);
      ctx.lineTo(bx + lean * u1 * u1, -1.06 - len * u1);
      ctx.stroke();
    }
    for (const [u, dl] of [[.42, -.13], [.66, -.10]]) {
      const px = bx + lean * u * u, py = -1.06 - len * u;
      ctx.lineWidth = .016;
      ctx.beginPath();
      ctx.moveTo(px, py);
      ctx.quadraticCurveTo(px + dl * .6, py - .09, px + dl, py - .155);
      ctx.stroke();
    }
  }

  // 尾
  ctx.beginPath();
  ctx.moveTo(-.47, -.60);
  ctx.quadraticCurveTo(-.56, -.55, -.55, -.70);
  ctx.strokeStyle = `rgba(${a.tint},${alpha * .52})`; ctx.lineWidth = .026; ctx.stroke();

  // 口衔灵芝：一朵小如意，衔在口边
  ctx.save();
  ctx.translate(.855, -1.012);
  ctx.rotate(.26);
  ctx.fillStyle = `rgba(232, 200, 148,${alpha * .92})`;
  ctx.beginPath();
  ctx.arc(-.02, 0, .032, 0, 6.2832);
  ctx.arc(.034, -.024, .026, 0, 6.2832);
  ctx.arc(.034, .028, .026, 0, 6.2832);
  ctx.fill();
  ctx.strokeStyle = `rgba(248, 228, 188,${alpha * .55})`;
  ctx.lineWidth = .009;
  ctx.beginPath(); ctx.moveTo(.06, 0); ctx.quadraticCurveTo(.11, .02, .15, .05); ctx.stroke();
  ctx.restore();
  ctx.restore();

  if (k < .9 && Math.random() < .38) addBit({
    kind: 'mote', x: x + rand(-s * .3, s * .3), y: baseY - rand(0, s * .12),
    vx: rand(-8, 8), vy: rand(-26, -8), size: rand(1.2, 2.8), age: 0, life: rand(.8, 1.8), tint: a.tint
  });
}

/* 锦鲤跃波 */
function drawFish(a, k, age) {
  const cx = W * (.5 + (a.s - .5) * .14), cy = H * .58;
  const s = Math.max(54, Math.min(W, H) * .13);
  const alpha = fadeK(k, 5, 3.4);
  if (alpha < .01) return;
  // 水面：一团横向铺开、边缘化开的微光
  ctx.save();
  ctx.translate(cx, cy + 4);
  ctx.scale(1, .13);
  const wg = ctx.createRadialGradient(0, 0, 0, 0, 0, W * .34);
  wg.addColorStop(0, `rgba(${a.tint},${.24 * alpha})`);
  wg.addColorStop(.5, `rgba(${a.tint},${.09 * alpha})`);
  wg.addColorStop(1, `rgba(${a.tint},0)`);
  ctx.fillStyle = wg;
  ctx.beginPath(); ctx.arc(0, 0, W * .34, 0, 6.2832); ctx.fill();
  ctx.restore();
  // 涟漪：三圈，越荡越扁
  for (let i = 0; i < 3; i++) {
    const p = ((age * .40 + i * .33) % 1);
    ctx.beginPath();
    ctx.ellipse(cx, cy + 2, s * (.7 + p * 3.6), s * (.10 + p * .62), 0, 0, 6.2832);
    ctx.strokeStyle = `rgba(${a.tint},${alpha * .20 * (1 - p)})`;
    ctx.lineWidth = 1.2; ctx.stroke();
  }

  const ph = k * 1.4 + a.s * 3;
  for (let i = 0; i < 2; i++) {
    const p = (ph + i * .78) % 1.5;
    if (p > 1.02) continue;
    const tt = p / 1.02;
    const x = cx + (tt - .5) * s * 4.4;
    const y = cy - Math.sin(tt * Math.PI) * s * 1.5;
    const ang = Math.atan2(-Math.cos(tt * Math.PI) * s * 1.5, s * 4.4);
    const sc = s * (.52 + .10 * Math.sin(tt * Math.PI));
    ctx.save();
    ctx.translate(x, y); ctx.rotate(ang); ctx.scale(sc, sc);
    glow([255, 190, 130], alpha * .6, 14);

    // 尾鳍：三叶展开，根细梢阔
    ctx.beginPath();
    ctx.moveTo(-.62, 0);
    ctx.quadraticCurveTo(-.94, -.48, -1.28, -.34);
    ctx.quadraticCurveTo(-1.04, -.13, -1.22, .02);
    ctx.quadraticCurveTo(-1.02, .17, -1.26, .38);
    ctx.quadraticCurveTo(-.94, .46, -.62, .04);
    ctx.closePath();
    ctx.fillStyle = `rgba(248, 196, 156,${alpha * .74})`; ctx.fill();

    // 身体：纺锤形，尾柄收细
    ctx.beginPath();
    ctx.moveTo(.86, 0);
    ctx.quadraticCurveTo(.44, -.34, -.10, -.30);
    ctx.quadraticCurveTo(-.52, -.26, -.64, -.05);
    ctx.quadraticCurveTo(-.52, .24, -.10, .28);
    ctx.quadraticCurveTo(.44, .32, .86, 0);
    ctx.closePath();
    ctx.fillStyle = inkGrad([255, 178, 106], alpha * .96, [.5, -.24], [-.5, .14], .58);
    ctx.fill();
    // 白斑：锦鲤的花
    ctx.beginPath();
    ctx.ellipse(.22, -.13, .26, .11, -.16, 0, 6.2832);
    ctx.fillStyle = `rgba(255, 250, 240,${alpha * .68})`; ctx.fill();
    ctx.beginPath();
    ctx.ellipse(-.22, .10, .16, .08, .18, 0, 6.2832);
    ctx.fillStyle = `rgba(255, 248, 238,${alpha * .54})`; ctx.fill();
    // 鳞：几道浅弧
    ctx.strokeStyle = `rgba(255, 238, 214,${alpha * .20})`;
    ctx.lineWidth = .012;
    for (let q = 0; q < 5; q++) {
      ctx.beginPath();
      ctx.arc(.46 - q * .20, 0, .18, -1.1, 1.1);
      ctx.stroke();
    }
    // 背鳍、腹鳍
    ctx.beginPath();
    ctx.moveTo(-.24, -.27); ctx.quadraticCurveTo(.02, -.64, .32, -.24);
    ctx.quadraticCurveTo(.02, -.31, -.24, -.27);
    ctx.fillStyle = `rgba(250, 200, 156,${alpha * .66})`; ctx.fill();
    ctx.beginPath();
    ctx.moveTo(-.02, .25); ctx.quadraticCurveTo(.06, .50, .24, .29);
    ctx.quadraticCurveTo(.12, .26, -.02, .25);
    ctx.fillStyle = `rgba(250, 206, 168,${alpha * .56})`; ctx.fill();
    // 眼
    ctx.beginPath(); ctx.arc(.66, -.085, .030, 0, 6.2832);
    ctx.fillStyle = `rgba(72, 42, 32,${alpha})`; ctx.fill();
    ctx.restore();

    if (p > .96 && p < 1.03) {
      for (let j = 0; j < 6; j++) addBit({
        kind: 'mote', x: x + rand(-8, 8), y: cy - rand(0, 10),
        vx: rand(-34, 34), vy: rand(-70, -22), size: rand(1.2, 2.6), age: 0, life: rand(.7, 1.4), tint: a.tint
      });
    }
  }
}

/* 祥云：一朵如意云头是几团相叠的云，边缘虚、内里一道卷云线 */
function cloudHead(x, y, r, tint, alpha, seed) {
  const v = Math.sin(seed * 12.9) * .5 + .5;
  const lobes = [
    [0, 0, 1],
    [r * .86, -r * (.20 + v * .10), .76],
    [r * 1.66, r * .04, .54],
    [r * .42, r * .26, .58]
  ];
  ctx.save();
  ctx.translate(x, y);
  ctx.rotate((v - .5) * .12);
  for (const [lx, ly, lr] of lobes) {
    const rr = r * lr;
    const g = ctx.createRadialGradient(lx, ly - rr * .28, rr * .10, lx, ly, rr);
    g.addColorStop(0, `rgba(255, 251, 238,${.30 * alpha})`);
    g.addColorStop(.55, `rgba(${tint},${.20 * alpha})`);
    g.addColorStop(1, `rgba(${tint},0)`);
    ctx.fillStyle = g;
    ctx.beginPath(); ctx.arc(lx, ly, rr, 0, 6.2832); ctx.fill();
  }
  // 云尾：三团渐小、渐淡的云，顺着云头拖出去
  for (let i = 0; i < 3; i++) {
    const k2 = (i + 1) / 3;
    const tx = r * (1.75 + k2 * 2.2), ty = r * (.06 + k2 * .34);
    const tr = r * (.52 - k2 * .20);
    const g = ctx.createRadialGradient(tx, ty - tr * .3, tr * .1, tx, ty, tr);
    g.addColorStop(0, `rgba(${tint},${(.12 - k2 * .028) * alpha})`);
    g.addColorStop(1, `rgba(${tint},0)`);
    ctx.fillStyle = g;
    ctx.beginPath(); ctx.arc(tx, ty, tr, 0, 6.2832); ctx.fill();
  }
  // 一道卷云线：单螺旋，压在云头上
  ctx.strokeStyle = `rgba(255, 246, 222,${.20 * alpha})`;
  ctx.lineWidth = Math.max(1, r * .055);
  ctx.beginPath();
  for (let i = 0; i <= 26; i++) {
    const u = i / 26;
    const ang = -Math.PI * .35 + u * Math.PI * 1.85;
    const rad = r * (.60 - u * .46);
    const px = r * .34 + Math.cos(ang) * rad, py = -r * .06 + Math.sin(ang) * rad * .78;
    i ? ctx.lineTo(px, py) : ctx.moveTo(px, py);
  }
  ctx.stroke();
  ctx.restore();
}
function drawCloud(a, k, age) {
  const alpha = fadeK(k, 3, 2.2);
  if (alpha < .01) return;
  const rows = [
    { y: .13, sp: 13, r: .088, o: 1, n: 2 },
    { y: .28, sp: -8, r: .060, o: .72, n: 3 },
    { y: .41, sp: 5, r: .042, o: .40, n: 2 }
  ];
  for (const row of rows) {
    const r0 = Math.min(W, H) * row.r;
    const span = W + r0 * 10;
    const drift = (age * row.sp + span) % span;
    for (let i = 0; i < row.n; i++) {
      const seed = i * 4.3 + row.y * 17;
      const jitter = Math.sin(seed * 7.7) * W * .07;
      const x = ((i * (W / row.n) + jitter + drift + span) % span) - r0 * 3.6;
      const sc = .78 + .44 * (Math.sin(seed * 3.1) * .5 + .5);
      const y = H * (row.y + Math.sin(seed * 5.3) * .035) + Math.sin(age * .4 + seed) * H * .014;
      cloudHead(x, y, r0 * sc * (1 + .1 * Math.sin(age * .55 + seed)), a.tint, alpha * row.o, seed);
    }
  }
  if (k < .9 && Math.random() < .5) addBit({
    kind: 'mote', x: rand(0, W), y: rand(H * .05, H * .42),
    vx: rand(-10, 10), vy: rand(6, 20), size: rand(1.4, 3.4), age: 0, life: rand(1.4, 3), tint: a.tint
  });
}

function drawMist(a, k, age) {
  const alpha = fadeK(k, 2.4, 1.8);
  if (alpha < .01) return;
  // 自东（画面右侧）涌来的紫气，一层压一层
  for (let i = 0; i < 9; i++) {
    const p = ((age * .095 + i * .135) % 1);
    const x = W * (1.06 - p * 1.3);
    const y = H * (.20 + (i % 5) * .115) + Math.sin(age * .55 + i) * H * .018;
    ctx.save(); ctx.translate(x, y); ctx.scale(2.6, .8);
    soft(0, 0, H * (.11 + (i % 3) * .045), a.tint, .15 * alpha);
    soft(0, 0, H * (.05 + (i % 2) * .03), [226, 208, 246], .12 * alpha);
    ctx.restore();
  }
  // 气里几缕更亮的丝
  ctx.save();
  ctx.strokeStyle = `rgba(226, 206, 250,${.18 * alpha})`;
  ctx.lineWidth = 1.4;
  for (let i = 0; i < 4; i++) {
    const y = H * (.26 + i * .10);
    ctx.beginPath();
    ctx.moveTo(W * .96, y);
    ctx.bezierCurveTo(W * .72, y - 16, W * .48, y + 14, W * .20, y - 4);
    ctx.stroke();
  }
  ctx.restore();
}

function drawHalo(a, k, age) {
  const cx = W * .5, cy = H * .38;
  const alpha = fadeK(k, 4, 2.6);
  if (alpha < .01) return;
  const R = Math.min(W, H) * .52;
  const cols = [[255, 226, 168], [255, 198, 152], [226, 232, 198], [198, 216, 234], [236, 206, 224]];
  ctx.save();
  ctx.globalCompositeOperation = 'lighter';
  // 五色晕：一层压一层，边缘完全化开
  cols.forEach((c, i) => {
    const rr = R * (.22 + i * .17);
    const g = ctx.createRadialGradient(cx, cy, rr * .50, cx, cy, rr);
    g.addColorStop(0, `rgba(${c},0)`);
    g.addColorStop(.55, `rgba(${c},${.050 * alpha})`);
    g.addColorStop(1, `rgba(${c},0)`);
    ctx.fillStyle = g;
    ctx.beginPath(); ctx.arc(cx, cy, rr, 0, 6.2832); ctx.fill();
  });
  // 光芒：宽而淡的锥形光束层层相叠，边缘化开才像光，不像示意图
  const n = 15;
  for (let i = 0; i < n; i++) {
    const ang = i / n * 6.2832 + age * .03;
    const len = R * (.58 + .30 * (Math.sin(i * 1.9) * .5 + .5));
    const wid = .070 + .045 * (Math.sin(i * 2.7) * .5 + .5);
    const g = ctx.createLinearGradient(
      cx + Math.cos(ang) * R * .12, cy + Math.sin(ang) * R * .12,
      cx + Math.cos(ang) * len, cy + Math.sin(ang) * len);
    g.addColorStop(0, `rgba(255, 246, 216,${.085 * alpha})`);
    g.addColorStop(.55, `rgba(255, 238, 196,${.040 * alpha})`);
    g.addColorStop(1, 'rgba(255, 236, 190,0)');
    ctx.fillStyle = g;
    ctx.beginPath();
    ctx.moveTo(cx + Math.cos(ang) * R * .10, cy + Math.sin(ang) * R * .10);
    ctx.quadraticCurveTo(
      cx + Math.cos(ang - wid * .5) * len * .8, cy + Math.sin(ang - wid * .5) * len * .8,
      cx + Math.cos(ang - wid) * len, cy + Math.sin(ang - wid) * len);
    ctx.lineTo(cx + Math.cos(ang + wid) * len, cy + Math.sin(ang + wid) * len);
    ctx.quadraticCurveTo(
      cx + Math.cos(ang + wid * .5) * len * .8, cy + Math.sin(ang + wid * .5) * len * .8,
      cx + Math.cos(ang) * R * .10, cy + Math.sin(ang) * R * .10);
    ctx.closePath(); ctx.fill();
  }
  ctx.restore();
  // 只留一圈极淡的内晕，不做同心环——那会变成靶子
  ctx.save();
  ctx.globalCompositeOperation = 'lighter';
  const rp = (k * .7) % 1;
  ctx.beginPath(); ctx.arc(cx, cy, R * (.20 + rp * .5), 0, 6.2832);
  ctx.strokeStyle = `rgba(${cols[0]},${alpha * (1 - rp) * .07})`;
  ctx.lineWidth = 18 + (1 - rp) * 22;
  ctx.stroke();
  ctx.restore();
  soft(cx, cy, R * .46, a.tint, .13 * alpha);
  soft(cx, cy, R * .14, [255, 253, 240], .22 * alpha);
}

function drawDew(a, k, age) {
  const alpha = fadeK(k, 3, 2.2);
  if (alpha < .01) return;
  for (let i = 0; i < 9; i++) {
    const x = W * (.08 + i * .105);
    const y = H * (.34 + ((i * 37) % 23) * .008) + Math.sin(age * .8 + i) * 2;
    const r = 1.6 + (Math.sin(age * 1.6 + i * 1.7) * .5 + .5) * 3.2;
    soft(x, y, r * 5, a.tint, .16 * alpha);
    // 水珠：一滴带高光的椭圆
    ctx.beginPath();
    ctx.ellipse(x, y + r * .2, r * .86, r * 1.08, 0, 0, 6.2832);
    ctx.fillStyle = `rgba(${a.tint},${.80 * alpha})`; ctx.fill();
    ctx.beginPath(); ctx.arc(x - r * .3, y - r * .3, r * .3, 0, 6.2832);
    ctx.fillStyle = `rgba(255,255,255,${.72 * alpha})`; ctx.fill();
  }
}

function drawBlossom(a, k, age) {
  const alpha = fadeK(k, 3, 2);
  if (alpha < .01) return;
  for (let i = 0; i < 4; i++) {
    const x = W * (.16 + i * .23), y = H * .18 + Math.sin(age * .5 + i) * 8;
    ctx.save(); ctx.translate(x, y); ctx.scale(2.2, .8);
    soft(0, 0, H * .09, a.tint, .12 * alpha);
    ctx.restore();
  }
}

function drawLotus(a, k, age) {
  const cx = W * .5, cy = H * .70;
  const s = Math.max(60, Math.min(W, H) * .15);
  const open = Math.min(1, k * 1.7);
  const alpha = fadeK(k, 4, 2.4);
  if (alpha < .01) return;
  soft(cx, cy, s * 3.0, a.tint, .14 * alpha);

  // 水面与涟漪
  const wg = ctx.createLinearGradient(0, cy - 6, 0, cy + 34);
  wg.addColorStop(0, `rgba(${a.tint},${.20 * alpha})`);
  wg.addColorStop(1, 'rgba(0,0,0,0)');
  ctx.fillStyle = wg;
  ctx.beginPath(); ctx.ellipse(cx, cy + 12, s * 2.6, 26, 0, 0, 6.2832); ctx.fill();
  for (let i = 0; i < 3; i++) {
    const p = ((age * .34 + i * .34) % 1);
    ctx.beginPath(); ctx.ellipse(cx, cy + 12, s * (.9 + p * 2.2), s * (.14 + p * .3), 0, 0, 6.2832);
    ctx.strokeStyle = `rgba(${a.tint},${alpha * .18 * (1 - p)})`;
    ctx.lineWidth = 1.2; ctx.stroke();
  }

  // 一茎两花：并蒂
  ctx.save();
  ctx.strokeStyle = `rgba(120,150,96,${.5 * alpha})`;
  ctx.lineWidth = 2.6;
  ctx.lineCap = 'round';
  ctx.beginPath();
  ctx.moveTo(cx, cy + 14);
  ctx.quadraticCurveTo(cx - s * .1, cy - s * .2, cx - s * .52, cy - s * .28);
  ctx.moveTo(cx, cy + 14);
  ctx.quadraticCurveTo(cx + s * .1, cy - s * .2, cx + s * .52, cy - s * .28);
  ctx.stroke();
  ctx.restore();

  const bloom = (bx, by, scale, rot) => {
    ctx.save();
    ctx.translate(bx, by);
    ctx.rotate(rot);
    for (let layer = 2; layer >= 0; layer--) {
      const n = 7 - layer * 2;
      const spread = 2.0 - layer * .35;
      const rr = s * scale * (1 - layer * .22);
      for (let i = 0; i < n; i++) {
        const ang = -spread / 2 + (n === 1 ? 0 : spread * i / (n - 1));
        ctx.save();
        ctx.rotate(ang * (.55 + open * .45));
        const g = ctx.createLinearGradient(0, 0, 0, -rr);
        g.addColorStop(0, `rgba(${a.tint},${.26 * alpha})`);
        g.addColorStop(.62, `rgba(255, 236, 238,${.62 * alpha})`);
        g.addColorStop(1, `rgba(255, 250, 246,${.82 * alpha})`);
        ctx.fillStyle = g;
        ctx.beginPath();
        ctx.moveTo(0, 0);
        ctx.quadraticCurveTo(-rr * .32, -rr * .50, -rr * .06, -rr * (.80 + open * .22));
        ctx.quadraticCurveTo(rr * .06, -rr * (.80 + open * .22), rr * .32, -rr * .50);
        ctx.quadraticCurveTo(0, 0, 0, 0);
        ctx.fill();
        ctx.restore();
      }
    }
    ctx.beginPath(); ctx.arc(0, -s * scale * .12, s * scale * .12, 0, 6.2832);
    ctx.fillStyle = `rgba(255, 226, 168,${.82 * alpha})`; ctx.fill();
    ctx.restore();
  };
  bloom(cx - s * .52, cy - s * .28, .82, -.14);
  bloom(cx + s * .52, cy - s * .28, 1.0, .12);
}

const BEIDOU = [[.02, .10], [.17, .04], [.30, .12], [.44, .10], [.58, .20], [.70, .32], [.86, .30]];
function drawStar(a, k, age) {
  const cx = W * .5, cy = H * .30, span = Math.min(W * .62, H * .8);
  const alpha = fadeK(k, 3.2, 2.2);
  if (alpha < .01) return;
  const bx = cx - span * .44, by = cy - span * .05;
  const pos = BEIDOU.map(([u, v]) => [bx + u * span, by + v * span * .8]);
  // 斗柄连线，像一笔淡墨
  ctx.save();
  ctx.strokeStyle = `rgba(${a.tint},${.30 * alpha})`;
  ctx.lineWidth = 1.2;
  ctx.beginPath();
  pos.forEach(([x, y], i) => { i ? ctx.lineTo(x, y) : ctx.moveTo(x, y); });
  ctx.stroke();
  ctx.restore();
  pos.forEach(([x, y], i) => {
    const tw = .55 + .45 * Math.sin(age * 2.2 + i * 1.3);
    soft(x, y, 14 + tw * 20, a.tint, .28 * alpha * tw);
    // 星芒：细长的十字
    ctx.strokeStyle = `rgba(255, 252, 240,${.32 * alpha * tw})`;
    ctx.lineWidth = 1;
    const L = 7 + tw * 9;
    ctx.beginPath();
    ctx.moveTo(x - L, y); ctx.lineTo(x + L, y);
    ctx.moveTo(x, y - L); ctx.lineTo(x, y + L);
    ctx.stroke();
    ctx.beginPath(); ctx.arc(x, y, 1.6 + tw * 1.2, 0, 6.2832);
    ctx.fillStyle = `rgba(255, 254, 246,${.92 * alpha * tw})`; ctx.fill();
  });
  // 极淡的银河
  const mg = ctx.createLinearGradient(0, cy - span * .2, W, cy + span * .3);
  mg.addColorStop(0, 'rgba(200,216,255,0)');
  mg.addColorStop(.5, `rgba(214, 228, 255,${.07 * alpha})`);
  mg.addColorStop(1, 'rgba(200,216,255,0)');
  ctx.fillStyle = mg;
  ctx.beginPath();
  ctx.moveTo(0, cy - span * .06);
  ctx.quadraticCurveTo(W * .5, cy - span * .30, W, cy + span * .10);
  ctx.lineTo(W, cy + span * .26);
  ctx.quadraticCurveTo(W * .5, cy - span * .10, 0, cy + span * .10);
  ctx.closePath(); ctx.fill();
}

function drawBell(a, k, age) {
  const cx = W * .5, cy = H * .34;
  const alpha = fadeK(k, 4, 2);
  if (alpha < .01) return;
  const R = Math.min(W, H) * .5;
  for (let i = 0; i < 5; i++) {
    const p = ((k * 1.22 + i * .2) % 1);
    const r = R * (.08 + p * .95);
    ctx.beginPath(); ctx.arc(cx, cy, r, 0, 6.2832);
    ctx.strokeStyle = `rgba(${a.tint},${alpha * (1 - p) * .36})`;
    ctx.lineWidth = 1.4 + (1 - p) * 3.2;
    ctx.stroke();
  }
  soft(cx, cy, R * .40, a.tint, .12 * alpha);
  for (let i = 0; i < 3; i++) {
    const y = H * (.46 + i * .08);
    ctx.beginPath();
    ctx.moveTo(W * .06, y);
    ctx.bezierCurveTo(W * .36, y - 10 - i * 4, W * .64, y + 10 + i * 4, W * .94, y);
    ctx.strokeStyle = `rgba(${a.tint},${alpha * .11})`;
    ctx.lineWidth = 1.2;
    ctx.stroke();
  }
}

const DRAW = {
  crane: drawCrane, magpie: drawMagpie, bat: drawBat, deer: drawDeer, fish: drawFish,
  cloud: drawCloud, mist: drawMist, halo: drawHalo, dew: drawDew, blossom: drawBlossom,
  lotus: drawLotus, star: drawStar, bell: drawBell
};

/* ---------- 循环 ---------- */
function drawBits(dt) {
  for (let i = bits.length - 1; i >= 0; i--) {
    const b = bits[i];
    b.age += dt;
    if (b.age < 0) continue;
    if (b.age > b.life) { bits.splice(i, 1); continue; }
    const k = b.age / b.life;
    const fade = Math.min(1, b.age * 5) * (1 - k);
    if (b.kind === 'petal') {
      b.x += (b.vx + Math.sin(b.age * 2.2) * 22) * dt;
      b.y += b.vy * dt;
      b.rot += b.spin * dt;
      ctx.save(); ctx.translate(b.x, b.y); ctx.rotate(b.rot);
      ctx.fillStyle = `rgba(${b.tint},${.72 * fade})`;
      ctx.beginPath();
      ctx.ellipse(0, 0, b.size, b.size * .48, 0, 0, 6.2832);
      ctx.fill();
      ctx.restore();
    } else if (b.kind === 'drop') {
      if (b.age < 0) continue;
      b.x += b.vx * dt; b.y += b.vy * dt; b.vy += 260 * dt;
      ctx.beginPath(); ctx.ellipse(b.x, b.y, b.size * .8, b.size * 1.5, 0, 0, 6.2832);
      ctx.fillStyle = `rgba(${b.tint},${.68 * fade})`; ctx.fill();
      if (b.y > H * .8 && !b.splash) {
        b.splash = true;
        for (let j = 0; j < 4; j++) addBit({
          kind: 'mote', x: b.x, y: b.y, vx: rand(-30, 30), vy: rand(-46, -12),
          size: rand(1, 2.2), age: 0, life: rand(.4, .9), tint: b.tint
        });
      }
    } else {
      b.x += b.vx * dt; b.y += b.vy * dt; b.vy += 6 * dt;
      soft(b.x, b.y, b.size * 3.2, b.tint, .5 * fade);
      ctx.beginPath(); ctx.arc(b.x, b.y, b.size * .62, 0, 6.2832);
      ctx.fillStyle = `rgba(255,248,226,${.8 * fade})`; ctx.fill();
    }
  }
}

function draw(now, dt) {
  ctx.clearRect(0, 0, W, H);

  // 一层极淡的暖光，让瑞兆与场景连成一片
  if (veil > .003) {
    const g = ctx.createRadialGradient(W * .5, H * .38, 0, W * .5, H * .38, Math.max(W, H) * .62);
    g.addColorStop(0, `rgba(255, 226, 176,${.10 * veil})`);
    g.addColorStop(1, 'rgba(255,210,150,0)');
    ctx.fillStyle = g; ctx.fillRect(0, 0, W, H);
  }

  for (let i = acts.length - 1; i >= 0; i--) {
    const a = acts[i];
    const age = Math.max(0, (now - a.t0) / 1000);
    if (age > a.life) { acts.splice(i, 1); continue; }
    const k = age / a.life;
    const fn = DRAW[a.kind];
    if (fn) { ctx.save(); fn(a, k, age); ctx.restore(); }
  }

  ctx.globalCompositeOperation = 'lighter';
  drawBits(dt);
  ctx.globalCompositeOperation = 'source-over';
}

function tick(now) {
  const dt = Math.min(.2, Math.max(.001, (now - (lastT || now)) / 1000));
  lastT = now; loopNow = now;
  veil += (veilTarget - veil) * Math.min(1, dt * 2.2);
  draw(now, dt);
  const quiet = acts.length === 0 && bits.length === 0 && veilTarget === 0 && veil < .01;
  if (quiet) { stopLoop(); return; }
  raf = requestAnimationFrame(tick);
}
function stopLoop() {
  running = false;
  if (raf) cancelAnimationFrame(raf);
  raf = 0; lastT = 0;
  if (ctx) ctx.clearRect(0, 0, W, H);
  if (canvas) canvas.hidden = true;
  veil = 0;
}
function ensureLoop() {
  if (!canvas || !ctx) return;
  if (canvas.hidden) canvas.hidden = false;
  if (running) return;
  resize(); running = true; lastT = 0;
  raf = requestAnimationFrame(tick);
}
function stop() {
  veilTarget = 0;
  for (const b of bits) b.life = Math.min(b.life, b.age + .5);
  if (!running) return;
}

window.addEventListener('resize', () => { if (running) resize(); });

/* ---------- 八德 buff ---------- */
const KEY = 'foguang.buffs.v1';
let store = { buffs: {}, seen: [], visits: 0 };
try {
  const raw = localStorage.getItem(KEY);
  if (raw) store = Object.assign(store, JSON.parse(raw));
} catch (e) { /* 隐私模式下不持久化，不影响本次体验 */ }
if (!store.buffs || typeof store.buffs !== 'object') store.buffs = {};
if (!Array.isArray(store.seen)) store.seen = [];

function save() {
  try { localStorage.setItem(KEY, JSON.stringify(store)); } catch (e) { /* 忽略 */ }
}
function total() {
  return BUFFS.reduce((n, [k]) => n + (store.buffs[k] || 0), 0);
}
function renderBuffs() {
  const panel = document.querySelector('#buffs');
  const list = document.querySelector('#buff-list');
  if (!panel || !list) return;
  panel.hidden = false;
  list.innerHTML = BUFFS.map(([k, label]) =>
    `<li title="${label} · ${store.buffs[k] || 0}"><b>${label}</b><span>${store.buffs[k] || 0}</span></li>`
  ).join('');
  const sum = document.querySelector('#buff-total');
  if (sum) sum.textContent = `福缘 ${total()}`;
}
function addBuff(gain) {
  const parts = [];
  for (const [k, label] of BUFFS) {
    const v = gain[k];
    if (!v) continue;
    store.buffs[k] = (store.buffs[k] || 0) + v;
    parts.push(`${label} +${v}`);
  }
  save(); renderBuffs();
  return parts.join(' · ');
}

/* ---------- 横幅 ---------- */
let toastTimer = 0;
function showToast(o) {
  const box = document.querySelector('#omen-toast');
  if (!box) return;
  const gain = addBuff(o.buff);
  document.querySelector('#omen-name').textContent = `瑞兆 · ${o.name}`;
  document.querySelector('#omen-text').textContent = o.text;
  document.querySelector('#omen-gain').textContent = gain;
  box.hidden = false;
  box.classList.remove('in');
  // 重新触发入场动画
  void box.offsetWidth;
  box.classList.add('in');
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => { box.classList.remove('in'); setTimeout(() => { box.hidden = true; }, 500); }, 5600);
}

/* ---------- 抽取 ---------- */
function pickOne(exclude) {
  for (let i = 0; i < 12; i++) {
    const o = pick(OMENS);
    if (exclude.includes(o.id)) continue;
    // 最近见过两次的先避开，久了再遇到仍算新兆
    if (store.seen.slice(-2).includes(o.id) && Math.random() < .75) continue;
    return o;
  }
  return pick(OMENS);
}

// 每次来访：一到两种，第二种稍后浮现
function roll(where = 'visit') {
  const n = Math.random() < .55 ? 1 : 2;
  const chosen = [];
  for (let i = 0; i < n; i++) {
    const o = pickOne(chosen.map(x => x.id));
    chosen.push(o);
    store.seen.push(o.id);
    if (i === 0) play(o);
    else setTimeout(() => play(o), 2900);
  }
  store.seen = store.seen.slice(-12);
  store.visits = (store.visits || 0) + 1;
  save();
  return chosen;
}

// 有概率触发（礼拜、抽签这类重复动作）
let lastChance = 0;
function chance(p = .3, gap = 90000) {
  const now = Date.now();
  if (now - lastChance < gap) return null;
  if (Math.random() > p) return null;
  lastChance = now;
  const o = pickOne([]);
  store.seen.push(o.id);
  store.seen = store.seen.slice(-12);
  save();
  play(o);
  return o;
}

function init() {
  renderBuffs();
}

// 指定某一种瑞兆（调试与展示用）
function playId(id) {
  const o = OMENS.find(x => x.id === id);
  if (o) play(o);
  return !!o;
}

export const omens = { init, roll, chance, stop, playId, total, buffs: () => ({ ...store.buffs }), list: OMENS.map(o => o.id) };
