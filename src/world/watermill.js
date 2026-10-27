import * as THREE from 'three';
import { tint, recolorMesh } from '../util/geo.js';
import { BUILDING_STYLES } from './buildingStyles.js';
import { toonLambert } from '../render/toon.js';

// ---------------------------------------------------------------------------
// 水车
//
// 位置：水池西侧边缘。水池在 (-78, 2)，半径 16。
// 水车放在池边 (-93, 2)，半浸在水里。
//
// 构成：
//   - 支架：两根斜柱 + 一根横梁（A 字形）
//   - 水车：16 片叶片的圆轮，半径 3.2
//   - 水花：叶片入水时溅起的白色小点
//   - 涟漪：水面上扩散的圆环
//   - 小磨坊：旁边的木屋 + 转动的屋顶小风车
// ---------------------------------------------------------------------------

function makeWheel(rng) {
  const group = new THREE.Group();
  group.name = 'wheel';

  const R = 3.2;          // 轮半径
  const bladeCount = 16;  // 叶片数

  // ---------- 两个圆环（轮缘） ----------
  const rimMat = toonLambert({ color: 0x6a5240, flatShading: true });
  for (const zOff of [-0.55, 0.55]) {
    const torus = new THREE.Mesh(
      new THREE.TorusGeometry(R, 0.12, 6, 24),
      rimMat
    );
    torus.position.z = zOff;
    group.add(torus);
  }

  // ---------- 辐条 ----------
  for (let i = 0; i < 8; i++) {
    const a = (i / 8) * Math.PI * 2;
    const spoke = new THREE.Mesh(
      new THREE.BoxGeometry(R * 2, 0.09, 0.09),
      rimMat
    );
    spoke.rotation.z = a;
    group.add(spoke);
  }

  // ---------- 叶片 ----------
  const bladeMat = toonLambert({ color: 0x7a6248, flatShading: true });
  const bladeGeo = new THREE.BoxGeometry(0.9, 0.9, 1.3);
  for (let i = 0; i < bladeCount; i++) {
    const a = (i / bladeCount) * Math.PI * 2;
    const blade = new THREE.Mesh(bladeGeo, bladeMat);
    blade.position.set(Math.cos(a) * R, Math.sin(a) * R, 0);
    blade.rotation.z = a;
    blade.castShadow = true;
    group.add(blade);
  }

  // ---------- 中心轴 ----------
  const axle = new THREE.Mesh(
    new THREE.CylinderGeometry(0.22, 0.22, 2.2, 8),
    toonLambert({ color: 0x4a3a2a, flatShading: true })
  );
  axle.rotation.x = Math.PI / 2;
  group.add(axle);

  return group;
}

