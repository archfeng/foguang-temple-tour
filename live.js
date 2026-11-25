/* 互动直播层
 *
 * 观众在评论区发一句口令，画面里真的敲钟、上香、求签、点灯。
 * 这一层只管三件事：认口令、排队执行、把「谁做了什么」显示在画上。
 *
 * 数据来源：
 *   1. 桥接服务  ?live=1&bridge=http://127.0.0.1:8787
 *      （用 OBS 浏览器源直接打开 http://127.0.0.1:8787/?live=1 时同源，不用带参数）
 *   2. 外部脚本  window.temple.cmd('钟', '山月')
 *   3. 演示模式  ?live=1&demo=1  本地生成假观众，无真弹幕时也有互动感
 */
const T = window.THREE;
const QS = new URLSearchParams(location.search);
const BRIDGE = (QS.get('bridge') || '').replace(/\/+$/, '');
const DEMO = QS.get('demo') === '1';

/* ---------- 口令表 ----------
 * words 里带 ^ 的表示「整句相等」才命中，避免「几点钟」被当成敲钟。
 * needHall：这个动作只在殿里成立，人不在殿内就先带过去。
 */
const CUES = [
  { id: 'bell', words: ['敲钟', '撞钟', '打钟', '钟声', '敲一下钟', '^钟'], verb: '敲了一下钟', label: '敲钟', gap: 2600 },
  { id: 'incense', words: ['上香', '点香', '敬香', '添香', '烧香', '^香'], verb: '在香案前添了一炷香', label: '上香', gap: 2200, needHall: true },
  { id: 'bow', words: ['礼拜', '顶礼', '叩拜', '叩首', '参拜', '^拜'], verb: '合掌拜了一拜', label: '礼拜', gap: 1800 },
  { id: 'fortune', words: ['求签', '抽签', '摇签', '^签'], verb: '摇了一支签', label: '求签', gap: 9000, needHall: true },
  { id: 'wish', words: ['许愿', '祈福', '供灯', '点灯', '长明灯', '许个愿'], verb: '供了一盏长明灯', label: '许愿', gap: 1200 },
  { id: 'omen', words: ['赐福', '瑞兆', '吉兆', '祥瑞', '福气', '^福'], verb: '求得一道瑞兆', label: '赐福', gap: 12000 },
  { id: 'hall', words: ['进殿', '看殿', '入殿', '佛堂', '殿里'], verb: '走进了东大殿', label: '进殿', gap: 6000 },
  { id: 'gate', words: ['山门', '大门', '下院'], verb: '回到山门前', label: '山门', gap: 6000 },
  { id: 'aerial', words: ['全景', '鸟瞰', '俯瞰', '全寺'], verb: '看了一次全寺', label: '全景', gap: 6000 },
  { id: 'climb', words: ['登高', '券门', '石阶', '台阶'], verb: '登上券门', label: '登高', gap: 6000 },
  { id: 'left', words: ['左转', '往左', '看左', '向左'], verb: '把镜头转向左边', label: '左转', gap: 1200, turn: -1 },
  { id: 'right', words: ['右转', '往右', '看右', '向右'], verb: '把镜头转向右边', label: '右转', gap: 1200, turn: 1 },
  { id: 'up', words: ['抬头', '看天', '上面'], verb: '抬头看了看檐角', label: '抬头', gap: 1400, pitch: -.55 },
  { id: 'down', words: ['低头', '看地', '下面'], verb: '低头看了看石阶', label: '低头', gap: 1400, pitch: .45 },
  { id: 'stop', words: ['停一下', '别动', '暂停', '等一下', '^停'], verb: '让镜头停住了', label: '停', gap: 2500 },
  { id: 'go', words: ['巡游', '继续', '出发', '走起来', '^走'], verb: '让山寺继续走', label: '巡游', gap: 2500 }
];

/* ---------- 状态 ---------- */
const queue = [];          // 待执行
const lastRun = new Map(); // cue.id → 上次执行时间
const perUser = new Map(); // 用户名 → 上次发言时间
let busy = false;
let count = 0;

const MAX_Q = 14;
const USER_GAP = 4000;     // 同一个人 4 秒内只认一句

/* ---------- DOM ---------- */
const elLive = document.querySelector('#live');
const list = document.querySelector('#cast-list');
const wishList = document.querySelector('#wish-list');
const elCount = document.querySelector('#live-n');

const WISH_WORDS = ['平安喜乐', '所求皆得', '诸事顺遂', '长乐未央', '岁岁清吉',
  '山高水长', '心之所向', '万事胜意', '清风入怀', '得偿所愿', '松风入梦', '檐下听雨'];

