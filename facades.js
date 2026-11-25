// 厢房与配殿的立面：柱础、阑额、板门、直棂窗、踏步、匾额。
// 场景数据里这些配殿只有体量盒和几根檐柱，从院中看过去是一面色块。
// 这个模块把朝向院子的那一面补成可辨认的立面，按材质合并，不拆散原有批次。
// 坐标约定与场景一致：x 东西、y 南北、z 高度；three.js 里是 (x, z, -y)。
import {surface} from './surfaces.js?v=20261112h';
import {weathered} from './wonder/weathered.js?v=20261116bk';
const T = window.THREE;

const C = {
  wall:'#c4b399',
  plinth:'#a99981',
  wood:'#6b3a24',
  leaf:'#8a5433',
  dark:'#1e150f',
  lattice:'#b7a37f',
  stone:'#9d8f79',
  stoneDark:'#8a7c67',
  soffit:'#4a3929',
  gold:'#b08b4e'
};
const WOOD = new Set([C.wood,C.leaf,C.soffit,C.gold,C.lattice]);

const unit = new T.BoxGeometry(1,1,1);
const bp = unit.attributes.position.array;
const bn = unit.attributes.normal.array;
const buv = unit.attributes.uv.array;
const bi = unit.index.array;

function builder(){
  const buckets = new Map();
  return {
    // 模型坐标：c=(x,y,z)，尺寸 w 沿 x、d 沿 y、h 沿 z
    box(color,cx,cy,cz,w,d,h){
      let b = buckets.get(color);
      if(!b){ b = {pos:[],nor:[],uv:[],idx:[],n:0}; buckets.set(color,b); }
      const sx=w, sy=h, sz=d, x=cx, y=cz, z=-cy;
      for(let i=0;i<bp.length;i+=3){
        b.pos.push(bp[i]*sx+x, bp[i+1]*sy+y, bp[i+2]*sz+z);
        b.nor.push(bn[i],bn[i+1],bn[i+2]);
      }
      for(const value of buv) b.uv.push(value);
      for(let i=0;i<bi.length;i++) b.idx.push(bi[i]+b.n);
      b.n += 24;
    },
    flush(scene){
      for(const [color,b] of buckets){
        const g = new T.BufferGeometry();
        g.setAttribute('position',new T.Float32BufferAttribute(b.pos,3));
        g.setAttribute('normal',new T.Float32BufferAttribute(b.nor,3));
        g.setAttribute('uv',new T.Float32BufferAttribute(b.uv,2));
        g.setIndex(b.idx);
        const m = new T.MeshStandardMaterial({color,roughness:.94,
          polygonOffset:true,polygonOffsetFactor:1,polygonOffsetUnits:1});
        if(WOOD.has(color)){ m.map = surface('wood'); m.bumpMap = m.map; m.bumpScale = .016; }
        else { m.map = surface('stone'); m.bumpMap = m.map; m.bumpScale = .026; }
        if (color !== C.gold && color !== C.dark) weathered(m, WOOD.has(color) ? 'wood' : color===C.wall ? 'plaster' : 'stone');
        const mesh = new T.Mesh(g,m);
        mesh.castShadow = true; mesh.receiveShadow = true;
        scene.add(mesh);
      }
    }
  };
}

/* 匾额：画布写字，避免额外图片资源。 */
const plaques = new Map();
function plaqueTexture(text){
  if(plaques.has(text)) return plaques.get(text);
  const w = 512, h = 148;
  const c = document.createElement('canvas'); c.width = w; c.height = h;
  const x = c.getContext('2d');
  const bg = x.createLinearGradient(0,0,0,h);
  bg.addColorStop(0,'#3b2416'); bg.addColorStop(1,'#221307');
  x.fillStyle = bg; x.fillRect(0,0,w,h);
  x.strokeStyle = '#b08b4e'; x.lineWidth = 7; x.strokeRect(9,9,w-18,h-18);
  x.strokeStyle = '#6d5027'; x.lineWidth = 2; x.strokeRect(19,19,w-38,h-38);
  const size = text.length > 4 ? 60 : 74;
  x.fillStyle = '#dcb872';
  x.font = `600 ${size}px "STSong","SimSun",serif`;
  x.textAlign = 'center'; x.textBaseline = 'middle';
  const gap = size + 8;
  const start = w/2 - gap*(text.length-1)/2;
  [...text].forEach((ch,i)=>x.fillText(ch,start+gap*i,h/2+3));
  const t = new T.CanvasTexture(c);
  t.colorSpace = T.SRGBColorSpace; t.anisotropy = 4;
  plaques.set(text,t);
  return t;
}
function plaque(scene,text,cx,cy,cz,ry,w){
  const h = w*.29;
  const m = new T.Mesh(new T.PlaneGeometry(w,h),
    new T.MeshStandardMaterial({map:plaqueTexture(text),roughness:.62,metalness:.06}));
  m.position.set(cx,cy,-cz); m.rotation.y = ry;
  m.castShadow = false;
  scene.add(m);
}

