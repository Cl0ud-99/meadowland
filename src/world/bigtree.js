import * as THREE from 'three';
import { makeBirch, makeOak, makeSpruce, makeAutumnTree, setSkipFallenLeaves } from './treeDemo.js';
import { BIG_TREE_KINDS as BIG_TREE_LOWPOLY } from './bigtreesLowpoly.js';
import { tint, merge } from '../util/geo.js';
import { toonLambert } from '../render/toon.js';

// ---------------------------------------------------------------------------
// 参天大树（农场中心地标）
//
// 位置：(-2, -18)，谷仓与农舍之间，鸡舍南侧。
// 尺寸：树干高 14，树冠半径 10，总高约 26 —— 比风车（26）略低，但明显高于谷仓（14）。
//
// 结构：
//   - 树干：8 边柱，底部粗顶部细，带树皮纹路
//   - 主枝：4 根斜向上的粗枝
//   - 树冠：3 层不规则球体（低多边形），颜色由深到浅
//   - 树根：4 条外露的粗根
//   - 飘落叶子：少量粒子，四季变色
// ---------------------------------------------------------------------------

// ★ 这些常量决定"飘落叶子"和"树冠雪花"的作用范围，
//   必须和新版几何体的实际尺寸一致（旧版 14/10 是给旧模型的）。
//   新版阔叶树缩放后：总高 25，树干约 8.1×1.4 = 11.3，冠半径约 12.3。
const TRUNK_H = 11.3;
const CROWN_R = 12.3;

function makeTreeMesh() {
  const parts = [];

  // ---------- 树干 ----------
  // 8 边柱，底部半径 1.6，顶部 0.75
  const trunk = new THREE.CylinderGeometry(0.75, 1.6, TRUNK_H, 8, 3);
  trunk.translate(0, TRUNK_H / 2, 0);
  parts.push(tint(trunk, 0x6b4f36));

  // 树皮纹路（4 条竖向凹槽）
  for (let i = 0; i < 4; i++) {
    const a = (i / 4) * Math.PI * 2;
    const groove = new THREE.BoxGeometry(0.18, TRUNK_H * 0.85, 0.18);
    groove.translate(
      Math.cos(a) * 1.25,
      TRUNK_H * 0.45,
      Math.sin(a) * 1.25
    );
    parts.push(tint(groove, 0x54402c));
  }

  // ---------- 树根（外露，4 条）----------
  for (let i = 0; i < 4; i++) {
    const a = (i / 4) * Math.PI * 2 + 0.4;
    const root = new THREE.CylinderGeometry(0.55, 0.25, 2.6, 5);
    root.rotateZ(Math.PI / 2.3);
    root.rotateY(a);
    root.translate(
      Math.cos(a) * 1.5,
      0.35,
      Math.sin(a) * 1.5
    );
    parts.push(tint(root, 0x5e4530));
  }

  // ---------- 主枝（4 根，斜向上）----------
  const branchTips = [];
  for (let i = 0; i < 4; i++) {
    const a = (i / 4) * Math.PI * 2 + 0.8;
    const len = 5.5;
    const tilt = 0.62;   // 与水平面夹角

    const br = new THREE.CylinderGeometry(0.28, 0.5, len, 5);
    br.translate(0, len / 2, 0);
    br.rotateZ(-tilt);
    br.rotateY(a);
    br.translate(0, TRUNK_H * 0.72, 0);
    parts.push(tint(br, 0x6b4f36));

    // 枝端坐标（给树冠定位用）
    const tipR = len * Math.cos(tilt);
    const tipY = TRUNK_H * 0.72 + len * Math.sin(tilt);
    branchTips.push({
      x: Math.cos(a) * tipR,
      y: tipY,
      z: Math.sin(a) * tipR,
    });
  }

  // ---------- 树冠：3 层不规则球 ----------
  // 底层：最大，最宽
  const lower = new THREE.IcosahedronGeometry(CROWN_R * 0.72, 1);
  lower.scale(1.25, 0.85, 1.25);
  lower.translate(0, TRUNK_H + 1.5, 0);
  parts.push(tint(lower, 0x3e6b32));

  // 中层
  const mid = new THREE.IcosahedronGeometry(CROWN_R * 0.62, 1);
  mid.scale(1.15, 0.9, 1.15);
  mid.translate(1.2, TRUNK_H + 4.2, -0.8);
  parts.push(tint(mid, 0x4a7a3a));

  // 顶层：小，最高
  const top = new THREE.IcosahedronGeometry(CROWN_R * 0.45, 1);
  top.scale(1.0, 0.95, 1.0);
  top.translate(-0.8, TRUNK_H + 6.8, 0.6);
  parts.push(tint(top, 0x568a42));

  // 4 个侧枝球（填补空隙，让树冠更蓬松）
  for (const t of branchTips) {
    const side = new THREE.IcosahedronGeometry(CROWN_R * 0.42, 0);
    side.scale(1.1, 0.85, 1.1);
    side.translate(t.x * 0.85, t.y + 1.2, t.z * 0.85);
    parts.push(tint(side, 0x44713a));
  }

  return parts;
}



