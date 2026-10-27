// 布局校验：检查建筑/围栏/田地/池塘之间有没有重叠
import { PASTURE, COOP, BUILDINGS, HAY_BALES, FIELD_RECTS, PEOPLE_PATHS, TRUCK, TREE_SPECS, BIG_TREE, WOODPILE } from './site/src/world/layout.js';
import { pointInPolygon, distToPolygonEdge } from './site/src/util/poly.js';

const rectCorners = (r) => {
  const hw = r.w / 2, hd = r.d / 2;
  const cos = Math.cos(r.rot), sin = Math.sin(r.rot);
  return [[-hw,-hd],[hw,-hd],[hw,hd],[-hw,hd]].map(([x,z]) => [r.x + x*cos - z*sin, r.z + x*sin + z*cos]);
};

const rectContainsPoint = (r, px, pz) => {
  const cos = Math.cos(-r.rot), sin = Math.sin(-r.rot);
  const dx = px - r.x, dz = pz - r.z;
  const lx = dx*cos - dz*sin, lz = dx*sin + dz*cos;
  return Math.abs(lx) <= r.w/2 && Math.abs(lz) <= r.d/2;
};

const segIntersectsRect = (a, b, r) => {
  // 采样近似
  for (let t = 0; t <= 1; t += 0.05) {
    if (rectContainsPoint(r, a[0] + (b[0]-a[0])*t, a[1] + (b[1]-a[1])*t)) return true;
  }
  return false;
};

const problems = [];
const add = (m) => problems.push(m);

// 1) 建筑之间
const buildings = Object.entries(BUILDINGS);
for (let i = 0; i < buildings.length; i++) {
  for (let j = i + 1; j < buildings.length; j++) {
    const [na, a] = buildings[i], [nb, b] = buildings[j];
    const ra = a.r ?? Math.hypot(a.w, a.d) / 2 * 0.7;
    const rb = b.r ?? Math.hypot(b.w, b.d) / 2 * 0.7;
    const d = Math.hypot(a.x - b.x, a.z - b.z);
    if (d < ra + rb) add(`建筑重叠: ${na} <-> ${nb} (距离 ${d.toFixed(1)} < ${(ra+rb).toFixed(1)})`);
  }
}

// 2) 田地 vs 建筑 / 田地 vs 田地
for (const f of FIELD_RECTS) {
  for (const [n, b] of buildings) {
    const br = b.r ?? Math.hypot(b.w, b.d) / 2 * 0.7;
    if (rectContainsPoint(f, b.x, b.z)) add(`田地穿过建筑: 田地(${f.x},${f.z}) 含 ${n}`);
    const corners = rectCorners(f);
    for (let k = 0; k < 4; k++) {
      const [x, z] = corners[k];
      if (Math.hypot(x - b.x, z - b.z) < br) add(`田地角点侵入建筑: 田地(${f.x},${f.z}) 角 ${k} -> ${n}`);
    }
  }
}
for (let i = 0; i < FIELD_RECTS.length; i++) {
  for (let j = i + 1; j < FIELD_RECTS.length; j++) {
    const A = FIELD_RECTS[i], B = FIELD_RECTS[j];
    const ca = rectCorners(A), cb = rectCorners(B);
    const overlap = ca.some(([x,z]) => rectContainsPoint(B, x, z)) || cb.some(([x,z]) => rectContainsPoint(A, x, z));
    if (overlap) add(`田地互相重叠: (${A.x},${A.z}) <-> (${B.x},${B.z})`);
  }
}

// 3) 围栏多边形 vs 建筑 / 田地 / 彼此
const fences = { PASTURE, COOP };
for (const [name, poly] of Object.entries(fences)) {
  for (const [n, b] of buildings) {
    if (pointInPolygon(b.x, b.z, poly)) add(`围栏 ${name} 包住了建筑 ${n}`);
    const br = b.r ?? Math.hypot(b.w, b.d) / 2 * 0.7;
    for (let i = 0; i < poly.length; i++) {
      const a = poly[i], c = poly[(i+1) % poly.length];
      for (let t = 0; t <= 1; t += 0.1) {
        const px = a[0] + (c[0]-a[0])*t, pz = a[1] + (c[1]-a[1])*t;
        if (Math.hypot(px - b.x, pz - b.z) < br) add(`围栏 ${name} 穿过建筑 ${n}`);
      }
    }
  }
  for (const f of FIELD_RECTS) {
    const corners = rectCorners(f);
    if (corners.some(([x,z]) => pointInPolygon(x, z, poly))) add(`田地(${f.x},${f.z}) 侵入围栏 ${name}`);
    for (let i = 0; i < poly.length; i++) {
      const a = poly[i], c = poly[(i+1) % poly.length];
      if (segIntersectsRect(a, c, f)) add(`围栏 ${name} 穿过田地(${f.x},${f.z})`);
    }
  }
}
// 围栏之间
const names = Object.keys(fences);
for (let i = 0; i < names.length; i++) {
  for (let j = i + 1; j < names.length; j++) {
    const A = fences[names[i]], B = fences[names[j]];
    if (A.some(([x,z]) => pointInPolygon(x, z, B)) || B.some(([x,z]) => pointInPolygon(x, z, A))) {
      add(`围栏 ${names[i]} 与 ${names[j]} 重叠`);
    }
  }
}

