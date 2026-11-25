/* nightsky.js — 夜空星野 + 北斗七星（建模层，独立模块）
 *
 * 设计：
 *  - 不改动 scene.background / world.js 的昼夜配色；只在夜里往场景里加一层星点。
 *  - 星点是场景里的真实几何（THREE.Points），所以会被建筑遮挡、会进镜面水倒影、
 *    也会自然参与体素/工笔/油画/光效四条滤镜链。
 *  - 星野跟着相机平移（跟随视点，永远在天边），但方向固定在世界坐标里，
 *    转头时星星不会粘在屏幕上。
 *  - 亮度由 window.__wonder.state.hour 自动驱动：18.5→20 点渐显，5→6.5 点渐隐。
 *    点「夜景光效」时 hour 被锁到 20，星空自然全亮。
 */
(function () {
  'use strict';
  var T = window.THREE;
  if (!T) return;

  var RADIUS = 505;          // 相机 far=560，星点放在远裁剪面之前
  var STAR_COUNT = 1700;

  // 北斗七星：赤经(度) / 赤纬(度)。顺序为 斗魁四星 → 斗柄三星。
  var DIPPER = [
    { name: '天枢 Dubhe',  ra: 165.75, dec: 61.75, size: 7.4 },
    { name: '天璇 Merak',  ra: 165.50, dec: 56.38, size: 6.4 },
    { name: '天玑 Phecda', ra: 178.50, dec: 53.69, size: 6.2 },
    { name: '天权 Megrez', ra: 183.75, dec: 57.03, size: 5.6 },
    { name: '玉衡 Alioth', ra: 193.50, dec: 55.96, size: 6.6 },
    { name: '开阳 Mizar',  ra: 200.98, dec: 54.93, size: 6.4 },
    { name: '摇光 Alkaid', ra: 206.89, dec: 49.31, size: 6.0 }
  ];

  var VERT = [
    'attribute float aSize;',
    'attribute float aPhase;',
    'attribute vec3  aTint;',
    'uniform float uTime;',
    'uniform float uPR;',
    'varying vec3  vTint;',
    'varying float vTw;',
    'void main(){',
    '  vTint = aTint;',
    '  vec4 mv = modelViewMatrix * vec4(position,1.0);',
    '  gl_Position = projectionMatrix * mv;',
    '  vTw = 0.80 + 0.20*sin(uTime*1.15 + aPhase);',
    '  gl_PointSize = aSize * uPR * (0.88 + 0.12*vTw);',
    '}'
  ].join('\n');

  var FRAG = [
    'precision highp float;',
    'uniform float uNight;',
    'varying vec3  vTint;',
    'varying float vTw;',
    'void main(){',
    '  vec2 d = gl_PointCoord - vec2(0.5);',
    '  float r = length(d);',
    '  if(r > 0.5) discard;',
    '  float core = smoothstep(0.16, 0.0, r);',
    '  float glow = exp(-r*r*15.0) * 0.55;',
    '  float a = (core + glow) * vTw * uNight;',
    '  if(a < 0.004) discard;',
    '  gl_FragColor = vec4(vTint, a);',
    '}'
  ].join('\n');

  function nightAmount(h) {
    if (!isFinite(h)) return 0;
    if (h >= 20 || h < 5) return 1;
    if (h > 18.5) return (h - 18.5) / 1.5;
    if (h < 6.5) return 1 - (h - 5) / 1.5;
    return 0;
  }

  function equatorial(raDeg, decDeg) {
    var ra = raDeg * Math.PI / 180, dec = decDeg * Math.PI / 180;
    var cd = Math.cos(dec);
    return new T.Vector3(cd * Math.cos(ra), Math.sin(dec), cd * Math.sin(ra));
  }

  function build(stage) {
    var scene = stage.scene, camera = stage.camera, renderer = stage.renderer;
    if (!scene || !camera || !renderer) return null;
    if (scene.__nightsky) return scene.__nightsky;

    var group = new T.Group();
    group.name = 'nightsky';
    group.position.copy(camera.position);
    scene.add(group);

    var pr = renderer.getPixelRatio ? (renderer.getPixelRatio() || 1) : 1;
    var uniforms = {
      uTime:  { value: 0 },
      uNight: { value: 0 },
      uPR:    { value: pr }
    };
    var mat = new T.ShaderMaterial({
      uniforms: uniforms,
      vertexShader: VERT,
      fragmentShader: FRAG,
      transparent: true,
      depthTest: true,
      depthWrite: false,
      blending: T.AdditiveBlending,
      fog: false
    });

    // ---- 背景星野：上半球均匀撒点，少量暖星、少量亮星 ----
    var pos = new Float32Array(STAR_COUNT * 3);
    var siz = new Float32Array(STAR_COUNT);
    var pha = new Float32Array(STAR_COUNT);
    var tin = new Float32Array(STAR_COUNT * 3);
    for (var i = 0; i < STAR_COUNT; i++) {
      var u = -0.06 + Math.random() * 1.06;         // 略低于地平线，保证抬头低角度也有星
      var th = Math.random() * Math.PI * 2;
      var rr = Math.sqrt(Math.max(0, 1 - u * u));
      pos[i * 3]     = rr * Math.cos(th) * RADIUS;
      pos[i * 3 + 1] = u * RADIUS;
      pos[i * 3 + 2] = rr * Math.sin(th) * RADIUS;

      var r0 = Math.random();
      siz[i] = r0 > 0.985 ? 4.4 + Math.random() * 2.0
             : r0 > 0.86  ? 2.8 + Math.random() * 1.4
             :             1.5 + Math.random() * 1.5;
      pha[i] = Math.random() * Math.PI * 2;
      var warm = Math.random() < 0.16;
      tin[i * 3]     = warm ? 1.00 : 0.84 + Math.random() * 0.16;
      tin[i * 3 + 1] = warm ? 0.90 : 0.88 + Math.random() * 0.12;
      tin[i * 3 + 2] = warm ? 0.78 : 1.00;
    }
    var geo = new T.BufferGeometry();
    geo.setAttribute('position', new T.BufferAttribute(pos, 3));
    geo.setAttribute('aSize',    new T.BufferAttribute(siz, 1));
    geo.setAttribute('aPhase',   new T.BufferAttribute(pha, 1));
    geo.setAttribute('aTint',    new T.BufferAttribute(tin, 3));
    var stars = new T.Points(geo, mat);
    stars.frustumCulled = false;
    stars.renderOrder = -20;
    group.add(stars);

    // ---- 北斗七星：用真实赤经赤纬定形，再整体旋到初始视线偏北的高空 ----
    var dirs = DIPPER.map(function (s) { return equatorial(s.ra, s.dec); });
    var center = new T.Vector3();
    dirs.forEach(function (d) { center.add(d); });
    center.normalize();
    // 目标：地面游览视线（大致朝 +x）偏右上方，高度约 25°，
    // 站在山门/台阶上不用刻意抬头就能看见勺形；鸟瞰时也有满天星点。
    var target = new T.Vector3(0.88, 0.43, -0.26).normalize();
    var q = new T.Quaternion().setFromUnitVectors(center, target);
    // 略收紧角距（真实北斗约 25°，这里约 21°），让整把勺子更容易落在一个画面里
    dirs = dirs.map(function (d) {
      return d.applyQuaternion(q).normalize()
              .sub(target).multiplyScalar(0.84).add(target).normalize();
    });

    var dpos = new Float32Array(7 * 3);
    var dsiz = new Float32Array(7);
    var dpha = new Float32Array(7);
    var dtin = new Float32Array(7 * 3);
    dirs.forEach(function (d, i) {
      var p = d.clone().multiplyScalar(RADIUS * 0.994);
      dpos[i * 3] = p.x; dpos[i * 3 + 1] = p.y; dpos[i * 3 + 2] = p.z;
      dsiz[i] = DIPPER[i].size;
      dpha[i] = i * 0.63;
      dtin[i * 3] = 0.94; dtin[i * 3 + 1] = 0.96; dtin[i * 3 + 2] = 1.00;
    });
    var dgeo = new T.BufferGeometry();
    dgeo.setAttribute('position', new T.BufferAttribute(dpos, 3));
    dgeo.setAttribute('aSize',    new T.BufferAttribute(dsiz, 1));
    dgeo.setAttribute('aPhase',   new T.BufferAttribute(dpha, 1));
    dgeo.setAttribute('aTint',    new T.BufferAttribute(dtin, 3));
    var dipper = new T.Points(dgeo, mat);
    dipper.frustumCulled = false;
    dipper.renderOrder = -19;
    group.add(dipper);

    // 斗魁闭合 + 斗柄三连，极淡的连线帮助辨认勺形
    var seq = [0, 1, 2, 3, 0, 3, 4, 5, 6];
    var lpos = new Float32Array(seq.length * 3);
    seq.forEach(function (idx, i) {
      var p = dirs[idx].clone().multiplyScalar(RADIUS * 0.992);
      lpos[i * 3] = p.x; lpos[i * 3 + 1] = p.y; lpos[i * 3 + 2] = p.z;
    });
    var lgeo = new T.BufferGeometry();
    lgeo.setAttribute('position', new T.BufferAttribute(lpos, 3));
    var lmat = new T.LineBasicMaterial({
      color: 0x9fb8e0, transparent: true, opacity: 0,
      depthTest: true, depthWrite: false, fog: false
    });
    var line = new T.Line(lgeo, lmat);
    line.frustumCulled = false;
    line.renderOrder = -18;
    group.add(line);

    var forceNight = null;   // 调试用：null=按时辰自动
    var last = performance.now();

    function tick(now) {
      now = now || performance.now();
      if (group.parent && camera) group.position.copy(camera.position);
      var w = window.__wonder;
      var h = w && w.state && isFinite(w.state.hour) ? w.state.hour : NaN;
      var amt = forceNight === null ? nightAmount(h) : forceNight;
      uniforms.uNight.value = amt;
      lmat.opacity = amt * 0.26;
      uniforms.uTime.value += Math.min(0.1, (now - last) / 1000);
      last = now;
      requestAnimationFrame(tick);
    }
    requestAnimationFrame(tick);

    var api = {
      group: group,
      count: function () { return STAR_COUNT; },
      night: function () { return uniforms.uNight.value; },
      force: function (v) { forceNight = (v === null || v === undefined) ? null : Math.max(0, Math.min(1, Number(v) || 0)); return forceNight; },
      dipper: function () { return DIPPER.map(function (s) { return s.name; }); },
      dispose: function () {
        scene.remove(group);
        geo.dispose(); dgeo.dispose(); lgeo.dispose(); mat.dispose(); lmat.dispose();
        delete scene.__nightsky;
      }
    };
    scene.__nightsky = api;
    return api;
  }

  var current = null;
  var tries = 0;
  var timer = setInterval(function () {
    var st = window.__stage || window.__zen;
    if (st && st.scene && st.camera && st.renderer) {
      clearInterval(timer);
      current = build(st);
    } else if (++tries > 1200) clearInterval(timer);
  }, 150);

  window.__nightsky = {
    attach: function (stage) { current = build(stage || window.__stage); return !!current; },
    on: function () { return !!current; },
    count: function () { return current ? current.count() : 0; },
    night: function () { return current ? current.night() : 0; },
    force: function (v) { return current ? current.force(v) : null; },
    dipper: function () { return current ? current.dipper() : []; }
  };
})();
