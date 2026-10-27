import * as THREE from '../../vendor/three/three.module.js';
import { toonLambert } from '../render/toon.js';

// ---------------------------------------------------------------------------
// 窗户系统：彻底避免 z-fighting 与体积相交
//
// 设计原则：
//   1. 窗户**不做成有厚度的盒子**，而是贴在墙面外的平面（Plane）
//      —— 盒子会与墙体、屋顶产生体积相交（截图里山墙窗的斜纹就是这么来的）
//   2. 每层严格分层，z 偏移固定且互不相同：
//        墙面  0.00
//        窗框  0.02
//        玻璃  0.05
//   3. 贴图用 canvas 程序化生成，带柔和高斯感边缘（用户建议的方案）
//      —— 不再是纯色块，边缘模糊过渡，视觉更柔和也更容易掩盖接缝
// ---------------------------------------------------------------------------

// ---------------------------------------------------------------------------
// 程序化生成窗户贴图
// ---------------------------------------------------------------------------
function makeWindowTexture(opts = {}) {
  const {
    size = 128,
    frameColor = '#6b4a32',
    glassTop = '#a8cce0',
    glassBottom = '#6a93b0',
    blur = 14,
    mullion = true,
  } = opts;

  const c = document.createElement('canvas');
  c.width = c.height = size;
  const g = c.getContext('2d');
  if (!g) return null;

  // 透明底
  g.clearRect(0, 0, size, size);

  // ---------- 窗框（外层，圆角矩形） ----------
  const pad = size * 0.04;
  const r = size * 0.12;
  g.save();
  g.beginPath();
  roundRect(g, pad, pad, size - pad * 2, size - pad * 2, r);
  g.fillStyle = frameColor;
  g.fill();
  g.restore();

  // ---------- 玻璃（内层，带渐变） ----------
  const inset = size * 0.14;
  const gw = size - inset * 2;
  const gr = r * 0.7;

  // 用 shadowBlur 制造柔边，而不是硬边
  g.save();
  g.shadowColor = 'rgba(140, 190, 220, 0.55)';
  g.shadowBlur = blur;
  g.beginPath();
  roundRect(g, inset, inset, gw, gw, gr);
  g.clip();

  const grad = g.createLinearGradient(0, inset, size * 0.6, size);
  grad.addColorStop(0, glassTop);
  grad.addColorStop(0.55, glassBottom);
  grad.addColorStop(1, glassTop);
  g.fillStyle = grad;
  g.fillRect(inset, inset, gw, gw);

  // 高光斜带（模拟玻璃反光）
  g.globalAlpha = 0.28;
  g.fillStyle = '#ffffff';
  g.beginPath();
  g.moveTo(inset - gw * 0.2, inset + gw * 0.55);
  g.lineTo(inset + gw * 0.55, inset - gw * 0.2);
  g.lineTo(inset + gw * 0.78, inset - gw * 0.2);
  g.lineTo(inset - gw * 0.2, inset + gw * 0.78);
  g.closePath();
  g.fill();
  g.globalAlpha = 1;
  g.restore();

  // ---------- 窗棂（十字分隔） ----------
  if (mullion) {
    g.save();
    g.beginPath();
    roundRect(g, inset, inset, gw, gw, gr);
    g.clip();
    g.strokeStyle = frameColor;
    g.lineWidth = size * 0.055;
    g.beginPath();
    g.moveTo(size / 2, inset);
    g.lineTo(size / 2, inset + gw);
    g.moveTo(inset, size / 2);
    g.lineTo(inset + gw, size / 2);
    g.stroke();
    g.restore();
  }

  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.anisotropy = 4;
  return tex;
}

