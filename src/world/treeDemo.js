// ---------------------------------------------------------------------------
// 树木 demo —— 四种（按用户提供的参考图，体素方块风）
//
// A  白桦：白色树干带黑斑 + 稀疏散布的绿叶
// B  橡树：粗壮分叉树干 + 团簇状圆球树冠
// C  云杉：分层塔状 + 逐层收窄
// D  秋树：粗短树干 + 橙红黄混合叶团
//
// ★ 设计原则（用户要求「干净、不要小杂点、体块干净」）：
//   · 树叶全部用【整数格方块】堆叠，格距统一，不做随机碎裂；
//   · 每个方块都是完整的长方体，不加噪点、不加贴片；
//   · 树冠轮廓用数学函数（球形/锥形）判定格子是否填充，
//     所以边缘规整、不会出现零散小块。
// ---------------------------------------------------------------------------
import * as THREE from 'three';
import { box, cyl, tint, meshFrom } from '../util/geo.js';

const part = (arr, geo) => { arr.push(geo); return geo; };

function build(parts, name) {
  const m = meshFrom(parts);
  m.name = name;
  return m;
}

// ---------------------------------------------------------------------------
// 通用：按球形判定填充方块（用于树冠）
//   cx/cy/cz 球心，r 半径，cell 格边长，skip(x,y,z) 可排除某些格子
// ---------------------------------------------------------------------------
function fillSphere(parts, cx, cy, cz, r, cell, color, jitter, skip) {
  const n = Math.ceil(r / cell);
  for (let ix = -n; ix <= n; ix++) {
    for (let iy = -n; iy <= n; iy++) {
      for (let iz = -n; iz <= n; iz++) {
        const px = ix * cell, py = iy * cell, pz = iz * cell;
        const d = Math.sqrt(px * px + py * py + pz * pz);
        // ★ 判定用「格子中心到球心」，比用格角更均匀，边缘不会出现锯齿缺口
        if (d > r) continue;
        if (skip && skip(px, py, pz, d)) continue;
        // 用 d/r 做轻微明暗（同一色系，不是随机杂点）
        const t = jitter ? (d / r) * jitter : 0;
        part(parts, box(cell, cell, cell,
          shiftColor(color, -t), cx + px, cy + py - cell / 2, cz + pz));
      }
    }
  }
}

// ---------------------------------------------------------------------------
// 落叶：在树根周围撒一圈小方块（用户要求「每棵树都设计一些落叶」）
//
// ★ 数量固定、位置用极坐标均匀分布 + 轻微的半径/角度扰动，
//   看起来自然但不会变成杂乱噪点；
//   每片落叶都是扁平方块，符合体素风。
// ---------------------------------------------------------------------------
// ★ 全局开关：场景里使用时跳过落叶
//   demo 页：树站在自己的草地上，周围散落落叶是加分细节
//   场景里：4 棵树各自散 14~22 片叶子 → 草地上 64 片碎叶，
//           和"干净、无杂点"的要求冲突，看起来像脏点。
let SKIP_LEAVES = false;
export function setSkipFallenLeaves(v) { SKIP_LEAVES = !!v; }

function addFallenLeaves(parts, count, radius, colors, seed) {
  if (SKIP_LEAVES) return;
  // 简单的确定性伪随机（同一棵树每次结果一致，不会闪）
  let s = seed || 1;
  const rnd = () => {
    s = (s * 1103515245 + 12345) & 0x7fffffff;
    return s / 0x7fffffff;
  };
  for (let i = 0; i < count; i++) {
    const ang = (i / count) * Math.PI * 2 + rnd() * 0.35;
    const r = radius * (0.42 + rnd() * 0.58);
    const x = Math.cos(ang) * r;
    const z = Math.sin(ang) * r;
    const col = colors[i % colors.length];
    // 扁平方块（厚度 0.06，贴地）
    part(parts, box(0.20, 0.06, 0.20, col, x, 0.03, z));
    // 部分落叶旋转 45°（用更窄的块近似）
    if (i % 3 === 0) {
      part(parts, box(0.14, 0.05, 0.14, col, x + 0.16, 0.025, z - 0.10));
    }
  }
}

