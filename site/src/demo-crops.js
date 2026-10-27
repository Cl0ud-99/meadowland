// 农作物 demo 入口
import * as THREE from '../vendor/three/three.module.js';
import { makeSunflower, makeCarrot, makePumpkin, makeWheat, makeCorn, makeWatermelon, makeAppleTree } from './world/cropDemo.js';
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
const camera = new THREE.PerspectiveCamera(36, 1, 0.1, 500);

const sun = new THREE.DirectionalLight(0xfff2dd, 2.6);
sun.position.set(10, 18, 12);
sun.castShadow = true;
sun.shadow.mapSize.set(2048, 2048);
sun.shadow.camera.left = -18; sun.shadow.camera.right = 18;
sun.shadow.camera.top = 18; sun.shadow.camera.bottom = -18;
sun.shadow.camera.near = 1; sun.shadow.camera.far = 60;
sun.shadow.bias = -0.0008;
scene.add(sun);

const fill = new THREE.DirectionalLight(0xcfe0ff, 0.65);
fill.position.set(-12, 10, -10);
scene.add(fill);
scene.add(new THREE.HemisphereLight(0xdfeaf5, 0xb0a08a, 0.9));

const ground = new THREE.Mesh(
  new THREE.CircleGeometry(50, 56),
  new THREE.MeshLambertMaterial({ color: 0xdcd8d0 })
);
ground.rotation.x = -Math.PI / 2;
ground.receiveShadow = true;
scene.add(ground);

// 五种农作物排成一行
const crops = [
  { make: makeSunflower,  x: -7.0, z: -2.5, rot: 0.4,  label: 'A 向日葵' },
  { make: makeCarrot,     x: -3.5, z: -2.5, rot: -0.3, label: 'B 胡萝卜' },
  { make: makePumpkin,    x: 0.0,  z: -2.5, rot: 0.6,  label: 'C 南瓜' },
  { make: makeWheat,      x: 3.5,  z: -2.5, rot: -0.5, label: 'D 小麦' },
  { make: makeCorn,       x: 7.0,  z: -2.5, rot: 0.3,  label: 'E 玉米' },
  { make: makeWatermelon, x: -4.0, z: 2.5,  rot: 0.35, label: 'F 西瓜' },
  { make: makeAppleTree,  x: 2.0,  z: 2.5,  rot: -0.4, label: 'G 苹果树' },
];
for (const c of crops) {
  const m = c.make();
  m.position.set(c.x, 0, c.z);
  m.rotation.y = c.rot;
  scene.add(m);
  addOutlineDeep(m, 0.04, undefined, { minRadius: 0.10 });
}

let yaw = 0.28, pitch = 0.30, dist = 30;
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
  dist = Math.max(6, Math.min(70, dist + e.deltaY * 0.025));
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
  scene, camera, renderer, crops,
  look: (y, p, d, tx, ty, tz) => {
    yaw = y; pitch = p; dist = d;
    if (tx !== undefined) target.set(tx, ty, tz);
  },
  ready: true,
};
