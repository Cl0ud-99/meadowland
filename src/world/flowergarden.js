import * as THREE from 'three';
import { toonLambert } from '../render/toon.js';
import { tint, merge } from '../util/geo.js';
import { buildRoad } from './road.js';

// 右侧花田：成片低模花丛 + 蜂箱 + 蜜蜂 + 野餐角 + 半圈矮栅栏。
// 不再使用果树模型，避免右侧出现第二片“树林”。

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

  const appleMat = toonLambert({ color: 0xc8402e, flatShading: true, shared: false });
  for (let i = 0; i < 4; i++) {
    const a = new THREE.Mesh(new THREE.DodecahedronGeometry(0.14, 0), appleMat);
    a.position.set(-0.15 + i * 0.18, 0.7 + (i % 2) * 0.05, -0.2 + (i % 3) * 0.06);
    a.castShadow = true;
    g.add(a);
  }

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

// 到折线的距离（花田避让小路）
function distToPolyline(x, z, pts) {
  let best = 1e9;
  for (let i = 0; i < pts.length - 1; i++) {
    const [ax, az] = pts[i], [bx, bz] = pts[i + 1];
    const dx = bx - ax, dz = bz - az;
    const l2 = dx * dx + dz * dz || 1;
    let t = ((x - ax) * dx + (z - az) * dz) / l2;
    t = Math.max(0, Math.min(1, t));
    const px = ax + dx * t, pz = az + dz * t;
    best = Math.min(best, Math.hypot(x - px, z - pz));
  }
  return best;
}

function makeFlowerMeadow(model, rng, pathPts) {
  const colors = [0xe85d5d, 0xf2b53c, 0xf4efe3, 0xd77bb5, 0x9a7fd1, 0xf08a4b];
  const greens = [0x4f7a3a, 0x5f8f45, 0x3f6a32];
  const geos = [];
  const centers = [];
  for (let i = 0; i < 34; i++) {
    const cx = 58 + rng.next() * 20;
    const cz = -7 + rng.next() * 20;
    if (Math.hypot(cx - 68, cz - 4) < 6.2) continue;
    if (distToPolyline(cx, cz, pathPts) < 3.0) continue;
    centers.push([cx, cz]);
  }

  const addGeo = (g, color) => { tint(g, color); geos.push(g); };

  for (const [cx, cz] of centers) {
    const n = 7 + Math.floor(rng.next() * 8);
    const baseColor = colors[Math.floor(rng.next() * colors.length)];
    for (let i = 0; i < n; i++) {
      const a = rng.next() * Math.PI * 2;
      const r = Math.sqrt(rng.next()) * 2.4;
      const x = cx + Math.cos(a) * r;
      const z = cz + Math.sin(a) * r;
      if (x < 57 || x > 79 || z < -8 || z > 13) continue;
      if (Math.hypot(x - 68, z - 4) < 5.0) continue;
      if (distToPolyline(x, z, pathPts) < 2.0) continue;

      const y = model.heightAt(x, z);
      const h = rng.range(0.30, 0.60);
      const col = rng.next() < 0.65 ? baseColor : colors[Math.floor(rng.next() * colors.length)];

      const stem = new THREE.CylinderGeometry(0.016, 0.024, h, 3);
      stem.translate(x, y + h / 2, z);
      addGeo(stem, greens[i % greens.length]);

      // 5 片低模花瓣
      for (let k = 0; k < 5; k++) {
        const p = new THREE.BoxGeometry(0.11, 0.03, 0.17);
        p.translate(0, 0, 0.085);
        p.rotateY((k / 5) * Math.PI * 2 + rng.range(-0.12, 0.12));
        p.rotateX(-0.12);
        p.translate(x, y + h, z);
        addGeo(p, col);
      }
      const core = new THREE.BoxGeometry(0.055, 0.045, 0.055);
      core.translate(x, y + h + 0.02, z);
      addGeo(core, 0xf2c14e);

      if (rng.next() < 0.55) {
        const leaf = new THREE.BoxGeometry(0.13, 0.02, 0.065);
        leaf.translate(0.075, 0, 0);
        leaf.rotateY(rng.next() * Math.PI * 2);
        leaf.translate(x, y + h * 0.42, z);
        addGeo(leaf, greens[(i + 1) % greens.length]);
      }
    }
  }

  const geo = merge(geos);
  const mat = toonLambert({ vertexColors: true, flatShading: true, shared: false });
  const mesh = new THREE.Mesh(geo, mat);
  mesh.name = 'flowerMeadow';
  mesh.receiveShadow = true;
  return mesh;
}

