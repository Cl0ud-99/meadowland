// ---------------------------------------------------------------------------
// 五个风车 demo —— 按用户提供的五张参考图
//
// A  现代风力发电机：锥形塔筒 + 3 片细长叶片 + 机舱
// B  地中海帆布风车：石砌圆塔 + 8 片三角帆布 + 蓝色洋葱顶 + 藤蔓
// C  美式牧场风车：钢桁架塔 + 多扇叶 + 风向尾翼
// D  红砖风车：砖砌塔身 + 石基 + 4 片格栅叶片 + 灰瓦顶
// E  糖果风车：粉棕分层 + 糖霜滴落 + 棒棒糖 + 彩色叶片
// ---------------------------------------------------------------------------
import * as THREE from '../../vendor/three/three.module.js';
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

// 把一个几何绕 Z 轴旋转后加进数组（用于叶片）
function rotZ(geo, ang) {
  geo.applyMatrix4(new THREE.Matrix4().makeRotationZ(ang));
  return geo;
}

// ===========================================================================
// A：现代风力发电机
// ===========================================================================
export function makeModernTurbine() {
  const parts = [];
  const details = [];
  const H = 18;
  const white = 0xf0f2f4;
  const whiteDark = 0xd8dce0;
  const grey = 0xa8aeb4;

  // 塔筒：三段锥筒（参考图里塔身分三段，越往上越细）
  part(parts, cyl(0.95, 1.25, H * 0.36, 14, white, 0, 0, 0));
  part(parts, cyl(0.78, 0.95, H * 0.34, 14, white, 0, H * 0.36, 0));
  part(parts, cyl(0.62, 0.78, H * 0.32, 14, white, 0, H * 0.70, 0));
  // 分段接缝
  part(details, cyl(1.27, 1.27, 0.18, 14, grey, 0, H * 0.36 - 0.09, 0));
  part(details, cyl(0.97, 0.97, 0.15, 14, grey, 0, H * 0.70 - 0.07, 0));
  // 底部基座
  part(parts, cyl(1.55, 1.75, 0.55, 16, whiteDark, 0, 0, 0));

  // 机舱（横向椭圆壳）
  const nacY = H + 0.42;
  {
    const g = new THREE.SphereGeometry(0.85, 14, 10);
    g.scale(1.0, 0.82, 1.65);
    g.translate(0, nacY, -0.25);
    part(parts, tint(g, white));
  }
  // 机舱尾部小突起
  part(parts, box(0.55, 0.42, 0.75, whiteDark, 0, nacY + 0.55, -0.9));
  // 机舱顶部小鳍
  part(parts, box(0.12, 0.42, 0.55, grey, 0, nacY + 0.78, -0.35));

  // 轮毂
  part(parts, cyl(0.42, 0.48, 0.55, 10, whiteDark, 0, nacY, 1.05));
  {
    const g = new THREE.SphereGeometry(0.46, 12, 8);
    g.translate(0, nacY, 1.32);
    part(parts, tint(g, white));
  }

  return build(parts, details, 'windModern');
}

