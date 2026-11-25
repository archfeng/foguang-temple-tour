/* 场景细部：古树、猫、鸽子，以及东大殿的檐口、门钉、直棂窗、勾栏、鸱尾、风铎、匾额。
 *
 * 依据：东大殿面阔七间、进深四间，单檐四阿顶，七铺作双杪双下昂；
 * 前檐五间装板门、两梢间为直棂窗，台明四周设勾栏，檐角悬风铎，正脊两端置鸱尾。
 * 这些在此前场景数据里只有体量，这里按实测尺度补出来。
 *
 * 坐标与场景一致：x 东西、y 南北、z 高度；three.js 里是 (x, z, -y)。
 */
import * as sfx from './ritual-audio.js?v=20261112h';
import {surface} from './surfaces.js?v=20261112h';
import {weathered} from './wonder/weathered.js?v=20261116bk';

import {Q} from './quality.js?v=20261112h';

const T = window.THREE;
const V = (x, y, z) => new T.Vector3(x, z, -y);
const yAxis = new T.Vector3(0, 1, 0);
const mat = (c, o = {}) => new T.MeshStandardMaterial({ color: c, roughness: .94, ...o });

const C = {
  wood: '#6b3a24', leaf: '#8a5433', dark: '#251a12',
  stone: '#a3947c', stoneDark: '#8b7d68', wall: '#c2b096',
  gold: '#a98446', tile: '#4a5052', bronze: '#7b5f38'
};

/* ---------- 小批量实例化：把成百个小构件并成几个 draw call ---------- */
function batcher() {
  const piles = new Map(), mats = new Map();
  return {
    put(type, color, pos, scale, quat = new T.Quaternion()) {
      const key = type + color;
      if (!piles.has(key)) piles.set(key, { type, color, items: [] });
      piles.get(key).items.push(new T.Matrix4().compose(pos, quat, scale));
    },
    rod(a, b, r, color) {
      const d = b.clone().sub(a);
      this.put('cyl', color, a.clone().lerp(b, .5), new T.Vector3(r, Math.max(.001, d.length()), r),
        new T.Quaternion().setFromUnitVectors(yAxis, d.clone().normalize()));
    },
    // 模型坐标的轴对齐盒：c=(x,y,z)，尺寸 w 沿 x、d 沿 y、h 沿 z
    box(color, cx, cy, cz, w, d, h) {
      this.put('cube', color, V(cx, cy, cz), new T.Vector3(w, h, d));
    },
    flush(scene) {
      // 叶团带起伏与顶点明暗，才不像一颗颗纯色球。
      // 大堆（上千实例的外围林带）用低模：远看没有差别，三角形省下上百万。
      const makeCanopy = (detail) => {
        const canopy = new T.IcosahedronGeometry(1, detail);
        const p = canopy.attributes.position, cols = [];
        for (let i = 0; i < p.count; i++) {
          const x = p.getX(i), y = p.getY(i), z = p.getZ(i);
          const d = 1 + .17 * Math.sin(6.3 * x + 2.7 * z) * Math.cos(5.1 * y - 1.9 * x);
          p.setXYZ(i, x * d, y * d, z * d);
          const t = .70 + .32 * Math.sin(9.7 * x + 4.3 * y) * Math.sin(7.1 * z + 2.2 * y);
          cols.push(t, t, t * .94);
        }
        canopy.computeVertexNormals();
        canopy.setAttribute('color', new T.Float32BufferAttribute(cols, 3));
        return canopy;
      };
      const geo = {
        cube: new T.BoxGeometry(1, 1, 1),
        cyl: new T.CylinderGeometry(1, 1, 1, Q.cylSeg),
        ball: new T.IcosahedronGeometry(1, Q.leafDetail)
      };
      const cache2 = new Map();
      const geoFor = (type, n) => {
        if (n <= 1200 || (type !== 'canopy' && type !== 'ball')) return geo[type] || geo.cube;
        const k = type + 'Lo';
        if (!cache2.has(k)) cache2.set(k, type === 'canopy' ? makeCanopy(0) : new T.IcosahedronGeometry(1, 0));
        return cache2.get(k);
      };
      if (Q.leafDetail) geo.canopy = makeCanopy(Q.leafDetail);
      else geo.canopy = geo.ball;
      for (const { type, color, items } of piles.values()) {
        const key = type + color;
        if (!mats.has(key)) {
          const m = mat(color);
          if (type === 'canopy') {
            m.vertexColors = true;
            if (['#2c4330', '#3d543a', '#4c6042', '#334a37'].includes(color)) weathered(m, 'needles');
          } else {
            // 木、石各用一张程序生成的无缝贴图，近看才不是一块纯色
            const wood = ['#4a3f30', '#4f4433', '#55482f', '#5b4e34', '#5d5137', '#5a4d33',
              '#54472f', '#4d432f', '#6b3a24', '#8a5433', '#251a12', '#a98446'].includes(color);
            m.map = surface(wood ? 'wood' : 'stone');
            m.bumpMap = m.map;
            m.bumpScale = wood ? .02 : .03;
            if (['#4a3f30', '#4f4433', '#55482f', '#5b4e34', '#5d5137', '#5a4d33',
              '#54472f', '#4d432f'].includes(color)) weathered(m, 'bark');
            else if (color === C.tile) weathered(m, 'tile');
            else if ([C.wood, C.leaf, C.dark].includes(color)) weathered(m, 'wood');
            else if ([C.stone, C.stoneDark, C.wall].includes(color)) weathered(m, 'stone');
          }
          mats.set(key, m);
        }
        const m = new T.InstancedMesh(geoFor(type, items.length), mats.get(key), items.length);
        m.userData.plantInstances = type === 'canopy';
        items.forEach((a, i) => m.setMatrixAt(i, a));
        // 树冠数量多、投影几乎看不出差别，不参与阴影，省一遍几何
        m.castShadow = type !== 'ball' && type !== 'canopy';
        m.receiveShadow = true;
        scene.add(m);
      }
    }
  };
}

