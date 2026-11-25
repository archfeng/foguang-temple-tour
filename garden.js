/* 园林：莲池、花台、花境、竹林、花木、地被与石作。
 *
 * 布置原则：中轴（|y|<2.6）留空给人走；植被集中在墙根、殿前、院角与树下，
 * 用「高处灌木—中层花木—低处地被」三层叠起来，远看才有层次，近看不露土。
 * 坐标同场景：x 东西、y 南北、z 高度；three 里是 (x, z, -y)。
 */
import {surface} from './surfaces.js?v=20261112h';
import {weathered} from './wonder/weathered.js?v=20261116bk';

import {Q} from './quality.js?v=20261112h';

const T = window.THREE;
const V = (x, y, z) => new T.Vector3(x, z, -y);
// 地面高度表：由 buildGarden 注入（tour.js 的 ground）。植被一律贴实际地面，
// 不再按各进台面的常数撒——撒出墙外时常数会把苔草钉在半空。
let groundG = () => 0;
let hillG = () => -999;   // 山体函数（buildGarden 注入），flush 兜底用
const yAxis = new T.Vector3(0, 1, 0);
const mat = (c, o = {}) => new T.MeshStandardMaterial({ color: c, roughness: .97, ...o });

let seed = 20261105;
const rnd = () => ((seed = (Math.imul(1664525, seed) + 1013904223) >>> 0) / 4294967296);
const R = (a, b) => a + rnd() * (b - a);
const pick = a => a[Math.floor(rnd() * a.length)];
const qY = a => new T.Quaternion().setFromAxisAngle(yAxis, a);

const P = {
  leaf: ['#4a6a3c', '#557546', '#3f5c36', '#617f4c', '#6d8a54', '#456339'],
  deep: ['#314c30', '#38543a', '#405e3c', '#2b452c'],
  pine: ['#2b4230', '#36503a', '#415c42'],
  bamboo: ['#5a7040', '#667d46', '#71874b', '#4e6338'],
  bambooLeaf: ['#7d9455', '#8aa062', '#6f8749', '#93a86a'],
  grass: ['#5c7440', '#68824a', '#4f6638', '#73894e', '#7d9256', '#88a063', '#95ab6c'],
  turf: ['#48632f', '#527039', '#3f5a2b', '#5c7a42', '#446036', '#63854a'],
  soil: '#4b3a2b',
  curb: ['#8a8578', '#948f82', '#807b6f'],
  stone: ['#918c80', '#878275', '#9b968a', '#8b867a'],
  rock: ['#8b8578', '#7d7a70', '#98917f', '#726f66']
};
const FL = {
  peony: ['#c8778f', '#d98fa3', '#e8b9c4', '#b85f78', '#efe0dc', '#cf9aa8'],
  daylily: ['#d68a3c', '#e0a04e', '#c97c33'],
  hosta: ['#efe7d2', '#f5efdd', '#e3ddc6'],
  chrys: ['#d9b455', '#e6c96c', '#c9a444'],
  aster: ['#8b93bd', '#a3aacb', '#7b84ae'],
  crape: ['#b96f93', '#c98aa8', '#d9a3bd'],
  magnolia: ['#f2ece0', '#e9e1d1', '#f7f3ea'],
  crab: ['#d98fa3', '#e8b0c0', '#c97a92'],
  osmanthus: ['#c9a844', '#d9b958', '#b8933a']
};


/* 植被起根兜底。ground() 是"站在上面的人"的高度表：挡土墙【立面投影带】
 * （台缘外沿以内）返回台面常数，跨出外沿才切换成真实坡地——所以竹丛越出
 * 墙线的那半截，若沿用以"调用点在台面上"为前提的台面常数，就挂在立面/山坡
 * 半空（墙根竹、台缘苔带的老 bug 全是这一类）。
 * 规则：
 *   1) 先信任脚下：g 比调用值 z 低出 >0.25（调用方给的台面常数悬在坑/坡上）
 *      → 直接坠到 g；
 *   2) 再查冠幅圈 r：圈内地面最高者把低洼处的植株抬到实体表面（草不能埋进坡），
 *      但高差 >1.2m 的陡坎（台缘挡土墙）不算"坡爬上来"——那是立面，
 *      圈内的台面高会把人骗回悬空高度；
 *   3) 其余保持调用值：台面内、花池土面/苔面等刻意抬高的小高差。 */
function baseZ(x, y, z, r = 0.9) {
  const g = groundG(x, y);
  if (g < z - .25) return g;                          // 脚下悬空：坠到地面
  let hi = g;
  if (r > 0.01) {
    const n = Math.max(6, Math.round(r * 8));
    for (let k = 0; k < n; k++) {
      const a = k / n * 6.283;
      const h = groundG(x + Math.cos(a) * r, y + Math.sin(a) * r);
      if (h > hi) hi = h;
    }
  }
  // 陡坎护栏：圈内最高点若比脚下高出挡土墙级别，只允许抬到"脚下+0.9"，
  // 植株最多站上紧邻的小土坡，绝不借墙另一侧的台面飞回半空
  const cap = g + .9;
  const lift = Math.min(hi, cap);
  if (lift > z + .25 && lift > g + .25) return lift;  // 坡爬上来：抬到坡面
  return z;
}

/* ---------- 小批量实例化 ---------- */
function craggy() {
  const g = new T.IcosahedronGeometry(1, Q.leafDetail);
  const p = g.attributes.position;
  for (let i = 0; i < p.count; i++) {
    const x = p.getX(i), y = p.getY(i), z = p.getZ(i);
    const d = 1 + .20 * Math.sin(7.1 * x + 3.3 * z) * Math.cos(6.2 * y - 2.1 * x) + .10 * Math.sin(12.7 * z + 1.7);
    p.setXYZ(i, x * d, y * d * .84, z * d);
  }
  g.computeVertexNormals();
  return g;
}

// 叶团：表面起伏 + 顶点明暗，一团叶子里就有了受光面与背光面
function foliageGeo() {
  const g = new T.IcosahedronGeometry(1, Q.leafDetail);
  const p = g.attributes.position, cols = [];
  for (let i = 0; i < p.count; i++) {
    const x = p.getX(i), y = p.getY(i), z = p.getZ(i);
    const d = 1 + .17 * Math.sin(6.3 * x + 2.7 * z) * Math.cos(5.1 * y - 1.9 * x);
    p.setXYZ(i, x * d, y * d, z * d);
    const t = .70 + .32 * Math.sin(9.7 * x + 4.3 * y) * Math.sin(7.1 * z + 2.2 * y);
    cols.push(t, t, t * .94);
  }
  g.computeVertexNormals();
  g.setAttribute('color', new T.Float32BufferAttribute(cols, 3));
  return g;
}

