import * as THREE from '../../vendor/three/three.module.js';
import { FIELD_RECTS } from './layout.js';
import { tint } from '../util/geo.js';
import { toonLambert } from '../render/toon.js';
import { makeFbm } from '../util/noise.js';
import {
  makeWheat, makePumpkin, makeSunflower, makeCorn,
  makeCarrot, setSkipSoil,
} from './cropDemo.js';
import { CROP_TYPES } from './cropTypes.js';

// ---------------------------------------------------------------------------
// 农田：贴合地形的土壤 + 成排作物
//
// 历史问题：土壤原来是"单高度平面"，取整块地的最高点，
// 在坡地上低处就会悬空（实测最高悬空 3.39 单位）。
// 现在改成**细分网格 + 逐顶点贴合地形**，坡地上也是贴着的。
// ---------------------------------------------------------------------------

// ---------------------------------------------------------------------------
// 四种作物，形态各不相同：
//   wheat    小麦 —— 细长圆锥 + 顶部麦穗，金黄色，高而尖
//   cabbage  卷心菜 —— 扁平多面体，青绿色，矮而圆
//   pumpkin  南瓜 —— 压扁的球体，橙黄色，趴在地上
//   sunflower 向日葵 —— 细杆 + 花盘，深绿杆 + 黄色花冠
//
// 每种都返回 { geo, height }，height 用于让作物贴地
// ---------------------------------------------------------------------------
// ---------------------------------------------------------------------------
// 新版作物模型（cropDemo.js）—— 体素方块风，细节更丰富
//
// ★ 用法：这些函数返回 y=0 起的 Group，需要合并成单个几何体供 InstancedMesh 用。
//   做法：遍历所有 mesh，把几何体应用世界矩阵后合并。
// ---------------------------------------------------------------------------
const NEW_CROP_BUILDERS = {
  wheat: makeWheat,
  pumpkin: makePumpkin,
  sunflower: makeSunflower,
  corn: makeCorn,
  carrot: makeCarrot,
};

// 把 Group 里的所有 mesh 合并成一个几何体（保留顶点色）
function mergeGroupToGeometry(group) {
  group.updateMatrixWorld(true);
  const geos = [];
  group.traverse((o) => {
    if (!o.isMesh || !o.geometry) return;
    const g = o.geometry.clone();
    g.applyMatrix4(o.matrixWorld);
    // 确保有顶点色（tint 生成的几何体都有）
    if (!g.attributes.color) {
      const n = g.attributes.position.count;
      const col = new Float32Array(n * 3).fill(1);
      g.setAttribute('color', new THREE.BufferAttribute(col, 3));
    }
    geos.push(g);
  });
  if (!geos.length) return new THREE.BoxGeometry(0.5, 0.5, 0.5);
  return mergeSimple(geos);
}

