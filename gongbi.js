/* gongbi.js — 可逆的「工笔重彩」实时滤镜（取代旧的国潮描金滤镜）
 *
 * 目标：贴近本地生图样张的工笔重彩质感（墨线勾边 + 青绿设色 + 宣纸肌理），
 * 但全程实时、全分辨率。核心三件事：
 *   1) 墨线勾边：8 邻域 Sobel 亮度梯度 → 深墨绿线（不是描金）
 *   2) 青绿设色：显示空间做暖调映射（提绿压蓝、低饱和亮区定色暖米），绝不泛蓝
 *   3) 宣纸肌理：程序化细颗粒噪声，随分辨率变细
 *   附加：轻平涂（16 级，远细于体素 10 级）带来工笔平涂感
 *
 * 分辨率：RenderTarget 用超采样倍率（桌面 1.5x、移动 1.0x），
 * 即等效 2.25 倍像素量，线条/边缘更细腻；输出时 LinearFilter 降采样回屏幕。
 *
 * 可逆：包住 renderer.render，只把 stage.scene 画进 RT 再走全屏 quad；
 * 关闭恢复原 render 引用，逐像素还原。与体素互斥。
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

  var FRAG = [
    'precision highp float;',
    'varying vec2 vUv;',
    'uniform sampler2D tDiffuse;',
    'uniform vec2 uTexel;',
    'uniform vec2 uRes;',
    'uniform float uTint;',
    'uniform float uEdge;',
    'uniform float uFlat;',
    'float luma(vec3 c){ return dot(c, vec3(0.2126,0.7152,0.0722)); }',
    'float hash21(vec2 p){',
    '  return fract(sin(p.x*12.9898 + p.y*78.233) * 43758.5453);',
    '}',
    'void main(){',
    '  vec3 linC = texture2D(tDiffuse, vUv).rgb;',
    '  float y0 = luma(linC);',
    '  gl_FragColor = vec4(linC, 1.0);',
    '  #include <tonemapping_fragment>',
    '  #include <colorspace_fragment>',
    '  vec3 col = gl_FragColor.rgb;',
    '  float lift = smoothstep(0.10, 0.55, y0);',
    '  col = mix(col, mix(col, vec3(0.95,0.92,0.82), 0.34), uTint * lift * 0.55);',
    '  col.r *= 1.0 + uTint * 0.03;',
    '  col.g *= 1.0 + uTint * 0.11;',
    '  col.b *= 1.0 - uTint * 0.08;',
    '  float sat = max(col.r,max(col.g,col.b)) - min(col.r,min(col.g,col.b));',
    '  float y = luma(col);',
    '  float paper = smoothstep(0.50,0.86,y) * (1.0 - smoothstep(0.04,0.22,sat));',
    '  col = mix(col, vec3(0.94,0.90,0.79), paper * uTint * 0.55);',
    '  float lR  = luma(texture2D(tDiffuse, vUv + vec2(uTexel.x,0.0)).rgb);',
    '  float lL  = luma(texture2D(tDiffuse, vUv - vec2(uTexel.x,0.0)).rgb);',
    '  float lU  = luma(texture2D(tDiffuse, vUv + vec2(0.0,uTexel.y)).rgb);',
    '  float lD  = luma(texture2D(tDiffuse, vUv - vec2(0.0,uTexel.y)).rgb);',
    '  float lUL = luma(texture2D(tDiffuse, vUv + vec2(-uTexel.x, uTexel.y)).rgb);',
    '  float lUR = luma(texture2D(tDiffuse, vUv + vec2( uTexel.x, uTexel.y)).rgb);',
    '  float lDL = luma(texture2D(tDiffuse, vUv + vec2(-uTexel.x,-uTexel.y)).rgb);',
    '  float lDR = luma(texture2D(tDiffuse, vUv + vec2( uTexel.x,-uTexel.y)).rgb);',
    '  float gx = (lR + 2.0*lUR + lDR) - (lL + 2.0*lUL + lDL);',
    '  float gy = (lU + 2.0*lUR + lUL) - (lD + 2.0*lDR + lDL);',
    '  float g = length(vec2(gx,gy));',
    '  float edge = smoothstep(0.10, 0.30, g);',
    '  vec3 ink = vec3(0.11, 0.15, 0.13);',
    '  col = mix(col, ink, edge * uEdge);',
    '  vec3 flatCol = floor(col*16.0 + 0.5)/16.0;',
    '  col = mix(col, flatCol, uFlat);',
    '  vec2 np = floor(vUv * 720.0);',
    '  float n = hash21(np);',
    '  col += (n - 0.5) * 0.030 * uTint;',
    '  gl_FragColor = vec4(clamp(col, 0.0, 1.0), 1.0);',
    '}'
  ].join('\n');

  function create(stage) {
    var renderer = stage && stage.renderer;
    if (!renderer || renderer.__gongbiPatched) return null;

    var originalRender = renderer.render.bind(renderer);
    var size = new T.Vector2();
    var tint = 0.75;        // 工笔设色强度
    var edge = 0.62;        // 墨线强度
    var flat = 0.35;        // 平涂强度
    var enabled = false;

    /* 超采样：桌面像素量翻 2.25 倍；移动端 DPR 已高，保持 1x 保帧率 */
    var mobile = window.innerWidth <= 720 || (window.devicePixelRatio || 1) > 1.5;
    var ss = mobile ? 1.0 : 1.5;
    try {
      var q = new URLSearchParams(location.search);
      if (q.has('ss')) ss = Math.max(1, Math.min(3, Number(q.get('ss')) || 1));
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
        uTexel: { value: new T.Vector2(1 / 2, 1 / 2) },
        uRes: { value: new T.Vector2(2, 2) },
        uTint: { value: tint },
        uEdge: { value: edge },
        uFlat: { value: flat }
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
        mat.uniforms.uRes.value.set(w, h);
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
    renderer.__gongbiPatched = true;

    var button = null;
    var host = document.querySelector('header .tools') || document.querySelector('#ui');
    if (host) {
      button = document.createElement('button');
      button.id = 'gongbi-toggle';
      button.type = 'button';
      button.textContent = '工笔';
      button.title = '工笔重彩：全分辨率勾线设色，再点一次恢复';
      button.setAttribute('aria-pressed', 'false');
      if (host.id === 'ui') button.className = 'btn';
      else {
        button.setAttribute('data-short', '工笔');
        button.setAttribute('data-short-alt', '笔开');
      }
      button.addEventListener('click', function (e) {
        e.stopPropagation();
        api.toggle();
      });
      host.appendChild(button);
    }

    var api = {
      enabled: function () { return enabled; },
      set: function (on) {
        on = !!on;
        if (on === enabled) return on;
        enabled = on;
        if (window.__fxchain) window.__fxchain.set('gongbi', on);
        if (button) {
          button.textContent = on ? '工笔·开' : '工笔';
          button.setAttribute('aria-pressed', String(on));
          button.title = on ? '工笔重彩已开启，点一下恢复原画面' : '工笔重彩：全分辨率勾线设色，再点一次恢复';
        }
        if (on) resizeRT();
        return on;
      },
      toggle: function () { return api.set(!enabled); },
      setTint: function (n) { tint = clamp01(n); mat.uniforms.uTint.value = tint; if (window.__fxchain) window.__fxchain.param('gongbi','uTint',tint); return tint; },
      setEdge: function (n) { edge = clamp01(n); mat.uniforms.uEdge.value = edge; if (window.__fxchain) window.__fxchain.param('gongbi','uEdge',edge); return edge; },
      setFlat: function (n) { flat = clamp01(n); mat.uniforms.uFlat.value = flat; if (window.__fxchain) window.__fxchain.param('gongbi','uFlat',flat); return flat; },
      supersample: function () { return ss; },
      dispose: function () {
        api.set(false);
        renderer.render = originalRender;
        delete renderer.__gongbiPatched;
        rt.dispose(); mat.dispose(); quad.geometry.dispose();
        if (button && button.parentNode) button.parentNode.removeChild(button);
      }
    };
    return api;
  }

  function clamp01(n) { return Math.max(0, Math.min(1, Number(n) || 0)); }

  var current = null;
  window.__gongbi = {
    set: function (on) { return current ? current.set(on) : false; },
    toggle: function () { return current ? current.toggle() : false; },
    on: function () { return !!(current && current.enabled()); },
    tint: function (n) { return current ? current.setTint(n) : 0; },
    edge: function (n) { return current ? current.setEdge(n) : 0; },
    flat: function (n) { return current ? current.setFlat(n) : 0; },
    supersample: function () { return current ? current.supersample() : 0; },
    attach: function (stage) {
      if (current) current.dispose();
      current = create(stage);
      return !!current;
    }
  };

  /* 体素/国潮按钮被打开时自动关掉工笔 */
  function installGuard() {
    var guard = setInterval(function () {
      ['voxel-toggle', 'guochao-toggle'].forEach(function (id) {
        var b = document.getElementById(id);
        if (b && !b.__gongbiGuard) {
          b.__gongbiGuard = true;
          b.addEventListener('click', function () {
            setTimeout(function () {
              if (window.__gongbi && window.__gongbi.on()) window.__gongbi.set(false);
            }, 0);
          });
        }
      });
    }, 150);
    setTimeout(function () { clearInterval(guard); }, 30000);
  }

  /* 场景加载可能很慢，轮询窗口放宽到 3 分钟 */
  var tries = 0;
  var timer = setInterval(function () {
    var stage = window.__stage || window.__zen;
    if (stage && stage.scene && stage.camera && stage.renderer) {
      clearInterval(timer);
      if (window.__gongbi.attach(stage) && document.querySelector('nav [data-stop]')) window.__gongbi.set(true);
    } else if (++tries > 1200) {
      clearInterval(timer);
    }
  }, 150);
})();
