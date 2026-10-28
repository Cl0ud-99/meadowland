import * as THREE from 'three';
import { PALETTE } from '../config.js';
import { box, cyl, cone, gable, meshFrom, tint, recolorMesh } from '../util/geo.js';
import { BUILDING_STYLES } from './buildingStyles.js';
import { makeWindowPlane, WINDOW_LAYER } from './windows.js';
import { PASTURE, COOP, BUILDINGS, HAY_BALES, FIELD_RECTS, HORSE_PASTURE } from './layout.js';
import { toonLambert } from '../render/toon.js';
import { buildBarnDemo, buildFarmhouseDemo } from './barnDemo.js';
import { makeMetalTower, makeBarrelTower, makeShingleTower } from './watertowerDemo.js';
import { makeMetalSilo, makeWoodSilo, makeConcreteSilo } from './siloDemo.js';
import {
  makeModernTurbine, makeModernBlades,
  makeMediterraneanMill, makeMediterraneanSails,
  makeRanchWindmill, makeRanchFan,
  makeBrickMill, makeBrickSails,
  makeCandyMill, makeCandySails,
} from './windmillDemo.js';

// ---------------------------------------------------------------------------
// 农场建筑群：谷仓、农舍、筒仓、水塔、风车、干草堆、围栏
// 约定：所有 make* 函数返回"局部坐标从 y=0 起"的网格，由 buildFarm 统一抬到地面高度
// ---------------------------------------------------------------------------

// ---------------------------------------------------------------------------
// 谷仓：使用 barnDemo 的精细模型（折线屋顶 + 竖板墙 + 山墙阁楼窗 + 干草）
//
// ★ 传入 { palette: true } 让关键部位使用 PALETTE 语义色，
//   这样换色系统（setBuildingStyle）才能按 hex 匹配到并替换。
// ---------------------------------------------------------------------------
function makeBarn() {
  const m = buildBarnDemo({ palette: true });
  m.name = 'barn';
  return m;
}

// ---------------------------------------------------------------------------
// 农舍：使用 barnDemo 的精细模型（原木横板墙 + 红瓦屋顶 + 白色包边 + 烟囱）
// ---------------------------------------------------------------------------
function makeFarmhouse() {
  const m = buildFarmhouseDemo({ palette: true });
  m.name = 'farmhouse';
  return m;
}

// ---------------------------------------------------------------------------
// 筒仓：三种造型可切换（单筒布局，贴合场景里的 silo1/silo2）
//
//   'metal'     金属筒仓（银灰波纹 + 红蓝色带 + 锥顶 + 提升塔）
//   'wood'      红木方塔（木板方塔 + 白横条 + 双坡顶）
//   'concrete'  混凝土筒仓（米色混凝土 + 半球穹顶 + 竖管）
//
// heightScale 控制高度：silo1 用 1.45（→ 约 16），silo2 用 1.0（→ 约 11）
// ---------------------------------------------------------------------------
export const SILO_STYLES = ['metal', 'wood', 'concrete'];

function makeSilo(style = 'metal', heightScale = 1) {
  const builders = {
    metal: makeMetalSilo,
    wood: makeWoodSilo,
    concrete: makeConcreteSilo,
  };
  const fn = builders[style] || makeMetalSilo;
  const m = fn({ single: true, heightScale });
  m.name = 'silo';
  m.userData.siloStyle = style;
  m.userData.heightScale = heightScale;
  return m;
}

// ---------------------------------------------------------------------------
// 水塔：三种样式可切换
//
//   'metal'   金属水塔（灰色铁皮 + 锈迹 + "WATER" 字样 + 锥形底 + 尖铁顶）
//   'barrel'  木桶水塔（木板桶身 + 金属箍 + 平台栏杆 + 出水管）
//   'shingle' 深木水塔（深木竖板 + 三道铁箍 + 鳞瓦顶 + 侧管 + 短梯）
//
// 传入 { palette: true } 让关键部位用 PALETTE 语义色，支持换色。
// ---------------------------------------------------------------------------
export const WATERTOWER_STYLES = ['metal', 'barrel', 'shingle'];

function makeWaterTower(style = 'metal') {
  const builders = {
    metal: makeMetalTower,
    barrel: makeBarrelTower,
    shingle: makeShingleTower,
  };
  const fn = builders[style] || makeMetalTower;
  const m = fn({ palette: true });
  m.name = 'watertower';
  m.userData.watertowerStyle = style;
  return m;
}

// 风车：塔身 + 可旋转叶片
// ---------------------------------------------------------------------------
// 风车：五种造型可切换
//
//   'modern'        现代风机（锥形塔筒 + 3 片三角叶）
//   'mediterranean' 地中海帆布风车（石塔 + 8 片帆布 + 蓝洋葱顶）
//   'ranch'         美式牧场风车（钢桁架 + 多片扇叶 + 尾翼）
//   'brick'         红砖风车（砖塔 + 4 片格栅叶 + 灰瓦顶）
//   'candy'         糖果风车（粉棕分层 + 彩色条纹叶）
//
// ★ 每种造型的【叶片挂载高度和前后偏移】都不同（见 SAILS_ANCHOR），
//   必须逐个配置，不能用统一值 —— 否则叶片会插进塔身或浮在半空。
// ---------------------------------------------------------------------------
export const WINDMILL_STYLES = ['modern', 'mediterranean', 'ranch', 'brick', 'candy'];

// 每种造型的：塔身构造函数 / 叶片构造函数 / 叶片挂载点(y, z) / 转速
const WINDMILL_SPEC = {
  modern: {
    tower: makeModernTurbine, sails: makeModernBlades,
    sailsY: 18.42, sailsZ: 1.32, spin: 0.45,
  },
  mediterranean: {
    tower: makeMediterraneanMill, sails: makeMediterraneanSails,
    sailsY: 7.2, sailsZ: 2.6, spin: 0.5,
  },
  ranch: {
    tower: makeRanchWindmill, sails: makeRanchFan,
    sailsY: 10.05, sailsZ: 1.45, spin: 0.9,
  },
  brick: {
    tower: makeBrickMill, sails: makeBrickSails,
    sailsY: 6.6, sailsZ: 2.4, spin: 0.35,
    // ★ 红砖/糖果原本比另外三种矮一截（8.97 / 7.66 vs 11.6~19.6），
    //   在场景里显得像"玩具"。放大 1.5 倍后高度接近 13.5 / 11.5，比例协调。
    scale: 1.5,
  },
  candy: {
    tower: makeCandyMill, sails: makeCandySails,
    sailsY: 4.9, sailsZ: 2.5, spin: 0.7,
    scale: 1.5,
  },
};

