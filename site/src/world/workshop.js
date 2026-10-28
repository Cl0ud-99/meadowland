import * as THREE from '../../vendor/three/three.module.js';
import { toonLambert } from '../render/toon.js';

// 农舍东侧的修理棚工作区：
// 木架铁皮单坡顶 + 工作台 + 台钳 + 工具墙 + 零件箱/油桶/轮胎。
// 重点是“看起来真的有人在这里干活”，而不是设备堆场。

const mat = (color) => toonLambert({ color, flatShading: true, shared: false });
const box = (w, h, d, material) => new THREE.Mesh(new THREE.BoxGeometry(w, h, d), material);

function makeToolWall(model, x, z) {
  const g = new THREE.Group();
  const y = model.heightAt(x, z);
  g.position.set(x, y, z);

  const boardMat = mat(0x2f3d39);
  const holeMat = mat(0x3a3028);
  const steel = mat(0xbfc4c8);
  const darkSteel = mat(0x6f767c);
  const handleMat = mat(0x8a5a32);
  const redMat = mat(0xb5543c);
  const yellowMat = mat(0xd8b04a);

  const board = box(8.0, 1.8, 0.10, boardMat);
  board.position.set(0, 2.15, 0);
  board.castShadow = true;
  g.add(board);

  // 木框，让挂板从远处也能看出边界
  const frameMat = mat(0x8a6a44);
  for (const yy of [1.25, 3.05]) {
    const rail = box(8.15, 0.07, 0.12, frameMat);
    rail.position.set(0, yy, 0.02);
    g.add(rail);
  }
  for (const xx of [-4.05, 4.05]) {
    const stile = box(0.07, 1.87, 0.12, frameMat);
    stile.position.set(xx, 2.15, 0.02);
    g.add(stile);
  }

  // 挂板孔
  for (let ix = 0; ix < 12; ix++) {
    for (let iy = 0; iy < 4; iy++) {
      const hole = box(0.035, 0.035, 0.02, holeMat);
      hole.position.set(-3.4 + ix * 0.62, 1.6 + iy * 0.38, 0.06);
      g.add(hole);
    }
  }

  const zf = 0.10;
  // 锤子
  const hammer = new THREE.Group();
  const hh = box(0.06, 0.72, 0.06, handleMat);
  hh.position.y = -0.28;
  hammer.add(hh);
  const hhead = box(0.32, 0.14, 0.14, darkSteel);
  hhead.position.y = 0.10;
  hammer.add(hhead);
  hammer.position.set(-2.8, 2.5, zf);
  hammer.rotation.z = -0.12;
  g.add(hammer);

  // 锯
  const saw = new THREE.Group();
  const blade = box(0.04, 0.42, 0.72, steel);
  blade.position.z = -0.1;
  saw.add(blade);
  const sawHandle = box(0.06, 0.26, 0.28, handleMat);
  sawHandle.position.set(0, 0.18, -0.42);
  saw.add(sawHandle);
  saw.position.set(-1.7, 2.45, zf);
  saw.rotation.y = 0.08;
  g.add(saw);

  // 扳手
  const wrench = new THREE.Group();
  const shaft = box(0.06, 0.65, 0.06, steel);
  wrench.add(shaft);
  const jaw = box(0.20, 0.12, 0.06, steel);
  jaw.position.y = 0.33;
  wrench.add(jaw);
  wrench.position.set(-0.5, 2.5, zf);
  g.add(wrench);

  // 螺丝刀
  for (let i = 0; i < 3; i++) {
    const sd = new THREE.Group();
    const rod = new THREE.Mesh(new THREE.CylinderGeometry(0.018, 0.018, 0.38, 5), steel);
    rod.position.y = 0.10;
    sd.add(rod);
    const handle = new THREE.Mesh(new THREE.CylinderGeometry(0.055, 0.055, 0.22, 6), i === 0 ? redMat : i === 1 ? yellowMat : handleMat);
    handle.position.y = -0.18;
    sd.add(handle);
    sd.position.set(0.55 + i * 0.25, 2.55, zf);
    sd.rotation.z = i === 1 ? 0.08 : -0.04;
    g.add(sd);
  }

  // 钳子（交叉两条）
  for (const s of [-1, 1]) {
    const p = box(0.05, 0.58, 0.05, darkSteel);
    p.position.set(1.6, 2.55, zf);
    p.rotation.z = s * 0.22;
    g.add(p);
  }

  // 卷尺
  const tape = box(0.22, 0.20, 0.12, yellowMat);
  tape.position.set(2.5, 2.45, zf);
  g.add(tape);
  const tapeRing = new THREE.Mesh(new THREE.TorusGeometry(0.11, 0.025, 5, 10), darkSteel);
  tapeRing.position.set(2.5, 2.45, zf + 0.06);
  g.add(tapeRing);

  return g;
}