function cropGeometry(kind) {
  // 新版模型优先
  const builder = NEW_CROP_BUILDERS[kind];
  if (builder) {
    // ★ 田地里跳过模型自带的土壤块（整块田已有 soil 底板）
    // ★ LOD 0.25：田地需要高密度，必须用简化版模型
    //   （完整版每丛 8000 顶点，60% 覆盖要 500+ 丛 = 400 万顶点，不可行）
    setSkipSoil(true);
    const g = builder({ lod: 0.25 });
    setSkipSoil(false);
    const geo = mergeGroupToGeometry(g);
    // ★ 新版模型是「一丛多株」，要缩小到单株尺度，否则田地放不下。
    //   模型本身宽 2.1~4.15，缩到 0.55 后宽 1.2~2.3，和田地间距匹配。
    geo.scale(0.55, 0.55, 0.55);
    geo.computeBoundingBox();
    return geo;
  }

  // 旧版几何（卷心菜 / 番茄 / 薰衣草）
  if (kind === 'tomato' || kind === 'lavender') {
    return cropGeometryExtra(kind);
  }

  if (kind === 'wheat') {
    // 小麦：细长的锥形茎秆，顶端略粗（麦穗）
    const parts = [];
    const stalk = new THREE.ConeGeometry(0.14, 1.3, 4);
    stalk.translate(0, 0.65, 0);
    parts.push(tint(stalk, 0xd9b84a));
    const head = new THREE.ConeGeometry(0.22, 0.42, 4);
    head.translate(0, 1.42, 0);
    parts.push(tint(head, 0xe8cc5e));
    return mergeSimple(parts);
  }

  if (kind === 'cabbage') {
    // 卷心菜：扁平的层叠叶片
    const parts = [];
    const base = new THREE.IcosahedronGeometry(0.5, 0);
    base.scale(1, 0.55, 1);
    base.translate(0, 0.28, 0);
    parts.push(tint(base, 0x6fae4a));
    const top = new THREE.IcosahedronGeometry(0.32, 0);
    top.scale(1, 0.5, 1);
    top.translate(0, 0.46, 0);
    parts.push(tint(top, 0x8ec860));
    return mergeSimple(parts);
  }

  if (kind === 'pumpkin') {
    // 南瓜：压扁的球 + 顶部小蒂
    const parts = [];
    const body = new THREE.SphereGeometry(0.42, 8, 6);
    body.scale(1.15, 0.7, 1.15);
    body.translate(0, 0.3, 0);
    parts.push(tint(body, 0xe08a3c));
    const stem = new THREE.CylinderGeometry(0.06, 0.08, 0.16, 5);
    stem.translate(0, 0.6, 0);
    parts.push(tint(stem, 0x6a7a3a));
    return mergeSimple(parts);
  }

  // sunflower：向日葵
  const parts = [];
  const stalk = new THREE.CylinderGeometry(0.05, 0.07, 1.1, 4);
  stalk.translate(0, 0.55, 0);
  parts.push(tint(stalk, 0x5a8a3a));
  // 两片叶子
  const leaf1 = new THREE.ConeGeometry(0.16, 0.3, 3);
  leaf1.rotateZ(Math.PI / 2.4);
  leaf1.translate(0.16, 0.62, 0);
  parts.push(tint(leaf1, 0x6aa04a));
  const leaf2 = new THREE.ConeGeometry(0.14, 0.26, 3);
  leaf2.rotateZ(-Math.PI / 2.4);
  leaf2.translate(-0.14, 0.78, 0);
  parts.push(tint(leaf2, 0x6aa04a));
  // 花盘
  const head = new THREE.CylinderGeometry(0.26, 0.26, 0.1, 8);
  head.rotateX(Math.PI / 2);
  head.translate(0, 1.14, 0);
  parts.push(tint(head, 0xf0c04a));
  const center = new THREE.CylinderGeometry(0.13, 0.13, 0.13, 8);
  center.rotateX(Math.PI / 2);
  center.translate(0, 1.14, 0.03);
  parts.push(tint(center, 0x6a4a28));
  return mergeSimple(parts);
}

// ---------------------------------------------------------------------------
// 另外 4 种作物（共 8 种）
// ---------------------------------------------------------------------------

