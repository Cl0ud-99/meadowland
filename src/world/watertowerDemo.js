// ---------------------------------------------------------------------------
// 水塔 demo —— 三种样式（按用户提供的参考图）
//
// A  金属水塔：灰色铁皮桶身 + 锈迹 + "WATER" 字样 + 锥形底 + 尖铁顶
// B  木桶水塔：木板桶身 + 金属箍 + 木尖顶 + 平台栏杆 + 出水管
// C  深木水塔：深木竖板 + 三道铁箍 + 绿色鳞瓦顶 + 侧管 + 短梯
//
// 三者共用同一套"结构骨架"（四条腿 + X 斜撑），差异在桶身/屋顶/细节。
// 所有 make* 返回"y=0 起"的 Group，和场景里其它建筑的约定一致。
// ---------------------------------------------------------------------------
import * as THREE from 'three';
import { box, cyl, cone, tint, meshFrom } from '../util/geo.js';
import { PALETTE } from '../config.js';

const part = (arr, geo) => { arr.push(geo); return geo; };

// 把一组几何合成一个 mesh，纹理细节走 noOutline
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

// ---------------------------------------------------------------------------
// 按 opts.palette 返回配色
//
// ★ 换色系统（farm.js 的 setBuildingStyle）按【顶点色 hex 匹配】工作。
//   正式场景必须让关键部位用 PALETTE 语义色，否则点了换色没反应。
//
//   水塔的槽位：
//     tank → PALETTE.metal      （桶身）
//     roof → PALETTE.roofBlue   （屋顶）
//     leg  → PALETTE.woodDark   （支架/腿）
//     trim → PALETTE.wood       （横梁/栏杆/细节木件）
// ---------------------------------------------------------------------------
function towerColors(opts, base) {
  // ★ 水塔的三种造型【各自保留原配色】，不做统一换色。
  //
  //   原因：三种水塔的辨识度主要来自材质（金属灰 / 木桶棕 / 深木+绿瓦），
  //   如果把桶身/屋顶/腿都映射到 PALETTE 的少数几个色，
  //   造型一换颜色也跟着变，用户根本分不清是换了款式还是换了颜色。
  //
  //   所以这里只做一件事：把【极少数】需要跟场景协调的部位
  //   （支架腿）保持原色，其余全部沿用各造型自己的配色。
  return base;
}

// ---------------------------------------------------------------------------
// 通用：四条腿 + X 形斜撑 + 横梁
//
// 参考图里三种水塔的支架结构几乎一样：
//   4 条竖直腿、每层之间有横梁、每个立面有 X 形斜撑
// ---------------------------------------------------------------------------
function makeLattice(opts) {
  const {
    legH = 9,
    spread = 2.6,
    legW = 0.26,
    color = 0x5a4432,
    braceColor = null,
    levels = [0.34, 0.68],
    crossBraces = true,
  } = opts;

  const parts = [];
  const bc = braceColor === null ? color : braceColor;

  // ★ 塔腿必须【竖直】，不要外倾。
  //   之前用 rotateZ/rotateX 让腿外倾 0.12 rad，
  //   结果腿脚跑到 spread + legH*0.12 ≈ 4 的位置，
  //   而斜撑只连到 spread（2.5），于是斜撑末端悬空：
  //   截图里"支脚散开戳在地上"就是这个原因。
  for (const [sx, sz] of [[-1, -1], [1, -1], [-1, 1], [1, 1]]) {
    part(parts, box(legW, legH, legW, color, sx * spread, 0, sz * spread));
  }

  // 横梁（每一层，四个方向）—— 端点正好在腿上
  for (const t of levels) {
    const y = legH * t;
    const w = spread * 2;
    part(parts, box(w, legW * 0.8, legW * 0.8, bc, 0, y, -spread));
    part(parts, box(w, legW * 0.8, legW * 0.8, bc, 0, y, spread));
    part(parts, box(legW * 0.8, legW * 0.8, w, bc, -spread, y, 0));
    part(parts, box(legW * 0.8, legW * 0.8, w, bc, spread, y, 0));
  }

  // X 形斜撑：连接【相邻两层横梁】的对角
  //
  // ★ 关键：斜撑的两端必须落在 (腿位置, 横梁高度) 上，
  //   所以长度 = hypot(2*spread, 层高)，不能加余量，
  //   否则会伸出塔腿外面。
  if (crossBraces) {
    const bounds = [0, ...levels, 1];
    for (let k = 0; k < bounds.length - 1; k++) {
      const y0 = legH * bounds[k];
      const y1 = legH * bounds[k + 1];
      const hh = y1 - y0;
      const span = spread * 2;                 // 同一立面两条腿的距离
      const dl = Math.hypot(span, hh);          // 斜撑真实长度
      const ang = Math.atan2(hh, span);

      // 前后两个立面（法线沿 Z）
      for (const sz of [-1, 1]) {
        for (const dir of [-1, 1]) {
          const g = tint(new THREE.BoxGeometry(dl, legW * 0.55, legW * 0.55), bc);
          const mtz = new THREE.Matrix4().makeRotationZ(dir * ang);
          g.applyMatrix4(mtz);
          g.translate(0, (y0 + y1) / 2, sz * spread);
          part(parts, g);
        }
      }
      // 左右两个立面（法线沿 X）—— 先转 90° 让长度方向沿 Z
      for (const sx of [-1, 1]) {
        for (const dir of [-1, 1]) {
          const g = tint(new THREE.BoxGeometry(dl, legW * 0.55, legW * 0.55), bc);
          const mty = new THREE.Matrix4().makeRotationY(Math.PI / 2);
          g.applyMatrix4(mty);
          const mtz = new THREE.Matrix4().makeRotationZ(dir * ang);
          g.applyMatrix4(mtz);
          g.translate(sx * spread, (y0 + y1) / 2, 0);
          part(parts, g);
        }
      }
    }
  }

  return { parts, legH };
}

