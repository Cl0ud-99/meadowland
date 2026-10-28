import * as THREE from 'three';
import { addOutlineDeep } from './src/render/outline.js';
import { SMALL_TREE_MAKERS } from './src/world/smalltrees.js';

// ---------------------------------------------------------------------------
// 场景普通树木 · 参考图复刻预览（低多边形）
//   苹果树 / 樱花树 / 枫树 / 白桦 / 山茶树
// ---------------------------------------------------------------------------

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
sun.shadow.camera.left = -80;
sun.shadow.camera.right = 80;
sun.shadow.camera.top = 80;
sun.shadow.camera.bottom = -80;
sun.shadow.camera.near = 1;
sun.shadow.camera.far = 220;
sun.shadow.bias = -0.0008;
scene.add(sun);

const fill = new THREE.DirectionalLight(0xcfe0ff, 0.55);
fill.position.set(-30, 24, -26);
scene.add(fill);
scene.add(new THREE.HemisphereLight(0xdfeaf5, 0xb0a08a, 0.85));

const ground = new THREE.Mesh(
  new THREE.CircleGeometry(150, 64),
  new THREE.MeshLambertMaterial({ color: 0xa9cd77 })
);
ground.rotation.x = -Math.PI / 2;
ground.receiveShadow = true;
scene.add(ground);

// ---------------------------------------------------------------------------
// 摆放 + UI
// ---------------------------------------------------------------------------
const makers = SMALL_TREE_MAKERS;
const XS = [-26, -13, 0, 13, 26];

const trees = [];
const ui = document.getElementById('ui');

const allBtn = document.createElement('button');
allBtn.textContent = '全部';
allBtn.className = 'active';
ui.appendChild(allBtn);

makers.forEach((m, i) => {
  const g = m.make();
  const x = XS[i];
  g.position.set(x, 0, 0);
  scene.add(g);
  if (m.outline !== 0) addOutlineDeep(g, m.outline === undefined ? 0.024 : m.outline, undefined, { minRadius: 0.2 });
  trees.push({ group: g, name: m.name, x, z: 0, top: m.top });

  const btn = document.createElement('button');
  btn.textContent = m.name;
  btn.addEventListener('click', () => {
    focus(i);
    [allBtn, ...ui.querySelectorAll('button')].forEach((b) => b.classList.remove('active'));
    btn.classList.add('active');
  });
  ui.appendChild(btn);
});

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
let yaw = 0.08, pitch = 0.28, dist = 64;
let dragging = false, lastX = 0, lastY = 0;
const target = new THREE.Vector3(0, 4.8, 0);

function focus(i) {
  const t = trees[i];
  target.set(t.x, 5.0, t.z);
  yaw = 0.12;
  pitch = 0.22;
  dist = 23;
}
allBtn.addEventListener('click', () => {
  target.set(0, 4.8, 0);
  yaw = 0.08;
  pitch = 0.28;
  dist = 64;
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
  pitch = Math.max(0.06, Math.min(1.15, pitch + (e.clientY - lastY) * 0.006));
  lastX = e.clientX;
  lastY = e.clientY;
});
canvas.addEventListener('wheel', (e) => {
  e.preventDefault();
  dist = Math.max(10, Math.min(180, dist + e.deltaY * 0.05));
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

  trees.forEach((t, i) => placeTag(tags[i], t.x, t.top + 1.1, t.z));

  renderer.render(scene, camera);
  requestAnimationFrame(tick);
}
tick();

window.__TREE_PREVIEW__ = {
  scene, camera, renderer, trees,
  focus,
  all: () => allBtn.click(),
  look: (y, p, d, tx, ty, tz) => {
    yaw = y; pitch = p; dist = d;
    if (tx !== undefined) target.set(tx, ty, tz);
  },
  ready: true,
};
