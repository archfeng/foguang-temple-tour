import {initFortuneSky} from './fortune-sky.js?v=20261125sky2';
import {progress} from '../progress.js?v=20261125wishes';

const tiers = [
  {value:100,title:'好运锦鲤',cord:'红绳',color:'#ad302b'},
  {value:1000,title:'气运之子',cord:'金绳',color:'#cf943d'}
];
const examples = [
  ['小陈不赶路',100,'我妈嘴上说不累，其实在石阶上歇了三回。希望明年还能陪她来，走慢点也行。',7],
  ['阿鸢',1000,'等外地那份工作回信。成了就去试试，没成也希望我别再跟自己过不去了。',9],
  ['北窗的灯',100,'刚才蹲着看鱼看了好一会儿。希望今晚能睡个整觉，手机就先放远一点。',4],
  ['三楼养猫的',100,'家里那只橘猫挑食好几天了。愿它肯吃饭，也愿屋顶这位猫老大别摔着。',12],
  ['给爸留一根',1000,'上次来是爸走在前头催我，这次换我等他了。希望下回来的时候，他膝盖能少疼一点。',3],
  ['今天没加班',100,'没什么大愿望。周末能按时下班，和朋友吃锅热乎的就好。',17]
].map(([name,tier,message,slot])=>({id:'demo-'+slot,name,tier,message,slot,demo:true}));

const slots = [];
const bays = Math.round((29-2.9)/1.78);
const span = (29-2.9)/bays;
for(const sign of [1,-1]){
  for(let bay=0;bay<bays;bay++){
    for(const fraction of [.18,.34,.50,.66,.82]){
      slots.push(sign*(2.9+(bay+fraction)*span));
    }
  }
}

function browserPlayer(){
  const key='foguang-wish-player';
  const fresh=Array.from(crypto.getRandomValues(new Uint8Array(16)),n=>n.toString(16).padStart(2,'0')).join('');
  try{
    const saved=localStorage.getItem(key);
    if(/^[0-9a-f]{32}$/.test(saved))return saved;
    localStorage.setItem(key,fresh);
  }catch{}
  return fresh;
}