function makeShed(model) {
  const g = new THREE.Group();
  const y = model.heightAt(66, 0);
  g.position.set(66, y, 0);

  const wood = mat(0x8a6a44);
  const darkWood = mat(0x6f5236);
  const roofMat = mat(0x5f6f78);
  const roofEdge = mat(0x46545c);

  // 四根木柱
  for (const x of [-5.8, 5.8]) {
    for (const z of [-2.8, 2.5]) {
      const post = box(0.24, 3.3, 0.24, wood);
      post.position.set(x, 1.65, z);
      post.castShadow = true;
      g.add(post);
    }
  }

  // 背墙横板
  for (let i = 0; i < 5; i++) {
    const plank = box(11.6, 0.44, 0.12, i % 2 ? wood : darkWood);
    plank.position.set(0, 0.45 + i * 0.55, -2.78);
    plank.castShadow = true;
    g.add(plank);
  }
  // 侧墙各两块，留出前面开口
  for (const x of [-5.8, 5.8]) {
    for (let i = 0; i < 3; i++) {
      const plank = box(0.12, 0.44, 5.2, i % 2 ? wood : darkWood);
      plank.position.set(x, 0.45 + i * 0.55, -0.15);
      g.add(plank);
    }
  }

  // 单坡铁皮顶：后高前低
  const roof = new THREE.Group();
  roof.position.set(0, 3.58, -0.2);
  roof.rotation.x = 0.12;
  const sheet = box(12.8, 0.14, 6.2, roofMat);
  sheet.castShadow = true;
  roof.add(sheet);
  for (let i = 0; i < 13; i++) {
    const rib = box(0.05, 0.07, 6.16, roofEdge);
    rib.position.set(-6.0 + i * 1.0, 0.09, 0);
    roof.add(rib);
  }
  for (const z of [-3.1, 3.1]) {
    const trim = box(12.9, 0.16, 0.10, roofEdge);
    trim.position.z = z;
    roof.add(trim);
  }
  g.add(roof);

  // 工作台
  const benchTop = box(8.2, 0.16, 1.35, wood);
  benchTop.position.set(0, 0.96, -1.55);
  benchTop.castShadow = true;
  g.add(benchTop);
  for (const x of [-3.6, 3.6]) {
    for (const z of [-2.05, -1.05]) {
      const leg = box(0.16, 0.9, 0.16, darkWood);
      leg.position.set(x, 0.45, z);
      g.add(leg);
    }
  }
  const shelf = box(7.8, 0.10, 1.1, darkWood);
  shelf.position.set(0, 0.35, -1.55);
  g.add(shelf);

  // 台钳
  const vise = box(0.52, 0.24, 0.38, mat(0x5a646a));
  vise.position.set(3.1, 1.14, -1.45);
  g.add(vise);
  const viseJaw = box(0.22, 0.16, 0.42, mat(0x7a848a));
  viseJaw.position.set(3.35, 1.22, -1.45);
  g.add(viseJaw);

  // 台下工具柜
  const chest = box(2.7, 0.78, 1.05, mat(0xa84832));
  chest.position.set(-2.4, 0.43, -1.55);
  chest.castShadow = true;
  g.add(chest);
  for (let i = 0; i < 4; i++) {
    const drawer = box(2.4, 0.03, 0.03, mat(0x6f2f24));
    drawer.position.set(-2.4, 0.22 + i * 0.18, -1.02);
    g.add(drawer);
    const handle = box(0.35, 0.04, 0.03, mat(0xc8b89a));
    handle.position.set(-2.4, 0.22 + i * 0.18 + 0.04, -1.04);
    g.add(handle);
  }

  // 台面小物件
  const plane = box(1.0, 0.07, 0.22, darkWood);
  plane.position.set(-0.2, 1.08, -1.55);
  g.add(plane);

  return g;
}

