import * as THREE from 'three';
import { LIGHT, DUSK_T } from '../config.js';

// ---------------------------------------------------------------------------
// 三段式光照：早晨（迷雾）→ 中午（晴朗）→ 夜晚
//
// 时间滑杆 t 的语义：
//   0.00 ~ 0.50  早晨 → 中午   （雾逐渐散开，光线变亮变暖）
//   0.50 ~ 1.00  中午 → 夜晚   （阳光转月光，灯光亮起）
//
// 用"关键帧 + 缓动"而不是两段直线插值，这样：
//   - 雾的消散不是线性的，前半段散得快、后半段几乎没雾
//   - 光线颜色的变化在中间有"晴朗"这个锚点，不会一路变暗
// ---------------------------------------------------------------------------

// 缓动：让每段的起点和终点都"慢进慢出"，避免参数突变
function smoothstep(x) {
  const t = Math.max(0, Math.min(1, x));
  return t * t * (3 - 2 * t);
}

// 在关键帧之间取值。t ∈ [0,1] 映射到 morning → day → dusk → night。
//
// 原来是三段（morning/day/night），t>0.5 之后是"正午暖白"直接混向
// "夜晚冷月光"，导致 t≈0.78 时主光已经是淡蓝色、强度却还有 1.05，
// 打在绿草地上就是一片灰绿"雾"。加一段 dusk 解决。
function sample(t) {
  if (t <= 0.5) {
    return { k: smoothstep(t / 0.5), a: 'morning', b: 'day' };
  }
  if (t <= DUSK_T) {
    return { k: smoothstep((t - 0.5) / (DUSK_T - 0.5)), a: 'day', b: 'dusk' };
  }
  return { k: smoothstep((t - DUSK_T) / (1 - DUSK_T)), a: 'dusk', b: 'night' };
}

