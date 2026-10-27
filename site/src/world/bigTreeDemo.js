// ---------------------------------------------------------------------------
// 参天大树 demo —— 9 种体素巨树（严格按用户参考图的"形"重做）
//
// ★ 上一版失败的原因：树冠做成一个大球、树干只有一截矮桩，
//   和参考图毫无关系。参考图的共性是：
//     · 树干【明显锥度】、根部外扩；
//     · 主枝【可见分叉】并伸进树冠，枝叶长在枝端；
//     · 树冠由【多个叶团】组成，不是单一球体；
//     · 层叠型（常青树）有【分层外张下垂】的枝叶平台。
//   本版全部按这个结构重做。
//
// 尺寸对齐现有参天大树（TRUNK_H 14 + 冠 10 ≈ 高 25、冠半径 10）。
// 干净原则：叶团用整数格 + 按高度三档明暗（下深/中基/上亮），
//   不做随机杂点；内部挖空省面。
// ---------------------------------------------------------------------------
import * as THREE from '../../vendor/three/three.module.js';
import { box, tint, meshFrom } from '../util/geo.js';

const part = (arr, geo) => { arr.push(geo); return geo; };

function build(parts, name) {
  const m = meshFrom(parts);
  m.name = name;
  return m;
}

// ---------------------------------------------------------------------------
// 树干：圆形截面的锥形柱（上细下粗），带轻微树皮色带
// ---------------------------------------------------------------------------
function trunkTaper(parts, cx, cz, rBottom, rTop, h, colA, colB, cell = 0.58) {
  const n = Math.ceil(h / cell);
  for (let i = 0; i < n; i++) {
    const t = i / Math.max(1, n - 1);
    const y = i * cell;
    const r = rBottom + (rTop - rBottom) * t;
    const k = Math.max(1, Math.round(r / cell));
    const col = (i % 5 < 3) ? colA : colB;
    for (let ix = -k; ix <= k; ix++) {
      for (let iz = -k; iz <= k; iz++) {
        if (Math.hypot(ix, iz) > k) continue;
        part(parts, box(cell, cell, cell, col, cx + ix * cell, y, cz + iz * cell));
      }
    }
  }
}

// ---------------------------------------------------------------------------
// 枝：从 A 到 B 的阶梯状方柱链（体素风斜枝），越往外越细
// ---------------------------------------------------------------------------
function branchChain(parts, ax, ay, az, bx, by, bz, thick, cell, cols) {
  const dx = bx - ax, dy = by - ay, dz = bz - az;
  const len = Math.hypot(dx, dy, dz);
  if (len < 1e-4) return;
  const n = Math.max(2, Math.round(len / cell));
  for (let i = 0; i <= n; i++) {
    const t = i / n;
    const x = ax + dx * t, y = ay + dy * t, z = az + dz * t;
    const s = thick * (1 - t * 0.42);
    part(parts, box(s, cell * 1.2, s, cols[i % cols.length], x, y, z));
  }
}

// ---------------------------------------------------------------------------
// 叶团：椭球填格，按【高度】分三档明暗（下深 / 中基 / 上亮），内部挖空
//   —— 这样是"有体积的干净块"，不是杂点。
// ---------------------------------------------------------------------------
function foliage(parts, cx, cy, cz, rx, ry, rz, cell, cols, hollow = 0.45) {
  const nx = Math.ceil(rx / cell), ny = Math.ceil(ry / cell), nz = Math.ceil(rz / cell);
  for (let ix = -nx; ix <= nx; ix++) {
    for (let iy = -ny; iy <= ny; iy++) {
      for (let iz = -nz; iz <= nz; iz++) {
        const px = ix * cell, py = iy * cell, pz = iz * cell;
        const d = Math.sqrt((px / rx) ** 2 + (py / ry) ** 2 + (pz / rz) ** 2);
        if (d > 1) continue;
        if (d < hollow) continue;
        const t = (py / ry + 1) / 2;                  // 0 底 → 1 顶
        const col = t < 0.34 ? cols[0] : (t > 0.70 ? cols[2] : cols[1]);
        part(parts, box(cell, cell, cell, col, cx + px, cy + py - cell / 2, cz + pz));
      }
    }
  }
}

