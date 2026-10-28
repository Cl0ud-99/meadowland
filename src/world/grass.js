import * as THREE from 'three';
import { WORLD } from '../config.js';
import { BUILDINGS } from './layout.js';
import { toonLambert } from '../render/toon.js';

// 近景草丛：只在台地附近撒，用实例化的小三角片，保证治愈的"毛茸茸"边缘
export function buildGrassTufts(model, rng, count = 2600) {
  const blade = new THREE.ConeGeometry(0.16, 0.9, 3);
  blade.translate(0, 0.45, 0);

  const geo = new THREE.BufferGeometry();
  const src = blade.toNonIndexed();
  geo.setAttribute('position', src.attributes.position);
  geo.setAttribute('normal', src.attributes.normal);

  // shared:false —— 下面覆盖 onBeforeCompile 挂风摆，且 main.js 每季改 color
  const mat = toonLambert({
    color: 0x8fbe5e,
    flatShading: true,
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

  let i = 0, guard = 0;
  while (i < count && guard < count * 20) {
    guard++;
    const ang = rng.next() * Math.PI * 2;
    const rad = 20 + Math.sqrt(rng.next()) * 150;
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
    mesh.setMatrixAt(i++, m);
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