import * as THREE from 'three';
import { tint, merge } from '../util/geo.js';
import { toonLambert } from '../render/toon.js';

// ---------------------------------------------------------------------------
// 猫头鹰彩蛋（致敬《双峰》）
//
// 只有一只，随机停落在谷仓 / 农舍 / 水塔 / 风车 其中一处屋顶。
// - 平时站着，偶尔左右转头
// - 特写时盯着镜头，不能飞走
// - 视角拉远后才会飞到下一个屋顶
// ---------------------------------------------------------------------------

// 翅膀收拢角度（弧度）：1.35 rad ≈ 77°，翅膀几乎垂直向下贴住身体
const FOLD_ANGLE = 1.35;

// 四个可停落的屋顶（世界坐标由 model.heightAt + 建筑高度算出）
// 高度必须是【屋脊顶点】的真实高度（从 farm.js 的几何体算出来）：
//   谷仓:  H=9    + gable 5.4  = 14.4
//   农舍:  H=6.2  + gable 4.2  = 10.4
//   水塔:  legH=9 + 4.2 + cone 2.0 = 15.2
//   风车:  H=22   + 2.6 + gable 1.6 = 26.2
//
// 猫头鹰的脚底在局部 y=0（爪子 y≈0.05），所以直接坐在屋脊上即可，
// 再加 0.05 避免和屋顶面 z-fighting。
const ROOFS = [
  { name: '谷仓', x: -30, z: 0, h: 14.45, rot: -0.22 },
  { name: '农舍', x: 30, z: -18, h: 10.45, rot: 0.34 },
  // ★ 水塔的停留高度【不能硬编码】——
  //   三种造型（metal/barrel/shingle）的屋顶高度差很多：
  //     metal   局部最高 17.31
  //     barrel  局部最高 14.39
  //     shingle 局部最高 13.74
  //   这里先给 metal 的值，运行时由 refreshWatertowerPerch() 动态修正。
  { name: '水塔', x: 48, z: 10, h: 17.31, rot: 0, dynamic: 'watertower' },
  // ★ 风车的停留高度同样不能硬编码 —— 五种造型塔顶差 8 米：
  //     modern 19.62 / mediterranean 11.62 / ranch 11.70 / brick 13.45 / candy 11.49
  //   这里先给 ranch 的值，运行时由 refreshWindmillPerch() 动态修正。
  { name: '风车', x: 64, z: 36, h: 11.70, rot: 0, dynamic: 'windmill' },
];

// 水塔停留点高度修正（切换造型后调用）
//
// ★ ROOFS[].h 是【相对地面】的高度（和谷仓 14.45 同一坐标系），
//   而 Box3.setFromObject 返回的是【世界坐标】（含地面 5.3）。
//   直接赋值会让猫头鹰抬高 5 米多 —— 表现为"悬在半空"。
//   所以必须减去地面高度。
export function refreshWatertowerPerch(scene, model) {
  const roof = ROOFS.find((r) => r.dynamic === 'watertower');
  if (!roof || !scene) return null;
  let wt = null;
  scene.traverse((o) => {
    if (o.isMesh && o.name === 'watertower') wt = o;
  });
  if (!wt) return null;
  wt.updateMatrixWorld(true);
  const bb = new THREE.Box3().setFromObject(wt);
  // 地面高度（水塔所在位置）
  const gy = model && model.heightAt ? model.heightAt(roof.x, roof.z) : 0;
  // 猫头鹰脚底在局部 y=0，坐在屋顶尖上
  roof.h = bb.max.y - gy;
  return roof.h;
}

