/* 清障：把长进殿内、压住屋檐、堵在券门跟前的树挪走。
 * 园林是按「整片坡地」撒树的，没有避让建筑；烘焙建筑与它互不知情，
 * 于是就有了「室内长树」「券门后面全被树堵死」这些现象。
 * 这里在所有模块建完之后扫一遍实例化植被，凡实例落进禁入框的，把矩阵缩到不可见。
 * 只动实例矩阵，不删对象，切换季节、重新布局都不受影响。
 */
import {NO_PLANT_BOXES, inNoPlant} from './zones.js?v=20261112h';

export function initClearance(ctx){
  const T = ctx.T;

  /* 禁入框统一放在 zones.js：园林生成时也用它，不再事后补救。
   * PAD 外扩，让树冠也不至于压在檐口上。 */
  const PAD = 2.4;
  const inBox = (x,z) => inNoPlant(x,z,PAD);

  const M = new T.Matrix4(), P = new T.Vector3(), Q = new T.Quaternion(), S = new T.Vector3();
  const out = new T.Matrix4();
  let trees = 0, cleared = 0;

  ctx.scene.traverse(o => {
    if (!o.isInstancedMesh || !o.instanceMatrix || o.userData.plantInstances !== true) return;
    let p = o, mine = false;
    for (; p; p = p.parent) if (p === ctx.root){ mine = true; break; }
    if (mine) return;                                  // 自己新加的灯、雪、树不动
    const g = o.geometry;
    if (!g) return;
    if (!g.boundingBox) g.computeBoundingBox();
    const bb = g.boundingBox;
    if (!bb) return;
    const gh = bb.max.y - bb.min.y;                    // 单株几何高度

    let touched = false;
    for (let i = 0; i < o.count; i++){
      o.getMatrixAt(i, M);
      M.decompose(P, Q, S);
      const hh = gh * Math.abs(S.y);
      if (hh < 1.9) continue;                          // 灌木、草、花不参与
      if (S.length() < 1e-4) continue;                 // 已经清过的
      trees++;
      if (!inBox(P.x, P.z)) continue;
      out.compose(P, Q, new T.Vector3(.001,.001,.001));
      o.setMatrixAt(i, out);
      touched = true;
      cleared++;
    }
    if (touched) o.instanceMatrix.needsUpdate = true;
  });

  return {
    get cleared(){ return cleared; },
    get trees(){ return trees; },
    get boxes(){ return NO_PLANT_BOXES.length; }
  };
}
