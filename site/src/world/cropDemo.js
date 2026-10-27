// ---------------------------------------------------------------------------
// 农作物 demo —— 五种（按用户提供的参考图，体素方块风）
//
// A  向日葵：粗茎 + 大花盘 + 多层花瓣 + 心形叶
// B  胡萝卜：土块 + 橙色萝卜根 + 羽状绿叶
// C  南瓜：圆球南瓜 + 藤蔓 + 黄叶 + 卷须
// D  小麦：多根茎 + 麦穗 + 细长叶 + 杂草
// E  玉米：高杆 + 宽叶 + 玉米棒 + 顶穗
//
// 设计原则（要求同上）：干净、无杂点、体块干净
//   - 所有部件用整块长方体/方块，边缘对齐格线
//   - 颜色只用 2~4 个同系色，避免杂色
//   - 叶片用「扁平长条 + 尖端小块」的固定组合，不做随机碎裂
// ---------------------------------------------------------------------------
import * as THREE from '../../vendor/three/three.module.js';
import { box, cyl, tint, meshFrom } from '../util/geo.js';

const part = (arr, geo) => { arr.push(geo); return geo; };

function build(parts, name) {
  const m = meshFrom(parts);
  m.name = name;
  return m;
}

// 土块基底
// ★ 全局开关：田地里使用时跳过土壤块
//   demo 页：一丛作物站在自己的土块上 → 需要土
//   田地里：整块田已经有 soil 底板，每株再带一个土块会变成"一块块小方砖"
let SKIP_SOIL = false;
export function setSkipSoil(v) { SKIP_SOIL = !!v; }

function addSoil(parts, size, h, topColor, sideColor) {
  if (SKIP_SOIL) return;
  part(parts, box(size, h, size, sideColor, 0, 0, 0));
  part(parts, box(size * 0.98, h * 0.30, size * 0.98, topColor, 0, 0, 0));
  const s = size * 0.28;
  for (let i = -1; i <= 1; i++) {
    for (let j = -1; j <= 1; j++) {
      if ((i + j) % 2 !== 0) continue;
      part(parts, box(0.10, 0.06, 0.10, sideColor, i * s, h * 0.30, j * s));
    }
  }
}

// 通用叶片：扁平长条 x3 段，朝 ang 方向伸出、抬起 tilt
function addLeaf(parts, x, y, z, len, wid, ang, tilt, color) {
  // 叶片 = 一整块扁平方块（干净、体素风）
  //
  // 构造顺序很关键：
  //   1) 在原点建一块「沿 +Z 伸出」的板
  //   2) 沿 Z 平移到 [0, len]
  //   3) 绕 X 轴抬起 tilt（负值 = 下垂）
  //   4) 绕 Y 轴转到 ang 方位
  //   5) 平移到 (x,y,z)
  //
  // ★ 之前多加了「叶尖小块」，但它的位置是按直线算的，
  //   而叶片已经倾斜旋转过，两者对不上 —— 结果尖端块飞在半空，
  //   看起来像散落的小方块。这里去掉尖端块，只用一整块。
  const g = box(wid * 0.85, 0.10, len, color, 0, 0, 0);
  g.translate(0, 0, len / 2);
  g.applyMatrix4(new THREE.Matrix4().makeRotationX(-tilt));
  g.applyMatrix4(new THREE.Matrix4().makeRotationY(ang));
  g.translate(x, y, z);
  part(parts, g);
}

