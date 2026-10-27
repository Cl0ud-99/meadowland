// ---------------------------------------------------------------------------
// 多边形工具：判断点/圆是否落在围栏内部，用于把动物关在栏里
// ---------------------------------------------------------------------------

// 射线法
export function pointInPolygon(x, z, poly) {
  let inside = false;
  for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
    const xi = poly[i][0], zi = poly[i][1];
    const xj = poly[j][0], zj = poly[j][1];
    const intersect = zi > z !== zj > z && x < ((xj - xi) * (z - zi)) / (zj - zi) + xi;
    if (intersect) inside = !inside;
  }
  return inside;
}

// 点到线段距离
function distToSegment(px, pz, ax, az, bx, bz) {
  const dx = bx - ax, dz = bz - az;
  const len2 = dx * dx + dz * dz;
  if (len2 === 0) return Math.hypot(px - ax, pz - az);
  let t = ((px - ax) * dx + (pz - az) * dz) / len2;
  t = Math.max(0, Math.min(1, t));
  return Math.hypot(px - (ax + dx * t), pz - (az + dz * t));
}

// 点到多边形边界的最短距离
export function distToPolygonEdge(x, z, poly) {
  let best = Infinity;
  for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
    const d = distToSegment(x, z, poly[j][0], poly[j][1], poly[i][0], poly[i][1]);
    if (d < best) best = d;
  }
  return best;
}

// 半径 r 的圆是否完整落在多边形内部（留出 margin 余量）
export function circleInsidePolygon(x, z, r, poly, margin = 0) {
  if (!pointInPolygon(x, z, poly)) return false;
  return distToPolygonEdge(x, z, poly) >= r + margin;
}

// 矩形是否与多边形相交（用于检查人走的路有没有撞到围栏）
