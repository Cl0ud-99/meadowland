// 参天大树 demo 入口（9 种体素巨树）
import * as THREE from '../vendor/three/three.module.js';
import { BIG_TREE_KINDS } from './world/bigTreeDemo.js';
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
const camera = new THREE.PerspectiveCamera(40, 1, 0.1, 600);

const sun = new THREE.DirectionalLight(0xfff2dd, 2.4);
sun.position.set(20, 32, 22);
sun.castShadow = true;
sun.shadow.mapSize.set(2048, 2048);
sun.shadow.camera.left = -40; sun.shadow.camera.right = 40;
sun.shadow.camera.top = 40; sun.shadow.camera.bottom = -40;
sun.shadow.camera.near = 1; sun.shadow.camera.far = 120;
sun.shadow.bias = -0.0008;
scene.add(sun);

scene.add(new THREE.HemisphereLight(0xdfeaf5, 0xb0a08a, 0.9));

const ground = new THREE.Mesh(
  new THREE.CircleGeometry(140, 64),
  new THREE.MeshLambertMaterial({ color: 0xdad6ce })
);
ground.rotation.x = -Math.PI / 2;
ground.receiveShadow = true;
scene.add(ground);

// 9 棵树排成 3x3
const cols = 3, rows = 3;
const gapX = 34, gapZ = 30;
const models = [];
BIG_TREE_KINDS.forEach((k, i) => {
  const cxi = i % cols, cyi = Math.floor(i / cols);
  const x = (cxi - (cols - 1) / 2) * gapX;
  const z = (cyi - (rows - 1) / 2) * gapZ;
  const m = k.make();
  m.position.set(x, 0, z);
  m.rotation.y = (i * 0.6) % Math.PI;
  scene.add(m);
  addOutlineDeep(m, 0.06, undefined, { minRadius: 0.15 });
  models.push({ make: k.make, name: k.name, model: m, x, z });
});

let yaw = 0.6, pitch = 0.32, dist = 185;
let dragging = false, lastX = 0, lastY = 0;
const target = new THREE.Vector3(0, 11, 0);

canvas.addEventListener('pointerdown', (e) => {
  dragging = true; lastX = e.clientX; lastY = e.clientY;
  try { canvas.setPointerCapture(e.pointerId); } catch (err) {}
});
canvas.addEventListener('pointerup', () => { dragging = false; });
canvas.addEventListener('pointercancel', () => { dragging = false; });
canvas.addEventListener('pointermove', (e) => {
  if (!dragging) return;
  yaw -= (e.clientX - lastX) * 0.006;
  pitch = Math.max(0.05, Math.min(1.2, pitch + (e.clientY - lastY) * 0.005));
  lastX = e.clientX; lastY = e.clientY;
});
canvas.addEventListener('wheel', (e) => {
  e.preventDefault();
  dist = Math.max(40, Math.min(320, dist + e.deltaY * 0.06));
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
  scene, camera, renderer, models,
  look: (y, p, d, tx, ty, tz) => {
    yaw = y; pitch = p; dist = d;
    if (tx !== undefined) target.set(tx, ty, tz);
  },
  ready: true,
};
