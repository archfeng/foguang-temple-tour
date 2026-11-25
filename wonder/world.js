/* 环境与植被：昼夜流转、四时换叶、入夜点烛、外围林带与多品种树木。
 * 所有光照参数都从原场景的真实光源上改，不改主程序，也不额外造第二套太阳。
 */
import {inNoPlant} from './zones.js?v=20261112h';
/* 四时/时段的调色板。
 * 白天三档（7/11/15 点）原来的天色是 #a8b8ac / #b3bcae / #afaeb0 ——
 * 偏灰绿的雾天调子，天看着发闷。用户要求"白天，天可以蓝一点"，
 * 改成清朗的淡蓝：早上一档带点晨雾的青蓝（偏冷、略淡），
 * 正午最蓝最透，下午稍回暖。夜里与黄昏那几档不动。 */
const KEYS_RAW = [
  {h:0,    bg:'#3d4863', sun:.44, sc:'#a8bce0', hemi:.82,sky:'#7186ad', grd:'#35313d', exp:1.32,fog:.0046, lamp:1,    pos:[-40,18,20]},
  {h:5,    bg:'#51566c', sun:.56, sc:'#d2ab9f', hemi:.86,sky:'#8c8ea6', grd:'#403a3a', exp:1.28,fog:.0045, lamp:.85,  pos:[-70,14,28]},
    {h:7,    bg:'#9dbdd8', sun:1.85,sc:'#f2dcbc', hemi:.94,sky:'#b6d4ea', grd:'#75694f', exp:1.10,fog:.0050, lamp:.25,  pos:[-72,26,30]},
  {h:11,   bg:'#8ab7dd', sun:2.55,sc:'#f0e5c8', hemi:.98,sky:'#a9cdea', grd:'#75654b', exp:1.12,fog:.0040, lamp:0,    pos:[-64,58,-26]},
  {h:15,   bg:'#93bcdb', sun:2.30,sc:'#f0d9b8', hemi:.88,sky:'#b0cfe6', grd:'#7a6a54', exp:1.14,fog:.0040, lamp:0,    pos:[-60,44,2]},
  {h:18.3, bg:'#6b4a34', sun:1.35,sc:'#ffbe84', hemi:.86,sky:'#7a7a92', grd:'#3a2a20', exp:1.32,fog:.0042, lamp:.75,  pos:[-66,30,34]},
  {h:20,   bg:'#404661', sun:.46, sc:'#a894b4', hemi:.84,sky:'#70759a', grd:'#34313a', exp:1.32,fog:.0048, lamp:1,    pos:[-40,18,20]},
  {h:24,   bg:'#3d4863', sun:.44, sc:'#a8bce0', hemi:.82,sky:'#7186ad', grd:'#35313d', exp:1.32,fog:.0046, lamp:1,    pos:[-40,18,20]}
];
/* 季相不只换叶色：天空、日光色、亮度、雾浓度都随四季走，
 * 这样即使远看不出地面细节，整张画面的气息也不一样。 */
/* 四季对天色的调整。
 * 注意这里的 tint 是直接 lerp 到天空底色上的，比例稍大就把蓝天冲成灰白。
 * 冬天原来 tint:'#cfddec' k:.46 —— 几乎一半的灰白盖上去，天就发灰了；
 * 改成偏冷的清透蓝（高原冬晴本就是这个颜色），并收小比例。
 * 秋天原来的 #eec089 k:.38 会把正午的天压成土黄，收小到 .22，
 * 只在太阳侧留一点暖调，不至于整片天变黄。 */
/* 雾浓度总缩放：1=原样，0=完全无雾。0.32 把灰白雾气压到约1/3，
   建筑/地面/远山恢复清透，笔触树本来就干净，两者不再割裂。 */
const FOG_SCALE = 0.32;
const SEASON_LIGHT = {
  spring: { tint:'#dce9cc', k:.24, sun:1.00, hemi:1.05, exp:1.03, fog:.94, warm:'#ffead2' },
  summer: { tint:null,      k:0,   sun:1.06, hemi:1.06, exp:1.00, fog:1.00, warm:'#fff0d7' },
  autumn: { tint:'#f0cfa0', k:.22, sun:1.02, hemi:.95,  exp:1.06, fog:1.16, warm:'#ffcf94' },
  winter: { tint:'#b9d2ea', k:.30, sun:.88,  hemi:1.14, exp:1.09, fog:1.38, warm:'#e8f0f9' }
};
const SEASON_TOAST = {
  spring:'春风过院，花开了满地。', summer:'松荫正浓，山里凉快。',
  autumn:'银杏黄了，落叶铺到阶前。', winter:'一夜雪落，瓦上阶上全白了。'
};
const HOURS = [[0,'子夜'],[2,'丑时'],[4,'寅时'],[6,'卯时'],[8,'辰时'],[10,'巳时'],[12,'午时'],[14,'未时'],[16,'申时'],[18,'酉时'],[20,'戌时'],[22,'亥时'],[24,'子夜']];
const hourName = h => { let n='子夜'; for(const [t,s] of HOURS) if(h>=t) n=s; return n; };

