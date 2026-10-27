import * as THREE from 'three';

// ---------------------------------------------------------------------------
// 卡通描边（反向外壳 / Inverted Hull）
//
// 原理：把模型沿法线放大一点点，只画【背面】，
//       背面凸出来的那一圈就变成描边。
//
// 参考项目做法：p = position + normalize(normal) * uT * clamp(d * k, min, max)
//   其中 d 是视空间深度 —— 远处描边自动变粗，避免小于 1 像素而消失。
// ---------------------------------------------------------------------------

// ★ 手写 ShaderMaterial 必须自己处理实例化：
//   three.js 只给内置材质的 <project_vertex> 注入 instanceMatrix，
//   这里若不乘，几百个实例的描边会全部塌到物体原点堆成一团黑块。
const OUTLINE_VS = [
  'uniform float uT;',
  'uniform float uDepthScale;',
  'uniform float uMinScale;',
  'uniform float uMaxScale;',
  'varying float vFogDepth;',
  'void main() {',
  '  vec4 mv = vec4(position, 1.0);',
  '  #ifdef USE_INSTANCING',
  '    mv = instanceMatrix * mv;',
  '  #endif',
  '  mv = modelViewMatrix * mv;',
  '  float d = -mv.z;',
  '  float scale = clamp(d * uDepthScale, uMinScale, uMaxScale);',
  '  vec3 p = position + normalize(normal) * uT * scale;',
  '  vec4 mp = vec4(p, 1.0);',
  '  #ifdef USE_INSTANCING',
  '    mp = instanceMatrix * mp;',
  '  #endif',
  '  vec4 mvp = modelViewMatrix * mp;',
  '  vFogDepth = -mvp.z;',
  '  gl_Position = projectionMatrix * mvp;',
  '}',
].join('\n');

// ★ 描边必须吃雾：
//   否则远处物体被雾冲成灰白、描边还是全强度暗紫，
//   薄雾里满屏都是"黑线"，非常扎眼。
//
// ★ 而且描边要比本体【更快】融进雾里：
//   描边色 (0x2a2438) 和雾色 (早晨 0xe4d9cb) 明度差 5 倍以上，
//   用同一套 fogNear/fogFar 时，本体已经淡成灰白、描边还剩 74% 强度，
//   视觉上就是"雾里的黑线"。
//   做法：smoothstep 之后再做一次 pow(f, uFogPower)（< 1 = 提前饱和），
//   并把 fogFar 稍微拉近一点。这样近处描边依旧锐利，
//   中远处的描边先于本体消失。
const OUTLINE_FS = [
  'uniform vec3 uC;',
  'uniform vec3 fogColor;',
  'uniform float fogNear;',
  'uniform float fogFar;',
  'uniform float uFogFarScale;',
  'uniform float uFogPower;',
  'varying float vFogDepth;',
  'void main() {',
  '  vec3 col = uC;',
  '  #ifdef USE_FOG',
  '    float fFar = max(fogNear + 1.0, fogFar * uFogFarScale);',
  '    float f = smoothstep(fogNear, fFar, vFogDepth);',
  '    f = pow(f, uFogPower);',
  '    col = mix(col, fogColor, f);',
  '  #endif',
  '  gl_FragColor = vec4(col, 1.0);',
  '}',
].join('\n');

// 描边材质缓存：同厚度同颜色只建一个
// （描边材质没有逐物体状态，缓存是安全的）
const _cache = new Map();

export function outlineMaterial(thickness, color) {
  const t = thickness === undefined ? 0.05 : thickness;
  const c = color === undefined ? 0x2a2438 : color;
  const key = t.toFixed(4) + '|' + c.toString(16);
  if (_cache.has(key)) return _cache.get(key);

  const mat = new THREE.ShaderMaterial({
    uniforms: THREE.UniformsUtils.merge([
      THREE.UniformsLib.fog,     // ★ fogColor / fogNear / fogFar，由 three.js 自动刷新
      {
        uT: { value: t },
        uC: { value: new THREE.Color(c) },
        uDepthScale: { value: 0.020 },
        uMinScale: { value: 0.85 },
        uMaxScale: { value: 1.60 },
        uFogFarScale: { value: 0.62 },
        uFogPower: { value: 1.00 },
      },
    ]),
    vertexShader: OUTLINE_VS,
    fragmentShader: OUTLINE_FS,
    side: THREE.BackSide,   // ★ 只画背面
    depthWrite: true,
    fog: true,              // ★ 描边必须吃雾，否则薄雾里满屏黑线
  });

  _cache.set(key, mat);
  return mat;
}

