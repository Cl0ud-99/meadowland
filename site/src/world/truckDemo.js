// ---------------------------------------------------------------------------
// 农业卡车 demo —— 四种款式（按用户提供的参考图）
//
// A  农场皮卡    砖红车身 + 敞开货斗 + 木栏 + 干草包
// B  谷物运输车  灰绿车身 + 封闭罐体 + 侧梯
// C  蓝斗运粮车  深蓝车身 + 高箱货斗 + 麻袋
// D  橙斗农用车  橙色车身 + 敞开货斗 + 果蔬筐 + 侧梯
//
// ★ 设计原则（用户要求）：
//   · 车身保持干净 —— 不加任何装饰性小方块、斑点、贴片；
//   · 体块干净 —— 每个部件都是完整的长方体/圆柱，边角分明。
// ---------------------------------------------------------------------------
import * as THREE from '../../vendor/three/three.module.js';
import { box, cyl, tint, meshFrom } from '../util/geo.js';

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

// ---------------------------------------------------------------------------
// 通用：车轮
// ---------------------------------------------------------------------------
// ★ 车轮用圆柱 + 轮毂盖，不用辐条（辐条在低多边形里会变成一团杂点）
function addWheel(parts, x, z, r, w) {
  const tire = 0x2a2a2e;
  const hub = 0x9aa0a6;
  // 轮胎（圆柱，轴向沿 X）
  const g = new THREE.CylinderGeometry(r, r, w, 14);
  g.rotateZ(Math.PI / 2);
  g.translate(x, r, z);
  part(parts, tint(g, tire));
  // 轮毂盖（略小的圆柱，凸出一点）
  const side = x > 0 ? 1 : -1;
  const h = new THREE.CylinderGeometry(r * 0.52, r * 0.52, 0.06, 10);
  h.rotateZ(Math.PI / 2);
  h.translate(x + side * (w / 2 + 0.01), r, z);
  part(parts, tint(h, hub));
}

