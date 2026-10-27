import * as THREE from '../../vendor/three/three.module.js';
import { toonLambert } from '../render/toon.js';
import { makeSnowman, applySnowmanStyle, SNOWMAN_STYLES } from './snowmanDemo.js';

// ---------------------------------------------------------------------------
// 季节特效：四季专属元素，随季节滑杆渐显渐隐
//
// 滑杆 t ∈ [0, 3]：  0=春  1=夏  2=秋  3=冬
//
// 每种元素有自己的"活跃区间"（用高斯权重），所以：
//   春天元素在 t=0 附近最明显，t=1 时完全消失
//   冬天元素在 t=3 附近最明显，t=2 时开始出现
//
// 所有粒子都用 InstancedMesh / Points，避免 draw call 爆炸。
// ---------------------------------------------------------------------------

// 高斯权重：距离 center 越近越接近 1，超过 width 迅速衰减
function bell(t, center, width = 0.55) {
  const d = (t - center) / width;
  return Math.exp(-d * d);
}

// 让 t 在环上（春->冬->春）循环取值
function wrapDist(a, b, period = 4) {
  let d = Math.abs(a - b);
  return Math.min(d, period - d);
}

function ringBell(t, center, width = 0.55, period = 4) {
  const d = wrapDist(t, center, period) / width;
  return Math.exp(-d * d);
}

// ---------------------------------------------------------------------------
// 飘落粒子系统（樱花 / 落叶 / 雪 共用）
// ---------------------------------------------------------------------------
function makeFallingField(opts) {
  const {
    count, color, size, area, speed, drift, spin,
    yTop, yBottom,
  } = opts;

  const geo = new THREE.PlaneGeometry(size, size * 0.7);
  const mat = new THREE.MeshBasicMaterial({
    color,
    transparent: true,
    opacity: 0,
    side: THREE.DoubleSide,
    depthWrite: false,
  });

  const mesh = new THREE.InstancedMesh(geo, mat, count);
  mesh.frustumCulled = false;

  const parts = [];
  for (let i = 0; i < count; i++) {
    parts.push({
      x: (Math.random() - 0.5) * area * 2,
      z: (Math.random() - 0.5) * area * 2,
      y: yBottom + Math.random() * (yTop - yBottom),
      vy: speed * (0.7 + Math.random() * 0.6),
      phase: Math.random() * Math.PI * 2,
      spin: (Math.random() - 0.5) * spin,
      rot: Math.random() * Math.PI * 2,
      scale: 0.6 + Math.random() * 0.7,
    });
  }

  const dummy = new THREE.Object3D();
  let opacity = 0;

  return {
    mesh,
    setOpacity(v) {
      opacity = v;
      mat.opacity = v;
      mesh.visible = v > 0.01;
    },
    update(dt, t) {
      if (!mesh.visible) return;
      for (let i = 0; i < parts.length; i++) {
        const p = parts[i];
        p.y -= p.vy * dt;
        // 横向漂移（左右摇摆）
        const sway = Math.sin(t * 1.2 + p.phase) * drift;
        p.rot += p.spin * dt;

        if (p.y < yBottom) {
          p.y = yTop;
          p.x = (Math.random() - 0.5) * area * 2;
          p.z = (Math.random() - 0.5) * area * 2;
        }

        dummy.position.set(p.x + sway, p.y, p.z);
        dummy.rotation.set(p.rot * 0.7, p.rot, p.rot * 0.4);
        dummy.scale.setScalar(p.scale);
        dummy.updateMatrix();
        mesh.setMatrixAt(i, dummy.matrix);
      }
      mesh.instanceMatrix.needsUpdate = true;
    },
  };
}

