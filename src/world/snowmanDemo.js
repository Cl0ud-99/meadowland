import * as THREE from 'three';
import { tint } from '../util/geo.js';
import { toonLambert } from '../render/toon.js';

// ===========================================================================
// 雪人模型 + 7 种材质风格（独立 demo 用）
//
// 造型参考：经典低多边形雪人
//   - 三个球（下大上小）
//   - 礼帽（帽檐 + 帽筒 + 帽带）
//   - 围巾（绕颈一圈 + 一条垂下的尾巴）
//   - 胡萝卜鼻子、两颗眼睛、三颗纽扣
//   - 左右各一根分叉树枝手臂
//
// ★ 设计要点：所有几何体在【雪人局部坐标】里就已经摆好位置，
//   网格自身 position 恒为 0。这样换风格时可以直接按顶点 Y 坐标
//   上色（热成像 / 果冻的渐变），不需要逐网格换算世界坐标。
//
// ★ 每个部件都用顶点色（vertexColors: true），
//   换风格 = 重写顶点色 + 调材质参数，几何体完全不动。
// ===========================================================================

const UP = new THREE.Vector3(0, 1, 0);

// 造型尺寸（局部坐标，地面 y=0）
//
// ★ 三个球必须【逐个往上摞】且只轻微相交：
//   之前 bottom(cy1.02,r1.05) 和 mid(cy2.00,r0.82) 交叠了 0.89，
//   中球几乎整个埋进大球里，整体轮廓变成"梨形"。
//   现在每个球只压进下一个约 0.5，三段轮廓清楚。
const DIM = {
  bottomR: 1.05, bottomY: 1.05,   // 0.00 ~ 2.10
  midR: 0.80, midY: 2.32,         // 1.52 ~ 3.12
  headR: 0.58, headY: 3.42,       // 2.84 ~ 4.00
  hatBrimR: 0.74, hatBrimH: 0.09, hatBrimY: 4.02,
  hatCrownR: 0.44, hatCrownH: 0.60, hatCrownY: 4.06,
  hatBandH: 0.15, hatBandY: 4.08,
  scarfR: 0.46, scarfTube: 0.115, scarfY: 3.06,
  noseR: 0.125, noseH: 0.56, noseY: 3.40, noseZ: 0.50,
  eyeR: 0.072, eyeY: 3.62, eyeX: 0.20, eyeZ: 0.47,
  btnR: 0.072,
};

export const SNOWMAN_HEIGHT = DIM.hatCrownY + DIM.hatCrownH;

// ---------------------------------------------------------------------------
// 一段树枝：从 from 到 to 的锥形圆柱
// ---------------------------------------------------------------------------
function branchGeo(from, to, r, color) {
  const dir = new THREE.Vector3().subVectors(to, from);
  const len = dir.length();
  const g = new THREE.CylinderGeometry(r * 0.65, r, len, 5);
  // 底面对齐原点、沿 +Y 生长
  g.translate(0, len / 2, 0);
  // 把 +Y 旋到目标方向
  const q = new THREE.Quaternion().setFromUnitVectors(UP, dir.normalize());
  g.applyQuaternion(q);
  g.translate(from.x, from.y, from.z);
  return tint(g, color);
}

// ---------------------------------------------------------------------------
// 按高度上色（热成像 / 果冻用）
//   stops: [{ y, hex }]，按 y 升序；超出两端时取端点色
// ---------------------------------------------------------------------------
const _cA = new THREE.Color();
const _cB = new THREE.Color();
function paintByHeight(geo, stops) {
  const pos = geo.attributes.position;
  const col = geo.attributes.color;
  if (!col) return;
  for (let i = 0; i < pos.count; i++) {
    const y = pos.getY(i);
    // 找到所在区间
    let k = 0;
    while (k < stops.length - 2 && y > stops[k + 1].y) k++;
    const a = stops[k], b = stops[Math.min(k + 1, stops.length - 1)];
    _cA.setHex(a.hex);
    _cB.setHex(b.hex);
    const span = b.y - a.y;
    const t = span > 1e-6 ? Math.max(0, Math.min(1, (y - a.y) / span)) : 0;
    col.setXYZ(
      i,
      _cA.r + (_cB.r - _cA.r) * t,
      _cA.g + (_cB.g - _cA.g) * t,
      _cA.b + (_cB.b - _cA.b) * t
    );
  }
  col.needsUpdate = true;
}

