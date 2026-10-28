import * as THREE from '../../vendor/three/three.module.js';
import { CAMERA } from '../config.js';

// 渐变天穹：一个大球，用 shader 做从地平线到天顶的渐变
export function buildSky() {
  // 半径 900：地形半径 310、外圈山脊最高 74，相机拉到最远（maxDistance 240）
  // 时到地形最远角可达 643。原来的 520 比这个距离还小，天空球会直接插到
  // 远山前面把它整片盖掉。900 留出足够余量，配合 CAMERA.far = 1200。
  const geo = new THREE.SphereGeometry(900, 32, 20);
  const mat = new THREE.ShaderMaterial({
    side: THREE.BackSide,
    depthWrite: false,
    uniforms: {
      uTop: { value: new THREE.Color(0x3a7ac8) },     // 天顶
      uMid: { value: new THREE.Color(0x8ac0f0) },     // 中层（新增）
      uBottom: { value: new THREE.Color(0xb4d2e4) },  // 地平线
      uOffset: { value: 0.06 },
      uExponent: { value: 0.72 },
      // 地平线辉光（三渲二的关键特征：地平线有一道亮光）
      uGlowColor: { value: new THREE.Color(0xffc080) },
      uGlowIntensity: { value: 0.0 },   // 0 = 关闭，由 applyMode 控制

      // ---------- 太阳 / 月亮 ----------
      // 直接画在天穹上，不再用单独的透明面片。
      // 面片走 AdditiveBlending，在 8bit RT + ACES 的后期管线里叠加量几乎为零
      // （实测纯红 1.0 只让像素 +18），而且同一状态连渲两次结果都不同。
      // 天穹是不透明、单 pass、无混合的，画进去既稳定又省一个 draw call。
      uSunDir: { value: new THREE.Vector3(0, 1, 0) },  // 世界空间，从相机指向太阳
      uSunCore: { value: new THREE.Color(0xfffbe8) },
      uSunHalo: { value: new THREE.Color(0xffd9a0) },
      uSunIntensity: { value: 0.0 },   // 0 = 关闭
      uSunSize: { value: 0.022 },      // 核心角半径（弧度）≈ 1.26°
      uSunHaloSize: { value: 0.18 },   // 光晕角半径（弧度）≈ 10.3°
      uSunCoreBoost: { value: 4.2 },   // 核心亮度倍数（已降低 30%，避免本体过爆）
    },
    vertexShader: /* glsl */`
      varying vec3 vWorldPos;
      void main() {
        vec4 wp = modelMatrix * vec4(position, 1.0);
        vWorldPos = wp.xyz;
        gl_Position = projectionMatrix * viewMatrix * wp;
      }
    `,
    fragmentShader: /* glsl */`
      uniform vec3 uTop;
      uniform vec3 uMid;
      uniform vec3 uBottom;
      uniform float uOffset;
      uniform float uExponent;
      uniform vec3 uGlowColor;
      uniform float uGlowIntensity;
      uniform vec3 uSunDir;
      uniform vec3 uSunCore;
      uniform vec3 uSunHalo;
      uniform float uSunIntensity;
      uniform float uSunSize;
      uniform float uSunHaloSize;
      uniform float uSunCoreBoost;
      varying vec3 vWorldPos;
      void main() {
        // 关键：h 必须是「相对相机的视线方向」的 y 分量，不能用 normalize(vWorldPos)。
        //
        // 天空球每帧跟随相机（main.js 里 sky.position.copy(camera.position)），
        // 球心就在相机上，所以顶点世界坐标 = 相机位置 + 半径 × 方向。
        // 用 normalize(世界坐标) 时，分母里混进了相机自身的位移：
        //   相机在原点   → h = 46 / 522  = 0.088
        //   相机在 z=240 → h = 46 / 284  = 0.162
        // 同一个屏幕位置算出的 h 差了一倍，地平线渐变就会随镜头拉远往上爬，
        // 浅色的地平线色整片糊到远山上面 —— 看起来就像「天空盖住了远景」。
        // 减掉 cameraPosition 之后 h 只跟视线方向有关，镜头怎么拉都不变形。
        vec3 dir = normalize(vWorldPos - cameraPosition);
        float h = dir.y;
        float t = pow(max(h + uOffset, 0.0), uExponent);
        t = clamp(t, 0.0, 1.0);

        // ---------- 三色渐变 ----------
        //   0.0 ~ 0.45 : uBottom -> uMid（地平线到中层）
        //   0.45 ~ 1.0 : uMid -> uTop（中层到天顶）
        // 用 smoothstep 让过渡更自然
        float k1 = smoothstep(0.0, 0.45, t);
        float k2 = smoothstep(0.45, 1.0, t);
        vec3 col = mix(uBottom, uMid, k1);
        col = mix(col, uTop, k2);

        // ---------- 地平线辉光 ----------
        // 在地平线附近（h ≈ 0）加一道柔和的光带
        //   band: 只在 |h| < 0.25 范围内有值，向上下衰减
        float band = exp(-abs(h) * 11.0);
        // 让光带略微偏下（地平线以下也有一点，模拟大气散射）
        band *= smoothstep(-0.25, 0.02, h);
        col += uGlowColor * band * uGlowIntensity;

        // ---------- 太阳 / 月亮 ----------
        // cosA = 视线方向与太阳方向的夹角余弦。
        //   核心：smoothstep 在 cos(角半径) 附近过渡，边缘略软
        //   光晕：用 2(1-cosA) ≈ 夹角的平方做高斯衰减，避免每像素 acos
        if (uSunIntensity > 0.001) {
          float cosA = dot(dir, uSunDir);
          float core = smoothstep(cos(uSunSize), cos(uSunSize * 0.45), cosA);
          float ang2 = 2.0 * (1.0 - cosA);
          float halo = exp(-ang2 / max(uSunHaloSize * uSunHaloSize, 1e-6));
          col += uSunHalo * halo * uSunIntensity * 0.35;
          col += uSunCore * core * uSunIntensity * uSunCoreBoost;
        }

        gl_FragColor = vec4(col, 1.0);
      }
    `,
  });
  const mesh = new THREE.Mesh(geo, mat);
  mesh.name = 'sky';
  mesh.frustumCulled = false;
  return mesh;
}

