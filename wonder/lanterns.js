import {inNoPlant} from './zones.js?v=20261112h';
/* 夜间灯系：甬道石灯笼列、檐下红灯笼、贴地光晕与有限盏真实点光源。
 * 白天灯笼本体照常立着，只是不发光；入夜由环境模块按 lamp 强度点亮。
 * 石作与灯罩走 InstancedMesh，几十盏灯也只有十来次绘制。
 */
function glowTexture(T){
  const c = document.createElement('canvas'); c.width = c.height = 64;
  const x = c.getContext('2d');
  const g = x.createRadialGradient(32,32,0,32,32,31);
  g.addColorStop(0,   'rgba(255,235,186,1)');
  g.addColorStop(.24, 'rgba(255,184,96,.66)');
  g.addColorStop(.58, 'rgba(255,140,56,.20)');
  g.addColorStop(1,   'rgba(255,120,40,0)');
  x.fillStyle = g; x.fillRect(0,0,64,64);
  const t = new T.CanvasTexture(c); return t;
}
function poolTexture(T){
  const c = document.createElement('canvas'); c.width = c.height = 128;
  const x = c.getContext('2d');
  const g = x.createRadialGradient(64,64,0,64,64,63);
  g.addColorStop(0,   'rgba(255,196,110,.82)');
  g.addColorStop(.35, 'rgba(255,164,76,.36)');
  g.addColorStop(.72, 'rgba(255,140,60,.10)');
  g.addColorStop(1,   'rgba(255,130,50,0)');
  x.fillStyle = g; x.fillRect(0,0,128,128);
  const t = new T.CanvasTexture(c); return t;
}

