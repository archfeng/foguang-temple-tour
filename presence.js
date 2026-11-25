// 同游：把每位访客的位置广播出去，再把别人的位置画成小像。
// 两种后端二选一：
//   1) 云端（CONFIG 填好 endpoint + publishableKey 时）：跨设备、跨网络，谁都能看见谁。
//   2) 本地（默认）：BroadcastChannel + localStorage，同一个浏览器的多个标签页/窗口互相可见。
// 云端没配置时自动走本地，不会报错，也不影响三维游览。
import {makeAvatar} from './avatar.js?v=20261112h';

const T = window.THREE;
const TABLE = 'foguang_presence';
const CHANNEL = 'foguang-presence';
const PREFIX = 'fg-peer:';

// 云服务开通后填这两项即可切到跨设备同游。
// 公开仓库默认留空：未配置时自动走本地同游，不影响三维游览。
const CONFIG = {
  endpoint:'',
  publishableKey:''
};

const NAMES = ['松风','山径','檐雨','晨光','归林','石阶','瓦当','青灯','晚钟','苔痕','斗栱','经幢','半山','听雪','拾叶','扫云','溪桥','竹外','月下','旧磬','空阶','南廊','西窗','小满'];
const COLORS = ['#c98f5a','#7fa88b','#9c8fc4','#d0a05e','#6f9bb5','#c07f88'];
const TTL = 26000;   // 超过这个时间没有心跳就当作离线
const BEAT = 2400;

const pick = (list,seed)=>list[Math.abs(seed)%list.length];
function hash(text){
  let h=2166136261;
  for(let i=0;i<text.length;i++){h^=text.charCodeAt(i);h=Math.imul(h,16777619);}
  return h>>>0;
}