export function windmill(style = 'ranch') {
  const spec = WINDMILL_SPEC[style] || WINDMILL_SPEC.ranch;
  const group = new THREE.Group();

  // 塔身
  const tower = spec.tower();
  group.add(tower);

  // 叶片（单独一个 Group，便于绕 Z 轴旋转）
  const blades = spec.sails();
  blades.position.set(0, spec.sailsY, spec.sailsZ);
  blades.name = 'windmillBlades';
  group.add(blades);

  // 整体缩放（红砖/糖果用 1.5 倍，和其他造型高度协调）
  //   ★ 缩放放在 group 上而不是分别缩放塔身/叶片，
  //     这样叶片的挂载点和转速都不受影响。
  if (spec.scale && spec.scale !== 1) {
    group.scale.setScalar(spec.scale);
  }

  group.name = 'windmill';
  group.userData.blades = blades;
  group.userData.windmillStyle = style;
  group.userData.spinSpeed = spec.spin;
  group.userData.scaleFactor = spec.scale || 1;
  return group;
}

function hayBale(r = 1.5) {
  const g = new THREE.CylinderGeometry(r, r, 2.2, 12);
  g.rotateZ(Math.PI / 2);
  const m = new THREE.Mesh(g, toonLambert({ color: PALETTE.hay, flatShading: true }));
  m.position.y = r;
  m.castShadow = true;
  m.receiveShadow = true;
  m.name = 'hay';
  return m;
}

// ---------------------------------------------------------------------------
// 围栏：沿折线生成，每根立柱都贴合地形高度，横杆跟着两端倾斜
//
// closed = true（默认）时自动补上「最后一点 → 第一点」这条边。
// 注意：pointInPolygon() 默认就是按闭合多边形判定的，
// 如果这里不闭合，就会出现「逻辑上在栏内、视觉上没有护栏」的缺口。
// ---------------------------------------------------------------------------
// ---------------------------------------------------------------------------
// 围栏：三种可替换风格
//
//   'plank'  尖顶木板栅栏（默认）—— 宽板 + 尖顶 + 高矮错落
//   'picket' 尖桩栅栏 —— 细窄尖桩 + 均匀间距
//   'rail'   横板围栏 —— 粗立柱 + 3 道横板
//
// 所有风格都支持：
//   · 沿多边形逐段生成，自动贴合地形高差；
//   · 横杆/横板随两端高差倾斜；
//   · 木板/立柱逐根取地面高度。
// ---------------------------------------------------------------------------
export const FENCE_STYLES = ['plank', 'picket', 'rail'];

// ---------------------------------------------------------------------------
// 三处围栏各自使用的风格 —— 想换风格只改这三个常量
// ---------------------------------------------------------------------------
export const FENCE_STYLE_PASTURE = 'plank';   // 牧场：尖顶木板
export const FENCE_STYLE_COOP = 'picket';     // 鸡舍：白色尖桩
export const FENCE_STYLE_FIELD = 'rail';      // 田地：横板围栏

// ---------------------------------------------------------------------------
// 坐标约定（很重要，之前搞反了导致横杆朝错误方向延伸、形成大十字）：
//
//   angle = Math.atan2(dx, dz)
//   rotateY(angle) 会把【+Z 轴】转到围栏方向 (dx, dz)
//
//   所以：凡是「沿围栏方向延伸」的尺寸，都必须放在 BoxGeometry 的【Z 分量】。
//   横杆   → BoxGeometry(厚度, 高, 跨度)   ✓
//   木板   → BoxGeometry(厚度, 高, 板宽)   ✓  （板宽沿围栏、厚度垂直于围栏）
//   钉子   → 薄片，Z 分量是厚度方向
// ---------------------------------------------------------------------------

// 单块木板：主板 + 尖顶 + 木纹
//   w = 沿围栏方向的板宽，d = 垂直于围栏的厚度
function addFencePlank(parts, x, y, z, w, d, h, color, dark, tip, angle) {
  const push = (gw, gh, gd, col, ox, oy, oz) => {
    // gw 是垂直围栏方向（厚度），gd 是沿围栏方向（宽度）
    const g = new THREE.BoxGeometry(gw, gh, gd);
    g.translate(ox, oy, oz);
    g.rotateY(angle);
    g.translate(x, y, z);
    parts.push(tint(g, col));
  };
  // 主板（原点在底部中心）
  push(d, h, w, color, 0, h / 2, 0);
  // 尖顶：两级递减（沿围栏方向收窄）
  if (tip) {
    push(d, h * 0.10, w * 0.72, color, 0, h + h * 0.05, 0);
    push(d, h * 0.07, w * 0.40, color, 0, h + h * 0.135, 0);
  }
  // 木纹：2 条竖细条，贴在朝向观察者的那个侧面（垂直围栏方向）
  for (const off of [-w * 0.22, w * 0.24]) {
    push(0.02, h * 0.86, w * 0.06, dark, d / 2 + 0.01, h * 0.50, off);
  }
}

