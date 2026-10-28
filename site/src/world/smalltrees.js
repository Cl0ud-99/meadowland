import * as THREE from '../../vendor/three/three.module.js';
import { toonLambert } from '../render/toon.js';
import { tint, merge } from '../util/geo.js';

// ---------------------------------------------------------------------------
// 场景普通树木模型（低多边形 · 参考图复刻）
//   apple 苹果树 / blossom 樱花树 / maple 枫树 / birch 白桦 / camellia 山茶树
//   make() 返回一个合并好的 Mesh（顶点色 + 描边在外部添加）
// ---------------------------------------------------------------------------

// ---------------------------------------------------------------------------
// 工具
// ---------------------------------------------------------------------------
const TREE_MAT = toonLambert({
  vertexColors: true,
  flatShading: true,
  shared: false,
  side: THREE.DoubleSide,
});

function tube(parts, ax, ay, az, bx, by, bz, rBottom, rTop, color, seg = 6) {
  const a = new THREE.Vector3(ax, ay, az);
  const b = new THREE.Vector3(bx, by, bz);
  const d = b.clone().sub(a);
  const len = d.length();
  if (len < 1e-4) return;
  const g = new THREE.CylinderGeometry(rTop, rBottom, len, seg, 1, false);
  const q = new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0, 1, 0), d.clone().normalize());
  g.applyQuaternion(q);
  g.translate((a.x + b.x) / 2, (a.y + b.y) / 2, (a.z + b.z) / 2);
  parts.push(tint(g, color));
}

function blob(parts, x, y, z, sx, sy, sz, color, detail = 1, ry = 0) {
  const g = new THREE.IcosahedronGeometry(1, detail);
  g.scale(sx, sy, sz);
  if (ry) g.rotateY(ry);
  g.translate(x, y, z);
  parts.push(tint(g, color));
}

function rng(seed) {
  let s = seed >>> 0;
  return () => {
    s = (s * 1664525 + 1013904223) >>> 0;
    return s / 4294967296;
  };
}

// 叶片形状
function leafShape() {
  const s = new THREE.Shape();
  s.moveTo(0, 0.5);
  s.quadraticCurveTo(0.22, 0.32, 0.28, 0.02);
  s.quadraticCurveTo(0.14, -0.04, 0, -0.32);
  s.quadraticCurveTo(-0.14, -0.04, -0.28, 0.02);
  s.quadraticCurveTo(-0.22, 0.32, 0, 0.5);
  return s;
}
const LEAF_SHAPE = leafShape();

function mapleShape() {
  const pts = [
    [0, 1], [0.16, 0.58], [0.5, 0.72], [0.34, 0.34], [0.74, 0.30],
    [0.4, 0.06], [0.52, -0.22], [0.18, -0.16], [0.06, -0.55], [0, -0.42],
    [-0.06, -0.55], [-0.18, -0.16], [-0.52, -0.22], [-0.4, 0.06],
    [-0.74, 0.30], [-0.34, 0.34], [-0.5, 0.72], [-0.16, 0.58],
  ];
  const s = new THREE.Shape();
  s.moveTo(pts[0][0], pts[0][1]);
  for (let i = 1; i < pts.length; i++) s.lineTo(pts[i][0], pts[i][1]);
  s.closePath();
  return s;
}
const MAPLE_SHAPE = mapleShape();

function broadLeafShape() {
  const s = new THREE.Shape();
  s.moveTo(0, 0.56);
  s.quadraticCurveTo(0.27, 0.30, 0.25, 0.04);
  s.quadraticCurveTo(0.21, -0.28, 0, -0.52);
  s.quadraticCurveTo(-0.21, -0.28, -0.25, 0.04);
  s.quadraticCurveTo(-0.27, 0.30, 0, 0.56);
  return s;
}
const BROAD_SHAPE = broadLeafShape();

const _euler = new THREE.Euler();
const _mat4 = new THREE.Matrix4();

function leafCard(parts, x, y, z, size, color, rx, ry, rz, shape = LEAF_SHAPE) {
  const g = new THREE.ShapeGeometry(shape, 2);
  _euler.set(rx, ry, rz);
  _mat4.makeRotationFromEuler(_euler);
  g.applyMatrix4(_mat4);
  g.scale(size, size, size);
  g.translate(x, y, z);
  parts.push(tint(g, color));
}

