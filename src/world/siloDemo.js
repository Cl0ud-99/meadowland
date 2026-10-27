// ---------------------------------------------------------------------------
// 双筒仓 demo —— 三种样式（按用户提供的参考图）
//
// A  金属双筒仓：银灰波纹筒身 + 锥形尖顶 + 中央提升塔 + 顶部管道 + 标志色带
// B  红木双筒仓：红木横板 + 白木条 + 双坡屋顶 + 中部廊桥 + 侧梯
// C  混凝土双筒仓：米色混凝土 + 半球穹顶 + 顶部天桥 + 侧梯 + 竖管
// ---------------------------------------------------------------------------
import * as THREE from 'three';
import { box, cyl, cone, tint, meshFrom } from '../util/geo.js';

const part = (arr, geo) => { arr.push(geo); return geo; };

function build(parts, details, name) {
  const m = meshFrom(parts);
  m.name = name;
  if (details && details.length) {
    const d = meshFrom(details);
    d.name = name + 'Detail';
    d.userData.noOutline = true;
    d.castShadow = false;
    d.receiveShadow = true;
    m.add(d);
  }
  return m;
}

function makeLadder(parts, x, z, fromY, toY, color, width) {
  const w = width === undefined ? 0.55 : width;
  const h = toY - fromY;
  for (const sx of [-1, 1]) {
    part(parts, box(0.09, h, 0.09, color, x + sx * w / 2, fromY, z));
  }
  const n = Math.max(3, Math.round(h / 0.5));
  for (let i = 1; i < n; i++) {
    part(parts, box(w, 0.07, 0.07, color, x, fromY + (h * i) / n, z));
  }
}

