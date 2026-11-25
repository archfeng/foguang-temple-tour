import {progress,meditation} from './progress.js?v=20261125wishes';
import {buildHall} from './hall.js?v=20261112h';
import {buildFacades} from './facades.js?v=20261118e';
import {buildDetails} from './detail.js?v=20261125wishes';
import {buildGarden} from './garden.js?v=20261125animals';
import {weathered,loadPineSprays} from './wonder/weathered.js?v=20261116bk';
import {surface} from './surfaces.js?v=20261112h';
import * as sfx from './ritual-audio.js?v=20261112h';
import {startPresence} from './presence.js?v=20261112h';
import {makeAvatar} from './avatar.js?v=20261125animals';
import {blessing} from './blessing.js?v=20261112h';
import {omens} from './omens.js?v=20261112h';
import {startLive} from './live.js?v=20261112h';
import {Q} from './quality.js?v=20261112h';
import {bakeStatic,bakeColored} from './opt.js?v=weathered2';
const T = window.THREE;
const status = document.querySelector('#status');
const stops = [
  {title:'全寺鸟瞰', desc:'沿西向东，三重台地顺着山势逐级抬升。东大殿坐在最高一层，背靠山坡，面向山谷。', eye:[-88,85,110], at:[-16,4,0]},
  // 地面高程 .35 + 人眼 1.62：第一站要真的站在下院石板路上，不悬在半空
  {title:'山门 · 下院', desc:'越过山门进入第一重院落。向北可见文殊殿，往前，石径穿过下院，通向山腰。', eye:[-42,1.97,1.2], at:[-23,4,1]},
  {title:'券门 · 登高', desc:'先过低矮的砖券门，再登陡峭的石阶。两侧窑洞藏在高台下，东大殿的檐角从松枝间露出。', eye:[-21,4.4,2.4], at:[-3,7.3,-2]},
  {title:'东大殿', desc:'登上第三重台地，穿过松荫看唐代大殿。宽阔的庑殿顶下，柱列和斗栱形成层层阴影。', eye:[3.2,15.5,.05], at:[19,18.1,-4]},
  {title:'东大殿 · 佛堂',desc:'跨过明间门槛，顺着香案望向五组彩塑。上香、礼拜、抽签和香火捐赠是虚拟游客体验。',eye:[15.05,15.38,0],at:[24,16.55,0]}
];
const V = (x,y,z)=>new T.Vector3(x,z,-y);
let seed=620857;
const rand=()=>((seed=(Math.imul(1664525,seed)+1013904223)>>>0)/4294967296);
let renderer,scene,camera,target,motion,playing=false,current=0;
let hall, presence=null, bowStart=-Infinity, balance=30, drawing=false;
let details=null, garden=null, omenHall=false, liveTick=null, liveHold=0;
let roam=false, yaw=0, pitch=0, lastT=0;
// 从禅房回来时按住"自己往下走"的自动播放，等用户点游览/站点才放开。
// 必须在模块顶层：controls() 的按钮回调和 boot() 都要访问它（原来定义在 boot 内导致按钮点击 ReferenceError）。
let autoPlayHeld=false;
// 触屏设备标记：漫游默认第一人称、提示文案改用「点一下」都看它
const touchDevice=matchMedia('(pointer:coarse)').matches;
// 第三人称：镜头退到小人身后，WASD 走的是小人（自己的镜头位置仍是「人」的位置）
let third=false, mine=null;
// 自适应：掉帧就往下调一点像素比，宁可糊一点也不卡
let dprNow=1, perfAcc=0, perfN=0, perfAt=0, shadowAt=0, dprFast=0;
// 第三人称镜头避障：从人头往后打一条射线，撞到墙就收近
const camBoxes=[];            // 墙体、台基这些大盒体，用来把第三人称镜头挡在外面
const camRay=new T.Ray();
const camHitPoint=new T.Vector3();
let camDist=5.9, camProbeAt=0;
// 直播模式：?live=1 时收掉全部界面，自动巡游、隔一阵落一次瑞兆，可作为直播画面源
const LIVE=new URLSearchParams(location.search).get('live')==='1';
// 视角：鼠标只改「目标角度」，实际角度每帧追上去，转头才有惯性而不是硬切
let yawT=0, pitchT=0, locked=false, mouseNX=0, mouseNY=0;
let swayYaw=0, swayPitch=0;
// 直播互动用的临时偏转：观众喊「左转」时，导览镜头先偏过去，再慢慢回正
let lookYaw=0, lookPitch=0, bowPulseAt=-1e9;
let praying=false, prayT0=0, prayDip=0, bows=0, ritualShown=null, promptShown=false;
// 当前选中的蒲团：殿里铺了一排，礼拜时就坐离得最近的那只
let praySpot={x:15.6,z:0}, prayYaw=-Math.PI/2;
const ALTAR={x:19.08,z:0};
const held=new Set();
const ROAM={eye:1.62,speed:3.4,run:6.6};
const JUMP_TIME=1.24;
const JUMP_HEIGHT=4.2;
let jumpTime=JUMP_TIME, jumpHeight=0, roofLevel=null, jumpOrigin=0, endRoofSit;
const roofMeshes=[];
const roofRay=new T.Raycaster();
function roofAt(x,z,ceiling){
  roofRay.set(new T.Vector3(x,ceiling,z),new T.Vector3(0,-1,0));
  return roofRay.intersectObjects(roofMeshes,false)[0]?.point.y ?? null;
}
function walkingY(x,z){ return roofLevel ?? ground(x,z); }


/* ---------- 去禅房再回来：接着刚才的位置站着，不从鸟瞰重来 ----------
 * 点「禅房」是整页跳走，回来等于重新进站，一定会重新载入三维（模块、贴图、
 * 几何都要重建，浏览器没有"把现场挂起再唤醒"的接口）。能做的是两件事：
 *   ① 图纸本身走 Cache Storage（loadScene 里已有），第二次几乎秒开；
 *   ② 记住离开时的站位、朝向、漫游与第三人称状态，立起来之后悄悄复原，
 *      看起来就像"没走"。
 * 只放在本次标签页的 sessionStorage 里：关掉页面就清，不会下次进来还站在半山。 */
const SAVE_KEY='foguang.leave.v1';
function saveLeave(){
  try{
    sessionStorage.setItem(SAVE_KEY,JSON.stringify({
      x:camera.position.x,y:camera.position.y,z:camera.position.z,
      tx:target.x,ty:target.y,tz:target.z,
      yaw,pitch,yawT,pitchT,roam,third,current,at:Date.now()
    }));
  }catch(e){}
}
function readLeave(){
  try{
    const s=sessionStorage.getItem(SAVE_KEY);
    if(!s)return null;
    const o=JSON.parse(s);
    // 超过半小时的旧记录不用（另开一场浏览就别接着上一场）
    if(!o||Date.now()-(o.at||0)>30*60*1000)return null;
    if(![o.x,o.y,o.z].every(Number.isFinite))return null;
    return o;
  }catch(e){ return null; }
}
function applyLeave(o){
  if(!o)return;
  camera.position.set(o.x,o.y,o.z);
  target.set(o.tx,o.ty,o.tz);
  yaw=o.yaw||0; pitch=o.pitch||0; yawT=o.yawT||yaw; pitchT=o.pitchT||pitch;
  if(window.__restoreStop)window.__restoreStop(o.current||0);
  if(o.roam)setRoam(true);
  if(o.third&&!touchDevice)setThird(true);
}
function startJump(){
  if(!roam||praying||endRoofSit||jumpTime<JUMP_TIME)return false;
  jumpOrigin=walkingY(camera.position.x,camera.position.z);
  roofLevel=null;
  jumpTime=0;
  return true;
}
const canvasHost=document.querySelector('#scene');
const yAxis=new T.Vector3(0,1,0);
const mat=(c)=>new T.MeshStandardMaterial({color:c,roughness:1,side:T.DoubleSide,
  polygonOffset:true,polygonOffsetFactor:1,polygonOffsetUnits:1}); // 抑制大量贴合/重叠面的 z-fighting 破面
const piles=new Map(), mats=new Map();
const cube=()=>new T.BoxGeometry(1,1,1);
const cyl=()=>new T.CylinderGeometry(1,1,1,Q.cylSeg);
const ball=()=>new T.IcosahedronGeometry(1,Q.leafDetail);
function put(type,color,pos,scale,quat=new T.Quaternion(),finish=''){
  const key=type+color+finish;
  if(!piles.has(key))piles.set(key,{type,color,finish,items:[]});
  piles.get(key).items.push(new T.Matrix4().compose(pos,quat,scale));
}
function rod(a,b,r,c,finish){
  const d=b.clone().sub(a);
  put('cyl',c,a.clone().lerp(b,.5),new T.Vector3(r,d.length(),r),new T.Quaternion().setFromUnitVectors(yAxis,d.normalize()),finish);
}
const rgb=a=>'#'+a.slice(0,3).map(x=>x.toString(16).padStart(2,'0')).join('');
function masonry(d,c,finish='stone'){
  const [x,y,z,X,Y,Z]=d;
  put('cube',c,V((x+X)/2,(y+Y)/2,(z+Z)/2),new T.Vector3(X-x,Z-z,Y-y),undefined,finish);
}
const walkingWalls = [];
function rememberWall([x,y,z,X,Y,Z]){
  walkingWalls.push({x,y,z,X,Y,Z});
}

// Match each hip edge to its two long slopes. The exported short slopes
// stop just before the ridge and otherwise leave a different edge profile.
function closeHips(roofs){
  const [west,east,...hips]=roofs;
  for (const [side,hip] of hips.entries()){
    const edge=side===0?0:west[0].length-1;
    for(const [i,row] of hip.entries()){
      const left=west[i][edge],right=east[i][edge];
      const oldLeft=row[0],oldRight=row[row.length-1];
      hip[i]=row.map((p,j)=>{
        const t=j/(row.length-1);
        return p.map((v,k)=>v+(left[k]-oldLeft[k])*(1-t)+(right[k]-oldRight[k])*t);
      });
    }
  }
}

function tileRolls(rows){
  const width=rows[0].length-1;
  const pitch=Math.hypot(rows[0][width][0]-rows[0][0][0],rows[0][width][1]-rows[0][0][1]);
  // 手机端瓦垄间距放宽，三角形减半；近景大殿保持原密度
  const step=Q.low?.56:.33;
  const count=Math.floor(pitch/step);
  const rolls=[];
  for(let i=1;i<count;i++){
    rolls.push(rows.map(row=>[-.17,0,.17].map((offset,k)=>{
      const u=(i+offset)*width/count;
      const a=row[Math.floor(u)], b=row[Math.ceil(u)], t=u%1;
      return [a[0]+(b[0]-a[0])*t,a[1]+(b[1]-a[1])*t,
        a[2]+(b[2]-a[2])*t+(k===1?.072:.025)];
    })));
  }
  return rolls;
}

