/* 手机端体验补丁（独立模块，不动 tour.js 结构）：
   1. 漫游时按住画面往下推 = 持续向前走，抬手即停（右手拇指管视角也管走路）
      —— 与 tour.js 约定：window.__touchWalk = true/false
   2. 横屏（扁长条）时给 body 加 .landscape-hud，样式在 style.css 末尾
   只在 coarse pointer（触屏）生效，桌面端零影响。 */
(function () {
  if (!matchMedia('(pointer: coarse)').matches) return;
  const canvas = document.querySelector('#scene');
  if (!canvas) return;

  let activeId = null, startY = 0, armTimer = 0;

  function roamOn() {
    const pad = document.querySelector('#roam-pad');
    return pad && !pad.hidden;
  }
  function setWalk(on) { window.__touchWalk = on; }

  canvas.addEventListener('pointerdown', e => {
    if (activeId !== null) return;         // 只认第一指；双指缩放交回 tour.js
    activeId = e.pointerId;
    startY = e.clientY;
    if (roamOn()) clearTimeout(armTimer);   // 是否走路只看后续位移，按下本身不动
  }, true);

  canvas.addEventListener('pointermove', e => {
    if (e.pointerId !== activeId) return;
    const dy = e.clientY - startY;
    if (!window.__touchWalk) {
      if (dy >= 24) { clearTimeout(armTimer); setWalk(true); }   // 下推起步
      else if (dy <= -24) clearTimeout(armTimer);                // 上勾取消
    } else if (dy <= -20) {
      setWalk(false);                                            // 走路中上勾回 = 停
    }
  }, true);

  function release(e) {
    if (e.pointerId !== activeId) return;
    activeId = null;
    clearTimeout(armTimer);
    setWalk(false);
  }
  canvas.addEventListener('pointerup', release, true);
  canvas.addEventListener('pointercancel', release, true);

  /* 离开漫游时兜底停步 */
  new MutationObserver(() => {
    if (!roamOn()) setWalk(false);
  }).observe(document.querySelector('#roam-pad') || document.body,
    { attributes: true, attributeFilter: ['hidden'] });

  /* ---------- 山寺志面板：手机端默认折起一次 ----------
     展开/收起的点击切换由 wonder/core.js 原绑（.w-head onclick），
     这里只负责首帧折起；面板异步挂载，用 MutationObserver 等它出现。 */
  function foldWPanel() {
    const wp = document.querySelector('.w-panel');
    if (!wp) return false;
    if (!wp.classList.contains('w-collapsed')) wp.classList.add('w-collapsed');
    return true;
  }
  if (!foldWPanel()) {
    const mo = new MutationObserver(() => { if (foldWPanel()) mo.disconnect(); });
    mo.observe(document.body, { childList: true, subtree: true });
    setTimeout(() => mo.disconnect(), 20000);   // 20s 没出现就放弃
  }

  /* ---------- 横屏压缩 ----------
     华为等安卓浏览器屏幕旋转时既不报 orientation:landscape、也不触发
     resize/orientationchange——媒体查询和 JS 判定双双失明。三重兜底：
       ① matchMedia 命中 → .landscape-hud
       ② innerWidth>innerHeight 且高度矮 → .landscape-hud
       ③ 以上都不中，但视口矮条（高度≤440）→ .compact，
          CSS 里两个类走同一套压缩规则（style.css）。
     另加 1s 轮询 + orientationchange/resize 监听，旋转后最迟一秒生效。 */
  function apply() {
    const w = innerWidth, h = innerHeight;
    const landMq = matchMedia('(orientation: landscape) and (max-height: 500px)').matches;
    const landJs = w > h && h <= 500;
    const compact = h <= 440 && w > 500;   // 矮条兜底（桌面窗口极少矮于此且全宽）
    document.body.classList.toggle('landscape-hud', landMq || landJs);
    document.body.classList.toggle('compact', compact);
  }
  apply();
  const land = matchMedia('(orientation: landscape) and (max-height: 500px)');
  land.addEventListener ? land.addEventListener('change', apply) : land.addListener(apply);
  addEventListener('resize', apply);
  addEventListener('orientationchange', () => setTimeout(apply, 120));
  setInterval(apply, 1000);

  /* ---------- 长按兜底 ----------
     CSS 已全局 user-select:none，个别国产浏览器仍会起长按文字菜单。
     只禁"长按"这一手势本身（touchstart 放行，pointer 事件不受影响），
     并拦 contextmenu——比全局 preventDefault touchstart 安全得多。 */
  document.addEventListener('contextmenu', e => {
    if (e.target.closest && e.target.closest('input,textarea,select,dialog,#archive')) return;
    e.preventDefault();
  });
})();