export function buildWatermill(model, rng, center = { x: -93, z: 2 }) {
  const group = new THREE.Group();
  group.name = 'watermill';

  const gy = model.heightAt(center.x, center.z);

  // 水位（必须和 terrain.js 的 buildPond 完全一致）
  //
  // ★ 这里是水位计算过时导致的连锁问题：
  //   terrain.js 现在用 shoreY = outsideMin（地形最低值）作岸顶，
  //   水位 = shoreY - WATER_SINK_x；
  //   而这边还在用 outsideAvg（平均值）- 0.55，
  //   两者差了 0.32，水车轮心因此被抬到水面以上 4 米（悬空）。
  //
  //   现在按同一套规则重算：取 1.55R 一圈的【最低值】当岸顶。
  const pond = { x: -78, z: 2, r: 16 };
  let outsideMin = Infinity;
  for (let i = 0; i < 24; i++) {
    const a = (i / 24) * Math.PI * 2;
    const h = model.heightAt(pond.x + Math.cos(a) * pond.r * 1.55, pond.z + Math.sin(a) * pond.r * 1.55);
    if (h < outsideMin) outsideMin = h;
  }
  const waterY = outsideMin - 0.55;   // 和 WATER_SINK_LOW 一致

  // ---------- 支架（A 字形）----------
  const woodMat = toonLambert({ color: 0x6a5240, flatShading: true });
  const darkWood = toonLambert({ color: 0x5a4432, flatShading: true });

  // ★ wheelY 是【世界高度】，但 wheel.position.y 是【组内坐标】，
  //   group 自己放在 gy 高度，所以要减掉 gy。
  //   之前直接用 worldWaterY + 1.2，实际世界高度变成 gy + waterY + 1.2，
  //   轮心被抬到 9.1（高出水面 3.75）—— 水车悬在半空。
  const wheelWorldY = waterY + 3.8;        // 轮底略高于岸边（轮半径 3.2，中心高出水面约 3.8）
  const wheelY = wheelWorldY - gy;          // 换算成组内坐标
  const postH = wheelWorldY - gy + 1.0;

  // 支架放在轮子两侧（Z 方向），不要挡住轮面
  for (const side of [-1, 1]) {
    const post = new THREE.Mesh(new THREE.BoxGeometry(0.28, postH, 0.28), woodMat);
    post.position.set(0, postH / 2, side * 1.1);
    post.castShadow = true;
    group.add(post);
  }
  // 横梁（连接两柱，沿 Z 方向）
  const beam = new THREE.Mesh(new THREE.BoxGeometry(0.24, 0.24, 2.6), woodMat);
  beam.position.y = postH * 0.78;
  group.add(beam);

  // ---------- 水车 ----------
  // makeWheel 里所有部件都在 XY 平面，轮面朝 Z 轴，
  // 绕 Z 轴自转就是"立着转"（像摩天轮）。
  // 不要再加 rotation.y，否则轮面会侧对相机，看起来像一摞桶。
  const wheel = makeWheel(rng);
  wheel.position.set(0, wheelY, 0);
  group.add(wheel);

  // ---------- 水花 ----------
  const splashCount = 16;
  const splashGeo = new THREE.BufferGeometry();
  const splashPos = new Float32Array(splashCount * 3);
  splashGeo.setAttribute('position', new THREE.BufferAttribute(splashPos, 3));
  const splashMat = new THREE.PointsMaterial({
    color: 0xd8ecf8, size: 0.22, transparent: true, opacity: 0.85,
    depthWrite: false, sizeAttenuation: true,
  });
  const splash = new THREE.Points(splashGeo, splashMat);
  splash.frustumCulled = false;
  group.add(splash);

  const splashState = [];
  for (let i = 0; i < splashCount; i++) {
    splashState.push({
      life: rng.next(),
      speed: 0.8 + rng.next() * 0.8,
      ang: rng.next() * Math.PI * 2,
    });
  }

  // ---------- 涟漪 ----------
  const ripples = [];
  const RIPPLE_COUNT = 4;
  for (let i = 0; i < RIPPLE_COUNT; i++) {
    const geo = new THREE.RingGeometry(0.55, 0.78, 24);
    geo.rotateX(-Math.PI / 2);
    const mat = new THREE.MeshBasicMaterial({
      color: 0xc8e4f4, transparent: true, opacity: 0,
      depthWrite: false, side: THREE.DoubleSide,
    });
    const ring = new THREE.Mesh(geo, mat);
    // 波纹贴在【水面】上：直接按 group 原点（gy）换算，
    // 不能再用 wheelY —— 轮子抬高后 waterY-wheelY 会把波纹压到水下。
    ring.position.set(0, waterY - gy + 0.06, 0);
    ring.userData.phase = i / RIPPLE_COUNT;
    group.add(ring);
    ripples.push(ring);
  }

  // ---------- 小磨坊 ----------
  const millGroup = new THREE.Group();
  // 磨坊挪到岸上（水池在东边，所以往西挪）
  // ★ 离水车要够远，否则屋顶会穿进轮子（轮半径 3.2 + 屋顶半径 2.2）。
  //   往西再挪 1.5，总距离 6.0，两件刚好不碰。
  const MILL_OFFSET_X = -6.0;
  const MILL_OFFSET_Z = 1.5;
  // ★ y 必须按【磨坊自己脚下的地形高度】算，不能用水车中心的 gy。
  //   磨坊离水车 4.5 米，那里地面高 3.10，而水车处只有 2.95 ——
  //   差 0.15，房子就直接陷进地里了。
  const millGroundY = model.heightAt(center.x + MILL_OFFSET_X, center.z + MILL_OFFSET_Z);
  // group 的原点在 gy，所以要减去 gy 换算成组内坐标
  millGroup.position.set(MILL_OFFSET_X, millGroundY - gy, MILL_OFFSET_Z);

  // 墙体
  const wallMat = toonLambert({ color: 0xc8b89c, flatShading: true });
  const walls = new THREE.Mesh(new THREE.BoxGeometry(2.6, 2.4, 2.4), wallMat);
  walls.position.y = 1.2;
  walls.castShadow = true;
  millGroup.add(walls);

  // 屋顶（四棱锥）
  const roofMat = toonLambert({ color: 0x8a4a38, flatShading: true });
  const roof = new THREE.Mesh(new THREE.ConeGeometry(2.2, 1.4, 4), roofMat);
  roof.position.y = 3.1;
  roof.rotation.y = Math.PI / 4;
  roof.castShadow = true;
  millGroup.add(roof);

  // 门
  const door = new THREE.Mesh(
    new THREE.BoxGeometry(0.7, 1.2, 0.1),
    toonLambert({ color: 0x5a4432, flatShading: true })
  );
  door.position.set(0, 0.6, 1.22);
  millGroup.add(door);

  // 屋顶小风车（4 片）
  const vaneGroup = new THREE.Group();
  vaneGroup.position.set(0, 3.9, 0);
  for (let i = 0; i < 4; i++) {
    const vane = new THREE.Mesh(
      new THREE.BoxGeometry(0.12, 1.0, 0.06),
      toonLambert({ color: 0xd8d0c0, flatShading: true })
    );
    vane.position.y = 0.5;
    vane.rotation.z = (i / 4) * Math.PI * 2;
    // 绕中心旋转：先把叶片移到半径上
    const holder = new THREE.Group();
    holder.rotation.z = (i / 4) * Math.PI * 2;
    holder.add(vane);
    vaneGroup.add(holder);
  }
  millGroup.add(vaneGroup);

  group.add(millGroup);

  // ---------- 位置 ----------
  group.position.set(center.x, gy, center.z);
  // 不旋转整组：wheel 自己已经绕 Y 转了 90°，
  // 整组保持默认朝向，磨坊在 -X 方向（岸上）
  group.rotation.y = 0;

  group.userData.wheel = wheel;
  group.userData.splash = splash;
  group.userData.splashGeo = splashGeo;
  group.userData.splashState = splashState;
  group.userData.ripples = ripples;
  group.userData.vane = vaneGroup;
  group.userData.waterY = waterY;

  // ---------- 更新 ----------
  // ---------- 风格切换（独立）----------
  let styleIdx = 0;
  function setStyle(idx) {
    const n = BUILDING_STYLES.length;
    styleIdx = ((idx % n) + n) % n;
    const style = BUILDING_STYLES[styleIdx];
    if (!style || !style.watermill) return null;
    const s = style.watermill;
    const m = new Map();
    const hex = (v) => {
      const c = new THREE.Color(v);
      return c.r.toFixed(4) + ',' + c.g.toFixed(4) + ',' + c.b.toFixed(4);
    };
    m.set(hex(0x6a5240), s.wood);     // 支架/轮缘
    m.set(hex(0x7a6248), s.blade);    // 叶片
    m.set(hex(0x8a4a38), s.roof);     // 磨坊屋顶
    m.set(hex(0x5a4432), s.wood);     // 门/轴
    m.set(hex(0xc8b89c), s.wood);     // 磨坊墙
    m.set(hex(0xd8d0c0), s.blade);    // 屋顶小风车

    group.traverse((o) => {
      if (!o.isMesh) return;
      // 水车大多数部件是普通 color 材质（没有 colorSlots），
      // 旧实现只处理 colorSlots，导致改色失效 —— 这里补一条按材质颜色匹配的路径。
      if (o.userData.colorSlots) {
        recolorMesh(o, m);
      } else if (o.material && o.material.color) {
        const c = o.material.color;
        const key = c.r.toFixed(4) + ',' + c.g.toFixed(4) + ',' + c.b.toFixed(4);
        const nv = m.get(key);
        if (nv !== undefined) c.setHex(nv);
      }
    });
    return style;
  }
  group.userData.setStyle = setStyle;
  group.userData.nextStyle = () => setStyle(styleIdx + 1);
  group.userData.getStyle = () => ({
    idx: styleIdx,
    name: BUILDING_STYLES[styleIdx].name,
    count: BUILDING_STYLES.length,
  });
  // 兼容旧接口
  group.userData.applyStyle = setStyle;

  group.userData.update = (t, dt) => {
    // 水车转动（绕 Z 轴）
    wheel.rotation.z += dt * 0.55;

    // 屋顶小风车
    vaneGroup.rotation.z += dt * 1.2;

    // 水花：从轮子底部溅起
    const arr = splashGeo.attributes.position.array;
    for (let i = 0; i < splashState.length; i++) {
      const s = splashState[i];
      s.life += dt * s.speed;
      if (s.life > 1) s.life -= 1;
      const l = s.life;
      // 抛物线：从底部向上再落下
      const h = Math.sin(l * Math.PI) * 1.1;
      // 轮面朝 Z 轴，水花在轮子底部（y 最低点）向四周溅
      arr[i * 3] = Math.cos(s.ang) * (0.4 + l * 1.1);
      arr[i * 3 + 1] = waterY - gy + h + 0.1;
      arr[i * 3 + 2] = Math.sin(s.ang) * (0.3 + l * 0.6);
    }
    splashGeo.attributes.position.needsUpdate = true;

    // 涟漪：扩散 + 淡出
    for (const ring of ripples) {
      const ph = ((t * 0.45 + ring.userData.phase) % 1);
      ring.scale.setScalar(1.0 + ph * 5.0);
      ring.material.opacity = (1 - ph) * 0.55;
    }
  };

  return group;
}