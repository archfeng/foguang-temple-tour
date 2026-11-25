/* guochao.js — 可逆的「轻量工笔重彩」滤镜（国潮模式）
 * 与 voxel.js 同一套可逆包装：包住 renderer.render，全分辨率画进 RenderTarget，
 * 再用一个全屏 quad 做青绿调色 + 阈值勾边描金。原场景/材质/相机/动画一律不动；
 * 关闭时恢复原来的 render 引用，画面逐像素回到原样。
 * 与体素模式互斥：开启国潮会关掉体素，反之亦然。
 *
 * 顾问约束（awesome-design-md + 决策顾问）：
 *  - 不做强色阶量化 / 大片金边 / 满屏墨线，避免再损木构细节
 *  - 勾边加亮度阈值，只在明暗交界处描淡金，树叶木纹不泛金
 *  - 青绿调色用低权重往 DESIGN.md 的墨绿靠，保留原色
 *  - 单 pass、全分辨率、邻域采样固定 8 次，手机端成本可控
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
    'uniform float uTint;',
    'uniform float uEdge;',
    'float luma(vec3 c){ return dot(c, vec3(0.299,0.587,0.114)); }',
    'void main(){',
    /* 关键：先按体素模块相同的管线把线性 rt 颜色转成显示(sRGB)空间，
       再在显示空间里调色/勾边。若在线性空间调色会严重偏色（画面发蓝发白）。 */
    '  vec3 lin = texture2D(tDiffuse, vUv).rgb;',
    '  gl_FragColor = vec4(lin, 1.0);',
    '  #include <tonemapping_fragment>',
    '  #include <colorspace_fragment>',
    '  vec3 col = gl_FragColor.rgb;',
    /* 邻域也取显示空间亮度用于勾边 */
    '  vec3 oR = texture2D(tDiffuse, vUv + vec2(uTexel.x,0.0)).rgb; gl_FragColor = vec4(oR,1.0);',
    '  #include <tonemapping_fragment>',
    '  #include <colorspace_fragment>',
    '  float lR = luma(gl_FragColor.rgb);',
    '  vec3 oL = texture2D(tDiffuse, vUv - vec2(uTexel.x,0.0)).rgb; gl_FragColor = vec4(oL,1.0);',
    '  #include <tonemapping_fragment>',
    '  #include <colorspace_fragment>',
    '  float lL = luma(gl_FragColor.rgb);',
    '  vec3 oU = texture2D(tDiffuse, vUv + vec2(0.0,uTexel.y)).rgb; gl_FragColor = vec4(oU,1.0);',
    '  #include <tonemapping_fragment>',
    '  #include <colorspace_fragment>',
    '  float lU = luma(gl_FragColor.rgb);',
    '  vec3 oD = texture2D(tDiffuse, vUv - vec2(0.0,uTexel.y)).rgb; gl_FragColor = vec4(oD,1.0);',
    '  #include <tonemapping_fragment>',
    '  #include <colorspace_fragment>',
    '  float lD = luma(gl_FragColor.rgb);',
    '  vec3 oUL = texture2D(tDiffuse, vUv + vec2(-uTexel.x, uTexel.y)).rgb; gl_FragColor = vec4(oUL,1.0);',
    '  #include <tonemapping_fragment>',
    '  #include <colorspace_fragment>',
    '  float lUL = luma(gl_FragColor.rgb);',
    '  vec3 oUR = texture2D(tDiffuse, vUv + vec2( uTexel.x, uTexel.y)).rgb; gl_FragColor = vec4(oUR,1.0);',
    '  #include <tonemapping_fragment>',
    '  #include <colorspace_fragment>',
    '  float lUR = luma(gl_FragColor.rgb);',
    '  vec3 oDL = texture2D(tDiffuse, vUv + vec2(-uTexel.x,-uTexel.y)).rgb; gl_FragColor = vec4(oDL,1.0);',
    '  #include <tonemapping_fragment>',
    '  #include <colorspace_fragment>',
    '  float lDL = luma(gl_FragColor.rgb);',
    '  vec3 oDR = texture2D(tDiffuse, vUv + vec2( uTexel.x,-uTexel.y)).rgb; gl_FragColor = vec4(oDR,1.0);',
    '  #include <tonemapping_fragment>',
    '  #include <colorspace_fragment>',
    '  float lDR = luma(gl_FragColor.rgb);',
    /* 调色：纯通道增益的暖青绿偏色（提绿、压蓝、微提红）。
       不用按 luma 重着色（那会把低饱和的雪地/天空重映射成青灰、与蓝天叠加发白）。
       纯乘法保证 uTint=0 时画面逐像素不变，且压蓝提绿绝不会往蓝偏。 */
    '  col.r *= 1.0 + uTint * 0.06;',
    '  col.g *= 1.0 + uTint * 0.14;',
    '  col.b *= 1.0 - uTint * 0.12;',
    /* 勾边：八邻域亮度梯度（显示空间），阈值以上才描金，避免满屏泛金 */
    '  float gx = lR+lUR+lDR - lL-lUL-lDL;',
    '  float gy = lU+lUL+lUR - lD-lDL-lDR;',
    '  float g = length(vec2(gx,gy));',
    '  float edge = smoothstep(0.28, 0.55, g);',
    '  vec3 gold = vec3(0.85, 0.70, 0.36);',
    '  col = mix(col, gold, edge * uEdge);',
    '  gl_FragColor = vec4(col, 1.0);',
    '}'
  ].join('\n');

  function create(stage) {
    var renderer = stage && stage.renderer;
    if (!renderer || renderer.__guochaoPatched) return null;

    var originalRender = renderer.render.bind(renderer);
    var size = new T.Vector2();
    var tint = 0.55;        // 暖青绿偏色强度（纯通道增益，克制）
    var edge = 0.5;        // 描金强度
    var enabled = false;

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
        uTint: { value: tint },
        uEdge: { value: edge }
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
      if (rt.width !== size.x || rt.height !== size.y) {
        rt.setSize(size.x, size.y);
        mat.uniforms.uTexel.value.set(1 / size.x, 1 / size.y);
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

    renderer.render = patched;
    renderer.__guochaoPatched = true;

    var button = null;
    var host = document.querySelector('header .tools') || document.querySelector('#ui');
    if (host) {
      button = document.createElement('button');
      button.id = 'guochao-toggle';
      button.type = 'button';
      button.textContent = '国潮';
      button.title = '国潮模式：全分辨率工笔重彩，再点一次恢复';
      button.setAttribute('aria-pressed', 'false');
      if (host.id === 'ui') button.className = 'btn';
      else {
        button.setAttribute('data-short', '国潮');
        button.setAttribute('data-short-alt', '潮开');
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
        if (on && window.__voxel && window.__voxel.on()) window.__voxel.set(false);
        enabled = on;
        if (button) {
          button.textContent = on ? '国潮·开' : '国潮';
          button.setAttribute('aria-pressed', String(on));
          button.title = on ? '国潮模式已开启，点一下恢复原画面' : '国潮模式：全分辨率工笔重彩，再点一次恢复';
        }
        if (on) resizeRT();
        return on;
      },
      toggle: function () { return api.set(!enabled); },
      setTint: function (n) {
        tint = Math.max(0, Math.min(1, Number(n) || 0));
        mat.uniforms.uTint.value = tint;
        return tint;
      },
      setEdge: function (n) {
        edge = Math.max(0, Math.min(1, Number(n) || 0));
        mat.uniforms.uEdge.value = edge;
        return edge;
      },
      dispose: function () {
        api.set(false);
        renderer.render = originalRender;
        delete renderer.__guochaoPatched;
        rt.dispose(); mat.dispose(); quad.geometry.dispose();
        if (button && button.parentNode) button.parentNode.removeChild(button);
      }
    };
    return api;
  }

  var current = null;
  window.__guochao = {
    set: function (on) { return current ? current.set(on) : false; },
    toggle: function () { return current ? current.toggle() : false; },
    on: function () { return !!(current && current.enabled()); },
    tint: function (n) { return current ? current.setTint(n) : 0; },
    edge: function (n) { return current ? current.setEdge(n) : 0; },
    attach: function (stage) {
      if (current) current.dispose();
      current = create(stage);
      return !!current;
    }
  };

  /* attach 成功后再挂互斥监听：体素按钮被打开时自动关掉国潮 */
  function installGuard() {
    var guard = setInterval(function () {
      var vb = document.getElementById('voxel-toggle');
      if (vb) {
        clearInterval(guard);
        vb.addEventListener('click', function () {
          setTimeout(function () {
            if (window.__voxel && window.__voxel.on() && window.__guochao.on()) {
              window.__guochao.set(false);
            }
          }, 0);
        });
      }
    }, 150);
    setTimeout(function () { clearInterval(guard); }, 30000);
  }

  /* 场景加载可能很慢（大场景 + 纹理），轮询窗口放宽到 3 分钟 */
  var tries = 0;
  var timer = setInterval(function () {
    var stage = window.__stage || window.__zen;
    if (stage && stage.scene && stage.camera && stage.renderer) {
      clearInterval(timer);
      if (window.__guochao.attach(stage)) installGuard();
    } else if (++tries > 1200) {
      clearInterval(timer);
    }
  }, 150);
})();