// 夜晚星星：Points，只在夜间可见
export function buildStars(count = 700) {
  const positions = new Float32Array(count * 3);
  const sizes = new Float32Array(count);
  for (let i = 0; i < count; i++) {
    // 只铺在上半球
    const theta = Math.random() * Math.PI * 2;
    const phi = Math.acos(Math.random() * 0.92);
    const r = 820;   // 在天空球 900 之内，又在 camera.far 1200 之内
    positions[i * 3] = r * Math.sin(phi) * Math.cos(theta);
    positions[i * 3 + 1] = r * Math.cos(phi);
    positions[i * 3 + 2] = r * Math.sin(phi) * Math.sin(theta);
    sizes[i] = 1.2 + Math.random() * 2.4;
  }
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.BufferAttribute(positions, 3));
  geo.setAttribute('aSize', new THREE.BufferAttribute(sizes, 1));

  const mat = new THREE.ShaderMaterial({
    transparent: true,
    depthWrite: false,
    blending: THREE.AdditiveBlending,
    uniforms: { uOpacity: { value: 0 }, uPixelRatio: { value: 1 } },
    vertexShader: /* glsl */`
      attribute float aSize;
      uniform float uPixelRatio;
      varying float vFade;
      void main() {
        vec4 mv = modelViewMatrix * vec4(position, 1.0);
        gl_Position = projectionMatrix * mv;
        gl_PointSize = aSize * uPixelRatio * 1.6;
        vFade = smoothstep(0.0, 0.35, normalize(position).y);
      }
    `,
    fragmentShader: /* glsl */`
      uniform float uOpacity;
      varying float vFade;
      void main() {
        vec2 uv = gl_PointCoord - 0.5;
        float d = length(uv);
        float a = smoothstep(0.5, 0.0, d);
        gl_FragColor = vec4(vec3(1.0), a * vFade * uOpacity);
      }
    `,
  });

  const points = new THREE.Points(geo, mat);
  points.name = 'stars';
  points.frustumCulled = false;
  points.renderOrder = -1;
  return points;
}

