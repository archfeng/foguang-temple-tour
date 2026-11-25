import {makeAvatar} from '../avatar.js?v=20261125pilgrims';
import {makeCat} from '../detail.js?v=20261125wishes';
/* 生灵与器物：可互动的寺猫、锦鲤与水面、殿外铜钟、香铺、知客僧、扫地僧，
 * 以及佛坛主尊的造像细化。已有的四只猫会被复用并挂上互动，不重复建模。
 */
function signTexture(T, text){
  const c = document.createElement('canvas'); c.width = 256; c.height = 96;
  const x = c.getContext('2d');
  x.fillStyle = '#2b1e15'; x.fillRect(0,0,256,96);
  x.strokeStyle = '#b9955b'; x.lineWidth = 4; x.strokeRect(6,6,244,84);
  x.fillStyle = '#e3c88c'; x.font = '52px "STSong","SimSun",serif';
  x.textAlign = 'center'; x.textBaseline = 'middle'; x.fillText(text,128,50);
  const t = new T.CanvasTexture(c); t.colorSpace = T.SRGBColorSpace; return t;
}
function torusYZ(ctx, g, color, pos, r, tube, o = {}){
  const m = new ctx.T.Mesh(new ctx.T.TorusGeometry(r,tube,6,40), ctx.mat(color,o));
  m.position.set(pos[0],pos[1],pos[2]); m.rotation.y = Math.PI/2;
  m.castShadow = true; g.add(m); return m;
}

