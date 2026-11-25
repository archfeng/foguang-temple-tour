/* pond-mirror.js — 莲池镜面水 r160
 * 合成架构：premultiplied-alpha + CustomBlending(One, OneMinusSrcAlpha)
 * shader 内：col_out = body*alpha + refl*F  (反射不乘 alpha，倒影不再被透射 alpha 稀释)
 * 由 Claude 顾问产出，解决倒影可见度 = F×alpha 双重衰减的问题。
 * 反射渲染走 rawRender 绕开 fxchain，不侵入主程序。
 */
(function () {
  'use strict';
  var T = window.THREE;
  if (!T) return;

  /* ── 顶点着色器 ─────────────────────────────────────────────── */
  var VERT = [
    'uniform mat4 textureMatrix;',
    'varying vec4 vUvProj;',
    'varying vec3 vWorld;',
    'void main(){',
    '  vec4 wp = modelMatrix * vec4(position, 1.0);',
    '  vWorld   = wp.xyz;',
    '  vUvProj  = textureMatrix * vec4(position, 1.0);',
    '  gl_Position = projectionMatrix * viewMatrix * wp;',
    '}'
  ].join('\n');

  /* ── 片元着色器 ─────────────────────────────────────────────── */
  var FRAG = [
    'precision highp float;',
    'uniform sampler2D tReflect;',
    'uniform float uTime;',
    'uniform float uReflStrength;',
    'uniform vec3  uDeep;',
    'uniform vec3  uShallow;',
    'uniform vec2  uCenter;',
    'uniform vec2  uHalf;',
    'uniform vec2  uPx;',
    'varying vec4  vUvProj;',
    'varying vec3  vWorld;',

    'void main(){',
    '  vec2 projUV = vUvProj.xy / max(0.0001, vUvProj.w);',
    '  vec2 wp     = vWorld.xz;',
    '  float t     = uTime;',

    // 水波：世界坐标三组斜向涟漪，避免掠射栅格纹
    '  float w1 = sin((wp.x * 0.86 + wp.y * 0.51) * 4.0 + t * 1.05);',
    '  float w2 = sin((wp.x * -0.42 + wp.y * 0.91) * 3.0 - t * 0.80 + w1 * 0.9);',
    '  float w3 = sin((wp.x * 1.10 - wp.y * 0.33) * 2.5 + t * 0.60);',

    // Fresnel：掠射→高反射，俯视→低反射
    '  vec3  vd    = normalize(cameraPosition - vWorld);',
    '  float cosA  = clamp(abs(vd.y), 0.0, 1.0);',
    '  float F     = mix(0.78, 0.18, pow(cosA, 1.4));',

    // 水波扰动幅度：掠射时减小防条纹
    '  float amp   = mix(0.55, 1.0, cosA);',
    '  vec2  off   = vec2(',
    '    w1 * 0.0055 + w2 * 0.0022 + w3 * 0.0012,',
    '    w2 * 0.0045 - w1 * 0.0018 - w3 * 0.0010',
    '  ) * amp;',
    '  vec2  suv   = clamp(projUV + off, 0.003, 0.997);',

    // 反射采样：3-tap 轻柔模糊消锯齿
    '  vec2  px    = uPx * 0.9;',
    '  vec3  refl  = texture2D(tReflect, suv).rgb * 0.50;',
    '  refl       += texture2D(tReflect, clamp(suv + vec2(px.x, 0.0), 0.003, 0.997)).rgb * 0.25;',
    '  refl       += texture2D(tReflect, clamp(suv - vec2(px.x, 0.0), 0.003, 0.997)).rgb * 0.25;',
    '  refl        = clamp(refl * uReflStrength, 0.0, 0.95);',

    // 水深 / 体积感：池边浅、池心深，Beer-Lambert 吸收
    '  vec2  toC   = abs(wp - uCenter) / uHalf;',
    '  float rim   = clamp(max(toC.x, toC.y), 0.0, 1.0);',
    '  float depth = 1.0 - smoothstep(0.25, 1.0, rim);',
    '  float wd    = mix(0.12, 1.0, depth);',
    '  float absorb = exp(-wd * 2.8);',
    '  float scint  = 0.88 + 0.08 * w1 * w2;',
    '  vec3  body  = mix(uDeep, uShallow, absorb) * scint;',

    // 透射 alpha：俯视清透见底（低 alpha），掠射更不透（高 alpha）；与 F 解耦
    '  float baseAlpha = mix(0.22, 0.46, depth);',
    '  float alpha     = clamp(baseAlpha + (1.0 - cosA) * 0.30, 0.20, 0.72);',

    // Premultiplied alpha 合成：反射作为独立能量叠加，不被 alpha 稀释
    // final = body*alpha + refl*F + bg*(1-alpha)，倒影可见度 = F（俯视约0.18，掠射约0.78）
    '  vec3  col   = body * alpha + refl * F;',
    '  gl_FragColor = vec4(col, alpha);',
    '  #include <tonemapping_fragment>',
    '  #include <colorspace_fragment>',
    '}'
  ].join('\n');

  function install() {
    var stage = window.__stage || window.__zen;
    if (!stage || !stage.scene || !stage.camera || !stage.renderer) return false;
    var renderer = stage.renderer, scene = stage.scene, camera = stage.camera;

    var water = null;
    scene.traverse(function (o) { if (o.name === 'pondWater' && o.isMesh) water = o; });
    if (!water) return false;

    // rawRender：绕开 fxchain 钩子，防递归串联
    var rawRender = null;
    var fc = window.__fxchain;
    if (fc && typeof fc.rawRender === 'function') rawRender = fc.rawRender();
    if (!rawRender) rawRender = renderer.render.bind(renderer);

    var size = new T.Vector2();
    renderer.getDrawingBufferSize(size);
    var RW = Math.max(384, Math.min(1536, Math.round(size.x * 0.8)));
    var RH = Math.max(256, Math.min(1024, Math.round(size.y * 0.8)));
    var rt = new T.WebGLRenderTarget(RW, RH, {
      minFilter: T.LinearFilter, magFilter: T.LinearFilter,
      format: T.RGBAFormat, type: T.UnsignedByteType,
      depthBuffer: true, stencilBuffer: false
    });
    rt.texture.generateMipmaps = false;
    rt.texture.colorSpace = T.SRGBColorSpace;

    var textureMatrix = new T.Matrix4();

    var mat = new T.ShaderMaterial({
      uniforms: {
        tReflect:      { value: rt.texture },
        textureMatrix: { value: textureMatrix },
        uTime:         { value: 0 },
        uReflStrength: { value: 0.5 },
        uDeep:         { value: new T.Color('#173f45') },
        uShallow:      { value: new T.Color('#4d8f89') },
        uCenter:       { value: new T.Vector2(-30.2, 8.4) },
        uHalf:         { value: new T.Vector2(3.2, 2.2) },
        uPx:           { value: new T.Vector2(1 / RW, 1 / RH) }
      },
      vertexShader: VERT,
      fragmentShader: FRAG,
      transparent: true,
      depthWrite: false,
      side: T.DoubleSide,
      toneMapped: false,

      // Premultiplied alpha blending：final = src.rgb + dst.rgb * (1 - src.a)
      blending: T.CustomBlending,
      blendEquation: T.AddEquation,
      blendSrc: T.OneFactor,
      blendDst: T.OneMinusSrcAlphaFactor,
      blendEquationAlpha: T.AddEquation,
      blendSrcAlpha: T.OneFactor,
      blendDstAlpha: T.OneMinusSrcAlphaFactor,
      premultipliedAlpha: true
    });
    var savedMat = water.material;
    water.material = mat;
    water.renderOrder = 10;

    // 镜像相机数学（保留原有已验证正确的实现）
    var reflectorPlane = new T.Plane();
    var normal         = new T.Vector3();
    var rWorldPos      = new T.Vector3();
    var camWorldPos    = new T.Vector3();
    var rotMat         = new T.Matrix4();
    var lookAtVec      = new T.Vector3(0, 0, -1);
    var clipPlane      = new T.Vector4();
    var view           = new T.Vector3();
    var target         = new T.Vector3();
    var q              = new T.Vector4();
    var virtualCam     = new T.PerspectiveCamera();
    var reflecting     = false;

    function updateReflect(renderer, scene, camera) {
      if (reflecting) return;
      reflecting = true;
      var restore = function () { water.visible = true; };
      try {
        water.getWorldPosition(rWorldPos);
        camera.getWorldPosition(camWorldPos);
        rotMat.extractRotation(water.matrixWorld);
        normal.set(0, 0, 1).applyMatrix4(rotMat).normalize();

        view.subVectors(rWorldPos, camWorldPos);
        if (view.dot(normal) > 0) { reflecting = false; return; }
        view.reflect(normal).negate().add(rWorldPos);

        rotMat.extractRotation(camera.matrixWorld);
        lookAtVec.set(0, 0, -1).applyMatrix4(rotMat).add(camWorldPos);
        target.subVectors(rWorldPos, lookAtVec).reflect(normal).negate().add(rWorldPos);

        virtualCam.position.copy(view);
        virtualCam.up.set(0, 1, 0).applyMatrix4(rotMat).reflect(normal);
        virtualCam.lookAt(target);
        virtualCam.far  = camera.far;
        virtualCam.near = camera.near;
        virtualCam.updateMatrixWorld();
        virtualCam.projectionMatrix.copy(camera.projectionMatrix);

        textureMatrix.set(
          0.5, 0,   0,   0.5,
          0,   0.5, 0,   0.5,
          0,   0,   0.5, 0.5,
          0,   0,   0,   1
        );
        textureMatrix.multiply(virtualCam.projectionMatrix);
        textureMatrix.multiply(virtualCam.matrixWorldInverse);
        textureMatrix.multiply(water.matrixWorld);

        // 斜截锥裁剪平面：略高于水面，去掉水底，避免贴水荷叶/锦鲤被放大成深色块
        var clipOrigin = rWorldPos.clone().addScaledVector(normal, 0.16);
        reflectorPlane.setFromNormalAndCoplanarPoint(normal, clipOrigin);
        reflectorPlane.applyMatrix4(virtualCam.matrixWorldInverse);
        clipPlane.set(
          reflectorPlane.normal.x, reflectorPlane.normal.y,
          reflectorPlane.normal.z, reflectorPlane.constant
        );
        var pm = virtualCam.projectionMatrix, e = pm.elements;
        q.x = (Math.sign(clipPlane.x) + e[8])  / e[0];
        q.y = (Math.sign(clipPlane.y) + e[9])  / e[5];
        q.z = -1.0;
        q.w = (1.0 + e[10]) / e[14];
        clipPlane.multiplyScalar(2.0 / clipPlane.dot(q));
        e[2]  = clipPlane.x;
        e[6]  = clipPlane.y;
        e[10] = clipPlane.z + 1.0 - 0.004;
        e[14] = clipPlane.w;

        // 隐藏笔触点云 / 临时恢复真实植被：倒影里映真实古建草木，不是绿点
        var hiddenCloud = [], restoredPlants = [];
        water.visible = false;
        scene.traverse(function (o) {
          if (!o.userData) return;
          if (o.userData.oilPaintCloud && o.visible) {
            o.visible = false; hiddenCloud.push(o);
          } else if (o.userData.__oilPrevVisible === true && !o.visible) {
            o.visible = true; restoredPlants.push(o);
          }
        });
        restore = function () {
          water.visible = true;
          hiddenCloud.forEach(function (o) { o.visible = true; });
          restoredPlants.forEach(function (o) { o.visible = false; });
        };

        var oldRT   = renderer.getRenderTarget();
        var oldAuto = renderer.autoClear;
        renderer.autoClear = true;
        renderer.setRenderTarget(rt);
        renderer.clear();
        rawRender(scene, virtualCam);
        renderer.setRenderTarget(oldRT);
        renderer.autoClear = oldAuto;

      } catch (err) {
        // 反射帧失败不崩主画面
      } finally {
        restore();
        reflecting = false;
      }
    }

    water.onBeforeRender = function (r, s, c) {
      mat.uniforms.uTime.value = performance.now() / 1000;
      updateReflect(r, s, c);
    };

    window.__pondMirror = {
      rt:  rt,
      mat: mat,
      setReflStrength: function (v) { mat.uniforms.uReflStrength.value = v; },
      on: function () { return true; },
      dispose: function () {
        water.material = savedMat;
        water.onBeforeRender = function () {};
        rt.dispose();
        mat.dispose();
      }
    };
    return true;
  }

  var tries = 0;
  var timer = setInterval(function () {
    if (install()) { clearInterval(timer); return; }
    if (++tries > 400) clearInterval(timer);
  }, 200);
})();
