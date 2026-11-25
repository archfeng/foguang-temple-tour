/* 画质档
 * 手机 GPU 和桌面显卡差一个量级，同一套参数必然有一边难受。
 * 这里只判断一次，各处 import 同一个结论，避免每处各写一套 media query。
 */
const coarse = !!(window.matchMedia && window.matchMedia('(pointer:coarse)').matches);
// 只看宽度：1280×800 的桌面窗口短边也是 800，用短边会把电脑误判成手机
const width = window.innerWidth || 1e4;

// 触屏、窄屏、或者内存特别小的机器，都按低档走
const mem = navigator.deviceMemory || 0;   // GB，只有 Chrome 系给

export const LOW = coarse || width <= 820 || (mem > 0 && mem <= 3);

export const Q = {
  low: LOW,
  // 像素比：手机 DPR 常是 3，按 3 渲染等于四倍像素填充，1.2 已经足够清楚
  pixelRatio: Math.min(window.devicePixelRatio || 1, LOW ? 1.2 : 1.6),
  minPixelRatio: LOW ? .75 : 1,
  antialias: !LOW,
  shadowSize: LOW ? 1024 : 2048,
  shadowType: LOW ? 'pcf' : 'soft',
  // 叶团细分：detail 1 是 80 面，0 是 20 面。手机屏小，远看几乎没差别
  leafDetail: LOW ? 0 : 1,
  cylSeg: LOW ? 6 : 9,
  discSeg: LOW ? 12 : 22,
  omenDpr: LOW ? 1 : 1.6,
  // 阴影重算间隔（毫秒）：场景是静的，没必要每帧重画一遍
  shadowEvery: LOW ? 900 : 700
};