function leafCluster(parts, cx, cy, cz, rx, ry, rz, count, colors, sizeMin, sizeMax, seed, shape = LEAF_SHAPE) {
  const rnd = rng(seed);
  for (let i = 0; i < count; i++) {
    let dx, dy, dz, d2;
    do {
      dx = rnd() * 2 - 1; dy = rnd() * 2 - 1; dz = rnd() * 2 - 1;
      d2 = dx * dx + dy * dy + dz * dz;
    } while (d2 > 1);
    const x = cx + dx * rx;
    const y = cy + dy * ry;
    const z = cz + dz * rz;
    const size = sizeMin + (sizeMax - sizeMin) * rnd();
    const rx2 = (rnd() * 2 - 1) * 0.85;
    const ry2 = rnd() * Math.PI * 2;
    const rz2 = (rnd() * 2 - 1) * 1.35;
    leafCard(parts, x, y, z, size, colors[i % colors.length], rx2, ry2, rz2, shape);
  }
}

function leafPatch(parts, x, y, z, nx, ny, nz, size, color, spin, shape = LEAF_SHAPE) {
  const g = new THREE.ShapeGeometry(shape, 2);
  const n = new THREE.Vector3(nx, ny, nz).normalize();
  const q = new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0, 0, 1), n);
  const qs = new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 0, 1), spin);
  q.multiply(qs);
  g.applyQuaternion(q);
  g.scale(size, size, size);
  g.translate(x, y, z);
  parts.push(tint(g, color));
}

function ellipsoidLeaves(parts, cx, cy, cz, rx, ry, rz, count, colors, sizeMin, sizeMax, seed, shell = 1, shape = LEAF_SHAPE) {
  const rnd = rng(seed);
  for (let i = 0; i < count; i++) {
    const u = rnd() * 2 - 1;
    const phi = rnd() * Math.PI * 2;
    const r = Math.sqrt(Math.max(0, 1 - u * u));
    const dx = Math.cos(phi) * r;
    const dy = u;
    const dz = Math.sin(phi) * r;
    const k = shell * (0.92 + rnd() * 0.1);
    const size = sizeMin + (sizeMax - sizeMin) * rnd();
    leafPatch(
      parts,
      cx + dx * rx * k, cy + dy * ry * k, cz + dz * rz * k,
      dx / rx, dy / ry, dz / rz,
      size, colors[i % colors.length], rnd() * Math.PI * 2, shape
    );
  }
}

function flower(parts, x, y, z, nx, ny, nz, size, petalColor, centerColor, spin) {
  const n = new THREE.Vector3(nx, ny, nz).normalize();
  const q = new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0, 0, 1), n);
  const qs = new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 0, 1), spin);
  q.multiply(qs);

  const put = (geo, color, zOff) => {
    geo.scale(size, size, size);
    geo.applyQuaternion(q);
    geo.translate(x, y, z + zOff * size);
    parts.push(tint(geo, color));
  };

  for (let i = 0; i < 5; i++) {
    const a = (i / 5) * Math.PI * 2;
    const petal = new THREE.CircleGeometry(0.34, 7);
    petal.scale(1, 0.62, 1);
    petal.rotateZ(a - Math.PI / 2);
    petal.translate(Math.cos(a) * 0.28, Math.sin(a) * 0.28, 0);
    put(petal, petalColor, 0);
  }
  const disc = new THREE.CircleGeometry(0.17, 9);
  put(disc, centerColor, 0.012);
  const dot = new THREE.CircleGeometry(0.075, 7);
  put(dot, 0xf0c04a, 0.018);
}

function build(name, parts) {
  const geo = merge(parts);
  const m = new THREE.Mesh(geo, TREE_MAT);
  m.name = name;
  m.castShadow = true;
  m.receiveShadow = true;
  return m;
}