// ===========================================================================
// A：向日葵
// ===========================================================================
export function makeSunflower(opts = {}) {
  const parts = [];
  const LOD = opts.lod || 1;
  const soilTop = 0x4a3524;
  const soilSide = 0x3a2818;
  const stem = 0x4a8a2a;
  const stemDark = 0x3a701e;
  const leafC = 0x5a9e34;
  const petal = 0xf0c818;
  const petalDark = 0xd8a808;
  const core = 0x6a4418;
  const coreDark = 0x4a2e10;

  addSoil(parts, 2.2, 0.32, soilTop, soilSide);
  const baseY = 0.36;

  // 四株向日葵（参考图是 4 株，高低错落）
  const plants = [
    { x: -0.55, z: 0.35, h: 2.10, face: 0.35 },
    { x: 0.60, z: 0.30, h: 2.30, face: -0.30 },
    { x: 0.10, z: -0.55, h: 1.95, face: 0.10 },
    { x: -0.35, z: -0.30, h: 2.20, face: 0.55 },
  ];

  const usePlants = Math.max(1, Math.round(plants.length * LOD));
  for (const pl of plants.slice(0, usePlants)) {
    const px = pl.x, pz = pl.z, ph = pl.h;

    // 茎（方柱，分 8 段，颜色交替做出节）
    const segs = 8;
    for (let i = 0; i < segs; i++) {
      const y = baseY + (ph * i) / segs;
      const col = i % 2 === 0 ? stem : stemDark;
      part(parts, box(0.16, ph / segs * 1.02, 0.16, col, px, y, pz));
    }

    // 叶片：4 片，分两层
    const leafPlan = [
      { y: 0.34, ang: pl.face + 1.2, len: 0.62, wid: 0.46 },
      { y: 0.34, ang: pl.face - 1.2, len: 0.58, wid: 0.44 },
      { y: 0.58, ang: pl.face + 2.6, len: 0.54, wid: 0.40 },
      { y: 0.58, ang: pl.face - 2.6, len: 0.50, wid: 0.38 },
    ];
    for (const lf of leafPlan) {
      addLeaf(parts, px, baseY + ph * lf.y, pz, lf.len, lf.wid, lf.ang, 0.72, leafC);
    }

    // 顶部：花盘 + 花瓣
    const fy = baseY + ph;
    const fa = pl.face;
    const fx = px + Math.sin(fa) * 0.10;
    const fz = pz + Math.cos(fa) * 0.10;

    // 花盘（深棕圆盘，用扁圆柱）
    const g = new THREE.CylinderGeometry(0.40, 0.40, 0.16, 12);
    g.rotateX(Math.PI / 2);
    g.rotateY(fa);
    g.translate(fx, fy, fz);
    part(parts, tint(g, core));
    // 花盘内圈（更深）
    const g2 = new THREE.CylinderGeometry(0.26, 0.26, 0.10, 10);
    g2.rotateX(Math.PI / 2);
    g2.rotateY(fa);
    g2.translate(fx + Math.sin(fa) * 0.06, fy, fz + Math.cos(fa) * 0.06);
    part(parts, tint(g2, coreDark));

    // 花瓣：12 片，绕花盘一圈
    const N = 12;
    for (let i = 0; i < N; i++) {
      const a = (i / N) * Math.PI * 2;
      const col = i % 2 === 0 ? petal : petalDark;
      // ★ 花瓣要从花盘【边缘】长出来，不能悬空：
      //   花盘半径 0.40，花瓣中心放在 0.40 + 0.13 = 0.53 处、
      //   且花瓣长度要盖住交界（0.26 长 → 一半在内一半在外）
      const rr = 0.40 + 0.04;   // 花瓣一半嵌进花盘，不留缝
      const g3 = box(0.19, 0.32, 0.10, col, 0, 0, 0);
      g3.translate(0, rr, 0);
      g3.applyMatrix4(new THREE.Matrix4().makeRotationZ(a));
      // 用 Y 旋转把整个花瓣环转到朝向 fa
      g3.applyMatrix4(new THREE.Matrix4().makeRotationY(fa));
      g3.translate(fx, fy, fz);
      part(parts, g3);
    }
  }

  return build(parts, 'cropSunflower');
}

// ===========================================================================
// B：胡萝卜
// ===========================================================================
export function makeCarrot(opts = {}) {
  const parts = [];
  const LOD = opts.lod || 1;
  const soilTop = 0x4a3524;
  const soilSide = 0x3a2818;
  const soilDark = 0x2e1e10;
  const carrot = 0xe87820;
  const carrotDark = 0xc85c10;
  const leafA = 0x3aa82e;
  const leafB = 0x2a8822;

  addSoil(parts, 2.1, 0.80, soilTop, soilSide);
  const topY = 0.90;

  // 四株胡萝卜（参考图是 2x2 布局）
  const spots = [
    { x: -0.58, z: -0.58, h: 1.35 },
    { x: 0.58, z: -0.58, h: 1.50 },
    { x: -0.58, z: 0.58, h: 1.42 },
    { x: 0.58, z: 0.58, h: 1.28 },
  ];

  for (const sp of spots) {
    const px = sp.x, pz = sp.z, ph = sp.h;

    // 萝卜根部：橙色方块，露出地面一截，下面埋在土里
    //   用 3 段递减的方块做锥形
    part(parts, box(0.36, 0.26, 0.36, carrot, px, topY - 0.10, pz));
    part(parts, box(0.28, 0.22, 0.28, carrotDark, px, topY - 0.32, pz));
    part(parts, box(0.20, 0.18, 0.20, carrotDark, px, topY - 0.50, pz));
    // 根须（2 根细条）
    part(parts, box(0.06, 0.16, 0.06, carrotDark, px + 0.10, topY - 0.62, pz - 0.06));
    part(parts, box(0.06, 0.14, 0.06, carrotDark, px - 0.08, topY - 0.58, pz + 0.08));

    // 羽状绿叶：5 根茎 + 每根上的小叶片
    const stems = Math.max(2, Math.round(4 * LOD));
    for (let i = 0; i < stems; i++) {
      const a = (i / stems) * Math.PI * 2 + 0.3;
      const lean = 0.22 + (i % 2) * 0.10;
      const sh = ph * (0.82 + (i % 3) * 0.06);
      const col = i % 2 === 0 ? leafA : leafB;

      // 主茎（分段上升，带外倾）
      const n = 5;
      for (let k = 0; k < n; k++) {
        const t = k / n;
        const y = topY + sh * t;
        const ox = Math.cos(a) * lean * t * sh;
        const oz = Math.sin(a) * lean * t * sh;
        part(parts, box(0.07, sh / n * 1.05, 0.07, col, px + ox, y, pz + oz));
        // 茎两侧的羽状小叶（每段 2 片）
        if (k >= 1) {
          // ★ 羽状小叶：只在外侧两段出现，且尺寸缩小，避免叶片挤成一团
          for (const sgn of [-1, 1]) {
            const la = a + sgn * 1.4;
            const g = box(0.15, 0.06, 0.08, col, 0, 0, 0);
            g.translate(0, y + sh / n * 0.5, 0);
            g.applyMatrix4(new THREE.Matrix4().makeRotationY(la));
            g.translate(px + ox, 0, pz + oz);
            part(parts, g);
          }
        }
      }
    }
  }

  return build(parts, 'cropCarrot');
}

