import * as THREE from 'three';
import { toonLambert } from '../render/toon.js';

// 水井：石砌井口 + 木架 + 小坡屋顶 + 吊桶。
// 放在参天大树的木材堆另一侧，尺寸控制在 4 米内，不挡主路。
export function buildWell(model, rng, opts = {}) {
  const group = new THREE.Group();
  group.name = 'well';
  const cx = opts.x ?? 12;
  const cz = opts.z ?? -21;
  const gy = model.heightAt(cx, cz);
  group.position.set(cx, gy, cz);

  const stoneMats = [0x9a9a94, 0x8d8d87, 0xa7a7a0].map((c) =>
    toonLambert({ color: c, flatShading: true, shared: false })
  );
  const woodMat = toonLambert({ color: 0x8a6a44, flatShading: true, shared: false });
  const darkWood = toonLambert({ color: 0x6f5236, flatShading: true, shared: false });
  const roofMat = toonLambert({ color: 0x7a4a38, flatShading: true, shared: false });
  const waterMat = toonLambert({ color: 0x2f5f6a, flatShading: true, shared: false });
  const ropeMat = toonLambert({ color: 0x4a3a28, flatShading: true, shared: false });
  const metalMat = toonLambert({ color: 0x5a5a58, flatShading: true, shared: false });

  // 井壁
  const outer = new THREE.Mesh(
    new THREE.CylinderGeometry(1.55, 1.65, 0.72, 16, 1, true),
    stoneMats[0]
  );
  outer.position.y = 0.36;
  outer.castShadow = true;
  outer.receiveShadow = true;
  group.add(outer);

  const inner = new THREE.Mesh(
    new THREE.CylinderGeometry(1.2, 1.2, 0.72, 16, 1, true),
    stoneMats[1]
  );
  inner.position.y = 0.36;
  inner.material.side = THREE.DoubleSide;
  group.add(inner);

  // 井水
  const water = new THREE.Mesh(new THREE.CircleGeometry(1.12, 16), waterMat);
  water.rotation.x = -Math.PI / 2;
  water.position.y = 0.42;
  group.add(water);

  // 井口石块：高低大小错落
  for (let i = 0; i < 14; i++) {
    const a = (i / 14) * Math.PI * 2 + rng.range(-0.06, 0.06);
    const r = 1.5 + rng.range(-0.06, 0.08);
    const w = rng.range(0.5, 0.72);
    const h = rng.range(0.34, 0.52);
    const d = rng.range(0.38, 0.52);
    const st = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), stoneMats[i % stoneMats.length]);
    st.position.set(Math.cos(a) * r, 0.66 + h * 0.35 + rng.range(-0.04, 0.04), Math.sin(a) * r);
    st.rotation.y = -a + Math.PI / 2 + rng.range(-0.12, 0.12);
    st.rotation.x = rng.range(-0.05, 0.05);
    st.castShadow = true;
    st.receiveShadow = true;
    group.add(st);
  }

  // 两根木柱
  for (const sx of [-1.5, 1.5]) {
    const post = new THREE.Mesh(new THREE.BoxGeometry(0.22, 2.9, 0.22), woodMat);
    post.position.set(sx, 0.7 + 1.45, 0);
    post.castShadow = true;
    group.add(post);
    const brace = new THREE.Mesh(new THREE.BoxGeometry(0.12, 0.55, 0.12), darkWood);
    brace.position.set(sx * 0.86, 0.7 + 0.28, 0);
    brace.rotation.z = sx > 0 ? -0.55 : 0.55;
    group.add(brace);
  }

  // 横梁 + 卷轴
  const beam = new THREE.Mesh(new THREE.BoxGeometry(3.5, 0.2, 0.2), darkWood);
  beam.position.y = 3.35;
  beam.castShadow = true;
  group.add(beam);
  const axle = new THREE.Mesh(new THREE.CylinderGeometry(0.075, 0.075, 3.1, 6), metalMat);
  axle.rotation.z = Math.PI / 2;
  axle.position.y = 2.55;
  group.add(axle);

  // 摇柄
  const crank = new THREE.Mesh(new THREE.BoxGeometry(0.5, 0.09, 0.09), darkWood);
  crank.position.set(1.72, 2.55, 0.28);
  crank.rotation.y = Math.PI / 2;
  group.add(crank);
  const knob = new THREE.Mesh(new THREE.CylinderGeometry(0.07, 0.07, 0.24, 6), woodMat);
  knob.rotation.z = Math.PI / 2;
  knob.position.set(1.72, 2.55, 0.62);
  group.add(knob);

  // 四坡小屋顶
  const roof = new THREE.Mesh(new THREE.ConeGeometry(2.55, 1.35, 4), roofMat);
  roof.position.y = 4.0;
  roof.rotation.y = Math.PI / 4;
  roof.castShadow = true;
  group.add(roof);
  const finial = new THREE.Mesh(new THREE.BoxGeometry(0.16, 0.3, 0.16), darkWood);
  finial.position.y = 4.72;
  group.add(finial);

  // 屋顶下挂一盏小灯
  const lampGlowMat = new THREE.MeshBasicMaterial({
    color: 0xffd39a, transparent: true, opacity: 0, side: THREE.DoubleSide, depthWrite: false,
  });
  const lampFrameMat = toonLambert({ color: 0x3a3a38, flatShading: true, shared: false });
  const lampGroup = new THREE.Group();
  lampGroup.position.set(0, 3.02, 0);
  const chain = new THREE.Mesh(new THREE.CylinderGeometry(0.012, 0.012, 0.42, 4), lampFrameMat);
  chain.position.y = 0.24;
  lampGroup.add(chain);
  const cap = new THREE.Mesh(new THREE.BoxGeometry(0.34, 0.08, 0.34), lampFrameMat);
  cap.position.y = 0.03;
  lampGroup.add(cap);
  const glass = new THREE.Mesh(new THREE.BoxGeometry(0.22, 0.28, 0.22), lampGlowMat);
  glass.position.y = -0.14;
  lampGroup.add(glass);
  const bottom = new THREE.Mesh(new THREE.BoxGeometry(0.3, 0.06, 0.3), lampFrameMat);
  bottom.position.y = -0.31;
  lampGroup.add(bottom);
  group.add(lampGroup);

  const lampLight = new THREE.PointLight(0xffc080, 0, 9, 2);
  lampLight.position.set(0, 3.0, 0);
  group.add(lampLight);

  group.userData.setNight = (t) => {
    const k = Math.max(0, Math.min(1, (t - 0.72) / 0.23));
    const w = k * k * (3 - 2 * k);
    lampGlowMat.opacity = w * 0.95;
    lampGroup.visible = w > 0.04;
    lampLight.intensity = w * 12;
    lampLight.visible = w > 0.04;
  };
  group.userData.setNight(0);

  // 吊绳 + 木桶
  const rope = new THREE.Mesh(new THREE.CylinderGeometry(0.018, 0.018, 1.45, 4), ropeMat);
  rope.position.set(0.35, 1.82, 0);
  group.add(rope);
  const bucket = new THREE.Mesh(new THREE.CylinderGeometry(0.26, 0.21, 0.38, 8, 1, true), woodMat);
  bucket.position.set(0.35, 1.05, 0);
  bucket.castShadow = true;
  group.add(bucket);
  const bucketBottom = new THREE.Mesh(new THREE.CircleGeometry(0.21, 8), darkWood);
  bucketBottom.rotation.x = Math.PI / 2;
  bucketBottom.position.set(0.35, 0.86, 0);
  group.add(bucketBottom);
  const handle = new THREE.Mesh(new THREE.TorusGeometry(0.24, 0.025, 5, 10, Math.PI), metalMat);
  handle.position.set(0.35, 1.24, 0);
  handle.rotation.z = Math.PI;
  group.add(handle);

  group.castShadow = true;
  return group;
}