// ---------------------------------------------------------------------------
// 蝴蝶 / 蜜蜂（小飞虫）
// ---------------------------------------------------------------------------
function makeBugs(count, colorA, colorB, area, yBase, size) {
  const group = new THREE.Group();
  const bugs = [];

  for (let i = 0; i < count; i++) {
    const g = new THREE.Group();

    // 两片翅膀
    const wingGeo = new THREE.PlaneGeometry(size, size * 0.8);
    const matA = new THREE.MeshBasicMaterial({
      color: colorA, transparent: true, opacity: 0, side: THREE.DoubleSide, depthWrite: false,
    });
    const matB = new THREE.MeshBasicMaterial({
      color: colorB, transparent: true, opacity: 0, side: THREE.DoubleSide, depthWrite: false,
    });
    const wingL = new THREE.Mesh(wingGeo, matA);
    const wingR = new THREE.Mesh(wingGeo, matB);
    wingL.position.x = -size * 0.5;
    wingR.position.x = size * 0.5;
    g.add(wingL, wingR);

    g.userData = {
      matA, matB, wingL, wingR,
      cx: (Math.random() - 0.5) * area * 2,
      cz: (Math.random() - 0.5) * area * 2,
      cy: yBase + Math.random() * 3,
      r: 2 + Math.random() * 5,
      ang: Math.random() * Math.PI * 2,
      speed: 0.4 + Math.random() * 0.8,
      phase: Math.random() * Math.PI * 2,
      flap: 6 + Math.random() * 6,
    };
    group.add(g);
    bugs.push(g);
  }

  return {
    group,
    setOpacity(v) {
      for (const b of bugs) {
        b.userData.matA.opacity = v * 0.9;
        b.userData.matB.opacity = v * 0.9;
        b.visible = v > 0.01;
      }
    },
    update(dt, t) {
      for (const b of bugs) {
        const u = b.userData;
        if (!b.visible) continue;
        u.ang += dt * u.speed;
        b.position.set(
          u.cx + Math.cos(u.ang) * u.r,
          u.cy + Math.sin(t * 1.8 + u.phase) * 0.6,
          u.cz + Math.sin(u.ang * 1.3) * u.r
        );
        b.rotation.y = -u.ang + Math.PI / 2;
        // 翅膀拍动
        const f = Math.sin(t * u.flap + u.phase);
        u.wingL.rotation.y = f * 0.9;
        u.wingR.rotation.y = -f * 0.9;
      }
    },
  };
}

// ---------------------------------------------------------------------------
// 南瓜堆（秋天）
// ---------------------------------------------------------------------------
function makePumpkins(rng, model) {
  const group = new THREE.Group();
  const mats = [];
  // 必须避开篝火 (26,8)：原来 [18,4] 和 [22,8] 离篝火只有 4~8 单位，
  // 会和火焰、石圈重叠。现在都挪到远离篝火的位置。
  const spots = [
    [-12, 20], [-8, 23], [-15, 24],
    [-16, -5], [-12, -2],
    [-36, 16], [-40, 19],
  ];

  for (const [x, z] of spots) {
    const s = 0.5 + rng.next() * 0.4;
    const mat = toonLambert({
      color: 0xe07a28, flatShading: true, transparent: true, opacity: 0,
    });
    mats.push(mat);
    const pumpkin = new THREE.Mesh(new THREE.SphereGeometry(s, 8, 6), mat);
    pumpkin.scale.y = 0.72;
    // ★ 必须按地形高度放置，否则会埋在地下（台地 y≈5.5）
    const gy = model ? model.heightAt(x, z) : 0;
    pumpkin.position.set(x, gy + s * 0.5, z);
    // 顶上的小柄
    const stem = new THREE.Mesh(
      new THREE.CylinderGeometry(s * 0.1, s * 0.14, s * 0.35, 5),
      toonLambert({ color: 0x6a8a3a, transparent: true, opacity: 0, flatShading: true })
    );
    mats.push(stem.material);
    stem.position.set(0, s * 0.75, 0);
    pumpkin.add(stem);
    group.add(pumpkin);
  }

  return {
    group,
    setOpacity(v) {
      for (const m of mats) m.opacity = v;
      group.visible = v > 0.01;
    },
    update() {},
  };
}

// ---------------------------------------------------------------------------
// 雪人（冬天）—— 使用 snowmanDemo 的精细模型，7 种风格可切换
// ---------------------------------------------------------------------------
function makeSnowmen(model) {
  const group = new THREE.Group();
  group.name = 'snowmen';

  const spots = [
    [8, 4],      // 场景中心偏东
    [-31, 19],   // 谷仓北侧（距门 9.3，不挡门）
    [14, 30],    // 牧场东南角外
  ];

  const snowmen = [];

  for (const [x, z] of spots) {
    const sm = makeSnowman();
    sm.name = 'snowman';
    const gy = model ? model.heightAt(x, z) : 0;
    sm.position.set(x, gy, z);
    // 每个雪人独立换装
    sm.userData.snowmanStyle = 'lowpoly';
    sm.userData.setSnowmanStyle = (id) => {
      const st = SNOWMAN_STYLES.find((s) => s.id === id);
      if (!st) return false;
      sm.userData.snowmanStyle = st.id;
      applySnowmanStyle(sm, st.id);
      return true;
    };
    sm.userData.getSnowmanStyle = () => sm.userData.snowmanStyle;
    group.add(sm);
    snowmen.push(sm);
  }

  group.userData.snowmen = snowmen;

  return {
    group,
    setOpacity(v) {
      group.visible = v > 0.01;
    },
    update() {},
  };
}

