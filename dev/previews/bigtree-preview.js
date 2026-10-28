import * as THREE from 'three';
import { toonLambert } from './src/render/toon.js';
import { addOutlineDeep } from './src/render/outline.js';

const canvas = document.getElementById('c');
const renderer = new THREE.WebGLRenderer({ canvas, antialias: true });
renderer.setPixelRatio(Math.min(devicePixelRatio, 2));
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFSoftShadowMap;
renderer.toneMapping = THREE.ACESFilmicToneMapping;
renderer.toneMappingExposure = 1.0;

const scene = new THREE.Scene();
scene.background = new THREE.Color(0xdfeaf5);
const camera = new THREE.PerspectiveCamera(38, 1, 0.1, 600);

const sun = new THREE.DirectionalLight(0xfff2dd, 2.5);
sun.position.set(30, 55, 34);
sun.castShadow = true;
sun.shadow.mapSize.set(2048, 2048);
sun.shadow.camera.left = -70;
sun.shadow.camera.right = 70;
sun.shadow.camera.top = 70;
sun.shadow.camera.bottom = -70;
sun.shadow.camera.near = 1;
sun.shadow.camera.far = 200;
sun.shadow.bias = -0.0008;
scene.add(sun);

const fill = new THREE.DirectionalLight(0xcfe0ff, 0.55);
fill.position.set(-30, 24, -26);
scene.add(fill);
scene.add(new THREE.HemisphereLight(0xdfeaf5, 0xb0a08a, 0.85));

const ground = new THREE.Mesh(
  new THREE.CircleGeometry(120, 64),
  new THREE.MeshLambertMaterial({ color: 0xa9cd77 })
);
ground.rotation.x = -Math.PI / 2;
ground.receiveShadow = true;
scene.add(ground);

// ---------------------------------------------------------------------------
// 通用材质 / 几何辅助
// ---------------------------------------------------------------------------
const _mats = new Map();
function mat(color) {
  if (!_mats.has(color)) {
    _mats.set(color, toonLambert({ color, flatShading: true, shared: false }));
  }
  return _mats.get(color);
}

const _dsMats = new Map();
function matDS(color) {
  if (!_dsMats.has(color)) {
    _dsMats.set(color, toonLambert({ color, flatShading: true, shared: false, side: THREE.DoubleSide }));
  }
  return _dsMats.get(color);
}

function ginkgoShape() {
  const s = new THREE.Shape();
  s.moveTo(0, -0.10);
  s.quadraticCurveTo(-0.58, 0.22, -0.54, 0.56);
  s.quadraticCurveTo(-0.28, 0.66, 0, 0.52);
  s.quadraticCurveTo(0.28, 0.66, 0.54, 0.56);
  s.quadraticCurveTo(0.58, 0.22, 0, -0.10);
  return s;
}
const GINKGO_SHAPE = ginkgoShape();

function fanLeaf(group, x, y, z, size, color, rx, ry, rz) {
  const geo = new THREE.ShapeGeometry(GINKGO_SHAPE, 2);
  geo.applyMatrix4(new THREE.Matrix4().makeRotationFromEuler(new THREE.Euler(rx, ry, rz)));
  geo.scale(size, size, size);
  geo.translate(x, y, z);
  const m = new THREE.Mesh(geo, matDS(color));
  m.castShadow = true;
  m.receiveShadow = true;
  group.add(m);
  return m;
}

function makeRng(seed) {
  let st = seed >>> 0;
  return () => {
    st = (st * 1664525 + 1013904223) >>> 0;
    return st / 4294967296;
  };
}

function addMesh(group, geo, material, x, y, z, rx = 0, ry = 0, rz = 0) {
  const m = new THREE.Mesh(geo, material);
  m.position.set(x, y, z);
  m.rotation.set(rx, ry, rz);
  m.castShadow = true;
  m.receiveShadow = true;
  group.add(m);
  return m;
}

// 两点之间的锥形圆柱（树枝）
function branch(group, ax, ay, az, bx, by, bz, r1, r2, color, radial = 6) {
  const a = new THREE.Vector3(ax, ay, az);
  const b = new THREE.Vector3(bx, by, bz);
  const dir = b.clone().sub(a);
  const len = dir.length();
  if (len < 1e-4) return null;
  const geo = new THREE.CylinderGeometry(r2, r1, len, radial, 1, false);
  const mesh = new THREE.Mesh(geo, mat(color));
  mesh.position.copy(a).add(b).multiplyScalar(0.5);
  mesh.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), dir.normalize());
  mesh.castShadow = true;
  mesh.receiveShadow = true;
  group.add(mesh);
  return mesh;
}