export function initLanterns(ctx){
  const T = ctx.T, root = ctx.root;
  const group = new T.Group(); group.name = 'Lanterns'; root.add(group);

  /* --- 石灯笼位置：中轴甬道两侧为主，院角与池边补点 --- */
  const SPOTS = [];
  for (const x of [-50,-46,-42,-38,-34,-30,-26]) for (const z of [-3.6,3.6]) SPOTS.push([x,z]);
  // 山门外继续往林子里延伸的一段灯道，夜里从谷口望过来能看见路
  for (const x of [-56,-62,-68,-74,-80]) for (const z of [-3.2,3.2]) SPOTS.push([x,z]);
  for (const [x,z] of [
    [-19.5,-4.4],[-19.5,4.4],[-14,-8.5],[-8,-8.5],[-2,-8.5],
    [-14,-15],[-2,-15],[-10,15],[-4,15],
    [9,-6.8],[9,6.8],[11.6,-6.8],[11.6,6.8],
    [-33.6,5.8],[-33.6,11.0],[-26.8,5.8],[-26.8,11.0],
    [-40,-16],[-44,-20],[-25,-20],[18,-16],[22,16],
    // 院墙外沿：把围墙的走向勾出来，鸟瞰时不会只剩中间一坨亮
    [-52,-19],[-52,19],[-38,-21],[-24,-21],[-10,-21],[4,-21],[18,-21],
    [-38,21],[-24,21],[-10,21],[4,21],[18,21],[24,-8],[24,8]
  ]) SPOTS.push([x,z]);

  /* --- 聚合批次 --- */
  const GEO = {
    box : new T.BoxGeometry(1,1,1),
    cyl : new T.CylinderGeometry(1,1,1,8),
    cone: new T.ConeGeometry(1,1,4),
    sph : new T.IcosahedronGeometry(1,1),
    plane: new T.PlaneGeometry(1,1)
  };
  const piles = new Map(), made = [];
  const M = new T.Matrix4(), Q = new T.Quaternion(), E = new T.Euler();
  const P = new T.Vector3(), S = new T.Vector3();
  function add(kind, color, pos, scale, rot){
    const key = kind+'|'+color;
    if (!piles.has(key)) piles.set(key, []);
    P.set(pos[0],pos[1],pos[2]); S.set(scale[0],scale[1],scale[2]);
    if (rot) Q.copy(rot); else { E.set(0,0,0); Q.setFromEuler(E); }
    M.compose(P,Q,S); piles.get(key).push(M.clone());
  }
  const q45 = new T.Quaternion().setFromEuler(new T.Euler(0,Math.PI/4,0));
  const qFlat = new T.Quaternion().setFromEuler(new T.Euler(-Math.PI/2,0,0));

  for (const [x,z] of SPOTS){
    // 石灯笼是贴地器物，殿内与券门通道里都不能摆：
    // 早先 [-10,21]、[-24,-21]、[18,-16] 这几处正落在客堂、文殊殿、东大殿里，
    // 走进殿迎面就是一盏灯，把佛像都挡了。
    if (inNoPlant(x,z,.6)) continue;
    const y = ctx.ground(x,z);
    if (!isFinite(y) || y > 30) continue;
    // 六角基座 → 束腰 → 灯柱 → 灯室 → 四角攒尖顶 → 宝珠
    // 用户反馈"路边的灯太大了"：整体口径减半（×.5）、总高压低约三成（×.72），
    // 甬道两侧才像一盏盏石灯，而不是一根根挡视线的柱子。S=口径、HZ=高度。
    const S = .50, H = .72;
    add('cyl','#8d887b', [x,y+.09*H,z],  [.30*S,.18*H,.30*S], q45);
    add('cyl','#9b9587', [x,y+.24*H,z],  [.19*S,.14*H,.19*S], q45);
    add('cyl','#8a8578', [x,y+.62*H,z],  [.095*S,.62*H,.095*S]);
    add('box','#a39c8e', [x,y+.96*H,z],  [.50*S,.08*H,.50*S], q45);
    // 灯室四壁留空：用四根角柱 + 发光内芯表现透光的窗
    for (const sx of [-1,1]) for (const sz of [-1,1])
      add('box','#9b9587',[x+sx*.19*S,y+1.17*H,z+sz*.19*S],[.055*S,.40*H,.055*S]);
    add('box','#b0a998', [x,y+1.39*H,z], [.56*S,.07*H,.56*S], q45);
    add('cone','#7e7a70',[x,y+1.58*H,z], [.46*S,.34*H,.46*S], q45);
    add('sph', '#b6ad98',[x,y+1.79*H,z], [.075*S,.075*S,.075*S]);
    // 灯室内芯
    add('box','#ffd08a', [x,y+1.17*H,z], [.30*S,.30*H,.30*S], q45);
    // 贴地光晕：灯小了，晕圈同步收一半，不然地上一大坨光比灯还显眼
    add('plane','#pool', [x,y+.035,z], [2.2,2.2,1], qFlat);
  }

  /* 高杆宫灯：四米多高，鸟瞰时才看得出一条完整的灯路 */
  const POLES = [
    [-48,-5.4],[-48,5.4],[-36,-5.4],[-36,5.4],[-24,-5.4],[-24,5.4],
    [-12,-6.6],[-12,6.6],[0,-6.6],[0,6.6],[7,-8.2],[7,8.2],
    [-58,-5.4],[-58,5.4],[-70,-5.4],[-70,5.4]
  ];
  for (const [x,z] of POLES){
    const y = ctx.ground(x,z);
    if (!isFinite(y) || y>30) continue;
    // 高杆宫灯同步收：杆径 ×.6、总高 ×.72（4.9m→3.5m），口径 ×.55。
    // 原来四米九加上大宫灯，站在甬道里抬头全是灯的肚子，把屋檐都挡了。
    const S = .55, H = .72;
    add('box','#8d887b',[x,y+.14*H,z],[.62*S,.28*H,.62*S],q45);
    add('cyl','#59422e',[x,y+1.95*H,z],[.070,3.5*H,.070]);
    add('box','#7a5c3c',[x,y+3.72*H,z],[.78*S,.09*H,.78*S],q45);
    for (const sx of [-1,1]) for (const sz of [-1,1])
      add('box','#8a6b45',[x+sx*.27*S,y+4.08*H,z+sz*.27*S],[.055*S,.66*H,.055*S]);
    add('box','#ffd08a',[x,y+4.08*H,z],[.48*S,.58*H,.48*S],q45);
    add('box','#7a5c3c',[x,y+4.44*H,z],[.80*S,.09*H,.80*S],q45);
    add('cone','#6e6a60',[x,y+4.66*H,z],[.62*S,.40*H,.62*S],q45);
    add('sph','#b6ad98',[x,y+4.92*H,z],[.10*S,.10*S,.10*S]);
    add('plane','#pool',[x,y+.045,z],[3.4,3.4,1],qFlat);
  }

  /* --- 檐下红灯笼：用向下射线找檐口高度，避免猜坐标穿模 --- */
  function inWonder(o){ for(let p=o;p;p=p.parent) if(p===ctx.root) return true; return false; }
  const targets = [];
  ctx.scene.traverse(o => {
    if (!(o.isMesh||o.isInstancedMesh) || inWonder(o) || !o.visible) return;
    const m = Array.isArray(o.material)?o.material[0]:o.material;
    if (!m || m.transparent) return;
    const n = o.geometry?.attributes?.position?.count || 0;
    if (n === 0 || n > 320000) return;
    targets.push(o);
  });
  const ray = new T.Raycaster(); ray.far = 60;
  function roofY(x,z){
    ray.set(new T.Vector3(x,34,z), new T.Vector3(0,-1,0));
    try {
      const hs = ray.intersectObjects(targets,false);
      for (const h of hs) if (h.point.y > 14.5) return h.point.y;
    } catch(e){ /* 忽略 */ }
    return 18.0;
  }
  // 挂点取「檐口最大允许高度」：主殿额枋下皮在 18.49，斗栱在 18.87，
  // 射线命中的是第一片瓦（20 米往上），直接减 0.95 会让灯笼顶嵌进斗栱里。
  const HANG = [];
  // 大殿（东大殿）前檐不再挂红灯笼——用户要求殿前保持素净。
  // 文殊殿前檐在世界 z≈-11 一侧，伽蓝殿前檐在 z≈+17.5 一侧。
  // 原先按模型坐标写了 z=±11、7.5，其中两个点落在殿外空地上，灯笼悬在林子上方。
  for (const x of [-45,-41,-37,-33,-29,-25,-21]) HANG.push([x, -10.45, Math.min(roofY(x,-10.45), 5.10)]);
  for (const x of [-35,-31,-27]) HANG.push([x, 16.95, Math.min(roofY(x,16.95), 4.46)]);
  const lampGlowMat = [];
  for (const [x,z,top] of HANG){
    // 灯身顶到额枋留 ~1.1 米，悬绳则一直拉到檐下，灯笼才不会看着悬空
    const y = top - 1.10;
    const rope = Math.max(.30, top - y - .36);
    add('cyl','#4a3a2c',[x,y + .36 + rope/2,z],[.012,rope,.012]);
    // 灯笼本体：椭球 + 上下盖 + 竖棱 + 流苏
    add('sph','#c4483a',[x,y,z],[.24,.30,.24]);
    add('cyl','#8a6b45',[x,y+.30,z],[.11,.055,.11]);
    add('cyl','#8a6b45',[x,y-.30,z],[.11,.055,.11]);
    add('cone','#b9933f',[x,y-.46,z],[.055,.22,.055],
      new T.Quaternion().setFromEuler(new T.Euler(Math.PI,0,0)));
    for (let k=0;k<4;k++){
      const a = k/4*6.283;
      add('cyl','#e6b06a',[x+Math.cos(a)*.215,y,z+Math.sin(a)*.215],[.012,.55,.012]);
    }
    add('sph','#ffd896',[x,y,z],[.13,.18,.13]);
  }

  /* --- flush：普通石作走 Standard，发光内芯单独一份可整体调 emissive --- */
  const glowMat = new T.MeshStandardMaterial({
    color:'#ffca7d', emissive:'#ff9a3c', emissiveIntensity:0, roughness:.6
  });
  const paperMat = new T.MeshStandardMaterial({
    color:'#d4573f', emissive:'#ff7338', emissiveIntensity:0, roughness:.9,
    transparent:true, opacity:.96, side:T.DoubleSide
  });
  const poolMat = new T.MeshBasicMaterial({
    map:poolTexture(T), color:'#ffc078', transparent:true, opacity:0,
    depthWrite:false, blending:T.AdditiveBlending, side:T.DoubleSide
  });
  for (const [key, list] of piles){
    const [kind, color] = key.split('|');
    let m;
    if (color === '#ffd08a' || color === '#ffd896') m = glowMat;
    else if (color === '#pool') m = poolMat;
    else if (color === '#c4483a') m = paperMat;
    else m = new T.MeshStandardMaterial({ color, roughness:.93 });
    const im = new T.InstancedMesh(GEO[kind], m, list.length);
    list.forEach((mm,i)=>im.setMatrixAt(i,mm));
    im.instanceMatrix.needsUpdate = true;
    im.castShadow = kind !== 'plane';
    im.receiveShadow = kind !== 'plane';
    im.frustumCulled = false;
    im.userData.wonderLantern = true;
    group.add(im); made.push(im);
  }

  /* --- 光晕 Sprite：挂在每个灯笼上方，夜里才显 --- */
  const glowTex = glowTexture(T);
  const sprites = [];
  const mkSprite = (x,y,z,base) => {
    const sp = new T.Sprite(new T.SpriteMaterial({
      map:glowTex, transparent:true, depthWrite:false,
      blending:T.AdditiveBlending, opacity:0
    }));
    sp.position.set(x,y,z); sp.scale.set(base,base,1);
    group.add(sp); sprites.push({ sp, base });
  };
  for (const [x,z] of SPOTS){
    const y = ctx.ground(x,z); if (!isFinite(y) || y > 30) continue;
    mkSprite(x, y+1.20*.72, z, 1.0);
  }
  for (const [x,z] of POLES){
    const y = ctx.ground(x,z); if (!isFinite(y) || y > 30) continue;
    mkSprite(x, y+4.10*.72, z, 1.7);
  }
  for (const [x,z,top] of HANG) mkSprite(x, top-1.10, z, 1.50);

  /* --- 有限盏真实点光源：照甬道、月台、池边，不逐个灯都给光 --- */
  const LIGHT_AT = [[-46,0],[-34,0],[-24,0],[-12,-8],[0,-8],[9,-6.8],
                    [9,6.8],[-30.2,8.4],[-44,-18],[12.5,0],
                    [-58,0],[-70,0],[-52,-19],[-52,19],[18,-21],[18,21]];
  const lights = [];
  for (const [x,z] of LIGHT_AT){
    const y = ctx.ground(x,z);
    const l = new T.PointLight('#ffb066', 0, 20, 1.9);
    l.position.set(x, (isFinite(y)?y:0) + 1.5, z);
    group.add(l); lights.push(l);
  }

  let level = 0;
  /* 三轮 P1-2：白天灯罩发光降档——白天几乎不发光（.02），
   * 夜间斜率同步降 25%，避免夜里灯罩过曝成塑料亮块。 */
  function setLamp(v){
    level = v;
    glowMat.emissiveIntensity = .02 + 1.45 * v;
    paperMat.emissiveIntensity = .012 + .88 * v;
    poolMat.opacity = .92 * v;
    for (const s of sprites) s.sp.material.opacity = v;
    for (const l of lights) l.intensity = 31 * v;
  }
  setLamp(0);

  /* 火头轻微摇曳，只改 sprite 缩放，不碰几何 */
  ctx.frames.push((now) => {
    if (level < .10) return;
    for (let i=0;i<sprites.length;i++){
      const s = sprites[i];
      const f = .88 + Math.sin(now*.0042 + i*1.7)*.10 + Math.sin(now*.011+i)*.05;
      s.sp.scale.set(s.base*f, s.base*f, 1);
    }
  });

  return {
    setLamp,
    get count(){ return SPOTS.length; },
    get hangCount(){ return HANG.length; },
    get lightCount(){ return lights.length; }
  };
}
