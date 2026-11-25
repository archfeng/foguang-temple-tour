import {meditation} from '../progress.js?v=20261125wishes';
let endMeditation;
/* =============================================================
   禅房 · 照片级影像空间   |   three.js / WebGL 呈现层
   build 20261115r
   -------------------------------------------------------------
   路线说明（重要）：
   1) 早先用程序化几何造房间 / 车削佛像，无论怎么调参数都停留在
      「3D 练习」的观感。项目里本来就有一整套用同一参考图锁定、
      逐向生成的照片级禅房环视图，那才是主视觉。
   2) 曾试过把四张照片做柱面重投影连续环视 —— 透视照片被强行拉到
      100° 后直线全变弧形，且 45° 混合区出现重影，比 3D 版还糟。
      因此改为：照片保持原透视（object-fit: cover，绝不变形），
      转头由 shader 做「叠化 + 反向视差」转场；静止时永远只有一张
      干净照片，没有鬼影、没有畸变。
   3) three.js 负责：双纹理合成、cover 构图、色调统一、油灯呼吸光晕、
      鼠标视差与呼吸；浮尘 / 暗角 / 颗粒为叠加层。
   禅房使用四向照片环视。
   ============================================================= */
(function () {
'use strict';
const T = window.THREE;
const app = document.getElementById('app');
if (!T || !app) return;

const BUILD = '20261115az';
const PHOTOS = [
  'assets/pano_000.jpg?v=' + BUILD,   //   0° 正前：格窗山景、矮桌、香烟、油灯（与侧墙同深木材质）
  'assets/pano_090.jpg?v=' + BUILD,   //  90° 右侧：木壁小窗、长凳
  'assets/pano_180.jpg?v=' + BUILD,   // 180° 后方：纸门、蒲团
  'assets/pano_270.jpg?v=' + BUILD,   // 270° 左侧：挂轴、经柜、双灯
];
const LABELS = ['正前 · 山窗', '右侧 · 木壁', '后方 · 纸门', '左侧 · 挂轴'];
const STEP = Math.PI / 2;
/* 四向现已同材质（深木），只保留极轻暖校正统一白平衡 */
const TINT0 = new T.Vector3(1.005, 0.992, 0.965);
const TINT1 = new T.Vector3(1.0, 1.0, 1.0);
/* 180° 原图欠曝偏暗，单独提亮一点 */
const TINT2 = new T.Vector3(1.22, 1.17, 1.10);
const TINTS = [TINT0, TINT1, TINT2, TINT1];

const el = id => document.getElementById(id);
const sitOverlay = el('sit-overlay');
const panoCompass = el('pano-compass');
const sitHint = el('sit-hint');
const loading = el('loading');
const dust = el('dust');

/* ---------------- renderer ---------------- */
const renderer = new T.WebGLRenderer({
  antialias: false, alpha: false, preserveDrawingBuffer: true,
  powerPreference: 'high-performance'
});
renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
renderer.setSize(innerWidth, innerHeight);
/* 纹理是 sRGB 数据、着色器内直接当数值处理，关闭 three 的自动色彩转换 */
const NO_CS = T.LinearSRGBColorSpace !== undefined ? T.LinearSRGBColorSpace : '';
if (NO_CS) renderer.outputColorSpace = NO_CS;
app.appendChild(renderer.domElement);

const scene = new T.Scene();
const camera = new T.Camera();     // 全屏 quad，射线/构图全部在 shader 里算

function blankTex() {
  const t = new T.DataTexture(new Uint8Array([24, 17, 12, 255]), 1, 1, T.RGBAFormat);
  t.needsUpdate = true; return t;
}
const uniforms = {
  uA: { value: blankTex() }, uB: { value: blankTex() },
  uMix: { value: 1 }, uDir: { value: 1 },
  uAspect: { value: innerWidth / innerHeight },
  uPar: { value: new T.Vector2(0, 0) },
  uCenter: { value: new T.Vector2(0.5, 0.5) },
  uTintA: { value: TINT0.clone() }, uTintB: { value: TINT0.clone() },
  uTime: { value: 0 }, uGlow: { value: 1 },
};

const VERT = `
  varying vec2 vUv;
  void main(){
    vUv = uv;
    gl_Position = vec4(position.xy, 0.0, 1.0);
  }
`;

const FRAG = `
  precision highp float;
  varying vec2 vUv;
  uniform sampler2D uA, uB;
  uniform float uMix, uDir, uAspect, uTime, uGlow;
  uniform vec2 uPar, uCenter;
  uniform vec3 uTintA, uTintB;
  const float PA = 1.7777778;   // 照片宽高比 16:9

  /* object-fit: cover —— 只裁切，绝不非等比拉伸 */
  vec2 cover(vec2 uv){
    vec2 s = (uAspect > PA) ? vec2(1.0, PA / uAspect)
                            : vec2(uAspect / PA, 1.0);
    vec2 q = vec2(0.5) + (uv - 0.5) * s;
    q += uCenter - vec2(0.5);
    return clamp(q, 0.0015, 0.9985);
  }

  void main(){
    /* 转场：旧图顺转头方向轻微移出，新图从另一侧进入 */
    vec2 offA = vec2(-uDir * 0.042 * uMix, 0.0);
    vec2 offB = vec2( uDir * 0.042 * (1.0 - uMix), 0.0);
    vec2 base = vUv + uPar;
    vec3 ca = texture2D(uA, cover(base + offA)).rgb * uTintA;
    vec3 cb = texture2D(uB, cover(base + offB)).rgb * uTintB;
    vec3 col = mix(ca, cb, uMix);
    /* 转头瞬间明显压暗再回来（fade-through-dark），让两张不同朝向的
       叠加在接近黑时几乎不可见，消除鬼影与接缝 */
    col *= 1.0 - 0.82 * sin(3.14159265 * uMix);

    /* 油灯呼吸光晕：只在 0° 那张的左下方，极轻，纯加性 */
    float g = exp(-pow((vUv.x - 0.155) / 0.17, 2.0))
            * exp(-pow((vUv.y - 0.28) / 0.20, 2.0));
    col += vec3(1.0, 0.58, 0.24) * g * uGlow * (0.020 + 0.008 * sin(uTime * 1.6));
    gl_FragColor = vec4(col, 1.0);
  }
`;

const material = new T.ShaderMaterial({
  uniforms, vertexShader: VERT, fragmentShader: FRAG,
  depthTest: false, depthWrite: false
});
scene.add(new T.Mesh(new T.PlaneGeometry(2, 2), material));

/* ---------------- 照片加载 ---------------- */
const texs = [];
const texLoader = new T.TextureLoader();
let loaded = 0;
PHOTOS.forEach((url, i) => {
  texLoader.load(url, t => {
    t.minFilter = t.magFilter = T.LinearFilter;
    t.generateMipmaps = false;
    t.wrapS = t.wrapT = T.ClampToEdgeWrapping;
    if (NO_CS) t.colorSpace = NO_CS;
    texs[i] = t;
    if (i === 0) { uniforms.uA.value = t; uniforms.uB.value = t; }
    if (++loaded >= PHOTOS.length && loading) loading.classList.add('gone');
  }, undefined, () => {
    if (++loaded >= PHOTOS.length && loading) loading.classList.add('gone');
  });
});

/* ---------------- 浮尘（2D 叠加层） ---------------- */
const dctx = dust ? dust.getContext('2d') : null;
let motes = [];
function seedDust() {
  if (!dctx) return;
  dust.width = innerWidth; dust.height = innerHeight;
  motes = [];
  const n = Math.round(Math.min(60, innerWidth * innerHeight / 24000));
  for (let i = 0; i < n; i++) motes.push({
    x: Math.random(), y: Math.random(),
    r: 0.5 + Math.random() * 1.4,
    a: 0.04 + Math.random() * 0.17,
    v: 0.000007 + Math.random() * 0.000020,
    s: Math.random() * 6.28
  });
}
function drawDust(t) {
  if (!dctx) return;
  dctx.clearRect(0, 0, dust.width, dust.height);
  for (const m of motes) {
    m.y -= m.v * 16;
    if (m.y < -0.02) { m.y = 1.02; m.x = Math.random(); }
    const px = (m.x + Math.sin(t * 0.22 + m.s) * 0.008 - uniforms.uPar.value.x * 0.9) % 1;
    const x = (px < 0 ? px + 1 : px) * dust.width;
    const y = m.y * dust.height;
    const glow = dctx.createRadialGradient(x, y, 0, x, y, m.r * 4);
    glow.addColorStop(0, 'rgba(255,226,170,' + m.a.toFixed(3) + ')');
    glow.addColorStop(1, 'rgba(255,226,170,0)');
    dctx.fillStyle = glow;
    dctx.beginPath(); dctx.arc(x, y, m.r * 4, 0, 6.2832); dctx.fill();
  }
}

/* ---------------- 尺寸 ---------------- */
let camFov = 55;
function resize() {
  const w = innerWidth, h = innerHeight;
  renderer.setSize(w, h);
  uniforms.uAspect.value = w / h;
  camFov = (w / h < 0.80) ? 68 : 55;
  seedDust();
}
addEventListener('resize', resize);
seedDust();
resize();

/* ---------------- 状态机 ---------------- */
let cur = 0, tgt = 0, mix = 1, animating = false, dir = 1;
let mx = 0, my = 0, mTx = 0, mTy = 0;
let pitchOff = 0, pitchOffT = 0;
let sitting = false, dragging = false, moved = false, dragAcc = 0, lastX = 0;
let lastAct = performance.now();

function wake() {
  lastAct = performance.now();
  document.body.classList.remove('hud-hidden');
}
function compass(i) {
  if (panoCompass) panoCompass.textContent = LABELS[i === undefined ? cur : i];
}
function applyPair() {
  uniforms.uA.value = texs[cur] || blankTex();
  uniforms.uB.value = texs[tgt] || texs[cur] || blankTex();
  uniforms.uTintA.value.copy(TINTS[cur]);
  uniforms.uTintB.value.copy(TINTS[tgt]);
}
function turn(delta) {
  if (animating || !texs[cur]) return;
  tgt = (cur + delta + 4) % 4;
  if (tgt === cur) return;
  dir = delta > 0 ? 1 : -1;
  mix = 0; animating = true;
  applyPair();
  compass(tgt); wake();
}
function jump(i) {
  cur = tgt = ((i % 4) + 4) % 4;
  mix = 1; animating = false;
  applyPair(); compass();
}
function enterSit(){
  if(!sitting){
    document.getElementById('btn-exit').textContent='起身 · 静坐 12 秒可获功德';
    endMeditation=meditation('room',amount=>{
      document.getElementById('btn-exit').textContent=amount?'起身 · 功德 +3':'起身';
    });
  }
  sitting = true; pitchOffT = -0.018;
  if (sitOverlay) sitOverlay.classList.add('active');
  if (sitHint) sitHint.classList.remove('show');
  wake(); compass();
}
function exitSit(){
  endMeditation?.(); endMeditation=null;
  sitting = false; pitchOffT = 0;
  if (sitOverlay) sitOverlay.classList.remove('active');
  wake();
}

/* 指针 */
addEventListener('pointermove', e => {
  mTx = (e.clientX / innerWidth) * 2 - 1;
  mTy = (e.clientY / innerHeight) * 2 - 1;
  wake();
  if (dragging) {
    const dx = e.clientX - lastX;
    if (Math.abs(dx) > 2) moved = true;
    dragAcc += dx; lastX = e.clientX;
    if (Math.abs(dragAcc) > 115) { turn(dragAcc > 0 ? -1 : 1); dragAcc = 0; }
  }
});
addEventListener('pointerdown', e => {
  if (e.target.closest && e.target.closest('.btn, #pano-nav')) return;
  dragging = true; moved = false; dragAcc = 0; lastX = e.clientX; wake();
});
addEventListener('pointerup', () => { dragging = false; dragAcc = 0; });
addEventListener('pointercancel', () => { dragging = false; dragAcc = 0; });

/* 键盘 */
addEventListener('keydown', e => {
  const k = e.key.toLowerCase();
  if (k === 'arrowleft' || k === 'a')       { e.preventDefault(); turn(-1); }
  if (k === 'arrowright'|| k === 'd')       { e.preventDefault(); turn(1); }
  if (k === 'e' || k === 'enter')           { enterSit(); }
  if (k === 'escape')                       { exitSit(); }
  if (k === 'r')                            { jump(0); }
});

/* 点击画面坐下（拖动不触发） */
renderer.domElement.addEventListener('click', () => {
  if (moved) { moved = false; return; }
  if (!sitting) enterSit();
});

/* 按钮 */
const btnExit = el('btn-exit'), btnShot = el('btn-shot');
if (btnExit) btnExit.onclick = exitSit;
if (btnShot) btnShot.onclick = () => {
  renderer.render(scene, camera);
  const a = document.createElement('a');
  a.download = '禅房-' + Date.now() + '.png';
  a.href = renderer.domElement.toDataURL('image/png');
  a.click();
};
const prev = el('pano-prev'), next = el('pano-next');
if (prev) prev.onclick = () => { turn(-1); };
if (next) next.onclick = () => { turn(1); };

/* ---------------- 主循环 ---------------- */
const t0 = performance.now();
let last = t0;
function frame(now) {
  requestAnimationFrame(frame);
  const t = (now - t0) / 1000;
  const dt = Math.min(0.05, (now - last) / 1000); last = now;

  if (animating) {
    mix = Math.min(1, mix + dt / 0.40);
    if (mix >= 1) {
      animating = false; cur = tgt;
      applyPair(); compass();
    }
  }
  const e = mix * mix * (3 - 2 * mix);          // smoothstep 叠化
  uniforms.uMix.value = e;
  uniforms.uDir.value = dir;
  uniforms.uGlow.value = (cur === 0 ? 1 - e : 0) + (tgt === 0 ? e : 0);
  uniforms.uTime.value = t;

  /* 竖屏 16:9 素材裁得极窄：0° 把取景中心右移让格窗山景进画面，
     其余朝向居中（纸门 / 木墙需要对称构图）。转场时按叠化权重平滑过渡。 */
  const offC = (innerWidth / innerHeight < 0.80) ? 0.615 : 0.5;
  const cA = (cur === 0 ? offC : 0.5), cB = (tgt === 0 ? offC : 0.5);
  const wantC = cA * (1 - e) + cB * e;
  uniforms.uCenter.value.x += (wantC - uniforms.uCenter.value.x) * 0.08;

  mx += (mTx - mx) * 0.045;
  my += (mTy - my) * 0.045;
  pitchOff += (pitchOffT - pitchOff) * 0.06;
  /* 极轻视差 + 呼吸，不破坏构图 */
  uniforms.uPar.value.set(
    -mx * 0.009 + Math.sin(t * 0.21) * 0.0014,
     my * 0.006 + pitchOff + Math.sin(t * 0.29) * 0.0011
  );

  if (!sitting && now - lastAct > 4200) document.body.classList.add('hud-hidden');
  if (!sitting && sitHint)
    sitHint.classList.toggle('show', t < 3.2 && !document.body.classList.contains('hud-hidden'));

  drawDust(t);
  renderer.render(scene, camera);
}
requestAnimationFrame(frame);

/* ---------------- 调试 / 验收 API（兼容既有截图脚本） ---------------- */
window.__zen = {
  info: () => ({ mode: 'photo', build: BUILD, yaw: cur * STEP,
                 poseIdx: cur, target: tgt, sitting, loaded,
                 live3d: false, poses: PHOTOS }),
  enter: enterSit, exit: exitSit,
  pose: i => jump(i),
  sitLook: (y, p) => { jump(Math.round(y / STEP)); pitchOffT = (p || 0) * 0.1; pitchOff = pitchOffT; },
  look: (y, p) => { jump(Math.round(y / STEP)); pitchOffT = (p || 0) * 0.1; },
  exposure: v => { uniforms.uTintA.value.setScalar(v); uniforms.uTintB.value.setScalar(v); },
  turn, jump,
  camera: { get fov() { return camFov; } },
  renderer, scene, uniforms,
  live: () => {}
};
compass();
})();
