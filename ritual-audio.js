// 香火与签筒的合成音效：全部用 WebAudio 现场生成，不依赖外部音频文件。
let ctx=null;
let master=null;
let noise=null;

function ensure(){
  if(ctx)return ctx;
  const AC=window.AudioContext||window.webkitAudioContext;
  if(!AC)return null;
  ctx=new AC();
  master=ctx.createGain();
  master.gain.value=.34;
  master.connect(ctx.destination);
  const len=Math.floor(ctx.sampleRate*.6);
  noise=ctx.createBuffer(1,len,ctx.sampleRate);
  const d=noise.getChannelData(0);
  for(let i=0;i<len;i++)d[i]=Math.random()*2-1;
  return ctx;
}

// 浏览器要求音频由用户手势触发，这里在按钮点击时先解锁一次。
export function unlock(){
  const c=ensure();
  if(c&&c.state==='suspended')c.resume();
}

// 环境音层借同一个上下文用，别在手机上再开一个硬件音频上下文。
export function shared(){
  const c=ensure();
  return c?{ctx:c,noise}:null;
}

function noiseBurst(when,duration,{gain=.5,freq=1800,q=.8,type='bandpass',attack=.002}={}){
  const c=ensure();
  if(!c)return;
  const src=c.createBufferSource();
  src.buffer=noise;
  const filter=c.createBiquadFilter();
  filter.type=type;filter.frequency.value=freq;filter.Q.value=q;
  const g=c.createGain();
  g.gain.setValueAtTime(0.0001,when);
  g.gain.linearRampToValueAtTime(gain,when+attack);
  g.gain.exponentialRampToValueAtTime(.0001,when+duration);
  src.connect(filter).connect(g).connect(master);
  src.start(when);
  src.stop(when+duration+.02);
}

function tone(when,{freq=880,duration=.5,gain=.2,type='sine',bend=0}={}){
  const c=ensure();
  if(!c)return;
  const osc=c.createOscillator();
  const g=c.createGain();
  osc.type=type;
  osc.frequency.setValueAtTime(freq,when);
  if(bend)osc.frequency.exponentialRampToValueAtTime(Math.max(60,freq*bend),when+duration);
  g.gain.setValueAtTime(0.0001,when);
  g.gain.linearRampToValueAtTime(gain,when+.008);
  g.gain.exponentialRampToValueAtTime(.0001,when+duration);
  osc.connect(g).connect(master);
  osc.start(when);osc.stop(when+duration+.02);
}

export function ignite(){
  const c=ensure();
  if(!c)return;
  const t=c.currentTime+.01;
  // 划火的一下短促摩擦声
  noiseBurst(t,.14,{gain:.20,freq:2600,q:1.2,type:'highpass'});
  noiseBurst(t+.05,.30,{gain:.16,freq:900,q:.7});
  // 火苗立起来的低频呼呼声
  noiseBurst(t+.12,.55,{gain:.10,freq:420,q:.5});
}

export function clatter(times=6){
  const c=ensure();
  if(!c)return;
  const t=c.currentTime+.01;
  for(let i=0;i<times;i++){
    const at=t+i*(.055+Math.random()*.05);
    noiseBurst(at,.075,{gain:.26+Math.random()*.10,freq:1700+Math.random()*1500,q:3.5});
    tone(at+.004,{freq:820+Math.random()*420,duration:.07,gain:.05,type:'triangle',bend:.72});
  }
}

export function chime(){
  const c=ensure();
  if(!c)return;
  const t=c.currentTime+.01;
  tone(t,{freq:1046.5,duration:1.5,gain:.13,type:'sine'});
  tone(t+.02,{freq:1568,duration:1.2,gain:.07,type:'sine'});
  tone(t+.05,{freq:2093,duration:.9,gain:.035,type:'sine'});
}

export function coin(){
  const c=ensure();
  if(!c)return;
  const t=c.currentTime+.01;
  // 铜钱碰木箱
  noiseBurst(t,.06,{gain:.30,freq:1100,q:.7,type:'lowpass'});
  // 金属余振
  tone(t+.012,{freq:2489,duration:.42,gain:.10,type:'triangle',bend:.96});
  tone(t+.020,{freq:3730,duration:.30,gain:.055,type:'sine',bend:.97});
  // 落进箱底的闷响
  noiseBurst(t+.10,.16,{gain:.22,freq:320,q:.6,type:'lowpass'});
  tone(t+.10,{freq:190,duration:.20,gain:.09,type:'sine',bend:.7});
}

export function woodtap(){
  const c=ensure();
  if(!c)return;
  const t=c.currentTime+.01;
  noiseBurst(t,.05,{gain:.22,freq:760,q:.8,type:'lowpass'});
  tone(t,{freq:420,duration:.09,gain:.05,type:'triangle',bend:.8});
}

