import * as THREE from 'three';
import { tint, merge } from '../util/geo.js';
import { toonLambert } from '../render/toon.js';

// ---------------------------------------------------------------------------
// 木材堆 + 树桩（放在参天大树下）
//
// 组成：
//   - 一个树桩（砍伐后留下的，带年轮）
//   - 一堆劈好的木柴（交错堆放）
//   - 一把插在树桩上的斧头
//   - 散落的木屑
//
// 位置：大树东侧约 4 单位（避开树干半径 1.6）
// ---------------------------------------------------------------------------



// ---------------------------------------------------------------------------
// 树桩（带年轮切面）
// ---------------------------------------------------------------------------
function makeStump(parts) {
  const R = 0.85;
  const H = 0.9;

  // 桩身
  const body = new THREE.CylinderGeometry(R, R * 1.08, H, 10);
  body.translate(0, H / 2, 0);
  parts.push(tint(body, 0x6b4f36));

  // 树皮（稍深的一圈）
  const bark = new THREE.CylinderGeometry(R * 1.02, R * 1.1, H * 0.95, 10, 1, true);
  bark.translate(0, H / 2, 0);
  parts.push(tint(bark, 0x54402c));

  // 顶面（浅色木纹）
  const top = new THREE.CylinderGeometry(R * 0.98, R * 0.98, 0.06, 10);
  top.translate(0, H + 0.01, 0);
  parts.push(tint(top, 0xc8a878));

  // 年轮（3 圈）
  for (let i = 1; i <= 3; i++) {
    const ring = new THREE.TorusGeometry(R * 0.22 * i, 0.022, 4, 14);
    ring.rotateX(Math.PI / 2);
    ring.translate(0, H + 0.045, 0);
    parts.push(tint(ring, 0x9a7a52));
  }
}

// ---------------------------------------------------------------------------
// 一根劈好的木柴
// ---------------------------------------------------------------------------
function makeLog(len, rad, x, y, z, rotY, rotZ, colorSeed) {
  const parts = [];
  // 主体（六边柱，看起来像劈开的木头）
  const body = new THREE.CylinderGeometry(rad, rad, len, 6);
  body.rotateZ(Math.PI / 2);   // 横放
  parts.push(tint(body, colorSeed));

  // 两端切面（浅色）
  for (const side of [-1, 1]) {
    const cap = new THREE.CylinderGeometry(rad * 0.95, rad * 0.95, 0.04, 6);
    cap.rotateZ(Math.PI / 2);
    cap.translate(side * len / 2, 0, 0);
    parts.push(tint(cap, 0xc8a878));
  }

  // 劈裂面（一条深色纹理）
  const split = new THREE.BoxGeometry(len * 0.9, rad * 0.06, rad * 0.9);
  split.translate(0, rad * 0.5, 0);
  parts.push(tint(split, 0x8a6a48));

  const merged = merge(parts);
  const m = new THREE.Matrix4();
  const e = new THREE.Euler(0, rotY, rotZ);
  const q = new THREE.Quaternion().setFromEuler(e);
  m.compose(new THREE.Vector3(x, y, z), q, new THREE.Vector3(1, 1, 1));
  merged.applyMatrix4(m);
  return merged;
}

