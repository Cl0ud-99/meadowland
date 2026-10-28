import * as THREE from 'three';
import { toonLambert } from '../render/toon.js';

// 右侧果园：苹果/樱花树 + 半圈矮栅栏 + 蜂箱 + 野餐毯，风车脚下补花坛。
// 树交给 extraTrees 容器，这样季节换色/描边沿用现有逻辑；
// 其余小物件放 independent group，避免被当成树去描边。

function box(w, h, d, color, mat) {
  return new THREE.Mesh(
    new THREE.BoxGeometry(w, h, d),
    mat || toonLambert({ color, flatShading: true, shared: false })
  );
}

function makeFenceSegment(model, ax, az, bx, bz, mat) {
  const g = new THREE.Group();
  const len = Math.hypot(bx - ax, bz - az);
  const n = Math.max(1, Math.round(len / 2.2));
  const posts = [];
  for (let i = 0; i <= n; i++) {
    const t = i / n;
    const x = ax + (bx - ax) * t;
    const z = az + (bz - az) * t;
    const y = model.heightAt(x, z);
    const p = box(0.16, 1.0, 0.16, 0x8a6a44, mat);
    p.position.set(x, y + 0.5, z);
    p.castShadow = true;
    g.add(p);
    posts.push({ x, z, y });
  }
  for (let i = 0; i < n; i++) {
    const a = posts[i], b = posts[i + 1];
    const l = Math.hypot(b.x - a.x, b.z - a.z);
    for (const hy of [0.42, 0.72]) {
      const rail = box(0.09, 0.09, l, 0x8a6a44, mat);
      rail.position.set((a.x + b.x) / 2, (a.y + b.y) / 2 + hy, (a.z + b.z) / 2);
      rail.rotation.y = Math.atan2(b.x - a.x, b.z - a.z);
      rail.castShadow = true;
      g.add(rail);
    }
  }
  return g;
}

function makeHive(model, x, z, rot, mat, roofMat) {
  const g = new THREE.Group();
  const y = model.heightAt(x, z);
  const base = box(1.3, 0.12, 1.1, 0x6f5236, mat);
  base.position.set(0, 0.06, 0);
  g.add(base);
  const body = box(1.15, 0.78, 0.95, 0xc9a26a, mat);
  body.position.set(0, 0.5, 0);
  body.castShadow = true;
  g.add(body);
  const roof = box(1.38, 0.14, 1.16, 0x6f5236, roofMat);
  roof.position.set(0, 0.96, 0);
  roof.castShadow = true;
  g.add(roof);
  const door = box(0.34, 0.16, 0.05, 0x3a2a1a, mat);
  door.position.set(0, 0.5, 0.49);
  g.add(door);
  const landing = box(0.5, 0.06, 0.26, 0x8a6a44, mat);
  landing.position.set(0, 0.36, 0.62);
  g.add(landing);
  g.position.set(x, y, z);
  g.rotation.y = rot;
  return g;
}

function makePicnic(model, x, z) {
  const g = new THREE.Group();
  const y = model.heightAt(x, z);
  g.position.set(x, y, z);

  // 红白格野餐毯
  const cv = document.createElement('canvas');
  cv.width = cv.height = 128;
  const ctx = cv.getContext('2d');
  const cells = 8, s = cv.width / cells;
  for (let iy = 0; iy < cells; iy++) {
    for (let ix = 0; ix < cells; ix++) {
      ctx.fillStyle = (ix + iy) % 2 ? '#c94b3f' : '#f2e3c8';
      ctx.fillRect(ix * s, iy * s, s, s);
    }
  }
  const tex = new THREE.CanvasTexture(cv);
  tex.colorSpace = THREE.SRGBColorSpace;
  const blanket = new THREE.Mesh(
    new THREE.PlaneGeometry(5.0, 3.8),
    toonLambert({ map: tex, shared: false, polygonOffset: true, polygonOffsetFactor: -1, polygonOffsetUnits: -1 })
  );
  blanket.rotation.x = -Math.PI / 2;
  blanket.position.y = 0.025;
  blanket.receiveShadow = true;
  g.add(blanket);

  // 篮子
  const wood = toonLambert({ color: 0xb98a52, flatShading: true, shared: false });
  const basket = box(1.2, 0.62, 0.8, 0xb98a52, wood);
  basket.position.set(0.2, 0.34, -0.2);
  basket.castShadow = true;
  g.add(basket);
  const handle = new THREE.Mesh(
    new THREE.TorusGeometry(0.38, 0.055, 6, 12, Math.PI),
    toonLambert({ color: 0x8a5f30, flatShading: true, shared: false })
  );
  handle.position.set(0.2, 0.65, -0.2);
  handle.rotation.x = Math.PI / 2;
  g.add(handle);

  // 苹果
  const appleMat = toonLambert({ color: 0xc8402e, flatShading: true, shared: false });
  for (let i = 0; i < 4; i++) {
    const a = new THREE.Mesh(new THREE.DodecahedronGeometry(0.14, 0), appleMat);
    a.position.set(-0.15 + i * 0.18, 0.7 + (i % 2) * 0.05, -0.2 + (i % 3) * 0.06);
    a.castShadow = true;
    g.add(a);
  }

  // 两个盘子
  const plateMat = toonLambert({ color: 0xf2ead8, flatShading: true, shared: false });
  for (const [px, pz] of [[-1.4, 0.5], [1.4, 0.6]]) {
    const plate = new THREE.Mesh(new THREE.CylinderGeometry(0.24, 0.22, 0.04, 10), plateMat);
    plate.position.set(px, 0.04, pz);
    plate.receiveShadow = true;
    g.add(plate);
  }

  return g;
}