// ---------------------------------------------------------------------------
// 落叶：与树冠同色的扁平方块，极坐标均匀撒一圈（沿用原做法）
// ---------------------------------------------------------------------------
function fallenLeaves(parts, count, radius, cols) {
  for (let i = 0; i < count; i++) {
    const ang = (i / count) * Math.PI * 2 + ((i * 37) % 100) / 100 * 0.4;
    const rr = radius * (0.40 + ((i * 53) % 100) / 100 * 0.60);
    const x = Math.cos(ang) * rr, z = Math.sin(ang) * rr;
    const col = cols[i % cols.length];
    part(parts, box(0.40, 0.10, 0.40, col, x, 0.05, z));
    if (i % 3 === 0) {
      part(parts, box(0.26, 0.08, 0.26, cols[(i + 1) % cols.length], x + 0.28, 0.04, z - 0.18));
    }
  }
}

// ===========================================================================
// 1 分层常青树 —— 参考图 1：多层级、枝叶外张并下垂的塔形针叶树
// ===========================================================================
export function makeLayeredFir() {
  const parts = [];
  const bark = 0x5a4030, barkDark = 0x48301f;
  // teal 三档：暗 / 基 / 亮
  const C = [0x14565a, 0x1e7074, 0x2c8a86];

  // 主干：从地面到塔尖，明显锥度
  //   ★ 树干拉长 30%：22.5 → 29.3，叶层起点同步上移到 y=11，
  //     让底部露出约 9 单位的树干（清晰可见）。
  trunkTaper(parts, 0, 0, 1.8, 0.22, 29.3, bark, barkDark, 0.55);

  // 7 层枝叶平台：每层若干外张枝 + 枝端下垂叶盘
  //   ★ 半径用 1 - t^0.85 曲线：底部够宽、中段保持饱满、顶部收成尖但不过窄，
  //     避免上一版"顶部一个帽子"的问题。
  const tiers = 7;
  for (let i = 0; i < tiers; i++) {
    const t = i / (tiers - 1);
    // ★ 从 y=11 起：树干 0~9 完全露出
    const y = 11.0 + t * 17.0;                // 11.0 → 28.0
    const r = 8.6 * (1 - Math.pow(t, 0.85) * 0.90);   // 8.6 → 0.86
    const nb = i <= 1 ? 7 : (i <= 3 ? 6 : 4); // 下密上疏
    for (let b = 0; b < nb; b++) {
      const ang = (b / nb) * Math.PI * 2 + i * 0.42;
      const dx = Math.cos(ang), dz = Math.sin(ang);
      const tipX = dx * r, tipZ = dz * r;
      const tipY = y - r * 0.14;              // 枝端略下垂（0.14：不压树干）
      // 枝（从主干伸向枝端）
      branchChain(parts, dx * 0.45, y + 0.2, dz * 0.45,
        tipX, tipY, tipZ, 0.40, 0.55, [barkDark, bark]);
      // 枝端叶盘（扁椭球，外张下垂感）
      foliage(parts, tipX * 0.90, tipY - 0.10, tipZ * 0.90,
        Math.max(1.0, r * 0.50), Math.max(0.6, r * 0.19), Math.max(1.0, r * 0.50),
        0.55, C, 0.42);
    }
    // 层心叶盘（补满中心，避免中空）
    foliage(parts, 0, y + 0.35, 0, Math.max(1.2, r * 0.52), Math.max(0.8, r * 0.26),
      Math.max(1.2, r * 0.52), 0.55, C, 0.30);
  }
  // 塔尖（比上一层略收，但保持体积）
  foliage(parts, 0, 28.9, 0, 1.9, 2.2, 1.9, 0.52, C, 0.22);

  fallenLeaves(parts, 22, 10.0, C);
  return build(parts, 'bigTreeLayeredFir');
}