// 低多边形叶团
function blob(group, x, y, z, rx, ry, rz, color, detail = 1, ryRot = 0) {
  const geo = new THREE.IcosahedronGeometry(1, detail);
  const mesh = new THREE.Mesh(geo, mat(color));
  mesh.position.set(x, y, z);
  mesh.scale.set(rx, ry, rz);
  mesh.rotation.y = ryRot;
  mesh.castShadow = true;
  mesh.receiveShadow = true;
  group.add(mesh);
  return mesh;
}

function trunkBase(group, h, rBottom, rTop, color = 0x6b4a32, radial = 7) {
  addMesh(group, new THREE.CylinderGeometry(rTop, rBottom, h, radial), mat(color), 0, h / 2, 0);
}

// ---------------------------------------------------------------------------
// 1. 阔叶树（参考图 1）—— 多层团簇 + 板根 + 细枝
// ---------------------------------------------------------------------------
function makeBroadleaf() {
  const g = new THREE.Group();
  g.name = 'broadleaf';
  const bark = 0x5a4030;
  const barkDark = 0x46301f;
  trunkBase(g, 8.2, 1.75, 0.9, bark, 8);

  // 板根
  for (let i = 0; i < 5; i++) {
    const a = (i / 5) * Math.PI * 2 + 0.4;
    branch(g, 0, 2.5, 0, Math.cos(a) * 2.7, 0.1, Math.sin(a) * 2.7, 0.78, 0.22, barkDark, 5);
  }

  const mains = [
    [-4.9, 11.9, 1.2], [5.0, 11.7, -1.1],
    [-2.3, 12.9, 3.9], [2.5, 12.7, -3.9], [0.2, 13.5, 0.4],
  ];
  for (const [x, y, z] of mains) {
    branch(g, 0, 6.4, 0, x * 0.6, y - 2.4, z * 0.6, 0.66, 0.38, bark, 6);
    branch(g, x * 0.6, y - 2.4, z * 0.6, x, y, z, 0.38, 0.2, bark, 6);
    branch(g, x, y, z, x * 1.18, y + 1.3, z * 1.18, 0.16, 0.07, bark, 5);
    branch(g, x * 0.75, y - 1.2, z * 0.75, x * 0.2, y + 0.9, z * 0.2, 0.13, 0.06, bark, 5);
  }

  const greens = [0x2f6a3f, 0x3d7a4a, 0x4f8b55, 0x2a5e3a, 0x468049];
  const clusters = [
    // 主冠
    [0.0, 17.0, 0.0, 4.4, 3.0, 4.0, 1],
    [-5.9, 14.3, 1.2, 4.0, 2.7, 3.7, 0],
    [5.8, 14.1, -1.2, 4.0, 2.7, 3.7, 2],
    [-2.6, 15.9, 3.1, 3.5, 2.4, 3.2, 3],
    [2.7, 15.8, -3.1, 3.5, 2.4, 3.2, 1],
    [-1.4, 13.5, 4.6, 3.0, 2.1, 2.8, 2],
    [1.5, 13.5, -4.6, 3.0, 2.1, 2.8, 4],
    [-5.6, 12.0, 0.4, 2.9, 2.0, 2.7, 3],
    [5.5, 11.9, -0.4, 2.9, 2.0, 2.7, 0],
    [-2.4, 18.2, 1.5, 2.9, 2.1, 2.7, 4],
    [2.4, 18.1, -1.5, 2.9, 2.1, 2.7, 2],
    [0.0, 14.9, 3.8, 3.2, 2.2, 3.0, 1],
    [0.0, 14.7, -4.0, 3.2, 2.2, 3.0, 3],
    // 外缘小团（detail 0）
    [-7.4, 14.8, 0.8, 1.8, 1.3, 1.6, 2, 0],
    [7.4, 14.6, -0.8, 1.8, 1.3, 1.6, 1, 0],
    [-3.8, 17.4, 2.4, 1.7, 1.2, 1.5, 0, 0],
    [3.8, 17.3, -2.4, 1.7, 1.2, 1.5, 4, 0],
    [-0.8, 19.2, 0.8, 1.7, 1.2, 1.5, 3, 0],
    [0.9, 19.1, -0.8, 1.7, 1.2, 1.5, 1, 0],
    [-6.4, 12.8, 2.6, 1.6, 1.1, 1.4, 4, 0],
    [6.3, 12.7, -2.6, 1.6, 1.1, 1.4, 0, 0],
    [2.8, 16.8, 2.8, 1.5, 1.1, 1.3, 3, 0],
    [-2.8, 16.7, -2.8, 1.5, 1.1, 1.3, 2, 0],
    [0.0, 11.6, 4.8, 1.5, 1.0, 1.3, 1, 0],
    [0.0, 11.5, -5.0, 1.5, 1.0, 1.3, 3, 0],
  ];
  clusters.forEach((c, i) => {
    blob(g, c[0], c[1], c[2], c[3], c[4], c[5], greens[c[6] % greens.length], c[7] === undefined ? 1 : c[7], i * 0.55);
  });

  return g;
}