// 通用：爬梯
// ---------------------------------------------------------------------------
function makeLadder(x, z, fromY, toY, color) {
  const parts = [];
  const h = toY - fromY;
  const w = 0.62;
  // 两根梯梁
  for (const sx of [-1, 1]) {
    part(parts, box(0.10, h, 0.10, color, x + sx * w / 2, fromY, z));
  }
  // 梯档
  const n = Math.max(3, Math.round(h / 0.55));
  for (let i = 1; i < n; i++) {
    part(parts, box(w, 0.08, 0.08, color, x, fromY + (h * i) / n, z));
  }
  return parts;
}

// ---------------------------------------------------------------------------
// A：金属水塔
// ---------------------------------------------------------------------------
export function makeMetalTower(opts = {}) {
  const parts = [];
  const details = [];
  const legH = 8.5;
  const r = 3.3;
  const tankH = 4.6;

  const K = towerColors(opts, {
    metal: 0x8a8f94,
    metalDark: 0x6b7076,
    metalLight: 0x9ea4aa,
    rust: 0x8a5230,
    legCol: 0x4a4a4e,
    braceCol: 0x3e3e42,
  });
  const metal = K.metal;
  const metalDark = K.metalDark;
  const metalLight = K.metalLight;
  const rust = K.rust;
  const legCol = K.legCol;

  // ---- 支架 ----
  const lat = makeLattice({
    legH, spread: 2.5, legW: 0.30,
    color: legCol, braceColor: K.braceCol,
    levels: [0.30, 0.60],
  });
  lat.parts.forEach(p => parts.push(p));

  // 中央立柱（参考图里中间有一根粗柱）
  part(parts, cyl(0.55, 0.62, legH + 1.2, 8, K.metalDark, 0, 0, 0));

  // ---- 平台（桶底托板）----
  const deckY = legH;
  part(parts, cyl(r + 0.35, r + 0.35, 0.28, 20, metalDark, 0, deckY, 0));

  // ---- 锥形桶底 ----
  part(parts, cyl(r, r * 0.55, 1.5, 20, metal, 0, deckY + 0.28, 0));

  // ---- 桶身（圆柱 + 横向板缝 + 竖向铆接条）----
  const tankY = deckY + 0.28 + 1.5;
  part(parts, cyl(r, r, tankH, 20, metal, 0, tankY, 0));

  // 横向板缝（3 道）
  for (let i = 1; i <= 3; i++) {
    const y = tankY + (tankH * i) / 4;
    part(details, cyl(r + 0.03, r + 0.03, 0.10, 20, metalDark, 0, y, 0));
  }
  // 竖向铆接条（8 条，均匀分布）
  for (let i = 0; i < 8; i++) {
    const a = (i / 8) * Math.PI * 2;
    const bx = Math.cos(a) * (r + 0.02);
    const bz = Math.sin(a) * (r + 0.02);
    part(details, box(0.10, tankH, 0.06, metalDark, bx, tankY, bz));
  }
  // 锈迹（多块不规则补丁，参考图里锈得很明显）
  // 锈迹：多块【小】补丁（大块方块看着像贴纸）
  const rustPatches = [
    [0.0, 0.60, 0.55, 0.30], [0.05, 0.42, 0.35, 0.55],
    [0.5, 0.22, 0.50, 0.35], [0.52, 0.70, 0.30, 0.40],
    [0.9, 0.36, 0.60, 0.45], [0.95, 0.78, 0.35, 0.25],
    [1.4, 0.24, 0.45, 0.30], [1.6, 0.58, 0.55, 0.38],
    [1.9, 0.40, 0.40, 0.50], [1.1, 0.15, 0.28, 0.22],
    [0.3, 0.85, 0.32, 0.20], [1.75, 0.82, 0.30, 0.26],
  ];
  for (const [ang, hy, w, h] of rustPatches) {
    const a = ang * Math.PI * 2 / 2;   // ang 是"半圈"单位 0~2
    part(details, box(w, h, 0.04, rust,
      Math.cos(a) * (r + 0.05), tankY + tankH * hy, Math.sin(a) * (r + 0.05)));
  }
  // 从上往下的锈水痕（几条细长竖条）
  for (const [ang, hy, w, h] of [[0.15, 0.30, 0.18, 2.4], [1.05, 0.22, 0.14, 2.0], [1.75, 0.35, 0.16, 1.6]]) {
    const a = ang * Math.PI * 2 / 2;
    part(details, box(w, h, 0.04, 0x7a4628,
      Math.cos(a) * (r + 0.05), tankY + h * 0.5 + tankH * hy, Math.sin(a) * (r + 0.05)));
  }

  // ---- "WATER" 字样（参考图里很显眼）----
  //
  // ★ 实现方式：每个字母用【若干实心小方块】拼成 5x7 点阵，
  //   不用线段拼接。
  //   线段方案试过两版都不稳定（部分笔画消失、字形错乱），
  //   因为 BoxGeometry(len, stroke, 0.05) 在 len 和 stroke 接近时
  //   旋转后会退化；点阵方案每个块尺寸固定，绝不会出错。
  {
    const cols = 5, rows = 7;
    const px = 0.085;              // 单个点阵格子的边长
    const letterGap = 1.6;         // 字间距（格子数）
    // 5x7 点阵字形（1 = 实心）
    const GLYPHS = {
      W: [
        '10001', '10001', '10001', '10001', '10101', '10101', '01010',
      ],
      A: [
        '01110', '10001', '10001', '11111', '10001', '10001', '10001',
      ],
      T: [
        '11111', '00100', '00100', '00100', '00100', '00100', '00100',
      ],
      E: [
        '11111', '10000', '10000', '11110', '10000', '10000', '11111',
      ],
      R: [
        '11110', '10001', '10001', '11110', '10100', '10010', '10001',
      ],
    };

    const word = 'WATER';
    const totalCols = word.length * cols + (word.length - 1) * letterGap;
    const wordW = totalCols * px;
    const letterY = tankY + tankH * 0.46;
    const rustTextColor = 0x7a4628;

    // 贴在圆柱正面：z = sqrt(r^2 - x^2)，逐块算 z 会跟着弯曲，更自然
    const rSurf = r + 0.05;

    for (let ci = 0; ci < word.length; ci++) {
      const ch = word[ci];
      const g = GLYPHS[ch];
      if (!g) continue;
      for (let row = 0; row < rows; row++) {
        for (let col = 0; col < cols; col++) {
          if (g[row][col] !== '1') continue;
          // 该块的全局列号 → 局部 x
          const globalCol = ci * (cols + letterGap) + col;
          const localX = -wordW / 2 + (globalCol + 0.5) * px;
          // 行号 0 在顶部 → 世界 y 要反过来
          const localY = letterY + (rows / 2 - row - 0.5) * px;
          // 贴到圆柱面
          const zFace = Math.sqrt(Math.max(0.2, rSurf * rSurf - localX * localX));
          part(details, box(px * 1.02, px * 1.02, 0.05, rustTextColor, localX, localY, zFace));
        }
      }
    }
  }

  // 桶身上下加强箍
  part(parts, cyl(r + 0.10, r + 0.10, 0.22, 20, metalDark, 0, tankY - 0.1, 0));
  part(parts, cyl(r + 0.10, r + 0.10, 0.22, 20, metalDark, 0, tankY + tankH - 0.12, 0));

  // ---- 屋顶（尖铁顶 + 出檐）----
  const roofY = tankY + tankH;
  part(parts, cyl(r + 0.55, r + 0.55, 0.20, 20, metalDark, 0, roofY, 0));
  // cyl(rt, rb, h) —— rt 是顶部半径、rb 是底部半径
  // ★ 尖顶必须 rt 小、rb 大，之前写反了（变成张开的伞）
  part(parts, cyl(0.22, r + 0.50, 1.7, 20, metalLight, 0, roofY + 0.20, 0));
  part(parts, cyl(0.14, 0.10, 0.55, 6, metalDark, 0, roofY + 1.88, 0));

  // ---- 长梯（左侧，从地面到平台）----
  makeLadder(-r - 0.7, 0, 0, deckY + 1.0, K.metalDark).forEach(p => parts.push(p));

  // ---- 底部木栅栏（参考图里围着底座）----
  const fenceCol = 0x7a6248;
  const fr = 4.2;
  for (let i = 0; i < 20; i++) {
    const a = (i / 20) * Math.PI * 2;
    if (Math.abs(Math.cos(a)) < 0.15 && Math.cos(a) > 0) continue;  // 留出梯子口
    const px = Math.cos(a) * fr, pz = Math.sin(a) * fr;
    part(parts, box(0.16, 1.0, 0.16, fenceCol, px, 0, pz));
  }
  // 栅栏横杆
  for (const y of [0.35, 0.75]) {
    for (let i = 0; i < 20; i++) {
      const a0 = (i / 20) * Math.PI * 2;
      const a1 = ((i + 1) / 20) * Math.PI * 2;
      const x0 = Math.cos(a0) * fr, z0 = Math.sin(a0) * fr;
      const x1 = Math.cos(a1) * fr, z1 = Math.sin(a1) * fr;
      const len = Math.hypot(x1 - x0, z1 - z0);
      const ang = Math.atan2(z1 - z0, x1 - x0);
      const b = new THREE.BoxGeometry(len, 0.10, 0.08);
      b.translate(0, 0, 0);
      const g = tint(b, fenceCol);
      const mt = new THREE.Matrix4();
      mt.makeRotationY(-ang);
      g.applyMatrix4(mt);
      g.translate((x0 + x1) / 2, y, (z0 + z1) / 2);
      part(parts, g);
    }
  }

  return build(parts, details, 'watertowerMetal');
}