// ---------------------------------------------------------------------------
// 主入口
// ---------------------------------------------------------------------------
export function buildSeasonFX(model, rng, quality) {
  const group = new THREE.Group();
  group.name = 'seasonFX';

  // ---------- 飘散范围 ----------
  //
  // AREA 是【半边长】（实际覆盖边长 = AREA * 2）。
  //
  // ★ 本次调整（用户要求"面积再扩大一倍、高度再增加 50%"）：
  //   面积 ×2  → 半边长 ×√2：90 → 127（覆盖 180×180 → 254×254）
  //   高度 +50% → 26 → 39（离地 27 → 40 米）
  //
  // ★ 必须同步放大粒子数量，否则体积变成 3 倍、粒子数不变，
  //   密度掉到 1/3，看起来就是"碎片变稀了"，和用户想要的相反。
  //   数量系数 = 面积倍数 × 高度倍数 = 2 × 1.5 = 3。
  const AREA = 127;
  const VOLUME_SCALE = 3;
  const baseY = model.heightAt(0, 0);
  const topY = baseY + 39;
  const botY = baseY - 1;

  // 低配减半粒子
  const q = quality?.tier === 'low' ? 0.45 : quality?.tier === 'medium' ? 0.7 : 1;
  // 飘落碎片（樱花 / 落叶 / 雪）：体积变大 → 数量同比放大
  const n = (v) => Math.max(8, Math.round(v * q * VOLUME_SCALE));
  // 蝴蝶 / 蜜蜂：贴地小范围活动，不属于"飘散碎片" ——
  // 数量和活动范围都保持原值（原 AREA 90 × 0.5 / 0.45），
  // 免得跟着碎片一起被放大后飞得满场都是。
  const nb = (v) => Math.max(4, Math.round(v * q));
  const BUG_AREA = 90;

  // ---------- 春：樱花 ----------
  const sakura = makeFallingField({
    count: n(160), color: 0xf7a8c4, size: 0.55,
    area: AREA, speed: 1.6, drift: 0.9, spin: 2.4,
    yTop: topY, yBottom: botY,
  });
  group.add(sakura.mesh);

  // ---------- 春：蝴蝶 ----------
  const butterflies = makeBugs(
    nb(10), 0xf0d060, 0xe890b8, BUG_AREA * 0.5, baseY + 2.5, 0.32
  );
  group.add(butterflies.group);

  // ---------- 夏：蜜蜂 ----------
  const bees = makeBugs(
    nb(12), 0xf0c020, 0x3a3a2a, BUG_AREA * 0.45, baseY + 2.0, 0.18
  );
  group.add(bees.group);

  // ---------- 秋：落叶 ----------
  const leaves = makeFallingField({
    count: n(200), color: 0xe08030, size: 0.62,
    area: AREA, speed: 1.9, drift: 1.3, spin: 3.2,
    yTop: topY, yBottom: botY,
  });
  group.add(leaves.mesh);

  // ---------- 秋：南瓜 ----------
  const pumpkins = makePumpkins(rng, model);
  group.add(pumpkins.group);

  // ---------- 冬：飘雪 ----------
  const snow = makeFallingField({
    count: n(700), color: 0xffffff, size: 0.30,
    area: AREA, speed: 1.2, drift: 0.6, spin: 1.2,
    yTop: topY, yBottom: botY,
  });
  group.add(snow.mesh);

  // ---------- 冬：雪人 ----------
  const snowmen = makeSnowmen(model);
  group.add(snowmen.group);

  // 雪人列表挂到 seasonFX 根组，UI 和存档从每个雪人自己的 userData 读写样式
  group.userData.snowmen = snowmen.group.userData.snowmen;

  // ---------- 更新 ----------
  group.userData.update = (seasonT) => {
    // 各元素的活跃区间（用环上的高斯权重，支持春<->冬平滑过渡）
    sakura.setOpacity(ringBell(seasonT, 0, 0.42));
    butterflies.setOpacity(ringBell(seasonT, 0.15, 0.38));

    bees.setOpacity(ringBell(seasonT, 1, 0.42));

    leaves.setOpacity(ringBell(seasonT, 2, 0.42));
    pumpkins.setOpacity(ringBell(seasonT, 2, 0.5));

    snow.setOpacity(ringBell(seasonT, 3, 0.42));
    snowmen.setOpacity(ringBell(seasonT, 3, 0.18));
  };

  group.userData.tick = (dt, t) => {
    sakura.update(dt, t);
    leaves.update(dt, t);
    snow.update(dt, t);
    butterflies.update(dt, t);
    bees.update(dt, t);
  };

  return group;
}