/* glb-trees.js — 近景写实树（GLB）接入模块
 * 设计：不侵入主程序，只依赖 window.__stage / __wonder。
 * 在殿前台地那排阔叶树的位置，把 3 棵程序树实例「缩掉」，换成 CC0 写实树（已减面）。
 * 远景树、四季换季逻辑一律不动。写实树固定常绿。
 */
const T = window.THREE;
const V = (x, y, z) => new T.Vector3(x, y, z);

/* 要替换的庭院树：坐标与 wonder/world.js 的 YARD_TREES 对齐（世界坐标 x,z；台面 y=13.0） */
const REPLACE = [
  { x: 4.9, z: -5.4, y: 13.0, scale: 0.72, rot: 0.3 },   // 原 ginkgo，台地北端
  { x: 4.8, z: 6.0, y: 13.0, scale: 0.78, rot: 2.6 }     // 原 ginkgo，台地南端
];
const MODEL = 'models/jacaranda_light.glb?v=20261119glb3';
const CLEAR_R = 2.2;   // 隐藏程序树实例的半径

function waitReady() {
  return new Promise(res => {
    const t = setInterval(() => {
      if (window.THREE && window.__stage && window.__sceneReady && window.GLTFLoader) {
        clearInterval(t);
        res(window.__stage);
      }
    }, 100);
  });
}

/* 把 wonder 批次里靠近 (x,z) 的高树实例缩到极小（复用 clearance 的做法）。
 * 只动 WonderAddon root 下的 InstancedMesh，避免影响主程序自有植被。 */
function hideNearbyProgramTrees(root, x, z, r) {
  const M = new T.Matrix4(), P = new T.Vector3(), Q = new T.Quaternion(), S = new T.Vector3();
  const tiny = new T.Vector3(.0001, .0001, .0001);
  let hidden = 0;
  root.traverse(o => {
    if (!o.isInstancedMesh || !o.instanceMatrix) return;
    const g = o.geometry;
    if (!g) return;
    if (!g.boundingBox) g.computeBoundingBox();
    const gh = g.boundingBox ? g.boundingBox.max.y - g.boundingBox.min.y : 0;
    if (gh < 1.9) return;               // 只清高树，不动草/灌木/花
    let touched = false;
    for (let i = 0; i < o.count; i++) {
      o.getMatrixAt(i, M);
      M.decompose(P, Q, S);
      if (S.length() < 1e-3) continue;  // 已清过
      const dx = P.x - x, dz = P.z - z;
      if (dx * dx + dz * dz > r * r) continue;
      M.compose(P, Q, tiny);
      o.setMatrixAt(i, M);
      touched = true; hidden++;
    }
    if (touched) o.instanceMatrix.needsUpdate = true;
  });
  return hidden;
}

async function boot() {
  const stage = await waitReady();
  const wonder = window.__wonder;
  const root = wonder ? wonder.root : null;

  // 先清掉对应位置的程序树，再放写实树
  REPLACE.forEach(p => {
    if (root) hideNearbyProgramTrees(root, p.x, p.z, CLEAR_R);
  });

  if (!window.GLTFLoader) {
    console.warn('[写实树] GLTFLoader 未就绪，跳过');
    return;
  }
  const loader = new window.GLTFLoader();
  loader.load(MODEL, gltf => {
    const proto = gltf.scene;
    REPLACE.forEach((p, idx) => {
      const t = proto.clone(true);
      t.traverse(o => {
        if (o.isMesh) {
          o.castShadow = true;
          o.receiveShadow = true;
          o.frustumCulled = true;
        }
      });
      // 归一化：模型根部在原点、树干 +Y；按包围盒高度缩放到目标高度
      const box = new T.Box3().setFromObject(t);
      const sz = box.getSize(new T.Vector3());
      const targetH = 10.5 * p.scale;
      const k = targetH / (sz.y || 1);
      // 蓝花楹天然宽冠，横向压扁一点更贴合狭窄台地、少挡视线
      t.scale.set(k * 0.82, k, k * 0.82);
      // 底部贴合台面，x/z 落到目标点
      t.position.set(p.x, p.y - box.min.y * k, p.z);
      t.rotation.y = p.rot;
      t.userData.glbTree = true;
      stage.scene.add(t);
    });
    // 静态阴影：主程序关了自动更新，加完必须手动刷一次
    stage.renderer.shadowMap.needsUpdate = true;
    window.__glbTrees = { count: REPLACE.length, loaded: true };
    console.info('[写实树] 已放置 ' + REPLACE.length + ' 棵');
  }, undefined, err => {
    console.warn('[写实树] 加载失败，程序树保留：', err);
    window.__glbTrees = { count: 0, loaded: false, error: String(err) };
  });
}
boot();