function cropGeometryExtra(kind) {
  if (kind === 'corn') {
    // 玉米：高秆 + 两侧长叶 + 中部玉米棒
    const parts = [];
    const stalk = new THREE.CylinderGeometry(0.06, 0.09, 1.7, 5);
    stalk.translate(0, 0.85, 0);
    parts.push(tint(stalk, 0x6a9a4a));
    // 4 片下垂的长叶
    for (let i = 0; i < 4; i++) {
      const leaf = new THREE.ConeGeometry(0.1, 0.7, 3);
      leaf.rotateZ(Math.PI / 2.6);
      leaf.rotateY((i / 4) * Math.PI * 2);
      leaf.translate(
        Math.cos((i / 4) * Math.PI * 2) * 0.28,
        0.55 + i * 0.22,
        Math.sin((i / 4) * Math.PI * 2) * 0.28
      );
      parts.push(tint(leaf, 0x7ab05a));
    }
    // 玉米棒（中部）
    const cob = new THREE.CylinderGeometry(0.11, 0.13, 0.42, 6);
    cob.rotateZ(0.3);
    cob.translate(0.14, 1.05, 0);
    parts.push(tint(cob, 0xf0d060));
    // 顶端雄花
    const tassel = new THREE.ConeGeometry(0.1, 0.3, 4);
    tassel.translate(0, 1.82, 0);
    parts.push(tint(tassel, 0xd8c060));
    return mergeSimple(parts);
  }

  if (kind === 'tomato') {
    // 番茄：矮灌木 + 几颗红果
    const parts = [];
    // 主茎
    const stem = new THREE.CylinderGeometry(0.05, 0.07, 0.9, 4);
    stem.translate(0, 0.45, 0);
    parts.push(tint(stem, 0x5a8a3a));
    // 三团叶子
    //   ★ 叶团半径 0.30 → 0.26：原来叶团太大，把红果完全包住，
    //     整丛看上去是一片绿，只有零星几个红点。
    for (let i = 0; i < 3; i++) {
      const a = (i / 3) * Math.PI * 2;
      const bush = new THREE.IcosahedronGeometry(0.26, 0);
      bush.scale(1, 0.75, 1);
      bush.translate(Math.cos(a) * 0.24, 0.52 + i * 0.16, Math.sin(a) * 0.24);
      parts.push(tint(bush, 0x5f9a44));
    }
    // 红果：3 颗 → 6 颗，半径 0.14 → 0.20
    //   ★ 番茄的辨识度全靠红果，果实太小/太少整丛就只是"一坨绿"。
    //     6 颗 0.20 的果子露在叶团外面，红绿比约 4:6，一眼能认出是番茄。
    for (let i = 0; i < 6; i++) {
      const a = (i / 6) * Math.PI * 2 + 0.3;
      const rr = 0.30 + (i % 2) * 0.06;
      const fruit = new THREE.SphereGeometry(0.20, 6, 5);
      fruit.translate(
        Math.cos(a) * rr,
        0.46 + (i % 3) * 0.22,
        Math.sin(a) * rr
      );
      parts.push(tint(fruit, 0xd8402a));
    }
    return mergeSimple(parts);
  }

  if (kind === 'carrot') {
    // 胡萝卜：露出地面的绿叶簇
    const parts = [];
    for (let i = 0; i < 5; i++) {
      const a = (i / 5) * Math.PI * 2;
      const leaf = new THREE.ConeGeometry(0.07, 0.62, 3);
      leaf.rotateZ(Math.PI / 5);
      leaf.rotateY(a);
      leaf.translate(Math.cos(a) * 0.1, 0.3, Math.sin(a) * 0.1);
      parts.push(tint(leaf, 0x5f9a3a));
    }
    // 顶部露出一点橙色根
    const root = new THREE.ConeGeometry(0.12, 0.16, 6);
    root.rotateX(Math.PI);
    root.translate(0, 0.08, 0);
    parts.push(tint(root, 0xe07a2a));
    return mergeSimple(parts);
  }

  // lavender：薰衣草 —— 细高茎 + 紫色穗
  const parts = [];
  for (let i = 0; i < 4; i++) {
    const a = (i / 4) * Math.PI * 2 + 0.3;
    const r = 0.12;
    const stem = new THREE.CylinderGeometry(0.025, 0.035, 0.85, 3);
    stem.translate(Math.cos(a) * r, 0.42, Math.sin(a) * r);
    parts.push(tint(stem, 0x7a9a5a));
    // 紫色花穗
    const spike = new THREE.ConeGeometry(0.075, 0.34, 5);
    spike.translate(Math.cos(a) * r, 0.98, Math.sin(a) * r);
    parts.push(tint(spike, 0x9a7ac8));
  }
  return mergeSimple(parts);
}

// 局部坐标 -> 世界坐标（与 Object3D.rotation.y 完全一致）
function localToWorld(x, z, rot, lx, lz) {
  const c = Math.cos(rot), s = Math.sin(rot);
  return [x + lx * c + lz * s, z - lx * s + lz * c];
}

const soilBumpFbm = makeFbm(4321, 3, 2.15, 0.5);