function makeBees(model, rng) {
  const group = new THREE.Group();
  group.name = 'bees';
  const bees = [];
  const yellow = toonLambert({ color: 0xf2c14e, flatShading: true, shared: false });
  const black = toonLambert({ color: 0x2b2b2b, flatShading: true, shared: false });
  const wingMat = toonLambert({ color: 0xffffff, transparent: true, opacity: 0.55, side: THREE.DoubleSide, shared: false });

  for (let i = 0; i < 14; i++) {
    const b = new THREE.Group();
    const body = new THREE.Mesh(new THREE.BoxGeometry(0.13, 0.10, 0.30), yellow);
    b.add(body);
    for (const zz of [-0.06, 0.06]) {
      const stripe = new THREE.Mesh(new THREE.BoxGeometry(0.14, 0.11, 0.045), black);
      stripe.position.z = zz;
      b.add(stripe);
    }
    const head = new THREE.Mesh(new THREE.BoxGeometry(0.12, 0.11, 0.11), black);
    head.position.z = 0.20;
    b.add(head);
    const wings = [];
    for (const sx of [-1, 1]) {
      const w = new THREE.Mesh(new THREE.PlaneGeometry(0.18, 0.10), wingMat);
      w.rotation.x = -Math.PI / 2;
      w.position.set(sx * 0.09, 0.055, 0);
      b.add(w);
      wings.push(w);
    }
    const cx = 62 + rng.next() * 13;
    const cz = 0 + rng.next() * 12;
    const rx = 1.5 + rng.next() * 4.0;
    const rz = 1.2 + rng.next() * 3.2;
    const height = 1.0 + rng.next() * 1.6;
    const speed = (0.35 + rng.next() * 0.7) * (rng.next() < 0.5 ? 1 : -1);
    const phase = rng.next() * Math.PI * 2;
    b.userData = { cx, cz, rx, rz, height, speed, phase, wings };
    b.scale.setScalar(0.9 + rng.next() * 0.35);
    group.add(b);
    bees.push(b);
  }

  group.userData.update = (t) => {
    for (const b of bees) {
      const u = b.userData;
      const ang = u.phase + t * u.speed;
      const x = u.cx + Math.cos(ang) * u.rx;
      const z = u.cz + Math.sin(ang) * u.rz;
      const y = model.heightAt(x, z) + u.height + Math.sin(t * 2.2 + u.phase) * 0.22;
      b.position.set(x, y, z);
      b.rotation.y = -ang + Math.PI / 2;
      const flap = Math.sin(t * 34 + u.phase) * 0.8;
      for (const w of u.wings) w.rotation.z = flap;
    }
  };
  group.userData.update(0);
  return group;
}

export function buildFlowerGarden(model, rng) {
  const props = new THREE.Group();
  props.name = 'flowerGarden';

  // 从西侧入口通到野餐角的小土路
  const pathPts = [[53, 3], [58, 2.7], [62, 3.4], [64.5, 4.2]];
  const path = buildRoad(model, pathPts, 1.9);
  path.name = 'flowerGardenPath';
  if (path.children[0]) {
    path.children[0].material = path.children[0].material.clone();
    path.children[0].material.color.set(0xb59a72);
  }
  if (path.children[1]) path.children[1].visible = false;
  props.add(path);

  // 花田本体
  props.add(makeFlowerMeadow(model, rng, pathPts));

  // 半圈矮栅栏，西侧留入口
  const woodMat = toonLambert({ color: 0x8a6a44, flatShading: true, shared: false });
  props.add(makeFenceSegment(model, 56, -8, 56, 0, woodMat));
  props.add(makeFenceSegment(model, 56, 6, 56, 12, woodMat));
  props.add(makeFenceSegment(model, 56, 14, 78, 14, woodMat));

  // 蜂箱
  const hiveMat = toonLambert({ color: 0xc9a26a, flatShading: true, shared: false });
  const roofMat = toonLambert({ color: 0x6f5236, flatShading: true, shared: false });
  props.add(makeHive(model, 58, 17.5, -0.15, hiveMat, roofMat));
  props.add(makeHive(model, 61.5, 18.8, 0.05, hiveMat, roofMat));
  props.add(makeHive(model, 65, 17.5, 0.18, hiveMat, roofMat));

  // 野餐角
  props.add(makePicnic(model, 68, 4));

  // 风车脚下花坛
  const flowerMats = [0xe86a7a, 0xf0c04a, 0xf2ead8, 0xb98ad8].map((c) =>
    toonLambert({ color: c, flatShading: true, shared: false })
  );
  props.add(makeFlowerBed(model, 57, 33, 14, rng, flowerMats));
  props.add(makeFlowerBed(model, 72, 33, 12, rng, flowerMats));
  props.add(makeFlowerBed(model, 64, 44, 16, rng, flowerMats));

  // 蜜蜂
  const bees = makeBees(model, rng);
  props.add(bees);
  props.userData.update = (t, dt) => bees.userData.update(t, dt);

  return props;
}
