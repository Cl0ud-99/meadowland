// 谷仓/农舍 外观 demo 入口
import * as THREE from '../vendor/three/three.module.js';
import { buildBarnDemo, buildFarmhouseDemo } from './world/barnDemo.js';
import { addOutlineDeep as outlineDeep } from './render/outline.js';

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

// 三点光（模拟参考图的干净棚拍光）
const sun = new THREE.DirectionalLight(0xfff2dd, 2.6);
sun.position.set(16, 24, 18);
sun.castShadow = true;
sun.shadow.mapSize.set(2048, 2048);
sun.shadow.camera.left = -32; sun.shadow.camera.right = 32;
sun.shadow.camera.top = 32; sun.shadow.camera.bottom = -32;
sun.shadow.camera.near = 1; sun.shadow.camera.far = 90;
sun.shadow.bias = -0.0008;
scene.add(sun);

const fill = new THREE.DirectionalLight(0xcfe0ff, 0.75);
fill.position.set(-16, 12, -12);
scene.add(fill);

scene.add(new THREE.HemisphereLight(0xdfeaf5, 0xb0a08a, 0.9));

// 地面
const ground = new THREE.Mesh(
  new THREE.CircleGeometry(70, 56),
  new THREE.MeshLambertMaterial({ color: 0xdcd8d0 })
);
ground.rotation.x = -Math.PI / 2;
ground.receiveShadow = true;
scene.add(ground);

// 两个模型
const barn = buildBarnDemo();
barn.position.set(-10, 0, 0);
barn.rotation.y = 0.26;
barn.castShadow = true;
scene.add(barn);

const house = buildFarmhouseDemo();
house.position.set(11, 0, 1.5);
house.rotation.y = -0.30;
house.castShadow = true;
scene.add(house);

// ★ 描边：和正式场景一致（main.js 里建筑用 THICK_BUILDING = 0.055）
//   之前 demo 没加描边，看不出"黑边太粗 / 穿模"的问题。
if (outlineDeep) {
  outlineDeep(barn, 0.055);
  outlineDeep(house, 0.055);
}

// 轨道控制
let yaw = 0.50, pitch = 0.26, dist = 52;
let dragging = false, lastX = 0, lastY = 0;
const target = new THREE.Vector3(0, 4.4, 0);

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
  dist = Math.max(18, Math.min(95, dist + e.deltaY * 0.06));
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

// 自动化截图接口
window.__DEMO__ = {
  scene, camera, renderer, barn, house,
  look: (y, p, d, tx, ty, tz) => {
    yaw = y; pitch = p; dist = d;
    if (tx !== undefined) target.set(tx, ty, tz);
  },
  ready: true,
};