export function startPresence(scene,camera,opts={}){
  const store=(()=>{try{localStorage.setItem('fg-probe','1');localStorage.removeItem('fg-probe');return localStorage;}catch{return null;}})();
  const cloudReady=!!(CONFIG.endpoint&&CONFIG.publishableKey&&window.WorkBuddyCloud);
  if(!cloudReady&&!store)return null;   // 两种后端都不可用就关闭

  const mine='p'+Math.random().toString(36).slice(2,10)+Date.now().toString(36).slice(-4);
  const nameKey='foguang-name';
  // 没自己取名时按本次会话随机，避免两个标签页重名
  let name=(store&&store.getItem(nameKey))||pick(NAMES,hash(mine));
  const color=pick(COLORS,hash(name+mine));

  const panel=document.querySelector('#visitors');
  const list=document.querySelector('#visitor-list');
  const countEl=document.querySelector('#visitor-count');
  const avatars=new Map();
  const root=new T.Group();scene.add(root);
  let alive=true,reachable=false;

  /* ---------- 后端 ----------
   * 云端管跨设备，本地管同浏览器的标签页，两条一起走：
   * 云端连不上（本地调试、断网、配额）就只剩本地，界面照常，不弹错。
   */
  let bc=null,cloud=null,cloudFail=0,cloudRestAt=0;

  if('BroadcastChannel' in window){
    bc=new BroadcastChannel(CHANNEL);
    bc.onmessage=()=>{ paint(); };
  }

  function localWrite(row){
    if(!store)return;
    try{ store.setItem(PREFIX+row.id,JSON.stringify(row)); }
    catch{
      try{
        const keys=Object.keys(store).filter(k=>k.startsWith(PREFIX));
        keys.slice(0,8).forEach(k=>store.removeItem(k));
        store.setItem(PREFIX+row.id,JSON.stringify(row));
      }catch{}
    }
  }
  function localFetch(){
    if(!store)return [];
    const now=Date.now(),out=[];
    for(const key of Object.keys(store)){
      if(!key.startsWith(PREFIX))continue;
      try{
        const row=JSON.parse(store.getItem(key));
        if(now-row.t<TTL)out.push(row);
        else if(now-row.t>180000)store.removeItem(key);
      }catch{ store.removeItem(key); }
    }
    return out;
  }

  if(cloudReady){
    try{
      cloud=window.WorkBuddyCloud.createWorkBuddyCloud({
        endpoint:CONFIG.endpoint,publishableKey:CONFIG.publishableKey
      });
    }catch{ cloud=null; }
  }

  // 云端行按 updated_at 排序；本地行按 t。合并时统一折算成毫秒时间戳
  const stampOf=row=>row.t||(row.updated_at?Date.parse(row.updated_at):0);

  async function publish(row){
    localWrite(row);
    if(bc){ try{ bc.postMessage({type:'beat',id:row.id}); }catch{} }
    if(!cloud||Date.now()<cloudRestAt)return;
    try{
      const {error}=await cloud.database.from(TABLE).upsert({
        id:row.id,name:row.name,color:row.color,
        x:row.x,y:row.y,z:row.z,updated_at:new Date().toISOString()
      },{onConflict:'id'});
      if(error)throw error;
      cloudFail=0;
    }catch{
      cloudFail++;
      // 连着几次不通就先歇一分钟，别每两秒撞一次
      if(cloudFail>=3){ cloudRestAt=Date.now()+60000; cloudFail=0; }
    }
  }

  async function fetchPeers(){
    const local=localFetch();
    if(!cloud||Date.now()<cloudRestAt)return local;
    try{
      const since=new Date(Date.now()-TTL).toISOString();
      const {data,error}=await cloud.database.from(TABLE)
        .select('id,name,color,x,y,z,updated_at').gte('updated_at',since).limit(24);
      if(error)throw error;
      cloudFail=0;
      // 同一 id 取更新的那条；本地独有的一定要留下，否则同标签页的人会闪掉
      const byId=new Map();
      for(const row of local)byId.set(row.id,row);
      for(const row of (data||[])){
        const old=byId.get(row.id);
        if(!old||stampOf(row)>=stampOf(old))byId.set(row.id,{...row,t:stampOf(row)});
      }
      return [...byId.values()];
    }catch{
      cloudFail++;
      if(cloudFail>=3){ cloudRestAt=Date.now()+60000; cloudFail=0; }
      return local;
    }
  }

  /* ---------- 小像 ---------- */
  function makeAvatarFor(info){
    const built=makeAvatar(info);
    root.add(built.group);
    return {group:built.group,tick:built.tick,target:new T.Vector3(),placed:false};
  }
  function dropAvatar(id){
    const a=avatars.get(id);
    if(!a)return;
    root.remove(a.group);
    a.group.traverse(o=>{
      if(o.geometry)o.geometry.dispose();
      if(o.material){if(o.material.map)o.material.map.dispose();o.material.dispose();}
    });
    avatars.delete(id);
  }

  function render(rows){
    const seen=new Set();
    for(const row of rows){
      if(row.id===mine)continue;
      seen.add(row.id);
      let a=avatars.get(row.id);
      if(!a){ a=makeAvatarFor({name:row.name||'游客',color:row.color||'#9aa88f'}); avatars.set(row.id,a); }
      a.target.set(row.x,row.y,row.z);
      if(!a.placed&&a.target.lengthSq()>0){ a.group.position.copy(a.target); a.placed=true; }
    }
    for(const id of [...avatars.keys()])if(!seen.has(id))dropAvatar(id);
    const items=[`<li class="me"><i style="color:${color}"></i>${name}（你）</li>`];
    for(const row of rows){
      if(row.id===mine)continue;
      items.push(`<li><i style="color:${row.color||'#9aa88f'}"></i>${row.name||'游客'}</li>`);
    }
    list.innerHTML=items.join('');
    countEl.textContent=(avatars.size+1)+' 人';
    panel.hidden=!reachable;
  }

  async function beat(){
    if(!alive)return;
    // 报的是脚下的位置：导览时镜头在天上，但人还是站在地上
    const p=(opts.feet&&opts.feet())||camera.position;
    try{
      await publish({
        id:mine,name,color,
        x:+p.x.toFixed(2),y:+p.y.toFixed(2),z:+p.z.toFixed(2),
        t:Date.now(),updated_at:new Date().toISOString()
      });
    }catch{ reachable=false; panel.hidden=true; }
  }
  async function paint(){
    if(!alive)return;
    try{
      render(await fetchPeers());
      reachable=true;
    }catch{ reachable=false; panel.hidden=true; }
  }

  (async()=>{
    await beat(); await paint();
    setInterval(()=>{beat();},BEAT);
    setInterval(()=>{paint();},1900);
  })();

  addEventListener('pagehide',()=>{
    alive=false;
    try{ if(store)store.removeItem(PREFIX+mine); }catch{}
    // 云端那行留着，26 秒后自然过期；不删是因为游客没有身份，删权限已收回
    if(bc)bc.close();
  });

  const api={
    tick(dt){
      // 远端小人在两帧间滑向目标点：滑多快，步子就迈多快
      const now=performance.now();
      for(const a of avatars.values()){
        const d=a.group.position.distanceTo(a.target);
        a.group.position.lerp(a.target,Math.min(1,dt*3.2));
        if(a.tick)a.tick(now,Math.min(2.6,d*3.2));
      }
    },
    setName(next){
      name=(next||'').slice(0,8)||name;
      if(store)store.setItem(nameKey,name);
      beat();
    },
    me(){ return {id:mine,name,color,mode:cloud?'cloud':'local'}; }
  };

  const form=document.querySelector('#visitor-name');
  const input=document.querySelector('#visitor-input');
  if(form&&input){
    input.value=name;
    form.addEventListener('submit',e=>{
      e.preventDefault();
      api.setName(input.value.trim());
      input.blur();
    });
  }
  return api;
}
