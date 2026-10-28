import * as THREE from '../../vendor/three/three.module.js';
import { WORLD } from '../config.js';
import { BUILDINGS, FIELD_RECTS, WORKSHOP, WELL } from './layout.js';
import { toonLambert } from '../render/toon.js';

function inField(x, z, pad = 1.5) {
  for (const f of FIELD_RECTS) {
    const dx = x - f.x, dz = z - f.z;
    const c = Math.cos(f.rot), s = Math.sin(f.rot);
    const lx = dx * c - dz * s;
    const lz = dx * s + dz * c;
    if (Math.abs(lx) < f.w / 2 + pad && Math.abs(lz) < f.d / 2 + pad) return true;
  }
  return false;
}

function inBuilding(x, z, pad = 2) {
  for (const key of ['barn', 'farmhouse']) {
    const b = BUILDINGS[key];
    if (!b) continue;
    const r = Math.max(b.w, b.d) * 0.62 + pad;
    if (Math.hypot(x - b.x, z - b.z) < r) return true;
  }
  if (Math.hypot(x - WORKSHOP.x, z - WORKSHOP.z) < 13) return true;
  if (Math.hypot(x - WELL.x, z - WELL.z) < 4) return true;
  return false;
}

// 散落在地面的低多边形石头：单块、成对、3~6 块成群。
export function buildGroundStones(model, rng, groupCount = 190) {
  const geo = new THREE.DodecahedronGeometry(1, 0);
  const mat = toonLambert({ color: 0xffffff, flatShading: true, shared: false });
  const stones = [];
  const m = new THREE.Matrix4();
  const q = new THREE.Quaternion();
  const e = new THREE.Euler();
  const p = new THREE.Vector3();
  const s = new THREE.Vector3();
  const c = new THREE.Color();

  const colors = [0x8b8d89, 0x747a7b, 0x9a9184, 0x6f746f, 0xa3a49b];

  const addStone = (x, z, scaleMul = 1) => {
    if (Math.abs(x) > WORLD.size * 0.48 || Math.abs(z) > WORLD.size * 0.48) return false;
    if (Math.hypot(x - BUILDINGS.pond.x, z - BUILDINGS.pond.z) < BUILDINGS.pond.r * 1.08) return false;
    if (inField(x, z) || inBuilding(x, z)) return false;

    const base = rng.range(0.22, 0.8) * scaleMul;
    const sx = base * rng.range(0.75, 1.5);
    const sy = base * rng.range(0.55, 1.15);
    const sz = base * rng.range(0.75, 1.5);
    p.set(x, model.heightAt(x, z) + sy * 0.58, z);
    e.set(rng.range(-0.12, 0.12), rng.next() * Math.PI * 2, rng.range(-0.12, 0.12));
    q.setFromEuler(e);
    s.set(sx, sy, sz);
    m.compose(p, q, s);
    stones.push({ matrix: m.clone(), color: colors[Math.floor(rng.next() * colors.length)] });
    return true;
  };

  let guard = 0;
  while (stones.length < groupCount * 3 && guard < groupCount * 30) {
    guard++;
    const ang = rng.next() * Math.PI * 2;
    const rad = 15 + Math.sqrt(rng.next()) * 245;
    const cx = Math.cos(ang) * rad;
    const cz = Math.sin(ang) * rad;
    if (inField(cx, cz) || inBuilding(cx, cz)) continue;

    const pick = rng.next();
    let n = 1;
    if (pick > 0.72) n = 2;
    else if (pick > 0.43) n = 3 + Math.floor(rng.next() * 4);

    for (let i = 0; i < n; i++) {
      const off = rng.next() * Math.PI * 2;
      const rr = n === 1 ? 0 : rng.range(0.5, 2.4);
      const x = cx + Math.cos(off) * rr;
      const z = cz + Math.sin(off) * rr;
      addStone(x, z, i === 0 ? 1.0 : rng.range(0.55, 1.0));
    }
  }

  const mesh = new THREE.InstancedMesh(geo, mat, stones.length);
  mesh.name = 'groundstones';
  mesh.castShadow = true;
  mesh.receiveShadow = true;
  stones.forEach((st, i) => {
    mesh.setMatrixAt(i, st.matrix);
    c.setHex(st.color);
    mesh.setColorAt(i, c);
  });
  mesh.instanceMatrix.needsUpdate = true;
  mesh.count = stones.length;
  if (mesh.instanceColor) mesh.instanceColor.needsUpdate = true;
  return mesh;
}