// 现代风机的 3 片叶片（单独返回，供旋转）
export function makeModernBlades() {
  const parts = [];
  const white = 0xf4f6f8;
  const N = 3;
  // ★ 现代风机的叶片是【三角形】：根部宽、向叶尖渐窄成一点。
  //
  //   关键：必须做成【封闭实体】，不能是两张单面片。
  //   之前只用正反两片三角面，四个侧面全空 ——
  //   自定义 BufferGeometry 没有正确的法线/封闭体积，
  //   结果是：光照发灰（法线丢）、投影不完整（阴影丢）。
  //   现在用 6 个面的三角棱柱，法线和阴影都正常。
  for (let i = 0; i < N; i++) {
    const a = (i / N) * Math.PI * 2 + Math.PI / 2;
    const rBase = 0.55;         // 根部起始半径
    const rTip = 7.4;           // 叶尖半径
    const wRoot = 0.62;         // 根部半宽
    const wTip = 0.06;          // 叶尖半宽（几乎收成一点）
    const th = 0.16;            // 叶片厚度

    // 8 个顶点：前后两面各 4 个
    //   0/1 根部左右(前)  2/3 尖端左右(前)
    //   4/5 根部左右(后)  6/7 尖端左右(后)
    const V = [
      [-wRoot, rBase, th / 2], [wRoot, rBase, th / 2],
      [wTip, rTip, th / 2], [-wTip, rTip, th / 2],
      [-wRoot, rBase, -th / 2], [wRoot, rBase, -th / 2],
      [wTip, rTip, -th / 2], [-wTip, rTip, -th / 2],
    ];
    // 6 个面（每面 2 个三角），全部朝外
    const faces = [
      [0, 1, 2], [0, 2, 3],   // 正面
      [5, 4, 7], [5, 7, 6],   // 背面
      [1, 5, 6], [1, 6, 2],   // 右侧
      [4, 0, 3], [4, 3, 7],   // 左侧
      [4, 5, 1], [4, 1, 0],   // 根部
      [3, 2, 6], [3, 6, 7],   // 尖端
    ];
    const pos = [];
    for (const tri of faces) {
      for (const idx of tri) pos.push(V[idx][0], V[idx][1], V[idx][2]);
    }
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.BufferAttribute(new Float32Array(pos), 3));
    g.computeVertexNormals();
    rotZ(g, a);
    part(parts, tint(g, white));
  }

  const m = meshFrom(parts, { castShadow: true });
  m.name = 'windModernBlades';
  return m;
}

// ===========================================================================
// B：地中海帆布风车
// ===========================================================================
export function makeMediterraneanMill() {
  const parts = [];
  const details = [];
  const H = 6.4, R = 2.5;
  const stone = 0xe0dcd2;
  const stoneDark = 0xc4bfb2;
  const blue = 0x3a6ec4;
  const blueDark = 0x2a5498;
  const wood = 0x8a5a34;
  const canvas = 0xf6f2e8;
  const green = 0x4a8a3a;
  const red = 0xc03a2a;

  // 圆形石塔（上窄下宽）
  part(parts, cyl(R * 0.92, R * 1.06, H, 12, stone, 0, 0, 0));
  // 横向石缝（保留，让塔身有层次；竖向错缝已删除）
  for (let i = 1; i < 5; i++) {
    const t = i / 5;
    const rr = R * (1.06 + (0.92 - 1.06) * t) + 0.015;
    part(details, cyl(rr, rr, 0.09, 12, stoneDark, 0, t * H, 0));
  }
  // 塔顶收口
  part(parts, cyl(R * 0.96, R * 0.92, 0.30, 12, stoneDark, 0, H, 0));

  // 蓝色洋葱顶（球 + 尖）
  {
    // ★ 洋葱顶要【高出塔身足够多】，否则被前方帆布完全遮挡。
    //   帆布半径 R*0.96 = 3.74，球心高度 H+0.30+R*0.62 = 9.1，
    //   球顶约 11.5，帆布上沿约 7.2+3.9 = 11.1 —— 高度接近，会互相遮挡。
    //   把球抬高、加大，让它在帆布上方露出来（参考图里洋葱顶非常显眼）。
    const g = new THREE.SphereGeometry(R * 0.86, 16, 12);
    g.scale(1.0, 1.22, 1.0);
    g.translate(0, H + 0.30 + R * 0.92, 0);
    part(parts, tint(g, blue));
    // 洋葱顶分片纹：用【垂直方向的短弧段】，贴着球面走
    //   （之前用一根 R*1.35 高的竖条，远超球体高度，变成 8 根天线）
    {
      const domeR = R * 0.86;
      const cy = H + 0.30 + R * 0.92;
      const SEG = 4;
      for (let i = 0; i < 8; i++) {
        const a = (i / 8) * Math.PI * 2;
        for (let k = 0; k < SEG; k++) {
          // 极角从下往上
          const th0 = (k / SEG) * (Math.PI / 2);
          const th1 = ((k + 1) / SEG) * (Math.PI / 2);
          const y0 = cy + domeR * Math.sin(th0);
          const y1 = cy + domeR * Math.sin(th1);
          const r0 = domeR * Math.cos(th0) * 0.96;
          const r1 = domeR * Math.cos(th1) * 0.96;
          part(details, box(0.09, Math.abs(y1 - y0) + 0.06, 0.09, blueDark,
            Math.cos(a) * (r0 + r1) / 2, Math.min(y0, y1), Math.sin(a) * (r0 + r1) / 2));
        }
      }
    }
  }
  // 洋葱顶尖（紧贴球顶，不要太远）
  part(parts, cone(R * 0.26, 0.62, 10, blueDark, 0, H + 0.30 + R * 1.28, 0));

  // （木门与门框石券已按用户要求删除，塔身保持纯石面）

  // （藤蔓、红果、地面草丛已按用户要求删除，保持塔身干净）

  return build(parts, details, 'windMediterranean');
}