export function initWishes(ctx){
  const T=ctx.T;
  const sky=initFortuneSky(ctx);
  const replay=document.querySelector('#fortune-sky-replay');
  const skyButtons=[...replay.querySelectorAll('[data-sky-tier]')];
  const syncSkyButtons=()=>{
    replay.hidden=progress.data.fortune<100;
    for(const button of skyButtons)button.hidden=progress.data.fortune<Number(button.dataset.skyTier);
  };
  replay.addEventListener('click',event=>{
    const button=event.target.closest('[data-sky-tier]');
    const tier=Number(button?.dataset.skyTier);
    if(!tier||progress.data.fortune<tier)return;
    if(ctx.stage.inHall()){ctx.toast('走到殿外，再看山寺上空的天象。');return;}
    sky.play(tier);
  });

  const player=browserPlayer();
  const dialog=document.querySelector('#wish-dialog');
  const form=dialog.querySelector('form');
  const heading=dialog.querySelector('h2');
  const detail=dialog.querySelector('#wish-detail');
  const name=form.elements.namedItem('guest');
  const message=form.elements.namedItem('wish');
  const action=document.querySelector('#make-wish');
  const note=document.querySelector('#wish-note');
  const submit=form.querySelector('button');
  const mounted=new Map();
  let selected=null;
  let shareSelection=false;
  let shared=null;
  let published=[];
  let saving=false;

  function open(){
    document.exitPointerLock?.();
    dialog.showModal();
  }
  function read(wish,tier){
    if(dialog.open)return;
    heading.textContent=tier.cord+'上的心愿'+(wish.demo?' · 演示':'');
    form.hidden=true;
    detail.hidden=false;
    detail.firstElementChild.textContent=wish.name;
    detail.lastElementChild.textContent=wish.message;
    open();
  }
  function compose(tier){
    if(dialog.open || progress.data.fortune<tier.value)return;
    selected=tier;
    shareSelection=shared===true;
    heading.textContent=tier.title+' · 许愿';
    form.hidden=false;
    detail.hidden=true;
    form.reset();
    note.textContent=shareSelection ? '名字和愿望会展示给同一局域网里游览的玩家。' : '这次许愿将保存在当前浏览器。';
    const visitor=document.querySelector('#visitor-input')?.value.trim();
    if(visitor)name.value=visitor.slice(0,16);
    open();
  }

  function makeCord(wish,slot){
    const tier=tiers.find(t=>t.value===wish.tier);
    const group=ctx.group(ctx.root,[3.28,13.845,slots[slot]]);
    group.userData.noPaint=true;
    const mat=new T.MeshStandardMaterial({color:tier.color,roughness:.65});
    for(let i=0;i<3;i++){
      const loop=new T.Mesh(new T.TorusGeometry(.061,.007,6,16),mat);
      loop.position.z=(i-1)*.016;
      group.add(loop);
    }
    for(const side of [-1,1]){
      const curve=new T.CatmullRomCurve3([
        new T.Vector3(.062,-.015,0),new T.Vector3(.102,-.077,.018*side),
        new T.Vector3(.093,-.17,.043*side),new T.Vector3(.083,-.26,.061*side)
      ]);
      group.add(new T.Mesh(new T.TubeGeometry(curve,8,.009,5,false),mat));
    }
    const pick=new T.Mesh(new T.BoxGeometry(.19,.31,.135),new T.MeshBasicMaterial({visible:false}));
    pick.position.set(.05,-.10,0);
    group.add(pick);
    return ctx.addItem(group,{
      id:'wish-'+wish.id,label:'读'+tier.cord+'上的心愿'+(wish.demo?' · 演示':''),range:1.85,
      aimOnly:true,onHit:()=>read(wish,tier)
    });
  }

  function own(tier){
    return progress.data.wishes[tier.value] || published.find(wish=>wish.id===player+'-'+tier.value);
  }
  function sync(){
    const reserved=new Set(examples.map(wish=>wish.slot));
    const available=slots.map((_,i)=>i).filter(i=>!reserved.has(i));
    const all=[...examples];
    const personal=tiers.flatMap(tier=>{
      const wish=progress.data.wishes[tier.value];
      const id=player+'-'+tier.value;
      return wish&&!published.some(item=>item.id===id) ? [{...wish,id,tier:tier.value}] : [];
    });
    [...published,...personal].forEach((wish,i)=>{
      if(i<available.length)all.push({...wish,slot:available[i]});
    });
    for(const wish of all){
      if(!mounted.has(wish.id))mounted.set(wish.id,makeCord(wish,wish.slot));
      const item=mounted.get(wish.id);
      item.disabled=false;
      item.obj.visible=true;
      item.obj.position.z=slots[wish.slot];
    }
    const ids=new Set(all.map(wish=>wish.id));
    for(const [id,item] of mounted){
      item.disabled=!ids.has(id);
      item.obj.visible=!item.disabled;
    }
    action.hidden=!tiers.some(tier=>progress.data.fortune>=tier.value&&!own(tier));
  }
  function valid(wish){
    return wish && /^[0-9a-f]{32}-(100|1000)$/.test(wish.id) &&
      tiers.some(tier=>tier.value===wish.tier) &&
      typeof wish.name==='string' && wish.name.length<=16 &&
      typeof wish.message==='string' && wish.message.length<=120;
  }
  async function refresh(){
    try{
      const result=await fetch('api/wishes',{cache:'no-store',signal:AbortSignal.timeout(15000)});
      if(!result.ok || !result.headers.get('content-type')?.includes('application/json'))return;
      const rows=await result.json();
      if(!Array.isArray(rows))return;
      shared=true;
      published=rows.filter(valid);
      sync();
    }catch{}
  }

  action.onclick=async()=>{
    await connection;
    const tier=tiers.find(t=>progress.data.fortune>=t.value&&!own(t));
    if(tier)compose(tier);
  };
  form.addEventListener('submit',async event=>{
    event.preventDefault();
    const guest=name.value.trim(), text=message.value.trim();
    const tier=selected;
    if(saving||!tier||!guest||!text||progress.data.fortune<tier.value||own(tier))return;
    saving=true;
    submit.disabled=true;
    try{
      let wish={name:guest,message:text};
      if(shareSelection){
        const response=await fetch('api/wishes',{
          method:'POST',headers:{'Content-Type':'application/json'},signal:AbortSignal.timeout(15000),
          body:JSON.stringify({...wish,tier:tier.value,player})
        });
        const row=await response.json();
        if(!response.ok||!valid(row)){
          note.textContent=row.error||'暂时没能系上，请再试一次。';
          return;
        }
        wish={name:row.name,message:row.message};
        if(!published.some(item=>item.id===row.id))published.push(row);
      }
      progress.data.wishes[tier.value]=wish;
      progress.save(); sync();
      if(dialog.open)dialog.close();
      ctx.toast(tier.cord+'已系在上院的石栏横杆上。',4200);
      if(shareSelection)refresh();
    }catch{
      note.textContent='暂时没能连上许愿簿，请再试一次。';
    }finally{
      saving=false;
      submit.disabled=false;
    }
  });
  dialog.querySelector('#close-wish').onclick=()=>dialog.close();

  const pending=[];

  addEventListener('foguang:fortune',({detail})=>{
    for(const tier of tiers){
      if(detail.previous>=tier.value||detail.fortune<tier.value)continue;
      pending.push(tier.value);
      ctx.toast('获得称号「'+tier.title+'」 · 可以许愿',4600);
    }
    sync();
    syncSkyButtons();
  });
  ctx.frames.push(now=>{
    if(!pending.length||ctx.stage.inHall()||dialog.open)return;
    sky.play(Math.max(...pending));
    pending.length=0;
  });
  const existing=tiers.findLast(tier=>progress.data.fortune>=tier.value&&!own(tier));
  if(existing)pending.push(existing.value);
  syncSkyButtons();
  sync();
  const connection=refresh();
  setInterval(()=>{if(shared)refresh();},7000);
}
