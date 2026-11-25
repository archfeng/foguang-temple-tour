/* 山寺行 · 梦境影像（独立增强模块）
 *
 * 原则（重要）：
 *   这个模块只呈现**确有其据的历史影像**，不做任何生成式「想象」。
 *   每个锚点挂的照片，必须是该项目里已有的原始照片（站内 archive.js 有出处标注），
 *   图像处理只允许「修复/放大」（去噪、局部对比、Lanczos 放大、锐化），
 *   不允许重绘、补形、换角度——否则史料就变成臆造。
 *
 * 触发：只在**走到光点附近并主动互动**时才浮现（点击光点 / 按 E）。
 *   不做地理自动触发：之前那版会在原地反复自弹，且关掉后立刻重开，
 *   体验上是「关不掉」，本质是自动触发与停稳计时耦合。现已整体移除。
 *
 * 关闭：右下「回到此刻」按钮 / 点击画面 / Esc，三条路都能退。
 *
 * 接入：wonder/core.js 的 mods 里 ['梦境', ()=>initDreams(ctx)]，模块整体 try/catch 隔离。
 * 坐标：主游览 THREE 世界坐标（x, y, z，y 为高程；地标见 tour.js stops 与 zones.js 包围盒）。
 */
const T = window.THREE;

/* 影像出处与画面内容对应表——锚点位置跟着照片的实际拍摄地，不是反过来编照片：
 *   hist-1952-foguang.jpg  《人民画报》1952 年 1 月，佛光寺大殿右侧所摄
 *                          （斗栱、直棂窗、檐下铁钟都在画面里）
 *   hist-1937-jingchuang.jpg 1937 年林徽因在佛光寺测绘经幢，中国国家图书馆原档
 *   hall.jpg / court.jpg     今日实景（Zhangzhugang, CC BY-SA），作「今」的对照帧
 */
