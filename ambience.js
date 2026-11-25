/* 山寺环境音 · 独立模块
 * 三层声音全部由 WebAudio 现场合成，不加载任何音频文件、不发任何网络请求：
 *   鸟鸣（滑音啭叫）、猫叫（共振峰 + 颤音）、钟声（非谐分音长余振）。
 * 山风、松涛与合成诵经已按需求移除（诵经人声不像，不做假人声）；
 * 噪声源只留给钟的敲击，也不再需要按机位调权重的空间层。
 * 只从 ritual-audio.js 借一个 AudioContext，不改动导览 / 瑞兆 / 同游的原有逻辑。
 * 所有合成函数都是 (S, t) 形式，因此同一套代码也能在 OfflineAudioContext 里渲染试听。
 */
import * as sfx from './ritual-audio.js?v=20261112h';
import { Q } from './quality.js?v=20261112h';

const KEY = 'foguang.ambience.muted';
const btn = document.getElementById('sound');
const AC = window.AudioContext || window.webkitAudioContext;
const OAC = window.OfflineAudioContext || window.webkitOfflineAudioContext;

let S = null;                 // 在线音频图
let on = false;
let mutedByUser = false;
let timers = {};
let noteTimer = 0;
let noteShown = false;   // 按钮呼吸提示只做一次，不常驻、不新增浮层

function clamp(v, a, b) { return v < a ? a : v > b ? b : v; }
function gain(c, v) { const g = c.createGain(); g.gain.value = v; return g; }
function filt(c, type, freq, q) {
  const f = c.createBiquadFilter();
  f.type = type; f.frequency.value = freq; f.Q.value = q;
  return f;
}
function pan(c, v) {
  if (!c.createStereoPanner) return gain(c, 1);
  const p = c.createStereoPanner(); p.pan.value = clamp(v, -1, 1); return p;
}

/* 两秒噪声循环体，首尾交叉淡化，loop 时不爆音 */
function makeNoise(c, sec) {
  const len = Math.floor(c.sampleRate * sec);
  const b = c.createBuffer(1, len, c.sampleRate);
  const d = b.getChannelData(0);
  let last = 0;
  for (let i = 0; i < len; i++) {
    const w = Math.random() * 2 - 1;
    last = (last + .02 * w) / 1.02;          // 掺一点低频，噪声不刺耳
    d[i] = w * .62 + last * 2.8;
  }
  const f = Math.floor(c.sampleRate * .03);
  for (let i = 0; i < f; i++) {
    const a = i / f;
    d[i] = d[i] * a + d[len - f + i] * (1 - a);
  }
  return b;
}

/* 一次性声音统一出口：干声 + 一点山谷回声；停了就把节点全断开 */
function bus(S, node, nodes, wet) {
  node.connect(S.out);
  if (S.rev && wet) {
    const s = gain(S.c, wet);
    node.connect(s); s.connect(S.rev); nodes.push(s);
  }
}
function autoStop(src, nodes) {
  src.onended = function () {
    for (let i = 0; i < nodes.length; i++) {
      try { nodes[i].disconnect(); } catch (e) { /* 已断开 */ }
    }
  };
}
function tone(S, t, nodes, o) {
  const c = S.c;
  const src = c.createOscillator();
  const g = gain(c, .0001);
  src.type = o.type || 'sine';
  src.frequency.setValueAtTime(o.f, t);
  if (o.bend) src.frequency.exponentialRampToValueAtTime(Math.max(40, o.f * o.bend), t + o.dur);
  g.gain.setValueAtTime(.0001, t);
  g.gain.linearRampToValueAtTime(o.g, t + (o.atk || .008));
  g.gain.exponentialRampToValueAtTime(.0001, t + o.dur);
  src.connect(g);
  nodes.push(src, g);
  src.start(t); src.stop(t + o.dur + .02);
  return { g: g, src: src };
}
function hiss(S, t, nodes, o) {
  const c = S.c;
  const src = c.createBufferSource();
  src.buffer = S.noise; src.loop = true;
  const f = filt(c, o.type || 'bandpass', o.f, o.q || .8);
  const g = gain(c, .0001);
  g.gain.setValueAtTime(.0001, t);
  g.gain.linearRampToValueAtTime(o.g, t + (o.atk || .01));
  g.gain.exponentialRampToValueAtTime(.0001, t + o.dur);
  src.connect(f); f.connect(g);
  nodes.push(src, f, g);
  src.start(t, Math.random() * 1.5); src.stop(t + o.dur + .02);
  return { g: g, src: src };
}