// ---------------------------------------------------------------------------
// 棉花团云朵
//
// 用户要求：① 棉花团质感 ② 不要黑色的法线描边
//
// 做法：
//   1. 每朵云 = 5~8 个**大幅重叠**的压扁球（IcosahedronGeometry detail=2），
//      中间鼓、两头收，轮廓是凹凸的团块，不是几个分开的球
//   2. 所有 puff 在构建时合并成**一个** BufferGeometry，
//      一朵云只占 1 个 draw call
//   3. 材质是自定义 ShaderMaterial（不走 toon.js）：
//      · 顶亮底暗：按法线 y 分量在 uBottom -> uTop 之间插值
//      · 再叠一层按 puff 自身高度的提亮，模拟体积
//      · 边缘按法线与视线夹角提亮并降 alpha，形成绒毛过渡
//      三渲二的分阶光照会把云切成硬块，所以这里必须自己写。
//   4. **不加描边**：云不在 main.js 的 addOutlineDeep 列表里，
//      另外每个 mesh 都打了 userData.noOutline = true 兜底。
//   5. 手写雾：远处云淡入天空色，和描边/地形共用 scene.fog 的 uniform。
// ---------------------------------------------------------------------------

const CLOUD_WHITE = new THREE.Color(0xffffff);

// ★ 云集中在「开场相机看过去」的那片天区。
//   原因：水平 FOV 只有 2*atan(tan(15.5°)*16/9) ≈ 52.5°，
//   18 朵云均匀撒满 360° 时，落进画幅的期望只有 18*52.5/360 ≈ 2.6 朵，
//   实测更惨（4 朵 |ndc|<1，其中还有在相机背后的），等于白做。
//   改成围绕默认视线方位 ±105° 铺开，画幅内期望 18*52.5/210 ≈ 4.5 朵。
const VIEW_AZ = Math.atan2(
  CAMERA.target.z - CAMERA.introTo.z,
  CAMERA.target.x - CAMERA.introTo.x
);   // 默认视线方位 ≈ -101°
const CLOUD_SPREAD = 105 * Math.PI / 180;

const CLOUD_VS = [
  'attribute float aPuff;',            // 0 = 云底, 1 = 云顶（构建时烘焙进顶点）
  'varying vec3 vNormalW;',
  'varying vec3 vViewW;',
  'varying float vPuff;',
  'varying float vFogDepth;',
  'void main() {',
  '  vec4 wp = modelMatrix * vec4(position, 1.0);',
  '  vNormalW = normalize(mat3(modelMatrix) * normal);',
  '  vViewW = cameraPosition - wp.xyz;',
  '  vPuff = aPuff;',
  '  vec4 mv = viewMatrix * wp;',
  '  vFogDepth = -mv.z;',
  '  gl_Position = projectionMatrix * mv;',
  '}',
].join('\n');