// ---------------------------------------------------------------------------
// 通用：驾驶室 + 车头（四种车共用同一套体块，只换颜色）
// ---------------------------------------------------------------------------
// ★ 体块要【方正】：引擎盖、驾驶室、挡风玻璃都是长方体，边角干净。
function addCab(parts, details, opts) {
  const {
    bodyColor, zFront, cabH = 1.35, cabW = 1.95, cabD = 1.75,
    hoodD = 1.05, hoodH = 1.15, glassColor = 0x2a3038,
    bumperColor = 0xb8bcc0, grilleColor = 0x3a3e44,
    withSleeper = false,
  } = opts;

  // ★ 车身比例（参考图里的卡车基本都是「短车头 + 高驾驶室」）：
  //   · 引擎盖短而低（hoodD 1.55、hoodH 0.80）
  //   · 驾驶室高而方（cabH 1.35、cabD 1.75）
  //   · 所有部件都要【嵌进】车身，不能浮在表面
  const baseY = 0.58;              // 车身底面（底盘之上）

  // ---- 引擎盖 ----
  part(parts, box(cabW, hoodH, hoodD, bodyColor, 0, baseY, zFront - hoodD / 2));
  // 车头前端（和引擎盖同高，稍窄，形成车头的收势）
  part(parts, box(cabW * 0.90, hoodH * 0.92, 0.26, bodyColor, 0, baseY, zFront + 0.09));

  // ---- 格栅（嵌在车头前端，不凸出）----
  //   格栅的 z 要到车头最前表面(zFront + 0.22)，厚度 0.10 只露出一点点
  const frontZ = zFront + 0.22;
  part(parts, box(cabW * 0.66, hoodH * 0.58, 0.10, grilleColor,
    0, baseY + hoodH * 0.16, frontZ - 0.02));
  // 格栅横条（2 道细，嵌在格栅表面）
  for (let i = 0; i < 2; i++) {
    part(details, box(cabW * 0.62, 0.05, 0.04, 0x6a6e74,
      0, baseY + hoodH * 0.26 + i * 0.22, frontZ + 0.04));
  }

  // ---- 保险杠（车头最下沿，横向一整条）----
  part(parts, box(cabW * 1.0, 0.24, 0.28, bumperColor, 0, baseY - 0.06, frontZ + 0.06));

  // ---- 大灯（嵌在格栅两侧，和车头齐平）----
  for (const sx of [-1, 1]) {
    part(details, box(0.30, 0.20, 0.08, 0xf0ead0,
      sx * cabW * 0.33, baseY + hoodH * 0.30, frontZ + 0.02));
  }

  // ---- 驾驶室 ----
  const cabZ = zFront - hoodD - cabD / 2;
  const cabY = baseY + hoodH;
  part(parts, box(cabW, cabH, cabD, bodyColor, 0, cabY, cabZ));

  // ---- 驾驶室下方的侧裙板 ----
  //
  // ★ 填住"镂空"：驾驶室底在 baseY+hoodH = 1.73，而货斗侧板顶只有 1.70，
  //   中间这一小段两侧是空的（只有底盘横梁），侧看就是一个洞。
  //   这里加两块和车身同色的裙板，从底盘顶面一直填到驾驶室底面。
  {
    const skirtTop = cabY;                       // 1.73（驾驶室底）
    const skirtBottom = baseY - 0.10;            // 0.48（底盘附近）
    const skirtH = skirtTop - skirtBottom;
    for (const sx of [-1, 1]) {
      part(parts, box(0.14, skirtH, cabD, bodyColor,
        sx * (cabW / 2 - 0.07), skirtBottom, cabZ));
    }
    // 车头下方也补一段（引擎盖底到保险杠）
    const hoodSkirtH = baseY - (baseY - 0.10);
    for (const sx of [-1, 1]) {
      part(parts, box(0.12, hoodSkirtH + 0.10, hoodD, bodyColor,
        sx * (cabW / 2 - 0.06), baseY - 0.10, zFront - hoodD / 2));
    }
  }

  // 挡风玻璃（正面）
  //
  // ★ 位置要点：
  //   · z 只凸出车身 0.015（不能多，否则侧看像贴片浮在外面）；
  //   · 上下左右都要留出边框，不能顶到驾驶室边缘。
  {
    const gw = cabW * 0.80;
    const gh = cabH * 0.44;
    const gy = cabY + cabH * 0.56;
    part(details, box(gw, gh, 0.03, glassColor,
      0, gy, cabZ + cabD / 2 + 0.015));
  }
  // 侧窗（左右）：同样贴住车身，留边框
  for (const sx of [-1, 1]) {
    const sh = cabH * 0.34;
    const sy = cabY + cabH * 0.58;
    part(details, box(0.03, sh, cabD * 0.52, glassColor,
      sx * (cabW / 2 + 0.015), sy, cabZ + cabD * 0.02));
  }
  // 车顶（和驾驶室同宽，薄薄一层）
  part(parts, box(cabW, 0.10, cabD, bodyColor, 0, cabY + cabH, cabZ));

  // 后视镜（两根细杆 + 小方块，尽量贴紧车身）
  for (const sx of [-1, 1]) {
    part(details, box(0.04, 0.22, 0.04, 0x6a6e74,
      sx * (cabW / 2 + 0.09), cabY + cabH * 0.74, cabZ + cabD / 2 - 0.22));
    part(details, box(0.08, 0.20, 0.13, 0x3a3e44,
      sx * (cabW / 2 + 0.15), cabY + cabH * 0.76, cabZ + cabD / 2 - 0.22));
  }

  // 排气管（右侧细管，贴着车身）
  part(parts, cyl(0.06, 0.06, 1.5, 8, 0x8a8e92,
    cabW / 2 + 0.04, baseY, cabZ + cabD / 2 - 0.28));

  if (withSleeper) {
    part(parts, box(cabW, cabH * 0.62, cabD * 0.48, bodyColor,
      0, cabY, cabZ - cabD * 0.72));
  }

  return { cabZ, cabTopY: cabY + cabH + 0.10, cabBackZ: cabZ - cabD / 2 };
}