function batcher() {
  const piles = new Map(), mats = new Map();
  const STONE = new Set([...P.stone, ...P.curb, ...P.rock, P.soil, '#7a6a52', '#5b4b38']);
  return {
    put(type, color, pos, scale, quat = new T.Quaternion()) {
      const key = type + color;
      if (!piles.has(key)) piles.set(key, { type, color, items: [] });
      piles.get(key).items.push(new T.Matrix4().compose(pos, quat, scale));
    },
    rod(a, b, r, color) {
      const d = b.clone().sub(a);
      if (d.lengthSq() < 1e-9) return;
      this.put('cyl', color, a.clone().lerp(b, .5), new T.Vector3(r, d.length(), r),
        new T.Quaternion().setFromUnitVectors(yAxis, d.clone().normalize()));
    },
    // 轴对齐盒：c=(x,y,z)，w 沿 x、d 沿 y、h 沿 z
    box(color, cx, cy, cz, w, d, h) {
      this.put('cube', color, V(cx, cy, cz), new T.Vector3(w, h, d));
    },
    flush(scene) {
      const geo = {
        cube: new T.BoxGeometry(1, 1, 1),
        cyl: new T.CylinderGeometry(1, 1, 1, Q.cylSeg),
        disc: new T.CylinderGeometry(1, 1, 1, Q.discSeg),
        ball: new T.IcosahedronGeometry(1, Q.leafDetail),
        leaf: foliageGeo(),
        rock: craggy(),
        canopy: foliageGeo(),
        cone: new T.ConeGeometry(1, 1, 4)
      };
      // 大堆叶团（上千实例）换低模：草坪、花境远看没有差别，三角形省下上百万
      const loCache = new Map();
      const geoFor = (type, n) => {
        if (n <= 1200 || (type !== 'leaf' && type !== 'canopy' && type !== 'ball')) return geo[type] || geo.cube;
        const k = type + 'Lo';
        if (!loCache.has(k)){
          if (type === 'ball') loCache.set(k, new T.IcosahedronGeometry(1, 0));
          else {
            const g = new T.IcosahedronGeometry(1, 0), p = g.attributes.position, cols = [];
            for (let i = 0; i < p.count; i++) {
              const x = p.getX(i), y = p.getY(i), z = p.getZ(i);
              const d = 1 + .17 * Math.sin(6.3 * x + 2.7 * z) * Math.cos(5.1 * y - 1.9 * x);
              p.setXYZ(i, x * d, y * d, z * d);
              const t = .70 + .32 * Math.sin(9.7 * x + 4.3 * y) * Math.sin(7.1 * z + 2.2 * y);
              cols.push(t, t, t * .94);
            }
            g.computeVertexNormals();
            g.setAttribute('color', new T.Float32BufferAttribute(cols, 3));
            loCache.set(k, g);
          }
        }
        return loCache.get(k);
      };
      for (const { type, color, items } of piles.values()) {
        const key = type + color;
        if (!mats.has(key)) {
          const m = mat(color);
          if (type === 'leaf' || type === 'canopy') m.vertexColors = true;
          if (STONE.has(color)) {
            m.map = surface('stone'); m.bumpMap = m.map; m.bumpScale = .03;
            weathered(m, color === P.soil ? 'forest' : 'stone');
          }
          mats.set(key, m);
        }
        const m = new T.InstancedMesh(geoFor(type, items.length), mats.get(key), items.length);
        m.userData.plantInstances = type === 'leaf' || type === 'canopy';
        items.forEach((a, i) => {
          // 贴地兜底（两类）：
          // ① 小杆（草叶/竹枝）基点悬在可信地面 >.9m 且其下无叶团依附 → 沉地；
          // ② 扁叶/球（leaf/ball/canopy，垂直尺度 ≤.6）中心悬在可信地面 >.7m
          //    且 1.6m 内没有任何杆（枝条/树干/竹竿可挂靠）→ 沉地。
          if (type === 'cyl' && a.elements[13] - Math.hypot(a.elements[4], a.elements[5], a.elements[6]) / 2 > .9) {
            const px = a.elements[12], py = a.elements[13], pz = a.elements[14];
            const sy = Math.hypot(a.elements[4], a.elements[5], a.elements[6]);
            const sxz = Math.max(Math.hypot(a.elements[0], a.elements[1], a.elements[2]),
                                 Math.hypot(a.elements[8], a.elements[9], a.elements[10]));
            if (sxz <= 1.1 && sy <= .7) {
              const gx = px, gy = -pz;                     // garden coords
              const baseY = py - sy / 2;
              const surf = Math.max(groundG(gx, gy), hillG(gx, gy));
              if (baseY > surf + .9 && baseY < surf + 7) {
                let nearFoliage = false;
                outer:
                for (const it of piles.values()) {
                  if (it.type !== 'leaf' && it.type !== 'ball' && it.type !== 'canopy') continue;
                  for (const f of it.items) {
                    const fy = f.elements[13];
                    if (fy > baseY - 1.4 && fy < baseY + 3 &&
                        Math.hypot(f.elements[12] - px, f.elements[14] - pz) < 1.6) { nearFoliage = true; break outer; }
                  }
                }
                if (!nearFoliage) a.elements[13] -= baseY - surf;   // 沉到地面
              }
            }
          } else if ((type === 'leaf' || type === 'ball' || type === 'canopy') && a.elements[13] > 1.0) {
            const sy = Math.hypot(a.elements[4], a.elements[5], a.elements[6]);
            // 只管"小而扁"的叶/果（垂直尺度 ≤.6）；大树冠球垂直尺度 ≥1.5，
            // 本来就该高挂，不能碰。
            if (sy <= .6) {
              const px = a.elements[12], py = a.elements[13], pz = a.elements[14];
              const surf = Math.max(groundG(px, -pz), hillG(px, -pz));
              // 距可信台面/坡面 >.7m 的浮空小叶才处理；台缘内侧 ground 就是
              // 台面高，误伤不了铺地上的正常落叶。
              if (py > surf + .7 && py < surf + 9) {
                let nearStem = false;
                stem:
                for (const it of piles.values()) {
                  if (it.type !== 'cyl') continue;
                  for (const f of it.items) {
                    const fy = f.elements[13];
                    if (fy > py - 4.5 && fy < py + 1.2 &&
                        Math.hypot(f.elements[12] - px, f.elements[14] - pz) < 1.3) { nearStem = true; break stem; }
                  }
                }
                if (!nearStem) a.elements[13] -= py - surf - .012;   // 落叶归位：贴地
              }
            }
          }
          m.setMatrixAt(i, a);
        });
        // 只有石作与树干参与投影，草花不投，省一遍几何
        m.castShadow = type === 'cube' || color === '#4f4433' || color === '#55482f';
        m.receiveShadow = true;
        scene.add(m);
      }
    }
  };
}

/* ---------- 基本植株 ---------- */
function shrub(B, x, y, z, r, h, pal, tone = 0, bed) {
  // 调用值悬在实际地面 >.25 → 一律坠回地面（含挡土墙顶的"借墙起飞"：
  // 台缘外 x<2.95 地面是二进院 2.0，调用值 2.1 却按台面来，整丛挂墙头）。
  // baseZ 的冠幅抬升（cap=g+.9）会把这 0.1 的悬空一路借成台面+0.9 的悬浮，
  // 抬升只对"脚下不悬空"的调用有意义，悬空调用先坠地再谈。
  // bed=花池/土台：调用值即池面，原样保留（池面比自然地面高是刻意的）。
  if (!bed) {
    const g0 = groundG(x, y);
    if (g0 < z - .25) z = g0;                  // 整丛悬在挡土墙半空：坠回地面
    else z = baseZ(x, y, z, r);
  }
  const c = pal[(tone + Math.floor(rnd() * pal.length)) % pal.length];
  // 一团主丛，两侧再各压一团小的，灌木才是横着铺开而不是竖着叠
  B.put('leaf', c, V(x, y, z + h * .30), new T.Vector3(r * 1.30, h * .80, r * 1.15), qY(rnd() * 6.28));
  const a = rnd() * 6.283;
  for (const s of [-1, 1]) {
    B.put('leaf', pal[Math.floor(rnd() * pal.length)],
      V(x + Math.cos(a) * s * r * .62, y + Math.sin(a) * s * r * .62, z + h * R(.20, .34)),
      new T.Vector3(r * R(.62, .82), h * R(.42, .58), r * R(.58, .78)), qY(rnd() * 6.28));
  }
}

// opts.bed：种植面高于自然地面（牡丹台的土面、莲缸的缸面），跳过 terrain 兜底
function grass(B, x, y, z, n, h, opts) {
  // 与 shrub 同规矩：调用点悬空先坠地，避免 baseZ 借台缘抬上墙头
  let gz = z;
  if (!(opts && opts.bed)) {
    const g0 = groundG(x, y);
    gz = g0 < z - .25 ? g0 : baseZ(x, y, z);
  }
  for (let i = 0; i < n; i++) {
    const a = rnd() * 6.283, l = R(.05, .22), hh = h * R(.55, 1.15);
    B.rod(V(x, y, gz), V(x + Math.cos(a) * l, y + Math.sin(a) * l, gz + hh), .0075, pick(P.grass));
  }
}

