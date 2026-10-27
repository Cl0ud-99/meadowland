// ---------------------------------------------------------------------------
// 可替换作物 —— 使用 cropDemo.js 里的精细模型
//
// ★ 密度说明：
//   新版模型体积大（宽 2.1~4.15）+ 顶点多（每株 2000~9000），
//   田地里的密度必须压得很低，否则：
//     1) 株间严重重叠；
//     2) 实例数 × 单株顶点数 爆掉（289 株 × 8000 = 230 万顶点 → 加载超时）。
//
//   实测：30×30 的田，每株间距 >= 4 时视觉效果最好，
//   对应 7~8 列 × 5~6 行 ≈ 40 株。
// ---------------------------------------------------------------------------
export const CROP_TYPES = [
  // 小麦：新版高 3.82，模型较密 → 少量大间距
  { kind: 'wheat',      name: '小麦',   color: 0xdfc062, soil: 0xa8875a, rows: 17, cols: 23, scale: [0.9, 1.1] },
  // 南瓜：新版宽 2.6
  { kind: 'pumpkin',    name: '南瓜',   color: 0xe08a3c, soil: 0x8f6f4a, rows: 5, cols: 8, scale: [1.0, 1.15] },
  // 向日葵：新版高 3.42
  { kind: 'sunflower',  name: '向日葵', color: 0xf0c04a, soil: 0x9a7a52, rows: 4, cols: 5,  scale: [0.9, 1.1] },
  // 玉米：新版最高 4.32
  { kind: 'corn',       name: '玉米',   color: 0x7ab05a, soil: 0x9a7a52, rows: 4, cols: 4,  scale: [0.9, 1.1] },
  // 胡萝卜：新版高 2.32
  { kind: 'carrot',     name: '胡萝卜', color: 0x5f9a3a, soil: 0xa8875a, rows: 4, cols: 5,  scale: [0.9, 1.1] },
  // 卷心菜 / 番茄 / 薰衣草：保留旧版轻量几何
  { kind: 'cabbage',    name: '卷心菜', color: 0x74b84e, soil: 0x9c7d55, rows: 20, cols: 22, scale: [0.9, 1.15] },
  { kind: 'tomato',     name: '番茄',   color: 0x5f9a44, soil: 0x8f6f4a, rows: 8, cols: 14, scale: [0.9, 1.1] },
  { kind: 'lavender',   name: '薰衣草', color: 0x9a7ac8, soil: 0x9a7a62, rows: 9, cols: 16, scale: [0.9, 1.15] },
];