export function initBeings(ctx){
  const T = ctx.T, R = ctx.root;
  const POND = { x:-30.2, z:8.4, y:.50, w:6.4, d:4.4 };

  /* ---------------- 寺猫：先复用 detail.js 已有的四只 ---------------- */
  const cats = [];
  ctx.scene.traverse(o => {
    if (!o.isGroup || !o.userData.keep || cats.length >= 4) return;
    if (o.userData.cat) cats.push({ obj:o, walker:Math.abs(o.position.x-12.12)<.2, ph:Math.random()*6.28, purr:0, follow:false });
  });
  // 静态合并可能把其中几只收走，补足到四只，保证院里处处能碰见猫
  if (cats.length < 4){
    const spare = [[-43,-8,'#c9884a'],[9.5,7,'#e6ddc9'],[-25,-14,'#4a4038'],[4,-16,'#b9a184']];
    for (let i=cats.length;i<4;i++){
      const [x,z,c] = spare[i];
      const y = ctx.gy(x,z);
      const g = ctx.group(R,[x,y,z]);
      ctx.sph(g,c,[0,.20,0],.20).scale.set(.8,.9,1.25);
      ctx.sph(g,c,[0,.36,.18],.13);
      ctx.cone(g,c,[-.05,.47,.18],.05,.09);
      ctx.cone(g,c,[ .05,.47,.18],.05,.09);
      ctx.cyl(g,c,[0,.12,-.30],.03,.28,{});
      cats.push({ obj:g, walker:false, ph:Math.random()*6.28, purr:0, follow:false });
    }
  }

  const roofX=11.6, roofZ=-26;
  const roofHeight=ctx.stage.roofAt(roofX,roofZ);
  if(roofHeight!==null){
    const boss=makeCat({body:'#82543a',dark:'#50372c',belly:'#e8c9a0'},'patch');
    boss.group.userData.noPaint=true;
    boss.group.position.set(roofX,roofHeight+.035,roofZ);
    boss.group.scale.setScalar(1.48);
    boss.group.rotation.y=-Math.PI/2;
    R.add(boss.group);
    cats.push({obj:boss.group,walker:true,roofBoss:true,ph:.7,purr:0,follow:false});
    ctx.frames.push(now=>{ boss.tail.rotation.y=Math.sin(now*.0014)*.3; });
  }

  /* ---------------- 锦鲤：另起一群可聚拢的鱼 ---------------- */
  const koi = [];
  function makeKoi(color, i){
    const g = ctx.group(R,[POND.x,POND.y,POND.z]);
    g.userData.noPaint = true;
    const body = ctx.sph(g,color,[0,0,0],.15,{roughness:.52},2);
    body.scale.set(1.72,.53,.64);
    const belly = ctx.sph(g,'#e8cfaf',[.035,-.040,0],.11,{},2);
    belly.scale.set(1.67,.46,.69);
    const tail = ctx.group(g,[-.20,0,0]);
    const shape = new T.Shape();
    shape.moveTo(0,0); shape.quadraticCurveTo(-.08,.032,-.16,.088);
    shape.quadraticCurveTo(-.20,.065,-.13,0);
    shape.quadraticCurveTo(-.20,-.065,-.16,-.088);
    shape.quadraticCurveTo(-.08,-.032,0,0);
    const fin = new T.Mesh(new T.ShapeGeometry(shape,8),ctx.mat(color,{side:T.DoubleSide}));
    tail.add(fin);
    for(const side of [-1,1]){
      const pectoral=ctx.sph(g,'#eac49f',[.03,-.026,side*.093],.072);
      pectoral.scale.set(1.06,.14,.42); pectoral.rotation.y=side*.58;
      ctx.sph(g,'#332a23',[.164,.030,side*.074],.016);
      ctx.sph(g,'#eee2c7',[.168,.035,side*.086],.0045);
    }
    const dorsal=ctx.sph(g,color,[-.035,.067,0],.096);
    dorsal.scale.set(1.05,.43,.12);
    for(let j=0;j<3;j++){
      const patch=ctx.sph(g,i%2?'#b94729':'#f2dcbb',[.105-j*.091,.069+(j===1?.01:0),(j%2-.5)*.058],.048);
      patch.scale.set(1.16,.24,.91);
      patch.rotation.y=.6*j;
    }
    g.scale.setScalar(.85 + (i%3)*.12);
    koi.push({ obj:g, tail, a:i*1.05, r:.9+(i%3)*.42, sp:.30+i*.035,
               ph:i*1.7, x:POND.x, z:POND.z });
  }
  ['#d8763a','#eee5cf','#c9542f','#e9b46a','#dcd2b8','#b96338'].forEach((c,i)=>makeKoi(c,i));

  // 水面点击区（透明，只为拾取），以及投食涟漪
  const waterHit = ctx.box(R,'#000000',[POND.x,POND.y+.02,POND.z],[POND.w,.035,POND.d],
    { transparent:true, opacity:0, depthWrite:false });
  waterHit.castShadow=false;
  waterHit.receiveShadow=false;
  const ripples = [];
  for (let i=0;i<3;i++){
    const m = ctx.ring(R,'#e8f0e4',[POND.x,POND.y+.035,POND.z],.25,.018,
      { transparent:true, opacity:0, depthWrite:false });
    m.visible = false; ripples.push(m);
  }

  /* ---------------- 殿外铜钟 ---------------- */
  // 挪到月台偏中轴的开阔处，避开原有园林那棵正挡在钟前的松
  const bell = ctx.group(R,[9.6,13,4.6]);
  ctx.box(bell,'#9a927f',[0,.03,0],[2.2,.06,1.7]);
  ctx.cyl(bell,'#5a4130',[-.60,1.05,0],.085,2.1,{});
  ctx.cyl(bell,'#5a4130',[ .60,1.05,0],.085,2.1,{});
  ctx.box(bell,'#4b3627',[0,2.03,0],[1.65,.16,.22]);
  ctx.box(bell,'#6b5038',[0,1.92,0],[1.35,.09,.15]);
  const bellPivot = ctx.group(bell,[0,1.80,0]);
  const bellBody = new T.Mesh(new T.CylinderGeometry(.40,.62,1.05,12,1,true),
    ctx.mat('#8a6b3c',{ metalness:.55, roughness:.48, side:T.DoubleSide }));
  bellBody.position.set(0,-.55,0); bellBody.castShadow = true; bellPivot.add(bellBody);
  const bellRim = ctx.ring(bellPivot,'#a98a52',[0,-1.07,0],.60,.045,
    { metalness:.5, roughness:.5 });
  ctx.cyl(bellPivot,'#a98a52',[0,-.02,0],.10,.09,{ metalness:.5 });
  ctx.box(bellPivot,'#8a6b3c',[0,-.52,0],[.12,.86,.12]);
  for (let i=0;i<8;i++){
    const a = i/8*6.283;
    ctx.sph(bellPivot,'#b8995c',[Math.sin(a)*.50,-.86,Math.cos(a)*.50],.045,{ metalness:.5 });
  }
  // 撞钟木：悬在钟侧
  const striker = ctx.group(bell,[.92,1.15,.35]);
  ctx.cyl(striker,'#6b4c32',[0,0,0],.055,1.0,{}).rotation.z = Math.PI/2.5;
  ctx.sph(striker,'#7a5a3a',[-.42,-.34,.18],.12,{});
  let bellAt = -1e9, strikerT = 0;

  /* ---------------- 香铺 / 小卖部 ---------------- */
  const shop = ctx.group(R,[-46,.35,-10]);
  for (const x of [-1,1]) for (const z of [-.85,.85])
    ctx.cyl(shop,'#5b4230',[x*1.05,1.05,z],.075,2.1,{});
  ctx.box(shop,'#4a3526',[0,2.16,0],[2.6,.14,2.2]);
  const roofL = ctx.box(shop,'#4c4a42',[-.62,2.40,0],[1.45,.12,2.5]); roofL.rotation.z =  .22;
  const roofR = ctx.box(shop,'#4c4a42',[ .62,2.40,0],[1.45,.12,2.5]); roofR.rotation.z = -.22;
  ctx.stage.registerRoofs?.(roofL,roofR);
  ctx.box(shop,'#6d5136',[0,1.00,.35],[2.15,.14,.80]);
  ctx.box(shop,'#4a3526',[0,.48,.35],[2.15,.92,.72]);
  const sign = new T.Mesh(new T.PlaneGeometry(1.35,.50),
    new T.MeshStandardMaterial({ map:signTexture(T,'请 香'), roughness:.8, side:T.DoubleSide }));
  sign.position.set(0,1.86,1.13); shop.add(sign);
  for (let i=0;i<9;i++){
    const z = .10 + (i%3)*.16;
    ctx.cyl(shop,'#9c4530',[-.72+Math.floor(i/3)*.16,1.21,z],.012,.42,{});
  }
  ctx.box(shop,'#8a6a45',[.72,1.14,.35],[.32,.20,.42]);
  ctx.sph(shop,'#c9a15c',[.72,1.29,.35],.09,{});

  /* ---------------- 僧人 ---------------- */
  function monkFigure(parent, robe, withBroom){
    const g = ctx.group(parent,[0,0,0]);
    const body = ctx.cone(g,robe,[0,.62,0],.35,1.18,{},9);
    ctx.sph(g,'#d8b58e',[0,1.34,0],.17,{},1);
    ctx.sph(g,'#3a2f26',[0,1.47,0],.155,{},1).scale.set(1,.36,1);
    for (const s of [-1,1]) ctx.sph(g,'#d8b58e',[s*.32,.86,0],.085,{},1);
    // 合十的双手
    for (const s of [-1,1]) ctx.box(g,'#d8b58e',[s*.055,.92,.28],[.075,.24,.05]);
    // 念珠
    for (let i=0;i<9;i++){
      const a = i/9*6.283;
      ctx.sph(g,'#5c3a26',[Math.sin(a)*.24,.78+.06*Math.cos(a),.26+Math.cos(a)*.06],.026,{},0);
    }
    let broom = null;
    if (withBroom){
      broom = ctx.group(g,[.42,.78,.20]);
      ctx.cyl(broom,'#8a6c45',[0,.16,0],.026,1.6,{}).rotation.z = -.20;
      ctx.cone(broom,'#a8894f',[.16,-.62,0],.17,.42,{},7).rotation.z = Math.PI;
      for (let i=0;i<6;i++) ctx.box(broom,'#9c8149',[.16+(i-2.5)*.045,-.84,0],[.018,.30,.10]);
      broom.rotation.z = .18;
    }
    return { g, body, broom };
  }
  // 知客僧：按用户要求站进大殿里——殿门（x≈13.2 中央门洞）内侧北边，
  // 面朝殿门迎客。殿内地面 13.85（台明顶 13.8 + 5cm）。
  const monk = ctx.group(R,[14.9,13.85,-3.4]);
  const monkFig = monkFigure(monk,'#8a6b4a',false);
  ctx.cyl(monk,'#6d6152',[0,.02,0],.42,.06,{});
  monk.rotation.y = -Math.PI/2;   // 面向西面的殿门

  // 两名香客分批从明间进出，各用侧面的蒲团。
  const approach=[new T.Vector3(12.6,13.8,0),new T.Vector3(14.45,13.85,0)];
  const pilgrims = [-1,1].map((side,index)=>{
    const avatar=makeAvatar({name:'香客',color:side<0?'#79786c':'#9a7258'});
    avatar.tag.visible=false; avatar.ring.visible=false;
    avatar.group.name='礼拜香客';
    const cushion=new T.Vector3(15.60,13.99,side*3.5);
    const path=new T.CatmullRomCurve3([...approach,new T.Vector3(14.95,13.85,side*1.5),cushion]);
    R.add(avatar.group);
    return {avatar,path,side,offset:index*22};
  });
  const arrivedAt=performance.now();
  ctx.frames.push(now=>{
    for(const pilgrim of pilgrims){
      const seconds=(Math.max(0,now-arrivedAt)*.001+pilgrim.offset)%54;
      const {avatar,path}=pilgrim;
      const walking=seconds<5||seconds>=17&&seconds<23;
      avatar.group.visible=seconds<23;
      if(!avatar.group.visible)continue;
      const u=seconds<5 ? seconds/5 : seconds>=17 ? 1-(seconds-17)/6 : 1;
      const position=path.getPointAt(u);
      avatar.group.position.copy(position);
      if(walking){
        const dir=path.getTangentAt(u).multiplyScalar(seconds>=17?-1:1);
        avatar.group.rotation.y=Math.atan2(-dir.x,-dir.z);
      }else avatar.group.rotation.y=-Math.PI/2;
      const kneel=Math.max(0,Math.min(1,(seconds-5)*1.4,(17-seconds)*1.4));
      const cycles=seconds-6;
      const bow=cycles>=0&&cycles<9 ? Math.sin(Math.PI*(cycles%3)/3)**2 : 0;
      avatar.tick(now,walking?1:0,kneel,bow);
    }
  });

  // 扫地僧：站回下院石径边（原先 -28,8 正落在莲池里，半个身子泡在水上）
  const sweeper = ctx.group(R,[-34,.35,1.2]);
  const sweepFig = monkFigure(sweeper,'#6f6250',true);
  ctx.cyl(sweeper,'#6d6152',[0,.02,0],.48,.06,{});
  for (let i=0;i<7;i++)
    ctx.sph(sweeper,'#a98a4c',[-1.1+Math.random()*2.4,.05,-.8+Math.random()*1.8],.10,{},0)
      .scale.set(1.4,.25,1);
  sweeper.rotation.y = .3;

  /* ---------------- 佛坛主尊造像细化 ---------------- */
  function refineStatue(){
    const g = ctx.group(R,[0,0,0]);
    const gold = '#c8a35d', deep = '#8c4a34', clay = '#d3b28c', lapis = '#38546b';
    // 主尊 (23, 14.53, 0) scale 1.93：头约在 y=18.5，面朝 -X
    const cx = 23.72, cy = 18.50;
    torusYZ(ctx,g,gold,[cx+.14,cy,0],1.34,.075,{ metalness:.35, roughness:.55 });
    torusYZ(ctx,g,deep,[cx+.10,cy,0],1.12,.055,{ metalness:.2, roughness:.7 });
    torusYZ(ctx,g,'#e0c58c',[cx+.06,cy,0],.90,.038,{ metalness:.3, roughness:.6 });
    for (let i=0;i<14;i++){               // 背光火焰纹
      const a = i/14*6.283;
      const f = ctx.cone(g,'#b9823f',[cx+.13,cy+Math.sin(a)*1.33,Math.cos(a)*1.33],.10,.30,{},5);
      f.rotation.x = -a; f.rotation.z = Math.sin(a)*.3;
    }
    ctx.sph(g,gold,[cx+.15,cy+1.52,0],.13,{ metalness:.4 });
    // 宝冠与白毫
    ctx.cone(g,gold,[23.30,19.15,0],.20,.34,{},5);
    for (const s of [-1,1]) ctx.cone(g,gold,[23.32,19.02,s*.19],.10,.26,{},5);
    ctx.sph(g,'#f0e2c4',[22.86,18.62,0],.045,{ emissive:'#c9a15c', emissiveIntensity:.5 });
    // 璎珞：两串垂珠 + 胸前宝珠
    for (const s of [-1,1]){
      for (let i=0;i<7;i++){
        const t = i/6;
        ctx.sph(g,gold,[22.83-t*.16,17.72-t*.85,s*(.30+t*.18)],.048,{ metalness:.35 },0);
      }
    }
    ctx.sph(g,lapis,[22.68,16.80,0],.12,{ metalness:.2 });
    ctx.ring(g,gold,[22.70,16.80,0],.16,.028,{ metalness:.3 });
    // 莲座：座前缘一排仰莲瓣，两侧胁侍各一圈
    // 仰莲贴着座面排一圈：小、扁、偏赭，别让它像一排白牙
    const petal = (x,y,z,rx,rz,col) => {
      const p = ctx.sph(g,col,[x,y,z],.13,{},0);
      p.scale.set(rx,.38,rz); return p;
    };
    for (let i=0;i<11;i++){
      const z = -2.0+i*.40;
      petal(21.60,14.70,z,1.05,1.25,i%2?'#c4a982':'#d2b993');
    }
    ctx.box(g,'#b9955b',[21.60,14.60,0],[.06,.055,4.4]);
    for (const z of [-4.9,4.9]){
      const sy = 14.53 + 2.07*1.62;
      torusYZ(ctx,g,'#b99455',[23.15+.32,sy,z],.86,.045,{ metalness:.3 });
      torusYZ(ctx,g,'#7c4a38',[23.15+.28,sy,z],.70,.032,{});
      for (let i=0;i<7;i++) petal(21.92,14.72,z-1.05+i*.35,.85,1.0,'#c9ad86');
    }
    // 佛坛前一对莲灯
    for (const z of [-2.6,2.6]){
      ctx.cyl(g,'#8a6b45',[19.9,14.62,z],.09,.22,{});
      for (let i=0;i<6;i++){
        const a=i/6*6.283;
        const p=ctx.sph(g,'#d9c19a',[19.9+Math.sin(a)*.16,14.78,z+Math.cos(a)*.16],.10,{},0);
        p.scale.set(.9,.45,.9);
      }
      ctx.sph(g,'#ffc070',[19.9,14.88,z],.075,{ emissive:'#ff9838', emissiveIntensity:1.4 });
    }
    return g;
  }
  const statue = refineStatue();

  /* ---------------- 每帧动画 ---------------- */
  function tick(now, dt){
    const s = ctx.state;
    // 猫：被摸时蹭一下，投喂后慢慢跟到玩家脚边
    for (const c of cats){
      if (c.purr > 0){
        c.purr = Math.max(0, c.purr-dt);
        const k = 1 + Math.sin(c.purr*22)*.055;
        c.obj.scale.setScalar((c.baseScale || (c.baseScale=c.obj.scale.x)) * k);
      }
      if (c.follow && !c.walker){
        const p = c.obj.position, cam = ctx.camera.position;
        const dx = cam.x-p.x, dz = cam.z-p.z;
        const d = Math.hypot(dx,dz);
        if (d > 1.5){
          const step = Math.min(d-1.5, dt*.85);
          p.x += dx/d*step; p.z += dz/d*step;
          p.y = ctx.ground(p.x,p.z)+.01;
          c.obj.rotation.y = Math.atan2(dx,dz);
        }
      }
    }
    // 锦鲤：常态绕池游，投食后六秒内聚到食点
    const feeding = s.feedAt && (now - s.feedAt.t) < 6200;
    for (const f of koi){
      let x, z;
      if (feeding){
        const a = f.a + now*.0009;
        x = s.feedAt.x + Math.cos(a)*(.30 + f.r*.16);
        z = s.feedAt.z + Math.sin(a)*(.24 + f.r*.12);
      } else {
        f.a += dt*f.sp;
        x = POND.x + Math.cos(f.a)*f.r*1.7;
        z = POND.z + Math.sin(f.a*1.18+f.ph)*f.r*.90;
      }
      f.x += (x-f.x)*Math.min(1,dt*2.2);
      f.z += (z-f.z)*Math.min(1,dt*2.2);
      const ahead = Math.atan2(z-f.z, x-f.x);
      f.obj.position.set(f.x, POND.y - (feeding?.012:.044) + Math.sin(now*.0018+f.ph)*.012, f.z);
      f.obj.rotation.y = -ahead;
      f.tail.rotation.y = Math.sin(now*.010+f.ph)*.55;
      f.obj.rotation.z = Math.sin(now*.0022+f.ph)*.045;
    }
    // 涟漪
    if (s.feedAt){
      const age = (now - s.feedAt.t)/1000;
      ripples.forEach((r,i)=>{
        const t = age - i*.28;
        if (t < 0 || t > 1.5){ r.visible=false; return; }
        r.visible = true;
        r.position.set(s.feedAt.x, POND.y+.035, s.feedAt.z);
        r.scale.setScalar(.55+t*2.6);
        r.material.opacity = (1-t/1.5)*.55;
      });
    }
    // 钟：敲过之后摆一小会儿
    const bt = (now-bellAt)/1000;
    if (bt >= 0 && bt < 3.2){
      const damp = Math.exp(-bt*1.5);
      bellPivot.rotation.z = Math.sin(bt*13)*.11*damp;
      striker.rotation.z = Math.sin(bt*13+.7)*.30*damp;
    } else { bellPivot.rotation.z = 0; striker.rotation.z = 0; }
    // 僧人：呼吸、扫地
    monkFig.body.scale.y = 1 + Math.sin(now*.0013)*.018;
    sweepFig.body.rotation.z = Math.sin(now*.0016)*.045;
    if (sweepFig.broom) sweepFig.broom.rotation.z = .18 + Math.sin(now*.0021)*.34;
    // 烛台式小动画留给环境模块，这里只让莲灯火头轻晃
    statue.children.forEach((m,i)=>{
      if (m.material?.emissiveIntensity > 1) m.scale.setScalar(1+Math.sin(now*.006+i)*.12);
    });
  }
  ctx.frames.push(tick);

  return {
    cats, koi, POND, waterHit, ripples, bell, bellRim, bellPivot, striker,
    shop, monk, sweeper, statue, sign,
    ringBell(){ bellAt = performance.now(); },
    feed(x,z){ ctx.state.feedAt = { x, z, t:performance.now() }; }
  };
}