export function fence(points, height = 1.5, model = null, closed = true, style = 'plank') {
  const parts = [];
  const groundAt = (x, z) => (model ? model.heightAt(x, z) : 0);

  // ---- 三种风格的参数 ----
  const CFG = {
    plank: {
      boardW: 0.50, boardD: 0.14, spacing: 0.62, tip: true,
      wood: 0x8a6a48, woodDark: 0x6a4e32, woodLight: 0x9a7a54,
      rail: 0x7a5a3c, nail: 0x4a3a2a,
      railT: [0.28, 0.68], railH: 0.16, railD: 0.10,
    },
    picket: {
      boardW: 0.20, boardD: 0.10, spacing: 0.46, tip: true,
      wood: 0xe8e2d4, woodDark: 0xd0c8b6, woodLight: 0xd8d2c2,
      rail: 0xd0c8b6, nail: 0x8a8270,
      railT: [0.20, 0.72], railH: 0.13, railD: 0.08,
    },
    rail: {
      boardW: 0.26, boardD: 0.26, spacing: 2.30, tip: true, isPost: true,
      wood: 0x6a4e32, woodDark: 0x7a5c3a, woodLight: 0xae8e62,
      rail: 0x9a7a52, nail: 0x4a3a2a,
      railT: [0.28, 0.57, 0.86], railH: 0.17, railD: 0.09,
    },
  };
  const cfg = CFG[style] || CFG.plank;

  const pts = points;
  const first = pts[0];
  const last = pts[pts.length - 1];
  const needsClose =
    closed && (Math.abs(first[0] - last[0]) > 1e-6 || Math.abs(first[1] - last[1]) > 1e-6);
  const edgeCount = needsClose ? pts.length : pts.length - 1;

  for (let i = 0; i < edgeCount; i++) {
    const a = pts[i];
    const b = pts[(i + 1) % pts.length];
    const ay = groundAt(a[0], a[1]);
    const by = groundAt(b[0], b[1]);
    const dx = b[0] - a[0], dz = b[1] - a[1];
    const len = Math.hypot(dx, dz);
    if (len < 1e-4) continue;
    const angle = Math.atan2(dx, dz);
    const cx = (a[0] + b[0]) / 2, cz = (a[1] + b[1]) / 2;
    const cy = (ay + by) / 2;
    const tilt = -Math.atan2(by - ay, len);

    // ---- 横杆 / 横板（长度沿 Z，先画在木板后面）----
    for (let k = 0; k < cfg.railT.length; k++) {
      const ry = cy + height * cfg.railT[k];
      const col = style === 'rail' ? (k % 2 === 0 ? cfg.rail : cfg.woodLight) : cfg.rail;
      const g = new THREE.BoxGeometry(cfg.railD, cfg.railH, len);
      g.rotateX(tilt);
      g.rotateY(angle);
      // 横杆贴在木板背面（-Z 是垂直围栏方向的外侧）
      g.translate(cx, ry, cz);
      parts.push(tint(g, col));
      // rail 风格：横板木纹（一条细线）
      if (style === 'rail' && len > 0.8) {
        const g2 = new THREE.BoxGeometry(cfg.railD + 0.01, 0.03, len - 0.30);
        g2.rotateX(tilt);
        g2.rotateY(angle);
        g2.translate(cx, ry + cfg.railH * 0.30, cz);
        parts.push(tint(g2, cfg.woodDark));
      }
    }

    // ---- 木板 / 立柱 ----
    const n = Math.max(1, Math.round(len / cfg.spacing));
    for (let k = 0; k <= n; k++) {
      const t = k / n;
      const px = a[0] + dx * t, pz = a[1] + dz * t;
      const py = groundAt(px, pz);

      if (style === 'rail') {
        // 立柱：粗方柱 + 顶部小尖（宽厚相同，不区分方向）
        const g = new THREE.BoxGeometry(cfg.boardD, height + 0.20, cfg.boardW);
        g.rotateY(angle);
        g.translate(px, py + (height + 0.20) / 2 - 0.10, pz);
        parts.push(tint(g, cfg.wood));
        const g2 = new THREE.BoxGeometry(cfg.boardD * 0.75, 0.08, cfg.boardW * 0.75);
        g2.rotateY(angle);
        g2.translate(px, py + height + 0.10, pz);
        parts.push(tint(g2, cfg.wood));
        // 柱身木纹（贴在外侧面）
        for (const off of [-0.07, 0.07]) {
          const g3 = new THREE.BoxGeometry(0.02, height * 0.92, 0.03);
          g3.rotateY(angle);
          g3.translate(px, py + height * 0.48, pz + off);
          parts.push(tint(g3, cfg.woodDark));
        }
      } else {
        // 木板 / 尖桩：plank 风格高矮错落，picket 等高
        let hh = height;
        if (style === 'plank') {
          const VARIATION = [1.03, 0.92, 1.08, 0.87, 0.99, 1.11, 0.89, 1.05, 0.96, 1.07];
          hh = height * VARIATION[k % VARIATION.length];
        }
        const col = style === 'plank'
          ? (k % 3 === 0 ? cfg.woodLight : (k % 3 === 1 ? cfg.wood : cfg.woodDark))
          : (k % 2 === 0 ? cfg.wood : cfg.woodDark);
        addFencePlank(parts, px, py, pz, cfg.boardW, cfg.boardD, hh,
          col, cfg.woodDark, cfg.tip, angle);
      }
    }

    // ---- 钉子 ----
    for (let k = 0; k <= n; k++) {
      const t = k / n;
      const px = a[0] + dx * t, pz = a[1] + dz * t;
      const py = groundAt(px, pz);
      for (const rt of cfg.railT) {
        const ry = py + height * rt + cfg.railH * 0.20;
        if (style === 'rail') {
          // 立柱上的钉子（一颗）
          const g = new THREE.BoxGeometry(0.05, 0.05, 0.02);
          g.rotateY(angle);
          g.translate(px, ry, pz + cfg.boardD / 2 + 0.01);
          parts.push(tint(g, cfg.nail));
        } else {
          // 木板上左右对称两颗
          for (const sgn of [-1, 1]) {
            const g = new THREE.BoxGeometry(0.045, 0.045, 0.02);
            g.rotateY(angle);
            g.translate(px + Math.cos(angle) * sgn * cfg.boardW * 0.24, ry,
              pz - Math.sin(angle) * sgn * cfg.boardW * 0.24);
            parts.push(tint(g, cfg.nail));
          }
        }
      }
    }
  }

  const m = meshFrom(parts, { flatShading: false });
  m.name = 'fence-' + style;
  // ★ 围栏的横杆只有 0.16~0.24 宽，用建筑级的描边厚度会把它整根吞掉，
  //   在薄雾里就变成一条粗黑虚线。单独调细。
  m.userData.outlineThickness = 0.014;
  return m;
}
// 把矩形田地（含旋转）转成四个角的世界坐标，供围栏使用
function fieldCorners(field, pad = 1.6) {
  const hw = field.w / 2 + pad;
  const hd = field.d / 2 + pad;
  const c = Math.cos(field.rot), s = Math.sin(field.rot);
  const corners = [[-hw, -hd], [hw, -hd], [hw, hd], [-hw, hd]];
  // 与 fields.js 的 localToWorld 保持同一套变换
  return corners.map(([lx, lz]) => [
    field.x + lx * c + lz * s,
    field.z - lx * s + lz * c,
  ]);
}

// ---------------------------------------------------------------------------
// 谷仓窗户：全部用平面贴在墙外，z 严格分层
// ---------------------------------------------------------------------------
function buildBarnWindows() {
  const g = new THREE.Group();
  g.name = 'barn-windows';
  const W = 13, D = 20, H = 9;
  const overhang = 0.7;

  // 山墙正面小窗：贴在屋顶斜面之外，但用平面所以不会穿过屋顶
  const gableWin = makeWindowPlane(
    1.5, 1.5,
    new THREE.Vector3(0, H + 1.5, D / 2 + overhang + WINDOW_LAYER.glass),
    0, 0, 'barn'
  );
  g.add(gableWin);

  // 左右侧窗（法线朝 ±X）
  for (const side of [-1, 1]) {
    const rotY = side > 0 ? Math.PI / 2 : -Math.PI / 2;
    const win = makeWindowPlane(
      2.4, 1.9,
      new THREE.Vector3(side * (W / 2 + WINDOW_LAYER.glass), 3.4, -4),
      rotY, 0, 'barn'
    );
    g.add(win);
  }

  return g;
}