// ---------------------------------------------------------------------------
// 构建
// ---------------------------------------------------------------------------
export function buildBigTree(model, rng, center = { x: -2, z: -18 }) {
  const group = new THREE.Group();
  group.name = 'bigtree';

  // ★ 换成新版体素巨树（阔叶树造型）——
  //   旧版是「圆柱树干 + 三个二十面体球」，没有枝干结构。
  //   新版有锥形树干、分叉主枝、多个叶团，和参考图一致。
  //
  //   ★ 尺寸校正：新版阔叶树原始 h=17.9 / w=30.7，
  //     旧版地标 h=25.2 / w=23.1 —— 新版偏矮偏宽。
  //     这里做【非等比缩放】：高度 ×1.40 到 25，横向 ×0.80 收到 24.6，
  //     让地标恢复成"高大于宽"的挺拔比例。
  setSkipFallenLeaves(true);
  const broadleafEntry = BIG_TREE_LOWPOLY.find((k) => k.id === 'broadleaf');
  const geo = normalizeBigTreeGeo(mergeBigTreeGroup(broadleafEntry.make()));
  setSkipFallenLeaves(false);
  // shared:false —— setSeason 会在运行时改这个材质的 color / emissive，
  // 必须独占，绝不能和别的网格共用（否则一换季全场一起变色）。
  const mat = toonLambert({
    vertexColors: true,
    flatShading: true,
    shared: false,
  });
  const mesh = new THREE.Mesh(geo, mat);
  mesh.castShadow = true;
  mesh.receiveShadow = true;
  group.add(mesh);

  // 放到地面
  const gy = model.heightAt(center.x, center.z);
  group.position.set(center.x, gy - 0.2, center.z);
  group.rotation.y = 0.35;

  // ---------- 飘落的叶子（四季变色）----------
  const LEAF_COUNT = 60;
  const leafGeo = new THREE.PlaneGeometry(0.45, 0.28);
  const leafMat = new THREE.MeshBasicMaterial({
    color: 0x6fae4a,
    side: THREE.DoubleSide,
    transparent: true,
    opacity: 0.85,
    depthWrite: false,
  });
  const leaves = new THREE.InstancedMesh(leafGeo, leafMat, LEAF_COUNT);
  leaves.frustumCulled = false;

  // 每片叶子的状态
  const leafState = [];
  for (let i = 0; i < LEAF_COUNT; i++) {
    leafState.push({
      angle: rng.next() * Math.PI * 2,
      radius: rng.range(2, CROWN_R * 0.95),
      y: rng.range(TRUNK_H + 1, TRUNK_H + 9),
      fallSpeed: rng.range(0.5, 1.4),
      spin: rng.range(-2, 2),
      drift: rng.range(-0.4, 0.4),
      phase: rng.next() * Math.PI * 2,
      scale: rng.range(0.7, 1.3),
    });
  }

  const _m = new THREE.Matrix4();
  const _q = new THREE.Quaternion();
  const _p = new THREE.Vector3();
  const _s = new THREE.Vector3();
  const _e = new THREE.Euler();

  group.userData.update = (t, dt, seasonT = 1) => {
    for (let i = 0; i < LEAF_COUNT; i++) {
      const L = leafState[i];
      // 下落 + 摆动
      L.y -= L.fallSpeed * dt;
      if (L.y < 0.2) {
        // 回到树冠重新落下
        L.y = TRUNK_H + rng.range(1, 9);
        L.angle = rng.next() * Math.PI * 2;
        L.radius = rng.range(2, CROWN_R * 0.95);
      }

      const sway = Math.sin(t * 1.3 + L.phase) * 0.6;
      const r = L.radius + sway + L.drift * (TRUNK_H + 9 - L.y) * 0.3;
      _p.set(
        Math.cos(L.angle + t * 0.15) * r,
        L.y,
        Math.sin(L.angle + t * 0.15) * r
      );

      _e.set(
        t * L.spin,
        t * L.spin * 0.7,
        Math.sin(t * 2 + L.phase) * 0.8
      );
      _q.setFromEuler(_e);

      const sc = L.scale * (0.8 + Math.sin(t * 3 + L.phase) * 0.2);
      _s.set(sc, sc, sc);

      _m.compose(_p, _q, _s);
      leaves.setMatrixAt(i, _m);
    }
    leaves.instanceMatrix.needsUpdate = true;
  };

  // 四季颜色
  const SEASON_LEAF = [0x8ec860, 0x6fae4a, 0xd8a03c, 0xe8eef4];
  const SEASON_CROWN = [
    [0x4a7a3a, 0x568a42, 0x5f9a48],   // 春
    [0x3e6b32, 0x4a7a3a, 0x568a42],   // 夏
    [0xb87828, 0xc88a30, 0xd8a03c],   // 秋
    [0x7a8a8a, 0x8a9a9a, 0x9aaaaa],   // 冬（枯枝）
  ];



  group.add(leaves);
  group.userData.material = mat;   // 供季节换色使用
  group.userData.leaves = leaves;
  group.userData.crownRadius = CROWN_R;
  group.userData.trunkHeight = TRUNK_H;


  // 惰性查找描边子节点（描边由 main.js 在场景组装后添加）
  let outlineRef = null;
  const findOutline = () => {
    if (outlineRef) return outlineRef;
    for (const c of mesh.children) {
      if (c.userData && c.userData.isOutline) { outlineRef = c; break; }
    }
    return outlineRef;
  };

  // ---------- 参天大树换品种（8 种低多边形巨树）----------
  // ★ 几何体缓存：切换品种时优先复用，避免重复构建（构建本身 30~340ms）
  //   缓存值 = 缩放后的 BufferGeometry 的 clone()（每次 clone 约 3~8ms，
  //   远低于重新跑一遍体素方块生成）。
  const geoCache = new Map();

  function geoForBigKind(kind) {
    const cached = geoCache.get(kind);
    if (cached) return cached.clone();
    const entry = BIG_TREE_LOWPOLY.find((k) => k.id === kind);
    if (!entry) return null;
    setSkipFallenLeaves(true);
    const g = normalizeBigTreeGeo(mergeBigTreeGroup(entry.make()));
    setSkipFallenLeaves(false);
    geoCache.set(kind, g);
    return g.clone();
  }

  const BIG_TREE_ALIASES = {
    autumn: 'ginkgo', golden: 'ginkgo', pink: 'acacia', greengold: 'acacia',
  };

  group.userData.setKind = (newKind) => {
    const kind = BIG_TREE_ALIASES[newKind] || newKind;
    const newGeo = geoForBigKind(kind);
    if (!newGeo) return false;
    outlineRef = findOutline();
    if (outlineRef) outlineRef.geometry = newGeo;
    mesh.geometry.dispose();
    mesh.geometry = newGeo;
    group.userData.kind = kind;
    // 雪花贴着旧几何体表面撒的，换形状必须重撒
    if (typeof rebuildBigSnow === 'function') rebuildBigSnow();
    return true;
  };

  group.userData.getKind = () => group.userData.kind || 'broadleaf';
  group.userData.kind = 'broadleaf';

  // ---------- 冬季：树枝上的零星雪花 ----------
  // ★ 同上：先更新父级矩阵，否则雪花会堆在世界原点
  group.updateMatrixWorld(true);
  const bigSnow = makeSnowDots(mesh, 'big', 1);
  group.add(bigSnow.group);

  // 换品种后重建雪花
  function rebuildBigSnow() {
    group.remove(bigSnow.group);
    bigSnow.group.traverse((o) => {
      if (o.isInstancedMesh) {
        if (o.geometry) o.geometry.dispose();
        if (o.material) o.material.dispose();
      }
    });
    group.updateMatrixWorld(true);
    const fresh = makeSnowDots(mesh, 'big', 1);
    group.add(fresh.group);
    bigSnow.group = fresh.group;
    bigSnow.material = fresh.material;
    const snowAmt = Math.max(0, Math.min(1, ((group.userData.currentSeason ?? 1) - 2.5) / 0.5));
    fresh.group.visible = snowAmt > 0.05;
    if (fresh.material) fresh.material.opacity = snowAmt;
  }

  // ---------- 季节换色 ----------
  group.userData.setSeason = (seasonT, daylight = 1) => {
    const c = Math.max(0, Math.min(3, seasonT));
    group.userData.currentSeason = c;   // 供换品种重建雪花时恢复可见性
    // daylight: 0=深夜, 1=白天。emissive 只在白天生效，
    // 否则夜里树会自己发光（像霓虹灯）。
    const day = Math.max(0, Math.min(1, daylight));
    const TINTS = [
      { r: 1.00, g: 1.05, b: 0.95 },   // 春
      { r: 1.00, g: 1.00, b: 1.00 },   // 夏
      { r: 1.00, g: 0.48, b: 0.22 },   // 秋：压绿提红，保留明暗层次
      { r: 1.00, g: 0.48, b: 0.22 },   // 冬：和秋季一样（只加雪点，不改底色）
    ];
    const i = Math.min(2, Math.floor(c));
    const k = c - i;
    const A = TINTS[i], B = TINTS[i + 1];
    mat.color.setRGB(
      A.r + (B.r - A.r) * k,
      A.g + (B.g - A.g) * k,
      A.b + (B.b - A.b) * k,
      THREE.LinearSRGBColorSpace
    );

    // ★ 秋季/冬季用 emissive 提亮（color 乘数 >1 会被截断，只能靠加法）
    //
    // 之前秋、冬两份权重是【相加】的：
    //   autumnW 从 c=1.6 起升到 1，然后一直保持；
    //   winterW 从 c=2.4 起再升到 1。
    // 于是 c=3 时 emissive = 秋 + 冬 ≈ 两倍，冬季比秋季亮一档 ——
    // 用户反馈"冬季褐色明度比秋天高"，就是这个。
    //
    // 现在改成单条曲线：c=1.6 起升，c=2.4 到峰值后【保持不再增加】，
    // 秋冬严格同色同亮度。
    {
      const autumnW = Math.min(1, Math.max(0, (c - 1.6) / 0.4));
      mat.emissive.setRGB(
        0.055 * autumnW * day,
        0.020 * autumnW * day,
        0.004 * autumnW * day,
        THREE.LinearSRGBColorSpace
      );
    }

    // 雪花
    const snowAmt = Math.max(0, Math.min(1, (c - 2.5) / 0.5));
    bigSnow.group.visible = snowAmt > 0.05;
    if (bigSnow.material) bigSnow.material.opacity = snowAmt;

    // 落叶颜色也跟着变
    const idx = Math.round(c) % 4;
    leafMat.color.setHex(SEASON_LEAF[idx]);
    leafMat.opacity = idx === 3 ? 0.12 : 0.85;
  };

  return group;
}

