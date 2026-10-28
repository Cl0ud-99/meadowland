import * as THREE from 'three';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js';
import { CAMERA, WORLD } from '../config.js';

// ---------------------------------------------------------------------------
// 相机
//   1. OrbitControls：拖动旋转 / 缩放（受限方位角与俯仰角）
//   2. WASD 自由移动：水平平移视野中心（可选 QE 升降）
//   3. 开场运镜 + 飞向目标
//   4. 竖屏 FOV 自适应
//
// 设计要点：WASD 不是"移动相机"，而是"移动观察中心(target)"，
// 相机与 target 的相对位置保持不变，这样 Orbit 的旋转手感不会被打断。
// ---------------------------------------------------------------------------

const easeInOutCubic = (t) => (t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2);
const easeOutQuart = (t) => 1 - Math.pow(1 - t, 4);
const easeInOutQuart = (t) => (t < 0.5 ? 8 * t * t * t * t : 1 - Math.pow(-2 * t + 2, 4) / 2);
// 二次缓动：中段速度只有平均值的 1.5 倍，比四次方平缓
const easeInOutQuad = (t) => (t < 0.5 ? 2 * t * t : 1 - Math.pow(-2 * t + 2, 2) / 2);

const BOUNDS = WORLD.bounds;

export function createCameraRig(renderer, model) {
  const camera = new THREE.PerspectiveCamera(
    CAMERA.fov,
    window.innerWidth / window.innerHeight,
    CAMERA.near,
    CAMERA.far
  );

  const controls = new OrbitControls(camera, renderer.domElement);
  controls.enableDamping = true;
  controls.dampingFactor = CAMERA.damping;
  controls.enablePan = false;          // 平移交给 WASD，避免和键盘打架
  const ROTATE_SPEED_BASE = 0.5;
  controls.rotateSpeed = ROTATE_SPEED_BASE;
  controls.zoomSpeed = 0.6;
  controls.minDistance = CAMERA.minDistance;
  controls.maxDistance = CAMERA.maxDistance;

  // ---------- 高度硬限制 ----------
  // updateMovement 里的钳制只处理 WASD 移动，
  // 用户用鼠标/触摸旋转时 target 会被 OrbitControls 直接改，
  // 所以必须监听 change 事件再钳一次。
  //
  // 云层回来了，但云的高度抬到了 y=108~148（比原来 65 高得多），
  // 而且云只在半径 120~320 的外圈环绕，不会飘到农场正上方。
  // 相机上限抬到 220：这个高度已经能俯视整片森林和远山，
  // 同时仍在云底 108 之上一点 —— 想穿云就穿云，不会再被硬挡住。
  const CAM_MAX_Y = 220;
  // target 上限：默认 26（比原来的 18 更高，平视时能多看到天空）。
  // 但特写高处的物体（猫头鹰在风车屋顶 y=31）时必须放宽，
  // 否则飞行结束时 target 会被硬压回 26 —— 相机瞬移，表现为抽动。
  const TARGET_MAX_Y_DEFAULT = 26;
  let targetMaxY = TARGET_MAX_Y_DEFAULT;
  // 允许临时放宽 target 上限（特写高处物体时用）
  function setTargetMaxY(v) {
    targetMaxY = v;
  }

  controls.addEventListener('change', () => {
    if (controls.target.y > targetMaxY) {
      controls.target.y = targetMaxY;
    }
    if (camera.position.y > CAM_MAX_Y) {
      // 把相机沿"相机-target"方向压下来，保持视线角度
      const dir = camera.position.clone().sub(controls.target);
      const horiz = Math.hypot(dir.x, dir.z);
      const maxDy = CAM_MAX_Y - controls.target.y;
      if (maxDy > 1) {
        const newDy = Math.min(dir.y, maxDy);
        camera.position.y = controls.target.y + newDy;
        // 水平距离保持不变，视线角度自然变陡
        const curHoriz = Math.hypot(camera.position.x - controls.target.x, camera.position.z - controls.target.z);
        if (curHoriz > 0.01 && horiz > 0.01) {
          const s = curHoriz / horiz;
          camera.position.x = controls.target.x + dir.x * s;
          camera.position.z = controls.target.z + dir.z * s;
        }
      } else {
        camera.position.y = CAM_MAX_Y;
      }
    }
  });
  controls.minPolarAngle = CAMERA.minPolarAngle;
  controls.maxPolarAngle = CAMERA.maxPolarAngle;
  // 水平方向：默认 360° 自由环绕；需要限制视角时把 config.fullAzimuth 设为 false
  if (CAMERA.fullAzimuth) {
    controls.minAzimuthAngle = -Infinity;
    controls.maxAzimuthAngle = Infinity;
  } else {
    controls.minAzimuthAngle = -CAMERA.maxAzimuth;
    controls.maxAzimuthAngle = CAMERA.maxAzimuth;
  }
  controls.autoRotate = false;
  controls.autoRotateSpeed = CAMERA.autoRotateSpeed;
  controls.enabled = false;
  controls.target.set(CAMERA.target.x, CAMERA.target.y, CAMERA.target.z);

  // ---------- FOV ----------
  const REF_ASPECT = 1.6;
  const MAX_PORTRAIT_FOV = 60;
  function updateFov() {
    const aspect = window.innerWidth / window.innerHeight;
    if (aspect >= REF_ASPECT) {
      camera.fov = CAMERA.fov;
    } else {
      const tanHalfH = Math.tan(THREE.MathUtils.degToRad(CAMERA.fov) / 2) * REF_ASPECT;
      camera.fov = Math.min(THREE.MathUtils.radToDeg(2 * Math.atan(tanHalfH / aspect)), MAX_PORTRAIT_FOV);
    }
    camera.aspect = aspect;
    camera.updateProjectionMatrix();
  }
  updateFov();

  // ---------- 开场 ----------
  const intro = {
    active: false,
    start: 0,
    from: new THREE.Vector3(),
    to: new THREE.Vector3(),
    fromTarget: new THREE.Vector3(),
    toTarget: new THREE.Vector3(),
    duration: CAMERA.introDuration,
    onDone: null,
  };

  function computeIntroPoints() {
    const fx = CAMERA.introFrom.x;
    const fz = CAMERA.introFrom.z;
    const groundY = model.heightAt(fx, fz);
    intro.from.set(fx, Math.max(groundY + 6, 10), fz);

    intro.to.set(CAMERA.introTo.x, CAMERA.introTo.y, CAMERA.introTo.z);
    const look = CAMERA.introLook || { x: 0, y: 12, z: 0 };
    intro.fromTarget.set(look.x, look.y, look.z);
    intro.toTarget.set(CAMERA.target.x, CAMERA.target.y, CAMERA.target.z);
  }

  const _look = new THREE.Vector3();

  function placeAtIntroStart() {
    computeIntroPoints();
    camera.position.copy(intro.from);
    controls.target.copy(intro.fromTarget);
    camera.lookAt(intro.fromTarget);
  }

  // 播放开场运镜。
  //
  // 关键改动：**起点用相机当前位置**，而不是重置到 intro.from。
  // 这样点击"探索"时镜头从你看到的画面直接起飞，不会有跳变。
  // （之前每次都 copy(intro.from)，如果相机被别的东西移动过，
  //   就会先"啪"地弹回起点再飞出去。）
  function playIntro(onDone) {
    computeIntroPoints();

    // 起点 = 当前相机位置（点击那一刻的画面）
    intro.from.copy(camera.position);
    intro.fromTarget.copy(controls.target);

    // 飞行时长按实际行程自适应。
    // 手机端缩短到 2.6~3.6 秒（等太久会以为卡住了）
    const travel = intro.from.distanceTo(intro.to);
    const isMobile = typeof navigator !== 'undefined' &&
      /Android|iPhone|iPad|iPod|Mobile/i.test(navigator.userAgent || '');
    intro.duration = isMobile
      ? THREE.MathUtils.clamp(travel * 42, 2600, 3600)
      : THREE.MathUtils.clamp(travel * 70, 3000, 6000);

    intro.active = true;
    intro.start = performance.now();
    intro.onDone = onDone;
    controls.enabled = false;
  }

  function updateIntro(now) {
    if (!intro.active) return;
    const raw = Math.min(1, (now - intro.start) / intro.duration);
    const t = easeInOutQuart(raw) * 0.7 + easeOutQuart(raw) * 0.3;

    camera.position.lerpVectors(intro.from, intro.to, t);
    camera.position.y += Math.sin(t * Math.PI) * 10;

    _look.lerpVectors(intro.fromTarget, intro.toTarget, easeInOutCubic(raw));
    controls.target.copy(_look);
    camera.lookAt(_look);

    if (raw >= 1) {
      intro.active = false;

      // 交接帧：先关阻尼同步一次 OrbitControls，再恢复阻尼
      const prevDamping = controls.enableDamping;
      controls.enableDamping = false;
      controls.enabled = true;
      controls.update();
      controls.enableDamping = prevDamping;

      // 视差冷却 + 归零，避免开屏结束立刻叠加视差造成抖动
      stabilizeParallax();

      if (intro.onDone) intro.onDone();
    }
  }

  // ---------- 飞向目标 ----------
  const fly = {
    active: false, t: 0, dur: 1.5,
    fromPos: new THREE.Vector3(), toPos: new THREE.Vector3(),
    fromTarget: new THREE.Vector3(), toTarget: new THREE.Vector3(),
    // ★ 落点相对观察点的球坐标偏移（水平距离 + 仰角），
    //   飞行期间用来做"最终校正"，保证交接帧相机姿态不跳。
    offsetDir: new THREE.Vector3(),
    dist: 0,
  };

  // 回到全景的独立补间（不走 fly 的交接逻辑，避免结束后又被带走）
  const resetAnim = {
    active: false, t: 0, dur: 1.6,
    fromPos: new THREE.Vector3(), toPos: new THREE.Vector3(),
    fromTarget: new THREE.Vector3(), toTarget: new THREE.Vector3(),
  };

  // 飞向某个物体。
  //
  // 参数：
  //   worldPos —— **物体包围盒中心**（已经是视觉重心，不要再额外抬）
  //   distance —— 期望的水平距离
  //   opts.radius  —— 包围球半径，用于算"装下整个物体需要多远"
  //   opts.minY/maxY —— 物体底部/顶部高度（可选，用于防相机钻进地面）
  //
  // 之前的问题：调用方传的已经是包围盒中心，这里又加了 height*0.55，
  // 导致观察点被抬到屋顶之上，物体被推到画面下半部。
  // ---------- 视差状态（必须在 flyTo 之前声明）----------
  const _parallaxBase = new THREE.Vector3();
  const _parallaxApplied = new THREE.Vector3();
  let parallaxInit = false;
  // 视差暂停计时（飞行刚结束时，等控制器稳定几帧再启用）
  let parallaxCooldown = 0;

  function flyTo(worldPos, distance = 60, opts = {}) {
    const radius = opts.radius || 10;

    fly.fromPos.copy(camera.position);
    fly.fromTarget.copy(controls.target);

    const lookAt = worldPos.clone();
    fly.toTarget.copy(lookAt);

    // ★ 关键：根据目标高度放宽 target 上限。
    //   猫头鹰停在风车屋顶 y=31，如果 targetMaxY 还是默认值 26，
    //   飞行结束交还控制器时 target 会被硬压回去 —— 相机瞬移（抽动）。
    //   这里放宽到目标高度 + 2，飞行结束后由 resetTargetMaxY 慢慢收回。
    setTargetMaxY(Math.max(TARGET_MAX_Y_DEFAULT, lookAt.y + 2));

    // ---------- 1. 方位角：从"相机相对当前观察点"取，退化时回退 ----------
    // 注意：如果相机几乎在观察点正上方（dir.y 很大），水平分量会接近 0，
    // 归一化后方向会突变 —— 这正是"急转弯"的来源之一。
    const dir = new THREE.Vector3().subVectors(camera.position, controls.target);
    dir.y = 0;

    if (dir.lengthSq() < 0.01) {
      // 退化：改用"从新观察点看旧观察点"的方向，保证连续性
      dir.subVectors(controls.target, camera.position);
      dir.y = 0;
    }
    if (dir.lengthSq() < 0.0001) {
      // 仍然退化：用相机自身的朝向
      camera.getWorldDirection(dir);
      dir.y = 0;
    }
    if (dir.lengthSq() < 0.0001) dir.set(0, 0, 1);
    dir.normalize();

    // ---------- 2. 距离：装下包围球，但设置合理上下限 ----------
    const vFovRad = THREE.MathUtils.degToRad(camera.fov);
    const hFovRad = 2 * Math.atan(Math.tan(vFovRad / 2) * camera.aspect);
    const halfFov = Math.min(vFovRad, hFovRad) / 2;
    const fitDist = (radius / Math.sin(halfFov)) * 1.15;

    // 下限：小物体（草垛 R=3）也不要贴到脸上。
    // ★ 原来是写死的 22 —— 对小动物和人来说太远了：
    //   Log Lady 包围球半径只有 1.1，dist=22 时 fov 31° 的竖直视野有 12 个单位，
    //   她 1.7 高只占画面的 14%，点开"特写"看到的还是一粒小人。
    //   改成随包围球半径缩放：小物体可以贴近，大建筑仍保持 22 的安全距离。
    const MIN_DIST = THREE.MathUtils.clamp(radius * 5.0, 5, 22);
    // 上限：别飞太远，否则从小物体飞过去会"从远处冲过来"
    const MAX_DIST = 130;

    let dist = Math.max(fitDist, MIN_DIST);
    dist = Math.min(dist, MAX_DIST);
    if (distance > 0) {
      // distance 是调用方给出的"期望特写距离"。
      // 小目标（猫狗/鸡/鱼）fitDist 只有 3~5，远小于期望的 9，
      // 旧逻辑把它当上限用，镜头会贴到 5 个单位 —— 又低又近，
      // 飞行末段很容易擦到地面。这里在 distance > dist 时取 distance。
      if (distance > dist) {
        dist = Math.min(distance, MAX_DIST);
      } else {
        dist = Math.min(dist, Math.max(distance * 1.5, MIN_DIST));
      }
    }

    // ★ 关键：必须落在 OrbitControls 的 min/maxDistance 之内。
    //   否则飞行结束交还控制器的那一帧，OrbitControls 会把相机硬推到边界，
    //   表现为"突然急转弯/瞬移"（草垛这类小物体尤其明显）。
    //
    //   但特写需要贴近小物体（牛半径 1.7，距离只有十几），
    //   所以这里把 minDistance 临时放宽到目标距离的 80%，
    //   等用户重新拉远时再恢复。否则特写永远被卡在 55 开外。
    const minAllowed = Math.min(controls.minDistance, dist * 0.8);
    controls.minDistance = minAllowed;
    dist = THREE.MathUtils.clamp(dist, minAllowed, controls.maxDistance);

    // ---------- 3. 相机位置：水平方向 + 指定仰角 ----------
    //
    // ★ 关键：必须【一次算对】，不能"先按 dir 放好再覆盖 y"。
    //
    //   之前的写法：
    //     fly.toPos.copy(lookAt).addScaledVector(dir, dist);
    //     fly.toPos.y = lookAt.y + dist * elevFactor;   // 覆盖 y
    //
    //   覆盖 y 后，toPos 到 lookAt 的【实际距离】不再等于 dist，
    //   但 controls.minDistance / maxDistance 仍按 dist 设置。
    //   飞行结束调用 controls.update() 时，OrbitControls 会把相机
    //   重新拉到 dist 上 —— 表现为"镜头抽动一下"。
    //
    //   现在改为：先算水平分量 + 垂直分量，再用【真实距离】做归一化。
    // ★ 仰角必须落在 OrbitControls 的极角限制内，否则 update() 会重新夹紧：
    //
    //   极角 phi = 90° - 仰角
    //   maxPolarAngle = 1.32 rad = 75.6°  →  仰角最小 14.4°
    //   minPolarAngle = 0.32 rad = 18.3°  →  仰角最大 71.7°
    //
    //   之前 elevFactor 最小 0.2（仰角 11.5°，phi=78.5°）超出限制，
    //   飞行结束时 controls.update() 把相机抬到 phi=75.6° —— 表现为抽动。
    const maxPolar = controls.maxPolarAngle;   // 1.32
    const minPolar = controls.minPolarAngle;   // 0.32
    // 允许的仰角范围（弧度）
    const minElev = Math.max(0.02, Math.PI / 2 - maxPolar) + 0.01;   // 14.4° + 余量
    const maxElev = Math.PI / 2 - minPolar - 0.01;                   // 71.7° - 余量

    // 原始仰角系数（0.2~0.34）→ 转成角度并夹到合法范围
    const rawFactor = THREE.MathUtils.clamp(0.22 + radius * 0.004, 0.2, 0.34);
    const rawElev = Math.asin(THREE.MathUtils.clamp(rawFactor, 0, 0.9));
    const elevAngle = THREE.MathUtils.clamp(rawElev, minElev, maxElev);

    const cosE = Math.cos(elevAngle);
    const sinE = Math.sin(elevAngle);
    const horizDir = dir.clone();

    fly.toPos.copy(lookAt)
      .addScaledVector(horizDir, dist * cosE);
    fly.toPos.y = lookAt.y + dist * sinE;

    // 防止相机钻进地面（抬高后要重新算距离，保持 dist 不变）
    // ★ 离地余量也要随距离缩放：原来写死 +8，特写小动物/人时
    //   （dist 只有 7~10）相机会被强行抬到 8 单位高空，
    //   再按 dist 重新归一化 —— 结果是从头顶俯拍，看不到正面。
    //   远距离（建筑全景）仍然保持 8 的余量，避免贴地穿模。
    const groundY = model.heightAt(fly.toPos.x, fly.toPos.z);
    const minY = groundY + THREE.MathUtils.clamp(dist * 0.28, 2.2, 8);
    if (fly.toPos.y < minY) {
      fly.toPos.y = minY;
      // 重新归一化到 dist，保证距离精确
      const off = fly.toPos.clone().sub(lookAt);
      const len = off.length();
      if (len > 0.001) {
        off.multiplyScalar(dist / len);
        fly.toPos.copy(lookAt).add(off);
      }
    }

    // ---------- 3.5 相机落点避障 ----------
    //
    // ★ 问题：飞向一棵小树时，相机的落点可能正好落在【另一棵树】的树冠里，
    //   画面被整片树叶填满（表现为"特写全绿、什么都看不见"）。
    //   实测：飞向 scatter 白桦(18,-28) 时，落点 (22.1,14.7,-6.4)
    //   距 TREE_SPECS 的白桦(24,-5) 只有 2.4 单位 —— 直接钻进它的树冠。
    //
    //   做法：把落点与场景里所有树的"树干+树冠"圆柱做碰撞检测，
    //   若钻进去了，就绕目标点旋转方位角，找一个空位（最多试 12 个方向）。
    if (typeof opts.avoidTrees === 'function') {
      const obstacles = opts.avoidTrees();
      if (obstacles && obstacles.length) {
        const inside = (px, py, pz) => {
          for (const ob of obstacles) {
            // 只关心"相机高度落在该树的高度区间"的情况
            if (py < ob.baseY || py > ob.topY) continue;
            if (Math.hypot(px - ob.x, pz - ob.z) < ob.r) return true;
          }
          return false;
        };
        if (inside(fly.toPos.x, fly.toPos.y, fly.toPos.z)) {
          const baseYaw = Math.atan2(horizDir.x, horizDir.z);
          const elevY = fly.toPos.y;
          let fixed = false;
          for (let k = 1; k <= 12 && !fixed; k++) {
            // 交替向左右偏转，步进 15°
            const sign = k % 2 === 1 ? 1 : -1;
            const delta = sign * Math.ceil(k / 2) * (Math.PI / 12);
            const a = baseYaw + delta;
            const nx = lookAt.x + Math.sin(a) * dist * cosE;
            const nz = lookAt.z + Math.cos(a) * dist * cosE;
            if (!inside(nx, elevY, nz)) {
              fly.toPos.x = nx;
              fly.toPos.z = nz;
              fixed = true;
            }
          }
        }
      }
    }

    // 最终精确对齐距离（消除浮点误差）
    {
      const off = fly.toPos.clone().sub(lookAt);
      const len = off.length();
      if (len > 0.001 && Math.abs(len - dist) > 0.001) {
        off.multiplyScalar(dist / len);
        fly.toPos.copy(lookAt).add(off);
      }
    }

    // 记录"观察点 → 相机"的单位方向与距离，供交接帧复用
    fly.offsetDir.copy(fly.toPos).sub(lookAt);
    fly.dist = fly.offsetDir.length();
    if (fly.dist > 0.001) fly.offsetDir.multiplyScalar(1 / fly.dist);

    // ---------- 4. 飞行时长：按距离自适应 ----------
    // 之前 travel/60 让 50 单位行程只用 0.83 秒，末段速度快得像瞬移。
    // 现在 travel/28，50 单位约 1.8 秒，观感从容很多。
    const travel = fly.fromPos.distanceTo(fly.toPos);
    fly.dur = THREE.MathUtils.clamp(travel / 28, 1.2, 2.4);

    fly.t = 0;
    fly.active = true;
    controls.enabled = false;
    controls.autoRotate = false;
  }

  const _flyFromOffset = new THREE.Vector3();
  const _flyToOffset = new THREE.Vector3();
  const _flyOffset = new THREE.Vector3();

  function updateFly(dt) {
    if (!fly.active) return;
    fly.t += dt / fly.dur;
    const t = Math.min(1, fly.t);

    // 用二次缓动（easeInOutQuad）：比四次方平缓得多。
    //
    // 四次方缓动（easeInOutQuart）的中段速度是平均速度的 2 倍，
    // 在低帧率下（比如 8fps）会表现为"慢-突然快-慢"，看起来像抽动。
    // 二次方的中段速度只有 1.5 倍，过渡更均匀。
    const e = easeInOutQuad(t);
    // ★ 观察点用 lerp，相机位置用"相对观察点的偏移"插值。
    //   之前 camera.position 和 target 各自独立 lerp，如果飞行途中
    //   目标（走动的猫狗/动物）位置变了，相机和观察点的相对姿态会被拉歪，
    //   交接帧再被控制器夹一次 —— 就是那下抖动。
    //   现在把相机位置定义为 target + 偏移，两者永远保持同一个相对关系。
    controls.target.lerpVectors(fly.fromTarget, fly.toTarget, e);

    _flyFromOffset.copy(fly.fromPos).sub(fly.fromTarget);
    _flyToOffset.copy(fly.toPos).sub(fly.toTarget);
    _flyOffset.lerpVectors(_flyFromOffset, _flyToOffset, e);
    camera.position.copy(controls.target).add(_flyOffset);
    camera.lookAt(controls.target);

    // 最后一帧直接精确对齐到目标：
    // 否则 e 只到 0.99x，剩余那一点点位移会在下一帧"补"上去，
    // 表现为末帧突然跳一下（小物体飞行时尤其明显）。
    // 注意：不要在 t >= 1 时再 copy 一次。
    // lerpVectors 在 e=1 时已经精确等于 toPos，
    // 再 copy 一次是多余的 —— 而且如果 t 因为 dt 钳制只到 0.98，
    // 这一 copy 会造成 0.19 单位的突跳（实测）。
    // 用下面的"精确对齐"只在 e < 0.999 时才补一次。
    if (t >= 1 && e < 0.999) {
      camera.position.copy(fly.toPos);
      controls.target.copy(fly.toTarget);
      camera.lookAt(controls.target);
    }

    if (t >= 1) {
      fly.active = false;

      // 关键：飞行过程中我们直接改了 camera.position 和 controls.target，
      // 但 OrbitControls 内部缓存着球坐标（spherical）。如果直接 enabled = true
      // 再调 update()，它会用旧缓存重算位置 —— 表现为"瞬间跳一下"。
      //
      // ★ 交接帧必须满足三个约束，否则会看到镜头"抽一下"：
      //   1. 距离 >= controls.minDistance（否则 update() 把相机推远）
      //   2. 极角落在 [minPolarAngle, maxPolarAngle]（否则 update() 重新夹紧）
      //   3. target.y <= targetMaxY（否则被压回去）
      //   低矮目标（猫狗、小人、干草堆）最容易踩到第 2 条：
      //   它们半径小 → dist 小 → 仰角算出来偏平 → 超出 maxPolarAngle，
      //   交接时相机被硬抬起来（实测 y 从 9.5 掉到 7.65，跳 1.85）。
      //
      // 做法：按 fly.offsetDir + fly.dist 重建落点，并把这三点一次性夹到合法范围，
      //   夹完再交给控制器 —— 交接帧相机位置与上一帧连续。
      controls.target.copy(fly.toTarget);

      const polarMin = controls.minPolarAngle;
      const polarMax = controls.maxPolarAngle;
      let dist = Math.max(fly.dist, controls.minDistance);

      // 由 offsetDir 反推极角（极角 = 与 +Y 轴夹角）
      const dir = fly.offsetDir;
      let polar = Math.acos(THREE.MathUtils.clamp(dir.y, -1, 1));
      polar = THREE.MathUtils.clamp(polar, polarMin + 0.005, polarMax - 0.005);

      // 保持方位角不变，按夹紧后的极角 + 距离重建位置
      const azimuth = Math.atan2(dir.x, dir.z);
      const sinP = Math.sin(polar);
      camera.position.set(
        controls.target.x + sinP * Math.sin(azimuth) * dist,
        controls.target.y + Math.cos(polar) * dist,
        controls.target.z + sinP * Math.cos(azimuth) * dist
      );
      camera.lookAt(controls.target);

      // 临时关闭阻尼 + 关闭自动旋转，避免第一次 update 产生插值偏移
      const prevDamping = controls.enableDamping;
      const prevAutoRotate = controls.autoRotate;
      controls.enableDamping = false;
      controls.autoRotate = false;   // 先别转，避免"落地就开始转"的突兀感

      // ★ 关键：update() 之前必须把 minDistance 收到"当前实际距离"以下。
      //   飞小目标（猫狗/鸡/干草堆）时 flyTo 会把 minDistance 压到 dist*0.8，
      //   但落点经过极角夹紧后实际距离可能变小（比如 9 -> 6.5）。
      //   这时 update() 发现 dist < minDistance，就把相机【沿视线推远】——
      //   而推远的方向是"绕 target 抬升"，表现为交接帧相机 y 突然掉 1.9。
      //   把 minDistance 直接对齐到实际距离，update() 就什么都不做。
      const actualDist = camera.position.distanceTo(controls.target);
      if (controls.minDistance > actualDist) {
        controls.minDistance = actualDist * 0.98;
      }
      controls.update();
      controls.enableDamping = prevDamping;
      controls.enabled = true;

      resetTargetMaxY();

      // 飞行结束后延长视差冷却：
      // 否则飞行一结束，视差立刻叠加 —— 相机从 fly.toPos 跳到
      // fly.toPos + 视差偏移，表现为"镜头抽动"。
      parallaxCooldown = 1.2;
      // 视差当前值归零，避免残留偏移
      parallax.curX = 0;
      parallax.curY = 0;
      _parallaxApplied.set(0, 0, 0);

      // 延迟 0.6 秒再恢复自动旋转（给用户一点"停下来看全景"的时间）
      if (prevAutoRotate) {
        setTimeout(() => {
          if (controls.enabled && !fly.active && !intro.active) {
            controls.autoRotate = true;
          }
        }, 600);
      }
    }
  }

  // 回到全景：直接用 introTo 的位置，不走 flyTo 的特写限制
  // （flyTo 有 MAX_DIST=130 和 elevFactor<=0.34 的限制，会把全景压低）
  function reset() {
    // 回到全景：从当前视角平滑飞过去（独立补间，结束帧精确落位）
    resetAnim.fromPos.copy(camera.position);
    resetAnim.fromTarget.copy(controls.target);
    resetAnim.toPos.set(CAMERA.introTo.x, CAMERA.introTo.y, CAMERA.introTo.z);
    resetAnim.toTarget.set(0, 6, 0);
    resetAnim.t = 0;
    resetAnim.dur = 1.9;
    resetAnim.active = true;

    fly.active = false;
    controls.enabled = false;
    controls.autoRotate = false;
    stabilizeParallax();
  }

  function updateReset(dt) {
    if (!resetAnim.active) return;
    resetAnim.t += dt / resetAnim.dur;
    const t = Math.min(1, resetAnim.t);
    // 缓出曲线：末尾速度趋近 0，交还控制器时不抖
    const e = easeOutQuart(t);

    controls.target.lerpVectors(resetAnim.fromTarget, resetAnim.toTarget, e);
    camera.position.lerpVectors(resetAnim.fromPos, resetAnim.toPos, e);
    camera.lookAt(controls.target);

    if (t >= 1) {
      resetAnim.active = false;
      controls.target.copy(resetAnim.toTarget);
      camera.position.copy(resetAnim.toPos);
      camera.lookAt(resetAnim.toTarget);

      const prevDamping = controls.enableDamping;
      controls.enableDamping = false;
      controls.enabled = true;
      controls.update();
      controls.enableDamping = prevDamping;

      resetTargetMaxY();
      stabilizeParallax();
    }
  }

  // ---------------------------------------------------------------------------
  // WASD 自由移动
  //   W/S 前后，A/D 左右（相对当前镜头朝向的水平面）
  //   Q/E 升降 target（相当于整体上下平移视角）
  //   Shift 加速，空格/E 上升，Q/C 下降
  //   ★ 不用 Ctrl 下降：Ctrl+W 是浏览器关闭标签页的快捷键，
  //     网页无法拦截，按住 Ctrl+WASD 会直接把页面关掉（看起来像闪退）。
  // ---------------------------------------------------------------------------
  const keys = new Set();
  const MOVE_KEYS = new Set(['w', 'a', 's', 'd', 'q', 'e', 'c', ' ', 'arrowup', 'arrowdown', 'arrowleft', 'arrowright']);

  function onKeyDown(e) {
    const k = e.key.toLowerCase();
    if (!MOVE_KEYS.has(k)) return;
    // 输入框里打字时不劫持
    const tag = (e.target && e.target.tagName) || '';
    if (tag === 'INPUT' || tag === 'TEXTAREA') return;
    keys.add(k);
    e.preventDefault();
  }
  function onKeyUp(e) {
    keys.delete(e.key.toLowerCase());
  }
  function onBlur() {
    keys.clear();
  }

  // ★ Ctrl+W 是浏览器级快捷键，网页无法 preventDefault。
  //   这里做最后一道保险：一旦检测到 Ctrl+W，关闭前弹确认框，
  //   用户可以选择留在页面，不会"啪"一下闪退。
  let ctrlWGuard = false;
  window.addEventListener('keydown', (e) => {
    if (e.ctrlKey && e.key.toLowerCase() === 'w') ctrlWGuard = true;
  }, true);
  window.addEventListener('beforeunload', (e) => {
    if (!ctrlWGuard) return;
    e.preventDefault();
    e.returnValue = '';
    setTimeout(() => { ctrlWGuard = false; }, 0);
  });
  window.addEventListener('keydown', onKeyDown);
  window.addEventListener('keyup', onKeyUp);
  window.addEventListener('blur', onBlur);

  // 水平朝向：从相机指向 target 的方向投影到 XZ 平面
  const _forward = new THREE.Vector3();
  const _right = new THREE.Vector3();
  const _up = new THREE.Vector3(0, 1, 0);
  const _delta = new THREE.Vector3();

  const moveState = { active: false };

  // 按"观察距离 + 相机离地高度"自适应旋转速度：
  // 相机越近、越低，同样的拖动在视角上越夸张，所以放慢一点。
  function syncRotateSpeed() {
    const d = camera.position.distanceTo(controls.target);
    const g = model.heightAt(camera.position.x, camera.position.z);
    const h = Math.max(0, camera.position.y - g);
    const distScale = THREE.MathUtils.clamp(d / 50, 0.20, 1);
    const lowScale = THREE.MathUtils.clamp(h / 10, 0.25, 1);
    controls.rotateSpeed = ROTATE_SPEED_BASE * Math.min(distScale, lowScale);
  }

  // 相机拉远后，把 minDistance 恢复到配置值（避免永久贴着物体）。
  // 注意：必须等飞行结束后再恢复，否则飞行途中就被推回去。
  function restoreMinDistance() {
    if (fly.active || intro.active) return;         // 飞行中不动
    if (controls.minDistance >= CAMERA.minDistance) return;
    const d = camera.position.distanceTo(controls.target);
    // ★ 恢复下限时不能超过当前距离，否则 OrbitControls 会在下一帧
    //   把相机推远（表现为镜头突然往后退一下）。
    //   只有在用户主动拉远到接近原始下限时才恢复，且不超过 d。
    if (d > CAMERA.minDistance * 0.92) {
      controls.minDistance = Math.min(CAMERA.minDistance, d * 0.98);
    }
  }

  // ---------- 鼠标视差 ----------
  // 参考 windland 的"果冻感"：
  // 鼠标移动时相机做非常轻微的偏移（不是旋转），
  // 用弹簧阻尼平滑跟随，产生轻微的视差。
  const parallax = {
    targetX: 0, targetY: 0,     // 归一化的鼠标位置 -1~1
    curX: 0, curY: 0,           // 当前平滑值
    // 强度：0.55 -> 2.6 -> 3.4（+30%）
    // 2.6 是"绝对偏移量"，按观察距离自适应（dist / 110）。
    // 现在 3.4，鼠标从中心移到角落时相机位移约 6.2 单位（之前 4.78）。
    strength: 5.1,
    damping: 2.4,               // 稍微慢一点，果冻感更明显
    fadeIn: 0,                  // 渐入系数 0~1（避免飞行结束后视差突然生效）
  };

  function onParallaxMove(e) {
    if (e.pointerType === 'touch') return;   // 触摸不做视差
    parallax.targetX = (e.clientX / window.innerWidth) * 2 - 1;
    parallax.targetY = (e.clientY / window.innerHeight) * 2 - 1;
  }

  function onParallaxLeave() {
    parallax.targetX = 0;
    parallax.targetY = 0;
  }

  window.addEventListener('pointermove', onParallaxMove, { passive: true });
  window.addEventListener('pointerleave', onParallaxLeave, { passive: true });

  // 应用视差偏移（在 controls.update 之后调用）
  const _parallaxOffset = new THREE.Vector3();
  // （_parallaxBase / _parallaxApplied / parallaxInit 已在文件上方声明）

  function applyParallax(dt) {
    // ---------- 冷却期：不应用视差 ----------
    // 飞行刚结束时，OrbitControls 的内部球坐标缓存还没和实际相机位置同步。
    // 如果这时叠加视差偏移，下一帧 controls.update() 会把相机拉回去 → 画面抽动。
    // 所以飞行期间和结束后 0.5 秒内完全跳过视差。
    if (parallaxCooldown > 0) {
      parallaxCooldown -= dt;
      // 冷却期内也要撤销上一次的偏移（如果还有）
      if (_parallaxApplied.lengthSq() > 0.0001) {
        camera.position.sub(_parallaxApplied);
        _parallaxApplied.set(0, 0, 0);
      }
      // ★ 关键：冷却期间让 cur 直接跟上 target。
      //   否则冷却结束时 cur=0、target≠0，弹簧会快速追赶，
      //   产生一次明显的位移（实测 0.128）。
      //   现在 cur 始终等于 target，冷却结束时偏移由 fade=0 控制，从 0 平滑增长。
      parallax.curX = parallax.targetX;
      parallax.curY = parallax.targetY;
      parallaxInit = false;
      return;
    }

    // 弹簧平滑
    const k = 1 - Math.exp(-parallax.damping * dt);
    parallax.curX += (parallax.targetX - parallax.curX) * k;
    parallax.curY += (parallax.targetY - parallax.curY) * k;

    // 首次或相机被别处移动时，重置基准
    if (!parallaxInit) {
      _parallaxBase.copy(camera.position);
      parallaxInit = true;
      _parallaxApplied.set(0, 0, 0);
      // 渐入：刚启用视差时强度从 0 开始，避免瞬间跳变
      parallax.fadeIn = 0;
    }

    // 视差强度渐入（0.8 秒从 0 到 1）
    if (parallax.fadeIn < 1) {
      parallax.fadeIn = Math.min(1, (parallax.fadeIn || 0) + dt / 0.8);
    }
    const fade = parallax.fadeIn * parallax.fadeIn * (3 - 2 * parallax.fadeIn);   // smoothstep

    // 计算本次应该应用的偏移（绝对量，不是累加）
    const dist = camera.position.distanceTo(controls.target);
    // 偏移随观察距离缩放：远处观察时偏移更大才看得出
    const scale = parallax.strength * (dist / 110);

    const right = _parallaxOffset.set(1, 0, 0).applyQuaternion(camera.quaternion);
    const up = new THREE.Vector3(0, 1, 0).applyQuaternion(camera.quaternion);

    // 目标偏移（乘以渐入系数）
    const offX = parallax.curX * scale * fade;
    const offY = -parallax.curY * scale * fade;

    // 先撤销上一次的偏移，再应用新的（避免累积漂移）
    camera.position.sub(_parallaxApplied);

    _parallaxApplied.set(0, 0, 0)
      .addScaledVector(right, offX)
      .addScaledVector(up, offY);

    camera.position.add(_parallaxApplied);
  }

  // 相机被飞行/重置移动时，重置视差基准
  function resetParallaxBase() {
    parallaxInit = false;
  }

  // 开场/飞行结束后的稳定：视差冷却并归零，避免第一帧跳一下
  function stabilizeParallax() {
    parallaxCooldown = 1.0;
    parallax.curX = 0;
    parallax.curY = 0;
    parallaxInit = false;
    _parallaxApplied.set(0, 0, 0);
  }

  // 飞行期间的地面保护（不碰朝向，只防止钻进地面）
  // 恢复到默认的 target 上限（延迟调用，避免飞行刚结束就压回去）
  function resetTargetMaxY() {
    setTimeout(() => {
      // 只有当当前 target 低于默认值时才恢复，避免把高处的 target 压下去
      if (controls.target.y <= TARGET_MAX_Y_DEFAULT + 0.5) {
        setTargetMaxY(TARGET_MAX_Y_DEFAULT);
      }
    }, 1200);
  }

  // 飞行途中的地面保护。
  //
  // ★ 只在【飞行中】调用（主循环的 else 分支），飞行结束后不再调用 ——
  //   否则交接帧会把相机硬压到 groundY + 4，表现为"镜头突然往下一沉"。
  //   实测：猫/鸡/小人这类低矮目标交接后 y 会掉 1.9，
  //   因为飞行落点高度（约 groundY + 3.4）比这里的 4 还低。
  //
  // ★ 余量也要随距离缩放：特写小物体时相机本来就贴地，
  //   写死 +4 会把镜头顶到头顶上方，看不到正面。
  function clampCameraAboveGround() {
    const g = model.heightAt(camera.position.x, camera.position.z);
    const d = camera.position.distanceTo(controls.target);
    // 距离越近，允许越低。
    // ★ 上限从 6 收到 3：特写小猫小狗时镜头贴地飞行，
    //   旧的 6 会把镜头顶住一段时间再突然松手，形成"快触底弹一下"。
    const margin = THREE.MathUtils.clamp(d * 0.18, 1.2, 3.0);
    const minY = g + margin;
    if (camera.position.y < minY) {
      camera.position.y = minY;
      // 抬高后按原距离重新归一化，保持"相机到观察点"的距离不变
      const off = camera.position.clone().sub(controls.target);
      const len = off.length();
      if (len > 0.001 && Math.abs(len - d) > 0.001) {
        off.multiplyScalar(d / len);
        camera.position.copy(controls.target).add(off);
      }
    }
  }

  function updateMovement(dt) {
    if (keys.size === 0) {
      if (moveState.active) moveState.active = false;
      return;
    }
    // 开场 / 飞行 / 回全景补间中不响应
    if (intro.active || fly.active || resetAnim.active) return;

    const speed = CAMERA.wasdSpeed * (keys.has('shift') ? 2.4 : 1);
    const step = speed * dt;

    _forward.subVectors(controls.target, camera.position);
    _forward.y = 0;
    if (_forward.lengthSq() < 1e-6) _forward.set(0, 0, -1);
    _forward.normalize();
    _right.crossVectors(_forward, _up).normalize();

    _delta.set(0, 0, 0);
    if (keys.has('w') || keys.has('arrowup')) _delta.add(_forward);
    if (keys.has('s') || keys.has('arrowdown')) _delta.sub(_forward);
    if (keys.has('d') || keys.has('arrowright')) _delta.add(_right);
    if (keys.has('a') || keys.has('arrowleft')) _delta.sub(_right);
    if (keys.has('e') || keys.has(' ')) _delta.y += 1;
    if (keys.has('q') || keys.has('c')) _delta.y -= 1;

    if (_delta.lengthSq() < 1e-6) return;

    _delta.normalize().multiplyScalar(step);

    // 同时移动 target 和 camera，保持相对姿态
    controls.target.add(_delta);
    camera.position.add(_delta);

    // 软边界：不让镜头跑出世界
    const t = controls.target;
    t.x = THREE.MathUtils.clamp(t.x, BOUNDS.minX, BOUNDS.maxX);
    t.z = THREE.MathUtils.clamp(t.z, BOUNDS.minZ, BOUNDS.maxZ);
    // target 高度上限：跟随 targetMaxY（默认 26，特写高处物体时会临时放宽）。
    // 相机本身另有 CAM_MAX_Y = 220 的硬上限，两者各管一层。
    t.y = THREE.MathUtils.clamp(t.y, 2, targetMaxY);

    // 相机高度不要钻到地面以下
    const groundY = model.heightAt(camera.position.x, camera.position.z);
    if (camera.position.y < groundY + 4) camera.position.y = groundY + 4;

    moveState.active = true;
    controls.autoRotate = false;
  }

  placeAtIntroStart();

  return {
    camera, controls, updateFov, playIntro, placeAtIntroStart, updateIntro,
    flyTo, updateFly, reset, updateReset, updateMovement, restoreMinDistance, applyParallax, resetParallaxBase, clampCameraAboveGround, setTargetMaxY, resetTargetMaxY, syncRotateSpeed,
    get introActive() { return intro.active; },
    get flyActive() { return fly.active; },
    get resetActive() { return resetAnim.active; },
    get moving() { return moveState.active; },
    dispose() {
      window.removeEventListener('keydown', onKeyDown);
      window.removeEventListener('keyup', onKeyUp);
      window.removeEventListener('blur', onBlur);
    },
  };
}