// ===========================================================================
// C：南瓜
// ===========================================================================
export function makePumpkin(opts = {}) {
  const parts = [];
  const LOD = opts.lod || 1;
  const soilTop = 0x4a3524;
  const soilSide = 0x3a2818;
  const pump = 0xe88418;
  const pumpDark = 0xc86608;
  const pumpLight = 0xf09c30;
  const stemC = 0x6a8a3a;
  const stemDark = 0x4a6a28;

  addSoil(parts, 2.5, 0.26, soilTop, soilSide);
  const baseY = 0.30;

  // 南瓜主体：分层叠方块做出圆球（8 层 x 9 x 9）
  const R = 1.00;
  // ★ cell 越大，方块越少（LOD 低时用大格子）
  // ★ LOD 低时用大格子，但不要太大（0.60 会让南瓜变成几个大方块）
  //   0.52 → cell 0.385，方块更小、球面更圆，同时顶点仍然可控（~1200/丛）
  const cell = 0.20 / Math.max(0.52, LOD);
  const cy = baseY + R * 0.86;
  const n = Math.ceil(R / cell);
  for (let iy = -n; iy <= n; iy++) {
    for (let ix = -n; ix <= n; ix++) {
      for (let iz = -n; iz <= n; iz++) {
        const px = ix * cell, py = iy * cell, pz = iz * cell;
        // 南瓜是扁球（Y 方向压扁 0.82）
        const d = Math.sqrt(px * px + (py / 0.82) * (py / 0.82) + pz * pz);
        if (d > R) continue;
        // 挖空内部
        if (d < R * 0.62) continue;
        // 南瓜瓣：按角度分瓣（LOD 低时减到 4 瓣）
        const nSect = Math.max(2, Math.round(8 * LOD));
        const ang = Math.atan2(pz, px);
        const sect = Math.floor(((ang + Math.PI) / (Math.PI * 2)) * nSect) % 2;
        const col = sect === 0 ? pump : pumpDark;
        part(parts, box(cell, cell, cell, col, px, cy + py, pz));
      }
    }
  }
  // ★ 顶部高光块已删除 ——
  //   原来在南瓜顶上另铺了 5 块浅色方块，位置在球面【外面】，
  //   看起来像南瓜顶上摞了一个小台阶，和球面不贴合。
  //   现在直接用球体本身的分瓣明暗表现体积，顶部干净。


  // 瓜蒂（弯折的绿色方柱）
  //   ★ 尺寸整体缩小 ~30%：原来的蒂又粗又高，像南瓜上插了一根绿棒子。
  const sy = cy + R * 0.84;
  part(parts, box(0.16, 0.20, 0.16, stemC, 0, sy, 0));
  part(parts, box(0.14, 0.16, 0.14, stemDark, 0.07, sy + 0.20, 0));
  part(parts, box(0.13, 0.14, 0.22, stemC, 0.14, sy + 0.34, 0.04));
  part(parts, box(0.12, 0.12, 0.12, stemDark, 0.22, sy + 0.46, 0.08));

  // ★ 藤蔓已删除 ——
  //   原来南瓜周身散着一圈 0.10 的小绿方块（藤蔓段）和 0.16 的小黄方块（藤末端的黄花），
  //   远看像南瓜边上撒了一把碎块，很脏。
  //   现在只保留南瓜本体 + 瓜蒂，体块干净。

  return build(parts, 'cropPumpkin');
}