function makeOilDrum(model, x, z) {
  const g = new THREE.Group();
  const y = model.heightAt(x, z);
  g.position.set(x, y, z);
  const body = new THREE.Mesh(new THREE.CylinderGeometry(0.52, 0.52, 1.15, 12), mat(0x4a5a6a));
  body.position.y = 0.58;
  body.castShadow = true;
  g.add(body);
  for (const yy of [0.28, 0.88]) {
    const band = new THREE.Mesh(new THREE.TorusGeometry(0.53, 0.035, 5, 14), mat(0x8a949c));
    band.rotation.x = Math.PI / 2;
    band.position.y = yy;
    g.add(band);
  }
  const cap = new THREE.Mesh(new THREE.CylinderGeometry(0.18, 0.18, 0.05, 8), mat(0x8a949c));
  cap.position.set(0.18, 1.17, 0.16);
  g.add(cap);
  return g;
}

function makeCrate(model, x, z, s, rot) {
  const g = new THREE.Group();
  const y = model.heightAt(x, z);
  g.position.set(x, y, z);
  g.rotation.y = rot;
  const wood = mat(0x9a7448);
  const dark = mat(0x6f5236);
  const body = box(s, s * 0.8, s * 0.9, wood);
  body.position.y = s * 0.4;
  body.castShadow = true;
  g.add(body);
  for (const yy of [0.15, 0.45, 0.7]) {
    const slat = box(s * 1.02, 0.05, s * 0.92, dark);
    slat.position.y = s * yy;
    g.add(slat);
  }
  return g;
}

function makeSawhorse(model, x, z) {
  const g = new THREE.Group();
  const y = model.heightAt(x, z);
  g.position.set(x, y, z);
  const wood = mat(0x8a6a44);
  const dark = mat(0x6f5236);
  for (const sx of [-1.2, 1.2]) {
    for (const sz of [-0.45, 0.45]) {
      const leg = box(0.12, 1.1, 0.12, dark);
      leg.position.set(sx, 0.55, sz);
      leg.rotation.z = sx > 0 ? -0.18 : 0.18;
      g.add(leg);
    }
  }
  const beam = box(2.9, 0.12, 0.18, wood);
  beam.position.y = 1.06;
  g.add(beam);
  const plank = box(3.3, 0.09, 0.55, wood);
  plank.position.set(0.2, 1.16, 0);
  g.add(plank);
  return g;
}

function makeSign(model, x, z) {
  const g = new THREE.Group();
  const y = model.heightAt(x, z);
  g.position.set(x, y, z);
  const wood = mat(0x6f5236);
  for (const sx of [-0.75, 0.75]) {
    const post = box(0.10, 1.5, 0.10, wood);
    post.position.set(sx, 0.75, 0);
    g.add(post);
  }
  const cv = document.createElement('canvas');
  cv.width = 320;
  cv.height = 128;
  const ctx = cv.getContext('2d');
  ctx.fillStyle = '#6f5236';
  ctx.fillRect(0, 0, 320, 128);
  ctx.strokeStyle = '#c8b89a';
  ctx.lineWidth = 5;
  ctx.strokeRect(7, 7, 306, 114);
  ctx.fillStyle = '#f2e3c8';
  ctx.font = 'bold 42px monospace';
  ctx.textAlign = 'center';
  ctx.fillText('WORKSHOP', 160, 78);
  const tex = new THREE.CanvasTexture(cv);
  tex.colorSpace = THREE.SRGBColorSpace;
  const board = new THREE.Mesh(new THREE.PlaneGeometry(2.1, 0.85), new THREE.MeshBasicMaterial({ map: tex }));
  board.position.set(0, 1.28, 0.06);
  g.add(board);
  const back = box(2.2, 0.95, 0.08, wood);
  back.position.set(0, 1.28, 0);
  g.add(back);
  return g;
}

