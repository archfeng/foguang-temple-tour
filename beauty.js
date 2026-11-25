/* beauty.js — 全局美化调色板（依据外部美术顾问审查意见，2026-11-16）
 * 单一入口：按「原始材质色」匹配 → 目标色 + 表面类别。
 * 只依赖颜色，不依赖几何层级，因此在 tour.js 装载完成后任意时机跑都稳定；
 * 四季层（wonder/seasons）在装载时捕获的材质引用与调色板作用在同一对象上，
 * 换季 retint 会基于新底色重算，不冲突。
 *
 * 顾问要点对照：
 *  P0-3 瓦顶去死黑 → 深灰青 #2f3538（瓦面）、#4a5055（瓦垄高光条）
 *  P0-4 夯土墙    → 中灰黄 #97876a，浅夯 #a29174、三进台面 #8d7f64
 *  P0-5 木构降饱和 → 柱/门 #6d4630、深木门 #55382a、暗木骨 #3f3730、
 *                    檐廊木 #5e4028、墙内衬 #5a4d40、门侧壁 #4e3425
 *  石材（台基/栏杆）→ 青灰白系 #a7a096/#948d84/#847d74/#77706a
 *  P0-2 光照走 wonder/world.js 的 KEYS（那边改）
 */
(function () {
  const T = window.THREE;
  if (!T) return;

  /* 场景材质色板（与 DESIGN.md 的 Scene Material Tokens 一一对应）。
   * 把原先散在映射表里的目标色收成命名 token：改色只改这里一处，
   * 其余模块（tour.js / hall.js / facades.js）仍按原始色被命中，不动调用方。
   * 值与三轮 P0-3 审定结果完全一致，本次只做结构收口，不改画面。 */
  const SCENE = {
    tile:'#333b3f', tileEdge:'#70756a',
    paving:'#8d8065', plaster:'#9d9078', innerWall:'#c9bda6',
    woodDoor:'#6d4a36', woodDoorDeep:'#66503c',
    woodSide:'#5d4030', woodSideDeep:'#5c4736',
    woodDark:'#484036', woodDarkDeep:'#4f463b',
    woodFrame:'#6d5040', woodEave:'#624834', woodEaveDeep:'#604a38',
    stone1:'#8a8073', stone2:'#90856f', stone3:'#847b6c',
    stone4:'#978a72', stone5:'#7e7668',
    statueGold:'#b08d58', statueGoldDark:'#8a6d40',
    statueRed:'#6b3d2f', statueFlesh:'#cbb190'
  };

  /* 原始色 → {to: 新色, cat: weathered 类别}。只列场景实际用到的建筑/植被色。 */
  const MAP = {
    /* 屋面 */
    '#3e4747': { to: SCENE.tile, cat: 'tile' },       // 东大殿屋面坡（原近黑灰）
    '#515757': { to: SCENE.tileEdge, cat: 'tile' },   // 瓦垄亮条（三轮P1：明部）
    /* 夯土与台面 */
    '#897e66': { to: SCENE.paving, cat: 'paving' },   // 一二进院落 / 三进高台
    '#aa9d85': { to: SCENE.plaster, cat: 'plaster' }, // 东大殿围护墙
    /* 木构（唐风：降饱和、加灰） */
    '#764a35': { to: SCENE.woodDoor, cat: 'wood' },   // 板门
    '#603022': { to: SCENE.woodSide, cat: 'wood' },   // 门侧壁柱
    '#42382e': { to: SCENE.woodDark, cat: 'wood' },   // 深木（门扇/墙骨）
    '#75503a': { to: SCENE.woodFrame, cat: 'wood' },  // 木骨露明线
    '#684632': { to: SCENE.woodEave, cat: 'wood' },   // 檐廊木
    /* 石作（券台、栏板、台基） */
    '#786a59': { to: SCENE.stone1, cat: 'stone' },
    '#817460': { to: SCENE.stone2, cat: 'stone' },
    '#756957': { to: SCENE.stone3, cat: 'stone' },
    '#8b7b66': { to: SCENE.stone4, cat: 'stone' },
    '#6f6556': { to: SCENE.stone5, cat: 'stone' },
    /* 塑像（顾问 P1：塑像用色统一压一档，去塑料亮面） */
    '#d3c9b6': { to: SCENE.innerWall, cat: 'plaster' },
    '#c8a267': { to: SCENE.statueGold, cat: null },
    '#9d7a44': { to: SCENE.statueGoldDark, cat: null },
    '#7b3f30': { to: SCENE.statueRed, cat: null },
    '#d9c3a0': { to: SCENE.statueFlesh, cat: null },
    /* 三轮 P0-3：木色收进顾问区间（这些是 wonder/garden 裸材质） */
    '#6d4a36': { to: SCENE.woodDoorDeep, cat: null },
    '#5d4030': { to: SCENE.woodSideDeep, cat: null },
    '#484036': { to: SCENE.woodDarkDeep, cat: null },
    '#6d5040': { to: SCENE.woodDoorDeep, cat: null },
    '#624834': { to: SCENE.woodEaveDeep, cat: null }
  };
  /* 三轮 P0-3：tour.js 烘焙树干的树皮色 → 低对比树皮区间
   * （顾问要求树皮收进 #514739 ~ #665744，去掉偏红偏暖的高对比 bark 色） */
  const BARK = {
    '#514737': '#514739',
    '#584b37': '#5d5142',
    '#5d513c': '#665744',
    '#4a3a2c': '#4e4234',
    '#57452f': '#5a4c3a',
    '#51412c': '#544834'
  };

  /* weathered / textures.js 体系靠材质色相自动归类，这几类色**不能**进 MAP，
   * 否则类别会打架（如粉墙被拉成石色）。它们只在原体系里微调，见 TUNE。 */
  const TUNE = {
    '#b6ad98': 1.05,   // 石灯笼宝珠：略提亮
    '#ffd08a': .96,    // 灯室内芯
    '#ffd896': .96     // 红灯笼内芯
  };

  /* 只处理 wonder 自建的裸实例材质（wonderBatch / wonderLantern / 内衬墙），
   * 即未走 weathered / textures.js 那套贴图管线、色相又会被误判的材质。 */
  function applyPalette() {
    const scene = window.__stage && window.__stage.scene;
    if (!scene) return 0;
    const seen = new Set();
    let n = 0;
    scene.traverse(o => {
      if (!o.isMesh && !o.isInstancedMesh) return;
      const wonderOwned = o.userData && (o.userData.wonderBatch || o.userData.wonderLantern);
      const ms = Array.isArray(o.material) ? o.material : [o.material];
      for (const m of ms) {
        if (!m || !m.isMeshStandardMaterial || seen.has(m)) continue;
        if (m.userData.weathered) continue;          // 已走贴图管线：类别由 textures.js 负责，别抢
        seen.add(m);
        const hex = '#' + m.color.getHexString();
        if (!wonderOwned) {
          // 主场景裸材质：MAP（建筑色）或 BARK（烘焙树干实例色）命中才动
          const e = MAP[hex] || (BARK[hex] ? { to: BARK[hex], cat: null } : null);
          if (!e) continue;
          m.color.set(e.to);
          if (e.cat) m.userData.beautyCat = e.cat;
        } else {
          // wonder 裸材质（塑像、内衬墙、灯系）：MAP / BARK / TUNE 任一命中即可
          const e = MAP[hex] || (BARK[hex] ? { to: BARK[hex], cat: null } : null);
          if (e) m.color.set(e.to);
          else if (TUNE[hex]) m.color.multiplyScalar(TUNE[hex]);
          else continue;
        }
        m.needsUpdate = true;
        n++;
      }
    });
    return n;
  }

  function run() {
    const n = applyPalette();
    if (n) console.info('[beauty] 调色板已作用于 ' + n + ' 个材质');
  }

  // wonder/core.js 每 80ms 轮询 __sceneReady；这里等 wonder 各模块全部挂完
  // （塑像、灯系等都在 wonder 名下）再调色，避免漏网。
  let tries = 0;
  const timer = setInterval(() => {
    if (window.__wonder && window.THREE) {
      clearInterval(timer);
      try { run(); } catch (e) { console.warn('[beauty] 跳过：', e); }
    } else if (++tries > 1500) clearInterval(timer);   // ~2 分钟兜底
  }, 80);
})();
