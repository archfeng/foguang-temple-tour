/* voxel.js — 可逆的体素渲染模式
 * 思路：包住 renderer.render，把场景画进低分辨率 RenderTarget，再用全屏四边形
 * 做最近邻放大 + 颜色分阶 + 方块缝。原场景、材质、相机、动画逻辑一律不动；
 * 关闭时恢复原来的 render 引用，画面与性能逐像素回到原样。
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
    'uniform vec2 uGrid;',
    'uniform float uSteps;',
    'void main(){',
    '  vec3 c = texture2D(tDiffuse, vUv).rgb;',
    '  gl_FragColor = vec4(c, 1.0);',
    '  #include <tonemapping_fragment>',
    '  #include <colorspace_fragment>',
    '  vec3 d = gl_FragColor.rgb;',
    '  d = floor(d * uSteps + 0.5) / uSteps;',
    '  vec2 g = fract(vUv * uGrid);',
    '  float e = min(min(g.x, 1.0 - g.x), min(g.y, 1.0 - g.y));',
    '  float seam = smoothstep(0.0, 0.035, e);',
    '  d *= mix(0.91, 1.0, seam);',
    '  gl_FragColor = vec4(d, 1.0);',
    '}'
  ].join('\n');

  function create(stage) {
    var renderer = stage && stage.renderer;
    if (!renderer || renderer.__voxelPatched) return null;

    var originalRender = renderer.render.bind(renderer);
    var size = new T.Vector2();
    var scale = 4;          // 每 4 个屏幕像素为一个“体素块”
    var steps = 10.0;       // 每通道 10 级色阶
    var enabled = false;

    var rt = new T.WebGLRenderTarget(2, 2, {
      minFilter: T.NearestFilter,
      magFilter: T.NearestFilter,
      format: T.RGBAFormat,
      type: T.UnsignedByteType,
      depthBuffer: true,
      stencilBuffer: false
    });
    rt.texture.generateMipmaps = false;

    var mat = new T.ShaderMaterial({
      uniforms: {
        tDiffuse: { value: rt.texture },
        uGrid: { value: new T.Vector2(2, 2) },
        uSteps: { value: steps }
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
      var w = Math.max(2, Math.floor(size.x / scale));
      var h = Math.max(2, Math.floor(size.y / scale));
      if (rt.width !== w || rt.height !== h) {
        rt.setSize(w, h);
        mat.uniforms.uGrid.value.set(w, h);
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
    renderer.__voxelPatched = true;

    // 体素开关按钮已按用户要求移除；效果模块与 API 保留（fxchain / 测试页仍可调用）
    var button = null;

    var api = {
      enabled: function () { return enabled; },
      set: function (on) {
        on = !!on;
        if (on === enabled) return on;
        enabled = on;
        if (window.__fxchain) window.__fxchain.set('voxel', on);
        renderer.domElement.style.imageRendering = '';  // pixelated 交给 fxchain 的 uGrid 处理
        if (button) {
          button.textContent = on ? '体素·开' : '体素';
          button.setAttribute('aria-pressed', String(on));
          button.title = on ? '体素模式已开启，点一下恢复原画面' : '体素模式：把场景变成方块质感，再点一次恢复';
        }
        if (on) resizeRT();
        return on;
      },
      toggle: function () { return api.set(!enabled); },
      setScale: function (n) {
        scale = Math.max(2, Math.min(10, Number(n) || 4));
        if (window.__fxchain && stage && stage.renderer) {
          var sz = new T.Vector2(); stage.renderer.getDrawingBufferSize(sz);
          window.__fxchain.param('voxel', 'uGrid', [sz.x / scale, sz.y / scale]);
        }
        return scale;
      },
      setSteps: function (n) {
        steps = Math.max(2, Math.min(16, Number(n) || 8));
        mat.uniforms.uSteps.value = steps;
        if (window.__fxchain) window.__fxchain.param('voxel', 'uSteps', steps);
        return steps;
      },
      dispose: function () {
        api.set(false);
        renderer.render = originalRender;
        delete renderer.__voxelPatched;
        rt.dispose(); mat.dispose(); quad.geometry.dispose();
        if (button && button.parentNode) button.parentNode.removeChild(button);
      }
    };
    return api;
  }

  var current = null;
  window.__voxel = {
    set: function (on) { return current ? current.set(on) : false; },
    toggle: function () { return current ? current.toggle() : false; },
    on: function () { return !!(current && current.enabled()); },
    scale: function (n) { return current ? current.setScale(n) : 0; },
    steps: function (n) { return current ? current.setSteps(n) : 0; },
    attach: function (stage) {
      if (current) current.dispose();
      current = create(stage);
      return !!current;
    }
  };

  var tries = 0;
  var timer = setInterval(function () {
    var stage = window.__stage || window.__zen;
    if (stage && stage.scene && stage.camera && stage.renderer) {
      clearInterval(timer);
      window.__voxel.attach(stage);
    } else if (++tries > 1200) {
      clearInterval(timer);
    }
  }, 150);
})();
