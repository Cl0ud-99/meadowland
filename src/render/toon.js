import * as THREE from 'three';

// ---------------------------------------------------------------------------
// 三渲二（卡通渲染）材质工厂
//
// 参考效果的特征：
//   - 光照分阶（2~3 阶硬边），不是平滑渐变
//   - 暗部偏冷（蓝紫），亮部偏暖（橙黄）—— 这是"三渲二"最关键的色彩分级
//   - 没有黑描边（参考图就没有）
//   - 保留 flatShading 的低多边形棱面
//
// 实现方式：用 onBeforeCompile 注入 Lambert 的片元着色器，
// 在最终输出前做"分阶 + 色温分离"。这样：
//   - 保留 Lambert 的所有功能（顶点色、雾、阴影）
//   - 改动最小，兼容现有所有代码
// ---------------------------------------------------------------------------

// 全局开关（可以运行时切换，方便对比）
export const toonSettings = {
  enabled: true,
  steps: 3.0,          // 分阶数（2=两阶，3=三阶，越大越接近平滑）
  softness: 0.06,      // 分界柔和度（0=硬边）
  shadowTint: new THREE.Color(0.55, 0.52, 0.72),  // 暗部色（偏蓝紫）
  lightTint: new THREE.Color(1.06, 1.02, 0.94),   // 亮部色（偏暖）
};

// 共享的 uniform（所有 toon 材质共享，改一次全部生效）
const sharedUniforms = {
  uToonSteps: { value: toonSettings.steps },
  uToonSoftness: { value: toonSettings.softness },
  uShadowTint: { value: toonSettings.shadowTint },
  uLightTint: { value: toonSettings.lightTint },
  uToonEnabled: { value: 1.0 },
};

// ---------------------------------------------------------------------------
// 给一个 Lambert 材质注入 toon 着色逻辑
// ---------------------------------------------------------------------------
export function makeToon(material) {
  material.onBeforeCompile = (shader) => {
    // 共享 uniform
    shader.uniforms.uToonSteps = sharedUniforms.uToonSteps;
    shader.uniforms.uToonSoftness = sharedUniforms.uToonSoftness;
    shader.uniforms.uShadowTint = sharedUniforms.uShadowTint;
    shader.uniforms.uLightTint = sharedUniforms.uLightTint;
    shader.uniforms.uToonEnabled = sharedUniforms.uToonEnabled;

    // ---------- 片元着色器 ----------
    shader.fragmentShader = shader.fragmentShader
      .replace(
        '#include <common>',
        `#include <common>
        uniform float uToonSteps;
        uniform float uToonSoftness;
        uniform vec3 uShadowTint;
        uniform vec3 uLightTint;
        uniform float uToonEnabled;
        `
      )
      .replace(
        '#include <output_fragment>',
        `// ---------- 三渲二：光照分阶 + 色温分离 ----------
        {
          // outgoingLight 是 Lambert 计算完的光照结果
          vec3 lit = outgoingLight;

          // 1. 求亮度（用感知权重）
          float lum = dot(lit, vec3(0.2126, 0.7152, 0.0722));

          // 2. 分阶：把连续亮度量化成 N 档
          //    floor(lum * steps + 0.5) / steps
          float stepped = floor(lum * uToonSteps + 0.5) / uToonSteps;

          // 3. 柔和过渡（避免完全硬边导致锯齿）
          stepped = mix(stepped, lum, uToonSoftness);

          // 4. 用分阶后的亮度重建颜色（保留色相）
          vec3 toonLit = lit * (stepped / max(lum, 0.0001));

          // 5. 色温分离：暗部偏蓝紫，亮部偏暖
          float t = clamp(stepped, 0.0, 1.0);
          vec3 tint = mix(uShadowTint, uLightTint, t);
          toonLit *= tint;

          // 6. 混合开关
          outgoingLight = mix(lit, toonLit, uToonEnabled);
        }
        #include <output_fragment>`
      );
  };

  // 缓存 key 必须唯一，否则不同材质会共用编译结果
  material.customProgramCacheKey = () => 'toon-v1';

  material.needsUpdate = true;
  return material;
}

// ---------------------------------------------------------------------------
// 便捷函数：创建 toon 版 Lambert（带材质缓存）
//
// 为什么要缓存：
//   全场 575 个网格，几乎每个都自己 new 一个 MeshLambertMaterial，
//   材质实例 506 个 —— 大量参数完全相同（比如"纯色 + flatShading"的木头/石头），
//   白白多占显存、多一次 program 绑定，切换建筑风格时也更容易出状态残留。
//
// 缓存规则（保守优先，宁可少缓存也不要缓存错）：
//   以下情况【不缓存】，每次新建：
//     - params.transparent === true      （seasonfx 淡入淡出会改 opacity）
//     - params.opacity !== undefined     （同上，透明度是逐实例状态）
//     - params.map / alphaMap 存在       （贴图材质）
//     - params.shared === false          （调用方明确要求独占）
//   其余按"排序后的参数"做 key，返回同一个材质实例。
//
// ⚠️ 被缓存的材质是共享的，**绝对不能**在运行时改它的 color / opacity / emissive，
//    也不能 dispose()。凡是需要运行时改色的地方（大树、森林、草地、地形、田垄作物）
//    都必须传 shared:false。
// ---------------------------------------------------------------------------
const _matCache = new Map();
const _cacheStats = { hits: 0, misses: 0, skipped: 0 };

