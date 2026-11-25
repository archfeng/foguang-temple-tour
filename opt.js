/* 静态几何烘焙
 *
 * 大殿的斗栱、门钉、椽子、勾栏，各是一个独立网格；手机每一帧要为它们
 * 各发一次绘制命令，一千多次，驱动就吃满了。这些东西不会动，同材质
 * 完全可以烘成一整块——三角形一样多，绘制次数少一个量级。
 *
 * 安全边界：带 userData 的东西一律不碰。场景里会动的（香、烟、签筒、
 * 铜钱、猫、风铎、锦鲤、蝴蝶、自己的小人）都在各模块里挂了标记，
 * 或者是带 noHit 的小人部件，这里靠这条规则整批放过。
 */
import {Q} from './quality.js?v=20261112h';

const T = window.THREE;

function touched(o) {
  for (let p = o; p; p = p.parent) {
    const u = p.userData;
    if (u && Object.keys(u).length) return true;
    if (p.isLight || p.isCamera) return true;
  }
  return false;
}

// 把一个材质（或一套着色参数）下的网格，按世界坐标拼成一整块
function concat(items, material, tint) {
  const parts = [];
  for (const it of items) {
    const g = it.geometry.clone();
    g.applyMatrix4(it.matrixWorld);
    for (const k of Object.keys(g.attributes)) {
      if (!(g.attributes[k].array instanceof Float32Array)) return null;
    }
    parts.push(g);
  }
  if (parts.length < 2) return null;

  const out = new T.BufferGeometry();
  // Keep shared vertices when the original mesh is indexed.
  const vertexCount = parts.reduce((sum, g) => sum + g.attributes.position.count, 0);
  const indexCount = parts.reduce((sum, g) => sum + (g.index?.count ?? g.attributes.position.count), 0);
  const indices = vertexCount > 65535 ? new Uint32Array(indexCount) : new Uint16Array(indexCount);
  let indexOffset = 0;
  let vertexOffset = 0;
  for (const g of parts) {
    const count = g.index?.count ?? g.attributes.position.count;
    for (let i = 0; i < count; i++) indices[indexOffset++] = vertexOffset + (g.index ? g.index.getX(i) : i);
    vertexOffset += g.attributes.position.count;
  }
  out.setIndex(new T.BufferAttribute(indices, 1));
  // 走顶点色重染时颜色由 tint 重算，原来的 color 属性要丢掉；否则原样保留
  const names = Object.keys(parts[0].attributes).filter(n => !(tint && n === 'color'));
  for (const name of names) {
    const itemSize = parts[0].attributes[name].itemSize;
    let total = 0;
    for (const p of parts) total += p.attributes[name].count;
    const arr = new Float32Array(total * itemSize);
    let off = 0;
    for (const p of parts) {
      const a = p.attributes[name];
      arr.set(a.array.subarray(0, a.count * itemSize), off);
      off += a.count * itemSize;
    }
    out.setAttribute(name, new T.BufferAttribute(arr, itemSize));
  }

  // 颜色烘进顶点：材质本身的 color 一律留白，否则会和顶点色叠乘
  if (tint) {
    let total = 0;
    for (const p of parts) total += p.attributes.position.count;
    const col = new Float32Array(total * 3);
    let off = 0;
    for (let i = 0; i < parts.length; i++) {
      const p = parts[i];
      const n = p.attributes.position.count;
      const c = items[i].__tint;
      const own = p.attributes.color;
      for (let v = 0; v < n; v++) {
        const k = (off + v) * 3;
        const r = own ? own.array[v * own.itemSize] : 1;
        const g2 = own ? own.array[v * own.itemSize + 1] : 1;
        const b = own ? own.array[v * own.itemSize + 2] : 1;
        col[k] = c[0] * r; col[k + 1] = c[1] * g2; col[k + 2] = c[2] * b;
      }
      off += n;
    }
    out.setAttribute('color', new T.BufferAttribute(col, 3));
  }

  const mesh = new T.Mesh(out, material);
  mesh.castShadow = items.some(i => i.castShadow);
  mesh.receiveShadow = items.some(i => i.receiveShadow);
  return mesh;
}

