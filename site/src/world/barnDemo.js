// 谷仓 / 农舍 外观 demo —— 独立页面，不影响正式场景
import * as THREE from '../../vendor/three/three.module.js';
import { box, cyl, cone, gable, tint, meshFrom } from '../util/geo.js';
import { toonLambert } from '../render/toon.js';
import { PALETTE } from '../config.js';

// ---------------------------------------------------------------------------
// 配色（按参考图取色）
// ---------------------------------------------------------------------------
const C = {
  // 谷仓
  barnWall: 0xb03a26,        // 红色竖向木板
  barnWallDark: 0x8f2e1e,    // 木板暗色条纹
  barnTrim: 0xe8e0d0,        // 白色包边
  barnRoof: 0x3a2a22,        // 深褐屋顶
  barnRoofEdge: 0x2a1d17,    // 屋顶边缘（更暗）
  barnDoor: 0x7a4a2e,        // 门板木色
  barnDoorDark: 0x5a3420,    // 门框
  hay: 0xd9a83c,             // 干草
  hayDark: 0xb88a28,
  lamp: 0xf0c040,            // 壁灯（发光）
  ladder: 0x8a5a38,          // 木梯

  // 农舍
  houseWall: 0xc99a5a,       // 原木横板
  houseWallDark: 0xa87c42,   // 木板缝
  houseRoof: 0xc0392b,       // 红瓦
  houseRoofDark: 0x96291d,   // 瓦片阴影
  houseRoofSeam: 0x8e2118,   // 瓦楞条（深红）
  houseTrim: 0xe8dcc8,       // 白色包边
  chimney: 0x9a7358,         // 砖砌烟囱
  chimneyDark: 0x7a5842,
  door: 0x8a5a30,
  doorKnob: 0xd8b040,
  windowBlue: 0x4a7ab0,      // 蓝框窗
  windowGlass: 0x9ec8e0,
  flowerRed: 0xd03a3a,
  flowerGreen: 0x4a8a3a,
  barrel: 0xa87a48,
  barrelBand: 0x6a6a68,
  stair: 0xc8a878,
};

// ---------------------------------------------------------------------------
// 语义色槽位（供正式场景的"换色系统"识别）
//
// ★ 换色系统（farm.js 的 setBuildingStyle）是按【顶点色 hex 分段匹配】工作的：
//   它扫描 geometry.attributes.color，把相同颜色的连续顶点归为一个 slot，
//   再按 mapping 表把整段换成新颜色。
//
//   所以正式场景里用的谷仓/农舍，必须让关键部位使用 PALETTE 里的颜色，
//   否则换色系统匹配不到、点了没反应。
//
//   做法：buildBarnDemo({ palette: true }) 时，把下面这些槽位替换成 PALETTE 色；
//   不传 palette 时保持 demo 页原来的精调配色（C）。
//
//   wall  → PALETTE.roofRed   （谷仓主体红墙）
//   roof  → PALETTE.woodDark  （屋顶/门框）
//   door  → PALETTE.wood      （门板）
//   trim  → PALETTE.wall      （白色包边）
//   path  → PALETTE.dirt      （门前小路）
// ---------------------------------------------------------------------------
export const BARN_SLOT_COLORS = {
  wall: 'barnWall',
  roof: 'barnRoof',
  door: 'barnDoor',
  trim: 'barnTrim',
  path: 'barnDoorDark',
};

export const HOUSE_SLOT_COLORS = {
  wall: 'houseWall',
  roof: 'houseRoof',
  trim: 'houseTrim',
  door: 'door',
  path: 'stair',
};

// 按 opts.palette 返回配色表
//   palette = true  → 用 PALETTE 语义色（正式场景，支持换色）
//   palette = false → 用 demo 页的精调配色 C
function colorFor(opts = {}) {
  if (!opts.palette) return C;
  return {
    barnWall: PALETTE.roofRed,
    barnWallDark: PALETTE.woodDark,
    barnTrim: PALETTE.wall,
    barnRoof: PALETTE.woodDark,
    barnRoofEdge: PALETTE.woodDark,
    barnDoor: PALETTE.wood,
    barnDoorDark: PALETTE.dirt,
    hay: PALETTE.hay,
    hayDark: PALETTE.hay,
    lamp: 0xf0c040,
    ladder: PALETTE.wood,
    houseWall: PALETTE.wallWarm,
    houseWallDark: PALETTE.woodDark,
    houseRoof: PALETTE.roofRed,
    houseRoofDark: PALETTE.roofRed,
    // 瓦楞条：用 woodDark（映射表里 house 的 trim 槽），
    //   这样换色时瓦楞跟着变，而且和屋面有色差（不会完全同色）
    houseRoofSeam: PALETTE.woodDark,
    houseTrim: PALETTE.wall,
    chimney: PALETTE.woodDark,
    chimneyDark: PALETTE.woodDark,
    door: PALETTE.wood,
    doorKnob: PALETTE.hay,
    windowBlue: PALETTE.roofBlue,
    windowGlass: 0x9ec8e0,
    flowerRed: 0xd03a3a,
    flowerGreen: PALETTE.leafC,
    barrel: PALETTE.wood,
    barrelBand: PALETTE.metal,
    stair: PALETTE.dirt,
  };
}

// 颜色加深（用于瓦楞条：跟着屋面颜色走，只压暗，不换色）
//
// ★ 为什么需要：瓦楞条原来是硬编码 0x8e2118（深红），
//   换色系统按 hex 匹配，硬编码颜色不在映射表里 → 换成蓝/绿屋顶时
//   瓦楞条仍是深红，看起来像"颜色没替换干净"。
//   现在改为【基于屋面颜色压暗】，屋面变什么色瓦楞就跟着变。
function darken(hex, k = 0.62) {
  const r = Math.round(((hex >> 16) & 255) * k);
  const g = Math.round(((hex >> 8) & 255) * k);
  const b = Math.round((hex & 255) * k);
  return (r << 16) | (g << 8) | b;
}