// ===========================================================================
// D：小麦
// ===========================================================================
// ===========================================================================
// D：小麦（按参考图重做：胖麦穗 + 弯曲茎秆）
//
// 参考图特征：
//   - 麦穗【大而饱满】，是带凹凸纹理的胖椭圆（不是细杆）
//   - 茎秆【弯曲】，越往上越向外倾
//   - 细长的刀形叶从根部弧形伸出
//   - 四角有小绿杂草
// ===========================================================================
export function makeWheat(opts = {}) {
  const parts = [];
  // lod：株数（田地用低配版）
  const LOD = opts.lod || 1;
  const soilTop = 0x4a3524;
  const soilSide = 0x3a2818;
  const stalk = 0xd8c078;
  const stalkDark = 0xc4a860;
  const earA = 0xe8d494;
  const earB = 0xd4bc6c;
  const green = 0x4a9a2a;
  const greenDark = 0x3a7a1e;

  addSoil(parts, 2.1, 0.28, soilTop, soilSide);
  const baseY = 0.28;

  const N = Math.max(3, Math.round(9 * LOD));
  for (let i = 0; i < N; i++) {
    const a = (i / N) * Math.PI * 2 + 0.25;
    const r0 = 0.12 + (i % 3) * 0.19;
    const x0 = Math.cos(a) * r0;
    const z0 = Math.sin(a) * r0;
    const h = 1.85 + (i % 4) * 0.20;
    const lean = 0.13 + (i % 3) * 0.07;
    const dirX = Math.cos(a), dirZ = Math.sin(a);

    // ---- 茎秆：沿二次曲线向外弯 ----
    //   ★ 每段用「两点之间的斜置方块」连接，不能只堆水平方块
    //     （堆叠会在弯折处留下缝隙，看起来像断开的一节节）
    // ★ LOD 低时减少茎秆分段（7 → 4），顶点降 43%
    const SEG = Math.max(3, Math.round(7 * LOD));
    let px = x0, py = baseY, pz = z0;
    for (let k = 1; k <= SEG; k++) {
      const t = k / SEG;
      const bend = lean * t * t * h;
      const nx = x0 + dirX * bend;
      const nz = z0 + dirZ * bend;
      const ny = baseY + h * t;
      const dx = nx - px, dy = ny - py, dz = nz - pz;
      const segLen = Math.hypot(dx, dy, dz);
      const g = box(0.078, segLen * 1.06, 0.078, k % 2 ? stalk : stalkDark, 0, 0, 0);
      // 默认沿 +Y，转到目标方向
      const q = new THREE.Quaternion();
      const dir = new THREE.Vector3(dx, dy, dz).normalize();
      q.setFromUnitVectors(new THREE.Vector3(0, 1, 0), dir);
      g.applyMatrix4(new THREE.Matrix4().makeRotationFromQuaternion(q));
      g.translate((px + nx) / 2, (py + ny) / 2, (pz + nz) / 2);
      part(parts, g);
      px = nx; py = ny; pz = nz;
    }

    // ---- 麦穗：胖椭圆，用错位方块堆出凹凸 ----
    // 麦穗从茎顶【略下方】开始，避免出现缝
    py -= 0.04;
    const earLen = 0.92 + (i % 3) * 0.10;
    // ★ LOD 低时减少麦穗层级（11 → 6），并且不再加凸起
    const LV = Math.max(4, Math.round(11 * LOD));
    for (let k = 0; k < LV; k++) {
      const t = k / (LV - 1);
      // 椭圆轮廓：中间最宽、两头收窄
      const w = 0.30 * Math.sin(Math.PI * (0.12 + t * 0.80));
      const y = py + earLen * t;
      const col = k % 2 === 0 ? earA : earB;
      // 主块
      part(parts, box(w, (earLen / LV) * 1.15, w, col, px, y, pz));
      // 错位凸起（LOD 低时省略，省一半顶点）
      if (LOD >= 0.6) {
        const bump = w * 0.52;
        if (k % 2 === 0) {
          part(parts, box(bump, 0.07, bump, earB, px + w * 0.42, y + 0.02, pz));
        } else {
          part(parts, box(bump, 0.07, bump, earB, px, y + 0.02, pz + w * 0.42));
        }
      }
    }

    // ---- 根部刀形叶（弧形伸出，2 片）----
    for (const sgn of [-1, 1]) {
      const la = a + sgn * 1.25;
      const ldx = Math.cos(la), ldz = Math.sin(la);
      const lsegs = Math.max(1, Math.round(3 * LOD));
      for (let k = 0; k < lsegs; k++) {
        const t = (k + 0.5) / lsegs;
        const d = 0.38 * t;
        const yy = baseY + 0.06 + 0.16 * Math.sin(Math.PI * t);
        const lw = 0.14 * (1 - t * 0.5);
        part(parts, box(lw, 0.06, 0.16, k % 2 ? green : greenDark,
          x0 + ldx * d, yy, z0 + ldz * d));
      }
    }
  }

  // ---- 四角杂草 ----
  for (const [sx, sz] of [[-1, -1], [1, -1], [-1, 1], [1, 1]]) {
    const bx = sx * 0.80, bz = sz * 0.80;
    part(parts, box(0.09, 0.30, 0.09, green, bx, baseY, bz));
    part(parts, box(0.18, 0.07, 0.09, greenDark, bx + sx * 0.06, baseY + 0.18, bz));
    part(parts, box(0.09, 0.07, 0.16, greenDark, bx, baseY + 0.10, bz + sz * 0.06));
  }

  return build(parts, 'cropWheat');
}