// 地中海风车的 8 片帆布叶
export function makeMediterraneanSails() {
  const parts = [];
  const details = [];
  const wood = 0x8a5a34;
  const canvas = 0xf6f2e8;
  const N = 8, R = 3.9;

  // 中心轮毂
  part(parts, cyl(0.30, 0.30, 0.55, 8, wood, 0, -0.275, 0));

  // ★ 帆布用【扇形薄片】：每片占 1/8 圆周，一整块连续面。
  //   之前拆成 4 条细板，段与段之间有缝，看起来像一堆散块。
  for (let i = 0; i < N; i++) {
    const a = (i / N) * Math.PI * 2;

    // 主木杆（从中心到外缘）
    const g = new THREE.BoxGeometry(0.13, R, 0.13);
    g.applyMatrix4(new THREE.Matrix4().makeTranslation(0, R / 2, 0));
    rotZ(g, a);
    part(parts, tint(g, wood));
  }

  // 帆布：用 CylinderGeometry 的一个很薄的扇区（thetaLength 控制开口角）
  //   cylinder 的 theta 从 +X 轴开始逆时针，正好对应 XY 平面上的角度。
  for (let i = 0; i < N; i++) {
    const a0 = (i / N) * Math.PI * 2;
    const sweep = (Math.PI * 2 / N) * 0.72;
    const inner = R * 0.24, outer = R * 0.96;
    // 用 RingGeometry 做扇形（在 XY 平面，正好是我们需要的朝向）
    const rg = new THREE.RingGeometry(inner, outer, 6, 1, a0, sweep);
    rg.translate(0, 0, 0.04);
    part(details, tint(rg, canvas));
  }
  const m = meshFrom(parts);
  m.name = 'windMedSails';
  if (details.length) {
    const d = meshFrom(details);
    d.name = 'windMedSailsCanvas';
    d.userData.noOutline = true;
    d.castShadow = true;
    m.add(d);
  }
  return m;
}

// ===========================================================================
// C：美式牧场风车（钢桁架塔）
// ===========================================================================
//
// ★ 塔架必须用【两点之间画一根杆】的方式构造：
//   给定 A、B 两个端点，算出中点、长度、方向，再放一根杆。
//   之前用 makeRotationZ/X 手动摆角度，四条腿和斜撑全部算错、飞了出去。
function strut(parts, ax, ay, az, bx, by, bz, thick, color) {
  const dx = bx - ax, dy = by - ay, dz = bz - az;
  const len = Math.hypot(dx, dy, dz);
  if (len < 1e-4) return;
  const g = new THREE.BoxGeometry(thick, len, thick);
  // 默认沿 +Y，先转到目标方向
  const q = new THREE.Quaternion();
  const dir = new THREE.Vector3(dx, dy, dz).normalize();
  q.setFromUnitVectors(new THREE.Vector3(0, 1, 0), dir);
  g.applyMatrix4(new THREE.Matrix4().makeRotationFromQuaternion(q));
  g.applyMatrix4(new THREE.Matrix4().makeTranslation((ax + bx) / 2, (ay + by) / 2, (az + bz) / 2));
  part(parts, tint(g, color));
}