// 草皮：一片压一片的低矮草团，远看连成草地，近看有起伏
function turf(B, x, y, z, r) {
  B.put('leaf', pick(P.turf), V(x, y, z + .035), new T.Vector3(r, r * .34, r * R(.7, 1.15)), qY(rnd() * 6.28));
  if (rnd() > .5) B.put('leaf', pick(P.turf), V(x + R(-.4, .4) * r, y + R(-.4, .4) * r, z + .05),
    new T.Vector3(r * .62, r * .26, r * R(.6, 1.0)), qY(rnd() * 6.28));
}

function flower(B, x, y, z, h, c, size, bed) {
  if (!bed) z = baseZ(x, y, z);
  B.rod(V(x, y, z), V(x + R(-.04, .04), y + R(-.04, .04), z + h), .009, '#5e7442');
  B.put('leaf', c, V(x, y, z + h), new T.Vector3(size, size * .62, size));
  if (rnd() > .55) {
    B.rod(V(x, y, z + h * .2), V(x + R(-.14, .14), y + R(-.14, .14), z + h * .72), .007, '#66794a');
    B.put('leaf', pick(P.leaf), V(x, y, z + h * .72), new T.Vector3(size * 1.5, size * .3, size * .9));
  }
}

// 苔痕：贴地的深绿斑，压住铺地与土的交界
function moss(B, x, y, z, r) {
  const c = pick(['#374f2f', '#3f5a35', '#2c4529', '#44603a']);
  B.put('leaf', c, V(x, y, z + .012), new T.Vector3(r, .016, r * R(.5, .9)), qY(rnd() * 6.28));
  if (rnd() > .55) B.put('leaf', c, V(x + R(-.4, .4) * r, y + R(-.4, .4) * r, z + .01),
    new T.Vector3(r * .7, .014, r * R(.5, .9)), qY(rnd() * 6.28));
}

function rock(B, x, y, z, s) {
  B.put('rock', pick(P.rock), V(x, y, z + s * .34), new T.Vector3(s * R(1.0, 1.4), s * .86, s * R(.85, 1.15)), qY(rnd() * 6.28));
  if (s > .3) {
    B.put('rock', pick(P.rock), V(x + R(-.3, .3) * s, y + R(-.3, .3) * s, z + s * .12),
      new T.Vector3(s * 1.1, s * .5, s * .9), qY(rnd() * 6.28));
    // 石背阴处长苔
    B.put('leaf', pick(['#3f5a34', '#47643c']), V(x + R(-.1, .1), y + R(-.1, .1), z + s * .72),
      new T.Vector3(s * .55, s * .18, s * .45), qY(rnd() * 6.28));
  }
}

// 树池：树下一圈草、小灌木与碎石，树才像长在院子里而不是插在石板上
function treePit(B, x, y, z, r) {
  const n = 6 + Math.floor(rnd() * 5);
  for (let i = 0; i < n; i++) {
    const a = rnd() * 6.283, rr = R(.45, r);
    const px = x + Math.cos(a) * rr, py = y + Math.sin(a) * rr;
    if (Math.abs(py) < 3.1) continue;
    grass(B, px, py, z, 5, .3);
    if (rnd() > .55) moss(B, px + R(-.2, .2), py + R(-.2, .2), z + .01, R(.2, .42));
    if (rnd() > .72) shrub(B, px, py, z, R(.26, .4), R(.4, .72), P.leaf);
    if (rnd() > .88) rock(B, px, py, z, R(.12, .22));
  }
}

// 墙根的一条苔带：贴着墙脚长，别撒在石板中间
// 苔带逐点贴【实际地面】：以前越出台缘的那一段整体抬到台面高，结果台外
// （尤其 x<-52 的谷地段，地面 .35~0）的苔草挂在台面高度上。撒点框本来
// 就沿台面边缘线走，逐点 ground 在台面内外都正好贴皮。
function mossStripX(B, x0, x1, y, z, w = .55) {
  for (let x = x0; x < x1; x += .33) {
    if (rnd() < .28) continue;
    const mx = x + R(-.1, .1), my = y + R(-w / 2, w / 2);
    const mz = baseZ(mx, my, z, .5);
    moss(B, mx, my, mz + .012, R(.15, .3));
    if (rnd() > .72) grass(B, mx, my, mz + .012, 3, .22);
  }
}
function mossStripY(B, y0, y1, x, z, w = .55) {
  // 苔带不再做"借墙起飞"的抬升（baseZ r=.5 会把台缘外点借到台面高，
  // 挂在挡土墙半空）：逐点直接贴实际地面，与撒点段的 ground 兜底同规矩。
  for (let y = y0; y < y1; y += .33) {
    if (rnd() < .28) continue;
    const mx = x + R(-w / 2, w / 2), my = y + R(-.1, .1);
    const mz = Math.max(groundG(mx, my), hillG(mx, my));
    moss(B, mx, my, mz + .012, R(.15, .3));
    if (rnd() > .72) grass(B, mx, my, mz + .012, 3, .22);
  }
}

/* ---------- 花境：墙根、殿前的连续花带 ---------- */
function soilBedX(B, x0, x1, y, w, z) {
  B.box(P.soil, (x0 + x1) / 2, y, z + .05, x1 - x0, w, .14);
  for (const s of [-1, 1]) {
    const cy = y + s * (w / 2 - .04);
    const n = Math.max(1, Math.round((x1 - x0) / 1.6));
    for (let i = 0; i < n; i++) {
      const cx = x0 + (i + .5) * (x1 - x0) / n;
      B.box(pick(P.curb), cx, cy, z + .085, (x1 - x0) / n - .02, .11, .19);
    }
  }
}
function soilBedY(B, y0, y1, x, w, z) {
  // 床体不能悬空：调用方给的台面常数 z 若高于实际地面 .25（床沿探出台缘/
  // 挡土墙外），整床坠到地面起建，不再留一段悬在墙脸的土板。
  const g0 = groundG(x, (y0 + y1) / 2);
  if (g0 < z - .25) z = g0;
  B.box(P.soil, x, (y0 + y1) / 2, z + .05, w, y1 - y0, .14);
  for (const s of [-1, 1]) {
    const cx = x + s * (w / 2 - .04);
    const n = Math.max(1, Math.round((y1 - y0) / 1.6));
    for (let i = 0; i < n; i++) {
      const cy = y0 + (i + .5) * (y1 - y0) / n;
      B.box(pick(P.curb), cx, cy, z + .085, .11, (y1 - y0) / n - .02, .19);
    }
  }
}

// 沿东西向的花带：靠墙一排高，往外渐矮
function borderX(B, x0, x1, y, z, w = 1.5, back = 1, gap = null) {
  const segs = gap ? [[x0, gap[0]], [gap[1], x1]] : [[x0, x1]];
  for (const [a, b] of segs) if (b - a > .3) soilBedX(B, a, b, y, w, z);
  const step = .5;
  for (let x = x0 + .3; x < x1 - .2; x += step) {
    if (gap && x > gap[0] && x < gap[1]) continue;
    const px = x + R(-.13, .13);
    // 后排：灌木，贴墙
    if (rnd() > .12) {
      const r = R(.38, .6), h = R(.7, 1.25);
      shrub(B, px, y + back * (w * .32), z + .12, r, h, rnd() > .6 ? P.deep : P.leaf);
    }
    // 中排：花
    const fpal = pick([FL.peony, FL.daylily, FL.hosta, FL.chrys, FL.aster]);
    if (rnd() > .18) {
      flower(B, px + R(-.15, .15), y + back * (w * .06), z + .14, R(.35, .62), pick(fpal), R(.055, .1));
    }
    // 前排：地被与草
    if (rnd() > .25) grass(B, px + R(-.1, .1), y - back * (w * .22), z + .12, 4, .3);
    if (rnd() > .45) moss(B, px + R(-.2, .2), y - back * (w * .34), z + .12, R(.16, .3));
    if (rnd() > .93) rock(B, px, y + back * (w * .2), z + .1, R(.16, .3));
  }
}