/* 券门：过洞门。做成有进深的拱道——厚石框 + 远端深色背板，避免看穿成黑窟窿/透出背景。 */
function arch(scene,cx,cy,cz,ry,w,h,opts){
  const r = w/2, spring = h-r, wallThk = 0.9;
  const g = new T.Group();
  g.position.set(cx,cz,-cy); g.rotation.y = ry;
  /* 券环形状：只做【半圆券 + 两侧细券脚】，不再是一整块被挖了洞的方板。
   * 用户反馈"山门的框有一个圆的一个方的，把方的去掉"——原来 ring 的外轮廓
   * 是 ±R 的矩形，等于在圆拱外面又套了一层方形门框，正对时看到的是一张
   * 口字框；现在外轮廓沿拱背走弧线，落地只剩一条窄券脚（AR 宽），
   * 远看就是一道纯圆券。 */
  const R = r+.20, sp = spring;
  const AR = R - r;                      // 券脚宽度（=券环厚度 .20）
  const ring = new T.Shape();
  ring.moveTo(-R, -.05);
  ring.lineTo(-R, 0);                    // 券脚外侧只落到台面，不再往上爬成方框
  ring.lineTo(-R, sp); ring.absarc(0, sp, R, Math.PI, 0, true); ring.lineTo(R, 0);
  ring.lineTo(R, -.05);
  ring.lineTo(R - AR, -.05); ring.lineTo(r, -.05);
  ring.lineTo(r, sp); ring.absarc(0, sp, r, 0, Math.PI, false); ring.lineTo(-r, -.05);
  ring.lineTo(-R + AR, -.05);
  const rg = new T.ExtrudeGeometry(ring,{depth:wallThk,bevelEnabled:false});
  rg.translate(0,0,-wallThk/2);
  const frame = new T.Mesh(rg,new T.MeshStandardMaterial({color:C.stone,roughness:.95}));
  frame.castShadow = true; frame.receiveShadow = true;
  g.add(frame);
  // 朝外（观者一侧）的深色背板，封住拱底：无论背后有没有殿身实体，看进去都是有深度的拱道而非黑窟窿
  // 山门例外：opts.open 时留真门洞，人要从谷口穿过门洞走进寺院（门体内衬由 detail.js 补）
  if(!(opts&&opts.open)){
    const inner = new T.Shape();
    inner.moveTo(-r,0); inner.lineTo(-r,spring); inner.absarc(0,spring,r,Math.PI,0,true); inner.lineTo(r,0); inner.closePath();
    const back = new T.Mesh(new T.ShapeGeometry(inner),
      new T.MeshStandardMaterial({color:'#1c140d',roughness:1,side:T.DoubleSide}));
    back.position.set(0,0,-(wallThk/2-.03));
    g.add(back);
  }
  scene.add(g);
}