// ---------------------------------------------------------------------------
// 另外 3 棵不同品种的树
//
// 品种设计（形态差异明显，不只是缩放）：
//   1. 橡树 oak    —— 粗壮低矮，树冠宽而扁（像大蘑菇）
//   2. 白桦 birch  —— 细高，白色树干带黑斑，树冠窄而高
//   3. 枫树 maple  —— 中等，树冠分层明显，秋天变红
// ---------------------------------------------------------------------------

// ---------- 品种 1：橡树（粗壮低矮，宽冠）----------
function makeOakParts(scale) {
  const parts = [];
  const H = 7 * scale;
  const R = 6.5 * scale;

  // 树干：粗短
  const trunk = new THREE.CylinderGeometry(1.0 * scale, 1.8 * scale, H, 7, 2);
  trunk.translate(0, H / 2, 0);
  parts.push(tint(trunk, 0x5e4530));

  // 3 根粗枝（分叉明显）
  for (let i = 0; i < 3; i++) {
    const a = (i / 3) * Math.PI * 2 + 0.5;
    const len = 3.4 * scale;
    const br = new THREE.CylinderGeometry(0.35 * scale, 0.6 * scale, len, 5);
    br.translate(0, len / 2, 0);
    br.rotateZ(-0.75);
    br.rotateY(a);
    br.translate(0, H * 0.85, 0);
    parts.push(tint(br, 0x5e4530));
  }

  // 树冠：宽而扁（压扁的球）
  const c1 = new THREE.IcosahedronGeometry(R, 1);
  c1.scale(1.35, 0.72, 1.35);
  c1.translate(0, H + R * 0.35, 0);
  parts.push(tint(c1, 0x3a6b2e));

  const c2 = new THREE.IcosahedronGeometry(R * 0.72, 1);
  c2.scale(1.2, 0.8, 1.2);
  c2.translate(1.4 * scale, H + R * 0.85, -0.9 * scale);
  parts.push(tint(c2, 0x467a36));

  const c3 = new THREE.IcosahedronGeometry(R * 0.6, 0);
  c3.scale(1.1, 0.85, 1.1);
  c3.translate(-1.8 * scale, H + R * 0.65, 1.2 * scale);
  parts.push(tint(c3, 0x3e7030));

  return parts;
}