/* ---------- 匾额 ---------- */
const plaqueCache = new Map();
function plaqueTexture(text, sub) {
  const key = text + '|' + sub;
  if (plaqueCache.has(key)) return plaqueCache.get(key);
  const w = 512, h = 190;
  const c = document.createElement('canvas'); c.width = w; c.height = h;
  const x = c.getContext('2d');
  const bg = x.createLinearGradient(0, 0, 0, h);
  bg.addColorStop(0, '#3a2413'); bg.addColorStop(.55, '#2a1809'); bg.addColorStop(1, '#1d1006');
  x.fillStyle = bg; x.fillRect(0, 0, w, h);
  x.strokeStyle = '#b08b4e'; x.lineWidth = 9; x.strokeRect(10, 10, w - 20, h - 20);
  x.strokeStyle = '#71512a'; x.lineWidth = 3; x.strokeRect(24, 24, w - 48, h - 48);
  x.fillStyle = '#dcb872';
  x.font = '600 92px "STSong","SimSun","Songti SC",serif';
  x.textAlign = 'center'; x.textBaseline = 'middle';
  const gap = 104, start = w / 2 - gap * (text.length - 1) / 2;
  [...text].forEach((ch, i) => x.fillText(ch, start + gap * i, sub ? h / 2 - 16 : h / 2 + 4));
  if (sub) {
    x.font = '24px "STSong","SimSun",serif';
    x.fillStyle = '#b08b4e';
    x.fillText(sub, w / 2, h - 34);
  }
  const t = new T.CanvasTexture(c);
  t.colorSpace = T.SRGBColorSpace; t.anisotropy = 4;
  plaqueCache.set(key, t);
  return t;
}

/* ---------- 猫 ---------- */
const FURS = [
  { body: '#c0793f', dark: '#8e5326', name: '橘' },
  { body: '#3c3733', grey: '#6f675f', name: '狸花' },
  { body: '#e8e2d4', dark: '#2c2825', name: '三花' },
  { body: '#20211f', belly: '#e6e0d2', name: '乌云' }
];
export function makeCat(fur, kind) {
  const g = new T.Group();
  const body = mat(fur.body, { roughness: .96 });
  const dark = mat(fur.dark || fur.body, { roughness: .96 });
  const light = mat(fur.belly || '#efe8d8', { roughness: .96 });
  const sph = new T.SphereGeometry(1, 14, 10);
  const add = (m, geo, x, y, z, sx, sy, sz) => {
    const o = new T.Mesh(geo, m); o.position.set(x, y, z); o.scale.set(sx, sy, sz);
    o.castShadow = true; g.add(o); return o;
  };
  // 蹲坐的猫：胸高臀低，前腿支起
  add(body, sph, 0, .17, -.02, .14, .155, .21);
  add(body, sph, 0, .19, .105, .125, .135, .13);
  add(light, sph, 0, .13, .15, .075, .085, .07);
  const head = add(body, sph, 0, .325, .19, .105, .098, .095);
  // 耳朵
  for (const s of [-1, 1]) {
    const ear = new T.Mesh(new T.ConeGeometry(.042, .085, 4), dark);
    ear.position.set(s * .058, .398, .185); ear.rotation.z = s * .14; ear.castShadow = true; g.add(ear);
  }
  // 眼
  for (const s of [-1, 1]) {
    const eye = new T.Mesh(new T.SphereGeometry(.016, 8, 6), new T.MeshStandardMaterial({ color: '#c9d06a', roughness: .5 }));
    eye.position.set(s * .042, .335, .272); g.add(eye);
  }
  const nose = mat('#86574e');
  const pupil = mat('#25231f');
  for (const side of [-1,1]){
    add(light,sph,side*.034,.297,.268,.040,.026,.027);
    add(pupil,sph,side*.042,.336,.286,.006,.014,.004);
    add(nose,sph,side*.058,.413,.204,.023,.032,.010);
    for(let i=0;i<3;i++){
      const whisker=new T.Mesh(new T.CylinderGeometry(.0015,.0015,.075,5),light);
      whisker.position.set(side*.073,.295+i*.008,.285);
      whisker.rotation.z=side*(1.34+i*.22);
      g.add(whisker);
    }
  }
  add(nose,sph,0,.312,.293,.017,.010,.009);
  // 尾：一段曲线，单独成组好摆动
  const tail = new T.Group();
  const pts = [];
  for (let i = 0; i <= 7; i++) {
    const t = i / 7;
    pts.push(new T.Vector3(.13 * Math.sin(t * 1.4), .09 + .16 * t, -.16 - .14 * t + .05 * Math.sin(t * 3)));
  }
  const tailMesh = new T.Mesh(new T.TubeGeometry(new T.CatmullRomCurve3(pts), 14, .028, 6, false), body);
  tailMesh.castShadow = true; tail.add(tailMesh); g.add(tail);
  // 前腿
  for (const s of [-1, 1]) add(body, sph, s * .062, .075, .135, .035, .085, .038);
  // 围脖（三花、乌云的颜色变化）
  if (kind === 'patch') {
    add(dark, sph, .03, .21, .04, .09, .08, .1);
    add(dark, sph, -.02, .28, .2, .05, .045, .045);
  }
  return { group: g, tail, head, body };
}

/* ---------- 鸽子 ---------- */
function makeDove() {
  const g = new T.Group();
  const bodyM = mat('#cfcabd', { roughness: .95 });
  const wingM = mat('#a9a49a', { roughness: .95 });
  const headM = mat('#8f9aa1', { roughness: .9, metalness: .12 });
  const sph = new T.SphereGeometry(1, 12, 8);
  const add = (m, x, y, z, sx, sy, sz) => {
    const o = new T.Mesh(sph, m); o.position.set(x, y, z); o.scale.set(sx, sy, sz);
    o.castShadow = true; g.add(o); return o;
  };
  const body = add(bodyM, 0, .075, 0, .075, .068, .105);
  const head = add(headM, 0, .125, .085, .038, .038, .042);
  const beak = new T.Mesh(new T.ConeGeometry(.011, .03, 5), mat('#c9a05a'));
  beak.position.set(0, .122, .126); beak.rotation.x = Math.PI / 2; g.add(beak);
  const tail = add(wingM, 0, .082, -.11, .052, .016, .05);
  tail.rotation.x = -.18;
  const wings = [-1, 1].map(s => {
    const w = new T.Mesh(sph, wingM);
    w.position.set(s * .052, .086, -.005); w.scale.set(.026, .012, .075);
    w.castShadow = true; g.add(w); return w;
  });
  return { group: g, head, tail, wings, body };
}