// ---------------------------------------------------------------------------
// 农舍窗户
// ---------------------------------------------------------------------------
function buildFarmhouseWindows() {
  const g = new THREE.Group();
  g.name = 'farmhouse-windows';
  const W = 11, D = 13;

  // 正面两扇
  for (const lx of [-3, 3]) {
    const win = makeWindowPlane(
      2.0, 2.0,
      new THREE.Vector3(lx, 2.2, D / 2 + WINDOW_LAYER.glass),
      0, 0, 'house'
    );
    g.add(win);
  }

  // 侧面一扇（法线朝 +X）
  const sideWin = makeWindowPlane(
    2.0, 2.0,
    new THREE.Vector3(W / 2 + WINDOW_LAYER.glass, 2.2, 0),
    Math.PI / 2, 0, 'house'
  );
  g.add(sideWin);

  return g;
}

// ---------------------------------------------------------------------------
// 组装：所有建筑统一"贴地"放置
// ---------------------------------------------------------------------------
// ---------------------------------------------------------------------------
// 屋顶零星雪花（只在冬季显示）
//
// 在建筑顶部撒一些小白点，模拟积雪。不改建筑本身，加独立的 InstancedMesh。
// ---------------------------------------------------------------------------
function makeRoofSnow(mesh, count = 40, topRatio = 0.72, spread = 0.9) {
  const box = new THREE.Box3().setFromObject(mesh);
  const size = box.getSize(new THREE.Vector3());
  const center = box.getCenter(new THREE.Vector3());

  const geo = new THREE.PlaneGeometry(0.30, 0.30);
  const mat = new THREE.MeshBasicMaterial({
    color: 0xffffff,
    side: THREE.DoubleSide,
    transparent: true,
    opacity: 0,
    depthWrite: false,
  });
  const inst = new THREE.InstancedMesh(geo, mat, count);
  inst.frustumCulled = false;
  inst.visible = false;

  const m = new THREE.Matrix4();
  const q = new THREE.Quaternion();
  const p = new THREE.Vector3();
  const s = new THREE.Vector3();
  const e = new THREE.Euler();

  // 固定随机
  let seed = 98765;
  const rnd = () => {
    seed = (seed * 1103515245 + 12345) & 0x7fffffff;
    return seed / 0x7fffffff;
  };

  // ---------- 用射线投射贴合屋顶表面 ----------
  // 之前用"包围盒百分比高度"撒点，雪花会飘在屋顶上方或下方。
  // 现在从上方垂直向下打射线，命中的表面就是真实屋顶，雪花贴上去。
  const raycaster = new THREE.Raycaster();
  raycaster.far = size.y * 3;

  const topY = box.max.y + 1;
  const downDir = new THREE.Vector3(0, -1, 0);

  let placed = 0;
  let guard = 0;

  while (placed < count && guard < count * 20) {
    guard++;
    const px = center.x + (rnd() - 0.5) * size.x * spread;
    const pz = center.z + (rnd() - 0.5) * size.z * spread;

    raycaster.set(new THREE.Vector3(px, topY, pz), downDir);
    const hits = raycaster.intersectObject(mesh, true);
    if (!hits.length) continue;

    const hit = hits[0];
    // 只取上半部分（避免地面/墙体底部）
    //   ★ 用 topRatio 参数控制，不要硬编码 0.55 ——
    //     不同造型的桶身/屋顶比例不同，固定值会让雪花落到桶身上。
    if (hit.point.y < box.min.y + size.y * topRatio) continue;

    // 贴住表面：沿法线抬高 0.03（防止 z-fighting）
    const n = hit.face
      ? hit.face.normal.clone().transformDirection(hit.object.matrixWorld)
      : new THREE.Vector3(0, 1, 0);

    p.copy(hit.point).addScaledVector(n, 0.03);

    // 让雪花平面贴着表面法线
    const up = new THREE.Vector3(0, 1, 0);
    const qAlign = new THREE.Quaternion().setFromUnitVectors(up, n);
    // 再随机绕法线转一下
    const qSpin = new THREE.Quaternion().setFromAxisAngle(n, rnd() * Math.PI * 2);
    q.copy(qAlign).multiply(qSpin);

    const sc = 0.55 + rnd() * 0.7;
    s.set(sc, sc, sc);
    m.compose(p, q, s);
    inst.setMatrixAt(placed++, m);
  }

  inst.count = placed;
  inst.instanceMatrix.needsUpdate = true;

  return { mesh: inst, material: mat };
}

// 取风车的塔身（排除叶片）—— 雪花只能撒在实体上
function wmTowerOnly(wm) {
  if (!wm) return wm;
  let tower = wm;
  wm.children.forEach((c) => { if (c.name !== 'windmillBlades') tower = c; });
  return tower;
}