// 颜色明暗偏移（同一色相，只改明度，避免出现杂色）
function shiftColor(hex, t) {
  const r = (hex >> 16) & 255, g = (hex >> 8) & 255, b = hex & 255;
  const k = 1 + t;
  const cl = (v) => Math.max(0, Math.min(255, Math.round(v * k)));
  return (cl(r) << 16) | (cl(g) << 8) | cl(b);
}

// 通用：方形草地底座（参考图里每棵树都站在一块方形草皮上）
function addBase(parts, size, dirtColor, grassColor) {
  const half = size / 2;
  // 土块
  part(parts, box(size, 0.55, size, dirtColor, 0, -0.55, 0));
  // 草皮（略小一圈，露出土边）
  part(parts, box(size * 0.96, 0.30, size * 0.96, grassColor, 0, -0.16, 0));
  // 四角的草簇（整齐摆放，不是随机杂点）
  const s = size * 0.36;
  for (const [sx, sz] of [[-1, -1], [1, -1], [-1, 1], [1, 1]]) {
    part(parts, box(0.16, 0.30, 0.16, grassColor, sx * s, 0, sz * s));
  }
}

// ===========================================================================
// A：白桦（白色树干带黑斑 + 稀疏散布的绿叶）
// ===========================================================================
export function makeBirch() {
  const parts = [];
  const barkWhite = 0xe8e4d8;
  const barkDark = 0x3a3630;
  const leafA = 0x8ab84a;
  const leafB = 0x76a83e;
  const dirt = 0x6a4a30;
  const grass = 0x7aa848;


  // ---- 树干：白色方柱，带黑色横斑 ----
  const trunkW = 0.46, trunkH = 5.0;
  const cell = 0.46;
  const nSeg = Math.round(trunkH / cell);
  for (let i = 0; i < nSeg; i++) {
    const y = i * cell;
    // 树干每段都是一个方块（竖直堆叠，干净）
    part(parts, box(trunkW, cell, trunkW, barkWhite, 0, y, 0));
  }
  // 黑色横斑：每隔几段在正面/侧面贴一块【同尺寸的薄片】
  //   ★ 只贴在方块表面，厚度固定、位置对齐格线，不会形成杂点
  const marks = [1, 2, 4, 6, 8, 10, 12, 13];
  for (const i of marks) {
    const y = i * cell + cell * 0.30;
    const face = i % 2 === 0 ? 1 : -1;
    // 前面
    part(parts, box(trunkW * 0.72, cell * 0.34, 0.03, barkDark,
      cell * 0.08 * face, y, trunkW / 2));
    // 侧面（错开，形成斑驳感）
    part(parts, box(0.03, cell * 0.30, trunkW * 0.66, barkDark,
      face * trunkW / 2, y + cell * 0.4, -cell * 0.06));
  }

  // ---- 树枝（4 根，斜向上，用短方块串）----
  const branches = [
    { a: 0.4, y: 3.4, len: 1.5 },
    { a: 2.1, y: 3.9, len: 1.3 },
    { a: 3.9, y: 4.3, len: 1.2 },
    { a: 5.3, y: 4.7, len: 1.0 },
  ];
  for (const b of branches) {
    const steps = 4;
    for (let k = 0; k < steps; k++) {
      const t = (k + 1) / steps;
      const r = b.len * t;
      const y = b.y + r * 0.55;
      part(parts, box(0.20, 0.20, 0.20, barkWhite,
        Math.cos(b.a) * r, y, Math.sin(b.a) * r));
    }
  }

  // ---- 树冠：稀疏的圆形叶簇（4 团，用球形填充）----
  // ★ 白桦树冠要【更大更密】（参考图里树冠占整体 2/3）
  const clusters = [
    { x: 0.0, y: 5.2, z: 0.0, r: 2.10 },
    { x: 1.60, y: 4.6, z: 0.50, r: 1.55 },
    { x: -1.50, y: 4.7, z: -0.60, r: 1.50 },
    { x: 0.35, y: 6.6, z: 0.60, r: 1.35 },
    { x: -0.40, y: 5.4, z: 1.55, r: 1.30 },
    { x: 0.45, y: 5.3, z: -1.50, r: 1.28 },
  ];
  const lc = 0.34;   // 叶块边长
  for (const cl of clusters) {
    fillSphere(parts, cl.x, cl.y, cl.z, cl.r, lc, leafA, 0.22,
      // ★ 挖掉内部格子（距离球心 < 0.55r 的不画），
      //   减少面数、也让树冠看起来是「壳」而不是实心块
      (px, py, pz, d) => d < cl.r * 0.55);
  }
  // 补充一层深色叶（只在上半部分，形成体积感）
  for (const cl of clusters) {
    fillSphere(parts, cl.x, cl.y + 0.15, cl.z, cl.r * 0.92, lc * 1.15, leafB, 0.18,
      (px, py, pz, d) => d < cl.r * 0.70 || py < -0.15);
  }

  // 落叶（白桦的黄绿小叶，撒在根部）
  addFallenLeaves(parts, 14, 2.2, [0xa8c85a, 0x8ab84a, 0xc8d878], 11);

  return build(parts, 'treeBirch');
}