// ===========================================================================
// 2 分叉阔叶树 —— 参考图 2：粗壮锥形树干 + 明显分叉主枝 + 多个圆叶团
// ===========================================================================
export function makeBroadleaf() {
  const parts = [];
  const bark = 0x6b4a30, barkDark = 0x543823;
  const C = [0x2f6a24, 0x3f7d30, 0x52993c];

  // 粗壮锥形树干（底部外扩），到分叉点 y=8.1（原 6.2，拉长 30%）
  trunkTaper(parts, 0, 0, 2.4, 1.1, 8.1, bark, barkDark, 0.6);

  // 4 根主枝 + 每根再分 2 个次级枝（形成明显分叉骨架）
  const mains = [0.5, Math.PI / 2 + 0.35, Math.PI + 0.15, Math.PI * 1.5 + 0.4];
  const tips = [];
  for (const a of mains) {
    const dx = Math.cos(a), dz = Math.sin(a);
    const midX = dx * 4.2, midZ = dz * 4.2, midY = 11.5;
    branchChain(parts, 0, 7.7, 0, midX, midY, midZ, 0.95, 0.6, [barkDark, bark]);
    // 次级枝两根
    for (const s of [-0.55, 0.55]) {
      const a2 = a + s;
      const ex = midX + Math.cos(a2) * 3.6;
      const ez = midZ + Math.sin(a2) * 3.6;
      const ey = midY + 2.8;
      branchChain(parts, midX, midY, midZ, ex, ey, ez, 0.62, 0.6, [barkDark, bark]);
      tips.push({ x: ex, y: ey, z: ez, r: 3.4 });
    }
    tips.push({ x: midX * 1.15, y: midY + 0.6, z: midZ * 1.15, r: 4.0 });
  }
  // 中央大叶团（cell 加大到 0.85：体素感更强、顶点降约 40%）
  foliage(parts, 0, 13.5, 0, 6.4, 4.6, 6.4, 0.85, C, 0.45);
  // 枝端叶团
  for (const tp of tips) {
    foliage(parts, tp.x, tp.y, tp.z, tp.r, tp.r * 0.78, tp.r, 0.82, C, 0.42);
  }

  fallenLeaves(parts, 26, 10.2, C);
  return build(parts, 'bigTreeBroadleaf');
}

// ===========================================================================
// 3 凤凰木 —— 参考图 3：极宽的伞形冠，红橙黄，枝干在下层可见
// ===========================================================================
export function makePoinciana() {
  const parts = [];
  const bark = 0x5c3626, barkDark = 0x4a2a1c;
  const red = 0xc63a22, orange = 0xdd7524, yellow = 0xe8ae2a, brown = 0x8a5426;
  const C = [brown, orange, yellow];

  // 粗树干，很快分叉（原 5.6，拉长 30% → 7.3）
  trunkTaper(parts, 0, 0, 2.0, 0.85, 7.3, bark, barkDark, 0.6);

  // 5 根近乎水平的伞骨枝（伸得很远）
  const bones = 5;
  for (let i = 0; i < bones; i++) {
    const a = (i / bones) * Math.PI * 2 + 0.3;
    const dx = Math.cos(a), dz = Math.sin(a);
    const ex = dx * 9.0, ez = dz * 9.0, ey = 11.1;
    branchChain(parts, 0, 6.9, 0, ex, ey, ez, 0.72, 0.62, [barkDark, bark]);
    // 伞骨末端小叶团
    foliage(parts, ex * 0.92, ey + 0.5, ez * 0.92, 3.2, 1.5, 3.2, 0.66, C, 0.38);
  }

  // 主冠：极宽极扁（伞形）
  foliage(parts, 0, 12.9, 0, 9.8, 2.9, 9.8, 0.72, C, 0.40);
  // 上层提亮的小冠
  foliage(parts, 0, 15.1, 0, 6.2, 1.9, 6.2, 0.66, [orange, yellow, red], 0.35);

  fallenLeaves(parts, 30, 11.0, [red, orange, yellow]);
  return build(parts, 'bigTreePoinciana');
}

