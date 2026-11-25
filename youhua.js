/* youhua.js — 可逆的「油画」实时滤镜（移植自 Awesome-Unity-Shader / Volume 10 ScreenOilPaintEffect）
 *
 * 原算法：Kuwahara 各向异性滤波。在两个邻域象限(左上、右下)分别统计颜色均值 m 与方差 s，
 * 取方差(min sigma²)最小的象限均值作为该像素颜色 —— 颜色向"最纯净"的邻域凝聚，
 * 边界被抹平、色块成片，形成油画笔触感。原版为 Unity ShaderLab/HLSL，这里移植为 GLSL ES。
 *
 * 移植要点（见 awesome-unity-shader 技能 algorithms.md）：
 *   - HLSL 变量循环上界 _Radius → GLSL 常量上界 + uniform 比较(continue)
 *   - tex2D → texture2D；_ResolutionValue/_ScreenResolution → uStep * uTexel
 *   - Unity 直接在 gamma 图统计；这里在线性 RT 统计后统一走 tonemap+colorspace，输出与主程序一致
 *
 * 可逆：包住 renderer.render，开时把 stage.scene 画进 RT 再走全屏 quad；关闭恢复原 render。
 * 与体素/工笔/国潮互斥。
 */
(function () {
  'use strict';
  var T = window.THREE;
  if (!T) return;

  var VERT = [
    'varying vec2 vUv;',
    'void main(){',
    '  vUv = uv;',
    '  gl_Position = vec4(position.xy, 0.0, 1.0);',
    '}'
  ].join('\n');

  /* 共享核心：uniform 声明 + 四象限 Kuwahara 函数。测试页复用同一段，保证验证的就是实际算法。
   * 用四象限而非原版两象限：平坦区(雪地/天空)四象限方差都接近0，取最小者不会跳变，
   * 消除原版在大跨度时出现的棋盘/条纹伪影。 */
  var CORE = [
    'uniform sampler2D tDiffuse;',
    'uniform vec2 uTexel;',
    'uniform float uRadius;',
    'uniform float uStep;',
    'uniform float uStrength;',
    'uniform float uQuant;',
    'vec3 kuwahara(vec2 uv){',
    '  vec2 stp = uTexel * uStep;',
    '  int R = int(uRadius + 0.5);',
    '  float n = float((R + 1) * (R + 1));',
    '  vec3 best = vec3(0.0);',
    '  float bestSig = 1e9;',
    '  for (int q = 0; q < 4; q++) {',
    '    vec3 m = vec3(0.0), s = vec3(0.0);',
    '    for (int jj = 0; jj <= 4; jj++) {',
    '      if (jj > R) break;',
    '      for (int ii = 0; ii <= 4; ii++) {',
    '        if (ii > R) break;',
    '        int di = (q == 0 || q == 2) ? -ii : ii;',
    '        int dj = (q == 0 || q == 1) ? -jj : jj;',
    '        vec3 c = texture2D(tDiffuse, uv + vec2(float(di), float(dj)) * stp).rgb;',
    '        m += c; s += c * c;',
    '      }',
    '    }',
    '    m /= n; s = abs(s / n - m * m);',
    '    float sig = s.r + s.g + s.b;',
    '    if (sig < bestSig) { bestSig = sig; best = m; }',
    '  }',
    '  return best;',
    '}',
    '/* 油画感：Kuwahara 色块平滑 + 温和的颜料色阶(带抖动的软量化，避免硬色斑) */',
    'float hash21(vec2 p){',
    '  return fract(sin(p.x * 12.9898 + p.y * 78.233) * 43758.5453);',
    '}',
    'vec3 oilPaint(vec2 uv, float quant){',
    '  vec3 col = kuwahara(uv);',
    '  float n = hash21(floor(uv * 900.0));',
    '  col = floor(col * quant + n) / quant;',
    '  return col;',
    '}'
  ].join('\n');

  var FRAG = [
    'precision highp float;',
    'varying vec2 vUv;',
    CORE,
    'void main(){',
    '  vec3 src = texture2D(tDiffuse, vUv).rgb;',
    '  vec3 oil = oilPaint(vUv, uQuant);',
    '  gl_FragColor = vec4(mix(src, oil, uStrength), 1.0);',
    '  #include <tonemapping_fragment>',
    '  #include <colorspace_fragment>',
    '}'
  ].join('\n');

  function create(stage) {
    var renderer = stage && stage.renderer;
    if (!renderer || renderer.__youhuaPatched) return null;

    var originalRender = renderer.render.bind(renderer);
    var size = new T.Vector2();
    var radius = 2;         // 邻域半径：2→3x3/象限；越大色块越大
    var step = 2;           // 采样步长(像素)：越大笔触跨度越大
    var strength = 1.0;     // 油画与原图混合强度
    var quant = 12;         // 色阶量化数：越小颜料块越明显(8~24)
    var enabled = false;

    var mobile = window.innerWidth <= 720 || (window.devicePixelRatio || 1) > 1.5;
    var ss = mobile ? 1.0 : 1.25;
    try {
      var q = new URLSearchParams(location.search);
      if (q.has('oss')) ss = Math.max(1, Math.min(3, Number(q.get('oss')) || 1));
    } catch (e) {}

    var rt = new T.WebGLRenderTarget(2, 2, {
      minFilter: T.LinearFilter,
      magFilter: T.LinearFilter,
      format: T.RGBAFormat,
      type: T.UnsignedByteType,
      depthBuffer: true,
      stencilBuffer: false
    });
    rt.texture.generateMipmaps = false;

    var mat = new T.ShaderMaterial({
      uniforms: {
        tDiffuse: { value: rt.texture },
        uTexel: { value: new T.Vector2(0.5, 0.5) },
        uRadius: { value: radius },
        uStep: { value: step },
        uStrength: { value: strength },
        uQuant: { value: quant }
      },
      vertexShader: VERT,
      fragmentShader: FRAG,
      depthTest: false,
      depthWrite: false,
      toneMapped: true
    });
    var quad = new T.Mesh(new T.PlaneGeometry(2, 2), mat);
    quad.frustumCulled = false;
    var quadScene = new T.Scene();
    quadScene.add(quad);
    var quadCam = new T.OrthographicCamera(-1, 1, 1, -1, 0, 1);

    function resizeRT() {
      renderer.getDrawingBufferSize(size);
      var w = Math.max(2, Math.round(size.x * ss));
      var h = Math.max(2, Math.round(size.y * ss));
      if (rt.width !== w || rt.height !== h) {
        rt.setSize(w, h);
        mat.uniforms.uTexel.value.set(1 / w, 1 / h);
      }
    }

    function patched(scene, camera) {
      if (!enabled || !scene || scene !== stage.scene || !camera) {
        originalRender(scene, camera);
        return;
      }
      resizeRT();
      renderer.setRenderTarget(rt);
      originalRender(scene, camera);
      renderer.setRenderTarget(null);
      var ac = renderer.autoClear;
      renderer.autoClear = true;
      originalRender(quadScene, quadCam);
      renderer.autoClear = ac;
    }

    // 渲染统一交给 fxchain：本模块不再 hook renderer.render（patched 保留但不用）
    // renderer.render = patched;  // 已移交 fxchain
    renderer.__youhuaPatched = true;

    // 油画开关按钮已按用户要求移除；效果模块与 API 保留（fxchain / 测试页仍可调用）
    var button = null;

    function closeOthers() {
      [['__voxel', 'set'], ['__gongbi', 'set'], ['__guochao', 'set']].forEach(function (pair) {
        var m = window[pair[0]];
        if (m && m.on && m.on() && m[pair[1]]) m[pair[1]](false);
      });
    }

    var api = {
      enabled: function () { return enabled; },
      set: function (on) {
        on = !!on;
        if (on === enabled) return on;
        enabled = on;
        if (window.__fxchain) window.__fxchain.set('youhua', on);
        if (button) {
          button.textContent = on ? '油画·开' : '油画';
          button.setAttribute('aria-pressed', String(on));
          button.title = on ? '油画滤镜已开启，点一下恢复原画面' : '油画滤镜：Kuwahara 色块笔触，再点一次恢复';
        }
        if (on) resizeRT();
        return on;
      },
      toggle: function () { return api.set(!enabled); },
      setRadius: function (n) { radius = Math.max(0, Math.min(4, Math.round(Number(n) || 0))); mat.uniforms.uRadius.value = radius; if (window.__fxchain) window.__fxchain.param('youhua','uRadius',radius); return radius; },
      setStep: function (n) { step = Math.max(1, Math.min(6, Number(n) || 1)); mat.uniforms.uStep.value = step; if (window.__fxchain) window.__fxchain.param('youhua','uStep',step); return step; },
      setStrength: function (n) { strength = clamp01(n); mat.uniforms.uStrength.value = strength; if (window.__fxchain) window.__fxchain.param('youhua','uStrength',strength); return strength; },
      setQuant: function (n) { quant = Math.max(2, Math.min(32, Number(n) || 12)); mat.uniforms.uQuant.value = quant; if (window.__fxchain) window.__fxchain.param('youhua','uQuant',quant); return quant; },
      supersample: function () { return ss; },
      dispose: function () {
        api.set(false);
        renderer.render = originalRender;
        delete renderer.__youhuaPatched;
        rt.dispose(); mat.dispose(); quad.geometry.dispose();
        if (button && button.parentNode) button.parentNode.removeChild(button);
      }
    };
    return api;
  }

  function clamp01(n) { return Math.max(0, Math.min(1, Number(n) || 0)); }

  var current = null;
  window.__youhua = {
    set: function (on) { return current ? current.set(on) : false; },
    toggle: function () { return current ? current.toggle() : false; },
    on: function () { return !!(current && current.enabled()); },
    radius: function (n) { return current ? current.setRadius(n) : 0; },
    step: function (n) { return current ? current.setStep(n) : 0; },
    strength: function (n) { return current ? current.setStrength(n) : 0; },
    quant: function (n) { return current ? current.setQuant(n) : 0; },
    supersample: function () { return current ? current.supersample() : 0; },
    attach: function (stage) {
      if (current) current.dispose();
      current = create(stage);
      return !!current;
    },
    GLSL: CORE, VERT: VERT   // 供测试页复用核心算法
  };

  /* 其他滤镜按钮被打开时自动关掉油画 */
  function installGuard() {
    var guard = setInterval(function () {
      ['voxel-toggle', 'gongbi-toggle', 'guochao-toggle'].forEach(function (id) {
        var b = document.getElementById(id);
        if (b && !b.__youhuaGuard) {
          b.__youhuaGuard = true;
          b.addEventListener('click', function () {
            setTimeout(function () { if (window.__youhua && window.__youhua.on()) window.__youhua.set(false); }, 0);
          });
        }
      });
    }, 150);
    setTimeout(function () { clearInterval(guard); }, 30000);
  }

  var tries = 0;
  var timer = setInterval(function () {
    var stage = window.__stage || window.__zen;
    if (stage && stage.scene && stage.camera && stage.renderer) {
      clearInterval(timer);
      if (window.__youhua.attach(stage)) { /* 互斥已由 fxchain 统一处理，不再 installGuard */ }
    } else if (++tries > 1200) {
      clearInterval(timer);
    }
  }, 150);
})();