// 通用小工具
const part = (arr, geo) => { arr.push(geo); return geo; };

// 纹理细节标记：竖缝、横缝这类【装饰性细条】不要加描边。
//
// ★ 为什么必须跳过：
//   描边是"沿法线放大 0.055 的外壳"，而竖缝只有 0.10 宽、横缝只有 0.07 高 ——
//   描边比纹理本身还宽，结果整条缝变成一条粗黑线，
//   看起来像"模型穿模 / 漏黑"。
//   这些缝本身只是颜色差异，不需要轮廓线。
//
// 实现：把这类几何单独收集，最后合进主网格但标记为不描边 ——
//   由于 meshFrom 只返回单 mesh，这里改为给整个 barn/house 打 noOutline，
//   再对"结构性大件"单独恢复描边（见下方 buildBarnDemo 返回值处理）。

// ---------------------------------------------------------------------------
// Gambrel（折线）屋顶 —— 谷仓的标志性轮廓
//
// 参考图的谷仓不是普通人字形屋顶，而是【折线屋顶】：
// 每侧由两段坡度组成，下段陡、上段缓，侧面轮廓像半个八边形/拱形。
//
// 轮廓（右半侧，从檐口到屋脊，坐标相对屋顶底面）：
//   檐口  (hw,        0)
//   折点  (hw*0.62,   h*0.52)      ← 下半坡（陡）
//   屋脊  (0,         h)           ← 上半坡（缓）
// 左半侧镜像。
//
// 返回：一个包含"两侧坡面"的几何体（供贴瓦楞），
// 以及山墙端面（红色木板，由调用方单独加）。
// ---------------------------------------------------------------------------
function gambrelRoofGeometry(hw, h, d) {
  const kx = 0.62;      // 折点横向位置（相对 hw）
  const ky = 0.52;      // 折点高度（相对 h）
  const hd = d / 2;

  // 右半坡的两个面：檐口→折点、折点→屋脊；左半坡镜像
  const faces = [];
  const pushQuad = (a, b, c, e) => { faces.push([a, b, c, a, c, e]); };

  for (const sx of [-1, 1]) {
    const p0 = [sx * hw, 0];
    const p1 = [sx * hw * kx, h * ky];
    const p2 = [0, h];
    // 沿 Z 拉伸成两个四边形
    pushQuad(
      [p0[0], p0[1], -hd], [p0[0], p0[1], hd],
      [p1[0], p1[1], hd], [p1[0], p1[1], -hd]
    );
    pushQuad(
      [p1[0], p1[1], -hd], [p1[0], p1[1], hd],
      [p2[0], p2[1], hd], [p2[0], p2[1], -hd]
    );
  }

  const positions = [];
  const normals = [];
  for (const tri of faces) {
    // 计算面法线
    const [a, b, c] = tri;
    const ux = b[0] - a[0], uy = b[1] - a[1], uz = b[2] - a[2];
    const vx = c[0] - a[0], vy = c[1] - a[1], vz = c[2] - a[2];
    let nx = uy * vz - uz * vy;
    let ny = uz * vx - ux * vz;
    let nz = ux * vy - uy * vx;
    const len = Math.hypot(nx, ny, nz) || 1;
    nx /= len; ny /= len; nz /= len;
    for (const v of tri) {
      positions.push(v[0], v[1], v[2]);
      normals.push(nx, ny, nz);
    }
  }

  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.BufferAttribute(new Float32Array(positions), 3));
  g.setAttribute('normal', new THREE.BufferAttribute(new Float32Array(normals), 3));
  return g;
}

// Gambrel 山墙端面（前/后两片多边形，红色木板）
//
// ★ 必须把轮廓【闭合】成完整多边形再三角化。
//   之前只用了 5 个顶点（缺底边），而且用 (0,0) 做扇形中心 ——
//   那个点正好落在底边上，导致一半三角形退化，山墙面几乎看不见。
//   现在补上底边两个角点形成 6 边闭合多边形，用扇形从内部重心三角化。
function gambrelGableFace(hw, h, d, color, kx = 0.62, ky = 0.52) {
  const hd = d / 2;
  // 闭合轮廓（逆时针）：左檐 → 左折 → 脊 → 右折 → 右檐 → 回左檐
  const outline = [
    [-hw, 0],
    [-hw * kx, h * ky],
    [0, h],
    [hw * kx, h * ky],
    [hw, 0],
  ];
  // 注意：这个 5 点轮廓本身就是闭合的（最后一点到第一点就是底边），
  // 三角化时用 % outline.length 会自动连回去，不需要额外的角点。
  // 重心：取轮廓的平均（一定在内部）
  let cx = 0, cy = 0;
  for (const p of outline) { cx += p[0]; cy += p[1]; }
  cx /= outline.length; cy /= outline.length;

  const positions = [];
  const normals = [];
  for (const sz of [-1, 1]) {
    const z = sz * hd;
    for (let i = 0; i < outline.length; i++) {
      const a = outline[i];
      const b = outline[(i + 1) % outline.length];
      // 逆时针轮廓 + 从内部重心扇形：正面(z>0)绕序为 (中心, a, b)
      const tri = sz > 0
        ? [[cx, cy], [a[0], a[1]], [b[0], b[1]]]
        : [[cx, cy], [b[0], b[1]], [a[0], a[1]]];
      for (const v of tri) {
        positions.push(v[0], v[1], z);
        normals.push(0, 0, sz);
      }
    }
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.BufferAttribute(new Float32Array(positions), 3));
  g.setAttribute('normal', new THREE.BufferAttribute(new Float32Array(normals), 3));
  return tint(g, color);
}