export function makeRanchWindmill() {
  const parts = [];
  const details = [];
  const H = 9.5;
  const steel = 0x9aa0a6;
  const steelDark = 0x6e747a;
  const rust = 0x8a5230;
  const topW = 0.95, botW = 2.1;

  // 每层的高度和该层的半宽
  const LEVELS = 5;
  const levelY = (k) => (H * k) / LEVELS;
  const levelW = (k) => botW + (topW - botW) * (k / LEVELS);

  // 四条腿（用 strut 精确连接 底角→顶角）
  for (const [sx, sz] of [[-1, -1], [1, -1], [-1, 1], [1, 1]]) {
    strut(parts,
      sx * botW, 0, sz * botW,
      sx * topW, H, sz * topW,
      0.15, steelDark);
  }

  // 每层横梁（四面）
  for (let k = 1; k <= LEVELS; k++) {
    const y = levelY(k);
    const w = levelW(k);
    strut(details, -w, y, w, w, y, w, 0.09, steel);
    strut(details, -w, y, -w, w, y, -w, 0.09, steel);
    strut(details, -w, y, -w, -w, y, w, 0.09, steel);
    strut(details, w, y, -w, w, y, w, 0.09, steel);
  }

  // X 形斜撑（每段每面，对角连接）
  for (let k = 0; k < LEVELS; k++) {
    const y0 = levelY(k), y1 = levelY(k + 1);
    const w0 = levelW(k), w1 = levelW(k + 1);
    // 前后两面（法线沿 Z）
    for (const sz of [-1, 1]) {
      strut(details, -w0, y0, sz * w0, w1, y1, sz * w1, 0.07, steel);
      strut(details, w0, y0, sz * w0, -w1, y1, sz * w1, 0.07, steel);
    }
    // 左右两面（法线沿 X）
    for (const sx of [-1, 1]) {
      strut(details, sx * w0, y0, -w0, sx * w1, y1, w1, 0.07, steel);
      strut(details, sx * w0, y0, w0, sx * w1, y1, -w1, 0.07, steel);
    }
  }

  // 中央水管
  part(parts, cyl(0.16, 0.16, H, 8, steelDark, 0, 0, 0));
  part(parts, box(0.46, 0.30, 0.46, rust, 0, 0, 0));
  // 管身锈斑
  for (let i = 0; i < 4; i++) {
    part(details, box(0.34, 0.18, 0.34, rust, 0, 0.6 + i * 2.1, 0));
  }

  // 塔顶平台 + 小护栏
  part(parts, box(topW * 2.6, 0.16, topW * 2.6, steelDark, 0, H, 0));
  for (const [sx, sz] of [[-1, -1], [1, -1], [-1, 1], [1, 1]]) {
    part(details, box(0.08, 0.42, 0.08, steel, sx * topW * 1.2, H + 0.16, sz * topW * 1.2));
  }
  // 顶部机头（装扇叶的方箱）
  part(parts, box(0.62, 0.55, 0.55, steelDark, 0, H + 0.42, 0));

  // 尾翼（扇形板 + 连杆）
  {
    const fy = H + 0.55;
    // 连杆
    strut(parts, 0, fy, -0.2, 0, fy + 0.15, -2.3, 0.11, steelDark);
    // 尾翼板（大扇形，参考图里很显眼）
    part(parts, box(0.07, 1.30, 1.30, steel, 0, fy + 0.28, -2.85));
    // 尾翼上的锈迹 + 加强条
    part(details, box(0.10, 0.10, 1.34, rust, 0, fy + 0.90, -2.85));
    part(details, box(0.10, 0.10, 1.34, rust, 0, fy - 0.34, -2.85));
    part(details, box(0.10, 1.34, 0.10, rust, 0, fy + 0.28, -2.85));
    part(details, box(0.34, 0.34, 0.06, rust, 0, fy + 0.28, -3.52));
  }

  return build(parts, details, 'windRanch');
}
// 牧场风车的扇叶（多片 + 外圈）
export function makeRanchFan() {
  const parts = [];
  const details = [];
  const steel = 0x9aa0a6;
  const steelDark = 0x6e747a;
  const rust = 0x8a5230;
  const R = 2.6;
  const N = 18;

  // 轮毂
  part(parts, cyl(0.32, 0.32, 0.35, 10, steelDark, 0, -0.175, 0));

  // 外圈
  for (let i = 0; i < 24; i++) {
    const a = (i / 24) * Math.PI * 2;
    part(details, box(0.09, 0.09, 0.09, steelDark,
      Math.cos(a) * R, Math.sin(a) * R, 0));
  }

  // 扇片：环形分布，每片是斜置的小平板
  for (let i = 0; i < N; i++) {
    const a = (i / N) * Math.PI * 2;
    const r0 = 0.55, r1 = R * 0.96;
    const g = new THREE.BoxGeometry(0.42, r1 - r0, 0.06);
    g.translate(0, (r0 + r1) / 2, 0);
    // 稍微倾斜（像真实风车扇叶）
    g.applyMatrix4(new THREE.Matrix4().makeRotationY(0.22));
    rotZ(g, a);
    part(details, tint(g, steel));
    // 锈斑
    if (i % 4 === 0) {
      const g2 = new THREE.BoxGeometry(0.30, 0.30, 0.04);
      g2.translate(0, (r0 + r1) * 0.6, 0.04);
      rotZ(g2, a);
      part(details, tint(g2, rust));
    }
  }

  const m = meshFrom(parts);
  m.name = 'windRanchFan';
  if (details.length) {
    const d = meshFrom(details);
    d.name = 'windRanchFanDetail';
    d.userData.noOutline = true;
    d.castShadow = true;
    m.add(d);
  }
  return m;
}