function collect(root, filter) {
  root.updateMatrixWorld(true);
  const buckets = new Map();
  root.traverse(o => {
    if (!o.isMesh || o.isInstancedMesh || o.isSkinnedMesh) return;
    const m = o.material;
    if (!m || Array.isArray(m)) return;
    if (m.transparent || m.opacity < 1 || m.isShaderMaterial || m.depthWrite === false) return;
    if (o.children.length) return;            // 有子节点的不动，免得拆散层级
    if (touched(o)) return;
    const g = o.geometry;
    if (!g || !g.attributes.position) return;
    if (g.drawRange.start !== 0 || Number.isFinite(g.drawRange.count) || o.matrixWorld.determinant() <= 0) return;
    const group = filter(o, m, g);
    if (!group) return;
    const layout = Object.entries(g.attributes).map(([name, attribute]) =>
      name + ':' + attribute.itemSize + ':' + attribute.normalized).sort().join(',');
    const key = group + '|' + layout + '|' + Number(o.castShadow) + Number(o.receiveShadow);
    if (!buckets.has(key)) buckets.set(key, []);
    buckets.get(key).push(o);
  });
  return buckets;
}

function apply(root, buckets, makeMaterial) {
  let merged = 0, born = 0;
  for (const [key, items] of buckets) {
    if (items.length < 3) continue;
    const built = makeMaterial(key, items);
    if (!built) continue;
    const mesh = concat(items, built.material, built.tint);
    if (!mesh) continue;
    root.add(mesh);
    for (const it of items) it.removeFromParent();
    merged += items.length;
    born++;
  }
  return {merged, born};
}

/* 第一遍：材质完全相同，直接合批。没有视觉代价，桌面也一起做 */
export function bakeStatic(root) {
  const buckets = collect(root, (o, m, g) => {
    const attrs = Object.keys(g.attributes).sort().join(',');
    if (!attrs) return null;
    return m.uuid + '|' + attrs;
  });
  let materialOf = new Map();
  for (const items of buckets.values()) {
    if (!materialOf.has(items[0].material.uuid)) materialOf.set(items[0].material.uuid, items[0].material);
  }
  const res = apply(root, buckets, (key) => {
    const uuid = key.split('|')[0];
    const m = materialOf.get(uuid);
    return m ? {material: m} : null;
  });
  return res.merged ? res : null;
}

/* 第二遍：贴图与表面参数相同、只有颜色不同的，也并成一批，
 * 颜色烘到顶点色里。门钉、椽头、斗栱这些小件大多是这种情况。 */
export function bakeColored(root) {
  if (!Q.low) return null;
  const buckets = collect(root, (o, m, g) => {
    if (!m.isMeshStandardMaterial || m.isMeshPhysicalMaterial) return null;
    if (m.userData.weathered) return null;
    if (m.emissive && m.emissive.getHex() !== 0) return null;
    if (m.aoMap || m.lightMap || m.alphaTest > 0) return null;
    const mapKey = m.map
      ? [m.map.uuid, m.map.repeat.x, m.map.repeat.y, m.map.offset.x, m.map.offset.y].join(':')
      : '-';
    const bumpKey = m.bumpMap
      ? [m.bumpMap.uuid, m.bumpScale, m.bumpMap.repeat.x, m.bumpMap.repeat.y].join(':')
      : '-';
    const key = [mapKey, bumpKey, m.roughness, m.metalness, m.side, m.flatShading ? 1 : 0,
      m.normalMap ? m.normalMap.uuid : '-', m.normalScale?.toArray().join(','),
      m.vertexColors ? 1 : 0, g.attributes.uv ? 1 : 0, m.depthTest, m.depthFunc,
      m.polygonOffset, m.polygonOffsetFactor, m.polygonOffsetUnits].join('|');
    o.__tint = [m.color.r, m.color.g, m.color.b];
    return key;
  });

  const cache = new Map();
  return apply(root, buckets, (key, items) => {
    if (!cache.has(key)) {
      const m = items[0].material.clone();
      m.vertexColors = true;
      m.color.setHex(0xffffff);
      cache.set(key, m);
    }
    return {material: cache.get(key), tint: true};
  });
}