// ===========================================================================
// 1. 苹果树（参考图 1：团簇圆冠 + 红苹果 + 分叉树干）
// ===========================================================================
function makeAppleTree() {
  const parts = [];
  const bark = 0x6b4a32;
  const barkDark = 0x533925;

  tube(parts, 0, 0, 0, 0, 0.9, 0, 1.0, 0.72, barkDark, 7);
  tube(parts, 0, 0.85, 0, 0, 3.4, 0, 0.72, 0.44, bark, 7);
  tube(parts, 0, 3.0, 0, -1.9, 5.8, 0.5, 0.40, 0.22, bark, 6);
  tube(parts, 0, 3.1, 0, 2.0, 5.9, -0.4, 0.40, 0.22, bark, 6);
  tube(parts, 0, 3.32, 0, 0.2, 6.2, 0.2, 0.34, 0.20, bark, 6);
  tube(parts, -1.9, 5.8, 0.5, -3.5, 6.9, 0.2, 0.18, 0.10, bark, 5);
  tube(parts, 2.0, 5.9, -0.4, 3.6, 7.0, -0.6, 0.18, 0.10, bark, 5);

  const greens = [0x5aa044, 0x66ad4c, 0x4f9139, 0x74bb56];
  const blobs = [
    [0.0, 8.0, 0.0, 3.0, 2.6, 2.95],
    [-2.85, 7.4, 0.6, 2.25, 1.95, 2.15],
    [2.85, 7.5, -0.5, 2.25, 1.95, 2.15],
    [-1.3, 8.9, -1.75, 2.0, 1.75, 1.95],
    [1.5, 8.9, 1.65, 2.0, 1.75, 1.95],
    [0.25, 7.0, 2.45, 1.95, 1.65, 1.9],
    [-0.3, 7.1, -2.55, 1.95, 1.65, 1.9],
    [0.1, 9.45, 0.0, 1.6, 1.4, 1.6],
  ];
  blobs.forEach((b, i) => blob(parts, b[0], b[1], b[2], b[3], b[4], b[5], greens[i % greens.length], 1, i * 0.7));

  const apples = [
    [0.1, 7.6, 4.05], [-5.15, 7.5, 0.8], [4.9, 7.55, -0.4], [0.1, 10.6, 0.2],
    [1.9, 6.5, 3.45], [-3.2, 8.7, -1.3], [3.2, 9.0, 1.9],
  ];
  apples.forEach((p, i) => {
    blob(parts, p[0], p[1], p[2], 0.36, 0.38, 0.36, i % 3 === 0 ? 0xa82c22 : 0xc0392b, 0, i);
  });

  return build('apple', parts);
}

// ===========================================================================
// 2. 樱花树（参考图 2：粉色团冠 + 深色树干）
// ===========================================================================
function makeBlossomTree() {
  const parts = [];
  const bark = 0x403036;
  const barkDark = 0x2e2429;

  tube(parts, 0, 0, 0, 0, 0.85, 0, 0.95, 0.66, barkDark, 7);
  tube(parts, 0, 0.8, 0, 0, 4.1, 0, 0.62, 0.36, bark, 7);
  tube(parts, 0, 3.5, 0, -1.7, 6.0, 0.5, 0.36, 0.20, bark, 6);
  tube(parts, 0, 3.7, 0, 1.8, 6.1, -0.4, 0.36, 0.20, bark, 6);
  tube(parts, 0, 3.9, 0, 0.1, 6.3, 0.1, 0.30, 0.18, bark, 6);

  const pinks = [0xe89abb, 0xdd84ab, 0xf0aec9, 0xd4749f];
  const blobs = [
    [0.0, 7.9, 0.0, 2.5, 2.35, 2.45],
    [-2.3, 7.3, 0.5, 1.85, 1.7, 1.75],
    [2.3, 7.4, -0.4, 1.85, 1.7, 1.75],
    [-1.0, 8.9, -1.4, 1.7, 1.55, 1.65],
    [1.2, 8.9, 1.4, 1.7, 1.55, 1.65],
    [0.2, 6.8, 2.1, 1.7, 1.5, 1.6],
    [-0.2, 6.9, -2.2, 1.7, 1.5, 1.6],
    [0.1, 9.8, 0.0, 1.45, 1.3, 1.45],
    [-2.9, 8.0, -1.3, 1.3, 1.2, 1.25],
    [2.9, 8.1, 1.2, 1.3, 1.2, 1.25],
    [-2.3, 8.5, 1.8, 1.2, 1.1, 1.15],
    [2.4, 8.5, -1.7, 1.2, 1.1, 1.15],
  ];
  blobs.forEach((b, i) => blob(parts, b[0], b[1], b[2], b[3], b[4], b[5], pinks[i % pinks.length], 1, i * 0.8));

  return build('blossom', parts);
}