// 4) 池塘
const pond = BUILDINGS.pond;
for (const [n, b] of buildings) {
  if (n === 'pond') continue;
  const br = b.r ?? Math.hypot(b.w, b.d) / 2 * 0.7;
  const d = Math.hypot(b.x - pond.x, b.z - pond.z);
  if (d < pond.r + br) add(`池塘与 ${n} 重叠 (距离 ${d.toFixed(1)})`);
}
for (const f of FIELD_RECTS) {
  const corners = rectCorners(f);
  for (const [x, z] of corners) {
    if (Math.hypot(x - pond.x, z - pond.z) < pond.r) add(`田地(${f.x},${f.z}) 角点落入池塘`);
  }
}
for (const [name, poly] of Object.entries(fences)) {
  for (const [x, z] of poly) {
    if (Math.hypot(x - pond.x, z - pond.z) < pond.r + 2) add(`围栏 ${name} 触及池塘`);
  }
}

// 5) 人的路径是否安全
const isSafe = (x, z, pad = 2.5) => {
  for (const [n, b] of Object.entries(BUILDINGS)) {
    const r = b.r ?? Math.max(b.w ?? 0, b.d ?? 0) * 0.5;
    if (Math.hypot(x - b.x, z - b.z) < r + pad) return n;
  }
  for (const f of FIELD_RECTS) {
    const cos = Math.cos(-f.rot), sin = Math.sin(-f.rot);
    const dx = x - f.x, dz = z - f.z;
    const lx = dx*cos - dz*sin, lz = dx*sin + dz*cos;
    if (Math.abs(lx) < f.w/2 + pad && Math.abs(lz) < f.d/2 + pad) return 'field';
  }
  for (const [name, poly] of Object.entries(fences)) {
    if (pointInPolygon(x, z, poly)) return name;
    if (distToPolygonEdge(x, z, poly) < pad) return name;
  }
  for (const [hx, hz, hr] of HAY_BALES) if (Math.hypot(x-hx, z-hz) < hr + pad) return 'hay';
  if (Math.hypot(x - TRUCK.x, z - TRUCK.z) < 8) return 'truck';
  return null;
};
PEOPLE_PATHS.forEach((p, i) => {
  const bad = [];
  for (let k = 0; k < 36; k++) {
    const a = (k / 36) * Math.PI * 2;
    const x = p.cx + Math.cos(a) * p.rx;
    const z = p.cz + Math.sin(a) * p.rz;
    const hit = isSafe(x, z);
    if (hit) bad.push(hit);
  }
  if (bad.length) add(`人路径 #${i} 撞到: ${[...new Set(bad)].join(',')} (${bad.length}/36 个采样点)`);
});

// 5.5) 卡车位置
{
  const tr = 4.5; // 卡车包围半径
  for (const [n, b] of Object.entries(BUILDINGS)) {
    const br = b.r ?? Math.hypot(b.w ?? 0, b.d ?? 0) / 2 * 0.7;
    if (Math.hypot(TRUCK.x - b.x, TRUCK.z - b.z) < tr + br) add('卡车与 ' + n + ' 重叠');
  }
  for (const f of FIELD_RECTS) {
    const cos = Math.cos(-f.rot), sin = Math.sin(-f.rot);
    const dx = TRUCK.x - f.x, dz = TRUCK.z - f.z;
    const lx = dx * cos - dz * sin, lz = dx * sin + dz * cos;
    if (Math.abs(lx) < f.w / 2 + tr && Math.abs(lz) < f.d / 2 + tr) add('卡车压到田地(' + f.x + ',' + f.z + ')');
  }
  for (const [name, poly] of Object.entries(fences)) {
    if (pointInPolygon(TRUCK.x, TRUCK.z, poly)) add('卡车在围栏 ' + name + ' 内');
    if (distToPolygonEdge(TRUCK.x, TRUCK.z, poly) < tr) add('卡车贴着围栏 ' + name);
  }
  for (const [hx, hz, hr] of HAY_BALES) {
    if (Math.hypot(TRUCK.x - hx, TRUCK.z - hz) < hr + tr) add('卡车压到干草堆');
  }
}

