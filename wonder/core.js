import {initWishes} from './wishes.js?v=20261125sky2';
import {progress} from '../progress.js?v=20261125wishes';
/* 山寺行 · 独立增强模块（入口）
 *
 * 设计约束：原游览程序只留了 3 处最小桥接（__stage 增加 ground/hill/经济接口、
 * 轻功通过 __stage.jump 触发）。新增场景内容挂在独立 Group 下，
 * 单个子模块初始化失败会被隔离，不影响主场景，也不自动回退到任何收费服务。
 */
import {initTextures} from './textures.js?v=weathered2';
import {initWorld}    from './world.js?v=20261121fog1';
import {initBeings}   from './beings.js?v=20261125pilgrims';
import {initQuests}   from './quests.js?v=20261125wishes';
import {initSeasons}  from './seasons.js?v=20261121slope1';
import {initLanterns} from './lanterns.js?v=20261116bk';
import {initOrnaments} from './ornaments.js?v=20261115ba';
import {initShrines}  from './shrines.js?v=20261125wishes';
import {initClearance} from './clearance.js?v=20261112h';
import {initDreams}    from './dreams.js?v=20261125pilgrims';

const T = window.THREE;

const HOURS = [
  [0,'子夜'],[2,'丑时'],[4,'寅时'],[6,'卯时'],[8,'辰时'],[10,'巳时'],
  [12,'午时'],[14,'未时'],[16,'申时'],[18,'酉时'],[20,'戌时'],[22,'亥时'],[24,'子夜']
];
const hourName = h => {
  let n = HOURS[0][1];
  for (const [t, s] of HOURS) if (h >= t) n = s;
  return n;
};
const SEASONS = [['spring','春'],['summer','夏'],['autumn','秋'],['winter','冬']];

function waitStage(){
  return new Promise(resolve=>{
    const timer = setInterval(()=>{
      if (window.__stage && window.__sceneReady && window.THREE){
        clearInterval(timer); resolve(window.__stage);
      }
    }, 80);
  });
}
const el = (tag, cls, html) => {
  const n = document.createElement(tag);
  if (cls) n.className = cls;
  if (html != null) n.innerHTML = html;
  return n;
};

/* ---------- 批量静态几何：外围林带上百棵树必须走 InstancedMesh ----------
 * 叶团几何用「球面扰动 + 法线回混」处理（threejs-geometry 技能的做法）：
 * 原始 IcosahedronGeometry 在 detail 1 时是 80 个平面三角，近景看就是一颗
 * 多面体气球。这里在顶点半径上加低频噪声打散正球轮廓，再用 computeVertexNormals
 * 之后把法线朝原球面法线回混，恢复圆润的受光过渡；并写入"乘性"顶点明暗
 * （一团叶内上亮下暗、受光面/背光面），才不像一颗纯色气球。
 * 顶点色是乘性的，不破坏换季 material.color.set()——three.js 里 material.color
 * 与 vertexColor 相乘，换季改 color 仍直接生效（主程序 garden/detail 早已用此法）。
 * 远景大堆保持 detail 0，三角形不涨。
 */
