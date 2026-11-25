/* 禅房 · 梵呗  —— 独立模块，不碰 zen/main.3d.js、zen/main.js 的任何渲染逻辑。
 *
 * 曲目全部由 WebAudio 现场合成，不加载任何音频文件、不发网络请求：
 *   磬（引磬 / 铜磬）、木鱼、颂钵底音、五声音阶的钟琴旋律。
 * 佛教里做早课、晚课唱赞常用的调式是「五声音阶」——
 *   宫（do）· 商（re）· 角（mi）· 徵（sol）· 羽（la）
 * 这里所有旋律都只用这五个音，听感才不会跑到西洋大小调上去。
 *
 * 用法：
 *   Chant.init()          建图（必须在用户手势里调用一次）
 *   Chant.play('morning') 切换曲目，'off' 静音
 *   Chant.setVolume(0..1)
 * 设计上的两条硬约束：
 *   1. 换曲先淡出再淡入，绝不硬切（硬切会有一声「咔」）；
 *   2. 每首都是「无限循环」，靠 setTimeout 排下一句，页面隐藏时停排。
 */
(function () {
  'use strict';

  const AC = window.AudioContext || window.webkitAudioContext;
  let ctx = null, master = null, wet = null, dry = null;
  let cur = 'off';         // 当前曲目 id
  let vol = .7;
  let timer = 0;           // 下一句的定时器
  let busNodes = [];       // 当前曲目挂的节点（换曲时统一断）
  let playing = false;

  /* ---------- 基础件 ---------- */
  function g(v) { const n = ctx.createGain(); n.gain.value = v; return n; }
  function filter(type, f, q) {
    const n = ctx.createBiquadFilter(); n.type = type; n.frequency.value = f; n.Q.value = q || 1; return n;
  }

  /* 一击式声音统一出口：干声 + 一点木构殿宇的回响 */
  function out(node, w) {
    const a = g(1); node.connect(a); a.connect(dry);
    if (w) { const b = g(w); a.connect(b); b.connect(wet); }
    return a;
  }
  /* 振荡音：f 频率、d 时长、a 音量、bend 下滑倍率 */
  function tone(t, f, d, a, o) {
    o = o || {};
    const osc = ctx.createOscillator();
    const env = g(.0001);
    osc.type = o.type || 'sine';
    osc.frequency.setValueAtTime(f, t);
    if (o.bend) osc.frequency.exponentialRampToValueAtTime(Math.max(40, f * o.bend), t + d);
    env.gain.setValueAtTime(.0001, t);
    env.gain.linearRampToValueAtTime(a, t + (o.atk || .004));
    env.gain.exponentialRampToValueAtTime(.0001, t + d);
    osc.connect(env);
    out(env, o.wet === undefined ? .5 : o.wet);
    osc.start(t); osc.stop(t + d + .03);
    busNodes.push(osc, env);
    return osc;
  }
  /* 噪声击：器物的「触击」瞬间，木头、铜、布各不相同 */
  function hit(t, d, a, o) {
    o = o || {};
    const src = ctx.createBufferSource();
    src.buffer = noiseBuf; src.loop = true;
    const f = filter(o.type || 'bandpass', o.f || 800, o.q || 1);
    const env = g(.0001);
    env.gain.setValueAtTime(.0001, t);
    env.gain.linearRampToValueAtTime(a, t + .0015);
    env.gain.exponentialRampToValueAtTime(.0001, t + d);
    src.connect(f); f.connect(env);
    out(env, o.wet === undefined ? .35 : o.wet);
    src.start(t, Math.random() * .4); src.stop(t + d + .03);
    busNodes.push(src, f, env);
  }

  let noiseBuf = null;
  function makeNoise() {
    const len = Math.floor(ctx.sampleRate * .8);
    const b = ctx.createBuffer(1, len, ctx.sampleRate);
    const d = b.getChannelData(0);
    for (let i = 0; i < len; i++) d[i] = Math.random() * 2 - 1;
    return b;
  }

  /* ---------- 三件法器 ---------- */

  /* 木鱼：空心的硬木，敲下去是一声「笃」——低频筒腔 + 中频木质 + 很短的皮面噪声。
     佛教念诵里的节拍器，比磬密、比钟干，作用是「定心」。 */
  function woodblock(t, a) {
    a = a || .16;
    hit(t, .035, a * .9, { f: 480, q: 1.6, type: 'lowpass', wet: .18 });
    tone(t, 310, .13, a * .95, { type: 'sine', bend: .66, wet: .2 });
    tone(t + .003, 620, .06, a * .28, { type: 'triangle', bend: .8, wet: .15 });
    tone(t, 155, .1, a * .35, { type: 'sine', bend: .7, wet: .1 });
  }

  /* 引磬（小铜磬）：一击之后余振很长、泛音干净，用来起句、收句。 */
  const TRACKS = {
    morning: {
      name: '木鱼',
      phrase(t) {
        const beat = 60 / 66;
        for (let i=0;i<8;i++) woodblock(t+i*beat,i%4===0 ? .14 : .105);
        return 8*beat;
      }
    }
  };

  function clearBus() {
    for (let i = 0; i < busNodes.length; i++) {
      try { busNodes[i].disconnect(); } catch (e) { /* 已断 */ }
    }
    busNodes = [];
  }
  function clearTimer() {
    if (timer) { clearTimeout(timer); timer = 0; }
  }
  function step() {
    if (!playing || !ctx) return;
    const tk = TRACKS[cur];
    if (!tk) return;
    if (document.hidden) { timer = setTimeout(step, 1200); return; }
    // 提前 0.12s 排下一句，避免 setInterval 抖动造成句间断开
    const at = ctx.currentTime + .12;
    let len = 8;
    try { len = tk.phrase(at); } catch (e) { /* 一句失败不影响下一句 */ }
    timer = setTimeout(step, Math.max(250, (len - .12) * 1000 + 40));
  }

  /* ---------- 对外 ---------- */
  function init() {
    if (ctx) {
      if (ctx.state === 'suspended' && ctx.resume) ctx.resume();
      return true;
    }
    if (!AC) return false;
    try { ctx = new AC(); } catch (e) { return false; }
    noiseBuf = makeNoise();

    master = g(vol);
    master.connect(ctx.destination);

    dry = g(1); dry.connect(master);
    // 殿内回响：短延时 + 阻尼反馈，比卷积省得多，木构殿宇的中频残响正合适
    const d = ctx.createDelay(.7); d.delayTime.value = .17;
    const fb = g(.32);
    const damp = filter('lowpass', 2200, .7);
    wet = g(.55);
    wet.connect(d); d.connect(damp); damp.connect(fb); fb.connect(d);
    damp.connect(wet); wet.connect(master);
    return true;
  }

  function play(id) {
    if (!init()) return false;
    cur = TRACKS[id] ? id : 'off';
    if (cur === 'off') { stop(); return true; }
    if (ctx.state === 'suspended' && ctx.resume) ctx.resume();
    // 先收旧曲（淡出 0.9s 后断节点），再起新曲，绝不硬切爆音
    const old = busNodes; busNodes = [];
    clearTimer();
    if (old.length) {
      setTimeout(function () {
        for (let i = 0; i < old.length; i++) {
          try { old[i].disconnect(); } catch (e) { /* 已断 */ }
        }
      }, 900);
    }
    playing = true;
    // 换曲：主音量先压到底再回到目标，衔接处听不到接缝
    const t = ctx.currentTime;
    master.gain.cancelScheduledValues(t);
    master.gain.setValueAtTime(.0001, t);
    master.gain.linearRampToValueAtTime(vol, t + 1.1);
    timer = setTimeout(step, 60);
    return true;
  }

  function stop() {
    cur = 'off';
    playing = false;
    clearTimer();
    if (ctx && master) {
      const t = ctx.currentTime;
      master.gain.cancelScheduledValues(t);
      master.gain.setValueAtTime(master.gain.value, t);
      master.gain.linearRampToValueAtTime(.0001, t + .7);
    }
    const old = busNodes; busNodes = [];
    setTimeout(function () {
      for (let i = 0; i < old.length; i++) {
        try { old[i].disconnect(); } catch (e) { /* 已断 */ }
      }
    }, 800);
  }

  function setVolume(v) {
    vol = Math.max(0, Math.min(1, +v || 0));
    if (ctx && master && playing) {
      const t = ctx.currentTime;
      master.gain.cancelScheduledValues(t);
      master.gain.setTargetAtTime(vol, t, .12);
    }
    try { localStorage.setItem('foguang.zen.vol', String(vol)); } catch (e) { }
  }

  function current() { return cur; }
  function list() { return Object.keys(TRACKS).map(k => ({ id: k, name: TRACKS[k].name })); }

  // 页面切到后台就暂停，回来续上——手机切走还响是很招人烦的
  document.addEventListener('visibilitychange', function () {
    if (!ctx || !playing) return;
    if (document.hidden) {
      ctx.suspend && ctx.suspend();
    } else {
      ctx.resume && ctx.resume();
    }
  });

  try { vol = parseFloat(localStorage.getItem('foguang.zen.vol') || '');
    if (!(vol >= 0 && vol <= 1)) vol = .7; } catch (e) { vol = .7; }

  window.Chant = { init: init, play: play, stop: stop, setVolume: setVolume, current: current, list: list, get volume() { return vol; } };
})();