// ---------- 品种 2：白桦（细高，白树干）----------
function makeBirchParts(scale) {
  const parts = [];
  const H = 13 * scale;
  const R = 3.8 * scale;

  // 树干：细高，白色
  const trunk = new THREE.CylinderGeometry(0.32 * scale, 0.55 * scale, H, 6, 4);
  trunk.translate(0, H / 2, 0);
  parts.push(tint(trunk, 0xe8e4dc));

  // 黑色斑点（白桦的标志）
  for (let i = 0; i < 8; i++) {
    const a = (i / 8) * Math.PI * 2 + i * 0.7;
    const y = (i / 8) * H * 0.85 + 1.2;
    const r = 0.55 * scale - (i / 8) * 0.2 * scale;
    const spot = new THREE.BoxGeometry(0.28 * scale, 0.16 * scale, 0.06);
    spot.translate(Math.cos(a) * r, y, Math.sin(a) * r);
    spot.rotateY(a);
    parts.push(tint(spot, 0x2a2420));
  }

  // 细枝（3 根，斜向上）
  for (let i = 0; i < 3; i++) {
    const a = (i / 3) * Math.PI * 2 + 1.2;
    const len = 2.6 * scale;
    const br = new THREE.CylinderGeometry(0.12 * scale, 0.22 * scale, len, 4);
    br.translate(0, len / 2, 0);
    br.rotateZ(-0.55);
    br.rotateY(a);
    br.translate(0, H * 0.78, 0);
    parts.push(tint(br, 0xd8d4cc));
  }

  // 树冠：窄而高（垂直拉长）
  const c1 = new THREE.IcosahedronGeometry(R, 1);
  c1.scale(1.0, 1.5, 1.0);
  c1.translate(0, H * 0.88, 0);
  parts.push(tint(c1, 0x5a9a48));

  const c2 = new THREE.IcosahedronGeometry(R * 0.7, 1);
  c2.scale(0.95, 1.3, 0.95);
  c2.translate(0.5 * scale, H * 1.05, -0.4 * scale);
  parts.push(tint(c2, 0x6aaa52));

  return parts;
}