/* ---------- 工具 ---------- */
function clean(s, max = 10) {
  return String(s || '').replace(/[\u0000-\u001f<>&]/g, '').replace(/\s+/g, ' ').trim().slice(0, max);
}

function matchCue(text) {
  if (!text) return null;
  let best = null, len = 0;
  for (const c of CUES) {
    for (const w of c.words) {
      const exact = w[0] === '^';
      const key = exact ? w.slice(1) : w;
      const hit = exact ? text === key : text.includes(key);
      if (hit && key.length > len) { best = c; len = key.length; }
    }
  }
  return best;
}

// 「许愿 山月」→ 名字；「许愿 平安喜乐」→ 说的是愿望，名字退回昵称
const WISH_HINT = /平安|喜乐|顺遂|健康|暴富|发财|上岸|顺利|如意|长乐|清吉|安康|如愿|胜意|好运|开心|幸福|考上|offer|脱单|暴瘦/;
function pickWord() {
  return WISH_WORDS[Math.floor(Math.random() * WISH_WORDS.length)];
}
function wishOf(text, user) {
  const m = text.match(/^(?:许愿|祈福|供灯|点灯|长明灯|许个愿)[\s:：,，·、-]*([\s\S]{0,12})$/);
  const raw = clean(m ? m[1] : '', 8);
  if (!raw) return { name: user, word: pickWord() };
  if (WISH_HINT.test(raw) || WISH_WORDS.includes(raw)) return { name: user, word: raw };
  return { name: raw, word: pickWord() };
}

/* ---------- 画面反馈 ---------- */
function castSay(user, verb, kind = '') {
  if (!list) return;
  const li = document.createElement('li');
  li.className = kind;
  const who = document.createElement('span');
  who.className = 'who';
  who.textContent = '@' + user;
  const what = document.createElement('span');
  what.className = 'what';
  what.textContent = verb;
  li.append(who, what);
  list.append(li);
  requestAnimationFrame(() => li.classList.add('in'));
  while (list.children.length > 5) list.firstElementChild.remove();
  setTimeout(() => {
    li.classList.remove('in');
    setTimeout(() => li.remove(), 700);
  }, 15000);
}

function bumpCount() {
  count++;
  if (elCount) elCount.textContent = count;
}

function addWish(name, word) {
  if (!wishList) return;
  const li = document.createElement('li');
  li.className = 'wish-item';
  const lamp = document.createElement('i');
  const box = document.createElement('div');
  const n = document.createElement('strong');
  n.textContent = name;
  const w = document.createElement('span');
  w.textContent = word;
  box.append(n, w);
  li.append(lamp, box);
  wishList.prepend(li);
  requestAnimationFrame(() => li.classList.add('in'));
  while (wishList.children.length > 6) wishList.lastElementChild.remove();
}

/* ---------- 三维：莲池长明灯 ----------
 * 池子在 x −30.2、north −8.4 一带，水面高 .475。点一盏就在池面浮起一朵莲灯。
 */
// 注意 z 是三维坐标：north −8.4 在 three 里是 z +8.4
const LAMP_SPOTS = [
  [-31.7, 8.1], [-29.5, 9.4], [-28.2, 7.6],
  [-31.9, 9.5], [-30.2, 7.2], [-28.6, 9.0]
];
const lamps = [];
let lampRing = 0;
let haloTexture = null;

function halo() {
  if (haloTexture) return haloTexture;
  const c = document.createElement('canvas');
  c.width = c.height = 128;
  const g = c.getContext('2d');
  const rg = g.createRadialGradient(64, 64, 0, 64, 64, 64);
  rg.addColorStop(0, 'rgba(255,226,168,.95)');
  rg.addColorStop(.28, 'rgba(255,198,120,.55)');
  rg.addColorStop(.62, 'rgba(255,170,90,.16)');
  rg.addColorStop(1, 'rgba(255,160,80,0)');
  g.fillStyle = rg;
  g.fillRect(0, 0, 128, 128);
  haloTexture = new T.CanvasTexture(c);
  return haloTexture;
}