/* ---------- 花台（牡丹台） ---------- */
function parterre(B, cx, cy, w, d, z, zhen = false) {
  // 台壁：一圈条石，内填土
  B.box('#96897a', cx, cy, z + .17, w, d, .34);
  B.box(P.soil, cx, cy, z + .36, w - .24, d - .24, .08);
  const rim = (dx, dy, ww, dd) => B.box(pick(P.stone), cx + dx, cy + dy, z + .38, ww, dd, .08);
  rim(0, -d / 2 + .08, w, .16); rim(0, d / 2 - .08, w, .16);
  rim(-w / 2 + .08, 0, .16, d - .32); rim(w / 2 - .08, 0, .16, d - .32);

  const top = z + .40;
  const n = Math.max(5, Math.round(w * d * .85));
  for (let i = 0; i < n; i++) {
    const x = cx + R(-w / 2 + .45, w / 2 - .45);
    const y = cy + R(-d / 2 + .42, d / 2 - .42);
    const h = R(.5, .78);
    // 牡丹：木质短茎 + 大叶 + 两三朵重瓣花
    for (let k = 0; k < 3; k++) {
      const a = rnd() * 6.283;
      B.rod(V(x, y, top), V(x + Math.cos(a) * .14, y + Math.sin(a) * .14, top + h * R(.55, .95)), .017, '#5d5033');
    }
    for (let k = 0; k < 6; k++) {
      const a = rnd() * 6.283, r = R(.10, .30);
      B.put('leaf', pick(P.leaf), V(x + Math.cos(a) * r, y + Math.sin(a) * r, top + R(.20, .58)),
        new T.Vector3(R(.20, .28), R(.10, .15), R(.15, .21)), qY(a));
    }
    const col = pick(zhen ? FL.peony : [...FL.peony, ...FL.hosta, ...FL.chrys]);
    for (let k = 0; k < 3; k++) {
      const a = rnd() * 6.283, r = R(.02, .12);
      B.put('leaf', col, V(x + Math.cos(a) * r, y + Math.sin(a) * r, top + h * R(.85, 1.02)),
        new T.Vector3(R(.09, .13), R(.07, .10), R(.09, .13)));
    }
    if (rnd() > .55) grass(B, x + R(-.2, .2), y + R(-.2, .2), top, 4, .2, { bed: true });
  }
  // 台心一块瘦石，压住画面
  if (w > 3) rock(B, cx + R(-.3, .3), cy + R(-.2, .2), top, .55);
}

/* ---------- 竹林 ---------- */
// 竹竿与草圈一律逐株按脚下 ground 起根：寺院范围内它是台面高度表，
// 范围外走山体函数——逐点贴地永远不会悬空。旧版 terraceZ 把跨台缘的丛
// "整套吸附"到台面高，越界的那半截草圈就挂在立面/山坡半空，已废弃。
function bamboo(B, cx, cy, radius, count, z) {
  for (let i = 0; i < count; i++) {
    const a = rnd() * 6.283, r = Math.sqrt(rnd()) * radius;
    const x = cx + Math.cos(a) * r, y = cy + Math.sin(a) * r;
    // 竹竿起根走 baseZ 兜底：越出台缘的半截降到坡地、探进坡体的抬到坡面。
    // 但调用点整丛悬空（台面常数用在了墙脚/墙外）时必须先坠地：
    // 二进院东墙脚那丛 z=2、台面常数 3，实测就是墙头悬空的一排竹叶。
    const g0 = groundG(x, y);
    const bz = g0 < z - .25 ? g0 : baseZ(x, y, z, .9);
    const h = R(3.6, 6.4) * (1 - r / radius * .18);
    const lx = R(-.5, .5), ly = R(-.5, .5);
    const p0 = V(x, y, bz), p1 = V(x + lx * .38, y + ly * .38, bz + h * .56), p2 = V(x + lx * .85, y + ly * .85, bz + h);
    B.rod(p0, p1, R(.024, .034), pick(P.bamboo));
    B.rod(p1, p2, R(.015, .022), pick(P.bamboo));
    const leaves = 3 + Math.floor(rnd() * 4);
    for (let k = 0; k < leaves; k++) {
      const lv = R(.5, .99), ang = rnd() * 6.283;
      const ex = x + lx * lv + R(-.24, .24), ey = y + ly * lv + R(-.24, .24), ez = bz + h * lv;
      B.rod(V(x + lx * lv * .92, y + ly * lv * .92, ez - R(.08, .3)), V(ex, ey, ez), .007, pick(P.bamboo));
      B.put('leaf', pick(P.bambooLeaf), V(ex, ey, ez),
        new T.Vector3(R(.30, .54), .055, R(.15, .26)), qY(ang));
    }
  }
  for (let i = 0; i < count; i++) {
    const a = rnd() * 6.283, r = .3 + Math.sqrt(rnd()) * radius * 1.15;
    const gx = cx + Math.cos(a) * r, gy = cy + Math.sin(a) * r;
    // 草圈走调用高 z，由 grass() 里的 baseZ 兜底（越缘降、入坡抬）
    grass(B, gx, gy, z, 4, .32);
  }
}

/* ---------- 花木 ---------- */
function blossomTree(B, x, y, z, h, kind) {
  const pal = FL[kind] || FL.crab;
  const lean = R(-.35, .35), lean2 = R(-.25, .25);
  const trunk = t => V(x + lean * t * t, y + lean2 * t * t + Math.sin(t * 3) * .15, z + h * t);
  for (let k = 0; k < 4; k++) B.rod(trunk(k / 4), trunk((k + 1) / 4), .115 - k * .022, '#54452f');
  const n = 6;
  for (let k = 0; k < n; k++) {
    const a = k / n * 6.283 + R(-.3, .3), lvl = R(.44, .74), sp = h * R(.16, .30);
    const from = trunk(lvl);
    const mid = from.clone().add(V(Math.cos(a) * sp * .55, Math.sin(a) * sp * .55, h * .09));
    const end = from.clone().add(V(Math.cos(a) * sp, Math.sin(a) * sp, h * R(.12, .26)));
    B.rod(from, mid, .04, '#5a4a31');
    B.rod(mid, end, .024, '#5d4d33');
    // 花团：三成绿叶打底，七成花，远看才有满树花
    for (let j = 0; j < 4; j++) {
      const cs = h * R(.075, .12);
      const q = end.clone().add(V(R(-.4, .4) * sp * .5, R(-.4, .4) * sp * .5, R(-.1, .1) * h));
      const warm = rnd() > .28;
      B.put('leaf', warm ? pick(pal) : pick(P.leaf), q,
        new T.Vector3(cs * 1.35, cs * .78, cs * 1.1), qY(rnd() * 6.28));
    }
  }
  // 落英：树下一圈花瓣
  for (let i = 0; i < 26; i++) {
    const a = rnd() * 6.283, r = .5 + Math.sqrt(rnd()) * h * .32;
    B.put('leaf', pick(pal), V(x + Math.cos(a) * r, y + Math.sin(a) * r, z + .015),
      new T.Vector3(.05, .012, .04), qY(rnd() * 6.28));
  }
}

/* ---------- 石作 ---------- */
function stoneLantern(B, x, y, z) {
  const s = pick(P.stone);
  B.box(s, x, y, z + .07, .56, .56, .14);
  B.box(pick(P.stone), x, y, z + .20, .40, .40, .12);
  B.put('cyl', s, V(x, y, z + .46), new T.Vector3(.095, .44, .095));
  B.box(s, x, y, z + .72, .34, .34, .10);
  B.box('#6f6656', x, y, z + .88, .26, .26, .22);
  B.put('cone', pick(P.stone), V(x, y, z + 1.06), new T.Vector3(.31, .20, .31), qY(Math.PI / 4));
  B.put('leaf', '#6f6656', V(x, y, z + 1.20), new T.Vector3(.055, .07, .055));
}

function stoneTable(B, x, y, z) {
  const s = pick(P.stone);
  B.put('disc', s, V(x, y, z + .02), new T.Vector3(.36, .07, .36));
  B.put('disc', s, V(x, y, z + .20), new T.Vector3(.13, .34, .13));
  B.put('disc', '#8d8170', V(x, y, z + .40), new T.Vector3(.56, .07, .56));
  for (let k = 0; k < 4; k++) {
    const a = k * 1.5708 + .785;
    const px = x + Math.cos(a) * .92, py = y + Math.sin(a) * .92;
    B.put('disc', s, V(px, py, z + .17), new T.Vector3(.16, .32, .16));
    B.put('disc', '#948872', V(px, py, z + .335), new T.Vector3(.19, .05, .19));
  }
}