// ===========================================================================
// A：金属双筒仓
// ===========================================================================
// ---------------------------------------------------------------------------
// opts 参数
//   single: true  → 只生成【一个筒】（场景里是单筒布局）
//   heightScale   → 整体高度缩放（场景需要 16/12 的高度）
// ---------------------------------------------------------------------------
export function makeMetalSilo(opts = {}) {
  const parts = [];
  const details = [];
  const HS = opts.heightScale || 1;
  const r = 3.0, h = 9.0 * HS;
  const gap = 7.4;

  const metal = 0xa8b0b8;
  const metalDark = 0x8a929a;
  const metalLight = 0xc4ccd2;
  const pipeCol = 0x9099a0;
  const redBand = 0xb04a3a;
  const blueBand = 0x4a6a9a;

  const SIDES = opts.single ? [1] : [-1, 1];
  for (const side of SIDES) {
    const cx = opts.single ? 0 : side * gap / 2;

    part(parts, cyl(r, r, h, 20, metal, cx, 0, 0));
    for (let i = 1; i < 9; i++) {
      part(details, cyl(r + 0.035, r + 0.035, 0.09, 20, metalDark, cx, i * (h / 9), 0));
    }
    for (let i = 0; i < 12; i++) {
      const a = (i / 12) * Math.PI * 2;
      part(details, box(0.06, h - 0.2, 0.05, metalDark,
        cx + Math.cos(a) * (r + 0.02), 0.1, Math.sin(a) * (r + 0.02)));
    }

    part(parts, cyl(r + 0.06, r + 0.06, 0.62, 20, redBand, cx, h * 0.52, 0));
    part(parts, cyl(r + 0.06, r + 0.06, 0.52, 20, blueBand, cx, h * 0.40, 0));
    part(parts, cyl(r + 0.06, r + 0.06, 0.10, 20, metalLight, cx, h * 0.47, 0));

    {
      const bandY = h * 0.44;
      const faceZ = r + 0.10;
      part(details, box(0.75, 0.42, 0.05, 0xe8eef2, cx - 0.55, bandY - 0.20, faceZ));
      part(details, box(0.48, 0.10, 0.05, 0xe8eef2, cx - 0.72, bandY + 0.24, faceZ + 0.01));
      part(details, box(0.30, 0.10, 0.05, 0xe8eef2, cx - 0.55, bandY + 0.30, faceZ + 0.01));
      for (let i = 0; i < 3; i++) {
        part(details, box(0.85, 0.08, 0.05, 0xe8eef2, cx + 0.60, bandY - 0.22 + i * 0.20, faceZ));
      }
    }

    const roofY = h;
    const coneH = 1.45 * HS;
    part(parts, cyl(r + 0.28, r + 0.28, 0.22, 20, metalDark, cx, roofY, 0));
    part(parts, cone(r + 0.24, coneH, 20, metalLight, cx, roofY + 0.22, 0));
    {
      const coneR = r + 0.24;
      for (let i = 1; i <= 4; i++) {
        const t = i / 5;
        const rr = coneR * (1 - t) + 0.08;
        part(details, cyl(rr + 0.03, rr + 0.03, 0.08, 20, metalDark,
          cx, roofY + 0.22 + coneH * t - 0.04, 0));
      }
    }
    part(parts, cyl(0.22, 0.16, 0.45 * HS, 8, metalDark, cx, roofY + 0.22 + coneH * 0.96, 0));

    part(parts, cyl(r * 0.92, r * 0.55, 1.0, 20, metal, cx, -1.0, 0));
    for (let i = 0; i < 6; i++) {
      const a = (i / 6) * Math.PI * 2 + Math.PI / 6;
      part(parts, box(0.16, 1.0, 0.16, metalDark,
        cx + Math.cos(a) * r * 0.78, -1.0, Math.sin(a) * r * 0.78));
    }
  }

  // 提升塔
  //   ★ 单筒模式下放在筒身【侧面】，不要放中间（会穿模）。
  const towerW = 1.5, towerH = h + 2.6 * HS;
  const towerX = opts.single ? r + towerW / 2 + 0.5 : 0;
  part(parts, box(towerW, towerH, towerW, metalDark, towerX, 0, 0));
  for (let i = 1; i < 8; i++) {
    part(details, box(towerW + 0.06, 0.08, towerW + 0.06, metal, towerX, i * (towerH / 8), 0));
  }
  part(parts, box(towerW + 0.5, 0.7, towerW + 0.5, metalLight, towerX, towerH, 0));
  part(parts, box(towerW + 0.2, 0.3, towerW + 0.2, metalDark, towerX, towerH + 0.7, 0));

  if (opts.single) {
    // 单筒：提升塔顶部伸出一根横向管道接到筒顶
    const pipeY = h + 0.55;
    const len = towerX - towerW / 2 - r * 0.55;
    part(parts, box(len, 0.34, 0.34, pipeCol,
      towerW / 2 + towerX - towerX + (towerX - towerW / 2) / 2, pipeY, 0));
    // 修正：管道从塔壁连到筒壁
    const px0 = towerX - towerW / 2;
    const px1 = r * 0.55;
    part(parts, box(px0 - px1, 0.34, 0.34, pipeCol, (px0 + px1) / 2, pipeY, 0));
    part(parts, cyl(0.20, 0.20, 0.9, 8, pipeCol, px1, pipeY, 0));
    part(parts, cyl(0.19, 0.19, 1.2, 8, pipeCol, towerX, towerH - 0.6, 0));
  } else {
    for (const side of [-1, 1]) {
      const cx = side * gap / 2;
      const pipeY = h + 0.55;
      const len = Math.abs(cx) - towerW / 2 - r * 0.55;
      part(parts, box(len, 0.34, 0.34, pipeCol, side * (towerW / 2 + len / 2), pipeY, 0));
      part(parts, cyl(0.20, 0.20, 0.9, 8, pipeCol, side * (Math.abs(cx) - r * 0.55), pipeY, 0));
    }
    part(parts, cyl(0.19, 0.19, 1.2, 8, pipeCol, 0, towerH - 0.6, 0));
  }

  return build(parts, details, 'siloMetal');
}

