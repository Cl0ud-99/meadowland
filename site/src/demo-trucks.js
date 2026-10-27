// 农业卡车 demo 入口
import * as THREE from '../vendor/three/three.module.js';
import { makePickup, makeGrainTruck, makeBlueHauler, makeOrangeHauler } from './world/truckDemo.js';
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
sun.position.set(14, 22, 16);
sun.castShadow = true;
sun.shadow.mapSize.set(2048, 2048);
sun.shadow.camera.left = -30; sun.shadow.camera.right = 30;
sun.shadow.camera.top = 30; sun.shadow.camera.bottom = -30;
sun.shadow.camera.near = 1; sun.shadow.camera.far = 80;
sun.shadow.bias = -0.0008;
scene.add(sun);

const fill = new THREE.DirectionalLight(0xcfe0ff, 0.65);
fill.position.set(-14, 12, -12);
scene.add(fill);
scene.add(new THREE.HemisphereLight(0xdfeaf5, 0xb0a08a, 0.85));

const ground = new THREE.Mesh(
  new THREE.CircleGeometry(60, 56),
  new THREE.MeshLambertMaterial({ color: 0xdcd8d0 })
);
ground.rotation.x = -Math.PI / 2;
ground.receiveShadow = true;
scene.add(ground);

// 四辆车排成 2x2
const trucks = [
  // ★ 四辆车排成一行，间距够大，避免互相遮挡
  { make: makePickup,       x: -13.5, z: 0, rot: 0.55, label: 'A 皮卡' },
  { make: makeGrainTruck,   x: -4.5,  z: 0, rot: 0.55, label: 'B 谷物车' },
  { make: makeBlueHauler,   x: 5.5,   z: 0, rot: 0.55, label: 'C 蓝斗车' },
  { make: makeOrangeHauler, x: 15.5,  z: 0, rot: 0.55, label: 'D 橙斗车' },
];
for (const t of trucks) {
  const m = t.make();
  m.position.set(t.x, 0, t.z);
  m.rotation.y = t.rot;
  scene.add(m);
  addOutlineDeep(m, 0.055);
}

let yaw = 0.30, pitch = 0.38, dist = 44;
let dragging = false, lastX = 0, lastY = 0;
const target = new THREE.Vector3(0, 1.6, 0);

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
  dist = Math.max(10, Math.min(80, dist + e.deltaY * 0.04));
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
  scene, camera, renderer, trucks,
  look: (y, p, d, tx, ty, tz) => {
    yaw = y; pitch = p; dist = d;
    if (tx !== undefined) target.set(tx, ty, tz);
  },
  ready: true,
};