function batchModel(data){
  const sheets=new Map();
  const eastRoofs=data.filter(([, , ,layer,name])=>layer==='东大殿·屋面及屋脊'&&name==='屋面坡');
  if(eastRoofs.length===4)closeHips(eastRoofs.map(([,rows])=>rows));
  function sheet(rows,color,upward=false){
    if(!sheets.has(color))sheets.set(color,{pos:[],uv:[],idx:[]});
    const {pos,uv,idx}=sheets.get(color);
    const base=pos.length/3, width=rows[0].length;
    for(const row of rows)for(const [x,y,z] of row){
      pos.push(x,z,-y);
      uv.push(x*.8,y*.8);
    }
    function tri(a,b,c){
      const ax=pos[b*3]-pos[a*3],az=pos[b*3+2]-pos[a*3+2];
      const bx=pos[c*3]-pos[a*3],bz=pos[c*3+2]-pos[a*3+2];
      if(upward&&az*bx-ax*bz<0)idx.push(a,c,b);
      else idx.push(a,b,c);
    }
    for(let j=0;j<rows.length-1;j++)for(let i=0;i<width-1;i++){
      const a=base+j*width+i;
      tri(a,a+1,a+width+1);tri(a,a+width+1,a+width);
    }
  }
  for(const [kind,d,color,layer,name] of data){
    if(name==='瓦垄')continue;
    if(name==='板门示意'){
      const c=(d[1]+d[4])/2;
      // 明间整跨敞开（四扇都让开，detail.js 在两侧柱边画成向内折起），两梢间让位给直棂窗
      if(Math.abs(c)<2.35||Math.abs(c)>7.3)continue;
    }
    if(name==='佛坛占位')continue;
    let c=rgb(color);
    // 主轴台阶：与 11-12 原版一致——几何由 vaultedTerrace() 的 37 段实体踏步
    // 统一绘制，scene.json 的这批楔形只作数据、不进渲染。
    if(name==='主轴台阶')continue;
    const roof=/屋面坡|山面边缘|正脊|垂脊/.test(name);
    const timber=/斗栱|檩椽|梁架|额枋/.test(layer)||/檐柱|板门|柱身|^柱 /.test(name);
    if(name==='屋面坡'||name==='瓦垄')c=name==='屋面坡'?'#555b53':'#70756a';   // 三轮P1：底色 #555B53、明部 #70756A
    if(name==='一进院落'||name==='二进院落'||name==='三进高台')c='#897e66';
    // 与 11-12 版一致：三进高台整块实心渲染（走廊段的可见坡面即其本身），
    // 主轴台阶楔形仍跳过、由 vaultedTerrace 的 37 段实体踏步呈现。
    if(kind==='b'){
      if(['主体示意','墙身','山墙','板门示意','围墙','影壁'].includes(name))rememberWall(d);
      if(layer==='东大殿·围护及佛坛'&&name==='墙身'&&d[0]<14){
        masonry([d[0],d[1],d[2],d[3],d[4],d[2]+1.9],'#aa9d85');
        masonry([d[0]+.045,d[1],d[2]+1.9,d[3],d[4],d[5]],'#42382e','wood');
        for(let y=d[1]+.07;y<d[4];y+=.19)
          masonry([d[0]-.015,y,d[2]+1.9,d[0]+.08,y+.058,d[5]],'#75503a','wood');
      }else masonry(d,name==='板门示意'?'#764a35':c,timber?'wood':
        /院落|高台|踏步/.test(name)?'paving':/墙|主体示意|影壁/.test(name)?'plaster':'stone');
    }
    else if(kind==='r')rod(V(...d.slice(0,3)),V(...d.slice(3,6)),d[6],c,roof?'tile':timber?'wood':'stone');
    else {
      sheet(d,c,name==='屋面坡');
      if(name==='屋面坡'){
        const vertices=[];
        for(let j=1;j<d.length;j++)for(let i=1;i<d[j].length;i++){
          for(const v of [d[j-1][i-1],d[j-1][i],d[j][i],d[j-1][i-1],d[j][i],d[j][i-1]])
            vertices.push(v[0],v[2],-v[1]);
        }
        const collider=new T.BufferGeometry();
        collider.setAttribute('position',new T.Float32BufferAttribute(vertices,3));
        roofMeshes.push(new T.Mesh(collider,mat('#ffffff')));
      }
      // 所有屋面坡都补瓦垄：原先只有东大殿有，山门与配殿是一片光板（用户截图指出的问题）。
      // closeHips 只对齐东大殿的四个坡，其余坡直接按原始 rows 生成；统一走 sheets 合批，
      // 不新增网格对象，绘制次数不涨。
      if(name==='屋面坡'){
        for(const roll of tileRolls(d))sheet(roll,'#70756a',true);
      }
    }
  }
  // Close the strips left between the exported door bays and the adjoining
  // wall. Keep the measured clear span of the central doorway open.
  for(const [a,b] of [
    [-12.99,-12.34],[-7.96,-7.27],[-2.90,-2.19],
    [2.16,2.86],[7.23,7.93],[12.30,12.99]
  ]){
    const jamb=[13.15,a,13.8,13.30,b,18.48];
    masonry(jamb,'#603022','wood');
    rememberWall(jamb);
  }
  for(const side of [-1,1]){
    const center=side*10.1;
    const shutter=[13.38,center-2.23,13.8,13.49,center+2.23,18.48];
    masonry(shutter,'#42382e','wood');
    rememberWall(shutter);
  }
  masonry([13.16,-16.77,18.46,13.34,16.77,18.78],'#684632','wood');
  for(const [c,{pos,uv,idx}] of sheets){
    const g=new T.BufferGeometry();
    g.setAttribute('position',new T.Float32BufferAttribute(pos,3));
    g.setAttribute('uv',new T.Float32BufferAttribute(uv,2));
    g.setIndex(idx);g.computeVertexNormals();
    const m=new T.Mesh(g,weathered(mat(c),'tile'));m.receiveShadow=true;m.castShadow=true;scene.add(m);
  }
}
function vaultedTerrace(){
  const colors=['#786a59','#817460','#756957','#8b7b66','#6f6556'];
  const solidMaterials=new Map();
  const brick=()=>colors[Math.floor(rand()*colors.length)];
  const face=-8.1, crown=6.0;
  function solid(points,x0,x1,color,finish='brick'){
    const shape=new T.Shape();
    points.forEach(([y,z],i)=>i?shape.lineTo(y,z):shape.moveTo(y,z));
    shape.closePath();
    const geo=new T.ExtrudeGeometry(shape,{depth:x1-x0,bevelEnabled:false});
    geo.rotateY(Math.PI/2);geo.translate(x0,0,0);
    const key=color+finish;
    if(!solidMaterials.has(key))solidMaterials.set(key,weathered(mat(color),finish));
    const obj=new T.Mesh(geo,solidMaterials.get(key));obj.castShadow=true;obj.receiveShadow=true;scene.add(obj);
  }
  function vault(y,w,spring,through){
    const radius=w/2, rise=radius*.8, thickness=.30, depth=through?1.15:2.2;
    const p=(a,outer)=>[y+Math.cos(a)*(radius+outer),spring+Math.sin(a)*(rise+outer)];
    for(let i=0;i<17;i++){
      const a=Math.PI*i/17,b=Math.PI*(i+1)/17;
      solid([p(a,0),p(b,0),p(b,thickness),p(a,thickness)],face-.07,face+depth,brick());
      const pa=p(a,thickness),pb=p(b,thickness);
      solid([pa,pb,[pb[0],crown],[pa[0],crown]],face,face+depth,'#887a66','plaster');
    }
    for(const s of [-1,1]){
      const a=y+s*radius,b=y+s*(radius+.43);
      for(let z=2;z<spring-.01;z+=.18)
        masonry([face-.07,Math.min(a,b),z,face+depth,Math.max(a,b),Math.min(z+.176,spring)],brick(),'brick');
    }
    if(!through){
      masonry([face+depth-.035,y-radius,2,face+depth+.05,y+radius,crown-.02],'#40382d');
      for (const side of [-1,1]) {
        const edge = y + side*radius;
        masonry([face+.04,edge-.045,2,face+depth,edge+.045,spring+.025],'#625747');
      }
      for(let j=0;j<9;j++){
        const u=y-radius+.14+j*(w-.20)/9;
        masonry([face+depth-.09,u,2,face+depth,u+.06,spring-.15],'#5e4d38');
      }
    }
  }
  const bays=[-11.6,-8,-4.4,0,4.4,8,11.6];
  for(const y of bays)vault(y,y===0?2.85:2.60,y===0?3.72:3.62,y===0);
  for(let j=0;j<bays.length-1;j++){
    const a=bays[j]+(bays[j]===0?1.725:1.60);
    const b=bays[j+1]-(bays[j+1]===0?1.725:1.60);
    if(b<=a)continue;
    for(let z=2;z<crown-.03;z+=.18)masonry([face,a,z,face+2.2,b,Math.min(z+.176,crown)],brick(),'brick');
  }
  masonry([face,-14,2,face+2.3,-13.19,crown],'#887a66','plaster');
  masonry([face,13.19,2,face+2.3,14,crown],'#887a66','plaster');
  masonry([face-.22,-14.2,crown,face+2.35,14.2,crown+.18],'#8f816c');
  // 主轴大阶：37 段实体踏步（与 11-12 原版一致，踏面-踢面实体呈现）
  for(let i=0;i<37;i++){
    const x=-7.15+i*10.16/37,z=2+(i+1)*11/37;
    for(let j=0;j<5;j++){
      const y=-1.41+j*.564;
      masonry([x,y,2,x+10.16/37,y+.555,z],['#827663','#877b68','#827764'][(i+j*2)%3]);
    }
    for(const y of [-1.82,1.42])masonry([x,y,2,x+10.16/37,y+.40,z+.45],'#716654');
  }
}
function hill(x,y){
  const east=Math.max(0,x-37);
  const flank=Math.max(0,Math.abs(y)-31);
  const backslope=1/(1+Math.exp(-(x-39)/3.5));
  const shoulders=1/(1+Math.exp(-(Math.abs(y)-34)/3.2))*Math.max(0,Math.min(1,(x-1)/27));
  return -.7+10*backslope+6*shoulders+45*(1-Math.exp(-east/65))+
    25*(1-Math.exp(-flank/47))*Math.max(0,Math.min(1,(x+75)/79))+
    (Math.sin(x*.093+y*.04)*2.5+Math.cos(y*.12)*1.5)*Math.min(1,(east+flank)/30);
}
// 自由漫步用的地面高度表：三重台地 + 石阶斜面，寺院范围外接山体函数。
const H={one:.35,two:2,three:13,hall:13.85};
function ground(x,z){
  // 山门外前庭（detail.js）：门前月台 0.35，向西踏道下到谷口。
  // 注意：这个分支必须放在最前面，否则会被下一行的全局 hill 判断短路——
  // 之前人一出山门就"沉下去"，正是因为走了 hill 而不是月台高度。
  if(x<-52){
    if(x>=-57.6&&Math.abs(z)<=6.4)return H.one;                            // 门前月台
    if(x>=-61.6&&Math.abs(z)<=2.6)return H.one+(x+57.6)*(-1.05/4);         // 下山踏道
    return hill(x,-z);
  }
  if(x>27||Math.abs(z)>33)return hill(x,-z);
  if(x>=-51.55&&x<=-46.45&&Math.abs(z)<=1.5)return .71;                    // 山门门洞（基座顶）
  // 主轴大阶走廊（scene.json「主轴台阶」42 级台阶楔，x -7.74→3.0）。
  // 实测结论：手机/软渲染低帧率下单帧步长可达半米，台阶量化地面跨 2~3 级
  // 会累计出 >.95m 高差把人顶回；连续斜面跨几级都只按斜面算，完全免疫。
  // 斜面按 42 级楔的真实顶线（2.2619→13）铺，坡感连续、与台面无缝。
  // 台阶"颗粒感"是视觉的活：由 vaultedTerrace 的 37 段真踏步实体负责。
  if(x>=-7.74&&x<3&&Math.abs(z)<=2.2)return 2.2619+(x+7.74)*(10.7381/10.74);
  if(x>=13.1)return Math.abs(z)<=11.9?H.hall:H.three;
  if(x>=3)return H.three;
  // 二进院是一整块两米高的台体，进来就是平的；石阶铺在墙外（见下一段）
  if(x>=-18.4)return H.two;
  // 墙外那段石阶：从下院 .35 抬到券门台面 2.0，与 detail.js 的十一级踏步对齐。
  // 两端的斜面正好接上 H.one / H.two，不会在台阶顶出现断层。
  if(x>=-21.6&&Math.abs(z)<=2.4)return H.one+(x+21.6)/3.2*(H.two-H.one);
  return H.one;
}
// 是否站在殿内、殿内交互是否可用、是否站在蒲团旁
function inHall(){
  const p=camera.position;
  return roofLevel===null&&p.y<20&&p.x>13.35&&p.x<31&&Math.abs(p.z)<11.6;
}
function ritualReady(){ return roam? jumpTime===JUMP_TIME&&inHall() : (current===4&&!motion); }
function nearestCushion(){
  const list=(hall&&hall.cushions)||[praySpot];
  const p=camera.position;
  let best=list[0],bd=Infinity;
  for(const c of list){
    const d=Math.hypot(p.x-c.x,p.z-c.z);
    if(d<bd){bd=d;best=c;}
  }
  return {at:best,d:bd};
}
function nearCushion(){ return nearestCushion().d<1.5; }
const PRAY_CYCLE=3800;
function bowCurve(t){
  if(t<.15)return 0;
  if(t<.46)return Math.sin((t-.15)/.31*Math.PI/2);
  if(t<.66)return 1;
  if(t<.94)return Math.cos((t-.66)/.28*Math.PI/2);
  return 0;
}
function prayerText(text){ document.querySelector('#ritual-result').textContent=text; }
function startPray(){
  if(praying)return;
  if(progress.data.merit<2){ prayerText('每次礼拜需 2 功德。'); return; }
  const pick=nearestCushion();
  if(roam&&pick.d>=1.5){ prayerText('先走到香案前的蒲团上，再开始礼拜。'); return; }
  praySpot={x:pick.at.x,z:pick.at.z};
  /* 只在「非漫步」（固定佛堂站点）时计算朝向香案的偏转；
   * 漫步时朝向由用户自己掌握，不再被这里改写。
   * 之前无论哪种模式都会算这个 prayYaw，再在 roamTick 里把镜头拧过去。 */
  if(!roam) prayYaw=Math.atan2(-(ALTAR.x-praySpot.x),praySpot.z-ALTAR.z);
  praying=true;prayT0=performance.now();bows=0;prayDip=0;
  document.body.classList.add('praying');
  document.querySelector('#pray-prompt').hidden=true;
  sfx.unlock();sfx.shimmer();sfx.bowl();
  blessing.start();
  setTimeout(()=>{ try{ if(omens.chance(.34,100000)) sfx.blessBell(2); }catch(e){} },2600);
  const box=document.querySelector('#prayer');
  box.hidden=false;
  document.querySelector('#prayer-n').textContent='0';
  document.querySelector('#bow').textContent='起身';
  prayerText('合掌，俯身，再起身。按 E 或「起身」结束。');
}
function stopPray(){
  if(!praying)return;
  praying=false;prayDip=0;
  document.body.classList.remove('praying');
  document.querySelector('#prayer').hidden=true;
  blessing.stop();
  document.querySelector('#bow').textContent='礼拜';
  prayerText(bows?`已礼拜 ${bows} 次，起身归位。`:'已起身。');
}
function prayerTick(now){
  // 用时长的绝对进度推算拜数，帧率低时也不会重复计数
  const elapsed=Math.max(0,now-prayT0);
  const t=(elapsed%PRAY_CYCLE)/PRAY_CYCLE;
  const done=elapsed<.94*PRAY_CYCLE?0:Math.floor((elapsed-.94*PRAY_CYCLE)/PRAY_CYCLE)+1;
  if(done>bows){
    bows=done;
    if(progress.bow()) prayerText('礼拜完成 · 功德 −2 · 福气 +1 · '+progress.level()[1]);
    else { stopPray(); prayerText('功德不足。每次礼拜需 2 功德。'); return t; }
    document.querySelector('#prayer-n').textContent=bows;
    sfx.woodfish();
    sfx.blessBell(bows-1);
    blessing.pulse(bows);
  }
  return t;
}