// ===========================================================================
// 3. 枫树（参考图 3：橙红星形枫叶 + 少量多边形叶团 + 细树干）
// ===========================================================================
function makeMapleTree() {
  const parts = [];
  const bark = 0x5c4030;
  const barkDark = 0x46301f;

  tube(parts, 0, 0, 0, 0, 0.8, 0, 0.62, 0.44, barkDark, 7);
  tube(parts, 0, 0.75, 0, 0, 3.8, 0, 0.38, 0.22, bark, 7);

  const tips = [
    [-2.6, 7.0, 1.3], [2.7, 7.1, -1.1], [-1.3, 8.0, -1.7],
    [1.6, 7.9, 1.8], [0.2, 6.4, 2.7], [-0.3, 6.5, -2.8],
  ];
  for (const [x, y, z] of tips) {
    tube(parts, 0, 3.5, 0, x * 0.55, y - 1.7, z * 0.55, 0.22, 0.12, bark, 5);
    tube(parts, x * 0.55, y - 1.7, z * 0.55, x, y, z, 0.12, 0.06, bark, 5);
  }
  tube(parts, 0, 3.6, 0, 0.1, 6.3, 0.1, 0.20, 0.11, bark, 5);

  const oranger = [0xe86a20, 0xd44a1c, 0xf29a2c, 0xe8b83c, 0xc2361a];
  const balls = [
    [0.0, 7.9, 0.0, 1.2, 1.0, 1.1, 0xe8912a],
    [-2.5, 7.0, 1.3, 0.9, 0.8, 0.85, 0xf0a332],
    [2.6, 7.1, -1.1, 0.9, 0.8, 0.85, 0xd8641e],
    [-1.3, 8.2, -1.7, 0.75, 0.7, 0.72, 0xe8b030],
    [1.6, 8.1, 1.8, 0.75, 0.7, 0.72, 0xe26a22],
    [0.2, 6.7, 2.7, 0.7, 0.65, 0.68, 0xf09a2c],
    [-0.3, 6.8, -2.8, 0.7, 0.65, 0.68, 0xcf4a18],
  ];
  balls.forEach((b, i) => blob(parts, b[0], b[1], b[2], b[3], b[4], b[5], b[6], 1, i * 0.9));

  tips.forEach(([x, y, z], i) => {
    leafCluster(parts, x, y + 0.15, z, 2.25, 1.6, 2.05, 28, oranger, 0.62, 0.95, 300 + i, MAPLE_SHAPE);
  });
  leafCluster(parts, 0.0, 8.2, 0.0, 2.25, 1.65, 2.1, 26, oranger, 0.66, 0.98, 999, MAPLE_SHAPE);

  return build('maple', parts);
}

// ===========================================================================
// 4. 白桦（参考图 4：白色树干带黑斑 + 稀疏轻盈的绿叶）
// ===========================================================================
function makeBirchTree() {
  const parts = [];
  const white = 0xece6d6;
  const white2 = 0xdfd8c4;
  const black = 0x2c2a26;

  tube(parts, 0, 0, 0, 0, 0.7, 0, 0.38, 0.27, white2, 6);
  tube(parts, 0, 0.68, 0, 0, 7.8, 0, 0.26, 0.13, white, 6);

  const marks = [0.55, 1.35, 2.2, 3.0, 3.8, 4.6, 5.4, 6.2, 6.9];
  marks.forEach((y, i) => {
    const r = 0.26 + (0.13 - 0.26) * (y / 7.8);
    for (let k = 0; k < 2; k++) {
      const a = i * 1.7 + k * Math.PI;
      const w = 0.24 + (i % 3) * 0.05;
      const g = new THREE.BoxGeometry(w, 0.085, 0.06);
      g.rotateY(a);
      g.translate(Math.cos(a) * r * 0.98, y, Math.sin(a) * r * 0.98);
      parts.push(tint(g, black));
    }
  });
  const baseMark = new THREE.BoxGeometry(0.3, 0.58, 0.05);
  baseMark.translate(0, 0.42, 0.27);
  parts.push(tint(baseMark, black));

  const tips = [
    [-2.0, 7.4, 0.7], [2.1, 7.6, -0.5], [-1.0, 9.4, 0.6],
    [1.2, 9.3, -1.0], [-2.7, 8.4, -0.8], [2.7, 8.6, 0.9],
    [0.3, 6.8, 2.0], [-0.5, 7.0, -2.1], [-1.6, 8.6, 1.9], [1.8, 8.7, -1.9],
  ];
  for (const [x, y, z] of tips) {
    tube(parts, 0, 4.2, 0, x * 0.5, y - 1.3, z * 0.5, 0.09, 0.05, white2, 4);
    tube(parts, x * 0.5, y - 1.3, z * 0.5, x, y, z, 0.05, 0.025, white2, 4);
  }

  const greens = [0xa8d46a, 0x96c65a, 0xb9e07c, 0x86b64c];
  tips.forEach(([x, y, z], i) => {
    leafCluster(parts, x, y + 0.1, z, 1.05, 0.9, 1.0, 62, greens, 0.30, 0.46, 500 + i);
    leafCluster(parts, x * 0.32, y - 2.05, z * 0.32, 0.85, 0.75, 0.82, 26, greens, 0.28, 0.42, 600 + i);
  });
  leafCluster(parts, 0.0, 9.6, 0.0, 1.15, 0.95, 1.1, 70, greens, 0.30, 0.46, 777);

  return build('birch', parts);
}