// ===========================================================================
// E：玉米
// ===========================================================================
// ===========================================================================
// E：玉米（按参考图重做：拱起下垂的飘带叶）
//
// 参考图特征：
//   - 叶片是【拱起后下垂的飘带】，不是平板直伸
//   - 叶片宽、有厚度、末端收窄
//   - 玉米棒浅黄，被绿色苞叶半包
//   - 顶部有雄穗
// ===========================================================================
// 玉米叶：沿曲线摆放方块，形成「先拱起、后下垂」的飘带
//   arch  拱起高度    droop 下垂量    len 水平伸出长度
function addRibbonLeaf(parts, x, y, z, ang, len, wid, arch, droop, color) {
  // 玉米叶：沿「拱起后下垂」的曲线摆放，形成飘带
  //
  // ★ 关键：每一段必须【连接曲线上的相邻两点】，用两点间的方向旋转方块。
  //   之前每段都是水平方块、只改位置不改朝向 —— 段与段之间有空隙，
  //   渲染出来就是一堆散落的小方块，完全不像叶子。
  const SEG = 5;
  const dirX = Math.cos(ang), dirZ = Math.sin(ang);

  // 采样曲线上的点
  const pts = [];
  for (let k = 0; k <= SEG; k++) {
    const t = k / SEG;
    const d = len * t;
    const yy = y + arch * Math.sin(Math.PI * t) - droop * t * t;
    pts.push(new THREE.Vector3(x + dirX * d, yy, z + dirZ * d));
  }

  // 逐段连接（斜置方块 + 四元数对齐）
  for (let k = 0; k < SEG; k++) {
    const a = pts[k], b = pts[k + 1];
    const dx = b.x - a.x, dy = b.y - a.y, dz = b.z - a.z;
    const segLen = Math.hypot(dx, dy, dz);
    if (segLen < 1e-4) continue;
    const tm = (k + 0.5) / SEG;
    // ★ 宽度只在最后 1/3 收窄，前面保持等宽 ——
    //   每段都收窄会造成明显的台阶错位，看起来像一节节断开
    const w = wid * (tm < 0.66 ? 1.0 : 1.0 - ((tm - 0.66) / 0.34) * 0.45);
    const g = box(w, 0.11, segLen * 1.10, color, 0, 0, 0);
    const q = new THREE.Quaternion();
    q.setFromUnitVectors(new THREE.Vector3(0, 1, 0),
      new THREE.Vector3(dx, dy, dz).normalize());
    g.applyMatrix4(new THREE.Matrix4().makeRotationFromQuaternion(q));
    g.translate((a.x + b.x) / 2, (a.y + b.y) / 2, (a.z + b.z) / 2);
    part(parts, g);
  }
}