function makeFlowerBed(model, cx, cz, count, rng, mats) {
  const g = new THREE.Group();
  const stemMat = toonLambert({ color: 0x4f7a3a, flatShading: true, shared: false });
  for (let i = 0; i < count; i++) {
    const a = rng.next() * Math.PI * 2;
    const r = Math.sqrt(rng.next()) * 2.6;
    const x = cx + Math.cos(a) * r;
    const z = cz + Math.sin(a) * r;
    const y = model.heightAt(x, z);
    const h = rng.range(0.26, 0.42);
    const stem = new THREE.Mesh(new THREE.CylinderGeometry(0.018, 0.024, h, 3), stemMat);
    stem.position.set(x, y + h / 2, z);
    g.add(stem);
    const bloom = new THREE.Mesh(new THREE.DodecahedronGeometry(rng.range(0.09, 0.14), 0), mats[i % mats.length]);
    bloom.position.set(x, y + h + 0.04, z);
    bloom.scale.y = 0.8;
    g.add(bloom);
  }
  return g;
}

export function buildOrchard(model, rng, buildTree, treeGroup) {
  const props = new THREE.Group();
  props.name = 'orchard';

  // 3×3 果树，中间留空做野餐草坪
  const xs = [60, 68, 76];
  const zs = [-4, 4, 12];
  for (let zi = 0; zi < zs.length; zi++) {
    for (let xi = 0; xi < xs.length; xi++) {
      if (zi === 1 && xi === 1) continue; // 中间空地
      const kind = (zi * 3 + xi) % 5 === 0 ? 'blossom' : 'apple';
      const scale = rng.range(0.92, 1.08);
      treeGroup.add(buildTree(model, rng, { kind, x: xs[xi], z: zs[zi], scale }));
    }
  }

  // 半圈矮栅栏：西侧留一个入口，北侧围起来
  const woodMat = toonLambert({ color: 0x8a6a44, flatShading: true, shared: false });
  props.add(makeFenceSegment(model, 56, -8, 56, 0, woodMat));
  props.add(makeFenceSegment(model, 56, 6, 56, 12, woodMat));
  props.add(makeFenceSegment(model, 56, 14, 78, 14, woodMat));

  // 蜂箱：果园北侧外沿
  const hiveMat = toonLambert({ color: 0xc9a26a, flatShading: true, shared: false });
  const roofMat = toonLambert({ color: 0x6f5236, flatShading: true, shared: false });
  props.add(makeHive(model, 58, 17.5, -0.15, hiveMat, roofMat));
  props.add(makeHive(model, 61.5, 18.8, 0.05, hiveMat, roofMat));
  props.add(makeHive(model, 65, 17.5, 0.18, hiveMat, roofMat));

  // 野餐角在果树中间
  props.add(makePicnic(model, 68, 4));

  // 风车脚下花坛
  const flowerMats = [0xe86a7a, 0xf0c04a, 0xf2ead8, 0xb98ad8].map((c) =>
    toonLambert({ color: c, flatShading: true, shared: false })
  );
  props.add(makeFlowerBed(model, 57, 33, 14, rng, flowerMats));
  props.add(makeFlowerBed(model, 72, 33, 12, rng, flowerMats));
  props.add(makeFlowerBed(model, 64, 44, 16, rng, flowerMats));

  return props;
}