// ---------- 品种 3：枫树（中等，分层，秋红）----------
function makeMapleParts(scale) {
  const parts = [];
  const H = 9 * scale;
  const R = 5 * scale;

  // 树干
  const trunk = new THREE.CylinderGeometry(0.55 * scale, 1.0 * scale, H, 7, 3);
  trunk.translate(0, H / 2, 0);
  parts.push(tint(trunk, 0x6a5038));

  // 4 根分枝（枫树的对称分叉）
  for (let i = 0; i < 4; i++) {
    const a = (i / 4) * Math.PI * 2 + 0.3;
    const len = 3.8 * scale;
    const br = new THREE.CylinderGeometry(0.22 * scale, 0.4 * scale, len, 5);
    br.translate(0, len / 2, 0);
    br.rotateZ(-0.68);
    br.rotateY(a);
    br.translate(0, H * 0.8, 0);
    parts.push(tint(br, 0x6a5038));
  }

  // 树冠：3 层分明（像宝塔）
  const layers = [
    { y: H * 0.95, r: R * 0.85, s: 0.62 },
    { y: H * 1.25, r: R * 0.65, s: 0.70 },
    { y: H * 1.50, r: R * 0.45, s: 0.85 },
  ];
  const colors = [0x4a7a38, 0x548a40, 0x5e9a48];
  layers.forEach((L, i) => {
    const g = new THREE.IcosahedronGeometry(L.r, 1);
    g.scale(1.15, L.s, 1.15);
    g.translate(0, L.y, 0);
    parts.push(tint(g, colors[i]));
  });

  return parts;
}

// ---------------------------------------------------------------------------
// 对外：构建一棵指定品种的树
// ---------------------------------------------------------------------------
// ---------------------------------------------------------------------------
// 树木品种 —— 使用 treeDemo.js 的新版体素模型
//
// ★ 为什么替换：
//   旧版是「圆柱树干 + 几个二十面体树冠」的极简造型，
//   新版是体素方块堆出的树干/枝杈/树冠，细节和参考图一致。
//
// ★ 用法：新版返回 Group（多 mesh），需要合并成单个几何体。
// ---------------------------------------------------------------------------
// 场景里的四棵小树用【新版】体素模型
const TREE_KINDS = {
  oak: makeOak,
  birch: makeBirch,
  spruce: makeSpruce,
  autumn: makeAutumnTree,
};

// 参天大树可选品种（8 种低多边形巨树）
export const BIG_TREE_SPECIES = BIG_TREE_LOWPOLY.map((k) => ({
  kind: k.id,
  name: k.name,
  desc: '参天巨树',
}));

// 小树可选品种（供 UI 使用）
export const TREE_SPECIES = [
  { kind: 'oak',    name: '橡树',   desc: '粗壮低矮，宽而扁的冠' },
  { kind: 'birch',  name: '白桦',   desc: '细高，白树干带黑斑' },
  { kind: 'spruce', name: '云杉',   desc: '针叶层叠，塔形轮廓' },
  { kind: 'autumn', name: '秋树',   desc: '橙红树冠，秋季地标' },
];

// 把【新版巨树】Group 里的所有 mesh 合并成单个几何体（保留顶点色）
const BIG_TARGET_H = 25;
const BIG_MAX_W = 28;

function normalizeBigTreeGeo(geo) {
  geo.computeBoundingBox();
  const size = new THREE.Vector3();
  geo.boundingBox.getSize(size);
  const sy = BIG_TARGET_H / Math.max(1e-3, size.y);
  const sxz = Math.min(sy, BIG_MAX_W / Math.max(1e-3, size.x, size.z));
  geo.scale(sxz, sy, sxz);
  geo.computeBoundingBox();
  return geo;
}

function mergeBigTreeGroup(group) {
  group.updateMatrixWorld(true);
  const geos = [];
  group.traverse((o) => {
    if (!o.isMesh || !o.geometry) return;
    const g = o.geometry.clone();
    g.applyMatrix4(o.matrixWorld);
    if (!g.attributes.color) {
      const n = g.attributes.position.count;
      const src = (o.material && o.material.color) ? o.material.color : new THREE.Color(1, 1, 1);
      const arr = new Float32Array(n * 3);
      for (let i = 0; i < n; i++) {
        arr[i * 3] = src.r;
        arr[i * 3 + 1] = src.g;
        arr[i * 3 + 2] = src.b;
      }
      g.setAttribute('color', new THREE.BufferAttribute(arr, 3));
    }
    geos.push(g);
  });
  if (!geos.length) return new THREE.BoxGeometry(1, 1, 1);
  return merge(geos);
}

// 把 Group 里的所有 mesh 合并成单个几何体（保留顶点色）
function mergeTreeGroup(group) {
  group.updateMatrixWorld(true);
  const geos = [];
  group.traverse((o) => {
    if (!o.isMesh || !o.geometry) return;
    const g = o.geometry.clone();
    g.applyMatrix4(o.matrixWorld);
    if (!g.attributes.color) {
      const n = g.attributes.position.count;
      g.setAttribute('color', new THREE.BufferAttribute(new Float32Array(n * 3).fill(1), 3));
    }
    geos.push(g);
  });
  if (!geos.length) return new THREE.BoxGeometry(1, 1, 1);
  return merge(geos);
}

