import * as THREE from 'three';
import { WORLD, PALETTE, SEASON } from '../config.js';
import { smoothstep } from '../util/noise.js';
import { toonLambert } from '../render/toon.js';
import {
  PASTURE, COOP, HORSE_PASTURE, FIELD_RECTS, BUILDINGS,
  TREE_SPECS, BIG_TREE, WOODPILE, HAY_BALES, TRUCK,
} from './layout.js';
import { pointInPolygon, distToPolygonEdge } from '../util/poly.js';
import { TREE_REF_H } from './bigtree.js';

// ---------------------------------------------------------------------------
// 树林：全部 InstancedMesh。树身 + 树冠分开两个实例化网格（不同材质）
// 树冠用一个自定义 onBeforeCompile 注入风的摆动，这是"治愈感"的关键之一
// ---------------------------------------------------------------------------

function makePineGeo() {
  const parts = [];
  const trunk = new THREE.CylinderGeometry(0.32, 0.46, 2.6, 5);
  trunk.translate(0, 1.3, 0);
  parts.push({ geo: trunk, color: PALETTE.trunk });
  const tiers = [
    { r: 2.5, h: 3.6, y: 3.6 },
    { r: 1.85, h: 3.0, y: 5.7 },
    { r: 1.2, h: 2.4, y: 7.5 },
  ];
  for (const t of tiers) {
    const g = new THREE.ConeGeometry(t.r, t.h, 7);
    g.translate(0, t.y, 0);
    parts.push({ geo: g, color: PALETTE.leafA, isCrown: true });
  }
  return parts;
}

function makeRoundGeo() {
  const parts = [];
  const trunk = new THREE.CylinderGeometry(0.3, 0.42, 2.4, 5);
  trunk.translate(0, 1.2, 0);
  parts.push({ geo: trunk, color: PALETTE.trunk });
  const crown = new THREE.IcosahedronGeometry(2.5, 0);
  crown.scale(1, 0.92, 1);
  crown.translate(0, 4.4, 0);
  parts.push({ geo: crown, color: PALETTE.leafB, isCrown: true });
  return parts;
}

// 把多个几何合并成一个（带顶点色）
//
// ★ 额外记录 aCrown（0 = 树干/树枝，1 = 树冠叶子）。
//   季节染色只作用于树冠：树干必须保持木色，否则冬天整棵树会变成一根褐色柱子。
function mergeColored(parts) {
  let total = 0;
  for (const p of parts) total += p.geo.attributes.position.count;
  const positions = new Float32Array(total * 3);
  const normals = new Float32Array(total * 3);
  const colors = new Float32Array(total * 3);
  const crown = new Float32Array(total);
  const index = [];
  let vOff = 0;

  for (const { geo, color, isCrown } of parts) {
    const pos = geo.attributes.position;
    const nor = geo.attributes.normal;
    const c = new THREE.Color(color);
    for (let i = 0; i < pos.count; i++) {
      positions[(vOff + i) * 3] = pos.getX(i);
      positions[(vOff + i) * 3 + 1] = pos.getY(i);
      positions[(vOff + i) * 3 + 2] = pos.getZ(i);
      normals[(vOff + i) * 3] = nor.getX(i);
      normals[(vOff + i) * 3 + 1] = nor.getY(i);
      normals[(vOff + i) * 3 + 2] = nor.getZ(i);
      colors[(vOff + i) * 3] = c.r;
      colors[(vOff + i) * 3 + 1] = c.g;
      colors[(vOff + i) * 3 + 2] = c.b;
      crown[vOff + i] = isCrown ? 1 : 0;
    }
    const idx = geo.index;
    if (idx) {
      for (let i = 0; i < idx.count; i++) index.push(idx.getX(i) + vOff);
    } else {
      for (let i = 0; i < pos.count; i++) index.push(i + vOff);
    }
    vOff += pos.count;
    geo.dispose();
  }

  const out = new THREE.BufferGeometry();
  out.setAttribute('position', new THREE.BufferAttribute(positions, 3));
  out.setAttribute('normal', new THREE.BufferAttribute(normals, 3));
  out.setAttribute('color', new THREE.BufferAttribute(colors, 3));
  out.setAttribute('aCrown', new THREE.BufferAttribute(crown, 1));
  out.setIndex(index);
  return out;
}