/* 关键视廊（世界 x,z）：山门内主轴→大殿门；前庭横穿；经幢→殿门。
 * 三轮P0-2：半宽整体外扩 ~1m（顾问：走廊每侧再扩 0.8~1.2m，
 * 保证展示机位殿门轮廓 ≥80% 可见、图2 顶部树冠压屏 ≤15%）。
 * tree() 栽树前用它拒栽，postFlush() 用它平移让位，两处共用一份定义。 */
const CORRIDORS = [
  [-45, 0, 12, 0, 3.4],
  [6.5, -18, 6.5, 18, 2.6],
  [6.2, 18.6, 11, 2, 2.9]
];
const CORR_SEG = CORRIDORS.map(([ax, az, bx, bz, hw]) => ({
  ax, az, bx, bz, hw,
  dx: bx - ax, dz: bz - az,
  len2: (bx - ax) ** 2 + (bz - az) ** 2
}));
function corridorHit(x, z, r){
  for (const s of CORR_SEG){
    const rr = (s.hw + (r || 0)) ** 2;
    let t = ((x - s.ax) * s.dx + (z - s.az) * s.dz) / s.len2;
    t = Math.max(0, Math.min(1, t));
    const px = s.ax + s.dx * t, pz = s.az + s.dz * t;
    if ((x - px) ** 2 + (z - pz) ** 2 < rr) return s;
  }
  return null;
}

/* 每品种一个独立的初始色，flush 后可按 key 找到对应批次材质换季 */
const SUMMER = {
  pine:'#2f4a34', cypress:'#35503a', ginkgo:'#4c6942',
  maple:'#5b6b3c', locust:'#476240', plum:'#52633f', bamboo:'#4a6b3e'
};
/* 顾问 P0-1：阔叶树团块原先全树一个色 →「气球感」。
 * 同一棵树按「阴/中/阳」三层配色：外围垂团最深、主冠本色、顶部受光团提亮；
 * 外围色再随机分深浅两档，成片栽下轮廓就有参差。
 * 注意：FOLIAGE 在 initWorld 里拿到 THREE 后才填（模块顶层没有 window.THREE 保证）。 */
const FOLIAGE = {};
function _fol(c, hex, k) {
  const col = new c.Color(hex);
  const hsl = {}; col.getHSL(hsl);
  col.setHSL((hsl.h + (k > 1 ? .006 : -.006) + 1) % 1,
             Math.min(1, hsl.s * (1 + Math.abs(k - 1) * .06)),
             Math.max(.05, Math.min(.9, hsl.l * k)));
  return '#' + col.getHexString();
}
function _folFill(Ctor) {
  for (const k of Object.keys(SUMMER))
    FOLIAGE[k] = { dark: _fol(Ctor, SUMMER[k], .80), mid: SUMMER[k], lite: _fol(Ctor, SUMMER[k], 1.16) };
}
const PALETTE = {
  spring:{ pine:'#3a573f',cypress:'#3f5c43',ginkgo:'#9dbd72',maple:'#a8bc72',locust:'#93b463',plum:'#d3a0b4',bamboo:'#83ab60' },
  summer:{ ...SUMMER },
  autumn:{ pine:'#3c4a2c',cypress:'#454c30',ginkgo:'#e0ae3e',maple:'#b8402a',locust:'#b3913c',plum:'#8a6238',bamboo:'#8d8a42' },
  winter:{ pine:'#49554a',cypress:'#4a554c',ginkgo:'#8e8c80',maple:'#7d7466',locust:'#7c7a6c',plum:'#6c6258',bamboo:'#5d6a52' }
};
const SNOW = '#eef1f0';
const KINDS = ['ginkgo','maple','locust','plum'];
/* 顾问二轮 P0-2 指定叶色区间：阴 #344632 / 中 #526747 / 亮 #71815A。
 * 夏主色整体往该区间收（原来偏灰绿、明度发闷），四季表按同方向平移。 */
const SUMMER2 = { ginkgo:'#4e6444', maple:'#57693e', locust:'#496441', plum:'#54653f' };
Object.assign(SUMMER, SUMMER2);
Object.assign(PALETTE.summer, SUMMER2);
Object.assign(PALETTE.spring, { ginkgo:'#93b26c', maple:'#9eb46b', locust:'#8cab5e', plum:'#cfa0b2' });
Object.assign(PALETTE.autumn, { ginkgo:'#d9a83c', maple:'#ac3f2b', locust:'#a98a3a', plum:'#83603a' });
Object.assign(PALETTE.winter, { ginkgo:'#87857a', maple:'#776e62', locust:'#76746a', plum:'#675d55' });
const PARTICLE = {
  spring:{ color:'#e8b9c0', size:.17, opacity:.72, speed:.72, drift:.7 },
  summer:{ color:'#f6dc94', size:.11, opacity:.62, speed:-.20, drift:1.1 },
  autumn:{ color:'#d9a552', size:.21, opacity:.80, speed:.95, drift:1.5 },
  winter:{ color:'#f2f4f2', size:.16, opacity:.85, speed:.48, drift:.9 }
};