// ---------------------------------------------------------------------------
// 构建雪人（默认低多边形配色）
// ---------------------------------------------------------------------------
export function makeSnowman(opts = {}) {
  const group = new THREE.Group();
  group.name = 'snowman';
  const parts = [];

  // 统一的"加一个部件"：几何体已摆好位置，顶点色先涂默认色
  const add = (key, geo, hex) => {
    tint(geo, hex);
    const mat = toonLambert({ vertexColors: true, flatShading: true, shared: false });
    const m = new THREE.Mesh(geo, mat);
    m.name = key;
    m.userData.partKey = key;
    m.castShadow = true;
    m.receiveShadow = true;
    group.add(m);
    parts.push(m);
    return m;
  };

  // ---------- 身体三个球 ----------
  // 段数刻意压低（10×8），保留低多边形的棱面感
  add('bottom', new THREE.SphereGeometry(DIM.bottomR, 10, 8).translate(0, DIM.bottomY, 0), 0xeef3f7);
  add('mid', new THREE.SphereGeometry(DIM.midR, 10, 8).translate(0, DIM.midY, 0), 0xe8eef4);
  add('head', new THREE.SphereGeometry(DIM.headR, 10, 8).translate(0, DIM.headY, 0), 0xeef3f7);

  // ---------- 礼帽 ----------
  add('hatBrim', new THREE.CylinderGeometry(DIM.hatBrimR, DIM.hatBrimR, DIM.hatBrimH, 12)
    .translate(0, DIM.hatBrimY, 0), 0x2b3038);
  add('hatCrown', new THREE.CylinderGeometry(DIM.hatCrownR, DIM.hatCrownR * 1.02, DIM.hatCrownH, 12)
    .translate(0, DIM.hatCrownY + DIM.hatCrownH / 2, 0), 0x323842);
  add('hatBand', new THREE.CylinderGeometry(DIM.hatCrownR * 1.03, DIM.hatCrownR * 1.03, DIM.hatBandH, 12)
    .translate(0, DIM.hatBandY + DIM.hatBandH / 2, 0), 0x2f5a8a);

  // ---------- 围巾：绕颈一圈 ----------
  //
  // ★ 半径必须贴着【头球和中球的交界】取，不能凭感觉给：
  //   交界在 y = (midY + headY)/2 附近，此处球面半径约 0.52。
  //   之前 scarfR=0.52 + tube 0.12 → 外径 0.64，比脖子粗一圈，
  //   围巾就悬空浮着（用户看到"围巾是断开的"）。
  const ring = new THREE.TorusGeometry(DIM.scarfR, DIM.scarfTube, 8, 18);
  ring.rotateX(Math.PI / 2);
  // 略微压扁成"围巾圈"而不是圆环
  ring.scale(1, 1.35, 1);
  ring.translate(0, DIM.scarfY, 0);
  add('scarfRing', ring, 0xe8862a);

  // 围巾垂下的一条尾巴（略带弧度，用两段拼）
  const tail1 = new THREE.BoxGeometry(0.24, 0.44, 0.13)
    .rotateZ(0.12).translate(0.30, DIM.scarfY - 0.30, 0.44);
  const tail2 = new THREE.BoxGeometry(0.22, 0.32, 0.12)
    .rotateZ(-0.16).translate(0.28, DIM.scarfY - 0.60, 0.42);
  const tailGeo = mergeTwo(tail1, tail2);
  add('scarfTail', tailGeo, 0xd4761e);

  // ---------- 胡萝卜鼻子 ----------
  const nose = new THREE.ConeGeometry(DIM.noseR, DIM.noseH, 6);
  nose.rotateX(Math.PI / 2);            // 尖端朝 +Z
  nose.translate(0, DIM.noseY, DIM.noseZ);
  add('nose', nose, 0xe8862a);

  // ---------- 眼睛 ----------
  for (const side of [-1, 1]) {
    const e = new THREE.SphereGeometry(DIM.eyeR, 6, 5)
      .translate(side * DIM.eyeX, DIM.eyeY, DIM.eyeZ);
    add(side < 0 ? 'eyeL' : 'eyeR', e, 0x24304a);
  }

  // ---------- 三颗纽扣（贴在两个球的前表面）----------
  const btnSpots = [
    [0, 2.72, 0.60],
    [0, 2.42, 0.74],
    [0, 1.92, 0.95],
  ];
  btnSpots.forEach((p, i) => {
    const b = new THREE.SphereGeometry(DIM.btnR, 6, 5).translate(p[0], p[1], p[2]);
    add('btn' + (i + 1), b, 0x24304a);
  });

  // ---------- 树枝手臂（各一根主枝 + 两个分叉）----------
  for (const side of [-1, 1]) {
    const s = side;
    const pieces = [];
    pieces.push(branchGeo(
      new THREE.Vector3(s * 0.62, 2.78, 0.04),
      new THREE.Vector3(s * 1.46, 3.34, 0.12), 0.060, 0x6a4a30));
    pieces.push(branchGeo(
      new THREE.Vector3(s * 1.00, 3.04, 0.07),
      new THREE.Vector3(s * 1.20, 3.46, 0.14), 0.044, 0x6a4a30));
    pieces.push(branchGeo(
      new THREE.Vector3(s * 1.18, 3.20, 0.09),
      new THREE.Vector3(s * 1.48, 3.58, 0.18), 0.039, 0x6a4a30));
    const g = mergeMany(pieces);
    add(side < 0 ? 'armL' : 'armR', g, 0x6a4a30);
  }

  group.userData.parts = parts;
  group.userData.dim = DIM;

  // 默认套低多边形风格
  applySnowmanStyle(group, opts.style || 'lowpoly');

  return group;
}