export function createLighting(scene, quality = null) {
  const hemi = new THREE.HemisphereLight(0xffffff, 0x444444, 1);
  scene.add(hemi);

  const sun = new THREE.DirectionalLight(0xffffff, 1);
  sun.castShadow = true;
  const shadowSize = quality?.shadowMapSize ?? 2048;
  sun.shadow.mapSize.set(shadowSize, shadowSize);

  // -------------------------------------------------------------------------
  // 阴影相机范围：按【实际投影物体】收紧
  //
  // 原来是 ±130 的方框 + near1/far320。实测全场景 321 个 castShadow mesh
  // 在光源空间里（101 个时段扫描取并集）只占：
  //     X[-106.7, 97.9]   Y[-81.3, 82.2]   深度跨度 189.7
  // 也就是说 260x260 的方框有 44% 是空的，far320 有一半深度是空的。
  //
  // 阴影贴图的精度 = 范围 / 贴图分辨率，收紧范围等于直接提高阴影清晰度：
  //   2048 贴图：260/2048 = 12.7cm/texel  ->  241/2048 = 11.8cm/texel（X 方向 +8%）
  //                                        ->  193/2048 =  9.4cm/texel（Y 方向 +35%）
  //    512 贴图（低端机）：50.8cm/texel     ->  47.1cm / 37.7cm
  //
  // 留 18% 余量给季节特效、动物走动等运行时变化。
  // （实测余量：5% -> 1.9 单位，12% -> 5.8，18% -> 约 9.1；太薄了动物走两步就顶出去）
  // -------------------------------------------------------------------------
  const SHADOW_PAD = 1.18;
  const SHADOW_L = -106.7 * SHADOW_PAD;   // -125.9
  const SHADOW_R = 97.9 * SHADOW_PAD;     //  115.5
  const SHADOW_T = 82.2 * SHADOW_PAD;     //   97.0
  const SHADOW_B = -81.3 * SHADOW_PAD;    //  -95.9

  // 光源到原点的固定距离。
  //
  // 原来 sunPos 距离原点只有 112~116（早晨 (95,26,60)、日落 (-110,16,20) …），
  // 也就是光源本身就【站在场景内部】。低角度斜射时，水车（x≈-95）、
  // 远处围栏这些物体就跑到了阴影相机【背后】（实测深度到 -21），
  // 被 near=1 直接裁掉 —— 它们的阴影是缺的。
  //
  // DirectionalLight 只看方向不看距离，所以把位置归一化到这个距离，
  // 光照效果完全不变，但所有物体都稳稳落在相机前方。
  const LIGHT_DIST = 300;

  sun.shadow.camera.left = SHADOW_L;
  sun.shadow.camera.right = SHADOW_R;
  sun.shadow.camera.top = SHADOW_T;
  sun.shadow.camera.bottom = SHADOW_B;
  // 深度：光源在 LIGHT_DIST 处，实测深度范围是 [LIGHT_DIST-100.5, LIGHT_DIST+89.2]
  sun.shadow.camera.near = LIGHT_DIST - 112;   // 188
  sun.shadow.camera.far = LIGHT_DIST + 100;    // 400
  sun.shadow.bias = -0.0006;               // 范围小了，bias 也收一点
  sun.shadow.normalBias = 0.045;
  sun.shadow.radius = 2.2;
  // three.js 只在 shadow map 重建时才 updateProjectionMatrix，
  // 这里显式刷一次，避免首帧用默认的 -5..5 投影。
  sun.shadow.camera.updateProjectionMatrix();
  scene.add(sun);
  scene.add(sun.target);

  const ambient = new THREE.AmbientLight(0xffffff, 0.2);
  scene.add(ambient);

  // -------------------------------------------------------------------------
  // 冷暖三光源
  //
  //   主光 sun     ：暖色直射，投影
  //   冷补光 fill  ：从主光反方向斜切进来，把暗部压成冷色，
  //                  这样"亮部暖 / 暗部冷"的体积感才出来
  //   暖反弹 bounce：从地面往上打的暖光（Y 为负），
  //                  模拟草地把阳光反射到物体底面，避免死黑
  //
  // 两盏都不投影（省一次 shadow pass，且补光本来就不该有硬阴影）
  // -------------------------------------------------------------------------
  const fill = new THREE.DirectionalLight(0x7fa6e0, 0.5);
  fill.castShadow = false;
  scene.add(fill);
  scene.add(fill.target);

  const bounce = new THREE.DirectionalLight(0xffcf9e, 0.2);
  bounce.castShadow = false;
  scene.add(bounce);
  scene.add(bounce.target);

  // 三套颜色对象（避免每帧 new）
  const PAL = {
    morning: {
      sky: new THREE.Color(LIGHT.morning.sky),
      ground: new THREE.Color(LIGHT.morning.ground),
      sun: new THREE.Color(LIGHT.morning.sunColor),
      fog: new THREE.Color(LIGHT.morning.fog),
      // 早晨环境光改成冷蓝：阴影偏冷，和暖色晨光形成冷暖对比。
      // 原来是暖白 0xfff2e0，把阴影也照暖了，冷暖分离只剩 +1。
      amb: new THREE.Color(0x9ab4dc),
      fill: new THREE.Color(LIGHT.morning.fillColor),
      bounce: new THREE.Color(LIGHT.morning.bounceColor),
    },
    day: {
      sky: new THREE.Color(LIGHT.day.sky),
      ground: new THREE.Color(LIGHT.day.ground),
      sun: new THREE.Color(LIGHT.day.sunColor),
      fog: new THREE.Color(LIGHT.day.fog),
      amb: new THREE.Color(0xffffff),
      fill: new THREE.Color(LIGHT.day.fillColor),
      bounce: new THREE.Color(LIGHT.day.bounceColor),
    },
    dusk: {
      sky: new THREE.Color(LIGHT.dusk.sky),
      ground: new THREE.Color(LIGHT.dusk.ground),
      sun: new THREE.Color(LIGHT.dusk.sunColor),
      fog: new THREE.Color(LIGHT.dusk.fog),
      amb: new THREE.Color(0xffd0a8),   // 落日余晖偏橙
      fill: new THREE.Color(LIGHT.dusk.fillColor),
      bounce: new THREE.Color(LIGHT.dusk.bounceColor),
    },
    night: {
      sky: new THREE.Color(LIGHT.night.sky),
      ground: new THREE.Color(LIGHT.night.ground),
      sun: new THREE.Color(LIGHT.night.sunColor),
      fog: new THREE.Color(LIGHT.night.fog),
      amb: new THREE.Color(0x3355aa),   // 月光偏蓝
      fill: new THREE.Color(LIGHT.night.fillColor),
      bounce: new THREE.Color(LIGHT.night.bounceColor),
    },
  };

  const fog = new THREE.Fog(
    LIGHT.morning.fog,
    LIGHT.morning.fogNear,
    LIGHT.morning.fogFar
  );
  scene.fog = fog;

  const state = { t: 0 };
  const _sunDir = new THREE.Vector3();

  function apply(t) {
    state.t = t;
    const { k, a, b } = sample(t);

    const A = LIGHT[a];
    const B = LIGHT[b];
    const PA = PAL[a];
    const PB = PAL[b];

    const mix = (x, y) => x + (y - x) * k;

    hemi.color.copy(PA.sky).lerp(PB.sky, k);
    hemi.groundColor.copy(PA.ground).lerp(PB.ground, k);
    hemi.intensity = mix(A.hemi, B.hemi);

    sun.color.copy(PA.sun).lerp(PB.sun, k);
    sun.intensity = mix(A.sunIntensity, B.sunIntensity);
    // 归一化到固定距离：方向不变（所以光照效果不变），
    // 但保证所有投影物体都落在阴影相机的前方而不是背后。
    _sunDir.set(
      mix(A.sunPos.x, B.sunPos.x),
      mix(A.sunPos.y, B.sunPos.y),
      mix(A.sunPos.z, B.sunPos.z)
    ).normalize().multiplyScalar(LIGHT_DIST);
    sun.position.copy(_sunDir);
    sun.target.position.set(0, 0, 0);
    sun.target.updateMatrixWorld();

    ambient.intensity = mix(A.ambient, B.ambient);
    ambient.color.copy(PA.amb).lerp(PB.amb, k);

    // 冷补光
    fill.color.copy(PA.fill).lerp(PB.fill, k);
    fill.intensity = mix(A.fillIntensity, B.fillIntensity);
    fill.position.set(
      mix(A.fillPos.x, B.fillPos.x),
      mix(A.fillPos.y, B.fillPos.y),
      mix(A.fillPos.z, B.fillPos.z)
    );
    fill.target.position.set(0, 0, 0);
    fill.target.updateMatrixWorld();

    // 暖反弹光
    bounce.color.copy(PA.bounce).lerp(PB.bounce, k);
    bounce.intensity = mix(A.bounceIntensity, B.bounceIntensity);
    bounce.position.set(
      mix(A.bouncePos.x, B.bouncePos.x),
      mix(A.bouncePos.y, B.bouncePos.y),
      mix(A.bouncePos.z, B.bouncePos.z)
    );
    bounce.target.position.set(0, 0, 0);
    bounce.target.updateMatrixWorld();

    fog.color.copy(PA.fog).lerp(PB.fog, k);
    fog.near = mix(A.fogNear, B.fogNear);
    fog.far = mix(A.fogFar, B.fogFar);
  }

  apply(0);

  return {
    hemi, sun, ambient, fill, bounce, fog, state, apply,
    get t() { return state.t; },
  };
}