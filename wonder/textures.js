/* 材质：agent3 依据优化后实机渲染生成的可平铺贴图，叠到既有建筑材质上。
 * 第二轮：七类材质 + 高对比乘性细节 + 独立凹凸图 + 粗糙度图。
 * 「细部」保留原色调只添纹理，「原色」用完整彩图；缺图静默降级，不阻塞场景。
 */
import {setWeatheredMode} from './weathered.js?v=20261116bk';
const NAMES = ['brick','wood','tile','paving','stone','plaster','paint'];
const REPEAT = {
  brick:[2,2], wood:[1,2], tile:[3,1.4], paving:[2,2],
  stone:[1.6,1.6], plaster:[2,1.4], paint:[3,1]
};

export function initTextures(ctx){
  const T = ctx.T;
  const loader = new T.TextureLoader();
  const loaded = { detail:{}, color:{}, bump:{}, rough:{} };
  const targets = [];
  let ready = false, mode = ctx.state.texture || 'detail';

  /* --- 收集：只贴建筑大面，跳过植被、花、匾额、水面和已有贴图的材质 --- */
  const seen = new Set();
  ctx.scene.traverse(o => {
    if (!o.isMesh && !o.isInstancedMesh) return;
    if (o.userData.wonder || o.userData.wonderBatch || o.userData.wonderSeason) return;
    const ms = Array.isArray(o.material) ? o.material : [o.material];
    for (const m of ms){
      if (!m || !m.isMeshStandardMaterial || m.userData.weathered || seen.has(m)) continue;
      if (m.transparent || m.map || m.emissiveMap) continue;      // 水面 / 匾额 / 玻璃等已有图
      const hsl = {}; m.color.getHSL(hsl);
      if (hsl.l > .90 || hsl.l < .07) continue;                    // 近白 / 近黑
      if (hsl.h > .18 && hsl.h < .48 && hsl.s > .15) continue;     // 叶绿、苔、竹青
      if (m.emissive && (m.emissive.r + m.emissive.g + m.emissive.b) > .3) continue;
      seen.add(m);
    }
  });

  /* 按材质色相 + 第一个实例矩阵判断构件形制 */
  function guess(o, m){
    const hsl = {}; m.color.getHSL(hsl);
    let name;
    if (hsl.s < .13) name = hsl.l > .55 ? 'stone' : 'tile';        // 青灰瓦 / 白灰石作
    else if (hsl.h >= .01 && hsl.h <= .095 && hsl.s > .20) name = 'wood';
    else if (hsl.h > .095 && hsl.h <= .17) name = 'brick';
    else name = 'paving';

    if (o.isInstancedMesh && o.count){
      const mt = new T.Matrix4(), p = new T.Vector3(), q = new T.Quaternion(), s = new T.Vector3();
      try {
        o.getMatrixAt(0, mt); mt.decompose(p, q, s);
        const flat = s.y < Math.min(Math.abs(s.x), Math.abs(s.z)) * .35;
        const thin = s.y < Math.min(Math.abs(s.x), Math.abs(s.z)) * .14;
        const tall = Math.abs(s.y) > Math.max(Math.abs(s.x), Math.abs(s.z)) * 2.2;
        if (flat) name = hsl.s < .13 ? (hsl.l > .55 ? 'stone' : 'tile')
                       : (hsl.h > .095 && hsl.h <= .17 ? 'paving' : 'stone');
        else if (tall) name = 'wood';
        // 又扁又长的额枋：上彩画
        if (thin && Math.max(Math.abs(s.x),Math.abs(s.z)) > .8 &&
            hsl.h >= .01 && hsl.h <= .10) name = 'paint';
      } catch(e){ /* 矩阵异常就按颜色走 */ }
    }
    return name;
  }

  // 第二遍：把材质与它第一次出现时的几何归类绑起来
  const bound = new Set();
  ctx.scene.traverse(o => {
    if (!o.isMesh && !o.isInstancedMesh) return;
    if (o.userData.wonder || o.userData.wonderBatch || o.userData.wonderSeason) return;
    const ms = Array.isArray(o.material) ? o.material : [o.material];
    for (const m of ms){
      if (!m || !seen.has(m) || bound.has(m)) continue;
      bound.add(m);
      targets.push({ mat:m, name:guess(o,m),
                     map0:m.map, bump0:m.bumpMap, bs0:m.bumpScale || 0,
                     rough0:m.roughnessMap, rv0:m.roughness });
    }
  });

  /* 三轮 P1-3：detail 灰度贴图与低对比简化风冲突——把亮度对比压到约 55%
   * （v' = v*0.55 + 115，均值回 128 附近），只动 detail，不动 color 原彩图。 */
  const detailFlat = {};
  function flattenDetail(t){
    try {
      const img = t.image;
      if (!img || !img.width) return null;
      const c = document.createElement('canvas');
      c.width = img.width; c.height = img.height;
      const x = c.getContext('2d');
      x.drawImage(img, 0, 0);
      const d = x.getImageData(0, 0, c.width, c.height);
      const p = d.data;
      for (let i = 0; i < p.length; i += 4){
        p[i]   = p[i]   * .55 + 115;
        p[i+1] = p[i+1] * .55 + 115;
        p[i+2] = p[i+2] * .55 + 115;
      }
      x.putImageData(d, 0, 0);
      const t2 = new T.CanvasTexture(c);
      t2.wrapS = t2.wrapT = T.RepeatWrapping;
      t2.colorSpace = T.SRGBColorSpace;
      t2.needsUpdate = true;
      return t2;
    } catch (e) { return null; }    // 贴图跨源取不到像素就原样返回
  }

  function tex(kind, n, rep, srgb){
    if (kind === 'detail'){
      if (!(n in detailFlat)) detailFlat[n] = loaded.detail?.[n] ? flattenDetail(loaded.detail[n]) : null;
      if (detailFlat[n]) {
        const t = detailFlat[n].clone();
        t.wrapS = t.wrapT = T.RepeatWrapping;
        t.repeat.set(rep[0], rep[1]);
        t.colorSpace = T.SRGBColorSpace;
        t.anisotropy = 4;
        t.needsUpdate = true;
        return t;
      }
    }
    const base = loaded[kind]?.[n];
    if (!base) return null;
    const t = base.clone();
    t.wrapS = t.wrapT = T.RepeatWrapping;
    t.repeat.set(rep[0], rep[1]);
    if (srgb) t.colorSpace = T.SRGBColorSpace;
    t.anisotropy = 4;
    t.needsUpdate = true;
    return t;
  }

  function apply(next){
    mode = next;
    setWeatheredMode(next);
    if (!ready) return;
    for (const r of targets){
      const m = r.mat;
      if (mode === 'off' || (!loaded.detail?.[r.name] && !loaded.color?.[r.name])){
        m.map = r.map0; m.bumpMap = r.bump0; m.bumpScale = r.bs0;
        m.roughnessMap = r.rough0; m.roughness = r.rv0;
      } else {
        const rep = REPEAT[r.name] || [1,1];
        const pick = mode === 'color' ? 'color' : 'detail';
        const src = loaded[pick]?.[r.name] ? pick : (loaded.detail[r.name] ? 'detail' : 'color');
        m.map = tex(src, r.name, rep, true);
        // 凹凸与粗糙度始终用专用灰度图，不受「细部/原色」切换影响
        m.bumpMap   = tex('bump',  r.name, rep, false);
        m.roughnessMap = tex('rough', r.name, rep, false);
        m.bumpScale = r.name === 'tile' ? .030 : (r.name === 'brick' ? .022 : .014);   // 三轮P1：再降30%
        m.roughness = .92;
      }
      m.needsUpdate = true;
    }
  }

  const jobs = [];
  for (const kind of ['detail','color','bump','rough']){
    for (const n of NAMES){
      jobs.push(new Promise(resolve=>{
        loader.load(`./tex/${n}_${kind}.png`,
          t => { loaded[kind][n] = t; resolve(); },
          undefined,
          () => resolve());                    // 缺图就当没有，不报错、不重试
      }));
    }
  }
  Promise.all(jobs).then(()=>{
    ready = true;
    const ok = NAMES.filter(n=>loaded.detail[n] && loaded.color[n]);
    if (!ok.length){ console.info('[山寺志] 未找到材质贴图，保持原有材质'); return; }
    apply(mode);
    console.info(`[山寺志] 材质已贴合 ${targets.length} 种建筑材质 · ${ok.join('/')}`);
  });

  return {
    setMode: apply,
    get count(){ return targets.length; },
    get ready(){ return ready; }
  };
}