// 两个几何体合并（保留顶点色）
function mergeTwo(a, b) { return mergeMany([a, b]); }

// 多个几何体合并（带顶点色 / 法线 / 索引）
function mergeMany(list) {
  let vTotal = 0, iTotal = 0;
  for (const g of list) {
    vTotal += g.attributes.position.count;
    iTotal += g.index ? g.index.count : g.attributes.position.count;
  }
  const positions = new Float32Array(vTotal * 3);
  const normals = new Float32Array(vTotal * 3);
  const colors = new Float32Array(vTotal * 3);
  const indices = new Uint32Array(iTotal);

  let vOff = 0, iOff = 0;
  for (const g of list) {
    if (!g.attributes.normal) g.computeVertexNormals();
    const p = g.attributes.position;
    const n = g.attributes.normal;
    const c = g.attributes.color;
    positions.set(p.array.subarray(0, p.count * 3), vOff * 3);
    normals.set(n.array.subarray(0, n.count * 3), vOff * 3);
    if (c) colors.set(c.array.subarray(0, c.count * 3), vOff * 3);
    else colors.fill(1, vOff * 3, (vOff + p.count) * 3);
    if (g.index) {
      for (let i = 0; i < g.index.count; i++) indices[iOff + i] = g.index.getX(i) + vOff;
      iOff += g.index.count;
    } else {
      for (let i = 0; i < p.count; i++) indices[iOff + i] = i + vOff;
      iOff += p.count;
    }
    vOff += p.count;
    g.dispose();
  }

  const out = new THREE.BufferGeometry();
  out.setAttribute('position', new THREE.BufferAttribute(positions, 3));
  out.setAttribute('normal', new THREE.BufferAttribute(normals, 3));
  out.setAttribute('color', new THREE.BufferAttribute(colors, 3));
  out.setIndex(new THREE.BufferAttribute(indices, 1));
  out.computeBoundingSphere();
  return out;
}

