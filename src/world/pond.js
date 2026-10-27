import * as THREE from 'three';
import { WATER_SINK_LOW } from './terrain.js';
import { toonLambert } from '../render/toon.js';

// ---------------------------------------------------------------------------
// 水池生态：游鱼 + 荷叶 + 浮藻
//
// 水面本身在 terrain.js 的 buildPond 里创建（贴地形的圆形水面）。
// 这个模块往水面里/上加内容：
//   - 5~10 条鱼，在水下绕圈游动，偶尔浮到水面
//   - 荷叶：贴在水面上的圆盘，随水波轻微起伏
//   - 浮藻：小簇绿色斑块，漂在水面
// ---------------------------------------------------------------------------

// 鱼的花色（不同品种）
const FISH_SPECS = [
  { name: '锦鲤', body: 0xe8622c, fin: 0xf2a878, size: 1.0, speed: 1.0 },
  { name: '红鲤', body: 0xd8452e, fin: 0xe87a5a, size: 0.9, speed: 1.1 },
  { name: '青鱼', body: 0x5a7a8a, fin: 0x7a9aa8, size: 1.1, speed: 0.85 },
  { name: '金鱼', body: 0xf0b030, fin: 0xf8d070, size: 0.75, speed: 1.2 },
  { name: '白鲤', body: 0xe8e4dc, fin: 0xf0ece4, size: 0.95, speed: 0.95 },
];

function makeFish(spec, rng) {
  const root = new THREE.Group();
  root.name = 'fish';
  const s = spec.size * rng.range(0.85, 1.15);

  const bodyMat = toonLambert({
    color: spec.body, flatShading: true,
  });
  const finMat = toonLambert({
    color: spec.fin, flatShading: true, side: THREE.DoubleSide,
  });

  // 身体：纺锤形（用八面体拉长）
  const bodyGeo = new THREE.OctahedronGeometry(0.5, 0);
  bodyGeo.scale(0.34, 0.42, 1.0);
  const body = new THREE.Mesh(bodyGeo, bodyMat);
  body.scale.setScalar(s);
  root.add(body);

  // 尾巴：扁三角
  const tailGeo = new THREE.BufferGeometry();
  tailGeo.setAttribute('position', new THREE.BufferAttribute(new Float32Array([
    0, 0, 0,
    0.42, 0.34, -0.62,
    0.42, -0.34, -0.62,
  ]), 3));
  tailGeo.computeVertexNormals();
  const tail = new THREE.Mesh(tailGeo, finMat);
  tail.position.z = -0.5 * s;
  tail.scale.setScalar(s);
  root.add(tail);

  // 背鳍
  const dorsalGeo = new THREE.BufferGeometry();
  dorsalGeo.setAttribute('position', new THREE.BufferAttribute(new Float32Array([
    0, 0, 0.1,
    0, 0.3, -0.05,
    0, 0, -0.3,
  ]), 3));
  dorsalGeo.computeVertexNormals();
  const dorsal = new THREE.Mesh(dorsalGeo, finMat);
  dorsal.position.y = 0.2 * s;
  dorsal.scale.setScalar(s);
  root.add(dorsal);

  root.scale.setScalar(1);
  root.userData.spec = spec;
  root.userData.parts = { body, tail, dorsal };
  return root;
}

// 荷叶
function makeLilyPad(rng) {
  const g = new THREE.Group();
  g.name = 'lilypad';

  const r = rng.range(0.9, 1.8);
  // 圆盘带一个缺口（荷叶特征）
  const geo = new THREE.CircleGeometry(r, 14, 0.35, Math.PI * 2 - 0.7);
  geo.rotateX(-Math.PI / 2);

  const mat = toonLambert({
    color: rng.chance(0.5) ? 0x4f8a3a : 0x5f9a44,
    flatShading: true,
    side: THREE.DoubleSide,
  });
  const pad = new THREE.Mesh(geo, mat);
  g.add(pad);

  // 一部分荷叶上有花
  if (rng.chance(0.25)) {
    const flower = new THREE.Mesh(
      new THREE.ConeGeometry(0.28, 0.5, 5),
      toonLambert({ color: 0xf0a8c0, flatShading: true })
    );
    flower.position.y = 0.25;
    flower.rotation.z = rng.range(-0.15, 0.15);
    g.add(flower);
  }

  g.userData.baseY = 0;
  g.userData.phase = rng.next() * Math.PI * 2;
  return g;
}