// 6) 围栏是否闭合（首尾点不能重复，且 farm.js 必须补上最后一条边）
for (const [name, poly] of Object.entries(fences)) {
  const first = poly[0], last = poly[poly.length - 1];
  if (Math.abs(first[0] - last[0]) < 1e-6 && Math.abs(first[1] - last[1]) < 1e-6) {
    add(`围栏 ${name} 首尾点重复，请删掉最后一点（fence() 会自动闭合）`);
  }
  // 相邻边不能有近乎重合的点（会产生零长度边）
  for (let i = 0; i < poly.length; i++) {
    const a = poly[i], b = poly[(i + 1) % poly.length];
    if (Math.hypot(a[0] - b[0], a[1] - b[1]) < 0.5) add(`围栏 ${name} 第 ${i} 条边太短（<${'0.5'}）`);
  }
}

// 6) 牧场可用面积
const polyArea = (poly) => {
  let a = 0;
  for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
    a += poly[j][0] * poly[i][1] - poly[i][0] * poly[j][1];
  }
  return Math.abs(a / 2);
};
console.log('牧场面积:', polyArea(PASTURE).toFixed(0), '| 鸡舍面积:', polyArea(COOP).toFixed(0));

console.log('');
if (problems.length === 0) {
  console.log('LAYOUT OK - 无重叠');
} else {
  console.log('发现 ' + problems.length + ' 个问题:');
  problems.forEach((p) => console.log('  - ' + p));
}
// ---------------------------------------------------------------------------
// 季节元素 / 篝火 / 路灯 的位置检查
// 这些是后期加的对象，之前不在检查范围内，导致反复出现"挡门/压围栏"问题。
// ---------------------------------------------------------------------------
const EXTRA_OBJECTS = [
  { name: '篝火', x: 26, z: 8, r: 4 },
  { name: '路灯1', x: -20, z: 14, r: 2 },
  { name: '路灯2', x: 35, z: 15, r: 2 },
  { name: '路灯3', x: 12, z: -18, r: 2 },
  { name: '雪人1', x: 8, z: 4, r: 1.5 },
  { name: '雪人2', x: -31, z: 19, r: 1.5 },
  { name: '雪人3', x: 14, z: 30, r: 1.5 },
  { name: '水车', x: -93, z: 2, r: 5 },
  // 树木：用【树干半径】检测地面重叠，不用树冠半径
  // （树冠在高处，不会和地面物体穿模；只有树干和树根占地面空间）
  { name: '参天大树(树干)', x: BIG_TREE.x, z: BIG_TREE.z, r: 1.8 },
  ...TREE_SPECS.map(t => ({
    name: t.name + '(树干)',
    x: t.x,
    z: t.z,
    r: 0.8 * t.scale,
  })),
  // 木材堆
  { name: '木材堆', x: WOODPILE.x, z: WOODPILE.z, r: 3.5 },
];

// 门的位置（谷仓、农舍的门在局部 +Z 方向 d/2 处）
function doorOf(b) {
  const localZ = b.d / 2;
  const cos = Math.cos(b.rot), sin = Math.sin(b.rot);
  return { x: b.x + localZ * sin, z: b.z + localZ * cos };
}
const DOORS = ['barn', 'farmhouse']
  .filter(k => BUILDINGS[k])
  .map(k => ({ name: k, ...doorOf(BUILDINGS[k]) }));

let extraIssues = 0;

// 1. 门避让（9 单位内不能有东西）
for (const d of DOORS) {
  for (const o of EXTRA_OBJECTS) {
    const dist = Math.hypot(o.x - d.x, o.z - d.z);
    if (dist < 9) {
      console.log('  ✗ ' + o.name + ' 挡住了 ' + d.name + ' 的门（距离 ' + dist.toFixed(1) + ' < 9）');
      extraIssues++;
    }
  }
}

// 2. 围栏避让（不能在牧场/鸡舍内）
for (const o of EXTRA_OBJECTS) {
  for (const [polyName, poly] of [['牧场', PASTURE], ['鸡舍', COOP]]) {
    if (pointInPolygon(o.x, o.z, poly)) {
      console.log('  ✗ ' + o.name + ' 在' + polyName + '围栏内');
      extraIssues++;
    } else if (distToPolygonEdge(o.x, o.z, poly) < o.r) {
      console.log('  ✗ ' + o.name + ' 压到' + polyName + '围栏（距离 ' + distToPolygonEdge(o.x, o.z, poly).toFixed(1) + '）');
      extraIssues++;
    }
  }
}

// 3. 季节元素之间互相重叠
for (let i = 0; i < EXTRA_OBJECTS.length; i++) {
  for (let j = i + 1; j < EXTRA_OBJECTS.length; j++) {
    const a = EXTRA_OBJECTS[i], b = EXTRA_OBJECTS[j];
    const dist = Math.hypot(a.x - b.x, a.z - b.z);
    if (dist < a.r + b.r) {
      console.log('  ✗ ' + a.name + ' 和 ' + b.name + ' 重叠（距离 ' + dist.toFixed(1) + '）');
      extraIssues++;
    }
  }
}

if (extraIssues === 0) {
  console.log('季节元素/篝火/路灯 OK - 不挡门、不压围栏、不重叠');
} else {
  console.log('发现 ' + extraIssues + ' 个问题');
  process.exitCode = 1;
}