// ===========================================================================
// B：橡树（粗壮分叉树干 + 团簇状圆球树冠）
// ===========================================================================
export function makeOak() {
  const parts = [];
  const bark = 0x6a4a30;
  const barkLight = 0x7a5a3a;
  const leafA = 0x5a9438;
  const leafB = 0x4a8030;
  const leafC = 0x76a83e;
  const dirt = 0x6a4a30;
  const grass = 0x7aa848;


  // ---- 树干：粗方柱 + 根部外扩 ----
  const tw = 0.72;
  part(parts, box(tw * 1.5, 0.50, tw * 1.5, bark, 0, 0, 0));   // 根部
  part(parts, box(tw * 1.25, 0.70, tw * 1.25, bark, 0, 0.50, 0));
  part(parts, box(tw, 2.20, tw, bark, 0, 1.20, 0));
  // 树干上的竖向纹理（细长条，对齐格线）
  for (const [sx, sz] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
    part(parts, box(sx !== 0 ? 0.03 : tw * 0.30, 2.0, sz !== 0 ? 0.03 : tw * 0.30,
      barkLight, sx * (tw / 2), 1.30, sz * (tw / 2)));
  }

  // ---- 主枝（4 根粗枝，从树干顶部斜向上分叉）----
  const mainBranches = [
    { a: 0.5, y: 3.3, len: 1.9, thick: 0.44 },
    { a: 2.3, y: 3.4, len: 1.7, thick: 0.40 },
    { a: 4.0, y: 3.2, len: 1.8, thick: 0.42 },
    { a: 5.4, y: 3.5, len: 1.5, thick: 0.36 },
  ];
  for (const b of mainBranches) {
    const steps = 5;
    for (let k = 0; k < steps; k++) {
      const t = (k + 1) / steps;
      const r = b.len * t;
      const y = b.y + r * 0.62;
      const th = b.thick * (1 - t * 0.35);
      part(parts, box(th, th, th, bark,
        Math.cos(b.a) * r, y, Math.sin(b.a) * r));
    }
  }
  // 中央主干（继续向上）
  part(parts, box(0.50, 1.4, 0.50, bark, 0, 3.2, 0));

  // ---- 树冠：6 团大圆球（参考图里是明显的团簇状）----
  const clusters = [
    { x: 0.0, y: 5.6, z: 0.0, r: 1.85 },
    { x: 2.05, y: 5.0, z: 0.30, r: 1.50 },
    { x: -1.95, y: 5.1, z: -0.25, r: 1.48 },
    { x: 0.35, y: 5.0, z: 1.90, r: 1.42 },
    { x: -0.30, y: 5.0, z: -1.85, r: 1.40 },
    { x: 0.10, y: 6.9, z: 0.10, r: 1.30 },
  ];
  const lc = 0.34;
  for (const cl of clusters) {
    // 主叶（中绿）
    fillSphere(parts, cl.x, cl.y, cl.z, cl.r, lc, leafA, 0.20,
      (px, py, pz, d) => d < cl.r * 0.50);
    // 深色叶（下半，做阴影感）
    fillSphere(parts, cl.x, cl.y - 0.20, cl.z, cl.r * 0.88, lc * 1.1, leafB, 0.16,
      (px, py, pz, d) => d < cl.r * 0.60 || py > 0);
    // 亮色叶（顶部，做高光感）
    fillSphere(parts, cl.x, cl.y + 0.55, cl.z, cl.r * 0.62, lc * 1.2, leafC, 0.14,
      (px, py, pz, d) => d < cl.r * 0.35 || py < 0);
  }

  // 落叶（橡树的深绿大叶）
  addFallenLeaves(parts, 16, 2.9, [0x5a9438, 0x4a8030, 0x76a83e], 23);

  return build(parts, 'treeOak');
}