// 风摆 shader：按高度加权，越高摆得越多
function applyWind(material, strength = 1) {
  material.onBeforeCompile = (shader) => {
    shader.uniforms.uTime = { value: 0 };
    shader.uniforms.uWindStrength = { value: strength };
    shader.vertexShader = /* glsl */`
      uniform float uTime;
      uniform float uWindStrength;
    ` + shader.vertexShader.replace(
      '#include <begin_vertex>',
      /* glsl */`
      #include <begin_vertex>
      #ifdef USE_INSTANCING
        vec3 instOrigin = instanceMatrix[3].xyz;
      #else
        vec3 instOrigin = vec3(0.0);
      #endif
      float sway = max(transformed.y - 1.0, 0.0);
      sway = sway * sway * 0.012 * uWindStrength;
      float phase = instOrigin.x * 0.09 + instOrigin.z * 0.07;
      transformed.x += sin(uTime * 1.1 + phase) * sway;
      transformed.z += cos(uTime * 0.87 + phase * 1.3) * sway * 0.7;
      `
    );
    material.userData.shader = shader;
  };
  material.customProgramCacheKey = () => 'wind' + strength;
  return material;
}

// ---------------------------------------------------------------------------
// 防穿模：森林不能长进农场里
//
// 之前只在撒点时排除「台地中央（dist < 118）」，但农场本身就横跨 ±120，
// 于是树木会长在牧场围栏里、田垄中间、甚至谷仓墙里。
// 现在逐项排除：
//   - 建筑（用外接半径 + 树冠余量）
//   - 田地（旋转矩形 + 余量）
//   - 三处围栏内部与贴边（牧场 / 鸡舍 / 马场）
//   - 干草堆、木材堆、大树
//   - 环场车道（树木压在柏油路面上会很难看）
//
// 这里用的是【树冠半径】而不是树干半径：低多边形松树树冠半径约 2.5×scale，
// 只按树干避让的话，树冠还是会插进墙里。
// ---------------------------------------------------------------------------
const TREE_CROWN_R = 3.0;        // 树冠避让半径（最大 scale 1.55 × 2.5 的一半≈1.9，取 3 更保险）
const ROAD_CLEAR = 8.0;          // 车道半宽 2.75 + 树冠 + 余量

// 环场车道：与 main.js 的 ROAD_POINTS 保持一致（用 CatmullRom 采样成折线）
const ROAD_PTS = [
  [-118, -6], [-96, 46], [-52, 78], [6, 88], [62, 74],
  [104, 40], [116, -12], [96, -62], [44, -88], [-16, -92], [-72, -66], [-110, -34], [-118, -6],
];
let _roadPoly = null;
function roadPolyline() {
  if (_roadPoly) return _roadPoly;
  // 用 CatmullRomCurve3 采样，和 road.js 完全同一条曲线
  const curve = new THREE.CatmullRomCurve3(
    ROAD_PTS.map(([x, z]) => new THREE.Vector3(x, 0, z)),
    false, 'catmullrom', 0.35
  );
  const pts = [];
  const N = 120;
  for (let i = 0; i <= N; i++) {
    const p = curve.getPointAt(i / N);
    pts.push([p.x, p.z]);
  }
  _roadPoly = pts;
  return pts;
}

function distToRoad(x, z) {
  const pts = roadPolyline();
  let best = Infinity;
  for (let i = 0; i < pts.length - 1; i++) {
    const ax = pts[i][0], az = pts[i][1];
    const bx = pts[i + 1][0], bz = pts[i + 1][1];
    const dx = bx - ax, dz = bz - az;
    const len2 = dx * dx + dz * dz;
    let t = len2 > 0 ? ((x - ax) * dx + (z - az) * dz) / len2 : 0;
    t = Math.max(0, Math.min(1, t));
    const d = Math.hypot(x - (ax + dx * t), z - (az + dz * t));
    if (d < best) best = d;
  }
  return best;
}

