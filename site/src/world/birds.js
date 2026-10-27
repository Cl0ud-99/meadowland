import * as THREE from '../../vendor/three/three.module.js';
import { tint } from '../util/geo.js';
import { toonLambert } from '../render/toon.js';

// ---------------------------------------------------------------------------
// 飞鸟：5 个品种，大小/颜色/飞行方式都不同
//
//   crow      乌鸦 —— 全黑，最大，直线滑翔
//   pigeon    鸽子 —— 灰蓝，中等，翅膀频率中等
//   sparrow   麻雀 —— 棕褐，最小，翅膀频率快
//   seagull   海鸥 —— 白+灰翼尖，大，滑翔为主
//   swallow   燕子 —— 深蓝背+白腹，剪刀尾，速度最快
//
// 每只鸟是"身体 + 两片翅膀 + 尾巴"的拆件模型，翅膀绕身体轴线拍动。
// 飞行路径是一条椭圆弧，随机高度和半径，飞完一圈后重新随机。
// ---------------------------------------------------------------------------

const BIRD_SPECS = [
  {
    name: 'crow',
    bodyColor: 0x2a2622,
    wingColor: 0x1e1b18,
    tailColor: 0x2a2622,
    scale: 1.25,
    wingFreq: 5.5,
    wingAmp: 0.75,
    speed: 14,
    bodyLen: 1.5,
    wingSpan: 3.6,
  },
  {
    name: 'pigeon',
    bodyColor: 0x9aa8b8,
    wingColor: 0x7a8a9c,
    tailColor: 0x8a98a8,
    scale: 1.0,
    wingFreq: 7.5,
    wingAmp: 0.85,
    speed: 12,
    bodyLen: 1.2,
    wingSpan: 2.8,
  },
  {
    name: 'sparrow',
    bodyColor: 0x9a7850,
    wingColor: 0x7a5a38,
    tailColor: 0x8a6a44,
    scale: 0.7,
    wingFreq: 11,
    wingAmp: 0.95,
    speed: 10,
    bodyLen: 0.85,
    wingSpan: 1.9,
  },
  {
    name: 'seagull',
    // 原来的 0xf2f4f6 / 0xd8e0e8 / 0xe8ecf0 接近纯白：
    // 海鸥从镜头前方几十单位掠过时，整片三角翼被投影放大成一块 (245,245,245)
    // 的纯白薄片，看起来像渲染破洞。压到冷灰白，仍然能认出是海鸥，
    // 但不会再亮到和天空脱节。
    bodyColor: 0xdde4ec,
    wingColor: 0xb9c6d6,
    tailColor: 0xd2dae4,
    scale: 1.15,
    wingFreq: 3.8,
    wingAmp: 0.6,
    speed: 11,
    bodyLen: 1.4,
    wingSpan: 3.8,
  },
  {
    name: 'swallow',
    bodyColor: 0x2a3a5a,
    wingColor: 0x1e2a44,
    tailColor: 0x2a3a5a,
    scale: 0.75,
    wingFreq: 12,
    wingAmp: 1.0,
    speed: 18,
    bodyLen: 0.9,
    wingSpan: 2.2,
  },
];