// ---------------------------------------------------------------------------
// 谷仓
// ---------------------------------------------------------------------------
export function buildBarnDemo(opts = {}) {
  const parts = [];
  const detail = [];   // 纹理细节（竖缝/横缝），不加描边
  const W = 13, D = 20, H = 9;

  // ★ opts.palette = true 时，把关键部位换成 PALETTE 语义色，
  //   让正式场景的换色系统能识别（见文件头的 BARN_SLOT_COLORS 说明）。
  //   不传时保持 demo 页原配色。
  const K = colorFor(opts);

  // ---- 墙体：红色竖板 ----
  part(parts, box(W, H, D, K.barnWall, 0, 0, 0));

  // 竖向木板条纹（每隔 0.92 一条暗缝）
  //
  // ★ 间距要和山墙的竖缝一致（0.92），z 也要对齐（D/2 表面），
  //   这样墙身的缝和山墙上的缝能连成一条直线，
  //   视觉上就是"整面墙到屋顶都是竖板"。
  const SEAM_STEP = 0.92;
  const seamZ = D / 2;
  for (let x = -W / 2 + SEAM_STEP / 2; x < W / 2; x += SEAM_STEP) {
    // 前后两个面
    part(detail, box(0.10, H - 0.1, 0.07, 0x6a2014, x, 0.05, seamZ + 0.04));
    part(detail, box(0.10, H - 0.1, 0.07, 0x6a2014, x, 0.05, -seamZ - 0.04));
  }
  for (let z = -D / 2 + 0.55; z < D / 2; z += 1.1) {
    part(detail, box(0.06, H - 0.1, 0.08, K.barnWallDark, W / 2 + 0.01, 0.05, z));
    part(detail, box(0.06, H - 0.1, 0.08, K.barnWallDark, -W / 2 - 0.01, 0.05, z));
  }

  // ---- 白色包边 ----
  // 底部基座
  part(parts, box(W + 0.16, 0.5, D + 0.16, K.barnTrim, 0, 0, 0));
  // 顶部檐口白边
  part(parts, box(W + 0.16, 0.42, D + 0.16, K.barnTrim, 0, H - 0.5, 0));
  // 四角竖向白条
  for (const sx of [-1, 1]) {
    for (const sz of [-1, 1]) {
      part(parts, box(0.34, H, 0.34, K.barnTrim, sx * (W / 2 - 0.1), 0, sz * (D / 2 - 0.1)));
    }
  }

  // ---- 屋顶：Gambrel（折线）屋顶 + 深色瓦 ----
  //
  // ★ 参考图是折线屋顶，不是普通人字屋顶：
  //   每侧两段坡度（下陡上缓），侧面轮廓像半个八边形。
  //   这是谷仓最标志性的形状，用人字屋顶会完全失去辨识度。
  const roofH = 5.4;
  const roofHalfW = W / 2 + 0.7;
  const KX = 0.62, KY = 0.52;   // 折点位置（与 gambrelRoofGeometry 保持一致）

  // 坡面：用两段【实体棱柱】拼成折线屋顶
  //
  // ★ 用 gable() 而不是自绘 BufferGeometry：
  //   gable 生成的是封闭的实心棱柱（有前后三角面），
  //   从任何角度看都是实心的，不会露出"屋顶内侧黑色"。
  //
  //   下段：从檐口到折点（陡坡）—— 用一个矮而宽的棱柱
  //   上段：从折点到屋脊（缓坡）—— 用一个高而窄的棱柱
  //
  //   注意 gable(w,h,d) 的 w 是【底面全宽】、h 是【顶点高度】。
  {
    const yBase = H - 0.08;
    // 下段：底宽 = 2*roofHalfW，高 = roofH*KY，顶宽收窄到 2*roofHalfW*KX
    // 用一个"梯形棱柱"近似：先放一个矮 gable，再切掉两侧 ——
    // 实际做法：下段用【两个小 gable 的一半】不好做，
    // 改用 box 斜坡：直接放两块倾斜的厚板（有厚度就不会露黑）。
    const lowerH = roofH * KY;
    const upperH = roofH - lowerH;
    // ---- 下段：左右各一块倾斜厚板 ----
    const lowerRunX = roofHalfW * (1 - KX);
    const lowerLen = Math.hypot(lowerRunX, lowerH);
    const lowerAng = Math.atan2(lowerH, lowerRunX);
    // ★ 坡板深度要比墙体深（D+1.6），前后各挑出 0.8 —— 这是参考图里
    //   屋顶明显"盖"在墙上的关键。之前 D+0.5 只挑出 0.25，几乎看不出来。
    // ★ 坡板加深到 D+2.4（前后各挑出 1.2），挑檐才明显。
    for (const sx of [-1, 1]) {
      const p = new THREE.BoxGeometry(lowerLen, 0.34, D + 2.4);
      p.rotateZ(sx > 0 ? -lowerAng : lowerAng);
      p.translate(sx * (roofHalfW + roofHalfW * KX) / 2, yBase + lowerH / 2, 0);
      part(parts, tint(p, K.barnRoof));
    }
    // ---- 上段：左右各一块倾斜厚板 ----
    const upperRunX = roofHalfW * KX;
    const upperLen = Math.hypot(upperRunX, upperH);
    const upperAng = Math.atan2(upperH, upperRunX);
    for (const sx of [-1, 1]) {
      const p = new THREE.BoxGeometry(upperLen, 0.34, D + 2.4);
      p.rotateZ(sx > 0 ? -upperAng : upperAng);
      p.translate(sx * upperRunX / 2, yBase + lowerH + upperH / 2, 0);
      part(parts, tint(p, K.barnRoof));
    }

    // ---- 山墙端面：红色木板 ----
    //
    // ---- 山墙端面：用【水平薄层堆叠】出折线轮廓 ----
    //
    // ★ 为什么不用自定义 BufferGeometry：
    //   自绘几何没有 index，和 meshFrom 里其它带 index 的几何合并时
    //   顶点顺序会错乱，导致端面渲染异常（试了 4 次都没调对）。
    //   改用 N 层 box 逐层收窄，既精确又绝对不会出错。
    //
    //   轮廓：t=0 底边宽 2*roofHalfW → t=KY 收到 2*roofHalfW*KX → t=1 收到 0
    // 层数要够多，否则折线边缘呈锯齿台阶。
    // 80 层：边缘更平滑，竖缝也能更细密地跟着轮廓走。
    const LAYERS = 80;
    for (const sz of [-1, 1]) {
      // ★ 端面【和墙面齐平】(D/2)，让竖缝能从上到下连成一条线。
      //   之前退进 0.25，虽然挑檐更明显，但竖缝在墙身和山墙之间断开了，
      //   看起来像"上下两截不同的板"。
      //   挑檐的立体感改由坡板加长（D+2.4）来提供，不靠退端面。
      const z = sz * (D / 2);
      for (let i = 0; i < LAYERS; i++) {
        const t = (i + 0.5) / LAYERS;          // 0..1
        let halfW;
        if (t <= KY) {
          // 下段：从 roofHalfW 线性收到 roofHalfW*KX
          halfW = roofHalfW * (1 - (t / KY) * (1 - KX));
        } else {
          // 上段：从 roofHalfW*KX 线性收到 0
          halfW = roofHalfW * KX * (1 - (t - KY) / (1 - KY));
        }
        if (halfW < 0.05) continue;
        const layerH = roofH / LAYERS * 1.12;
        const layerY = yBase + t * roofH - roofH / LAYERS / 2;
        // 每层高度略大于间距（*1.12），保证层与层之间没有缝隙
        part(parts, box(
          halfW * 2, layerH, 0.26,
          K.barnWall, 0, layerY, z
        ));

        // ★ 竖向木板缝：参考图里山墙上的竖纹是一路通到屋顶折线的。
        //
        //   做法：每一层都在该层的宽度范围内铺若干竖缝。
        //   因为层的宽度随折线收窄，竖缝自然就"跟着轮廓走"，
        //   一直延伸到屋脊 —— 不会出现"竖纹到一半就断掉"。
        //
        //   缝的位置用固定的世界 x 坐标（而不是按层宽比例），
        //   这样上下层的缝能对齐成连续的竖线。
        //   缝要【浮在层的外表面】才有颜色对比：
        //   层的厚度是 0.26，中心在 z，所以外表面在 z + sz*0.13。
        //   缝放在 z + sz*0.135，刚好贴在外面一点。
        //   缝的位置必须和墙身部分【完全一致】：
        //   墙身用的是 x = -W/2 + SEAM_STEP/2 + k*SEAM_STEP，
        //   这里就按同一个公式生成，才能连成连续的竖线。
        //   逐层画缝：只要该层宽度覆盖到这条缝的 x，就画这一层的短段。
        //   因为层会一直堆到屋脊，缝自然跟着轮廓一路延伸上去，
        //   边缘的缝在层收窄到它外面时自动停止 —— 这正是参考图的效果。
        const kMin = Math.floor((-halfW + W / 2 - SEAM_STEP / 2) / SEAM_STEP) - 1;
        const kMax = Math.ceil((halfW + W / 2 - SEAM_STEP / 2) / SEAM_STEP) + 1;
        for (let k = kMin; k <= kMax; k++) {
          const sx2 = -W / 2 + SEAM_STEP / 2 + k * SEAM_STEP;
          if (Math.abs(sx2) > halfW - 0.06) continue;
          part(detail, box(
            0.10, layerH, 0.07,
            0x6a2014, sx2, layerY, z + sz * 0.14
          ));
        }
      }
    }
  }

  // 屋脊压顶
  part(parts, box(0.42, 0.26, D + 2.6, K.barnRoofEdge, 0, H - 0.08 + roofH - 0.1, 0));

  // 折线处的转角压条（折点位置一条，左右各一）
  for (const sx of [-1, 1]) {
    const zx = sx * roofHalfW * KX;
    const zy = H - 0.08 + roofH * KY;
    part(parts, box(0.34, 0.22, D + 2.5, K.barnRoofEdge, zx, zy - 0.06, 0));
  }

  // 檐口：底边一条厚檐（左右各一）
  for (const sx of [-1, 1]) {
    part(detail, box(0.55, 0.30, D + 2.5, K.barnRoofEdge, sx * (roofHalfW - 0.2), H - 0.2, 0));
  }
  // 屋顶横向瓦楞
  //
  // ★ 必须做成【贴着斜面】的薄片，不能是水平长方块：
  //   box(halfW*2, 0.08, D) 是水平板，屋顶却是斜的，
  //   在屋顶两侧会伸出去一大截（看起来像"飞碟"）。
  //   正确做法：沿每个坡度方向铺一条与斜面平行的细长条。
  //
  //   坡面参数：从檐口 (±(W/2+0.7), H) 到屋脊 (0, H+5.4)。
  //   每条瓦楞沿坡面平移一段，用 rotateZ 对齐坡度。
  //   做法：每一道瓦楞由【左右两根斜条】组成，各自贴合自己那半边坡面。
  //   斜条沿 Z 轴（屋脊方向）横跨整个屋顶长度，方向沿坡面斜着走。
  //
  //   坡面：从檐口 (±roofHalfW, 0) 到屋脊 (0, roofH)（相对屋顶底面）。
  //   取坡面上一点 P(t) = (±roofHalfW*(1-t), roofH*t)。
  //   条带本体水平放置后再 rotateZ(±slope)，让它沿坡面方向延伸。
  //   折线屋顶有【两段】坡，要分别处理：
  //   下段：檐口 (hw,0) → 折点 (hw*KX, h*KY)
  //   上段：折点 (hw*KX,h*KY) → 屋脊 (0, h)
  //   每段各铺 3~4 道瓦楞，斜度用各自的方向向量算。
  {
    const segs = [
      { ax: 1, ay: 0, bx: KX, by: KY, n: 3 },        // 下段（相对单位：x 用 hw，y 用 h）
      { ax: KX, ay: KY, bx: 0, by: 1, n: 3 },         // 上段
    ];
    for (const sx of [-1, 1]) {
      for (const sg of segs) {
        const x0 = sx * roofHalfW * sg.ax, y0 = roofH * sg.ay;
        const x1 = sx * roofHalfW * sg.bx, y1 = roofH * sg.by;
        const dx = x1 - x0, dy = y1 - y0;
        const segLength = Math.hypot(dx, dy);
        const ang = Math.atan2(dy, dx);
        for (let i = 1; i <= sg.n; i++) {
          const t = i / (sg.n + 1);
          const cx2 = x0 + dx * t;
          const cy2 = H - 0.08 + y0 + dy * t;
          // 瓦楞深度不要超过坡板（坡板 D+0.5），否则会伸出去悬空
          // ★ 同样要沿坡面法线外移足够多（见农舍处说明）
          const plateHalf = 0.17;
          const lift = plateHalf + 0.08 + 0.16;
          const nx = -sx * Math.sin(Math.abs(ang));
          const ny = Math.cos(Math.abs(ang));
          const bar = new THREE.BoxGeometry(segLength / (sg.n + 1) * 1.15, 0.085, D + 2.48);
          bar.rotateZ(ang);
          bar.translate(cx2 + nx * lift, cy2 + ny * lift, 0);
          part(detail, tint(bar, K.barnRoofEdge));
        }
      }
    }
  }

  // ---- 正面大门：双开门 + X 撑条 ----
  const doorW = 6.0, doorH = 6.4, dz = D / 2 + 0.06;
  // 门框（深色）
  part(parts, box(doorW + 0.6, doorH + 0.5, 0.3, K.barnDoorDark, 0, 0.1, dz));
  // 左右两扇门
  for (const sx of [-1, 1]) {
    part(parts, box(doorW / 2 - 0.12, doorH, 0.22, K.barnDoor, sx * doorW / 4, 0.3, dz + 0.16));
  }
  // 竖向门板缝
  for (let i = -2; i <= 2; i++) {
    part(detail, box(0.06, doorH - 0.3, 0.04, K.barnDoorDark, i * (doorW / 5.4), 0.45, dz + 0.28));
  }
  // X 形撑条（每扇门一个）
  for (const sx of [-1, 1]) {
    for (const dir of [-1, 1]) {
      const bar = new THREE.BoxGeometry(doorW / 2 - 0.3, 0.26, 0.1);
      bar.rotateZ(dir * 0.62);
      bar.translate(sx * doorW / 4, 0.3 + doorH / 2, dz + 0.30);
      part(detail, tint(bar, K.barnDoorDark));
    }
  }
  // 门中缝的竖向白条
  part(parts, box(0.3, doorH, 0.14, K.barnTrim, 0, 0.3, dz + 0.30));

  // 门上方横梁（白色）
  part(parts, box(W + 0.2, 0.36, 0.3, K.barnTrim, 0, doorH + 0.55, D / 2 + 0.08));

  // ---- 阁楼窗（干草从窗口露出）----
  //
  // ★ 参考图里阁楼窗开在【山墙中部】，即 H 以上、折线以下的红色山墙上，
  //   不是开在下部的墙身。所以 z 要跟着山墙端面走（D/2 - 0.25），
  //   y 要在 H 上方一段。
  const gableZ = D / 2;                     // 和山墙端面同位置（齐平）
  const atticW = 2.6, atticH = 1.9;
  const atticY = H + 0.55;                  // 山墙下部
  // 小雨檐（挑出山墙的小挑檐，参考图里有）
  part(parts, box(atticW + 1.1, 0.24, 0.9, K.barnRoofEdge, 0, atticY + atticH + 0.16, gableZ + 0.35));
  // 窗洞外框（浅色木框）
  part(parts, box(atticW + 0.36, atticH + 0.34, 0.22, 0x8a5a38, 0, atticY - 0.17, gableZ + 0.06));
  // 深色窗洞
  part(parts, box(atticW, atticH, 0.16, 0x1a1210, 0, atticY, gableZ + 0.14));
  // 窗口下方的干草（从洞里堆出来，参考图很显眼）
  part(parts, box(atticW + 0.14, 0.30, 0.42, K.hay, 0, atticY - 0.10, gableZ + 0.22));
  part(parts, box(atticW * 0.78, 0.22, 0.30, K.hayDark, 0, atticY - 0.26, gableZ + 0.32));
  // 窗口顶部的滑轮吊架（参考图里有个小滑轮）
  part(parts, box(0.16, 0.16, 0.16, 0x5a4a3a, 0, atticY + atticH + 0.02, gableZ + 0.30));

  // ---- 壁灯（门右侧）----
  const lampX = doorW / 2 + 1.4, lampY = 5.2;
  part(parts, box(0.14, 0.5, 0.14, 0x3a2a1e, lampX, lampY + 0.5, D / 2 + 0.1));
  part(parts, box(0.5, 0.62, 0.5, 0x3a2a1e, lampX, lampY, D / 2 + 0.28));
  part(parts, box(0.34, 0.44, 0.34, K.lamp, lampX, lampY + 0.09, D / 2 + 0.3));

  // ---- 木梯（靠右侧墙）----
  const lx = W / 2 + 0.35;
  for (let i = 0; i < 9; i++) {
    const y = 0.8 + i * 0.72;
    part(parts, box(0.9, 0.1, 0.16, K.ladder, lx, y, -D / 2 + 2.2 + i * 0.02));
  }
  for (const sz of [-0.45, 0.45]) {
    const rail = new THREE.BoxGeometry(0.1, 7.4, 0.12);
    rail.rotateX(0);
    rail.translate(lx, 0.8 + 3.2, -D / 2 + 2.2 + sz * 0.9);
    part(parts, tint(rail, K.ladder));
  }

  // ---- 墙角干草堆 ----
  const hayPile = (x, z, s) => {
    part(parts, box(2.2 * s, 0.9 * s, 1.6 * s, K.hay, x, 0, z));
    part(parts, box(1.7 * s, 0.55 * s, 1.2 * s, K.hayDark, x + 0.15 * s, 0.75 * s, z - 0.1 * s));
  };
  hayPile(-W / 2 - 1.1, D / 2 - 2.0, 1.0);
  hayPile(W / 2 + 1.0, -D / 2 + 1.6, 0.9);

  // ---- 门前地面（土路）----
  // 门前土路（用 K.barnDoorDark，对应 PALETTE.dirt，参与换色）
  part(parts, box(6.5, 0.1, 4.0, K.barnDoorDark, 0, 0, D / 2 + 2.0));

  const m = meshFrom(parts);
  m.name = 'barnDemo';

  // 纹理细节单独成一个 mesh，标记 noOutline（addOutlineDeep 会跳过）
  if (detail.length) {
    const dm = meshFrom(detail);
    dm.name = 'barnDetail';
    dm.userData.noOutline = true;
    dm.castShadow = false;
    dm.receiveShadow = true;
    m.add(dm);
  }
  return m;
}