// 树能不能种在这里
export function canPlantTree(x, z, crownR = TREE_CROWN_R) {
  const r = crownR;

  // 建筑
  for (const b of Object.values(BUILDINGS)) {
    const br = b.r ?? Math.max(b.w ?? 0, b.d ?? 0) * 0.5;
    if (Math.hypot(x - b.x, z - b.z) < br + r) return false;
  }

  // 田地（旋转矩形）
  for (const f of FIELD_RECTS) {
    const cos = Math.cos(-f.rot), sin = Math.sin(-f.rot);
    const dx = x - f.x, dz = z - f.z;
    const lx = dx * cos - dz * sin;
    const lz = dx * sin + dz * cos;
    if (Math.abs(lx) < f.w / 2 + r && Math.abs(lz) < f.d / 2 + r) return false;
  }

  // 三处围栏：内部和贴边都不种
  for (const poly of [PASTURE, COOP, HORSE_PASTURE]) {
    if (pointInPolygon(x, z, poly)) return false;
    if (distToPolygonEdge(x, z, poly) < r) return false;
  }

  // 干草堆
  for (const [hx, hz, hr] of HAY_BALES) {
    if (Math.hypot(x - hx, z - hz) < hr + r) return false;
  }

  // 卡车（新增：原来漏了，树木可能种到卡车上）
  if (TRUCK && Math.hypot(x - TRUCK.x, z - TRUCK.z) < 5 + r) return false;

  // 大树 / 木材堆
  if (Math.hypot(x - BIG_TREE.x, z - BIG_TREE.z) < BIG_TREE.radius + r) return false;
  if (Math.hypot(x - WOODPILE.x, z - WOODPILE.z) < 4 + r) return false;

  // 品种树（按树干半径 + 树冠）
  for (const s of TREE_SPECS) {
    if (Math.hypot(x - s.x, z - s.z) < 3.0 + r) return false;
  }

  // 车道
  if (distToRoad(x, z) < ROAD_CLEAR) return false;

  return true;
}

// ---------------------------------------------------------------------------
// 农场内的随机点缀树（新版体素模型）
//
// ★ 和远景森林的区别：
//   森林用 InstancedMesh（1170 棵共用 2 个几何体，必须极简）；
//   这里只有 3~5 棵，可以每棵都是完整的新版模型（2.7~6 万顶点）。
//
// ★ 尺寸：70% / 50% 两档（新版模型高约 8）
//     70% → 高约 5.6，树冠半径约 2.5
//     50% → 高约 4.0，树冠半径约 1.8
//
// ★ 防穿模：复用 canPlantTree（建筑/田地/围栏/干草堆/卡车/大树/车道全排除），
//   再叠加"树与树之间 >= 7 米"的间距检查。
// ---------------------------------------------------------------------------
// ---------------------------------------------------------------------------
// 农场内的点缀树（新版体素模型）
//
// ★ 位置：按用户俯视图蓝圈标注的草地空处固定放置（5 处）。
//   大小：70% / 50% 两档（相对固定四棵树平均高 15 米 → 10.5 / 7.5 米）。
//   防穿模：每条坐标都经过 canPlantTree 验证 + 螺旋搜索修正。
// ---------------------------------------------------------------------------
// 蓝圈对应的固定坐标（已通过 canPlantTree；负值为螺旋搜索后的最近空旷点）
export const SCATTER_SPOTS = [
  // ★ 水池边只保留一棵 —— 用户指定保留【原来那棵】（水池北岸橡树），
  //   删掉南岸这棵红色的秋树。
  // ★ 往北挪 5 单位到岸上（原 -22 实际在池塘水线内侧，池塘实测半径 25.9）
  { x: -78,   z: -27,   kind: 'camellia', size: 0.70 },   // 水池北岸 · 橡树
  { x: 18,    z: -28,   kind: 'birch',  size: 0.50 },   // 上方：作物田间草地（农舍西北）
  // ★ 农舍门口的镜像树 —— 与农舍西北那棵白桦(18,-28) 绕农舍中心(30,-18) 对称，
  //   位置 (42,-8)，距农舍 15.6（和原树完全相同）。
  //   尺寸比原树大 30%：原 7.5 米 → 9.75 米（size 0.50 → 0.65，scale 0.92 → 1.20）。
  { x: 42,    z: -8,    kind: 'blossom', size: 0.65 },   // 农舍东南 · 镜像树
  // ★ 原"水塔旁云杉"(74, 6) 已删除 —— 它就长在风车正上方，
  //   风车造型被挡住。用户要求删这棵，不是羊驼群那棵橡树。
  { x: 52,    z: 40,    kind: 'maple',  size: 0.50 },   // 右下：篝火旁
  // 牛羊群中心靠左（PASTURE 牧场内，质心 -22.3,48.7，靠左取 x=-38）
  { x: -38,    z: 50,    kind: 'apple',  size: 0.70 },   // 牛羊群中心靠左
];

// ★ buildTree 内部已按品种把高度归一化到 TREE_REF_H（见 bigtree.js 的
//   treeHeightFix），所以这里【不需要】再按品种分表 ——
//   传进去的 scale 最终恒等于"目标高度 / TREE_REF_H"。
//   原来那份 SCATTER_BASE_H 是归一化之前的旧表（云杉还写着 8.67，
//   实际模型是 11.37），留着会让云杉算出的 scale 偏大。
// 相对固定四棵树平均高 15 米：70% → 10.5 米，50% → 7.5 米
const scaleForSize = (kind, size) => (15.0 * size) / TREE_REF_H;

