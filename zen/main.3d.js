import {meditation} from '../progress.js?v=20261125wishes';
let endMeditation;
/* =============================================================
   佛堂 · 禅房  |  three.js 场景  v3  (build 20261115m)
   -------------------------------------------------------------
   v2 相对原型的改动（v3 追加 three.js 实时坐姿环视）：
   1) 贴图统一在浏览器内做校色（降饱和 / 压暗 / 加对比）并派生 bumpMap，
      不再是高饱和橘色塑料墙；
   2) 背墙开出真实窗洞，方向光穿过窗棂投下格子光影，
      删掉原先两块硬边灰色矩形「光斑」；
   3) 主尊重做为结跏趺坐佛像（莲座 / 双腿 / 肩臂 / 手印 / 五官 / 衣褶 /
      头光），不再是车削出来的葫芦；
   4) 补完木构层次：立柱、腰线、踢脚、梁架、幡幢、挂轴、供桌帷幔、
      草编蒲团；
   5) 修复坐下环视：视频赋 src、四向图指向真实文件、0° 用视频、
      失败回退静帧。
   坐标：房间中心为原点，-z 为佛坛方向，+z 为入口。
   ============================================================= */
const T = THREE;
const app = document.getElementById('app');

/* ============ 资产与版本 ============
   AI 贴图由远程机本地 MiniMax H3 节点生成；换图后只需改 ASSET_VER。 */
const ASSET_VER = '20261115az';
const TEX = {
  wall:   'assets/tex_wall.jpg',
  floor:  'assets/tex_floor.jpg',
  altar:  'assets/tex_altar.jpg',
  window: 'assets/tex_window.jpg',
};
const POSES = [
  { deg:   0, label: '正前 · 山窗', src: 'assets/pano_000.jpg' },      // 0° 与照片模式一致：山窗矮桌，无视频
  { deg:  90, label: '右 · 侧壁',  src: 'assets/pano_090.jpg' },
  { deg: 180, label: '后 · 门',    src: 'assets/pano_180.jpg' },
  { deg: 270, label: '左 · 挂轴',  src: 'assets/pano_270.jpg' },
];

/* ============ DOM ============ */
const panoLayer   = document.getElementById('pano-layer');
const panoA       = document.getElementById('pano-a');
const panoB       = document.getElementById('pano-b');
const panoPrev    = document.getElementById('pano-prev');
const panoNext    = document.getElementById('pano-next');
const panoCompass = document.getElementById('pano-compass');
const sitOverlay  = document.getElementById('sit-overlay');
const sitHint     = document.getElementById('sit-hint');

/* 不再播放视频：坐姿 0° 与照片模式一致，直接显示 pano_000.jpg 环视照片 */
let poseIdx = 0, panoCur = null, sitting = false;
for (const p of POSES){ if (p.src){ const im = new Image(); im.src = p.src + '?v=' + ASSET_VER; } }

function showPose(idx){
  idx = ((idx % POSES.length) + POSES.length) % POSES.length;
  poseIdx = idx;
  const pose = POSES[idx];
  panoCompass.textContent = pose.label;
  const next = (panoCur === panoA) ? panoB : panoA;
  next.onerror = () => console.warn('[环视图缺失]', pose.src);
  next.onload  = () => { next.style.opacity = 1; };
  next.src = pose.src + '?v=' + ASSET_VER;
  if (next.complete && next.naturalWidth) next.style.opacity = 1;
  if (panoCur && panoCur !== next) panoCur.style.opacity = 0;
  panoCur = next;
}

/* ============ 渲染器 ============ */
const renderer = new T.WebGLRenderer({ antialias:true, preserveDrawingBuffer:true, powerPreference:'high-performance' });
renderer.setPixelRatio(Math.min(devicePixelRatio, 2));
renderer.setSize(innerWidth, innerHeight);
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = T.PCFSoftShadowMap;
renderer.outputColorSpace = T.SRGBColorSpace;
renderer.toneMapping = T.ACESFilmicToneMapping;
renderer.toneMappingExposure = 1.26;
app.appendChild(renderer.domElement);

/* ============ 场景 / 相机 ============ */
const scene = new T.Scene();
scene.background = new T.Color(0x090705);
scene.fog = new T.FogExp2(0x150e07, 0.016);

const ROOM = { w:9, d:11, h:4.2 };
const WZ = -ROOM.d/2, FZ = ROOM.d/2, WT = 0.2;

const camBase = new T.Vector3(0, 1.62, 4.20);
const camLook = new T.Vector3(0, 1.90, -2.40);
const camera = new T.PerspectiveCamera(40, innerWidth/innerHeight, 0.1, 120);
camera.position.copy(camBase);
camera.lookAt(camLook);
/* 竖屏适度放宽视角，避免只剩佛像特写、看不到窗与房间 */
function fitCamera(){
  const a = innerWidth/innerHeight;
  camera.aspect = a;
  camera.fov = a < 0.75 ? 52 : (a < 1.15 ? 46 : 40);
  camera.updateProjectionMatrix();
}
fitCamera();

/* 参考渲染钩子：?shot=DEG 从蒲团位置按角度渲染定妆照 */
const _q = new URLSearchParams(location.search);
const SHOT_YAW = (_q.get('shot') !== null) ? (parseFloat(_q.get('shot')) || 0) : null;
if (SHOT_YAW !== null) document.body.classList.add('shot');

/* ============ 环境反射 ============ */
(function makeEnv(){
  const c = document.createElement('canvas'); c.width = 128; c.height = 64;
  const g = c.getContext('2d');
  const grd = g.createLinearGradient(0, 0, 0, 64);
  grd.addColorStop(0.00, '#1b283c');
  grd.addColorStop(0.30, '#8fa4b4');   // 窗外的亮天光带
  grd.addColorStop(0.46, '#6a4c2c');
  grd.addColorStop(0.72, '#3a2817');
  grd.addColorStop(1.00, '#0e0905');
  g.fillStyle = grd; g.fillRect(0, 0, 128, 64);
  const tex = new T.CanvasTexture(c);
  tex.mapping = T.EquirectangularReflectionMapping;
  tex.colorSpace = T.SRGBColorSpace;
  const pm = new T.PMREMGenerator(renderer);
  pm.compileEquirectangularShader();
  scene.environment = pm.fromEquirectangular(tex).texture;
  pm.dispose(); tex.dispose();
})();

/* ============ 光照 ============
   r160 是物理光照单位：方向光/环境光用 lux 量级，点光/聚光用 candela，
   所以强度必须比旧代码大一个量级，否则整屋只剩环境光、毫无立体感。 */
scene.add(new T.AmbientLight(0xffe3c2, 0.16));
const hemi = new T.HemisphereLight(0xffd9a8, 0x1d1208, 0.26);
scene.add(hemi);

/* 主光：从窗外陡斜射入，穿过真窗洞，窗棂在可见地面上投下格子影。
   角度必须够陡，否则光斑落在相机身后（画面里根本看不见）。 */
