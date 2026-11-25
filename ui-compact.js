/* 手机端界面精简：按钮短字化交给 CSS，这里只管「折叠 / 清爽」两个状态。
   独立模块，不改动原有导览、瑞兆、同游逻辑；桌面端样式不受影响。 */

const body = document.body;

/* 一键清爽：只留下画面和右上一枚小按钮，再点恢复 */
const clean = document.querySelector('#clean');
if (clean) {
  clean.addEventListener('click', () => {
    const on = body.classList.toggle('clean');
    clean.setAttribute('aria-pressed', String(on));
    clean.setAttribute('aria-label', on ? '显示界面' : '隐藏界面');
    clean.dataset.short = on ? '显' : '隐';
    clean.blur();
  });
}

/* 八德（福分收集）与同游：默认只留一行抬头，点一下才展开明细 */
const folds = [
  ['#buffs', '.buffs-head', 'buffs-open'],
  ['#visitors', '.visitors-head', 'visitors-open']
];

function setFold(panel, head, cls, on) {
  body.classList.toggle(cls, on);
  head.setAttribute('aria-expanded', String(on));
  panel.classList.toggle('open', on);
}

for (const [sel, headSel, cls] of folds) {
  const panel = document.querySelector(sel);
  const head = panel && panel.querySelector(headSel);
  if (!panel || !head) continue;
  head.setAttribute('role', 'button');
  head.setAttribute('tabindex', '0');
  head.setAttribute('aria-expanded', 'false');
  head.setAttribute('title', '展开 / 收起');
  head.addEventListener('click', () => setFold(panel, head, cls, !body.classList.contains(cls)));
  head.addEventListener('keydown', e => {
    if (e.key === 'Enter' || e.key === ' ') {
      e.preventDefault();
      setFold(panel, head, cls, !body.classList.contains(cls));
    }
  });
}

/* 展开后点画面别处就收起，免得一直压着场景 */
addEventListener('pointerdown', e => {
  for (const [sel, headSel, cls] of folds) {
    if (!body.classList.contains(cls)) continue;
    const panel = document.querySelector(sel);
    if (panel && !panel.contains(e.target)) {
      setFold(panel, panel.querySelector(headSel), cls, false);
    }
  }
}, true);
