import {progress} from '../progress.js?v=20261125wishes';
/* 互动：寺猫、敲钟、喂鱼、请香、知客问答、扫地僧授武与轻功跳跃。
 * 所有文案与状态都在本模块内，原程序的仪式流程一概不碰。
 */
const CAT_NAMES = ['三花','橘团','乌云','狸花'];
const ASK = [
  { q:'寺里为何这样静', a:'不是山静，是没人催你。\n你从山下来，脚步比钟声还急。站一会儿，风就替你把话答了。' },
  { q:'烧香有用吗',     a:'香不替你说话。\n烟散了，愿还在你自己手里。' },
  { q:'我总放不下',     a:'你攥着的是石头，还是攥了太久的那只手？\n松开手，石头本来就在地上。' },
  { q:'什么是修行',     a:'饿了吃饭，困了睡觉，扫到落叶不怨风。' }
];
const RULES = [
  [/钱|财|工作|忙|累|卷|升职|老板/, '山下把日子切成一段一段，山上只分天亮天黑。\n你不是走得慢，是背了太多明天。'],
  [/病|痛|走|失去|想念|亲人|死|难过/, '殿里的灯也不长明。\n灭过一回的光，才有人记得它亮着的样子。'],
  [/明天|将来|迷茫|不知|选择|焦虑|怎么办/, '路不是想出来的，是走出来的。\n先迈一步，第二步自会来寻你。'],
  [/为什么|意义|值得|人生|活着/, '松不问我为什么长，钟不问我为什么响。\n你也不必样样都答得出来。'],
  [/爱|喜欢|缘|人|朋友/, '缘像檐雨，落下来的时候不挑人。\n接不住，就让它顺着瓦走了。'],
  [/求|愿|保佑|平安|顺/, '菩萨不添也不减。\n你许的愿，其实是答应自己的那句话。'],
  [/气|烦|恨|怨|不公/, '风把叶子吹进院子，扫的人不骂风。\n不是不计较，是知道骂了也还得扫。']
];
const VERSES = [
  '檐雨落了千年，瓦没记住一滴。',
  '山门开着，来的人自己走进来。',
  '松不急着长，年轮也不数。',
  '钟响过之后，静才听得见。',
  '灯不必点给谁看，风来它也不问。',
  '你把日子过成赶路，日子就把你过成脚印。',
  '扫得净的是阶，扫不净的是秋。',
  '手里的东西放下，手才空出来。'
];

let AC = null;
function tone(freq, dur, type = 'sine', vol = .05){
  try {
    const Ctor = window.AudioContext || window.webkitAudioContext;
    if (!Ctor) return;
    AC = AC || new Ctor();
    const o = AC.createOscillator(), g = AC.createGain();
    o.type = type;
    o.frequency.setValueAtTime(freq, AC.currentTime);
    o.frequency.exponentialRampToValueAtTime(Math.max(40,freq*.72), AC.currentTime+dur);
    g.gain.setValueAtTime(vol, AC.currentTime);
    g.gain.exponentialRampToValueAtTime(.0001, AC.currentTime+dur);
    o.connect(g); g.connect(AC.destination);
    o.start(); o.stop(AC.currentTime+dur);
  } catch(e){ /* 音频没解锁就静默 */ }
}
const sfx = {
  coin : ()=>{ tone(1250,.13,'triangle',.045); setTimeout(()=>tone(880,.16,'triangle',.035),70); },
  water: ()=>{ tone(420,.20,'sine',.035); },
  purr : ()=>{ tone(120,.34,'sawtooth',.018); setTimeout(()=>tone(105,.30,'sawtooth',.014),150); },
  chime: ()=>{ tone(680,.55,'sine',.04); }
};

