/* 器物细部：殿前经幢、石狮、鼎式香炉、月台勾栏、幡杆、檐角风铎、
 * 板门门钉与铺首、香烟。静态件按颜色聚成 InstancedMesh，不增加多少绘制次数。
 */
export function initOrnaments(ctx){
  const T = ctx.T;
  const group = new T.Group(); group.name = 'Ornaments'; ctx.root.add(group);

  const GEO = {
    box : new T.BoxGeometry(1,1,1),
    cyl : new T.CylinderGeometry(1,1,1,8),
    hex : new T.CylinderGeometry(1,1,1,6),
    oct : new T.CylinderGeometry(1,1,1,8),
    cone: new T.ConeGeometry(1,1,8),
    sph : new T.IcosahedronGeometry(1,1),
    torus: new T.TorusGeometry(1,.12,6,20)
  };
  const piles = new Map();
  const M = new T.Matrix4(), Q = new T.Quaternion(), E = new T.Euler();
  const P = new T.Vector3(), S = new T.Vector3();
  function add(kind, color, pos, scale, rot){
    const key = kind+'|'+color;
    if (!piles.has(key)) piles.set(key, []);
    P.set(pos[0],pos[1],pos[2]); S.set(scale[0],scale[1],scale[2]);
    if (rot) Q.copy(rot); else { E.set(0,0,0); Q.setFromEuler(E); }
    M.compose(P,Q,S); piles.get(key).push(M.clone());
  }
  const rotX = a => new T.Quaternion().setFromEuler(new T.Euler(a,0,0));
  const rotZ = a => new T.Quaternion().setFromEuler(new T.Euler(0,0,a));
  const rotY = a => new T.Quaternion().setFromEuler(new T.Euler(0,a,0));

  const STONE = '#9a9486', STONE_D = '#827d72', STONE_L = '#b0a998';
  const BRONZE = '#7d6540', BRONZE_L = '#a88a54', GOLD = '#c2a05e';

  // 三进台地是 13，大殿台基顶是 13.8。经幢、石狮、香炉都立在台基上，
  // 之前一律按 13 摆，整件陷进台基 0.85 米，正面看只露出上半截，像悬空。
  const H3 = 13.85, HH = 13.85;
  // 勾栏围在月台外沿（台基之外），仍按台地高度 13.0
  const H3L = 13.0;

  /* ---------- 经幢：八角幢身 + 仰莲座 + 三重宝盖相轮 ---------- */
  function sutraPillar(x,z){
    const y = H3;
    add('box', STONE_D, [x,y+.10,z], [1.05,.20,1.05], rotY(Math.PI/4));
    add('oct', STONE,   [x,y+.28,z], [.48,.18,.48]);
    // 仰莲：八瓣
    for (let i=0;i<8;i++){
      const a = i/8*6.283;
      add('sph', STONE_L, [x+Math.cos(a)*.44, y+.40, z+Math.sin(a)*.44], [.16,.10,.16]);
    }
    add('oct', STONE,   [x,y+1.22,z], [.33,1.70,.33]);
    // 幢身刻线：每道一圈极细的横箍
    for (let k=0;k<7;k++)
      add('oct', STONE_D, [x,y+.62+k*.20,z], [.345,.022,.345]);
    // 每面一行浅龛（小方块，暗示刻经）
    for (let k=0;k<5;k++) for (let j=0;j<4;j++){
      const a = j/4*6.283 + Math.PI/8;
      add('box', STONE_L, [x+Math.cos(a)*.325, y+.72+k*.26, z+Math.sin(a)*.325],
        [.012,.10,.10], rotY(-a));
    }
    add('oct', STONE_L, [x,y+2.14,z], [.46,.14,.46]);
    for (let k=0;k<3;k++){
      add('cone', STONE, [x,y+2.32+k*.22,z], [.52-k*.09,.16,.52-k*.09]);
      add('oct', STONE_L, [x,y+2.42+k*.22,z], [.13,.06,.13]);
    }
    add('sph', GOLD, [x,y+3.06,z], [.12,.12,.12]);
  }
  // 台基从 x=10.1 起，经幢挪进来一点，底座的仰莲才踩得实
  sutraPillar(10.95,-7.6); sutraPillar(10.95,7.6);

  /* ---------- 石狮一对：须弥座 + 蹲身 + 卷毛头 + 前爪 + 绣球 ---------- */
  function lion(x,z,sign){
    const y = H3;
    add('box', STONE_D, [x,y+.13,z], [1.02,.26,.92]);
    add('box', STONE_L, [x,y+.30,z], [.86,.09,.78]);
    add('box', STONE,   [x,y+.68,z], [.52,.68,.72]);          // 蹲坐躯干
    add('sph', STONE_L, [x,y+1.02,z-sign*.10], [.30,.30,.28]);
    for (const s of [-1,1])
      add('box', STONE, [x+s*.17,y+.46,z-sign*.26], [.15,.42,.20]);  // 前腿
    add('sph', STONE_L, [x,y+1.38,z-sign*.16], [.25,.24,.24]);        // 头
    for (let i=0;i<7;i++){                                      // 卷毛
      const a = i/7*6.283;
      add('sph', STONE, [x+Math.cos(a)*.22, y+1.42+Math.sin(a)*.20, z-sign*.16],
        [.085,.085,.085]);
    }
    add('sph', STONE_D, [x,y+1.34,z-sign*.38], [.085,.065,.06]);      // 鼻
    for (const s of [-1,1])
      add('sph', STONE_D, [x+s*.11,y+1.44,z-sign*.34], [.035,.035,.035]); // 目
    add('cone', STONE, [x-.20,y+1.58,z-sign*.14], [.07,.13,.07]);
    add('cone', STONE, [x+.20,y+1.58,z-sign*.14], [.07,.13,.07]);
    if (sign > 0){                                              // 一侧踏绣球
      add('sph', STONE_L, [x+.30,y+.42,z-sign*.38], [.20,.20,.20]);
      for (let i=0;i<4;i++){
        const a=i/4*6.283;
        add('torus', STONE_D, [x+.30,y+.42,z-sign*.38], [.20,.20,.20], rotY(a));
      }
    }
  }
  lion(11.9,-3.3,-1); lion(11.9,3.3,1);

  /* 鼎式大香炉已按用户要求移除：它立在 x=11.6 正对大殿殿门的中轴上，挡路。 */

  /* ---------- 月台勾栏：望柱 + 栏板 + 抱鼓石，三面围合 ---------- */
  function railing(x0,z0,x1,z1,n){
    for (let i=0;i<=n;i++){
      const t=i/n, x=x0+(x1-x0)*t, z=z0+(z1-z0)*t;
      add('box', STONE_D, [x,H3L+.10,z], [.26,.20,.26]);
      add('box', STONE,   [x,H3L+.50,z], [.15,.62,.15]);
      add('sph', STONE_L, [x,H3L+.86,z], [.115,.115,.115]);
      if (i<n){
        const mx=x0+(x1-x0)*(t+.5/n), mz=z0+(z1-z0)*(t+.5/n);
        const along = Math.abs(x1-x0) > Math.abs(z1-z0);
        add('box', STONE_L, [mx,H3L+.52,mz],
          along ? [Math.abs(x1-x0)/n-.20,.10,.07] : [.07,.10,Math.abs(z1-z0)/n-.20]);
        add('box', STONE,   [mx,H3L+.28,mz],
          along ? [Math.abs(x1-x0)/n-.20,.07,.06] : [.06,.07,Math.abs(z1-z0)/n-.20]);
      }
    }
  }
  railing(8.6,-11.2,8.6,-4.2,7);
  railing(8.6, 4.2, 8.6,11.2,7);
  railing(8.6,-11.2,12.6,-11.2,4);
  railing(8.6, 11.2,12.6, 11.2,4);

  /* ---------- 幡杆两根：高杆、相轮、垂幡 ---------- */
  function banner(x,z){
    const y = ctx.ground(x,z);
    if (!isFinite(y)) return;
    add('cyl', STONE_D, [x,y+.16,z], [.28,.32,.28]);
    add('cyl', '#6a5038',[x,y+2.60,z], [.075,4.9,.075]);
    for (let k=0;k<3;k++) add('oct', GOLD, [x,y+3.6+k*.42,z], [.20-k*.04,.07,.20-k*.04]);
    add('sph', GOLD, [x,y+5.10,z], [.12,.12,.12]);
    add('box', '#6a5038',[x,y+4.02,z], [.62,.05,.05]);
    add('box', '#a4442f',[x+.28,y+3.52,z], [.44,1.02,.022]);
    add('box', '#d9b45c',[x+.28,y+3.98,z], [.46,.06,.026]);
    for (let k=0;k<3;k++)
      add('cone','#a4442f',[x+.12+k*.16,y+2.96,z],[.055,.16,.02], rotZ(Math.PI));
  }
  banner(-12.5,-10.5); banner(-12.5,10.5);

  /* ---------- 檐角风铎：射线找檐口，挂铃与铃舌 ---------- */
  function inWonder(o){ for(let p=o;p;p=p.parent) if(p===ctx.root) return true; return false; }
  const targets=[];
  ctx.scene.traverse(o=>{
    if(!(o.isMesh||o.isInstancedMesh)||inWonder(o)||!o.visible) return;
    const m=Array.isArray(o.material)?o.material[0]:o.material;
    if(!m||m.transparent) return;
    const n=o.geometry?.attributes?.position?.count||0;
    if(n===0||n>320000) return;
    targets.push(o);
  });
  const ray=new T.Raycaster(); ray.far=60;
  function eaveY(x,z){
    ray.set(new T.Vector3(x,34,z), new T.Vector3(0,-1,0));
    try{ const hs=ray.intersectObjects(targets,false);
      for(const h of hs) if(h.point.y>14.5) return h.point.y;
    }catch(e){}
    return 18.0;
  }
  for (const [x,z] of [[12.7,-10.6],[12.7,10.6],[30.4,-10.6],[30.4,10.6]]){
    const y=eaveY(x,z)-.30;
    add('cyl','#5a4a34',[x,y-.14,z],[.012,.28,.012]);
    add('cone',GOLD,[x,y-.34,z],[.10,.20,.10], rotZ(Math.PI));
    add('sph',BRONZE_L,[x,y-.48,z],[.035,.035,.035]);
  }

  /* ---------- 大殿板门铺首：贴着正立面 x≈13.15 ----------
   * 明间（zc=0）四扇板门全敞开、是进殿通道，那里根本没有门板；
   * 早先连门钉带铺首一起铺过去，16 枚钉头 + 2 枚铺首就悬在佛像前的半空。
   * 门钉统一交给 detail.js 按分扇生成（明间门洞已跳过），这里只留两次间的铺首。 */
  for (const zc of [-3.1,3.1]){
    for (const zz of [-1,1]){
      add('cyl', BRONZE_L, [13.06,16.30,zc+zz*.42], [.055,.045,.055], rotZ(Math.PI/2));
    }
  }

  /* ---------- flush ---------- */
  for (const [key,list] of piles){
    const [kind,color]=key.split('|');
    const m = new T.MeshStandardMaterial({
      color, roughness: color===GOLD||color===BRONZE_L ? .55 : .94,
      metalness: color===GOLD||color===BRONZE_L||color===BRONZE ? .38 : 0
    });
    const im=new T.InstancedMesh(GEO[kind],m,list.length);
    list.forEach((mm,i)=>im.setMatrixAt(i,mm));
    im.instanceMatrix.needsUpdate=true;
    im.castShadow=true; im.receiveShadow=true;
    im.frustumCulled=false;
    im.userData.wonderOrnament=true;
    group.add(im);
  }

  /* 香烟原本挂在鼎式香炉上，鼎移除后一并撤掉。 */

  return { group, get batches(){ return piles.size; } };
}