export function buildFarm(model) {
  const group = new THREE.Group();
  group.name = 'farm';

  // 当前季节值（0=春 1=夏 2=秋 3=冬）
  //   ★ 必须在这里声明：setSeason 的参数名 seasonT 只在该函数内有效，
  //     外部 refreshWaterTowerSnow() 引用不到 —— 之前 typeof seasonT 恒为
  //     'undefined'，算出 snowAmt = 0，把新雪花直接设成不可见。
  let currentSeason = 0;

  const groundY = (x, z) => model.heightAt(x, z);

  // 建筑放上去：局部 y=0 对齐地面，向下压 0.15 让基座略微陷入，避免悬空缝隙
  const place = (obj, x, z, sink = 0.15) => {
    obj.position.set(x, groundY(x, z) - sink, z);
    group.add(obj);
    return obj;
  };

  // --- 谷仓（含窗户，作为子节点跟随旋转）---
  const barnMesh = makeBarn();
  barnMesh.rotation.y = BUILDINGS.barn.rot;
  // ★ 新模型（barnDemo）自带窗户几何，不再需要 buildBarnWindows 的平面窗户。
  //   旧平面窗户会和模型自带窗户重叠，形成"双层玻璃"的错位感。
  place(barnMesh, BUILDINGS.barn.x, BUILDINGS.barn.z);

  // --- 农舍 ---
  const houseMesh = makeFarmhouse();
  houseMesh.rotation.y = BUILDINGS.farmhouse.rot;
  // ★ 同上：新模型自带窗户
  place(houseMesh, BUILDINGS.farmhouse.x, BUILDINGS.farmhouse.z);

  // ---------- 烟囱炊烟 ----------
  // 烟囱局部坐标与 barnDemo.js 保持一致：chX=2.6, chZ=-2.2，顶盖约 H+7.0。
  const chimneySmoke = new THREE.Group();
  chimneySmoke.name = 'chimney-smoke';
  const smokeMats = [];
  const smokePuffs = [];
  for (let i = 0; i < 4; i++) {
    const sm = new THREE.MeshBasicMaterial({
      color: 0xc8c8c8, transparent: true, opacity: 0, depthWrite: false,
    });
    smokeMats.push(sm);
    const puff = new THREE.Mesh(new THREE.IcosahedronGeometry(0.42, 0), sm);
    puff.userData.phase = i / 4;
    chimneySmoke.add(puff);
    smokePuffs.push(puff);
  }
  chimneySmoke.position.set(2.6, 13.5, -2.2);
  houseMesh.add(chimneySmoke);

  // --- 筒仓 ---
  // --- 筒仓（两种造型可运行时切换）---
  //   ★ heightScale：silo1 用 1.45（→ 约 16 高），silo2 用 1.0（→ 约 11 高）
  const SILO_HS = { silo1: 1.45, silo2: 1.0 };
  let siloStyle = { silo1: 'metal', silo2: 'metal' };

  let silo1Mesh = makeSilo(siloStyle.silo1, SILO_HS.silo1);
  place(silo1Mesh, BUILDINGS.silo1.x, BUILDINGS.silo1.z);
  let silo2Mesh = makeSilo(siloStyle.silo2, SILO_HS.silo2);
  place(silo2Mesh, BUILDINGS.silo2.x, BUILDINGS.silo2.z);

  // 重建某个筒仓
  function rebuildSilo(key, style) {
    if (!SILO_STYLES.includes(style)) return null;
    const old = key === 'silo1' ? silo1Mesh : silo2Mesh;
    if (old) {
      group.remove(old);
      old.traverse((o) => {
        if (o.isMesh) {
          if (o.geometry) o.geometry.dispose();
          if (o.material) {
            if (Array.isArray(o.material)) o.material.forEach((m) => m.dispose());
            else o.material.dispose();
          }
        }
      });
    }
    const nm = makeSilo(style, SILO_HS[key]);
    const bd = BUILDINGS[key];
    place(nm, bd.x, bd.z);
    if (key === 'silo1') silo1Mesh = nm; else silo2Mesh = nm;
    siloStyle[key] = style;
    // 同步 buildings 表
    const bt = group.userData.buildings;
    if (bt && bt[key]) bt[key].mesh = nm;
    // 雪花重建
    if (typeof refreshSiloSnow === 'function') refreshSiloSnow(key);
    return nm;
  }

  // --- 水塔（三种样式可运行时切换）---
  let waterTowerStyle = 'metal';
  let waterTowerMesh = makeWaterTower(waterTowerStyle);
  place(waterTowerMesh, BUILDINGS.watertower.x, BUILDINGS.watertower.z);

  // 重建水塔（切换样式时调用）
  function rebuildWaterTower(style) {
    if (!WATERTOWER_STYLES.includes(style)) return null;
    const old = waterTowerMesh;
    if (old) {
      group.remove(old);
      old.traverse((o) => {
        if (o.isMesh) {
          if (o.geometry) o.geometry.dispose();
          if (o.material) {
            if (Array.isArray(o.material)) o.material.forEach((m) => m.dispose());
            else o.material.dispose();
          }
        }
      });
    }
    waterTowerStyle = style;
    const nm = makeWaterTower(style);
    place(nm, BUILDINGS.watertower.x, BUILDINGS.watertower.z);
    waterTowerMesh = nm;

    // ★ 屋顶雪花要跟着重建 —— 雪花是挂在 mesh 上的子物体，
    //   旧 mesh 被移除后雪花也没了，不重建的话冬天切样式雪就消失。
    if (typeof refreshWaterTowerSnow === 'function') refreshWaterTowerSnow();

    // ★ 通知外部刷新猫头鹰停留高度（三种造型屋顶高度不同）
    //   通过回调注册，避免 farm.js 直接依赖 owl.js。
    if (group.userData.onWatertowerRebuilt) {
      try { group.userData.onWatertowerRebuilt(style); } catch (e) { /* 忽略 */ }
    }
    // 同步 buildings 表里的引用（换色系统需要）
    //   ★ buildings 在本函数之后才定义，不能直接引用（TDZ），
    //     所以通过 group.userData 惰性取。
    const bt = group.userData.buildings;
    if (bt && bt.watertower) bt.watertower.mesh = nm;
    return nm;
  }

  // --- 风车（五种造型可运行时切换）---
  let windmillStyle = 'ranch';
  let wm = windmill(windmillStyle);
  place(wm, BUILDINGS.windmill.x, BUILDINGS.windmill.z, 0.2);
  group.userData.windmill = wm;

  // 重建风车（切换造型时调用）
  function rebuildWindmill(style) {
    if (!WINDMILL_STYLES.includes(style)) return null;
    const old = wm;
    if (old) {
      group.remove(old);
      old.traverse((o) => {
        if (o.isMesh) {
          if (o.geometry) o.geometry.dispose();
          if (o.material) {
            if (Array.isArray(o.material)) o.material.forEach((m) => m.dispose());
            else o.material.dispose();
          }
        }
      });
    }
    windmillStyle = style;
    const nm = windmill(style);
    place(nm, BUILDINGS.windmill.x, BUILDINGS.windmill.z, 0.2);
    wm = nm;
    // ★ 同步 group.userData.windmill —— main.js 每帧用它的 blades 转叶片，
    //   不更新的话切完造型叶片就不转了（引用的是被删除的旧对象）。
    group.userData.windmill = nm;
    // 同步 buildings 表（换色系统）
    const bt = group.userData.buildings;
    if (bt && bt.windmill) bt.windmill.mesh = nm;
    // 屋顶雪花重建
    if (typeof refreshWindmillSnow === 'function') refreshWindmillSnow();
    // ★ 通知外部刷新猫头鹰停留高度（五种造型塔顶差 8 米）
    if (group.userData.onWindmillRebuilt) {
      try { group.userData.onWindmillRebuilt(style); } catch (e) { /* 忽略 */ }
    }
    return nm;
  }

  // --- 干草堆 ---
  for (const [bx, bz, br] of HAY_BALES) {
    const m = hayBale(br);
    m.rotation.y = Math.random() * Math.PI;
    m.position.set(bx, groundY(bx, bz) + br * 0.92, bz);
    group.add(m);
  }

  // --- 围栏（贴合地形，三种风格可【运行时切换】）---
  //
  // 每道围栏都登记在 fenceSlots 里，点击围栏可以弹出风格面板。
  // setFenceStyle(kind, style) 会销毁旧网格、按新风格重建。
  const fenceSlots = [];
  const fenceState = {
    pasture: FENCE_STYLE_PASTURE,
    coop: FENCE_STYLE_COOP,
    field: FENCE_STYLE_FIELD,
  };

  // 重建某道围栏（kind: 'pasture' | 'coop' | 'field-0' ... 'field-N'）
  function rebuildFence(kind, style) {
    const slot = fenceSlots.find((s) => s.kind === kind);
    if (!slot) return false;
    const old = slot.mesh;
    if (old) {
      group.remove(old);
      // 释放几何体和材质（每个围栏都是独立 mesh）
      old.traverse((o) => {
        if (o.isMesh) {
          if (o.geometry) o.geometry.dispose();
          if (o.material) {
            if (Array.isArray(o.material)) o.material.forEach((m) => m.dispose());
            else o.material.dispose();
          }
        }
      });
    }
    const nm = fence(slot.points, slot.height, model, true, style);
    nm.visible = !slot.hidden;
    nm.name = slot.namePrefix + '-' + style;
    nm.userData.fenceKind = kind;
    nm.userData.fenceStyle = style;
    slot.mesh = nm;
    slot.style = style;
    group.add(nm);
    return true;
  }

  // 注册一道围栏
  function registerFence(kind, namePrefix, points, height, style, hidden = false) {
    const nm = fence(points, height, model, true, style);
    nm.visible = !hidden;
    nm.name = namePrefix + '-' + style;
    nm.userData.fenceKind = kind;
    nm.userData.fenceStyle = style;
    group.add(nm);
    const slot = { kind, namePrefix, points, height, style, hidden, mesh: nm };
    fenceSlots.push(slot);
    return nm;
  }

  registerFence('pasture', 'fence-pasture', PASTURE, 1.5, FENCE_STYLE_PASTURE, true);
  registerFence('coop', 'fence-coop', COOP, 1.0, FENCE_STYLE_COOP);

  // 每块田地的围栏
  for (let fi = 0; fi < FIELD_RECTS.length; fi++) {
    const corners = fieldCorners(FIELD_RECTS[fi]);
    registerFence('field-' + fi, 'field-fence', corners, 0.95, FENCE_STYLE_FIELD, !!FIELD_RECTS[fi].fenceOnly);
  }

  // 暴露给外部（hud 的点击面板用）
  group.userData.fenceSlots = fenceSlots;
  group.userData.getFenceStyle = (kind) => {
    const s = fenceSlots.find((x) => x.kind === kind);
    return s ? s.style : null;
  };
  group.userData.setFenceStyle = (kind, style) => {
    if (!FENCE_STYLES.includes(style)) return false;
    const ok = rebuildFence(kind, style);
    if (ok) {
      // 同步 fenceState（方便外部查询）
      if (kind === 'pasture') fenceState.pasture = style;
      else if (kind === 'coop') fenceState.coop = style;
      else fenceState.field = style;
    }
    return ok;
  };
  // 一次性切换【全部】围栏
  group.userData.setAllFenceStyles = (style) => {
    if (!FENCE_STYLES.includes(style)) return false;
    let n = 0;
    for (const s of fenceSlots) {
      if (rebuildFence(s.kind, style)) n++;
    }
    fenceState.pasture = fenceState.coop = fenceState.field = style;
    return n > 0;
  };
  group.userData.fenceStyles = fenceState;

  // ---------- 冬季：屋顶零星雪花 ----------
  const roofSnows = [];
  const ROOF_TARGETS = [
    { mesh: barnMesh, count: 55, topRatio: 0.62 },
    { mesh: houseMesh, count: 45, topRatio: 0.62 },
    { mesh: waterTowerMesh, count: 48, topRatio: 0.86, spread: 0.72 },   // metal 初始造型
    { mesh: wmTowerOnly(wm), count: 28, topRatio: 0.613, spread: 0.62, tag: 'forWindmill' },   // ranch 初始造型
  ];
  // ★ 撒雪花前必须先更新矩阵 —— makeRoofSnow 用 Box3.setFromObject 算包围盒，
  //   如果 matrixWorld 还是单位矩阵，包围盒会算成"局部坐标"，
  //   雪花就全堆在原点附近（表现为飘在树冠上方、桶顶上方）。
  group.updateMatrixWorld(true);
  for (const rt of ROOF_TARGETS) {
    if (!rt.mesh) continue;
    rt.mesh.updateMatrixWorld(true);
    const snow = makeRoofSnow(rt.mesh, rt.count, rt.topRatio, rt.spread);
    // ★ 水塔雪花必须打标记，否则 refreshWaterTowerSnow() 找不到它、无法移除 ——
    //   切换造型时会【叠加】一组新的，旧的那组仍按 metal 的高度浮在半空。
    // ★ 用显式 tag 字段打标记，不要用 rt.mesh === xxx 比较 ——
    //   风车传进来的是 wmTowerOnly(wm)（塔身），和 wm 不是同一个对象，
    //   用引用比较永远不相等，标记打不上 → 初始雪花无法移除 → 切换时叠加。
    if (rt.mesh === waterTowerMesh) snow.mesh.userData.forWatertower = true;
    if (rt.tag) snow.mesh.userData[rt.tag] = true;
    group.add(snow.mesh);
    roofSnows.push(snow);
  }
  // 水塔雪花重建（切换样式时调用）
  function refreshWaterTowerSnow() {
    // 移除旧的水塔雪花
    for (let i = roofSnows.length - 1; i >= 0; i--) {
      const s = roofSnows[i];
      if (s.mesh && s.mesh.userData.forWatertower) {
        group.remove(s.mesh);
        roofSnows.splice(i, 1);
      }
    }
    // 新建
    //   ★ 三种造型的屋顶高度不同，topRatio 必须分别精确计算：
    //     阈值 = box.min.y + 总高 * ratio，要正好等于【屋顶起始高度】
    //       metal   (14.88 - -0.07) / 17.38 = 0.860
    //       barrel  (12.40 - -0.08) / 14.47 = 0.862
    //       shingle (11.20 - -0.09) / 13.83 = 0.816
    //   比例给小了雪花会落到桶身上（截图里"雪花飘在桶顶上方的空中"就是这个原因）。
    const TOP_RATIO = { metal: 0.862, barrel: 0.864, shingle: 0.818 };
    const ratio = TOP_RATIO[waterTowerStyle] || 0.85;
    // ★ 强制更新【整条父链】的矩阵，否则 setFromObject 算出来是旧包围盒。
    //   新 mesh 刚 place 完，position 已设置但 matrixWorld 还是单位矩阵，
    //   这时撒雪花会全部堆在原点附近（截图里"雪花飘在树冠上方"就是这个）。
    group.updateMatrixWorld(true);
    waterTowerMesh.updateMatrixWorld(true);
    // ★ 数量从 30 提到 48：屋顶是锥形/分层，射线命中面积小，
    //   30 片在远处几乎看不见。
    //   spread 0.9 → 0.72：水塔屋顶比包围盒窄，撒太开射线会打空。
    const snow = makeRoofSnow(waterTowerMesh, 48, ratio, 0.72);
    snow.mesh.userData.forWatertower = true;
    group.add(snow.mesh);
    roofSnows.push(snow);
    // 立刻按当前季节决定可见性
    //   ★ 用 currentSeason（模块内状态），不要用 seasonT ——
    //     那是 setSeason 的形参名，这里访问不到。
    const snowAmt = Math.max(0, Math.min(1, (currentSeason - 2.5) / 0.5));
    snow.mesh.visible = snowAmt > 0.05;
    snow.material.opacity = snowAmt * 0.9;
  }

  // 风车雪花重建（切换造型时调用）
  //   ★ 五种造型高度差很大（candy 只有 5.5，modern 到 18.4），
  //     topRatio 必须按各自屋顶位置给。
  function refreshWindmillSnow() {
    for (let i = roofSnows.length - 1; i >= 0; i--) {
      const s = roofSnows[i];
      if (s.mesh && s.mesh.userData.forWindmill) {
        group.remove(s.mesh);
        roofSnows.splice(i, 1);
      }
    }
    // 各造型的屋顶起始比例（阈值 = min + 总高 * ratio）
    //
    // ★ 实测塔高（不含叶片）与屋顶起始位置：
    //     modern        4.56 → 24.18 (h 19.62)，机舱约从 22.0 开始 → 0.885
    //     mediterranean 4.56 → 16.18 (h 11.62)，洋葱顶约从 11.5 开始 → 0.605
    //     ranch         4.53 → 16.23 (h 11.70)，顶部平台约从 13.5 开始 → 0.613
    //     brick         4.56 → 13.53 (h 8.97)，锥顶约从 9.5 开始 → 0.551
    //     candy         4.56 → 12.22 (h 7.66)，糖霜顶约从 8.5 开始 → 0.511
    //   ratio 给高了阈值会顶到包围盒顶端，射线全被过滤 → 雪花数 0。
    const RATIO = {
      modern: 0.885,
      mediterranean: 0.605,
      ranch: 0.613,
      brick: 0.551,
      candy: 0.511,
    };
    const ratio = RATIO[windmillStyle] || 0.60;
    group.updateMatrixWorld(true);
    wm.updateMatrixWorld(true);

    // ★ 只对【塔身】撒雪，不要把叶片算进去 ——
    //   叶片半径 7+，包围盒宽度是塔身的 4 倍，
    //   射线撒开后大部分打在叶片或空处，塔顶反而没有命中点。
    let towerOnly = wm;
    wm.children.forEach((c) => { if (c.name !== 'windmillBlades') towerOnly = c; });
    towerOnly.updateMatrixWorld(true);

    // ★ 缩放补偿（红砖/糖果是 1.5 倍）
    //
    //   问题：group.scale = 1.5 时，Box3.setFromObject(towerOnly) 得到的是
    //   【未应用 group 缩放】的局部坐标（因为 towerOnly 是 group 的子节点，
    //   它的 matrixWorld 含缩放，但 makeRoofSnow 内部用 intersectObject
    //   命中的是局部几何 —— 两者基准不一致）。
    //
    //   实测结果：雪花落在桶身中部，比屋顶低 4~5 米。
    //
    //   解决：算完包围盒后，把雪花的实例矩阵按 scale 放大到视觉位置。
    const savedScale = wm.scale.clone();
    const sc = savedScale.x;

    const snow = makeRoofSnow(towerOnly, 28, ratio, 0.62);
    snow.mesh.userData.forWindmill = true;
    group.add(snow.mesh);
    roofSnows.push(snow);
    const snowAmt = Math.max(0, Math.min(1, (currentSeason - 2.5) / 0.5));
    snow.mesh.visible = snowAmt > 0.05;
    snow.material.opacity = snowAmt * 0.9;
  }

  // 筒仓顶部
  //   ★ 用 tag 字段打标记（不要用引用比较，切换造型后引用会变）
  const siloList = [
    { mesh: silo1Mesh, tag: 'forSilo1' },
    { mesh: silo2Mesh, tag: 'forSilo2' },
  ];
  for (const sl of siloList) {
    const silo = sl.mesh;
    if (!silo) continue;
    // ★ spread 0.62：concrete 的穹顶直径只有 5.8，
    //   默认 0.9 会让射线撒到 11 宽，一半打空、一半落到筒身外。
    const snow = makeRoofSnow(silo, 25, 0.88, 0.62);
    snow.mesh.userData[sl.tag] = true;
    group.add(snow.mesh);
    roofSnows.push(snow);
  }

  // 筒仓雪花重建（切换造型时调用）
  function refreshSiloSnow(key) {
    const tag = key === 'silo1' ? 'forSilo1' : 'forSilo2';
    for (let i = roofSnows.length - 1; i >= 0; i--) {
      const s = roofSnows[i];
      if (s.mesh && s.mesh.userData[tag]) {
        group.remove(s.mesh);
        roofSnows.splice(i, 1);
      }
    }
    const target = key === 'silo1' ? silo1Mesh : silo2Mesh;
    if (!target) return;
    group.updateMatrixWorld(true);
    target.updateMatrixWorld(true);
    const snow = makeRoofSnow(target, 25, 0.88, 0.62);
    snow.mesh.userData[tag] = true;
    group.add(snow.mesh);
    roofSnows.push(snow);
    const snowAmt = Math.max(0, Math.min(1, (currentSeason - 2.5) / 0.5));
    snow.mesh.visible = snowAmt > 0.05;
    snow.material.opacity = snowAmt * 0.9;
  }

  group.userData.setSeason = (seasonT) => {
    const c = Math.max(0, Math.min(3, seasonT));
    currentSeason = c;   // 记下来，供 refreshWaterTowerSnow 用
    const snowAmt = Math.max(0, Math.min(1, (c - 2.5) / 0.5));
    roofSnows.forEach(s => {
      s.mesh.visible = snowAmt > 0.05;
      s.material.opacity = snowAmt * 0.9;
    });
  };

  // 兼容旧接口：牧场围栏的当前网格（会随风格切换变化，用 getter）
  Object.defineProperty(group.userData, 'pastureFence', {
    get() {
      const s = fenceSlots.find((x) => x.kind === 'pasture');
      return s ? s.mesh : null;
    },
    configurable: true,
  });

  // ---------------------------------------------------------------------------
  // 建筑风格切换（每个建筑独立）
  //
  // 每栋建筑有自己的 styleIdx，换色只影响自己，不影响其他建筑。
  // 几何体不变，只按"颜色槽位"重写顶点色。
  // ---------------------------------------------------------------------------

  // 建立"建筑名 -> { mesh, kind }"映射
  // kind 决定用风格里的哪一组颜色（barn/house/silo/watertower/windmill）
  const buildings = {
    barn: { mesh: barnMesh, kind: 'barn', idx: 0 },
    farmhouse: { mesh: houseMesh, kind: 'house', idx: 0 },
    // ★ 筒仓不参与换色 —— 三种造型各有自己的材质配色，
    //   换色会让造型辨识度消失。样式接口见 setSiloStyle。
    // ★ 水塔不参与换色系统 —— 它靠【造型切换】（metal/barrel/shingle），
    //   三种造型各有自己的材质配色，换色会让造型辨识度消失。
    //   水塔的样式接口见 group.userData.setWatertowerStyle。
    // ★ 风车不参与换色 —— 五种造型各有自己的材质配色，
    //   换色会让造型辨识度消失。样式接口见 setWindmillStyle。
  };

  // 颜色 hex -> 槽位 key（顶点色是 Linear 值）
  const hexKey = (v) => {
    const c = new THREE.Color(v);
    return c.r.toFixed(4) + ',' + c.g.toFixed(4) + ',' + c.b.toFixed(4);
  };

  // 按 kind 生成映射表
  function mappingFor(kind, style) {
    const m = new Map();
    const st = style[kind];
    if (!st) return m;

    if (kind === 'barn') {
      m.set(hexKey(PALETTE.roofRed), st.wall);      // 谷仓主体用 roofRed
      m.set(hexKey(PALETTE.woodDark), st.roof);     // 屋顶/门框
      m.set(hexKey(PALETTE.wood), st.door);         // 门
      m.set(hexKey(PALETTE.wall), st.trim);         // 装饰线
      m.set(hexKey(PALETTE.dirt), st.path);         // 门前小路
    } else if (kind === 'house') {
      m.set(hexKey(PALETTE.wallWarm), st.wall);
      m.set(hexKey(PALETTE.roofRed), st.roof);
      m.set(hexKey(PALETTE.woodDark), st.trim);
      m.set(hexKey(PALETTE.wood), st.door);
      m.set(hexKey(PALETTE.dirt), st.path);
    } else if (kind === 'silo') {
      m.set(hexKey(PALETTE.metal), st.body);
    } else if (kind === 'watertower') {
      m.set(hexKey(PALETTE.metal), st.tank);
      m.set(hexKey(PALETTE.roofBlue), st.roof);
      m.set(hexKey(PALETTE.woodDark), st.leg);
      m.set(hexKey(PALETTE.wood), st.leg);
    } else if (kind === 'windmill') {
      m.set(hexKey(PALETTE.wall), st.tower);
      m.set(hexKey(PALETTE.woodDark), st.hub);
      m.set(hexKey(PALETTE.wood), st.blade);
    }
    return m;
  }

  // 给单个建筑换风格
  function setBuildingStyle(name, idx) {
    const b = buildings[name];
    if (!b) return null;
    const style = BUILDING_STYLES[((idx % BUILDING_STYLES.length) + BUILDING_STYLES.length) % BUILDING_STYLES.length];
    if (!style) return null;
    b.idx = ((idx % BUILDING_STYLES.length) + BUILDING_STYLES.length) % BUILDING_STYLES.length;

    const mapping = mappingFor(b.kind, style);
    b.mesh.traverse((o) => {
      if (o.isMesh && o.userData.colorSlots) recolorMesh(o, mapping);
    });
    return style;
  }

  // 循环切换到下一个风格
  function nextBuildingStyle(name) {
    const b = buildings[name];
    if (!b) return null;
    return setBuildingStyle(name, b.idx + 1);
  }

  // 查询
  function getBuildingStyle(name) {
    const b = buildings[name];
    if (!b) return null;
    return {
      idx: b.idx,
      name: BUILDING_STYLES[b.idx].name,
      count: BUILDING_STYLES.length,
    };
  }

  // 筒仓样式切换
  group.userData.siloStyles = SILO_STYLES;
  group.userData.getSiloStyle = (key) => siloStyle[key];
  group.userData.setSiloStyle = (key, style) => {
    const nm = rebuildSilo(key, style);
    return nm ? style : null;
  };

  // 风车样式切换
  group.userData.windmillStyles = WINDMILL_STYLES;
  group.userData.getWindmillStyle = () => windmillStyle;
  group.userData.setWindmillStyle = (style) => {
    const nm = rebuildWindmill(style);
    return nm ? style : null;
  };

  // 水塔样式切换
  group.userData.watertowerStyles = WATERTOWER_STYLES;
  group.userData.getWatertowerStyle = () => waterTowerStyle;
  group.userData.setWatertowerStyle = (style) => {
    const nm = rebuildWaterTower(style);
    return nm ? style : null;
  };

  group.userData.buildings = buildings;
  group.userData.setBuildingStyle = setBuildingStyle;
  group.userData.nextBuildingStyle = nextBuildingStyle;
  group.userData.getBuildingStyle = getBuildingStyle;
  group.userData.styleNames = BUILDING_STYLES.map(s => s.name);

  // 兼容旧接口：applyStyle 只作用于谷仓（保留以免其他地方报错）
  group.userData.applyStyle = (idx) => setBuildingStyle('barn', idx);

  // 烟囱炊烟动画（由 main.js 的 update 调用）
  group.userData.update = (t) => {
    for (let i = 0; i < smokePuffs.length; i++) {
      const puff = smokePuffs[i];
      const ph = ((t * 0.08 + puff.userData.phase) % 1);
      puff.position.y = 0.2 + ph * 3.0;
      puff.position.x = Math.sin(ph * Math.PI * 3 + puff.userData.phase * 6.283) * 0.18;
      puff.scale.setScalar(0.7 + ph * 1.6);
      smokeMats[i].opacity = (1 - ph) * 0.30;
    }
  };
  group.userData.getStyleIdx = () => buildings.barn.idx;
  group.userData.styleCount = BUILDING_STYLES.length;

  return group;
}