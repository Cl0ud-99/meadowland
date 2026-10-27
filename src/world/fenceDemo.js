// ---------------------------------------------------------------------------
// 围栏 demo —— 三种木栅栏（按用户提供的参考图，体素方块风）
//
// A  尖顶木板栅栏（参考图）：竖板 + 尖顶 + 高矮错落 + 两道横梁 + 钉子
// B  尖桩栅栏（picket）：细窄的尖桩，间距均匀，农场风格
// C  横板围栏（rail）：3 道横板 + 粗立柱，牧场风格
//
// 设计原则（要求同上）：干净、无杂点、体块干净
//   - 每块木板都是完整长方体，顶部用 1~2 个小方块收成尖
//   - 木纹只用 2~3 条竖细条，位置固定，不随机撒点
//   - 钉子只在横梁与木板交点，左右对称
// ---------------------------------------------------------------------------
import * as THREE from 'three';
import { box, tint, meshFrom } from '../util/geo.js';

const part = (arr, geo) => { arr.push(geo); return geo; };

function build(parts, name) {
  const m = meshFrom(parts);
  m.name = name;
  return m;
}

// ---------------------------------------------------------------------------
// 单块木板：竖直板 + 尖顶 + 木纹
//   x/z 位置，y 底部，w 宽，d 厚，h 高，tip 是否尖顶
// ---------------------------------------------------------------------------
function addPlank(parts, x, y, z, w, d, h, color, dark, tip) {
  // 主板
  part(parts, box(w, h, d, color, x, y, z));
  // 尖顶：用两级递减的小块，形成三角尖（体素风）
  if (tip) {
    part(parts, box(w * 0.72, h * 0.10, d, color, x, y + h, z));
    part(parts, box(w * 0.40, h * 0.07, d, color, x, y + h * 1.10, z));
  }
  // 木纹：2 条竖细条，位置固定（不是随机杂点）
  for (const off of [-w * 0.22, w * 0.24]) {
    part(parts, box(w * 0.06, h * 0.86, 0.02, dark, x + off, y + h * 0.07, z + d / 2));
  }
}

// ---------------------------------------------------------------------------
// A：尖顶木板栅栏（参考图）
// ---------------------------------------------------------------------------
export function makePlankFence() {
  const parts = [];
  const wood = 0x8a6a48;
  const woodDark = 0x6a4e32;
  const woodLight = 0x9a7a54;
  const rail = 0x7a5a3c;
  const nail = 0x4a3a2a;

  const N = 10;            // 木板数（参考图约 10 块）
  const spacing = 0.62;    // 板间距
  const totalW = (N - 1) * spacing;
  const startX = -totalW / 2;

  // 木板高矮错落（固定数组，不随机）
  const heights = [1.55, 1.38, 1.62, 1.30, 1.48, 1.66, 1.34, 1.58, 1.44, 1.60];
  const tipFlags = [1, 1, 1, 0, 1, 1, 1, 1, 1, 1];   // 第 4 块是平顶（参考图有一块平的）

  const boardW = 0.50;
  const boardD = 0.14;

  // ---- 木板 ----
  for (let i = 0; i < N; i++) {
    const x = startX + i * spacing;
    const h = heights[i];
    const col = i % 3 === 0 ? woodLight : (i % 3 === 1 ? wood : woodDark);
    addPlank(parts, x, 0, 0, boardW, boardD, h, col, woodDark, tipFlags[i] === 1);
  }

  // ---- 两道横梁（在木板后面）----
  const railY = [0.34, 1.06];
  for (const ry of railY) {
    part(parts, box(totalW + boardW + 0.30, 0.16, 0.10, rail, 0, ry, -boardD / 2 - 0.06));
  }

  // ---- 钉子（每块木板 × 每道横梁，左右对称两颗）----
  for (let i = 0; i < N; i++) {
    const x = startX + i * spacing;
    for (const ry of railY) {
      for (const sgn of [-1, 1]) {
        part(parts, box(0.055, 0.055, 0.03, nail,
          x + sgn * boardW * 0.26, ry + 0.05, boardD / 2 + 0.01));
      }
    }
  }

  return build(parts, 'fencePlank');
}