export function makeCorn(opts = {}) {
  const parts = [];
  const LOD = opts.lod || 1;
  const soilTop = 0x4a3524;
  const soilSide = 0x3a2818;
  const stalk = 0x3a9a26;
  const stalkDark = 0x2e801c;
  const leafA = 0x44a82c;
  const leafB = 0x369420;
  const cobA = 0xf0d888;
  const cobB = 0xdcc070;
  const husk = 0x9aac44;

  addSoil(parts, 2.3, 0.26, soilTop, soilSide);
  const baseY = 0.26;

  const plants = [
    { x: -0.42, z: 0.08, h: 3.20 },
    { x: 0.48, z: -0.06, h: 3.45 },
  ];

  const usePlants = Math.max(1, Math.round(plants.length * LOD));
  for (const pl of plants.slice(0, usePlants)) {
    const px = pl.x, pz = pl.z, ph = pl.h;

    // 主秆：分段，颜色交替做出节
    const segs = 11;
    for (let i = 0; i < segs; i++) {
      const y = baseY + (ph * i) / segs;
      const col = i % 2 === 0 ? stalk : stalkDark;
      part(parts, box(0.15, (ph / segs) * 1.04, 0.15, col, px, y, pz));
    }

    // 叶片：4 层，左右交替，拱起后下垂
    const levels = [0.26, 0.44, 0.60, 0.76];
    for (let li = 0; li < levels.length; li++) {
      const ly = baseY + ph * levels[li];
      const ang = li * 2.4 + (pl.x > 0 ? 0.5 : 0);
      const col = li % 2 === 0 ? leafA : leafB;
      const len = 1.02 - li * 0.10;
      const arch = 0.22 - li * 0.02;
      const droop = 0.30 + li * 0.03;
      const ox = Math.cos(ang) * 0.07;
      const oz = Math.sin(ang) * 0.07;
      addRibbonLeaf(parts, px + ox, ly, pz + oz, ang, len, 0.26, arch, droop, col);
    }

    // 玉米棒：2 个，长在叶腋
    const cobs = [
      { y: 0.42, ang: 0.5 },
      { y: 0.55, ang: 3.4 },
    ];
    for (const cb of cobs) {
      const cy2 = baseY + ph * cb.y;
      const cdx = Math.cos(cb.ang), cdz = Math.sin(cb.ang);
      const cx2 = px + cdx * 0.22;
      const cz2 = pz + cdz * 0.22;

      // 玉米粒：中间粗两头细
      const LV = 8;
      for (let k = 0; k < LV; k++) {
        const t = k / (LV - 1);
        const w = 0.20 * Math.sin(Math.PI * (0.18 + t * 0.72));
        const col = k % 2 === 0 ? cobA : cobB;
        part(parts, box(w, 0.075, w, col, cx2, cy2 + t * 0.58, cz2));
      }

      // 苞叶：两片绿皮从下方包上来
      for (const sgn of [-1, 1]) {
        const ox = -cdz * sgn * 0.13;
        const oz = cdx * sgn * 0.13;
        part(parts, box(0.11, 0.34, 0.11, husk, cx2 + ox, cy2 - 0.04, cz2 + oz));
        part(parts, box(0.11, 0.24, 0.11, husk, cx2 + ox * 0.7, cy2 + 0.30, cz2 + oz * 0.7));
      }
      part(parts, box(0.26, 0.10, 0.26, husk, cx2, cy2 - 0.10, cz2));
    }

    // ---- 顶部：叶片继续向上，形成 V 字形 ----
    // 参考图里玉米顶部没有雄穗，而是几片叶子从茎顶继续向上分叉
    const ty = baseY + ph;
    part(parts, box(0.13, 0.30, 0.13, stalk, px, ty, pz));

    // 参考图顶部是【2 片叶子左右分叉】形成 V 字，不要挤成一团
    const topLeaves = [
      { ang: 0.55, len: 0.82, arch: 0.26, droop: 0.14 },
      { ang: 3.70, len: 0.76, arch: 0.24, droop: 0.12 },
    ];
    for (let i = 0; i < topLeaves.length; i++) {
      const tl = topLeaves[i];
      const col = i % 2 === 0 ? leafA : leafB;
      // droop 为负 = 向上翘（叶片往上长）
      addRibbonLeaf(parts, px, ty + 0.24, pz, tl.ang, tl.len, 0.22,
        tl.arch, tl.droop, col);
    }
  }

  return build(parts, 'cropCorn');
}