// ---------------------------------------------------------------------------
// B：木桶水塔（宽桶身 + 平台栏杆 + 出水管）
// ---------------------------------------------------------------------------
export function makeBarrelTower(opts = {}) {
  const parts = [];
  const details = [];
  const legH = 8.0;
  const r = 3.1;
  const tankH = 4.4;

  const K = towerColors(opts, {
    wood: 0x8a6038,
    woodDark: 0x6a4628,
    woodLight: 0xa07448,
    hoop: 0x55585c,
    legCol: 0x5a3f28,
    braceCol: 0x4a3520,
    roof: 0x7a5030,
  });
  const wood = K.wood;
  const woodDark = K.woodDark;
  const woodLight = K.woodLight;
  const hoop = K.hoop;
  const legCol = K.legCol;

  // ---- 支架 ----
  const lat = makeLattice({
    legH, spread: 2.4, legW: 0.32,
    color: legCol, braceColor: K.braceCol,
    levels: [0.30, 0.60],
  });
  lat.parts.forEach(p => parts.push(p));

  // ---- 平台（木台板 + 栏杆）----
  const deckY = legH;
  part(parts, cyl(r + 0.55, r + 0.55, 0.30, 20, woodDark, 0, deckY, 0));
  // 台板边缘收边
  part(parts, cyl(r + 0.62, r + 0.62, 0.12, 20, woodLight, 0, deckY + 0.30, 0));

  // 右侧平台 + 栏杆（参考图里桶子右侧有一小段平台带栏杆）
  {
    const px0 = r + 0.3, px1 = r + 2.4;
    part(parts, box(px1 - px0, 0.24, 1.6, woodDark, (px0 + px1) / 2, deckY + 0.18, 0));
    // 栏杆柱
    for (let i = 0; i <= 3; i++) {
      const x = px0 + (px1 - px0) * (i / 3);
      part(parts, box(0.12, 0.85, 0.12, woodDark, x, deckY + 0.42, 0.72));
      part(parts, box(0.12, 0.85, 0.12, woodDark, x, deckY + 0.42, -0.72));
    }
    // 扶手
    part(parts, box(px1 - px0, 0.10, 0.10, woodDark, (px0 + px1) / 2, deckY + 1.22, 0.72));
    part(parts, box(px1 - px0, 0.10, 0.10, woodDark, (px0 + px1) / 2, deckY + 1.22, -0.72));
  }

  // ---- 桶身（木板 + 3 道铁箍）----
  const tankY = deckY + 0.42;
  part(parts, cyl(r, r, tankH, 20, wood, 0, tankY, 0));

  // 竖向木板缝
  for (let i = 0; i < 16; i++) {
    const a = (i / 16) * Math.PI * 2;
    part(details, box(0.08, tankH - 0.15, 0.05, woodDark,
      Math.cos(a) * (r + 0.02), tankY + 0.05, Math.sin(a) * (r + 0.02)));
  }
  // 三道铁箍
  for (const t of [0.08, 0.5, 0.92]) {
    part(parts, cyl(r + 0.09, r + 0.09, 0.26, 20, hoop, 0, tankY + tankH * t - 0.13, 0));
  }
  // 桶身顶部/底部收边
  part(parts, cyl(r + 0.06, r + 0.06, 0.16, 20, woodLight, 0, tankY - 0.08, 0));

  // ---- 木尖顶 ----
  const roofY = tankY + tankH;
  part(parts, cyl(r + 0.42, r + 0.42, 0.22, 20, woodDark, 0, roofY, 0));
  // 锥高从 2.0 降到 1.35，参考图里木顶比较扁
  part(parts, cone(r + 0.38, 1.35, 20, woodLight, 0, roofY + 0.22, 0));
  // 屋顶木板条：贴着锥面铺
  // ★ 直接用 cyl 做"锥面分层"，比手算旋转稳：
  //   每层是一个很薄的小锥，半径随高度收小，
  //   层与层之间露出的颜色差就形成木板纹理。
  {
    const coneH = 1.35, coneR = r + 0.38;
    const layers = 7;
    for (let i = 1; i <= layers; i++) {
      const t = i / (layers + 1);
      const rr = coneR * (1 - t) + 0.10;
      const y = roofY + 0.22 + coneH * t;
      // 层厚加大、颜色加深，木瓦层叠感才明显
      part(details, cyl(rr + 0.055, rr + 0.055, 0.13, 20, 0x5a3820, 0, y - 0.065, 0));
    }
  }

  // ---- 出水管（左侧，从桶底伸出、沿支架落地）----
  //
  // ★ 必须一直延伸到地面，之前只到 y=0.5 就断了（悬在半空）。
  const pipeCol = 0x6a6e72;
  const pipeX = -r - 1.05;
  // 1) 从桶底向下的短竖段
  part(parts, cyl(0.17, 0.17, 1.0, 8, pipeCol, -r - 0.15, tankY - 0.55, 0));
  // 2) 水平段（往左伸）
  part(parts, box(Math.abs(pipeX) - (r + 0.15), 0.30, 0.30, pipeCol,
    (-r - 0.15 + pipeX) / 2, tankY - 1.0, 0));
  // 3) 竖直段：从水平段一路落到地面
  part(parts, cyl(0.17, 0.17, tankY - 1.0, 8, pipeCol, pipeX, 0, 0));
  // 4) 地面处的弯头 + 短横管（参考图里管口朝外）
  part(parts, box(0.75, 0.30, 0.30, pipeCol, pipeX + 0.30, 0.16, 0));

  // ---- 长梯 ----
  makeLadder(-r - 0.75, 1.2, 0, deckY + 1.0, K.woodDark).forEach(p => parts.push(p));

  return build(parts, details, 'watertowerBarrel');
}

