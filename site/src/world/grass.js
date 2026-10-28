import * as THREE from '../../vendor/three/three.module.js';
import { WORLD } from '../config.js';
import { BUILDINGS } from './layout.js';
import { toonLambert } from '../render/toon.js';

// 一簇草 = 4 片交叉的短锥形草叶。保持单个 InstancedMesh，
// 用较低的叶片高度和更宽的倾角做出毛毡小簇。
function makeTuftGeometry() {
  const pos = [], nrm = [], col = [];
  const BLADES = 4;
  for (let b = 0; b < BLADES; b++) {
    const h = 0.32 + ((b * 29) % 5) / 5 * 0.16;   // 0.32~0.48
    const radius = 0.07 + ((b * 17) % 4) / 4 * 0.035;
    const g = new THREE.ConeGeometry(radius, h, 3, 1, true);
    g.translate(0, h / 2, 0);
    const yaw = (b / BLADES) * Math.PI * 2 + 0.35;
    const tilt = 0.38 + ((b * 23) % 5) / 5 * 0.28;
    const spread = 0.03 + ((b * 13) % 4) / 4 * 0.06;
    const m = new THREE.Matrix4().makeRotationY(yaw);
    m.multiply(new THREE.Matrix4().makeRotationZ(tilt));
    g.applyMatrix4(m);
    g.translate(Math.cos(yaw) * spread, 0, Math.sin(yaw) * spread);
    const n = g.toNonIndexed();
    const pa = n.attributes.position.array;
    const na = n.attributes.normal.array;
    for (let i = 0; i < n.attributes.position.count; i++) {
      pos.push(pa[i * 3], pa[i * 3 + 1], pa[i * 3 + 2]);
      nrm.push(na[i * 3], na[i * 3 + 1], na[i * 3 + 2]);
      const t = Math.min(1, Math.max(0, pa[i * 3 + 1] / h));
      const f = 0.64 + 0.36 * t;
      col.push(f, f, f);
    }
    g.dispose();
    n.dispose();
  }
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  geo.setAttribute('normal', new THREE.Float32BufferAttribute(nrm, 3));
  geo.setAttribute('color', new THREE.Float32BufferAttribute(col, 3));
  geo.computeBoundingSphere();
  return geo;
}