// ===========================================================================
// F: Watermelon (reference: 4 striped melons + vines + yellow flowers)
//
// Key features from reference:
//   - Melons are striped: alternating dark/light green vertical bands
//   - 4 melons arranged on a soil block
//   - Vines crawl on the soil with small leaves
//   - Small yellow flowers
// ===========================================================================
export function makeWatermelon(opts = {}) {
  const parts = [];
  const LOD = opts.lod || 1;
  const soilTop = 0x4a3524;
  const soilSide = 0x3a2818;
  const rindDark = 0x1e5a12;
  const rindLight = 0x62b834;
  const leafC = 0x3a8a22;
  const leafD = 0x2e7018;
  const vineC = 0x3a7a1e;
  const flowerC = 0xe8d040;

  addSoil(parts, 3.0, 0.30, soilTop, soilSide);
  const baseY = 0.30;

  // ---- Melons: 4, arranged 2x2 with slight offsets ----
  // ★ 4 个西瓜必须【拉开距离】，否则会挤成一团看不出圆形
  //   土块 3.0 宽 → 半径 1.5，西瓜半径 0.45，所以中心距要 >= 1.05
  const melons = [
    { x: -0.62, z: -0.62, r: 0.44 },
    { x: 0.62, z: -0.58, r: 0.42 },
    { x: -0.58, z: 0.64, r: 0.42 },
    { x: 0.66, z: 0.60, r: 0.45 },
  ];
  // ★ LOD 低时用大格子，顶点大幅减少
  const cell = 0.10 / Math.max(0.5, LOD);
  const useMelons = Math.max(1, Math.round(melons.length * LOD));
  for (const m of melons.slice(0, useMelons)) {
    // ★ 西瓜接近正球（参考图里是圆的），只压扁一点点
    const cy = baseY + m.r;   // ★ 中心正好在半径高度，球体完整贴地
    const n = Math.ceil(m.r / cell);
    for (let iy = -n; iy <= n; iy++) {
      for (let ix = -n; ix <= n; ix++) {
        for (let iz = -n; iz <= n; iz++) {
          const px = ix * cell, py = iy * cell, pz = iz * cell;
          const d = Math.sqrt(px * px + (py / 0.98) * (py / 0.98) + pz * pz);
          if (d > m.r) continue;
          // hollow shell (cheaper + looks like surface)
          if (d < m.r * 0.80) continue;
          // ---- stripes: vertical bands by angle ----
          // ★ 条纹要【竖直】—— 按 X 坐标分带（不是按角度），
          //   这样从侧面看是竖条纹，和参考图一致。
          //   按角度分带会让条纹沿着球面绕，看起来是横纹。
          // 条纹带：横向分 12 带，深/浅交替（更接近真实西瓜）
          const band = Math.floor((px / m.r + 1) * 6) % 2;
          const col = band === 0 ? rindDark : rindLight;
          part(parts, box(cell, cell, cell, col, m.x + px, cy + py, m.z + pz));
        }
      }
    }
  }

  // ---- Vines on the soil ----
  const vines = [
    { a: 0.4, len: 0.95 },
    { a: 2.1, len: 1.05 },
    { a: 3.6, len: 0.85 },
    { a: 5.2, len: 1.00 },
  ];
  for (const v of vines) {
    const N = 6;
    for (let k = 0; k < N; k++) {
      const t = (k + 0.5) / N;
      const r = 0.55 + v.len * t;
      const wob = Math.sin(t * 4.2) * 0.10;
      const vx = Math.cos(v.a) * r - Math.sin(v.a) * wob;
      const vz = Math.sin(v.a) * r + Math.cos(v.a) * wob;
      part(parts, box(0.09, 0.09, 0.09, vineC, vx, baseY + 0.04, vz));
      // leaf pairs every 2 segments
      if (k % 2 === 1) {
        for (const sgn of [-1, 1]) {
          const la = v.a + sgn * 1.5;
          part(parts, box(0.22, 0.07, 0.14, k % 4 === 1 ? leafC : leafD,
            vx + Math.cos(la) * 0.12, baseY + 0.07, vz + Math.sin(la) * 0.12));
        }
      }
    }
  }

  // ---- Yellow flowers (4, fixed positions) ----
  for (const [fx, fz] of [[-1.05, 0.20], [0.95, 0.75], [-0.20, -1.00], [1.10, -0.55]]) {
    part(parts, box(0.16, 0.10, 0.16, flowerC, fx, baseY + 0.06, fz));
    part(parts, box(0.08, 0.08, 0.08, 0xf0e070, fx, baseY + 0.14, fz));
  }

  // ---- Curls (small spiral tendrils) ----
  for (const [cx2, cz2, ca] of [[-1.15, -0.85, 0.8], [1.20, 0.30, 3.9]]) {
    for (let k = 0; k < 4; k++) {
      const t = k / 4;
      const rr = 0.14 * (1 - t * 0.5);
      const aa = ca + t * 3.4;
      part(parts, box(0.07, 0.07, 0.07, vineC,
        cx2 + Math.cos(aa) * rr, baseY + 0.05 + t * 0.10, cz2 + Math.sin(aa) * rr));
    }
  }

  return build(parts, 'cropWatermelon');
}

