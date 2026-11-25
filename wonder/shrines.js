/* 侧殿塑像：文殊殿、伽蓝殿、香风花雨楼、庭堂、客堂、关帝殿、万善堂。
 * 这些殿在 scene.json 里是烘焙出来的空壳，只有东大殿有彩塑，配殿门窗一开就是空的。
 * 这里用程序化几何摆一组「须弥座 — 莲台 — 佛身 — 背光 — 供桌」，
 * 按殿内进深与面宽定量，朝向一律对着殿门。几何按颜色合成 InstancedMesh。
 */
export function initShrines(ctx){
  const T = ctx.T;
  const group = new T.Group(); group.name = 'Shrines'; ctx.root.add(group);

  const GEO = {
    box : new T.BoxGeometry(1,1,1),
    cyl : new T.CylinderGeometry(1,1,1,10),
    sph : new T.IcosahedronGeometry(1,1),
    cone: new T.ConeGeometry(1,1,8),
    tor : new T.TorusGeometry(1,.09,6,22)
  };
  const piles = new Map();
  const M = new T.Matrix4(), Q = new T.Quaternion(), E = new T.Euler();
  const P = new T.Vector3(), S = new T.Vector3();
  function add(kind, color, pos, scale, rot){
    const key = kind + '|' + color;
    if (!piles.has(key)) piles.set(key, []);
    P.set(pos[0],pos[1],pos[2]); S.set(scale[0],scale[1],scale[2]);
    if (rot) Q.copy(rot); else { E.set(0,0,0); Q.setFromEuler(E); }
    M.compose(P,Q,S); piles.get(key).push(M.clone());
  }
  const rotX = a => new T.Quaternion().setFromEuler(new T.Euler(a,0,0));
  const rotY = a => new T.Quaternion().setFromEuler(new T.Euler(0,a,0));

  const GOLD  = '#c8a267';
  const GOLD_D= '#9d7a44';
  const STONE = '#8f8a7c';
  const LACQ  = '#7b3f30';
  const TEAL  = '#4f6a68';
  const FLESH = '#d9c3a0';

  /* 一尊像。x/z 是殿内中心，y0 是室内地面，sgn 是朝外方向（+1 朝 +z，-1 朝 -z）。
   * h 是像的总高，其余尺寸按 h 等比缩放，配殿大小不同也不会顶到梁架。 */
  function statue(x, z, y0, sgn, h){
    const k = h / 2.6;                       // 以 2.6 米为基准
    const wrap = (lx, ly, lz) => [x + sgn*lx, y0 + ly, z + sgn*lz];
    const rz = a => rotY(sgn > 0 ? a : Math.PI + a);

    // 须弥座：上下枭、束腰
    add('box', STONE,  wrap(0,.10,0), [1.86*k,.20,1.24*k]);
    add('box', '#a8a294', wrap(0,.26,0), [1.68*k,.12,1.10*k]);
    add('box', STONE,  wrap(0,.40,0), [1.52*k,.16,.98*k]);

    // 莲台：圆台 + 一圈仰莲瓣
    add('cyl', '#8d9086', wrap(0,.52,0), [.80*k,.14,.80*k]);
    for (let i=0;i<14;i++){
      const a = i/14*6.283;
      add('sph', '#b9b5a2', wrap(Math.cos(a)*.72*k, .60, Math.sin(a)*.72*k),
        [.17*k,.10*k,.17*k]);
    }
    add('cyl', TEAL, wrap(0,.64,0), [.66*k,.10,.66*k]);

    // 结跏趺坐的腿：一团横向扁球，前面再压一道膝线
    add('sph', LACQ, wrap(0,.92*k,.10*k), [.86*k,.34*k,.56*k]);
    add('box', GOLD_D, wrap(0,.80*k,.46*k), [.90*k,.10,.30*k]);

    // 身躯与双臂
    add('sph', LACQ, wrap(0,1.28*k,0), [.60*k,.62*k,.44*k]);
    for (const s of [-1,1]){
      add('sph', LACQ, wrap(s*.62*k,1.20*k,.10*k), [.20*k,.46*k,.20*k]);
      add('sph', GOLD, wrap(s*.30*k,1.02*k,.42*k), [.16*k,.11*k,.13*k]);   // 手
    }
    add('box', GOLD, wrap(0,1.52*k,.16*k), [.52*k,.07,.10*k]);             // 领口

    // 头、肉髻、耳
    add('sph', FLESH, wrap(0,1.62*k,0), [.30*k,.34*k,.29*k]);
    add('sph', FLESH, wrap(0,1.88*k,0), [.14*k,.12*k,.14*k]);
    for (const s of [-1,1])
      add('sph', FLESH, wrap(s*.29*k,1.62*k,0), [.06*k,.13*k,.06*k]);
    // 面部（顾问 P1：原先光头无五官，近看像假人）
    //   眉：两道暗色短线；眼：微凸小点；鼻：竖向楔；口：一线
    const FACE = '#a8865f', FACE_D = '#7a5f42';
    add('box', FACE, wrap(0, 1.68*k, .27*k), [.24*k,.022,.02], rz(.06));   // 眉线（合一道）
    for (const s of [-1,1])
      add('sph', FACE_D, wrap(s*.10*k, 1.645*k, .28*k), [.028*k,.020*k,.020*k]);  // 双眼
    add('sph', FACE, wrap(0, 1.60*k, .30*k), [.035*k,.055*k,.030*k]);             // 鼻
    add('box', FACE_D, wrap(0, 1.51*k, .28*k), [.10*k,.016,.02]);          // 口
    add('sph', GOLD, wrap(0, 1.99*k, 0), [.05*k,.045*k,.05*k]);            // 髻顶珠

    // 背光：身后两道同心圆环，立起来
    add('tor', GOLD_D, wrap(0,1.55*k,-.34*k), [.80*k,.80*k,.80*k], rotX(0));
    add('tor', GOLD,   wrap(0,1.55*k,-.36*k), [.58*k,.58*k,.58*k], rotX(0));

    // 供桌与烛台
    add('box', LACQ,   wrap(0,.42,.95*k), [1.30,.08,.62]);
    for (const s of [-1,1])
      add('box', LACQ, wrap(s*.54,.22,.95*k), [.10,.44,.10]);
    for (const s of [-1,1]){
      add('cyl', GOLD_D, wrap(s*.40,.56,.95*k), [.05,.16,.05]);
      add('sph', '#f0d9a0', wrap(s*.40,.68,.95*k), [.045,.09,.045]);
    }
    add('cyl', '#5c5148', wrap(0,.52,.95*k), [.16,.10,.16]);   // 香炉
  }

  /* 世界坐标（z 已按场景约定换算）、室内地面高度、朝向、像高。
   * box 是该殿的室内矩形 [x0,x1,z0,z1]，用来做内衬墙。 */
  const SITES = [
    { x:-32, z:-14.6, y:0.70,  face: 1, h:2.65, wallH:4.2, box:[-47.8,-16.2,-27.4,-11.0] },  // 文殊殿
    { x:-31, z: 21.2, y:0.82,  face:-1, h:2.40, wallH:4.2, box:[-37.4,-24.6, 18.0, 24.9] },  // 伽蓝殿
    { x:-11, z:-23.8, y:2.40,  face: 1, h:2.55, wallH:4.2, box:[-17.4, -4.6,-27.6,-20.9] },  // 香风花雨楼
    { x:-12.4, z: 13.6, y:2.40, face:-1, h:2.05, wallH:4.2, box:[-16.1, -8.9, 10.9, 15.8] }, // 庭堂
    { x:-10, z: 23.0, y:2.40,  face:-1, h:2.05, wallH:4.2, box:[-15.2, -4.8, 19.9, 24.9] },  // 客堂
    // 关帝殿、万善堂在高台地（y=13.4）上，体量盒只有约 2.7 高（顶 16.0/16.1），
    // 内衬墙若仍取 4.2 会戳穿屋顶瓦面，从殿外露出浅米色"破面框"。这里压到 2.6，
    // 让内衬顶（13.4+2.6=16.0）卡在体量盒顶之内，不再顶破屋面。
    { x: 12, z: 26.0, y:13.40, face:-1, h:2.30, wallH:2.6, box:[  6.6, 17.4, 22.9, 27.9] },  // 关帝殿
    { x: 12, z:-26.6, y:13.40, face: 1, h:2.30, wallH:2.6, box:[  6.1, 17.9,-29.1,-23.0] }   // 万善堂
  ];

  /* 内衬墙：这些殿在场景里是"实心壳"——主体是一个闭盒，从殿内往外看时
   * 背面被剔除，于是透过墙就能看见外面的树林，室内像没有墙。
   * 用一个 BackSide 的盒子贴着内壁，只渲染内表面，从外面完全看不见。 */
  const shellMat = new T.MeshStandardMaterial({
    color:'#d3c9b6', roughness:1, metalness:0, side:T.BackSide
  });
  for (const s of SITES){
    const [x0,x1,z0,z1] = s.box;
    const bounds = [
      [x0+.06,z0+.06], [x0+.06,z1-.06], [x1-.06,z0+.06], [x1-.06,z1-.06]
    ];
    const eave = Math.min(...bounds.map(([x,z])=>ctx.stage.roofAt(x,z) ?? Infinity));
    const wh = Math.min(s.wallH,eave-s.y-.16);
    if(!Number.isFinite(wh)||wh<=0)continue;
    const g = new T.BoxGeometry(x1-x0-.12, wh, z1-z0-.12);
    const m = new T.Mesh(g, shellMat);
    // 中心 y = 地面高 + 半墙高 - 0.02，让盒子底部略低于地面，贴地无缝隙。
    m.position.set((x0+x1)/2, s.y + wh/2 - 0.02, (z0+z1)/2);
    m.name = "配殿内衬墙";
    m.receiveShadow = true;
    m.userData.noSnow = true;
    m.userData.wonderShrine = true;
    group.add(m);
  }

  for (const s of SITES) statue(s.x, s.z, s.y, s.face, s.h);

  for (const [key, list] of piles){
    const [kind, color] = key.split('|');
    const m = new T.MeshStandardMaterial({
      color, roughness: (color === GOLD || color === GOLD_D) ? .55 : .9,
      metalness: (color === GOLD || color === GOLD_D) ? .35 : 0
    });
    const im = new T.InstancedMesh(GEO[kind], m, list.length);
    list.forEach((mm,i)=>im.setMatrixAt(i, mm));
    im.instanceMatrix.needsUpdate = true;
    im.castShadow = true; im.receiveShadow = true;
    im.frustumCulled = false;
    im.userData.noSnow = true;          // 殿内塑像不参与补雪
    im.userData.wonderShrine = true;
    group.add(im);
  }

  return {
    group,
    get count(){ return SITES.length; },
    get batches(){ return piles.size; }
  };
}