// ---------------------------------------------------------------------------
// 夜间发光版窗户贴图
//
// 关键：结构和白天完全一致（同样的圆角窗框 + 十字窗棂），
// 只是把玻璃换成暖黄发光色 —— 这样夜里看到的是"四格窗在发光"，
// 而不是一整块发光矩形。
// ---------------------------------------------------------------------------
export function makeWindowGlowTexture(opts = {}) {
  const {
    size = 128,
    frameColor = '#5a3d28',
    glowInner = '#fff4d0',
    glowOuter = '#ffc96a',
    mullion = true,
  } = opts;

  const c = document.createElement('canvas');
  c.width = c.height = size;
  const g = c.getContext('2d');
  if (!g) return null;

  g.clearRect(0, 0, size, size);

  // 窗框（比白天略深，夜里要压住光）
  const pad = size * 0.04;
  const r = size * 0.12;
  g.save();
  g.beginPath();
  roundRect(g, pad, pad, size - pad * 2, size - pad * 2, r);
  g.fillStyle = frameColor;
  g.fill();
  g.restore();

  // 玻璃：暖黄渐变 + 外发光
  const inset = size * 0.14;
  const gw = size - inset * 2;
  const gr = r * 0.7;

  g.save();
  g.shadowColor = 'rgba(255, 200, 110, 0.85)';
  g.shadowBlur = 18;
  g.beginPath();
  roundRect(g, inset, inset, gw, gw, gr);
  g.clip();

  // 中心亮、边缘略暗，模拟灯泡在屋内的效果
  const grad = g.createRadialGradient(size / 2, size * 0.46, gw * 0.1, size / 2, size / 2, gw * 0.78);
  grad.addColorStop(0, glowInner);
  grad.addColorStop(0.55, glowOuter);
  grad.addColorStop(1, '#e8a94e');
  g.fillStyle = grad;
  g.fillRect(inset, inset, gw, gw);
  g.restore();

  // 十字窗棂：与白天同一套结构，把光分成四格
  if (mullion) {
    g.save();
    g.beginPath();
    roundRect(g, inset, inset, gw, gw, gr);
    g.clip();
    g.strokeStyle = frameColor;
    g.lineWidth = size * 0.055;
    g.beginPath();
    g.moveTo(size / 2, inset);
    g.lineTo(size / 2, inset + gw);
    g.moveTo(inset, size / 2);
    g.lineTo(inset + gw, size / 2);
    g.stroke();
    g.restore();
  }

  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.anisotropy = 4;
  return tex;
}

function roundRect(ctx, x, y, w, h, r) {
  const rr = Math.min(r, w / 2, h / 2);
  ctx.moveTo(x + rr, y);
  ctx.arcTo(x + w, y, x + w, y + h, rr);
  ctx.arcTo(x + w, y + h, x, y + h, rr);
  ctx.arcTo(x, y + h, x, y, rr);
  ctx.arcTo(x, y, x + w, y, rr);
  ctx.closePath();
}

// ---------------------------------------------------------------------------
// 窗户贴图缓存（同一款式只生成一次）
// ---------------------------------------------------------------------------
const texCache = new Map();
function getWindowTexture(key, opts) {
  if (!texCache.has(key)) {
    texCache.set(key, makeWindowTexture(opts));
  }
  return texCache.get(key);
}

// ---------------------------------------------------------------------------
// 创建一个窗户（单个平面，贴在墙面外）
//
// 参数：
//   w, h     —— 窗户尺寸
//   pos      —— 世界位置（已经算好，包含建筑旋转）
//   rotY     —— 朝向
//   layer    —— 层偏移：0 = 紧贴墙面
//   variant  —— 贴图款式
// ---------------------------------------------------------------------------
export const WINDOW_LAYER = { wall: 0, frame: 0.02, glass: 0.05 };

export function makeWindowPlane(w, h, pos, rotY, layerOffset = 0, variant = 'default') {
  const opts = variant === 'barn'
    ? { frameColor: '#6b4a32', glassTop: '#b8d4e4', glassBottom: '#7a9db8' }
    : { frameColor: '#7a5238', glassTop: '#a8cce0', glassBottom: '#6a93b0' };

  const tex = getWindowTexture(variant, opts);

  const geo = new THREE.PlaneGeometry(w, h);
  const mat = toonLambert({
    map: tex,
    transparent: true,
    alphaTest: 0.02,
    side: THREE.DoubleSide,
    // 不写深度，避免与墙面互相遮挡时产生闪烁
    depthWrite: false,
    polygonOffset: true,
    polygonOffsetFactor: -2,
    polygonOffsetUnits: -2,
  });

  const mesh = new THREE.Mesh(geo, mat);
  mesh.position.copy(pos);
  mesh.rotation.y = rotY;
  mesh.renderOrder = 1;
  mesh.name = 'window';
  return mesh;
}

// 沿墙面的法线方向偏移（用于把窗户推到墙外）