// 莲缸：院里常见的大水缸，缸里养几片荷
function waterVat(B, x, y, z) {
  B.put('disc', '#6d6353', V(x, y, z + .30), new T.Vector3(.52, .60, .52));
  B.put('disc', '#8a7f6c', V(x, y, z + .58), new T.Vector3(.56, .07, .56));
  B.put('disc', '#465850', V(x, y, z + .60), new T.Vector3(.47, .03, .47));
  for (let k = 0; k < 5; k++) {
    const a = rnd() * 6.283, r = R(.1, .36);
    B.put('disc', pick(['#3f6b45', '#4a7a4e', '#35603d']),
      V(x + Math.cos(a) * r, y + Math.sin(a) * r, z + .64), new T.Vector3(R(.10, .17), .012, R(.10, .17)), qY(a));
  }
  B.put('leaf', FL.hosta[0], V(x + R(-.1, .1), y + R(-.1, .1), z + .70), new T.Vector3(.06, .05, .06));
}

/* ---------- 铺地：院落里的大块石板，按世界尺寸铺满 ---------- */
function pavingTexture() {
  const S = 512, c = document.createElement('canvas'); c.width = c.height = S;
  const g = c.getContext('2d');
  g.fillStyle = '#6b6152'; g.fillRect(0, 0, S, S);          // 灰缝
  const n = 4, cell = S / n, pad = 2.2;
  for (let j = 0; j < n; j++) for (let i = 0; i < n; i++) {
    const t = 132 + Math.floor(rnd() * 28);
    g.fillStyle = `rgb(${t + 6},${t - 2},${t - 20})`;
    g.fillRect(i * cell + pad, j * cell + pad, cell - pad * 2, cell - pad * 2);
    // 石面斑驳与凿痕
    for (let k = 0; k < 20; k++) {
      const r = rnd() * cell * .3;
      g.fillStyle = `rgba(${96 + rnd() * 56 | 0},${90 + rnd() * 50 | 0},${74 + rnd() * 44 | 0},.10)`;
      g.beginPath(); g.ellipse(i * cell + rnd() * cell, j * cell + rnd() * cell, r, r * .58, rnd() * 3, 0, 6.2832); g.fill();
    }
    g.strokeStyle = 'rgba(110,102,86,.18)'; g.lineWidth = 1;
    for (let k = 0; k < 6; k++) {
      const x0 = i * cell + rnd() * cell, y0 = j * cell + rnd() * cell;
      g.beginPath(); g.moveTo(x0, y0); g.lineTo(x0 + rnd() * 30 - 15, y0 + rnd() * 24 - 12); g.stroke();
    }
  }
  const t = new T.CanvasTexture(c);
  t.colorSpace = T.SRGBColorSpace; t.wrapS = t.wrapT = T.RepeatWrapping; t.anisotropy = 8;
  return t;
}

function paving(scene, rects) {
  const tex = pavingTexture();
  const m = new T.MeshStandardMaterial({ map: tex, roughness: .96 });
  const TILE = 3.42;   // 一块石板约 0.85 米见方
  for (const [x0, x1, y0, y1, z] of rects) {
    const w = x1 - x0, d = y1 - y0;
    const g = new T.PlaneGeometry(w, d);
    const uv = g.attributes.uv;
    for (let i = 0; i < uv.count; i++) uv.setXY(i, uv.getX(i) * w / TILE, uv.getY(i) * d / TILE);
    const mesh = new T.Mesh(g, m);
    mesh.rotation.x = -Math.PI / 2;
    mesh.position.set((x0 + x1) / 2, z + .02, -(y0 + y1) / 2);
    mesh.receiveShadow = true;
    scene.add(mesh);
  }
}

function lawnTexture() {
  const S = 512, c = document.createElement('canvas'); c.width = c.height = S;
  const g = c.getContext('2d');
  g.fillStyle = '#49622f'; g.fillRect(0, 0, S, S);
  // 深浅色斑，草地才有远近
  const patch = ['#4e6735', '#40582b', '#566f3c', '#3a5228', '#5b7440'];
  for (let i = 0; i < 90; i++) {
    const x = rnd() * S, y = rnd() * S, r = 24 + rnd() * 90;
    const grd = g.createRadialGradient(x, y, 0, x, y, r);
    grd.addColorStop(0, pick(patch)); grd.addColorStop(1, 'rgba(73,98,47,0)');
    g.fillStyle = grd; g.beginPath(); g.arc(x, y, r, 0, 6.2832); g.fill();
  }
  // 露土
  for (let i = 0; i < 16; i++) {
    g.fillStyle = 'rgba(112,92,64,.16)';
    g.beginPath(); g.ellipse(rnd() * S, rnd() * S, 8 + rnd() * 26, 5 + rnd() * 16, rnd() * 3, 0, 6.2832); g.fill();
  }
  // 草叶笔触
  const blade = ['#3e5a2a', '#5b7a40', '#6d8c4e', '#48632f', '#7a9455'];
  for (let i = 0; i < 3200; i++) {
    const x = rnd() * S, y = rnd() * S, l = 2 + rnd() * 5, a = -Math.PI / 2 + R(-.7, .7);
    g.strokeStyle = pick(blade); g.globalAlpha = .45 + rnd() * .4; g.lineWidth = 1;
    g.beginPath(); g.moveTo(x, y); g.lineTo(x + Math.cos(a) * l, y + Math.sin(a) * l); g.stroke();
  }
  g.globalAlpha = 1;
  const t = new T.CanvasTexture(c);
  t.colorSpace = T.SRGBColorSpace; t.wrapS = t.wrapT = T.RepeatWrapping; t.anisotropy = 8;
  return t;
}

function lawn(scene, rects) {
  const tex = lawnTexture();
  const m = new T.MeshStandardMaterial({ map: tex, roughness: 1 });
  const TILE = 5.2;
  for (const [x0, x1, y0, y1, z] of rects) {
    const w = x1 - x0, d = y1 - y0;
    const g = new T.PlaneGeometry(w, d);
    const uv = g.attributes.uv;
    for (let i = 0; i < uv.count; i++) uv.setXY(i, uv.getX(i) * w / TILE, uv.getY(i) * d / TILE);
    const mesh = new T.Mesh(g, m);
    mesh.rotation.x = -Math.PI / 2;
    mesh.position.set((x0 + x1) / 2, z + .012, -(y0 + y1) / 2);
    mesh.receiveShadow = true;
    scene.add(mesh);
  }
}

