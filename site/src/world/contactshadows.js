import * as THREE from '../../vendor/three/three.module.js';

// 接触阴影：贴在物体脚下的半透明暗斑，用来把建筑/树/围栏“压”回地面。
// 全部用 InstancedMesh，避免为每棵树/每段围栏增加 draw call。

function radialTexture() {
  const cv = document.createElement('canvas');
  cv.width = cv.height = 128;
  const ctx = cv.getContext('2d');
  const g = ctx.createRadialGradient(64, 64, 0, 64, 64, 64);
  g.addColorStop(0, 'rgba(0,0,0,0.64)');
  g.addColorStop(0.45, 'rgba(0,0,0,0.36)');
  g.addColorStop(0.78, 'rgba(0,0,0,0.13)');
  g.addColorStop(1, 'rgba(0,0,0,0)');
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, 128, 128);
  const tex = new THREE.CanvasTexture(cv);
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}

function stripTexture() {
  const cv = document.createElement('canvas');
  cv.width = 16;
  cv.height = 64;
  const ctx = cv.getContext('2d');
  for (let y = 0; y < 64; y++) {
    const d = Math.abs(y / 63 - 0.5) * 2;
    const a = Math.max(0, 1 - d * d);
    ctx.fillStyle = `rgba(0,0,0,${0.42 * a})`;
    ctx.fillRect(0, y, 16, 1);
  }
  const tex = new THREE.CanvasTexture(cv);
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}

export function buildContactShadows(model, opts = {}) {
  const group = new THREE.Group();
  group.name = 'contactShadows';

  const planeGeo = new THREE.PlaneGeometry(1, 1);
  planeGeo.rotateX(-Math.PI / 2);

  const discMat = new THREE.MeshBasicMaterial({
    map: radialTexture(),
    transparent: true,
    opacity: 0.54,
    depthWrite: false,
    color: 0x1c2a16,
    polygonOffset: true,
    polygonOffsetFactor: -2,
    polygonOffsetUnits: -2,
    side: THREE.DoubleSide,
  });

  const discs = [];

  // 建筑/大物件：x,z 是中心，sx/sz 是阴影长宽
  for (const b of opts.buildings || []) {
    discs.push({
      x: b.x, z: b.z,
      sx: b.sx ?? 8, sz: b.sz ?? 8,
      rot: b.rot || 0,
    });
  }

  // 树根：点状接触阴影
  for (const tr of opts.trees || []) {
    discs.push({ x: tr.x, z: tr.z, sx: tr.sx ?? 2.8, sz: tr.sz ?? 2.8, rot: 0 });
  }

  // 围栏脚边：沿每段围栏铺一条软边暗带
  for (const slot of opts.fences || []) {
    const pts = slot.points;
    if (!Array.isArray(pts) || pts.length < 2) continue;
    for (let i = 0; i < pts.length; i++) {
      const [ax, az] = pts[i];
      const [bx, bz] = pts[(i + 1) % pts.length];
      const dx = bx - ax, dz = bz - az;
      const len = Math.hypot(dx, dz);
      if (len < 0.1) continue;
      const n = Math.max(1, Math.round(len / 2.4));
      for (let k = 0; k <= n; k++) {
        const t = k / n;
        discs.push({
          x: ax + dx * t,
          z: az + dz * t,
          sx: 1.15,
          sz: 1.0,
          rot: Math.atan2(dx, dz),
        });
      }
    }
  }

  const m = new THREE.Matrix4();
  const q = new THREE.Quaternion();
  const p = new THREE.Vector3();
  const s = new THREE.Vector3();

  if (discs.length) {
    const im = new THREE.InstancedMesh(planeGeo, discMat, discs.length);
    im.name = 'contactDiscs';
    discs.forEach((d, i) => {
      p.set(d.x, model.heightAt(d.x, d.z) + 0.035, d.z);
      q.setFromAxisAngle(new THREE.Vector3(0, 1, 0), d.rot);
      s.set(d.sx * 0.90, 1, d.sz * 0.90);
      m.compose(p, q, s);
      im.setMatrixAt(i, m);
    });
    im.instanceMatrix.needsUpdate = true;
    im.renderOrder = 1;
    group.add(im);
  }

  // 核心接触斑：在同样位置再压一层更小的暗斑，强化"根部接触"
  if (discs.length) {
    const coreMat = discMat.clone();
    coreMat.opacity = 0.42;
    const core = new THREE.InstancedMesh(planeGeo, coreMat, discs.length);
    core.name = 'contactCores';
    discs.forEach((d, i) => {
      p.set(d.x, model.heightAt(d.x, d.z) + 0.04, d.z);
      q.setFromAxisAngle(new THREE.Vector3(0, 1, 0), d.rot);
      s.set(d.sx * 0.50, 1, d.sz * 0.50);
      m.compose(p, q, s);
      core.setMatrixAt(i, m);
    });
    core.instanceMatrix.needsUpdate = true;
    core.renderOrder = 2;
    group.add(core);
  }

  return group;
}