// ===========================================================================
// A：农场皮卡（砖红 + 木栏货斗 + 干草包）
// ===========================================================================
export function makePickup() {
  const parts = [];
  const details = [];
  const body = 0xc0513e;         // 砖红
  const woodBar = 0xb08a58;      // 木栏
  const woodDark = 0x8a6a40;
  const hay = 0xd8b862;
  const hayDark = 0xb8963e;
  const zFront = 5.0;

  // 底盘
  // 底盘（按车身实际范围：车头前沿 6.5 → 车尾 -2.7）
  // 底盘（覆盖 5.55 → -1.55）
  part(parts, box(2.00, 0.32, 7.10, 0x4a4e52, 0, 0.50, 2.00));

  const cab = addCab(parts, details, { bodyColor: body, zFront, cabH: 1.35, cabW: 1.95, cabD: 1.75, hoodD: 1.05, hoodH: 1.15 });

  // 货斗（皮卡式：侧板 + 尾板）
  const bedZ0 = cab.cabZ - 0.9;      // 货斗前缘
  const bedZ1 = zFront - 6.2;         // 货斗后缘
  const bedLen = bedZ0 - bedZ1;
  const bedZc = (bedZ0 + bedZ1) / 2;
  const bedY = 0.87;
  // 货斗底板
  part(parts, box(2.0, 0.16, bedLen, body, 0, bedY, bedZc));
  // 左右侧板
  for (const sx of [-1, 1]) {
    part(parts, box(0.12, 0.62, bedLen, body, sx * 0.96, bedY + 0.16, bedZc));
  }
  // 尾板
  part(parts, box(2.0, 0.62, 0.12, body, 0, bedY + 0.16, bedZ1));

  // 木栏（货斗上方一圈，参考图里很明显）
  for (const sx of [-1, 1]) {
    // 立柱
    for (let i = 0; i <= 3; i++) {
      const z = bedZ1 + (bedLen * i) / 3;
      part(parts, box(0.13, 0.75, 0.13, woodBar, sx * 0.94, bedY + 0.78, z));
    }
    // 横杆
    for (const yy of [1.10, 1.44]) {
      part(parts, box(0.11, 0.11, bedLen, woodBar, sx * 0.94, yy, bedZc));
    }
  }
  // 前挡栏
  part(parts, box(2.0, 0.75, 0.12, woodBar, 0, bedY + 0.78, bedZ0));
  part(parts, box(2.0, 0.11, 0.11, woodDark, 0, 1.44, bedZ0));

  // 干草包（货斗里，2 排 × 2 个）
  for (let i = 0; i < 2; i++) {
    for (let j = 0; j < 2; j++) {
      part(parts, box(0.82, 0.52, 0.82, hay,
        (j - 0.5) * 0.90, bedY + 0.16, bedZ0 - 0.65 - i * 0.92));
      // 捆绳（两道，细）
      part(details, box(0.86, 0.06, 0.06, hayDark,
        (j - 0.5) * 0.90, bedY + 0.16 + 0.30, bedZ0 - 0.65 - i * 0.92));
    }
  }
  // 上面再叠一个
  part(parts, box(0.82, 0.50, 0.82, hayDark, 0, bedY + 0.16 + 0.52, bedZ0 - 1.10));

  // 车轮：前 2 + 后 2（皮卡是单轴后轮）
  const wheelR = 0.62, wheelW = 0.36;
  addWheel(parts, -1.02, zFront - 1.9, wheelR, wheelW);
  addWheel(parts, 1.02, zFront - 1.9, wheelR, wheelW);
  addWheel(parts, -1.02, bedZ1 + 1.4, wheelR, wheelW);
  addWheel(parts, 1.02, bedZ1 + 1.4, wheelR, wheelW);

  return build(parts, details, 'truckPickup');
}