function _cacheable(p) {
  if (p.transparent === true) return false;
  if (p.opacity !== undefined) return false;
  if (p.map || p.alphaMap) return false;
  return true;
}

function _cacheKey(p) {
  const keys = Object.keys(p).sort();
  let s = '';
  for (let i = 0; i < keys.length; i++) {
    const k = keys[i];
    const v = p[k];
    if (v instanceof THREE.Color) {
      s += k + '=#' + v.getHexString() + ';';
    } else if (v && typeof v === 'object') {
      s += k + '=' + JSON.stringify(v) + ';';
    } else {
      s += k + '=' + String(v) + ';';
    }
  }
  return s;
}

export function toonLambert(params = {}) {
  // shared 只是给本函数的开关，不能传给 THREE（否则 setValues 会 warn）
  //
  // ★ shared === false 必须在【删掉参数之前】读出来。
  //   之前只是把 shared 删掉，_cacheable() 完全没检查它 —— 于是所有
  //   "要求独占"的材质（森林 / 参天大树 / 品种树 / 地形）实际拿到的是
  //   缓存里的同一个实例。applySeason 改树冠颜色时，谷仓、奶牛、鸟、
  //   猫头鹰、木材堆、风车被一起染成褐色（实测 296 个 mesh 共用一个材质）。
  const exclusive = params.shared === false;

  let p = params;
  if (Object.prototype.hasOwnProperty.call(p, 'shared')) {
    p = Object.assign({}, params);
    delete p.shared;
  }

  if (exclusive || !_cacheable(p)) {
    _cacheStats.skipped++;
    return makeToon(new THREE.MeshLambertMaterial(p));
  }

  const key = _cacheKey(p);
  const hit = _matCache.get(key);
  if (hit) {
    _cacheStats.hits++;
    return hit;
  }
  const mat = makeToon(new THREE.MeshLambertMaterial(p));
  _matCache.set(key, mat);
  _cacheStats.misses++;
  return mat;
}

// 调试用：看缓存命中情况
export function toonCacheStats() {
  return {
    size: _matCache.size,
    hits: _cacheStats.hits,
    misses: _cacheStats.misses,
    skipped: _cacheStats.skipped,
  };
}

// ---------------------------------------------------------------------------
// 运行时切换
// ---------------------------------------------------------------------------
export function setToonEnabled(on) {
  toonSettings.enabled = on;
  sharedUniforms.uToonEnabled.value = on ? 1.0 : 0.0;
}

export function setToonSteps(steps) {
  toonSettings.steps = steps;
  sharedUniforms.uToonSteps.value = steps;
}

export function setToonSoftness(s) {
  toonSettings.softness = s;
  sharedUniforms.uToonSoftness.value = s;
}

// ---------------------------------------------------------------------------
// 由"冷暖三光源"的实际颜色驱动三渲二的色温分离
//
// 之前 uShadowTint / uLightTint 是写死的常量，不管补光怎么调，
// 暗部永远是同一个蓝紫 —— 补光的颜色被这一步抹平了。
// 现在改成：
//   暗部色 = 冷补光颜色 与 环境光颜色 混合（归一化到 1 附近，只保留色相）
//   亮部色 = 主光颜色 归一化，再往暖白推一点
// 这样三光源的冷暖对比才能真正进到画面里。
// ---------------------------------------------------------------------------
const _tmpC = new THREE.Color();
const _shadowBase = new THREE.Color(0.55, 0.52, 0.72);
const _lightBase = new THREE.Color(1.06, 1.02, 0.94);

// 把一个颜色归一化到"亮度 = 1"，只保留色相与饱和度
function normalizeLum(c, out) {
  const lum = 0.2126 * c.r + 0.7152 * c.g + 0.0722 * c.b;
  if (lum < 0.0001) { out.setRGB(1, 1, 1); return out; }
  out.setRGB(c.r / lum, c.g / lum, c.b / lum);
  return out;
}

export function driveToonTint(sunColor, fillColor, ambColor, strength) {
  const s = strength === undefined ? 1 : strength;

  // 亮部：主光色相归一化，往暖白靠
  normalizeLum(sunColor, _tmpC);
  _lightBase.setRGB(
    1 + (_tmpC.r - 1) * 0.55 * s,
    1 + (_tmpC.g - 1) * 0.55 * s,
    1 + (_tmpC.b - 1) * 0.55 * s
  );

  // 暗部：冷补光 + 环境光，归一化后往蓝紫推
  _tmpC.setRGB(
    fillColor.r * 0.72 + ambColor.r * 0.28,
    fillColor.g * 0.72 + ambColor.g * 0.28,
    fillColor.b * 0.72 + ambColor.b * 0.28
  );
  normalizeLum(_tmpC, _tmpC);
  sharedUniforms.uShadowTint.value.setRGB(
    (0.62 + (_tmpC.r - 1) * 0.55) * s + (1 - s) * 0.55,
    (0.60 + (_tmpC.g - 1) * 0.55) * s + (1 - s) * 0.52,
    (0.86 + (_tmpC.b - 1) * 0.55) * s + (1 - s) * 0.72
  );

  sharedUniforms.uLightTint.value.copy(_lightBase);
}

// 暴露给调试
export { sharedUniforms };
