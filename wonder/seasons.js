/* 四时地貌层：春花、夏荫、秋叶、冬雪。
 * 关键：季节差异不只体现在叶色，而是真的把地面、台地、瓦顶、树冠「覆盖」一遍。
 * 每季一个独立 Group，切换只改 visible，零逐帧开销。
 * 上层落点用一次向下的射线采样，自动贴合原有屋顶与墙顶，不猜高度。
 */
const SEASONS = ['spring', 'summer', 'autumn', 'winter'];

/* 原场景草木的换季：园林是 InstancedMesh，烘焙的建筑是普通 Mesh（顶点色里混了各色），
 * 后者一律跳过，免得把斗栱、板门也染黄。 */
const FOLIAGE_SHIFT = {
  spring: { h: -.012, s: 1.06, l: 1.10, warm: 0 },
  summer: { h: 0,     s: 1.00, l: 1.00, warm: 0 },
  autumn: { h: -.105, s: 1.18, l: .92,  warm: .30 },
  winter: { h: -.020, s: .30,  l: .84,  warm: 0 }
};
const FLOWER_SHIFT = {
  spring: { s: 1.14, l: 1.06 },
  summer: { s: 1.00, l: 1.00 },
  autumn: { s: .55,  l: .78 },
  winter: { s: .12,  l: .72 }
};