// ---------------------------------------------------------------------------
// 农舍
// ---------------------------------------------------------------------------
export function buildFarmhouseDemo(opts = {}) {
  const parts = [];
  const detail = [];   // 纹理细节（横缝/砖缝），不加描边
  const K = colorFor(opts);
  const W = 11, D = 13, H = 6.2;

  // ---- 墙体：原木横板 ----
  part(parts, box(W, H, D, K.houseWall, 0, 0, 0));
  // 横向木板缝（每 0.75 一道暗线）
  //
  // ★ 前后两个面都要有（之前只有一圈薄片，正面几乎看不出横板）。
  //   间距 0.75 必须和山墙层里的横线一致，才能连成连续的横板纹理。
  for (let y = 0.75; y < H; y += 0.75) {
    part(detail, box(W - 0.02, 0.07, 0.06, K.houseWallDark, 0, y, D / 2 + 0.04));
    part(detail, box(W - 0.02, 0.07, 0.06, K.houseWallDark, 0, y, -D / 2 - 0.04));
    // 左右两个侧面
    part(detail, box(0.06, 0.07, D - 0.02, K.houseWallDark, W / 2 + 0.04, y, 0));
    part(detail, box(0.06, 0.07, D - 0.02, K.houseWallDark, -W / 2 - 0.04, y, 0));
  }

  // ---- 基座（深色石基）----
  part(parts, box(W + 0.3, 0.55, D + 0.3, 0x8a7a68, 0, 0, 0));

  // ---- 屋顶：红瓦 + 厚檐口 ----
  //
  // ★ 和谷仓同样的思路：
  //   1) 坡板要明显挑出墙面（前后各挑出 1.1）
  //   2) 山墙端面用"水平层堆叠"，让横向木板缝一路延伸到屋顶
  const hRoofH = 4.6;
  const hRoofHalfW = W / 2 + 0.85;
  const roofY0 = H - 0.05;

  // 坡板：左右各一块倾斜厚板（挑出 D+2.2）
  {
    const runX = hRoofHalfW;
    const len = Math.hypot(runX, hRoofH);
    const ang = Math.atan2(hRoofH, runX);
    // ★ 坡板前后只挑出 0.5（D+1.0），不要太多 ——
    //   挑出太多会把山墙正面整个挡住，看不到横板纹理。
    //   参考图里屋顶的"挑出"主要体现在【左右檐口】方向，不是前后。
    for (const sx of [-1, 1]) {
      const p = new THREE.BoxGeometry(len, 0.34, D + 1.0);
      p.rotateZ(sx > 0 ? -ang : ang);
      p.translate(sx * runX / 2, roofY0 + hRoofH / 2, 0);
      part(parts, tint(p, K.houseRoof));
    }
  }

  // ---- 山墙端面：水平层堆叠（横向木板缝跟着轮廓走）----
  {
    const LAYERS = 40;
    for (const sz of [-1, 1]) {
      // ★ 山墙要和墙面齐平（D/2），不能后退 ——
      //   后退会被挑出的坡板挡住，横板纹理就看不到了。
      const z = sz * (D / 2);
      for (let i = 0; i < LAYERS; i++) {
        const t = (i + 0.5) / LAYERS;
        const halfW = hRoofHalfW * (1 - t);   // 人字屋顶：线性收窄
        if (halfW < 0.05) continue;
        const layerH = hRoofH / LAYERS * 1.12;
        const layerY = roofY0 + t * hRoofH - hRoofH / LAYERS / 2;

        // 山墙主体（原木色）
        part(parts, box(halfW * 2, layerH, 0.26, K.houseWall, 0, layerY, z));

        // ★ 横向木板缝：每层内再切几道横线，
        //   这样从墙身一直延伸到屋脊都是连续的横板纹理。
        //   每层的横线间距和墙身一致（0.75），用绝对 y 计算。
        const yTop = layerY + layerH / 2;
        const yBot = layerY - layerH / 2;
        for (let yy = Math.ceil(yBot / 0.75) * 0.75; yy <= yTop; yy += 0.75) {
          part(detail, box(halfW * 2, 0.07, 0.06, K.houseWallDark, 0, yy, z + sz * 0.14));
        }
      }
    }
  }

  // 屋脊
  part(parts, box(0.42, 0.26, D + 1.2, K.houseRoofDark, 0, roofY0 + hRoofH - 0.1, 0));

  // ---- 屋顶边缘压条（深红，形成"屋顶外沿"的轮廓）----
  //
  // ★ 这是农舍屋顶外沿红描边的来源。
  //   之前把檐口压条挪成原木色后，屋顶外沿就失去了这条深色边，
  //   看起来"法线/描边消失了"。
  //   参考图里屋顶边缘本来就有比瓦面更深的一道边（瓦片的收口）。
  for (const sx of [-1, 1]) {
    const ang = Math.atan2(hRoofH, hRoofHalfW);
    // 沿坡面最外沿（檐口端）放一条深红条
    const bar = new THREE.BoxGeometry(0.55, 0.22, D + 1.15);
    bar.rotateZ(sx > 0 ? -ang : ang);
    bar.translate(sx * (hRoofHalfW - 0.10), roofY0 + 0.12, 0);
    part(parts, tint(bar, K.houseRoofDark));
  }

  // ---- 檐口白边（环绕屋顶一整圈）----
  //
  // ★ 用户要求：这一圈都用白色屋檐。
  //   参考图里屋顶下沿有一圈白色包边，沿两条檐口 + 前后两片山墙斜边，
  //   围着屋顶绕一整圈，把红色瓦面和木墙分隔开。
  //
  //   实现：沿屋顶轮廓（折线 y(x)）铺一圈白色薄板。
  //   轮廓函数：roofEdgeY(x) = roofY0 + hRoofH * (1 - |x|/hRoofHalfW)
  //   沿这条线每隔一小段放一块短白板，方向随坡度倾斜。
  {
    const boardW = 0.34;           // 白边厚度（沿坡面方向）
    const boardH = 0.26;           // 白边高度（竖直方向）
    const ang = Math.atan2(hRoofH, hRoofHalfW);
    const slopeLen = Math.hypot(hRoofHalfW, hRoofH);

    for (const sx of [-1, 1]) {
      // ---- 左右檐口白边：一根【连续】的长条，沿 Z 横跨整个屋顶 ----
      //   ★ 用整条而不是分段拼：分段会产生锯齿状的接缝。
      // ★ 长度必须【正好等于坡面长】，不能加余量：
      //   加 0.3 会让端点超出 (hRoofHalfW, roofY0)，
      //   和山墙底边的横梁对不上，角上多出一块凸起（穿模）。
      //   实测：slopeLen 时端点 (6.350, 6.020) 正好是 hRoofHalfW 处。
      const p1 = new THREE.BoxGeometry(slopeLen, boardH, D + 1.16);
      p1.rotateZ(sx > 0 ? -ang : ang);
      // 沿坡面中线放置，再垂直下移半个板高
      p1.translate(
        sx * hRoofHalfW * 0.5,
        roofY0 + hRoofH * 0.5 - boardH * 0.5,
        0
      );
      part(parts, tint(p1, K.houseTrim));

      // ---- 前后山墙斜边白边：同样是连续长条，贴在端面上 ----
      for (const sz of [-1, 1]) {
        // ★ 宽度要和檐口白边完全一致（原来 *0.92 导致转角处错位）
        const p2 = new THREE.BoxGeometry(slopeLen, boardH, boardW);
        p2.rotateZ(sx > 0 ? -ang : ang);
        p2.translate(
          sx * hRoofHalfW * 0.5,
          roofY0 + hRoofH * 0.5 - boardH * 0.5,   // 和檐口白边的偏移量一致
          sz * (D / 2 + 0.17)
        );
        part(parts, tint(p2, K.houseTrim));
      }
    }

    // ---- 山墙底边的白色横梁（把两条斜边白边连成完整一圈）----
    //
    // ★ 用户指出：山墙三角和方形墙身交界处（y = roofY0）应该也是白色，
    //   现在那里是木色，白边到了底部就断开了。
    //   加一根横贯整个山墙宽度的白色横梁，把左右两条斜边接上，
    //   檐口白边就形成闭合的一整圈。
    // ★ 横梁宽度必须和檐口白边的【端点】对齐，不能自己加余量。
    //   檐口白边端点 x = hRoofHalfW（因为长度取了正好 slopeLen），
    //   所以横梁半宽 = hRoofHalfW，与端点严丝合缝。
    for (const sz of [-1, 1]) {
      part(parts, box(
        hRoofHalfW * 2, boardH, boardW,
        K.houseTrim,
        0, roofY0 - boardH * 0.5, sz * (D / 2 + 0.17)
      ));
    }
  }

  // ---- 瓦片横纹：贴在坡面【外侧】 ----
  //
  // ★ 必须沿坡面法线往外偏移，否则瓦楞条会被坡板整个埋住：
  //   坡板厚 0.34，中心就在坡面上，所以它的外表面在法线方向 +0.17。
  //   之前瓦楞条的中心直接放在坡面上（cy2 = roofY0 + hRoofH*t），
  //   等于埋在坡板正中间 —— 完全看不见（这就是"栅格消失"的原因）。
  //
  //   坡面法线：坡面方向是 (±cos, sin)，法线取其垂直方向 (∓sin, cos)，
  //   朝外的一侧是 (∓sin, cos)（sx=+1 时法线指向右上）。
  {
    const ang = Math.atan2(hRoofH, hRoofHalfW);
    const segLen = Math.hypot(hRoofHalfW, hRoofH) / 8 * 0.92;
    // ★ 抬升量必须【大于坡板半厚】，否则瓦楞被埋：
    //   实测 x≈3.5 处坡板顶 13.48、瓦楞顶 12.76 —— 瓦楞低了 0.72。
    //
    //   但这里抬多少都不够 —— 因为坡板是【沿法线厚 0.34 的实心板】，
    //   它的"顶面"在坡面法线方向上是 +0.17，
    //   而瓦楞如果只抬 0.22，其下表面还在 0.22-0.08=0.14 < 0.17 的位置，
    //   被坡板顶面盖住。
    //
    //   直接抬 0.42（坡板半厚 + 瓦楞半厚 + 余量），确保整条瓦楞露在外面。
    const plateHalf = 0.17;
    const barThick = 0.16;
    const lift = plateHalf + barThick / 2 + 0.16;   // = 0.17+0.08+0.16 = 0.41
    for (const sx of [-1, 1]) {
      // 法线方向（朝外）
      const nx = -sx * Math.sin(ang);
      const ny = Math.cos(ang);
      for (let i = 1; i <= 7; i++) {
        const t = i / 8;
        const px = sx * (hRoofHalfW * (1 - t));
        const py = roofY0 + hRoofH * t;
        // 颜色要比瓦面明显更深，否则只是一条几乎看不见的暗纹。
        // 参考图里每道瓦楞都有清晰的阴影线。
        const bar = new THREE.BoxGeometry(segLen, barThick, D + 1.08);
        bar.rotateZ(sx > 0 ? -ang : ang);
        bar.translate(px + nx * lift, py + ny * lift, 0);
        // ★ 跟着屋面颜色走：K.houseRoof 是映射到 PALETTE.roofRed 的槽位，
        //   换色时会被 recolorMesh 一起改。压暗 0.62 保持"瓦楞阴影线"的效果。
        part(detail, tint(bar, K.houseRoofSeam));
      }
    }
  }

  // ---- 烟囱（砖砌，出屋顶）----
  const chX = 2.6, chZ = -2.2;
  part(parts, box(1.5, 5.4, 1.4, K.chimney, chX, H + 1.6, chZ));
  // 砖缝
  for (let y = H + 2.0; y < H + 6.8; y += 0.45) {
    part(detail, box(1.54, 0.06, 1.44, K.chimneyDark, chX, y, chZ));
  }
  // 烟囱顶盖
  part(parts, box(1.9, 0.28, 1.8, 0xc8beb0, chX, H + 7.0, chZ));

  // ---- 门（正面中央偏左）----
  const doorW = 1.9, doorH = 3.4, dz = D / 2 + 0.06;
  part(parts, box(doorW + 0.34, doorH + 0.3, 0.24, K.houseTrim, -1.4, 0.5, dz));
  part(parts, box(doorW, doorH, 0.18, K.door, -1.4, 0.6, dz + 0.14));
  // 门板分格
  part(parts, box(doorW * 0.72, 0.9, 0.06, 0xa87848, -1.4, doorH * 0.62, dz + 0.24));
  part(parts, box(doorW * 0.72, 0.9, 0.06, 0xa87848, -1.4, doorH * 0.22, dz + 0.24));
  // 门把手
  part(parts, box(0.14, 0.14, 0.1, K.doorKnob, -1.4 - doorW * 0.28, 1.9, dz + 0.3));

  // ---- 台阶（门前两级）----
  part(parts, box(3.0, 0.26, 1.1, K.stair, -1.4, 0, D / 2 + 0.75));
  part(parts, box(2.6, 0.26, 0.8, K.stair, -1.4, 0.26, D / 2 + 0.55));

  // ---- 窗户（蓝框 + 花箱）----
  const windowAt = (x, y, z, withFlower) => {
    // 白框
    part(parts, box(2.0, 1.8, 0.16, K.houseTrim, x, y, z));
    // 蓝框
    part(parts, box(1.72, 1.52, 0.12, K.windowBlue, x, y + 0.14, z + 0.08));
    // 玻璃
    part(parts, box(1.44, 1.24, 0.08, K.windowGlass, x, y + 0.28, z + 0.14));
    // 十字窗棂
    part(detail, box(0.1, 1.24, 0.06, K.houseTrim, x, y + 0.28, z + 0.2));
    part(detail, box(1.44, 0.1, 0.06, K.houseTrim, x, y + 0.9, z + 0.2));
    // 花箱
    if (withFlower) {
      part(parts, box(1.9, 0.34, 0.5, 0x9a6a38, x, y - 0.1, z + 0.34));
      // 花：几簇红绿
      for (let i = -1; i <= 1; i++) {
        part(parts, box(0.34, 0.24, 0.3, K.flowerGreen, x + i * 0.55, y + 0.22, z + 0.34));
        part(parts, box(0.22, 0.2, 0.22, K.flowerRed, x + i * 0.55, y + 0.42, z + 0.36));
      }
    }
  };
  windowAt(2.5, 2.3, dz, true);
  windowAt(-4.2, 2.3, dz, true);

  // 侧墙窗（贴在左右两面墙上，需要旋转 90°）
  const sideWin = (x, z) => {
    part(parts, box(0.16, 1.8, 2.0, K.houseTrim, x, 2.3, z));
    part(parts, box(0.12, 1.52, 1.72, K.windowBlue, x + 0.08, 2.44, z));
    part(parts, box(0.08, 1.24, 1.44, K.windowGlass, x + 0.14, 2.58, z));
  };
  sideWin(W / 2 + 0.06, 1.8);
  sideWin(-W / 2 - 0.06, -1.8);

  // ---- 门前木桶（两只）----
  const barrelAt = (x, z, s = 1) => {
    part(parts, cyl(0.52 * s, 0.58 * s, 1.1 * s, 10, K.barrel, x, 0, z));
    part(parts, cyl(0.6 * s, 0.6 * s, 0.12 * s, 10, K.barrelBand, x, 0.22 * s, z));
    part(parts, cyl(0.6 * s, 0.6 * s, 0.12 * s, 10, K.barrelBand, x, 0.78 * s, z));
  };
  barrelAt(1.0, D / 2 + 1.3, 1.0);
  barrelAt(2.1, D / 2 + 1.0, 0.85);

  // ---- 靠墙的铁锹 ----
  const shovelX = -W / 2 - 0.5, shovelZ = D / 2 - 1.6;
  part(parts, box(0.1, 3.2, 0.1, 0x8a6a48, shovelX, 0, shovelZ));
  part(parts, box(0.5, 0.7, 0.08, 0x9a9a98, shovelX, 0, shovelZ));
  part(parts, box(0.44, 0.16, 0.16, 0x5a4a3a, shovelX, 3.1, shovelZ));

  const m = meshFrom(parts);
  m.name = 'farmhouseDemo';

  if (detail.length) {
    const dm = meshFrom(detail);
    dm.name = 'houseDetail';
    dm.userData.noOutline = true;
    dm.castShadow = false;
    dm.receiveShadow = true;
    m.add(dm);
  }
  return m;
}
