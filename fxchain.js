/* fxchain.js — 统一后处理链：让体素/工笔/油画/光效可任意叠加
 *
 * 背景：原来四个滤镜各自包 renderer.render、各自"场景→RT→quad→屏幕"，
 * 同时开只会 last-write-wins（互相覆盖）。本模块把渲染统一成一条链：
 *   场景 → sceneRT(带 tonemap/colorspace) → pass1 → pass2 → ... → 屏幕
 * 每个 pass 读上一个 RT、写下一个 RT；因为输入已经是显示空间，pass shader
 * 内部不再做 tonemap/colorspace（避免二次压暗）。
 *
 * 各滤镜模块（voxel/gongbi/youhua/lightfx）保留按钮与参数 API，但把
 * enabled 状态与 shader 注册到本链；它们不再自己包 renderer.render。
 */
(function () {
  'use strict';
  var T = window.THREE;
  if (!T) return;

  var VERT = [
    'varying vec2 vUv;',
    'void main(){ vUv=uv; gl_Position=vec4(position.xy,0.0,1.0); }'
  ].join('\n');
  var PIXEL_HEAD = 'precision highp float;\nvarying vec2 vUv;\nuniform sampler2D tDiffuse;\n';

  // ---------- 四个 pass 的片元核心（输入为显示空间颜色，无 tonemap/colorspace） ----------
  var CORES = {
    voxel: {
      uniforms: function () {
        return { uGrid: { value: new T.Vector2(2, 2) }, uSteps: { value: 10.0 } };
      },
      frag: PIXEL_HEAD + [
        'uniform vec2 uGrid;', 'uniform float uSteps;',
        'void main(){',
        '  vec3 c=texture2D(tDiffuse,vUv).rgb;',
        '  c=floor(c*uSteps+0.5)/uSteps;',
        '  vec2 g=fract(vUv*uGrid);',
        '  float e=min(min(g.x,1.0-g.x),min(g.y,1.0-g.y));',
        '  c*=mix(0.91,1.0,smoothstep(0.0,0.035,e));',
        '  gl_FragColor=vec4(c,1.0);',
        '}'
      ].join('\n')
    },
    gongbi: {
      uniforms: function () {
        return {
          uTexel: { value: new T.Vector2(1 / 2, 1 / 2) },
          uRes: { value: new T.Vector2(2, 2) },
          uTint: { value: 0.75 }, uEdge: { value: 0.62 }, uFlat: { value: 0.35 }
        };
      },
      frag: PIXEL_HEAD + [
        'uniform vec2 uTexel;', 'uniform vec2 uRes;',
        'uniform float uTint;', 'uniform float uEdge;', 'uniform float uFlat;',
        'float luma(vec3 c){return dot(c,vec3(0.2126,0.7152,0.0722));}',
        'float hash21(vec2 p){return fract(sin(p.x*12.9898+p.y*78.233)*43758.5453);}',
        'void main(){',
        '  vec3 col=texture2D(tDiffuse,vUv).rgb;',
        '  float y0=luma(col);',
        '  float lift=smoothstep(0.10,0.55,y0);',
        '  col=mix(col,mix(col,vec3(0.95,0.92,0.82),0.34),uTint*lift*0.55);',
        '  col.r*=1.0+uTint*0.03; col.g*=1.0+uTint*0.11; col.b*=1.0-uTint*0.08;',
        '  float sat=max(col.r,max(col.g,col.b))-min(col.r,min(col.g,col.b));',
        '  float y=luma(col);',
        '  float paper=smoothstep(0.50,0.86,y)*(1.0-smoothstep(0.04,0.22,sat));',
        '  col=mix(col,vec3(0.94,0.90,0.79),paper*uTint*0.55);',
        '  float lR=luma(texture2D(tDiffuse,vUv+vec2(uTexel.x,0.0)).rgb);',
        '  float lL=luma(texture2D(tDiffuse,vUv-vec2(uTexel.x,0.0)).rgb);',
        '  float lU=luma(texture2D(tDiffuse,vUv+vec2(0.0,uTexel.y)).rgb);',
        '  float lD=luma(texture2D(tDiffuse,vUv-vec2(0.0,uTexel.y)).rgb);',
        '  float g=length(vec2(lR-lL,lU-lD));',
        '  float ink=smoothstep(0.12,0.42,g)*uEdge;',
        '  col*=1.0-ink*0.55;',
        '  float q=14.0; float n=hash21(floor(vUv*900.0));',
        '  col=floor(col*q+n)/q;',
        '  gl_FragColor=vec4(mix(col,texture2D(tDiffuse,vUv).rgb,1.0-uFlat),1.0);',
        '}'
      ].join('\n')
    },
    youhua: {
      uniforms: function () {
        return {
          uTexel: { value: new T.Vector2(1 / 2, 1 / 2) },
          uRadius: { value: 2 }, uStep: { value: 2 },
          uStrength: { value: 1.0 }, uQuant: { value: 12 }
        };
      },
      frag: PIXEL_HEAD + [
        'uniform vec2 uTexel;', 'uniform float uRadius;', 'uniform float uStep;',
        'uniform float uStrength;', 'uniform float uQuant;',
        'vec3 kuwahara(vec2 uv){',
        '  vec2 stp=uTexel*uStep; int R=int(uRadius+0.5);',
        '  float n=float((R+1)*(R+1)); vec3 best=vec3(0.0); float bs=1e9;',
        '  for(int q=0;q<4;q++){',
        '    vec3 m=vec3(0.0),s=vec3(0.0);',
        '    for(int jj=0;jj<=4;jj++){ if(jj>R)break;',
        '      for(int ii=0;ii<=4;ii++){ if(ii>R)break;',
        '        int di=(q==0||q==2)?-ii:ii; int dj=(q==0||q==1)?-jj:jj;',
        '        vec3 c=texture2D(tDiffuse,uv+vec2(float(di),float(dj))*stp).rgb;',
        '        m+=c; s+=c*c;',
        '      }',
        '    }',
        '    m/=n; s=abs(s/n-m*m); float sig=s.r+s.g+s.b;',
        '    if(sig<bs){bs=sig;best=m;}',
        '  }',
        '  return best;',
        '}',
        'float hash21(vec2 p){return fract(sin(p.x*12.9898+p.y*78.233)*43758.5453);}',
        'void main(){',
        '  vec3 src=texture2D(tDiffuse,vUv).rgb;',
        '  vec3 col=kuwahara(vUv);',
        '  float n=hash21(floor(vUv*900.0));',
        '  col=floor(col*uQuant+n)/uQuant;',
        '  gl_FragColor=vec4(mix(src,col,uStrength),1.0);',
        '}'
      ].join('\n')
    },
    lightfx: {
      uniforms: function () {
        return {
          uTexel: { value: new T.Vector2(1 / 2, 1 / 2) },
          uBloom: { value: 1.0 }, uStar: { value: 0.45 },
          uRay: { value: 0.30 }, uCa: { value: 0.28 }
        };
      },
      frag: PIXEL_HEAD + [
        'uniform vec2 uTexel;', 'uniform float uBloom;', 'uniform float uStar;',
        'uniform float uRay;', 'uniform float uCa;',
        'float luma(vec3 c){return dot(c,vec3(0.2126,0.7152,0.0722));}',
        'vec3 sampleAt(vec2 uv){return texture2D(tDiffuse,clamp(uv,vec2(0.0),vec2(1.0))).rgb;}',
        'vec3 brightPass(vec3 c){float l=luma(c);return c*smoothstep(0.62,1.25,l);}',
        'vec3 bloom(vec2 uv){',
        '  vec3 sum=vec3(0.0); float wsum=0.0;',
        '  for(int i=-6;i<=6;i++){float fi=float(i);float w=exp(-fi*fi/16.0);',
        '    sum+=brightPass(sampleAt(uv+vec2(fi*uTexel.x*2.5,0.0)))*w; wsum+=w;}',
        '  vec3 s2=vec3(0.0);',
        '  for(int i=-6;i<=6;i++){float fi=float(i);float w=exp(-fi*fi/16.0);',
        '    s2+=brightPass(sampleAt(uv+vec2(0.0,fi*uTexel.y*2.5)))*w;}',
        '  return (sum/wsum+s2/(wsum+0.0001))*0.5;',
        '}',
        'vec3 star(vec2 uv){',
        '  vec3 acc=vec3(0.0);',
        '  for(int k=0;k<4;k++){float a=float(k)*0.785398+0.3927;vec2 dir=vec2(cos(a),sin(a));',
        '    for(int i=1;i<=8;i++){float fi=float(i);float w=1.0/(1.0+fi*0.8);',
        '      acc+=brightPass(sampleAt(uv+dir*uTexel*fi*3.0))*w;',
        '      acc+=brightPass(sampleAt(uv-dir*uTexel*fi*3.0))*w;}}',
        '  return acc/4.0*0.5;',
        '}',
        'vec3 rays(vec2 uv){',
        '  vec3 acc=vec3(0.0);float wsum=0.0;',
        '  for(int i=-6;i<=6;i++){float fi=float(i);float w=exp(-fi*fi/20.0);',
        '    acc+=brightPass(sampleAt(uv+vec2(fi*uTexel.x*5.0,0.0)))*w;',
        '    acc+=brightPass(sampleAt(uv+vec2(0.0,fi*uTexel.y*5.0)))*w; wsum+=w*2.0;}',
        '  return acc/wsum;',
        '}',
        'vec3 chroma(vec2 uv){',
        '  vec2 dir=(uv-vec2(0.5))*uCa*0.006;',
        '  return vec3(sampleAt(uv+dir).r,sampleAt(uv).g,sampleAt(uv-dir).b);',
        '}',
        'void main(){',
        '  vec3 col=chroma(vUv);',
        '  col+=bloom(vUv)*uBloom*1.5;',
        '  col+=star(vUv)*uStar*1.4;',
        '  col+=rays(vUv)*uRay*1.8;',
        '  gl_FragColor=vec4(col,1.0);',
        '}'
      ].join('\n')
    }
  };

  var ORDER = ['voxel', 'gongbi', 'youhua', 'lightfx'];
  var state = { voxel: false, gongbi: false, youhua: false, lightfx: false };
  var params = {};
  ORDER.forEach(function (id) { params[id] = CORES[id].uniforms(); });

  var stage = null, origRender = null, patched = false;
  var rtA = null, rtB = null, sceneRT = null;
  var outputMat = null, outputScene = null, outputCam = null;
  var size = new T.Vector2();

  function makeRT(filter) {
    var rt = new T.WebGLRenderTarget(2, 2, {
      minFilter: filter, magFilter: filter, format: T.RGBAFormat,
      type: T.UnsignedByteType, depthBuffer: true, stencilBuffer: false
    });
    rt.texture.generateMipmaps = false;
    return rt;
  }

  function activeList() { return ORDER.filter(function (id) { return state[id]; }); }

  function install(st) {
    stage = st;
    var renderer = st.renderer;
    if (!renderer || renderer.__fxchainPatched) return;
    origRender = renderer.render.bind(renderer);
    sceneRT = makeRT(T.LinearFilter);
    rtA = makeRT(T.LinearFilter);
    rtB = makeRT(T.LinearFilter);
    // 输出 pass：所有滤镜 pass 在线性空间工作（保持各自 shader 逻辑不变），
    // 最后统一做一次 Linear→sRGB 编码送屏幕。
    // 原因：three 渲染场景到 RenderTarget 时只做 ACES tonemap、不做 sRGB 编码，
    // 而 pass 材质 toneMapped:false 直接输出线性值到屏幕（屏幕按 sRGB 显示），
    // 少一次 gamma 编码 → 任何滤镜一开就暗约 45%（实测 voxel/gongbi/youhua 都暗 44~46）。
    // 给 sceneRT 设 SRGBColorSpace 无效：pass 采样时 three 会自动解码回线性，净效果为零。
    outputMat = new T.ShaderMaterial({
      uniforms: { tDiffuse: { value: null } },
      vertexShader: VERT,
      fragmentShader: PIXEL_HEAD + [
        'void main(){',
        '  vec3 c = texture2D(tDiffuse, vUv).rgb;',
        // 精确 sRGB 编码（与 three colorspace_fragment 一致）
        '  vec3 lo = c * 12.92;',
        '  vec3 hi = 1.055 * pow(max(c, vec3(0.0)), vec3(1.0/2.4)) - 0.055;',
        '  vec3 srgb = mix(lo, hi, step(vec3(0.0031308), c));',
        '  gl_FragColor = vec4(srgb, 1.0);',
        '}'
      ].join('\n'),
      depthTest: false, depthWrite: false, toneMapped: false
    });
    outputScene = new T.Scene();
    var oq = new T.Mesh(new T.PlaneGeometry(2, 2), outputMat);
    oq.frustumCulled = false;
    outputScene.add(oq);
    outputCam = new T.OrthographicCamera(-1, 1, 1, -1, 0, 1);
    // 每个 pass 的材质
    ORDER.forEach(function (id) {
      var mat = new T.ShaderMaterial({
        uniforms: Object.assign({ tDiffuse: { value: null } }, params[id]),
        vertexShader: VERT, fragmentShader: CORES[id].frag,
        depthTest: false, depthWrite: false, toneMapped: false
      });
      params[id].__mat = mat;
      var quad = new T.Mesh(new T.PlaneGeometry(2, 2), mat);
      quad.frustumCulled = false;
      var sc = new T.Scene(); sc.add(quad);
      params[id].__scene = sc;
      params[id].__cam = new T.OrthographicCamera(-1, 1, 1, -1, 0, 1);
    });
    renderer.render = function (scene, camera) {
      var act = activeList();
      if (!act.length || !scene || scene !== st.scene || !camera) {
        origRender(scene, camera);
        return;
      }
      // 光效副作用：入夜 + 强化灯光（只在使用光效时）
      if (state.lightfx) {
        var w = window.__wonder;
        if (w && w.lanterns && typeof w.lanterns.setLamp === 'function') w.lanterns.setLamp(2.2);
      }
      renderer.getDrawingBufferSize(size);
      var w = Math.max(2, Math.round(size.x)), h = Math.max(2, Math.round(size.y));
      if (sceneRT.width !== w || sceneRT.height !== h) {
        sceneRT.setSize(w, h); rtA.setSize(w, h); rtB.setSize(w, h);
        ORDER.forEach(function (id) {
          if (params[id].uTexel) params[id].uTexel.value.set(1 / w, 1 / h);
          if (params[id].uRes) params[id].uRes.value.set(w, h);
          if (id === 'voxel') params[id].uGrid.value.set(w / 4, h / 4);
        });
      }
      // 场景 → sceneRT（此时 three 会做一次 tonemap+colorspace，输出到 RT）
      renderer.setRenderTarget(sceneRT);
      renderer.clear();
      origRender(scene, camera);
      // 串行 passes：sceneRT → A → B → A ...，全部在线性空间写 RT
      var act2 = activeList();
      var src = sceneRT, dst = rtA;
      var ac = renderer.autoClear; renderer.autoClear = true;
      for (var i = 0; i < act2.length; i++) {
        var p = params[act2[i]];
        p.__mat.uniforms.tDiffuse.value = src.texture;
        renderer.setRenderTarget(dst);
        origRender(p.__scene, p.__cam);
        var t = src; src = dst; dst = t;   // ping-pong：交换，下一步读刚写的 dst
      }
      // 统一 sRGB 编码输出：src 是最后一个 pass 写好的线性结果
      if (outputMat) {
        outputMat.uniforms.tDiffuse.value = src.texture;
        renderer.setRenderTarget(null);
        origRender(outputScene, outputCam);
      }
      renderer.setRenderTarget(null);
      renderer.autoClear = ac;
    };
    renderer.__fxchainPatched = true;
    patched = true;
  }

  var api = {
    set: function (id, on) {
      if (!(id in state)) return false;
      state[id] = !!on;
      // 同步灯光副作用：光效关闭时恢复时辰（复用 lightfx 模块已有的锁）
      if (id === 'lightfx' && window.__lightfx) {
        // lightfx 模块的 set 也Tube会被调用，由它负责 lockNight
      }
      return state[id];
    },
    on: function (id) { return !!(state[id]); },
    anyOn: function () { return activeList().length > 0; },
    active: function () { return activeList(); },
    param: function (id, key, val) {
      var p = params[id];
      if (!p || !(key in p)) return null;
      if (val !== undefined) {
        if (key === 'uTexel' || key === 'uRes' || key === 'uGrid') p[key].value.set(val[0], val[1]);
        else p[key].value = val;
        if (p.__mat) p.__mat.uniforms[key].value = p[key].value;
      }
      var v = p[key].value;
      return (v && v.isVector2) ? [v.x, v.y] : v;
    },
    attach: function (st) { install(st); return patched; },
    rawRender: function () { return origRender; },  // 供镜面水等模块绕开后处理链做离屏渲染
    VERT: VERT, CORES: CORES
  };
  window.__fxchain = api;

  var tries = 0;
  var timer = setInterval(function () {
    var st = window.__stage || window.__zen;
    if (st && st.scene && st.camera && st.renderer) {
      clearInterval(timer);
      install(st);
    } else if (++tries > 1200) clearInterval(timer);
  }, 150);
})();