const sky = new T.DirectionalLight(0xd6e4f5, 4.4);
sky.position.set(0, 7.0, -9.2);
sky.target.position.set(0, 0.20, 0.40);
sky.castShadow = true;
sky.shadow.mapSize.set(2048, 2048);
sky.shadow.camera.left = -9; sky.shadow.camera.right = 9;
sky.shadow.camera.top = 9;   sky.shadow.camera.bottom = -9;
sky.shadow.camera.near = 0.5; sky.shadow.camera.far = 34;
sky.shadow.camera.updateProjectionMatrix();
sky.shadow.bias = -0.00035;
sky.shadow.normalBias = 0.022;
sky.shadow.radius = 2.5;
scene.add(sky); scene.add(sky.target);

/* 佛前长明灯 */
const lamp = new T.PointLight(0xffab52, 30, 26, 2);
lamp.position.set(0, 2.15, 0.1);
lamp.castShadow = true;
lamp.shadow.mapSize.set(1024, 1024);
lamp.shadow.bias = -0.0007;
lamp.shadow.normalBias = 0.025;
lamp.shadow.radius = 4;
scene.add(lamp);

const rim = new T.PointLight(0xff7d34, 13, 16, 2);
rim.position.set(3.5, 1.35, -1.8); scene.add(rim);
const fill = new T.PointLight(0xffbd82, 9, 14, 2);
fill.position.set(-1.0, 1.6, 2.4); scene.add(fill);

/* ============ 程序化纹理工具 ============ */
function gradeCanvas(src, o){
  const sat = o.sat ?? 1, bright = o.bright ?? 1, contrast = o.contrast ?? 1, warm = o.warm ?? 0;
  const c = document.createElement('canvas'); c.width = src.width; c.height = src.height;
  const g = c.getContext('2d'); g.drawImage(src, 0, 0);
  const im = g.getImageData(0, 0, c.width, c.height), d = im.data;
  for (let i=0;i<d.length;i+=4){
    const l = 0.2126*d[i] + 0.7152*d[i+1] + 0.0722*d[i+2];
    let r = (l + (d[i]  -l)*sat - 128)*contrast + 128;
    let gg= (l + (d[i+1]-l)*sat - 128)*contrast + 128;
    let b = (l + (d[i+2]-l)*sat - 128)*contrast + 128;
    r *= bright; gg *= bright; b *= bright;
    d[i]   = Math.max(0, Math.min(255, r + warm*12));
    d[i+1] = Math.max(0, Math.min(255, gg + warm*3));
    d[i+2] = Math.max(0, Math.min(255, b - warm*12));
  }
  g.putImageData(im, 0, 0);
  if (o.haze){                     // 窗外：顶部一层暖雾
    const hg = g.createLinearGradient(0, 0, 0, c.height*0.72);
    hg.addColorStop(0, 'rgba(255,226,178,0.20)');
    hg.addColorStop(1, 'rgba(255,226,178,0)');
    g.globalCompositeOperation = 'screen'; g.fillStyle = hg; g.fillRect(0, 0, c.width, c.height*0.72);
    g.globalCompositeOperation = 'source-over';
  }
  return c;
}
function grayCanvas(src){
  const c = document.createElement('canvas'); c.width = src.width; c.height = src.height;
  const g = c.getContext('2d'); g.drawImage(src, 0, 0);
  const im = g.getImageData(0, 0, c.width, c.height), d = im.data;
  for (let i=0;i<d.length;i+=4){ const v = 0.299*d[i] + 0.587*d[i+1] + 0.114*d[i+2]; d[i]=d[i+1]=d[i+2]=v; }
  g.putImageData(im, 0, 0); return c;
}
function woodGrain(){
  const c = document.createElement('canvas'); c.width = 256; c.height = 512;
  const g = c.getContext('2d');
  g.fillStyle = '#4a3220'; g.fillRect(0, 0, 256, 512);
  for (let i=0;i<220;i++){
    const x = Math.random()*256, w = 0.5 + Math.random()*2.4;
    g.strokeStyle = `rgba(${Math.random()>0.5?26:110},${Math.random()>0.5?16:78},8,${0.04+Math.random()*0.13})`;
    g.lineWidth = w; g.beginPath(); g.moveTo(x, 0);
    g.bezierCurveTo(x+Math.random()*8-4, 170, x+Math.random()*8-4, 340, x+Math.random()*8-4, 512);
    g.stroke();
  }
  return c;
}
function softBlob(){
  const c = document.createElement('canvas'); c.width = c.height = 128;
  const g = c.getContext('2d');
  const grd = g.createRadialGradient(64,64,2,64,64,62);
  grd.addColorStop(0.00,'rgba(255,252,246,0.9)');
  grd.addColorStop(0.35,'rgba(245,238,224,0.42)');
  grd.addColorStop(0.72,'rgba(228,220,206,0.10)');
  grd.addColorStop(1.00,'rgba(220,215,205,0)');
  g.fillStyle = grd; g.fillRect(0,0,128,128);
  const t = new T.CanvasTexture(c); t.colorSpace = T.SRGBColorSpace;
  t.minFilter = t.magFilter = T.LinearFilter; t.generateMipmaps = false;
  return t;
}
const SOFT_TEX = softBlob();
function radialGlow(){
  const c = document.createElement('canvas'); c.width = c.height = 256;
  const g = c.getContext('2d');
  const grd = g.createRadialGradient(128,128,6,128,128,126);
  grd.addColorStop(0.00,'rgba(255,226,166,0.95)');
  grd.addColorStop(0.28,'rgba(255,188,102,0.42)');
  grd.addColorStop(0.62,'rgba(238,150,64,0.12)');
  grd.addColorStop(1.00,'rgba(220,130,40,0)');
  g.fillStyle = grd; g.fillRect(0,0,256,256);
  const t = new T.CanvasTexture(c); t.colorSpace = T.SRGBColorSpace; return t;
}
function paperTex(){
  const c = document.createElement('canvas'); c.width = 256; c.height = 384;
  const g = c.getContext('2d');
  g.fillStyle = '#d8c9a6'; g.fillRect(0,0,256,384);
  for (let i=0;i<2600;i++){
    g.fillStyle = `rgba(${Math.random()>0.5?120:255},${Math.random()>0.5?105:240},80,${Math.random()*0.06})`;
    g.fillRect(Math.random()*256, Math.random()*384, 1+Math.random()*9, 0.6);
  }
  const grd = g.createLinearGradient(0,0,0,384);
  grd.addColorStop(0,'rgba(90,70,40,0.16)'); grd.addColorStop(0.5,'rgba(255,245,215,0.05)');
  grd.addColorStop(1,'rgba(90,70,40,0.18)');
  g.fillStyle = grd; g.fillRect(0,0,256,384);
  const t = new T.CanvasTexture(c); t.colorSpace = T.SRGBColorSpace; return t;
}
function beamTex(){
  const w=128, h=256, c=document.createElement('canvas'); c.width=w; c.height=h;
  const g=c.getContext('2d'), im=g.createImageData(w,h), d=im.data;
  for (let y=0;y<h;y++) for (let x=0;x<w;x++){
    const u=(x-w/2)/(w*0.34), v=y/h;
    const a=Math.exp(-u*u*1.6)*Math.pow(Math.sin(Math.PI*v),1.4)*0.6;
    const i=(y*w+x)*4;
    d[i]=255; d[i+1]=226; d[i+2]=178; d[i+3]=Math.round(a*255);
  }
  g.putImageData(im,0,0);
  const t=new T.CanvasTexture(c); t.colorSpace=T.SRGBColorSpace; return t;
}
function foliageTex(){
  const c = document.createElement('canvas'); c.width = 512; c.height = 256;
  const g = c.getContext('2d');
  g.filter = 'blur(16px)';
  for (let i=0;i<26;i++){
    const x = Math.random()*512, y = 130 + Math.random()*150, r = 22 + Math.random()*54;
    g.fillStyle = `rgba(24,42,30,${0.28+Math.random()*0.34})`;
    g.beginPath(); g.ellipse(x, y, r, r*0.62, Math.random()*0.6-0.3, 0, Math.PI*2); g.fill();
  }
  g.filter = 'none';
  g.globalCompositeOperation = 'destination-in';
  const m = g.createLinearGradient(0, 0, 0, 256);
  m.addColorStop(0,'rgba(0,0,0,0)'); m.addColorStop(0.42,'rgba(0,0,0,0.5)');
  m.addColorStop(0.78,'rgba(0,0,0,1)'); m.addColorStop(1,'rgba(0,0,0,0)');
  g.fillStyle = m; g.fillRect(0,0,512,256);
  const t = new T.CanvasTexture(c); t.colorSpace = T.SRGBColorSpace; return t;
}
function rushTex(){
  const c = document.createElement('canvas'); c.width = c.height = 512;
  const g = c.getContext('2d');
  const grd = g.createRadialGradient(256,256,10,256,256,256);
  grd.addColorStop(0,'#c9ae7c'); grd.addColorStop(0.7,'#a98d5c'); grd.addColorStop(1,'#6d5636');
  g.fillStyle = grd; g.fillRect(0,0,512,512);
  for (let r=16;r<250;r+=6.5){
    g.strokeStyle = `rgba(${r%26<13?70:225},${r%26<13?52:205},${r%26<13?26:160},0.20)`;
    g.lineWidth = 2.2; g.beginPath(); g.arc(256,256,r,0,Math.PI*2); g.stroke();
  }
  for (let a=0;a<360;a+=2.1){
    const rad = a*Math.PI/180;
    g.strokeStyle = 'rgba(60,44,22,0.13)'; g.lineWidth = 1;
    g.beginPath(); g.moveTo(256+Math.cos(rad)*18, 256+Math.sin(rad)*18);
    g.lineTo(256+Math.cos(rad)*250, 256+Math.sin(rad)*250); g.stroke();
  }
  const t = new T.CanvasTexture(c); t.colorSpace = T.SRGBColorSpace; return t;
}
function inkScrollTex(){
  const c = document.createElement('canvas'); c.width = 384; c.height = 768;
  const g = c.getContext('2d');
  g.fillStyle = '#e8dfc8'; g.fillRect(0,0,384,768);
  for (let i=0;i<900;i++){ g.fillStyle = `rgba(120,100,70,${Math.random()*0.045})`; g.fillRect(Math.random()*384,Math.random()*768,2,2); }
  const ranges = [
    {y:520, col:'rgba(52,62,68,0.16)', amp:130},
    {y:560, col:'rgba(44,55,62,0.24)', amp:105},
    {y:610, col:'rgba(32,42,50,0.34)', amp:82},
    {y:665, col:'rgba(24,32,38,0.46)', amp:58},
  ];
  for (const r of ranges){
    g.fillStyle = r.col; g.beginPath(); g.moveTo(0,768);
    for (let x=0;x<=384;x+=12){
      const y = r.y - Math.sin(x*0.019+r.y)*r.amp*0.42 - Math.sin(x*0.047)*r.amp*0.22 - Math.random()*8;
      g.lineTo(x,y);
    }
    g.lineTo(384,768); g.closePath(); g.fill();
  }
  g.fillStyle = 'rgba(232,223,200,0.55)';
  for (let k=0;k<4;k++) g.fillRect(0, 470+k*62+Math.random()*20, 384, 18+Math.random()*16);
  g.strokeStyle = 'rgba(30,44,40,0.62)';
  for (const tx of [72, 128, 286]){
    const ty = 640 - Math.random()*40;
    g.lineWidth = 2.4; g.beginPath(); g.moveTo(tx,ty+46); g.lineTo(tx,ty-12); g.stroke();
    for (let b=0;b<4;b++){
      g.beginPath(); g.moveTo(tx,ty+b*10); g.lineTo(tx-13-b*4,ty+b*10-9); g.stroke();
      g.beginPath(); g.moveTo(tx,ty+b*10); g.lineTo(tx+13+b*4,ty+b*10-9); g.stroke();
    }
  }
  g.fillStyle = '#a8322a'; g.fillRect(40, 96, 30, 30);
  g.fillStyle = 'rgba(232,223,200,0.9)'; g.font = '18px serif'; g.fillText('禅', 44, 120);
  g.strokeStyle = 'rgba(96,76,48,0.6)'; g.lineWidth = 8; g.strokeRect(14,14,356,740);
  const t = new T.CanvasTexture(c); t.colorSpace = T.SRGBColorSpace; return t;
}