// ---------------------------------------------------------------------------
// 2. 仙人掌（参考图 2）—— 棱线 + 尖刺 + 圆角手臂
// ---------------------------------------------------------------------------
function makeCactus() {
  const g = new THREE.Group();
  g.name = 'cactus';
  const green = 0x3f7a46;
  const dark = 0x2f6038;
  const light = 0x4f8f56;
  const spineColor = 0xe8dfa0;

  // 主柱
  addMesh(g, new THREE.CylinderGeometry(1.35, 1.65, 15.5, 10), mat(green), 0, 7.75, 0);
  addMesh(g, new THREE.SphereGeometry(1.35, 10, 7), mat(green), 0, 15.5, 0);
  // 根部裙边
  addMesh(g, new THREE.CylinderGeometry(1.7, 2.0, 0.7, 10), mat(dark), 0, 0.35, 0);

  // 竖向棱线
  const ribCount = 10;
  for (let i = 0; i < ribCount; i++) {
    const a = (i / ribCount) * Math.PI * 2;
    branch(g,
      Math.cos(a) * 1.62, 1.0, Math.sin(a) * 1.62,
      Math.cos(a) * 1.36, 15.2, Math.sin(a) * 1.36,
      0.10, 0.08, dark, 4);
  }

  // 尖刺
  const spine = (a, y, r) => {
    const c = new THREE.ConeGeometry(0.09, 0.42, 4);
    c.translate(0, 0.21, 0);
    c.rotateZ(-Math.PI / 2);
    c.rotateY(-a);
    c.translate(Math.cos(a) * (r + 0.08), y, Math.sin(a) * (r + 0.08));
    addMesh(g, c, mat(spineColor), 0, 0, 0);
  };
  const heights = [2.8, 5.2, 7.6, 10.0, 12.4, 14.2];
  for (const y of heights) {
    const t = (y - 1.0) / 14.2;
    const r = 1.62 + (1.36 - 1.62) * t;
    for (let i = 0; i < ribCount; i++) {
      spine((i / ribCount) * Math.PI * 2 + (y % 1) * 0.2, y, r);
    }
  }

  // 手臂：圆角肘部
  const arms = [
    { side: -1, h: 5.4, out: 3.8, up: 6.4, r: 0.68 },
    { side: 1, h: 7.0, out: 3.2, up: 5.2, r: 0.62 },
    { side: -1, h: 9.2, out: 2.7, up: 3.6, r: 0.52 },
    { side: 1, h: 4.0, out: 2.3, up: 3.5, r: 0.46 },
  ];
  for (const a of arms) {
    const x = a.side * a.out;
    branch(g, 0, a.h, 0, x, a.h, 0, a.r, a.r, green, 8);
    addMesh(g, new THREE.SphereGeometry(a.r * 1.02, 8, 6), mat(green), x, a.h, 0);
    branch(g, x, a.h, 0, x, a.h + a.up, 0, a.r, a.r * 0.82, green, 8);
    addMesh(g, new THREE.SphereGeometry(a.r * 0.84, 8, 6), mat(light), x, a.h + a.up, 0);
    // 手臂棱线
    for (let k = 0; k < 4; k++) {
      const ang = (k / 4) * Math.PI * 2;
      const ox = Math.cos(ang) * a.r * 0.9;
      const oz = Math.sin(ang) * a.r * 0.9;
      branch(g, x + ox, a.h + 0.4, oz, x + ox, a.h + a.up - 0.4, oz, 0.055, 0.045, dark, 4);
    }
    // 手臂尖刺
    for (let k = 0; k < 4; k++) {
      const y = a.h + 1.0 + k * (a.up - 1.1) / 3;
      for (let m = 0; m < 3; m++) {
        spine((m / 3) * Math.PI * 2 + a.h, y, a.r * 0.95);
      }
    }
  }

  return g;
}

