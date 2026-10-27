import * as THREE from 'three';
import { toonLambert } from '../render/toon.js';

// ---------------------------------------------------------------------------
// 篝火露营区
//
// 位置：(26, 8) —— 农舍南侧的开阔地，卡车东边，路灯(35,15)西边。
//
// 构成：
//   - 石圈：8 块石头围成一圈
//   - 木柴：4 根交叉堆叠
//   - 火焰：2 层锥体（内亮外暗），AdditiveBlending + 顶点扰动
//   - 火星：12 个 Points 向上飘，循环
//   - 烟：3 个半透明球缓慢上升、放大、淡出
//   - 光源：PointLight，强度随火焰闪烁
//   - 木桩：3 个圆形木桩围着火堆
//
// 只在夜晚点亮（t > 0.6），白天完全隐藏。
// ---------------------------------------------------------------------------

// 火焰着色器：顶点扰动 + 渐隐
const FlameShader = {
  uniforms: {
    uTime: { value: 0 },
    uIntensity: { value: 0 },     // 0~1，控制整体亮度
    uColorHot: { value: new THREE.Color(0xffe08a) },
    uColorCool: { value: new THREE.Color(0xff6a2a) },
  },
  vertexShader: /* glsl */`
    uniform float uTime;
    varying vec2 vUv;
    varying float vFlicker;

    void main() {
      vUv = uv;
      vec3 p = position;

      // 火焰扭动：越靠上扰动越大
      float h = clamp((p.y + 0.5) / 1.5, 0.0, 1.0);
      float wob = sin(uTime * 6.0 + p.y * 4.0) * 0.12 * h;
      float wob2 = cos(uTime * 4.5 + p.x * 3.0) * 0.09 * h;
      p.x += wob;
      p.z += wob2;

      // 上下缩放（火苗忽长忽短）
      float s = 1.0 + sin(uTime * 5.0) * 0.12 * h;
      p.y *= s;

      vFlicker = 0.85 + sin(uTime * 8.0) * 0.15;

      gl_Position = projectionMatrix * modelViewMatrix * vec4(p, 1.0);
    }
  `,
  fragmentShader: /* glsl */`
    uniform float uIntensity;
    uniform vec3 uColorHot;
    uniform vec3 uColorCool;
    varying vec2 vUv;
    varying float vFlicker;

    void main() {
      // 竖直渐变：底部亮黄，顶部橙红
      float g = clamp(vUv.y, 0.0, 1.0);
      vec3 col = mix(uColorHot, uColorCool, g);

      // 边缘淡出（圆形截面）
      float dx = abs(vUv.x - 0.5) * 2.0;
      float edge = 1.0 - smoothstep(0.4, 1.0, dx);
      // 顶部淡出
      float top = 1.0 - smoothstep(0.55, 1.0, g);

      float a = edge * top * uIntensity * vFlicker;
      if (a < 0.01) discard;

      gl_FragColor = vec4(col * (1.0 + g * 0.6), a);
    }
  `,
};

function makeStone(rng) {
  const g = new THREE.IcosahedronGeometry(0.34 + rng.next() * 0.18, 0);
  const p = g.attributes.position;
  // 压扁一点，像地上的石头
  for (let i = 0; i < p.count; i++) {
    p.setY(i, p.getY(i) * 0.55);
  }
  g.computeVertexNormals();
  return g;
}

function makeLog(len, r) {
  const g = new THREE.CylinderGeometry(r * 0.85, r, len, 6);
  g.rotateZ(Math.PI / 2);
  return g;
}