/* ============ 材质 ============ */
const wallMat   = new T.MeshStandardMaterial({ color:0x5a4530, roughness:0.88 });
const floorMat  = new T.MeshStandardMaterial({ color:0x4a3826, roughness:0.84, metalness:0.02 });
const altarMat  = new T.MeshStandardMaterial({ color:0x77705e, roughness:0.94 });
const windowMat  = new T.MeshBasicMaterial({ color:0xffffff, side:T.DoubleSide });
const windowMatB = new T.MeshBasicMaterial({ color:0xffffff, side:T.DoubleSide });

const grainTex = new T.CanvasTexture(woodGrain());
grainTex.wrapS = grainTex.wrapT = T.RepeatWrapping;
const timber     = new T.MeshStandardMaterial({ color:0x3d2817, roughness:0.82, bumpMap:grainTex, bumpScale:0.012 });
const timberDark = new T.MeshStandardMaterial({ color:0x28190e, roughness:0.88, bumpMap:grainTex, bumpScale:0.010 });
const timberWarm = new T.MeshStandardMaterial({ color:0x553621, roughness:0.78, bumpMap:grainTex, bumpScale:0.012 });

const gild     = new T.MeshStandardMaterial({ color:0x8c6a35, metalness:0.58, roughness:0.44 });
const gildHi   = new T.MeshStandardMaterial({ color:0xb4904f, metalness:0.62, roughness:0.36 });
const gildDark = new T.MeshStandardMaterial({ color:0x5e4523, metalness:0.45, roughness:0.58 });
const clothRed = new T.MeshStandardMaterial({ color:0x5a1c18, roughness:0.92, side:T.DoubleSide });

