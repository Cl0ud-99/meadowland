// 围栏 demo 入口
import * as THREE from 'three';
import { makePlankFence, makePicketFence, makeRailFence } from './world/fenceDemo.js';
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
sun.position.set(8, 16, 12);
sun.castShadow = true;
sun.shadow.mapSize.set(2048, 2048);
sun.shadow.camera.left = -14; sun.shadow.camera.right = 14;
sun.shadow.camera.top = 14; sun.shadow.camera.bottom = -14;
sun.shadow.camera.near = 1; sun.shadow.camera.far = 50;
sun.shadow.bias = -0.0008;
scene.add(sun);

const fill = new THREE.DirectionalLight(0xcfe0ff, 0.65);
fill.position.set(-10, 8, -8);
scene.add(fill);
scene.add(new THREE.HemisphereLight(0xdfeaf5, 0xb0a08a, 0.9));

const ground = new THREE.Mesh(
  new THREE.CircleGeometry(40, 56),
  new THREE.MeshLambertMaterial({ color: 0xdcd8d0 })
);
ground.rotation.x = -Math.PI / 2;
ground.receiveShadow = true;
scene.add(ground);

// 三种围栏，前后错开摆放
// ★ 三种围栏【左右排列】（不是前后），否则会互相遮挡看不清
const fences = [
  { make: makePlankFence,  x: -5.2, z: 0, rot: 0.0, label: 'A 尖顶木板' },
  { make: makePicketFence, x: 0.0,  z: 0, rot: 0.0, label: 'B 尖桩' },
  { make: makeRailFence,   x: 5.6,  z: 0, rot: 0.0, label: 'C 横板围栏' },
];
for (const f of fences) {
  const m = f.make();
  m.position.set(f.x, 0, f.z);
  m.rotation.y = f.rot;
  scene.add(m);
  addOutlineDeep(m, 0.045, undefined, { minRadius: 0.06 });
}

let yaw = 0.30, pitch = 0.16, dist = 15;
let dragging = false, lastX = 0, lastY = 0;
const target = new THREE.Vector3(0.2, 0.75, 0);

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
  dist = Math.max(4, Math.min(40, dist + e.deltaY * 0.015));
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
  scene, camera, renderer, fences,
  look: (y, p, d, tx, ty, tz) => {
    yaw = y; pitch = p; dist = d;
    if (tx !== undefined) target.set(tx, ty, tz);
  },
  ready: true,
};