// ===========================================================================
// 4 仙人掌 —— 参考图 4：粗圆柱主干 + 弯臂 + 圆头
// ===========================================================================
export function makeCactus() {
  const parts = [];
  const g1 = 0x2f6a2c, g2 = 0x3f8a3a, g3 = 0x55a04c;

  const cell = 0.55;

  // ---- 主柱：圆形截面，带纵向棱条（8 条，明暗交替）----
  const H = 15.0;
  const nY = Math.ceil(H / cell);
  for (let iy = 0; iy < nY; iy++) {
    const y = iy * cell;
    const t = iy / nY;
    const r = 3.1 - t * 0.5;                 // 上略细
    const k = Math.round(r / cell);
    for (let ix = -k; ix <= k; ix++) {
      for (let iz = -k; iz <= k; iz++) {
        if (Math.hypot(ix, iz) > k) continue;   // 圆形截面
        const ang = Math.atan2(iz, ix);
        const rib = Math.floor(((ang + Math.PI) / (Math.PI * 2)) * 8) % 2;
        part(parts, box(cell, cell, cell, rib === 0 ? g2 : g1, ix * cell, y, iz * cell));
      }
    }
  }
  // ---- 顶部圆帽（半球）----
  const capR = 3.1;
  for (let iy = 0; iy <= 4; iy++) {
    const rr = capR * Math.cos((iy / 4) * Math.PI * 0.5);
    const k = Math.round(rr / cell);
    for (let ix = -k; ix <= k; ix++) {
      for (let iz = -k; iz <= k; iz++) {
        if (Math.hypot(ix, iz) > k) continue;
        part(parts, box(cell, cell, cell, g3, ix * cell, H + iy * cell, iz * cell));
      }
    }
  }

  // ---- 两条粗臂：先向外伸出，再向上弯，末端圆头 ----
  const arms = [
    { side: -1, baseY: 5.0, outLen: 3.2, upLen: 8.2 },
    { side: 1,  baseY: 6.8, outLen: 2.9, upLen: 6.8 },
  ];
  for (const arm of arms) {
    const s = arm.side;
    // 横臂（粗 1.9，圆形截面感：中心块 + 四向小块）
    const nOut = Math.ceil(arm.outLen / cell);
    for (let i = 0; i < nOut; i++) {
      const x = s * (2.6 + i * cell);
      part(parts, box(cell * 2.0, cell * 2.0, cell * 2.0, i % 2 ? g2 : g1, x, arm.baseY, 0));
    }
    // 竖臂
    const upX = s * (2.6 + arm.outLen);
    const nUp = Math.ceil(arm.upLen / cell);
    for (let i = 0; i < nUp; i++) {
      const y = arm.baseY + i * cell;
      part(parts, box(cell * 1.9, cell, cell * 1.9, i % 2 ? g1 : g2, upX, y, 0));
    }
    // 臂顶圆头
    for (let ix = -2; ix <= 2; ix++) {
      for (let iz = -2; iz <= 2; iz++) {
        if (Math.hypot(ix, iz) > 2) continue;
        part(parts, box(cell, cell, cell, g3, upX + ix * cell, arm.baseY + arm.upLen, iz * cell));
      }
    }
    // 臂与主柱的连接块（避免脱节）
    part(parts, box(cell * 2.0, cell * 2.0, cell * 2.0, g1, s * 2.0, arm.baseY, 0));
  }

  fallenLeaves(parts, 10, 5.5, [g3]);
  return build(parts, 'bigTreeCactus');
}