/* ---------- 三层声音 ---------- */

// 鸟：两三声一组的滑音啭叫，左右随机落点
function bird(S, t) {
  const n = 2 + Math.floor(Math.random() * 3);
  const where = Math.random() * 1.5 - .75;
  const f0 = 1750 + Math.random() * 1250;
  for (let i = 0; i < n; i++) {
    const at = t + i * (.12 + Math.random() * .11);
    const f = f0 * (.92 + Math.random() * .22);
    const nodes = [];
    const o = S.c.createOscillator();
    const g = gain(S.c, .0001);
    const p = pan(S.c, where + (Math.random() - .5) * .35);
    o.type = 'sine';
    o.frequency.setValueAtTime(f * .74, at);
    o.frequency.exponentialRampToValueAtTime(f * 1.16, at + .045);
    o.frequency.exponentialRampToValueAtTime(f * .88, at + .125);
    g.gain.setValueAtTime(.0001, at);
    g.gain.linearRampToValueAtTime(.088, at + .018);
    g.gain.exponentialRampToValueAtTime(.0001, at + .145);
    o.connect(g); g.connect(p);
    bus(S, p, nodes, .5);
    nodes.push(o, g, p);
    o.start(at); o.stop(at + .17);
    autoStop(o, nodes);
  }
}

// 猫：一声「喵」，锯齿波过两组元音共振峰，尾巴往下滑，带 5Hz 颤音
function cat(S, t) {
  const c = S.c, dur = .58 + Math.random() * .2, nodes = [];
  const o = c.createOscillator();
  const vib = c.createOscillator();
  const vibAmt = gain(c, 11);
  const f1 = filt(c, 'bandpass', 880, 3.2);
  const f2 = filt(c, 'bandpass', 1750, 5.5);
  const a1 = gain(c, .55), a2 = gain(c, .30);
  const lp = filt(c, 'lowpass', 2900, .7);
  const env = gain(c, .0001);
  const p = pan(c, -.3 + Math.random() * .6);
  o.type = 'sawtooth';
  o.frequency.setValueAtTime(520, t);
  o.frequency.linearRampToValueAtTime(700, t + .13);
  o.frequency.linearRampToValueAtTime(410, t + dur);
  vib.frequency.value = 5.2;
  vib.connect(vibAmt); vibAmt.connect(o.frequency);
  env.gain.setValueAtTime(.0001, t);
  env.gain.linearRampToValueAtTime(.10, t + .07);
  env.gain.setValueAtTime(.10, t + dur * .48);
  env.gain.exponentialRampToValueAtTime(.0001, t + dur);
  o.connect(f1); f1.connect(a1); a1.connect(env);
  o.connect(f2); f2.connect(a2); a2.connect(env);
  env.connect(lp); lp.connect(p);
  bus(S, p, nodes, .35);
  nodes.push(o, vib, vibAmt, f1, f2, a1, a2, lp, env, p);
  o.start(t); o.stop(t + dur + .03);
  vib.start(t); vib.stop(t + dur + .03);
  autoStop(o, nodes);
}

// 钟：与 ritual-audio.js 的大钟同款非谐分音，但走环境总线，关掉环境音就一起收声
function bell(S, t) {
  const nodes = [];
  const hit1 = hiss(S, t, nodes, { g: .20, f: 900, q: .9, type: 'lowpass', dur: .09 });
  const hit2 = hiss(S, t, nodes, { g: .11, f: 2400, q: 1.4, type: 'highpass', dur: .06 });
  bus(S, hit1.g, nodes, 0); bus(S, hit2.g, nodes, 0);
  const parts = [[110, 7.2, .15], [166, 5.6, .078], [221, 4.6, .05],
    [297, 3.4, .029], [441, 2.4, .015], [663, 1.6, .008]];
  let longest = null, longestDur = 0;
  for (let i = 0; i < parts.length; i++) {
    const a = tone(S, t + i * .01, nodes,
      { f: parts[i][0], dur: parts[i][1], g: parts[i][2], atk: .012 });
    bus(S, a.g, nodes, .55);
    if (parts[i][1] > longestDur) { longestDur = parts[i][1]; longest = a.src; }
  }
  if (longest) autoStop(longest, nodes);
}