// 风车停留点高度修正（切换造型后调用）
//
// ★ 和水塔同样的坐标系问题：
//   ROOFS[].h 是【相对地面】的高度，Box3.setFromObject 返回【世界坐标】。
//   必须减去地面高度，否则猫头鹰会悬在半空 5 米。
//
// ★ 风车还有额外问题：brick/candy 有 1.5 倍缩放，
//   包围盒会包含缩放，所以要用【世界坐标】算完再减地面 —— 不能减两次缩放。
export function refreshWindmillPerch(scene, model) {
  const roof = ROOFS.find((r) => r.dynamic === 'windmill');
  if (!roof || !scene) return null;
  let wm = null;
  scene.traverse((o) => {
    if (o.name === 'windmill' && o.userData && o.userData.windmillStyle) wm = o;
  });
  if (!wm) return null;
  wm.updateMatrixWorld(true);
  // 只算塔身（排除叶片，叶片半径 7+ 会把包围盒撑大）
  let tower = wm;
  wm.children.forEach((c) => { if (c.name !== 'windmillBlades') tower = c; });
  tower.updateMatrixWorld(true);

  let maxY = -1e9;
  tower.traverse((o) => {
    if (!o.isMesh) return;
    o.geometry.computeBoundingBox();
    const g = o.geometry.boundingBox;
    o.updateMatrixWorld(true);
    for (const x of [g.min.x, g.max.x]) {
      for (const y of [g.min.y, g.max.y]) {
        for (const z of [g.min.z, g.max.z]) {
          const v = new THREE.Vector3(x, y, z);
          v.applyMatrix4(o.matrixWorld);
          if (v.y > maxY) maxY = v.y;
        }
      }
    }
  });
  const gy = model && model.heightAt ? model.heightAt(roof.x, roof.z) : 0;
  roof.h = maxY - gy;
  return roof.h;
}

// ---------------------------------------------------------------------------
// 猫头鹰几何体：低多边形，突出"大眼盘"特征
// ---------------------------------------------------------------------------
function makeOwlMesh() {
  const root = new THREE.Group();
  root.name = 'owl';

  const parts = [];

  // 身体：椭球（矮胖）
  const body = new THREE.IcosahedronGeometry(0.42, 1);
  body.scale(1.0, 1.25, 0.9);
  body.translate(0, 0.52, 0);
  parts.push(tint(body, 0x6a5a48));

  // 头：大球（猫头鹰头身几乎一体）
  const head = new THREE.IcosahedronGeometry(0.34, 1);
  head.scale(1.1, 1.0, 0.95);
  head.translate(0, 1.05, 0.02);
  parts.push(tint(head, 0x7a6a56));

  // 两个眼盘（白色大圆，猫头鹰最标志性的特征）
  for (const side of [-1, 1]) {
    const disc = new THREE.CylinderGeometry(0.155, 0.155, 0.05, 10);
    disc.rotateX(Math.PI / 2);
    disc.translate(side * 0.15, 1.10, 0.28);
    parts.push(tint(disc, 0xe8e0d0));

    // 瞳孔（黑色小球，特写时"盯着你看"）
    const pupil = new THREE.SphereGeometry(0.075, 8, 6);
    pupil.translate(side * 0.15, 1.10, 0.32);
    parts.push(tint(pupil, 0x1a1410));

    // 高光（让眼睛有神）
    const glint = new THREE.SphereGeometry(0.028, 5, 4);
    glint.translate(side * 0.15 + 0.025, 1.13, 0.36);
    parts.push(tint(glint, 0xffffff));
  }

  // 喙（小三角，朝下）
  const beak = new THREE.ConeGeometry(0.06, 0.14, 4);
  beak.rotateX(Math.PI);
  beak.translate(0, 0.97, 0.34);
  parts.push(tint(beak, 0xc8a050));

  // 两只耳朵（角羽）
  for (const side of [-1, 1]) {
    const ear = new THREE.ConeGeometry(0.08, 0.18, 4);
    ear.translate(side * 0.20, 1.32, 0);
    parts.push(tint(ear, 0x6a5a48));
  }

  // 注意：翅膀【不能】合并进 body，否则无法单独扇动。
  // 翅膀在下面单独创建成子 Group。

  // 爪子（两个小黄三角）
  for (const side of [-1, 1]) {
    const foot = new THREE.ConeGeometry(0.06, 0.10, 4);
    foot.rotateX(Math.PI);
    foot.translate(side * 0.13, 0.05, 0.10);
    parts.push(tint(foot, 0xc8a050));
  }

  // 尾巴（短，往后翘）
  const tail = new THREE.ConeGeometry(0.14, 0.28, 4);
  tail.rotateX(-Math.PI / 2.4);
  tail.translate(0, 0.28, -0.36);
  parts.push(tint(tail, 0x5a4a38));

  // 合并所有部件（带顶点色）
  const mesh = merge(parts);
  const mat = toonLambert({
    vertexColors: true,
    flatShading: true,
  });
  const bodyMesh = new THREE.Mesh(mesh, mat);
  bodyMesh.castShadow = true;
  root.add(bodyMesh);

  // ---------- 独立翅膀（可扇动）----------
  // 每只翅膀是一个 Group，枢轴在肩膀位置。
  // 翅膀网格从枢轴向外延伸，这样 rotation.z 就是"扇动"。
  const wings = {};
  for (const side of [-1, 1]) {
    const pivot = new THREE.Group();
    // 枢轴在肩膀：身体两侧偏上
    pivot.position.set(side * 0.30, 0.78, 0);

    const wParts = [];
    // 翅膀主体（从枢轴往外）
    const wingMain = new THREE.BoxGeometry(0.42, 0.10, 0.34);
    wingMain.translate(side * 0.21, 0, 0);
    wParts.push(tint(wingMain, 0x5a4a38));
    // 翅尖（略窄）
    const tip = new THREE.BoxGeometry(0.22, 0.08, 0.24);
    tip.translate(side * 0.52, -0.01, 0.02);
    wParts.push(tint(tip, 0x4a3a2a));
    // 羽毛纹路（3 条浅色细条）
    for (let i = 0; i < 3; i++) {
      const stripe = new THREE.BoxGeometry(0.36, 0.012, 0.04);
      stripe.translate(side * 0.21, 0.055, -0.10 + i * 0.10);
      wParts.push(tint(stripe, 0x7a6a56));
    }

    const wingGeo = merge(wParts);
    const wingMesh = new THREE.Mesh(wingGeo, mat.clone());
    wingMesh.castShadow = true;
    pivot.add(wingMesh);
    root.add(pivot);

    // 收拢姿态：翅膀垂下贴住身体两侧
    //
    // ★ 符号约定（很重要，之前写反了导致翅膀朝天）：
    //   左翅：正角度 = 向下（翅膀延伸到 -X，绕 Z 正向旋转把它压到 -Y）
    //   右翅：负角度 = 向下（翅膀延伸到 +X，绕 Z 负向旋转把它压到 -Y）
    //
    //   所以 side=-1（左）→ +FOLD，side=+1（右）→ -FOLD
    //   即 pivot.rotation.z = -side * FOLD_ANGLE
    pivot.rotation.z = -side * FOLD_ANGLE;
    wings[side === -1 ? 'left' : 'right'] = pivot;
  }

  root.userData.wings = wings;
  return root;
}