// ---------- 品种高度归一化 ----------
//
// ★ 问题：4 个品种的原始高度差得很多（实测，scale=1 时）：
//     橡树 8.09 / 白桦 8.94 / 云杉 12.52 / 秋树 6.14
//   而场景里每棵树只有一个 scale，直接乘上去就会——
//     同一棵树切到秋树时矮了 3.65 米，树冠沉到地面；
//     切到云杉时又高了 6 米，像换了一棵树。
//   用户反馈的"秋树位置有高度差"就是这个。
//
// ★ 做法：每个品种先乘一个修正系数，把高度拉回同一个基准（橡树 8.09），
//   再乘树自己的 scale。这样换品种只换形态，不换体量。
//   参天大树用的是同一套思路（统一高度 25、最大宽度 28）。
//   实测基准高度（scale=1 时的模型总高）：
//     橡树 8.09 / 白桦 8.12 / 云杉 11.37 / 秋树 6.14
//   参考高度取橡树的 8.09 —— 场景里橡树和白桦的现有 scale 是按它调的，
//   这样归一化后它们的实际高度几乎不变，只有矮的秋树和高的云杉被拉平。
const TREE_BASE_H = { oak: 8.09, birch: 8.12, spruce: 11.37, autumn: 6.14 };
export const TREE_REF_H = 8.09;

export function treeHeightFix(kind) {
  return TREE_REF_H / (TREE_BASE_H[kind] || TREE_REF_H);
}

// ---------- 品种宽度微收 ----------
//
// 秋树模型是"矮而宽"的（原始 6.14 高、7.24 宽），
// 按高度拉齐到橡树后，树冠横向会达到 17.9，比橡树（14.8）宽 21%，
// 近景时整棵树冠把谷仓都盖住 —— 用户反馈的"位置有高度差"修好后
// 又会变成"换品种后体量明显变大"。
//
// 这里只对明显偏宽的品种做 x/z 微收，云杉这种本来就细高的不动。
const TREE_WIDTH_FIX = { autumn: 0.88 };

// 构建指定品种的几何体（已按 scale 缩放）
function makeTreeGeo(kind, scale = 1) {
  const maker = TREE_KINDS[kind] || TREE_KINDS.oak;
  // ★ 场景里跳过模型自带的落叶（4 棵树各散十几片，草地上会变成碎点）
  setSkipFallenLeaves(true);
  const geo = mergeTreeGroup(maker());
  setSkipFallenLeaves(false);
  // 先归一化到统一高度，再乘这棵树自己的 scale
  const s = scale * treeHeightFix(kind);
  geo.scale(s, s, s);
  // 横向微收（只作用于偏宽的品种，见 TREE_WIDTH_FIX）
  const wf = TREE_WIDTH_FIX[kind];
  if (wf) geo.scale(wf, 1, wf);
  geo.computeBoundingBox();
  return geo;
}