const texLoader = new T.TextureLoader();
function applyTex(url, mat, repeat, opt){
  const o = opt || {};
  texLoader.load(url + '?v=' + ASSET_VER, (tx)=>{
    const img = tx.image;
    const base = document.createElement('canvas'); base.width = img.width; base.height = img.height;
    base.getContext('2d').drawImage(img, 0, 0);
    const graded = gradeCanvas(base, o);
    const map = new T.CanvasTexture(graded);
    map.wrapS = map.wrapT = T.RepeatWrapping;
    map.repeat.set(o.flip ? -repeat[0] : repeat[0], repeat[1]);
    if (o.flip) map.offset.x = 1;          // 右窗水平镜像，避免两扇窗景一模一样
    map.colorSpace = T.SRGBColorSpace;
    map.anisotropy = Math.min(8, renderer.capabilities.getMaxAnisotropy());
    mat.map = map; mat.color.set(0xffffff);
    if (!o.noBump){
      const bump = new T.CanvasTexture(grayCanvas(graded));
      bump.wrapS = bump.wrapT = T.RepeatWrapping;
      bump.repeat.set(repeat[0], repeat[1]);
      mat.bumpMap = bump;
      mat.bumpScale = o.bump ?? 0.022;
    }
    mat.needsUpdate = true;
    tx.dispose();
  }, undefined, ()=>console.warn('[贴图缺失，回退程序化颜色]', url));
}
applyTex(TEX.wall,   wallMat,   [1.8, 1.0], { sat:0.42, bright:0.60, contrast:1.10, warm:0.5, bump:0.030 });
applyTex(TEX.floor,  floorMat,  [2.4, 3.0], { sat:0.68, bright:0.72, contrast:1.10, warm:0.2, bump:0.016 });
applyTex(TEX.altar,  altarMat,  [1.6, 1.0], { sat:0.55, bright:0.66, contrast:1.08, bump:0.045 });
applyTex(TEX.window, windowMat,  [1, 1], { sat:0.82, bright:1.08, contrast:1.03, haze:true, noBump:true });
applyTex(TEX.window, windowMatB, [1, 1], { sat:0.82, bright:1.06, contrast:1.03, haze:true, noBump:true, flip:true });

/* ============ 几何工具 ============ */
function box(w,h,d,mat,cast){
  const m = new T.Mesh(new T.BoxGeometry(w,h,d), mat);
  m.castShadow = cast !== false; m.receiveShadow = true; return m;
}
function addBox(w,h,d,mat,x,y,z,cast){ const m = box(w,h,d,mat,cast); m.position.set(x,y,z); scene.add(m); return m; }

/* ============ 房间：地面 / 顶 / 侧墙 ============ */
const floor = addBox(ROOM.w, 0.2, ROOM.d, floorMat, 0, -0.1, 0, false);
const ceil  = addBox(ROOM.w, 0.22, ROOM.d, timberDark, 0, ROOM.h+0.02, 0, false);

const left  = addBox(WT, ROOM.h, ROOM.d, wallMat, -ROOM.w/2, ROOM.h/2, 0);
const right = addBox(WT, ROOM.h, ROOM.d, wallMat,  ROOM.w/2, ROOM.h/2, 0);

/* 梁架：三根纵向主梁 + 横向檩条 */
for (let i=-1;i<=1;i++) addBox(0.34, 0.40, ROOM.d, timber, i*2.6, ROOM.h-0.30, 0, false);
for (let i=-4;i<=4;i++) addBox(ROOM.w, 0.15, 0.19, timberDark, 0, ROOM.h-0.13, i*1.2, false);

/* 立柱 / 腰线 / 踢脚：把整面平铺墙拆成木构开间 */
for (const sx of [-1, 1]){
  const x = sx*(ROOM.w/2 - 0.14);
  for (let z=-5.0; z<=5.0; z+=2.5){
    addBox(0.20, ROOM.h, 0.20, timberDark, x, ROOM.h/2, z);
    addBox(0.30, 0.22, 0.30, timberWarm, x, ROOM.h-0.30, z);   // 柱头
  }
  for (const y of [1.12, 3.02]) addBox(0.16, 0.13, ROOM.d, timberWarm, x + sx*0.02, y, 0);
  addBox(0.14, 0.24, ROOM.d, timberDark, x, 0.12, 0);
}
addBox(0.18, ROOM.h, 0.18, timberDark, 0, ROOM.h/2, WZ+0.15);   // 中央壁柱（不穿过窗洞）

/* ============ 背墙：为两扇窗留出真洞口 ============ */
const WIN = { w:2.4, h:1.5, y:2.05, cx:[-3, 3] };
const wy0 = WIN.y - WIN.h/2, wy1 = WIN.y + WIN.h/2;      // 1.30 / 2.80
for (const seg of [[-4.5,-4.2],[-1.8,1.8],[4.2,4.5]]){
  addBox(seg[1]-seg[0], ROOM.h, WT, wallMat, (seg[0]+seg[1])/2, ROOM.h/2, WZ);
}
for (const cx of WIN.cx){
  addBox(WIN.w, ROOM.h-wy1, WT, wallMat, cx, (ROOM.h+wy1)/2, WZ);
  addBox(WIN.w, wy0,        WT, wallMat, cx, wy0/2,             WZ);
}
/* 入口墙 */
addBox(ROOM.w, ROOM.h, WT, wallMat, 0, ROOM.h/2, FZ);
addBox(ROOM.w, 0.34, 0.30, timberDark, 0, 3.26, FZ-0.22);
for (const sx of [-1, 1]){
  addBox(0.20, 3.20, 0.28, timberDark, sx*2.10, 1.60, FZ-0.20);
  const door = addBox(1.98, 3.02, 0.10, timberDark, sx*1.05, 1.51, FZ-0.14);
  addBox(1.56, 2.30, 0.045,
    new T.MeshStandardMaterial({ map:paperTex(), roughness:0.98, emissive:0x2a2114, emissiveIntensity:0.32 }),
    sx*1.05, 1.58, FZ-0.205, false);
  for (const yy of [0.62, 1.58, 2.54]) addBox(1.74, 0.055, 0.06, timber, sx*1.05, yy, FZ-0.235);
  const ring = new T.Mesh(new T.TorusGeometry(0.075, 0.019, 8, 18), gildHi);
  ring.position.set(sx*0.17, 1.50, FZ-0.25); scene.add(ring);
  door.receiveShadow = true;
}
/* 门缝里透进来的一线冷光 */
const seam = new T.Mesh(new T.PlaneGeometry(0.035, 2.95),
  new T.MeshBasicMaterial({ color:0xd9e6f2, transparent:true, opacity:0.55 }));
seam.position.set(0, 1.50, FZ-0.205); scene.add(seam);
/* 门侧布帘 */
const curtain = new T.Mesh(new T.PlaneGeometry(0.62, 2.30), clothRed);
curtain.position.set(-2.55, 1.92, FZ-0.25); curtain.rotation.y = 0.12; scene.add(curtain);