// ---------------------------------------------------------------------------
// 3. 凤凰木（参考图 3）—— 细碎红橙花团 + 更多分枝
// ---------------------------------------------------------------------------
function makePoinciana() {
  const g = new THREE.Group();
  g.name = 'poinciana';
  const bark = 0x5a3028;
  const barkDark = 0x43221c;
  trunkBase(g, 7.2, 1.55, 0.95, bark, 8);
  for (let i = 0; i < 4; i++) {
    const a = (i / 4) * Math.PI * 2 + 0.6;
    branch(g, 0, 2.2, 0, Math.cos(a) * 2.3, 0.1, Math.sin(a) * 2.3, 0.7, 0.2, barkDark, 5);
  }

  const mains = [
    [-6.2, 11.4, 1.6], [6.4, 11.2, -1.4], [-3.2, 12.2, -3.8],
    [3.2, 12.0, 3.8], [0.0, 12.6, 0.2], [-4.5, 12.6, -1.8], [4.6, 12.5, 1.7],
  ];
  for (const [x, y, z] of mains) {
    branch(g, 0, 6.2, 0, x * 0.55, y - 2.1, z * 0.55, 0.6, 0.34, bark, 6);
    branch(g, x * 0.55, y - 2.1, z * 0.55, x, y, z, 0.34, 0.18, bark, 6);
    branch(g, x, y, z, x * 1.12, y + 1.0, z * 1.12, 0.14, 0.06, bark, 5);
  }

  const reds = [0xb83226, 0xd84a24, 0xee7a2a, 0xf0a33a, 0x9e2a1e];
  const rings = [
    { y: 14.8, r: 0.0, n: 1, s: 3.8 },
    { y: 14.2, r: 3.2, n: 8, s: 2.8 },
    { y: 13.6, r: 6.8, n: 16, s: 3.0 },
    { y: 13.0, r: 9.6, n: 24, s: 2.8 },
  ];
  let ci = 0;
  rings.forEach((ring, ri) => {
    for (let i = 0; i < ring.n; i++) {
      const a = (i / ring.n) * Math.PI * 2 + ri * 0.4;
      const rr = ring.r + (i % 2) * 0.4 - 0.2;
      const y = ring.y - 1.0 + (((i * 37) % 100) / 100 - 0.5) * 0.5;
      blob(g,
        Math.cos(a) * rr, y, Math.sin(a) * rr,
        ring.s * (0.88 + (i % 3) * 0.10),
        ring.s * (0.52 + (i % 2) * 0.10),
        ring.s * (0.82 + (i % 3) * 0.08),
        reds[ci % reds.length], ri >= 3 ? 0 : 1, i * 0.5);
      ci++;
    }
  });
  // 伞沿外的黄花
  for (let i = 0; i < 18; i++) {
    const a = (i / 18) * Math.PI * 2 + 0.2;
    const r = 9.4 + (i % 3) * 0.5;
    blob(g, Math.cos(a) * r, 11.3 + (i % 4) * 0.3, Math.sin(a) * r, 0.4, 0.34, 0.4, 0xf5c542, 0, i);
  }

  return g;
}

// ---------------------------------------------------------------------------
// 4. 猴面包树（参考图 4）—— 竖向树皮沟壑 + 板根 + 稀疏叶团
// ---------------------------------------------------------------------------
function makeBaobab() {
  const g = new THREE.Group();
  g.name = 'baobab';
  const bark = 0x7a5a3a;
  const barkDark = 0x5e4229;
  const barkLight = 0x8a6a46;

  // 瓶形树干
  addMesh(g, new THREE.CylinderGeometry(2.7, 3.5, 5.2, 10), mat(bark), 0, 2.6, 0);
  addMesh(g, new THREE.CylinderGeometry(1.7, 2.7, 4.4, 10), mat(bark), 0, 7.4, 0);
  addMesh(g, new THREE.SphereGeometry(2.4, 9, 7), mat(bark), 0, 1.4, 0);

  // 板根
  for (let i = 0; i < 5; i++) {
    const a = (i / 5) * Math.PI * 2 + 0.25;
    branch(g, 0, 3.0, 0, Math.cos(a) * 3.55, 0.12, Math.sin(a) * 3.55, 1.15, 0.30, barkDark, 5);
  }
  // 树皮环带（比竖条自然）
  for (const ry of [2.2, 4.0, 5.8, 7.6]) {
    const rr = 3.5 - (ry / 9.6) * 1.8;
    addMesh(g, new THREE.CylinderGeometry(rr + 0.03, rr + 0.03, 0.16, 10), mat(barkDark), 0, ry, 0);
  }
  // 树瘤
  for (let i = 0; i < 9; i++) {
    const a = (i / 9) * Math.PI * 2;
    const y = 1.5 + (i % 5) * 1.35;
    const r = 3.35 - (y / 9.6) * 1.45;
    const s = 0.28 + (i % 3) * 0.12;
    blob(g, Math.cos(a) * r, y, Math.sin(a) * r, s, s * 0.8, s, barkDark, 0, i);
  }

  const mains = [
    [-4.4, 13.0, 1.5], [4.4, 12.8, -1.3], [-1.9, 14.0, -3.2],
    [1.9, 13.8, 3.2], [0.0, 14.4, 0.0], [-3.2, 12.2, -2.2], [3.3, 12.1, 2.2],
  ];
  for (const [x, y, z] of mains) {
    branch(g, 0, 8.6, 0, x * 0.6, y - 1.8, z * 0.6, 0.9, 0.44, bark, 6);
    branch(g, x * 0.6, y - 1.8, z * 0.6, x, y, z, 0.44, 0.2, bark, 5);
  }

  const greens = [0x2f6a3f, 0x3d7a4a, 0x4f8b55, 0x2a5e3a];
  const clusters = [
    [-4.5, 15.2, 1.5, 2.6, 2.0, 2.4, 0],
    [4.5, 15.0, -1.3, 2.6, 2.0, 2.4, 1],
    [-1.9, 16.2, -3.2, 2.3, 1.8, 2.1, 2],
    [1.9, 16.0, 3.2, 2.3, 1.8, 2.1, 3],
    [0.0, 16.8, 0.0, 2.8, 2.2, 2.6, 1],
    [-3.1, 14.0, -2.2, 1.8, 1.4, 1.6, 2],
    [3.2, 13.9, 2.2, 1.8, 1.4, 1.6, 0],
    [-5.2, 14.0, -0.6, 1.6, 1.2, 1.4, 3],
    [5.3, 13.9, 0.6, 1.6, 1.2, 1.4, 1],
    [-0.5, 14.8, 3.4, 1.7, 1.3, 1.5, 0],
    [-0.6, 14.7, -3.5, 1.7, 1.3, 1.5, 2],
    [2.4, 17.2, 0.8, 1.4, 1.1, 1.2, 3],
    [-2.4, 17.0, -0.9, 1.4, 1.1, 1.2, 1],
  ];
  clusters.forEach((c, i) => {
    blob(g, c[0], c[1], c[2], c[3], c[4], c[5], greens[c[6] % greens.length], 1, i * 0.8);
  });

  return g;
}