// ===========================================================================
// C：云杉（分层塔状 + 逐层收窄）
// ===========================================================================
export function makeSpruce() {
  const parts = [];
  const bark = 0x5a3e28;
  const leafA = 0x3a7a3a;
  const leafB = 0x4a8a42;
  const leafC = 0x2e6a30;
  const dirt = 0x6a4a30;
  const grass = 0x7aa848;


  // ---- 树干（棕色方柱，只在树冠下方露出）----
  //   ★ 尺寸迭代：2.8m（太矮）→ 6.4m（太高）→ 现在 3.2m（6.4 的 50%）
  //     3.2m ≈ 1.55 个人高（人物 2.07m），树干高挑但不夸张。
  part(parts, box(0.56, 1.8, 0.56, bark, 0, 0, 0));
  part(parts, box(0.48, 1.4, 0.48, bark, 0, 1.8, 0));

  // ---- 10 层塔状树冠 ----
  const layers = 10;
  const baseY = 3.0;        // 树冠从树干顶（3.2）稍下方开始
  const topY = 10.6;        // 塔形总高约 10.8m
  const cell = 0.38;
  for (let i = 0; i < layers; i++) {
    const t = i / (layers - 1);
    const y = baseY + (topY - baseY) * t;
    // 该层半径：底部最宽，顶部收成尖
    const r = 2.35 * (1 - t * 0.92);
    const n = Math.round(r / cell);
    // 明暗：下层深、上层亮
    const col = i % 2 === 0 ? leafA : leafB;
    for (let ix = -n; ix <= n; ix++) {
      for (let iz = -n; iz <= n; iz++) {
        const px = ix * cell, pz = iz * cell;
        // 方形判据（不是圆！参考图里云杉是方塔状）
        if (Math.abs(px) > r || Math.abs(pz) > r) continue;
        // 挖空中心（省面数，也像真实枝叶）
        if (i < layers - 1 && Math.abs(px) < 0.30 && Math.abs(pz) < 0.30) continue;
        part(parts, box(cell, cell, cell, col, px, y, pz));
      }
    }
    // 层底的深色（做成层叠阴影）
    for (let ix = -n; ix <= n; ix++) {
      for (let iz = -n; iz <= n; iz++) {
        const px = ix * cell, pz = iz * cell;
        if (Math.abs(px) > r || Math.abs(pz) > r) continue;
        if (Math.abs(px) < r * 0.45 && Math.abs(pz) < r * 0.45) continue;
        part(parts, box(cell * 0.94, cell * 0.34, cell * 0.94, leafC, px, y - cell * 0.55, pz));
      }
    }
  }
  // 树顶尖
  part(parts, box(0.34, 0.55, 0.34, leafB, 0, topY + 0.22, 0));

  // 落叶（云杉的针叶少一些，颜色更深）
  //   ★ 树冠半径从 2.35 增到约 2.6、树干加高后整体更大，
  //     落叶范围同步从 2.2 扩到 3.2，否则叶子全堆在树根上。
  addFallenLeaves(parts, 12, 3.2, [0x3a7a3a, 0x2e6a30, 0x4a8a42], 37);

  return build(parts, 'treeSpruce');
}

