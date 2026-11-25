/* 同游的小人
 *
 * Q 版香客：大头圆脸、亮眼睛、腮红微笑，交领袍、束腰、布鞋、发髻。
 * 自己用、别人也用，尺寸统一，才看得出谁站得近。
 *
 * 比例按「二头身」的憨态走：头约占身高四分之一，袍短腿露，走路时
 * 手臂前后甩、腿迈步、身子一颠一摆、小脑袋反着晃——可爱但不闹腾。
 *
 * 坐标与场景一致：three 里 y 向上，模型原点是脚底，正面朝局部 −z。
 */
const T = window.THREE;

function nameSprite(text, color) {
  const c = document.createElement('canvas');
  c.width = 256; c.height = 72;
  const x = c.getContext('2d');
  x.fillStyle = 'rgba(16,26,20,.62)';
  x.beginPath();
  if (x.roundRect) x.roundRect(10, 12, 236, 48, 24); else x.rect(10, 12, 236, 48);
  x.fill();
  x.strokeStyle = color; x.lineWidth = 2.4; x.globalAlpha = .85; x.stroke(); x.globalAlpha = 1;
  x.fillStyle = '#f2e8d2';
  x.font = '500 27px "Songti SC","STSong",serif';
  x.textAlign = 'center'; x.textBaseline = 'middle';
  x.fillText(text, 128, 37);
  const t = new T.CanvasTexture(c);
  t.colorSpace = T.SRGBColorSpace;
  const s = new T.Sprite(new T.SpriteMaterial({ map: t, transparent: true, depthTest: false }));
  s.scale.set(.74, .208, 1);
  return s;
}

