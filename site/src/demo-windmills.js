// 五个风车 demo 入口
import * as THREE from '../vendor/three/three.module.js';
import {
  makeModernTurbine, makeModernBlades,
  makeMediterraneanMill, makeMediterraneanSails,
  makeRanchWindmill, makeRanchFan,
  makeBrickMill, makeBrickSails,
  makeCandyMill, makeCandySails,
} from './world/windmillDemo.js';
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
sun.position.set(20, 30, 22);
sun.castShadow = true;
sun.shadow.mapSize.set(2048, 2048);
sun.shadow.camera.left = -55; sun.shadow.camera.right = 55;
sun.shadow.camera.top = 55; sun.shadow.camera.bottom = -55;
sun.shadow.camera.near = 1; sun.shadow.camera.far = 130;
sun.shadow.bias = -0.0008;
scene.add(sun);

const fill = new THREE.DirectionalLight(0xcfe0ff, 0.7);
fill.position.set(-20, 16, -16);
scene.add(fill);
scene.add(new THREE.HemisphereLight(0xdfeaf5, 0xb0a08a, 0.85));

const ground = new THREE.Mesh(
  new THREE.CircleGeometry(120, 64),
  new THREE.MeshLambertMaterial({ color: 0xdcd8d0 })
);
ground.rotation.x = -Math.PI / 2;
ground.receiveShadow = true;
scene.add(ground);

// 组装五个风车：塔身 + 叶片（叶片单独加入，便于旋转）
const mills = [];
function addMill(tower, sails, x, sailsY, sailsZ, spin) {
  const g = new THREE.Group();
  g.add(tower);
  if (sails) {
    sails.position.set(0, sailsY, sailsZ);
    g.add(sails);
  }
  g.position.x = x;
  scene.add(g);
  addOutlineDeep(tower, 0.055);
  if (sails) addOutlineDeep(sails, 0.045);
  mills.push({ group: g, tower, sails, spin: spin === undefined ? 0.6 : spin });
  return g;
}

const GAP = 15;
// A 现代风机：塔高 18，叶片在 y=18.4、z=1.3
addMill(makeModernTurbine(), makeModernBlades(), -GAP * 2, 18.42, 1.32, 0.45);
// B 地中海：塔高 6.4，帆在 y≈7.4 前方
addMill(makeMediterraneanMill(), makeMediterraneanSails(), -GAP, 7.2, 2.6, 0.5);
// C 牧场风车：塔高 9.5，扇在 y≈10.1 前方
addMill(makeRanchWindmill(), makeRanchFan(), 0, 10.05, 1.45, 0.9);
// D 砖砌：塔顶 6.85，叶片在前方
addMill(makeBrickMill(), makeBrickSails(), GAP, 6.6, 2.4, 0.35);
// E 糖果：顶部 4.12+，叶片在前方
addMill(makeCandyMill(), makeCandySails(), GAP * 2, 4.9, 2.5, 0.7);

let yaw = 0.0, pitch = 0.16, dist = 62;
let dragging = false, lastX = 0, lastY = 0;
const target = new THREE.Vector3(0, 9, 0);

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
  dist = Math.max(16, Math.min(160, dist + e.deltaY * 0.08));
}, { passive: false });

function resize() {
  const w = innerWidth, h = innerHeight;
  renderer.setSize(w, h, false);
  camera.aspect = w / h;
  camera.updateProjectionMatrix();
}
addEventListener('resize', resize);
resize();

let tPrev = performance.now();
function tick() {
  const now = performance.now();
  const dt = Math.min(0.05, (now - tPrev) / 1000);
  tPrev = now;
  for (const m of mills) {
    if (m.sails) m.sails.rotation.z += dt * m.spin;
  }
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
  scene, camera, renderer, mills,
  look: (y, p, d, tx, ty, tz) => {
    yaw = y; pitch = p; dist = d;
    if (tx !== undefined) target.set(tx, ty, tz);
  },
  ready: true,
};