// ===========================================================================
// B：谷物运输车（灰绿 + 封闭罐体 + 侧梯）
// ===========================================================================
export function makeGrainTruck() {
  const parts = [];
  const details = [];
  const body = 0x5f8a68;
  const tank = 0x7a8a6a;
  const tankTop = 0x8a9a7a;
  const metal = 0x9aa0a6;
  const yellow = 0xd8a840;
  const zFront = 5.4;

  // 底盘（6.9 → -4.1）
  // 底盘（5.95 → -2.55）
  part(parts, box(2.05, 0.35, 8.50, 0x4a4e52, 0, 0.52, 1.70));

  const cab = addCab(parts, details, {
    bodyColor: body, zFront,
    cabH: 1.40, cabW: 2.00, cabD: 1.80, hoodD: 1.10, hoodH: 1.18,
  });
  for (let i = -1; i <= 1; i++) {
    part(parts, box(0.18, 0.10, 0.18, yellow, i * 0.42, cab.cabTopY + 0.02, cab.cabZ + 0.3));
  }

  const tankZ0 = cab.cabZ - 0.90;
  const tankZ1 = zFront - 7.6;
  const tankLen = tankZ0 - tankZ1;
  const tankZc = (tankZ0 + tankZ1) / 2;
  const tankY = 0.93;
  const tankH = 2.05;
  part(parts, box(2.10, tankH, tankLen, tank, 0, tankY, tankZc));
  {
    const g = new THREE.CylinderGeometry(1.05, 1.05, tankLen, 14, 1, false, 0, Math.PI);
    g.rotateX(Math.PI / 2);
    g.rotateZ(Math.PI / 2);
    g.scale(1, 0.42, 1);
    g.translate(0, tankY + tankH, tankZc);
    part(parts, tint(g, tankTop));
  }
  for (let i = 1; i <= 2; i++) {
    part(details, box(2.14, 0.14, 0.14, tankTop, 0, tankY + tankH * 0.5, tankZ1 + (tankLen * i) / 3));
  }
  for (const sx of [-1, 1]) {
    part(details, box(0.06, tankH * 0.9, 0.16, tankTop, sx * 1.06, tankY + 0.1, tankZc));
  }

  for (let i = 0; i < 2; i++) {
    const z = tankZ1 + tankLen * (0.30 + i * 0.34);
    for (const sx of [-1, 1]) {
      part(parts, box(0.30, 0.42, 0.60, yellow, sx * 1.14, tankY + 0.30, z));
    }
  }

  {
    const lx = 1.12, lz = tankZ0 + 0.55;
    const y0 = 0.9, y1 = tankY + tankH + 0.1;
    for (const sz of [-1, 1]) {
      part(parts, box(0.07, y1 - y0, 0.07, metal, lx, y0, lz + sz * 0.22));
    }
    const n = 6;
    for (let i = 1; i < n; i++) {
      part(parts, box(0.07, 0.06, 0.44, metal, lx, y0 + ((y1 - y0) * i) / n, lz));
    }
  }

  const wheelR = 0.66, wheelW = 0.40;
  addWheel(parts, -1.06, zFront - 2.0, wheelR, wheelW);
  addWheel(parts, 1.06, zFront - 2.0, wheelR, wheelW);
  addWheel(parts, -1.06, tankZ1 + 2.1, wheelR, wheelW);
  addWheel(parts, 1.06, tankZ1 + 2.1, wheelR, wheelW);
  addWheel(parts, -1.06, tankZ1 + 3.5, wheelR, wheelW);
  addWheel(parts, 1.06, tankZ1 + 3.5, wheelR, wheelW);

  return build(parts, details, 'truckGrain');
}