// ===========================================================================
// 5 紫叶树 —— 参考图 5：深色扭枝 + 紫色三角叶团
// ===========================================================================
export function makePurpleTree() {
  const parts = [];
  const bark = 0x3e2c22, barkDark = 0x2e2018;
  const C = [0x5a3f74, 0x70508c, 0x8a68a4];

  // 树干拉长 30%：6.0 → 7.8
  trunkTaper(parts, 0, 0, 2.0, 0.9, 7.8, bark, barkDark, 0.6);

  // 4 根弯曲主枝（扭枝感：分两段转折）
  for (let i = 0; i < 4; i++) {
    const a = (i / 4) * Math.PI * 2 + 0.4;
    const dx = Math.cos(a), dz = Math.sin(a);
    const mx = dx * 3.4, mz = dz * 3.4, my = 10.8;
    branchChain(parts, 0, 7.4, 0, mx, my, mz, 0.85, 0.6, [barkDark, bark]);
    const a2 = a + 0.7;
    const ex = mx + Math.cos(a2) * 3.2, ez = mz + Math.sin(a2) * 3.2, ey = 14.4;
    branchChain(parts, mx, my, mz, ex, ey, ez, 0.58, 0.6, [barkDark, bark]);
    foliage(parts, ex, ey + 1.2, ez, 3.5, 3.0, 3.5, 0.64, C, 0.40);
  }
  foliage(parts, 0, 14.2, 0, 6.6, 4.8, 6.6, 0.66, C, 0.42);

  fallenLeaves(parts, 26, 10.2, C);
  return build(parts, 'bigTreePurple');
}

// ===========================================================================
// 6 秋树 —— 参考图 6：红橙黄棕多色叶团，宽冠
// ===========================================================================
export function makeAutumnBig() {
  const parts = [];
  const bark = 0x5a3826, barkDark = 0x46291a;
  const red = 0xb83420, orange = 0xd07426, yellow = 0xdca828, brown = 0x7e4a24;
  const C = [brown, orange, yellow];

  // 树干拉长 30%：5.8 → 7.5
  trunkTaper(parts, 0, 0, 2.2, 1.0, 7.5, bark, barkDark, 0.6);

  // 5 根主枝
  for (let i = 0; i < 5; i++) {
    const a = (i / 5) * Math.PI * 2 + 0.25;
    const dx = Math.cos(a), dz = Math.sin(a);
    const ex = dx * 6.4, ez = dz * 6.4, ey = 12.7;
    branchChain(parts, 0, 7.1, 0, ex, ey, ez, 0.78, 0.6, [barkDark, bark]);
    foliage(parts, ex, ey + 1.0, ez, 3.8, 3.2, 3.8, 0.66, C, 0.40);
  }
  // 中央冠（红橙混）
  foliage(parts, 0, 13.5, 0, 7.2, 5.0, 7.2, 0.68, [brown, red, orange], 0.42);
  foliage(parts, 0, 17.3, 0, 4.4, 3.4, 4.4, 0.64, [orange, yellow, red], 0.38);

  fallenLeaves(parts, 30, 10.6, [red, orange, yellow, brown]);
  return build(parts, 'bigTreeAutumn');
}

// ===========================================================================
// 7 黄叶树 —— 参考图 7：金黄、枝多、叶团较散
// ===========================================================================
export function makeGoldenTree() {
  const parts = [];
  const bark = 0x54432c, barkDark = 0x40311f;
  const C = [0xb8981c, 0xd8bc28, 0xf0d848];

  // 树干拉长 30%：6.4 → 8.3
  trunkTaper(parts, 0, 0, 1.9, 0.8, 8.3, bark, barkDark, 0.6);

  // 6 根主枝（枝多、分布开）
  for (let i = 0; i < 6; i++) {
    const a = (i / 6) * Math.PI * 2 + 0.15;
    const dx = Math.cos(a), dz = Math.sin(a);
    const ex = dx * 7.0, ez = dz * 7.0, ey = 12.5 + (i % 3) * 1.4;
    branchChain(parts, 0, 7.9, 0, ex, ey, ez, 0.68, 0.6, [barkDark, bark]);
    foliage(parts, ex, ey + 1.2, ez, 3.2, 2.8, 3.2, 0.64, C, 0.38);
  }
  foliage(parts, 0, 14.5, 0, 6.0, 4.2, 6.0, 0.66, C, 0.42);
  foliage(parts, 0, 17.7, 0, 3.6, 2.8, 3.6, 0.62, C, 0.36);

  fallenLeaves(parts, 28, 10.4, C);
  return build(parts, 'bigTreeGolden');
}