export function initSeasons(ctx){
  const T = ctx.T, root = ctx.root;
  const layers = {}, batches = {};
  for (const s of SEASONS){
    const g = new T.Group(); g.name = 'Season_' + s; g.visible = false;
    root.add(g); layers[s] = g; batches[s] = miniBatch(T, g);
  }

  function miniBatch(T, parent){
    const geo = {
      box : new T.BoxGeometry(1,1,1),
      sph : new T.IcosahedronGeometry(1,0),
      cone: new T.ConeGeometry(1,1,5),
      cyl : new T.CylinderGeometry(1,1,1,6)
    };
    const piles = new Map();
    const M = new T.Matrix4(), Q = new T.Quaternion(), E = new T.Euler();
    const P = new T.Vector3(), S = new T.Vector3();
    return {
      add(kind, color, pos, scale, rot){
        const key = kind + '|' + color;
        if (!piles.has(key)) piles.set(key, []);
        P.set(pos[0], pos[1], pos[2]); S.set(scale[0], scale[1], scale[2]);
        if (rot) Q.copy(rot); else { E.set(0,0,0); Q.setFromEuler(E); }
        M.compose(P, Q, S);
        piles.get(key).push(M.clone());
      },
      flush(roughness = .97){
        for (const [key, list] of piles){
          const [kind, color] = key.split('|');
          const m = new T.MeshStandardMaterial({ color, roughness, metalness: 0 });
          const im = new T.InstancedMesh(geo[kind], m, list.length);
          list.forEach((mm,i)=>im.setMatrixAt(i, mm));
          im.instanceMatrix.needsUpdate = true;
          // 积雪/落叶/花瓣等覆盖层：接收阴影收益极低，却让四季层参与 shadow 采样；
          // 关掉以减轻 shadow pass（threejs-performance 技能：覆盖层通常不需要接收阴影）
          im.receiveShadow = false;
          im.castShadow = false;
          im.userData.wonderSeason = true;
          parent.add(im);
        }
        piles.clear();
      }
    };
  }

  let seed = 771103;
  const rnd = () => ((seed = (Math.imul(1664525,seed)+1013904223)>>>0)/4294967296);
  const R = (a,b) => a + rnd()*(b-a);
  const q = (rx,ry,rz) => new T.Quaternion().setFromEuler(new T.Euler(rx,ry,rz));

  /* ---------- 地面：三级台地 + 斜坡，按 ground 精确贴合 ---------- */
  /* 屋面投影：殿内地面与檐下铺地本来就被屋顶盖着，不该长出草花落叶，更不该铺雪。
   * 先前的做法只按台地高度平铺，雪片直接铺到了大殿地砖上。
   * 这里把屋面三角面的 XZ 包围盒栅格化，查一次就是 O(1)。 */
  const coverCells = new Set();
  const COVER_CELL = 1.0;
  function markCover(x0,x1,z0,z1){
    for (let cx = Math.floor(x0/COVER_CELL); cx <= Math.floor(x1/COVER_CELL); cx++)
      for (let cz = Math.floor(z0/COVER_CELL); cz <= Math.floor(z1/COVER_CELL); cz++)
        coverCells.add(cx + ',' + cz);
  }
  function underRoof(x,z){
    if (!coverCells.size) return false;
    return coverCells.has(Math.floor(x/COVER_CELL) + ',' + Math.floor(z/COVER_CELL));
  }
  /* 屋面高度表：光有「正下方有屋顶」还不够——大殿内部的梁架、斗栱、平闇是朝上的面，
   * 同样落在屋面投影里，于是冬天在室内抬头就是一片挂着的白块。
   * 这里再加一张 0.5 米的最高屋面高度表：某个落点头顶还有高出一截的屋面，
   * 说明它在室内，就不铺雪。三角形按重心插值逐格填，避免斜顶被抹成整格同高。 */
  const TOP_CELL = .5, coverTop = new Map();
  function markTop(a,b,c){
    const cx0 = Math.floor(Math.min(a.x,b.x,c.x)/TOP_CELL), cx1 = Math.floor(Math.max(a.x,b.x,c.x)/TOP_CELL);
    const cz0 = Math.floor(Math.min(a.z,b.z,c.z)/TOP_CELL), cz1 = Math.floor(Math.max(a.z,b.z,c.z)/TOP_CELL);
    const n = (cx1-cx0+1)*(cz1-cz0+1);
    if (n > 60000) return;                      // 地形这类超大的面不参与
    const v0x=b.x-a.x, v0z=b.z-a.z, v1x=c.x-a.x, v1z=c.z-a.z;
    const den = v0x*v1z - v1x*v0z;
    if (Math.abs(den) < 1e-7) return;
    for (let cx=cx0; cx<=cx1; cx++) for (let cz=cz0; cz<=cz1; cz++){
      const wx = (cx+.5)*TOP_CELL - a.x, wz = (cz+.5)*TOP_CELL - a.z;
      const u = (wx*v1z - v1x*wz)/den, v = (v0x*wz - wx*v0z)/den;
      if (u < -.03 || v < -.03 || u+v > 1.03) continue;
      const y = a.y + (b.y-a.y)*u + (c.y-a.y)*v;
      const k = cx + ',' + cz, old = coverTop.get(k);
      if (old === undefined || y > old) coverTop.set(k, y);
    }
  }
  /* 室内判定：这一格里最高的面如果不是落点自己那张面，说明头顶还盖着一层，
   * 落点在殿内的梁架、斗栱、平闇上，雪不该铺。
   * 比的不是落点高度而是「同一格心上的高度」：落点自己的三角面是解析平面，
   * 在格心再算一次值，与表里的最高值一减，坡度带来的偏差正好抵消，
   * 剩下十分之一米的余量就足够把内外两层分开。 */
  const planes = [];                            // 每张朝上的三角面：y = A*x + B*z + C
  const TOP_TOL = .10;
  let topDropped = 0, upperDropped = 0;
  const cellX = (v) => (Math.floor(v/TOP_CELL) + .5) * TOP_CELL;
  function indoors(x,y,z){
    if (!coverTop.size) return false;
    const v = coverTop.get(Math.floor(x/TOP_CELL) + ',' + Math.floor(z/TOP_CELL));
    return v !== undefined && v - y > .35;
  }
  /* 落在自己那张面之下的判定：pi 是落点所属三角面的平面临时号。
   * 这一格最高的面若不是落点自己那张面，就说明头顶还盖着一层——
   * 屋顶是「外皮盖瓦 + 内皮望板」两层，望板朝上那面也会被扫成雪片，
   * 于是冬天的殿内抬头，梁架之间挂着一片白。 */
  function buried(p){
    if (!coverTop.size) return false;
    const v = coverTop.get(Math.floor(p.x/TOP_CELL) + ',' + Math.floor(p.z/TOP_CELL));
    if (v === undefined) return false;
    const pl = planes[p.pi];
    return v - (pl[0]*cellX(p.x) + pl[1]*cellX(p.z) + pl[2]) > TOP_TOL;
  }
  /* 硬质区：台地表面是石铺与夯土，只有一进院南侧那块草坪例外。
   * 草花只长在这以外，石板缝里不再冒锥子。 */
  function noGrass(x,z){
    if (underRoof(x,z)) return true;
    if (x >= -52 && x <= -18 && z >= -30 && z <= 32){
      const lawn = (x > -51.6 && x < -18.55 && z > -29.3 && z < -3.05);
      return !lawn;
    }
    if (x >= -18 && x <= 3  && z >= -30 && z <= 32) return true;   // 二进院
    if (x >= 3   && x <= 38 && z >= -34 && z <= 33) return true;   // 三进台地
    return false;
  }
  // 陡阶与券门斜坡是斜面，平铺片会穿，单独跳过；台阶另铺窄条。
  const isRamp = x => (x > -21.9 && x < -18.2) || (x > -7.4 && x < 2.9);
  function groundTiles(step, cb){
    for (let x = -52; x <= 27; x += step){
      for (let z = -28; z <= 28; z += step){
        const jx = x + R(-.30,.30), jz = z + R(-.30,.30);
        if (isRamp(jx)) continue;
        if (underRoof(jx, jz)) continue;           // 室内与檐下一律不铺
        const y = ctx.ground(jx, jz);
        if (!isFinite(y) || y > 30) continue;
        cb(jx, y, jz);
      }
    }
  }

  /* ---------- 上层落点：一次性向下射线，贴合屋顶 / 墙顶 / 原树冠 ---------- */
  function inWonder(o){ for (let p=o; p; p=p.parent) if (p === ctx.root) return true; return false; }
  const targets = [];
  ctx.scene.traverse(o => {
    if (!(o.isMesh || o.isInstancedMesh) || inWonder(o) || !o.visible) return;
    const m = Array.isArray(o.material) ? o.material[0] : o.material;
    if (!m || m.transparent || m.opacity < .95) return;
    const n = o.geometry?.attributes?.position?.count || 0;
    if (n === 0 || n > 320000) return;                // 跳过极端超大的合并网格
    targets.push(o);
  });
  const ray = new T.Raycaster(); ray.far = 80;
  const DOWN = new T.Vector3(0,-1,0), ORIGIN = new T.Vector3();
  /* 这组落点只给「树冠积雪、落叶、花瓣、冰凌」用，所以只认树冠——
   * 先前收得宽，凡是高于地面 1.6 米的都算，结果射线从 52 米高落下来，
   * 若正好从殿顶的缝里穿进去，就打在殿内的梁架、平闇上，
   * 冬天的雪球便挂进了殿里，抬头看是一个个白色的扁球。
   * 判据用材质：树冠是实例化的二十面体，颜色偏绿；屋顶是瓦灰，殿内是木色，都不收。 */
  const folCache = new Map();
  function isFoliage(o){
    let v = folCache.get(o);
    if (v !== undefined) return v;
    const m = Array.isArray(o.material) ? o.material[0] : o.material;
    const hsl = {}; m?.color?.getHSL(hsl);
    v = !!(o.isInstancedMesh && hsl.s > .10 && hsl.h > .13 && hsl.h < .62);
    folCache.set(o, v);
    return v;
  }
  const foliageTargets = targets.filter(isFoliage);
  const upper = [];
  for (let i=0;i<420;i++){
    const x = R(-50,30), z = R(-25,25);
    ORIGIN.set(x, 52, z);
    ray.set(ORIGIN, DOWN);
    let hitY = null;
    try {
      const hs = ray.intersectObjects(foliageTargets, false);
      for (const h of hs){
        if (h.point.y <= 1.2) continue;
        hitY = h.point.y; break;
      }
    } catch(e){ /* 某个几何不支持射线就跳过这个采样点 */ }
    if (hitY == null) continue;
    const g = ctx.ground(x,z);
    if (!isFinite(g) || hitY - g < 1.6) continue;      // 太矮的不算树冠
    upper.push({ x, z, y:hitY, above:hitY-g });
  }

  /* ---------- 瓦顶积雪：直接按三角面生成 ----------
   * 先前用射线采样，420 个点摊在 80×50 的场地上，落到屋面只剩几十个，远看就是白芝麻；
   * 加密到 4000 多根射线，屋面覆盖率也只到四成，而加载要多花半分钟。
   * 改成遍历建筑几何的三角面：朝上、有面积、离地够高的面直接铺一片雪，
   * 一片对一片，屋面自然连成整片，且只多一遍顶点扫描，没有射线求交的开销。
   * InstancedMesh（树木）跳过——树冠雪仍由上面的粗采样负责，免得一次生成几万片。
   * 四轮P0 教训：InstancedMesh 实例里也有建筑构件（大阶踏面等），逐实例
   * 摊雪同样会把踏步糊成雪毡——实例级雪盖只留给 wonder 自己的批次，
   * 原场景实例批一律跳过（树冠另有粗采样）。 */
  const roofPts = [];
  /* 四轮P0-1 配套：大阶走廊（券台廊洞内 x∈[-8.1,3.9]，|z|≤2.4）不挂瓦顶雪。
   * 这里是踏步通道不是屋面；旧版把 stairProfile 升坡当坡顶铺雪，
   * 整张雪毡从廊口糊到台面，真踏步全被盖掉——顾问眼里的"滑道"。 */
  function inStairCorridor(x, z){
    return x >= -8.1 && x < 3.9 && Math.abs(z) <= 2.4;
  }

  /* 把一段几何里朝上的三角面摊成雪片。out 收点，minH 是最低离地高度。
   * 提到 init 作用域，是因为核心模块后面还会挂上小卖部、香铺这些程序化的房子，
   * 它们建得比四季晚，得由 resnow() 补一遍雪。 */
  const snowA = new T.Vector3(), snowB = new T.Vector3(), snowC = new T.Vector3();
  const snowAB = new T.Vector3(), snowAC = new T.Vector3(), snowNV = new T.Vector3();
  function snowGeom(g, mw, out, minH){
    const pos = g?.attributes?.position;
    if (!pos) return;
    const idx = g.index;
    const total = idx ? idx.count : pos.count;
    if (total < 3) return;
    for (let i = 0; i + 2 < total; i += 3){
      const i0 = idx ? idx.getX(i)   : i,
            i1 = idx ? idx.getX(i+1) : i+1,
            i2 = idx ? idx.getX(i+2) : i+2;
      snowA.fromBufferAttribute(pos, i0).applyMatrix4(mw);
      snowB.fromBufferAttribute(pos, i1).applyMatrix4(mw);
      snowC.fromBufferAttribute(pos, i2).applyMatrix4(mw);
      snowAB.subVectors(snowB, snowA); snowAC.subVectors(snowC, snowA);
      snowNV.crossVectors(snowAB, snowAC);
      const len = snowNV.length();
      if (len < 1e-6) continue;
      const area = len * .5;
      if (area < .055) continue;                       // 太碎的构件不挂雪
      snowNV.multiplyScalar(1/len);
      // 烘焙出来的几何有一部分是反绕序的，法线朝下；统一翻到朝上再判坡度，
      // 否则整片屋面会因为法线朝下被当成立面全部跳过。
      if (snowNV.y < 0) snowNV.negate();
      if (snowNV.y < .52) continue;                    // 只有朝上的坡面挂得住雪
      // 顺手记下这个面的水平投影：地面上的草花雪都要避开屋顶底下
      markCover(Math.min(snowA.x,snowB.x,snowC.x), Math.max(snowA.x,snowB.x,snowC.x),
                Math.min(snowA.z,snowB.z,snowC.z), Math.max(snowA.z,snowB.z,snowC.z));
      markTop(snowA, snowB, snowC);
      // y = A*x + B*z + C，平面号随落点一起带走，收完一轮再回头判室内
      planes.push([ -snowNV.x/snowNV.y, -snowNV.z/snowNV.y,
        snowA.y + (snowNV.x*snowA.x + snowNV.z*snowA.z)/snowNV.y ]);
      const pi = planes.length - 1;
      // 屋面常常是整片大三角，一片雪盖不住，按面积摊到最多 40 片
      const k = Math.min(40, Math.max(1, Math.round(area / 1.15)));
      for (let s = 0; s < k; s++){
        let u = rnd(), v = rnd();
        if (u + v > 1){ u = 1-u; v = 1-v; }
        const px = snowA.x + snowAB.x*u + snowAC.x*v;
        const py = snowA.y + snowAB.y*u + snowAC.y*v;
        const pz = snowA.z + snowAB.z*u + snowAC.z*v;
        const gy = ctx.ground(px, pz);
        if (!isFinite(gy) || py - gy < minH) continue;
        if (inStairCorridor(px, pz)) continue;     // 大阶走廊不是屋面，不糊雪
        out.push({
          x:px, y:py, z:pz, nx:snowNV.x, ny:snowNV.y, nz:snowNV.z, pi,
          side:Math.min(1.85, Math.max(.45, Math.sqrt(area/k)*2.05)),
          high:py - gy
        });
      }
    }
  }

  {
    // 不复用 targets：那份为了射线采样剔掉了顶点过多的合并网格，而屋面往往正好在里面
    const roofTargets = [];
    ctx.scene.traverse(o => {
      if ((!o.isMesh && !o.isInstancedMesh) || inWonder(o) || !o.visible) return;
      const m = Array.isArray(o.material) ? o.material[0] : o.material;
      if (!m || m.transparent) return;
      roofTargets.push(o);
    });
    const wbb = new T.Box3(), im = new T.Matrix4();
    let budget = 4200000;                             // 三角面预算，保证首屏不被拖到几十秒

    for (const o of roofTargets){
      if (budget <= 0) break;
      try { wbb.setFromObject(o); } catch(e){ continue; }
      if (wbb.max.y < 6.5) continue;                  // 矮物件不铺顶雪
      const g = o.geometry;
      const pos = g?.attributes?.position;
      if (!pos) continue;
      const total = (g.index ? g.index.count : pos.count);
      o.updateWorldMatrix(true, false);
      if (o.isInstancedMesh){
        // 院里的亭子、角楼是实例化的：逐个实例变换后再铺
        if (!o.instanceMatrix) continue;
        // 四轮P0：大阶走廊整体排除在瓦顶雪之外——走廊里既有踏步实例批，
        // 又有相邻台体的实例侧壁，逐实例摊雪必然糊出 2→13 的雪毡滑道。
        if (wbb.min.x < 3.9 && wbb.max.x > -8.1 && wbb.min.z < 2.4 && wbb.max.z > -2.4
            && wbb.min.y < 13.2 && wbb.max.y > 2) continue;
        // 瓦垄常常也是一条条实例化的：上限放宽到 400，够收下瓦片条，
        // 又挡掉成百上千棵的树（树冠雪交给上面的粗采样，否则远看像撒了糖霜）。
        if (o.count > 400) continue;
        // 再按颜色挡一层：偏绿的实例是树冠，别往叶子上糊白点
        {
          const mm = Array.isArray(o.material) ? o.material[0] : o.material;
          const h = {}; mm?.color?.getHSL(h);
          if (h.s > .12 && h.h > .15 && h.h < .60) continue;
        }
        const n = o.count;
        if (total * n > 240000) continue;
        budget -= total * n;
        for (let ii = 0; ii < n; ii++){
          o.getMatrixAt(ii, im);
          im.premultiply(o.matrixWorld);
          snowGeom(g, im, roofPts, 2.6);
        }
      } else {
        budget -= total;
        snowGeom(g, o.matrixWorld, roofPts, 2.6);
      }
    }
    // 屋顶全部扫完之后才知道哪一格头顶最高，这时再回头剔掉室内的梁架与斗栱
    {
      const kept = [];
      for (const p of roofPts) if (!buried(p)) kept.push(p); else topDropped++;
      roofPts.length = 0; roofPts.push(...kept);
    }
    // 上层落点（树冠、屋顶顶面）是向下射线采出来的：射线从 52 米高出发，
    // 若正好穿过屋顶的缝，就会落在殿内的梁架上，冬天的雪球、秋天的落叶便挂在殿里。
    // 屋面高度表这时已经建全，被屋顶罩住的落点一律剔掉。
    {
      for (let i = upper.length - 1; i >= 0; i--){
        const p = upper[i];
        if (indoors(p.x, p.y, p.z)){ upper.splice(i,1); upperDropped++; }
      }
    }
    // 保险：面太多时撑爆实例数，超出就等距抽稀
    if (roofPts.length > 24000){
      const step = roofPts.length / 24000, kept = [];
      for (let i = 0; i < roofPts.length; i += step) kept.push(roofPts[i|0]);
      roofPts.length = 0; roofPts.push(...kept);
    }
  }
  const UP_AXIS = new T.Vector3(0,1,0);

  /* ---------- 整片山地随季换色：复制地形网格、重染顶点色 ----------
   * 比「撒一堆白方块」干净得多，也不会在坡面上浮空或穿模。 */
  let terrain = null, terrainArea = 0;
  ctx.scene.traverse(o => {
    if (!o.isMesh || inWonder(o)) return;
    const m = o.material;
    if (!m || !m.vertexColors || !o.geometry?.attributes?.color) return;
    if (!o.geometry.boundingBox) o.geometry.computeBoundingBox();
    const bb = o.geometry.boundingBox;
    const area = (bb.max.x-bb.min.x)*(bb.max.z-bb.min.z);
    if (area > terrainArea){ terrainArea = area; terrain = o; }
  });
  if (terrain && terrainArea > 4000){
    for (const [s, hex, k] of [
      ['spring','#b7c99a',.26], ['summer','#95b878',.42], ['autumn','#c9b184',.34], ['winter','#f1f5f3',.92]
    ]){
      const g = terrain.geometry.clone();
      const col = g.attributes.color;
      col.normalized = false;
      const c = new T.Color(hex), pos = g.attributes.position;
      for (let i=0;i<col.count;i++){
        const n = .94 + .06*Math.sin(pos.getX(i)*.31 + pos.getZ(i)*.19);
        col.setXYZ(i,
          (col.getX(i)*(1-k) + c.r*k)*n,
          (col.getY(i)*(1-k) + c.g*k)*n,
          (col.getZ(i)*(1-k) + c.b*k)*n);
      }
      col.needsUpdate = true;
      const sm = new T.Mesh(g, new T.MeshStandardMaterial({
        vertexColors:true, roughness:1, metalness:0
      }));
      sm.position.copy(terrain.position);
      sm.rotation.copy(terrain.rotation);
      sm.scale.copy(terrain.scale);
      sm.position.y += (s === 'winter' ? .055 : .025);
      sm.receiveShadow = true;
      sm.userData.wonderSeason = true;
      layers[s].add(sm);
    }
  }

  /* ================= 冬：积雪 ================= */
  {
    const B = batches.winter;
    const SNOW = ['#f2f5f3','#e9eef0','#fafbf8','#dfe7ec'];
    // 铺得比原来密：原先 2.15 的格距配 1.85~2.25 的片，缝里会露出底下的青苔与落叶
    groundTiles(1.55, (x,y,z) => {
      const c = SNOW[(rnd()*SNOW.length)|0];
      B.add('box', c, [x, y+.055, z], [R(1.72,2.05), R(.07,.13), R(1.72,2.05)],
        q(0, R(-.12,.12), 0));
    });
    // 台阶踏面、斜坡：窄雪条顺着坡度
    for (let i=0;i<34;i++){
      const x = -7.0 + i*.29;
      const yy = ctx.ground(x, 0);
      for (const z of [-1.3,0,1.3])
        B.add('box','#eef3f2',[x, yy+.045, z],[.24,.055,1.05]);
    }
    for (let i=0;i<11;i++){
      const x = -21.5 + i*.29;
      const yy = ctx.ground(x, 0);
      B.add('box','#eef3f2',[x, yy+.05, 0],[.24,.06,4.3]);
    }
    // 屋顶、墙顶积雪：一片对一面，顺着坡面法线铺，看上去是连着的一片
    const nvv = new T.Vector3();
    for (const p of roofPts){
      nvv.set(p.nx, p.ny, p.nz).normalize();
      const QQ = new T.Quaternion().setFromUnitVectors(UP_AXIS, nvv);
      QQ.multiply(new T.Quaternion().setFromEuler(new T.Euler(0, R(0,6.283), 0)));
      const c = p.high > 10 ? '#f4f7f5' : '#e9eff0';
      // 雪片要整片浮在屋面之上：先前只抬 5 厘米，而片厚 6~10 厘米，
      // 下半截插进瓦面里，从殿内抬头看就是一片 z-fighting 的白色碎斑。
      const th = R(.06,.10), off = th * .5 + .04;
      B.add('box', c, [p.x + nvv.x*off, p.y + nvv.y*off, p.z + nvv.z*off],
        [p.side, th, p.side], QQ);
    }
    // 树冠积雪：用压扁的球而不是方板。方板斜着摆在树冠上，走近看像悬空的纸片。
    for (const p of upper){
      const c = p.above > 8 ? '#f4f7f5' : '#e8eeef';
      B.add('sph', c, [p.x, p.y+.02, p.z], [R(.78,1.15), R(.26,.42), R(.78,1.15)]);
    }
    // 屋檐冰凌：只在高层落点附近挂几串
    for (const p of upper){
      if (p.above < 9 || rnd() > .34) continue;
      for (let k=0;k<3;k++)
        B.add('cone','#cfe0e6',[p.x+R(-.4,.4), p.y-R(.20,.42), p.z+R(-.4,.4)],
          [.045, R(.22,.44), .045], q(Math.PI,0,0));
    }
    // 外围山地由上面的连续雪层接管，这里只留院内积雪与露出的枯草
    // 露出的枯草
    for (let i=0;i<170;i++){
      const x=R(-51,26), z=R(-27,27);
      if (isRamp(x) || noGrass(x,z)) continue;
      const y=ctx.ground(x,z); if(!isFinite(y))continue;
      B.add('cone','#9a9070',[x,y+.16,z],[.055,R(.24,.44),.055], q(R(-.2,.2),0,R(-.2,.2)));
    }
  }

  /* ================= 秋：满地落叶 ================= */
  {
    const B = batches.autumn;
    const LEAF = ['#c9a044','#b3762e','#a8492f','#8e5b2c','#c2a35c','#7c6b3a'];
    groundTiles(1.35, (x,y,z) => {
      const n = 2 + (rnd()*3|0);
      for (let k=0;k<n;k++){
        const c = LEAF[(rnd()*LEAF.length)|0];
        B.add('box', c, [x+R(-.55,.55), y+.045+R(0,.02), z+R(-.55,.55)],
          [R(.20,.42), .025, R(.14,.30)],
          q(R(-.12,.12), R(0,6.28), R(-.14,.14)));
      }
    });
    for (const p of upper){
      if (rnd() > .55) continue;
      for (let k=0;k<3;k++)
        B.add('box', LEAF[(rnd()*LEAF.length)|0],
          [p.x+R(-.6,.6), p.y+.045, p.z+R(-.6,.6)],
          [R(.20,.40), .024, R(.16,.30)], q(0,R(0,6.28),0));
    }
    // 枯草丛
    for (let i=0;i<190;i++){
      const x=R(-51,26), z=R(-27,27);
      if (isRamp(x) || noGrass(x,z)) continue;
      const y=ctx.ground(x,z); if(!isFinite(y))continue;
      B.add('cone','#a69256',[x,y+.20,z],[.07,R(.30,.55),.07], q(R(-.2,.2),0,R(-.2,.2)));
    }
  }

  /* ================= 春：小花与花树 ================= */
  {
    const B = batches.spring;
    const BLOOM = ['#e8b9c4','#f2ece0','#d98fa3','#efe0dc','#e6c96c','#f5efdd'];
    groundTiles(1.55, (x,y,z) => {
      if (noGrass(x,z)) return;
      if (rnd() > .72) return;
      const n = 1 + (rnd()*3|0);
      for (let k=0;k<n;k++){
        const c = BLOOM[(rnd()*BLOOM.length)|0];
        B.add('box', c, [x+R(-.6,.6), y+.055+R(0,.06), z+R(-.6,.6)],
          [R(.09,.18), R(.06,.13), R(.09,.18)], q(R(-.3,.3),R(0,6.28),R(-.3,.3)));
      }
      if (rnd() < .45)
        B.add('cone','#7fa356',[x+R(-.5,.5), y+.13, z+R(-.5,.5)],[.07,R(.18,.34),.07]);
    });
    // 花树：在院内几个点上补粉白花球，春天一眼就看得出来
    const BLOOM_TREES = [[-48,-14],[-38,-22],[-24,19],[-12,-20],[8,18],[26,18],[-50,9],[20,-20]];
    for (const [bx,bz] of BLOOM_TREES){
      if (noGrass(bx,bz)) continue;              // 石板广场上不摆花球
      const by = ctx.ground(bx,bz); if(!isFinite(by))continue;
      for (let k=0;k<7;k++){
        const a = k/7*6.283;
        B.add('sph', BLOOM[(rnd()*4)|0],
          [bx+Math.cos(a)*R(.5,1.15), by+R(2.6,4.3), bz+Math.sin(a)*R(.5,1.15)],
          [R(.42,.72), R(.34,.56), R(.42,.72)]);
      }
    }
    // 上层落点也撒一点花瓣
    for (const p of upper){
      if (rnd() > .35) continue;
      B.add('box','#e8b9c4',[p.x,p.y+.05,p.z],[.24,.02,.18], q(0,R(0,6.28),0));
    }
  }

  /* ================= 夏：浓荫地被与荷叶 ================= */
  {
    const B = batches.summer;
    const GRASS = ['#3f6231','#4b7040','#587c46','#35582d'];
    groundTiles(2.1, (x,y,z) => {
      if (noGrass(x,z)) return;
      if (rnd() > .52) return;
      for (let k=0;k<3;k++)
        B.add('cone', GRASS[(rnd()*GRASS.length)|0],
          [x+R(-.8,.8), y+.16, z+R(-.8,.8)], [.09, R(.24,.48), .09],
          q(R(-.2,.2), 0, R(-.2,.2)));
    });
    // 莲池浮叶
    for (let i=0;i<26;i++){
      const a = rnd()*6.283, r = Math.sqrt(rnd())*2.7;
      B.add('box','#4b7540',[-30.2+Math.cos(a)*r, .545, 8.4+Math.sin(a)*r*.62],
        [R(.26,.52), .020, R(.26,.52)], q(0,R(0,6.28),0));
    }
  }

  for (const s of SEASONS) batches[s].flush(s === 'winter' ? 1 : .97);

  /* ---------- 补雪：四季模块比小卖部、香铺这些程序化建筑先挂 ----------
   * 那些房子挂在 wonder 自己名下（inWonder 为真），初始化时还不在场景里，
   * 所以第一遍扫不到。核心模块全部挂完后调一次 resnow()，只补它们，不动已铺好的屋面。 */
  let resnowed = false;
  function resnow(){
    if (resnowed) return 0;
    resnowed = true;
    const list = [];
    ctx.scene.traverse(o => {
      if ((!o.isMesh && !o.isInstancedMesh) || !inWonder(o) || !o.visible) return;
      if (o.userData.wonderSeason || o.userData.wonderLantern || o.userData.noSnow) return;
      const m = Array.isArray(o.material) ? o.material[0] : o.material;
      if (!m || m.transparent) return;
      list.push(o);
    });
    if (!list.length) return 0;
    const pts = [], wbb = new T.Box3(), im = new T.Matrix4();
    let budget = 600000;
    for (const o of list){
      if (budget <= 0) break;
      const g = o.geometry;
      if (!g?.attributes?.position) continue;
      try { wbb.setFromObject(o); } catch(e){ continue; }
      const gy = ctx.ground((wbb.min.x+wbb.max.x)/2, (wbb.min.z+wbb.max.z)/2);
      if (isFinite(gy) && wbb.max.y - gy < 1.3) continue;   // 贴地的小物件不挂雪
      const total = g.index ? g.index.count : g.attributes.position.count;
      o.updateWorldMatrix(true, false);
      if (o.isInstancedMesh){
        if (!o.instanceMatrix || o.count > 40) continue;
        budget -= total * o.count;
        for (let ii = 0; ii < o.count; ii++){
          o.getMatrixAt(ii, im);
          im.premultiply(o.matrixWorld);
          snowGeom(g, im, pts, 1.4);
        }
      } else {
        budget -= total;
        snowGeom(g, o.matrixWorld, pts, 1.4);
      }
    }
    // 补雪同样要过一遍室内判定：小卖部、香铺这些房子也有梁架
    const out = [];
    for (const p of pts) if (!buried(p)) out.push(p);
    if (!out.length) return 0;
    const B = batches.winter, nvv = new T.Vector3();
    for (const p of out){
      nvv.set(p.nx, p.ny, p.nz).normalize();
      const QQ = new T.Quaternion().setFromUnitVectors(UP_AXIS, nvv);
      QQ.multiply(new T.Quaternion().setFromEuler(new T.Euler(0, R(0,6.283), 0)));
      const th = R(.06,.10), off = th * .5 + .04;
      B.add('box', p.high > 10 ? '#f4f7f5' : '#e9eff0',
        [p.x + nvv.x*off, p.y + nvv.y*off, p.z + nvv.z*off],
        [p.side, th, p.side], QQ);
    }
    B.flush(1);
    return out.length;
  }

  /* ---------- 原场景草木随季染色 ---------- */
  const tinted = [];
  const seen = new Set();
  ctx.scene.traverse(o => {
    if (!(o.isMesh || o.isInstancedMesh) || inWonder(o)) return;
    const ms = Array.isArray(o.material) ? o.material : [o.material];
    for (const m of ms){
      if (!m || !m.isMeshStandardMaterial || m.userData.weathered || seen.has(m)) continue;
      if (m.transparent || m.map && m.map.image && !m.userData) { /* 贴图材质仍可微调色 */ }
      seen.add(m);
      const c = m.color, hsl = {};
      c.getHSL(hsl);
      const isGreen = hsl.h > .17 && hsl.h < .49 && hsl.s > .12;
      const isFlower = (hsl.s > .22 && hsl.l > .40) &&
                       ((hsl.h > .90 || hsl.h < .055) || (hsl.h > .10 && hsl.h < .17));
      if (!isGreen && !isFlower) continue;
      // 烘焙出的普通 Mesh 顶点色里混了建筑各色，别动
      if (!o.isInstancedMesh && m.vertexColors) continue;
      tinted.push({ m, base:c.clone(), hsl, isGreen });
    }
  });
  const tmp = new T.Color();
  function retint(s){
    const f = FOLIAGE_SHIFT[s] || FOLIAGE_SHIFT.summer;
    const g = FLOWER_SHIFT[s] || FLOWER_SHIFT.summer;
    for (const r of tinted){
      const { hsl } = r;
      tmp.copy(r.base);
      if (r.isGreen){
        const h = hsl.h + f.h;
        const sat = Math.max(0, Math.min(1, hsl.s * f.s));
        const lig = Math.max(.04, Math.min(.94, hsl.l * f.l));
        tmp.setHSL((h+1)%1, sat, lig);
        if (f.warm > 0) tmp.lerp(new T.Color('#b87532'), f.warm * (1 - hsl.s) + .10);
        if (s === 'winter') tmp.lerp(new T.Color('#8b8678'), .34);
      } else {
        tmp.setHSL(hsl.h, Math.min(1,hsl.s*g.s), Math.min(.95,hsl.l*g.l));
        if (s === 'winter') tmp.lerp(new T.Color('#9a9082'), .55);
        if (s === 'autumn') tmp.lerp(new T.Color('#a8874c'), .42);
      }
      r.m.color.copy(tmp);
      r.m.needsUpdate = true;
    }
  }

  /* ---------- 切换 ---------- */
  let current = ctx.state.season || 'summer';
  function setSeason(s){
    if (!SEASONS.includes(s)) return;
    current = s;
    for (const k of SEASONS) layers[k].visible = (k === s);
    retint(s);
  }
  setSeason(current);

  return {
    setSeason,
    resnow,
    get season(){ return current; },
    get upperCount(){ return upper.length; },
    get roofCount(){ return roofPts.length; },
    get topDropped(){ return topDropped; },
    get upperDropped(){ return upperDropped; },
    get roofPts(){ return roofPts; },
    get tintedCount(){ return tinted.length; }
  };
}