// ---------------------------------------------------------------------------
// 5. 分层冷杉（参考图 5）—— 双层错位枝层 + 层缘碎块
// ---------------------------------------------------------------------------
function makeFir() {
  const g = new THREE.Group();
  g.name = 'fir';
  trunkBase(g, 11.2, 1.30, 0.62, 0x5a4430, 8);
  for (let i = 0; i < 4; i++) {
    const a = (i / 4) * Math.PI * 2 + 0.5;
    branch(g, 0, 1.6, 0, Math.cos(a) * 1.9, 0.1, Math.sin(a) * 1.9, 0.7, 0.18, 0x4a3626, 5);
  }

  const greens = [0x1e5a4a, 0x2a6e58, 0x357a62, 0x245f4e];
  const layers = 9;
  for (let i = 0; i < layers; i++) {
    const t = i / (layers - 1);
    const y = 8.4 + t * 13.2;
    const r = 7.8 * (1 - t * 0.88) + 0.35;
    const h = 4.6 * (1 - t * 0.30) + 0.6;
    addMesh(g, new THREE.ConeGeometry(r, h, 9), mat(greens[i % 3]), 0, y, 0);
    const sub = addMesh(g, new THREE.ConeGeometry(r * 0.86, h * 0.80, 9), mat(greens[(i + 1) % 3]), 0, y - 0.9, 0);
    sub.rotation.y = 0.34;
  }
  addMesh(g, new THREE.ConeGeometry(1.0, 2.6, 8), mat(greens[1]), 0, 23.8, 0);
  addMesh(g, new THREE.ConeGeometry(0.55, 1.6, 7), mat(greens[3]), 0, 25.0, 0);

  return g;
}