// ===========================================================================
// G: Apple tree (reference: bushy tree loaded with red apples)
//
// Key features from reference:
//   - Multi-trunk base (several trunks from one root)
//   - Dense bushy green canopy made of small blocks
//   - Many red apples hanging on the canopy
//   - Fallen apples + small green sprouts on the soil
// ===========================================================================
export function makeAppleTree() {
  const parts = [];
  const soilTop = 0x4a3524;
  const soilSide = 0x3a2818;
  const bark = 0x6a4a30;
  const barkDark = 0x503620;
  const leafA = 0x4a9a28;
  const leafB = 0x3a801e;
  const leafC = 0x5aaa30;
  const apple = 0xd82e1e;
  const appleDark = 0xb01e10;
  const sprout = 0x5aaa3a;

  addSoil(parts, 3.2, 0.32, soilTop, soilSide);
  const baseY = 0.32;

  // ---- Root flare + 3 trunks ----
  part(parts, box(0.80, 0.28, 0.80, barkDark, 0, baseY, 0));
  const trunks = [
    { a: 0.0, lean: 0.10, h: 1.05 },
    { a: 2.1, lean: 0.22, h: 0.95 },
    { a: 4.2, lean: 0.20, h: 0.90 },
  ];
  for (const tr of trunks) {
    const SEG = 4;
    let px = 0, pz = 0, py = baseY + 0.24;
    for (let k = 1; k <= SEG; k++) {
      const t = k / SEG;
      const nx = Math.cos(tr.a) * tr.lean * t * t * 2.2;
      const nz = Math.sin(tr.a) * tr.lean * t * t * 2.2;
      const ny = py + tr.h / SEG;
      const g = box(0.24 - t * 0.06, Math.hypot(nx - px, ny - py, nz - pz) * 1.10,
        0.24 - t * 0.06, bark, 0, 0, 0);
      const q = new THREE.Quaternion();
      q.setFromUnitVectors(new THREE.Vector3(0, 1, 0),
        new THREE.Vector3(nx - px, ny - py, nz - pz).normalize());
      g.applyMatrix4(new THREE.Matrix4().makeRotationFromQuaternion(q));
      g.translate((px + nx) / 2, (py + ny) / 2, (pz + nz) / 2);
      part(parts, g);
      px = nx; py = ny; pz = nz;
    }
  }

  // ---- Canopy: 7 spheres of small blocks (bushy) ----
  const canopy = [
    { x: 0.00, y: 2.45, z: 0.00, r: 1.05 },
    { x: 1.20, y: 2.15, z: 0.35, r: 0.85 },
    { x: -1.15, y: 2.20, z: -0.30, r: 0.82 },
    { x: 0.30, y: 2.10, z: 1.20, r: 0.80 },
    { x: -0.35, y: 2.15, z: -1.15, r: 0.78 },
    { x: 0.15, y: 3.15, z: 0.10, r: 0.72 },
    { x: -0.85, y: 2.95, z: 0.75, r: 0.62 },
  ];
  const lc = 0.19;
  for (let ci = 0; ci < canopy.length; ci++) {
    const cl = canopy[ci];
    const n = Math.ceil(cl.r / lc);
    for (let ix = -n; ix <= n; ix++) {
      for (let iy = -n; iy <= n; iy++) {
        for (let iz = -n; iz <= n; iz++) {
          const px = ix * lc, py = iy * lc, pz = iz * lc;
          const d = Math.sqrt(px * px + py * py + pz * pz);
          if (d > cl.r) continue;
          // hollow shell
          if (d < cl.r * 0.55) continue;
          // colour varies by height for volume
          const t = (py + cl.r) / (cl.r * 2);
          const col = t > 0.62 ? leafC : (t > 0.30 ? leafA : leafB);
          part(parts, box(lc, lc, lc, col, cl.x + px, baseY + cl.y + py, cl.z + pz));
        }
      }
    }
  }

  // ---- Apples: fixed positions on the canopy surface ----
  //   Each apple is a small cluster (2x2x2 blocks) to read as a sphere
  // ★ 苹果必须挂在树冠【外表面】才看得见。
  //   之前的位置大多在树冠内部，被叶子完全挡住，只露出 2~3 个。
  //   现在全部沿半径方向外移，并加大尺寸。
  const apples = [
    { x: 1.30, y: 2.40, z: 0.70, s: 1.30 },
    { x: -1.25, y: 2.45, z: -0.75, s: 1.30 },
    { x: 0.20, y: 2.85, z: 1.45, s: 1.20 },
    { x: -1.70, y: 2.25, z: 0.55, s: 1.15 },
    { x: 1.75, y: 2.10, z: -0.45, s: 1.15 },
    { x: 0.60, y: 2.05, z: -1.60, s: 1.15 },
    { x: -0.55, y: 3.55, z: 0.25, s: 1.10 },
    { x: 0.95, y: 3.20, z: -0.75, s: 1.05 },
    { x: -1.25, y: 3.15, z: 1.15, s: 1.05 },
    { x: 0.35, y: 2.00, z: 1.85, s: 1.10 },
    { x: -1.90, y: 2.75, z: -0.30, s: 1.00 },
    { x: 1.90, y: 2.80, z: 0.45, s: 1.00 },
    { x: 1.05, y: 2.60, z: 1.30, s: 1.00 },
    { x: -1.10, y: 2.55, z: -1.45, s: 1.00 },
  ];
  const ac = 0.115;   // apple cell size
  for (const ap of apples) {
    const rr = ac * 2.0 * ap.s;
    // 3x3x3 minus corners = small ball
    for (let ix = -1; ix <= 1; ix++) {
      for (let iy = -1; iy <= 1; iy++) {
        for (let iz = -1; iz <= 1; iz++) {
          // skip the 8 corners to round it
          const corners = Math.abs(ix) + Math.abs(iy) + Math.abs(iz);
          if (corners === 3) continue;
          const col = (iy === -1) ? appleDark : apple;
          part(parts, box(ac * ap.s * 1.05, ac * ap.s * 1.05, ac * ap.s * 1.05, col,
            ap.x + ix * ac * ap.s, baseY + ap.y + iy * ac * ap.s, ap.z + iz * ac * ap.s));
        }
      }
    }
  }

  // ---- Fallen apples on the soil ----
  const fallen = [[-1.15, 1.05], [0.55, 1.30], [-0.60, 1.25], [1.20, -0.95], [-1.30, -0.55]];
  for (const [fx, fz] of fallen) {
    part(parts, box(0.24, 0.22, 0.24, apple, fx, baseY + 0.02, fz));
    part(parts, box(0.16, 0.10, 0.16, appleDark, fx, baseY + 0.22, fz));
  }

  // ---- Small green sprouts scattered on the soil ----
  const sprouts = [[-0.30, 1.40], [0.90, 0.85], [-1.40, 0.20], [0.20, -1.35], [1.40, 0.60]];
  for (const [sx, sz] of sprouts) {
    part(parts, box(0.10, 0.16, 0.10, sprout, sx, baseY, sz));
    part(parts, box(0.16, 0.07, 0.07, sprout, sx + 0.05, baseY + 0.10, sz));
  }

  return build(parts, 'cropAppleTree');
}