function leafGeometry(detail, rough){
  const g = new T.IcosahedronGeometry(1, detail);
  if (!rough) return g;
  const p = g.attributes.position;
  const smooth = g.attributes.normal.clone();
  for (let i=0;i<p.count;i++){
    const x=p.getX(i), y=p.getY(i), z=p.getZ(i);
    const d = 1 + .15*Math.sin(9.7*x+4.3*z)*Math.cos(8.1*y-3.7*z)
                + .06*Math.sin(19*x-11*y+5*z);
    p.setXYZ(i, x*d, y*d, z*d);
  }
  g.computeVertexNormals();
  const n = g.attributes.normal, v = new T.Vector3(), r = new T.Vector3();
  const cols = [];
  for (let i=0;i<n.count;i++){
    v.fromBufferAttribute(n,i).lerp(r.fromBufferAttribute(smooth,i), .55).normalize();
    n.setXYZ(i, v.x, v.y, v.z);
    // 乘性明暗：以顶点朝向做上亮下暗的渐变，叠加低频斑驳。范围约 .70~1.0。
    const x=p.getX(i), y=p.getY(i), z=p.getZ(i);
    const up = .5 + .5 * v.y;                       // 朝上受光更亮
    const blotch = Math.sin(8.3*x+5.1*y)*Math.sin(6.7*z-3.9*x); // 叶团内部斑驳
    const t = .70 + .22*up + .08*blotch;
    cols.push(t, t, t*.95);
  }
  g.setAttribute('color', new T.Float32BufferAttribute(cols, 3));
  return g;
}
function createBatch(scene){
  const geo = {
    box : new T.BoxGeometry(1,1,1),
    cyl : new T.CylinderGeometry(1,1,1,8),
    sph : leafGeometry(2, true),      // 近景叶团：320 面 + 扰动平滑，去掉多面体硬边
    cone: new T.ConeGeometry(1,1,7)
  };
  const sphFar = leafGeometry(0, true);  // 远景林带：20 面，只做轮廓扰动
  const piles = new Map(), materials = new Map(), meshes = new Map();
  const M = new T.Matrix4(), Q = new T.Quaternion(), E = new T.Euler();
  const P = new T.Vector3(), S = new T.Vector3();
  function add(kind, color, pos, scale, ry = 0, rot = null){
    const key = kind + '|' + color;
    if (!piles.has(key)) piles.set(key, []);
    P.set(pos[0], pos[1], pos[2]);
    S.set(scale[0], scale[1], scale[2]);
    if (rot) Q.copy(rot);
    else { E.set(0, ry, 0); Q.setFromEuler(E); }
    M.compose(P, Q, S);
    piles.get(key).push(M.clone());
  }
  function flush(){
    for (const [key, list] of piles){
      const [kind, color] = key.split('|');
      // 只有 sph 叶团几何带顶点明暗；box/cyl/cone 无 color 属性，不能开 vertexColors（否则发黑）
      const m = new T.MeshStandardMaterial({ color, roughness: .95, side: T.DoubleSide, vertexColors: kind === 'sph' });
      /* 大片植被（外围林带几千个实例）降为低模：远看毫无差别，
         三角形省下上百万；这类大堆也不投阴影，阴影通道跟着减负 */
      const big = list.length > 1200 && kind !== 'box';
      const g = big
        ? (kind === 'sph' ? sphFar : geo[kind])
        : geo[kind];
      const im = new T.InstancedMesh(g, m, list.length);
      list.forEach((mm,i)=>im.setMatrixAt(i, mm));
      im.instanceMatrix.needsUpdate = true;
      im.castShadow = !big; im.receiveShadow = true;
      im.userData.wonderBatch = true;
      scene.add(im);
      materials.set(key, m);
      meshes.set(key, im);
    }
    piles.clear();
  }
  return { add, flush, materials, meshes };
}

/* ---------- 单件几何：会动 / 要拾取的对象用普通 Mesh ---------- */
function makeHelpers(ctx){
  const cache = new Map();
  ctx.mat = (color, o = {}) => {
    const key = color + '|' + JSON.stringify(o);
    if (!cache.has(key)) cache.set(key, new T.MeshStandardMaterial({ color, roughness: .94, ...o }));
    return cache.get(key);
  };
  ctx.group = (parent, pos) => {
    const g = new T.Group();
    if (pos) g.position.set(pos[0], pos[1], pos[2]);
    (parent || ctx.root).add(g);
    return g;
  };
  const put = (g, geo, color, pos, o) => {
    const m = new T.Mesh(geo, ctx.mat(color, o));
    m.position.set(pos[0], pos[1], pos[2]);
    m.castShadow = true; m.receiveShadow = true;
    (g || ctx.root).add(m);
    return m;
  };
  ctx.box   = (g,color,pos,size,o) => put(g, new T.BoxGeometry(...size), color, pos, o);
  ctx.cyl   = (g,color,pos,r,h,o,seg=10) => put(g, new T.CylinderGeometry(r,r,h,seg), color, pos, o);
  ctx.cone  = (g,color,pos,r,h,o,seg=8) => put(g, new T.ConeGeometry(r,h,seg), color, pos, o);
  ctx.sph   = (g,color,pos,r,o,d=1) => put(g, new T.IcosahedronGeometry(r,d), color, pos, o);
  ctx.ring  = (g,color,pos,r,tube,o) => {
    const m = put(g, new T.TorusGeometry(r,tube,6,22), color, pos, o);
    m.rotation.x = Math.PI/2; return m;
  };
  ctx.gy = (x,z) => ctx.ground(x,z);
  ctx.addItem = (obj, spec) => {
    obj.userData.wonder = spec.id;
    const item = { obj, ...spec };
    ctx.items.push(item);
    return item;
  };
}