export function makeAvatar(info) {
  // 袍色取用户色，但压暗、去艳，才像麻布不像制服
  const base = new T.Color(info.color || '#8d9c7e');
  const robe = base.clone().lerp(new T.Color('#4a4636'), .30);
  const robeDark = robe.clone().multiplyScalar(.78);
  const g = new T.Group();
  g.userData.noPaint = true;

  const cloth = new T.MeshStandardMaterial({ color: robe, roughness: .94 });
  const cloth2 = new T.MeshStandardMaterial({ color: robeDark, roughness: .95 });
  const skin = new T.MeshStandardMaterial({ color: '#e2c9a2', roughness: .92 });
  const hairMat = new T.MeshStandardMaterial({ color: '#2a241e', roughness: .96, side: T.DoubleSide });

  /* ---------- 腿：根节点直挂脚底，袍摆动时脚不离开地面 ---------- */
  const legMat = new T.MeshStandardMaterial({ color: robeDark, roughness: .95 });
  const shoeMat = new T.MeshStandardMaterial({ color: '#2f2a24', roughness: .96 });
  const legs = [];
  for (const s of [-1, 1]) {
    const hip = new T.Group();
    hip.position.set(s * .085, .58, 0);
    const leg = new T.Mesh(new T.CylinderGeometry(.075, .068, .50, 10), legMat);
    leg.position.y = -.24; leg.castShadow = true;
    hip.add(leg);
    // 布鞋在腿末端，走路甩出袍摆时才看得见
    const shoe = new T.Mesh(new T.SphereGeometry(.075, 10, 8), shoeMat);
    shoe.position.set(0, -.50, -.045);
    shoe.scale.set(.92, .60, 1.55);
    hip.add(shoe);
    g.add(hip);
    legs.push(hip);
  }

  /* ---------- 身体总装：躯干、手臂、头都挂在 bodyG 上，整体颠/摆 ---------- */
  const bodyG = new T.Group();
  g.add(bodyG);

  // 袍：短圆的一截旋转体，下摆微张，腰线自带
  const profile = [
    [.000, .340], [.240, .340], [.252, .375], [.245, .500],
    [.225, .700], [.210, .900], [.198, 1.000], [.170, 1.080],
    [.115, 1.130], [.065, 1.155], [.000, 1.160]
  ].map(([r, y]) => new T.Vector2(r, y));
  const body = new T.Mesh(new T.LatheGeometry(profile, 24), cloth);
  body.castShadow = true; body.receiveShadow = true;
  bodyG.add(body);

  // 交领：两片从肩斜到胸前的布，正面才有"衣"的样子
  const collarMat = new T.MeshStandardMaterial({ color: '#eee2c6', roughness: .9, side: T.DoubleSide });
  for (const s of [-1, 1]) {
    const panel = new T.Mesh(new T.PlaneGeometry(.16, .34), collarMat);
    panel.position.set(s * .072, 1.045, -.180);
    panel.rotation.set(.14, s * .42, s * .30);
    bodyG.add(panel);
  }

  // 腰带：深一色，人的比例一眼就分得清上下
  const belt = new T.Mesh(new T.CylinderGeometry(.212, .206, .095, 16), cloth2);
  belt.position.y = .860; bodyG.add(belt);
  const knot = new T.Mesh(new T.BoxGeometry(.07, .08, .05),
    new T.MeshStandardMaterial({ color: '#3a2e21', roughness: .95 }));
  knot.position.set(0, .860, -.212); bodyG.add(knot);

  /* ---------- 手臂：肩头做轴，整条袖子甩起来 ---------- */
  const arms = [];
  for (const s of [-1, 1]) {
    const shoulder = new T.Group();
    shoulder.position.set(s * .245, 1.080, -.005);
    // 宽袖：肩头窄、袖口阔，重心落在轴下方，垂着自然
    const sleeve = new T.Mesh(new T.CylinderGeometry(.088, .150, .48, 12), cloth);
    sleeve.position.y = -.225; sleeve.castShadow = true;
    shoulder.add(sleeve);
    const cuff = new T.Mesh(new T.CylinderGeometry(.152, .154, .055, 12), cloth2);
    cuff.position.y = -.435;
    shoulder.add(cuff);
    // 袖口露一点指节
    const hand = new T.Mesh(new T.SphereGeometry(.05, 8, 6), skin);
    hand.position.y = -.465;
    hand.scale.set(.9, 1.15, .85);
    shoulder.add(hand);
    // 站定时袖子微微外张
    shoulder.rotation.z = s * .10;
    bodyG.add(shoulder);
    arms.push(shoulder);
  }

  /* ---------- 头：大而圆，自带腮红和亮眼睛 ---------- */
  const headG = new T.Group();
  headG.position.y = 1.300;
  bodyG.add(headG);

  const neck = new T.Mesh(new T.CylinderGeometry(.052, .060, .09, 8), skin);
  neck.position.y = -.105; headG.add(neck);

  const head = new T.Mesh(new T.SphereGeometry(.190, 18, 14), skin);
  head.scale.set(1, 1.02, .98); head.castShadow = true;
  headG.add(head);

  // 覆顶的发壳：留出脸，后脑包到颈根
  const hair = new T.Mesh(new T.SphereGeometry(.198, 18, 14, 0, Math.PI * 2, 0, Math.PI * .60), hairMat);
  hair.position.set(0, .012, .016); hair.scale.set(1, 1.04, 1.05);
  headG.add(hair);
  const back = new T.Mesh(new T.SphereGeometry(.194, 14, 10, Math.PI * .5, Math.PI, Math.PI * .30, Math.PI * .44), hairMat);
  back.position.set(0, .012, .016); headG.add(back);
  // 刘海：一小排，露额头才精神
  for (const s of [-1, 0, 1]) {
    const tuft = new T.Mesh(new T.SphereGeometry(.052, 8, 6), hairMat);
    tuft.position.set(s * .075, .150, -.162);
    tuft.scale.set(1, .85, .55);
    headG.add(tuft);
  }
  // 圆发髻 + 木簪
  const bun = new T.Mesh(new T.SphereGeometry(.068, 10, 8), hairMat);
  bun.position.set(0, .205, .045); bun.scale.set(1, .92, 1);
  headG.add(bun);
  const pin = new T.Mesh(new T.CylinderGeometry(.010, .010, .19, 6),
    new T.MeshStandardMaterial({ color: '#bb9257', roughness: .55, metalness: .35 }));
  pin.position.set(0, .222, .045); pin.rotation.z = Math.PI / 2;
  headG.add(pin);

  // 亮眼睛：黑豆 + 白高光，Q 版的精气神都在这
  const eyeMat = new T.MeshStandardMaterial({ color: '#241d18', roughness: .55 });
  const glintMat = new T.MeshBasicMaterial({ color: '#ffffff' });
  for (const s of [-1, 1]) {
    const eye = new T.Mesh(new T.SphereGeometry(.030, 10, 8), eyeMat);
    eye.position.set(s * .070, .018, -.163);
    eye.scale.set(.95, 1.25, .55);
    headG.add(eye);
    const glint = new T.Mesh(new T.SphereGeometry(.0085, 6, 5), glintMat);
    glint.position.set(s * .070 - s * .012, .036, -.176);
    headG.add(glint);
  }

  // 腮红：两小片，压扁贴脸
  const cheekMat = new T.MeshStandardMaterial({ color: '#e89a94', roughness: .9 });
  for (const s of [-1, 1]) {
    const cheek = new T.Mesh(new T.SphereGeometry(.038, 8, 6), cheekMat);
    cheek.position.set(s * .130, -.045, -.140);
    cheek.scale.set(1, .72, .42);
    headG.add(cheek);
  }

  // 微笑：一截细环当嘴角
  const smile = new T.Mesh(new T.TorusGeometry(.030, .0055, 6, 12, Math.PI),
    new T.MeshStandardMaterial({ color: '#6b4638', roughness: .8 }));
  smile.position.set(0, -.058, -.180);
  smile.rotation.z = Math.PI;
  smile.scale.set(1, .85, .6);
  headG.add(smile);

  // 脚下的圆：自己与别人颜色不同，混在人群里也认得出
  const ring = new T.Mesh(new T.RingGeometry(.26, .34, 24),
    new T.MeshBasicMaterial({
      color: info.color || '#9aa88f', transparent: true,
      opacity: .34, side: T.DoubleSide, depthWrite: false
    }));
  ring.rotation.x = -Math.PI / 2;
  ring.position.y = .022;
  g.add(ring);

  const tag = nameSprite(info.name || '游客', info.color || '#9aa88f');
  tag.position.y = 1.82;
  g.add(tag);

  // 小人本身不该挡住第三人称镜头
  g.traverse(o => { if (o.isMesh) o.userData.noHit = true; });
  g.userData.ring = ring;

  /* ---------- 行走动画 ----------
   * tick(now, speed)：speed 是水平速度（米/秒）。
   * 步频随速度走，起步/收步有缓冲；站着时只剩轻轻的呼吸。
   * 身子一颠一摆、脑袋反着晃、袖子前后甩、小腿迈步——都在同一相位上。 */
  let ph = 0, wAmt = 0, lastNow = 0;
  const tick = (now, speed, kneel=0, bow=0) => {
    const dt = Math.min(.05, Math.max(.001, (now - lastNow) / 1000));
    lastNow = now;
    const moving = speed > .06;
    wAmt += ((moving ? 1 : 0) - wAmt) * Math.min(1, dt * 9);
    if (moving) ph += dt * T.MathUtils.clamp(speed * 2.1, 2.7, 5.6);
    const s = Math.sin(ph), c = Math.cos(ph);
    // 袖子与对侧的腿同相，走起来才协调
    arms[0].rotation.x = s * .72 * wAmt;
    arms[1].rotation.x = -s * .72 * wAmt;
    legs[0].rotation.x = -s * .58 * wAmt;
    legs[1].rotation.x = s * .58 * wAmt;
    // 身体：上下颠 + 左右晃 + 小前倾；站定时是呼吸的微起伏
    bodyG.position.y = Math.abs(c) * .034 * wAmt
      + Math.sin(now * .0021) * .006 * (1 - wAmt * .7);
    bodyG.rotation.z = s * .055 * wAmt;
    bodyG.rotation.x = .09 * wAmt;
    // 脑袋反着摆一点，Q 版的憨态；再带一点上下点头
    headG.rotation.z = -s * .065 * wAmt;
    headG.rotation.x = Math.abs(s) * .05 * wAmt;
    for(let i=0;i<2;i++){
      legs[i].position.y=.58-.30*kneel;
      legs[i].rotation.x+=kneel*.99;
      arms[i].rotation.x+=kneel*.84-bow*.25;
      arms[i].rotation.z=(i===0?-1:1)*(.10-.27*kneel);
    }
    bodyG.position.y-=.29*kneel;
    bodyG.rotation.x-=.14*kneel+.66*bow;
    headG.rotation.x-=.13*bow;
  };
  g.userData.tick = tick;

  return { group: g, ring, tag, tick };
}

export { nameSprite };
