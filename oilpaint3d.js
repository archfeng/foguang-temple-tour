/* oilpaint3d.js — 常驻的「笔触植被」渲染层
 *
 * 把场景里全部绿色植被（树冠/草地/地被/灌木/苔藓/四季草花）撒成大量"颜料点"，
 * 每点烘焙固定颜色，用 gl_PointSize 画成一笔一笔的扁长刷痕——颜色是颜料，不是光。
 * 建筑/地面/天空保持原模型，形成"油画植被 + 真实古建"的混搭。
 *
 * 常驻：场景就绪后自动开启，替换原块面植被；无开关按钮。换季自动重建以跟随叶色。
 * 与后处理滤镜（体素/工笔/油画/光效）正交：本模块只改场景几何，不包 renderer.render，
 * 因此滤镜可以叠加在笔触画面上。
 */
(function () {
  'use strict';
  var T = window.THREE;
  if (!T) return;

  var CFG = {
    density: 0.0016,   // 预留
    maxPoints: 4800000,// 点数上限（树冠密实不透；Points 单 draw call，真机 GPU 可扛）
    size: 5.6,         // 笔刷基础像素尺寸（略放大，提高单笔覆盖率、堵住漏光缝隙）
    relief: 0.30,      // 颜料厚度（压低，去掉球面凸起感）
    stroke: 0.58       // 笔刷长宽比系数（加宽刷痕，单笔盖住更多像素；仍保持扁长不成为球）
  };
  // URL ?op=N 可覆盖点数，便于软渲染环境快速验证构图
  try {
    var _q = new URLSearchParams(location.search);
    if (_q.has('op')) CFG.maxPoints = Math.max(50000, Math.min(2000000, Number(_q.get('op')) || 1600000));
  } catch (e) {}
  // 手机降点数：移动端 GPU 与内存有限，压到 80 万并缩小笔刷，防卡顿
  var MOBILE = window.innerWidth <= 720 || (window.devicePixelRatio || 1) > 1.5;
  if (MOBILE && !new URLSearchParams(location.search).has('op')) {
    CFG.maxPoints = Math.min(CFG.maxPoints, 1300000);
    CFG.size = 5.0;
  }

  var VERT = [
    'attribute vec3 tint;',
    'attribute float phase;',
    'varying vec3 vTint;',
    'varying float vPhase;',
    'uniform float uSize;',
    'uniform float uStroke;',
    'uniform float uPixelRatio;',
    'uniform vec2 uRes;',
    'void main(){',
    '  vTint = tint; vPhase = phase;',
    '  vec4 mv = modelViewMatrix * vec4(position, 1.0);',
    '  gl_Position = projectionMatrix * mv;',
    // 近大远小：按 1/z 衰减（收紧上限，避免近处笔刷撑成大圆球）
    '  float sc = clamp(190.0 / max(1.0, -mv.z), 0.30, 3.0);',
    '  float jitter = 0.86 + 0.28 * fract(phase * 7.31);',
    '  gl_PointSize = clamp(uSize * sc * jitter * uPixelRatio, 2.0, 17.0);',
    '}'
  ].join('\n');

  var FRAG = [
    'precision highp float;',
    'varying vec3 vTint;',
    'varying float vPhase;',
    'uniform float uRelief;',
    'uniform float uStroke;',
    'uniform float uNight;',
    'void main(){',
    // gl_PointCoord: 0..1。转成以中心为原点的坐标
    '  vec2 p = gl_PointCoord * 2.0 - 1.0;',
    '  float a = vPhase * 6.2831853;',
    '  float ca = cos(a), sa = sin(a);',
    '  vec2 q = vec2(p.x * ca + p.y * sa, -p.x * sa + p.y * ca);',
    // 笔锋：长轴正方向短轴逐渐收窄，形成一头宽一头尖的刷痕（不再是圆球）
    '  float taper = 1.0 - 0.5 * smoothstep(-0.3, 1.0, q.x);',
    '  q.y /= max(0.35, taper) * max(0.2, uStroke);',
    '  float d = length(q);',
    '  if (d > 1.0) discard;',
    // 硬边：笔块边界清晰，去掉原来软边造成的球感
    '  float edge = smoothstep(1.0, 0.88, d);',
    // 扁平颜料：不做中心凸起，只在短轴两侧轻微压暗，叠平行刷丝纹理
    '  float ridge = 1.0 - uRelief * smoothstep(0.55, 1.0, abs(q.y)) * 0.35;',
    '  float fiber = 0.95 + 0.05 * sin(q.y * 18.0 + vPhase * 37.0);',
    '  vec3 col = vTint * ridge * fiber;',
    // 入夜：笔触烘焙的是白天顶点色、完全不响应场景光照，所以夜里会一直亮着。
    // 这里按时辰压暗并染上冷蓝夜天光，让它跟建筑/天空一起暗下来（不再是鲜亮绿）。
    '  if(uNight > 0.001){',
    '    float lum = dot(col, vec3(0.2126,0.7152,0.0722));',
    '    vec3 nightCol = vec3(lum*0.66, lum*0.78, lum*1.05)*0.30 + col*0.055;',
    '    col = mix(col, nightCol, uNight);',
    '  }',
    '  gl_FragColor = vec4(col, edge);',
    '  #include <tonemapping_fragment>',
    '  #include <colorspace_fragment>',
    '}'
  ].join('\n');

  // 从贴图(canvas/image)取平均主色，缓存复用。贴图材质的真色在 map 里，
  // 只看 material.color 会得到白色（佛像/地面/招牌惨白的根因）。
  var mapColorCache = new WeakMap();
  function mapTint(mat) {
    if (!mat || !mat.map || !mat.map.image) return null;
    var key = mat.map;
    if (mapColorCache.has(key)) return mapColorCache.get(key);
    var img = key.image, w = img.width, h = img.height;
    var c = null;
    try {
      var cv = document.createElement('canvas');
      var sw = Math.min(32, w || 32), sh = Math.min(32, h || 32);
      cv.width = sw; cv.height = sh;
      var ctx = cv.getContext('2d', { willReadFrequently: true });
      ctx.drawImage(img, 0, 0, sw, sh);
      var data = ctx.getImageData(0, 0, sw, sh).data;
      var r = 0, g = 0, b = 0, n = 0;
      for (var i = 0; i < data.length; i += 4) {
        var a = data[i + 3] / 255;
        if (a < 0.25) continue;
        r += data[i]; g += data[i + 1]; b += data[i + 2]; n++;
      }
      // canvas 读到的是 sRGB，必须转成 linear 再参与计算，否则过 tonemap 会被二次提亮成白块
      if (n > 0) {
        var srgb = new T.Color((r / n) / 255, (g / n) / 255, (b / n) / 255);
        if (srgb.convertSRGBToLinear) srgb.convertSRGBToLinear();
        c = srgb;
      }
    } catch (e) { c = null; }
    mapColorCache.set(key, c);
    return c;
  }

  // ---- 识别全部「绿色植被」：树冠 + 草地 + 地被 + 灌木 + 苔藓 + 四季草花 ----
  // 用「绿色」作为统一判据：建筑/瓦片/地砖/树干/石材都是灰棕，自动排除。
  function _hasAncestor(o, pred) {
    for (var p = o; p; p = p.parent) if (pred(p)) return true;
    return false;
  }
  function _mat(o) { return Array.isArray(o.material) ? o.material[0] : o.material; }
  function _hasVertexColors(o) {
    var m = _mat(o);
    return !!(m && m.vertexColors && o.geometry && o.geometry.attributes && o.geometry.attributes.color);
  }
  function _green(m) {
    var hsl = {};
    if (!m || !m.color) return false;
    m.color.getHSL(hsl);
    // 色相红(0)~黄绿(0.42)，排除蓝色天空/棕红树干；饱和度>0.12 排除灰白建筑。
    // 亮度下限放到 0.03，收进深绿松柏（l≈0.05~0.08）。
    return hsl.h > 0.14 && hsl.h < 0.42 && hsl.s > 0.12 && hsl.l > 0.03 && hsl.l < 0.72;
  }
  function isGreen(o) {
    if (!o || (!o.isMesh && !o.isInstancedMesh) || !o.visible || !o.geometry) return false;
    var m = _mat(o);
    if (!m) return false;
    if (_hasAncestor(o, function (p) { return p.userData.noPaint === true; })) return false;
    // 排除发光/器物/雪盖等非植被
    if (o.userData && (o.userData.wonderLantern || o.userData.wonderOrnament ||
        o.userData.wonderShrine || o.userData.noPaint)) return false;
    // ① GLB 蓝花楹：祖先 glbTree + 叶片材质名
    if (_hasAncestor(o, function (p) { return p.userData && p.userData.glbTree; })) {
      return m.name === 'jacaranda_tree_leaves';
    }
    // ② 有明确植被标记的对象：无论季节颜色（冬季变灰褐/雪白）都常驻保留笔触，
    //   避免换季后整片树"变回块面模型"。排除纯白雪盖（sph|SNOW，冬季才显形）。
    if (o.isInstancedMesh && o.userData &&
        (o.userData.plantInstances === true || o.userData.wonderBatch === true)) {
      if (o.name === 'Pine branch cutouts') return false;
      var hslW = {}; if (m.color) m.color.getHSL(hslW);
      if (hslW.l > 0.85 && hslW.s < 0.08) return false;  // 雪盖/纯白
      return true;
    }
    // ③ 无标记的绿色对象：树冠/地被/草叶/苔藓/四季草（按颜色）
    if (_green(m)) return true;
    // ④ 贴图草坪：材质色可能是白，绿色在贴图里——按贴图主色判断
    if (m.map) {
      var t = mapTint(m);
      if (t) {
        var hsl2 = {}; t.getHSL(hsl2);
        if (hsl2.h > 0.14 && hsl2.h < 0.42 && hsl2.s > 0.12 && hsl2.l > 0.03 && hsl2.l < 0.72) return true;
      }
    }
    return false;
  }

  // 收集场景里的全部绿色植被
  function collect(scene) {
    var out = [];
    scene.traverse(function (o) {
      if (!isGreen(o)) return;
      var g = o.geometry;
      if (!g.attributes || !g.attributes.position) return;
      out.push(o);
    });
    return out;
  }

  // 在单个 mesh 表面按面积撒点，写入全局数组
  function sampleMesh(o, arrays, budget) {
    var g = o.geometry, pos = g.attributes.position;
    if (!pos) return 0;
    var hasColor = !!g.attributes.color;
    var idx = g.index ? g.index.array : null;
    var triCount = idx ? idx.length / 3 : pos.count / 3;
    if (triCount < 1) return 0;
    // 体积分层（advisor 方案B）：树冠类高植被沿面法线随机偏移，把薄壳点云变成有厚度的
    // 云团。低模树冠是几片交叉 plane，斜视时薄壳投影成细线、缝隙漏出天空/建筑；分层后
    // 内层点填补外层缝隙，视线方向光学厚度提高。厚度自适应包围盒，避免点飘出轮廓。
    var layering = false, layerThick = 0;
    if (!g.boundingBox) g.computeBoundingBox();
    if (g.boundingBox) {
      var bs = new T.Vector3(); g.boundingBox.getSize(bs);
      // 实例化树冠：用实例缩放估算真实世界高度（几何局部只有 2 米小叶片）
      var worldY = bs.y;
      if (o.isInstancedMesh && o.count) {
        var _im = new T.Matrix4(), _isc = new T.Vector3();
        o.getMatrixAt(0, _im); _isc.setFromMatrixScale(_im);
        worldY = bs.y * _isc.y;
      }
      if (worldY > 3.2) {
        layering = true;
        layerThick = Math.min(0.9, Math.max(0.22, Math.min(bs.x, bs.y, bs.z) * 0.12));
      }
    }
  var mat = o.material;
  if (Array.isArray(mat)) return 0;
  // 发光体（火把/灯笼/光环）是"光"不是"颜料"，跳过，否则变成刺眼白块
  if (mat) {
    var em = mat.emissive, ei = mat.emissiveIntensity == null ? 1 : mat.emissiveIntensity;
    if (em && (em.r + em.g + em.b) * ei > 0.35) return 0;
    if (mat.transparent && (mat.opacity == null || mat.opacity < 0.5)) return 0;
  }
  var base = (mat && mat.color) ? mat.color.clone() : new T.Color(1, 1, 1);
  var tinted = mapTint(mat);
  if (tinted) base.multiply(tinted);
  var isInst = !!o.isInstancedMesh;
    var instCount = isInst ? o.count : 1;

    var A = new T.Vector3(), B = new T.Vector3(), C = new T.Vector3();
    var ab = new T.Vector3(), ac = new T.Vector3(), nrm = new T.Vector3();
    var P = new T.Vector3(), col = new T.Color();
    var im = new T.Matrix4();
    var instCol = new T.Color();

    var added = 0;
    // 每条边随机取三角形，按面积概率接受（面积大的面点更多）
    var tries = Math.min(budget * 4, 900000);
    for (var t = 0; t < tries && added < budget; t++) {
      var ti = (Math.random() * triCount) | 0;
      var i0 = idx ? idx[ti * 3] : ti * 3;
      var i1 = idx ? idx[ti * 3 + 1] : ti * 3 + 1;
      var i2 = idx ? idx[ti * 3 + 2] : ti * 3 + 2;
      A.fromBufferAttribute(pos, i0);
      B.fromBufferAttribute(pos, i1);
      C.fromBufferAttribute(pos, i2);
      ab.subVectors(B, A); ac.subVectors(C, A);
      nrm.crossVectors(ab, ac);
      var area = nrm.length() * 0.5;
      if (area < 1e-7) continue;
      // 接受概率 ∝ 面积（用一个经验上限归一化）
      if (Math.random() > Math.min(1, area * 18)) continue;

      // 随机重心坐标
      var u = Math.random(), v = Math.random();
      if (u + v > 1) { u = 1 - u; v = 1 - v; }
      var w = 1 - u - v;
      P.set(0, 0, 0)
        .addScaledVector(A, w)
        .addScaledVector(B, u)
        .addScaledVector(C, v);

      // 分层：沿面法线前后随机偏移（局部坐标，随后随实例/世界矩阵一起变换）。
      // 三角面法线 nrm 此时是 ab×ac 未归一，归一化后偏移 ±layerThick。
      // 偏移只在局部做，实例旋转/缩放由后面的 applyMatrix4 自动带上。
      if (layering && nrm.lengthSq() > 1e-12) {
        nrm.normalize();
        P.addScaledVector(nrm, (Math.random() * 2 - 1) * layerThick);
      }

      var inst = isInst ? ((Math.random() * instCount) | 0) : 0;
      if (isInst) {
        o.getMatrixAt(inst, im);
        P.applyMatrix4(im);
      }
      if (o.matrixWorld) P.applyMatrix4(o.matrixWorld);
      // 过滤 NaN（少数 instanceMatrix 未初始化 / 退化几何会产生坏点）
      if (!isFinite(P.x) || !isFinite(P.y) || !isFinite(P.z)) continue;

      // 莲池水面以上豁免笔触：荷叶/荷花/挺水草保留真实几何浮在水面，别用绿点糊住。
      // 水面以下（y<0.46）的水草保留笔触，与岸上草木统一为刷痕表达，透过清透水面可见。
      if (Math.abs(P.x + 30.2) < 3.5 && Math.abs(P.z - 8.4) < 2.6 && P.y >= 0.46 && P.y < 2.2) continue;

      // 颜色：材质色 × 顶点色(重心插值) × 实例色
      col.copy(base);
      if (hasColor) {
        var cA = g.attributes.color;
        var r = cA.getX(i0) * w + cA.getX(i1) * u + cA.getX(i2) * v;
        var gg = cA.getY(i0) * w + cA.getY(i1) * u + cA.getY(i2) * v;
        var b = cA.getZ(i0) * w + cA.getZ(i1) * u + cA.getZ(i2) * v;
        col.r *= r; col.g *= gg; col.b *= b;
      }
      if (isInst && o.instanceColor) {
        o.getColorAt(inst, instCol);
        col.multiply(instCol);
      }
      // 近白低饱和色（浅灰瓦片/地砖/招牌底）映射成暖灰颜料，杜绝惨白块；
      // 保留一定随机明暗，铺出来才像画布上的浅色颜料而不是一片死白。
      var mx = Math.max(col.r, col.g, col.b), mn = Math.min(col.r, col.g, col.b);
      var lumi = 0.2126 * col.r + 0.7152 * col.g + 0.0722 * col.b;
      var sat = mx > 0.001 ? (mx - mn) / mx : 0;
      if (lumi > 0.78 && sat < 0.14) {
        var warm = 0.60 + Math.random() * 0.13;
        col.setRGB(warm * 1.05, warm * 0.99, warm * 0.88);
      }
      /* 四季叶色统一：中心景观树（银杏/枫等）的原色饱和度高达 0.9（#e8b83e 亮黄 /
         #b84c2d 鲜红），而周围绝大多数植被随笔相转成柔和的金黄/灰白，两者放一起很扎眼。
         这里在「笔触输出端」统一把高饱和暖叶色压到中低饱和，并略降明度，让它和整体协调；
         色相保留（秋仍黄、枫仍红、春仍粉），树种辨识度不丢。只改笔触顶点色，不动原模型材质，
         因此不影响换季、光照与点数——只影响颜料本身。 */
      if (sat > 0.46) {
        var _hsl = {};
        col.getHSL(_hsl);
        if (_hsl.h < 0.17 || _hsl.h > 0.90) {         // 红/橙/黄/粉这类暖叶色
          var _s = 0.40 + Math.random() * 0.12;       // 饱和压到 0.40~0.52（原 0.7~0.9）
          var _l = Math.min(0.62, _hsl.l * 0.86);     // 略降明度，去掉荧光感
          col.setHSL(_hsl.h, _s, _l);
        }
      }
      // 轻微随机明暗，让同色面也有笔触色差（颜料感）
      var jit = 0.86 + Math.random() * 0.28;
      arrays.pos.push(P.x, P.y, P.z);
      arrays.tint.push(col.r * jit, col.g * jit, col.b * jit);
      // 朝向按世界空间网格共享：相邻笔触成片同向（像画笔一笔刷过），
      // 而非逐点乱转；加一点扰动避免整齐如贴瓷砖。phase 同时驱动尺寸与刷丝。
      var gx = Math.floor(P.x / 1.1), gy = Math.floor(P.y / 1.1), gz = Math.floor(P.z / 1.1);
      var hh = (gx * 374761393 + gy * 668265263 + gz * 1442695041) | 0;
      hh = Math.imul(hh ^ (hh >>> 13), 1274126177) | 0;
      var basePhase = ((hh ^ (hh >>> 16)) >>> 0) / 4294967296;
      arrays.phase.push((basePhase + (Math.random() - 0.5) * 0.10 + 1) % 1);
      added++;
    }
    return added;
  }

  function buildPointCloud(stage) {
    var scene = stage.scene;
    var objects = collect(scene);
    var arrays = { pos: [], tint: [], phase: [] };
    // 分组分配预算（用户核心诉求：树叶不漏光）：
    // 树冠/高灌木（包围盒高>2.2）拿大头，草/地被/水草拿小头。
    // 旧逻辑用"按对象数保底 minB"，草地实例对象极多，光保底就吃掉了大半预算，
    // 树冠反而分不到点、薄壳漏光——这是树叶透的真正根因。
    var trees = [], others = [], treeArea = [], otherArea = [];
    objects.forEach(function (o) {
      if (!o.geometry.boundingBox) o.geometry.computeBoundingBox();
      var s = new T.Vector3();
      if (o.geometry.boundingBox) o.geometry.boundingBox.getSize(s); else s.set(1, 1, 1);
      // 关键：树冠是实例化网格，几何局部尺寸只有 2 米的小叶片，靠实例矩阵放大/散布成大树。
      // 必须用 instanceMatrix 的缩放估算真实世界尺寸来判断"是不是树冠"，否则永远判不出来。
      var worldY = s.y;
      if (o.isInstancedMesh && o.count) {
        var im = new T.Matrix4(), isc = new T.Vector3();
        o.getMatrixAt(0, im);
        isc.setFromMatrixScale(im);
        worldY = s.y * isc.y;   // 首个实例的 Y 缩放 ≈ 该批对象的真实高度
      }
      var a = Math.max(0.01, s.x * s.y + s.y * s.z + s.x * s.z);
      // 实例化对象按实例数加权，但封顶，避免大批量草把预算吸干
      if (o.isInstancedMesh) a *= Math.min(o.count, 40);
      // 世界高度 > 3.2 视为树冠/高灌木
      if (worldY > 3.2) { trees.push(o); treeArea.push(a); }
      else { others.push(o); otherArea.push(a); }
    });
    // 树冠 78% 预算、草地等 22%——树叶密实不透优先。
    var treeBudget = Math.floor(CFG.maxPoints * 0.78);
    var otherBudget = CFG.maxPoints - treeBudget;
    function allocate(list, area, budget) {
      var sum = area.reduce(function (a, b) { return a + b; }, 0) || 1;
      list.forEach(function (o, i) {
        if (!budget) return;
        var b = Math.max(300, Math.floor(budget * area[i] / sum));
        sampleMesh(o, arrays, b);
      });
    }
    allocate(trees, treeArea, treeBudget);
    allocate(others, otherArea, otherBudget);
    var total = arrays.phase.length;

    var geo = new T.BufferGeometry();
    geo.setAttribute('position', new T.Float32BufferAttribute(arrays.pos, 3));
    geo.setAttribute('tint', new T.Float32BufferAttribute(arrays.tint, 3));
    geo.setAttribute('phase', new T.Float32BufferAttribute(arrays.phase, 1));
    geo.computeBoundingSphere();

    var mat = new T.ShaderMaterial({
      uniforms: {
        uSize: { value: CFG.size },
        uStroke: { value: CFG.stroke },
        uRelief: { value: CFG.relief },
        uPixelRatio: { value: stage.renderer.getPixelRatio() },
        uRes: { value: new T.Vector2(1, 1) },
        uNight: { value: 0 }
      },
      vertexShader: VERT,
      fragmentShader: FRAG,
      // 颜料是实体，不是玻璃：半透明会让笔块边缘漏出后面的枝干/天空，整棵树像一层纱。
      // 但不写深度——让层层笔触互相覆盖叠成厚涂色块，而不是只剩最表层的一堆亮点。
      transparent: false,
      depthTest: true,
      depthWrite: false,
      toneMapped: true
    });
    var pts = new T.Points(geo, mat);
    pts.frustumCulled = false;
    pts.userData.oilPaintCloud = true;
    return { points: pts, geometry: geo, material: mat, objects: objects, count: total };
  }

  // 夜色：笔触是自发光的顶点色，不跟光照，得单独按 hour 驱动。
  // 18:30→20:00 渐入夜，5:00→6:30 渐出，和 sky/lightfx 的节奏一致。
  var nightNow = 0, nightForce = null, nightLast = 0;
  function nightAmount(h) {
    if (!isFinite(h)) return 0;
    if (h >= 20 || h < 5) return 1;
    if (h > 18.5) return (h - 18.5) / 1.5;
    if (h < 6.5) return 1 - (h - 5) / 1.5;
    return 0;
  }
  function driveNight(now) {
    now = now || performance.now();
    var dt = nightLast ? Math.min(1.0, (now - nightLast) / 1000) : 0.016;
    nightLast = now;
    var w = window.__wonder;
    var h = w && w.state && isFinite(w.state.hour) ? w.state.hour : NaN;
    var target = nightForce === null ? nightAmount(h) : nightForce;
    // 按时间指数逼近（时间常数 0.55s）：低帧率也能在约 2 秒收敛到全暗，不卡在半亮
    nightNow += (target - nightNow) * (1 - Math.exp(-dt / 0.55));
    if (Math.abs(target - nightNow) < 0.002) nightNow = target;
    if (built && built.material && built.material.uniforms.uNight)
      built.material.uniforms.uNight.value = nightNow;
  }

  var enabled = false, built = null, stageRef = null;

  function apply(on) {
    if (!stageRef) return;
    if (on && !built) built = buildPointCloud(stageRef);
    if (!built) return;
    if (on) {
      // 只隐藏绿色植被（建筑/地面/天空保持原模型），笔触点叠加在原来的位置上。
      // 每次开启都重新遍历，换季/天气动态增删物体也能覆盖。
      var hidden = [];
      stageRef.scene.traverse(function (o) {
        if (isGreen(o) && !o.userData.oilPaintCloud) {
          o.userData.__oilPrevVisible = o.visible;
          o.visible = false;
          hidden.push(o);
        }
      });
      built.hidden = hidden;
      built.points.visible = true;
      stageRef.scene.add(built.points);
    } else {
      if (built.hidden) {
        built.hidden.forEach(function (o) {
          if (o.userData.__oilPrevVisible !== undefined) {
            o.visible = o.userData.__oilPrevVisible;
            delete o.userData.__oilPrevVisible;
          }
        });
        built.hidden = null;
      }
      if (built.points) { built.points.visible = false; stageRef.scene.remove(built.points); }
    }
  }

  var api = {
    enabled: function () { return enabled; },
    on: function () { return enabled; },
    count: function () { return built ? built.count : 0; },
    objects: function () { return built ? built.objects : []; },
    set: function (on) {
      on = !!on;
      if (on === enabled) return on;
      enabled = on;
      apply(on);
      return on;
    },
    toggle: function () { return api.set(!enabled); },
    rebuild: function () {
      // 先关闭：恢复上一批被隐藏的植被可见性并移除旧点云（必须在 dispose 之前）
      enabled = false;
      apply(false);
      if (built) { built.geometry.dispose(); built.material.dispose(); built = null; }
      // 再重新采集：此时植被已全部可见，能正确收集当前季节的颜色
      enabled = true;
      apply(true);
    },
    attach: function (stage) { stageRef = stage; return true; },
    night: function () { return nightNow; },
    forceNight: function (v) { nightForce = (v === null || v === undefined) ? null : Math.max(0, Math.min(1, Number(v) || 0)); return nightForce; },
    seasonState: function () { return { last: lastSeason, want: wantSeason, applied: appliedSeason }; }
  };
  window.__oilworld = api;

  // 每帧驱动夜色（不依赖固定间隔，低帧率也能收敛）
  function nightLoop(ts) { driveNight(ts); requestAnimationFrame(nightLoop); }
  requestAnimationFrame(nightLoop);

  // 换季时重建点云：笔触颜色烘焙在顶点色里，换季只改材质色，必须重新采集。
  // 用「目标季节 → 追平」而非一次性定时器：连续换季或重建耗时较长时，最终仍会收敛到最后一季。
  var lastSeason = null, wantSeason = null, appliedSeason = null;
  function watchSeason() {
    var w = window.__wonder;
    if (!w || !w.env) return;
    var s = w.env.season;
    if (s === undefined) s = w.state && w.state.season;
    if (!s) return;
    if (lastSeason === null) { lastSeason = s; wantSeason = s; return; }
    if (s !== lastSeason) { lastSeason = s; wantSeason = s; }
  }
  function flushSeason() {
    if (!wantSeason || wantSeason === appliedSeason) return;
    if (!window.__oilworld || !window.__oilworld.on()) return;
    var w = window.__wonder;
    var now = w && w.env && w.env.season;
    if (now === undefined) now = w && w.state && w.state.season;
    if (now !== wantSeason) return;   // 等换季副作用（材质/覆层）全部落地
    api.rebuild();
    appliedSeason = wantSeason;
  }
  // 主入口：直接包住 env.setSeason，换季当帧就重建。轮询在重载/多入口时兜底，
  // 但在低帧率设备上可能被主循环饿死，不能只靠它。
  function hookSetSeason() {
    var w = window.__wonder;
    if (!w || !w.env || typeof w.env.setSeason !== 'function' || w.env.__oilHooked) return;
    var orig = w.env.setSeason;
    w.env.setSeason = function (s) {
      var r = orig.apply(this, arguments);
      try {
        if (s && s !== lastSeason) { lastSeason = s; wantSeason = s; }
        if (wantSeason && window.__oilworld && window.__oilworld.on()) {
          api.rebuild();
          appliedSeason = wantSeason;
        }
      } catch (e) { /* 重建失败不影响换季主流程 */ }
      return r;
    };
    w.env.__oilHooked = true;
  }

  // 常驻：场景就绪后自动开启，替换原块面植被（无按钮、无开关）。
  // 不依赖固定延时——GLB 与植被加载快慢不一，持续重试到拿到非空点云为止。
  var tries = 0;
  var timer = setInterval(function () {
    var stage = window.__stage || window.__zen;
    if (stage && stage.scene && stage.camera && stage.renderer) {
      clearInterval(timer);
      api.attach(stage);
      var bootTries = 0;
      var boot = setInterval(function () {
        if (!window.__oilworld) return;
        if (!window.__oilworld.on()) window.__oilworld.set(true);
        if (window.__oilworld.count() > 0) {
          clearInterval(boot);
          appliedSeason = lastSeason || (window.__wonder && window.__wonder.env && window.__wonder.env.season) || null;
          return;
        }
        if (++bootTries > 40) { clearInterval(boot); return; }
        var w = window.__wonder;
        if (w && w.env) window.__oilworld.rebuild();   // 首次采集为空则重采
      }, 700);
      setInterval(watchSeason, 400);
      setInterval(flushSeason, 600);
      hookSetSeason();
      setInterval(hookSetSeason, 500);
    } else if (++tries > 1200) clearInterval(timer);
  }, 150);
})();