// 简易几何合并（带顶点色）
function mergeParts(list) {
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
    const p = g.attributes.position;
    const n = g.attributes.normal;
    const c = g.attributes.color;
    positions.set(p.array.subarray(0, p.count * 3), vOff * 3);
    normals.set(n.array.subarray(0, n.count * 3), vOff * 3);
    if (c) colors.set(c.array.subarray(0, c.count * 3), vOff * 3);
    else colors.fill(1, vOff * 3, (vOff + p.count) * 3);
    if (g.index) {
      for (let k = 0; k < g.index.count; k++) indices[iOff + k] = g.index.getX(k) + vOff;
      iOff += g.index.count;
    } else {
      for (let k = 0; k < p.count; k++) indices[iOff + k] = k + vOff;
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

function makeBird(spec) {
  const root = new THREE.Group();
  root.name = 'bird-' + spec.name;

  const { bodyLen, wingSpan } = spec;

  // ---------- 身体（纺锤形） ----------
  const bodyParts = [];
  const bodyGeo = new THREE.ConeGeometry(bodyLen * 0.22, bodyLen, 5);
  bodyGeo.rotateX(Math.PI / 2);   // 尖端朝 +Z（前）
  bodyParts.push(tint(bodyGeo, spec.bodyColor));
  // 头
  const head = new THREE.SphereGeometry(bodyLen * 0.17, 6, 5);
  head.translate(0, bodyLen * 0.06, bodyLen * 0.42);
  bodyParts.push(tint(head, spec.bodyColor));
  // 喙
  const beak = new THREE.ConeGeometry(bodyLen * 0.06, bodyLen * 0.24, 4);
  beak.rotateX(Math.PI / 2);
  beak.translate(0, bodyLen * 0.04, bodyLen * 0.62);
  bodyParts.push(tint(beak, 0xd8a040));

  const body = new THREE.Mesh(mergeParts(bodyParts), toonLambert({
    vertexColors: true,
    flatShading: true,
  }));
  root.add(body);

  // ---------- 尾巴 ----------
  const tailParts = [];
  const tailGeo = new THREE.ConeGeometry(bodyLen * 0.28, bodyLen * 0.55, 4);
  tailGeo.rotateX(-Math.PI / 2);
  tailGeo.scale(1, 0.35, 1);
  tailGeo.translate(0, 0, -bodyLen * 0.55);
  tailParts.push(tint(tailGeo, spec.tailColor));

  // 燕子：剪刀尾
  if (spec.name === 'swallow') {
    for (const side of [-1, 1]) {
      const f = new THREE.ConeGeometry(bodyLen * 0.12, bodyLen * 0.6, 3);
      f.rotateX(-Math.PI / 2);
      f.rotateZ(side * 0.35);
      f.translate(side * bodyLen * 0.16, 0, -bodyLen * 0.62);
      tailParts.push(tint(f, spec.tailColor));
    }
  }

  const tail = new THREE.Mesh(mergeParts(tailParts), toonLambert({
    vertexColors: true,
    flatShading: true,
  }));
  root.add(tail);

  // ---------- 翅膀（左右各一，绕 Z 轴拍动） ----------
  const makeWing = (side) => {
    const g = new THREE.Group();
    g.name = 'wing';

    const parts = [];
    // 主翼：扁平的三角面
    const wingGeo = new THREE.BufferGeometry();
    const half = wingSpan * 0.5;
    const verts = new Float32Array([
      0, 0, bodyLen * 0.28,
      half, 0, -bodyLen * 0.1,
      0, 0, -bodyLen * 0.42,
    ]);
    wingGeo.setAttribute('position', new THREE.BufferAttribute(verts, 3));
    wingGeo.computeVertexNormals();
    // 双面显示
    const w1 = tint(wingGeo.clone(), spec.wingColor);
    const w2 = tint(wingGeo.clone(), spec.wingColor);
    // 反面（法线朝下）
    w2.scale(1, -1, 1);
    parts.push(w1, w2);

    const mesh = new THREE.Mesh(mergeParts(parts), toonLambert({
      vertexColors: true,
      flatShading: true,
      side: THREE.DoubleSide,
    }));
    mesh.scale.x = side;   // 镜像到左右
    g.add(mesh);

    return g;
  };

  const wingL = makeWing(-1);
  const wingR = makeWing(1);
  root.add(wingL, wingR);

  root.scale.setScalar(spec.scale);
  root.userData.spec = spec;
  root.userData.parts = { body, tail, wingL, wingR };
  return root;
}

// ---------------------------------------------------------------------------
// 飞行：椭圆轨迹 + 上下起伏 + 翅膀拍动
// ---------------------------------------------------------------------------
export function buildBirds(count = 5, rng, model = null, layout = null) {
  const group = new THREE.Group();
  group.name = 'birds';
  const list = [];

  // ---------- 停歇点 ----------
  // 鸟会停在这些地方休息：谷仓屋脊、围栏柱顶、水塔平台

  for (let i = 0; i < count; i++) {
    const spec = BIRD_SPECS[i % BIRD_SPECS.length];
    const bird = makeBird(spec);

    // ---------- 路径多样化 ----------
    // 之前所有鸟都是"椭圆绕飞 + 中心在 ±30 内"，轨迹太固定、出现频率低。
    // 现在分 3 种飞行模式，让天空更热闹：
    //
    //   orbit  绕飞（原有）：大椭圆，慢慢绕
    //   cross  横穿：从一侧直线飞到另一侧，到边界后重生
    //   spiral 螺旋：半径随时间变化，轨迹是螺旋线
    const modeRoll = rng.next();
    let mode = 'orbit';
    if (modeRoll < 0.45) mode = 'orbit';
    else if (modeRoll < 0.78) mode = 'cross';
    else mode = 'spiral';

    // 横穿模式：随机选一个方向（从左到右 / 从右到左 / 从前到后 / 从后到前）
    const crossDirs = [
      { sx: -220, sz: 0, ex: 220, ez: 0 },     // 西 -> 东
      { sx: 220, sz: 0, ex: -220, ez: 0 },     // 东 -> 西
      { sx: 0, sz: -220, ex: 0, ez: 220 },     // 北 -> 南
      { sx: 0, sz: 220, ex: 0, ez: -220 },     // 南 -> 北
    ];
    const cd = crossDirs[Math.floor(rng.next() * 4)];
    // 加一点偏移，避免所有横穿的鸟都走同一条线
    const crossOffset = rng.range(-70, 70);

    const flight = {
      mode,
      // 绕飞中心：范围扩大到 ±60，让鸟分布在整个场景上空
      cx: rng.range(-60, 60),
      cz: rng.range(-60, 60),
      // 半径：小到 60（能看到近处的鸟），大到 240（远处掠过）
      rx: rng.range(60, 240),
      rz: rng.range(60, 240),
      // 高度：30~46（水塔 20.7 之上），更高的鸟能看到剪影
      baseY: rng.range(30, 46),
      yAmp: rng.range(1.5, 4),
      yFreq: rng.range(0.25, 0.5),
      ang: rng.next() * Math.PI * 2,
      // 速度：0.6~1.8 倍（有的慢悠悠，有的快速掠过）
      angSpeed: (spec.speed / 100) * rng.range(0.6, 1.8) * (rng.chance(0.5) ? 1 : -1),
      phase: rng.next() * Math.PI * 2,
      roll: 0,

      // ---------- 横穿模式参数 ----------
      cross: {
        sx: cd.sx + (cd.sx === 0 ? crossOffset : 0),
        sz: cd.sz + (cd.sz === 0 ? crossOffset : 0),
        ex: cd.ex + (cd.ex === 0 ? crossOffset : 0),
        ez: cd.ez + (cd.ez === 0 ? crossOffset : 0),
        t: rng.next(),              // 进度 0~1
        speed: rng.range(0.06, 0.14), // 每秒进度增量
      },

      // ---------- 螺旋模式参数 ----------
      spiral: {
        rBase: rng.range(50, 160),
        rAmp: rng.range(30, 80),
        rFreq: rng.range(0.05, 0.15),
      },

      state: 'fly',
    };

    bird.userData.flight = flight;
    group.add(bird);
    list.push(bird);
  }

  group.userData.count = list.length;
  group.userData.specs = BIRD_SPECS.slice(0, count).map(s => s.name);

  // 更新：位置 / 朝向 / 翅膀
  const _pos = new THREE.Vector3();
  const _next = new THREE.Vector3();
  const _up = new THREE.Vector3(0, 1, 0);
  const _right = new THREE.Vector3(1, 0, 0);
  const _fwd = new THREE.Vector3(0, 0, 1);
  const _localFwd = new THREE.Vector3();
  const _qYaw = new THREE.Quaternion();
  const _qPitch = new THREE.Quaternion();
  const _qRoll = new THREE.Quaternion();

  // 距离相机多近就把鸟藏起来。
  //
  // 为什么需要：鸟的翅膀是一个只有 3 个顶点的三角面（见 makeWing），
  // 翼展 3.8 × scale 1.15 ≈ 4.4。当它从镜头前方三四十单位掠过时，
  // 这个三角面会被投影放大成一块横跨半个画面的纯白薄片，
  // 看起来像渲染破洞（用户截图里那片白色三角形就是它）。
  // 与其把海鸥涂灰牺牲配色，不如让鸟在贴近镜头时直接隐藏 ——
  // 玩家本来也不会注意"眼前那只鸟突然不见了"。
  const NEAR_HIDE = 42;

  group.userData.update = (t, dt, camera) => {
    // dt 下限保护（避免帧率波动导致动画卡顿）
    const step = Math.max(0.008, Math.min(dt, 0.1));

    for (const bird of list) {
      const f = bird.userData.flight;
      const spec = bird.userData.spec;

      // ---------- 纯绕飞（不再停落）----------
      // 鸟类只在空中绕圈飞过，不降落到屋顶/围栏。
      // 停落的只有猫头鹰（独立模块 owl.js）。
      // 这样鸟的轨迹更连贯，也不会出现"卡在围栏上"的问题。

      // ---------- 飞行（3 种模式）----------
      const yBase = f.baseY + Math.sin(t * f.yFreq + f.phase) * f.yAmp;

      if (f.mode === 'cross') {
        // ---------- 横穿：直线飞过，到边界重生 ----------
        f.cross.t += step * f.cross.speed;
        if (f.cross.t >= 1) {
          // 重生到起点，换个高度和偏移
          f.cross.t = 0;
          f.baseY = rng.range(30, 46);
          f.phase = rng.next() * Math.PI * 2;
        }
        const ct = f.cross.t;
        _pos.set(
          f.cross.sx + (f.cross.ex - f.cross.sx) * ct,
          yBase,
          f.cross.sz + (f.cross.ez - f.cross.sz) * ct
        );
        // 下一帧：直接用【起点→终点】的方向向量，不做 ct + 0.01 采样。
        // ★ 原来 ct 接近 1 时 ct2 被 Math.min(1, ...) 夹住，
        //   采样点和当前点重合、方向向量退化成 0，
        //   那几帧鸟的朝向就不再更新（表现为突然僵住/掉头）。
        _next.set(_pos.x + (f.cross.ex - f.cross.sx), yBase, _pos.z + (f.cross.ez - f.cross.sz));
        // 横穿不倾斜
        f.roll *= 0.95;

      } else if (f.mode === 'spiral') {
        // ---------- 螺旋：半径随时间变化 ----------
        f.ang += step * f.angSpeed;
        const sp = f.spiral;
        const r = sp.rBase + Math.sin(t * sp.rFreq + f.phase) * sp.rAmp;
        _pos.set(
          f.cx + Math.cos(f.ang) * r,
          yBase,
          f.cz + Math.sin(f.ang) * r
        );
        // ★ 用【解析切线】取方向，不再靠"角度加个小量"采样 ——
        //   angSpeed 有正负（一半的鸟逆时针飞），原来写死 nextAng = ang + 0.01
        //   会让采样点落在运动反方向，鸟就"倒着飞"了。
        //
        //   位置： x = cx + cos(a)·r,  z = cz + sin(a)·r
        //   其中  da/dt = angSpeed，dr/dt = cos(t·rFreq+phase)·rAmp·rFreq
        //   求导直接得到速度方向，正负速度都自动正确。
        const da = f.angSpeed;
        const dr = Math.cos(t * sp.rFreq + f.phase) * sp.rAmp * sp.rFreq;
        const vx = -Math.sin(f.ang) * r * da + Math.cos(f.ang) * dr;
        const vz = Math.cos(f.ang) * r * da + Math.sin(f.ang) * dr;
        _next.set(_pos.x + vx, yBase, _pos.z + vz);
        // ★ 侧倾方向只由【转向】决定，不能再乘 cos(ang)。
        //   原来乘了 cos(f.ang)，绕一圈会翻两次 —— 同一只鸟一会儿左倾一会儿右倾，
        //   看起来像在乱摆。椭圆上 da>0 时圆心恒在左侧，所以 roll 恒为 +0.45。
        const targetRoll = 0.45 * Math.sign(f.angSpeed);
        f.roll += (targetRoll - f.roll) * Math.min(1, step * 3);

      } else {
        // ---------- 绕飞（原有）----------
        f.ang += step * f.angSpeed;
        _pos.set(
          f.cx + Math.cos(f.ang) * f.rx,
          yBase,
          f.cz + Math.sin(f.ang) * f.rz
        );
        // ★ 同上：用解析切线，angSpeed 为负（逆时针）时方向自动正确。
        //   位置： x = cx + cos(a)·rx,  z = cz + sin(a)·rz
        //   dx/dt = -sin(a)·rx·angSpeed,  dz/dt = cos(a)·rz·angSpeed
        const vx = -Math.sin(f.ang) * f.rx * f.angSpeed;
        const vz = Math.cos(f.ang) * f.rz * f.angSpeed;
        _next.set(_pos.x + vx, yBase, _pos.z + vz);
        // ★ 同上：侧倾恒指向圆心一侧，不随角度翻转
        const targetRoll = 0.3 * Math.sign(f.angSpeed);
        f.roll += (targetRoll - f.roll) * Math.min(1, step * 3);
      }

      bird.position.copy(_pos);

      // ---------- 贴脸时隐藏 ----------
      // 见上面 NEAR_HIDE 的说明：翅膀三角面在近距离会被放大成巨大白片。
      // 这里只切换 visible，位置/朝向照常更新，飞远后自然恢复。
      if (camera) {
        const tooClose = _pos.distanceToSquared(camera.position) < NEAR_HIDE * NEAR_HIDE;
        if (bird.visible === tooClose) bird.visible = !tooClose;
      }

      // ---------- 朝向：用四元数组合，避免欧拉角顺序干扰 ----------
      const dir = _next.sub(_pos);
      if (dir.lengthSq() > 1e-6) {
        const yaw = Math.atan2(dir.x, dir.z);

        // 轻微俯仰（pitch）：跟实际爬升率走 ——
        // ★ 原来用 sin(t·yFreq + phase + 1.2)，和高度用的是同一个相位但错开 1.2，
        //   两者不同步：鸟在上升时可能低头、下降时反而抬头。
        //   现在直接取 dy/dt 的符号（位置 y = baseY + sin(t·yFreq+phase)·yAmp）。
        const climb = Math.cos(t * f.yFreq + f.phase) * f.yAmp * f.yFreq;
        // 限幅在 ±0.12 rad（约 ±7°），低多边形小体量鸟不需要大角度
        const pitch = THREE.MathUtils.clamp(-climb * 0.10, -0.12, 0.12);

        // 组合：先 yaw，再 pitch，最后 roll
        _qYaw.setFromAxisAngle(_up, yaw);
        _qPitch.setFromAxisAngle(_right, pitch);
        _qRoll.setFromAxisAngle(_fwd, f.roll);
        bird.quaternion.copy(_qYaw).multiply(_qPitch).multiply(_qRoll);
      }

      // ---------- 翅膀拍动 ----------
      // 幅度限制在 ±0.85 rad（约 ±49°），避免翅膀穿过身体
      const wingAng = Math.sin(t * spec.wingFreq + f.phase) * Math.min(spec.wingAmp, 0.85);
      bird.userData.parts.wingL.rotation.z = -wingAng;
      bird.userData.parts.wingR.rotation.z = wingAng;

      // 尾巴轻微摆动
      bird.userData.parts.tail.rotation.x = Math.sin(t * 2 + f.phase) * 0.1;
    }
  };

  return group;
}