// ---------------------------------------------------------------------------
// 构建
// ---------------------------------------------------------------------------
export function buildWoodpile(model, rng, center = { x: 2.5, z: -18 }) {
  const group = new THREE.Group();
  group.name = 'woodpile';

  const allParts = [];

  // ---------- 树桩 ----------
  const stumpParts = [];
  makeStump(stumpParts);
  const stumpGeo = merge(stumpParts);
  // 树桩放在一侧
  stumpGeo.applyMatrix4(new THREE.Matrix4().makeTranslation(-1.2, 0, 0.8));
  allParts.push(stumpGeo);

  // ---------- 劈好的木柴堆（交错叠放）----------
  const LOG_COLORS = [0x8a6a48, 0x7a5a3a, 0x96724e, 0x6b4f36];

  // 底层：4 根并排
  for (let i = 0; i < 4; i++) {
    allParts.push(makeLog(
      2.2, 0.22,
      0, 0.24, -1.4 + i * 0.46,
      0.02 + rng.range(-0.05, 0.05),   // 轻微旋转
      0,
      LOG_COLORS[i % LOG_COLORS.length]
    ));
  }

  // 第二层：3 根（错开）
  for (let i = 0; i < 3; i++) {
    allParts.push(makeLog(
      2.0, 0.2,
      0.1, 0.68, -1.17 + i * 0.46,
      -0.03 + rng.range(-0.05, 0.05),
      0,
      LOG_COLORS[(i + 1) % LOG_COLORS.length]
    ));
  }

  // 第三层：2 根
  for (let i = 0; i < 2; i++) {
    allParts.push(makeLog(
      1.8, 0.18,
      -0.05, 1.06, -0.94 + i * 0.46,
      0.01,
      0,
      LOG_COLORS[(i + 2) % LOG_COLORS.length]
    ));
  }

  // 顶层：1 根（斜靠）
  allParts.push(makeLog(
    1.6, 0.16,
    0.15, 1.42, -0.7,
    0.08, 0.05,
    LOG_COLORS[0]
  ));

  // 旁边散落 3 根（不规则摆放）
  const scatter = [
    { x: -1.6, z: -1.9, ry: 0.6, rz: 0 },
    { x: -1.9, z: -0.9, ry: 1.2, rz: 0 },
    { x: 1.5, z: -2.0, ry: -0.4, rz: 0 },
  ];
  scatter.forEach((s, i) => {
    allParts.push(makeLog(
      1.5 + rng.range(-0.2, 0.2), 0.17,
      s.x, 0.18, s.z,
      s.ry, s.rz,
      LOG_COLORS[(i + 3) % LOG_COLORS.length]
    ));
  });

  // ---------- 斧头（插在树桩上）----------
  {
    const axeParts = [];
    // 斧柄
    const handle = new THREE.CylinderGeometry(0.045, 0.055, 1.1, 5);
    handle.rotateZ(0.35);
    handle.translate(0, 0.55, 0);
    axeParts.push(tint(handle, 0x9a7a52));

    // 斧头（楔形）
    const head = new THREE.BoxGeometry(0.08, 0.28, 0.42);
    head.translate(0.12, 1.02, 0);
    axeParts.push(tint(head, 0x8a9098));

    // 斧刃（更亮的斜面）
    const blade = new THREE.BoxGeometry(0.06, 0.26, 0.12);
    blade.translate(0.12, 1.02, 0.24);
    axeParts.push(tint(blade, 0xb8c0c8));

    const axeGeo = merge(axeParts);
    // 插在树桩顶面
    axeGeo.applyMatrix4(new THREE.Matrix4().makeTranslation(-1.2, 0.85, 0.8));
    allParts.push(axeGeo);
  }

  // ---------- 木屑（散落的小块）----------
  for (let i = 0; i < 14; i++) {
    const a = rng.next() * Math.PI * 2;
    const r = rng.range(0.8, 3.2);
    const chip = new THREE.BoxGeometry(
      rng.range(0.08, 0.2),
      rng.range(0.02, 0.05),
      rng.range(0.06, 0.15)
    );
    chip.rotateY(rng.next() * Math.PI);
    chip.translate(Math.cos(a) * r, 0.03, Math.sin(a) * r);
    allParts.push(tint(chip, 0xb89870));
  }

  // ---------- 合并 ----------
  const geo = merge(allParts);
  const mat = toonLambert({
    vertexColors: true,
    flatShading: true,
  });
  const mesh = new THREE.Mesh(geo, mat);
  mesh.castShadow = true;
  mesh.receiveShadow = true;
  group.add(mesh);

  const gy = model.heightAt(center.x, center.z);
  group.position.set(center.x, gy - 0.05, center.z);
  group.rotation.y = 0.4;

  group.userData.kind = 'woodpile';
  return group;
}