// ---------------------------------------------------------------------------
// 6. 伞形金合欢（参考图 6）—— 多层伞冠 + 细碎叶团
// ---------------------------------------------------------------------------
function makeAcacia() {
  const g = new THREE.Group();
  g.name = 'acacia';
  const bark = 0x6a5a3a;
  const barkDark = 0x4f4128;
  trunkBase(g, 7.4, 1.75, 1.0, bark, 8);
  for (let i = 0; i < 4; i++) {
    const a = (i / 4) * Math.PI * 2 + 0.2;
    branch(g, 0, 2.2, 0, Math.cos(a) * 2.2, 0.1, Math.sin(a) * 2.2, 0.65, 0.2, barkDark, 5);
  }

  const mains = [
    [-5.4, 11.2, 2.1], [5.6, 11.0, -2.1], [-2.3, 12.0, -3.5],
    [2.3, 11.8, 3.5], [0.2, 12.4, 0.2], [-4.2, 12.4, -1.4], [4.3, 12.3, 1.4],
  ];
  for (const [x, y, z] of mains) {
    branch(g, 0, 7.0, 0, x * 0.55, y - 2.0, z * 0.55, 0.62, 0.36, bark, 6);
    branch(g, x * 0.55, y - 2.0, z * 0.55, x, y, z, 0.36, 0.18, bark, 6);
    branch(g, x, y, z, x * 1.12, y + 0.8, z * 1.12, 0.15, 0.06, bark, 5);
  }

  const greens = [0x2f6a4a, 0x3f7d58, 0x4f8f66, 0x2a5e40];
  // 冠心底部补块，堵住从下往上看时的空洞
  blob(g, 0, 12.5, 0, 4.8, 0.9, 4.2, 0x24513a, 1, 0.2);
  blob(g, -3.6, 12.2, 1.4, 2.4, 0.7, 2.2, 0x2a5e40, 1, 0.7);
  blob(g, 3.5, 12.3, -1.3, 2.4, 0.7, 2.2, 0x24513a, 1, 1.2);
  const rings = [
    { y: 15.1, r: 0.0, n: 1, s: 3.0 },
    { y: 14.6, r: 3.4, n: 8, s: 2.4 },
    { y: 13.9, r: 7.0, n: 16, s: 2.5 },
    { y: 13.2, r: 9.8, n: 24, s: 2.6 },
    { y: 13.3, r: 2.2, n: 6, s: 2.2 },
    { y: 12.3, r: 4.6, n: 9, s: 2.1 },
  ];
  let ci = 0;
  rings.forEach((ring, ri) => {
    for (let i = 0; i < ring.n; i++) {
      const a = (i / ring.n) * Math.PI * 2 + ri * 0.35;
      const rr = ring.r + (i % 2) * 0.35 - 0.15;
      const y = ring.y - 1.0 + (((i * 29) % 100) / 100 - 0.5) * 0.35;
      blob(g,
        Math.cos(a) * rr, y, Math.sin(a) * rr,
        ring.s * (0.9 + (i % 3) * 0.09),
        ring.s * (0.26 + (i % 2) * 0.05),
        ring.s * (0.84 + (i % 3) * 0.07),
        greens[ci % greens.length], ri >= 3 ? 0 : 1, i * 0.4);
      ci++;
    }
  });

  return g;
}

// ---------------------------------------------------------------------------
// 7. 银杏树（参考图 7）—— 金色扇形叶 + 深色分叉树干 + 飘叶
// ---------------------------------------------------------------------------
function makeGinkgo() {
  const g = new THREE.Group();
  g.name = 'ginkgo';
  const bark = 0x3c2f28;
  const barkDark = 0x2c221d;
  trunkBase(g, 8.4, 1.55, 0.8, bark, 8);
  for (let i = 0; i < 5; i++) {
    const a = (i / 5) * Math.PI * 2 + 0.3;
    branch(g, 0, 2.4, 0, Math.cos(a) * 2.5, 0.1, Math.sin(a) * 2.5, 0.75, 0.2, barkDark, 5);
  }

  const mains = [
    [-4.9, 13.0, 1.2], [5.0, 12.8, -1.1], [-2.6, 14.2, 3.4],
    [2.7, 14.0, -3.4], [0.2, 14.8, 0.3],
  ];
  for (const [x, y, z] of mains) {
    branch(g, 0, 6.4, 0, x * 0.55, y - 2.3, z * 0.55, 0.62, 0.34, bark, 6);
    branch(g, x * 0.55, y - 2.3, z * 0.55, x, y, z, 0.34, 0.16, bark, 5);
    // 末端细枝
    branch(g, x, y, z, x * 1.18, y + 1.2, z * 1.18, 0.14, 0.05, barkDark, 4);
    branch(g, x * 0.8, y - 1.4, z * 0.8, x * 1.35, y - 0.2, z * 1.35, 0.11, 0.04, barkDark, 4);
  }

  const golds = [0xd9a91f, 0xe8c33a, 0xc9971c, 0xf0d45a, 0xb8860b];
  const rnd = makeRng(20260);
  const count = 300;
  for (let i = 0; i < count; i++) {
    const u = rnd() * 2 - 1;
    const phi = rnd() * Math.PI * 2;
    const rr = Math.sqrt(Math.max(0, 1 - u * u));
    const dx = Math.cos(phi) * rr;
    const dy = u;
    const dz = Math.sin(phi) * rr;
    const shell = 0.55 + rnd() * 0.45;
    const x = dx * 7.6 * shell;
    const y = 15.0 + dy * 4.6 * shell;
    const z = dz * 6.8 * shell;
    const size = 1.15 + rnd() * 0.65;
    fanLeaf(g, x, y, z, size, golds[i % golds.length], rnd() * Math.PI, rnd() * Math.PI * 2, rnd() * Math.PI);
  }
  // 树冠外飘叶
  for (let i = 0; i < 26; i++) {
    const a = rnd() * Math.PI * 2;
    const r = 7.5 + rnd() * 4.5;
    const y = 5.0 + rnd() * 14.0;
    fanLeaf(g, Math.cos(a) * r, y, Math.sin(a) * r, 0.9 + rnd() * 0.6, golds[i % golds.length], rnd() * Math.PI, rnd() * Math.PI * 2, rnd() * Math.PI);
  }

  return g;
}