// ===========================================================================
// C：蓝斗运粮车（深蓝 + 高箱货斗 + 麻袋）
// ===========================================================================
export function makeBlueHauler() {
  const parts = [];
  const details = [];
  const body = 0x3a4a6a;
  const bedColor = 0x2e3a58;
  const bedEdge = 0x4a5a7a;
  const metal = 0x9aa0a6;
  const sack = 0xc8b89a;
  const sackDark = 0x9a8a70;
  const sackMark = 0x5a8a4a;
  const zFront = 5.7;

  // 底盘（7.3 → -4.3）
  // 底盘（6.25 → -2.65）
  part(parts, box(2.10, 0.36, 8.90, 0x4a4e52, 0, 0.53, 1.80));

  const cab = addCab(parts, details, {
    bodyColor: body, zFront,
    cabH: 1.38, cabW: 2.02, cabD: 1.85, hoodD: 1.12, hoodH: 1.20,
  });

  const bedZ0 = cab.cabZ - 0.92;
  const bedZ1 = zFront - 8.0;
  const bedLen = bedZ0 - bedZ1;
  const bedZc = (bedZ0 + bedZ1) / 2;
  const bedY = 0.92;
  const wallH = 1.55;
  part(parts, box(2.15, 0.16, bedLen, bedColor, 0, bedY, bedZc));
  for (const sx of [-1, 1]) {
    part(parts, box(0.14, wallH, bedLen, bedColor, sx * 1.04, bedY + 0.16, bedZc));
  }
  part(parts, box(2.15, wallH, 0.14, bedColor, 0, bedY + 0.16, bedZ0));
  part(parts, box(2.15, wallH, 0.14, bedColor, 0, bedY + 0.16, bedZ1));
  for (const sx of [-1, 1]) {
    for (let i = 1; i <= 3; i++) {
      const z = bedZ1 + (bedLen * i) / 4;
      part(details, box(0.06, wallH * 0.94, 0.14, bedEdge, sx * 1.12, bedY + 0.20, z));
    }
  }
  for (const sx of [-1, 1]) {
    part(details, box(0.20, 0.10, bedLen, bedEdge, sx * 1.04, bedY + 0.16 + wallH, bedZc));
  }

  for (let i = 0; i < 3; i++) {
    for (let j = 0; j < 2; j++) {
      const z = bedZ0 - 0.75 - i * 1.05;
      const x = (j - 0.5) * 0.98;
      part(parts, box(0.86, 0.46, 0.86, sack, x, bedY + 0.16, z));
      part(details, box(0.44, 0.30, 0.04, sackMark, x, bedY + 0.22, z + 0.44));
    }
  }
  for (let i = 0; i < 2; i++) {
    const z = bedZ0 - 1.25 - i * 1.05;
    part(parts, box(0.86, 0.44, 0.86, sackDark, 0, bedY + 0.16 + 0.47, z));
  }

  // 排气管（货斗前缘外侧，不挡驾驶室）
  for (const sx of [-1, 1]) {
    part(parts, cyl(0.11, 0.11, 2.4, 10, metal, sx * 1.10, 0.6, bedZ0 - 0.15));
  }

  const wheelR = 0.68, wheelW = 0.42;
  addWheel(parts, -1.08, zFront - 2.1, wheelR, wheelW);
  addWheel(parts, 1.08, zFront - 2.1, wheelR, wheelW);
  addWheel(parts, -1.08, bedZ1 + 2.2, wheelR, wheelW);
  addWheel(parts, 1.08, bedZ1 + 2.2, wheelR, wheelW);
  addWheel(parts, -1.08, bedZ1 + 3.6, wheelR, wheelW);
  addWheel(parts, 1.08, bedZ1 + 3.6, wheelR, wheelW);

  return build(parts, details, 'truckBlueHauler');
}