// ===========================================================================
// D：红砖风车
// ===========================================================================
export function makeBrickMill() {
  const parts = [];
  const details = [];
  const H = 6.0, R = 2.2;
  const brick = 0xa8402e;
  const brickDark = 0x8a3020;
  const brickLight = 0xc05a42;
  const stone = 0x9a9488;
  const stoneDark = 0x7a7468;
  const roof = 0x7a7078;
  const roofDark = 0x5a5058;
  const wood = 0x7a5430;

  // 石基（底部一圈粗糙石块）
  part(parts, cyl(R * 1.05, R * 1.12, 0.85, 14, stone, 0, 0, 0));
  for (let i = 0; i < 14; i++) {
    const a = (i / 14) * Math.PI * 2;
    part(details, box(0.34, 0.24, 0.20, stoneDark,
      Math.cos(a) * R * 1.08, 0.15 + (i % 2) * 0.28, Math.sin(a) * R * 1.08));
  }

  // 砖砌塔身（锥形，上窄下宽）
  part(parts, cyl(R * 0.80, R * 1.00, H, 14, brick, 0, 0.85, 0));
  // 砖缝：横向若干层 + 竖向错缝
  for (let i = 1; i < 8; i++) {
    const t = i / 8;
    const rr = R * (1.00 + (0.80 - 1.00) * t) + 0.01;
    part(details, cyl(rr, rr, 0.06, 14, brickDark, 0, 0.85 + t * H, 0));
  }
  for (let i = 0; i < 14; i++) {
    const a = (i / 14) * Math.PI * 2;
    for (let k = 0; k < 8; k++) {
      const t = k / 8;
      const rr = R * (1.00 + (0.80 - 1.00) * t);
      const a2 = a + (k % 2) * (Math.PI / 14);
      part(details, box(0.05, H / 8 - 0.10, 0.05, brickDark,
        Math.cos(a2) * rr, 0.85 + t * H + 0.05, Math.sin(a2) * rr));
    }
  }
  // （浅色砖块已按用户要求删除）

  // 灰瓦顶（四棱锥 + 出檐）
  const roofY = 0.85 + H;
  part(parts, cyl(R * 0.90, R * 0.86, 0.22, 14, roofDark, 0, roofY, 0));
  part(parts, cone(R * 1.02, 1.9, 14, roof, 0, roofY + 0.22, 0));
  // 屋顶瓦片层
  for (let i = 1; i <= 4; i++) {
    const t = i / 5;
    const rr = R * 1.02 * (1 - t) + 0.10;
    part(details, cyl(rr + 0.04, rr + 0.04, 0.07, 14, roofDark, 0, roofY + 0.22 + 1.9 * t - 0.035, 0));
  }

  // （木门、门框石券、门上小窗、草地点缀已按用户要求全部删除，塔身保持干净）

  return build(parts, details, 'windBrick');
}

