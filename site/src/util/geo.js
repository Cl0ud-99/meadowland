import * as THREE from '../../vendor/three/three.module.js';
import { toonLambert } from '../render/toon.js';

// ---------------------------------------------------------------------------
// 几何小工具：所有静态建筑都靠这些拼，最后合并成一个 BufferGeometry，
// 这样一栋房子只占 1 个 draw call
// ---------------------------------------------------------------------------

const _c = new THREE.Color();

export function tint(geo, color) {
  const n = geo.attributes.position.count;
  const arr = new Float32Array(n * 3);
  _c.set(color);
  for (let i = 0; i < n; i++) {
    arr[i * 3] = _c.r;
    arr[i * 3 + 1] = _c.g;
    arr[i * 3 + 2] = _c.b;
  }
  geo.setAttribute('color', new THREE.BufferAttribute(arr, 3));
  return geo;
}

export function box(w, h, d, color, x = 0, y = 0, z = 0) {
  const g = new THREE.BoxGeometry(w, h, d);
  g.translate(x, y + h / 2, z);
  return tint(g, color);
}

export function cyl(rt, rb, h, seg, color, x = 0, y = 0, z = 0) {
  const g = new THREE.CylinderGeometry(rt, rb, h, seg);
  g.translate(x, y + h / 2, z);
  return tint(g, color);
}

export function cone(r, h, seg, color, x = 0, y = 0, z = 0) {
  const g = new THREE.ConeGeometry(r, h, seg);
  g.translate(x, y + h / 2, z);
  return tint(g, color);
}

// 三角棱柱（人字形屋顶）。宽 w（沿 x），高 h，长 d（沿 z）
export function gable(w, h, d, color, x = 0, y = 0, z = 0, overhang = 0) {
  const hw = w / 2 + overhang;
  const hd = d / 2 + overhang;
  const verts = [
    // 左斜面
    [-hw, 0, -hd], [-hw, 0, hd], [0, h, hd],
    [-hw, 0, -hd], [0, h, hd], [0, h, -hd],
    // 右斜面
    [hw, 0, hd], [hw, 0, -hd], [0, h, -hd],
    [hw, 0, hd], [0, h, -hd], [0, h, hd],
    // 前三角
    [-hw, 0, hd], [hw, 0, hd], [0, h, hd],
    // 后三角
    [hw, 0, -hd], [-hw, 0, -hd], [0, h, -hd],
  ];
  const pos = new Float32Array(verts.length * 3);
  verts.forEach((v, i) => {
    pos[i * 3] = v[0] + x;
    pos[i * 3 + 1] = v[1] + y;
    pos[i * 3 + 2] = v[2] + z;
  });
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  g.computeVertexNormals();
  return tint(g, color);
}

// 合并一组带 color 属性的几何（导出供外部模块复用，避免重复实现）
export function merge(list) {
  let vTotal = 0, iTotal = 0;
  for (const g of list) {
    vTotal += g.attributes.position.count;
    iTotal += g.index ? g.index.count : g.attributes.position.count;
  }
  const positions = new Float32Array(vTotal * 3);
  const normals = new Float32Array(vTotal * 3);
  const colors = new Float32Array(vTotal * 3);
  const indices = new Uint32Array(iTotal);

  let vOff = 0, iOff = 0;
  for (const g of list) {
    if (!g.attributes.normal) g.computeVertexNormals();
    const p = g.attributes.position;
    const n = g.attributes.normal;
    const c = g.attributes.color;
    positions.set(p.array.subarray(0, p.count * 3), vOff * 3);
    normals.set(n.array.subarray(0, n.count * 3), vOff * 3);
    if (c) colors.set(c.array.subarray(0, c.count * 3), vOff * 3);
    else colors.fill(1, vOff * 3, (vOff + p.count) * 3);

    if (g.index) {
      for (let i = 0; i < g.index.count; i++) indices[iOff + i] = g.index.getX(i) + vOff;
      iOff += g.index.count;
    } else {
      for (let i = 0; i < p.count; i++) indices[iOff + i] = i + vOff;
      iOff += p.count;
    }
    vOff += p.count;
    g.dispose();
  }

  const out = new THREE.BufferGeometry();
  out.setAttribute('position', new THREE.BufferAttribute(positions, 3));
  out.setAttribute('normal', new THREE.BufferAttribute(normals, 3));
  out.setAttribute('color', new THREE.BufferAttribute(colors, 3));
  out.setIndex(new THREE.BufferAttribute(indices, 1));
  out.computeBoundingSphere();
  return out;
}

export function meshFrom(list, opts = {}) {
  const geo = merge(list);
  // 三渲二材质（卡通分阶光照）
  const mat = toonLambert({
    vertexColors: true,
    flatShading: opts.flatShading !== false,
  });
  const m = new THREE.Mesh(geo, mat);
  m.castShadow = opts.castShadow !== false;
  m.receiveShadow = opts.receiveShadow !== false;

  // ---------- 记录"颜色槽位" ----------
  // 每个合并进来的几何体有一段连续的顶点，对应一个原始颜色。
  // 记录 [起始顶点, 结束顶点, 原始颜色]，供换风格时按槽位重写顶点色。
  //
  // list 里每项是 { geo, color }（merge 前的结构），
  // 但 merge() 内部已经 dispose 了，所以这里改为从顶点色反推：
  // 相邻顶点颜色相同 → 同一段。
  const colorAttr = geo.attributes.color;
  if (colorAttr) {
    const slots = [];
    let start = 0;
    let cur = null;
    for (let i = 0; i < colorAttr.count; i++) {
      const key = colorAttr.getX(i).toFixed(4) + ',' +
                  colorAttr.getY(i).toFixed(4) + ',' +
                  colorAttr.getZ(i).toFixed(4);
      if (cur === null) {
        cur = key;
      } else if (key !== cur) {
        slots.push({ start, end: i, color: cur });
        start = i;
        cur = key;
      }
    }
    if (cur !== null) slots.push({ start, end: colorAttr.count, color: cur });
    m.userData.colorSlots = slots;
  }

  return m;
}

// ---------------------------------------------------------------------------
// 按槽位重写顶点色
// mapping: Map<原始颜色hex字符串, 新颜色hex>
// ---------------------------------------------------------------------------
export function recolorMesh(mesh, mapping) {
  const geo = mesh.geometry;
  const colorAttr = geo.attributes.color;
  const slots = mesh.userData.colorSlots;
  if (!colorAttr || !slots) return false;

  const tmp = new THREE.Color();
  let changed = false;

  for (const slot of slots) {
    const newHex = mapping.get(slot.color);
    if (newHex === undefined) continue;
    tmp.setHex(newHex);   // sRGB -> Linear（和原始创建时一致）
    for (let i = slot.start; i < slot.end; i++) {
      colorAttr.setXYZ(i, tmp.r, tmp.g, tmp.b);
    }
    changed = true;
  }

  if (changed) colorAttr.needsUpdate = true;
  return changed;
}