const CLOUD_FS = [
  'uniform vec3 uTop;',
  'uniform vec3 uBottom;',
  'uniform vec3 uRim;',
  'uniform float uOpacity;',
  'uniform vec3 fogColor;',
  'uniform float fogNear;',
  'uniform float fogFar;',
  // ★ 云的雾必须比地面淡得多。
  //   云在 520~800 距离上，而早晨雾是 near 180 / far 900，
  //   smoothstep 在 600 处已经到 0.62 —— 云会被雾色（≈天空色）吃掉 62%，
  //   白团变成淡蓝团，跟天空糊成一片，这就是「云看不见」的真凶。
  //   这里把 fogFar 乘一个系数（2.6）把云的雾推远，云才保得住白色。
  'uniform float uFogFarScale;',
  'varying vec3 vNormalW;',
  'varying vec3 vViewW;',
  'varying float vPuff;',
  'varying float vFogDepth;',
  'void main() {',
  '  vec3 n = normalize(vNormalW);',
  '  vec3 v = normalize(vViewW);',
  '  float up = clamp(n.y * 0.5 + 0.5, 0.0, 1.0);',
  '  vec3 col = mix(uBottom, uTop, smoothstep(0.10, 0.92, up));',
  '  col *= 0.92 + 0.16 * clamp(vPuff, 0.0, 1.0);',
  '  float fres = 1.0 - abs(dot(n, v));',
  // ★ 边缘光原来太强：相机几乎是水平看云，看到的绝大部分表面法线都垂直于视线，
  //   fres ≈ 1，于是整朵云都被 uRim（偏蓝的地平线色）盖住，白团变成淡蓝团。
  //   降到 0.20 只保留轮廓上一圈绒毛过渡。
  '  col = mix(col, uRim, pow(fres, 3.0) * 0.20);',
  // ★ 云底自身压暗一点，让团块有体积（原来只有 uBottom 与 uTop 的差值，
  //   两者都在 0.8 以上，云看起来是一块平板）
  '  col *= 0.80 + 0.30 * clamp(vPuff, 0.0, 1.0);',
  // ★ 同理，alpha 边缘下限从 0.62 提到 0.88 —— 否则水平视角下整朵云只有 62% 不透明，
  //   39% 的天空透上来，云永远是一层薄雾。
  '  float alpha = uOpacity * mix(1.0, 0.88, pow(fres, 4.0));',
  '  #ifdef USE_FOG',
  '    float f = smoothstep(fogNear, fogFar * uFogFarScale, vFogDepth);',
  '    col = mix(col, fogColor, f * 0.85);',
  '  #endif',
  '  gl_FragColor = vec4(col, alpha);',
  '}',
].join('\n');

// 合并 puff：IcosahedronGeometry 是非索引的，直接拼数组即可，
// 顺便把「该顶点在整朵云里的高度比例」烘焙进 aPuff 属性。
function mergePuffs(puffs, minY, spanY) {
  let total = 0;
  for (const g of puffs) total += g.attributes.position.count;

  const pos = new Float32Array(total * 3);
  const nor = new Float32Array(total * 3);
  const puff = new Float32Array(total);

  let off = 0;
  for (const g of puffs) {
    const p = g.attributes.position;
    const n = g.attributes.normal;
    pos.set(p.array, off * 3);
    nor.set(n.array, off * 3);
    for (let i = 0; i < p.count; i++) {
      puff[off + i] = (p.getY(i) - minY) / spanY;
    }
    off += p.count;
    g.dispose();
  }

  const out = new THREE.BufferGeometry();
  out.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  out.setAttribute('normal', new THREE.BufferAttribute(nor, 3));
  out.setAttribute('aPuff', new THREE.BufferAttribute(puff, 1));
  out.computeBoundingSphere();
  return out;
}

function makeCloudGeometry(rng) {
  const puffs = [];
  const n = 5 + Math.floor(rng.next() * 4);      // 5~8 个球
  const spanX = rng.range(6.5, 10.5);
  const spanZ = rng.range(3.6, 6.0);
  let maxY = 0.001;
  let minY = 0;

  for (let i = 0; i < n; i++) {
    const k = n === 1 ? 0.5 : i / (n - 1);
    // 中间鼓、两头收：0.45~1.0
    const bulge = 1.0 - Math.abs(k - 0.5) * 1.10;
    const pr = (0.62 + bulge * 0.92) * rng.range(0.86, 1.14);
    const px = (k - 0.5) * spanX + rng.range(-0.5, 0.5);
    const pz = rng.range(-1, 1) * spanZ * 0.42;
    const py = (1 - bulge) * -0.28 + rng.range(-0.18, 0.18);

    const g = new THREE.IcosahedronGeometry(pr, 2);
    g.scale(1.06, 0.80, 1.02);
    g.translate(px, py, pz);
    puffs.push(g);

    const top = py + pr * 0.80;
    const bot = py - pr * 0.80;
    if (top > maxY) maxY = top;
    if (bot < minY) minY = bot;
  }

  return mergePuffs(puffs, minY, Math.max(0.001, maxY - minY));
}