export function initQuests(ctx, b){
  if (!b) return;
  const S = ctx.state;
  const stock = progress.data;
  const night = () => S.hour >= 19 || S.hour < 6;
  function feed(id, item, effect){
    if(!stock[item])return '食物用完了，可去小卖部兑换。';
    if(!progress.reward(id,3,60000))return '刚喂过，让它慢慢吃。';
    stock[item]--; progress.save(); effect();
    return '投喂完成 · 功德 +3';
  }

  /* ---------- 寺猫 ---------- */
  function talkCat(c, i){
    ctx.say({
      who:c.roofBoss?'屋顶 · 猫老大':'寺猫 · '+CAT_NAMES[i%4], sub: night() ? '夜里还蹲在阶前' : '廊下晒着太阳',
      text:'它抬眼看了你一下，又慢慢把眼皮合上。',
      choices:[
        { label:'摸摸头', run:()=>{ c.purr=1.0; sfx.purr(); return '它眯起眼，喉咙里滚出一串呼噜。'; } },
        {label:'喂小鱼干',run:()=>feed('cat'+i,'treats',()=>{c.follow=true;sfx.purr();})},
        { label:'让它去', run:()=>{ c.follow=false; ctx.closeSay(); return ''; } }
      ]
    });
  }
  b.cats.forEach((c,i)=>ctx.addItem(c.obj,{ id:'cat'+i, label:c.roofBoss?'屋顶猫老大':'摸摸寺猫', onHit:()=>talkCat(c,i) }));

  /* ---------- 敲钟 ---------- */
  ctx.addItem(b.bell,{ id:'bell', label:'敲一记钟', onHit:()=>{
    b.ringBell();
    try { ctx.stage.bell(); } catch(e){ sfx.chime(); }
    ctx.toast(night() ? '夜里的钟声，传得比白天更远。' : '钟声过檐，山风自来自去。', 2600);
  }});

  /* ---------- 喂锦鲤 ---------- */
  const feedFish = point => ctx.toast(feed('koi','feed',()=>{
    const {x,z}=b.POND;
    const px=point ? ctx.T.MathUtils.clamp(point.x,x-2.35,x+2.35) : x;
    const pz=point ? ctx.T.MathUtils.clamp(point.z,z-1.45,z+1.45) : z;
    b.feed(px,pz); sfx.water();
  }));
  ctx.addItem(b.waterHit,{id:'pond',range:5.4,label:'喂锦鲤 · 撒鱼食',onHit:(_,point)=>feedFish(point)});
  const pondButton=document.querySelector('#feed-fish');
  const nearPond=()=>Math.hypot(ctx.camera.position.x-b.POND.x,ctx.camera.position.z-b.POND.z)<5.75
    && Math.abs(ctx.camera.position.y-b.POND.y)<3.2;
  pondButton.onclick=()=>{ if(nearPond()&&!ctx.dialogOpen)feedFish(); };
  ctx.frames.push(()=>{ pondButton.hidden=!nearPond()||ctx.dialogOpen||!!document.querySelector('dialog[open]'); });
  function actor(x,z){
    const group=new ctx.T.Group();
    group.position.set(x,ctx.ground(x,z),z);
    ctx.root.add(group);
    return group;
  }
  const bird=actor(-39,-3);
  bird.userData.noPaint=true;
  const birdHead=ctx.group(bird);
  const birdShape=(color,pos,size,parent=bird)=>{
    const mesh=ctx.sph(parent,color,pos,1,{},2);
    mesh.scale.set(...size);
    return mesh;
  };
  birdShape('#8c7763',[0,.18,0],[.16,.093,.09]);
  birdShape('#cfb187',[.074,.165,0],[.094,.077,.070]);
  birdShape('#5b5148',[.118,.264,0],[.068,.062,.062],birdHead);
  const bill=ctx.cone(birdHead,'#b79768',[.193,.256,0],.024,.064,{},12);
  bill.rotation.z=-Math.PI/2;
  birdShape('#66574a',[-.18,.16,0],[.112,.024,.039]).rotation.z=.16;
  for(const side of [-1,1]){
    birdShape('#d9c7a9',[.133,.247,side*.049],[.033,.023,.015],birdHead);
    birdShape('#1f201c',[.141,.275,side*.052],[.012,.013,.009],birdHead);
    birdShape('#eee4d2',[.144,.280,side*.059],[.004,.004,.003],birdHead);
    birdShape('#6a5b4e',[-.045,.201,side*.061],[.126,.044,.032]).rotation.z=.19;
    for(let k=0;k<3;k++)
      birdShape('#ab9276',[-.062-k*.031,.205-k*.008,side*.082],[.040,.010,.008]).rotation.z=.2;
    ctx.cyl(bird,'#735d4d',[.014,.063,side*.037],.009,.098);
    birdShape('#735d4d',[.036,.016,side*.037],[.040,.009,.013]);
  }
  let peckUntil=0;
  ctx.frames.push(now=>{
    const dip=now<peckUntil ? Math.abs(Math.sin(now*.021))*.055 : 0;
    birdHead.position.y=-dip;
  });
  const feedBird=()=>ctx.toast(feed('bird','grain',()=>{
    peckUntil=performance.now()+1700;
  }));
  ctx.addItem(bird,{id:'bird',range:4.2,label:'喂停在石碟旁的山雀',onHit:feedBird});
  ctx.sph(bird,'#998c73',[.31,.024,.04],.13).scale.set(1,.19,1);
  for(let i=0;i<7;i++)ctx.sph(bird,'#d6b270',[.31+.065*Math.cos(i*2.4),.048,.04+.062*Math.sin(i*2.4)],.012);
  const birdButton=document.querySelector('#feed-bird');
  birdButton.onclick=feedBird;
  ctx.frames.push(()=>{
    birdButton.hidden=ctx.camera.position.distanceTo(bird.position)>4.2||ctx.dialogOpen||!!document.querySelector('dialog[open]');
  });
  const goods=[['香','incense',1,3],['鱼食','feed',3,2],['小鱼干','treats',3,2],['谷粒','grain',3,2]];
  function shop(){
    ctx.say({who:'小卖部',sub:'山门内 · 功德兑换',text:'现有 '+stock.merit+' 功德。',
      choices:goods.map(([label,key,count,cost])=>({label:label+' ×'+count+' · '+cost+' 功德',run:()=>{
        if(!progress.spend(cost))return '功德不足，可先扫落叶或查阅档案。';
        stock[key]+=count;progress.save();sfx.coin();shop();return '';
      }}))
    });
  }
  ctx.addItem(b.shop,{id:'shop',label:'小卖部 · 功德兑换',onHit:shop});

  const visitor=actor(-36,3);
  ctx.box(visitor,'#65756b',[0,.71,0],[.46,1.35,.33]);
  ctx.box(visitor,'#c7a283',[0,1.52,0],[.24,.27,.23]);
  ctx.box(visitor,'#524638',[0,1.67,0],[.34,.09,.32]);
  const questions=[
    ['第一次来，东大殿该往哪走？','我陪你走到石阶口。','你自己找吧。'],
    ['有点累，可以在这里歇一会儿吗？','可以，我陪你在松荫下坐会儿。','快走吧。'],
    ['我看不懂这张历史照片。','我们一起看看图注和出处。','那就别看了。']
  ];
  ctx.addItem(visitor,{id:'visitor',label:'回答访客的问题',onHit:()=>{
    const index=questions.findIndex((_,i)=>stock.claims['visitor-'+i]==null);
    const i=index<0?0:index;
    const [question,kind,other]=questions[i];
    ctx.say({who:'虚拟访客',sub:'下院 · 旅人问答',text:question,choices:[
      {label:kind,run:()=> '访客向你道谢。'+(progress.reward('visitor-'+i,3)?' · 功德 +3':'')},
      {label:other,run:()=> '访客点点头，继续赶路。'}
    ]});
  }});

  /* ---------- 知客僧 · 禅意问答 ---------- */
  function answer(q){
    for (const [re, a] of RULES) if (re.test(q)) return a;
    let n = 0; for (const ch of q) n += ch.codePointAt(0);
    return VERSES[n % VERSES.length] + '\n\n—— 你问的这一句，风也听见了。';
  }
  function talkMonk(){
    ctx.say({
      who:'知客僧', sub:'大殿 · 殿门内侧',
      text:'僧人合十，没先开口。\n你若有话，问便是。',
      choices: ASK.map(k => ({ label:k.q, run:()=>k.a })),
      ask: q => answer(q)
    });
  }
  ctx.addItem(b.monk,{ id:'monk', label:'知客僧 · 问一句', onHit:talkMonk });

  /* ---------- 扫地僧 · 授武 ---------- */
  const leaves=new ctx.T.Group();
  leaves.position.copy(b.sweeper.position);
  ctx.root.add(leaves);
  for(let i=0;i<15;i++){
    const leaf=ctx.box(leaves,i%2?'#a87842':'#926039',
      [Math.sin(i*2.4)*.9,.045,Math.cos(i*1.7)*.7],[.11,.016,.07]);
    leaf.rotation.y=i*2.4;
  }
  ctx.frames.push(()=>{leaves.visible=Date.now()-(stock.claims.sweep??0)>=60000;});
  ctx.addItem(b.sweeper,{id:'sweeper',label:'扫地僧 · 扫落叶',onHit:()=>{
    ctx.say({who:'扫地僧',sub:'下院 · 石径',text:'阶边的落叶积起来了，帮我扫一处吧。',
      choices:[{label:'扫落叶',run:()=>progress.reward('sweep',3,60000)
        ?'阶边扫净了 · 功德 +3':'已经扫净，过一会儿再来。'}]});
  }});

  /* ---------- 轻功跳跃 ---------- */
  function jump(){
    if (ctx.dialogOpen || document.querySelector('dialog[open]')) return;
    const cam = window.__cam?.();
    if (!cam || !cam.roam){
      ctx.toast('先点右上角「自由漫步」，才能提气纵身。', 3200);
      const btn = document.querySelector('#roam');
      if (btn?.animate) btn.animate(
        [{boxShadow:'0 0 0 0 rgba(154,58,44,.7)'},{boxShadow:'0 0 0 9px rgba(154,58,44,0)'}],
        { duration:900, iterations:2 });
      return;
    }
    ctx.stage.jump();
  }
  addEventListener('keydown', e => {
    if (e.code !== 'Space' || e.repeat) return;
    if (e.target?.closest?.('input,textarea,button,[contenteditable]')) return;
    if (ctx.dialogOpen || document.querySelector('dialog[open]')) return;
    e.preventDefault(); e.stopPropagation();
    jump();
  }, true);

  document.querySelector('#roam-jump').addEventListener('click',()=>{
    document.activeElement?.blur?.();
    jump();
  });
}