// ===========================================================================
// 5. 山茶树（参考图：深绿阔叶 + 白色五瓣花）
// ===========================================================================
function makeCamelliaTree() {
  const parts = [];
  const bark = 0x6f5f57;
  const barkDark = 0x554741;

  tube(parts, 0, 0, 0, 0, 0.9, 0, 0.88, 0.62, barkDark, 7);
  tube(parts, 0, 0.85, 0, 0, 4.1, 0, 0.60, 0.40, bark, 7);
  tube(parts, 0, 3.5, 0, -1.8, 5.9, 1.0, 0.34, 0.18, bark, 6);
  tube(parts, 0, 3.7, 0, 1.9, 6.0, -0.8, 0.34, 0.18, bark, 6);
  tube(parts, 0, 3.8, 0, 0.1, 6.2, 0.2, 0.30, 0.16, bark, 6);

  // 冠内暗色体块，防止透光
  const deep = [0x3a7041, 0x427a49, 0x356b3c];
  blob(parts, 0, 7.6, 0, 3.7, 2.45, 3.55, deep[0], 1, 0.2);
  blob(parts, -2.0, 6.9, 1.5, 2.0, 1.55, 1.9, deep[1], 1, 1.0);
  blob(parts, 1.9, 7.0, -1.3, 2.0, 1.55, 1.9, deep[2], 1, 2.0);
  blob(parts, 0.4, 8.7, 0.9, 1.8, 1.45, 1.7, deep[1], 1, 3.0);

  const greens = [0x3f7a46, 0x4a8a52, 0x356b3c, 0x55985d, 0x427f49];
  ellipsoidLeaves(parts, 0, 7.6, 0, 4.15, 2.75, 3.95, 700, greens, 0.46, 0.68, 7001, 1.0, BROAD_SHAPE);
  ellipsoidLeaves(parts, 0, 7.6, 0, 3.2, 2.2, 3.05, 180, [0x2e5f34, 0x356b3c, 0x3a7041], 0.44, 0.64, 7100, 0.8, BROAD_SHAPE);

  // 白色山茶花：贴在冠面外侧
  const flowerDirs = [
    [0.15, 0.35, 1.0], [-0.72, 0.22, 0.78], [0.86, 0.12, 0.52],
    [-0.45, -0.05, 0.92], [0.05, 0.82, 0.58], [-0.92, 0.42, 0.18],
    [0.78, 0.55, -0.32], [-0.28, 0.30, -0.95], [0.42, -0.18, 0.90],
    [-0.15, 0.55, -0.85],
  ];
  flowerDirs.forEach((d, i) => {
    const v = new THREE.Vector3(d[0], d[1], d[2]).normalize();
    const rx = 4.15, ry = 2.75, rz = 3.95;
    const px = v.x * rx * 1.01;
    const py = 7.6 + v.y * ry * 1.01;
    const pz = v.z * rz * 1.01;
    const nx = v.x / rx, ny = v.y / ry, nz = v.z / rz;
    const size = 0.72 + (i % 3) * 0.08;
    flower(parts, px, py, pz, nx, ny, nz, size,
      i % 4 === 0 ? 0xf3dfe7 : 0xf8f3e8, 0xe8a4bc, i * 0.9);
  });

  return build('camellia', parts);
}

export const SMALL_TREE_MAKERS = [
  { kind: 'apple', name: '苹果树', make: makeAppleTree, top: 11.0 },
  { kind: 'blossom', name: '樱花树', make: makeBlossomTree, top: 11.2 },
  { kind: 'maple', name: '枫树', make: makeMapleTree, top: 10.4 },
  { kind: 'birch', name: '白桦', make: makeBirchTree, top: 10.9 },
  { kind: 'camellia', name: '山茶树', make: makeCamelliaTree, top: 10.7, outline: 0 },
];
