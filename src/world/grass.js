import * as THREE from 'three';
import { WORLD } from '../config.js';
import { BUILDINGS } from './layout.js';
import { toonLambert } from '../render/toon.js';
import { makeFbm, smoothstep } from '../util/noise.js';

// 和地形土斑使用同一套噪声，用来降低黄土地上的草密度。
const dirtFbm = makeFbm(777, 3, 2.1, 0.5);
function dirtAmountAt(x, z) {
  return smoothstep(0.47, 0.715, dirtFbm(x * 0.03 + 40, z * 0.03 - 20) * 0.5 + 0.5);
}

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

// 小花：5 片白色花瓣 + 黄色花心；实例色可把整朵染成黄色。
function makeFlowerGeometry() {
  const pos = [], col = [];
  const pushTri = (ax, ay, az, bx, by, bz, cx, cy, cz, color) => {
    pos.push(ax, ay, az, bx, by, bz, cx, cy, cz);
    for (let k = 0; k < 3; k++) col.push(color[0], color[1], color[2]);
  };
  // 短茎：让花头离开地面，避免贴地看不见
  const stem = new THREE.CylinderGeometry(0.008, 0.012, 0.16, 3);
  stem.translate(0, 0.08, 0);
  const sn = stem.toNonIndexed();
  const sa = sn.attributes.position.array;
  for (let i = 0; i < sn.attributes.position.count; i++) {
    pos.push(sa[i * 3], sa[i * 3 + 1], sa[i * 3 + 2]);
    col.push(0.34, 0.54, 0.22);
  }
  stem.dispose(); sn.dispose();

  const y = 0.16;
  const petals = 5;
  for (let i = 0; i < petals; i++) {
    const a = (i / petals) * Math.PI * 2;
    const inner = 0.024, outer = 0.112, half = 0.046;
    pushTri(
      Math.cos(a) * inner, y, Math.sin(a) * inner,
      Math.cos(a - half) * outer, y, Math.sin(a - half) * outer,
      Math.cos(a + half) * outer, y, Math.sin(a + half) * outer,
      [1, 1, 1]
    );
  }
  // 中心黄色小花心
  const segs = 6;
  for (let i = 0; i < segs; i++) {
    const a0 = (i / segs) * Math.PI * 2, a1 = ((i + 1) / segs) * Math.PI * 2;
    pushTri(0, y + 0.002, 0, Math.cos(a0) * 0.032, y + 0.002, Math.sin(a0) * 0.032,
      Math.cos(a1) * 0.032, y + 0.002, Math.sin(a1) * 0.032, [0.98, 0.72, 0.16]);
  }
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
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

  // 以场景半径为 290 的圆盘做抖动网格，覆盖整块可见地形。
  // 不再做坡度/体积筛选，只避开池塘水面和地形边界。
  const R = 290;
  const gridN = Math.ceil(Math.sqrt((count / 4) * 4 / Math.PI)) + 1;
  const cell = (2 * R) / gridN;
  const centers = [];
  for (let gz = 0; gz < gridN; gz++) {
    for (let gx = 0; gx < gridN; gx++) {
      const x = -R + (gx + 0.5) * cell + rng.range(-0.45, 0.45) * cell;
      const z = -R + (gz + 0.5) * cell + rng.range(-0.45, 0.45) * cell;
      if (Math.hypot(x, z) > R) continue;
      const pond = BUILDINGS.pond;
      if (Math.hypot(x - pond.x, z - pond.z) < pond.r * 1.04) continue;
      centers.push({ x, z });
    }
  }

  let i = 0, guard = 0, ci = 0;
  while (i < count && guard < count * 40) {
    guard++;
    let cx, cz;
    if (ci < centers.length) {
      const c = centers[ci++];
      cx = c.x; cz = c.z;
    } else {
      const ang = rng.next() * Math.PI * 2;
      const rad = Math.sqrt(rng.next()) * R;
      cx = Math.cos(ang) * rad; cz = Math.sin(ang) * rad;
    }
    const clusterRadius = rng.range(0.8, 2.0);
    for (let b = 0; b < 4 && i < count; b++) {
      const ca = rng.next() * Math.PI * 2;
      const cr = Math.sqrt(rng.next()) * clusterRadius;
      const x = cx + Math.cos(ca) * cr;
      const z = cz + Math.sin(ca) * cr;
      if (Math.abs(x) > WORLD.size * 0.48 || Math.abs(z) > WORLD.size * 0.48) continue;
      const pond = BUILDINGS.pond;
      if (Math.hypot(x - pond.x, z - pond.z) < pond.r * 1.04) continue;
      const y = model.heightAt(x, z);

      p.set(x, y, z);
      q.setFromAxisAngle(up, rng.next() * Math.PI * 2);
      const pick = rng.next();
      const sc = pick < 0.28 ? rng.range(0.45, 0.72)
               : pick < 0.8 ? rng.range(0.8, 1.15)
               : rng.range(1.25, 1.75);
      // 每簇高矮、宽窄都独立变化，避免一片草同一个尺寸
      s.set(sc * rng.range(0.78, 1.22), sc * rng.range(0.75, 1.5), sc * rng.range(0.78, 1.22));
      m.compose(p, q, s);
      mesh.setMatrixAt(i, m);
      const v = rng.range(0.88, 1.24);
      const warm = rng.range(0.92, 1.08);
      const cool = rng.range(0.80, 0.96);
      tint.setRGB(v * warm, v, v * cool);
      mesh.setColorAt(i, tint);
      i++;
    }
  }
  mesh.count = i;
  mesh.instanceMatrix.needsUpdate = true;

  // 草地里稀疏点缀白/黄小花
  {
    const flowerCount = Math.max(180, Math.round(count * 0.11));
    const flowers = new THREE.InstancedMesh(
      makeFlowerGeometry(),
      new THREE.MeshBasicMaterial({ vertexColors: true, side: THREE.DoubleSide, toneMapped: false }),
      flowerCount
    );
    flowers.name = 'flowers';
    flowers.frustumCulled = true;
    const fm = new THREE.Matrix4();
    const fq = new THREE.Quaternion();
    const fp = new THREE.Vector3();
    const fs = new THREE.Vector3();
    const fc = new THREE.Color();
    let fi = 0;
    for (let k = 0; k < flowerCount; k++) {
      const ang = rng.next() * Math.PI * 2;
      const rad = 12 + Math.sqrt(rng.next()) * 138;
      const x = Math.cos(ang) * rad;
      const z = Math.sin(ang) * rad;
      if (Math.abs(x) > WORLD.size * 0.48 || Math.abs(z) > WORLD.size * 0.48) continue;
      const pond = BUILDINGS.pond;
      if (Math.hypot(x - pond.x, z - pond.z) < pond.r * 1.04) continue;
      // 主要长在绿色草皮上，不落在黄土地上
      if (dirtAmountAt(x, z) > 0.22) continue;
      fp.set(x, model.heightAt(x, z) + 0.02, z);
      fq.setFromAxisAngle(up, rng.next() * Math.PI * 2);
      const sc = rng.range(1.0, 1.8);
      fs.set(sc, sc, sc);
      fm.compose(fp, fq, fs);
      flowers.setMatrixAt(fi, fm);
      if (rng.next() < 0.58) fc.setRGB(1, 1, 1);
      else fc.setRGB(1.28, 1.0, 0.48);
      flowers.setColorAt(fi, fc);
      fi++;
    }
    flowers.count = fi;
    flowers.instanceMatrix.needsUpdate = true;
    if (flowers.instanceColor) flowers.instanceColor.needsUpdate = true;
    mesh.add(flowers);
  }

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