function landscape(){
  const g=new T.PlaneGeometry(490,470,125,125);g.rotateX(-Math.PI/2);
  const p=g.attributes.position, uv=g.attributes.uv, cols=[], c=new T.Color(), openTone=new T.Color('#e1ded1');
  for(let i=0;i<p.count;i++){
    const x=p.getX(i)+38,y=-p.getZ(i),z=hill(x,y);
    p.setXYZ(i,x,z,-y);
    uv.setXY(i,x*.46,y*.46);
    const meadow=.5+.5*Math.sin(x*.17+y*.11)*Math.cos(y*.2-x*.067);
    // 叠一层细碎斑驳，做出坡面植被肌理（不只是平涂），频率更高、幅度轻
    const speck=.5+.5*Math.sin(x*.53-y*.41)*Math.cos(x*.31+y*.47);
    c.setHSL(.22+.10*meadow+.02*speck, .24+.20*meadow+.08*speck,
             .19+.13*meadow+.05*speck+.03*rand()+Math.min(z,80)*.00055);
    // 去白：原来 lerp 到浅灰白 .49 太多，正午强光下整片坡面发白；降到 .22
    // 保留基础暖灰调和远山空气感，颜色主体交给四季换色层（含新增 summer 绿化层）。
    c.lerp(openTone,.22);
    cols.push(c.r,c.g,c.b);
  }
  g.setAttribute('color',new T.Float32BufferAttribute(cols,3));g.computeVertexNormals();
  const terrain=new T.Mesh(g,weathered(new T.MeshStandardMaterial({vertexColors:true,roughness:1}),'forest'));terrain.receiveShadow=true;scene.add(terrain);
  function spray(root, angle, length, tilt){
    const along=new T.Vector3(Math.cos(angle),tilt,Math.sin(angle)).normalize();
    const right=new T.Vector3(Math.sin(angle),0,-Math.cos(angle));
    const basis=new T.Matrix4();
    const normal=right.clone().cross(along).normalize();
    basis.makeBasis(right,along,normal);
    put('pineSpray','#ffffff',root,new T.Vector3(length*.86,length,1),
      new T.Quaternion().setFromRotationMatrix(basis));
  }
  function pine(x,y,z,h,old=false){
    const lean=(rand()-.5)*h*.48, sway=(rand()-.5)*h*.31;
    const trunk=t=>V(x+lean*t*t+Math.sin(t*5)*h*.044,y+sway*t*t,z+h*t);
    for(let k=0;k<6;k++)rod(trunk(k*.147),trunk((k+1)*.147),h*(.049-k*.0064),'#514737','bark');
    const phase=rand()*6.28;
    const palette=['#2d4330','#42573a','#536244','#354c38','#66724d'];
    for(let k=0;k<8;k++){
      const angle=phase+k*2.399+rand()*.72,level=.39+k*.065;
      const spread=h*(.32-k*.021)*(.64+rand()*.58);
      const a=trunk(level), dx=Math.cos(angle),dz=Math.sin(angle);
      const elbow=a.clone().add(new T.Vector3(dx*spread*.63,h*.029,dz*spread*.63));
      const b=elbow.clone().add(new T.Vector3(dx*spread*.42,h*(.046+rand()*.035),dz*spread*.42));
      rod(a,elbow,h*(.022-k*.0017),'#584b37','bark');rod(elbow,b,h*.010,'#5d513c','bark');
      const clusters=old?11:6;                       // 四轮P1-2：古松碎片 17→11（-35%）
      for(let j=0;j<clusters;j++){
        const ang=rand()*6.28, rr=Math.sqrt(rand())*h*(old?.16:.13), ss=h*(.038+rand()*.039);
        const q=b.clone().add(new T.Vector3(Math.cos(ang)*rr,(rand()-.42)*h*.065,Math.sin(ang)*rr));
        if(old){
          const heading=angle+(j%2===0?1:-1)*(.34+(j%4)*.25);
          const branch=b.clone().lerp(elbow,.14+(j%5)*.16);
          const tip=branch.clone().lerp(q,.72);
          if(j%3===0)rod(branch,tip,h*.0036,'#5d513c','bark');
          // 碎片针叶只剩三分之一的枝端有；副喷（薄纸第二层）整体取消
          if(Q.low?j%6===0:j%3===0){
            spray(tip,heading,h*(.126+(j%3)*.020),.27+.48*Math.sin(j+k*1.7));
          }
          if(j%5===1||j%5===3)continue;
        }
        // 主叶簇加厚：y 半厚 .29→.40，不再水平纸片堆叠（顾问：0.12~0.25m 实体）
        put('canopy',palette[(k+j)%palette.length],q,new T.Vector3(ss*(old?1.04:1.55),
          ss*(old?.40:.59),ss*(old?.80:1.18)),new T.Quaternion().setFromAxisAngle(yAxis,ang));
      }
    }
  }
  // 古松定根一律走 ground(x,y)：手写高度里有几株其实站在台外的山坡上
  //（x>27 或 |z|>33 都落到山体），按台面常数 13 种就整棵悬在半空。
  [[8,-8.7,9.4],[8,9.7,10.1],[-42,-10,7.8],[-46.4,7.2,9.4],[-25,-12,6.5],[-17.2,7.2,6.3],[-13,12,7.1],[-13,-7,7.4],[30,25,6.5],[34,-29,7.3],[35,24,7.4]]
    .forEach(([x,y,h])=>pine(x,y,ground(x,y),h,true));
  for(let i=0;i<640;i++){
    const x=-100+rand()*250,y=-128+rand()*256;
    if(x>-59&&x<40&&Math.abs(y)<36)continue;
    if(x<-49&&Math.abs(y)<6)continue;
    if(rand()>.74+.22*Math.sin(x*.16+y*.084))continue;
    // 定根高一律走 ground(x,y)：范围外它内部换算 hill(x,-y)。
    // 以前直接 hill(x,y)，山体坐标与地面坐标的 y 互为相反数，
    // 北坡的树全被钉在南坡的地上——航拍里能看到飘着/插错坡的一片。
    pine(x,y,ground(x,y),2.7+rand()*6);
  }
  for(let i=0;i<1150;i++){
    const x=-90+rand()*160,y=-65+rand()*130;
    if(Math.abs(y)<4||x>0&&Math.abs(y)<22||x>-8.5&&x<3&&Math.abs(y)<14.3)continue;
    // 院内不再撒野灌木：院里的植被交给 garden.js 按花池、花台布置，
    // 石板上才不会平白长出一团团绿球。
    if(x>-52&&x<38&&Math.abs(y)<31)continue;
    const s=.10+rand()*.52;
    put('ball',i%5===0?'#8f9079':'#69734a',V(x,y,ground(x,y)),new T.Vector3(s*1.6,s*.68,s));
  }
  // Stone paving gives the visitor a continuous line through the lower court.
  for(let i=0;i<48;i++){
    const x=-52+i*.9,z=x<-18?.35:2;
    if(x>-18&&x<-16||x>-7.8)continue;
    for(let j=0;j<5;j++){
      const shift=(j%2)*.25, edge=(rand()-.5)*.08;
      masonry([x+shift,-2.4+j*.96+edge,z,x+.86+shift,-1.49+j*.96+edge,z+.035+rand()*.024],['#bcb29d','#aa9d88','#b4a58d','#978c76'][(i+j)%4],'paving');
    }
  }
  for(let i=0;i<13;i++)for(let j=0;j<9;j++)
    masonry([3.1+i*.53,-2.5+j*.56,13,3.6+i*.53,-1.98+j*.56,13.045],['#bcb29d','#aa9d88','#b4a58d'][(i+j)%3],'paving');
  for(let i=0;i<18;i++){
    const x=-18.4+i*.21;
    masonry([x,-2.35,.35,x+.23,2.35,Math.min(2,.35+(i+1)*.104)],'#a69c87','paving');
  }
  const stone=['#8e8270','#9a8a72','#a7967e','#96866e','#a29279'];
  for(let k=0;k<24;k++){
    const z=2+k*.454;
    for(let j=0;j<52;j++){
      const y=-34+j*1.3+(k%2)*.39;
      if(y<2.36&&y+1.26>-2.36||y+1.26>33)continue;
      const c=stone[Math.floor(rand()*stone.length)];
      const damp=k<3&&Math.sin(y*.71+k*1.63)+Math.cos(y*.34-k)>.22;
      masonry([2.89,y,z,3.015,y+1.26,z+.423],damp?'#77735b':c,damp?'damp':'stone');
    }
    for(let j=0;j<27;j++){
      const x=3+j*1.29+(k%2)*.31;
      for(const y of [-34.11,32.99])
        masonry([x,y,z,x+1.24,y+.12,z+.423],stone[Math.floor(rand()*stone.length)]);
    }
  }
  for(const [x,y,z] of [[9,-10,13],[10,11,13],[-42,-13,.35],[-44,12,.35],[-13,15,2]]){
    for(let j=0;j<34;j++){
      const angle=rand()*Math.PI*2,r=.5+rand()*2.5,s=.12+rand()*.28;
      put('ball',j%3?'#6b7850':'#858671',V(x+r*Math.cos(angle),y+r*Math.sin(angle),z),new T.Vector3(s*1.8,s*.55,s));
    }
  }
  for(let i=0;i<430;i++){
    const x=-50+rand()*60,y=(rand()<.5?-1:1)*(2.31+rand()*1.05);
    if(x>-8.4&&x<3.05)continue;
    const z=x<-18?.35:x<3?2:13;
    const h=.035+rand()*.17;
    rod(V(x,y,z),V(x+.06*(rand()-.4),y+.05*(rand()-.5),z+h),.010,'#6a7348');
  }
  for(let i=0;i<30;i++)for(let j=0;j<40;j++){
    const x=13.18+i*.59,y=-16.8+j*.84;
    masonry([x,y,13.79,x+.58,y+.827,13.818],['#8f8371','#9d907a','#a09480','#887d6b'][(i+j*3)%4],'paving');
  }

  /* ---------- 院中补绿：花池、绿篱与庭树 ---------- */
  const leaf=['#4e6b3d','#5d7a4a','#6b834f','#43593a','#7a8f5c'];
  const bloom=['#b98a86','#c9a08c','#d8c58f'];
  function bed(cx,cy,w,d,z){
    masonry([cx-w/2,cy-d/2,z,cx+w/2,cy+d/2,z+.17],'#8c8070');
    masonry([cx-w/2+.10,cy-d/2+.10,z+.15,cx+w/2-.10,cy+d/2-.10,z+.205],'#463522');
    const n=Math.max(7,Math.round(w*d*2.8));
    for(let i=0;i<n;i++){
      const px=cx+(rand()-.5)*(w-.32),py=cy+(rand()-.5)*(d-.32),s=.10+rand()*.17;
      put('ball',leaf[Math.floor(rand()*leaf.length)],V(px,py,z+.21),new T.Vector3(s*1.75,s*.66,s));
      if(rand()>.74)put('ball',bloom[Math.floor(rand()*bloom.length)],
        V(px+(rand()-.5)*.22,py+(rand()-.5)*.22,z+.31),new T.Vector3(s*.72,s*.48,s*.72));
    }
  }
  // 殿前花池：避开踏步与视廊（长条花带改由 garden.js 统一铺排）
  [[-44.0,-9.0,1.15,2.4,0.35],[-20.6,-5.8,1.4,1.4,0.35],[-20.6,5.8,1.4,1.4,0.35],
   [8.6,22.5,2.2,1.05,13],[15.4,22.5,2.2,1.05,13],
   [8.6,-21.6,2.2,1.05,13],[15.4,-21.6,2.2,1.05,13]].forEach(a=>bed(...a));
  // 挡土墙顶与围墙根上的绿篱
  for(const [xe,ze] of [[-18.18,2.02],[3.22,13.02]]){
    for(let y=-28;y<=28;y+=1.45){
      if(Math.abs(y)<3.0)continue;
      if(rand()>.78)continue;
      const s=.19+rand()*.30;
      put('ball',rand()>.6?'#4e6b3d':'#657a4b',V(xe+(rand()-.5)*.46,y,ze),
        new T.Vector3(s*2.05,s*.60,s));
    }
  }
  for(const [yw,zw] of [[-29.2,.35],[29.2,.35],[-29.2,2],[29.2,2]]){
    for(let x=-51;x<2;x+=1.6){
      if(rand()>.66)continue;
      const s=.16+rand()*.26;
      put('ball',rand()>.5?'#546b41':'#6d7f52',V(x,yw+(rand()-.5)*.7,zw),new T.Vector3(s*2.0,s*.58,s));
    }
  }
  // 庭树：补在院落转角与空地，不挡主要视廊
  [[-39.4,-15.4,.35,7.2],[-35.4,-7.0,.35,5.0],[-39.0,-9.4,.35,5.6],[-22.4,-9.6,.35,5.0],
   [-19.6,8.8,.35,6.4],[-16.9,-8.8,2,5.8],[-9.0,17.6,2,6.0],[-3.2,17.6,2,5.4],
   [-14.2,-8.7,2,4.9],[4.6,-14.2,13,5.6],[4.6,15.2,13,5.4],
   [8.4,-21.0,13,5.2],[16.6,-20.7,13,4.6],[8.0,21.6,13,5.8],[17.2,21.4,13,4.8]
  ].forEach(a=>pine(...a,true));
}
function flush(){
  const makeCanopy=(detail)=>{
    const canopy=new T.IcosahedronGeometry(1,detail);
    const pos=canopy.attributes.position, smooth=canopy.attributes.normal.clone();
    const foliage=[];
    for(let i=0;i<pos.count;i++){
      const x=pos.getX(i),y=pos.getY(i),z=pos.getZ(i);
      const d=1+.19*Math.sin(13*x+7*z)*Math.cos(12*y-4*z);
      pos.setXYZ(i,x*d,y*d,z*d);
      const tint=.72+.21*Math.sin(37*x+14*y)*Math.sin(27*z+6*y);
      foliage.push(tint,tint,tint*.93);
    }
    canopy.computeVertexNormals();
    const normal=canopy.attributes.normal, n=new T.Vector3(), radial=new T.Vector3();
    for(let i=0;i<normal.count;i++){
      n.fromBufferAttribute(normal,i).lerp(radial.fromBufferAttribute(smooth,i),.72).normalize();
      normal.setXYZ(i,n.x,n.y,n.z);
    }
    canopy.setAttribute('color',new T.Float32BufferAttribute(foliage,3));
    return canopy;
  };
  // 千棵树的树冠是三角形的最大头：大堆（上千实例）换低模，近景的树照旧用高模
  const canopyLo=makeCanopy(0);
  const geo={cube:cube(),cyl:cyl(),ball:ball(),canopy:makeCanopy(Q.leafDetail||0),canopyLo,
             pineSpray:new T.PlaneGeometry(1,1).translate(0,.47,0)};
  for(const {type,color,finish,items} of piles.values()){
    const key=type+color+finish;
    if(!mats.has(key)){
      const m=type==='pineSpray'
        ? new T.MeshStandardMaterial({color,side:T.DoubleSide,alphaTest:.44,roughness:1,
          emissive:'#d4dfc5',emissiveIntensity:.48})
        : mat(color);
      if(type==='canopy')m.vertexColors=true;
      if(type==='cube'||type==='cyl'){
        const wood=finish==='wood'||finish==='bark';
        m.map=surface(wood?'wood':'stone');
        // 顾问三轮P0-3：降底色高频——bump 减半（木纹.022→.010、石.037→.017）
        m.bumpMap=m.map;m.bumpScale=wood?.010:.017;
      }
      if(type==='canopy')weathered(m,'needles');
      else if(finish)weathered(m,finish,type==='cube');
      mats.set(key,m);
    }
    const g=(type==='canopy'&&items.length>1200)?geo.canopyLo:geo[type];
    const m=new T.InstancedMesh(g,mats.get(key),items.length);
    // 诊断：红色哨兵批禁止被 wonder.clearance 等实例级改写器认领
    m.userData.plantInstances=items.length>0&&color==='#ff2222'?false:(type==='canopy'||type==='pineSpray'||(type==='cyl'&&['#514737','#584b37','#5d513c'].includes(color)));
    items.forEach((a,i)=>m.setMatrixAt(i,a));
    m.castShadow=type!=='ball'&&type!=='canopy'&&type!=='pineSpray';
    if(type==='pineSpray'){
      m.name='Pine branch cutouts';
      m.visible=false;
      loadPineSprays(m);
    }
    m.receiveShadow=true;scene.add(m);
  }
}
function stop(i,duration=1250){
  if(praying)stopPray();
  if(roam)setRoam(false);
  const climb=playing&&current===2&&i===3;
  const entering=i===4;
  if(entering&&current!==3&&current!==4){
    camera.position.set(...stops[3].eye);target.set(...stops[3].at);
  }
  current=i;
  document.querySelector('h2').textContent=stops[i].title;
  document.querySelector('#desc').textContent=stops[i].desc;
  document.querySelector('.kicker b').textContent='0'+(i+1)+' / 05';
  setPhotoHall(false);
  const touch=matchMedia('(pointer:coarse)').matches;
  document.querySelector('#hint').textContent=entering
    ?(touch?'用左下摇杆缓步 · 拖动环顾':'WASD / 方向键缓步 · 拖动环顾')
    :(touch?'单指拖动旋转 · 双指缩放':'拖动旋转 · 滚轮缩放 · 右键平移');
  document.querySelectorAll('[data-stop]').forEach((b,j)=>{b.classList.toggle('active',i===j);b.setAttribute('aria-current',i===j?'step':'false');});
  const from=camera.position.clone(),to=new T.Vector3(...stops[i].eye);
  let route=climb?[from,new T.Vector3(-9,3.66,0),new T.Vector3(-7.12,3.68,0),new T.Vector3(-5.7,5.32,0),new T.Vector3(3,14.76,0),to]:null;
  if(entering)route=[from,new T.Vector3(9.1,15.1,0),new T.Vector3(12.6,15.38,0),to];
  // 开场从鸟瞰下到山门：直线会一头扎进西坡的松林（镜头贴着树冠、画面全绿）。
  // 换成一条先在高空横移、最后才缓缓落下的弧线，全程走在树顶之上。
  let curve=null;
  if(!route&&i===1&&from.y>25&&from.distanceTo(to)>5){
    // 最后一段走券门前那条没有树冠的「竖井」下来，降到屋檐高度再横移到落脚点，
    // 免得镜头从松枝里穿过去。落脚点正是自由漫步的默认起点，切换时不跳位。
    curve=new T.CatmullRomCurve3([
      from,
      new T.Vector3(-74,84,74),
      new T.Vector3(-58,72,26),
      new T.Vector3(-47,40,-4),
      new T.Vector3(-42,12,-4),
      new T.Vector3(-42,4,-3.5),
      new T.Vector3(-42,2.6,-1),
      to.clone()
    ],false,'centripetal');
  }
  motion={start:performance.now(),duration:curve?2700:(climb?6900:entering?3200:duration),from,focus:target.clone(),to,at:new T.Vector3(...stops[i].at),route,curve};
}
const walk=document.querySelector('#walk');
function cancel(){playing=false;walk.textContent='▶　沿山径游览';}
function guided(){
  if(playing){cancel();motion=null;return;}
  playing=true;walk.textContent='Ⅱ　暂停游览';
  // 开场别一按就俯冲：先在鸟瞰高度慢慢推近整座寺，看清台地层次，再沿山径落下去
  if(current===0&&!motion&&camera.position.y>40){
    motion={
      start:performance.now(),duration:1700,
      from:camera.position.clone(),focus:target.clone(),
      to:new T.Vector3(-80,84,98),at:target.clone(),
      route:null,curve:null,onDone:()=>stop(1)
    };
  }else stop(1,1500);
}
function setRoam(on){
  on=!!on;
  if(on===roam)return;
  if(praying)stopPray();
  roam=on;
  roofLevel=null;
  endRoofSit?.(); endRoofSit=null;
  const sitButton=document.querySelector("#roof-sit");
  sitButton.hidden=true; sitButton.textContent="屋顶坐禅";
  jumpTime=JUMP_TIME;
  jumpHeight=0;
  ritualShown=null;
  const btn=document.querySelector('#roam');
  btn.setAttribute('aria-pressed',String(on));
  document.querySelector('#roam-pad').hidden=!on;
  document.querySelector('#roam-hint').hidden=!on;
  document.body.classList.toggle('roaming',on);
  if(mine)mine.visible=third&&on;
  if(!on&&locked)document.exitPointerLock?.();
  cancel();
  playing=false;
  if(on){
    held.clear();
    // 自由漫步默认第一人称（拖画面/点画面=转头），想看小人随时点右上角按钮切换。
    if(third) setThird(false);
    // 只有「从高空/站到场外」才重新落脚（默认落到下院院子中央，不再落山门洞里）；
    // 已经站在院子里时原地进漫游，不把人传送走。
    const px=camera.position.x,pz=camera.position.z;
    const high=camera.position.y-ground(px,pz)>6;
    const outside=px<-50||px>20||Math.abs(pz)>28;
    if(high||outside){
      camera.position.set(-30,ground(-30,0)+ROAM.eye,0);
      yaw=-Math.PI/2;pitch=-.04;yawT=yaw;pitchT=pitch;
      target.set(-12,ground(-30,0)+1.4,0);
    }else{
      camera.position.y=ground(px,pz)+ROAM.eye;
      const look=target.clone().sub(camera.position);
      if(look.lengthSq()<.0001)look.set(1,0,0);
      look.normalize();
      yaw=Math.atan2(-look.x,-look.z);
      pitch=T.MathUtils.clamp(Math.asin(T.MathUtils.clamp(look.y,-.99,.99)),-.85,.7);
      yawT=yaw;pitchT=pitch;
    }
    motion=null;
    document.querySelector('#hint').textContent='自由漫步 · 拖动环顾 · 点画面用鼠标视角';
    sfx.woodtap();
  }else{
    held.clear();
    camera.position.y=ground(camera.position.x,camera.position.z)+ROAM.eye;
    const fwd=new T.Vector3(-Math.sin(yaw),0,-Math.cos(yaw));
    target.copy(camera.position).add(fwd.multiplyScalar(9));
  }
}
// 第三人称：镜头退到身后，人留在原地走。位置与判定仍以 camera.position 为准，
// 所以门槛、台阶、蒲团这些判定一个字都不用改。
function thirdCam(){
  const p=camera.position;
  // 竖屏水平视野窄，距离不加会把小人顶到半屏；按宽高比放开
  const want=5.9*(camera.aspect<.85?(camera.aspect<.6?1.62:1.35):1);
  // 每 90ms 探一次，别每帧都打射线
  const now=performance.now();
  if(now-camProbeAt>90){
    camProbeAt=now;
    let target=want;
    if(camBoxes.length){
      const cy=p.y+1.20, sx=Math.sin(yaw), sz=Math.cos(yaw);
      // 一、从远到近找一个不在实体里的位置：相机不会停进墙里
      let free=1.3;
      for(let d=want;d>=1.3;d-=.45){
        const cx=p.x+sx*d, cz=p.z+sz*d;
        let blocked=false;
        for(let i=0;i<camBoxes.length;i++){
          const b=camBoxes[i];
          if(cx>b.min.x&&cx<b.max.x&&cy>b.min.y&&cy<b.max.y&&cz>b.min.z&&cz<b.max.z){blocked=true;break;}
        }
        if(!blocked){free=d;break;}
      }
      target=free;
      // 二、位置空着也可能被门板、栏杆挡在中间：从人身上朝镜头打一条射线
      const origin=new T.Vector3(p.x,p.y+.95,p.z);
      const dir=new T.Vector3(sx,0,sz);
      camRay.set(origin,dir);
      camRay.far=want+.5;
      for(let i=0;i<camBoxes.length;i++){
        const hit=camRay.intersectBox(camBoxes[i],camHitPoint);
        if(!hit)continue;
        const d=hit.distanceTo(origin);
        if(d>.6&&d-.45<target)target=Math.max(1.3,d-.45);
      }
    }
    camDist+=(target-camDist)*(target<camDist?.62:.4);
  }
  const cx=p.x+Math.sin(yaw)*camDist, cz=p.z+Math.cos(yaw)*camDist;
  camera.position.set(cx,p.y+1.20,cz);
  const floor=ground(camera.position.x,camera.position.z)+1.15;
  // 主轴大阶上的特殊约束：第三人称相机永远不许低于【脚下】人的高度
  // （坡上回头望时，坡后是填方实体，按相机位置的 ground 托底会把相机
  // 按进砖里 → 满屏砖纹糊脸）。其余场景照旧用相机位地面托底。
  const onStair=p.x>-8.4&&p.x<3&&Math.abs(p.z)<=2.2;
  const yFloor=onStair?Math.max(floor,p.y):floor;
  if(camera.position.y<yFloor)camera.position.y=yFloor;
  camera.rotation.set(pitch*.62-.115,yaw,0,'YXZ');
}
// 自己的小人：跟住镜头，按水平位移速度播行走动画
let stepX=0,stepZ=0,stepT=0;
function syncMine(){
  if(!mine)return;
  mine.visible=third&&roam;
  if(!mine.visible){stepT=0;return;}
  const x=camera.position.x,z=camera.position.z;
  const now=performance.now();
  let sp=0;
  if(stepT){const t=(now-stepT)/1000;if(t>0&&t<.4)sp=Math.hypot(x-stepX,z-stepZ)/t;}
  stepX=x;stepZ=z;stepT=now;
  mine.position.set(x,walkingY(x,z)+jumpHeight+.005,z);
  mine.rotation.y=yaw;
  if(mine.userData.tick)mine.userData.tick(now,jumpHeight>0?0:sp);
}
function setThird(on){
  on=!!on;
  if(on===third){return;}
  third=on;
  const btn=document.querySelector('#person');
  if(btn){
    btn.setAttribute('aria-pressed',String(on));
    btn.textContent=on?'第一人称':'第三人称';
  }
  document.body.classList.toggle('third',on);
  // 想看自己，就得先站到地上
  if(on&&!roam)setRoam(true);
  if(mine)mine.visible=on&&roam;
  // 切进第三人称，小人的影子要重画一次
  if(renderer)renderer.shadowMap.needsUpdate=true;
}
function stepTo(dx,dz){
  const x=camera.position.x,z=camera.position.z;
  const nx=T.MathUtils.clamp(x+dx,-62.5,roofLevel!==null||jumpTime<JUMP_TIME?34:20.2);
  const nz=T.MathUtils.clamp(z+dz,-30,30);
  if(roofLevel!==null || (jumpTime<JUMP_TIME && camera.position.y-ROAM.eye>ground(nx,nz)+2)){
    const feet=camera.position.y-ROAM.eye;
    const roof=roofAt(nx,nz,feet+.65);
    if(roofLevel!==null && roof===null) return;
    if(roofLevel!==null) roofLevel=roof;
    camera.position.x=nx; camera.position.z=nz;
    return;
  }
  // 殿内：侧墙与后墙不能穿，只能走明间门洞进出
  if(nx>13.4&&nx<30.7){
    if((Math.abs(z)<=16.4)!==(Math.abs(nz)<=16.4))return;
    if(nx>30.0&&x<=30.0)return;
  }
  // 山门门体：两扇门常闭，整段都是墙，人不出寺
  if((x>-51.15)!==(nx>-51.15)||(x>-46.85)!==(nx>-46.85))return;
  // 门外前庭两侧的八字墙外就是山坡，别让人走出月台悬在半空
  if(x>-52&&nx<=-52&&Math.abs(nz)>6.0)return;
  if(x<=-52&&nx>-52&&Math.abs(z)>6.0)return;
  // 香案与佛坛：走到案前就停
  if(z<19.3&&nx>19.3&&Math.abs(nz)<2.75)return;
  const g0=ground(x,z),g1=ground(nx,nz);
  // 门槛随单步位移放宽：低帧率（手机/软渲染）掉帧时单步可达半米，跨过 2~3 级
  // 大阶踢面会累计出 >.95 高差被顶回。按每米位移 +1.15 放余量（大阶真实坡率
  // ≈1.02，全速跑 6.6m/s × .2s 掉帧也只 1.36 < .95+1.15×.66），台地立面（瞬时
  // 高差 ≥1.65/0.3m）依然挡住。
  const stride=Math.hypot(dx,dz);
  if(g1-g0>.95+1.15*Math.min(stride,.7))return;   // 台地立面、佛坛这类高差走不上去
  if(g0-g1>1.4)return;                     // 台地边缘不掉下去
  // Keep the first-person eye and its near plane outside solid walls.
  const inWall=(px,pz,feet)=>walkingWalls.some(b=>
    px>b.x-.24&&px<b.X+.24&&-pz>b.y-.24&&-pz<b.Y+.24&&feet+.25<b.Z&&feet+1.55>b.z);
  if(inWall(nx,nz,g1)&&!inWall(x,z,g0))return;
  if(nx>-8.4&&nx<3&&Math.abs(nz)<14.2&&Math.abs(nz)>1.17&&
     (x<=-8.4||Math.abs(z)<=1.17))return;
  camera.position.x=nx;camera.position.z=nz;
}
function roamTick(now,dt){
  if(praying){
    /* 礼拜时不再把镜头拽到蒲团、再拧向香案。
     * 原来这里会把机位缓动到 praySpot、yaw 缓动到 prayYaw，
     * 于是每点一次互动，视角就被夺走一次，用户刚调好的角度全没了。
     * 现在只做「原地俯身」：机位与朝向完全交还给用户，
     * 高度按弯腰幅度轻微下沉（-0.34m × 弯度），仅此而已。
     * 想转头、想走动都照常，不受限制。 */
    const ease=Math.min(1,dt*17);
    yaw+=(yawT-yaw)*ease;
    pitch+=(pitchT-pitch)*ease;
    const speed=(held.has('run')?ROAM.run:ROAM.speed)*dt;
    let f=window.__touchWalk?1:0,s=0;
    if(held.has('forward'))f+=1;
    if(held.has('back'))f-=1;
    if(held.has('left'))s-=1;
    if(held.has('right'))s+=1;
    if(f||s){
      const l=Math.hypot(f,s);f/=l;s/=l;
      const sin=Math.sin(yaw),cos=Math.cos(yaw);
      stepTo((-sin*f+cos*s)*speed,(-cos*f-sin*s)*speed);
    }
    const gy=ground(camera.position.x,camera.position.z)+ROAM.eye;
    // 弯腰时只把视点压低一点，站位与朝向都不动
    camera.position.y+=(gy-prayDip*.34-camera.position.y)*Math.min(1,dt*10);
    camera.rotation.set(pitch,yaw,0,'YXZ');
    return;
  }
  // 视角追目标角度：鼠标一动就看到，收势时有一点缓，像真的转头
  const ease=Math.min(1,dt*17);
  yaw+=(yawT-yaw)*ease;
  pitch+=(pitchT-pitch)*ease;
  const speed=(held.has('run')?ROAM.run:ROAM.speed)*dt;
  // 手机端「推镜头即走路」：mobile-ux.js 置位后持续前进，抬手即停。
  // 走的是同一个 stepTo，门槛、墙、台地限制全部照旧生效。
  let f=window.__touchWalk?1:0,s=0;
  if(held.has('forward'))f+=1;
  if(held.has('back'))f-=1;
  if(held.has('left'))s-=1;
  if(held.has('right'))s+=1;
  if((f||s)&&!endRoofSit){
    const l=Math.hypot(f,s);f/=l;s/=l;
    const sin=Math.sin(yaw),cos=Math.cos(yaw);
    stepTo((-sin*f+cos*s)*speed,(-cos*f-sin*s)*speed);
  }
  const {x,z}=camera.position;
  const wasJumping=jumpTime<JUMP_TIME;
  const previousFeet=camera.position.y-ROAM.eye;
  jumpTime=Math.min(JUMP_TIME,jumpTime+dt);
  const fraction=jumpTime/JUMP_TIME;
  const peak=progress.level()[2];
  const underVault=x>=-8.2&&x<=-6.95&&Math.abs(z)<1.43&&jumpOrigin<5;
  const groundY=ground(x,z);
  if(wasJumping){
    const next=Math.max(groundY,jumpOrigin+Math.min(underVault?.55:peak,4*peak*fraction*(1-fraction)));
    if(fraction>.5){
      const hit=roofAt(x,z,previousFeet+.03);
      if(hit!==null && hit>=next && hit>groundY+1){
        roofLevel=hit;
        jumpTime=JUMP_TIME;
      }
    }
    camera.position.y=(roofLevel??next)+ROAM.eye;
  }else{
    const eye=walkingY(x,z)+(endRoofSit ? .72:ROAM.eye);
    camera.position.y+=(eye-camera.position.y)*Math.min(1,dt*10);
  }
  jumpHeight=wasJumping&&roofLevel===null?Math.max(0,camera.position.y-ROAM.eye-groundY):0;
  document.querySelector('#roof-sit').hidden=roofLevel===null;
  camera.rotation.set(pitch,yaw,0,'YXZ');
}
function moveInHall(key){
  if(roam||praying||current!==4||motion||!document.querySelector('#altar-photo').hidden||document.querySelector('dialog[open]'))return;
  const [x,z]={forward:[.32,0],back:[-.32,0],left:[0,-.32],right:[0,.32]}[key];
  const nx=T.MathUtils.clamp(camera.position.x+x,13.65,18.1);
  const nz=T.MathUtils.clamp(camera.position.z+z,-3.3,3.3);
  target.x+=nx-camera.position.x;target.z+=nz-camera.position.z;
  camera.position.x=nx;camera.position.z=nz;
}
function syncPrompt(){
  const on=roam&&!praying&&ritualReady()&&nearCushion();
  if(on===promptShown)return;
  promptShown=on;
  const p=document.querySelector('#pray-prompt');
  if(on&&touchDevice)p.textContent='已到蒲团前 · 点一下画面开始礼拜';
  p.hidden=!on;
}
function syncRitual(){
  const on=ritualReady();
  if(on===ritualShown)return;
  ritualShown=on;
  const element=document.querySelector('#ritual');
  element.hidden=!on;
  element.classList.toggle('walkin',on&&roam);
  if(on){
    if(roam){
      sfx.unlock();sfx.chime();
      prayerText('你已走进殿内。上香、礼拜、抽签、捐香火都在这里，香案前铺了一排蒲团，走近任一只即可跪拜。');
    }else{
      prayerText(matchMedia('(pointer:coarse)').matches?'点下方方向键缓步移动，靠近蒲团即可礼拜。':'殿内可用 WASD 或方向键缓步移动。');
    }
    // 第一次进殿：钟楼一杵，随后来一种瑞兆
    if(!omenHall){
      omenHall=true;
      sfx.templeBell(1);
      setTimeout(()=>{ try{ omens.roll('hall'); }catch(e){ console.warn(e); } },1500);
    }
  }else if(praying)stopPray();
}
function setPhotoHall(active){
  document.querySelector('#altar-photo').hidden=!active;
  const toggle=document.querySelector('#photo-hall-toggle');
  toggle.textContent=active?'返回三维佛堂':'切换佛堂实景';
  toggle.setAttribute('aria-pressed',String(active));
  document.querySelector('.steps').hidden=active;
  if(current===4)document.querySelector('#hint').textContent=active?'佛堂实景 · 现场摄影':'WASD / 方向键缓步 · 拖动环顾';
}
const FORTUNES=[
  ['第一签 · 松风','松风入耳，万事缓行。今天留一段时间给自己。'],
  ['第二签 · 山径','石阶不必一气走完。停一停，再走下一步。'],
  ['第三签 · 檐雨','瓦上旧雨，阶前新绿。愿你记得眼下正在生长的事。'],
  ['第四签 · 晨光','日光慢慢越过山脊。把该做的一件小事做好。'],
  ['第五签 · 归林','行至树深处，自有清凉。愿你此行自在。']
];
let lastFortune=-1;
// 抽签：先是摇筒，再落签，最后出字。直播里观众发「求签」也走这一支。
function startDraw(){
  if(drawing)return;
  const drawEl=document.querySelector('#draw');
  drawing=true;
  let i=Math.floor(Math.random()*FORTUNES.length);
  if(i===lastFortune)i=(i+1)%FORTUNES.length;
  lastFortune=i;
  const [title,verse]=FORTUNES[i];
  const [no,name]=title.split(' · ');
  hall.shakeTube(performance.now());
  sfx.clatter(7);
  document.querySelector('#slip-no').textContent=no;
  document.querySelector('#slip-name').textContent=name;
  document.querySelector('#draw-title').textContent=title;
  document.querySelector('#draw-text').textContent=verse;
  document.querySelector('.draw-verse').hidden=true;
  document.querySelector('#draw-close').hidden=true;
  document.querySelector('#draw-caption').textContent='摇签筒';
  drawEl.className='';
  drawEl.hidden=false;
  requestAnimationFrame(()=>drawEl.classList.add('is-shaking'));
  setTimeout(()=>{
    drawEl.classList.remove('is-shaking');
    drawEl.classList.add('is-rising');
    document.querySelector('#draw-caption').textContent='签落';
    sfx.clatter(2);
  },1180);
  setTimeout(()=>{
    drawEl.classList.add('is-open');
    document.querySelector('#draw-caption').textContent='签出';
    sfx.chime();
  },2050);
  setTimeout(()=>{
    document.querySelector('.draw-verse').hidden=false;
    document.querySelector('#draw-close').hidden=false;
    document.querySelector('#ritual-result').textContent=title+'｜'+verse;
    // 直播里没人点「收签」，让它自己收
    if(LIVE)setTimeout(()=>{drawEl.hidden=true;drawEl.className='';drawing=false;},7000);
  },2500);
}
function rituals(){
  const roofSit=document.querySelector('#roof-sit');
  roofSit.onclick=()=>{
    if(endRoofSit){ endRoofSit(); endRoofSit=null; roofSit.textContent='屋顶坐禅'; return; }
    if(roofLevel===null)return;
    roofSit.textContent='静坐中 · 起身';
    endRoofSit=meditation('roof',amount=>{
      roofSit.textContent=amount?'静坐圆满 · 功德 +6 · 起身':'静坐圆满 · 起身';
    });
  };
  const result=document.querySelector('#ritual-result');
  const dialog=document.querySelector('#donation');
  const photo=document.querySelector('#altar-photo');
  document.querySelector('#photo-hall-toggle').onclick=()=>{
    if(!motion)setPhotoHall(photo.hidden);
  };
  const actions={
    incense(){
      if(progress.data.incense<=0){ result.textContent='香用完了，可到小卖部用功德请香。'; return; }
      progress.data.incense--;
      progress.add(2);
      sfx.ignite();
      const info=hall.lightIncense(performance.now());
      photo.classList.add('incense-lit');
      result.textContent=info.maxed
        ? '香炉已满 · 三炷香点到了最长，香烟在檐下慢慢散开。'
        : '点香完成 · 功德 +2';
    },
    bow(){
      if(!photo.hidden)photo.querySelector('img').animate([
        {transform:'scale(1)'},{transform:'scale(1.06) translateY(-2%)',offset:.5},{transform:'scale(1)'}
      ],{duration:2800,easing:'ease-in-out'});
      if(praying)stopPray();else startPray();
    },
    fortune(){startDraw();},
    donate(){dialog.returnValue='cancel';dialog.showModal();}
  };
  const drawEl=document.querySelector('#draw');
  document.querySelector('#draw-close').onclick=()=>{
    drawEl.hidden=true;drawEl.className='';drawing=false;
  };
  document.querySelectorAll('[data-action]').forEach(b=>b.onclick=()=>{
    sfx.unlock();
    if(ritualReady())actions[b.dataset.action]();
    else result.textContent=roam?'先走进殿内，再上香礼拜。':'请等镜头走过门槛。';
  });
  // 殿内按 E 起身／礼拜，Esc 也起身
  addEventListener('keydown',e=>{
    const k=e.key.toLowerCase();
    if(k==='escape'&&praying){e.preventDefault();stopPray();return;}
    if(e.defaultPrevented||k!=='e'||e.target?.closest?.('input,textarea,button,[contenteditable]')||window.__wonder?.dialogOpen)return;
    if(!ritualReady()||document.querySelector('dialog[open]'))return;
    e.preventDefault();
    praying?stopPray():startPray();
  });
  dialog.addEventListener('close',()=>{
    const n=Number(dialog.returnValue);
    if(![1,5,10].includes(n))return;
    if(n>balance){result.textContent='剩余香火券不足，请选择较小额度。';return;}
    balance-=n;document.querySelector('#purse').textContent='香火券 '+balance;
    progress.add(n);
    hall.dropCoin(performance.now());
    setTimeout(()=>sfx.coin(),470);
    result.textContent=`铜钱落进功德箱，功德 +${n}，箱底闷闷回响了一声。`;
  });
  const keys={w:'forward',a:'left',s:'back',d:'right',arrowup:'forward',arrowdown:'back',arrowleft:'left',arrowright:'right'};
  addEventListener('keydown',e=>{
    const direction=keys[e.key.toLowerCase()];
    if(!direction||roam||current!==4||document.querySelector('dialog[open]'))return;
    if(e.target.closest?.('button,input,textarea,select')&&!e.key.toLowerCase().startsWith('arrow'))return;
    e.preventDefault();moveInHall(direction);
  });
  document.querySelectorAll('[data-step]').forEach(b=>b.onclick=()=>moveInHall(b.dataset.step));
}
function controls(){
  const c=renderer.domElement,pointers=new Map();
  const orbit=new T.Spherical();
  c.oncontextmenu=e=>e.preventDefault();
  c.onpointerdown=e=>{if(roam){pointers.set(e.pointerId,[e.clientX,e.clientY]);c.setPointerCapture(e.pointerId);return;}if(current===4&&motion)return;cancel();motion=null;pointers.set(e.pointerId,[e.clientX,e.clientY]);c.setPointerCapture(e.pointerId);};
  c.onpointermove=e=>{
    const old=pointers.get(e.pointerId);
    if(!old)return;
    const dx=e.clientX-old[0],dy=e.clientY-old[1];
    const offset=camera.position.clone().sub(target);
    if(roam){
      yawT-=dx*.0038;
      pitchT=T.MathUtils.clamp(pitchT-dy*.0034,-1.15,1.05);
      pointers.set(e.pointerId,[e.clientX,e.clientY]);
      return;
    }
    if(current===4){
      const look=target.clone().sub(camera.position);
      orbit.setFromVector3(look);orbit.theta-=dx*.004;orbit.phi=T.MathUtils.clamp(orbit.phi+dy*.004,.48,2.3);
      target.copy(camera.position).add(look.setFromSpherical(orbit));
    }else if(pointers.size===2){
      const other=[...pointers].find(([id])=>id!==e.pointerId)[1];
      const a=Math.hypot(old[0]-other[0],old[1]-other[1]),b=Math.hypot(e.clientX-other[0],e.clientY-other[1]);
      if(a>1&&b>1)zoom(a/b);
    }else if(e.buttons===2||e.shiftKey){
      const q=new T.Vector3(-dx,dy,0).applyQuaternion(camera.quaternion).multiplyScalar(offset.length()*.0014);
      target.add(q);camera.position.add(q);
    }else{
      orbit.setFromVector3(offset);orbit.theta-=dx*.006;orbit.phi=T.MathUtils.clamp(orbit.phi-dy*.006,.12,1.67);
      camera.position.copy(target).add(offset.setFromSpherical(orbit));
    }
    pointers.set(e.pointerId,[e.clientX,e.clientY]);
  };
  let tapAt=0,tapX=0,tapY=0;
  // 鼠标即视角：漫步时点一下画面，指针交给场景，之后移动鼠标就转向（Esc 交还给鼠标）
  c.addEventListener('pointerdown',e=>{
    if(!roam||locked||e.pointerType!=='mouse')return;
    try{ c.requestPointerLock?.(); }catch(err){ /* 不支持就退回拖动 */ }
  });
  document.addEventListener('pointerlockchange',()=>{
    locked=document.pointerLockElement===c;
    document.body.classList.toggle('locked',locked);
    if(locked&&!roam)document.exitPointerLock?.();
    if(locked)document.querySelector('#hint').textContent='移动鼠标环顾 · Esc 交还鼠标';
    else if(roam)document.querySelector('#hint').textContent='自由漫步 · 拖动环顾 · 点画面用鼠标视角';
  });
  document.addEventListener('mousemove',e=>{
    if(locked&&roam){
      yawT-=e.movementX*.0026;
      pitchT=T.MathUtils.clamp(pitchT-e.movementY*.0024,-1.15,1.05);
      return;
    }
    // 非漫步时，视角随光标轻轻偏一点，像人站在那儿微微侧头
    mouseNX=T.MathUtils.clamp(e.clientX/innerWidth*2-1,-1,1);
    mouseNY=T.MathUtils.clamp(e.clientY/innerHeight*2-1,-1,1);
  });
  // 注意：这里必须用 addEventListener 并保留既有处理器。写成 c.onpointerdown=…
  // 会把上面转头逻辑的 onpointerdown 整行覆盖掉——触屏"拖画面转头"正是那样失效的。
  c.addEventListener('pointerdown',e=>{tapAt=performance.now();tapX=e.clientX;tapY=e.clientY;});
  c.addEventListener('pointerup',e=>{
    const tap=performance.now()-tapAt<420&&Math.hypot(e.clientX-tapX,e.clientY-tapY)<7;
    if(tap&&roam&&!locked&&ritualReady()&&(nearCushion()||praying))praying?stopPray():startPray();
    pointers.delete(e.pointerId);
  });
  c.addEventListener('pointercancel',e=>pointers.delete(e.pointerId));
  c.addEventListener('lostpointercapture',e=>pointers.delete(e.pointerId));
  function zoom(f){const d=camera.position.clone().sub(target);camera.position.copy(target).add(d.setLength(T.MathUtils.clamp(d.length()*f,3,220)));}
  c.addEventListener('wheel',e=>{e.preventDefault();if(roam||current===4)return;cancel();motion=null;zoom(Math.exp(e.deltaY*.001));},{passive:false});
  walk.onclick=()=>{ autoPlayHeld=false; guided(); };
  document.querySelector('#reset').onclick=()=>{ autoPlayHeld=false; cancel();stop(0); };
  document.querySelectorAll('[data-stop]').forEach(b=>b.onclick=()=>{ autoPlayHeld=false; cancel();stop(+b.dataset.stop); });


  // 自由漫步：按钮、屏幕方向键、键盘。
  // 手机端点「走」默认第一人称：手指拖画面=转头，摇杆=走路；想看小人再点「三」。
  document.querySelector('#roam').onclick=()=>{
    if(!roam&&touchDevice&&third)setThird(false);
    setRoam(!roam);document.activeElement?.blur?.();
  };
  document.querySelectorAll('[data-roam]').forEach(b=>{
    const dir=b.dataset.roam;
    const on=e=>{e.preventDefault();held.add(dir);b.setPointerCapture?.(e.pointerId);};
    const off=()=>held.delete(dir);
    b.addEventListener('pointerdown',on);
    b.addEventListener('pointerup',off);
    b.addEventListener('pointercancel',off);
    b.addEventListener('pointerleave',off);
  });
  const roamKeys={w:'forward',a:'left',s:'back',d:'right',arrowup:'forward',arrowdown:'back',arrowleft:'left',arrowright:'right'};
  addEventListener('keydown',e=>{
    if(!roam)return;
    if(e.key==='Shift'){held.add('run');return;}
    if(document.querySelector('dialog[open]')||!document.querySelector('#draw').hidden)return;
    const k=roamKeys[e.key.toLowerCase()];
    if(!k)return;
    if(e.target.closest?.('input,textarea,select'))return;
    if(praying)stopPray();
    e.preventDefault();held.add(k);
  });
  addEventListener('keyup',e=>{
    if(e.key==='Shift'){held.delete('run');return;}
    const k=roamKeys[e.key.toLowerCase()];
    if(k)held.delete(k);
  });
  addEventListener('blur',()=>held.clear());
}
// 让浏览器把刚写的提示真正画出来，再继续阻塞主线程去建模
const nextFrame=()=>new Promise(r=>requestAnimationFrame(()=>setTimeout(r,0)));
const say=(t,s)=>{ try{ window.__say?window.__say(t,s):(status.textContent=t); }catch(e){} };