/* ============ 窗：凹进墙洞 + 会投影的窗棂 ============ */
const FOLIAGE = foliageTex();
function makeWindow(cx, paneMat){
  const g = new T.Group();
  /* 窗外景放在洞口外侧，天光从它后面穿过 */
  const pane = new T.Mesh(new T.PlaneGeometry(WIN.w+0.24, WIN.h+0.20), paneMat);
  pane.position.z = -0.16; g.add(pane);
  /* 窗洞外的柔光晕 */
  const bloom = new T.Mesh(new T.PlaneGeometry(WIN.w*1.9, WIN.h*1.9),
    new T.MeshBasicMaterial({ map:radialGlow(), transparent:true, opacity:0.16,
      blending:T.AdditiveBlending, depthWrite:false, side:T.DoubleSide }));
  bloom.position.z = -0.14; g.add(bloom);
  /* 近景枝叶，边缘用 alpha 渐变化掉，不再出现硬边矩形 */
  const near = new T.Mesh(new T.PlaneGeometry(WIN.w*1.02, WIN.h*0.70),
    new T.MeshBasicMaterial({ map:FOLIAGE, transparent:true, opacity:0.72, depthWrite:false, side:T.DoubleSide }));
  near.position.set(0, -WIN.h*0.30, -0.10); g.add(near);
  /* 窗框（投影） */
  const t = 0.085;
  g.add(box(WIN.w+0.38, 0.16, 0.24, timber, true)); g.children[g.children.length-1].position.set(0,  WIN.h/2+0.09, 0.02);
  g.add(box(WIN.w+0.38, 0.20, 0.30, timber, true)); g.children[g.children.length-1].position.set(0, -WIN.h/2-0.10, 0.05);
  g.add(box(0.16, WIN.h+0.34, 0.24, timber, true)); g.children[g.children.length-1].position.set(-WIN.w/2-0.08, 0, 0.02);
  g.add(box(0.16, WIN.h+0.34, 0.24, timber, true)); g.children[g.children.length-1].position.set( WIN.w/2+0.08, 0, 0.02);
  /* 窗棂：竖三横二，全部投影 */
  for (let i=-1;i<=1;i++){
    const m = box(t, WIN.h, 0.12, timberDark, true); m.position.set(i*WIN.w/4, 0, 0.08); g.add(m);
  }
  for (let i=-1;i<=1;i+=2){
    const m = box(WIN.w, t, 0.12, timberDark, true); m.position.set(0, i*WIN.h/4, 0.08); g.add(m);
  }
  /* 窗台 */
  const sill = box(WIN.w+0.52, 0.10, 0.42, timberWarm, true); sill.position.set(0, -WIN.h/2-0.22, 0.18); g.add(sill);
  g.position.set(cx, WIN.y, WZ+0.14);   // 窗框在墙内表面之前，窗景凹进洞口
  scene.add(g);
}
makeWindow(WIN.cx[0], windowMat); makeWindow(WIN.cx[1], windowMatB);

/* 落地窗光：柔和椭圆，不再是硬边矩形 */
for (const cx of WIN.cx){
  const p = new T.Mesh(new T.PlaneGeometry(3.5, 4.6),
    new T.MeshBasicMaterial({ map:SOFT_TEX, color:0xbcd2ee, transparent:true, opacity:0.13,
      blending:T.AdditiveBlending, depthWrite:false }));
  p.rotation.x = -Math.PI/2; p.position.set(cx*0.72, 0.012, 0.4); scene.add(p);
}
/* 窗下的柔光尘柱：alpha 四边都衰减到 0，不会出现硬边矩形 */
const BEAM = beamTex();
for (const cx of WIN.cx){
  const beam = new T.Mesh(new T.PlaneGeometry(2.9, 5.4),
    new T.MeshBasicMaterial({ map:BEAM, transparent:true, opacity:0.075,
      blending:T.AdditiveBlending, depthWrite:false, side:T.DoubleSide }));
  beam.position.set(cx, 1.70, -4.20);
  beam.rotation.x = -0.55; scene.add(beam);
}
/* ============ 左墙：水墨挂轴 ============ */
const scroll = new T.Mesh(new T.PlaneGeometry(1.18, 2.42),
  new T.MeshStandardMaterial({ map:inkScrollTex(), roughness:0.95, side:T.DoubleSide }));
scroll.position.set(-ROOM.w/2+0.18, 2.26, -1.05);
scroll.rotation.y = Math.PI/2; scene.add(scroll);
for (const sy of [-1,1]){
  const rod = box(0.13, 0.11, 1.36, timberDark, true);
  rod.position.set(-ROOM.w/2+0.20, 2.26+sy*1.24, -1.05); scene.add(rod);
}
/* 经柜 + 香炉 */
addBox(1.55, 0.86, 0.58, timberDark, -ROOM.w/2+0.48, 0.43, 1.55);
addBox(1.62, 0.07, 0.66, timberWarm, -ROOM.w/2+0.48, 0.89, 1.55);
for (const z of [1.36,1.74]) addBox(1.30,0.036,0.05,timber,-ROOM.w/2+0.18,0.50,z,false);
const miniCenser = new T.Mesh(new T.CylinderGeometry(0.15,0.12,0.16,18), gildDark);
miniCenser.position.set(-ROOM.w/2+0.48, 1.00, 1.55); miniCenser.castShadow = true; scene.add(miniCenser);

/* ============ 右墙：长凳 + 经卷 ============ */
addBox(2.80, 0.46, 0.66, timberDark, ROOM.w/2-0.48, 0.23, -0.55);
addBox(2.90, 0.09, 0.76, timberWarm, ROOM.w/2-0.48, 0.50, -0.55);
addBox(0.62, 0.13, 0.44, clothRed, ROOM.w/2-0.62, 0.61, -0.55);
for (const z of [-0.95,-0.18]) addBox(0.16,0.46,0.16,timberDark,ROOM.w/2-0.80,0.23,z);

/* ============ 供桌（照片里正前的矮桌，非佛坛高台） ============ */
const ALTAR_Z = WZ + 1.10;             // -4.40（保留变量供阴影/背景引用，不再造高台）
const TABLE_Z = WZ + 2.40;             // -3.10

/* ============ 供桌 / 供器 ============ */
/* 参考照片里并没有佛像或佛坛高台，只有一张低矮供桌，上置香炉、供碗与烛台。 */
addBox(3.20, 0.14, 1.00, timber, 0, 0.95, TABLE_Z);
addBox(3.34, 0.055, 1.10, timberWarm, 0, 1.03, TABLE_Z);
addBox(3.02, 0.24, 0.88, timberDark, 0, 0.79, TABLE_Z);
for (const sx of [-1,1]) for (const sz of [-1,1])
  addBox(0.17, 0.92, 0.17, timberDark, sx*1.42, 0.46, TABLE_Z+sz*0.36);

