import * as THREE from '../../vendor/three/three.module.js';
import { PALETTE, WORLD } from '../config.js';
import { toonLambert } from '../render/toon.js';

// ---------------------------------------------------------------------------
// 车道：沿 CatmullRom 曲线生成一条贴地的带状网格（而不是平面贴图），
// 这样在起伏地形上也不会穿模
// ---------------------------------------------------------------------------

export function buildRoad(model, points, width = 5.5) {
  const curve = new THREE.CatmullRomCurve3(
    points.map(([x, z]) => new THREE.Vector3(x, 0, z)),
    false,
    'catmullrom',
    0.35
  );

  const SEG = 160;
  const positions = [];
  const indices = [];
  const uvs = [];

  const p = new THREE.Vector3();
  const tan = new THREE.Vector3();

  for (let i = 0; i <= SEG; i++) {
    const t = i / SEG;
    curve.getPointAt(t, p);
    curve.getTangentAt(t, tan);
    const nx = -tan.z, nz = tan.x;
    const len = Math.hypot(nx, nz) || 1;

    const halfW = width / 2;
    const lx = p.x + (nx / len) * halfW;
    const lz = p.z + (nz / len) * halfW;
    const rx = p.x - (nx / len) * halfW;
    const rz = p.z - (nz / len) * halfW;

    positions.push(lx, model.heightAt(lx, lz) + WORLD.roadY, lz);
    positions.push(rx, model.heightAt(rx, rz) + WORLD.roadY, rz);
    uvs.push(0, t * 30, 1, t * 30);

    if (i < SEG) {
      const a = i * 2;
      indices.push(a, a + 1, a + 2, a + 1, a + 3, a + 2);
    }
  }

  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
  geo.setAttribute('uv', new THREE.Float32BufferAttribute(uvs, 2));
  geo.setIndex(indices);
  geo.computeVertexNormals();

  const mat = toonLambert({
    color: PALETTE.roadAsphalt,
    polygonOffset: true,
    polygonOffsetFactor: -2,
    polygonOffsetUnits: -2,
  });
  const mesh = new THREE.Mesh(geo, mat);
  mesh.name = 'road';
  mesh.receiveShadow = true;

  // 中线
  const lineGeo = new THREE.BufferGeometry();
  const lpos = [];
  const lindices = [];
  for (let i = 0; i <= SEG; i++) {
    const t = i / SEG;
    curve.getPointAt(t, p);
    curve.getTangentAt(t, tan);
    const nx = -tan.z, nz = tan.x;
    const len = Math.hypot(nx, nz) || 1;
    const hw = 0.16;
    const lx = p.x + (nx / len) * hw;
    const lz = p.z + (nz / len) * hw;
    const rx = p.x - (nx / len) * hw;
    const rz = p.z - (nz / len) * hw;
    lpos.push(lx, model.heightAt(lx, lz) + WORLD.roadY + 0.04, lz);
    lpos.push(rx, model.heightAt(rx, rz) + WORLD.roadY + 0.04, rz);
    if (i < SEG) {
      const a = i * 2;
      lindices.push(a, a + 1, a + 2, a + 1, a + 3, a + 2);
    }
  }
  lineGeo.setAttribute('position', new THREE.Float32BufferAttribute(lpos, 3));
  lineGeo.setIndex(lindices);
  lineGeo.computeVertexNormals();
  const lineMesh = new THREE.Mesh(
    lineGeo,
    toonLambert({
      color: PALETTE.roadLine,
      polygonOffset: true,
      polygonOffsetFactor: -4,
      polygonOffsetUnits: -4,
    })
  );

  const group = new THREE.Group();
  group.name = 'roadGroup';
  group.add(mesh, lineMesh);
  group.userData.curve = curve;
  return group;
}

// 沿道路行驶的车（简单的盒子车）
export function buildCar(model, curve, offset = 0) {
  const group = new THREE.Group();
  group.name = 'car';

  const body = new THREE.Mesh(
    new THREE.BoxGeometry(2.0, 0.9, 4.0),
    toonLambert({ color: 0xc9573f, flatShading: true })
  );
  body.position.y = 0.95;
  body.castShadow = true;

  const cabin = new THREE.Mesh(
    new THREE.BoxGeometry(1.75, 0.85, 1.9),
    toonLambert({ color: 0x9fc4d8, flatShading: true })
  );
  cabin.position.set(0, 1.75, -0.15);
  cabin.castShadow = true;

  const wheelGeo = new THREE.CylinderGeometry(0.45, 0.45, 0.32, 8);
  wheelGeo.rotateZ(Math.PI / 2);
  const wheelMat = toonLambert({ color: 0x2e2b28 });
  for (const [wx, wz] of [[-0.95, 1.3], [0.95, 1.3], [-0.95, -1.3], [0.95, -1.3]]) {
    const w = new THREE.Mesh(wheelGeo, wheelMat);
    w.position.set(wx, 0.45, wz);
    group.add(w);
  }

  group.add(body, cabin);
  group.userData = { curve, t: offset, speed: 0.00022 };

  const p = new THREE.Vector3();
  const tan = new THREE.Vector3();
  group.userData.update = (dt) => {
    group.userData.t = (group.userData.t + dt * group.userData.speed) % 1;
    const t = group.userData.t;
    curve.getPointAt(t, p);
    curve.getTangentAt(t, tan);
    group.position.set(p.x, model.heightAt(p.x, p.z) + 0.1, p.z);
    group.rotation.y = Math.atan2(tan.x, tan.z);
  };
  return group;
}