// ===========================================================================
// 7 种风格
//
// 每个风格包含：
//   colors   —— 各部件的固有色（gradient 风格用不到，走 paint 回调）
//   mat      —— 材质参数（transparent / opacity / emissive / emissiveIntensity）
//   paint    —— 可选，按高度重写顶点色的色标
//   emissiveColor —— 自发光色（让玻璃 / 晶体 / 热成像有内部光感）
// ===========================================================================
export const SNOWMAN_STYLES = [
  {
    id: 'lowpoly', name: '低多边形',
    colors: {
      bottom: 0xeef3f7, mid: 0xe6edf4, head: 0xeef3f7,
      hatBrim: 0x2b3038, hatCrown: 0x343b46, hatBand: 0x2f5a8a,
      scarfRing: 0xe8862a, scarfTail: 0xd4761e,
      nose: 0xe8862a, eyeL: 0x24304a, eyeR: 0x24304a,
      btn1: 0x24304a, btn2: 0x24304a, btn3: 0x24304a,
      armL: 0x6a4a30, armR: 0x6a4a30,
    },
    mat: { transparent: false, opacity: 1, emissive: 0x000000, emissiveIntensity: 1 },
  },
  {
    id: 'clay', name: '彩泥橡皮泥',
    colors: {
      bottom: 0xe8dcc4, mid: 0xe4d6bc, head: 0xe8dcc4,
      hatBrim: 0x6a4a38, hatCrown: 0x745240, hatBand: 0x8a5a34,
      scarfRing: 0xd87828, scarfTail: 0xc86a1e,
      nose: 0xc87840, eyeL: 0x4a3224, eyeR: 0x4a3224,
      btn1: 0x5a3a28, btn2: 0x5a3a28, btn3: 0x5a3a28,
      armL: 0x8a6a4a, armR: 0x8a6a4a,
    },
    // 橡皮泥：完全不透明、极哑光，稍微压暗一点避免高光塑料感
    mat: { transparent: false, opacity: 1, emissive: 0x1a1208, emissiveIntensity: 1 },
  },
  {
    id: 'frosted', name: '磨砂玻璃',
    colors: {
      bottom: 0xdae6f2, mid: 0xd0dcec, head: 0xdae6f2,
      hatBrim: 0x9aa4b6, hatCrown: 0xa4aec0, hatBand: 0x8a98ac,
      scarfRing: 0xc4d0de, scarfTail: 0xb4c2d2,
      nose: 0xccd6e4, eyeL: 0x7a8498, eyeR: 0x7a8498,
      btn1: 0x7a8498, btn2: 0x7a8498, btn3: 0x7a8498,
      armL: 0xaab4c4, armR: 0xaab4c4,
    },
    // 磨砂玻璃：乳白半透明
    // ★ 参考图是"整体半透、能看见后面轮廓但看不清细节"的乳白玻璃。
    //   opacity 0.52 太透（在浅灰底上直接消失），0.88 又太实。
    //   0.80 是折中：轮廓实、内部隐约透。
    mat: {
      transparent: true, opacity: 0.80, depthWrite: true,
      emissive: 0x5a6a80, emissiveIntensity: 1,
    },
  },
  {
    id: 'crystal', name: '晶体矿石',
    colors: {
      bottom: 0x7a48b8, mid: 0x8a58c8, head: 0x7a48b8,
      hatBrim: 0x5a3488, hatCrown: 0x64409a, hatBand: 0x8a58c8,
      scarfRing: 0x9868d8, scarfTail: 0x8858c4,
      nose: 0xc0a0e8, eyeL: 0x3a1e60, eyeR: 0x3a1e60,
      btn1: 0x3a1e60, btn2: 0x3a1e60, btn3: 0x3a1e60,
      armL: 0x6a44a4, armR: 0x6a44a4,
    },
    // 晶体：半透明 + 紫色内发光
    // ★ depthWrite 必须开着，否则三个球互相透视、棱面糊成一团，
    //   看起来是一块紫色果冻而不是"晶体矿石"。
    mat: {
      transparent: true, opacity: 0.88, depthWrite: true,
      emissive: 0x6a34a8, emissiveIntensity: 1.3,
    },
  },
  {
    id: 'wood', name: '木雕榫卯',
    colors: {
      bottom: 0xb08858, mid: 0xa87e50, head: 0xb08858,
      hatBrim: 0x8a6840, hatCrown: 0x94704a, hatBand: 0x7a5c38,
      scarfRing: 0x9a7448, scarfTail: 0x8a6840,
      nose: 0xa87e50, eyeL: 0x4a3420, eyeR: 0x4a3420,
      btn1: 0x6a5030, btn2: 0x6a5030, btn3: 0x6a5030,
      armL: 0x8a6840, armR: 0x8a6840,
    },
    mat: { transparent: false, opacity: 1, emissive: 0x0e0a04, emissiveIntensity: 1 },
    // 木纹：用几道横向深色环模拟年轮，位置固定（不随机，保持干净）
    grain: true,
  },
  {
    id: 'jelly', name: '糖果果冻',
    colors: {
      bottom: 0x40b0e0, mid: 0x40b0e0, head: 0x40b0e0,
      hatBrim: 0xc04080, hatCrown: 0xd05090, hatBand: 0xe8a020,
      scarfRing: 0x60d080, scarfTail: 0x50c070,
      nose: 0xf0a020, eyeL: 0x2a2050, eyeR: 0x2a2050,
      btn1: 0x2a2050, btn2: 0x2a2050, btn3: 0x2a2050,
      armL: 0xd060a0, armR: 0xd060a0,
    },
    // ★ depthWrite 开着：果冻是"半透但仍是实体"，关了之后
    //   三个球前后穿透、渐变糊成一片，看不出层次。
    mat: {
      transparent: true, opacity: 0.80, depthWrite: true,
      emissive: 0x2a5c74, emissiveIntensity: 1,
    },
    // 果冻：身体按高度做彩虹渐变（下蓝上红），和参考图一致
    paint: [
      { y: 0.0, hex: 0x6a2a90 },
      { y: 1.2, hex: 0x3a5ac8 },
      { y: 2.2, hex: 0x30a8a0 },
      { y: 3.0, hex: 0x80c040 },
      { y: 3.6, hex: 0xe8c020 },
      { y: 4.1, hex: 0xe06030 },
      { y: 4.6, hex: 0xd03060 },
    ],
  },
  {
    id: 'thermal', name: '热成像',
    colors: {
      bottom: 0x2050d0, mid: 0x2050d0, head: 0x2050d0,
      hatBrim: 0x302080, hatCrown: 0x3a2890, hatBand: 0x6020b0,
      scarfRing: 0xd02020, scarfTail: 0xb01818,
      nose: 0xe08020, eyeL: 0x101040, eyeR: 0x101040,
      btn1: 0x101040, btn2: 0x101040, btn3: 0x101040,
      armL: 0x804020, armR: 0x804020,
    },
    // 热成像：自发光很强，看起来像在"发热"
    mat: {
      transparent: false, opacity: 1,
      emissive: 0x402010, emissiveIntensity: 1.4,
    },
    // 蓝 → 青 → 绿 → 黄 → 橙 → 红（自下而上）
    paint: [
      { y: 0.0, hex: 0x1838b8 },
      { y: 0.8, hex: 0x1860d0 },
      { y: 1.7, hex: 0x18a8c0 },
      { y: 2.5, hex: 0x30c048 },
      { y: 3.2, hex: 0xd8d020 },
      { y: 3.8, hex: 0xe88018 },
      { y: 4.4, hex: 0xd02418 },
    ],
  },
];

