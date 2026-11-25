const T = window.THREE;
const axis = new T.Vector3(0,1,0);
const material = (color,options={}) => new T.MeshStandardMaterial({color,roughness:.91,...options});
const bronze=material('#604737',{metalness:.47});
const red=material('#795044');
const clay=material('#b49b75');
const blue=material('#435954');
const gold=material('#98804d',{metalness:.18});
const dark=material('#312821');
const ash=material('#80766a');
const ember=new T.MeshBasicMaterial({color:'#ff8a35'});
const brass=material('#b08b4e',{metalness:.55,roughness:.42});
const boxwood=material('#8a5f36',{roughness:.82});
const tubeWood=material('#6e4526',{roughness:.85});
const meritWood=material('#4a2d19',{roughness:.88});
const sphere=new T.SphereGeometry(1,22,14);
const cube=new T.BoxGeometry(1,1,1);
const cylinder=new T.CylinderGeometry(1,1,1,12);

function mesh(group,geo,mat,x,y,z,sx=1,sy=1,sz=1){
  const m=new T.Mesh(geo,mat);
  m.position.set(x,y,z);m.scale.set(sx,sy,sz);
  m.castShadow=true;m.receiveShadow=true;
  group.add(m);return m;
}
const oval=(g,m,x,y,z,a,b,c)=>mesh(g,sphere,m,x,y,z,a,b,c);
const box=(g,m,x,y,z,a,b,c)=>mesh(g,cube,m,x,y,z,a,b,c);
function segment(g,m,a,b,r){
  const A=new T.Vector3(...a),B=new T.Vector3(...b),direction=B.clone().sub(A);
  const p=A.clone().lerp(B,.5);
  const object=mesh(g,cylinder,m,p.x,p.y,p.z,r,direction.length(),r);
  object.quaternion.setFromUnitVectors(axis,direction.normalize());return object;
}

function figure(group,x,z,scale,robe,seated=true){
  const g=new T.Group();g.position.set(x,14.53,z);g.scale.setScalar(scale);group.add(g);
  if(seated){
    box(g,blue,.09,.12,0,1.57,.24,2.22);
    box(g,gold,.09,.28,0,1.47,.085,2.03);
    oval(g,robe,-.05,.62,0,.83,.39,1.06);
    for(const s of [-1,1])oval(g,robe,-.16,.69,s*.57,.67,.32,.61);
  }
  const body=seated?1.18:1.02;
  oval(g,robe,.09,body,0,.47,seated?.68:.86,.62);
  oval(g,clay,-.17,body+.48,0,.21,.20,.25);
  const hy=body+.89;
  oval(g,clay,.05,hy,0,.31,.40,.29);
  oval(g,dark,.12,hy+.24,0,.29,.20,.30);
  oval(g,dark,.15,hy+.43,0,.15,.14,.16);
  oval(g,clay,-.245,hy-.025,0,.043,.078,.048);
  oval(g,red,-.246,hy-.139,0,.029,.017,.073);
  for(const s of [-1,1]){
    oval(g,clay,.049,hy-.074,s*.275,.11,.20,.066);
    const eye=oval(g,dark,-.238,hy+.02,s*.115,.012,.009,.056);eye.rotation.x=s*.12;
    oval(g,robe,-.12,body+.03,s*.49,.32,.43,.25).rotation.x=s*.32;
    oval(g,clay,-.49,body-.22,s*.19,.19,.068,.13);
    for(let j=0;j<4;j++){
      const p=[];
      for(let k=0;k<9;k++){const t=k/8;p.push(new T.Vector3(-.31-.16*Math.sin(t*Math.PI),body-.41+j*.095+.16*t,s*(.20+t*.39)));}
      mesh(g,new T.TubeGeometry(new T.CatmullRomCurve3(p),12,.016,5,false),gold,0,0,0);
    }
  }
  if(seated){
    const h=mesh(g,new T.TorusGeometry(.69,.048,8,48),gold,.37,hy,0);
    h.rotation.y=Math.PI/2;h.scale.y=1.22;
    const rim=mesh(g,new T.TorusGeometry(.75,.022,6,48),blue,.41,hy,0);
    rim.rotation.y=Math.PI/2;rim.scale.y=1.22;
  }
}