const DREAMS = [
  {
    id: 'dadian',
    title: '东大殿 · 右侧檐下',
    /* 这里特意不给 view：殿右两棵大树把檐下挡死了，试过七个机位
       （d1/d2 全被树冠糊住，d3 只剩树影，d5/d6 左半是树干）。
       硬把镜头拽到树前没有意义，改成点了直接浮现，走机位的是别处。 */
    pos: [5.5, 0, 15.0],
    radius: 2.05,
    label: '看旧影 · 1952 年的大殿右侧',
    photos: [
      { file: 'photos/hist-1952-foguang.jpg', year: '1952',
        title: '《人民画报》里的大殿',
        caption: '斗栱、直棂窗、檐下一口铁钟。七十余年前刊在《人民画报》上的佛光寺，就从这个角度拍下。原取景处如今被庭中大树遮住，镜头过不去了，这一张就让它自己说话。',
        credit: '《人民画报》1952 年 1 月 · 原片修复（未作生成式修改）' },
      { file: 'photos/hall.jpg', year: '今',
        title: '东大殿前檐',
        caption: '今天的前檐：红褐板门、直棂窗与灰瓦，檐影下的斗栱仍比门板更深。',
        credit: '摄影：aisccd · CC BY' },
      { file: 'photos/archive/liang1937.png', year: '1937',
        title: '梁思成在佛光寺东大殿内',
        caption: '考察时从东大殿内部拍摄的档案照片。',
        credit: '清华大学出版社 · 第 36 页' }
    ]
  },
  {
    id: 'facade',
    title: '东大殿 · 长立面',
    /* 光点立在殿前庭院正中：原先贴在台缘 (3.4,5.0)，正好躲在新补的石栏后面，
       走到跟前也看不见。挪到庭院开阔处，一上台阶抬头就能看到。 */
    pos: [8.2, 0, 3.2],
    radius: 1.9,
    label: '细看 · 东大殿长立面',
    view: { pos: [-5.0, 20.5, 0.0], target: [16.0, 16.0, 0.0] },
    photos: [
      { file: 'photos/foguang-1952.png', year: '1952',
        title: '《人民画报》里的佛光寺',
        caption: '1952 年 1 月刊载的东大殿照片。',
        credit: '《人民画报》1952 年 1 月' },
      { file: 'photos/hall.jpg', year: '2013',
        title: '东大殿前檐',
        caption: '项目里最早的那张大殿照片：红褐板门、直棂窗与灰瓦，檐影下的斗栱比日照下的门板更深。右侧是檐下的铁钟。',
        credit: '摄影：aisccd · CC BY' }
    ]
  },
  {
    id: 'jingchuang',
    title: '东大殿右侧 · 经幢',
    /* 经幢不在殿左。殿右(+z)紧邻关帝殿(5.8→18.2, 21→28.8)，
       幢立在殿右前方空地 (6.2, 21.0)，背后正是那座配殿——你在现场拍照的位置。 */
    pos: [6.2, 0, 18.6],
    radius: 2.1,
    label: '看旧影 · 1937 年测绘经幢',
    view: { pos: [-1.2, 16.3, 13.6], target: [6.3, 15.4, 21.3] },
    photos: [
      { file: 'photos/hist-1937-jingchuang.jpg', year: '1937',
        title: '林徽因在佛光寺测绘经幢',
        caption: '1937 年，山西五台山。林徽因立在梯上为经幢测绘。调查队结合经幢纪年与梁上墨书题记，把东大殿断代到唐大中十一年（857）。',
        credit: '中国国家图书馆原档 · 原片修复（未作生成式修改）· 场景幢身为示意复原' },
      { file: 'photos/tour/tour-jingchuang.jpg', year: '今',
        title: '殿右的这根幢',
        caption: '现场实拍：方形幢身、上端开龛造像、莲花宝盖，背后正是配殿的朱红板门与匾额。佛光寺现存不止一根唐幢，这一根与下院那根的形制并不相同。',
        credit: '现场实拍' }
    ]
  },
  {
    id: 'chanfang',
    title: '殿右配殿 · 禅房',
    /* 不是旧影，是门户：点了就进禅房那间照片实景屋子。
       光点立在配殿门口——禅房门脸朝庭院(z 22.1 处有台阶与板门)，
       站在门前 1.5 米，别塞在建筑侧面。 */
    pos: [12.0, 0, 21.0],
    radius: 2.05,
    label: '入禅房 · 坐下静观',
    go: 'zen/',
    photos: []
  },
  {
    id: 'fotang',
    title: '东大殿 · 佛坛实景',
    /* 大殿内部的那张实景：佛坛与唐代彩塑，项目最早收集的一批资料里就有。
       光点立在进门左侧，互动时镜头转向佛坛再浮现照片。 */
    pos: [15.7, 0, -5.4],
    radius: 1.45,
    orbSize: .075,
    label: '看实景 · 大殿佛坛彩塑',
    view: { pos: [14.8, 16.6, 9.2], target: [24.5, 16.1, -9.5] },
    photos: [
      { file: 'photos/altar.jpg', year: '今',
        title: '东大殿佛坛 · 唐代彩塑',
        caption: '跨进殿门，佛坛上五组彩塑沿进深铺开：主尊与胁侍、供养菩萨、金刚力士，唐塑的原色还压在历代的重妆之下。殿内不许摄影的年代，这一张是难得的现场记录。',
        credit: '摄影：Patrick20242023 · CC BY-SA 4.0 · 站内互动为虚拟演示' }
    ]
  }
];