// ---------------------------------------------------------------------------
// 构建
// ---------------------------------------------------------------------------
export function buildOwl(model, rng) {
  const owl = makeOwlMesh();
  owl.userData.isOwl = true;

  // 当前停落点索引
  let roofIdx = Math.floor(rng.next() * ROOFS.length);

  // 状态机：perch（停着） / fly（飞往下一个屋顶）
  const state = {
    mode: 'perch',
    headTurn: 0,          // 当前头部转角
    headTarget: 0,        // 目标转角
    headTimer: 2 + rng.next() * 3,
    lookAtCamera: false,  // 特写时盯着镜头
    // 飞行
    flyFrom: new THREE.Vector3(),
    flyTo: new THREE.Vector3(),
    flyT: 0,
    flyDur: 3.5,
    nextFlyTimer: 18 + rng.next() * 22,   // 下次换屋顶的倒计时
    phase: rng.next() * Math.PI * 2,      // 动画相位（呼吸抖动用）
    shakeOffset: rng.next() * 5,          // 抖翅相位偏移
  };

  function roofPos(idx) {
    const r = ROOFS[idx];
    const gy = model.heightAt(r.x, r.z);
    return new THREE.Vector3(r.x, gy + r.h, r.z);
  }

  function placeOnRoof(idx) {
    const p = roofPos(idx);
    owl.position.copy(p);
    owl.rotation.y = ROOFS[idx].rot + Math.PI * 0.25;
  }

  placeOnRoof(roofIdx);

  // -------------------------------------------------------------------------
  // 更新
  //   opts.closeup: 是否处于特写（此时不能飞走，且盯着镜头）
  //   opts.camera: 相机位置（用于计算"看向镜头"的角度）
  // -------------------------------------------------------------------------
  owl.userData.update = (t, dt, opts = {}) => {
    const closeup = !!opts.closeup;
    const camera = opts.camera;

    // ---------- 飞行状态 ----------
    if (state.mode === 'fly') {
      state.flyT += dt / state.flyDur;
      const k = Math.min(1, state.flyT);

      // 抛物线飞行（中途升高，避免穿过建筑）
      const e = k < 0.5 ? 2 * k * k : 1 - Math.pow(-2 * k + 2, 2) / 2;
      owl.position.lerpVectors(state.flyFrom, state.flyTo, e);
      // 弧线：中间抬高
      owl.position.y += Math.sin(e * Math.PI) * 8;

      // 朝飞行方向
      const dx = state.flyTo.x - state.flyFrom.x;
      const dz = state.flyTo.z - state.flyFrom.z;
      if (Math.abs(dx) > 0.01 || Math.abs(dz) > 0.01) {
        owl.rotation.y = Math.atan2(dx, dz);
      }
      // 飞行时身体前倾
      owl.rotation.x = Math.sin(e * Math.PI) * 0.35;

      // ---------- 翅膀扇动 ----------
      // 飞行时翅膀在"展开"位置上下扇动。
      // 展开基准 0.35 rad（翅膀略向上扬），扇动幅度 ±1.05 rad（±60°）。
      const flapSpeed = 9 + Math.sin(k * Math.PI) * 5;
      const flapAng = Math.sin(t * flapSpeed) * 1.05;
      const wings = owl.userData.wings;
      if (wings) {
        // 起飞瞬间从收拢角度过渡到"水平展开"
        // unfold=0 -> 收拢（±FOLD），unfold=1 -> 水平（0）
        const unfold = Math.min(1, k / 0.25);
        const base = FOLD_ANGLE * (1 - unfold);
        // 左翅正=向下，右翅负=向下；flapAng 正负对称扇动
        wings.left.rotation.z = base + flapAng;
        wings.right.rotation.z = -base - flapAng;
        wings.left.rotation.x = Math.sin(t * flapSpeed) * 0.12;
        wings.right.rotation.x = Math.sin(t * flapSpeed) * 0.12;
      }

      if (k >= 1) {
        state.mode = 'perch';
        owl.position.copy(state.flyTo);
        owl.rotation.x = 0;
        owl.scale.set(1, 1, 1);
        owl.rotation.y = ROOFS[roofIdx].rot + Math.PI * 0.25;
        // 翅膀收拢（贴住身体）
        const w = owl.userData.wings;
        if (w) {
          w.left.rotation.z = FOLD_ANGLE;
          w.right.rotation.z = -FOLD_ANGLE;
          w.left.rotation.x = 0;
          w.right.rotation.x = 0;
        }
        state.nextFlyTimer = 20 + rng.next() * 25;
      }
      return;
    }

    // ---------- 停落状态 ----------
    state.headTimer -= dt;

    if (closeup && camera) {
      // 特写：盯着镜头
      state.lookAtCamera = true;
      const dx = camera.position.x - owl.position.x;
      const dz = camera.position.z - owl.position.z;
      const targetYaw = Math.atan2(dx, dz);

      // 头部朝向镜头（限制在 ±70°，否则身体会扭成麻花）
      let diff = targetYaw - owl.rotation.y;
      while (diff > Math.PI) diff -= Math.PI * 2;
      while (diff < -Math.PI) diff += Math.PI * 2;
      diff = Math.max(-1.22, Math.min(1.22, diff));

      state.headTarget = diff;
      // 平滑转头
      state.headTurn += (state.headTarget - state.headTurn) * Math.min(1, dt * 5);
    } else {
      // 非特写：随机左右转头
      state.lookAtCamera = false;
      if (state.headTimer <= 0) {
        // 随机选一个新角度：正前方 / 左转 / 右转
        const choices = [0, 0.7, -0.7, 1.2, -1.2];
        state.headTarget = choices[Math.floor(rng.next() * choices.length)];
        state.headTimer = 1.5 + rng.next() * 4;
      }
      state.headTurn += (state.headTarget - state.headTurn) * Math.min(1, dt * 3.5);
    }

    // 应用头部旋转（整个身体绕 Y 转，因为头和身体是一体的）
    owl.rotation.y = ROOFS[roofIdx].rot + Math.PI * 0.25 + state.headTurn;

    // ---------- 停歇时翅膀：收拢 + 轻微呼吸 + 偶尔抖翅 ----------
    const wings = owl.userData.wings;
    if (wings) {
      // 收拢角度：翅膀垂直向下贴住身体
      const foldBase = FOLD_ANGLE;
      // 1. 轻微呼吸抖动（幅度 0.04，1.1Hz）—— 极小，不破坏收拢姿态
      const breathe = Math.sin(t * 1.1 + state.phase) * 0.04;
      // 2. 偶尔抖翅：抖完立刻回到收拢
      const shakeCycle = (t * 1.0 + state.shakeOffset) % 5;
      const shake = shakeCycle < 0.9
        ? Math.sin(shakeCycle / 0.9 * Math.PI * 3) * 0.28 * (1 - shakeCycle / 0.9)
        : 0;

      // 抖翅时翅膀抬起 = 收拢角减小
      // 左翅正角度向下，右翅负角度向下
      const fold = foldBase - shake;
      wings.left.rotation.z = fold + breathe;
      wings.right.rotation.z = -fold - breathe;
      wings.left.rotation.x = 0;
      wings.right.rotation.x = 0;
    }

    // 呼吸感（极轻微的上下浮动）
    const base = roofPos(roofIdx);
    owl.position.y = base.y + Math.sin(t * 1.2) * 0.015;

    // ---------- 换屋顶（只在非特写时）----------
    if (!closeup) {
      state.nextFlyTimer -= dt;
      if (state.nextFlyTimer <= 0) {
        // 选一个不同的屋顶
        let next = Math.floor(rng.next() * ROOFS.length);
        if (next === roofIdx) next = (next + 1) % ROOFS.length;

        state.mode = 'fly';
        state.flyFrom.copy(owl.position);
        state.flyTo.copy(roofPos(next));
        state.flyT = 0;
        state.flyDur = 2.8 + rng.next() * 1.6;
        roofIdx = next;
        owl.userData.currentRoof = ROOFS[roofIdx].name;
      }
    }
  };

  owl.userData.currentRoof = ROOFS[roofIdx].name;
  owl.userData.getRoofName = () => ROOFS[roofIdx].name;

  // 强制让猫头鹰停到指定屋顶（调试/验证用，不参与正常逻辑）
  //   ★ 正常游戏里猫头鹰是随机换屋顶的，这个接口用于测试每种造型的停留高度。
  owl.userData.forcePerch = (roofName) => {
    const idx = ROOFS.findIndex((r) => r.name === roofName);
    if (idx < 0) return false;
    roofIdx = idx;
    state.mode = 'perch';
    state.flyT = 0;
    placeOnRoof(idx);
    owl.userData.currentRoof = ROOFS[idx].name;
    return true;
  };

  // 更新某个停留点的高度（水塔换造型时用）
  //
  // ★ 关键：如果猫头鹰【正停在这块屋顶上】，不能原地瞬移 ——
  //   造型刚换，屋顶高度可能差 3 米，原地改 y 会看到"猫头鹰突然弹起/陷下去"。
  //   正确做法：让它先飞走，等切换完成后（下一轮随机）再落回来。
  //   如果它停在别的屋顶上，只改数值，不打扰。
  owl.userData.setPerchHeight = (roofName, h, opts = {}) => {
    const r = ROOFS.find((x) => x.name === roofName);
    if (!r) return false;
    const old = r.h;
    r.h = h;

    const onThisRoof = ROOFS[roofIdx] === r;
    if (onThisRoof && state.mode === 'perch') {
      if (opts.forceFlyAway) {
        // 让它立刻飞走（换到另一块屋顶），避免原地弹跳
        let next = Math.floor(rng.next() * ROOFS.length);
        if (next === roofIdx) next = (next + 1) % ROOFS.length;
        state.mode = 'fly';
        state.flyFrom.copy(owl.position);
        state.flyTo.copy(roofPos(next));
        state.flyT = 0;
        state.flyDur = 2.2 + rng.next() * 0.8;
        roofIdx = next;
        owl.userData.currentRoof = ROOFS[roofIdx].name;
        return { old, now: h, flewAway: true };
      }
      // 不飞走时（比如初始化），直接对齐
      owl.position.y = h;
    }
    return { old, now: h, flewAway: false };
  };
  owl.userData.isFlying = () => state.mode === 'fly';

  return owl;
}