// ---------------------------------------------------------------------------
// 8. 紫晶树（参考图 8）—— 紫色三角碎片冠 + 扭曲树干 + 光环
// ---------------------------------------------------------------------------
function makeAmethyst() {
  const g = new THREE.Group();
  g.name = 'amethyst';
  const bark = 0x4a3a4c;
  const barkDark = 0x332838;
  const barkLight = 0x5c4a60;

  // 扭曲主干：两段错位
  addMesh(g, new THREE.CylinderGeometry(1.45, 1.85, 7.2, 9), mat(bark), 0, 3.6, 0);
  addMesh(g, new THREE.CylinderGeometry(0.95, 1.45, 4.6, 9), mat(barkLight), 0.28, 8.9, 0.18);
  for (let i = 0; i < 5; i++) {
    const a = (i / 5) * Math.PI * 2 + 0.4;
    branch(g, 0, 2.6, 0, Math.cos(a) * 2.3, 0.1, Math.sin(a) * 2.3, 0.8, 0.2, barkDark, 5);
  }

  const mains = [
    [-5.0, 13.2, 1.6], [5.1, 13.0, -1.5], [-2.7, 14.4, -3.5],
    [2.8, 14.2, 3.5], [0.1, 15.0, 0.2], [-3.4, 12.4, 2.8], [3.5, 12.2, -2.9],
  ];
  for (const [x, y, z] of mains) {
    branch(g, 0.15, 8.4, 0.1, x * 0.55, y - 2.2, z * 0.55, 0.72, 0.38, bark, 6);
    branch(g, x * 0.55, y - 2.2, z * 0.55, x, y, z, 0.38, 0.16, barkDark, 5);
    branch(g, x, y, z, x * 1.16, y + 1.0, z * 1.16, 0.14, 0.05, barkDark, 4);
  }

  const purples = [0x9a8ac9, 0xb4a6dc, 0x8272b3, 0xc7bce8, 0x6f5fa0];
  const rnd = makeRng(8844);
  const shard = (x, y, z, s) => {
    const geo = new THREE.TetrahedronGeometry(1, 0);
    const m = addMesh(g, geo, mat(purples[Math.floor(rnd() * purples.length)]),
      x, y, z, rnd() * Math.PI, rnd() * Math.PI * 2, rnd() * Math.PI);
    m.scale.set(s * (0.9 + rnd() * 0.5), s * (0.9 + rnd() * 0.5), s * (0.3 + rnd() * 0.25));
  };
  for (let i = 0; i < 280; i++) {
    const u = rnd() * 2 - 1;
    const phi = rnd() * Math.PI * 2;
    const rr = Math.sqrt(Math.max(0, 1 - u * u));
    const shell = 0.55 + rnd() * 0.5;
    shard(Math.cos(phi) * rr * 7.3 * shell, 15.0 + u * 4.5 * shell, Math.sin(phi) * rr * 6.4 * shell, 0.55 + rnd() * 0.65);
  }
  // 飘散碎片
  for (let i = 0; i < 34; i++) {
    const a = rnd() * Math.PI * 2;
    const r = 7.0 + rnd() * 5.5;
    shard(Math.cos(a) * r, 4.0 + rnd() * 15.0, Math.sin(a) * r, 0.3 + rnd() * 0.35);
  }
  // 细白线光环
  for (let i = 0; i < 3; i++) {
    const ring = addMesh(g, new THREE.TorusGeometry(7.6 + i * 1.6, 0.05, 5, 40), mat(0xece7f2), 0, 9.5 + i * 2.2, 0);
    ring.rotation.x = Math.PI / 2 + 0.10 * (i - 1);
    ring.rotation.z = 0.12 * i;
    ring.castShadow = false;
  }

  return g;
}

// ---------------------------------------------------------------------------
// 摆放：2 行 x 4 列
// ---------------------------------------------------------------------------
const makers = [
  { name: '阔叶树', make: makeBroadleaf },
  { name: '仙人掌', make: makeCactus },
  { name: '凤凰木', make: makePoinciana },
  { name: '猴面包树', make: makeBaobab },
  { name: '分层冷杉', make: makeFir },
  { name: '伞形金合欢', make: makeAcacia },
  { name: '银杏树', make: makeGinkgo, top: 20.4 },
  { name: '紫晶树', make: makeAmethyst, top: 19.8 },
];