/* 香炉：小型带盖青铜炉，压暗缩小，避免抢主尊 */
const censer = new T.Group();
const bowl = new T.Mesh(new T.CylinderGeometry(0.26, 0.21, 0.24, 28), gildDark);
bowl.castShadow = bowl.receiveShadow = true; censer.add(bowl);
const rimBand = new T.Mesh(new T.TorusGeometry(0.255, 0.016, 8, 28), gildHi);
rimBand.rotation.x = Math.PI/2; rimBand.position.y = 0.112; censer.add(rimBand);
const lid = new T.Mesh(new T.SphereGeometry(0.255, 28, 14, 0, Math.PI*2, 0, Math.PI/2), gild);
lid.scale.y = 0.46; lid.position.y = 0.115; lid.castShadow = true; censer.add(lid);
const knob = new T.Mesh(new T.SphereGeometry(0.045, 14, 12), gildHi);
knob.position.y = 0.240; censer.add(knob);
for (let k=0;k<3;k++){
  const a=k/3*Math.PI*2;
  const foot=new T.Mesh(new T.CylinderGeometry(0.032,0.032,0.14,8),gildDark);
  foot.position.set(Math.cos(a)*0.18,-0.18,Math.sin(a)*0.18); censer.add(foot);
}
for (const sx of [-1,1]){
  const h = new T.Mesh(new T.TorusGeometry(0.085,0.018,8,18,Math.PI), gildHi);
  h.position.set(sx*0.27,0.07,0); h.rotation.y=Math.PI/2; censer.add(h);
}
censer.position.set(0, 1.22, TABLE_Z); scene.add(censer);

/* 供碗 */
for (const sx of [-1,1]){
  const b = new T.Mesh(new T.SphereGeometry(0.15,20,12,0,Math.PI*2,0,Math.PI/2), gildHi);
  b.rotation.x = Math.PI; b.position.set(sx*0.62, 1.10, TABLE_Z+0.02); b.castShadow=true; scene.add(b);
  const foot = new T.Mesh(new T.CylinderGeometry(0.09,0.07,0.05,16), gildDark);
  foot.position.set(sx*0.62, 1.055, TABLE_Z+0.02); scene.add(foot);
}

/* 烛台 */
const candles = [];
function makeCandle(x){
  const g = new T.Group();
  const base = new T.Mesh(new T.CylinderGeometry(0.13,0.17,0.08,18), gildDark); g.add(base);
  const stem = new T.Mesh(new T.CylinderGeometry(0.035,0.05,0.30,12), gild); stem.position.y=0.19; g.add(stem);
  const wax  = new T.Mesh(new T.CylinderGeometry(0.052,0.058,0.30,12),
    new T.MeshStandardMaterial({color:0xd9c096,roughness:0.92})); wax.position.y=0.47; g.add(wax);
  const flame = new T.Mesh(new T.ConeGeometry(0.048,0.15,12),
    new T.MeshBasicMaterial({color:0xffd18a})); flame.position.y=0.70; g.add(flame);
  const core = new T.Mesh(new T.SphereGeometry(0.028,12,10),
    new T.MeshBasicMaterial({color:0xfff3d2})); core.position.y=0.67; g.add(core);
  const glow = new T.Mesh(new T.PlaneGeometry(0.52,0.52),
    new T.MeshBasicMaterial({map:SOFT_TEX,color:0xffb45e,transparent:true,opacity:0.55,
      depthWrite:false,blending:T.AdditiveBlending,side:T.DoubleSide}));
  glow.position.y=0.70; g.add(glow);
  const pl = new T.PointLight(0xffb762, 7, 5.5, 2); pl.position.y=0.72; g.add(pl);
  g.position.set(x, 1.06, TABLE_Z);
  g.userData={flame,light:pl,glow}; scene.add(g); candles.push(g); return g;
}
makeCandle(-1.22); makeCandle(1.22);

/* ============ 墙边矮几与油灯：参考图左侧的那一盏暖光 ============ */
{
  const gt = new T.Group();
  const top = new T.Mesh(new T.BoxGeometry(0.80,0.06,0.54), timber);
  top.position.y=0.44; top.castShadow=top.receiveShadow=true; gt.add(top);
  for (const sx of [-1,1]) for (const sz of [-1,1]){
    const leg = new T.Mesh(new T.BoxGeometry(0.07,0.42,0.07), timberDark);
    leg.position.set(sx*0.31,0.21,sz*0.19); leg.castShadow=true; gt.add(leg);
  }
  const bowlL = new T.Mesh(new T.CylinderGeometry(0.11,0.075,0.07,20), gildDark);
  bowlL.position.y=0.51; bowlL.castShadow=true; gt.add(bowlL);
  const flameL = new T.Mesh(new T.ConeGeometry(0.035,0.11,10),
    new T.MeshBasicMaterial({color:0xffd97e}));
  flameL.position.y=0.60; gt.add(flameL);
  const coreL = new T.Mesh(new T.SphereGeometry(0.02,10,8),
    new T.MeshBasicMaterial({color:0xfff3d2}));
  coreL.position.y=0.575; gt.add(coreL);
  const glowL = new T.Mesh(new T.PlaneGeometry(0.52,0.52),
    new T.MeshBasicMaterial({map:SOFT_TEX,color:0xffb45e,transparent:true,opacity:0.55,
      depthWrite:false,blending:T.AdditiveBlending,side:T.DoubleSide}));
  glowL.position.y=0.60; gt.add(glowL);
  const plL = new T.PointLight(0xffab52, 9, 7.5, 2); plL.position.y=0.66; gt.add(plL);
  gt.position.set(-ROOM.w/2+0.62, 0, 0.35);
  gt.userData={flame:flameL,light:plL,glow:glowL};
  scene.add(gt); candles.push(gt);   // 借烛火的呼吸动画一起摇曳
}

/* ============ 蒲团：草编蒲草垫（居中，照 AI 参考图的房间布置） ============ */
const CUSHION = { x: 0, z: 0.5 };
/* 地上先铺一张大圆草席，蒲团放在正中——坐下环视时四壁等距 */
const rushMat = new T.MeshStandardMaterial({ map:rushTex(), roughness:0.95 });
const rushMat2 = new T.MeshStandardMaterial({ map:rushTex(), roughness:0.97, color:0xcbb98a });
const bigMat = new T.Mesh(new T.CylinderGeometry(1.62, 1.66, 0.045, 56), rushMat2);
bigMat.position.set(CUSHION.x, 0.023, CUSHION.z);
bigMat.receiveShadow = true; scene.add(bigMat);
const cushion = new T.Mesh(new T.CylinderGeometry(0.58, 0.62, 0.19, 48), rushMat);
cushion.position.set(CUSHION.x, 0.095, CUSHION.z);
cushion.castShadow = cushion.receiveShadow = true; scene.add(cushion);
const edge = new T.Mesh(new T.TorusGeometry(0.585, 0.052, 10, 48),
  new T.MeshStandardMaterial({ color:0x5a2320, roughness:0.93 }));
edge.rotation.x = Math.PI/2; edge.position.set(CUSHION.x, 0.11, CUSHION.z);
edge.castShadow = true; scene.add(edge);
const tuft = new T.Mesh(new T.SphereGeometry(0.035,12,10),
  new T.MeshStandardMaterial({color:0x4a3020,roughness:0.9}));
tuft.position.set(CUSHION.x, 0.193, CUSHION.z); scene.add(tuft);
const SIT_TRIGGER = 1.85;

/* ============ 接触阴影 + 灯下暖光池 ============
   真实阴影负责窗格，柔和的接触阴影负责「物件压在地上」的重量感。 */