// 砖砌风车的 4 片格栅叶片
export function makeBrickSails() {
  const parts = [];
  const details = [];
  const wood = 0x7a5430;
  const woodDark = 0x5a3a20;
  const canvas = 0xe8dcc4;
  const N = 4, R = 4.6;

  // 轮毂
  part(parts, cyl(0.36, 0.36, 0.45, 10, woodDark, 0, -0.225, 0));

  for (let i = 0; i < N; i++) {
    const a = (i / N) * Math.PI * 2 + Math.PI / 4;
    // 主梁（木）
    const g = new THREE.BoxGeometry(0.20, R, 0.20);
    g.translate(0, R / 2, 0);
    rotZ(g, a);
    part(parts, tint(g, wood));

    // 格栅叶片：木框 + 里面的浅色格板
    const bw = 0.95;              // 叶片宽度
    const y0 = 0.7, y1 = R * 0.96;
    // 两根边梁
    for (const off of [-bw / 2, bw / 2]) {
      const g2 = new THREE.BoxGeometry(0.09, y1 - y0, 0.12);
      g2.translate(off, (y0 + y1) / 2, 0.02);
      rotZ(g2, a);
      part(details, tint(g2, woodDark));
    }
    // 横档（每隔一段）
    const nH = 5;
    for (let k = 0; k <= nH; k++) {
      const y = y0 + (y1 - y0) * (k / nH);
      const g2 = new THREE.BoxGeometry(bw, 0.08, 0.10);
      g2.translate(0, y, 0.03);
      rotZ(g2, a);
      part(details, tint(g2, woodDark));
    }
    // 里面的浅色帆布格板
    const g3 = new THREE.BoxGeometry(bw * 0.92, y1 - y0 - 0.1, 0.04);
    g3.translate(0, (y0 + y1) / 2, 0);
    rotZ(g3, a);
    part(details, tint(g3, canvas));
  }

  const m = meshFrom(parts);
  m.name = 'windBrickSails';
  if (details.length) {
    const d = meshFrom(details);
    d.name = 'windBrickSailsDetail';
    d.userData.noOutline = true;
    d.castShadow = true;
    m.add(d);
  }
  return m;
}