const XS = [-33, -11, 11, 33];
const ZS = [-20, 26];
const trees = [];
const ui = document.getElementById('ui');

const allBtn = document.createElement('button');
allBtn.textContent = '全部';
allBtn.className = 'active';
ui.appendChild(allBtn);

makers.forEach((m, i) => {
  const g = m.make();
  const col = i % 4;
  const row = Math.floor(i / 4);
  g.position.set(XS[col], 0, ZS[row]);
  scene.add(g);
  addOutlineDeep(g, 0.030, undefined, { minRadius: 0.55 });
  trees.push({ group: g, name: m.name, x: XS[col], z: ZS[row], top: m.top === undefined ? 21.5 : m.top });

  const btn = document.createElement('button');
  btn.textContent = m.name;
  btn.addEventListener('click', () => {
    focus(i);
    [allBtn, ...ui.querySelectorAll('button')].forEach((b) => b.classList.remove('active'));
    btn.classList.add('active');
  });
  ui.appendChild(btn);
});

// 标签
const tags = trees.map((t) => {
  const el = document.createElement('div');
  el.className = 'tag';
  el.textContent = t.name;
  document.body.appendChild(el);
  return el;
});

// ---------------------------------------------------------------------------
// 相机
// ---------------------------------------------------------------------------
let yaw = 0.10, pitch = 0.38, dist = 122;
let dragging = false, lastX = 0, lastY = 0;
const target = new THREE.Vector3(0, 9, 3);

let showTags = false;

function focus(i) {
  const t = trees[i];
  showTags = true;
  trees.forEach((tr, j) => { tr.group.visible = j === i; });
  target.set(t.x, 11.0, t.z);
  yaw = 0.12;
  pitch = 0.20;
  dist = 50;
}
allBtn.addEventListener('click', () => {
  trees.forEach((tr) => { tr.group.visible = true; });
  showTags = false;
  tags.forEach((el) => { el.style.display = 'none'; });
  target.set(0, 9.5, 3);
  yaw = 0.10;
  pitch = 0.38;
  dist = 122;
  [allBtn, ...ui.querySelectorAll('button')].forEach((b) => b.classList.remove('active'));
  allBtn.classList.add('active');
});

canvas.addEventListener('pointerdown', (e) => {
  dragging = true;
  lastX = e.clientX;
  lastY = e.clientY;
  try { canvas.setPointerCapture(e.pointerId); } catch (err) {}
});
canvas.addEventListener('pointerup', () => { dragging = false; });
canvas.addEventListener('pointercancel', () => { dragging = false; });
canvas.addEventListener('pointermove', (e) => {
  if (!dragging) return;
  yaw -= (e.clientX - lastX) * 0.008;
  pitch = Math.max(0.08, Math.min(1.15, pitch + (e.clientY - lastY) * 0.006));
  lastX = e.clientX;
  lastY = e.clientY;
});
canvas.addEventListener('wheel', (e) => {
  e.preventDefault();
  dist = Math.max(14, Math.min(160, dist + e.deltaY * 0.05));
}, { passive: false });

// ---------------------------------------------------------------------------
// 渲染
// ---------------------------------------------------------------------------
const tmp = new THREE.Vector3();
function placeTag(el, x, y, z) {
  tmp.set(x, y, z).project(camera);
  const sx = (tmp.x * 0.5 + 0.5) * innerWidth;
  const sy = (-tmp.y * 0.5 + 0.5) * innerHeight;
  el.style.left = sx + 'px';
  el.style.top = sy + 'px';
  el.style.display = (tmp.z > 1 || tmp.z < -1) ? 'none' : 'block';
}

function resize() {
  const w = innerWidth, h = innerHeight;
  renderer.setSize(w, h, false);
  camera.aspect = w / h;
  camera.updateProjectionMatrix();
}
addEventListener('resize', resize);
resize();

function tick() {
  const cx = target.x + dist * Math.cos(pitch) * Math.sin(yaw);
  const cy = target.y + dist * Math.sin(pitch);
  const cz = target.z + dist * Math.cos(pitch) * Math.cos(yaw);
  camera.position.set(cx, cy, cz);
  camera.lookAt(target);

  trees.forEach((t, i) => {
    const el = tags[i];
    if (!showTags || !t.group.visible) { el.style.display = 'none'; return; }
    placeTag(el, t.x, t.top + 0.8, t.z);
  });

  renderer.render(scene, camera);
  requestAnimationFrame(tick);
}
tick();

window.__BIGTREE_PREVIEW__ = {
  scene, camera, renderer, trees,
  focus,
  all: () => allBtn.click(),
  look: (y, p, d, tx, ty, tz) => {
    yaw = y; pitch = p; dist = d;
    if (tx !== undefined) target.set(tx, ty, tz);
  },
  ready: true,
};