function contactShadow(x,z,w,h,op){
  const m = new T.Mesh(new T.PlaneGeometry(w,h),
    new T.MeshBasicMaterial({ map:SOFT_TEX, color:0x150c06, transparent:true,
      opacity:op||0.42, depthWrite:false }));
  m.rotation.x = -Math.PI/2; m.position.set(x, 0.014, z); scene.add(m);
}
contactShadow(0, ALTAR_Z, 5.4, 2.8, 0.48);
contactShadow(0, TABLE_Z, 3.9, 1.9, 0.42);
contactShadow(CUSHION.x, CUSHION.z, 3.6, 3.6, 0.42);
contactShadow(ROOM.w/2-0.48, -0.55, 3.2, 1.25, 0.32);
const warmPool = new T.Mesh(new T.PlaneGeometry(4.4, 5.0),
  new T.MeshBasicMaterial({ map:SOFT_TEX, color:0xffa45a, transparent:true,
    opacity:0.085, blending:T.AdditiveBlending, depthWrite:false }));
warmPool.rotation.x = -Math.PI/2; warmPool.position.set(0, 0.010, 0.35); scene.add(warmPool);

/* ============ 空气感：浮尘 / 香烟 ============ */
const dustCount = 200;
const dustGeo = new T.BufferGeometry();
const dustPos = new Float32Array(dustCount*3), dustSeed = new Float32Array(dustCount*2);
for (let i=0;i<dustCount;i++){
  dustPos[i*3]   = (Math.random()-0.5)*ROOM.w*0.94;
  dustPos[i*3+1] = Math.random()*(ROOM.h-0.6)+0.25;
  dustPos[i*3+2] = (Math.random()-0.5)*ROOM.d*0.94;
  dustSeed[i*2]  = Math.random()*Math.PI*2;
  dustSeed[i*2+1]= 0.12+Math.random()*0.45;
}
dustGeo.setAttribute('position', new T.BufferAttribute(dustPos,3));
const dust = new T.Points(dustGeo, new T.PointsMaterial({ color:0xffe0ad, size:0.022,
  transparent:true, opacity:0.55, depthWrite:false, blending:T.AdditiveBlending, sizeAttenuation:true }));
scene.add(dust);

const smoke = [];
const SMOKE_N = 12;
const CENSER_POS = new T.Vector3(0, 1.52, TABLE_Z);   // 炉盖上方，烟从这里升起
for (let i=0;i<SMOKE_N;i++){
  const mat = new T.MeshBasicMaterial({ map:SOFT_TEX, transparent:true, opacity:0,
    depthWrite:false, side:T.DoubleSide, color:0xd8cdbb });
  const s = new T.Mesh(new T.PlaneGeometry(0.40,0.40), mat);
  s.userData.t = i/SMOKE_N; s.userData.phase = Math.random()*Math.PI*2;
  s.position.copy(CENSER_POS); scene.add(s); smoke.push(s);
}

/* ============ 交互 ============ */
let mx=0, my=0, yaw=0, pitch=0, yawT=0, pitchT=0;
let dragging=false, dragDist=0, lastX=0, lastY=0;
/* 坐下后的两种模式：film = AI 影像定妆照 / 视频；live3d = three.js 实时环视 */
let live3d=false, sitYaw=0, sitPitch=0.10, sitYawT=0, sitPitchT=0.10;
const keys = {};
addEventListener('mousemove', e => { mx=(e.clientX/innerWidth)*2-1; my=(e.clientY/innerHeight)*2-1; });
renderer.domElement.addEventListener('pointerdown', e => {
  dragging=true; dragDist=0; lastX=e.clientX; lastY=e.clientY;
});
addEventListener('pointerup', () => { dragging=false; });
addEventListener('pointermove', e => {
  if (!dragging || (sitting && !live3d)) return;
  const dx=e.clientX-lastX, dy=e.clientY-lastY;
  dragDist += Math.abs(dx)+Math.abs(dy);
  if (live3d){
    sitYawT   -= dx*0.0042;
    sitPitchT = Math.max(-0.30, Math.min(0.30, sitPitchT - dy*0.0026));
  } else {
    yawT   = Math.max(-0.95, Math.min(0.95, yawT   - dx*0.0026));
    pitchT = Math.max(-0.30, Math.min(0.30, pitchT - dy*0.0020));
  }
  lastX=e.clientX; lastY=e.clientY;
  wakeHud();
});
addEventListener('keydown', e => {
  keys[e.key.toLowerCase()] = true;
  if (sitting && (e.key==='ArrowLeft'||e.key==='ArrowRight')){
    e.preventDefault();
    if (live3d) sitYawT += (e.key==='ArrowRight' ? 0.26 : -0.26);
    else showPose(poseIdx + (e.key==='ArrowRight'?1:-1));
    return;
  }
  if (e.key==='Escape' && sitting){ exitSit(); return; }
  if (e.key.toLowerCase()==='r'){ yawT=0; pitchT=0; sitYawT=0; sitPitchT=0.10; }
  if (e.key.toLowerCase()==='e' || e.key===' '){
    if (sitting) exitSit();
    else if (distanceToCushion() < SIT_TRIGGER+0.6) enterSit();
  }
});
addEventListener('keyup', e => keys[e.key.toLowerCase()] = false);

function distanceToCushion(){ return Math.hypot(camera.position.x-cushion.position.x, camera.position.z-cushion.position.z); }

/* three.js 实时环视：坐下后不再切成「另一间房」的 AI 影片，
   而是把相机放到蒲团上，在真实三维场景里自由转头。 */
const btnLive3d = document.getElementById('btn-live3d');
function setLive3D(on){
  live3d = on && sitting;
  sitOverlay.classList.toggle('live3d', live3d);
  btnLive3d.textContent = live3d ? '返回影像' : '三维环视';
  cushion.visible = !live3d;
  edge.visible = !live3d;
  tuft.visible = !live3d;
  if (live3d){
    panoCompass.textContent = '三维环视';
    sitYaw = sitYawT = 0; sitPitch = sitPitchT = 0.10;   // 略仰视，让山窗入画
  } else if (sitting){
    showPose(poseIdx);
  }
}
function toggleLive3D(){
  if (!sitting) enterSit();
  setLive3D(!live3d);
}

function enterSit(){
  if(!sitting){
    document.getElementById('btn-exit').textContent='起身 · 静坐 12 秒可获功德';
    endMeditation=meditation('room',amount=>{
      document.getElementById('btn-exit').textContent=amount?'起身 · 功德 +3':'起身';
    });
  }
  sitting = true;
  sitHint.classList.remove('show');
  sitOverlay.classList.add('active');
  setLive3D(false);                       // 默认仍是照片环视模式
  showPose(0);
}
function exitSit(){
  endMeditation?.(); endMeditation=null;
  sitting = false;
  setLive3D(false);
  if (panoCur){ panoCur.style.opacity=0; panoCur=null; }
  poseIdx = 0;
  sitOverlay.classList.remove('active');
  btnLive3d.textContent = '三维环视';
  wakeHud();
}
document.getElementById('btn-exit').onclick = exitSit;
btnLive3d.onclick = toggleLive3D;
panoPrev.onclick = () => showPose(poseIdx-1);
panoNext.onclick = () => showPose(poseIdx+1);
/* 坐下后横向拖动也能转头 */
let sitDragX = null;
sitOverlay.addEventListener('pointerdown', e => { sitDragX=e.clientX; });
sitOverlay.addEventListener('pointerup', e => {
  if (sitDragX===null) return;
  const dx=e.clientX-sitDragX; sitDragX=null;
  if (Math.abs(dx)>70) showPose(poseIdx + (dx<0?1:-1));
});
renderer.domElement.addEventListener('click', () => {
  if (!sitting && dragDist<8 && distanceToCushion() < SIT_TRIGGER) enterSit();
});