// ===========================================================================
// D：秋树（粗短树干 + 橙红黄混合叶团）
// ===========================================================================
export function makeAutumnTree() {
  const parts = [];
  const bark = 0x5a4030;
  const barkDark = 0x46301f;
  const leafOrange = 0xd86820;
  const leafRed = 0xb83a1a;
  const leafYellow = 0xe8a830;
  const leafDeep = 0x9a3018;
  const dirt = 0x6a4a30;
  const grass = 0x8a8a3a;

  // （地面落叶已删除，保持干净）

  // ---- 树干：粗短（参考图里树干很短，树冠从很低的地方就开始）----
  const tw = 0.62;
  part(parts, box(tw * 1.4, 0.40, tw * 1.4, barkDark, 0, 0, 0));
  part(parts, box(tw, 1.70, tw, bark, 0, 0.40, 0));
  // 树干竖向纹理
  for (const [sx, sz] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
    part(parts, box(sx !== 0 ? 0.03 : tw * 0.28, 1.5, sz !== 0 ? 0.03 : tw * 0.28,
      barkDark, sx * (tw / 2), 0.5, sz * (tw / 2)));
  }

  // ---- 分叉（4 根短粗枝）----
  const branches = [
    { a: 0.6, y: 1.9, len: 1.1, thick: 0.34 },
    { a: 2.4, y: 2.0, len: 1.0, thick: 0.32 },
    { a: 4.1, y: 1.85, len: 1.05, thick: 0.33 },
    { a: 5.5, y: 2.05, len: 0.95, thick: 0.30 },
  ];
  for (const b of branches) {
    const steps = 3;
    for (let k = 0; k < steps; k++) {
      const t = (k + 1) / steps;
      const r = b.len * t;
      const y = b.y + r * 0.75;
      const th = b.thick * (1 - t * 0.30);
      part(parts, box(th, th, th, bark, Math.cos(b.a) * r, y, Math.sin(b.a) * r));
    }
  }

  // ---- 树冠：5 团叶球，橙红黄混色 ----
  const clusters = [
    { x: 0.0, y: 4.3, z: 0.0, r: 1.75 },
    { x: 1.85, y: 3.9, z: 0.25, r: 1.40 },
    { x: -1.75, y: 4.0, z: -0.20, r: 1.38 },
    { x: 0.30, y: 3.85, z: 1.75, r: 1.32 },
    { x: -0.25, y: 4.0, z: -1.70, r: 1.30 },
  ];
  const lc = 0.32;
  for (const cl of clusters) {
    // 主体：橙色
    fillSphere(parts, cl.x, cl.y, cl.z, cl.r, lc, leafOrange, 0.18,
      (px, py, pz, d) => d < cl.r * 0.48);
    // 深红（下半）
    fillSphere(parts, cl.x, cl.y - 0.25, cl.z, cl.r * 0.85, lc * 1.1, leafRed, 0.16,
      (px, py, pz, d) => d < cl.r * 0.58 || py > 0);
    // 黄色（顶部 + 外侧）
    fillSphere(parts, cl.x, cl.y + 0.55, cl.z, cl.r * 0.70, lc * 1.15, leafYellow, 0.14,
      (px, py, pz, d) => d < cl.r * 0.40 || py < -0.10);
  }
  // 几块深色叶（点缀内部，数量固定、位置整齐）
  for (const [x, y, z] of [[0.9, 4.6, 0.8], [-1.0, 4.3, -0.9], [1.3, 3.6, -1.0], [-1.2, 3.8, 1.0]]) {
    part(parts, box(lc * 1.3, lc * 1.3, lc * 1.3, leafDeep, x, y, z));
  }

  // 落叶（秋树的橙红黄落叶，数量最多、最显眼）
  addFallenLeaves(parts, 22, 2.8, [0xd86820, 0xb83a1a, 0xe8a830, 0x9a3018], 53);

  return build(parts, 'treeAutumn');
}