// 给单个 Mesh 加描边（作为子节点，共用 geometry，零顶点开销）
//
// ★ InstancedMesh 必须用 InstancedMesh 做描边：
//   普通 Mesh 不读 instanceMatrix，几百个实例会全部塌到原点堆成一团黑块。
export function addOutline(mesh, thickness, color) {
  if (!mesh || !mesh.geometry) return null;
  if (mesh.userData.__outline) return mesh.userData.__outline;

  const mat = outlineMaterial(thickness, color);
  let outline;

  if (mesh.isInstancedMesh) {
    // 共享同一个 instanceMatrix（不复制，直接引用）
    outline = new THREE.InstancedMesh(mesh.geometry, mat, mesh.count);
    outline.instanceMatrix = mesh.instanceMatrix;
    outline.count = mesh.count;
    // 包围球是"单棵树"的，用它做剔除会误剔整片森林 —— 直接关掉
    outline.frustumCulled = false;
  } else {
    outline = new THREE.Mesh(mesh.geometry, mat);
  }

  outline.name = 'outline';
  outline.castShadow = false;
  outline.receiveShadow = false;
  outline.raycast = function () {};      // 不参与点击检测
  outline.userData.isOutline = true;

  mesh.add(outline);
  mesh.userData.__outline = outline;
  return outline;
}

// 批量：遍历 Group 给所有合格的 Mesh 加描边
//
// 过滤规则（避免上版的描边 bug）：
//   - 跳过半透明物体（玻璃、光晕、雪点、落叶）
//   - 跳过 MeshBasicMaterial（贴图招牌、窗户发光片、星星）
//   - 跳过包围球半径过小的（< minRadius，描边会糊成一团）
export function addOutlineDeep(root, thickness, color, opts) {
  if (!root) return 0;
  const o = opts || {};
  const minRadius = o.minRadius === undefined ? 0.25 : o.minRadius;
  let count = 0;

  root.traverse(function (m) {
    if (!m.isMesh) return;
    if (m.userData.isOutline) return;

    const mat = m.material;
    if (!mat) return;
    if (mat.transparent) return;
    if (mat.isMeshBasicMaterial) return;
    if (mat.visible === false) return;
    if (m.userData.noOutline) return;

    const g = m.geometry;
    if (g) {
      if (!g.boundingSphere) g.computeBoundingSphere();
      const bs = g.boundingSphere;
      if (bs && bs.radius < minRadius) return;
    }

    // ★ 逐物体覆盖描边厚度：
    //   围栏这类「细杆件」用建筑级别的 0.055 会被描边完全吞掉，
    //   在薄雾里就是一整条粗黑线。用 userData.outlineThickness 单独调细。
    const t = m.userData.outlineThickness === undefined ? thickness : m.userData.outlineThickness;

    if (addOutline(m, t, color)) count++;
  });

  return count;
}

export const outlineSettings = {
  enabled: true,
  thickness: 0.05,
  color: 0x2a2438,
  // 描边雾衰减：farScale < 1 让描边更早进入雾区
  // （雾里远处物体的描边先消失，近处依旧锐利）
  fogFarScale: 0.62,
  fogPower: 1.00,
};

// 全局统一设置描边雾衰减（材质是共享缓存，改一次全部生效）
export function setOutlineFog(farScale, power) {
  outlineSettings.fogFarScale = farScale;
  outlineSettings.fogPower = power;
  _cache.forEach(function (m) {
    if (!m.uniforms) return;
    if (m.uniforms.uFogFarScale) m.uniforms.uFogFarScale.value = farScale;
    if (m.uniforms.uFogPower) m.uniforms.uFogPower.value = power;
  });
}