document.getElementById('btn-shot').onclick = () => {
  renderer.render(scene,camera);
  const a=document.createElement('a'); a.href=renderer.domElement.toDataURL('image/png');
  a.download='佛堂.png'; a.click();
};

/* ============ 界面闲置淡出 ============ */
const params = new URLSearchParams(location.search);
if (params.get('kiosk')==='1') document.body.classList.add('kiosk');
let hudTimer=null;
function wakeHud(){
  document.body.classList.remove('hud-hidden');
  clearTimeout(hudTimer);
  hudTimer=setTimeout(()=>document.body.classList.add('hud-hidden'), 4500);
}
addEventListener('mousemove', wakeHud);
addEventListener('keydown', wakeHud);
addEventListener('mousedown', wakeHud);
wakeHud();

/* ============ 渲染循环 ============ */
const clock = new T.Clock();
let t = 0;
function animate(){
  requestAnimationFrame(animate);
  const dt = Math.min(clock.getDelta(), 0.05);
  t += dt;

  /* 场景真正渲染出前几帧后再淡出加载遮罩（照片模式由 main.js 负责，三维模式在这里补） */
  if (!animate._bootDone && t > 0.35){
    animate._bootDone = true;
    document.getElementById('loading')?.classList.add('gone');
  }

  if (SHOT_YAW !== null){
    const eye = new T.Vector3(CUSHION.x, 1.35, CUSHION.z);
    const a = SHOT_YAW*Math.PI/180;
    const tgt = new T.Vector3(eye.x+Math.sin(a)*10, 1.15, eye.z-Math.cos(a)*10);
    camera.position.copy(eye); camera.lookAt(tgt);
    cushion.visible = false; edge.visible = false; tuft.visible = false;
    renderer.render(scene, camera); return;
  }
  if (sitting && !live3d) return;

  if (live3d){
    /* 坐姿：相机落在蒲团上，在真实三维场景里连续转头 */
    const k = Math.min(1, dt*7);            // 与帧率无关的平滑，swiftshader 下也不会转不到位
    sitYaw   += (sitYawT  - sitYaw)*k;
    sitPitch += (sitPitchT-sitPitch)*k;
    const eye = new T.Vector3(CUSHION.x, 1.24, CUSHION.z);
    camera.position.copy(eye);
    const d = new T.Vector3(Math.sin(sitYaw), sitPitch*0.8, -Math.cos(sitYaw));
    camera.lookAt(eye.clone().add(d.multiplyScalar(10)));
  } else {
    const sp = 1.9*dt;
    if (keys['w']||keys['arrowup'])   camBase.z -= sp;
    if (keys['s']||keys['arrowdown']) camBase.z += sp;
    if (keys['a']||keys['arrowleft']) camBase.x -= sp;
    if (keys['d']||keys['arrowright'])camBase.x += sp;
    camBase.x = Math.max(-3.5, Math.min(3.5, camBase.x));
    camBase.z = Math.max(-2.6, Math.min(4.8, camBase.z));

    const k = Math.min(1, dt*5);
    yaw   += (yawT  - yaw)*k;
    pitch += (pitchT-pitch)*k;
    const breath = Math.sin(t*0.55)*0.010, swayX = Math.sin(t*0.31)*0.008;
    const tx = camBase.x + mx*0.24 + swayX;
    const ty = camBase.y - my*0.14 + breath;
    camera.position.x += (tx-camera.position.x)*0.06;
    camera.position.y += (ty-camera.position.y)*0.06;
    camera.position.z = camBase.z;
    const q = new T.Quaternion().setFromEuler(new T.Euler(pitch, yaw, 0, 'YXZ'));
    const dir = camLook.clone().sub(camBase).normalize().applyQuaternion(q);
    camera.lookAt(camera.position.clone().add(dir));
  }

  for (const c of candles){
    const k = 0.86 + Math.sin(t*7+c.position.x)*0.08 + Math.sin(t*13.7)*0.05;
    c.userData.light.intensity = 7*k;
    c.userData.flame.scale.y = 0.94 + (k-0.86)*0.9;
    c.userData.glow.scale.setScalar(0.92+(k-0.86)*1.1);
    c.userData.glow.material.opacity = 0.46+(k-0.86)*0.5;
  }
  lamp.intensity = 30*(0.97+Math.sin(t*1.7)*0.03);

  const pa = dustGeo.attributes.position;
  for (let i=0;i<dustCount;i++){
    let y = pa.array[i*3+1] + dustSeed[i*2+1]*0.030*dt;
    if (y > ROOM.h-0.4) y = 0.25;
    pa.array[i*3+1] = y;
    pa.array[i*3]  += Math.sin(t*0.4+dustSeed[i*2])*0.005*dt*60;
  }
  pa.needsUpdate = true;

  for (const s of smoke){
    s.userData.t += dt*0.105;
    if (s.userData.t>1) s.userData.t -= 1;
    const p=s.userData.t, ph=s.userData.phase;
    s.position.y = CENSER_POS.y + p*1.30;
    s.position.x = CENSER_POS.x + Math.sin(p*5.0+ph)*0.30*p;
    s.position.z = CENSER_POS.z + Math.cos(p*3.6+ph)*0.12*p;
    const sc = 0.55+p*1.85; s.scale.set(sc,sc,sc);
    s.material.rotation = ph+p*1.2;
    s.material.opacity = 0.115*Math.sin(Math.PI*Math.min(1,p*1.05));
    s.quaternion.copy(camera.quaternion);
  }

  if (!sitting && distanceToCushion() < SIT_TRIGGER) sitHint.classList.add('show');
  else sitHint.classList.remove('show');
  renderer.render(scene, camera);
}
animate();

addEventListener('resize', () => {
  fitCamera();
  renderer.setSize(innerWidth, innerHeight);
});

/* 调试 / 自动体检钩子 */
window.__zen = {
  info: () => ({
    rev: T.REVISION, objects: scene.children.length,
    shadows: renderer.shadowMap.enabled,
    poses: POSES.map(p=>p.src||'photo'), poseIdx, sitting, live3d,
    cam: camera.position.toArray().map(v=>+v.toFixed(2)),
    textures: ['wall','floor','altar','window'].map(k=>!!({wall:wallMat,floor:floorMat,altar:altarMat,window:windowMat})[k].map),
    calls: renderer.info.render.calls, triangles: renderer.info.render.triangles,
  }),
  pose: i => showPose(i), enter: () => enterSit(), exit: () => exitSit(),
  live: () => toggleLive3D(),
  sitLook: (y,p) => { sitYawT=y; sitPitchT=p ?? 0.10; },
  exposure: v => { renderer.toneMappingExposure = v; },
  look: (y,p) => { yawT=y; pitchT=p; },
  scene, camera, renderer,
};