/* ---------- 主构建 ---------- */
export function buildDetails(scene, opts = {}) {
  const ground = opts.ground || (() => 0);
  const camera = opts.camera;
  const B = batcher();
  let seed = 20261105;
  const rand = () => ((seed = (Math.imul(1664525, seed) + 1013904223) >>> 0) / 4294967296);

  /* ===== 一、东大殿细部 ===== */
  // 台明：11.23→32.77，南北 ±19.23，面高 13.8
  const TERR = { x0: 11.23, x1: 32.77, y0: -19.23, y1: 19.23, z: 13.8 };
  const eaves = 20.3;

  // 勾栏：望柱 + 寻杖 + 盆唇 + 地栿，西面留出踏步缺
  const railZ = 13.92, topZ = 14.88, midZ = 14.42;
  const post = (x, y) => {
    B.box(C.stone, x, y, railZ + .5, .15, .15, 1.0);
    B.box(C.stoneDark, x, y, railZ + 1.02, .19, .19, .09);   // 柱头
    B.box(C.stone, x, y, railZ + 1.10, .085, .085, .10);      // 望柱头小柱
  };
  for (let y = TERR.y0 + .6; y <= TERR.y1 - .6; y += 2.15) {
    if (Math.abs(y) < 2.6) continue;                          // 踏步口
    post(TERR.x0 + .02, y);
  }
  // 寻杖与盆唇，同样避开踏步口
  const spans = [[TERR.y0 + .2, -2.6], [2.6, TERR.y1 - .2]];
  for (const [a, b] of spans) {
    B.box(C.wood, TERR.x0 + .02, (a + b) / 2, topZ, .10, b - a, .10);
    B.box(C.wood, TERR.x0 + .02, (a + b) / 2, midZ, .08, b - a, .07);
    B.box(C.stoneDark, TERR.x0 + .02, (a + b) / 2, railZ, .13, b - a, .17);
    // 华板间的蜀柱，勾栏才有节奏
    for (let y = a + .55; y < b - .4; y += .72) {
      B.box(C.wood, TERR.x0 + .02, y, (railZ + midZ) / 2 + .02, .055, .055, midZ - railZ + .04);
    }
  }
  // 南北两端向西伸出的一小段，收住转角
  for (const s of [-1, 1]) {
    const y = s * (TERR.y1 - .3);
    post(TERR.x0 + .02, y);
    B.box(C.wood, TERR.x0 + 1.1, y, topZ, 2.1, .10, .10);
    B.box(C.stoneDark, TERR.x0 + 1.1, y, railZ, 2.1, .13, .17);
  }

  /* ===== 一·b、三进高台西缘石栏 =====
   * 高台面 13.0，西缘直落十一米到二进院，原先只是一道裸边——站在边上没有拦挡。
   * 按宋《营造法式》石勾栏的做法补：地栿压边、望柱分间、每间一块雕花栏板，
   * 阶口两侧立抱鼓石。栏杆整体退进 0.28 米，让出压面石，也让檐下台阶好走。 */
  const ST = { body: '#aba089', lite: '#bdb29d', dark: '#968b75' };
  const Q_DIA = new T.Quaternion().setFromAxisAngle(new T.Vector3(1, 0, 0), Math.PI / 4);
  const Q_DRUM = new T.Quaternion().setFromUnitVectors(new T.Vector3(0, 1, 0), new T.Vector3(1, 0, 0));

  function stoneRail(x, zTop, yA, yB) {
    const W = .17;        // 望柱方径
    const DILI = .15;     // 地栿高
    const POST = .86;     // 柱身高
    const CAP = .07;      // 柱头
    const CLOUD = .085;   // 云头
    const len = yB - yA;
    const n = Math.max(1, Math.round(len / 1.78));
    const step = len / n;
    B.box(ST.dark, x, (yA + yB) / 2, zTop + DILI / 2, .26, len, DILI);          // 地栿通长
    for (let i = 0; i <= n; i++) {
      const y = yA + step * i;
      B.box(ST.body, x, y, zTop + DILI + POST / 2, W, W, POST);                 // 柱身
      B.box(ST.lite, x, y, zTop + DILI + POST - .05, W + .025, W + .025, .10);  // 束腰
      B.box(ST.dark, x, y, zTop + DILI + POST + CAP / 2, .215, .215, CAP);      // 柱头
      B.box(ST.lite, x, y, zTop + DILI + POST + CAP + CLOUD / 2, .27, .245, CLOUD); // 云头
      B.put('ball', ST.dark, V(x, y, zTop + DILI + POST + CAP + CLOUD + .06),
        new T.Vector3(.072, .062, .072));                                       // 宝珠
      if (i === n) break;
      const y0 = y + W / 2 + .03, y1 = y + step - W / 2 - .03;
      const yc = (y0 + y1) / 2, bw = y1 - y0;
      B.box(ST.body, x, yc, zTop + .465, .095, bw, .63);                        // 栏板
      B.box(ST.dark, x, yc, zTop + .19, .125, bw, .07);                         // 盆唇
      B.rod(V(x, y0, zTop + .845), V(x, y1, zTop + .845), .052, ST.lite);       // 寻杖
      for (const u of [-1, 1]) {
        const bx = x + u * .052;
        // 边梃：四边压一道窄框，整块石板才像「雕」出来的，而不是一块光面混凝土
        B.box(ST.lite, bx, yc, zTop + .745, .022, bw, .055);
        B.box(ST.lite, bx, yc, zTop + .19, .022, bw, .05);
        B.box(ST.lite, bx, y0 + .03, zTop + .465, .022, .055, .55);
        B.box(ST.lite, bx, y1 - .03, zTop + .465, .022, .055, .55);
        B.put('cube', ST.lite, V(x + u * .058, yc, zTop + .465),
          new T.Vector3(.03, .27, .27), Q_DIA);                                 // 菱形开光
        B.rod(V(x + u * .056, yc, zTop + .465), V(x + u * .098, yc, zTop + .465), .062, ST.body); // 团花
        for (const t of [-1, 1])
          B.put('cube', ST.lite, V(x + u * .056, yc + t * .155, zTop + .465),
            new T.Vector3(.026, .085, .085), Q_DIA);                            // 上下角花
      }
    }
  }
  // 阶口两侧的抱鼓石：鼓面朝西，正好收住栏杆头
  function drumStone(x, zTop, y) {
    B.box(ST.dark, x, y, zTop + .05, .46, .50, .10);
    B.box(ST.body, x, y, zTop + .18, .36, .42, .16);
    B.put('cyl', ST.lite, V(x, y, zTop + .36), new T.Vector3(.17, .30, .17), Q_DRUM);
    B.put('ball', ST.body, V(x, y, zTop + .36), new T.Vector3(.172, .172, .172));
  }
  // 西缘从 13.0 一路铺到 30.0，阶口（主轴台阶 ±2.4）留缺
  stoneRail(3.28, 13.0, -29.0, -2.9);
  stoneRail(3.28, 13.0, 2.9, 29.0);
  drumStone(3.28, 13.0, -2.9);
  drumStone(3.28, 13.0, 2.9);

  // 鸱尾：正脊两端，向内卷的鱼尾（按侧面轮廓挤出）
  for (const s of [-1, 1]) {
    const u = s;                       // 内侧方向，两侧对卷
    const sh = new T.Shape();
    sh.moveTo(-.62 * u, 0);
    sh.lineTo(.62 * u, 0);
    sh.lineTo(.58 * u, .40);
    sh.quadraticCurveTo(.72 * u, .92, .34 * u, 1.34);
    sh.quadraticCurveTo(.16 * u, 1.56, .12 * u, 1.74);
    sh.quadraticCurveTo(-.08 * u, 1.52, -.02 * u, 1.28);
    sh.quadraticCurveTo(.10 * u, .92, -.16 * u, .74);
    sh.quadraticCurveTo(-.48 * u, .58, -.62 * u, .40);
    sh.closePath();
    const geo = new T.ExtrudeGeometry(sh, { depth: .17, bevelEnabled: false, curveSegments: 8 });
    geo.translate(0, 0, -.085);
    geo.rotateY(Math.PI / 2);          // 轮廓立起来，厚度朝东西
    const m = new T.Mesh(geo, weathered(mat(C.tile),'tile'));
    m.position.set(22, 24.86, s * -9.79);
    m.castShadow = true; m.receiveShadow = true;
    scene.add(m);
    // 底座一圈叠涩
    B.box(C.tile, 22, s * 9.79, 24.90, .46, 1.34, .10);
  }

  // 檐口连檐与飞椽头
  for (const s of [-1, 1]) {
    B.box(C.wood, 10.16, 0, eaves - .02, .14, 39.6, .17);
    B.box(C.wood, 33.84, 0, eaves - .02, .14, 39.6, .17);
  }
  for (let i = 0; i < 34; i++) {
    const y = -19.2 + i * 1.16;
    for (const x of [10.2, 33.78]) B.box(C.leaf, x, y, eaves + .14, .09, .12, .22);
  }

  // 前檐：明间与两次间装板门，两梢间为直棂窗。
  // 板门外皮在 x=13.10，所有贴面构件都要挂在它西侧，否则会被门板挡掉。
  const face = 13.10;
  // 门扇按场景数据的分扇走：每间四扇、扇宽 1.07，柱位落在扇与扇之间的空档里。
  // 明间正中两扇要留出来当进殿通道（缺口由下面那对敞开门补上）。
  const doorStarts = [-7.28, -6.17, -5.07, -3.96, -2.21, -1.11, 0, 1.11, 2.85, 3.96, 5.07, 6.17];
  for (const start of doorStarts) {
    const cy = start + .535;
    if (Math.abs(cy) < 2.25) continue;
    // 门钉：每扇四列六行，钉头比门板凸出一点。
    // V(x,y,z) = (x, z, -y)：模型 y 是横向、模型 z 才是高度。
    // 因此第二个参数必须由列 c 控制横向、第三个参数由行 r 控制高度；
    // 两者写反会把整排钉头压到台基以下，并甩到殿外 z=-14~-17 的半空里。
    for (let r = 0; r < 6; r++) for (let c = 0; c < 4; c++) {
      B.put('ball', C.gold, V(face - .046, cy - .36 + c * .24, 14.42 + r * .62),
        new T.Vector3(.037, .037, .026));
    }
    // 立颊：每扇一道细缝，门才分得开
    B.box(C.dark, face - .025, start + .012, 16.2, .03, .05, 4.3);
  }
  // 明间两侧的门框立颊：门洞敞开之后，边要立得住
  for (const s of [-1, 1]) {
    const yc = s < 0 ? -2.20 : 2.17;
    B.box(C.wood, face - .05, yc, 16.20, .13, .17, 4.42);
    B.box(C.wood, face - .05, yc, 16.20, .13, .26, .12);   // 上下两头略出头
  }
  // 门簪：每间四枚，钉在门额上
  for (const bay of [-5.62, 0, 5.62]) {
    for (const off of [-.78, -.26, .26, .78]) {
      B.box(C.wood, face - .06, bay + off, 18.19, .09, .11, .13);
    }
  }
  // 门槛：按间通长铺，门槛才不会在门洞处断掉
  for (const [a, b] of [[-7.28, -3.96], [-2.21, 2.18], [2.85, 6.17]]) {
    B.box(C.stoneDark, face - .04, (a + b) / 2, 13.92, .24, b - a, .16);
  }

  // 明间正中那对门是开着的：门轴立在两侧门边，向内转到 75°。
  // 之前这两扇直接删掉，正面看就是个缺口，门钉还悬在半空。
  {
    const leafMat = new T.MeshStandardMaterial({ color: '#764a35', roughness: .92 });
    leafMat.map = surface('wood');
    leafMat.bumpMap = leafMat.map; leafMat.bumpScale = .018;
    const pinGeo = new T.SphereGeometry(.036, 8, 6);
    const pinMat = new T.MeshStandardMaterial({ color: C.gold, roughness: .48, metalness: .5 });
    // 明间四扇全敞开：两侧柱边各折起两扇，贴着柱子向殿内，门洞就是一整跨
    for (const s of [-1, 1]) {
      const hingeN = s < 0 ? -2.19 : 2.16;      // 合页落在明间柱位
      const g = new T.Group();
      g.position.set(face - .06, 16.21, -hingeN);
      g.rotation.y = s * 1.37;                  // 约 78°，门扇折进殿里
      for (let k = 0; k < 2; k++) {
        const leaf = new T.Mesh(new T.BoxGeometry(.13, 4.45, 1.07), leafMat);
        leaf.position.z = s * (.535 + k * 1.072);
        leaf.castShadow = true; leaf.receiveShadow = true;
        g.add(leaf);
        for (let r = 0; r < 6; r++) for (let c = 0; c < 4; c++) {
          const pin = new T.Mesh(pinGeo, pinMat);
          pin.position.set(-.078, -1.66 + r * .64, -.36 + c * .24);
          leaf.add(pin);
        }
      }
      scene.add(g);
    }
  }

  // 直棂窗（破子棂）：两梢间。窗上到门额、窗下到门槛都要拿板填实，
  // 否则从正面能看见殿里的黑洞。
  for (const s of [-1, 1]) {
    const yc = s * 10.1, halfW = 2.2;
    const z0 = 15.02, z1 = 17.62;
    const wide = halfW * 2 + .66;
    B.box(C.leaf, face - .045, yc, (13.98 + z0) / 2, .09, wide, z0 - 13.98);
    B.box(C.leaf, face - .045, yc, (z1 + 18.44) / 2, .09, wide, 18.44 - z1);
    // 障日板：直棂窗后头挡一层板，不然从外头能一眼看穿到佛坛，窗就不像窗了
    B.box('#402f22', face + .30, yc, (z0 + z1) / 2, .06, wide - .10, z1 - z0 - .06);
    B.box(C.wood, face - .05, yc, z1 + .06, .12, wide, .14);
    B.box(C.wood, face - .05, yc, z0 - .06, .12, wide, .14);
    for (const s2 of [-1, 1]) B.box(C.wood, face - .05, yc + s2 * (halfW + .10), (z0 + z1) / 2, .12, .16, z1 - z0 + .2);
    // 破子棂：断面三角形的竖棂，这里用细方棂表现
    const n = 21;
    for (let i = 0; i < n; i++) {
      const y = yc - halfW + .16 + i * (halfW * 2 - .32) / (n - 1);
      B.box(C.leaf, face - .06, y, (z0 + z1) / 2, .08, .055, z1 - z0 - .12);
    }
  }

  // 匾额：明间门额之上，挂在门簪前面
  {
    const w = 1.92, h = .76;
    const m = new T.Mesh(new T.PlaneGeometry(w, h),
      new T.MeshStandardMaterial({ map: plaqueTexture('佛光寺', '唐 大中十一年'), roughness: .6, metalness: .06 }));
    m.position.set(face - .16, 18.16, 0);
    m.rotation.y = -Math.PI / 2;
    scene.add(m);
    // 匾框
    B.box(C.wood, face - .14, 0, 18.16 + h / 2, .10, w + .18, .07);
    B.box(C.wood, face - .14, 0, 18.16 - h / 2, .10, w + .18, .07);
    for (const s of [-1, 1]) B.box(C.wood, face - .14, s * (w / 2 + .06), 18.16, .10, .12, h + .14);
  }

  // 檐角风铎（四角）
  const chimes = [];
  for (const x of [10.35, 33.6]) for (const y of [-19.55, 19.55]) {
    const g = new T.Group();
    g.userData.keep = true;                 // 风铎会摆，别被静态合并吃掉
    g.position.copy(V(x, y, eaves - .1));
    const chain = new T.Mesh(new T.CylinderGeometry(.012, .012, .42, 5), mat(C.bronze, { metalness: .5, roughness: .5 }));
    chain.position.y = -.21; g.add(chain);
    const bell = new T.Mesh(new T.ConeGeometry(.085, .17, 8, 1, true), mat(C.bronze, { metalness: .55, roughness: .45, side: T.DoubleSide }));
    bell.position.y = -.5; g.add(bell);
    const clap = new T.Mesh(new T.SphereGeometry(.022, 8, 6), mat('#5a4526', { metalness: .4 }));
    clap.position.y = -.56; g.add(clap);
    scene.add(g);
    chimes.push({ group: g, phase: rand() * 6.28 });
  }

  /* ===== 二、古树与补植 ===== */
  const leafPalette = ['#4c6a3e', '#5c7a49', '#6d854f', '#405738', '#7c8f5c'];
  const ginkgoPal = ['#8f8f45', '#a8a44f', '#c2b45e', '#7f8443'];
  const pinePal = ['#2c4330', '#3d543a', '#4c6042', '#334a37'];

  // 古树：主干粗、盘根、三级分枝、冠大而密
  function ancientTree(x, y, h, kind) {
    // 定根走实际地面 ground(x, y)（与庭树补植同一约定）。
    // 早前误写成 ground(x, -y)，西侧勾栏外的古树被钉到对岸坐标，
    // 整树悬在第三层台地上空，落叶飘一片在台面上。
    const z = ground(x, y);
    const pal = kind === 'ginkgo' ? ginkgoPal : kind === 'pine' ? pinePal : leafPalette;
    const lean = (rand() - .5) * h * .10;
    const trunk = t => V(x + lean * t * t, y + Math.sin(t * 2.4) * h * .03, z + h * t);
    const rBase = h * .042;

    // 盘根：几道粗根扒在地上
    for (let i = 0; i < 8; i++) {
      const a = i / 8 * 6.283 + rand() * .4;
      const r = h * (.11 + rand() * .07);
      B.rod(V(x + Math.cos(a) * .30, y + Math.sin(a) * .30, z - .03),
        V(x + Math.cos(a) * r, y + Math.sin(a) * r, z - .16), .055 + rand() * .05, '#4a3f30');
    }
    // 主干：八段连续收分，看不出接茬
    const segs = 8;
    for (let k = 0; k < segs; k++) {
      B.rod(trunk(k / segs), trunk((k + 1) / segs), rBase * (1 - (k / segs) * .52), '#4f4433');
    }
    // 三轮枝：每轮五到七枝，每枝再分两叉，冠才有层次
    for (let tier = 0; tier < 3; tier++) {
      const level = .48 + tier * .15;
      const count = 7 - tier;
      for (let i = 0; i < count; i++) {
        const a = i / count * 6.283 + tier * 1.13 + rand() * .5;
        const len = h * (.34 - tier * .07) * (.85 + rand() * .35);
        const from = trunk(level);
        const dx = Math.cos(a), dy = Math.sin(a);
        const p1 = from.clone().add(V(dx * len * .55, dy * len * .55, h * .05));
        const p2 = from.clone().add(V(dx * len, dy * len, h * (.09 + rand() * .04)));
        B.rod(from, p1, rBase * .52 * (1 - tier * .16), '#55482f');
        B.rod(p1, p2, rBase * .32 * (1 - tier * .16), '#5b4e34');
        // 两叉
        for (let j = 0; j < 2; j++) {
          const a2 = a + (j ? .55 : -.5) + rand() * .3;
          const l2 = len * (.42 + rand() * .28);
          const tip = p2.clone().add(V(Math.cos(a2) * l2, Math.sin(a2) * l2, h * (.03 + rand() * .05)));
          B.rod(p2, tip, rBase * .16, '#5d5137');
          // 每叉两三团叶，深浅交错
          for (let k2 = 0; k2 < 3; k2++) {
            const cs = h * (.048 + rand() * .028);
            const off = V(Math.cos(a2 + rand() - .5) * l2 * .3, Math.sin(a2 + rand() - .5) * l2 * .3, rand() * h * .04);
            B.put('canopy', pal[(tier + j + k2) % pal.length], tip.clone().add(off),
              new T.Vector3(cs * 1.45, cs * .82, cs * 1.2),
              new T.Quaternion().setFromAxisAngle(yAxis, rand() * 6.28));
          }
        }
        const cs = h * (.07 + rand() * .03);
        B.put('canopy', pal[(i + tier) % pal.length], p2.clone().add(V(dx * .3, dy * .3, h * .02)),
          new T.Vector3(cs * 1.5, cs * .8, cs * 1.25),
          new T.Quaternion().setFromAxisAngle(yAxis, a));
      }
    }
    // 树冠顶心再收一簇，别让主干露头
    for (let i = 0; i < 3; i++) {
      const cs = h * (.06 + rand() * .025);
      B.put('canopy', pal[i % pal.length],
        trunk(.94).add(V((rand() - .5) * h * .06, (rand() - .5) * h * .06, rand() * h * .04)),
        new T.Vector3(cs * 1.4, cs * .78, cs * 1.2));
    }
  }
  // 五棵古树：分在三个台地，避开主视廊
  ancientTree(-48.0, -13.6, 14.5, 'ginkgo');
  ancientTree(-24.0, -14.6, 13.2, 'broad');
  ancientTree(-43.2, -6.0, 12.0, 'broad');
  ancientTree(5.2, 17.4, 11.5, 'pine');
  ancientTree(7.6, -15.2, 12.4, 'pine');

  // 庭树补植：小乔木与灌木，填满院落转角
  const smallTrees = [
    [-49.0, 9.6, .35], [-26.6, -13.8, .35], [-27.4, -17.6, .35],
    [-10.4, 15.6, 2], [-2.0, -14.8, 2],
    [.8, 14.6, 2], [4.2, -9.0, 13], [4.2, 9.4, 13], [8.8, 16.6, 13],
    [10.6, -17.4, 13], [16.4, 18.2, 13], [24.2, -18.6, 13], [30.2, 17.8, 13]
  ];
  for (const [x, y] of smallTrees) {
    const h = 4.4 + rand() * 2.6;
    // 定根走实际地面：台外（x>27）的树坐的是山坡，按台面 13 种会悬空
    const gz = ground(x, y);
    const lean = (rand() - .5) * .8;
    const trunk = t => V(x + lean * t * t, y + Math.sin(t * 4) * .2, gz + h * t);
    for (let k = 0; k < 3; k++) B.rod(trunk(k / 3), trunk((k + 1) / 3), .10 - k * .025, '#54472f');
    for (let k = 0; k < 5; k++) {
      const a = rand() * 6.28, lvl = .5 + rand() * .36, sp = h * (.14 + rand() * .12);
      const from = trunk(lvl);
      const to = from.clone().add(V(Math.cos(a) * sp, Math.sin(a) * sp, h * .09));
      B.rod(from, to, .035, '#5a4d33');
      const cs = h * (.085 + rand() * .055);
      B.put('canopy', leafPalette[k % leafPalette.length], to,
        new T.Vector3(cs * 1.35, cs * .78, cs * 1.15),
        new T.Quaternion().setFromAxisAngle(yAxis, a));
    }
  }

  // 院外松林加密：只往外圈补，不挡院内视廊
  for (let i = 0; i < 240; i++) {
    const x = -110 + rand() * 265, y = -138 + rand() * 276;
    if (x > -60 && x < 42 && Math.abs(y) < 38) continue;
    if (x < -52 && Math.abs(y) < 7) continue;
    const h = 3.2 + rand() * 6.4;
    // 定根高走 ground(x, y)（范围外即 hill(x, -y)）：以前直接 hill(x, y)，
    // 山体坐标与地面坐标的 y 互为相反数，北岸的松树全钉在南岸的坡上飘着。
    const z = ground(x, y);
    // 简化松：一柱三段 + 五团冠
    for (let k = 0; k < 3; k++) {
      B.rod(V(x, y, z + h * k / 3), V(x + (rand() - .5) * .3, y + (rand() - .5) * .3, z + h * (k + 1) / 3),
        .12 - k * .03, '#4d432f');
    }
    for (let k = 0; k < 5; k++) {
      const a = rand() * 6.28, r = h * (.10 + rand() * .16);
      B.put('canopy', pinePal[k % pinePal.length],
        V(x + Math.cos(a) * r, y + Math.sin(a) * r, z + h * (.52 + rand() * .38)),
        new T.Vector3(h * (.13 + rand() * .07), h * .05, h * (.11 + rand() * .06)),
        new T.Quaternion().setFromAxisAngle(yAxis, a));
    }
  }

  // 花池边补一丛萱草与玉簪，盛夏的样子
  for (let i = 0; i < 26; i++) {
    const x = -49 + rand() * 46, y = (rand() < .5 ? -1 : 1) * (8.5 + rand() * 8);
    if (Math.abs(y) < 9) continue;
    // 贴实际地面：三进段 |y|>16.6 已在台外，按台面常数 13 撒会悬在半空
    const z = ground(x, y);
    for (let k = 0; k < 5; k++) {
      const a = rand() * 6.28, l = .12 + rand() * .22;
      B.rod(V(x, y, z), V(x + Math.cos(a) * l, y + Math.sin(a) * l, z + .22 + rand() * .18), .012, '#6b7750');
      if (k === 0) B.put('ball', i % 3 ? '#d8c98a' : '#c9a7c0',
        V(x + Math.cos(a) * l, y + Math.sin(a) * l, z + .40), new T.Vector3(.055, .045, .055));
    }
  }

  /* ===== 二、下院上券门的石阶 =====
   * 二进院是一整块两米高的台体（x=-18 起），西壁就是挡土墙。
   * 之前墙外只有一段看不见的斜面，走过来像是被弹上去的。
   * 这里在墙根铺十一级石阶：从下院 .35 抬到台面 2.0，两侧压垂带石。
   */
  {
    const x0 = -21.6, x1 = -18.08, halfW = 1.9;
    const low = .35, high = 2.0, steps = 11;
    const tread = (x1 - x0) / steps, rise = (high - low) / steps;
    const treadC = '#9c9384', riser = '#847b6d', edge = '#b0a48c';
    for (let i = 0; i < steps; i++) {
      const top = low + rise * (i + 1);
      // 每级从下院地面砌到自己的踏面：踢面压深、踏面提亮，一级一级才分得开
      B.box(riser, x0 + tread * (i + .5), 0, (top + low) / 2 - .16, tread + .012, halfW * 2, top - low + .32);
      B.box(treadC, x0 + tread * (i + .5), 0, top - .03, tread - .02, halfW * 2 - .04, .06);
      // 踏面前沿压一道窄条，台阶线才清楚
      B.box(riser, x0 + tread * (i + .988), 0, top - .05, .045, halfW * 2, .05);
      // 两侧垂带石：顺着斜面走的斜条，边线才立得起来
      for (const s of [-1, 1])
        B.box(edge, x0 + tread * (i + .5), s * (halfW + .17), (top + low) / 2 - .06, tread + .02, .34, top - low + .30);
    }
    // 阶口的抱鼓石
    for (const s of [-1, 1])
      B.box(edge, x0 + .18, s * (halfW + .40), .64, .36, .48, .96);
  }

  /* ===== 二·c、山门细部与谷口前庭 =====
   * 山门原先是一个无门无路的方盒子：两个券洞被暗板封死，门外直接是山坡，
   * 人也走不出去。这里把门洞打通（facades.js 的券环已 open）、补内衬与门扇，
   * 门外再补一方月台、一道下山踏道与一段石板路——山门这才真的通向山外。 */
  {
    const GX0 = -51.15, GX1 = -46.85;            // 门体东西两端
    const MID = (GX0 + GX1) / 2;
    const R = 1.45, SPRING = 1.59, TOP = 3.04;   // 券洞半径 / 起拱面 / 洞顶
    const FLOOR = 0.71;                          // 门内地面（基座顶）

    /* 门洞内衬：地面、两壁、顶板，门体里不再是一个看不见的实心盒 */
    B.box(C.stoneDark, MID, 0, FLOOR - .07, GX1 - GX0 + .3, 3.1, .14);
    for (const s of [-1, 1])
      B.box(C.stone, MID, s * 1.52, (FLOOR + 2.92) / 2, GX1 - GX0 + .3, .18, 2.92 - FLOOR);
    B.box(C.stoneDark, MID, 0, 2.97, GX1 - GX0 + .3, 3.22, .12);

    /* 洞口背后各封一层带券洞的暗板，补齐内衬与券环之间的死角 */
    const darkMat = new T.MeshStandardMaterial({ color: '#1c140d', roughness: 1, side: T.DoubleSide });
    for (const px of [GX0 + .16, GX1 - .16]) {
      const shape = new T.Shape();
      shape.moveTo(-2.05, FLOOR - .2); shape.lineTo(-2.05, 3.3);
      shape.lineTo(2.05, 3.3); shape.lineTo(2.05, FLOOR - .2); shape.closePath();
      const hole = new T.Path();
      hole.moveTo(-R, FLOOR - .2); hole.lineTo(-R, SPRING);
      hole.absarc(0, SPRING, R, Math.PI, 0, true); hole.lineTo(R, FLOOR - .2); hole.closePath();
      shape.holes.push(hole);
      const m = new T.Mesh(new T.ShapeGeometry(shape), darkMat);
      m.position.set(px, 0, 0);
      m.rotation.y = Math.PI / 2;
      scene.add(m);
    }

    /* 只留拱门：洞口双扇门板（含门钉/门轴）整体不创建，券洞内外通透。
       保留门槛、门枕石、门簪与匾额——山门就是一座真正走得过的拱门。 */
    for (const [face, dir] of [[GX0, 1], [GX1, -1]]) {   // dir: 向寺内凹的方向
      const xDoor = face + dir * .30;
      B.box(C.stoneDark, xDoor - dir * .02, 0, FLOOR + .05, .12, 2.86, .10);   // 门槛
      // 门枕石：门槛两端各一方，带圆鼓头
      for (const s of [-1, 1]) {
        B.box(C.stone, xDoor + dir * .02, s * 1.60, FLOOR + .21, .40, .34, .42);
        B.put('cube', C.stone, V(xDoor + dir * .02, s * 1.60, FLOOR + .47),
          new T.Vector3(.34, .13, .34),
          new T.Quaternion().setFromAxisAngle(new T.Vector3(1, 0, 0), Math.PI / 4));
      }
      // 门簪：门楣上四支，向外探出
      for (const s of [-.72, -.26, .26, .72])
        B.rod(V(face, s, 2.72), V(face - dir * .16, s, 2.72), .045, C.wood);
      // 匾额：嵌在券洞上方拱肩里（整体压到券顶 3.04 之下，避免被券环带横穿）
      const w = 1.24, h = .38;
      const m = new T.Mesh(new T.PlaneGeometry(w, h),
        new T.MeshStandardMaterial({ map: plaqueTexture('佛光寺'), roughness: .6 }));
      m.position.set(face - dir * .09, 2.84, 0);
      m.rotation.y = dir > 0 ? -Math.PI / 2 : Math.PI / 2;
      scene.add(m);
      B.box(C.wood, face - dir * .07, 0, 2.84 + h / 2, .07, w + .14, .06);
      B.box(C.wood, face - dir * .07, 0, 2.84 - h / 2, .07, w + .14, .06);
      for (const s of [-1, 1]) B.box(C.wood, face - dir * .07, s * (w / 2 + .05), 2.84, .07, .10, h + .12);
    }

    /* 门外前庭：一方月台 + 四级下山踏道 + 一段谷口石板路 */
    // 月台：x -57.6→-51.9，z(world) ±6.4，面 0.35（与地面表一致）
    B.box(C.stoneDark, -54.75, 0, -.175, 5.7, 12.8, 1.05);
    for (let x = -56.9; x <= -52.3; x += 1.4) B.box('#8b7d68', x, 0, .352, .05, 12.5, .02);
    for (let y = -5.6; y <= 5.7; y += 1.6) B.box('#8b7d68', -54.75, y, .352, 5.6, .05, .02);
    // 压面石：月台四缘，踏道口与阶口断开
    B.box(C.stone, -57.52, 4.15, .37, .16, 4.5, .06);
    B.box(C.stone, -57.52, -4.15, .37, .16, 4.5, .06);
    B.box(C.stone, -51.98, 4.15, .37, .16, 4.5, .06);
    B.box(C.stone, -51.98, -4.15, .37, .16, 4.5, .06);
    for (const s of [-1, 1]) B.box(C.stone, -54.75, s * 6.36, .37, 5.7, .16, .06);
    // 八字墙：从门座两角向外撇，把月台拢住
    const wallSeg = (ax, ay, bx, by, zc, h, thk, color) => {
      const dx = bx - ax, dy = by - ay, len = Math.hypot(dx, dy);
      B.put('cube', color, V((ax + bx) / 2, (ay + by) / 2, zc),
        new T.Vector3(len, h, thk),
        new T.Quaternion().setFromAxisAngle(new T.Vector3(0, 1, 0), Math.atan2(dy, dx)));
    };
    for (const s of [-1, 1]) {
      wallSeg(-51.9, s * 4.9, -57.6, s * 6.34, .52, 1.85, .42, C.wall);
      wallSeg(-51.9, s * 4.9, -57.6, s * 6.34, 1.46, .14, .56, C.stone);   // 帽石
    }
    // 上门洞的两级踏步
    B.box(C.stone, -52.15, 0, .415, .5, 3.9, .23);
    B.box(C.stone, -51.72, 0, .62, .36, 3.9, .18);
    // 下山踏道：四级，从月台 0.35 缓降到谷口路面
    for (let i = 0; i < 4; i++) {
      const top = .35 - .2625 * (i + 1);
      B.box(C.stone, -57.6 - (i + .5), 0, (top - .75) / 2, 1.0, 5.2, top + .75);
      B.box(C.stoneDark, -57.6 - (i + .5) - .48, 0, top - .04, .04, 5.2, .05);
      for (const s of [-1, 1])
        B.box(C.stone, -57.6 - (i + .5), s * 2.66, (top - .75) / 2, 1.04, .34, top + .75);
    }
    // 谷口石板路：一路铺进松林里
    B.box(C.stoneDark, -66.0, 0, -.665, 8.9, 4.6, .09);
    for (let x = -62.4; x >= -69.8; x -= 1.35) B.box('#8b7d68', x, 0, -.62, .05, 4.4, .025);
    for (const s of [-1, 1]) for (let x = -62.3; x >= -69.9; x -= 1.5)
      B.box(C.stone, x, s * 2.34, -.60, .82, .24, .18);
  }

  B.flush(scene);

  /* ===== 三、猫 ===== */
  const cats = [];
  const catSpots = [
    { x: 12.12, y: 4.2, face: -Math.PI / 2, fur: FURS[0], kind: 'plain' },
    { x: 14.28, y: -3.4, face: Math.PI, fur: FURS[1], kind: 'plain' },
    { x: -9.9, y: 3.6, face: -Math.PI / 2, fur: FURS[0], kind: 'plain' },   // 二进台地西缘，蹲在陡阶边上
    { x: -36.2, y: 7.9, face: 0, fur: FURS[3], kind: 'patch' }
  ];
  for (const spot of catSpots) {
    const built = makeCat(spot.fur, spot.kind);
    built.group.userData.cat = true;
    built.group.userData.noPaint = true;
    built.group.userData.keep = true;        // 猫会摆尾、走廊下
    const z = ground(spot.x, spot.y);
    built.group.position.set(spot.x, z + .01, -spot.y);
    built.group.rotation.y = spot.face;
    built.group.scale.setScalar(.95 + rand() * .18);
    scene.add(built.group);
    cats.push({ ...built, x: spot.x, y: spot.y, phase: rand() * 6.28, walk: 0 });
  }
  // 一只会沿廊下慢慢走的猫
  const walker = cats[0];
  walker.path = { x: 12.12, y0: 2.6, y1: 6.4, t: 0 };

  /* ===== 四、鸽子 ===== */
  const doves = [];
  for (let i = 0; i < 9; i++) {
    const d = makeDove();
    d.group.userData.keep = true;           // 鸽子会飞
    const x = 5.2 + rand() * 5.4, y = -6.6 + rand() * 13.2;
    const z = ground(x, y);
    d.group.position.set(x, z + .0, -y);
    d.group.rotation.y = rand() * 6.28;
    d.group.scale.setScalar(1.22);
    scene.add(d.group);
    doves.push({
      ...d, home: new T.Vector3(x, z, -y), phase: rand() * 6.28,
      peck: rand() * 3, flying: false, flyT: 0, spin: rand() * 6.28
    });
  }

  let chirpT = 0, lastBell = 0;
  function tick(now, dt) {
    dt = Math.min(dt || .016, .06);
    // 猫：摆尾、偶尔甩头
    for (const c of cats) {
      const sway = Math.sin(now * .0016 + c.phase) * .26 + Math.sin(now * .0043 + c.phase) * .07;
      c.tail.rotation.y = sway;
      c.tail.rotation.x = Math.sin(now * .0011 + c.phase) * .12;
      c.head.rotation.y = Math.sin(now * .00042 + c.phase) * .22;
      c.head.rotation.z = Math.sin(now * .00029 + c.phase * 1.7) * .05;
    }
    // 那只走动的猫：在廊下小范围来回
    if (walker.path) {
      walker.path.t += dt * .16;
      const s = walker.path.t % 2;
      const k = s < 1 ? s : 2 - s;
      const y = walker.path.y0 + (walker.path.y1 - walker.path.y0) * k;
      walker.group.position.z = -y;
      walker.group.rotation.y = (s < 1 ? -1 : 1) * -Math.PI / 2 + Math.PI;
      walker.group.position.y = ground(walker.path.x, y) + .01 + Math.abs(Math.sin(now * .004)) * .012;
    }
    // 鸽子：啄食 / 受惊起飞
    const cam = camera && camera.position;
    for (const d of doves) {
      if (!d.flying) {
        d.peck += dt;
        const peckK = Math.max(0, Math.sin(d.peck * 2.1 + d.phase));
        d.head.position.y = .125 - peckK * .045;
        d.head.position.z = .085 + peckK * .022;
        d.body.rotation.x = peckK * .10;
        d.wings[0].rotation.z = -.25; d.wings[1].rotation.z = .25;
        if (cam) {
          const dist = Math.hypot(cam.x - d.home.x, cam.z - d.home.z);
          if (dist < 6.2) { d.flying = true; d.flyT = 0; }
        }
      } else {
        d.flyT += dt;
        const t = d.flyT / 7.5;
        if (t >= 1) {
          d.flying = false;
          d.group.position.copy(d.home);
          d.group.rotation.set(0, rand() * 6.28, 0);
          d.body.rotation.x = 0;
          continue;
        }
        // 起飞：先陡升，再绕一圈落回
        const rise = Math.min(1, t / .22);
        const land = t > .78 ? (t - .78) / .22 : 0;
        const radius = 4.1 + Math.sin(t * 3.1) * 1.2;
        const a = d.spin + t * 6.4;
        const px = d.home.x + Math.cos(a) * radius * (.4 + rise * .6);
        const pz = -d.home.z - Math.sin(a) * radius * (.4 + rise * .6);
        const py = d.home.y + Math.sin(Math.min(1, rise) * Math.PI * .5) * (4.6 - land * 4.6);
        d.group.position.set(px, py, pz);
        d.group.rotation.y = -a + Math.PI / 2;
        d.group.rotation.x = -.22 + land * .22;
        const flap = Math.sin(now * .028 + d.phase) * .9;
        d.wings[0].rotation.z = -flap; d.wings[1].rotation.z = flap;
        d.head.position.set(0, .125, .085);
      }
    }
    // 鸽子偶尔咕咕叫
    if (cam && now - chirpT > 9000) {
      const near = doves.some(d => !d.flying && Math.hypot(cam.x - d.home.x, cam.z - d.home.z) < 14);
      if (near) { chirpT = now; sfx.dove(); }
    }
    // 风铎：轻响，靠近殿前才听得到
    if (cam && now - lastBell > 16000 && Math.abs(cam.z) < 26 && cam.x > 2) {
      lastBell = now;
      if (Math.random() < .5) sfx.windChime();
    }
    // 铎随微风摆
    for (const c of chimes) {
      const sway = Math.sin(now * .0011 + c.phase) * .06 + Math.sin(now * .0037 + c.phase) * .02;
      c.group.rotation.z = sway;
      c.group.rotation.x = Math.cos(now * .0013 + c.phase) * .04;
    }
  }

  return { tick, cats, doves };
}
