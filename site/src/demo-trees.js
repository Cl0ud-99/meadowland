// 树木 demo 入口
import * as THREE from '../vendor/three/three.module.js';
import { makeBirch, makeOak, makeSpruce, makeAutumnTree } from './world/treeDemo.js';
import { addOutlineDeep } from './render/outline.js';

const canvas = document.getElementById('c');
const renderer = new THREE.WebGLRenderer({ canvas, antialias: true });
renderer.setPixelRatio(Math.min(devicePixelRatio, 2));
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFSoftShadowMap;
renderer.toneMapping = THREE.ACESFilmicToneMapping;
renderer.toneMappingExposure = 1.0;

const scene = new THREE.Scene();
scene.background = new THREE.Color(0xe8eef2);
const camera = new THREE.PerspectiveCamera(38, 1, 0.1, 500);

const sun = new THREE.DirectionalLight(0xfff2dd, 2.6);
sun.position.set(14, 24, 16);
sun.castShadow = true;
sun.shadow.mapSize.set(2048, 2048);
sun.shadow.camera.left = -26; sun.shadow.camera.right = 26;
sun.shadow.camera.top = 26; sun.shadow.camera.bottom = -26;
sun.shadow.camera.near = 1; sun.shadow.camera.far = 80;
sun.shadow.bias = -0.0008;
scene.add(sun);

const fill = new THREE.DirectionalLight(0xcfe0ff, 0.65);
fill.position.set(-14, 12, -12);
scene.add(fill);
scene.add(new THREE.HemisphereLight(0xdfeaf5, 0xb0a08a, 0.9));

const ground = new THREE.Mesh(
  new THREE.CircleGeometry(60, 56),
  new THREE.MeshLambertMaterial({ color: 0xdcd8d0 })
);
ground.rotation.x = -Math.PI / 2;
ground.receiveShadow = true;
scene.add(ground);

// 四棵树排成 2x2
const trees = [
  { make: makeBirch,      x: -8.5, z: -5.0, rot: 0.5,  label: 'A 白桦' },
  { make: makeOak,        x: 1.0,  z: -5.0, rot: -0.5, label: 'B 橡树' },
  { make: makeSpruce,     x: -8.5, z: 5.5,  rot: 2.3,  label: 'C 云杉' },
  { make: makeAutumnTree, x: 3.0,  z: 5.5,  rot: -2.3, label: 'D 秋树' },
];
for (const t of trees) {
  const m = t.make();
  m.position.set(t.x, 0, t.z);
  m.rotation.y = t.rot;
  scene.add(m);
  addOutlineDeep(m, 0.05, undefined, { minRadius: 0.12 });
}

let yaw = 0.55, pitch = 0.28, dist = 36;
let dragging = false, lastX = 0, lastY = 0;
const target = new THREE.Vector3(0, 3.4, 0);

canvas.addEventListener('pointerdown', (e) => {
  dragging = true; lastX = e.clientX; lastY = e.clientY;
  try { canvas.setPointerCapture(e.pointerId); } catch (err) {}
});
canvas.addEventListener('pointerup', () => { dragging = false; });
canvas.addEventListener('pointercancel', () => { dragging = false; });
canvas.addEventListener('pointermove', (e) => {
  if (!dragging) return;
  yaw -= (e.clientX - lastX) * 0.008;
  pitch = Math.max(0.04, Math.min(1.15, pitch + (e.clientY - lastY) * 0.006));
  lastX = e.clientX; lastY = e.clientY;
});
canvas.addEventListener('wheel', (e) => {
  e.preventDefault();
  dist = Math.max(8, Math.min(70, dist + e.deltaY * 0.03));
}, { passive: false });

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
  renderer.render(scene, camera);
  requestAnimationFrame(tick);
}
tick();

window.__DEMO__ = {
  scene, camera, renderer, trees,
  look: (y, p, d, tx, ty, tz) => {
    yaw = y; pitch = p; dist = d;
    if (tx !== undefined) target.set(tx, ty, tz);
  },
  ready: true,
};
