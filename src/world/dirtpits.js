import * as THREE from 'three';
import { PASTURE, HORSE_PASTURE, COOP } from './layout.js';
import { toonLambert } from '../render/toon.js';
import { pointInPolygon, distToPolygonEdge } from '../util/poly.js';
import { makeFbm, smoothstep } from '../util/noise.js';

const dirtFbm = makeFbm(777, 3, 2.1, 0.5);
function dirtAmountAt(x, z) {
  return smoothstep(0.47, 0.715, dirtFbm(x * 0.03 + 40, z * 0.03 - 20) * 0.5 + 0.5);
}

function makePatch(model, cx, cz, radius, seed) {
  const segs = 14;
  const pos = [], col = [], idx = [];
  const ringVals = [0.52, 1.0, 1.18];
  const ringOff = [0.02, 0.035, 0.075];
  const ringCol = [
    [0.22, 0.14, 0.09],
    [0.36, 0.24, 0.15],
    [0.50, 0.36, 0.23],
  ];
  pos.push(cx, model.heightAt(cx, cz) + 0.025, cz);
  col.push(0.16, 0.10, 0.06);

  for (let ri = 0; ri < ringVals.length; ri++) {
    for (let i = 0; i < segs; i++) {
      const a = (i / segs) * Math.PI * 2;
      const wobble = 1 + Math.sin(a * 3 + seed) * 0.13 + Math.sin(a * 5 + seed * 2.1) * 0.07;
      const rr = radius * ringVals[ri] * wobble;
      const x = cx + Math.cos(a) * rr;
      const z = cz + Math.sin(a) * rr;
      pos.push(x, model.heightAt(x, z) + ringOff[ri], z);
      const c = ringCol[ri];
      col.push(c[0], c[1], c[2]);
    }
  }

  for (let i = 0; i < segs; i++) {
    const n = (i + 1) % segs;
    idx.push(0, 1 + n, 1 + i);
  }
  for (let ri = 0; ri < ringVals.length - 1; ri++) {
    const a = 1 + ri * segs;
    const b = 1 + (ri + 1) * segs;
    for (let i = 0; i < segs; i++) {
      const n = (i + 1) % segs;
      idx.push(a + i, a + n, b + i);
      idx.push(b + i, a + n, b + n);
    }
  }

  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  geo.setAttribute('color', new THREE.Float32BufferAttribute(col, 3));
  geo.setIndex(idx);
  geo.computeVertexNormals();
  return geo;
}

// 动物圈里的刨土坑：不规则泥色斑块 + 周围翻出的土块。
export function buildDirtPits(model, rng, count = 20) {
  const group = new THREE.Group();
  group.name = 'dirt-pits';
  const mat = toonLambert({
    color: 0xffffff,
    vertexColors: true,
    flatShading: true,
    side: THREE.DoubleSide,
    shared: false,
    polygonOffset: true,
    polygonOffsetFactor: -2,
    polygonOffsetUnits: -2,
  });
  // 固定配额：牛圈/羊驼圈为主，鸡舍少量，避免全都抽到同一块牧场。
  const qPasture = count >= 15 ? 8 : 4;
  const qHorse = count >= 15 ? 8 : 4;
  const clods = [];
  const clodCols = [0x4a3020, 0x6e4a2e, 0x8a6242, 0x3a2618];

  for (let n = 0; n < count; n++) {
    const poly = n < qPasture ? PASTURE : n < qPasture + qHorse ? HORSE_PASTURE : COOP;
    let best = null, bestDirt = -1;
    // 优先在黄土地里落坑，最多尝试 30 次
    for (let k = 0; k < 30; k++) {
      const xs = poly.map((p) => p[0]), zs = poly.map((p) => p[1]);
      const x = rng.range(Math.min(...xs) + 2, Math.max(...xs) - 2);
      const z = rng.range(Math.min(...zs) + 2, Math.max(...zs) - 2);
      if (!pointInPolygon(x, z, poly)) continue;
      if (distToPolygonEdge(x, z, poly) < 2.2) continue;
      const d = dirtAmountAt(x, z);
      if (d > bestDirt) { bestDirt = d; best = { x, z }; }
      if (d > 0.28) break;
    }
    if (!best) continue;

    const cluster = 1 + Math.floor(rng.next() * 3);
    for (let c = 0; c < cluster; c++) {
      const a = rng.next() * Math.PI * 2;
      const off = c === 0 ? 0 : rng.range(0.45, 1.8);
      const cx = best.x + Math.cos(a) * off;
      const cz = best.z + Math.sin(a) * off;
      if (!pointInPolygon(cx, cz, poly) || distToPolygonEdge(cx, cz, poly) < 1.2) continue;
      const radius = rng.range(0.38, 1.15) * (c === 0 ? 1.15 : 0.9);
      const mesh = new THREE.Mesh(makePatch(model, cx, cz, radius, rng.next() * 10), mat);
      mesh.receiveShadow = true;
      mesh.name = 'dirt-pit';
      group.add(mesh);

      // 坑边翻出的土块，沿不规则边缘随机散布
      const lumps = 2 + Math.floor(rng.next() * 4);
      for (let j = 0; j < lumps; j++) {
        const aa = rng.next() * Math.PI * 2;
        const rr = radius * rng.range(0.75, 1.25);
        const x = cx + Math.cos(aa) * rr;
        const z = cz + Math.sin(aa) * rr;
        const sx = rng.range(0.06, 0.2);
        const sy = rng.range(0.04, 0.12);
        const sz = rng.range(0.06, 0.2);
        const y = model.heightAt(x, z) + sy * 0.55;
        clods.push({ x, y, z, sx, sy, sz, rot: rng.next() * Math.PI * 2, color: clodCols[Math.floor(rng.next() * clodCols.length)] });
      }
    }
  }

  if (clods.length) {
    const clodGeo = new THREE.DodecahedronGeometry(1, 0);
    const clodMat = toonLambert({ color: 0xffffff, flatShading: true, shared: false });
    const cm = new THREE.InstancedMesh(clodGeo, clodMat, clods.length);
    cm.name = 'dirt-clods';
    cm.castShadow = true;
    const m = new THREE.Matrix4(), q = new THREE.Quaternion(), p = new THREE.Vector3(), s = new THREE.Vector3();
    const up = new THREE.Vector3(0, 1, 0);
    const c2 = new THREE.Color();
    clods.forEach((cl, i) => {
      q.setFromAxisAngle(up, cl.rot);
      p.set(cl.x, cl.y, cl.z);
      s.set(cl.sx, cl.sy, cl.sz);
      m.compose(p, q, s);
      cm.setMatrixAt(i, m);
      c2.setHex(cl.color);
      cm.setColorAt(i, c2);
    });
    cm.instanceMatrix.needsUpdate = true;
    if (cm.instanceColor) cm.instanceColor.needsUpdate = true;
    group.add(cm);
  }
  return group;
}