// 功德箱正面用画布写两个字，避免额外图片资源。
function meritPlate(){
  const c=document.createElement('canvas');c.width=128;c.height=64;
  const x=c.getContext('2d');
  x.fillStyle='#2b1a10';x.fillRect(0,0,128,64);
  x.strokeStyle='#b08b4e';x.lineWidth=3;x.strokeRect(4,4,120,56);
  x.fillStyle='#dcb872';x.font='30px "STSong","SimSun",serif';
  x.textAlign='center';x.textBaseline='middle';
  x.fillText('功德',44,34);x.fillText('箱',88,34);
  const t=new T.CanvasTexture(c);
  t.colorSpace=T.SRGBColorSpace;
  return new T.MeshStandardMaterial({map:t,roughness:.72,metalness:.08});
}

export function buildHall(scene){
  const group=new T.Group();scene.add(group);
  const plinth=material('#958269'),plinthTrim=material('#a49170');
  box(group,plinth,23.4,14.17,0,5.6,.74,24.2);
  box(group,plinthTrim,23.38,14.51,0,5.72,.105,24.38);
  for(let i=0;i<30;i++){
    const z=-11.6+i*.8;
    box(group,dark,20.54,14.38,z,.10,.24,.74);
    box(group,red,20.47,14.38,z,.055,.15,.60);
  }
  box(group,red,27.1,16.5,0,.21,4.55,24.4);
  figure(group,23,0,1.93,red);
  figure(group,23.15,-4.9,1.62,blue);
  figure(group,23.15,4.9,1.62,red);
  for(const sign of [-1,1]){
    const z=sign*9.7;
    const beast=material(sign<0?'#9d8263':'#a99b87');
    oval(group,beast,23.38,15.18,z,.90,.63,.56);
    oval(group,beast,22.48,15.3,z,.37,.49,.40);
    for(const side of [-1,1])oval(group,beast,22.49,15.35,z+side*.32,.26,.39,.19);
    if(sign>0)segment(group,beast,[22.34,15.23,z],[22.03,14.75,z],.13);
    figure(group,23.56,z,1.23,sign<0?blue:red);
    for(const y of [1.87,3.15,6.55,8.01,11.35])
      figure(group,21.86+(y%1)*.7,sign*y,.89+(y%1)*.25,y%1>.4?blue:red,false);
  }
  box(group,dark,19.1,14.55,0,.75,.11,2.35);
  for(const x of [18.82,19.38])for(const z of [-1,1])box(group,dark,x,14.16,z,.12,.74,.12);
  box(group,red,19.09,14.53,0,.69,.15,2.12);
  oval(group,bronze,19.08,14.78,0,.31,.18,.31);
  oval(group,ash,19.08,14.887,0,.26,.048,.26);
  const ring=mesh(group,new T.TorusGeometry(.293,.028,9,30),bronze,19.08,14.882,0);
  ring.rotation.x=-Math.PI/2;
  for(const z of [-.82,.82]){
    mesh(group,cylinder,bronze,19.08,14.68,z,.17,.14,.17);
    mesh(group,cylinder,material('#d0aa74'),19.08,14.85,z,.063,.26,.063);
    const flame=oval(group,ember,19.08,15.021,z,.036,.079,.033);
    const light=new T.PointLight('#ffc276',8,7,1.8);
    light.position.copy(flame.position);group.add(light);
  }
  // A low warm fill models reflected courtyard light on the painted clay.
  const fill=new T.PointLight('#eee1c7',31,20,1.6);fill.position.set(16.7,17.3,.25);group.add(fill);

  /* ---------- 香：可随「上香」逐次变长 ---------- */
  const sticks=[],embers=[];
  const stickBase=14.9, stickZ=[-.095,0,.093];
  let length=.30, lengthTarget=.30, level=0;
  function plantSticks(){
    if(sticks.length)return;
    for(const z of stickZ){
      sticks.push(mesh(group,cylinder,red,19.08,stickBase+length/2,z,.0082,length,.0082));
      embers.push(oval(group,ember,19.08,stickBase+length,z,.0125,.017,.0125));
    }
  }
  const maxLevel=5;
  function lightIncense(now){
    plantSticks();
    litAt=now;
    if(level<maxLevel){
      level++;
      lengthTarget=.30+(level-1)*.135;
    }
    return {level,maxed:level>=maxLevel,length:lengthTarget};
  }

  /* ---------- 签筒 ---------- */
  const tube=new T.Group();
  tube.userData.keep=true;                 // 摇签时会晃
  tube.position.set(18.62,13.85,-1.15);
  tube.rotation.y=-.22;
  group.add(tube);
  mesh(tube,cylinder,tubeWood,0,.29,0,.118,.58,.118);
  mesh(tube,cylinder,brass,0,.575,0,.126,.028,.126);
  mesh(tube,cylinder,material('#3b2317'),0,.592,0,.098,.012,.098);
  const tubeSticks=[];
  for(let i=0;i<7;i++){
    const a=i/7*Math.PI*2+.3,r=.048+((i*37)%11)*.0022;
    const s=mesh(tube,cylinder,boxwood,Math.cos(a)*r,.80,Math.sin(a)*r,.0115,.40,.0115);
    s.rotation.z=(i%3-1)*.05;s.rotation.x=((i*53)%7-3)*.012;
    tubeSticks.push(s);
  }
  let shakeAt=-Infinity;
  function shakeTube(now){shakeAt=now;}
  function tubeLift(){
    // 被摇出来的那支签在三维里也抬起一截
    const s=tubeSticks[3];
    return s;
  }

  /* ---------- 功德箱 ---------- */
  const merit=new T.Group();
  merit.position.set(18.95,13.85,-1.92);
  group.add(merit);
  box(merit,meritWood,0,.36,0,.42,.72,.54);
  box(merit,material('#633f22'),0,.725,0,.46,.05,.58);
  box(merit,material('#150d07'),0,.752,0,.26,.014,.05);
  box(merit,brass,0,.10,0,.45,.03,.57);
  const plate=new T.Mesh(new T.PlaneGeometry(.28,.14),meritPlate());
  plate.position.set(-.212,.46,0);plate.rotation.y=-Math.PI/2;
  merit.add(plate);
  for(const s of [-1,1])box(merit,brass,-.20,.64,s*.19,.05,.05,.05);

  /* ---------- 蒲团：殿内跪拜位，成排铺在香案前 ---------- */
  // 前排留给进殿的人走动，两排主垫 + 香案侧翼两只，共 12 只
  const cushionAt=[
    [15.60,-6.0],[15.60,-3.5],[15.60,0],[15.60,3.5],[15.60,6.0],
    [17.05,-6.0],[17.05,-3.5],[17.05,0],[17.05,3.5],[17.05,6.0],
    [18.35,-2.95],[18.35,2.95]
  ];
  const cushionMat={
    base:material('#77552f'),rim:material('#8b6538'),mat:material('#a8542c'),
    ring:material('#94481f'),inner:material('#b9603a'),band:material('#6d3d21')
  };
  // 先做一只模板，其余克隆，共享几何与材质，避免各自新建一堆材质
  const cushionProto=new T.Group();
  // 底下是圆形的草编席垫，不做方木托，排成行才像庙里的拜垫
  const disc=new T.CylinderGeometry(1,1,1,30);
  mesh(cushionProto,disc,cushionMat.base,0,.026,0,.52,.026,.52);
  mesh(cushionProto,disc,cushionMat.rim,0,.050,0,.495,.022,.495);
  const pad=mesh(cushionProto,disc,cushionMat.mat,0,.175,0,.40,.215,.40);
  pad.rotation.y=.5;
  const padTop=mesh(cushionProto,new T.TorusGeometry(.365,.052,9,32),cushionMat.ring,0,.268,0);
  padTop.rotation.x=-Math.PI/2;
  mesh(cushionProto,disc,cushionMat.inner,0,.278,0,.30,.02,.30);
  // 捆扎的十字绳
  for(const a of [0,Math.PI/2]){
    const band=box(cushionProto,cushionMat.band,0,.20,0,.82,.018,.055);
    band.rotation.y=.5+a;
    const band2=box(cushionProto,cushionMat.band,0,.20,0,.82,.018,.055);
    band2.rotation.y=.5+a+Math.PI/2;
  }
  const cushions=cushionAt.map(([x,z],i)=>{
    const c=cushionProto.clone();
    c.position.set(x,13.85,z);
    // 略作参差，看着才像常有人用的旧垫子
    c.rotation.y=(((i*37)%11)-5)*.012;
    group.add(c);
    return {x,z};
  });

  /* ---------- 铜钱 ---------- */
  const coin=new T.Mesh(new T.CylinderGeometry(.042,.042,.014,18),brass);
  coin.visible=false;coin.castShadow=true;coin.userData.keep=true;group.add(coin);
  let coinAge=-1,coinStartAt=0,coinTimer=0;  // 帧驱动动画 + 定时器兜底生命周期
  const coinFrom=new T.Vector3(17.3,15.05,-1.15);
  const coinTo=new T.Vector3(18.95,14.64,-1.92);
  function dropCoin(){
    // 每次投币都从起点重新出发：上一枚若还没落完，不要让它接着半空中的位置飞
    coinAge=0;coinStartAt=performance.now();coin.visible=true;
    coin.position.copy(coinFrom);coin.rotation.set(0,0,0);
    // 即使标签页在后台、渲染循环被完全节流，铜钱也一定会被收起，不会永远钉在半空
    clearTimeout(coinTimer);
    coinTimer=setTimeout(()=>{coin.visible=false;coinAge=-1;},1400);
  }

  /* ---------- 香烟 ---------- */
  const smokeCanvas=document.createElement('canvas');smokeCanvas.width=smokeCanvas.height=64;
  const ctx=smokeCanvas.getContext('2d');
  const gradient=ctx.createRadialGradient(32,32,0,32,32,31);
  gradient.addColorStop(0,'rgba(223,215,197,.50)');gradient.addColorStop(.4,'rgba(223,215,197,.26)');gradient.addColorStop(1,'rgba(223,215,197,0)');
  ctx.fillStyle=gradient;ctx.fillRect(0,0,64,64);
  const map=new T.CanvasTexture(smokeCanvas);
  const smoke=Array.from({length:26},()=>{
    const s=new T.Sprite(new T.SpriteMaterial({map,transparent:true,depthWrite:false,opacity:0}));
    s.visible=false;group.add(s);return s;
  });
  let litAt=-Infinity;

  function tick(now,dt){
    dt=Math.min(dt||.016,.06);

    // 香长变化
    if(sticks.length&&Math.abs(lengthTarget-length)>.0005){
      length+=(lengthTarget-length)*Math.min(1,dt*3.4);
      sticks.forEach(s=>{s.scale.y=length;s.position.y=stickBase+length/2;});
      embers.forEach(e=>{e.position.y=stickBase+length;});
    }

    // 香烟
    const smokeOn=now-litAt<85000;
    const puffs=smokeOn?Math.round(10+level*3.2):0;
    for(const [i,s] of smoke.entries()){
      const active=i<puffs;s.visible=active;if(!active)continue;
      const t=((now-litAt+i*157)%4300)/4300;
      s.position.set(19.075+Math.sin(t*8+i*.3)*t*.22,stickBase+length+t*(1.75+level*.14),(i%3-1)*.09+Math.sin(t*5+i*.2)*t*.22);
      s.scale.setScalar(.10+t*.58);s.material.opacity=(1-t)*.48;
    }

    // 摇签筒
    const shakeT=(now-shakeAt)/1250;
    if(shakeT>=0&&shakeT<1){
      const damp=(1-shakeT)**2;
      tube.rotation.z=Math.sin(shakeT*46)*.085*damp;
      tube.rotation.x=Math.cos(shakeT*38)*.05*damp;
      tubeLift().position.y=.80+Math.sin(Math.max(0,(shakeT-.35))/ .65*Math.PI)*.12;
    }else if(shakeT>=1){
      tube.rotation.z=0;tube.rotation.x=0;
      tubeLift().position.y=.80;
    }

    // 铜钱飞入功德箱。原实现用 (now-coinAt)/760 且只在 t===1 时收起：
    // 浮点时间几乎不会精确等于 1，t>1 后整段被跳过，铜钱就永久钉在半空。
    // 现在改成逐帧累计，落满即收，与调用方的时间基准完全无关。
    if(coinAge>=0){
      coinAge+=dt;
      const wall=performance.now()-coinStartAt;
      // 帧被节流时 dt 会被主循环压到 .05，光靠累计数秒都走不完；墙钟保证 1.4 秒内必收
      const t=Math.min(Math.max(coinAge/.76,wall/760),1),e=1-(1-t)*(1-t);
      const p=new T.Vector3().lerpVectors(coinFrom,coinTo,e);
      p.y+=Math.sin(t*Math.PI)*.72;
      coin.position.copy(p);
      coin.rotation.x=Math.PI/2*(1-e*.18);
      coin.rotation.z+=.42;
      coin.scale.setScalar(1);
      if(t>=1||wall>1400){coin.visible=false;coinAge=-1;}
    }
  }

  return {lightIncense,tick,shakeTube,dropCoin,cushions};
}
