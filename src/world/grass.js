import * as THREE from 'three';
import { WORLD } from '../config.js';
import { BUILDINGS } from './layout.js';
import { toonLambert } from '../render/toon.js';

// 一簇草 = 6 片交叉的锥形草叶。
// 几何体共享，每簇通过实例矩阵（旋转/缩放）和 instanceColor 产生差异。
function makeClumpGeometry() {
  const positions = [];
  const normals = [];
  const colors = [];
  const BLADES = 7;

  for (let b = 0; b < BLADES; b++) {
    const h = 0.34 + ((b * 37) % 7) / 7 * 0.32;      // 0.34~0.66
    const radius = 0.085 + ((b * 19) % 5) / 5 * 0.035; // 0.085~0.12
    const g = new THREE.ConeGeometry(radius, h, 3, 1, true);
    g.translate(0, h / 2, 0);

    const yaw = (b / BLADES) * Math.PI * 2 + ((b * 13) % 5) * 0.08;
    const tilt = 0.32 + ((b * 23) % 6) / 6 * 0.38;   // 18~40°，向外摊开
    const spread = 0.04 + ((b * 17) % 5) / 5 * 0.10; // 叶根略微散开
    const m = new THREE.Matrix4().makeRotationY(yaw);
    m.multiply(new THREE.Matrix4().makeRotationZ(tilt));
    g.applyMatrix4(m);
    g.translate(Math.cos(yaw) * spread, 0, Math.sin(yaw) * spread);

    const n = g.toNonIndexed();
    const pa = n.attributes.position.array;
    const na = n.attributes.normal.array;
    for (let i = 0; i < n.attributes.position.count; i++) {
      const x = pa[i * 3];
      const y = pa[i * 3 + 1];
      const z = pa[i * 3 + 2];
      positions.push(x, y, z);
      normals.push(na[i * 3], na[i * 3 + 1], na[i * 3 + 2]);
      // 草叶根部压暗，叶尖提亮；整簇共享同一套渐变
      const t = Math.min(1, Math.max(0, y / h));
      const f = 0.54 + 0.46 * t;
      colors.push(f, f, f);
    }
    g.dispose();
    n.dispose();
  }

  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
  geo.setAttribute('normal', new THREE.Float32BufferAttribute(normals, 3));
  geo.setAttribute('color', new THREE.Float32BufferAttribute(colors, 3));
  geo.computeBoundingSphere();
  return geo;
}

// 近景草丛：实例化的小草丛，边缘有毛茸茸的草尖。
export function buildGrassTufts(model, rng, count = 2600) {
  const geo = makeClumpGeometry();

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
    // 草丛在高频细节上仍然很细，远处投影后容易变成碎点；
    // 按相机距离逐渐透明，超过 220 单位完全消失。
    shader.fragmentShader = shader.fragmentShader.replace(
      '#include <dithering_fragment>',
      `#include <dithering_fragment>
       float camDist = length(vViewPosition);\
       float fade = 1.0 - smoothstep(130.0, 220.0, camDist);
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

  // 近景 20~52 单位占 58%，面积密度约提升 2.4 倍；
  // 其余仍然覆盖 50~168，远处交给距离淡出。
  const nearCount = Math.floor(count * 0.58);

  let i = 0, guard = 0;
  while (i < count && guard < count * 20) {
    guard++;
    const ang = rng.next() * Math.PI * 2;
    const near = i < nearCount;
    const rad = near
      ? 20 + Math.sqrt(rng.next()) * 32
      : 50 + Math.sqrt(rng.next()) * 118;
    const x = Math.cos(ang) * rad;
    const z = Math.sin(ang) * rad;
    if (Math.abs(x) > WORLD.size * 0.45 || Math.abs(z) > WORLD.size * 0.45) continue;
    // 水里不长草：池塘范围直接跳过
    const pond = BUILDINGS.pond;
    if (Math.hypot(x - pond.x, z - pond.z) < pond.r * 1.04) continue;
    const y = model.heightAt(x, z);
    if (model.slopeAt(x, z) > 0.7) continue;
    p.set(x, y, z);
    q.setFromAxisAngle(up, rng.next() * Math.PI * 2);
    const sc = rng.range(0.6, 1.6);
    s.set(sc, sc * rng.range(0.8, 1.5), sc);
    m.compose(p, q, s);
    mesh.setMatrixAt(i, m);

    // 每簇独立色差：亮度 + 轻微冷暖偏移，保留整体草色
    const v = rng.range(0.78, 1.14);
    tint.setRGB(
      Math.min(1, v * rng.range(0.92, 1.05)),
      Math.min(1, v),
      Math.min(1, v * rng.range(0.76, 0.92))
    );
    mesh.setColorAt(i, tint);
    i++;
  }
  mesh.count = i;
  mesh.instanceMatrix.needsUpdate = true;
  if (mesh.instanceColor) mesh.instanceColor.needsUpdate = true;

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