function buildLamps(scene) {
  const petalGeo = new T.SphereGeometry(.085, 8, 6);
  const coreGeo = new T.IcosahedronGeometry(.052, 1);
  LAMP_SPOTS.forEach(([x, z], i) => {
    const g = new T.Group();
    g.position.set(x, .505, z);
    g.rotation.y = i * 1.1;
    g.scale.setScalar(1.2);

    const base = new T.Mesh(
      new T.CylinderGeometry(.155, .125, .045, 12),
      new T.MeshStandardMaterial({ color: '#6b4a2c', roughness: .9 })
    );
    g.add(base);

    const petals = [];
    for (let k = 0; k < 8; k++) {
      const m = new T.MeshStandardMaterial({
        color: '#ffdcae', emissive: new T.Color('#ff7a1e'), emissiveIntensity: .04,
        roughness: .7, transparent: true, opacity: .93, side: T.DoubleSide
      });
      const p = new T.Mesh(petalGeo, m);
      const a = k / 8 * Math.PI * 2;
      p.position.set(Math.cos(a) * .105, .020, Math.sin(a) * .105);
      p.rotation.set(Math.PI * .27, -a, 0, 'YXZ');
      p.scale.set(1, .30, 1.42);
      petals.push(m);
      g.add(p);
    }

    const coreMat = new T.MeshStandardMaterial({
      color: '#fff2cc', emissive: new T.Color('#ff8a1e'), emissiveIntensity: 0, roughness: .45
    });
    const core = new T.Mesh(coreGeo, coreMat);
    core.position.y = .086;
    core.scale.set(1, 1.5, 1);
    core.visible = false;
    g.add(core);

    const sprite = new T.Sprite(new T.SpriteMaterial({
      map: halo(), color: 0xffd9a0, transparent: true, opacity: 0,
      blending: T.AdditiveBlending, depthWrite: false
    }));
    sprite.scale.set(.95, .95, 1);
    sprite.position.y = .08;
    g.add(sprite);

    // 水面上的一团暖光：从上往下看，才像灯真的照进池子里
    const pool = new T.Mesh(
      new T.PlaneGeometry(.95, .95),
      new T.MeshBasicMaterial({
        map: halo(), color: 0xffbe74, transparent: true, opacity: 0,
        blending: T.AdditiveBlending, depthWrite: false
      })
    );
    pool.rotation.x = -Math.PI / 2;
    pool.position.y = -.026;
    g.add(pool);

    // 真给一盏点光：池水、石头被照亮，才不是贴上去的白花
    const light = new T.PointLight(0xffa04a, 0, 2.8);
    light.position.set(0, .16, 0);
    g.add(light);

    scene.add(g);
    lamps.push({ group: g, petals, core, coreMat, sprite, pool, light, lit: 0, target: 0, phase: i * 1.7 });
  });
}

function lightLamp(name, word) {
  if (!lamps.length) return;
  const lamp = lamps[lampRing % lamps.length];
  lampRing++;
  lamp.target = 1;
  addWish(name, word);
}

function tickLamps(t, dt) {
  for (const L of lamps) {
    L.lit += (L.target - L.lit) * Math.min(1, dt * 2.2);
    const v = L.lit;
    for (const m of L.petals) m.emissiveIntensity = .04 + v * .95;
    L.core.visible = v > .02;
    L.coreMat.emissiveIntensity = v * 2.4;
    L.light.intensity = v * 2.0;
    const flick = .92 + Math.sin(t * 7.3 + L.phase) * .06 + Math.sin(t * 13.1 + L.phase) * .03;
    L.core.scale.set(1, 1.5 * flick, 1);
    L.sprite.material.opacity = v * .90 * flick;
    L.sprite.scale.setScalar(1.05 + v * .8 + Math.sin(t * 2.1 + L.phase) * .04);
    L.pool.material.opacity = v * .32 * flick;
    L.group.position.y = .505 + Math.sin(t * 1.25 + L.phase) * .012;
  }
}

/* ---------- 执行 ---------- */
function execute(cue, user, text) {
  const stage = window.__stage;
  if (!stage) return;
  const now = performance.now();
  const last = lastRun.get(cue.id) || 0;
  if (now - last < cue.gap) return;      // 同类动作太密就丢掉，画面才不抖
  lastRun.set(cue.id, now);

  const inHall = stage.inHall();
  let verb = cue.verb;

  if (cue.needHall && !inHall) {
    stage.go(4, 2300);
    verb = '走进佛堂，' + cue.verb;
    setTimeout(() => {
      if (cue.id === 'incense') stage.incense();
      if (cue.id === 'fortune') stage.draw();
    }, 2600);
  } else {
    switch (cue.id) {
      case 'bell': stage.bell(); break;
      case 'incense': stage.incense(); break;
      case 'bow': stage.bow(); break;
      case 'fortune': stage.draw(); break;
      case 'omen': stage.omen(); break;
      case 'wish': {
        const w = wishOf(text, user);
        lightLamp(w.name, w.word);
        stage.lamp();
        verb = '供了一盏长明灯 · ' + w.word;
        break;
      }
      case 'hall': stage.go(4, 2400); break;
      case 'gate': stage.go(1, 2400); break;
      case 'aerial': stage.go(0, 2400); break;
      case 'climb': stage.go(2, 2400); break;
      case 'left': stage.turn(-1); break;
      case 'right': stage.turn(1); break;
      case 'up': stage.look(-1); break;
      case 'down': stage.look(1); break;
      case 'stop': stage.pause(); break;
      case 'go': stage.play(); break;
    }
  }
  castSay(user, verb, cue.id === 'wish' ? 'wish' : '');
  bumpCount();
}