/* ---------- 搭音频图（在线 / 离线试听共用） ---------- */
function build(c, destination) {
  const out = gain(c, 0);
  out.connect(destination);
  const S = { c: c, out: out, noise: makeNoise(c, 2), rev: null };

  // 山谷回声：短延时 + 阻尼反馈，比卷积混响省得多
  const d = c.createDelay(.6); d.delayTime.value = .19;
  const fb = gain(c, Q.low ? .22 : .3);
  const damp = filt(c, 'lowpass', 1600, .7);
  const wet = gain(c, Q.low ? .18 : .26);
  const rev = gain(c, 1);
  rev.connect(d); d.connect(damp); damp.connect(fb); fb.connect(d);
  damp.connect(wet); wet.connect(out);
  S.rev = rev;

  /* 殿内木鱼专用支路：单独一条增益，离殿越远越轻。
     木鱼只在殿里淡淡地响，走到院子里自然收掉，不必来回开关调度。 */
  S.hallGain = gain(c, 0);
  S.hallGain.connect(out);
  return S;
}

/* ---------- 大殿木鱼 ---------- */
// 木鱼：空心硬木，一声「笃」。比钟干、比磬短，正好当念诵的节拍。
// 音量基准 k，最终经 S.hallGain（殿内程度）衰减。
function woodfish(S, t, k) {
  const nodes = [];
  k = k === undefined ? .10 : k;
  // 木面的短促触击
  const h = hiss(S, t, nodes, { g: k * .5, f: 520, q: 1.5, type: 'lowpass', dur: .03 });
  h.g.connect(S.hallGain);
  // 筒腔：主音下滑，是木鱼「笃」的核心
  const a = tone(S, t, nodes, { f: 330, dur: .13, g: k * .95, type: 'sine', bend: .70, atk: .003 });
  a.g.connect(S.hallGain);
  // 上方一点木质的清脆
  const b = tone(S, t + .003, nodes, { f: 660, dur: .06, g: k * .26, type: 'triangle', bend: .82, atk: .002 });
  b.g.connect(S.hallGain);
  if (a.src) autoStop(a.src, nodes);
}

/* 殿内程度 0~1：只有站进东大殿（x≥13.1、|z|≤11.9）才起音，
   前檐往里 1.6 米、侧墙 1.6 米内做平滑过渡，避免门口一走一过忽然出现/消失。 */
function hallLevel() {
  let c = null;
  try { c = window.__cam ? window.__cam() : null; } catch (e) { c = null; }
  if (!c) return 0;
  const x = c.x, z = Math.abs(-c.z);        // 模型 y = THREE -z
  if (!(x > 12.4 && x < 27)) return 0;
  if (!(z < 12.4)) return 0;
  const fx = Math.min(1, Math.max(0, (x - 12.4) / 1.6));
  const fz = Math.min(1, Math.max(0, (12.4 - z) / 1.6));
  return fx * fz;
}

