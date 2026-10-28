import * as THREE from '../../vendor/three/three.module.js';
import { toonLambert } from '../render/toon.js';

// 池塘石圈：参考图里那种大小/高低错落的圆石，围着水线摆一圈。
// 石头单独成组，方便以后调数量、尺寸或做交互。
export function buildPondStones(model, center, radius, rng, waterY) {
  const group = new THREE.Group();
  group.name = 'pondStones';

  // 几种低模圆石，随机挑，避免一圈看起来是同一个模型
  const geos = [
    new THREE.DodecahedronGeometry(1, 0),
    new THREE.IcosahedronGeometry(1, 0),
    new THREE.DodecahedronGeometry(1, 0),
  ];

  const stoneMat = toonLambert({ color: 0xb9bec3, flatShading: true, shared: false });
  const bigMat = toonLambert({ color: 0xaeb4ba, flatShading: true, shared: false });

  // 水车在池塘西侧，留一个缺口，避免石头穿进水车轮
  const wheel = { x: -93, z: 2 };

  const count = 38;
  for (let i = 0; i < count; i++) {
    const a = (i / count) * Math.PI * 2 + rng.range(-0.055, 0.055);
    const big = i % 6 === 2 || i % 11 === 0;
    const scale = big ? rng.range(1.25, 1.85) : rng.range(0.52, 1.05);
    const rr = radius * (big ? rng.range(0.995, 1.045) : rng.range(0.975, 1.02));

    const x = center.x + Math.cos(a) * rr;
    const z = center.z + Math.sin(a) * rr;
    if (Math.hypot(x - wheel.x, z - wheel.z) < 4.0) continue;

    const g = geos[i % geos.length];
    const mesh = new THREE.Mesh(g, big ? bigMat : stoneMat);
    const sy = scale * rng.range(0.52, 0.78);
    mesh.scale.set(scale * rng.range(0.9, 1.25), sy, scale * rng.range(0.9, 1.25));
    mesh.rotation.set(rng.range(-0.18, 0.18), rng.range(0, Math.PI * 2), rng.range(-0.14, 0.14));

    const ground = model.heightAt(x, z);
    const base = Math.max(ground, waterY - 0.18);
    mesh.position.set(x, base + sy * 0.48, z);
    mesh.castShadow = true;
    mesh.receiveShadow = true;
    mesh.name = big ? 'pond-stone-big' : 'pond-stone';
    group.add(mesh);
  }

  // 补一些小石子，填主石之间的缝，让边缘更像参考图
  for (let i = 0; i < 14; i++) {
    const a = rng.next() * Math.PI * 2;
    const rr = radius * rng.range(0.982, 1.03);
    const x = center.x + Math.cos(a) * rr;
    const z = center.z + Math.sin(a) * rr;
    if (Math.hypot(x - wheel.x, z - wheel.z) < 4.0) continue;
    const mesh = new THREE.Mesh(geos[i % geos.length], stoneMat);
    const s = rng.range(0.24, 0.46);
    mesh.scale.set(s * 1.2, s * 0.55, s * 1.1);
    mesh.rotation.y = rng.range(0, Math.PI * 2);
    const base = Math.max(model.heightAt(x, z), waterY - 0.18);
    mesh.position.set(x, base + s * 0.28, z);
    mesh.castShadow = true;
    mesh.receiveShadow = true;
    mesh.name = 'pond-pebble';
    group.add(mesh);
  }

  return group;
}