/* ---------- UI ---------- */
function buildUI(ctx){
  const panel = el('div','w-panel');
  panel.innerHTML = `
    <div class="w-head"><strong>山 寺 志</strong><small>TIME &amp; SEASON</small><button class="w-fold" type="button" aria-label="折叠">－</button></div>
    <div class="w-body">
      <div class="w-row"><div class="w-label"><span>时辰</span><b id="w-hour">巳时 · 10:00</b></div>
        <input id="w-time" class="w-slider" type="range" min="0" max="24" step="0.25" value="10" aria-label="一天中的时辰"></div>
      <div class="w-row"><div class="w-label"><span>四时</span></div><div class="w-segs" id="w-season">
        ${SEASONS.map(([k,n])=>`<button class="w-seg${k==='summer'?' w-on':''}" data-s="${k}" type="button">${n}</button>`).join('')}
      </div></div>
      <div class="w-row"><div class="w-label"><span>材质</span></div><div class="w-segs" id="w-tex">
        <button class="w-seg w-on" data-t="detail" type="button">细部</button>
        <button class="w-seg" data-t="color" type="button">原色</button>
        <button class="w-seg" data-t="off" type="button">关闭</button>
      </div></div>
      <div class="w-stat" id="w-stat"></div>
      <div class="w-row" id="fortune-sky-replay" hidden><div class="w-label"><span>重看天象</span></div>
        <div class="w-segs">
          <button class="w-seg" data-sky-tier="100" type="button">五色佛光</button>
          <button class="w-seg" data-sky-tier="1000" type="button">彩云瑞鹤</button>
        </div>
      </div>
      <div class="w-help">福气 3 · 松下行者　9 · 山寺善客　18 · 云檐行者<br>100 · 好运锦鲤　1000 · 气运之子<br>自由漫步时按空格或「跳」。落在屋顶后可静坐。</div>
      <div class="w-help">走近按 <i>E</i>： <i>寺猫</i> · <i>铜钟</i> · <i>锦鲤</i> · <i>小卖部</i> · <i>山雀</i> · <i>访客</i> · <i>知客僧</i> · <i>扫地僧</i> · <i>旧影光点</i><br>入夜自会点烛，四季换叶。</div>
    </div>`;
  document.body.appendChild(panel);

  const tip    = el('div','w-tip');       document.body.appendChild(tip);
  const toast  = el('div','w-toast');     document.body.appendChild(toast);
  const dialog = el('div','w-dialog');    document.body.appendChild(dialog);
  const badge  = el('div','w-badge');     document.body.appendChild(badge);
  const prompt = el('div','w-prompt');    document.body.appendChild(prompt);

  /* ---------- 走近互动：靠近可交互物浮现提示，按 E 触发 ----------
   * 不再依赖鼠标点击：每 0.15s 找一遍身边最近的互动点（默认 3.8m，
   * 可用 item.range 覆盖），在屏幕下方给出「按 E」提示；按 E 直接触发。
   * 鼠标点击仍保留（触屏没有键盘）。 */
  const V3 = new T.Vector3();
  let proxItem = null, proxT = 0;
  ctx.byWishRail = () => {
    const {x,y,z}=ctx.camera.position;
    return !!window.__cam?.().roam && Math.abs(x-3.28)<2.15 &&
      y>13.3&&y<16.7&&Math.abs(z)>2.8&&Math.abs(z)<29.2 &&
      ctx.items.some(item=>item.aimOnly&&!item.disabled&&Math.abs(item.obj.position.z-z)<2.2);
  };
  const proxBlocked = () => ctx.dialogOpen || document.querySelector('dialog[open]');
  function setPrompt(item){
    proxItem = item || null;
    if (item){
      prompt.innerHTML = `走到跟前了 · 按 <kbd>E</kbd> ${item.label}`;
      prompt.classList.add('w-on');
    } else prompt.classList.remove('w-on');
  }
  ctx.proxSuppress = false;          // 旧影飞行/看照片期间不提示
  addEventListener('keydown', e => {
    if (e.defaultPrevented || (e.key !== 'e' && e.key !== 'E')) return;
    const t = e.target;
    if (t && (t.tagName === 'INPUT' || t.tagName === 'TEXTAREA' || t.isContentEditable)) return;
    if (proxBlocked() || ctx.proxSuppress || ctx.byWishRail() || !proxItem || proxItem.aimOnly || !proxItem.onHit) return;
    e.preventDefault();
    proxItem.onHit(proxItem);
  });
  ctx.frames.push(now => {
    if (now - proxT < 140) return; proxT = now;
    if (ctx.proxSuppress || proxBlocked()){ if (proxItem) setPrompt(null); return; }
    const c = ctx.camera.position;
    if(ctx.byWishRail()){
      const aimed=ctx.pick?.(null,true);
      if(aimed!==proxItem)setPrompt(aimed);
      return;
    }
    let best = null, bd = 1e9;
    for (const it of ctx.items){
      if (!it.onHit || it.disabled || it.aimOnly) continue;
      it.obj.getWorldPosition(V3);
      const d = V3.distanceTo(c);
      if (d < (it.range ?? 2.3) && d < bd){ bd = d; best = it; }
    }
    if (best !== proxItem) setPrompt(best);
  });

  const head = panel.querySelector('.w-head');
  const fold = panel.querySelector('.w-fold');
  // 手机窄屏默认收起山寺志，避免遮住左侧信息卡；点标题栏照常展开
  if (window.innerWidth <= 720) {
    panel.classList.add('w-collapsed');
    fold.textContent = '＋';
  }
  head.onclick = () => {
    const c = panel.classList.toggle('w-collapsed');
    fold.textContent = c ? '＋' : '－';
  };

  const timeInput = panel.querySelector('#w-time');
  const hourLabel = panel.querySelector('#w-hour');
  timeInput.oninput = () => {
    const h = Number(timeInput.value);
    ctx.state.hour = h;
    ctx.state.manualUntil = performance.now() + 30000;   // 手动调过就先别自动推 30 秒
    hourLabel.textContent = `${hourName(h)} · ${String(Math.floor(h)).padStart(2,'0')}:${String(Math.floor(h*60)%60).padStart(2,'0')}`;
    ctx.env?.setHour(h);
  };
  panel.querySelector('#w-season').onclick = e => {
    const b = e.target.closest('[data-s]'); if (!b) return;
    panel.querySelectorAll('[data-s]').forEach(x=>x.classList.toggle('w-on', x===b));
    ctx.state.season = b.dataset.s;
    ctx.env?.setSeason(b.dataset.s);
  };
  panel.querySelector('#w-tex').onclick = e => {
    const b = e.target.closest('[data-t]'); if (!b) return;
    panel.querySelectorAll('[data-t]').forEach(x=>x.classList.toggle('w-on', x===b));
    ctx.tex?.setMode(b.dataset.t);
  };

  let toastTimer = 0;
  ctx.toast = (text, ms = 2900) => {
    toast.textContent = text;
    toast.classList.add('w-on');
    clearTimeout(toastTimer);
    toastTimer = setTimeout(()=>toast.classList.remove('w-on'), ms);
  };
  ctx.tip = text => {
    if (text){ tip.innerHTML = text; tip.classList.add('w-on'); }
    else tip.classList.remove('w-on');
  };
  ctx.refreshStat = () => {
    const s = progress.data;
    document.querySelector('#roam-jump').hidden = false;
    panel.querySelector('#w-stat').textContent =
      `香 ${s.incense} · 鱼食 ${s.feed} · 小鱼干 ${s.treats} · 谷粒 ${s.grain} · 跳跃 ${progress.level()[2]} 米`;
  };

  /* 人物对话：who / sub / text / choices[{label,run}] / ask(text)=>string */
  ctx.say = ({ who='', sub='', text='', choices=[], ask=null }) => {
    ctx.dialogOpen = true;
    dialog.innerHTML = '';
    const h = el('div','w-who');
    h.innerHTML = `<span class="w-seal">${who.slice(0,1) || '僧'}</span><strong>${who}</strong><small>${sub}</small>`;
    const close = el('button','w-close','×'); close.type='button';
    close.onclick = ()=>{ ctx.dialogOpen=false; dialog.classList.remove('w-on'); };
    h.appendChild(close); dialog.appendChild(h);
    const body = el('div','w-text',''); body.textContent = text; dialog.appendChild(body);
    if (choices.length){
      const c = el('div','w-choices');
      choices.forEach(ch=>{
        const b = el('button','w-choice', ch.label); b.type='button';
        b.onclick = ()=>{ body.textContent = ch.run(); };
        c.appendChild(b);
      });
      dialog.appendChild(c);
    }
    if (ask){
      const row = el('div','w-ask');
      const inp = el('input'); inp.placeholder = '心里有一事，不妨问问…'; inp.maxLength = 30;
      const btn = el('button',null,'问'); btn.type='button';
      const go = ()=>{ const q=inp.value.trim(); if(!q)return; body.textContent = ask(q); inp.value=''; };
      btn.onclick = go;
      inp.onkeydown = e => { if (e.key==='Enter'){ e.stopPropagation(); go(); } };
      row.append(inp, btn); dialog.appendChild(row);
    }
    dialog.classList.add('w-on');
  };
  ctx.closeSay = () => { ctx.dialogOpen=false; dialog.classList.remove('w-on'); };
  ctx.dialogEl = dialog;
}