// ===========================================================================
// E：糖果风车
// ===========================================================================
export function makeCandyMill() {
  const parts = [];
  const details = [];
  const H = 5.6, R = 2.3;
  const choco = 0x8a5430;
  const chocoDark = 0x6a3c20;
  const pink = 0xf0a8c0;
  const pinkDark = 0xd888a8;
  const cream = 0xfae8d0;
  const icing = 0xfff6ec;
  const red = 0xe04a5a;
  const blue = 0x6ab0e0;
  const yellow = 0xf0d050;
  const green = 0x90c860;
  const purple = 0xb090d8;

  // 底座：巧克力蛋糕层
  part(parts, cyl(R * 1.04, R * 1.10, 1.5, 16, choco, 0, 0, 0));
  // 巧克力上的糖霜滴落（一圈小圆块，高高低低）
  for (let i = 0; i < 20; i++) {
    const a = (i / 20) * Math.PI * 2;
    const h = 0.22 + (i % 3) * 0.16;
    part(details, box(0.30, h, 0.24, icing,
      Math.cos(a) * R * 1.06, 1.50 - h, Math.sin(a) * R * 1.06));
  }
  // 糖霜层（覆盖上表面）
  part(parts, cyl(R * 1.06, R * 1.06, 0.22, 16, icing, 0, 1.50, 0));

  // 中层：粉色蛋糕
  part(parts, cyl(R * 0.86, R * 0.92, 2.4, 16, pink, 0, 1.72, 0));
  // 粉色层上的白窗（尖拱）
  part(parts, box(0.72, 0.90, 0.14, cream, 0, 2.85, R * 0.88));
  {
    const g = new THREE.CylinderGeometry(0.36, 0.36, 0.14, 8, 1, false, 0, Math.PI);
    g.rotateX(Math.PI / 2);
    g.translate(0, 4.20, R * 0.88);
    part(parts, tint(g, cream));
  }
  part(details, box(0.20, 0.92, 0.06, choco, 0, 3.30, R * 0.92));
  part(details, box(0.74, 0.20, 0.06, choco, 0, 3.30, R * 0.92));

  // 顶部：粉色圆顶（洋葱形）
  const topY = 1.72 + 2.4;
  {
    const g = new THREE.SphereGeometry(R * 0.80, 16, 10);
    g.scale(1.0, 1.05, 1.0);
    g.translate(0, topY + R * 0.30, 0);
    part(parts, tint(g, pinkDark));
  }
  // 糖霜顶（更小一圈，浅色）
  {
    const g = new THREE.SphereGeometry(R * 0.54, 14, 8);
    g.scale(1.0, 1.1, 1.0);
    g.translate(0, topY + R * 0.86, 0);
    part(parts, tint(g, icing));
  }
  // 顶上的小尖
  part(parts, cone(0.16, 0.55, 8, red, 0, topY + R * 1.30, 0));

  // 屋顶上的彩色糖粒
  const sprinkleCols = [red, blue, yellow, green, purple];
  for (let i = 0; i < 22; i++) {
    const a = (i / 22) * Math.PI * 2;
    const t = 0.3 + (i % 4) * 0.15;
    const rr = R * 0.80 * Math.cos(t);
    const yy = topY + R * 0.30 + R * 0.80 * Math.sin(t);
    part(details, box(0.10, 0.10, 0.10, sprinkleCols[i % 5],
      Math.cos(a) * rr, yy, Math.sin(a) * rr));
  }

  // 拱门（巧克力 + 糖霜边）
  part(parts, box(0.95, 1.15, 0.20, chocoDark, 0, 0.02, R * 1.02));
  {
    const g = new THREE.CylinderGeometry(0.475, 0.475, 0.20, 10, 1, false, 0, Math.PI);
    g.rotateX(Math.PI / 2);
    g.translate(0, 1.17, R * 1.02);
    part(parts, tint(g, chocoDark));
  }
  // 拐杖糖门框（红白条纹）
  for (const sx of [-1, 1]) {
    for (let k = 0; k < 4; k++) {
      part(details, box(0.14, 0.30, 0.14, k % 2 === 0 ? red : icing,
        sx * 0.55, 0.02 + k * 0.30, R * 1.05));
    }
  }
  part(details, box(1.20, 0.16, 0.16, icing, 0, 1.35, R * 1.05));

  // 周围的棒棒糖
  const lolliCols = [red, blue, yellow, green, purple, pinkDark];
  for (let i = 0; i < 6; i++) {
    const a = (i / 6) * Math.PI * 2 + 0.4;
    const lx = Math.cos(a) * R * 1.45;
    const lz = Math.sin(a) * R * 1.45;
    const lh = 0.9 + (i % 3) * 0.35;
    // 棍
    part(details, box(0.06, lh, 0.06, cream, lx, 0, lz));
    // 糖球
    part(parts, cyl(0.22, 0.22, 0.12, 10, lolliCols[i], lx, lh, lz));
    part(details, cyl(0.13, 0.13, 0.14, 8, icing, lx, lh, lz));
  }

  // 地面糖粒草地
  for (let i = 0; i < 14; i++) {
    const a = (i / 14) * Math.PI * 2 + 0.15;
    const rr = R * (1.15 + (i % 3) * 0.12);
    part(details, box(0.16, 0.12, 0.16, sprinkleCols[i % 5],
      Math.cos(a) * rr, 0, Math.sin(a) * rr));
  }

  return build(parts, details, 'windCandy');
}