const STYLE_MAP = new Map(SNOWMAN_STYLES.map((s) => [s.id, s]));

// ---------------------------------------------------------------------------
// 应用风格
// ---------------------------------------------------------------------------
export function applySnowmanStyle(group, styleId) {
  const st = STYLE_MAP.get(styleId) || STYLE_MAP.get('lowpoly');
  const parts = group.userData.parts || [];

  for (const m of parts) {
    const key = m.userData.partKey;
    const hex = st.colors[key] !== undefined ? st.colors[key] : 0xcccccc;

    // 1. 顶点色
    const geo = m.geometry;
    const col = geo.attributes.color;
    if (col) {
      if (st.paint) {
        // 渐变风格：按高度重涂（身体三球 + 帽子都走渐变）
        paintByHeight(geo, st.paint);
      } else {
        tintInto(col, hex);
        // 木纹：在指定部件上叠几道固定位置的深色环
        if (st.grain && (key === 'bottom' || key === 'mid' || key === 'head')) {
          paintWoodGrain(geo, key, hex);
        }
      }
      col.needsUpdate = true;
    }

    // 2. 材质参数
    const mat = m.material;
    mat.transparent = !!st.mat.transparent;
    mat.opacity = st.mat.opacity;
    mat.depthWrite = st.mat.depthWrite === undefined ? true : st.mat.depthWrite;
    mat.emissive.setHex(st.mat.emissive || 0x000000);
    mat.emissiveIntensity = st.mat.emissiveIntensity === undefined ? 1 : st.mat.emissiveIntensity;
    mat.needsUpdate = true;

    // 3. 半透明部件不投阴影（否则地面上是一块实心黑影，很假）
    m.castShadow = !mat.transparent;
  }

  group.userData.style = styleId;
  return true;
}