/* ---------- 开关与调度 ---------- */
function stopLoops() {
  for (const k in timers) { clearTimeout(timers[k]); }
  timers = {};
}
function schedule(key, min, max, fn) {
  function step() {
    if (!on || !S || document.hidden) return;
    try { fn(S, S.c.currentTime + .02); } catch (e) { /* 单个音效失败不拖垮整层 */ }
    timers[key] = setTimeout(step, (min + Math.random() * (max - min)) * 1000);
  }
  timers[key] = setTimeout(step, (min + Math.random() * (max - min)) * 700);
}
function startLoops() {
  stopLoops();
  const slow = Q.low ? 1.35 : 1;
  schedule('bird', 5 * slow, 12 * slow, bird);
  schedule('cat', 24 * slow, 54 * slow, function (S, t) {
    // 走到登高梯附近（猫蹲在那儿）叫得勤一些
    const c = window.__cam ? window.__cam() : null;
    const d = c ? Math.hypot(c.x + 9.9, c.z + 3.6) : 99;
    if (d < 26 && Math.random() < .8) cat(S, t);
    else if (d > 26 && Math.random() < .45) cat(S, t);
  });
  schedule('bell', 58, 115, bell);

  /* 大殿木鱼：念诵的节拍，一拍一下，偶尔一拍两下（「笃·笃」收句）。
     启停不靠调度，靠 hallLevel() 逐起算的 hallGain —— 人在殿里才听得见。
     节拍器单独走，句与句之间留 12~26 秒的空白，才不会像打字机。 */
  schedule('woodfish', 12, 26, function (S, t) {
    const lv = hallLevel();
    const bpm = 52 + Math.random() * 10;
    const beat = 60 / bpm;
    const bars = 4 + Math.floor(Math.random() * 6);
    const k = (.085 + Math.random() * .035) * lv;
    for (let i = 0; i < bars * 4; i++) {
      const at = t + i * beat;
      woodfish(S, at, i % 4 === 0 ? k * 1.12 : k);
      if (i % 8 === 7 && Math.random() < .45) woodfish(S, at + beat * .5, k * .7);  // 收句那一下
    }
  });
}

/* 每帧把殿内程度写进 hallGain（只在变化时写，避免每帧排一条自动化）。
   走到殿门口它自己淡入，走出前檐自己淡出。 */
let hallShown = -1;
function tickHall() {
  if (!S || !S.hallGain) return;
  const v = on ? hallLevel() : 0;
  const q = Math.round(v * 40) / 40;
  if (q === hallShown) return;
  hallShown = q;
  const t = S.c.currentTime;
  S.hallGain.gain.cancelScheduledValues(t);
  S.hallGain.gain.setTargetAtTime(q, t, .55);
}

function fade(S, to, sec) {
  const t = S.c.currentTime;
  S.out.gain.cancelScheduledValues(t);
  S.out.gain.setValueAtTime(S.out.gain.value, t);
  S.out.gain.linearRampToValueAtTime(to, t + sec);
}

function setOn(v, byUser) {
  if (v === on) return;
  if (v && !AC) return;
  if (v) {
    sfx.unlock();
    const sh = sfx.shared();
    if (!sh) return;
    if (!S) {
      try { S = build(sh.ctx, sh.ctx.destination); }
      catch (e) { console.warn('[环境音] 初始化失败', e); return; }
    }
    if (S.c.state === 'suspended' && S.c.resume) S.c.resume();
  }
  on = v;
  if (btn) {
    btn.setAttribute('aria-pressed', String(v));
    btn.textContent = v ? '关闭环境音' : '开启环境音';
    btn.setAttribute('aria-label', v ? '关闭环境音（快捷键 M）' : '开启山寺环境音（快捷键 M）');
  }
  if (v) { fade(S, .9, 1.3); startLoops(); }
  else if (S) { fade(S, 0, .45); stopLoops(); }
  if (byUser) {
    mutedByUser = !v;
    try { localStorage.setItem(KEY, v ? '0' : '1'); } catch (e) { }
  }
}

/* 浏览器要用户手势才准出声：第一次任意点击自动淡入，之后按钮 / M 键随时可关。
   若手动关过，下次进来就尊重这个选择，不再自动开。 */
function firstGesture(e) {
  removeEventListener('pointerdown', firstGesture, true);
  removeEventListener('keydown', firstGesture, true);
  if (mutedByUser) return;
  if (e && e.target && e.target.closest && e.target.closest('#sound')) return; // 交给按钮自己
  setOn(true, false);
  if (btn && !noteShown) {
    noteShown = true;
    btn.classList.add('just-on');
    clearTimeout(noteTimer);
    noteTimer = setTimeout(function () { btn.classList.remove('just-on'); }, 2200);
  }
}