function pump() {
  if (busy) return;
  const next = queue.shift();
  if (!next) return;
  busy = true;
  try { execute(next.cue, next.user, next.text); } catch (e) { console.warn(e); }
  // 动作之间留一点呼吸，画面看着才不慌
  setTimeout(() => { busy = false; pump(); }, 900);
}

function accept(user, text) {
  const u = clean(user, 10) || '过客';
  const body = String(text || '').trim().slice(0, 40);
  if (!body) return false;

  const t = Date.now();
  const prev = perUser.get(u) || 0;
  if (t - prev < USER_GAP) return false;
  perUser.set(u, t);
  if (perUser.size > 400) perUser.clear();

  const cue = matchCue(body);
  if (!cue) return false;
  if (queue.length >= MAX_Q) return false;
  queue.push({ cue, user: u, text: body });
  pump();
  return true;
}

/* ---------- 桥接 ---------- */
let since = 0;
let backoff = 1500;

async function poll() {
  if (!BRIDGE) return;
  try {
    const r = await fetch(`${BRIDGE}/api/feed?since=${since}`, { cache: 'no-store' });
    if (!r.ok) throw new Error(String(r.status));
    const j = await r.json();
    if (typeof j.cursor === 'number') since = j.cursor;
    for (const it of (j.items || [])) accept(it.user, it.text);
    backoff = 1500;
  } catch (e) {
    backoff = Math.min(20000, Math.round(backoff * 1.7));
  }
  setTimeout(poll, backoff);
}

/* ---------- 演示观众 ---------- */
const DEMO_USERS = ['山月', '松间客', '一碗茶', '半山听雨', '拾阶', '苔痕', '枝间雀',
  '溪云', '北窗', '听钟人', '晚照', '扫叶僧', '云在青天', '野鹤'];
const DEMO_LINES = ['敲钟', '敲钟', '上香', '求签', '拜', '赐福', '许愿 平安喜乐',
  '许愿 诸事顺遂', '进殿', '全景', '左转', '右转', '抬头', '许愿 岁岁清吉'];

function startDemo() {
  const step = () => {
    const u = DEMO_USERS[Math.floor(Math.random() * DEMO_USERS.length)];
    const t = DEMO_LINES[Math.floor(Math.random() * DEMO_LINES.length)];
    accept(u, t);
    setTimeout(step, 5000 + Math.random() * 7000);
  };
  setTimeout(step, 3000);
}

/* ---------- 启动 ---------- */
export function startLive(stage) {
  if (!document.body.classList.contains('live')) return null;
  if (!stage || !stage.scene) return null;

  if (elLive) elLive.hidden = false;
  buildLamps(stage.scene);

  // 外部脚本 / 控制台：window.temple.cmd('钟', '山月')
  window.temple = {
    cmd: (text, user = '主播') => accept(user, text),
    raw: (user, text) => accept(user, text),
    cues: () => CUES.map(c => c.label),
    stats: () => ({ queued: queue.length, done: count, bridge: BRIDGE || null, lamps: lampRing }),
    lamps: () => lamps.map(l => ({ lit: +l.lit.toFixed(2) })),
    tickLamps
  };

  if (BRIDGE) poll();
  if (DEMO) startDemo();

  // 网页音频要一次手势才能起振；直播时没人点，隔一阵试一次，静默失败即可
  setInterval(() => { try { stage.unlockAudio(); } catch (e) { /* 忽略 */ } }, 6000);
  console.info('[直播互动] 口令：', CUES.map(c => c.label).join(' / '));

  // 池子里的灯每帧动一动：火苗抖、水波托着轻轻起伏
  return function tick(now, dt) {
    tickLamps(now / 1000, dt);
  };
}