export function buildTree(model, rng, opts) {
  const { x, z, kind = 'oak', scale = 1 } = opts;
  const group = new THREE.Group();
  group.name = 'tree-' + kind;

  const geo = makeTreeGeo(kind, scale);
  // shared:false —— setSeason 会在运行时改这个材质的 color / emissive，
  // 必须独占，绝不能和别的网格共用（否则一换季全场一起变色）。
  const mat = toonLambert({
    vertexColors: true,
    flatShading: true,
    shared: false,
  });
  const mesh = new THREE.Mesh(geo, mat);
  mesh.castShadow = true;
  mesh.receiveShadow = true;
  group.add(mesh);

  const gy = model.heightAt(x, z);
  group.position.set(x, gy - 0.15, z);
  group.rotation.y = rng.next() * Math.PI * 2;

  group.userData.kind = kind;
  group.userData.scale = scale;
  group.userData.material = mat;   // 供季节换色使用


  // 惰性查找描边子节点（描边由 main.js 在场景组装后添加）
  let outlineRef = null;
  const findOutline = () => {
    if (outlineRef) return outlineRef;
    for (const c of mesh.children) {
      if (c.userData && c.userData.isOutline) { outlineRef = c; break; }
    }
    return outlineRef;
  };

  group.userData.getKind = () => group.userData.kind;

  // ---------- 冬季：树枝上的零星雪花 ----------
  // 在树冠范围内随机撒一些小白色四边形，只在冬季显示
  //
  // ★ 必须先更新 group 的 matrixWorld ——
  //   makeSnowDots 用射线在世界坐标里找树冠表面，
  //   而 group.position 刚设完，matrixWorld 还是旧的单位矩阵，
  //   射线会在【世界原点】附近打，45 片雪花全堆在 (0,0,0) 周围，
  //   和树本体完全错位（表现为"雪花飘在场地中央"）。
  group.updateMatrixWorld(true);
  const snowDots = makeSnowDots(mesh, kind, scale);
  group.add(snowDots.group);

  // ---------- 运行时换品种 ----------
  // 几何体整体替换（不同品种尺寸差异大，无法只改颜色）
  //
  // ★ 雪花必须跟着重建：它是贴着【旧品种表面】撒的，
  //   换了形态（尤其秋树矮、云杉高）之后，雪会悬在半空或埋进树冠。
  group.userData.setKind = (newKind) => {
    if (!TREE_KINDS[newKind]) return false;
    const newGeo = makeTreeGeo(newKind, scale);
    // ★ 同步更新描边几何体（见上）
    outlineRef = findOutline();
    if (outlineRef) outlineRef.geometry = newGeo;
    mesh.geometry.dispose();
    mesh.geometry = newGeo;
    group.name = 'tree-' + newKind;
    group.userData.kind = newKind;
    // 换形状后重撒雪花（沿用当前季节可见性）
    snowDots.group.removeFromParent();
    snowDots.group.traverse((o) => {
      if (o.isInstancedMesh) {
        if (o.geometry) o.geometry.dispose();
        if (o.material) o.material.dispose();
      }
    });
    const fresh = makeSnowDots(mesh, newKind, scale);
    group.add(fresh.group);
    snowDots.group = fresh.group;
    snowDots.material = fresh.material;
    const snowAmt = Math.max(0, Math.min(1, ((group.userData.currentSeason ?? 1) - 2.5) / 0.5));
    fresh.group.visible = snowAmt > 0.05;
    if (fresh.material) fresh.material.opacity = snowAmt;
    return true;
  };

  // ---------- 季节换色 ----------
  group.userData.setSeason = (seasonT, daylight = 1) => {
    // seasonT: 0=春 1=夏 2=秋 3=冬
    // daylight: 0=深夜, 1=白天（emissive 只在白天生效）
    const c = Math.max(0, Math.min(3, seasonT));
    group.userData.currentSeason = c;   // 供换品种重建雪花时恢复可见性
    const day = Math.max(0, Math.min(1, daylight));

    // 树冠颜色（材质 color 乘数）
    // 春夏绿、秋褐、冬保持原色（靠雪花点缀）
    const TINTS = [
      { r: 1.00, g: 1.05, b: 0.95 },   // 春
      { r: 1.00, g: 1.00, b: 1.00 },   // 夏
      { r: 1.00, g: 0.48, b: 0.22 },   // 秋：压绿提红，保留明暗层次
      { r: 1.00, g: 0.48, b: 0.22 },   // 冬：和秋季一样（只加雪点，不改底色）
    ];
    const i = Math.min(2, Math.floor(c));
    const k = c - i;
    const A = TINTS[i], B = TINTS[i + 1];
    mat.color.setRGB(
      A.r + (B.r - A.r) * k,
      A.g + (B.g - A.g) * k,
      A.b + (B.b - A.b) * k,
      THREE.LinearSRGBColorSpace
    );

    // ★ 秋季/冬季用 emissive 提亮（color 乘数 >1 会被截断，只能靠加法）
    //
    // 和参天大树保持完全一致：单条曲线，c=1.6 起升，c=2.0 到峰值后保持。
    // 原来秋、冬两份权重【累加】，c=3 时 emissive 约两倍，
    // 冬季比秋季亮一档（用户反馈"冬季褐色明度比秋天高"）。
    {
      const autumnW = Math.min(1, Math.max(0, (c - 1.6) / 0.4));
      mat.emissive.setRGB(
        0.055 * autumnW * day,
        0.020 * autumnW * day,
        0.004 * autumnW * day,
        THREE.LinearSRGBColorSpace
      );
    }

    // 雪花：只有冬季（c >= 2.5）才显示
    const snowAmt = Math.max(0, Math.min(1, (c - 2.5) / 0.5));
    snowDots.group.visible = snowAmt > 0.05;
    if (snowDots.material) {
      snowDots.material.opacity = snowAmt;
    }
  };

  return group;
}

// ---------------------------------------------------------------------------
// 树枝上的零星雪花（小白色四边形，撒在树冠表面）
// ---------------------------------------------------------------------------
const UP_Y = new THREE.Vector3(0, 1, 0);