function init() {
  try { mutedByUser = localStorage.getItem(KEY) === '1'; } catch (e) { }
  if (btn) {
    btn.textContent = '开启环境音';
    btn.addEventListener('click', function () { setOn(!on, true); });
  }
  addEventListener('pointerdown', firstGesture, true);
  addEventListener('keydown', function (e) {
    if (e.key === 'm' || e.key === 'M') {
      if (e.target && /INPUT|TEXTAREA/.test(e.target.tagName)) return;
      setOn(!on, true);
    }
  });
  // 切后台就收声，回来再淡入，别在锁屏后一直响
  document.addEventListener('visibilitychange', function () {
    if (!S || !on) return;
    if (document.hidden) { fade(S, 0, .3); stopLoops(); }
    else { fade(S, .9, .8); startLoops(); }
  });
  // 直播弹幕 / 瑞兆要撞钟时，可以派这个事件让环境层同步来一杵
  addEventListener('foguang:bell', function () {
    if (on && S) bell(S, S.c.currentTime + .02);
  });
  addEventListener('pagehide', function () { if (S && on) fade(S, 0, .1); });
  // 手机浏览器从往返缓存恢复时，把环境音接回来
  addEventListener('pageshow', function (e) {
    if (e.persisted && on && S && !document.hidden) { fade(S, .9, .6); startLoops(); }
  });
}

/* 离线试听：同一套合成代码，把三层声音排进一条时间线渲染成 PCM，
   便于在不打开页面的情况下检查电平、导出样带。 */
async function preview(seconds) {
  if (!OAC) return null;
  const sec = clamp(seconds || 12, 4, 20);
  const c = new OAC(1, Math.floor(44100 * sec), 44100);
  const P = build(c, c.destination);
  P.out.gain.value = .9;
  bird(P, .5); bird(P, 3.2); bird(P, 7.5); bird(P, 10.4); bird(P, 13.5);
  cat(P, 5.1); cat(P, 12.2);
  bell(P, 2.0);
  const buf = await c.startRendering();
  const d = buf.getChannelData(0);
  let peak = 0, sum = 0;
  for (let i = 0; i < d.length; i++) {
    const a = Math.abs(d[i]);
    if (a > peak) peak = a;
    sum += d[i] * d[i];
  }
  // 16bit PCM WAV
  const out = new ArrayBuffer(44 + d.length * 2);
  const v = new DataView(out);
  function str(off, s) { for (let i = 0; i < s.length; i++) v.setUint8(off + i, s.charCodeAt(i)); }
  str(0, 'RIFF'); v.setUint32(4, 36 + d.length * 2, true); str(8, 'WAVE');
  str(12, 'fmt '); v.setUint32(16, 16, true); v.setUint16(20, 1, true);
  v.setUint16(22, 1, true); v.setUint32(24, 44100, true);
  v.setUint32(28, 88200, true); v.setUint16(32, 2, true); v.setUint16(34, 16, true);
  str(36, 'data'); v.setUint32(40, d.length * 2, true);
  for (let i = 0; i < d.length; i++) {
    const s = clamp(d[i], -1, 1);
    v.setInt16(44 + i * 2, s < 0 ? s * 0x8000 : s * 0x7fff, true);
  }
  const bytes = new Uint8Array(out);
  let bin = '';
  for (let i = 0; i < bytes.length; i += 8192) {
    bin += String.fromCharCode.apply(null, bytes.subarray(i, i + 8192));
  }
  return { wav: btoa(bin), peak: peak, rms: Math.sqrt(sum / d.length), seconds: sec };
}

init();
/* 殿内木鱼的远近跟随：每 200ms 取一次机位，够平滑也不给主循环添负担。
   不用 rAF，免得跟渲染帧抢时序，也便于在后台自动降频。 */
setInterval(tickHall, 200);
window.__ambience = {
  on: function () { return on; },
  state: function () { return S ? S.c.state : 'off'; },
  // 三层都是定时触发，已无空间权重；保留空接口兼容既有调试脚本
  weights: function () { return {}; },
  setOn: function (v) { setOn(!!v, true); },
  preview: preview,
  hallLevel: hallLevel,
  once: function (kind) {
    if (!on || !S) return false;
    const t = S.c.currentTime + .02;
    if (kind === 'bird') bird(S, t);
    else if (kind === 'cat') cat(S, t);
    else if (kind === 'bell') bell(S, t);
    else if (kind === 'woodfish') woodfish(S, t, .11 * Math.max(.25, hallLevel()));
    else return false;
    return true;
  }
};