// 场景数据 2.4MB 明文，弱网下手机要等很久。
// 先看本地缓存 → 再试 gzip（约 1/12 体积）→ 最后退回明文，全程报进度。
async function loadScene(onStage){
  // 构建号一并进缓存仓库名：改代码后哪怕服务器 Last-Modified 不变，旧的烘焙图纸也不会被复用
  const CACHE='foguang-scene-20261117b';
  // 缓存键以前写死 scene-20261106，改过 scene.json 之后浏览器和线上仍在读
  // 11 月 6 日那份旧图纸：伽蓝殿加高、庭堂收窄这 21 条烘焙几何全都没生效。
  // 先发一个不带 body 的 HEAD 取压缩包的 ETag / 修改时间 / 长度，拼进键里；
  // 服务器不给这些头时退到 v2，至少不会再把旧缓存当成新图纸。
  let tag='';
  try{
    const h=await fetch('scene.json.gz',{method:'HEAD',cache:'no-store'});
    if(h.ok) tag=h.headers.get('etag')||h.headers.get('last-modified')||
                 h.headers.get('content-length')||'';
  }catch(e){}
  const KEY='scene-'+(String(tag).replace(/[^0-9A-Za-z]/g,'')||'v2');
  try{
    const c=await caches.open(CACHE);
    const hit=await c.match(KEY);
    if(hit){ onStage('从本地缓存读取场景',''); return await hit.json(); }
    // 版本换了就把上一版图纸清掉，免得几份 1.3MB 的副本一直攒着
    const old=await c.keys();
    for(const r of old) if(r.url.indexOf(KEY)<0) await c.delete(r);
  }catch(e){}
  let data=null;
  if('DecompressionStream' in window){
    try{
      const r=await fetch('scene.json.gz',{cache:'no-store'});
      if(r.ok){
        const buf=await r.arrayBuffer();
        const u=new Uint8Array(buf);
        // 有些服务器会给 .gz 自动加 Content-Encoding，浏览器已经解过一遍，这里按 magic 判断
        if(u.length>2&&u[0]===0x1f&&u[1]===0x8b){
          const txt=await new Response(new Blob([u]).stream().pipeThrough(new DecompressionStream('gzip'))).text();
          data=JSON.parse(txt);
        }else if(u.length>2&&(u[0]===0x7b||u[0]===0x5b)){
          data=JSON.parse(new TextDecoder().decode(u));
        }
      }
    }catch(e){ console.warn('[载入] 压缩包读取失败，改用明文',e); }
  }
  if(!data){
    const r=await fetch('scene.json',{cache:'no-store'});
    if(!r.ok)throw new Error('场景数据读取失败');
    const total=+r.headers.get('content-length')||0;
    const reader=r.body&&r.body.getReader?r.body.getReader():null;
    if(reader&&total){
      const parts=[];let got=0;
      for(;;){
        const {done,value}=await reader.read();
        if(done)break;
        parts.push(value);got+=value.length;
        onStage('正在下载场景数据',Math.min(99,Math.round(got/total*100))+'%');
      }
      const all=new Uint8Array(got);let o=0;
      for(const p of parts){ all.set(p,o);o+=p.length; }
      data=JSON.parse(new TextDecoder().decode(all));
    }else{
      data=await r.json();
    }
  }
  // 存一份，下次进来几乎是秒开
  try{
    const c=await caches.open(CACHE);
    await c.put(KEY,new Response(JSON.stringify(data),{headers:{'Content-Type':'application/json'}}));
  }catch(e){}
  return data;
}