// 近景草丛：实例化的小草簇：只在台地附近撒，用实例化的小三角片，保证治愈的"毛茸茸"边缘
export function buildGrassTufts(model, rng, count = 2600) {
  const geo = makeTuftGeometry();

  // shared:false —— 下面覆盖 onBeforeCompile 挂风摆，且 main.js 每季改 color
  const mat = toonLambert({
    color: 0x8fbe5e,
    flatShading: true,
    vertexColors: true,
    side: THREE.DoubleSide,
    transparent: true,     // 距离淡出需要
    depthWrite: true,
    shared: false,
  });
  mat.onBeforeCompile = (shader) => {
    shader.uniforms.uTime = { value: 0 };
    shader.vertexShader = 'uniform float uTime;\n' + shader.vertexShader.replace(
      '#include <begin_vertex>',
      `#include <begin_vertex>
       #ifdef USE_INSTANCING
         vec3 o = instanceMatrix[3].xyz;
       #else
         vec3 o = vec3(0.0);
       #endif
       float w = transformed.y * 0.22;
       transformed.x += sin(uTime * 1.6 + o.x * 0.35 + o.z * 0.28) * w;
       transformed.z += cos(uTime * 1.3 + o.x * 0.2) * w * 0.6;`
    );
    // ---------- 距离淡出 ----------
    // 草是 0.16 宽的细锥体，远处投影后不到 1 像素，
    // 在画面里就是一根"锐利细线"。即使做景深模糊，
    // 细线也会保留形状（模糊只会降低对比度，不会让它消失），
    // 看起来就是颗粒感。
    //
    // 解决办法：按相机距离让草逐渐透明，超过 120 单位完全消失。
    // 远景本来就不需要看到草，这样画面立刻干净。
    // 用 mvPosition 的 z 值算距离（视图空间，不用额外 varying）
    // 注意：Lambert 材质的 vertexShader 里有 mvPosition 变量，
    // 但它在 include 内部，所以这里改用 vViewPosition（three 标准 varying）
    shader.fragmentShader = shader.fragmentShader.replace(
      '#include <dithering_fragment>',
      `#include <dithering_fragment>
       // three 的 Lambert 材质自带 vViewPosition（视图空间位置）
       float camDist = length(vViewPosition);
       float fade = 1.0 - smoothstep(170.0, 300.0, camDist);
       if (fade < 0.02) discard;
       gl_FragColor.a *= fade;`
    );
    mat.userData.shader = shader;
  };
  mat.customProgramCacheKey = () => 'grass';

  const mesh = new THREE.InstancedMesh(geo, mat, count);
  mesh.name = 'grass';

  const m = new THREE.Matrix4();
  const q = new THREE.Quaternion();
  const p = new THREE.Vector3();
  const s = new THREE.Vector3();
  const up = new THREE.Vector3(0, 1, 0);
  const tint = new THREE.Color();

  let i = 0, guard = 0;
  let clusterX = 0, clusterZ = 0, clusterLeft = 0, clusterRadius = 1.5;
  while (i < count && guard < count * 20) {
    guard++;
    if (clusterLeft <= 0) {
      // 先撒一个簇心，再在簇心周围撒 3~6 根短草叶。
      const ang = rng.next() * Math.PI * 2;
      // 一半近景、一半铺到外圈，让草簇覆盖整块农场和坡地。
      const near = i < count * 0.5;
      const rad = near
        ? 20 + Math.sqrt(rng.next()) * 50
        : 65 + Math.sqrt(rng.next()) * 135;
      clusterX = Math.cos(ang) * rad;
      clusterZ = Math.sin(ang) * rad;
      clusterLeft = 3 + Math.floor(rng.next() * 4);
      clusterRadius = rng.range(0.8, 2.4);
    }
    clusterLeft--;
    const ca = rng.next() * Math.PI * 2;
    const cr = Math.sqrt(rng.next()) * clusterRadius;
    const x = clusterX + Math.cos(ca) * cr;
    const z = clusterZ + Math.sin(ca) * cr;
    if (Math.abs(x) > WORLD.size * 0.45 || Math.abs(z) > WORLD.size * 0.45) continue;
    // 水里不长草：池塘范围直接跳过
    const pond = BUILDINGS.pond;
    if (Math.hypot(x - pond.x, z - pond.z) < pond.r * 1.04) continue;
    const y = model.heightAt(x, z);
    if (model.slopeAt(x, z) > 0.7) continue;
    p.set(x, y, z);
    q.setFromAxisAngle(up, rng.next() * Math.PI * 2);
    // 混入一部分短草，让贴地草和长草有层次
    const pick = rng.next();
    const sc = pick < 0.3 ? rng.range(0.55, 0.8)
             : pick < 0.82 ? rng.range(0.85, 1.15)
             : rng.range(1.2, 1.5);
    s.set(sc, sc * rng.range(0.8, 1.5), sc);
    m.compose(p, q, s);
    mesh.setMatrixAt(i, m);
    // 每根草独立色差，避免整片草一个色号
    const v = rng.range(0.94, 1.22);
    tint.setRGB(v * rng.range(0.92, 1.04), v, v * rng.range(0.82, 0.94));
    mesh.setColorAt(i, tint);
    i++;
  }
  mesh.count = i;
  mesh.instanceMatrix.needsUpdate = true;

  return {
    mesh,
    material: mat,
    baseColor: mat.color.clone(),
    update(t) {
      if (mesh.material.userData.shader) {
        mesh.material.userData.shader.uniforms.uTime.value = t;
      }
    },
  };
}