export function buildWorkshop(model, rng) {
  const group = new THREE.Group();
  group.name = 'workshop';

  // 棚子 + 工作台 + 工具墙 + 台钳 + 工具柜
  group.add(makeShed(model));
  group.add(makeToolWall(model, 66, -2.55));

  // 外侧杂物
  group.add(makeOilDrum(model, 73.8, -1.2));
  group.add(makeCrate(model, 58.2, 4.0, 1.3, 0.22));
  group.add(makeCrate(model, 60.0, 4.8, 1.0, -0.15));
  group.add(makeCrate(model, 58.0, 1.6, 0.8, 0.5));
  group.add(makeSawhorse(model, 71.2, 5.0));
  group.add(makeSign(model, 56.8, 6.6));

  // 轮胎
  const tire = new THREE.Mesh(
    new THREE.TorusGeometry(0.46, 0.17, 7, 14),
    toonLambert({ color: 0x2a2a2a, flatShading: true, shared: false })
  );
  tire.position.set(57.6, model.heightAt(57.6, -0.3) + 0.46, -0.3);
  tire.rotation.x = 0.08;
  tire.castShadow = true;
  group.add(tire);

  // 木料堆
  const plankMat = mat(0x9a7448);
  for (let i = 0; i < 4; i++) {
    const plank = box(3.2, 0.10, 0.42, plankMat);
    plank.position.set(58.2, model.heightAt(58.2, 2.4) + 0.08 + i * 0.12, 2.4 + i * 0.03);
    plank.rotation.y = -0.12;
    plank.castShadow = true;
    group.add(plank);
  }

  // 棚下工作灯
  const lampY = model.heightAt(66, -0.2);
  const lampMat = new THREE.MeshBasicMaterial({ color: 0xffd39a, transparent: true, opacity: 0 });
  const lamp = new THREE.Mesh(new THREE.BoxGeometry(0.34, 0.12, 0.34), lampMat);
  lamp.position.set(66, lampY + 2.95, -0.2);
  group.add(lamp);
  const chain = box(0.02, 0.45, 0.02, mat(0x3a3a38));
  chain.position.set(66, lampY + 3.28, -0.2);
  group.add(chain);
  const lampLight = new THREE.PointLight(0xffc080, 0, 10, 2);
  lampLight.position.set(66, lampY + 2.9, -0.2);
  group.add(lampLight);

  // 可换配色：只记录木质/屋顶/工具柜的材质，工具和灯不动
  const THEMES = [
    { name: '原木木棚', wood: 0x8a6a44, dark: 0x6f5236, roof: 0x5f6f78, edge: 0x46545c, chest: 0xa84832 },
    { name: '森林绿棚', wood: 0x6f7a4a, dark: 0x55603a, roof: 0x4f6152, edge: 0x38483b, chest: 0x8a5a3a },
    { name: '工业蓝棚', wood: 0x7a8088, dark: 0x5a6068, roof: 0x48627a, edge: 0x334a60, chest: 0x3f5a7a },
    { name: '暖沙色棚', wood: 0xb08a58, dark: 0x8a6a40, roof: 0x7a5a48, edge: 0x5f4338, chest: 0xb5543c },
  ];
  const baseToMat = new Map();
  group.traverse((o) => {
    if (!o.isMesh || !o.material || !o.material.color) return;
    if (o.material.isMeshBasicMaterial) return;
    const hex = o.material.color.getHex();
    if (!baseToMat.has(hex)) baseToMat.set(hex, o.material);
  });
  const roleByBase = new Map([
    [0x8a6a44, 'wood'],
    [0x6f5236, 'dark'],
    [0x5f6f78, 'roof'],
    [0x46545c, 'edge'],
    [0xa84832, 'chest'],
    [0x9a7448, 'wood'],
    [0x55603a, 'dark'],
  ]);
  let styleIdx = 0;
  group.userData.styleNames = THEMES.map((t) => t.name);
  group.userData.getStyle = () => ({ idx: styleIdx, name: THEMES[styleIdx].name });
  group.userData.setStyle = (idx) => {
    const i = Math.max(0, Math.min(THEMES.length - 1, Number(idx) || 0));
    styleIdx = i;
    const th = THEMES[i];
    for (const [hex, material] of baseToMat) {
      const role = roleByBase.get(hex);
      if (!role) continue;
      material.color.setHex(th[role]);
    }
    group.userData.styleIdx = i;
    return true;
  };
  group.userData.setStyle(0);

  group.userData.setNight = (t) => {
    const k = Math.max(0, Math.min(1, (t - 0.72) / 0.23));
    const w = k * k * (3 - 2 * k);
    lampMat.opacity = w * 0.95;
    lampLight.intensity = w * 16;
    lampLight.visible = w > 0.04;
  };
  group.userData.setNight(0);

  return group;
}