// ===========================================================================
// D：橙斗农用车（橙色 + 敞开货斗 + 果蔬筐 + 侧梯）
// ===========================================================================
export function makeOrangeHauler() {
  const parts = [];
  const details = [];
  const body = 0xd8842e;
  const bedColor = 0xc87828;
  const metal = 0x9aa0a6;
  const wood = 0xa87848;
  const woodDark = 0x8a5e34;
  const appleRed = 0xc8402e;
  const appleGreen = 0x7aa84a;
  const zFront = 5.4;

  // 底盘（7.0 → -4.1）
  // 底盘（5.95 → -2.55）
  part(parts, box(2.05, 0.36, 8.50, 0x4a4e52, 0, 0.53, 1.70));

  const cab = addCab(parts, details, {
    bodyColor: body, zFront,
    cabH: 1.38, cabW: 2.00, cabD: 1.82, hoodD: 1.08, hoodH: 1.18,
  });

  const bedZ0 = cab.cabZ - 0.92;
  const bedZ1 = zFront - 7.6;
  const bedLen = bedZ0 - bedZ1;
  const bedZc = (bedZ0 + bedZ1) / 2;
  const bedY = 0.92;
  // ★ 侧板高度 0.90 → 0.62：果蔬筐（箱高 0.44，箱顶约 1.62）
  //   原来侧板顶到 1.98，把筐完全挡住，从任何角度都看不到货斗里有什么。
  //   参考图里橙斗车是【低栏】货斗，果蔬筐明显露在外面。
  const wallH = 0.62;
  part(parts, box(2.05, 0.16, bedLen, bedColor, 0, bedY, bedZc));
  for (const sx of [-1, 1]) {
    part(parts, box(0.13, wallH, bedLen, bedColor, sx * 1.02, bedY + 0.16, bedZc));
  }
  part(parts, box(2.12, wallH, 0.13, bedColor, 0, bedY + 0.16, bedZ0));
  part(parts, box(2.12, wallH, 0.13, bedColor, 0, bedY + 0.16, bedZ1));
  // 顶部压条（深橙）
  for (const sx of [-1, 1]) {
    part(details, box(0.18, 0.09, bedLen, 0xb06018, sx * 1.02, bedY + 0.16 + wallH, bedZc));
  }

  // 果蔬筐（木箱 + 里面的红/绿果实）
  const crateAt = (cz, cx, withRed) => {
    // 木箱（四面 + 底）
    //   ★ 箱高 0.44 → 0.52，箱顶到 bedY+0.16+0.52 = 1.60，
    //     侧板顶降到 bedY+0.16+0.62 = 1.70，箱子和果实都能露出来。
    part(parts, box(0.92, 0.10, 0.92, wood, cx, bedY + 0.16, cz));
    for (const sz of [-1, 1]) {
      part(parts, box(0.92, 0.52, 0.06, wood, cx, bedY + 0.26, cz + sz * 0.43));
    }
    for (const sx of [-1, 1]) {
      part(parts, box(0.06, 0.52, 0.92, woodDark, cx + sx * 0.43, bedY + 0.26, cz));
    }
    // 果实（4 个圆球，简洁）
    const col = withRed ? appleRed : appleGreen;
    for (let i = 0; i < 4; i++) {
      const ox = (i % 2 === 0 ? -1 : 1) * 0.20;
      const oz = (i < 2 ? -1 : 1) * 0.20;
      const g = new THREE.SphereGeometry(0.17, 8, 6);
      g.translate(cx + ox, bedY + 0.70, cz + oz);
      part(details, tint(g, col));
    }
  };
  crateAt(bedZ0 - 0.85, -0.42, true);
  crateAt(bedZ0 - 0.85, 0.52, false);
  crateAt(bedZ1 + 0.85, 0.05, true);

  // 侧梯（货斗右侧）
  {
    const lx = 1.14, lz = bedZc + 0.6;
    const y0 = 0.9, y1 = bedY + 0.16 + wallH + 0.1;
    for (const sz of [-1, 1]) {
      part(parts, box(0.07, y1 - y0, 0.07, metal, lx, y0, lz + sz * 0.20));
    }
    const n = 4;
    for (let i = 1; i < n; i++) {
      part(parts, box(0.07, 0.06, 0.40, metal, lx, y0 + ((y1 - y0) * i) / n, lz));
    }
  }
  // 货斗前部的小工具架（简化成两根竖杆）
  for (const sx of [-1, 1]) {
    part(details, box(0.06, 0.55, 0.06, metal, sx * 0.86, bedY + 0.16 + wallH, bedZ0 - 0.15));
  }

  const wheelR = 0.66, wheelW = 0.40;
  addWheel(parts, -1.06, zFront - 2.05, wheelR, wheelW);
  addWheel(parts, 1.06, zFront - 2.05, wheelR, wheelW);
  addWheel(parts, -1.06, bedZ1 + 2.0, wheelR, wheelW);
  addWheel(parts, 1.06, bedZ1 + 2.0, wheelR, wheelW);

  return build(parts, details, 'truckOrangeHauler');
}
