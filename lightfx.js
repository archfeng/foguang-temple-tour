/* lightfx.js — 「夜景光效」：一键入夜 + 强化暖光源 + bloom/星芒/柔光后处理
 *
 * 设计背景：夜景原本是「整体压暗 + 小灯笼微光」，没有强光源，光效滤镜只是放大器，
 * 直接套上去看不出变化。所以本模块先把灯笼 emissive / PointLight 超驱动成真正的高光源，
 * 再叠 bloom 等后处理，光晕才出得来。全部可逆：再点一次恢复原时辰与原光照。
 *
 * 可逆机制：
 *   - 时辰：锁 ctx.state.hour=20 且 manualUntil=Infinity（挡住自动推进），关闭时还原。
 *   - 光照：apply() 每帧会把灯重置成夜景基准值；这里在 patched render 前每帧重新
 *     调 ctx.lanterns.setLamp(boost) 覆盖，关闭后不再覆盖，下一帧自然回到基准。
 *   - 后处理：包 renderer.render，开时走 RT + 全屏 quad，关时恢复原 render。
 *
 * 与其他滤镜（体素/工笔/油画/国潮）互斥，破缓存版本号由 index.html 统一注入。
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

  /* 共享核心：纯场景在【线性 RT】上做光效，最后统一 tonemap+colorspace。
   * 阈值比静态图测试低得多——线性域里被超驱动的 emissive 会 >1，能被 bloom 抓到。 */
  var CORE = [
    'uniform sampler2D tDiffuse;',
    'uniform vec2 uTexel;',
    'uniform float uBloom;',
    'uniform float uStar;',
    'uniform float uRay;',
    'uniform float uCa;',
    'float luma(vec3 c){return dot(c,vec3(0.2126,0.7152,0.0722));}',
    'vec3 sampleAt(vec2 uv){return texture2D(tDiffuse,clamp(uv,vec2(0.0),vec2(1.0))).rgb;}',
    'vec3 brightPass(vec3 c){',
    '  float l=luma(c);',
    '  return c*smoothstep(0.62,1.25,l);',
    '}',
    '/* 泛光：阈值提取 + 横竖各一遍高斯扩散，制造暖光晕 */',
    'vec3 bloom(vec2 uv){',
    '  vec3 sum=vec3(0.0); float wsum=0.0;',
    '  for(int i=-6;i<=6;i++){',
    '    float fi=float(i); float w=exp(-fi*fi/16.0);',
    '    vec3 c=sampleAt(uv+vec2(fi*uTexel.x*2.5,0.0));',
    '    sum+=brightPass(c)*w; wsum+=w;',
    '  }',
    '  vec3 sum2=vec3(0.0);',
    '  for(int i=-6;i<=6;i++){',
    '    float fi=float(i); float w=exp(-fi*fi/16.0);',
    '    sum2+=brightPass(sampleAt(uv+vec2(0.0,fi*uTexel.y*2.5)))*w;',
    '  }',
    '  return (sum/wsum+sum2/(wsum+0.0001))*0.5;',
    '}',
    '/* 星芒：4 个方向的长条拉伸，抓高光核心出 X 形 */',
    'vec3 star(vec2 uv){',
    '  vec3 acc=vec3(0.0);',
    '  for(int k=0;k<4;k++){',
    '    float a=float(k)*0.785398+0.3927;',
    '    vec2 dir=vec2(cos(a),sin(a));',
    '    for(int i=1;i<=8;i++){',
    '      float fi=float(i); float w=1.0/(1.0+fi*0.8);',
    '      acc+=brightPass(sampleAt(uv+dir*uTexel*fi*3.0))*w;',
    '      acc+=brightPass(sampleAt(uv-dir*uTexel*fi*3.0))*w;',
    '    }',
    '  }',
    '  return acc/4.0*0.5;',
    '}',
    '/* 柔光：高亮的十字大半径扩散（不用径向散射，避免同心圆摩尔纹） */',
    'vec3 rays(vec2 uv){',
    '  vec3 acc=vec3(0.0); float wsum=0.0;',
    '  for(int i=-6;i<=6;i++){',
    '    float fi=float(i); float w=exp(-fi*fi/20.0);',
    '    acc+=brightPass(sampleAt(uv+vec2(fi*uTexel.x*5.0,0.0)))*w;',
    '    acc+=brightPass(sampleAt(uv+vec2(0.0,fi*uTexel.y*5.0)))*w;',
    '    wsum+=w*2.0;',
    '  }',
    '  return acc/wsum;',
    '}',
    '/* 色散：默认关（静态图测试为负效果），保留供调试 */',
    'vec3 chroma(vec2 uv){',
    '  vec2 dir=(uv-vec2(0.5))*uCa*0.006;',
    '  return vec3(sampleAt(uv+dir).r,sampleAt(uv).g,sampleAt(uv-dir).b);',
    '}'
  ].join('\n');

  var FRAG = [
    'precision highp float;',
    'varying vec2 vUv;',
    CORE,
    'void main(){',
    '  vec3 col=chroma(vUv);',
    '  col+=bloom(vUv)*uBloom*1.5;',
    '  col+=star(vUv)*uStar*1.4;',
    '  col+=rays(vUv)*uRay*1.8;',
    '  gl_FragColor=vec4(col,1.0);',
    '  #include <tonemapping_fragment>',
    '  #include <colorspace_fragment>',
    '}'
  ].join('\n');

  function create(stage) {
    var renderer = stage && stage.renderer;
    if (!renderer || renderer.__lightfxPatched) return null;

    var originalRender = renderer.render.bind(renderer);
    var size = new T.Vector2();
    var bloomAmt = 1.0;   // 泛光
    var starAmt = 0.45;   // 星芒（温和，避免糊成一片）
    var rayAmt = 0.30;    // 柔光
    var caAmt = 0.28;     // 色散：四项光效全开（泛光/星芒/柔光/色散）
    var lampBoost = 2.2;  // 灯笼超驱动倍率（强光源底子）
    var enabled = false;

    // 时辰快照：进入夜景前保存，退出时还原
    var savedHour = null, savedManualUntil = null;

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
        uBloom: { value: bloomAmt },
        uStar: { value: starAmt },
        uRay: { value: rayAmt },
        uCa: { value: caAmt }
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

    /* 每帧在渲染前把灯笼光源重新超驱动，覆盖 apply() 的夜景基准值 */
    function boostLamps() {
      var w = window.__wonder;
      if (!w || !w.lanterns || typeof w.lanterns.setLamp !== 'function') return;
      w.lanterns.setLamp(lampBoost);
    }

    function lockNight(on) {
      var w = window.__wonder;
      if (!w || !w.state) return;
      if (on) {
        if (savedHour === null) {
          savedHour = w.state.hour;
          savedManualUntil = w.state.manualUntil || 0;
        }
        w.state.hour = 20;
        w.state.manualUntil = Infinity;   // 挡住自动推进，夜景不被推走
        if (w.env && typeof w.env.setHour === 'function') w.env.setHour(20);
      } else if (savedHour !== null) {
        w.state.manualUntil = savedManualUntil;
        if (w.env && typeof w.env.setHour === 'function') w.env.setHour(savedHour);
        else w.state.hour = savedHour;
        savedHour = null;
        savedManualUntil = null;
      }
    }

    function patched(scene, camera) {
      if (!enabled || !scene || scene !== stage.scene || !camera) {
        originalRender(scene, camera);
        return;
      }
      boostLamps();
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
    // 灯光 boost 由 fxchain 每帧在 render 前调用；入夜锁定由本模块 set() 负责。
    // renderer.render = patched;  // 已移交 fxchain
    renderer.__lightfxPatched = true;

    var button = null;
    var host = document.querySelector('header .tools') || document.querySelector('#ui');
    if (host) {
      button = document.createElement('button');
      button.id = 'lightfx-toggle';
      button.type = 'button';
      button.textContent = '夜景光效';
      button.title = '一键入夜并点亮灯笼暖光晕，再点一次恢复';
      button.setAttribute('aria-pressed', 'false');
      if (host.id === 'ui') button.className = 'btn';
      else {
        button.setAttribute('data-short', '光效');
        button.setAttribute('data-short-alt', '光灭');
      }
      button.addEventListener('click', function (e) { e.stopPropagation(); api.toggle(); });
      host.appendChild(button);
    }

    function closeOthers() {
      [['__voxel', 'set'], ['__gongbi', 'set'], ['__youhua', 'set'], ['__guochao', 'set']].forEach(function (pair) {
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
        if (window.__fxchain) window.__fxchain.set('lightfx', on);
        lockNight(on);
        if (button) {
          button.textContent = on ? '光效·开' : '夜景光效';
          button.setAttribute('aria-pressed', String(on));
          button.title = on ? '光效已开启，点一下恢复白天与原光照' : '一键入夜并点亮灯笼暖光晕，再点一次恢复';
        }
        if (on) resizeRT();
        return on;
      },
      toggle: function () { return api.set(!enabled); },
      setBloom: function (n) { bloomAmt = clamp(n, 0, 2); mat.uniforms.uBloom.value = bloomAmt; if (window.__fxchain) window.__fxchain.param('lightfx','uBloom',bloomAmt); return bloomAmt; },
      setStar: function (n) { starAmt = clamp(n, 0, 2); mat.uniforms.uStar.value = starAmt; if (window.__fxchain) window.__fxchain.param('lightfx','uStar',starAmt); return starAmt; },
      setRay: function (n) { rayAmt = clamp(n, 0, 2); mat.uniforms.uRay.value = rayAmt; if (window.__fxchain) window.__fxchain.param('lightfx','uRay',rayAmt); return rayAmt; },
      setCa: function (n) { caAmt = clamp(n, 0, 2); mat.uniforms.uCa.value = caAmt; if (window.__fxchain) window.__fxchain.param('lightfx','uCa',caAmt); return caAmt; },
      setLampBoost: function (n) { lampBoost = Math.max(1, Math.min(4, Number(n) || 2.2)); return lampBoost; },
      supersample: function () { return ss; },
      dispose: function () {
        api.set(false);
        renderer.render = originalRender;
        delete renderer.__lightfxPatched;
        rt.dispose(); mat.dispose(); quad.geometry.dispose();
        if (button && button.parentNode) button.parentNode.removeChild(button);
      }
    };
    return api;
  }

  function clamp(n, lo, hi) { return Math.max(lo, Math.min(hi, Number(n) || 0)); }

  var current = null;
  window.__lightfx = {
    set: function (on) { return current ? current.set(on) : false; },
    toggle: function () { return current ? current.toggle() : false; },
    on: function () { return !!(current && current.enabled()); },
    bloom: function (n) { return current ? current.setBloom(n) : 0; },
    star: function (n) { return current ? current.setStar(n) : 0; },
    ray: function (n) { return current ? current.setRay(n) : 0; },
    ca: function (n) { return current ? current.setCa(n) : 0; },
    lampBoost: function (n) { return current ? current.setLampBoost(n) : 0; },
    supersample: function () { return current ? current.supersample() : 0; },
    attach: function (stage) {
      if (current) current.dispose();
      current = create(stage);
      return !!current;
    },
    GLSL: CORE, VERT: VERT
  };

  /* 其他滤镜按钮被打开时自动关掉光效 */
  function installGuard() {
    var guard = setInterval(function () {
      ['voxel-toggle', 'gongbi-toggle', 'youhua-toggle', 'guochao-toggle'].forEach(function (id) {
        var b = document.getElementById(id);
        if (b && !b.__lightfxGuard) {
          b.__lightfxGuard = true;
          b.addEventListener('click', function () {
            setTimeout(function () { if (window.__lightfx && window.__lightfx.on()) window.__lightfx.set(false); }, 0);
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
      if (window.__lightfx.attach(stage)) { /* 互斥已由 fxchain 统一处理，不再 installGuard */ }
    } else if (++tries > 1200) {
      clearInterval(timer);
    }
  }, 150);
})();