export function buildCampfire(model, rng, center = { x: 26, z: 8 }) {
  const group = new THREE.Group();
  group.name = 'campfire';

  const gy = model.heightAt(center.x, center.z);

  // ---------- 石圈 ----------
  const stoneMat = toonLambert({ color: 0x7a7268, flatShading: true });
  const stoneCount = 9;
  for (let i = 0; i < stoneCount; i++) {
    const a = (i / stoneCount) * Math.PI * 2 + rng.next() * 0.2;
    const r = 1.5 + rng.next() * 0.15;
    const stone = new THREE.Mesh(makeStone(rng), stoneMat);
    stone.position.set(Math.cos(a) * r, 0.12, Math.sin(a) * r);
    stone.rotation.y = rng.next() * Math.PI * 2;
    stone.castShadow = true;
    group.add(stone);
  }

  // ---------- 木柴 ----------
  const logMat = toonLambert({ color: 0x5a4634, flatShading: true });
  for (let i = 0; i < 4; i++) {
    const a = (i / 4) * Math.PI * 2 + 0.4;
    const log = new THREE.Mesh(makeLog(1.7, 0.16), logMat);
    log.position.set(Math.cos(a) * 0.45, 0.28, Math.sin(a) * 0.45);
    log.rotation.y = a;
    log.rotation.z = 0.35;   // 斜靠成锥形
    log.castShadow = true;
    group.add(log);
  }

  // ---------- 火焰（两层）----------
  const flameMats = [];
  const flames = [];
  for (const cfg of [
    { r: 0.55, h: 1.9, hot: 0xffe08a, cool: 0xff7a30, scale: 1.0 },
    { r: 0.85, h: 1.5, hot: 0xffb050, cool: 0xff4a1a, scale: 0.85 },
  ]) {
    const mat = new THREE.ShaderMaterial({
      uniforms: THREE.UniformsUtils.clone(FlameShader.uniforms),
      vertexShader: FlameShader.vertexShader,
      fragmentShader: FlameShader.fragmentShader,
      transparent: true,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
      side: THREE.DoubleSide,
    });
    mat.uniforms.uColorHot.value = new THREE.Color(cfg.hot);
    mat.uniforms.uColorCool.value = new THREE.Color(cfg.cool);
    flameMats.push(mat);

    const geo = new THREE.ConeGeometry(cfg.r, cfg.h, 8, 1, true);
    geo.translate(0, cfg.h / 2, 0);
    const flame = new THREE.Mesh(geo, mat);
    flame.position.y = 0.25;
    flame.scale.setScalar(cfg.scale);
    group.add(flame);
    flames.push(flame);
  }

  // ---------- 火星 ----------
  const sparkCount = 14;
  const sparkGeo = new THREE.BufferGeometry();
  const sparkPos = new Float32Array(sparkCount * 3);
  sparkGeo.setAttribute('position', new THREE.BufferAttribute(sparkPos, 3));
  const sparkMat = new THREE.PointsMaterial({
    color: 0xffc060, size: 0.16, transparent: true, opacity: 0,
    blending: THREE.AdditiveBlending, depthWrite: false, sizeAttenuation: true,
  });
  const sparks = new THREE.Points(sparkGeo, sparkMat);
  sparks.frustumCulled = false;
  group.add(sparks);

  const sparkState = [];
  for (let i = 0; i < sparkCount; i++) {
    sparkState.push({
      life: rng.next(),
      speed: 0.8 + rng.next() * 1.0,
      drift: (rng.next() - 0.5) * 0.6,
      phase: rng.next() * Math.PI * 2,
    });
  }

  // ---------- 烟 ----------
  const smokeMats = [];
  const smokes = [];
  for (let i = 0; i < 3; i++) {
    const mat = new THREE.MeshBasicMaterial({
      color: 0x8a8a8a, transparent: true, opacity: 0,
      depthWrite: false,
    });
    smokeMats.push(mat);
    const s = new THREE.Mesh(new THREE.IcosahedronGeometry(0.55, 0), mat);
    s.position.y = 1.5 + i * 0.9;
    s.userData.phase = i * 0.33;
    group.add(s);
    smokes.push(s);
  }

  // ---------- 光源 ----------
  const light = new THREE.PointLight(0xff9040, 0, 26, 2);
  light.position.y = 1.0;
  group.add(light);

  // ---------- 木桩（座位）----------
  const stumpMat = toonLambert({ color: 0x6a5240, flatShading: true });
  const stumpPositions = [
    { a: 0.6, r: 3.2 }, { a: 2.5, r: 3.4 }, { a: 4.4, r: 3.0 },
  ];
  // ★ 木桩尺寸来回改过三轮，最终 0.23/0.27 半径 + 0.44 高：
  //   - 原来是 0.42/0.48 + 0.65，直径接近 1 米，Log Lady 坐上去像坐在酒桶上
  //     （她的肩宽才 0.62，桩子比肩还宽）。
  //   - 高度 0.44 是"椅子高度"：她的身高 0.94，0.44/0.94 ≈ 47%，
  //     正好是正常人坐椅子时座面相对身高的比例。
  //   - 再矮就变成蹲在树墩上，再高腿就要悬空。
  const STUMP_H = 0.44;
  for (const sp of stumpPositions) {
    const stump = new THREE.Mesh(new THREE.CylinderGeometry(0.23, 0.27, STUMP_H, 7), stumpMat);
    stump.position.set(Math.cos(sp.a) * sp.r, STUMP_H * 0.5, Math.sin(sp.a) * sp.r);
    stump.castShadow = true;
    stump.receiveShadow = true;
    group.add(stump);
  }

  group.position.set(center.x, gy, center.z);
  group.userData.center = { x: center.x, z: center.z, y: gy };

  // 暴露木桩座位（世界坐标），Log Lady 要坐在其中一张上。
  //   groundY 也一起给出去：loglady 要靠它反推小腿长度，
  //   否则木桩高度一改，鞋就会悬空或者陷进地里。
  group.userData.stumpSeats = stumpPositions.map((sp) => ({
    x: center.x + Math.cos(sp.a) * sp.r,
    z: center.z + Math.sin(sp.a) * sp.r,
    topY: gy + STUMP_H,
    groundY: gy,
  }));

  // ---------- 更新 ----------
  group.userData.update = (t, dt, nightAmount) => {
    // nightAmount: 0=白天 1=夜晚（由 main 传入）
    const on = nightAmount;

    // 火焰
    const flicker = 0.85 + Math.sin(t * 8.3) * 0.08 + Math.sin(t * 13.7) * 0.05;
    for (const mat of flameMats) {
      mat.uniforms.uTime.value = t;
      mat.uniforms.uIntensity.value = on * flicker;
    }
    for (const f of flames) {
      f.visible = on > 0.02;
      // 轻微左右摇摆
      f.rotation.z = Math.sin(t * 3.1) * 0.05 * on;
      f.rotation.x = Math.cos(t * 2.7) * 0.04 * on;
    }

    // 光源
    light.intensity = on * 42 * flicker;
    light.visible = on > 0.02;

    // 火星
    sparkMat.opacity = on * 0.9;
    sparks.visible = on > 0.02;
    if (sparks.visible) {
      const arr = sparkGeo.attributes.position.array;
      for (let i = 0; i < sparkCount; i++) {
        const s = sparkState[i];
        s.life += dt * s.speed * 0.6;
        if (s.life > 1) s.life -= 1;
        const l = s.life;
        // 从火堆中心向上飘，带横向漂移
        arr[i * 3] = Math.sin(t * 1.8 + s.phase) * 0.35 * l + s.drift * l * 2;
        arr[i * 3 + 1] = 0.4 + l * 3.2;
        arr[i * 3 + 2] = Math.cos(t * 1.5 + s.phase) * 0.35 * l;
      }
      sparkGeo.attributes.position.needsUpdate = true;
    }

    // 烟
    for (let i = 0; i < smokes.length; i++) {
      const s = smokes[i];
      const ph = (t * 0.28 + s.userData.phase) % 1;
      s.position.y = 1.2 + ph * 4.5;
      const scale = 0.6 + ph * 1.6;
      s.scale.setScalar(scale);
      smokeMats[i].opacity = on * (1 - ph) * 0.22;
      s.visible = on > 0.02;
      s.rotation.y = t * 0.4 + i;
    }
  };

  return group;
}