function soilBumpAt(x, z) {
  return soilBumpFbm(x * 0.38, z * 0.38) * 0.030
       + soilBumpFbm(x * 1.6, z * 1.6) * 0.005;
}

// ---------------------------------------------------------------------------
// 贴合地形的土壤网格：把矩形细分成 N×M，每个顶点取地形高度 + 微抬
// 这样坡地上也不会悬空，且和周围草地严丝合缝
// ---------------------------------------------------------------------------
function makeSoilMesh(model, x, z, w, d, rot, color, segX = 12, segZ = 10) {
  const fineSegX = Math.max(segX, Math.ceil(w / 0.85));
  const fineSegZ = Math.max(segZ, Math.ceil(d / 0.85));
  const geo = new THREE.PlaneGeometry(w, d, fineSegX, fineSegZ);
  geo.rotateX(-Math.PI / 2);

  const pos = geo.attributes.position;
  const c = Math.cos(rot), s = Math.sin(rot);

  // 注意：顶点最终会被 mesh.position 平移到 (x,0,z)，所以这里必须把
  // 顶点写成"世界坐标 - mesh.position"，否则地形采样会偏掉一整块。
  // 做法：先按世界坐标算高度，再把 x/z 也写成世界坐标，mesh.position 设为 0。
  for (let i = 0; i < pos.count; i++) {
    const lx = pos.getX(i);
    const lz = pos.getZ(i);
    const wx = x + lx * c + lz * s;
    const wz = z - lx * s + lz * c;
    pos.setX(i, wx);
    pos.setZ(i, wz);
    // 抬高 0.12，避免和地形 z-fighting，同时形成一点"田埂厚度"的观感
    pos.setY(i, model.heightAt(wx, wz) + 0.12 + soilBumpAt(wx, wz));
  }
  geo.computeVertexNormals();

  const mat = toonLambert({
    color,
    polygonOffset: true,
    polygonOffsetFactor: -1,
    polygonOffsetUnits: -1,
    shared: false,
  });
  mat.onBeforeCompile = (shader) => {
    shader.vertexShader =
      'varying vec3 vSoilWorld;\nvarying float vSoilDist;\n' +
      shader.vertexShader.replace(
        '#include <begin_vertex>',
        '#include <begin_vertex>\n         vSoilWorld = transformed;\n         vSoilDist = length((modelViewMatrix * vec4(transformed, 1.0)).xyz);'
      );
    const prefix = 'varying vec3 vSoilWorld;\nvarying float vSoilDist;\n' +
      'float soilHash(vec2 p) { return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }\n' +
      'float soilNoise(vec2 p) {\n' +
      '  vec2 i = floor(p), f = fract(p);\n' +
      '  f = f * f * (3.0 - 2.0 * f);\n' +
      '  float a = soilHash(i), b = soilHash(i + vec2(1.0, 0.0));\n' +
      '  float c = soilHash(i + vec2(0.0, 1.0)), d = soilHash(i + vec2(1.0, 1.0));\n' +
      '  return mix(mix(a, b, f.x), mix(c, d, f.x), f.y);\n' +
      '}\n' +
      'float soilFbm(vec2 p) { return soilNoise(p) * 0.62 + soilNoise(p * 2.1) * 0.38; }\n' +
      'float soilHeight(vec2 p) { return soilFbm(p * 0.95) * 0.02 + soilNoise(p * 2.6) * 0.003; }\n';
    shader.fragmentShader = prefix + shader.fragmentShader.replace(
      '#include <color_fragment>',
      '#include <color_fragment>\n' +
      '  float sCoarse = soilFbm(vSoilWorld.xz * 0.22);\n' +
      '  float sClod = soilNoise(vSoilWorld.xz * 0.9);\n' +
      '  float sFine = soilNoise(vSoilWorld.xz * 3.2);\n' +
      '  float sGrit = soilHash(floor(vSoilWorld.xz * 6.0));\n' +
      '  float sShade = 0.97 + sCoarse * 0.05 + (sClod - 0.5) * 0.035 + (sFine - 0.5) * 0.04;\n' +
      '  vec3 sCol = diffuseColor.rgb * sShade * 1.06;\n' +
      '  sCol += vec3(0.040, 0.030, 0.018) * smoothstep(0.86, 1.0, sGrit) * 0.45;\n' +
      '  float sFade = 1.0 - smoothstep(95.0, 320.0, vSoilDist);\n' +
      '  diffuseColor.rgb = mix(diffuseColor.rgb, sCol, sFade);'
    );
    // 片元级法线扰动：让细碎土块在光照下也能出凹凸感
    shader.fragmentShader = shader.fragmentShader.replace(
      '#include <normal_fragment_begin>',
      '#include <normal_fragment_begin>\n' +
      '  vec2 sp = vSoilWorld.xz;\n' +
      '  float se = 0.18;\n' +
      '  float sh0 = soilHeight(sp);\n' +
      '  float shx = soilHeight(sp + vec2(se, 0.0));\n' +
      '  float shz = soilHeight(sp + vec2(0.0, se));\n' +
      '  vec3 sN = normalize(vec3((sh0 - shx) * 2.5, 0.025, (sh0 - shz) * 2.5));\n' +
      '  normal = normalize(normal * 0.65 + mat3(viewMatrix) * sN);'
    );
    mat.userData.shader = shader;
  };
  mat.customProgramCacheKey = () => 'soil-clods';
  const mesh = new THREE.Mesh(geo, mat);
  // 顶点已经是世界坐标（含旋转与高度），mesh 本身不再位移或旋转
  mesh.position.set(0, 0, 0);
  mesh.rotation.set(0, 0, 0);
  mesh.receiveShadow = true;
  mesh.name = 'soil';
  return mesh;
}