// count 由画质档位决定（high 18 / medium 12 / low 8）
export function buildClouds(count, rng) {
  const group = new THREE.Group();
  group.name = 'clouds';

  const mat = new THREE.ShaderMaterial({
    uniforms: THREE.UniformsUtils.merge([
      THREE.UniformsLib.fog,
      {
        uTop: { value: new THREE.Color(0xffffff) },
        uBottom: { value: new THREE.Color(0xbcd2e8) },
        uRim: { value: new THREE.Color(0xf2f8ff) },
        uOpacity: { value: 0.95 },
        // 云比地面更抗雾（见 CLOUD_FS 顶部注释）
        uFogFarScale: { value: 2.6 },
      },
    ]),
    vertexShader: CLOUD_VS,
    fragmentShader: CLOUD_FS,
    transparent: true,
    depthWrite: true,
    depthTest: true,
    side: THREE.FrontSide,
    fog: true,
  });

  const items = [];
  for (let i = 0; i < count; i++) {
    const m = new THREE.Mesh(makeCloudGeometry(rng), mat);
    m.name = 'cloud-' + i;
    m.castShadow = false;
    m.receiveShadow = false;
    m.userData.noOutline = true;   // 兜底：任何描边遍历都会跳过
    m.renderOrder = 1;

    // ★ 云的位置不是随便撒的，必须落进「天空可见带」里。
    //
    //   实测（probe-clband.mjs，相机 (32,40,164) 每 15° 方位取 40~520 半径内
    //   最高地形点的仰角）：外圈山脊的轮廓仰角 min 3.7° / max 15.63° / avg 8.62°。
    //   也就是说仰角低于 ~8.6° 的云，会被山脊整个挡住。
    //   另一头上限来自画幅：target.y = 26 时画幅顶边仰角约 10.4°。
    //   两头一夹，可用窗口只有 8.0°~11.5° 这一条窄带 ——
    //   原来写死 y = 108~148、半径 120~320，等于把云放在 18°~48° 仰角上，
    //   全部飞出画幅（18 朵里 0 朵入框），这才是「看不见云」的第二个原因。
    // ★ 实测（probe-band3.mjs，1280×720，相机 (32,40,164)→(0,26,0)）：
    //   把 36 个方位 × 9 档仰角 × 3 档半径全部射线测一遍，统计「在画幅内且未被山脊挡住」的格子数。
    //   elev 4° 时 rad 620/820 只剩 1 个 clear（远处被外圈山脊吃掉），rad 420 有 5 个；
    //   elev 6°~10° 时三档半径都是 5 个 clear；elev ≥11° 全部出画幅（clear 0）。
    //   所以取 elev 5.0°~9.5°、rad 380~620 —— 云落在画幅 y≈110~250 的可见天空带里，
    //   而不是原来 8.0°~11.5° 时贴在最顶端 36~90 行（几乎和画幅上边缘重合，看不出来）。
    const CLOUD_ELEV = [5.5, 9.5];    // 度
    const CLOUD_REF_Y = CAMERA.introTo.y;   // 全景相机高度（40），用来把仰角换算成世界 y
    const rad = rng.range(330, 560);
    const ang = VIEW_AZ + (rng.next() - 0.5) * 2 * CLOUD_SPREAD;
    const elev = rng.range(CLOUD_ELEV[0], CLOUD_ELEV[1]) * Math.PI / 180;
    const y = CLOUD_REF_Y + rad * Math.tan(elev);
    // 半径 380~620 时原尺寸 4.8~6.4 投影只有十几像素，必须放大
    // ★ 红云隔离实验（probe-pb.mjs）：云确实画在画面上方 y 85~145 那条带里，
    //   但每朵只有 ~60px 宽 —— 半径 380~620 处 3.0~5.0 倍缩放只有 3° 视角，
    //   在 1280 宽画面上就是一小片粉红斑。放大到 7.5~12.0 才有真正的云朵体量。
    // ★ 尺寸最终值来自 probe-sz.mjs 的三档对照（S1 0.62x / S2 0.48x / S3 0.38x）：
    //   S1 云顶 ACES 后 219、S2 214、S3 210，只有 S1 在天空 155~165 上拉开足够对比，
    //   且单朵云在 1280 宽画面里约占 180~260px，是「棉花团」而不是「一小片粉红斑」。
    const s = rng.range(4.6, 7.4);
    m.scale.set(s * rng.range(1.05, 1.45), s * rng.range(0.58, 0.78), s * rng.range(1.0, 1.3));
    m.position.set(Math.cos(ang) * rad, y, Math.sin(ang) * rad);
    m.rotation.y = rng.range(0, Math.PI * 2);

    m.userData.orbit = {
      ang,
      rad,
      y: m.position.y,
      spin: rng.range(0.0015, 0.0042) * (rng.next() < 0.5 ? -1 : 1),
      rot: rng.range(-0.02, 0.02),
      phase: rng.range(0, Math.PI * 2),
    };

    items.push(m);
    group.add(m);
  }

  // 缓慢公转 + 上下浮动 + 自转。半径固定，所以云永远不会跑到农场正上方挡视线。
  group.userData.update = (t, dt) => {
    for (let i = 0; i < items.length; i++) {
      const m = items[i];
      const o = m.userData.orbit;
      o.ang += o.spin * dt;
      m.position.x = Math.cos(o.ang) * o.rad;
      m.position.z = Math.sin(o.ang) * o.rad;
      m.position.y = o.y + Math.sin(t * 0.22 + o.phase) * 1.5;
      m.rotation.y += o.rot * dt;
    }
  };

  // dayW: 0 = 深夜, 1 = 正午
  group.userData.setLight = (sunColor, skyMid, skyBottom, dayW) => {
    const u = mat.uniforms;
    const w = Math.max(0, Math.min(1, dayW));
    // ★ 云必须比它背后的天空更亮才读得出来。
    //   天穹地平线色在正午约为线性 0.42，云的底部如果也取 skyMid，两者只差 0.05，
    //   ACES 压平后肉眼几乎分不出。
    //   实测（probe-sz.mjs）：云顶 HDR 1.9 / 云底 HDR 1.28 时，ACES 后云顶 219、
    //   天空 155~165，拉开 50 级，才读得出「白棉花团」。
    // ★ 正午亮度整体压 50%（用户反馈"中午的云朵曝光了"）。
    //   原来云顶峰值 0.30+1.60 = 1.90 的 HDR，ACES 后接近纯白，
    //   再被 Bloom（阈值 0.90）一放大，整朵云糊成一团白光。
    //   现在峰值 0.30+0.80 = 1.10，云顶 ACES 后约 200，
    //   仍然明显亮于天空（155~165），但不会再"爆"。
    const topMul = 0.30 + 0.80 * w;
    const botMul = 0.55 + 0.42 * w;
    u.uTop.value.copy(sunColor).lerp(CLOUD_WHITE, 0.88).multiplyScalar(topMul);
    u.uBottom.value.copy(skyMid).lerp(CLOUD_WHITE, 0.62).multiplyScalar(botMul);
    u.uRim.value.copy(skyBottom).lerp(CLOUD_WHITE, 0.78);
    // 夜里云几乎化进天空，白天才清晰
    u.uOpacity.value = 0.72 + 0.26 * w;
  };

  group.userData.material = mat;
  return group;
}



// ---------------------------------------------------------------------------
// 几何合并（保留 position / normal / uv，不合并顶点色）
// ---------------------------------------------------------------------------
function mergeGeometries(list) {
  let vTotal = 0, iTotal = 0;
  for (const g of list) {
    vTotal += g.attributes.position.count;
    iTotal += g.index ? g.index.count : g.attributes.position.count;
  }
  const positions = new Float32Array(vTotal * 3);
  const normals = new Float32Array(vTotal * 3);
  const uvs = new Float32Array(vTotal * 2);
  const indices = new Uint32Array(iTotal);

  let vOff = 0, iOff = 0;
  for (const g of list) {
    const p = g.attributes.position;
    const n = g.attributes.normal;
    const uv = g.attributes.uv;
    positions.set(p.array.subarray(0, p.count * 3), vOff * 3);
    normals.set(n.array.subarray(0, n.count * 3), vOff * 3);
    if (uv) uvs.set(uv.array.subarray(0, uv.count * 2), vOff * 2);

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
  out.setAttribute('uv', new THREE.BufferAttribute(uvs, 2));
  out.setIndex(new THREE.BufferAttribute(indices, 1));
  out.computeBoundingSphere();
  return out;
}