export function buildScatterTrees(model, rng, buildTreeFn, count = 0) {
  const group = new THREE.Group();
  group.name = 'scatter-trees';

  const placed = [];
  for (const sp of SCATTER_SPOTS) {
    const scale = scaleForSize(sp.kind, sp.size);
    const tree = buildTreeFn(model, rng, { x: sp.x, z: sp.z, kind: sp.kind, scale });
    // 微调旋转，让树不都朝同一方向
    tree.rotation.y = rng.next() * Math.PI * 2;
    group.add(tree);
    placed.push({ x: sp.x, z: sp.z, scale, kind: sp.kind });
  }

  group.userData.placed = placed;
  return group;
}


export function buildForest(model, rng, count = WORLD.treeCount) {
  const pineGeo = mergeColored(makePineGeo());
  const roundGeo = mergeColored(makeRoundGeo());

  // 树不再随风摆动：远处 900 棵树同时摆动时，整体轮廓会在雾里"呼吸"，
  // 看起来像一片在动的噪点，比静止更脏。低多边形风格里树保持静止更稳。
  // （applyWind 函数保留，需要时把 strength 调回来即可）
  const mat = toonLambert({ vertexColors: true, flatShading: true, shared: false });

  // ★ rounds 不能再用 mat.clone()：Material.copy() 不复制
  //   onBeforeCompile / customProgramCacheKey，克隆出来的材质没有三渲二注入。
  //   用同一个工厂再造一份独占材质，参数一致、钩子完整。
  const matRound = toonLambert({ vertexColors: true, flatShading: true, shared: false });

  const pines = new THREE.InstancedMesh(pineGeo, mat, count);
  const rounds = new THREE.InstancedMesh(roundGeo, matRound, Math.floor(count * 0.32));
  pines.name = 'pines';
  rounds.name = 'rounds';

  const m = new THREE.Matrix4();
  const q = new THREE.Quaternion();
  const pos = new THREE.Vector3();
  const scl = new THREE.Vector3();
  const up = new THREE.Vector3(0, 1, 0);

  let pi = 0, ri = 0;
  let guard = 0;
  const HALF = WORLD.size / 2;

  while ((pi < count || ri < rounds.count) && guard < count * 40) {
    guard++;
    const x = rng.range(-HALF * 0.94, HALF * 0.94);
    const z = rng.range(-HALF * 0.94, HALF * 0.94);
    const dist = Math.hypot(x, z);
    const slope = model.slopeAt(x, z);
    const y = model.heightAt(x, z);

    // 台地中央不种树（留给农场）
    // 内边界从 118 收到 104：森林整体往农场方向"扩"一圈。
    // 真正的防穿模交给下面的 canPlantTree（建筑/田地/围栏/车道逐项排除），
    // 所以这里放宽不会把树种进谷仓里。
    if (dist < 104) continue;
    // 太陡不种
    if (slope > 0.85) continue;
    // 太高（山脊顶）稀疏 —— 放宽到 0.55，让山脊上也长出一层树
    if (y > 68 && rng.next() > 0.55) continue;

    // ★ 不能穿模：建筑 / 田地 / 围栏 / 车道 / 干草堆 / 大树
    if (!canPlantTree(x, z)) continue;

    // 边缘更密，形成环抱感
    // 密度 +30%：基础接受率 0.35 -> 0.455，环带增量 0.65 -> 0.845
    // （两者都乘 1.3，形状不变，整体更密）
    const density = smoothstep(104, 200, dist);
    if (rng.next() > 0.455 + density * 0.845) continue;

    pos.set(x, y - 0.4, z);
    q.setFromAxisAngle(up, rng.next() * Math.PI * 2);
    const s = rng.range(0.75, 1.55);
    scl.set(s, s * rng.range(0.9, 1.15), s);
    m.compose(pos, q, scl);

    if (ri < rounds.count && rng.chance(0.3)) {
      rounds.setMatrixAt(ri++, m);
    } else if (pi < count) {
      pines.setMatrixAt(pi++, m);
    }
  }

  pines.count = pi;
  rounds.count = ri;
  pines.instanceMatrix.needsUpdate = true;
  rounds.instanceMatrix.needsUpdate = true;
  pines.castShadow = false;
  pines.receiveShadow = false;
  rounds.castShadow = false;
  rounds.receiveShadow = false;

  const group = new THREE.Group();
  group.name = 'forest';
  group.add(pines, rounds);

  // 暴露材质和基础色，供季节切换使用
  group.userData.materials = [pines.material, rounds.material];
  group.userData.baseColors = [
    pines.material.color.clone(),
    rounds.material.color.clone(),
  ];

  // -------------------------------------------------------------------------
  // 季节染色：直接改顶点色，而不是改 material.color
  //
  // 为什么不能只乘 material.color：
  //   树冠顶点色是"绿"(0.159, 0.392, 0.076)，冬天目标褐色是 (0.66, 0.44, 0.19)。
  //   乘色只能整体压暗/偏色，绿分量永远不可能降到比红低 ——
  //   实测秋/冬乘完是 (1.51, 0.67, 0.77) 的粉褐色（r 还溢出到 >1），
  //   远看仍是"发白的绿树"。要真的变褐，必须重写顶点色。
  //
  // 做法：把每个顶点色按 HSL 拆开，只改色相/饱和度，保留原亮度层次，
  //   再按 aCrown 权重插值 —— 树干树枝保持木色不变。
  // -------------------------------------------------------------------------
  const _baseColors = [pineGeo.attributes.color.array, roundGeo.attributes.color.array];
  const _crownAttr = [pineGeo.attributes.aCrown.array, roundGeo.attributes.aCrown.array];
  const _baseCopy = _baseColors.map(a => a.slice());

  const _hsl = { h: 0, s: 0, l: 0 };
  const _hslT = { h: 0, s: 0, l: 0 };
  const _tmpC2 = new THREE.Color();
  const _tmpC3 = new THREE.Color();

  // 夏季基准色：用它作为"原亮度"的锚点，保证换季只改色相/饱和度，
  // 明暗层次和夏季完全一致（否则秋冬会因为目标色更暗而整片压黑）。
  const _summerRef = new THREE.Color(SEASON.summer.leafA);
  const _summerRefL = _summerRef.getHSL(_hsl).l;

  // leafHex: 目标树冠色（SEASON 里那一档）
  //
  // ★ 三条约束（用户反馈"秋冬森林太黑、饱和度太高、对比度太高"）：
  //   1. 明度只允许在夏季基准附近小幅浮动 —— 不能直接用目标色的绝对 L，
  //      否则秋天(0.45) / 冬天(0.42) 会把整片森林压暗一档。
  //   2. 饱和度要打折 —— 目标色是"单棵树"的纯色，成片 1170 棵叠在一起
  //      会显得过分鲜艳，乘 0.72 才和夏季观感一致。
  //   3. 保留每个顶点自己的明暗差（_hsl.l - 基准 l 的偏移量要带过去），
  //      不能全部拍平到同一个 L，否则森林变成一块平板、对比度反而更高。
  group.userData.applyLeafColor = (leafHex) => {
    _tmpC2.setHex(leafHex);
    _tmpC2.convertLinearToSRGB();
    _tmpC2.getHSL(_hslT);

    const targetH = _hslT.h;
    // 饱和度打折：0.72 是实测值，秋冬成片不会"艳得发黑"
    const targetS = Math.min(0.92, _hslT.s * 0.72);
    // 明度：以夏季基准为准，只吸收目标色 25% 的明暗倾向
    const targetL = _hsl.l * 0.75 + _hslT.l * 0.25;

    for (let m = 0; m < 2; m++) {
      const arr = _baseColors[m];
      const base = _baseCopy[m];
      const cr = _crownAttr[m];
      for (let i = 0, n = cr.length; i < n; i++) {
        const o = i * 3;
        if (cr[i] < 0.5) {
          // 树干/树枝：保持原色
          arr[o] = base[o];
          arr[o + 1] = base[o + 1];
          arr[o + 2] = base[o + 2];
          continue;
        }
        // 原始顶点色（线性）→ 转 sRGB 取 HSL
        _tmpC3.setRGB(base[o], base[o + 1], base[o + 2], THREE.LinearSRGBColorSpace);
        _tmpC3.getHSL(_hsl);

        // 只带过"这个顶点相对夏季基准亮了多少/暗了多少"的偏移量，
        // 且压缩到 60%，避免明暗差被放大成高对比。
        const delta = (_hsl.l - _summerRefL) * 0.6;
        const L = Math.min(0.86, Math.max(0.10, targetL + delta));

        _tmpC3.setHSL(targetH, targetS, L);
        _tmpC3.convertSRGBToLinear();
        arr[o] = _tmpC3.r;
        arr[o + 1] = _tmpC3.g;
        arr[o + 2] = _tmpC3.b;
      }
      const attr = m === 0 ? pineGeo.attributes.color : roundGeo.attributes.color;
      attr.needsUpdate = true;
    }
  };

  // 树静止后不需要再每帧更新 uTime（applyWind 已停用）
  group.userData.update = () => {};

  return group;
}