// 把顶点色整体改成一个颜色（保留 alpha 无关）
function tintInto(col, hex) {
  _cA.setHex(hex);
  for (let i = 0; i < col.count; i++) {
    col.setXYZ(i, _cA.r, _cA.g, _cA.b);
  }
}

// 木纹：按高度画几道深色环 + 一条纵向暗带
function paintWoodGrain(geo, key, baseHex) {
  const pos = geo.attributes.position;
  const col = geo.attributes.color;
  _cA.setHex(baseHex);
  // 年轮环：每 0.22 高度一道，环内 0.06 厚度压暗
  const bands = [0.38, 0.62, 0.86, 1.34, 1.58, 1.82, 2.10, 2.62, 2.86, 3.10, 3.58, 3.86];
  for (let i = 0; i < pos.count; i++) {
    const y = pos.getY(i);
    let dark = 0;
    for (const b of bands) {
      const d = Math.abs(y - b);
      if (d < 0.07) dark = Math.max(dark, 1 - d / 0.07);
    }
    // 纵向暗带：xz 投影角度落在窄扇区内
    const x = pos.getX(i), z = pos.getZ(i);
    const ang = Math.atan2(z, x);
    if (Math.abs(ang - 0.55) < 0.09) dark = Math.max(dark, 0.75);
    const k = 1 - dark * 0.42;
    col.setXYZ(i, _cA.r * k, _cA.g * k * 0.97, _cA.b * k * 0.9);
  }
}

// ---------------------------------------------------------------------------
// 一行排开用：给定索引返回位置
// ---------------------------------------------------------------------------
export function snowmanSpot(index, count, gapX = 5.2) {
  const x = (index - (count - 1) / 2) * gapX;
  return { x, z: 0 };
}