// 浮藻（小簇）—— 多个圆片合并成一个网格，减少 draw call
function makeAlgae(rng) {
  const g = new THREE.Group();
  g.name = 'algae';

  const mat = toonLambert({
    color: 0x6a9a4a, flatShading: true, side: THREE.DoubleSide,
  });

  const n = 3 + Math.floor(rng.next() * 4);
  const positions = [];
  const indices = [];
  let vOff = 0;

  for (let i = 0; i < n; i++) {
    const r = rng.range(0.18, 0.42);
    const geo = new THREE.CircleGeometry(r, 6);
    geo.rotateX(-Math.PI / 2);
    const px = rng.range(-0.6, 0.6);
    const pz = rng.range(-0.6, 0.6);
    geo.translate(px, 0, pz);

    const pos = geo.attributes.position;
    const idx = geo.index;
    for (let k = 0; k < pos.count; k++) {
      positions.push(pos.getX(k), pos.getY(k), pos.getZ(k));
    }
    if (idx) {
      for (let k = 0; k < idx.count; k++) indices.push(idx.getX(k) + vOff);
    } else {
      for (let k = 0; k < pos.count; k++) indices.push(k + vOff);
    }
    vOff += pos.count;
    geo.dispose();
  }

  const merged = new THREE.BufferGeometry();
  merged.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
  merged.setIndex(indices);
  merged.computeVertexNormals();

  const m = new THREE.Mesh(merged, mat);
  g.add(m);

  g.userData.phase = rng.next() * Math.PI * 2;
  return g;
}