// 礼拜时的颂钵：低频长余振 + 两个泛音，模拟铜磬被敲一下。
export function bowl(){
  const c=ensure();
  if(!c)return;
  const t=c.currentTime+.01;
  tone(t,{freq:196,duration:3.6,gain:.11,type:'sine'});
  tone(t+.008,{freq:294,duration:2.8,gain:.045,type:'sine'});
  tone(t+.014,{freq:392.5,duration:2.2,gain:.028,type:'sine'});
  tone(t+.022,{freq:588,duration:1.3,gain:.014,type:'sine'});
  noiseBurst(t,.05,{gain:.06,freq:2600,q:1.1,type:'highpass'});
}

// 每次俯身时的一记木鱼。
export function woodfish(){
  const c=ensure();
  if(!c)return;
  const t=c.currentTime+.01;
  noiseBurst(t,.045,{gain:.20,freq:520,q:1.4,type:'lowpass'});
  tone(t,{freq:330,duration:.13,gain:.07,type:'triangle',bend:.72});
  tone(t+.004,{freq:660,duration:.07,gain:.025,type:'sine',bend:.8});
}

// 脚步声：很轻的一下干响，走路时按步频触发。
export function footstep(){
  const c=ensure();
  if(!c)return;
  const t=c.currentTime+.01;
  noiseBurst(t,.055,{gain:.055,freq:1600+Math.random()*900,q:.9,type:'bandpass'});
}

// 祈福起手：一层很低的气声与颂钵底色，像殿里的空气被点亮。
export function shimmer(){
  const c=ensure();
  if(!c)return;
  const t=c.currentTime+.01;
  noiseBurst(t,.95,{gain:.075,freq:1500,q:.6});
  noiseBurst(t+.18,.70,{gain:.05,freq:2900,q:.9,type:'highpass'});
  tone(t,{freq:98,duration:3.2,gain:.075,type:'sine'});
  tone(t+.05,{freq:147,duration:2.4,gain:.032,type:'sine'});
}

// 每拜一次的清磬：音高沿五声音阶一拜一升，拜得越久越亮。
const PENTA=[784,880,987.8,1046.5,1174.7,1318.5,1568];
export function blessBell(step=0){
  const c=ensure();
  if(!c)return;
  const t=c.currentTime+.01;
  const f=PENTA[Math.max(0,Math.min(PENTA.length-1,step))];
  tone(t,{freq:f,duration:2.8,gain:.082,type:'sine'});
  tone(t+.012,{freq:f*2.01,duration:1.6,gain:.030,type:'sine'});
  tone(t+.022,{freq:f*3.02,duration:.95,gain:.013,type:'sine'});
  noiseBurst(t,.05,{gain:.05,freq:3600,q:1.2,type:'highpass'});
}

// 钟楼的大钟：一杵下去，基音沉、泛音非谐、余振六七秒，山谷里才收得住。
export function templeBell(times=1){
  const c=ensure();
  if(!c)return;
  const base=c.currentTime+.02;
  for(let n=0;n<times;n++){
    const t=base+n*3.2;
    // 杵撞铜壁的那一下
    noiseBurst(t,.09,{gain:.22,freq:900,q:.9,type:'lowpass'});
    noiseBurst(t,.06,{gain:.12,freq:2400,q:1.4,type:'highpass'});
    // 基音与它的非谐泛音，钟的音色就靠这几条不整倍的关系
    tone(t,{freq:110,duration:7.2,gain:.16,type:'sine'});
    tone(t+.01,{freq:166,duration:5.6,gain:.085,type:'sine'});
    tone(t+.02,{freq:221,duration:4.6,gain:.055,type:'sine'});
    tone(t+.03,{freq:297,duration:3.4,gain:.032,type:'sine'});
    tone(t+.04,{freq:441,duration:2.4,gain:.016,type:'sine'});
    tone(t+.05,{freq:663,duration:1.6,gain:.009,type:'sine'});
  }
}

// 檐角风铎：几枚小铜片被风碰上，高而短。
const CHIME=[2093,2349,2637,2960,3136];
export function windChime(){
  const c=ensure();
  if(!c)return;
  const t=c.currentTime+.01;
  const n=1+Math.floor(Math.random()*2);
  for(let i=0;i<n;i++){
    const f=CHIME[Math.floor(Math.random()*CHIME.length)];
    tone(t+i*(.07+Math.random()*.12),{freq:f,duration:.9+Math.random()*.7,gain:.028,type:'sine'});
  }
}

// 鸽子：很轻的两声咕咕。
export function dove(){
  const c=ensure();
  if(!c)return;
  const t=c.currentTime+.01;
  for(let i=0;i<2;i++){
    tone(t+i*.24,{freq:392,duration:.17,gain:.035,type:'sine',bend:.86});
    tone(t+i*.24+.02,{freq:196,duration:.20,gain:.022,type:'triangle',bend:.9});
  }
}

