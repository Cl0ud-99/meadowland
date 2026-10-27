// 筒仓 demo 入口
import * as THREE from 'three';
import { makeMetalSilo, makeWoodSilo, makeConcreteSilo } from './world/siloDemo.js';
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

const camera = new THREE.PerspectiveCamera(40, 1, 0.1, 500);

const sun = new THREE.DirectionalLight(0xfff2dd, 2.5);
sun.position.set(18, 26, 20);
sun.castShadow = true;
sun.shadow.mapSize.set(2048, 2048);
sun.shadow.camera.left = -45; sun.shadow.camera.right = 45;
sun.shadow.camera.top = 45; sun.shadow.camera.bottom = -45;
sun.shadow.camera.near = 1; sun.shadow.camera.far = 110;
sun.shadow.bias = -0.0008;
scene.add(sun);

const fill = new THREE.DirectionalLight(0xcfe0ff, 0.7);
fill.position.set(-18, 14, -14);
scene.add(fill);

scene.add(new THREE.HemisphereLight(0xdfeaf5, 0xb0a08a, 0.85));

const ground = new THREE.Mesh(
  new THREE.CircleGeometry(90, 56),
  new THREE.MeshLambertMaterial({ color: 0xdcd8d0 })
);
ground.rotation.x = -Math.PI / 2;
ground.receiveShadow = true;
scene.add(ground);

// 三个双筒仓并排
const GAP = 18;
const silos = [
  { mesh: makeMetalSilo(),    x: -GAP, label: 'A 金属' },
  { mesh: makeWoodSilo(),     x: 0,    label: 'B 红木' },
  { mesh: makeConcreteSilo(), x: GAP,  label: 'C 混凝土' },
];
for (const s of silos) {
  s.mesh.position.x = s.x;
  scene.add(s.mesh);
  addOutlineDeep(s.mesh, 0.055);
}

let yaw = 0.0, pitch = 0.18, dist = 42;
let dragging = false, lastX = 0, lastY = 0;
const target = new THREE.Vector3(0, 7, 0);

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
  dist = Math.max(14, Math.min(110, dist + e.deltaY * 0.06));
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
  scene, camera, renderer, silos,
  look: (y, p, d, tx, ty, tz) => {
    yaw = y; pitch = p; dist = d;
    if (tx !== undefined) target.set(tx, ty, tz);
  },
  ready: true,
};