/* ---------- 点击拾取：所有可交互物挂 userData.wonder ---------- */
function bindPicking(ctx){
  const canvas = ctx.renderer.domElement;
  const ray = new T.Raycaster(), pointer = new T.Vector2();
  function pick(ev, wishesOnly=false){
    const r = canvas.getBoundingClientRect();
    if(!ev)pointer.set(0,0);
    else pointer.set(((ev.clientX-r.left)/r.width)*2-1, -((ev.clientY-r.top)/r.height)*2+1);
    if(document.pointerLockElement===canvas)pointer.set(0,0);
    ray.setFromCamera(pointer, ctx.camera);
    const restrict=wishesOnly||ctx.byWishRail();
    const hits=ray.intersectObjects(ctx.items.filter(item=>!item.disabled&&(!restrict||item.aimOnly)).map(item=>item.obj),true);
    for (const h of hits){
      let n = h.object;
      while (n && !n.userData.wonder) n = n.parent;
      if (!n) continue;
      const item = ctx.items.find(i=>i.obj === n || i.id === n.userData.wonder);
      if ((item?.aimOnly||item?.proximityPick) && ctx.camera.position.distanceTo(item.obj.position)>item.range)continue;
      if (item){ ctx.lastHitPoint = h.point.clone(); return item; }
    }
    return null;
  }
  addEventListener('keydown',e=>{
    if(e.key.toLowerCase()!=='e'||e.repeat||ctx.dialogOpen||!window.__cam?.().roam||document.querySelector('dialog[open]'))return;
    if(e.target?.closest?.('input,textarea,button,[contenteditable]'))return;
    const item=pick(null,true);
    if(!item?.aimOnly)return;
    e.preventDefault();
    item.onHit(item);
  },true);
  let down = null, lastMove = 0;
  canvas.addEventListener('pointerdown', e => {
    down = { x:e.clientX, y:e.clientY, t:performance.now() };
  });
  canvas.addEventListener('pointerup', e => {
    if (!down) return;
    const moved = Math.hypot(e.clientX-down.x, e.clientY-down.y);
    const dur = performance.now()-down.t;
    down = null;
    if (moved > 6 || dur > 700 || ctx.dialogOpen || document.querySelector('dialog[open]')) return;
    const item = pick(e);
    if (item && item.onHit) item.onHit(item,ctx.lastHitPoint);
  });
  canvas.addEventListener('pointermove', e => {
    const t = performance.now();
    if (t - lastMove < 90) return;
    lastMove = t;
    const item = pick(e);
    ctx.tip(item ? `<b>${item.label}</b> · 按 E 或点击` : '');
    canvas.style.cursor = item ? 'pointer' : '';
  });
  canvas.addEventListener('pointerleave', ()=>ctx.tip(''));
  ctx.pick = pick;
}