// ---------------------------------------------------------------------------
// 田埂边框：沿四条边逐段贴合地形
// ---------------------------------------------------------------------------
function makeBorder(model, x, z, w, d, rot, baseY) {
  const parts = [];
  const T = 0.55;
  const SEG = 16;

  const addStrip = (fromLocal, toLocal) => {
    for (let i = 0; i < SEG; i++) {
      const t0 = i / SEG, t1 = (i + 1) / SEG;
      const lx0 = fromLocal[0] + (toLocal[0] - fromLocal[0]) * t0;
      const lz0 = fromLocal[1] + (toLocal[1] - fromLocal[1]) * t0;
      const lx1 = fromLocal[0] + (toLocal[0] - fromLocal[0]) * t1;
      const lz1 = fromLocal[1] + (toLocal[1] - fromLocal[1]) * t1;

      const [wx0, wz0] = localToWorld(x, z, rot, lx0, lz0);
      const [wx1, wz1] = localToWorld(x, z, rot, lx1, lz1);
      const h0 = model.heightAt(wx0, wz0);
      const h1 = model.heightAt(wx1, wz1);

      const segLen = Math.hypot(wx1 - wx0, wz1 - wz0);
      if (segLen < 1e-4) continue;

      const g = new THREE.BoxGeometry(T, 0.3, segLen * 1.05);
      const angle = Math.atan2(wx1 - wx0, wz1 - wz0);
      g.rotateX(-Math.atan2(h1 - h0, segLen));
      g.rotateY(angle);
      g.translate((wx0 + wx1) / 2, (h0 + h1) / 2 + 0.16, (wz0 + wz1) / 2);
      parts.push(g);
    }
  };

  const hw = w / 2, hd = d / 2;
  addStrip([-hw, -hd], [hw, -hd]);
  addStrip([hw, -hd], [hw, hd]);
  addStrip([hw, hd], [-hw, hd]);
  addStrip([-hw, hd], [-hw, -hd]);

  const geo = mergeSimple(parts);
  const mesh = new THREE.Mesh(
    geo,
    toonLambert({ color: 0x8a6a48, flatShading: true })
  );
  mesh.receiveShadow = true;
  mesh.name = 'border';
  return mesh;
}