// ===========================================================================
// B：红木双筒仓（方塔 + 双坡屋顶 + 廊桥）
//
// ★ 桶身是【方形塔】而不是圆筒：参考图里这两座是木板方塔，
//   墙面是平的、有棱角，屋顶是人字双坡。
// ===========================================================================
export function makeWoodSilo(opts = {}) {
  const parts = [];
  const details = [];
  const HS = opts.heightScale || 1;
  const bodyW = 5.2, bodyD = 5.2, h = 8.6 * HS;
  // ★ 两塔间距要够大，廊桥才露得出来（参考图里廊桥明显可见）
  const gap = bodyW + 3.0;          // 两塔中心的间距

  const woodRed = 0x9a4438;
  const woodRedDark = 0x7a2e26;
  const woodWhite = 0xd8d0c0;
  const roofGray = 0xa89e90;
  const roofGrayDark = 0x8a8074;
  const pipeCol = 0x9aa0a6;
  const plinth = 0x6a4438;

  const SIDES = opts.single ? [1] : [-1, 1];
  for (const side of SIDES) {
    const cx = opts.single ? 0 : side * gap / 2;

    // ---- 塔身：方形木板塔 ----
    part(parts, box(bodyW, h, bodyD, woodRed, cx, 0, 0));

    // 底部石基（深色）
    part(parts, box(bodyW + 0.30, 0.55, bodyD + 0.30, plinth, cx, 0, 0));

    // 白色横条（红白相间，绕四面一圈）
    for (let i = 0; i < 6; i++) {
      const y = 1.0 + i * 1.35;
      part(details, box(bodyW + 0.06, 0.30, bodyD + 0.06, woodWhite, cx, y, 0));
    }

    // 竖向板缝（四面各若干道）
    {
      const n = 6;
      for (let i = 1; i < n; i++) {
        const t = i / n;
        const ox = -bodyW / 2 + bodyW * t;
        // 前后两面
        part(details, box(0.07, h - 0.6, 0.05, woodRedDark, cx + ox, 0.3, bodyD / 2 + 0.04));
        part(details, box(0.07, h - 0.6, 0.05, woodRedDark, cx + ox, 0.3, -bodyD / 2 - 0.04));
        // 左右两面
        part(details, box(0.05, h - 0.6, 0.07, woodRedDark, cx + bodyW / 2 + 0.04, 0.3, ox));
        part(details, box(0.05, h - 0.6, 0.07, woodRedDark, cx - bodyW / 2 - 0.04, 0.3, ox));
      }
    }

    // ---- 双坡屋顶 ----
    const roofY = h;
    const hw = bodyW / 2 + 0.55;      // 屋顶半宽（含出檐）
    const hh = 2.3;                   // 屋顶高
    const overhang = 0.5;             // 前后出檐

    // 山墙（前后两片三角，用水平层堆叠，横向木纹跟着走）
    {
      const LAYERS = 26;
      for (let i = 0; i < LAYERS; i++) {
        const t = (i + 0.5) / LAYERS;
        const w = hw * 2 * (1 - t);
        if (w < 0.10) continue;
        const layerH = hh / LAYERS * 1.15;
        const layerY = roofY + t * hh - hh / LAYERS / 2;
        for (const sz of [-1, 1]) {
          part(details, box(w, layerH, 0.18, woodRed,
            cx, layerY, sz * (bodyD / 2 + 0.02)));
        }
      }
    }

    // 两片坡面（斜板）
    {
      const slopeLen = Math.hypot(hw, hh);
      const ang = Math.atan2(hh, hw);
      for (const sx of [-1, 1]) {
        const g = tint(new THREE.BoxGeometry(slopeLen + 0.28, 0.26, bodyD + overhang * 2), roofGray);
        g.applyMatrix4(new THREE.Matrix4().makeRotationZ(sx > 0 ? -ang : ang));
        g.translate(cx + sx * hw / 2, roofY + hh / 2, 0);
        part(parts, g);
      }
      // 屋脊
      part(parts, box(0.30, 0.24, bodyD + overhang * 2 + 0.1, roofGrayDark,
        cx, roofY + hh - 0.07, 0));
      // 檐口白边
      for (const sx of [-1, 1]) {
        part(parts, box(0.42, 0.20, bodyD + overhang * 2, roofGrayDark,
          cx + sx * (hw - 0.10), roofY - 0.14, 0));
      }
    }

    // 山墙小窗（前后各一个）
    for (const sz of [-1, 1]) {
      part(parts, box(0.70, 0.58, 0.10, 0x3a2a20,
        cx, roofY + 1.05, sz * (bodyD / 2 + 0.12)));
    }
  }

  // ---- 中央廊桥（连接两塔，带小屋顶）----
  //   ★ 单筒模式没有"两塔"，跳过廊桥。
  //
  // ★ 几何要点：
  //   · 桥体宽度只比净距略宽（+0.16），两端刚好嵌入塔壁一点点；
  //   · 桥顶坡板的【水平投影】必须小于净距的一半，否则会插进塔身；
  //   · 桥体高度和塔身的白色横条对齐，视觉上像同一栋建筑的一部分。
  if (opts.single) {
    // 单筒：只做一根竖管 + 侧梯，不要廊桥
    const pipeCol2 = 0x9aa0a6;
    part(parts, cyl(0.12, 0.12, h * 0.58, 8, pipeCol2, bodyW / 2 + 0.24, 0, 0));
    makeLadder(parts, bodyW / 2 + 0.42, 1.3, 0, h * 0.96, plinth);
    return build(parts, details, 'siloWood');
  }

  const bridgeY = h * 0.58;
  const netGap = gap - bodyW;              // 两塔之间的净距
  const bridgeW = netGap + 0.16;           // 只插进塔壁 0.08
  const bridgeH = 1.30;
  part(parts, box(bridgeW, bridgeH, 1.9, woodRed, 0, bridgeY, 0));

  // 桥体两端的接缝压条（盖住桥和塔壁的交界）
  for (const side of [-1, 1]) {
    const ex = side * (bridgeW / 2);
    part(parts, box(0.22, bridgeH + 0.12, 2.02, woodRedDark, ex, bridgeY - 0.06, 0));
  }

  // 桥顶小屋顶：坡板水平投影必须 <= netGap/2 - 余量
  {
    const maxRun = netGap / 2 - 0.10;      // 坡板最多伸到这么远
    const bh = 0.70;                        // 屋脊高度
    const run = maxRun;                     // 坡板水平投影
    const slopeLen = Math.hypot(run, bh);
    const ang = Math.atan2(bh, run);
    for (const sx of [-1, 1]) {
      const g = tint(new THREE.BoxGeometry(slopeLen, 0.18, 2.10), roofGray);
      g.applyMatrix4(new THREE.Matrix4().makeRotationZ(sx > 0 ? -ang : ang));
      // 坡板两端正好落在 0 处（屋脊）和 run 处（檐口）
      g.translate(sx * run / 2, bridgeY + bridgeH + bh / 2, 0);
      part(parts, g);
    }
    // 屋脊
    part(parts, box(0.24, 0.16, 2.16, roofGrayDark, 0, bridgeY + bridgeH + bh - 0.04, 0));
    // 檐口
    for (const sx of [-1, 1]) {
      part(parts, box(0.26, 0.14, 2.14, roofGrayDark, sx * run, bridgeY + bridgeH - 0.04, 0));
    }
  }

  // 桥体上的小窗（前后各一）
  for (const sz of [-1, 1]) {
    part(parts, box(0.80, 0.50, 0.10, 0x3a2a20, 0, bridgeY + 0.42, sz * 0.96));
  }
  // ---- 中央竖管（从廊桥往下）----
  part(parts, cyl(0.22, 0.22, bridgeY - 0.5, 10, pipeCol, 0, 0.5, 0));
  part(parts, box(1.5, 0.26, 0.26, pipeCol, 0.75, bridgeY - 0.7, 0));
  part(parts, cyl(0.26, 0.26, 0.5, 8, pipeCol, 0, 0.18, 0));

  // ---- 右侧爬梯（贴在右塔外侧）----
  makeLadder(parts, gap / 2 + bodyW / 2 + 0.42, 1.3, 0, h * 0.96, plinth);

  return build(parts, details, 'siloWood');
}
// ===========================================================================
// C：混凝土双筒仓（半球穹顶 + 天桥）
// ===========================================================================
export function makeConcreteSilo(opts = {}) {
  const parts = [];
  const details = [];
  const HS = opts.heightScale || 1;
  const r = 2.9, h = 10.5 * HS;
  const gap = 7.0;

  const concrete = 0xc8c0b0;
  const concreteDark = 0xb0a898;
  const concreteLight = 0xd8d2c4;
  const capMetal = 0xb8c0c6;
  const capMetalDark = 0x98a2aa;
  const pipeCol = 0x98a0a6;

  for (const side of [-1, 1]) {
    const cx = side * gap / 2;

    part(parts, cyl(r, r, h, 22, concrete, cx, 0, 0));
    for (let i = 1; i < 7; i++) {
      part(details, cyl(r + 0.03, r + 0.03, 0.10, 22, concreteDark, cx, i * 1.6, 0));
    }
    for (let i = 0; i < 10; i++) {
      const a = (i / 10) * Math.PI * 2;
      part(details, box(0.04, h - 0.2, 0.04, concreteDark,
        cx + Math.cos(a) * (r + 0.01), 0.1, Math.sin(a) * (r + 0.01)));
    }

    const capR = r + 0.24;
    const capY = h + 0.30;
    part(parts, cyl(r + 0.30, r + 0.30, 0.30, 22, concreteLight, cx, h, 0));
    {
      const g = new THREE.SphereGeometry(capR, 22, 8, 0, Math.PI * 2, 0, Math.PI / 2);
      g.translate(cx, capY, 0);
      part(parts, tint(g, capMetal));
    }
    // 穹顶保持光滑（用户要求删掉分片小方块，看起来像钉子）

    part(parts, cyl(0.26, 0.20, 0.32, 10, concreteLight, cx, capY + capR * 0.92, 0));
    part(parts, cyl(r + 0.06, r + 0.06, 0.35, 22, concreteLight, cx, 0, 0));
  }

  // ★ 天桥要架在【穹顶上方】，不能和穹顶底面同高。
  //   原来 bridgeY = h + 0.30 正好等于穹顶底面，被夹在两塔之间只剩 1.2 净距，
  //   栏杆挤在一起看起来像一团杂乱的竖线。
  //   现在抬到穹顶顶面附近：h + 0.30 + capR*0.75
  const capR0 = r + 0.24;
  const bridgeY = h + 0.30 + capR0 * 0.75;
  const bridgeW = gap - r * 2 + 1.2;
  part(parts, box(bridgeW, 0.30, 1.2, capMetal, 0, bridgeY, 0));
  for (const sz of [-1, 1]) {
    part(parts, box(bridgeW, 0.08, 0.08, pipeCol, 0, bridgeY + 0.62, sz * 0.54));
    for (let i = 0; i <= 3; i++) {
      part(parts, box(0.08, 0.62, 0.08, pipeCol,
        -bridgeW / 2 + (bridgeW * i) / 3, bridgeY + 0.15, sz * 0.54));
    }
  }
  // 吊杆：从天桥垂到穹顶表面
  for (const sx of [-1, 1]) {
    part(parts, cyl(0.09, 0.09, 0.9, 6, pipeCol, sx * bridgeW * 0.30, bridgeY - 0.9, 0));
  }

  part(parts, cyl(0.24, 0.24, bridgeY - 0.5, 10, pipeCol, 0, 0.3, 0));
  for (const side of [-1, 1]) {
    const cx = side * gap / 2;
    part(parts, box(Math.abs(cx) - r * 0.6, 0.26, 0.26, pipeCol,
      side * (r * 0.6 + (Math.abs(cx) - r * 0.6) / 2), bridgeY - 0.3, 0));
  }
  part(parts, box(0.5, 0.36, 0.5, 0x7a8288, 0, 0.34, 0));
  part(parts, cyl(0.16, 0.16, 0.4, 8, pipeCol, 0, 0, 0));

  makeLadder(parts, -gap / 2 - r - 0.35, 0, 0, h * 0.98, pipeCol, 0.5);

  return build(parts, details, 'siloConcrete');
}