export function initDreams(ctx){
  if (!ctx || !ctx.scene) return null;
  const cam = ctx.camera;
  if (!cam) return null;

  /* ---------- 取「可站立面」高度：ctx.ground() 给的是地形，不是台地/铺地 ----------
   * 东大殿前庭在台地上，地形函数只返回下层高程，光点与幢会被埋进去。
   * 这里从高处向下打射线取水平面。注意：直接 intersectObject(scene,true) 会因场景里
   * 存在无几何体的对象而抛 matrixWorld 空引用，所以先筛出真正的 mesh 再逐个打。 */
  const rayDir = new T.Vector3(0, -1, 0);
  const rc = new T.Raycaster();
  let solids = null;
  function collectSolids(){
    solids = [];
    const walk = (o) => {
      if (!o) return;
      if (o.isMesh && o.geometry && o.visible !== false) solids.push(o);
      const kids = o.children || [];
      for (let i = 0; i < kids.length; i++) walk(kids[i]);
    };
    try { walk(ctx.scene); } catch (e) { /* 拿多少算多少 */ }
    return solids;
  }
  function surfaceAt(x, z, maxY){
    if (!solids) collectSolids();
    rc.set(new T.Vector3(x, Math.min(80, maxY + 40), z), rayDir); rc.far = 170;
    let best = null;
    for (let i = 0; i < solids.length; i++){
      let hit;
      try { hit = rc.intersectObject(solids[i], false); } catch (e) { continue; }
      if (!hit || !hit.length) continue;
      const h = hit[0];
      if (h.point.y > maxY) continue;             // 屋面、树冠之上不算落脚面
      const ny = h.face ? Math.abs(h.face.normal.y) : 0;
      if (ny < 0.55) continue;                    // 斜屋面、树冠不当成地面
      if (best === null || h.point.y > best) best = h.point.y;
    }
    if (best !== null) return best;
    return ctx.ground ? ctx.ground(x, z) : 0;
  }
  /* 单点会被树冠、石灯顶面顶高，取邻域五点中位数才稳 */
  function surfaceY(x, z, maxY = 17){
    const d = 0.8;
    const s = [surfaceAt(x, z, maxY), surfaceAt(x + d, z, maxY), surfaceAt(x - d, z, maxY),
               surfaceAt(x, z + d, maxY), surfaceAt(x, z - d, maxY)].sort((a, b) => a - b);
    return s[2];
  }

  /* ---------- 东大殿左侧前方的经幢（示意复原） ----------
   * 1937 年那张旧影拍的是林徽因测绘经幢，但场景里原先没有幢可依，
   * 光点落在空地上没有落点。这里按唐代石幢的通行形制立一根：
   * 方涩台基 → 覆莲 → 仰莲 → 八角幢身（刻经）→ 宝盖垂幔 → 二层幢身 → 宝珠。
   * 说明：尺度与细部是「示意复原」，不是测绘还原，字幕里也照此标注。 */
  const JINGCHUANG = { x: 6.2, z: 21.0 };
  function stoneTex(carve = false){
    const c = document.createElement('canvas'); c.width = 256; c.height = 512;
    const g2 = c.getContext('2d');
    g2.fillStyle = '#b7b1a4'; g2.fillRect(0, 0, 256, 512);
    for (let i = 0; i < 2400; i++){          // 石面斑驳
      const v = (150 + Math.random() * 70) | 0;
      g2.fillStyle = `rgba(${v},${v - 6},${v - 18},${0.05 + Math.random() * 0.11})`;
      g2.beginPath();
      g2.arc(Math.random() * 256, Math.random() * 512, 1 + Math.random() * 3, 0, 6.283);
      g2.fill();
    }
    /* 刻经只留「风化后的凿痕」意象：不写具体经文，避免臆造内容 */
    if (carve) for (let col = 0; col < 8; col++){
      const cx = 20 + col * 29;
      g2.strokeStyle = 'rgba(88,82,72,0.28)'; g2.lineWidth = 1;
      for (let k = 0; k < 15; k++){
        const y0 = 44 + k * 28 + Math.random() * 4;
        g2.beginPath();
        g2.moveTo(cx, y0); g2.lineTo(cx + (Math.random() < .5 ? 7 : -7), y0 + 5 + Math.random() * 7);
        g2.moveTo(cx + 3, y0 + 1); g2.lineTo(cx + 3, y0 + 13);
        g2.stroke();
      }
    }
    const t = new T.CanvasTexture(c);
    t.wrapS = t.wrapT = T.RepeatWrapping;
    return t;
  }
  function buildJingchuang(){
    const g = new T.Group();
    const gy = surfaceY(JINGCHUANG.x, JINGCHUANG.z);
    g.position.set(JINGCHUANG.x, gy, JINGCHUANG.z);
    /* 色调对齐场景里既有的石构件（暖灰石材），不要做成惨白的新石头；
       flatShading 打开，八角的棱线才出得来，否则平滑着色会看成一根灯柱 */
    const plain = new T.MeshStandardMaterial({ color:'#847e72', map:stoneTex(false), roughness:.97, metalness:0, flatShading:true });
    const carved = new T.MeshStandardMaterial({ map:stoneTex(true), color:'#8d8779', roughness:.98, metalness:0, flatShading:true });
    const dark  = new T.MeshStandardMaterial({ color:'#736e63', roughness:.96, metalness:0, flatShading:true });
    let y = 0;
    const put = (geo, mat, h, rotY = 0) => {
      const m = new T.Mesh(geo, mat);
      m.position.y = y + h / 2; m.rotation.y = rotY;
      m.castShadow = true; m.receiveShadow = true;
      g.add(m); y += h; return m;
    };
    const oct = (rb, rt, h, seg = 8) => new T.CylinderGeometry(rt, rb, h, seg);

    /* 比例照现场实拍（photos/tour/tour-jingchuang.jpg）校过一遍：
       原先幢身直径 0.92、高 1.42，高宽比不到 1.6，立在殿前像根石柱。
       实拍的幢身是细长的，高约为直径的四倍——现在 0.52 径 / 2.05 高。 */
    put(new T.BoxGeometry(1.50, 0.22, 1.50), dark, 0.22, Math.PI / 8);   // 方涩台基
    put(new T.BoxGeometry(1.26, 0.13, 1.26), plain, 0.13, Math.PI / 8);  // 上枋
    put(oct(0.70, 0.60, 0.26), plain, 0.26, Math.PI / 8);                // 覆莲
    put(oct(0.52, 0.60, 0.22), plain, 0.22, Math.PI / 8);                // 仰莲
    put(oct(0.26, 0.26, 2.05), carved, 2.05, Math.PI / 8);               // 一层幢身（刻经）
    put(oct(0.30, 0.30, 0.06), dark, 0.06, Math.PI / 8);                 // 幢身下线脚
    put(oct(0.50, 0.40, 0.15), plain, 0.15, Math.PI / 8);                // 宝盖
    put(oct(0.42, 0.46, 0.09), dark, 0.09, Math.PI / 8);                 // 垂幔
    put(oct(0.24, 0.24, 0.72), carved, 0.72, Math.PI / 8);               // 二层幢身（开龛造像）
    put(oct(0.38, 0.30, 0.13), plain, 0.13, Math.PI / 8);                // 二层宝盖
    put(oct(0.22, 0.04, 0.18), plain, 0.18, Math.PI / 8);                // 攒尖
    put(new T.SphereGeometry(0.085, 12, 10), dark, 0.16);                // 宝珠
    ctx.root.add(g);
    return g;
  }
  try { buildJingchuang(); } catch (e) { console.warn('[山寺志] 经幢 modeling 失败', e); }


  /* ---------- 样式（自包含注入，不改动共享 wonder.css） ---------- */
  const style = document.createElement('style');
  style.textContent = `
  #dream{position:fixed;inset:0;z-index:9999;display:flex;align-items:center;justify-content:center;
    pointer-events:none;opacity:0;transition:opacity 1.2s ease;overflow:hidden;background:#0a0806}
  #dream.on{opacity:1;pointer-events:auto}
  /* 同一角度的 3D 场景：梦境降临时本身虚化 + 暖旧，作为「3D → 照片」的过渡基底 */
  #scene canvas{transition:filter .95s ease}
  body.dream-stage #scene canvas{filter:blur(9px) sepia(.42) brightness(.92) saturate(.82) contrast(1.05)}
  /* 原站与增强 UI 在梦境中一律隐退（只留 3D 场景与梦境层） */
  body.dream-stage > *:not(#scene):not(#dream){
    opacity:0 !important; pointer-events:none; transition:opacity .55s ease }
  /* 竖构图的老照片不裁切：居中完整显示，两侧用同一张的模糊延展填满，
     所以这里不能带不透明底色，否则会盖住后面的 .d-glow */
  #dream .d-img{position:absolute;inset:0;background-size:contain;background-repeat:no-repeat;
    background-position:center;
    filter:sepia(.30) contrast(1.04) brightness(.96) saturate(.86);
    transform:scale(1.02);animation:d-breath 14s ease-in-out infinite}
  #dream .d-glow{position:absolute;inset:0;background-size:cover;background-position:center;
    filter:sepia(.5) blur(38px) brightness(.5);opacity:.85;transform:scale(1.2)}
  @keyframes d-breath{0%,100%{transform:scale(1.01)}50%{transform:scale(1.05)}}
  #dream .d-vig{position:absolute;inset:0;
    background:radial-gradient(120% 90% at 50% 46%,rgba(0,0,0,0) 36%,rgba(8,6,4,.66) 100%)}
  #dream .d-grain{position:absolute;inset:0;mix-blend-mode:overlay;opacity:.14}
  /* 字幕压暗带：署名与说明压在照片亮处时才看得清 */
  #dream .d-scrim{position:absolute;left:0;right:0;bottom:0;height:46vh;pointer-events:none;
    background:linear-gradient(to top,rgba(6,5,4,.9) 0%,rgba(6,5,4,.62) 38%,rgba(6,5,4,.18) 72%,rgba(6,5,4,0) 100%);
    opacity:0;transition:opacity .8s ease .3s}
  #dream.on .d-scrim{opacity:1}
  #dream .d-cap{position:absolute;left:0;right:0;bottom:6vh;text-align:center;color:#efe2c4;
    text-shadow:0 2px 14px rgba(0,0,0,.9);font-family:"STSong","Songti SC",serif;padding:0 8vw;
    opacity:0;transform:translateY(10px);transition:opacity .8s ease .35s,transform .8s ease .35s}
  #dream.on .d-cap{opacity:1;transform:translateY(0)}
  #dream .d-cap .d-year{display:inline-block;font-size:13px;letter-spacing:.32em;color:#d8b06a;
    border:1px solid rgba(216,176,106,.55);border-radius:2px;padding:2px 12px;margin-bottom:12px}
  #dream .d-cap h3{margin:0 0 8px;font-size:clamp(20px,3.4vw,32px);font-weight:600}
  #dream .d-cap p{margin:0 auto;max-width:700px;font-size:clamp(13px,1.8vw,17px);line-height:1.7;opacity:.92}
  #dream .d-cap .d-credit{margin-top:10px;font-size:12px;opacity:.6;letter-spacing:.04em}
  #dream .d-film{margin-top:10px;padding:6px 12px}
  #dream .d-film[hidden]{display:none}
  #dream .d-hint{position:absolute;top:4.5vh;left:0;right:0;text-align:center;color:#cbb890;
    font-size:13px;letter-spacing:.18em;opacity:0;transition:opacity .6s}
  #dream.on .d-hint{opacity:.62}
  /* 明确的关闭入口：之前只有「点画面」，看着像关不掉 */
  #dream .d-close{position:absolute;right:max(18px,3vw);bottom:max(16px,2.6vw);z-index:3;
    display:inline-flex;align-items:center;gap:8px;cursor:pointer;
    font-family:"STSong","Songti SC",serif;font-size:14px;letter-spacing:.14em;color:#efe2c4;
    background:rgba(28,22,16,.55);border:1px solid rgba(216,176,106,.45);border-radius:3px;
    padding:9px 16px;backdrop-filter:blur(6px);transition:background .25s,border-color .25s,transform .25s}
  #dream .d-close:hover{background:rgba(48,38,26,.85);border-color:rgba(216,176,106,.8);transform:translateY(-1px)}
  #dream .d-close .x{font-size:16px;line-height:1;opacity:.8}
  #dream .d-next{position:absolute;left:max(18px,3vw);bottom:max(16px,2.6vw);z-index:3;
    display:none;align-items:center;gap:8px;cursor:pointer;
    font-family:"STSong","Songti SC",serif;font-size:14px;letter-spacing:.14em;color:#efe2c4;
    background:rgba(28,22,16,.55);border:1px solid rgba(216,176,106,.45);border-radius:3px;
    padding:9px 16px;backdrop-filter:blur(6px);transition:background .25s,border-color .25s,transform .25s}
  #dream .d-next.show{display:inline-flex}
  #dream .d-next:hover{background:rgba(48,38,26,.85);border-color:rgba(216,176,106,.8);transform:translateY(-1px)}
  #dream .d-next .y{font-size:13px;line-height:1;opacity:.85;letter-spacing:.2em}
  `;
  document.head.appendChild(style);

  /* ---------- DOM ---------- */
  const layer = document.createElement('div');
  layer.id = 'dream';
  layer.innerHTML = `
    <div class="d-glow"></div><div class="d-img"></div>
    <canvas class="d-grain"></canvas><div class="d-vig"></div><div class="d-scrim"></div>
    <div class="d-hint">左下「对照」看今日同址 · 右下「回到此刻」或 Esc 退出</div>
    <div class="d-cap"><span class="d-year"></span><h3></h3><p></p><div class="d-credit"></div><button class="d-film" type="button" hidden>观看 1937 调查短片</button></div>
    <button class="d-next" type="button"><span class="y">↔</span><span class="lbl">对照 · 今</span></button>
    <button class="d-close" type="button"><span class="x">×</span><span>回到此刻</span></button>`;
  document.body.appendChild(layer);
  const elImg  = layer.querySelector('.d-img');
  const elGlow = layer.querySelector('.d-glow');
  const elYear = layer.querySelector('.d-year');
  const elH3   = layer.querySelector('.d-cap h3');
  const elP    = layer.querySelector('.d-cap p');
  const elCred = layer.querySelector('.d-credit');
  const elClose= layer.querySelector('.d-close');
  const elFilm = layer.querySelector('.d-film');
  const elNext = layer.querySelector('.d-next');
  const elNextLbl = elNext.querySelector('.lbl');

  /* 颗粒噪点：一张离屏噪声贴图循环平移，做胶片颗粒 */
  const grain = layer.querySelector('.d-grain');
  const gctx = grain.getContext('2d');
  let gPattern = null;
  function buildGrain(){
    const w = 180, h = 180; grain.width = w; grain.height = h;
    const img = gctx.createImageData(w, h);
    for (let i = 0; i < img.data.length; i += 4){
      const v = (Math.random() * 255) | 0;
      img.data[i] = img.data[i+1] = img.data[i+2] = v; img.data[i+3] = 255;
    }
    gctx.putImageData(img, 0, 0);
    gPattern = gctx.createPattern(grain, 'repeat');
  }
  buildGrain();
  let gShift = 0;
  function drawGrain(){
    if (!gPattern) return;
    gShift = (gShift + 0.7) % 180;
    gctx.clearRect(0, 0, grain.width, grain.height);
    for (let y = -180; y < grain.height; y += 180)
      for (let x = -180; x < grain.width; x += 180)
        gctx.drawImage(grain, x + gShift, y + gShift);
  }

  /* ---------- 光点（走近才亮，点它才开） ---------- */
  const markers = [];
  const mkMat = new T.MeshStandardMaterial({ color:'#ffd98a', emissive:'#ffb24d',
    emissiveIntensity:1.4, roughness:.5, transparent:true, opacity:.92 });
  const ringMat = new T.MeshStandardMaterial({ color:'#ffcf86', emissive:'#e8923a',
    emissiveIntensity:.8, roughness:.6, transparent:true, opacity:.5 });
  /* 门户类（入禅房）换个冷色，和「看旧影」的金色区分开 */
  const doorMat = new T.MeshStandardMaterial({ color:'#d8ecdf', emissive:'#78c9a4',
    emissiveIntensity:1.1, roughness:.5, transparent:true, opacity:.9 });
  for (const d of DREAMS){
    const g = new T.Group();
    /* 光点悬在人站得住的地面上方。这里必须卡 14.6 上限：
       配殿屋面在 16.8，树冠更高，不卡就会把光点顶到半空去。 */
    const y = surfaceY(d.pos[0], d.pos[2], 14.6) + 1.15;
    g.position.set(d.pos[0], y, d.pos[2]);
    // 每个锚点独立材质：不透明度要按距离各自淡入，共用材质会一起变
    const orb = new T.Mesh(new T.IcosahedronGeometry(d.orbSize ?? (d.go ? 0.15 : 0.11), 1), (d.go ? doorMat : mkMat).clone());
    const ring = new T.Mesh(new T.TorusGeometry(d.orbSize ? .16 : .28, 0.012, 8, 28), ringMat.clone());
    ring.rotation.x = Math.PI / 2;
    g.add(orb); g.add(ring);
    ctx.root.add(g);
    ctx.addItem(g, { id:'dream-'+d.id, label: d.label, range: d.radius, proximityPick:true, onHit: () => tryOpen(d) });
    markers.push({ d, g, orb, ring, base: y, enterR: d.radius });
  }

  /* ---------- 距离判定：走到附近才允许互动 ---------- */
  function distTo(d){
    const p = cam.position;
    return Math.hypot(p.x - d.pos[0], p.z - d.pos[2]);
  }

  /* ---------- 相机对位：先把镜头转到与照片相近的机位，再浮现旧影 ----------
   * 「同一个角度」不该靠运气——每个锚点带一组 view（相机位 + 看向点），
   * 互动时先沿弧线飞过去，到位后才让照片叠进来。
   * 每帧调用 window.__view：它是主游览的官方接管口，会同时清掉自动巡游状态
   * （只改 camera.position 是没用的，下一帧就被主循环写回去）。 */
  let flying = null, savedView = null;
  const _dir = new T.Vector3();
  function lookTarget(){
    cam.getWorldDirection(_dir);
    return new T.Vector3(cam.position.x + _dir.x * 12,
                         cam.position.y + _dir.y * 12,
                         cam.position.z + _dir.z * 12);
  }
  function flyTo(pos, target, dur, done){
    const p0 = cam.position.clone(), t0 = lookTarget();
    const p1 = new T.Vector3(pos[0], pos[1], pos[2]);
    const t1 = new T.Vector3(target[0], target[1], target[2]);
    const mid = p0.clone().add(p1).multiplyScalar(0.5);
    /* 中途抬高一点：直线掠过会被树冠、屋檐、挡土墙切开，看着像穿模 */
    mid.y += Math.min(7, p0.distanceTo(p1) * 0.22);
    flying = { p0, t0, p1, t1, mid, start: performance.now(), dur: Math.max(240, dur), done: done || null };
  }
  function stepFly(now){
    if (!flying) return;
    const k = Math.min(1, (now - flying.start) / flying.dur);
    const e = k < 0.5 ? 2 * k * k : 1 - Math.pow(-2 * k + 2, 2) / 2;   // easeInOutQuad
    const a = (1 - e) * (1 - e), b = 2 * (1 - e) * e, c = e * e;
    const px = a * flying.p0.x + b * flying.mid.x + c * flying.p1.x;
    const py = a * flying.p0.y + b * flying.mid.y + c * flying.p1.y;
    const pz = a * flying.p0.z + b * flying.mid.z + c * flying.p1.z;
    const tx = flying.t0.x + (flying.t1.x - flying.t0.x) * e;
    const ty = flying.t0.y + (flying.t1.y - flying.t0.y) * e;
    const tz = flying.t0.z + (flying.t1.z - flying.t0.z) * e;
    try { window.__view?.([px, py, pz], [tx, ty, tz]); } catch (err) { /* 主游览没准备好就跳过这一帧 */ }
    if (k >= 1){ const d = flying.done; flying = null; if (d) d(); }
  }

  function tryOpen(d){
    if (engaged || flying) return;
    const dist = distTo(d);
    if (dist > d.radius){
      ctx.toast?.('走近光点再看（还有 ' + Math.round(dist - d.radius) + ' 步）', 1800);
      return;
    }
    /* 门户类锚点：不是旧影，是「走进去」的一道门 */
    if (d.go){ ctx.toast?.(d.title + ' · 正在入内…', 1400); setTimeout(() => { location.href = d.go; }, 420); return; }
    const v = d.view;
    if (!v){ showDream(d, true); return; }
    savedView = { pos: cam.position.clone(), target: lookTarget() };
    ctx.toast?.('转回那个角度…', 1500);
    flyTo(v.pos, v.target, 1600, () => showDream(d, true));
  }

  /* ---------- 梦境播放 ---------- */
  let active = null, engaged = false, photoIdx = 0, lastId = null, restoreTimer = 0;
  function setPhoto(ph){
    elImg.style.backgroundImage  = `url("${ph.file}")`;
    elGlow.style.backgroundImage = `url("${ph.file}")`;
    elYear.textContent = ph.year || '';
    elH3.textContent   = ph.title || (active && active.title) || '';
    elP.textContent    = ph.caption || '';
    elCred.textContent = ph.credit || '';
    /* 「对照」按钮：直接标出下一张是什么年代，不用猜点了会发生什么 */
    const list = (active && active.photos) || [];
    if (list.length > 1){
      const nx = list[(photoIdx + 1) % list.length];
      elNext.classList.add('show');
      elNextLbl.textContent = '对照 · ' + (nx.year || '下一张');
    } else {
      elNext.classList.remove('show');
    }
  }
  function showDream(d, force){
    if (!d || !d.photos || !d.photos.length) return;
    const sameAnchor = (lastId === d.id);
    active = d;
    elFilm.hidden = !['dadian','facade','jingchuang'].includes(d.id);
    /* 首帧永远是那张历史照片本身；再次互动才翻到「今」作对照 */
    photoIdx = (force && sameAnchor) ? (photoIdx + 1) % d.photos.length : 0;
    lastId = d.id;
    setPhoto(d.photos[photoIdx]);
    /* 同一角度的 3D 场景先虚化、UI 隐退；照片随后叠入 */
    document.body.classList.add('dream-stage');
    engaged = true;
    ctx.proxSuppress = true;    // 看旧影期间不再弹「按 E」提示
    layer.classList.add('on');
    ctx.toast?.('旧影 · ' + d.title, 2200);
  }
  function hideDream(){
    if (!engaged) return;
    engaged = false;
    ctx.proxSuppress = false;
    layer.classList.remove('on');
    active = null; lastId = null;
    /* 复原 3D：照片还盖着画面时就先把世界还原（此时看不见，等同「悄悄回到此刻」），
       不能等久了——否则 UI 与清晰画面会一直卡在梦境状态 */
    clearTimeout(restoreTimer);
    restoreTimer = setTimeout(restoreStage, 300);
    /* 退回你原来站的位置：对位是「借你一双旧时的眼睛」，不该把你留在那里 */
    const sv = savedView; savedView = null;
    if (sv) setTimeout(() => {
      if (engaged || flying) return;
      flyTo(sv.pos.toArray(), sv.target.toArray(), 1200);
    }, 340);
  }
  function restoreStage(){
    clearTimeout(restoreTimer);
    if (!engaged) document.body.classList.remove('dream-stage');
  }
  function nextPhoto(){
    if (!active || !active.photos.length) return;
    photoIdx = (photoIdx + 1) % active.photos.length;
    setPhoto(active.photos[photoIdx]);
  }

  /* 三种退出方式，都绑在会真正收到事件的节点上 */
  elClose.addEventListener('click', e => { e.stopPropagation(); hideDream(); });
  elNext.addEventListener('click', e => { e.stopPropagation(); nextPhoto(); });
  elFilm.addEventListener('click', e => {
    e.stopPropagation();
    hideDream();
    document.querySelector('#archive').dispatchEvent(new Event('foguang:open-film'));
  });
  layer.addEventListener('click', hideDream);
  layer.addEventListener('transitionend', e => {
    if (e.target === layer && e.propertyName === 'opacity' && !engaged) restoreStage();
  });
  addEventListener('keydown', e => { if (e.key === 'Escape') hideDream(); });

  /* ---------- 每帧：相机飞行 + 光点呼吸 + 距离淡入 + 颗粒 ---------- */
  ctx.frames.push((now, dt) => {
    stepFly(now);
    const t = now * 0.001;
    for (const m of markers){
      const dist = distTo(m.d);
      // 走近才亮：远处只有一点微光作指引，进入半径内才完全点亮
      const near = Math.max(0, Math.min(1, (m.enterR * 2.4 - dist) / (m.enterR * 1.4)));
      const op = 0.10 + near * 0.90;
      m.orb.material.opacity = op;
      m.ring.material.opacity = 0.05 + near * 0.45;
      m.g.visible = near > 0.015;
      m.orb.position.y = Math.sin(t * 1.4 + m.d.pos[0]) * 0.10;
      m.g.rotation.y += dt * 0.5;
      const s = 1 + Math.sin(t * 2.2 + m.d.pos[2]) * 0.10;
      m.orb.scale.setScalar(s);
    }
    if (engaged) drawGrain();
  });

  window.__dreams = {
    show:(id)=>{ const d=DREAMS.find(x=>x.id===id);
                 if(!d) return;
                 if (d.view){
                   /* 调试入口也要留住原机位，否则关掉后不会退回原处 */
                   if (!engaged && !savedView) savedView = { pos: cam.position.clone(), target: lookTarget() };
                   flyTo(d.view.pos, d.view.target, 1600, () => showDream(d, true));
                 }
                 else showDream(d, true); },
    fly:(id)=>{ const d=DREAMS.find(x=>x.id===id);
                if (d && d.view) flyTo(d.view.pos, d.view.target, 1600); },
    go:(id)=>{ const d=DREAMS.find(x=>x.id===id); if (d && d.go) location.href = d.go; },
    hide:hideDream, next:nextPhoto, list:DREAMS.map(d=>d.id),
    _view:(id)=>{ const d=DREAMS.find(x=>x.id===id); return d ? d.view || null : null; },
    _cam:()=>({ x:+cam.position.x.toFixed(2), y:+cam.position.y.toFixed(2), z:+cam.position.z.toFixed(2),
                flying:!!flying, saved:!!savedView }),
    _markers: markers.map(m => ({ id: m.d.id, pos: [m.g.position.x, m.g.position.y, m.g.position.z],
                                  visible: m.g.visible, op: m.orb.material.opacity })),
    _grid: (x0, x1, z0, z1, step) => {
      const rows = [];
      for (let x = x0; x <= x1 + 1e-6; x += step){
        const row = [];
        for (let z = z0; z <= z1 + 1e-6; z += step) row.push(+surfaceY(x, z).toFixed(1));
        rows.push({ x: +x.toFixed(1), ys: row });
      }
      return { z0: +z0.toFixed(1), step, rows };
    },
    _dbg:()=>({ engaged, active: active && active.id,
                dists: DREAMS.map(d=>({id:d.id, dist: +distTo(d).toFixed(1), r:d.radius})) })
  };
  console.info('[山寺志] 旧影 已载入 ·', DREAMS.length, '处锚点（仅史料照片，无生成图像）');
  return { showDream, hideDream };
}