function makeSnowDots(treeMesh, kind, scale) {
  const group = new THREE.Group();
  group.name = 'snow-dots';

  const geo = new THREE.PlaneGeometry(0.22, 0.22);
  const mat = new THREE.MeshBasicMaterial({
    color: 0xffffff,
    side: THREE.DoubleSide,
    transparent: true,
    opacity: 0,
    depthWrite: false,
  });

  // ★ 密度系数：参天大树体量是普通树的 5~6 倍（25m 高、24m 冠径），
  //   45 片雪花铺在整棵树上显得太稀。这里按 kind 放大数量，
  //   'big' = 参天大树的调用标记（见 buildBigTree / rebuildBigSnow）。
  const DENSITY = { big: 1.5 };
  const COUNT = Math.round(45 * (DENSITY[kind] || 1));
  const inst = new THREE.InstancedMesh(geo, mat, COUNT);
  inst.frustumCulled = false;

  const m = new THREE.Matrix4();
  const q = new THREE.Quaternion();
  const p = new THREE.Vector3();
  const s = new THREE.Vector3();

  // 固定随机（同一棵树每次一致）
  let seed = kind.charCodeAt(0) * 977 + 12345;
  const rnd = () => {
    seed = (seed * 1103515245 + 12345) & 0x7fffffff;
    return seed / 0x7fffffff;
  };

  // ---------- 采样法贴雪花（替代射线检测）----------
  //
  // ★ 为什么改：原实现用 raycaster 对 45 片雪花各做一次
  //   intersectObject(treeMesh) —— 每次都要遍历整棵树的全部三角形。
  //   参天大树有 6.6 万 ~ 31 万顶点，45 次射线检测要 300~700ms，
  //   这就是"切换品种卡顿"的主因（构建几何体只要 30~110ms）。
  //
  //   新做法：直接在【顶点数组】里抽样朝上的顶点作为雪花落点。
  //   只需遍历一次顶点（O(n)），耗时降到 1~3ms。
  //
  // ★★ 坐标系：全部在【group 局部空间】里算 ★★
  //   这个 snow-dots 组是挂到树 group 下面的子节点，
  //   如果拿世界坐标当局部坐标用，会再叠加一次 group 的位移+旋转，
  //   雪花就整片飘到树的几十米开外（用户看到的"每棵树雪花位置都不对"）。
  //   treeMesh 相对 group 的变换就是 treeMesh.matrix（通常为单位阵），
  //   所以直接读顶点坐标 = group 局部坐标，不需要 matrixWorld。
  const posAttr = treeMesh.geometry.attributes.position;
  const nrmAttr = treeMesh.geometry.attributes.normal;
  const vCount = posAttr.count;
  treeMesh.geometry.computeBoundingBox();
  const box = treeMesh.geometry.boundingBox;
  const size = box.getSize(new THREE.Vector3());
  const crownMinY = box.min.y + size.y * 0.45;   // 只取树冠部分

  // 雪花贴片大小随树体量微调：参天大树 25m 高，0.22 的贴片远景只有 1~2 像素。
  // 目标世界尺寸 ≈ 树高 * 1%，再换算成基础 0.22 平面的缩放倍数。
  // ★ 上限 1.45：再大就不是"雪点"而是"白方块"了。
  const dotScale = THREE.MathUtils.clamp((size.y * 0.010) / 0.22, 0.85, 1.45);

  // ---------- 按 x/z 网格"列"取最高点 ----------
  //
  // ★ 只挑朝上的顶点还不够：树冠是很多体素方块堆起来的，
  //   内部方块（被别的方块包住）的顶面也是朝上的，
  //   雪花贴到那里就会被树冠遮住、看不见。
  //
  //   做法等价于原射线版：把树冠投影到 x/z 平面切成网格，
  //   每一列只保留【最高的那个朝上顶点】—— 那就是从上往下打射线
  //   第一个命中的表面。仍然只遍历一次顶点（O(n)），
  //   不需要建 BVH，也不需要 intersectObject。
  // 网格密度跟着雪花数量走：45 片用 14×14 列，放大到 68 片时提到 20×20，
  // 否则候选列不够，随机挑会大量重复、雪点叠在一起变成一团。
  const GRID = COUNT > 45 ? 20 : 14;
  const CELL = Math.max(0.6, Math.max(size.x, size.z) / GRID);
  const cols = new Map();     // "cx|cz" -> 该列最高的朝上顶点
  const _v = new THREE.Vector3();
  const _n = new THREE.Vector3();
  const stride = Math.max(1, Math.floor(vCount / 40000));
  for (let i = 0; i < vCount; i += stride) {
    _n.fromBufferAttribute(nrmAttr, i);
    if (_n.y < 0.2) continue;                    // 只要朝上的面（雪积在顶面）
    _v.fromBufferAttribute(posAttr, i);
    if (_v.y < crownMinY) continue;              // 只要树冠高度区间
    const cx = Math.floor(_v.x / CELL);
    const cz = Math.floor(_v.z / CELL);
    const key = cx + '|' + cz;
    const cur = cols.get(key);
    if (!cur || _v.y > cur.y) {
      cols.set(key, { x: _v.x, y: _v.y, z: _v.z, nx: _n.x, ny: _n.y, nz: _n.z });
    }
  }
  const pool = [...cols.values()];

  // 从候选里按固定伪随机挑 COUNT 个（保持"同一棵树每次一致"）
  //
  // ★ 不重复抽取：原来用 Math.floor(rnd()*pool.length) 有放回地取，
  //   候选列只有一两百个时，抽 68 次必然撞车，两片雪花落在同一格、
  //   视觉上就是一块更亮的白斑。改成先做部分洗牌再顺序取。
  for (let i = pool.length - 1; i > 0; i--) {
    const j = Math.floor(rnd() * (i + 1));
    const tmp = pool[i]; pool[i] = pool[j]; pool[j] = tmp;
  }

  let placed = 0;
  if (pool.length) {
    for (let k = 0; k < COUNT && placed < COUNT; k++) {
      // 候选列比需要的少时才回绕重复（小树模型可能出现）
      const c = pool[k % pool.length];
      const n = _n.set(c.nx, c.ny, c.nz).normalize();

      // 雪花贴着表面法线，略微外抬避免 z-fighting
      p.set(c.x + n.x * 0.02, c.y + n.y * 0.02, c.z + n.z * 0.02);

      // 朝向：贴合表面法线，再绕法线随机自转
      const qAlign = new THREE.Quaternion().setFromUnitVectors(UP_Y, n);
      const qSpin = new THREE.Quaternion().setFromAxisAngle(n, rnd() * Math.PI * 2);
      q.copy(qAlign).multiply(qSpin);

      const sc = dotScale * (0.75 + rnd() * 0.7);
      s.set(sc, sc, sc);
      m.compose(p, q, s);
      inst.setMatrixAt(placed++, m);
    }
  }

  inst.count = placed;
  inst.instanceMatrix.needsUpdate = true;
  group.add(inst);
  group.visible = false;

  return { group, material: mat };
}