/* ---------- 主循环：每个子模块独立 try/catch，坏一个不影响其余 ---------- */
function startLoop(ctx){
  let last = performance.now();
  function frame(now){
    const dt = Math.min((now-last)/1000, .06); last = now;
    for (let i = ctx.frames.length-1; i >= 0; i--){
      try { ctx.frames[i](now, dt); }
      catch (e) { console.warn('[山寺志] 子模块已停用：', e); ctx.frames.splice(i,1); }
    }
    requestAnimationFrame(frame);
  }
  requestAnimationFrame(frame);
}

async function boot(){
  const stage = await waitStage();
  const root = new T.Group(); root.name = 'WonderAddon';
  stage.scene.add(root);

  const ctx = {
    T, stage, root,
    scene: stage.scene, camera: stage.camera, renderer: stage.renderer,
    ground: stage.ground, hill: stage.hill,
    items: [], frames: [], dialogOpen: false,
    state: { hour:10, season:'summer', texture:'detail',
             incense:0, coins:12, feed:3, kungfu:false },
    env: null, tex: null, beings: null, seasons: null, lanterns: null, ornaments: null
  };
  makeHelpers(ctx);
  ctx.batch = createBatch(root);
  window.__wonder = ctx;           // 方便调试，不参与原程序逻辑

  buildUI(ctx);
  bindPicking(ctx);

  const mods = [
    ['材质',   ()=>{ ctx.tex = initTextures(ctx) || null; }],
    ['四时',   ()=>{ ctx.seasons = initSeasons(ctx) || null; }],
    ['灯系',   ()=>{ ctx.lanterns = initLanterns(ctx) || null; }],
    ['环境',   ()=>{ ctx.env = initWorld(ctx) || null; }],
    ['器物',   ()=>{ ctx.ornaments = initOrnaments(ctx) || null; }],
    ['塑像',   ()=>{ ctx.shrines = initShrines(ctx) || null; }],
    ['生灵',   ()=>{ ctx.beings = initBeings(ctx) || null; }],
    ['许愿',   ()=>initWishes(ctx)],
    ['互动',   ()=>initQuests(ctx, ctx.beings)],
    ['梦境',   ()=>{ window.__dreamsMod = initDreams(ctx) || null; }],
    // 清障放在最后：园林与各殿都已建好，才知道哪些树该让路
    ['清障',   ()=>{ ctx.clearance = initClearance(ctx) || null; }]
  ];
  for (const [name, fn] of mods){
    try { fn(); console.info('[山寺志] '+name+' 已载入'); }
    catch (e) { console.warn('[山寺志] '+name+' 载入失败，已跳过：', e); }
  }
  // 四时先于器物/生灵挂载，那会儿小卖部、香铺还没建出来；这里补一遍屋面积雪
  try { ctx.seasons?.resnow?.(); } catch (e){ console.warn('[山寺志] 补雪跳过：', e); }
  ctx.batch.flush();
  // 顾问 P0：地面草丛三层化 + 瓦顶青苔覆层（依赖 batch 图元，flush 后补挂）
  try { ctx.env?.postFlush?.(); } catch (e){ console.warn('[山寺志] 美饰跳过：', e); }
  ctx.refreshStat();
  startLoop(ctx);

  /* 从禅房回来：把人直接落在禅房门口，而不是回到默认的鸟瞰起点 */
  try {
    if (new URLSearchParams(location.search).get('from') === 'zen'){
      history.replaceState(null, '', location.pathname);
      setTimeout(() => {
        try {
          window.__spawn?.(12.2, 20.3, 0);
          ctx.toast?.('你从禅房出来，站在配殿门口', 3200);
        } catch (e) { console.warn('[山寺志] 落点失败：', e); }
      }, 600);
    }
  } catch (e) { /* 忽略 */ }
}
boot();