function mergeSimple(list) {
  // ★ 必须保留【顶点色】——
  //   新版作物模型（cropDemo.js）每个方块用 tint() 单独上色
  //   （麦穗金黄、茎秆浅黄、叶子绿…），如果合并时丢掉 color，
  //   整丛只能用材质色渲染，变成一片纯色块，完全看不出结构。
  //   旧版几何也是 tint() 生成的，同样依赖顶点色。
  let vTotal = 0, iTotal = 0;
  let hasColor = false;
  for (const g of list) {
    vTotal += g.attributes.position.count;
    iTotal += g.index ? g.index.count : g.attributes.position.count;
    if (g.attributes.color) hasColor = true;
  }
  const positions = new Float32Array(vTotal * 3);
  const normals = new Float32Array(vTotal * 3);
  const colors = hasColor ? new Float32Array(vTotal * 3) : null;
  const indices = new Uint32Array(iTotal);

  let vOff = 0, iOff = 0;
  for (const g of list) {
    const p = g.attributes.position;
    const n = g.attributes.normal;
    positions.set(p.array.subarray(0, p.count * 3), vOff * 3);
    normals.set(n.array.subarray(0, n.count * 3), vOff * 3);
    // 顶点色：有就复制，没有就填白色（不影响最终颜色）
    if (colors) {
      const c = g.attributes.color;
      if (c) {
        colors.set(c.array.subarray(0, c.count * 3), vOff * 3);
      } else {
        colors.fill(1, vOff * 3, (vOff + p.count) * 3);
      }
    }
    if (g.index) {
      for (let k = 0; k < g.index.count; k++) indices[iOff + k] = g.index.getX(k) + vOff;
      iOff += g.index.count;
    } else {
      for (let k = 0; k < p.count; k++) indices[iOff + k] = k + vOff;
      iOff += p.count;
    }
    vOff += p.count;
    g.dispose();
  }

  const out = new THREE.BufferGeometry();
  out.setAttribute('position', new THREE.BufferAttribute(positions, 3));
  out.setAttribute('normal', new THREE.BufferAttribute(normals, 3));
  if (colors) out.setAttribute('color', new THREE.BufferAttribute(colors, 3));
  out.setIndex(new THREE.BufferAttribute(indices, 1));
  out.computeBoundingSphere();
  return out;
}