export function buildPondLife(model, center, radius, rng) {
  const group = new THREE.Group();
  group.name = 'pondLife';

  // 水面高度和 terrain.js 的 buildPond 完全一致：
  //   采样池外（1.6R）的地面高度取平均，水面在它下面 0.55
  let outsideSum = 0, outsideN = 0;
  for (let i = 0; i < 16; i++) {
    const a = (i / 16) * Math.PI * 2;
    const ex = center.x + Math.cos(a) * radius * 1.6;
    const ez = center.z + Math.sin(a) * radius * 1.6;
    outsideSum += model.heightAt(ex, ez);
    outsideN++;
  }
  // 初始按秋冬低水位算，真正的值在 main.js 的 applySeason 里通过
  // group.userData.setSeason 覆盖（鱼/荷叶/浮藻每帧跟着 waterY 走）。
  const waterY = (outsideSum / outsideN) - WATER_SINK_LOW;
  // 活动半径：留出 3 单位边距，避免鱼游到岸上
  const R = Math.max(2, radius - 3.5);

  // ---------- 鱼 ----------
  const fishCount = 7 + Math.floor(rng.next() * 4);   // 7~10 条
  const fishes = [];
  for (let i = 0; i < fishCount; i++) {
    const spec = FISH_SPECS[i % FISH_SPECS.length];
    const f = makeFish(spec, rng);
    const ang = rng.next() * Math.PI * 2;
    const rad = Math.sqrt(rng.next()) * R * 0.85;
    f.position.set(
      center.x + Math.cos(ang) * rad,
      waterY - rng.range(0.35, 1.0),
      center.z + Math.sin(ang) * rad
    );
    f.rotation.y = rng.next() * Math.PI * 2;

    f.userData.swim = {
      cx: center.x + Math.cos(ang) * rad * 0.3,
      cz: center.z + Math.sin(ang) * rad * 0.3,
      // 轨迹半径要够大，否则鱼只在小范围打转（看起来像没动）
      rx: rng.range(R * 0.35, R * 0.75),
      rz: rng.range(R * 0.35, R * 0.75),
      ang: rng.next() * Math.PI * 2,
      // 角速度：不同鱼不同
      // 角速度：保证每条鱼都在明显游动（最低 0.25 rad/s）
      speed: Math.max(0.25, (0.35 + rng.next() * 0.5) * spec.speed),
      // 鱼游得浅一点才看得见（水面透明度 0.62，太深就被水色盖住）
      depth: rng.range(0.15, 0.55),        // 距水面的深度
      depthPhase: rng.next() * Math.PI * 2,
      depthFreq: 0.3 + rng.next() * 0.5,
      phase: rng.next() * Math.PI * 2,
    };
    group.add(f);
    fishes.push(f);
  }

  // ---------- 荷叶 ----------
  // 荷叶 3~4 片（之前 7~12 片太密，水面被遮住了）
  const padCount = 3 + Math.floor(rng.next() * 2);
  const pads = [];
  for (let i = 0; i < padCount; i++) {
    const pad = makeLilyPad(rng);
    const ang = rng.next() * Math.PI * 2;
    const rad = Math.sqrt(rng.next()) * R * 0.9;
    pad.position.set(
      center.x + Math.cos(ang) * rad,
      waterY + 0.06,
      center.z + Math.sin(ang) * rad
    );
    pad.rotation.y = rng.next() * Math.PI * 2;
    pad.userData.baseY = waterY + 0.06;
    group.add(pad);
    pads.push(pad);
  }

  // ---------- 浮藻 ----------
  // 浮藻 3~5 簇
  const algaeCount = 3 + Math.floor(rng.next() * 3);
  const algaeList = [];
  for (let i = 0; i < algaeCount; i++) {
    const a = makeAlgae(rng);
    const ang = rng.next() * Math.PI * 2;
    const rad = Math.sqrt(rng.next()) * R * 0.95;
    a.position.set(
      center.x + Math.cos(ang) * rad,
      waterY + 0.04,
      center.z + Math.sin(ang) * rad
    );
    group.add(a);
    algaeList.push(a);
  }

  group.userData.counts = {
    fish: fishes.length,
    lilypad: pads.length,
    algae: algaeList.length,
  };

  // ---------- 每帧更新 ----------
  // 水面高度会随季节变化，每帧从场景里取当前值（而不是固定 waterY）
  let curWaterY = waterY;
  group.userData.setWaterLevel = (y) => { curWaterY = y; };

  group.userData.update = (t, dt) => {
    const step = Math.min(dt, 0.05);

    // 鱼：绕圈游 + 上下浮动 + 尾巴摆动
    for (const f of fishes) {
      const s = f.userData.swim;
      s.ang += step * s.speed;

      const x = s.cx + Math.cos(s.ang) * s.rx;
      const z = s.cz + Math.sin(s.ang) * s.rz;
      // 深度随正弦变化（偶尔浮到水面附近）
      const depth = Math.max(0.08, s.depth + Math.sin(t * s.depthFreq + s.depthPhase) * 0.15);

      f.position.set(x, curWaterY - depth, z);

      // 朝向：沿轨迹切线
      const tx = -Math.sin(s.ang) * s.rx;
      const tz = Math.cos(s.ang) * s.rz;
      const targetYaw = Math.atan2(tx, tz);
      let d = targetYaw - f.rotation.y;
      while (d > Math.PI) d -= Math.PI * 2;
      while (d < -Math.PI) d += Math.PI * 2;
      f.rotation.y += d * Math.min(1, step * 3);

      // 尾巴摆动（游动的核心视觉）
      const tail = f.userData.parts.tail;
      tail.rotation.y = Math.sin(t * (6 + s.speed * 4) + s.phase) * 0.5;
      // 身体轻微侧倾
      f.rotation.z = Math.sin(t * 2 + s.phase) * 0.08;
    }

    // 荷叶：随水波轻微起伏（基准高度跟着水位走）
    for (const p of pads) {
      p.position.y = curWaterY + 0.06 + Math.sin(t * 1.2 + p.userData.phase) * 0.035;
      p.rotation.z = Math.sin(t * 0.9 + p.userData.phase) * 0.04;
      p.rotation.x = Math.cos(t * 1.1 + p.userData.phase) * 0.04;
    }

    // 浮藻：缓慢漂移
    for (const a of algaeList) {
      a.position.y = curWaterY + 0.04 + Math.sin(t * 0.8 + a.userData.phase) * 0.02;
      a.rotation.y += step * 0.06;
    }
  };

  return group;
}