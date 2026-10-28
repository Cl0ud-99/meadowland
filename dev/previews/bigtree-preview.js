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
  const clusters = [
    [0.0, 13.4, 0.0, 4.0, 1.15, 3.5, 0],
    [-3.8, 13.6, 1.3, 3.0, 0.95, 2.7, 1],
    [3.9, 13.5, -1.3, 3.0, 0.95, 2.7, 2],
    [-2.1, 14.4, -2.7, 2.4, 0.85, 2.2, 3],
    [2.3, 14.3, 2.7, 2.4, 0.85, 2.2, 0],
    [0.2, 15.2, 0.4, 2.8, 0.95, 2.6, 2],
    [-6.4, 13.2, 1.9, 2.0, 0.65, 1.8, 1],
    [6.6, 13.1, -1.7, 2.0, 0.65, 1.8, 4],
    [-5.2, 14.2, -2.9, 1.7, 0.6, 1.5, 2],
    [5.3, 14.1, 2.8, 1.7, 0.6, 1.5, 3],
    [-1.9, 12.6, 4.7, 1.8, 0.6, 1.6, 1],
    [2.0, 12.5, -4.8, 1.8, 0.6, 1.6, 2],
    [-3.4, 12.2, 4.0, 1.5, 0.55, 1.3, 0],
    [3.5, 12.1, -4.0, 1.5, 0.55, 1.3, 1],
    [-0.8, 12.0, 5.2, 1.4, 0.5, 1.2, 3],
    [0.9, 11.9, -5.3, 1.4, 0.5, 1.2, 2],
  ];
  clusters.forEach((c, i) => {
    blob(g, c[0], c[1], c[2], c[3] * 0.92, c[4] * 1.55, c[5] * 0.92, reds[c[6] % reds.length], 1, i * 0.7);
  });
  // 细小黄花点缀
  for (let i = 0; i < 16; i++) {
    const a = (i / 16) * Math.PI * 2 + 0.3;
    const r = 4.8 + (i % 3) * 1.0;
    blob(g, Math.cos(a) * r, 13.2 + (i % 4) * 0.55, Math.sin(a) * r, 0.38, 0.32, 0.38, 0xf5c542, 0, i);
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
  trunkBase(g, 8.2, 1.75, 1.0, bark, 8);
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
  const clusters = [
    // 下层伞冠
    [0.0, 13.0, 0.0, 4.2, 0.55, 3.8, 0],
    [-4.2, 12.8, 1.7, 2.9, 0.42, 2.6, 1],
    [4.3, 12.7, -1.6, 2.9, 0.42, 2.6, 2],
    [-2.4, 13.2, -3.2, 2.3, 0.38, 2.1, 3],
    [2.5, 13.1, 3.2, 2.3, 0.38, 2.1, 0],
    [-6.4, 12.4, 1.9, 2.1, 0.36, 1.9, 2],
    [6.5, 12.3, -1.8, 2.1, 0.36, 1.9, 1],
    [-4.9, 12.0, -2.6, 1.8, 0.32, 1.6, 0],
    [5.0, 11.9, 2.5, 1.8, 0.32, 1.6, 3],
    // 上层
    [-1.5, 14.2, 0.8, 3.0, 0.5, 2.7, 1],
    [1.7, 14.1, -0.9, 3.0, 0.5, 2.7, 2],
    [0.0, 15.0, 0.0, 2.6, 0.45, 2.3, 0],
    [-3.8, 14.4, 1.9, 2.0, 0.35, 1.8, 3],
    [4.0, 14.3, -2.0, 2.0, 0.35, 1.8, 1],
    [-1.0, 15.5, -1.8, 1.7, 0.3, 1.5, 2],
    [1.2, 15.4, 1.9, 1.7, 0.3, 1.5, 0],
    // 外缘碎团
    [-7.9, 12.6, 0.5, 1.4, 0.28, 1.2, 3, 0],
    [8.0, 12.5, -0.5, 1.4, 0.28, 1.2, 1, 0],
    [-3.0, 13.6, 3.6, 1.3, 0.26, 1.1, 2, 0],
    [3.1, 13.5, -3.7, 1.3, 0.26, 1.1, 0, 0],
    [0.0, 13.9, 4.1, 1.4, 0.26, 1.2, 1, 0],
    [0.0, 13.8, -4.2, 1.4, 0.26, 1.2, 3, 0],
  ];
  clusters.forEach((c, i) => {
    blob(g, c[0], c[1], c[2], c[3], c[4], c[5], greens[c[6] % greens.length], c[7] === undefined ? 1 : c[7], i * 0.6);
  });

  return g;
}

// ---------------------------------------------------------------------------
// 摆放：2 行 x 3 列
// ---------------------------------------------------------------------------
const makers = [
  { name: '阔叶树', make: makeBroadleaf },
  { name: '仙人掌', make: makeCactus },
  { name: '凤凰木', make: makePoinciana },
  { name: '猴面包树', make: makeBaobab },
  { name: '分层冷杉', make: makeFir },
  { name: '伞形金合欢', make: makeAcacia },
];

const XS = [-30, 0, 30];
const ZS = [-14, 20];
const trees = [];
const ui = document.getElementById('ui');

const allBtn = document.createElement('button');
allBtn.textContent = '全部';
allBtn.className = 'active';
ui.appendChild(allBtn);

makers.forEach((m, i) => {
  const g = m.make();
  const col = i % 3;
  const row = Math.floor(i / 3);
  g.position.set(XS[col], 0, ZS[row]);
  scene.add(g);
  addOutlineDeep(g, 0.030, undefined, { minRadius: 0.55 });
  trees.push({ group: g, name: m.name, x: XS[col], z: ZS[row] });

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
let yaw = 0.12, pitch = 0.34, dist = 96;
let dragging = false, lastX = 0, lastY = 0;
const target = new THREE.Vector3(0, 9, 3);

function focus(i) {
  const t = trees[i];
  trees.forEach((tr, j) => { tr.group.visible = j === i; });
  target.set(t.x, 11.0, t.z);
  yaw = 0.12;
  pitch = 0.20;
  dist = 50;
}
allBtn.addEventListener('click', () => {
  trees.forEach((tr) => { tr.group.visible = true; });
  target.set(0, 9, 3);
  yaw = 0.12;
  pitch = 0.34;
  dist = 96;
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
    if (!t.group.visible) { el.style.display = 'none'; return; }
    placeTag(el, t.x, 21.5, t.z);
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