/* ---------- 主入口 ---------- */
export function buildGarden(scene, opts = {}) {
  const ground = opts.ground || (() => 0);
  groundG = ground;
  hillG = opts.hill || (() => -999);
  const B = batcher();

  // 只铺中轴与殿前，南半边留作园地：水池、古树、竹丛都长在土上
  paving(scene, [
    [-51.8, -18.35, -3.0, 29.4, .35],                   // 一进院中轴与文殊殿前
    [-18.3, 2.95, 2.55, 29.4, 2],                       // 二进院北
    [-18.3, 2.95, -29.4, -2.55, 2],                     // 二进院南
    [-14.45, 2.95, -2.55, 2.55, 2],                     // 二进院中轴（坡道以东）
    [2.95, 37.5, 2.7, 32.6, 13], [2.95, 37.5, -32.6, -2.7, 13]
  ]);
  // 一进院南侧的园地：一片真草地
  lawn(scene, [[-51.6, -18.55, -29.3, -3.05, .35]]);

  /* ===== 一、一进院 · 莲池 ===== */
  let waterMat = null;
  const pond = { x: -30.2, y: -8.4, w: 6.4, d: 4.4, z: .35 };
  {
    const { x, y, w, d, z } = pond;
    // 池岸：一圈条石，内侧再压一层矮石
    for (const [cx, cy, ww, dd] of [
      [x, y - d / 2, w + .5, .5], [x, y + d / 2, w + .5, .5],
      [x - w / 2, y, .5, d], [x + w / 2, y, .5, d]
    ]) {
      const n = Math.max(2, Math.round(Math.max(ww, dd) / 1.1));
      for (let i = 0; i < n; i++) {
        const t = (i + .5) / n - .5;
        B.box(pick(P.stone), cx + t * ww * (ww > dd ? 1 : 0), cy + t * dd * (dd > ww ? 1 : 0), z + .08,
          (ww > dd ? ww / n : ww) - .02, (dd > ww ? dd / n : dd) - .02, .16);
      }
    }
    // 水面
    const c = document.createElement('canvas'); c.width = c.height = 256;
    const g2 = c.getContext('2d');
    g2.fillStyle = '#3c5661'; g2.fillRect(0, 0, 256, 256);
    for (let i = 0; i < 46; i++) {
      const rx = rnd() * 256, ry = rnd() * 256, rr = 8 + rnd() * 42;
      const grd = g2.createRadialGradient(rx, ry, rr * .2, rx, ry, rr);
      grd.addColorStop(0, 'rgba(150,180,190,.20)');
      grd.addColorStop(1, 'rgba(60,86,97,0)');
      g2.fillStyle = grd; g2.beginPath(); g2.ellipse(rx, ry, rr, rr * .45, 0, 0, 6.2832); g2.fill();
    }
    for (let i = 0; i < 26; i++) {
      g2.strokeStyle = `rgba(200,218,224,${.05 + rnd() * .07})`;
      g2.lineWidth = .8 + rnd();
      g2.beginPath(); g2.ellipse(rnd() * 256, rnd() * 256, 14 + rnd() * 34, 5 + rnd() * 12, 0, 0, 6.2832); g2.stroke();
    }
    const wtex = new T.CanvasTexture(c);
    wtex.colorSpace = T.SRGBColorSpace; wtex.wrapS = wtex.wrapT = T.RepeatWrapping; wtex.repeat.set(1.6, 1.2);
    waterMat = new T.MeshStandardMaterial({ map: wtex, color: '#a9bcb2', roughness: .22, metalness: .18, transparent: true, opacity: .86 });
    const water = new T.Mesh(new T.PlaneGeometry(w - .55, d - .55), waterMat);
    water.rotation.x = -Math.PI / 2;
    water.position.set(x, z + .125, -y);
    water.receiveShadow = true;
    water.name = 'pondWater';
    water.userData.noPaint = true;   // 笔触层豁免：水面必须保持真实材质才能做镜面反射
    scene.add(water);
    // 池底下沉做出真实水深（水面在 z+.125，池底顶在 z-.22，水深约 .34）
    B.box('#7b8175', x, y, z - .28, w - .24, d - .24, .12);
    // 池底卵石/砂砾，透过清水能看到
    for (let i = 0; i < 100; i++) {
      const px = x + (rnd() - .5) * (w - .7), py = y + (rnd() - .5) * (d - .7);
      const rr = R(.04, .13);
      B.put('ball', pick(['#6b6f63', '#8a8e7f', '#5e6358', '#9a9c8d']),
        V(px, py, z - .20), new T.Vector3(rr, rr * .45, rr), qY(rnd() * 6.28));
    }
    // 池底水草：细茎+小叶，从池底长起、没入水面之下。
    // 与岸上草木统一为笔触表达：不打 noPaint 豁免，交给常驻笔触层隐藏原几何、撒成刷痕点。
    const weedB = batcher();
    const weedCols = ['#4d8a4e', '#5d9d58', '#3f7846', '#6aa862'];
    for (let i = 0; i < 24; i++) {
      // 水草成丛：先定丛心，再在丛心周围长一小簇，避免满池均匀散点
      const cx = x + (rnd() - .5) * (w - 1.2), cy = y + (rnd() - .5) * (d - 1.0);
      const top = Math.min(z - .22 + R(.26, .44), z + .10);   // 顶端始终在水面下
      const stems = 5 + Math.floor(rnd() * 4);
      for (let k = 0; k < stems; k++) {
        const sx = cx + R(-.16, .16), sy = cy + R(-.14, .14);
        const bx = sx + R(-.14, .14), by = sy + R(-.12, .12);
        const col = pick(weedCols);
        weedB.rod(V(sx, sy, z - .21), V(bx, by, top), .011, col);
        // 茎上中下三片叶，像一株水草而不是一个点
        for (let q = 0; q < 3; q++) {
          const f = .45 + q * .25;
          const lx = sx + (bx - sx) * f + R(-.05, .05);
          const ly = sy + (by - sy) * f + R(-.05, .05);
          const lz = (z - .21) + (top - (z - .21)) * f;
          weedB.put('leaf', col, V(lx, ly, lz), new T.Vector3(.075, .11, .022), qY(rnd() * 6.28));
        }
      }
    }
    weedB.flush(scene);   // 水草进笔触层：leaf 实例带 plantInstances=true，会被采成刷痕点

    // 荷叶与荷花
    const padCols = ['#3f6b45', '#4a7a4e', '#35603d', '#55815a', '#5d8a5e'];
    for (let i = 0; i < 15; i++) {
      const a = rnd() * 6.283, r = Math.sqrt(rnd());
      const px = x + Math.cos(a) * r * (w * .40), py = y + Math.sin(a) * r * (d * .38);
      const rr = R(.18, .38);
      // 一半浮在水面，一半撑出水面，池子才有高差
      const out = rnd() > .58;
      const pz = z + (out ? R(.22, .40) : .135);
      if (out) B.rod(V(px, py, z + .14), V(px, py, pz), .011, '#4a6b3f');
      const tilt = new T.Quaternion().setFromEuler(new T.Euler(R(-.09, .09), rnd() * 6.28, R(-.09, .09)));
      B.put('disc', pick(padCols), V(px, py, pz), new T.Vector3(rr, .012, rr), tilt);
      if (rnd() > .76) {
        // 一朵荷：七八瓣围着莲心，花瓣略向外张
        const fz = pz + .08;
        for (let k = 0; k < 8; k++) {
          const fa = k / 8 * 6.283;
          const pq = new T.Quaternion().setFromEuler(new T.Euler(.42, fa, 0, 'YXZ'));
          B.put('leaf', k % 2 ? '#f4e8e6' : '#eccbd3',
            V(px + Math.cos(fa) * .06, py + Math.sin(fa) * .06, fz + .03),
            new T.Vector3(.045, .085, .03), pq);
        }
        B.put('leaf', '#e8cf82', V(px, py, fz + .03), new T.Vector3(.04, .035, .04));
      }
    }
    // 岸边石组
    rock(B, x - w / 2 - .38, y + .9, z, .55);
    rock(B, x - w / 2 - .12, y - 1.2, z, .40);
    rock(B, x + w / 2 + .34, y - .6, z, .62);
    rock(B, x + 1.5, y + d / 2 + .48, z, .34);
    stoneLantern(B, x + w / 2 + 1.5, y + d / 2 + .9, z);
    // 岸边的草往水里探一点，池子才不像个水槽
    for (let i = 0; i < 26; i++) {
      const a = i / 26 * 6.283;
      const px = x + Math.cos(a) * (w / 2 + R(.1, .55));
      const py = y + Math.sin(a) * (d / 2 + R(.1, .55));
      grass(B, px, py, z + .02, 5, .38);
      if (rnd() > .6) turf(B, px, py, z, R(.25, .45));
    }
  }

  /* ===== 二、一进院 · 文殊殿前 ===== */
  {
    const z = .35;
    // 殿前长花带，避开正中踏步
    borderX(B, -47.2, -16.8, 9.55, z, 1.55, 1, [-34.6, -29.4]);
    // 对植两座牡丹台
    parterre(B, -40.7, 5.7, 6.6, 2.2, z, true);
    parterre(B, -27.9, 5.7, 6.6, 2.2, z, true);
    // 伽蓝殿前
    borderX(B, -37.2, -25.0, -16.35, z, 1.35, -1, [-33.4, -28.6]);
    // 西墙根、南墙根
    borderX(B, -51.2, -46.6, -28.6, z, 1.25, 1);
    borderX(B, -23.4, -18.6, -28.6, z, 1.25, 1);
    soilBedY(B, -25.4, -8.6, -51.2, 1.3, z);
    for (let y = -25; y < -9; y += .52) {
      shrub(B, -50.6 + R(-.25, .25), y, z + .1, R(.4, .62), R(.8, 1.35), rnd() > .65 ? P.deep : P.leaf);
      if (rnd() > .5) grass(B, -50.0 + R(-.15, .15), y, z + .1, 3, .3);
    }
    // 莲池西北的竹丛与石组
    bamboo(B, -47.6, -13.6, 1.7, 16, z);
    bamboo(B, -20.6, -26.6, 1.5, 14, z);
    stoneTable(B, -22.2, -5.4, z);

    // 花木：玉兰与海棠各一株，补在空当里
    blossomTree(B, -45.0, 3.6, z, 5.6, 'magnolia');
    blossomTree(B, -20.8, 3.4, z, 5.2, 'crab');
    blossomTree(B, -43.0, -17.6, z, 5.0, 'crab');

    // 草地：先铺草皮，再插草叶，最后点几朵野花
    for (let i = 0; i < 260; i++) {
      const x = R(-51.4, -18.7), y = R(-28.8, -3.3);
      if (x > -38.2 && x < -23.8 && y < -16.2) continue;              // 伽蓝殿
      if (x > -34.9 && x < -25.5 && y > -11.4 && y < -5.4) continue;  // 池子
      if (rnd() > .93) turf(B, x, y, z, R(.20, .30));
    }
    for (let i = 0; i < 520; i++) {
      const x = R(-51.4, -18.7), y = R(-28.8, -3.3);
      if (x > -38.2 && x < -23.8 && y < -16.2) continue;
      if (x > -34.9 && x < -25.5 && y > -11.4 && y < -5.4) continue;
      grass(B, x, y, z, 6, .40);
      if (rnd() > .9) flower(B, x, y, z, R(.18, .34), pick(FL.aster), .045);
      if (rnd() > .96) rock(B, x, y, z, R(.1, .2));
    }
    // 汀步：从轴线上折进园子，走到池边
    for (const [px, py] of [[-33.4, -3.6], [-32.6, -4.2], [-31.8, -4.7], [-31.0, -5.1], [-30.4, -5.45]]) {
      B.put('disc', pick(P.stone), V(px, py, z + .03), new T.Vector3(.30, .05, .24), qY(R(-.3, .3)));
    }
  }

  /* ===== 三、二进院 ===== */
  {
    const z = 2;
    // 香风花雨楼前一排花台
    borderX(B, -16.8, -5.0, 18.95, z, 1.45, 1);
    // 庭堂、客堂前
    borderX(B, -16.4, -3.6, -9.1, z, 1.3, -1);
    // 东侧挡土墙根：整排竹，遮住台地与院子的接缝
    // 丛心东移贴墙（墙在 x=2.95），丛心 y 收进 ±18：草圈外沿 2.4m，
    // 不再探进中轴大坡道，也不越过二进院北墙基。
    bamboo(B, 1.8, 12.2, 1.05, 22, z);
    bamboo(B, 1.8, 3.4, .95, 12, z);
    soilBedY(B, -2.4, 17.8, 2.55, 1.0, z);
    for (let y = -2; y < 17.6; y += .6) {
      // 空出两段：① 2.6~9.4 给台地的豁口；② 主轴上台阶口（|y|<2.6，
      // 台阶楔 x -7.74→3 正好从这里钻出台面）——原先起点 y=-2 那一丛
      // 正堵在台阶出口，人爬上来第一眼就撞一脸树叶。
      if ((y > 2.6 && y < 9.4) || Math.abs(y) < 2.9) continue;
      // 起点贴实际地面（shrub 内部 baseZ 信任脚下）：调用点从台面常数改为
      // 地面+0.1，越过挡土墙翻上墙顶的绿篱会随点坠回院地。
      const sy = 2.55 + R(-.2, .2);
      shrub(B, sy, y, ground(sy, y) + .1, R(.35, .55), R(.6, 1.1), P.leaf);
    }
    // 文殊殿东山墙后的一窄条竹篱，遮住台地高差
    bamboo(B, -17.3, 13.6, .8, 12, z);
    bamboo(B, -17.3, 6.2, .75, 9, z);
    // 石桌与莲缸
    stoneTable(B, -9.6, 8.2, z);
    waterVat(B, -13.8, 8.8, z);
    waterVat(B, -4.4, 2.4, z);
    // 院里两株花木：海棠、紫薇，花期满院颜色
    blossomTree(B, -15.2, 6.2, z, 5.4, 'crab');
    blossomTree(B, -4.6, 14.4, z, 5.0, 'crape');
    // 券门墙根的窄花带，把这片空场收住
    for (const [y0, y1] of [[3.6, 14.2], [-14.2, -3.6]]) {
      soilBedY(B, y0, y1, -7.2, .95, z);
      for (let y = y0 + .3; y < y1; y += .5) {        shrub(B, -7.5 + R(-.22, .22), y, z + .1, R(.3, .45), R(.5, .9), P.deep);
        if (rnd() > .5) flower(B, -6.9 + R(-.12, .12), y, z + .1, R(.3, .5), pick(FL.hosta), R(.05, .08));
      }
    }
    stoneLantern(B, -9.2, 4.3, z);
    stoneLantern(B, -9.2, -4.3, z);
    for (let i = 0; i < 26; i++) {
      // 收紧到院墙以内（墙在 y=-30/+31）：越界的苔点会按台面高钉到山坡半空
      const x = R(-17.4, 1.2), y = R(-19.4, 18.2);
      if (Math.abs(y) < 3.0 || Math.abs(y) > 29.4) continue;
      if (x > -16.6 && x < -3.3 && y > -16.5 && y < -9.6) continue;   // 庭堂
      if (x > -16.2 && x < -3.8 && y > -25.2 && y < -18.8) continue;  // 客堂
      // 同三进撒点：贴实际地面高（撒点框已收紧到院内，此处兜底）
      moss(B, x, y, ground(x, y) + .012, R(.16, .3));
    }
    // 二进院东缘台基线：苔点从台面内 0.35m（x=2.6）起铺，不再压在
    // 台缘立面上——原来 x=2.72 距台基边只剩 0.05m，青苔一半悬在墙外。
    mossStripY(B, -16.4, 18.2, 2.6, z);
  }

  /* ===== 四、三进高台 · 殿前 ===== */
  {
    const z = 13;
    // 四轮P1-1：北侧花池原来正抵着铜钟（模型 9.6,-4.6；池 9.9,4.6），
    // 粉花叶贴钟腹、像从钟里长出来。花池整体北移 1.6m，给钟体让出
    // ≥0.4m 摆动净空，钟下缘轮廓保持连续可读。
    parterre(B, 9.9, 6.2, 2.6, 1.6, z, true);
    parterre(B, 9.9, -4.6, 2.6, 1.6, z, true);
    stoneLantern(B, 6.4, 6.4, z);
    stoneLantern(B, 6.4, -6.4, z);
    // 大殿两侧的窄花带
    soilBedY(B, -18.6, -12.4, 11.4, 1.2, z);
    soilBedY(B, 12.4, 18.6, 11.4, 1.2, z);
    for (let y = 12.6; y < 18.6; y += .55) {
      shrub(B, 11.4 + R(-.25, .25), y, z + .1, R(.38, .58), R(.7, 1.2), P.deep);
    }
    for (let y = -18.6; y < -12.4; y += .55) {
      shrub(B, 11.4 + R(-.25, .25), y, z + .1, R(.38, .58), R(.7, 1.2), P.deep);
    }
    // 万善堂、关帝殿背后的竹丛
    // 竹丛一律离台缘和花池 ≥ 草圈外沿（radius*2.4 ≈ 3.1m），否则草圈
    // 会铺到台外的山坡/花池上，按台面常数起根就是悬空十几米的绿点。
    bamboo(B, 4.2, 25.4, 1.4, 16, z);
    bamboo(B, 4.2, -24.6, 1.4, 16, z);
    bamboo(B, 20.0, 20.6, 1.3, 12, z);
    bamboo(B, 22.4, -20.4, 1.4, 14, z);
    for (let i = 0; i < 30; i++) {
      const x = R(3.3, 37.5), y = R(-32, 32);
      if (x > 10.4 && x < 33.6 && Math.abs(y) < 19.8) continue;      // 大殿与台明
      if (x > 5.6 && x < 18.4 && y > 22.2) continue;                 // 万善堂
      if (x > 6.1 && x < 17.9 && y < -21.4) continue;                // 关帝殿
      if (x > 29.9 && y < -21.9) continue;                            // 祖师塔
      // 撒点必须贴【实际地面】：这个撒点框伸到了台外，山体地面忽高忽低，
      // 原来一律按台面高 z=13 撒，台外的苔草就飘在半空（航拍里一片绿点）。
      const mz = ground(x, y);
      moss(B, x, y, mz + .012, R(.2, .42));
      if (rnd() > .55) grass(B, x, y, mz + .012, 4, .26);
    }
    // 东端超出 x=27 台缘的部分会悬在山坡半空，截到台缘以内
    mossStripX(B, 3.6, 26.8, -32.0, z);
    mossStripX(B, 19.2, 26.8, 32.0, z);
  }

  /* ===== 五、院墙外侧的野趣 ===== */
  {
    const hill = opts.hill;
    if (hill) {
      // 院墙外一圈杂树，把寺院的轮廓围进山里。
      // 定根高一律走 ground(x, y)：寺院范围外它就是 hill(x, -y)。
      // 以前直接拿 hill(x, y)，山体坐标与地面坐标的 y 互为相反数，
      // 东墙外补的那一列树全被钉到南坡的地上，航拍里整片扎在半空。
      const wild = (x, y, h) => {
        const z = ground(x, y);
        const lean = R(-.4, .4);
        for (let k = 0; k < 3; k++) {
          B.rod(V(x, y, z + h * k / 3), V(x + lean * (k + 1) * .18, y + R(-.2, .2), z + h * (k + 1) / 3),
            .16 - k * .045, '#4d432f');
        }
        const n = 4 + Math.floor(rnd() * 3);
        for (let k = 0; k < n; k++) {
          const a = rnd() * 6.283, r = h * R(.08, .26);
          B.put('canopy', rnd() > .45 ? pick(P.deep) : pick(P.leaf),
            V(x + Math.cos(a) * r, y + Math.sin(a) * r, z + h * R(.55, .95)),
            new T.Vector3(h * R(.13, .22), h * R(.08, .13), h * R(.12, .20)), qY(a));
        }
      };
      for (let i = 0; i < 190; i++) {
        const x = R(-58, 46), y = (rnd() < .5 ? -1 : 1) * R(34.6, 56);
        wild(x, y, R(4.2, 9.6));
      }
      for (let i = 0; i < 70; i++) {
        const x = R(39.5, 66), y = R(-40, 40);
        wild(x, y, R(4.5, 10.5));
      }
      for (let i = 0; i < 220; i++) {
        const x = R(-58, 46), y = (rnd() < .5 ? -1 : 1) * R(33.6, 52);
        const z = ground(x, y);
        if (z > 30) continue;
        // （此处原本就用 ground(x,y)，坐标正确，保留）
        shrub(B, x, y, z, R(.45, .95), R(.5, 1.4), rnd() > .5 ? P.deep : P.leaf);
        if (rnd() > .5) grass(B, x + R(-.6, .6), y + R(-.6, .6), z, 4, .3);
      }
    }
  }

  /* ===== 六、树池：每株庭树下都有土、草与石 ===== */
  {
    const TREES = [
      // 一进院
      [-42, -10, .35], [-46.4, 7.2, .35], [-25, -12, .35], [-17.2, 7.2, .35],
      [-39.4, -15.4, .35], [-35.4, -7.0, .35], [-39.0, -9.4, .35], [-22.4, -9.6, .35],
      [-19.6, 8.8, .35], [-48, -13.6, .35], [-24, -14.6, .35], [-43.2, -6.0, .35],
      [-49, 9.6, .35], [-26.6, -13.8, .35], [-27.4, -17.6, .35], [-20.8, 3.4, .35],
      [-43, -17.6, .35],
      // 二进院
      [-13, 12, 2], [-13, -7, 2], [-16.9, -8.8, 2], [-9.0, 17.6, 2], [-3.2, 17.6, 2],
      [-10.4, 15.6, 2], [-2.0, -14.8, 2], [.8, 14.6, 2], [-15.2, 6.2, 2], [-4.6, 14.4, 2],
      // 三进高台
      [8, -8.7, 13], [8, 9.7, 13], [30, 25, 13], [34, -29, 13], [35, 24, 13],
      [4.6, -14.2, 13], [4.6, 15.2, 13], [8.4, -21, 13], [16.6, -20.7, 13],
      [8, 21.6, 13], [17.2, 21.4, 13], [5.2, 17.4, 13], [7.6, -15.2, 13],
      [4.2, 9.4, 13], [8.8, 16.6, 13], [10.6, -17.4, 13], [16.4, 18.2, 13],
      [24.2, -18.6, 13], [30.2, 17.8, 13]
    ];
    for (const [x, y] of TREES) {
      if (Math.abs(y) < 3.4) continue;
      // 树池跟树同根：定高走实际地面。列表里 x>27 / |y|>33 的几株其实站在
      // 山坡上（山门外、台东的坡地），按台面常数 13 挖池就悬在半空。
      const z = ground(x, y);
      const r = R(1.0, 1.35);
      if (z > 1) B.put('disc', P.soil, V(x, y, z + .025), new T.Vector3(r, .022, r * R(.85, 1.05)));
      treePit(B, x, y, z + .02, r);
    }
  }

  B.flush(scene);

  /* ===== 六、活物：锦鲤与蝴蝶 ===== */
  const butterflies = [];
  const wingGeo = new T.PlaneGeometry(.20, .15);
  wingGeo.rotateX(-Math.PI / 2);
  wingGeo.translate(0, 0, .095);
  const bfBody = new T.CylinderGeometry(.011, .009, .30, 6);
  bfBody.rotateZ(Math.PI / 2);
  const bfMat = [mat('#e8d9a0'), mat('#f0f0ea'), mat('#d8a86a'), mat('#c9d8e0')];
  const bfBodyMat = mat('#4b4038');
  const spots = [[-40.9, 6.0, .55], [-27.7, 6.0, .55], [-30.2, -5.4, .5], [-11.0, 18.8, 2.2],
    [-9.4, -9.3, 2.2], [-45.2, 3.4, .55], [10.0, 4.4, 13.2], [2.0, 12.6, 2.2]];
  for (let i = 0; i < 8; i++) {
    const s = spots[i];
    const g = new T.Group();
    const m = bfMat[i % bfMat.length];
    g.add(new T.Mesh(bfBody, bfBodyMat));
    for (const side of [1, -1]) {
      const pivot = new T.Group();
      const w = new T.Mesh(wingGeo, m);
      if (side < 0) w.scale.z = -1;
      pivot.add(w);
      g.add(pivot);
      g.userData[side > 0 ? 'r' : 'l'] = pivot;
    }
    scene.add(g);
    butterflies.push({ g, home: s, ph: rnd() * 6.28, sp: R(.5, 1.1), r: R(.8, 2.2) });
  }

  return {
    tick(now, dt) {
      const t = now / 1000;
      // 水纹缓慢东流
      if (waterMat && waterMat.map && dt > 0) {
        waterMat.map.offset.x += dt * .004;
        waterMat.map.offset.y += dt * .0022;
      }
      for (const b of butterflies) {
        const k = t * b.sp + b.ph;
        const x = b.home[0] + Math.cos(k * 1.3) * b.r;
        const y = b.home[1] + Math.sin(k * .9) * b.r * .7;
        const z = b.home[2] + .45 + Math.sin(k * 2.1) * .28;
        b.g.position.set(x, z, -y);
        b.g.rotation.y = -k * 1.3;
        const flap = Math.sin(t * 14 + b.ph) * .85;
        b.g.userData.l.rotation.x = -.25 - flap;
        b.g.userData.r.rotation.x = -.25 - flap;
      }
    }
  };
}