// 糖果风车的 4 片彩色条纹叶
export function makeCandySails() {
  const parts = [];
  const details = [];
  const cream = 0xfae8d0;
  const red = 0xe04a5a;
  const blue = 0x6ab0e0;
  const yellow = 0xf0d050;
  const pink = 0xf0a8c0;
  const N = 4;
  const R = 3.1;

  part(parts, cyl(0.34, 0.34, 0.45, 10, cream, 0, -0.225, 0));

  const cols = [red, blue, yellow, pink];
  // ★ 糖果风车的叶片是【弧形/花瓣形】：外缘鼓起、根部收窄，
  //   不是矩形。参考图里每片像一片花瓣或糖纸。
  //   做法：用一组宽度渐变的薄板沿半径叠起来，外缘自然形成弧线。
  for (let i = 0; i < N; i++) {
    const a = (i / N) * Math.PI * 2 + Math.PI / 4;
    const SEGS = 7;
    const r0 = 0.42, r1 = R;
    for (let s = 0; s < SEGS; s++) {
      const t0 = s / SEGS, t1 = (s + 1) / SEGS;
      const tm = (t0 + t1) / 2;
      const ra = r0 + (r1 - r0) * t0;
      const rb = r0 + (r1 - r0) * t1;
      const rm = (ra + rb) / 2;
      const len = rb - ra;
      // 半宽：根部窄 → 中部最宽 → 尖端收窄（花瓣轮廓）
      const wAt = (t) => {
        // 用 sin 曲线：t=0 时 0.22，t=0.45 时最宽 0.78，t=1 时 0.30
        return 0.22 + 0.56 * Math.sin(Math.min(1, t / 0.92) * Math.PI);
      };
      const wid = wAt(tm);
      // 每一小段是一块薄板
      const g = new THREE.BoxGeometry(wid, len, 0.14);
      g.applyMatrix4(new THREE.Matrix4().makeTranslation(0, rm, 0));
      rotZ(g, a);
      part(parts, tint(g, cream));

      // 彩色条纹（沿叶片横向，每段一种色）
      const c = cols[(i + s) % 4];
      const g2 = new THREE.BoxGeometry(wid * 0.92, len * 0.55, 0.05);
      g2.applyMatrix4(new THREE.Matrix4().makeTranslation(0, rm, 0.09));
      rotZ(g2, a);
      part(details, tint(g2, c));
    }
  }

  const m = meshFrom(parts);
  m.name = 'windCandySails';
  if (details.length) {
    const d = meshFrom(details);
    d.name = 'windCandySailsDetail';
    d.userData.noOutline = true;
    d.castShadow = true;
    m.add(d);
  }
  return m;
}