export function initWorld(ctx){
  const T = ctx.T;
  _folFill(T);
  const KEYS = KEYS_RAW.map(k => ({
    ...k,
    _bg:new T.Color(k.bg), _sc:new T.Color(k.sc), _sky:new T.Color(k.sky), _grd:new T.Color(k.grd)
  }));
  const tmp = new T.Color(), tmp2 = new T.Color(), tmp3 = new T.Color(), tmp4 = new T.Color();
  const tintC = new T.Color();
  let season = ctx.state.season || 'summer';
  let lampLevel = 0;

  /* ---------- 找原场景的光 ---------- */
  let sun = null, hemi = null;
  const oldLamps = [];
  ctx.scene.traverse(o => {
    if (o.isDirectionalLight && !sun) sun = o;
    else if (o.isHemisphereLight && !hemi) hemi = o;
    else if (o.isPointLight) oldLamps.push({ l:o, base:o.intensity });
  });
  const bg0 = ctx.scene.background.clone();
  const fog0 = ctx.scene.fog ? ctx.scene.fog.density : .0038;
  const exp0 = ctx.renderer.toneMappingExposure;
  if (!ctx.scene.fog) ctx.scene.fog = new T.FogExp2(bg0, fog0);
  // 夜里单靠平行光会把暗部压成死黑，补一盏随夜色渐强的环境光
  // 三轮P1-2：补光提亮 15% 且偏 #C4CEC8（去纯蓝冷感，回到青灰）
  const nightFill = new T.AmbientLight('#a9bdb9', 0);
  ctx.root.add(nightFill);

  // 三轮P1-2：入口补光——主殿明间门洞（殿门 x≈13.1，台地 13.85）与
  // 山门门洞内（x≈-49，基座顶 .71）各一盏弱暖光，把入口铺地和门框提亮
  // 8~12%，展示机位不再看见入口一片死黑。
  const entryFills = [];
  for (const [ex, ez, ey] of [[12, 0, 15.4], [-49, 0, 3.0]]){
    const ef = new T.PointLight('#e8dcc2', 0, 14, 1.6);
    ef.position.set(ex, ey, ez);
    ctx.root.add(ef); entryFills.push(ef);
  }

  const mixN = (a,b,t) => a + (b-a)*t;
  const smooth = t => t*t*(3-2*t);
  function keysAt(h){
    let a = KEYS[0], b = KEYS[1];
    for (let i=0;i<KEYS.length-1;i++){
      if (h >= KEYS[i].h && h <= KEYS[i+1].h){ a=KEYS[i]; b=KEYS[i+1]; break; }
    }
    const t = smooth(Math.max(0, Math.min(1, (h-a.h)/Math.max(b.h-a.h, .001))));
    return { a, b, t };
  }

  /* ---------- 烛火：白天收起，入夜自明 ---------- */
  const lamps = [];
  const glowCanvas = document.createElement('canvas'); glowCanvas.width = glowCanvas.height = 64;
  {
    const g = glowCanvas.getContext('2d');
    const grd = g.createRadialGradient(32,32,0,32,32,31);
    grd.addColorStop(0,'rgba(255,231,176,.95)');
    grd.addColorStop(.28,'rgba(255,166,74,.52)');
    grd.addColorStop(1,'rgba(255,138,48,0)');
    g.fillStyle = grd; g.fillRect(0,0,64,64);
  }
  const glow = new T.CanvasTexture(glowCanvas);
  function lampAt(x,y,z,withLight=false){
    const g = ctx.group(ctx.root, [x,y,z]);
    ctx.cyl(g,'#3b3228',[0,0,0],.095,.16);
    const flame = ctx.cone(g,'#ffb258',[0,.19,0],.055,.17,
      { emissive:'#ff8c32', emissiveIntensity:1.8 });
    const sp = new T.Sprite(new T.SpriteMaterial({
      map:glow, transparent:true, depthWrite:false, blending:T.AdditiveBlending, opacity:0
    }));
    sp.position.set(0,.20,0); sp.scale.set(.9,.9,1); g.add(sp);
    let light = null;
    if (withLight){
      light = new T.PointLight('#ffb56b', 0, 14, 1.8);
      light.position.set(0,.3,0); g.add(light);
    }
    g.visible = false;
    lamps.push({ g, flame, sp, light, ph:Math.random()*6.28 });
  }
  // 殿前月台、山门、香铺、廊下、莲池石灯
  const LAMP_SPOTS = [
    [12.6,13.0, 5.4,true], [12.6,13.0,-5.4,true],
    [14.0,14.20, 3.1,true], [14.0,14.20,-3.1,false],
    [-45.5,.35, 3.0,true], [-45.5,.35,-3.0,false],
    [-44.0,.35,-9.2,false], [-20.0,2.0, 12.0,false],
    [-30.2,.55, 5.9,true], [-30.2,.55,10.9,false]
  ];
  LAMP_SPOTS.forEach(([x,y,z,l])=>lampAt(x,y,z,l));

  function setLamp(v){
    lampLevel = v;
    const on = v > .12;
    for (const L of lamps){
      L.g.visible = on;
      L.sp.material.opacity = v;
      if (L.light) L.light.intensity = 30 * v;
    }
    nightFill.intensity = .83 * v;
    // 入口补光：白天 2.6，夜里灯系本身变亮，弱化为 .8 防叠加过曝
    for (const ef of entryFills) ef.intensity = 2.6 * (1 - v) + .8 * v;
    for (const o of oldLamps) o.l.intensity = o.base * (1 + v*.42);
    ctx.lanterns?.setLamp(v);          // 室外灯系与环境共用同一个夜色强度
  }

  /* ---------- 飘落物：春瓣 / 夏萤 / 秋叶 / 冬雪 ---------- */
  let seed = 20261111;
  const rnd = () => ((seed = (Math.imul(1664525,seed)+1013904223)>>>0)/4294967296);
  const N = 170;
  const pArr = new Float32Array(N*3);
  for (let i=0;i<N;i++){
    pArr[i*3]   = (rnd()-.5)*90;
    pArr[i*3+1] = rnd()*26;
    pArr[i*3+2] = (rnd()-.5)*90;
  }
  const pGeo = new T.BufferGeometry();
  pGeo.setAttribute('position', new T.BufferAttribute(pArr,3));
  const pMat = new T.PointsMaterial({ size:.16, color:'#f6dc94', transparent:true,
    opacity:.65, depthWrite:false, sizeAttenuation:true });
  const pts = new T.Points(pGeo, pMat);
  pts.frustumCulled = false; ctx.root.add(pts);

  /* ---------- 植被：多品种树 + 竹 + 外围林带 ---------- */
  const B = ctx.batch;
  // broadleaf 的三层叶色要随四季走：flush 后按 key 找到批次材质重染。
  // 注意 FOLIAGE 会被 rebroad 覆写，「随机深档」的生成色必须先固化，供 redark 找 key。
  const BROAD_KEYS = ['ginkgo', 'maple', 'locust', 'plum'];
  const DARK2 = {};
  function rebroad() {
    for (const k of BROAD_KEYS) {
      const f = PALETTE[season][k];
      if (!f) continue;
      const t = _fol(T, f, .80), l = _fol(T, f, 1.16);
      for (const [key, col] of [['dark', t], ['mid', f], ['lite', l]]) {
        for (const kind of ['sph', 'cone']) {
          const m = B.materials.get(kind + '|' + FOLIAGE[k][key]);
          if (m) m.color.set(col);
        }
        FOLIAGE[k][key] = col;
      }
    }
  }
  function tree(x,z,kind,s,y0){
    // 栽之前先问禁入区：SPOTS 里早先有几处正落在文殊殿、香风花雨楼的殿内，
    // 事后清障又不碰 wonder 自己的实例，于是竹竿从佛座两侧长了出来。
    if (inNoPlant(x,z,2.2)) return;
    // y0 用来直接指定台面高度：殿前庭院在第三重台地上（13.0），
    // 而 ctx.gy() 给的是地形高程（2.0 上下），照它栽下去整棵树会埋进台地。
    const y = (y0 === undefined) ? ctx.gy(x,z) : y0;
    if (!isFinite(y)) return;
    // 三轮P0-2：冠幅半径估算——太靠近关键视廊的树直接不栽，
    // 事后平移只管 wonder 实例，兜不住这里贴着走廊边的冠。
    if (corridorHit(x, z, (kind==='pine'||kind==='cypress' ? 1.7 : 2.0) * s)) return;
    const conifer = kind==='pine' || kind==='cypress';
    const h = (conifer ? 6.4 : 5.3) * s;
    const trunk = kind==='plum' ? '#4a3a30' : '#4b3d2e';
    B.add('cyl',trunk,[x,y+h*.34,z],[.15*s,h*.68,.15*s]);
    const leaf = SUMMER[kind];
    if (kind === 'pine'){
      // 三轮P0-3：碎松针减半——两层大锥承担轮廓，不再三层堆碎片
      for (let k=0;k<2;k++)
        B.add('cone',leaf,[x,y+h*(.56+k*.19),z],[(1.62-k*.34)*s,2.05*s,(1.62-k*.34)*s]);
    } else if (kind === 'cypress'){
      for (let k=0;k<3;k++)
        B.add('cone',leaf,[x,y+h*(.50+k*.17),z],[(.98-k*.13)*s,2.2*s,(.98-k*.13)*s]);
    } else {
      for (const [dx,dy,dz,r] of [[0,.86,0,1.05],[.66,.73,.28,.80],[-.60,.77,-.26,.86],[.22,1.06,-.48,.70]])
        B.add('sph',leaf,[x+dx*s,y+h*dy,z+dz*s],[r*s,r*s*.78,r*s]);
      B.add('sph',SNOW,[x,y+h*1.10,z],[1.18*s,.30*s,1.18*s]);
    }
    if (conifer){
      B.add('sph',SNOW,[x,y+h*.94,z],[1.02*s,.24*s,1.02*s]);
      B.add('sph',SNOW,[x,y+h*.70,z],[.86*s,.18*s,.86*s]);
    }
  }
  function bambooClump(x,z,n,s=1){
    for (let i=0;i<n;i++){
      const a = rnd()*6.283, r = rnd()*1.55*s;
      const bx = x+Math.cos(a)*r, bz = z+Math.sin(a)*r;
      if (inNoPlant(bx,bz,1.4)) continue;      // 一丛竹逐竿判，别让半丛钻进墙里
      const by = ctx.gy(bx,bz);
      if (!isFinite(by)) continue;
      const h = (3.5+rnd()*1.9)*s;
      B.add('cyl','#77864f',[bx,by+h/2,bz],[.048*s,h,.048*s]);
      for (let k=1;k<=3;k++)
        B.add('sph',SUMMER.bamboo,
          [bx+(rnd()-.5)*.45*s, by+h*(.60+k*.13), bz+(rnd()-.5)*.45*s],
          [.44*s,.14*s,.32*s]);
    }
  }
  // 外圈山林：椭圆环带，把场地边界外的荒地盖掉
  for (let i=0;i<270;i++){
    const a = i/270*6.283 + (rnd()-.5)*.14;
    const x = -14 + Math.cos(a)*(76+rnd()*42);
    const z = Math.sin(a)*(48+rnd()*32);
    if (x>-64 && x<40 && Math.abs(z)<29) continue;
    tree(x,z,KINDS[(rnd()*KINDS.length)|0], .85+rnd()*.9);
  }
  // 近边界补一层，从院内平视时看不到空地
  for (let i=0;i<140;i++){
    const z = (rnd()<.5?-1:1)*(30+rnd()*19);
    const x = -70+rnd()*114;
    tree(x,z,KINDS[(rnd()*KINDS.length)|0], .68+rnd()*.62);
  }
  // 院内空地：分散栽种，避开中轴视线与莲池
  const SPOTS = [
    [-48,-14],[-44,-20],[-38,-22],[-30,-19],[-24,-22],[-12,-20],[-6,-18],
    [2,-20],[8,18],[10,-18],[-16,20],[-24,19],[-40,17],[26,18],[29,-17],
    [-50,9],[-36,-11],[-18,-13],[6,-22],[20,15]
  ];
  for (const [x,z] of SPOTS){
    tree(x,z,KINDS[(rnd()*KINDS.length)|0], .60+rnd()*.34);
    if (rnd()<.42) bambooClump(x+2.6,z+1.7,5+(rnd()*5|0),.8);
  }
  // 几片成规模的竹丛
  for (const [x,z,n] of [[-47,-9,13],[-34,-16,11],[-12,-24,10],[24,20,12],[-6,22,9],[10,-22,11]])
    bambooClump(x,z,n,1);

  /* 阔叶大树：枝叶繁茂的伞形阔叶树（银杏/槐/枫/榆一类）。
   * 用户明确不要「一根杆上面叠几个圆锥」的松柏；要的是圆形浓密树冠。
   * 顾问 P0-1 返工：全树一色 + 等大球团 = 绿色气球串。改为——
   *   ① 两段树干上加 2~3 根向外斜伸的支干，插入冠内，近看有「枝撑叶」的结构；
   *   ② 外围垂团改用压扁锥（ConeGeometry 底面朝外），轮廓不再全是正圆剪影；
   *   ③ 三层叶色：外围阴色（随机深浅两档）/ 主冠本色 / 顶部受光提亮。
   * y0 用来直接指定台面高度；不传则 ctx.gy() 贴地形。 */
  function broadleaf(x, z, s, y0, kind){
    const y = (y0 === undefined) ? ctx.gy(x, z) : y0;
    if (!isFinite(y)) return;
    const key = kind || 'ginkgo';
    const F = FOLIAGE[key] || FOLIAGE.ginkgo;
    const h = 8.2 * s;
    // 树干：两段、段间微错位，避免一根塑料管的感觉
    const seg = [[.20, .34, .15, '#4a3a2c'], [.16, .34, .46, '#57452f']];
    for (const [r, hf, cf, cc] of seg)
      B.add('cyl', cc, [x + (rnd() - .5) * .06 * s, y + h * cf, z + (rnd() - .5) * .06 * s],
        [r * s, h * hf, r * s]);
    // 支干：2~3 根从半腰斜插进冠缘（顾问要求「枝干穿插」）
    const nBranch = 2 + (rnd() < .5 ? 1 : 0);
    for (let i = 0; i < nBranch; i++){
      const a = rnd() * 6.283;
      const q = new T.Quaternion().setFromEuler(
        new T.Euler(Math.cos(a) * .95, 0, -Math.sin(a) * .95));
      B.add('cyl', '#51412c',
        [x + Math.cos(a) * .40 * s, y + h * .58, z + Math.sin(a) * .40 * s],
        [.055 * s, 1.05 * s * (.85 + rnd() * .3), .055 * s], q);
    }
    // 主冠：一大团本色 + 顶部受光小团
    B.add('sph', F.mid, [x, y + h * .74, z], [2.05 * s, 1.70 * s, 2.05 * s]);
    // 外围：9 团压扁锥错落，阴色，深浅随机分两档——垂下来的叶簇把圆轮廓打碎
    const blobs = [
      [ 1.05, 0,   .78, 1.05], [-1.00, 0,   .80, 1.00], [ .20, 0,  1.15, .95],
      [-.90,  .06, -.55, .90], [ .95,  .05, -.50, .92], [ .05, -.10,-1.05, .88],
      [ .55,  .12,  .35, .80], [-.60,  .12, -.10, .78], [ .10,  .16, -.40, .70]
    ];
    for (const [dx, dy, dz, r] of blobs){
      const dk = rnd() < .5 ? F.dark : (() => {
        const c2 = _dark2(F.dark);
        (DARK2[key] = DARK2[key] || new Set()).add(c2);
        return c2;
      })();
      B.add('cone', dk, [x + dx * s, y + h * (dy + .66), z + dz * s],
        [r * .92 * s, r * 1.25 * s, r * .92 * s]);
    }
    // 顶部再压两小团本色，衔接受光顶，避免「一个亮点浮在头上」
    B.add('sph', F.mid,  [x + .30 * s, y + h * .90, z - .22 * s], [.62 * s, .50 * s, .62 * s]);
    B.add('sph', F.lite, [x, y + h * .96, z], [.72 * s, .54 * s, .72 * s]);
  }
  // 深一档的随机变体（在 dark 基础上再压一点，制造同树内的色相呼吸）
  const _d2 = new T.Color();
  function _dark2(hex){
    const c = _d2.set(hex), hsl = {};
    c.getHSL(hsl);
    return '#' + c.setHSL(hsl.h, Math.min(1, hsl.s * 1.06), Math.max(.04, hsl.l * .90)).getHexString();
  }

  /* 殿前（第三重台地西缘内侧）：原来种的是「一根杆叠圆锥」的老松，
   * 用户不要了。改种枝叶繁茂的阔叶大树，沿台缘列成一排，中轴留出望殿视线。 */
  const YARD_TOP = 13.0;
  const YARD_TREES = [
    [4.9, -5.4, 1.20, 'ginkgo'], [4.4, -9.2, 1.02, 'locust'], [5.0, -13.4, 1.26, 'maple'], [4.6, -17.6, 0.96, 'ginkgo'],
    [6.9, -7.4, 1.12, 'locust'],
    [4.8,  6.0, 0.98, 'ginkgo'], [4.4,  9.4, 1.22, 'locust'], [5.0,  12.4, 1.06, 'maple'],
    [6.8,  3.6, 1.18, 'ginkgo']
  ];
  for (const [x, z, s, k] of YARD_TREES)
    broadleaf(x + (rnd() - .5) * .9, z + (rnd() - .5) * 1.1, s, YARD_TOP, k);

  /* 大台阶两侧的坡地（用户圈的位置）：主轴台阶左右、挡土墙脚下的两条带子。
   * 顾问二轮 P0-2：原两列 18 棵等高 1.1~1.4 等距，成排像绿墙。
   * 抽稀到 12 棵，尺度差拉大（0.98~1.50），落点抖动 ±1m，冠间留出空隙；
   * 仍保持「坡道两侧浓荫」的用户要求。y 不传 → ctx.gy() 贴地形。 */
  const FOOT_TREES = [
    [1.5, -15.6, 1.50, 'ginkgo'], [1.9, -11.0, 1.04, 'ginkgo'],
    [1.6,  -8.6, 1.38, 'maple'],  [2.2,  -5.8, 1.10, 'maple'],
    [2.1, -14.0, 1.18, 'locust'], [1.8,  -6.4, 1.28, 'ginkgo'],
    [1.7,   6.6, 1.02, 'locust'], [1.9,   9.0, 1.46, 'ginkgo'],
    [1.6,  11.4, 1.16, 'maple'],  [1.5,  15.8, 1.32, 'locust'],
    [2.0,   9.6, 0.98, 'ginkgo'], [2.2,  13.2, 1.22, 'maple']
  ];
  for (const [x, z, s, k] of FOOT_TREES)
    broadleaf(x + (rnd() - .5) * 1.0, z + (rnd() - .5) * 1.2, s, undefined, k);

  // 第二档深绿：树生成时按品种收集成集合（rebroad 换季时按原名逐个重染）
  function redark() {
    for (const k of BROAD_KEYS) {
      const olds = DARK2[k];
      if (!olds || !olds.size) continue;
      const col = _dark2(FOLIAGE[k].dark);
      for (const oldKey of olds) {
        for (const kind of ['sph', 'cone']) {
          const m = B.materials.get(kind + '|' + oldKey);
          if (m) m.color.set(col);
        }
      }
      olds.clear(); olds.add(col);
    }
  }

  /* ---------- 时辰 ---------- */
  function apply(h){
    const { a, b, t } = keysAt(h);
    const SL = SEASON_LIGHT[season] || SEASON_LIGHT.summer;
    tmp.copy(a._bg).lerp(b._bg, t);
    if (SL.tint) tmp.lerp(tintC.set(SL.tint), SL.k);
    ctx.scene.background.copy(tmp);
    ctx.scene.fog.color.copy(tmp);
    /* 雾气统一压淡：原 fog 值(0.0040~0.0050)只作用于内置材质(建筑/地面/远山)，
       笔触树是自定义 shader 不参与 fog，于是只有树干净、其余全蒙一层灰白。
       用户反馈"除了树都像加了滤镜雾气"——整体乘 FOG_SCALE 降到约 1/3，
       保留各时辰/季节相对浓淡，建筑地面变清透，远山仍留一点空气透视。 */
    ctx.scene.fog.density = mixN(a.fog, b.fog, t) * SL.fog * FOG_SCALE;
    if (sun){
      sun.intensity = mixN(a.sun, b.sun, t) * SL.sun;
      sun.color.copy(tmp2.copy(a._sc).lerp(b._sc, t));
      if (SL.tint) sun.color.lerp(tintC.set(SL.warm), .22);
      sun.position.set(mixN(a.pos[0],b.pos[0],t), mixN(a.pos[1],b.pos[1],t), mixN(a.pos[2],b.pos[2],t));
    }
    if (hemi){
      hemi.intensity = mixN(a.hemi, b.hemi, t) * SL.hemi;
      hemi.color.copy(tmp3.copy(a._sky).lerp(b._sky, t));
      if (SL.tint) hemi.color.lerp(tintC.set(SL.tint), .16);
      hemi.groundColor.copy(tmp4.copy(a._grd).lerp(b._grd, t));
    }
    ctx.renderer.toneMappingExposure = mixN(a.exp, b.exp, t) * SL.exp;
    setLamp(mixN(a.lamp, b.lamp, t));
  }
  function setHour(h){
    ctx.state.hour = h;
    apply(h);
    const inp = document.querySelector('#w-time');
    if (inp) inp.value = String(h);
    const lab = document.querySelector('#w-hour');
    if (lab) lab.textContent = `${hourName(h)} · ${String(Math.floor(h)).padStart(2,'0')}:${String(Math.floor(h*60)%60).padStart(2,'0')}`;
  }
  function setSeason(s){
    season = s;
    document.querySelectorAll('#w-season [data-s]').forEach(x=>x.classList.toggle('w-on', x.dataset.s === s));
    for (const k of KINDS){
      const m1 = B.materials.get('sph|'+SUMMER[k]);
      const m2 = B.materials.get('cone|'+SUMMER[k]);
      if (m1) m1.color.set(PALETTE[s][k]);
      if (m2) m2.color.set(PALETTE[s][k]);
    }
    const mb = B.materials.get('sph|'+SUMMER.bamboo);
    if (mb) mb.color.set(PALETTE[s].bamboo);
    const snow = B.meshes.get('sph|'+SNOW);
    if (snow) snow.visible = (s === 'winter');
    rebroad();                       // broadleaf 三层叶色跟四季走
    redark();                        // 外围随机深档同步换季
    ctx.seasons?.setSeason(s);        // 地面、屋顶、树冠的季相覆盖层
    apply(ctx.state.hour);
    ctx.toast?.(SEASON_TOAST[s], 2400);
  }

  /* ---------- 顾问 P0：瓦顶青苔覆层 + 地面草丛三层化（batch.flush 之后补挂） ----------
   * 屋面清单复用 ctx.seasons.roofPts——那份逐三角面的点已经过室内剔除与抽稀，
   * 直接拿来做青苔覆层，不再重复扫几何。低档机减半。 */
  function postFlush(){
    const seasons = ctx.seasons;
    if (!seasons || !seasons.roofPts) return;
    const low = ctx.renderer.getPixelRatio() < 1.2;
    const step = low ? 2 : 1;
    // 1) 瓦顶青苔：顾问二轮改为 5%~10% 密度、沿檐口与脊缝成块，不再均匀撒满。
    //    roofPts 里 high 大的偏远处少放，檐口（high 2.6~6）多放。
    const MOSS = ['#3d4a38', '#46523c', '#35402f'];
    let mossN = 0;
    for (let i = 0; i < seasons.roofPts.length; i += step){
      const p = seasons.roofPts[i];
      const eave = p.high <= 6.2;                    // 檐口带
      if (rnd() > (eave ? .09 : .025)) continue;
      const c = MOSS[(rnd() * MOSS.length) | 0];
      B.add('sph', c, [p.x + (rnd() - .5) * .45, p.y + .035, p.z + (rnd() - .5) * .45],
        [R(.28, .58), R(.045, .08), R(.28, .58)]);
      mossN++;
    }
    // 2) 草地三层：在春季层（唯一允许长草花的不硬地=一进院南草坪）播高/中两档
    //    矮草已由季节层负责，这里补「高草 5% + 中草 15%」打破平铺感。
    const GC = ['#5a7a4a', '#6a8a58', '#4c6a3e'];
    let grassN = 0;
    for (let i = 0; i < 120; i++){
      const cx = R(-51.5, -18.6), cz = R(-29.2, -3.1);
      const y = ctx.ground(cx, cz);
      if (!isFinite(y)) continue;
      if (Math.abs(cz) < 4.2 && cx > -50) continue;   // 二轮P1：主通道不撒草
      const tall = rnd() < .05;
      B.add('cone', GC[(rnd() * GC.length) | 0], [cx, y + (tall ? .26 : .14), cz],
        [R(.05, .08), tall ? R(.44, .6) : R(.24, .34), R(.05, .08)],
        q((rnd() - .5) * .3, 0, (rnd() - .5) * .3));
      grassN++;
    }
    // 3) 二轮P0-1 / 三轮P0-2：关键视廊清障——把堵住殿门/入口视线的 wonder 实例
    //    平移到走廊外侧。视廊定义与冠幅判定见模块级 CORRIDORS / corridorHit。
    let moved = 0;
    const mp = new T.Vector3(), mq = new T.Quaternion(), ms = new T.Vector3();
    const mm = new T.Matrix4();
    ctx.root.traverse(o => {
      if (!o.isInstancedMesh || !o.userData.wonderBatch) return;
      const kind = o.geometry.type;
      if (kind !== 'ConeGeometry' && kind !== 'IcosahedronGeometry' && kind !== 'CylinderGeometry') return;
      let touched = false;
      for (let i = 0; i < o.count; i++){
        o.getMatrixAt(i, mm);
        mm.decompose(mp, mq, ms);
        // 三轮P0-2：命中判定要算上冠幅——叶团/干本身有半径，
        // 只移圆心会让"贴着走廊边"的树冠仍探进视廊。
        const radius = Math.max(ms.x, ms.z);
        const s = corridorHit(mp.x, mp.z, radius);
        if (!s) continue;
        // 移到走廊半宽 + 本体半径 + 余量之外（就近挑一边）
        const n = new T.Vector3(-s.dz, 0, s.dx).normalize();
        const side = ((mp.x - s.ax) * n.x + (mp.z - s.az) * n.z) >= 0 ? 1 : -1;
        const dist = s.hw + radius + .6 + rnd() * .8;
        const t0 = Math.max(0, Math.min(1, ((mp.x - s.ax) * s.dx + (mp.z - s.az) * s.dz) / s.len2));
        const px = s.ax + s.dx * t0, pz = s.az + s.dz * t0;
        mp.x = px + n.x * side * dist;
        mp.z = pz + n.z * side * dist;
        mm.compose(mp, mq, ms);
        o.setMatrixAt(i, mm);
        touched = true; moved++;
      }
      if (touched) o.instanceMatrix.needsUpdate = true;
    });
    if (mossN || grassN || moved)
      console.info(`[山寺志] 青苔 ${mossN} 团 · 补草 ${grassN} 丛 · 视廊让位 ${moved} 件`);
  }

  /* ---------- 每帧：自动时辰、火焰摇曳、飘落物 ---------- */
  const DAY_MS = 210000;           // 约三分半走完一天，肉眼可见光色变化
  let snowInit = false;
  function tick(now, dt){
    if (!snowInit){                // batch 在入口最后才 flush，这里等第一帧再收雪盖
      const s = B.meshes.get('sph|'+SNOW);
      if (s){ s.visible = (season === 'winter'); snowInit = true; }
    }
    if (now > (ctx.state.manualUntil || 0)){
      let h = ctx.state.hour + dt*24/(DAY_MS/1000);
      if (h >= 24) h -= 24;
      ctx.state.hour = h;
      const inp = document.querySelector('#w-time');
      if (inp) inp.value = String(h);
      const lab = document.querySelector('#w-hour');
      if (lab) lab.textContent = `${hourName(h)} · ${String(Math.floor(h)).padStart(2,'0')}:${String(Math.floor(h*60)%60).padStart(2,'0')}`;
    }
    apply(ctx.state.hour);

    if (lampLevel > .12){
      for (const L of lamps){
        const f = .86 + Math.sin(now*.0055+L.ph)*.12 + Math.sin(now*.012+L.ph*2)*.06;
        L.flame.scale.set(f, .90+Math.sin(now*.009+L.ph)*.16, f);
        L.sp.scale.set(.86*f, .98*f, 1);
      }
    }
    const cfg = PARTICLE[season];
    const p = pGeo.attributes.position.array;
    for (let i=0;i<N;i++){
      const j = i*3;
      p[j+1] -= cfg.speed*dt;
      p[j]   += Math.sin(now*.0007+i)*cfg.drift*dt;
      if (cfg.speed < 0){ if (p[j+1] > 28) p[j+1] = 1+rnd()*6; }
      else if (p[j+1] < -1){ p[j+1] = 22+rnd()*8; p[j] = (rnd()-.5)*90; p[j+2] = (rnd()-.5)*90; }
    }
    pGeo.attributes.position.needsUpdate = true;
    pts.position.set(ctx.camera.position.x, Math.min(ctx.camera.position.y*.35, 8), ctx.camera.position.z);
    pMat.color.set(cfg.color); pMat.size = cfg.size;
    // 入夜把飘落物压淡，别让满屏黄点抢了烛火
    const nightFade = lampLevel > .5 ? .30 : 1;
    pMat.opacity = cfg.opacity * nightFade * (season==='summer' ? .55+.45*Math.abs(Math.sin(now*.0016)) : 1);
  }
  ctx.frames.push(tick);
  apply(ctx.state.hour);

  return {
    setHour, setSeason, postFlush,
    get lamp(){ return lampLevel; },
    get season(){ return season; },
    restore(){                       // 调试用：把光照还给原程序
      ctx.scene.background.copy(bg0);
      ctx.scene.fog.density = fog0;
      ctx.renderer.toneMappingExposure = exp0;
      if(sun){sun.intensity=2.15;sun.color.set('#fff0d7');sun.position.set(-56,63,-46);}
      if(hemi){hemi.intensity=1.85;hemi.color.set('#d4e5eb');hemi.groundColor.set('#8a7252');}
      setLamp(0);
    }
  };
}