function buildField(model, rng, opts) {
  // ★ 密度统一从 CROP_TYPES 取，不要用 FIELD_RECTS 里硬编码的 rows/cols ——
  //   否则初始密度（小麦 12×26 = 312 株）和换品种后的密度（CROP_TYPES 的 5×7）
  //   不一致，同一块田换品种前后疏密差 10 倍。
  const cropDef = CROP_TYPES.find((c) => c.kind === opts.kind);
  const {
    x, z, w, d, rot, kind,
    color = cropDef ? cropDef.color : 0xffffff,
    rows = cropDef ? cropDef.rows : 9,
    cols = cropDef ? cropDef.cols : 16,
    scale = cropDef ? cropDef.scale : [0.85, 1.2],
  } = opts;
  const soilColorOpt = opts.soil;
  const group = new THREE.Group();
  group.name = 'field-' + kind;

  // fenceOnly：只保留围栏（马/羊驼牧场用），不渲染土壤/田埂/作物
  if (opts.fenceOnly) {
    group.userData.fenceOnly = true;
    group.userData.cropKind = kind;
    group.userData.setCrop = () => {};   // 空实现，避免调用报错
    return group;
  }

  // ---------- 土壤（贴合地形，每块田的土色也不同） ----------
  const soilColor = soilColorOpt ?? 0x9c7d55;
  const soil = makeSoilMesh(model, x, z, w, d, rot, soilColor);
  group.add(soil);

  // ---------- 田埂（贴合地形） ----------
  const border = makeBorder(model, x, z, w, d, rot, 0);
  group.add(border);

  // ---------- 作物 ----------
  // 每株作物单独取所在位置的地形高度，保证都长在地面上
  // ---------- 作物（可运行时重建）----------
  // 抽成函数，换作物时先 dispose 旧的再重建
  let cropMesh = null;
  let cropMat = null;

  function buildCrops(kindNow, colorNow) {
    // 清掉旧的
    if (cropMesh) {
      group.remove(cropMesh);
      cropMesh.geometry.dispose();
      cropMesh.material.dispose();
      cropMesh = null;
    }

    const geo = cropGeometry(kindNow);

    // 作物材质 + 距离淡出
    // 每株作物是很细的几何体（麦穗宽约 0.3），远处投影后只有 1~2 像素，
    // 一整片在画面上就是密密麻麻的锐利细线 —— 高频细节极强。
    // 按距离淡出，远处的作物逐渐融入土壤色。
    // shared:false —— 下面覆盖 onBeforeCompile，且换作物时会 dispose()
    // ★ 顶点色渲染的两个必要条件和它们的陷阱：
    //
    //   1) 材质必须 vertexColors: true ——
    //      新版作物每个方块用 tint() 单独上色（茎秆黄、麦穗金、叶子绿、玉米棒黄、萝卜橙…）。
    //      不开这个开关，整丛只用 color 一个色渲染 → 玉米全绿、胡萝卜全绿。
    //
    //   2) color 必须是【白色】——
    //      three.js 里最终颜色 = material.color × vertexColor。
    //      color 只要有颜色就会把顶点色【压暗 + 染色】：
    //        玉米棒黄 0xf0d888 × 材质绿 0x7ab05a = 暗绿  ← 棒子变绿
    //        萝卜橙   0xe87820 × 材质绿 0x5f9a3a = 暗棕  ← 看着发黑
    //        番茄红   × 材质绿                = 暗褐
    //      所以这里必须用 0xffffff，让顶点色完全主导。
    //      颜色信息已经全部烘进顶点色了，material.color 只是乘法基色。
    const mat = toonLambert({
      color: 0xffffff,
      flatShading: true,
      transparent: false,
      vertexColors: true,
      shared: false,
    });

    cropMat = mat;
    mat.onBeforeCompile = (shader) => {
      shader.uniforms.uTime = { value: 0 };
      shader.vertexShader = 'uniform float uTime;\n' + shader.vertexShader.replace(
        '#include <begin_vertex>',
        '#include <begin_vertex>\n' +
        '#ifdef USE_INSTANCING\n' +
        '  vec3 co = instanceMatrix[3].xyz;\n' +
        '  float ch = fract(sin(dot(co.xz, vec2(127.1, 311.7))) * 43758.5453);\n' +
        '  float cspd = 0.8 + ch * 1.0;\n' +
        '  float cph = ch * 6.2831;\n' +
        '  float csway = transformed.y * (0.012 + ch * 0.010);\n' +
        '  transformed.x += sin(uTime * cspd + cph + co.x * 0.25) * csway;\n' +
        '  transformed.z += cos(uTime * cspd * 0.83 + cph * 1.3 + co.z * 0.2) * csway * 0.65;\n' +
        '#endif'
      );
      mat.userData.shader = shader;
    };
    mat.customProgramCacheKey = () => 'crop-wind';

    const mesh = new THREE.InstancedMesh(geo, mat, rows * cols);
    mesh.name = 'crops';
    mesh.castShadow = false;
    mesh.receiveShadow = false;
    cropMesh = mesh;

    const m = new THREE.Matrix4();
    const q = new THREE.Quaternion();
    const p = new THREE.Vector3();
    const sv = new THREE.Vector3();
    const up = new THREE.Vector3(0, 1, 0);

    // ★ 作物必须完全落在土壤内，不能压到田埂或围栏外。
    //
    //   最外格中心 = ±(w*inset/2)，再叠加抖动 ±jitterX，
    //   总偏移不能超过 w/2 - cropRadius。
    //
    //   之前 inset 0.94 + jitter 0.3*cellW：
    //     南瓜 cols=9 → cellW = w*0.94/8 = 0.1175w
    //     最外格 = 0.47w + 0.035w = 0.505w  ← 超出边界！
    //   现在 inset 0.86 + jitter 0.12*cellW：
    //     最外格 = 0.43w + 0.014w = 0.444w  ← 留 5.6% 余量
    const inset = 0.86;
    const cellW = cols > 1 ? (w * inset) / (cols - 1) : w;
    const cellD = rows > 1 ? (d * inset) / (rows - 1) : d;
    const jitterX = cellW * 0.12;
    const jitterZ = cellD * 0.12;

    const tiltQ = new THREE.Quaternion();
    const tiltAxis = new THREE.Vector3();

    let i = 0;
    for (let r = 0; r < rows; r++) {
      for (let c = 0; c < cols; c++) {
        // 边缘稀疏
        const nearEdge = r === 0 || r === rows - 1 || c === 0 || c === cols - 1;
        if (nearEdge && rng.chance(0.25)) continue;

        // 位置抖动
        const baseX = (cols > 1 ? c / (cols - 1) - 0.5 : 0) * w * inset;
        const baseZ = (rows > 1 ? r / (rows - 1) - 0.5 : 0) * d * inset;
        const lx = baseX + rng.range(-jitterX, jitterX);
        const lz = baseZ + rng.range(-jitterZ, jitterZ);
        const [wx, wz] = localToWorld(x, z, rot, lx, lz);
        const wy = model.heightAt(wx, wz) + 0.12 + soilBumpAt(wx, wz);

        p.set(wx, wy, wz);
        q.setFromAxisAngle(up, rng.next() * Math.PI * 2);
        // 3% 倒伏
        if (rng.chance(0.03)) {
          const ang = rng.next() * Math.PI * 2;
          const tilt = rng.range(0.12, 0.35);
          tiltAxis.set(Math.cos(ang), 0, Math.sin(ang)).normalize();
          tiltQ.setFromAxisAngle(tiltAxis, tilt);
          q.premultiply(tiltQ);
        }

        const sc = rng.range(scale[0], scale[1]);
        sv.set(sc, sc * rng.range(0.85, 1.25), sc);
        m.compose(p, q, sv);
        mesh.setMatrixAt(i++, m);
      }
    }
    mesh.count = i;
    mesh.instanceMatrix.needsUpdate = true;

    group.add(mesh);
  }

  buildCrops(kind, color);

  // 换作物接口
  //   ★ 必须先移除旧作物 mesh 并释放资源 ——
  //     之前直接 buildCrops 会【叠加】一组新的，
  //     切几次后田里同时有小麦+南瓜+玉米，越切越乱。
  group.userData.setCrop = (newKind, newColor) => {
    // 移除所有旧作物
    for (let i = group.children.length - 1; i >= 0; i--) {
      const c = group.children[i];
      if (c.name === 'crops') {
        group.remove(c);
        if (c.geometry) c.geometry.dispose();
        // 材质是共享的（cropMat），不要 dispose
      }
    }
    group.name = 'field-' + newKind;
    group.userData.cropKind = newKind;
    buildCrops(newKind, newColor);
  };
  group.userData.cropKind = kind;
  group.userData.update = (t) => {
    if (cropMat && cropMat.userData.shader) {
      cropMat.userData.shader.uniforms.uTime.value = t;
    }
  };

  return group;
}

export function buildFields(model, rng) {
  const group = new THREE.Group();
  group.name = 'fields';

  for (const d of FIELD_RECTS) group.add(buildField(model, rng, d));

  // ---------- 换作物接口 ----------
  // 每块田独立换，不影响其他田。
  // 传入 CROP_TYPES 里的一项。
  group.userData.setFieldCrop = (fieldIdx, cropType) => {
    const field = group.children[fieldIdx];
    if (!field || !field.userData.setCrop) return null;
    field.userData.setCrop(cropType.kind, cropType.color);
    return cropType;
  };

  // 查询某块田当前是什么作物
  group.userData.getFieldCrop = (fieldIdx) => {
    const field = group.children[fieldIdx];
    return field ? field.userData.cropKind : null;
  };

  group.userData.update = (t) => {
    for (const field of group.children) {
      if (field.userData.update) field.userData.update(t);
    }
  };

  return group;
}