/* 朝向院子的那一面：a0..a1 是沿墙方向的范围，F 是墙面坐标，D 是朝外方向。 */
function hallFacade(B,h){
  const len = h.a1-h.a0;
  const bay = len/h.bays;
  const base = h.base, top = h.top;
  const at = (u,z,off)=>[u, h.F+h.D*off, z];          // 模型坐标
  const box = (color,u,z,off,w,dep,hh)=>{
    const [mx,my,mz] = at(u,z,off);
    B.box(color,mx,my,mz,w,dep,hh);
  };
  const eaveBottom = top-.45;

  // 正面墙：粉墙 + 下段石墙裙
  box(C.wall,(h.a0+h.a1)/2,(base+top+.84)/2,.03,len,.09,top-base-.84);
  box(C.plinth,(h.a0+h.a1)/2,base+.42,.06,len,.065,.84);

  // 阑额与普拍枋
  box(C.wood,(h.a0+h.a1)/2,top-.25,.09,len,.26,.34);
  box(C.wood,(h.a0+h.a1)/2,top-.44,.12,len,.16,.14);

  // 挑檐下的暗影
  box(C.soffit,(h.a0+h.a1)/2,top-.18,.30,len-.05,.62,.12);

  const doorSet = new Set();
  const center = (h.bays-1)/2;
  for(let i=0;i<h.door;i++) doorSet.add(Math.round(center-(h.door-1)/2+i));

  const dh = Math.max(1.7,Math.min(3.5,top-base-1.35));
  const doorTop = base+.10+dh;

  for(let i=0;i<h.bays;i++){
    const u0 = h.a0+i*bay+.15, u1 = h.a0+(i+1)*bay-.15;
    const w = u1-u0, uc = (u0+u1)/2;
    if(doorSet.has(i)){
      // 抱框、门洞、两扇板门、门钉横带、门槛石
      box(C.wood,uc,base+.10+dh/2,.06,w+.12,.15,dh+.20);
      box(C.dark,uc,base+.10+dh/2,.11,w,.08,dh);
      const lw = w/2-.05;
      for(const s of [-1,1]){
        box(C.leaf,uc+s*(w/4+.012),base+.10+dh/2,.155,lw,.075,dh-.16);
        for(const zz of [dh*.26,dh*.62,dh*.86])
          box(C.gold,uc+s*(w/4+.012),base+.10+zz,.205,lw*.84,.028,.038);
        // 门环
        box(C.gold,uc+s*.19,base+.10+dh*.48,.215,.07,.03,.07);
      }
      box(C.stoneDark,uc,base+.05,.34,w+.40,.38,.10);
    }else{
      const wh = Math.max(.95,Math.min(1.6,top-base-1.85));
      const cy = base+.62+wh/2;
      box(C.dark,uc,cy,.07,w*.80,.08,wh);
      const bars = Math.max(5,Math.round(w*.80/.14));
      for(let k=0;k<bars;k++){
        const bu = uc-w*.40+(k+.5)*(w*.80/bars);
        box(C.lattice,bu,cy,.115,w*.80/bars*.44,.05,wh*.97);
      }
      box(C.wood,uc,cy+wh/2,.12,w*.88,.12,.13);
      box(C.wood,uc,cy-wh/2,.12,w*.88,.12,.13);
    }
    // 柱础
    box(C.stone,u0-.15,base+.09,.29,.36,.36,.18);
  }
  box(C.stone,h.a1+.15,base+.09,.29,.36,.36,.18);

  // 踏步：从院面踏步上到台明
  const g = h.ground;
  const steps = Math.max(1,Math.min(4,Math.round((base-g)/.19)));
  const sw = Math.min(bay*1.45,4.4);
  const ucDoor = h.a0+(Math.round(center)+.5)*bay;
  for(let i=0;i<steps;i++){
    const topZ = g+(base-g)*(i+1)/steps;
    const out = .36+(steps-i)*.42;
    box(C.stone,ucDoor,(g+topZ)/2,.36+out/2,sw,out,topZ-g);
  }
  return {ucDoor,bay};
}

export function buildFacades(scene,opts={}){
  const ground = opts.ground||(()=>0);
  const B = builder();
  const HALLS = [
    {name:'文殊殿',    a0:-47.5,a1:-16.5,F: 11.0,D:-1,base:  .7,top: 5.6,bays:7,door:3},
    {name:'伽蓝殿',    a0:-37.0,a1:-25.0,F:-17.5,D: 1,base:.82,top:5.01,bays:3,door:1},
    {name:'香风花雨楼',a0:-17.0,a1: -5.0,F: 20.5,D:-1,base: 2.4,top: 8.4,bays:5,door:1},
    {name:'庭堂',      a0:-16.0,a1: -9.0,F:-10.5,D: 1,base: 2.4,top: 5.1,bays:3,door:1},
    {name:'客堂',      a0:-15.5,a1: -4.5,F:-19.5,D: 1,base: 2.4,top: 5.1,bays:5,door:1},
    {name:'森会祗园门',a0:-12.5,a1: -7.5,F:-27.1,D: 1,base: 2.4,top: 4.7,bays:3,door:1},
    {name:'万善堂',    a0:  6.5,a1: 17.5,F: 23.4,D:-1,base:13.4,top:16.1,bays:3,door:1},
    {name:'关帝殿',    a0:  7.0,a1: 17.0,F:-22.5,D: 1,base:13.4,top:16.0,bays:3,door:1}
  ];
  for(const h of HALLS){
    const uc = (h.a0+h.a1)/2;
    h.ground = ground(uc,h.F+h.D*2.6);
    const {ucDoor,bay} = hallFacade(B,h);
    // 匾额挂在门楣与阑额之间
    const doorTop = h.base+.10+Math.max(1.7,Math.min(3.5,h.top-h.base-1.35));
    const gap = (h.top-.45)-doorTop;
    const pw = Math.min(2.15,bay*.72,gap*3.1);
    if(pw>1.1){
      const ry = h.D>0 ? Math.PI : 0;
      plaque(scene,h.name,ucDoor,doorTop+gap/2,h.F+h.D*.155,ry,pw);
    }
    if(h.name==='森会祗园门'){
      arch(scene,uc,h.F+h.D*.02,h.ground+.08,h.D>0?Math.PI:0,2.5,h.top-h.ground-.55);
    }
  }
  // 山门：东西两面各一个券门；门洞打通，谷口方向可以走进来
  arch(scene,-46.90,0,.42,Math.PI/2,2.9,2.62,{open:true});
  arch(scene,-51.10,0,.42,-Math.PI/2,2.9,2.62,{open:true});
  B.flush(scene);
}