// ===========================================================================
// 8 粉花树 —— 参考图 8：粉/玫瑰叶团，宽冠
// ===========================================================================
export function makePinkBlossom() {
  const parts = [];
  const bark = 0x3e2c22, barkDark = 0x2e2018;
  const C = [0xa84a68, 0xd07894, 0xf0b0c4];

  // 树干拉长 30%：6.0 → 7.8
  trunkTaper(parts, 0, 0, 2.0, 0.9, 7.8, bark, barkDark, 0.6);

  for (let i = 0; i < 5; i++) {
    const a = (i / 5) * Math.PI * 2 + 0.35;
    const dx = Math.cos(a), dz = Math.sin(a);
    const ex = dx * 6.6, ez = dz * 6.6, ey = 12.6 + (i % 2) * 1.2;
    branchChain(parts, 0, 7.4, 0, ex, ey, ez, 0.74, 0.6, [barkDark, bark]);
    foliage(parts, ex, ey + 1.1, ez, 3.6, 3.0, 3.6, 0.64, C, 0.40);
  }
  foliage(parts, 0, 14.0, 0, 6.8, 4.6, 6.8, 0.66, C, 0.42);
  foliage(parts, 0, 17.2, 0, 4.0, 3.0, 4.0, 0.62, [0xd07894, 0xf0b0c4, 0xa84a68], 0.36);

  fallenLeaves(parts, 28, 10.4, C);
  return build(parts, 'bigTreePinkBlossom');
}

// ===========================================================================
// 9 绿金树 —— 参考图 9：枝叶极多、绿+黄+金混色
// ===========================================================================
export function makeGreenGold() {
  const parts = [];
  const bark = 0x564327, barkDark = 0x42311c;
  const C = [0x2f6a24, 0x4a8a30, 0xb8a022, 0xdcc23a];

  // 树干拉长 30%：6.2 → 8.1
  trunkTaper(parts, 0, 0, 2.2, 0.95, 8.1, bark, barkDark, 0.6);

  // 5 主枝 + 每枝 2 次枝（枝叶最密的一棵）
  for (let i = 0; i < 5; i++) {
    const a = (i / 5) * Math.PI * 2 + 0.2;
    const dx = Math.cos(a), dz = Math.sin(a);
    const mx = dx * 4.0, mz = dz * 4.0, my = 11.3;
    branchChain(parts, 0, 7.6, 0, mx, my, mz, 0.8, 0.6, [barkDark, bark]);
    for (const s of [-0.5, 0.5]) {
      const a2 = a + s;
      const ex = mx + Math.cos(a2) * 3.4, ez = mz + Math.sin(a2) * 3.4, ey = my + 2.6;
      branchChain(parts, mx, my, mz, ex, ey, ez, 0.55, 0.6, [barkDark, bark]);
      foliage(parts, ex, ey + 0.9, ez, 2.8, 2.4, 2.8, 0.62, C, 0.36);
    }
  }
  foliage(parts, 0, 13.7, 0, 6.6, 4.8, 6.6, 0.66, C, 0.42);
  foliage(parts, 0, 17.1, 0, 4.2, 3.2, 4.2, 0.62, [0x4a8a30, 0xdcc23a, 0xb8a022], 0.36);

  fallenLeaves(parts, 28, 10.6, [0x2f6a24, 0x4a8a30, 0xb8a022, 0xdcc23a]);
  return build(parts, 'bigTreeGreenGold');
}

// 目录
export const BIG_TREE_KINDS = [
  { id: 'broadleaf', name: '阔叶树',     make: makeBroadleaf },
  { id: 'poinciana', name: '凤凰木',     make: makePoinciana },
  { id: 'cactus',    name: '仙人掌',     make: makeCactus },
  { id: 'purple',    name: '紫叶树',     make: makePurpleTree },
  { id: 'autumn',    name: '秋树',       make: makeAutumnBig },
  { id: 'golden',    name: '黄叶树',     make: makeGoldenTree },
  { id: 'pink',      name: '粉花树',     make: makePinkBlossom },
  { id: 'greengold', name: '绿金树',     make: makeGreenGold },
];