async function boot(){
  window.__modLoaded=true;
  say('正在取山寺图纸…','');
  const data=await loadScene((t,s)=>say(t,s));
  await nextFrame();
  say('正在立殿宇…','三重台地、木构与屋面');
  await nextFrame();
  /* 天：晴朗的白昼。原来是 #b6c2bb（偏灰绿的雾天调子），天看着发闷。
   * 现在换成明朗的淡蓝，雾色略浅于天色——远处山脊会自然淡进天色里，
   * 而抬头看天时是一片干净的蓝，没有云、没有贴图、也不会跟着人动。
   * 雾浓度压淡到 .0017（原 .0052）：只作用于内置材质的灰白雾气会把建筑/地面
   * 糊成一层滤镜，而笔触树是自定义shader不吃雾——两者割裂。压淡后建筑清透、
   * 远山仍留一点空气透视；时辰/季节的浓淡由 wonder/world.js 的 FOG_SCALE 统一缩放。 */
  scene=new T.Scene();scene.background=new T.Color('#8db6d8');scene.fog=new T.FogExp2('#a8c4da',.0017);
  camera=new T.PerspectiveCamera(44,innerWidth/innerHeight,.35,560);
  camera.position.set(...stops[0].eye);target=new T.Vector3(...stops[0].at);
  // 上一次就是去了禅房再回来：先读到存档，等场景立完再复原
  const leave=readLeave();
  renderer=new T.WebGLRenderer({antialias:Q.antialias,powerPreference:'high-performance'});
  dprNow=Q.pixelRatio;
  renderer.setPixelRatio(dprNow);renderer.setSize(innerWidth,innerHeight);
  renderer.shadowMap.enabled=true;
  renderer.shadowMap.type=Q.shadowType==='pcf'?T.PCFShadowMap:T.PCFSoftShadowMap;
  // 场景是静的（树不摆、光不动），阴影贴图没必要每帧重算：
  // 只在第一次、切进第三人称、和小人走动时按间隔刷新
  renderer.shadowMap.autoUpdate=false;renderer.shadowMap.needsUpdate=true;
  renderer.toneMapping=T.ACESFilmicToneMapping;renderer.toneMappingExposure=1.08;
  canvasHost.append(renderer.domElement);
  const sun=new T.DirectionalLight('#fff0d7',2.15);
  sun.position.set(-56,63,-46);sun.castShadow=true;
  Object.assign(sun.shadow.camera,{left:-70,right:70,top:66,bottom:-66,near:1,far:250});
  sun.shadow.mapSize.setScalar(Q.shadowSize);sun.shadow.normalBias=.08;sun.shadow.bias=-.0002;
  // 天光：晴天时天空的漫射光偏蓝白，地面反上来的是土黄。
  // 天色调蓝后这里也稍微提一点、偏冷一点，木构与石面的暗部才不会发灰。
  scene.add(sun,new T.HemisphereLight('#cfe4f2','#8b7355',1.92));
  batchModel(data);landscape();vaultedTerrace();buildFacades(scene,{ground});flush();hall=buildHall(scene);
  await nextFrame();
  say('正在铺石阶、栽松柏…','细部与花木');
  await nextFrame();
  details=buildDetails(scene,{ground,hill,camera});
  garden=buildGarden(scene,{ground,hill});
  await nextFrame();
  // 手机上把同材质的静态小件烘成一批，绘制次数从四位数压到三位数
  say('正在合并构件…','让手机跑得动');
  await nextFrame();
  const baked=bakeStatic(scene);
  const tinted=bakeColored(scene);
  if(baked||tinted)console.info('[画质] 静态合并 '+
    ((baked?baked.merged:0)+(tinted?tinted.merged:0))+' 个网格 → '+
    ((baked?baked.born:0)+(tinted?tinted.born:0))+' 批');
  omens.init();
  controls();rituals();
  // 第三人称避障：把场景里的墙体、台基收成盒体（小构件与屋面不要）。
  // 主轴台阶楔形不登记：走廊里第三人称相机必须能落在踏面上方随人爬升。
  for(const it of data){
    if(it[0]!=='b')continue;
    if(it[4]==='主轴台阶')continue;
    const [x,y,z,X,Y,Z]=it[1];
    const w=Math.max(Math.abs(X-x),Math.abs(Y-y),Math.abs(Z-z));
    const t=Math.min(Math.abs(X-x),Math.abs(Y-y),Math.abs(Z-z));
    if(w<1.2||t>6)continue;
    camBoxes.push(new T.Box3(
      new T.Vector3(Math.min(x,X),Math.min(z,Z),-Math.max(y,Y)),
      new T.Vector3(Math.max(x,X),Math.max(z,Z),-Math.min(y,Y))
    ));
  }
  // 「三进高台」整块实心 [3,-34,0,38,33,13] 会把第三人称相机顶到坡面前方
  // 几米外（站在坡上镜头却糊在高台西脸前）。走廊（|z|≤2.35）从实体避障盒
  // 里挖掉，改用一条贴着坡面的高度线约束相机不低于踏面。
  {
    const T3 = data.find(it=>it[0]==='b'&&it[4]==='三进高台');
    if(T3){
      const [x,y,z,X,Y,Z]=T3[1];
      const CW=2.35;
      const add=(x0,x1,y0,y1,z0,z1)=>camBoxes.push(new T.Box3(
        new T.Vector3(x0,z0,-y1),new T.Vector3(x1,z1,-y0)));
      if(y<-CW) add(x,y,X,-CW,z,Z);
      if(Y> CW) add(x, CW,X,Y, z,Z);
      window.__camStairTop = (px,pz) => {
        // 与 ground() 走廊分支同式：第三人称相机在这段不低于踏面
        if(px>=-7.15&&px<3&&Math.abs(pz)<=CW) return H.two+(px+7.15)/10.16*11;
        return null;
      };
    }
  }
  presence=startPresence(scene,camera,{feet:()=>{
    const x=camera.position.x,z=camera.position.z;
    return {x:+x.toFixed(2),y:+(walkingY(x,z)+jumpHeight).toFixed(2),z:+z.toFixed(2)};
  }});
  // 自己的小人：第一人称时收起来，切到第三人称才出现在镜头里
  {
    const me=presence?presence.me():{color:'#c9a06a'};
    mine=makeAvatar({name:'我',color:me.color||'#c9a06a'}).group;
    mine.visible=false;
    scene.add(mine);
    const btn=document.querySelector('#person');
    if(btn)btn.onclick=()=>{setThird(!third);document.activeElement?.blur?.();};
  }
  function resize(){
    camera.aspect=innerWidth/innerHeight;camera.fov=innerWidth<700?58:44;camera.updateProjectionMatrix();
    renderer.setSize(innerWidth,innerHeight);
  }
  // 手机上地址栏收起会把 resize 连发好几次，防抖一下，别每次都重建绘图缓冲
  let resizeTimer=0;
  addEventListener('resize',()=>{clearTimeout(resizeTimer);resizeTimer=setTimeout(resize,120);});
  resize();
  say('正在点亮殿宇…','首帧要编译着色器');
  await nextFrame();
  status.hidden=true;
  window.__sceneReady=true;
  window.__view=(p,t)=>{playing=false;motion=null;camera.position.set(p[0],p[1],p[2]);target.set(t[0],t[1],t[2]);};
  // 开局不要自动往下飞：动的是 guided() 的「开场俯冲」，它由 playing=true 触发。
  // 平时不会自己跑；但从禅房回来时若漫游被复原，timeupdate 等回调可能把 playing 点着，
  // 镜头就会自己从半山腰飞走。
  autoPlayHeld=!!leave;
  // 复原期间任何"自己往下走"的播放都按住，等用户真的动手（点游览/站点）才放开
  setInterval(()=>{ if(autoPlayHeld&&playing){ playing=false; document.querySelector('#walk').textContent='▶　沿山径游览'; } },400);
  // 从禅房回来：首帧之前就站回原来的位置，用户看不到"先鸟瞰再瞬移"
  if(leave){ applyLeave(leave); try{ sessionStorage.removeItem(SAVE_KEY); }catch(e){} }
  // 天穹每帧跟随相机：云挂在无限远，走近走远都不变形、不穿出
  // 云层跟随相机：平面云挂在相机正前方固定距离，抬头就能看到，
  // 走动/转身云不动（云在无限远的错觉），俯视时云自然落在视线上方。

  // 从禅房回来：把人落在指定的门口，而不是鸟瞰/山门的默认起点
  window.__spawn=(x,z,yaw)=>{ autoPlayHeld=false; setRoam(true); motion=null;
    camera.position.set(x,ground(x,z)+ROAM.eye,z);
    yawT=yaw||0; yaw=yawT; pitchT=pitch=-.02;
    target.set(x-Math.sin(yaw)*9, camera.position.y-.6, z-Math.cos(yaw)*9);
  };
  // 复原时只改底栏标签与选中态，不动镜头（机位由存档决定）
  window.__restoreStop=(i)=>{
    if(!(i>=0&&i<stops.length))return;
    current=i;
    document.querySelector('h2').textContent=stops[i].title;
    document.querySelector('#desc').textContent=stops[i].desc;
    document.querySelector('.kicker b').textContent='0'+(i+1)+' / 05';
    document.querySelectorAll('[data-stop]').forEach((b,j)=>{b.classList.toggle('active',i===j);b.setAttribute('aria-current',i===j?'step':'false');});
  };
  // 离开（含跳去禅房）时把现场存进本次标签页
  window.addEventListener('pagehide',saveLeave);
  document.addEventListener('visibilitychange',()=>{ if(document.visibilityState==='hidden')saveLeave(); });
  document.querySelector('#zen')?.addEventListener('click',saveLeave,{capture:true});
  window.__cam=()=>({x:camera.position.x,y:camera.position.y,z:camera.position.z,yaw,pitch,yawT,pitchT,locked,roam,camDist,obs:camBoxes.length,third});
  // 直播间把手伸进来的地方：观众的一句评论，最后落到这几个动作上
  const stage={
    scene, camera, renderer, ground, hill,
    jump:startJump,
    roofAt:(x,z)=>roofAt(x,z,100),
    registerRoofs(...meshes){ meshes.forEach(m=>m.updateWorldMatrix(true,false)); roofMeshes.push(...meshes); },
    // 给独立增强模块用的经济接口：小卖部买香、功德回写，不直接碰内部变量
    purse:()=>balance,
    spend(n){ if(n<=0||n>balance)return false; balance-=n; document.querySelector('#purse').textContent='香火券 '+balance; return true; },
    addMerit:progress.add,
    inHall:()=>inHall(),
    bell(){ sfx.unlock(); sfx.templeBell(1); if(Math.random()<.42){ try{ omens.playId('zhongming'); }catch(e){} } },
    incense(){ sfx.unlock(); hall.lightIncense(performance.now()); document.querySelector('#altar-photo').classList.add('incense-lit'); },
    bow(){ sfx.unlock(); bowPulseAt=performance.now(); sfx.woodfish(); },
    draw(){ sfx.unlock(); startDraw(); },
    showOmen: id => omens.playId(id),
    omen(){ sfx.unlock(); const ids=omens.list; omens.playId(ids[Math.floor(Math.random()*ids.length)]); },
    lamp(){ sfx.unlock(); sfx.chime(); },
    // 观众点的镜头，先停在这儿别被自动巡游抢走
    go(i,d){ liveHold=performance.now()+45000; cancel(); stop(i,d||2400); },
    turn(d){ if(roam) yawT+=d*.55; else lookYaw=T.MathUtils.clamp(lookYaw+d*.42,-.72,.72); },
    look(d){ if(roam) pitchT=T.MathUtils.clamp(pitchT+d*.55,-1.15,1.05); else lookPitch=T.MathUtils.clamp(lookPitch+d*.30,-.36,.36); },
    pause(){ liveHold=performance.now()+90000; cancel(); },
    play(){ liveHold=0; if(!playing) guided(); },
    unlockAudio(){ sfx.unlock(); }
  };
  // 先暴露 stage：增强模块（笔触植被/滤镜链/GLB 树）都等它就绪，
  // 不必再等 beauty 的动态 import 完成，避免首屏几秒空窗。
  window.__stage=stage;
  // 全局美化调色板：外部美术顾问（P0 批）指定的建筑主色，装载完即换色
  try { await import('./beauty.js?v=20261119model'); } catch (e) { console.warn('[tour] beauty 跳过：', e); }
  window.__boxes=camBoxes;
  window.__perf=()=>({
    calls:renderer.info.render.calls, tris:renderer.info.render.triangles,
    pr:renderer.getPixelRatio(), w:renderer.domElement.width, h:renderer.domElement.height,
    shadow:renderer.shadowMap.enabled, lights:(()=>{let n=0;scene.traverse(o=>{if(o.isLight)n++});return n})()
  });
  if(LIVE)document.body.classList.add('live');
  liveTick=startLive(stage);
  // 进门即有瑞兆：每次来访随机遇上一到两种
  setTimeout(()=>{ try{ omens.roll('arrive'); }catch(e){ console.warn(e); } },1800);
  let arrival=0, liveNext=0;
  if(LIVE){
    document.body.classList.add('live');
    document.querySelectorAll('dialog[open]').forEach(d=>d.close?.());
    document.querySelector('#buffs').hidden=true;
    document.querySelector('#hint').textContent='';
    setTimeout(()=>guided(),1400);
    // 隔一阵落一种瑞兆，画面不空
    setInterval(()=>{ try{ omens.roll('live'); }catch(e){ /* 静默 */ } },46000);
  }
  renderer.setAnimationLoop(now=>{
    const dt=Math.min(.05,Math.max(.001,(now-(lastT||now))/1000));lastT=now;

    // 自适应：每 1.5 秒看一次平均帧时间，慢了就把像素比往下调一档。
    // 只降不升，省得在两档之间来回抖。
    perfAcc+=dt;perfN++;
    if(!perfAt)perfAt=now;
    else if(now-perfAt>1500){
      const avg=perfAcc/perfN;
      perfAcc=0;perfN=0;perfAt=now;
      if(avg>.030&&dprNow>Q.minPixelRatio+.001){
        dprNow=Math.max(Q.minPixelRatio,dprNow-.15);
        dprFast=0;
        renderer.setPixelRatio(dprNow);renderer.setSize(innerWidth,innerHeight);
      }else if(avg<.018&&dprNow<Q.pixelRatio-.001){
        // 连着一分钟都够快才往回补一档，避免在两档之间来回跳
        if(++dprFast>=6){
          dprFast=0;
          dprNow=Math.min(Q.pixelRatio,dprNow+.1);
          renderer.setPixelRatio(dprNow);renderer.setSize(innerWidth,innerHeight);
        }
      }else dprFast=0;
    }
    // 阴影只在第三称、且小人在路上走的时候重算
    if(third&&now-shadowAt>Q.shadowEvery){shadowAt=now;renderer.shadowMap.needsUpdate=true;}

    if(praying)prayDip=bowCurve(prayerTick(now));
    syncRitual();
    if(roam){
      // 第三人称：roamTick 写的是"走路时朝哪看"，真正镜头由 thirdCam 摆在身后。
      // 复原时 roamTick 会把人从存档点再挪一次，得先存下机位。
      const thirdKeep=third?camera.position.clone():null;
      roamTick(now,dt);
      if(thirdKeep)camera.position.copy(thirdKeep);
      syncPrompt();
    }else{
      if(motion){
        const t=T.MathUtils.clamp((now-motion.start)/motion.duration,0,1),s=t*t*(3-2*t);
        if(motion.curve){
          motion.curve.getPoint(s,camera.position);
          target.lerpVectors(motion.focus,motion.at,s);
        }else if(motion.route){
          const progress=t*(motion.route.length-1);
          const segment=Math.min(motion.route.length-2,Math.floor(progress));
          camera.position.lerpVectors(motion.route[segment],motion.route[segment+1],progress-segment);
          target.lerpVectors(motion.focus,motion.at,s);
        }else{camera.position.lerpVectors(motion.from,motion.to,s);target.lerpVectors(motion.focus,motion.at,s);}
        if(t===1){
          const done=motion.onDone;
          motion=null;
          if(done)done();else arrival=now;
        }
      }else if(playing&&now-arrival>(current===1?4200:2800)){
        if(current===4)cancel();else stop(current+1,2400);
      }
      // 直播：走完一轮，停一会儿再从头走，不必有人操作
      if(LIVE){
        if(!motion&&!playing){
          if(now<liveHold){ liveNext=0; }
          else if(!liveNext)liveNext=now+8000;
          else if(now>liveNext){liveNext=0;guided();}
        }else liveNext=0;
      }
    }
    hall.tick(now,dt);
    if(details)details.tick(now,dt);
    if(garden)garden.tick(now,dt);
    if(presence)presence.tick(dt);
    if(liveTick)liveTick(now,dt);
    const fov=roam?(innerWidth<700?66:56):current===4?(innerWidth<700?62:51):(innerWidth<700?58:44);
    if(Math.abs(fov-camera.fov)>.1){camera.fov+=(fov-camera.fov)*.12;camera.updateProjectionMatrix();}
    if(roam){
      syncMine();
      const keep=third?camera.position.clone():null;
      if(third)thirdCam();
      renderer.render(scene,camera);
      if(keep)camera.position.copy(keep);
      return;
    }
    if(mine)mine.visible=false;
    let dip=praying?prayDip:0;
    if(!praying){
      const t=(now-bowStart)/2800;
      dip=current===4&&!motion&&t>=0&&t<1?Math.sin(t*Math.PI)**1.6:0;
      // 直播间有人发「拜」，镜头就替观众俯一次身
      const p=(now-bowPulseAt)/1500;
      if(p>=0&&p<1)dip=Math.max(dip,Math.sin(p*Math.PI)**1.5);
    }
    camera.position.y-=dip*.7;
    camera.lookAt(target.clone().add(new T.Vector3(0,-dip*1.65,0)));
    // 光标在画面里挪动，视线跟着微偏两三度，画面就活了
    const swayEase=Math.min(1,dt*3.0);
    swayYaw+=(-mouseNX*.042-swayYaw)*swayEase;
    swayPitch+=(mouseNY*.026-swayPitch)*swayEase;
    // 观众喊「左转」时先偏过去，再慢慢回正，像有人扶着镜头看了一眼
    const lookEase=Math.min(1,dt*1.1);
    lookYaw+=(0-lookYaw)*lookEase;
    lookPitch+=(0-lookPitch)*lookEase;
    camera.rotation.y+=swayYaw+lookYaw;
    camera.rotation.x+=swayPitch+lookPitch;
    renderer.render(scene,camera);
    camera.position.y+=dip*.7;
  });
}
boot().catch(e=>{
  console.error(e);
  window.__modLoaded=true;
  if(window.__fail)window.__fail('三维场景没能立起来','点下面重新载入；反复失败就换 Chrome 或手机自带浏览器。');
  else status.textContent='三维场景无法载入，请使用支持 WebGL 的浏览器并刷新。';
});