// ---------------------------------------------------------------------------
// C：深木水塔（绿色鳞瓦顶 + 侧管）
// ---------------------------------------------------------------------------
export function makeShingleTower(opts = {}) {
  const parts = [];
  const details = [];
  const legH = 7.2;
  const r = 2.9;
  const tankH = 4.0;

  const K = towerColors(opts, {
    wood: 0x6e4a2c,
    woodDark: 0x4a3018,
    woodLight: 0x8a6136,
    hoop: 0x4a4e52,
    roofGreen: 0x6a8a4a,
    roofGreenDark: 0x4e6a34,
    braceCol: 0x3a2614,
  });
  const wood = K.wood;
  const woodDark = K.woodDark;
  const woodLight = K.woodLight;
  const hoop = K.hoop;
  const roofGreen = K.roofGreen || PALETTE.roofBlue;
  const roofGreenDark = K.roofGreenDark || PALETTE.roofBlue;

  // ---- 支架（更粗壮）----
  const lat = makeLattice({
    legH, spread: 2.3, legW: 0.36,
    color: woodDark, braceColor: K.braceCol,
    levels: [0.28, 0.58],
  });
  lat.parts.forEach(p => parts.push(p));

  // 中央立柱
  part(parts, cyl(0.42, 0.48, legH, 8, woodDark, 0, 0, 0));

  // ---- 平台 ----
  const deckY = legH;
  part(parts, cyl(r + 0.5, r + 0.5, 0.32, 20, woodDark, 0, deckY, 0));
  // 台板下的支撑梁
  for (let i = 0; i < 6; i++) {
    const a = (i / 6) * Math.PI * 2;
    part(parts, box(0.22, 0.22, r * 1.6, woodDark,
      Math.cos(a) * r * 0.5, deckY - 0.12, Math.sin(a) * r * 0.5));
  }

  // ---- 桶身（深木竖板 + 3 道铁箍）----
  const tankY = deckY + 0.34;
  part(parts, cyl(r, r, tankH, 20, wood, 0, tankY, 0));

  // 竖板缝（密集）
  for (let i = 0; i < 18; i++) {
    const a = (i / 18) * Math.PI * 2;
    part(details, box(0.07, tankH - 0.12, 0.05, woodDark,
      Math.cos(a) * (r + 0.02), tankY + 0.04, Math.sin(a) * (r + 0.02)));
  }
  // 三道铁箍
  for (const t of [0.10, 0.50, 0.90]) {
    part(parts, cyl(r + 0.10, r + 0.10, 0.24, 20, hoop, 0, tankY + tankH * t - 0.12, 0));
  }
  // 顶部/底部木收边
  part(parts, cyl(r + 0.08, r + 0.08, 0.18, 20, woodLight, 0, tankY - 0.09, 0));

  // ---- 绿色鳞瓦屋顶 ----
  const roofY = tankY + tankH;
  part(parts, cyl(r + 0.50, r + 0.50, 0.24, 20, woodDark, 0, roofY, 0));
  // 瓦面（锥形）
  // 屋檐加大、锥高略降，参考图里绿瓦顶宽而扁
  part(parts, cone(r + 0.62, 1.55, 20, roofGreen, 0, roofY + 0.24, 0));
  // 瓦片层（一圈圈叠瓦）
  for (let i = 1; i <= 4; i++) {
    const t = i / 5;
    const rr = (r + 0.62) * (1 - t) * 0.95 + 0.15;
    const y = roofY + 0.24 + 1.55 * t;
    part(details, cyl(rr + 0.10, rr + 0.10, 0.10, 20, roofGreenDark, 0, y, 0));
  }
  part(parts, cyl(0.12, 0.08, 0.4, 6, woodDark, 0, roofY + 1.80, 0));

  // ---- 侧出水管（右侧，从桶身往下、沿支架落地）----
  //
  // ★ 必须一直落到地面：
  //   之前只画了零散几段（顶部一小截 + 中间一段），
  //   中间有大段空隙，看起来像断开的。
  const pipeCol = 0x6a6e72;
  const pipeX = r + 0.75;
  {
    // 1) 桶身侧面出口（短横管，从桶壁伸出）
    part(parts, box(0.85, 0.28, 0.28, pipeCol, r + 0.35, tankY + 0.35, 0));
    // 2) 竖直下行主管：从桶身出口一直到地面
    const topY = tankY + 0.28;
    part(parts, cyl(0.16, 0.16, topY, 8, pipeCol, pipeX, 0, 0));
    // 3) 地面弯头 + 出水口（朝外）
    part(parts, box(0.85, 0.30, 0.30, pipeCol, pipeX + 0.35, 0.15, 0));
    // 4) 顶部弯头（连接桶壁和竖管）
    part(parts, box(pipeX - (r + 0.30), 0.28, 0.28, pipeCol,
      (r + 0.30 + pipeX) / 2, tankY + 0.35, 0));
  }

  // ---- 短梯（右侧，从地面到平台）----
  // ★ 梯子从地面一直到平台顶（之前到 deckY+0.6 就断了）
  makeLadder(r + 1.35, -0.9, 0, deckY + 0.5, K.woodDark).forEach(p => parts.push(p));

  return build(parts, details, 'watertowerShingle');
}