// ===========================================================================
// B：尖桩栅栏（picket）—— 细窄尖桩 + 均匀间距 + 两道横梁
// ===========================================================================
export function makePicketFence() {
  const parts = [];
  const white = 0xe8e2d4;
  const whiteDark = 0xd0c8b6;
  const whiteShade = 0xc0b8a6;
  const nail = 0x8a8270;

  const N = 14;
  const spacing = 0.46;
  const totalW = (N - 1) * spacing;
  const startX = -totalW / 2;
  const picketW = 0.20;
  const picketD = 0.10;
  const picketH = 1.30;

  // ---- 尖桩（等高等距）----
  for (let i = 0; i < N; i++) {
    const x = startX + i * spacing;
    addPlank(parts, x, 0, 0, picketW, picketD, picketH,
      i % 2 === 0 ? white : whiteDark, whiteShade, true);
  }

  // ---- 两道横梁 ----
  for (const ry of [0.26, 0.94]) {
    part(parts, box(totalW + picketW + 0.24, 0.13, 0.08, whiteDark,
      0, ry, -picketD / 2 - 0.05));
  }

  // ---- 钉子 ----
  for (let i = 0; i < N; i++) {
    const x = startX + i * spacing;
    for (const ry of [0.26, 0.94]) {
      part(parts, box(0.045, 0.045, 0.025, nail,
        x, ry + 0.04, picketD / 2 + 0.01));
    }
  }

  return build(parts, 'fencePicket');
}

// ===========================================================================
// C：横板围栏（rail）—— 粗立柱 + 3 道横板，牧场风格
// ===========================================================================
export function makeRailFence() {
  const parts = [];
  const wood = 0x9a7a52;
  const woodDark = 0x7a5c3a;
  const woodLight = 0xae8e62;
  const postC = 0x6a4e32;
  const nail = 0x4a3a2a;

  const posts = 4;          // 4 根立柱
  const span = 2.30;        // 柱间距
  const totalW = (posts - 1) * span;
  const startX = -totalW / 2;

  // ---- 立柱（粗方柱，顶部略尖）----
  for (let i = 0; i < posts; i++) {
    const x = startX + i * span;
    part(parts, box(0.26, 1.60, 0.26, postC, x, 0, 0));
    // 顶部小尖
    part(parts, box(0.20, 0.08, 0.20, postC, x, 1.60, 0));
    part(parts, box(0.13, 0.06, 0.13, postC, x, 1.68, 0));
    // 柱身木纹（固定两条）
    for (const off of [-0.07, 0.07]) {
      part(parts, box(0.03, 1.45, 0.02, woodDark, x + off, 0.08, 0.13));
    }
  }

  // ---- 3 道横板（每跨一段）----
  const railYs = [0.42, 0.86, 1.30];
  for (let i = 0; i < posts - 1; i++) {
    const x0 = startX + i * span;
    const x1 = startX + (i + 1) * span;
    const cx = (x0 + x1) / 2;
    for (let k = 0; k < railYs.length; k++) {
      const ry = railYs[k];
      const col = k % 2 === 0 ? wood : woodLight;
      // 横板（略窄于柱间距，两端被柱子压住）
      part(parts, box(span - 0.10, 0.17, 0.09, col, cx, ry, 0.10));
      // 横板木纹（一条）
      part(parts, box(span - 0.30, 0.03, 0.02, woodDark, cx, ry + 0.06, 0.15));
    }
  }

  // ---- 钉子（横板与柱的交点）----
  for (let i = 0; i < posts; i++) {
    const x = startX + i * span;
    for (const ry of railYs) {
      part(parts, box(0.05, 0.05, 0.03, nail, x, ry + 0.05, 0.15));
    }
  }

  return build(parts, 'fenceRail');
}
