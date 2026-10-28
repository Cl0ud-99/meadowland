import * as THREE from 'three';
import { WORLD, PALETTE } from '../config.js';
import { makeFbm, smoothstep, clamp, lerpN } from '../util/noise.js';
import { toonLambert } from '../render/toon.js';

// ---------------------------------------------------------------------------
// 地形高度场：中央一块平整的农场台地，四周是起伏的丘陵，最外圈抬高形成"碗"
// 所有需要"贴地"的模块都通过 terrain.heightAt(x, z) 采样，保证不悬空
// ---------------------------------------------------------------------------

const HALF = WORLD.size / 2;
const PLATEAU_R = 105;      // 台地半径
const PLATEAU_Y = 5.5;      // 台地高度
const RIM_START = 200;      // 从这开始向外抬升

// ---------------------------------------------------------------------------
// 水面高度：随季节升降
//
// 数值含义 = 水面比【池外 1.6R 处的平均地面高度】低多少。
// 数字越大 = 水面越低（露出更多池壁）。
//
//   春夏：0.15  —— 水位高，水面几乎齐岸
//   秋  ：0.55  —— 水位低（用户认可的现值）
//   冬  ：0.715 —— 比秋季再低 30%（用户要求"冬季水位再低 30%"）
//
// 之所以不能直接用 heightAt() 采样池内：池内已被挖坑，
// 水面越低 -> 坑越深 -> 水面更低，会形成循环依赖。
// ---------------------------------------------------------------------------
export const WATER_SINK_HIGH = 0.15;   // 春夏
export const WATER_SINK_LOW = 0.55;    // 秋
// 冬季：在秋季基础上再降 30%
export const WATER_SINK_WINTER = WATER_SINK_LOW * 1.3;   // 0.715

// 把季节 t（0=春 1=夏 2=秋 3=冬）映射成"水面下沉量"
// 夏->秋 渐变下降，冬->春 渐变上升，两端用 smoothstep 缓动
export function waterSinkFor(seasonT) {
  const c = Math.max(0, Math.min(3.999, seasonT));
  const hi = WATER_SINK_HIGH;
  const lo = WATER_SINK_LOW;
  const win = WATER_SINK_WINTER;
  if (c <= 1) return hi;                       // 春、夏：高水位
  if (c <= 2) {                                // 夏 -> 秋
    const k = (c - 1);
    return hi + (lo - hi) * (k * k * (3 - 2 * k));
  }
  if (c <= 3) {                                // 秋 -> 冬：继续下降到冬季水位
    const k = (c - 2);
    return lo + (win - lo) * (k * k * (3 - 2 * k));
  }
  const k = (c - 3);                           // 冬 -> 春
  return win + (hi - win) * (k * k * (3 - 2 * k));
}

export function createTerrainModel(seed = 20240521) {
  const fbm = makeFbm(seed, 5, 2.05, 0.5);
  const fbmDetail = makeFbm(seed + 91, 3, 2.4, 0.45);

  // 水池位置（与 layout.js 的 BUILDINGS.pond 保持一致）
  const POND = { x: -78, z: 2, r: 16 };

  // 记录"挖坑前"的地面高度（水面高度要用它，否则水面会沉到地下）
  let lastGroundY = 0;

  function raw(x, z) {
    const nx = x * 0.0042;
    const nz = z * 0.0042;
    // 大起伏
    let h = fbm(nx, nz) * WORLD.hillHeight;
    // 细节
    h += fbmDetail(x * 0.021, z * 0.021) * 2.1;

    const dist = Math.hypot(x, z);

    // 中央台地：把高度平滑拉到 PLATEAU_Y
    const flat = 1 - smoothstep(PLATEAU_R * 0.55, PLATEAU_R * 1.6, dist);
    h = lerpN(h, PLATEAU_Y, flat);

    // 外圈山脊
    const rim = smoothstep(RIM_START, HALF * 0.98, dist);
    h += rim * rim * 74;

    // 池塘周围局部做平：保留外围山峰，但池边必须是平地，
    // 否则地形噪声会顶穿水面，水线出现锯齿。
    const pd = Math.hypot(x - POND.x, z - POND.z);
    const pondFlat = 1 - smoothstep(POND.r * 1.0, POND.r * 2.2, pd);
    h = lerpN(h, PLATEAU_Y, pondFlat);

    // 先记下"挖坑前"的地面高度（水面高度要用它）
    lastGroundY = h;

    // ---------- 水池：挖一个正圆形的坑 ----------
    // 之前水面是平的圆盘，但地形在池边有起伏，
    // 水面边缘被地形"切"成了不规则形状（看起来不是正圆）。
    // 现在把地形本身挖成规则的圆形凹陷，水面就能完美贴合。
    // 挖坑范围必须比水面大一圈，且足够深，
    // 保证水面边缘（R*0.95 处）的地形始终低于水面，
    // 否则地形高的地方会把水面挡住，轮廓就成了不规则形状。
    //
    // 实测：R*0.95 处地形高度差 0.54（4.27~4.81），
    // 所以坑要挖到 R*1.15 以外，且在水面半径处保持足够深度。
    if (pd < POND.r) {
      // 大平底 + 陡岸：水面可以铺满坑，岸上马上回到平地
      const inner = POND.r * 0.84;
      let k = 1;
      if (pd > inner) k = 1 - smoothstep(inner, POND.r, pd);
      const bowl = k * k * (3 - 2 * k);
      h -= bowl * 2.8;
    }


    return h;
  }

  function heightAt(x, z) {
    return raw(x, z);
  }

  // 未挖坑的地面高度（水池、水面、岸边物体用这个）
  function groundAt(x, z) {
    raw(x, z);
    return lastGroundY;
  }

  // 坡度（用于决定哪里放树、哪里不能建）
  function slopeAt(x, z, d = 3) {
    const hL = raw(x - d, z), hR = raw(x + d, z);
    const hD = raw(x, z - d), hU = raw(x, z + d);
    return Math.hypot(hR - hL, hU - hD) / (2 * d);
  }

  return { heightAt, groundAt, slopeAt, raw };
}

// ---------------------------------------------------------------------------
// 地面草色：地形和池塘岸坡共用同一套算法
//
// 之前岸坡用的是写死的 PALETTE.grassA 单色，而地面是"A/B/C 三色按噪声混合
// + 泥地斑块 + 手绘噪点"，于是池边永远比周围草地偏深偏纯，换季时更明显。
// 抽成函数后两边逐顶点走同一套逻辑，颜色自然对齐。
// ---------------------------------------------------------------------------
function makeGroundColor() {
  const cGrassA = new THREE.Color(PALETTE.grassA);
  const cGrassB = new THREE.Color(PALETTE.grassB);
  const cGrassC = new THREE.Color(PALETTE.grassC);
  const cDirt = new THREE.Color(PALETTE.dirt);
  const cRock = new THREE.Color(PALETTE.rock);
  const tmp = new THREE.Color();
  const tmp2 = new THREE.Color();
  const fbmPatch = makeFbm(777, 3, 2.1, 0.5);
  const fbmMid = makeFbm(4242, 3, 2.2, 0.5);

  // 返回 { r, g, b }，坐标是世界坐标
  return function groundColorAt(x, z, y, slope = 0, concave = 0) {
    const patch = fbmPatch(x * 0.012, z * 0.012) * 0.5 + 0.5;
    tmp.copy(cGrassA).lerp(cGrassB, clamp(patch * 1.3 - 0.15, 0, 1));
    tmp.lerp(cGrassC, clamp((1 - patch) * 0.75, 0, 1) * 0.55);

    // 中频草色团块：约 0.06~0.1 的 fbm，制造 10~20 米尺度的草色起伏
    const mid = fbmMid(x * 0.085, z * 0.085);
    const midMul = 1 + mid * 0.08;
    tmp.r = clamp(tmp.r * midMul, 0, 1);
    tmp.g = clamp(tmp.g * midMul, 0, 1);
    tmp.b = clamp(tmp.b * midMul, 0, 1);

    // 坡度/低洼 baked 阴影：坡上略压暗，凹下去的草色更沉
    const shade = clamp(1 - slope * 0.075 - concave * 0.20, 0.68, 1);
    tmp.r = clamp(tmp.r * shade, 0, 1);
    tmp.g = clamp(tmp.g * shade, 0, 1);
    tmp.b = clamp(tmp.b * shade, 0, 1);

    // 草地整体明度下调 30%（泥斑/岩石在后面叠加，不受影响）
    const GRASS_BRIGHTNESS = 0.70;
    tmp.r = clamp(tmp.r * GRASS_BRIGHTNESS, 0, 1);
    tmp.g = clamp(tmp.g * GRASS_BRIGHTNESS, 0, 1);
    tmp.b = clamp(tmp.b * GRASS_BRIGHTNESS, 0, 1);

    const dirtMask = smoothstep(0.55, 0.78, fbmPatch(x * 0.03 + 40, z * 0.03 - 20) * 0.5 + 0.5);
    if (dirtMask > 0.01) {
      tmp2.copy(cDirt);
      tmp.lerp(tmp2, dirtMask * 0.5);
    }

    const high = smoothstep(26, 82, y);
    if (high > 0.01) tmp.lerp(cRock, high * 0.55);

    const grain = (fbmPatch(x * 0.4, z * 0.4) * 0.5 + 0.5 - 0.5) * 0.06;
    return {
      r: clamp(tmp.r + grain, 0, 1),
      g: clamp(tmp.g + grain, 0, 1),
      b: clamp(tmp.b + grain, 0, 1),
    };
  };
}

// ---------------------------------------------------------------------------
// 冬季积雪：地形和池塘岸坡共用的着色注入
//
// 为什么不能只靠 material.color 乘白：
//   顶点色里混着泥斑(0xc9a878)和暗部噪点，乘一个"提亮比"只会变成
//   "发黄的浅绿"，永远不是雪。必须真的往雪色插值。
//
// ★ 关键：地形和岸坡必须用【同一个 uSnow、同一个雪色】。
//   上一版只有岸坡叠了雪、地面没叠，于是池边比周围白一档 —— 用户看到的
//   "冬季地面和周围有区别"就是这个。
//
// SNOW_COLOR 取线性 0.62：ACES(exposure 1.08) 之后约 sRGB 218，
// 看得出是雪，又压在 Bloom 阈值（白天 0.90）以下，不会过曝成白斑。
// ---------------------------------------------------------------------------
const SNOW_COLOR = new THREE.Color(0.62, 0.64, 0.67);

function injectSnow(material, useGrassWeight) {
  const snowUniform = { value: 0 };
  material.userData.snowUniform = snowUniform;

  const prev = material.onBeforeCompile;
  material.onBeforeCompile = (shader, renderer) => {
    if (prev) prev(shader, renderer);
    shader.uniforms.uSnow = snowUniform;
    shader.uniforms.uSnowColor = { value: SNOW_COLOR };

    const decl = useGrassWeight
      ? 'uniform float uSnow;\nuniform vec3 uSnowColor;\n'
      : 'uniform float uSnow;\nuniform vec3 uSnowColor;\n';
    const weight = useGrassWeight ? 'vGrassW' : '1.0';

    shader.fragmentShader = decl + shader.fragmentShader.replace(
      '#include <color_fragment>',
      `#include <color_fragment>
      {
        // 积雪：只盖住"草地"部分，水下淤泥/湿土保持原色
        diffuseColor.rgb = mix(diffuseColor.rgb, uSnowColor, uSnow * ${weight});
      }`
    );
  };
  material.customProgramCacheKey = () => 'snow-' + (useGrassWeight ? 'grass' : 'all');
  return snowUniform;
}

// 地面细节纹理：用可平铺的周期噪声生成
//   map    —— 细碎草色明暗
//   normal —— 轻微起伏，让平面也能接住高光
// 顶点色负责中大尺度，纹理负责近景高频，两者叠加地面才有"质感"。
function makeGroundDetailTextures(size = 256) {
  const rand = (seed) => {
    let s = seed >>> 0;
    return () => { s = (s * 1664525 + 1013904223) >>> 0; return s / 4294967296; };
  };
  const makeGrid = (cells, seed) => {
    const r = rand(seed);
    const g = new Float32Array(cells * cells);
    for (let i = 0; i < g.length; i++) g[i] = r();
    return g;
  };
  const smooth = (t) => t * t * (3 - 2 * t);
  const sample = (g, cells, x, y) => {
    const fx = x * cells, fy = y * cells;
    const x0 = Math.floor(fx) % cells, y0 = Math.floor(fy) % cells;
    const x1 = (x0 + 1) % cells, y1 = (y0 + 1) % cells;
    const tx = smooth(fx - Math.floor(fx)), ty = smooth(fy - Math.floor(fy));
    const a = g[y0 * cells + x0], b = g[y0 * cells + x1];
    const c = g[y1 * cells + x0], d = g[y1 * cells + x1];
    return (a + (b - a) * tx) + ((c + (d - c) * tx) - (a + (b - a) * tx)) * ty;
  };

  const octaves = [4, 8, 16, 32, 64];
  const grids = octaves.map((cells, i) => makeGrid(cells, 9187 + i * 131));
  const h = new Float32Array(size * size);
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const px = x / size, py = y / size;
      let v = 0, amp = 0.58, total = 0;
      for (let i = 0; i < octaves.length; i++) {
        v += sample(grids[i], octaves[i], px, py) * amp;
        total += amp;
        amp *= 0.55;
      }
      v /= total;
      h[y * size + x] = Math.max(0, Math.min(1, v));
    }
  }

  const mapData = new Uint8Array(size * size * 4);
  const nrmData = new Uint8Array(size * size * 4);
  const at = (x, y) => h[((y + size) % size) * size + ((x + size) % size)];
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const i = (y * size + x) * 4;
      const v = h[y * size + x];
      const c = Math.round((0.80 + v * 0.20) * 255);
      mapData[i] = c; mapData[i + 1] = c; mapData[i + 2] = c; mapData[i + 3] = 255;

      const dx = (at(x + 1, y) - at(x - 1, y)) * 2.2;
      const dy = (at(x, y + 1) - at(x, y - 1)) * 2.2;
      let nx = -dx, ny = -dy, nz = 1;
      const len = Math.hypot(nx, ny, nz);
      nx /= len; ny /= len; nz /= len;
      nrmData[i] = Math.round((nx * 0.5 + 0.5) * 255);
      nrmData[i + 1] = Math.round((ny * 0.5 + 0.5) * 255);
      nrmData[i + 2] = Math.round((nz * 0.5 + 0.5) * 255);
      nrmData[i + 3] = 255;
    }
  }

  const map = new THREE.DataTexture(mapData, size, size, THREE.RGBAFormat);
  map.wrapS = map.wrapT = THREE.RepeatWrapping;
  map.repeat.set(220, 220);
  map.colorSpace = THREE.SRGBColorSpace;
  map.anisotropy = 8;
  map.generateMipmaps = true;
  map.minFilter = THREE.LinearMipmapLinearFilter;
  map.needsUpdate = true;

  const normalMap = new THREE.DataTexture(nrmData, size, size, THREE.RGBAFormat);
  normalMap.wrapS = normalMap.wrapT = THREE.RepeatWrapping;
  normalMap.repeat.set(220, 220);
  normalMap.colorSpace = THREE.NoColorSpace;
  normalMap.anisotropy = 8;
  normalMap.generateMipmaps = true;
  normalMap.minFilter = THREE.LinearMipmapLinearFilter;
  normalMap.needsUpdate = true;
  return { map, normalMap };
}

// 世界空间程序化草地细节：不使用 UV 平铺，避免出现规律网格。
// 用两三组不同尺度的 value noise 叠加，近处增加颗粒，远处淡出。
function injectGroundDetail(material) {
  const prev = material.onBeforeCompile;
  material.onBeforeCompile = (shader, renderer) => {
    if (prev) prev(shader, renderer);
    shader.vertexShader = 'varying vec3 vGroundWorld;\n' + shader.vertexShader.replace(
      '#include <begin_vertex>',
      '#include <begin_vertex>\nvGroundWorld = (modelMatrix * vec4(transformed, 1.0)).xyz;'
    );
    const helper = `varying vec3 vGroundWorld;
      float groundHash(vec2 p) {
        p = fract(p * 0.1031);
        p += dot(p, p.yx + 33.33);
        return fract((p.x + p.y) * p.x * 17.17);
      }
      float groundNoise(vec2 p) {
        vec2 i = floor(p), f = fract(p);
        f = f * f * (3.0 - 2.0 * f);
        return mix(mix(groundHash(i), groundHash(i + vec2(1.0, 0.0)), f.x),
                   mix(groundHash(i + vec2(0.0, 1.0)), groundHash(i + vec2(1.0, 1.0)), f.x), f.y);
      }
      float groundFbm(vec2 p) {
        float v = 0.0, a = 0.55;
        for (int i = 0; i < 3; i++) { v += groundNoise(p) * a; p *= 2.07; a *= 0.5; }
        return v;
      }
    `;
    shader.fragmentShader = helper + shader.fragmentShader.replace(
      '#include <color_fragment>',
      `#include <color_fragment>
      {
        float n = groundFbm(vGroundWorld.xz * 0.26) * 0.62 + groundNoise(vGroundWorld.xz * 1.65) * 0.38;
        float detail = 1.0 - smoothstep(35.0, 180.0, length(vViewPosition));
        diffuseColor.rgb *= mix(1.0, 0.84 + n * 0.16, detail);
      }`
    );
  };
}

export function buildTerrain(model, segments = WORLD.segments) {
  const geo = new THREE.PlaneGeometry(WORLD.size, WORLD.size, segments, segments);
  geo.rotateX(-Math.PI / 2);

  const pos = geo.attributes.position;
  const colors = new Float32Array(pos.count * 3);

  const groundColorAt = makeGroundColor();

  for (let i = 0; i < pos.count; i++) {
    const x = pos.getX(i);
    const z = pos.getZ(i);
    const y = model.heightAt(x, z);
    pos.setY(i, y);

    // 颜色：三层草地 + 土壤斑块 + 中频团块 + 坡度/低洼阴影
    // 用四邻域采样估局部坡度与凹陷程度，烘进顶点色里。
    const d = 3.2;
    const hL = model.heightAt(x - d, z);
    const hR = model.heightAt(x + d, z);
    const hD = model.heightAt(x, z - d);
    const hU = model.heightAt(x, z + d);
    const slope = Math.hypot(hR - hL, hU - hD) / (2 * d);
    const concave = clamp(((hL + hR + hD + hU) / 4 - y) / 2.5, 0, 1);
    const c = groundColorAt(x, z, y, slope, concave);
    colors[i * 3] = c.r;
    colors[i * 3 + 1] = c.g;
    colors[i * 3 + 2] = c.b;
  }

  geo.setAttribute('color', new THREE.BufferAttribute(colors, 3));
  geo.computeVertexNormals();

  // shared:false —— main.js 每季改 app.terrain.material.color，必须独占
  const mat = toonLambert({ vertexColors: true, shared: false });
  // 顶点色负责大尺度，世界空间程序化噪声负责近景细节（无 UV 网格）
  injectGroundDetail(mat);
  mat.needsUpdate = true;
  // 暴露给季节切换（地形是草地的主体，必须一起染色）
  mat.userData.isTerrain = true;

  // 冬季积雪：和池塘岸坡用同一个 uniform 值
  const snowUniform = injectSnow(mat, false);
  mat.userData.snowUniform = snowUniform;

  const mesh = new THREE.Mesh(geo, mat);
  mesh.receiveShadow = true;
  mesh.name = 'terrain';
  mesh.userData.snowUniform = snowUniform;
  return mesh;
}

// 池塘浅岸：水线到草地之间的一圈泥坡。
// 地面是平的，所以外圈可以贴着地形同高、同色，不会出现独立网格的缝。
export function buildPondShore(model, center, radius, waterY) {
  const segs = 96;
  const rings = 6;
  const innerR = radius * 0.945;
  const outerR = radius * 1.06;
  const pos = [], col = [], idx = [];
  const groundColorAt = makeGroundColor();
  const cMud = { r: 0.30, g: 0.24, b: 0.15 };
  const cTmp = new THREE.Color();

  for (let j = 0; j <= rings; j++) {
    const t = j / rings;
    const rr = innerR + (outerR - innerR) * t;
    const y = (waterY - 0.04) + (PLATEAU_Y + 0.012 - (waterY - 0.04)) * (t * t * (3 - 2 * t));
    for (let i = 0; i < segs; i++) {
      const a = (i / segs) * Math.PI * 2;
      const wx = center.x + Math.cos(a) * rr;
      const wz = center.z + Math.sin(a) * rr;
      pos.push(Math.cos(a) * rr, y, Math.sin(a) * rr);
      const g = groundColorAt(wx, wz, PLATEAU_Y);
      const k = smoothstep(0.18, 0.72, t);
      cTmp.setRGB(
        cMud.r + (g.r - cMud.r) * k,
        cMud.g + (g.g - cMud.g) * k,
        cMud.b + (g.b - cMud.b) * k,
        THREE.LinearSRGBColorSpace
      );
      col.push(cTmp.r, cTmp.g, cTmp.b);
    }
  }
  for (let j = 0; j < rings; j++) {
    for (let i = 0; i < segs; i++) {
      const a = j * segs + i;
      const b = j * segs + (i + 1) % segs;
      const c = (j + 1) * segs + i;
      const d = (j + 1) * segs + (i + 1) % segs;
      idx.push(a, b, c, b, d, c);
    }
  }
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  geo.setAttribute('color', new THREE.Float32BufferAttribute(col, 3));
  geo.setIndex(idx);
  geo.computeVertexNormals();
  const mat = toonLambert({ vertexColors: true, shared: false });
  const mesh = new THREE.Mesh(geo, mat);
  mesh.name = 'pondShore';
  mesh.position.set(center.x, 0, center.z);
  mesh.receiveShadow = true;
  return mesh;
}

// 池塘：台地边上挖一块水面（不做真实挖坑，用略低于地表的平面 + 岸边围一圈石头）
export function buildPond(model, center, radius) {
  const group = new THREE.Group();
  group.name = 'pond';

  const segs = 64;
  const RIM_SEGS = 96;

  // ---------- 池外地面平均高度 ----------
  //
  // ★ 采样半径必须落在"地形挖坑之外、且紧邻坑边"的位置。
  //   地形挖坑范围是 1.5R，所以：
  //     - 在 1.6R 采样 → 量到原始台地（5.83），比坑边实际地面高 0.33
  //     - 岸坡外缘如果按这个高度建，就会在坑边形成一圈【凸起的台地】
  //       （实测岸坡外缘 5.56 vs 周围地形 5.5，高 0.06；
  //        岸顶更是高到 5.93，比地形高 0.43）
  //
  // ★ 采样的模型必须是【最终地形】，不是原始高度场。
  //   实测：model.heightAt(1.55R) = 5.82，但 terrainModel.heightAt(1.55R) = 5.50
  //   —— 因为地形后来被"农场台地"压平过一次，原始高度场已经不代表最终画面。
  //   用原始高度场当基准，岸坡就会比实际地面高 0.32，形成一圈凸台。
  //
  //   这里优先用 finalModel（如果提供了），否则退回 model。
  let outsideSum = 0;
  let outsideN = 0;
  let outsideMin = Infinity;
  let outsideMax = -Infinity;
  for (let i = 0; i < 24; i++) {
    const a = (i / 24) * Math.PI * 2;
    const ex = center.x + Math.cos(a) * radius * 1.55;
    const ez = center.z + Math.sin(a) * radius * 1.55;
    const h = model.heightAt(ex, ez);
    outsideSum += h;
    outsideN++;
    if (h < outsideMin) outsideMin = h;
    if (h > outsideMax) outsideMax = h;
  }
  const outsideAvg = outsideSum / outsideN;
  // shoreY 取最低值：见下方说明（水面是平面，岸顶必须低于所有地形）

  // ---------- 碗的几何参数 ----------
  // 之前的实现只有一段 0.5R~1.35R 的环，而且三角形绕序是反的 ——
  // 法线全部朝下（实测 normal.y 均值 -0.998），FrontSide 下从上方看会被
  // 背面剔除，等于整块池壁根本不可见。于是水面圆盘就"悬空"在一口看不见的
  // 坑上，这正是「水位高的时候浮空了，水和地面没有接触」的原因。
  //
  // 现在重建成一个真正的碗（岸坡），三段：
  //   r ≤ FLAT_R         池底（平）
  //   FLAT_R ~ BANK_TOP  岸坡（2.2 米落差集中在约 3 米水平距离内，够陡）
  //   BANK_TOP ~ OUTER   贴合真实地形，把地形挖坑留下的锯齿边盖住
  // 水面圆盘的半径由"岸坡高度 = 最高水位"数值反解得到，
  // 于是任何季节水面边缘都恰好压在岸坡上，永远不会悬空。
  const FLAT_R = radius * 0.82;      // 池底平段外缘
  const BANK_TOP = radius * 1.02;    // 岸顶
  // ★ 外缘扩到 1.62R：比地形挖坑边界（1.5R）再多出一截，
  //   这样"下沉的裙边"能完全埋进未受挖坑影响的地形里，
  //   边界落在挖坑范围之外，不会有锯齿。
  const RIM_OUTER = radius * 1.62;
  // ★ 岸顶高度 = 池外地面中【最低】的那一侧。
  //
  //   水面是平面圆盘，岸顶必须是一个固定的高度。
  //   如果取平均值，地形低的那一侧岸坡会低于水面 → 水面悬空露黑缝；
  //   取最高值则低处凸起一圈土台。
  //   取最低值：四周岸坡都不低于水面，高差全部由外圈"填高"消化。
  const shoreY = outsideMin;
  const bottomY = shoreY - 2.2;      // 池底（以岸顶为基准，深度固定 2.2）
  // ★ 水位必须【从岸顶推导】，不能从 outsideAvg 推导。
  //   之前 waterHighY = outsideAvg - 0.15 = 5.667，
  //   而岸顶 shoreY = outsideMin = 5.500 ——
  //   水面比岸顶高 0.17，水直接漫过岸坡、悬在草地上面（截图里的黑缝）。
  //
  //   现在：水面 = 岸顶 - WATER_SINK_x，永远在岸顶之下。
  const waterHighY = shoreY - WATER_SINK_HIGH;
  const baseY = shoreY - WATER_SINK_LOW;   // 低水位基准（水面初始位置）

  // 岸坡高度：u ∈ [0,1] 从池底升到岸顶
  const bankY = (u) => bottomY + (shoreY - bottomY) * (u * u * (3 - 2 * u));

  // 反解水面半径：bankY(u) = 水面高度
  //
  // ★ 这里必须用【水面实际所在的高度】，不能用最高水位。
  //   实测：最高水位 5.681 反解出 waterR=15.649，
  //   但该半径处岸坡实际高度只有 5.66 —— 水面比岸坡高 0.02，
  //   水面圆盘边缘悬在岸坡上方，水线处露出一条深色缝。
  //
  //   改用 surfaceY（下面算出的实际水面高度）反解，
  //   水面边缘就精确落在岸坡表面上，严丝合缝。
  let waterR = BANK_TOP;
  const solveWaterR = (targetY) => {
    let r = BANK_TOP;
    for (let i = 0; i <= 800; i++) {
      const u = i / 800;
      if (bankY(u) >= targetY) { r = FLAT_R + (BANK_TOP - FLAT_R) * u; break; }
    }
    return r;
  };
  // ★ 统一流程：先定水面高度，再用该高度反解半径。
  //
  //   水面初始高度 = baseY（低水位），但为了视觉上"水贴着岸"，
  //   取 baseY 与岸顶之间的一个安全高度。
  //   这里直接用 waterHighY（春夏满水位），因为初始季节是春。
  const surfaceY = waterHighY;

  // 半径随高度反解 —— 保证水面边缘恰好压在该高度的岸坡上。
  //
  // ★ 再【向内收 0.35】：岸坡是折线网格（每环 0.13），
  //   理论交点必然落在两环之间，如果半径正好取理论值，
  //   交点那一环会横跨"水面之上/之下"，从低角度看就是一条缝。
  //   把水面半径收进去一点，让水面边缘明确地【在岸坡内部】，
  //   缝隙就被岸坡实体盖住了。
  waterR = Math.max(FLAT_R + 0.2, solveWaterR(surfaceY) - 0.35);

  // 该半径处岸坡的实际高度（和 surfaceY 应当几乎相等）
  const uAtWater = (waterR - FLAT_R) / (BANK_TOP - FLAT_R);
  const bankYAtWater = bankY(Math.max(0, Math.min(1, uAtWater)));

  // ---------- 水面：正圆，半径与岸坡交点一致 ----------
  const waterGeo = new THREE.CircleGeometry(waterR, segs);
  waterGeo.rotateX(-Math.PI / 2);

  // 水面高度基准见下方 water.position —— 这里只加极轻微起伏
  const p = waterGeo.attributes.position;
  for (let i = 0; i < p.count; i++) {
    const d = Math.hypot(p.getX(i), p.getZ(i)) / waterR;
    p.setY(i, 0.015 * Math.sin(d * 5) * (1 - d * 0.5));
  }
  waterGeo.computeVertexNormals();

  // ---------- 岸坡网格 ----------
  // 环半径分段：池底疏、岸坡密、外侧疏
  // 环半径分段：池底疏、岸坡密、外侧疏。
  // ★ 岸坡段从 12 环加到 24 环：水面与岸坡的交点必须落在网格环附近，
  //   否则交点所在的那一环会横跨"水上/水下"，从俯瞰图看就是
  //   水面里凸起一条边缘锐利的土带。加密后每段只有 0.13，
  //   交点误差被压到 0.07 以内，肉眼看不出台阶。
  const ringR = [];
  for (let i = 0; i <= 6; i++) ringR.push(FLAT_R * (i / 6));
  for (let i = 1; i <= 24; i++) ringR.push(FLAT_R + (BANK_TOP - FLAT_R) * (i / 24));
  for (let i = 1; i <= 10; i++) ringR.push(BANK_TOP + (RIM_OUTER - BANK_TOP) * (i / 10));

  const rimPositions = [];
  const rimColors = [];
  const rimGrassW = [];      // 每个顶点的"草权重"：0 = 水下淤泥，1 = 岸上草地
  const rimWaterT = [];      // 相对水线的归一化半径（shader 里按当前水位重算）
  const rimIndices = [];

  const cWet = new THREE.Color(0x3f3a30);   // 水下淤泥
  const cMud = new THREE.Color(0x6b5a42);   // 湿土岸
  const cDry = new THREE.Color(0x8a7355);   // 干土（水位退下去后露出的那圈）
  const cTmp = new THREE.Color();
  const cTmp2 = new THREE.Color();
  // 岸上部分直接用地面那套配色（三层草 + 泥斑 + 噪点），
  // 这样池边和周围草地永远是同一个颜色，换季也一起变。
  const groundColorAt = makeGroundColor();

  for (let ri = 0; ri < ringR.length; ri++) {
    const rr = ringR[ri];
    for (let si = 0; si < RIM_SEGS; si++) {
      const a = (si / RIM_SEGS) * Math.PI * 2;
      const wx = center.x + Math.cos(a) * rr;
      const wz = center.z + Math.sin(a) * rr;

      let y;
      if (rr <= BANK_TOP) {
        // ★ 岸顶必须【统一高度】= shoreY，不能跟随各处地形！
        //
        //   水面是一个【平面圆盘】，如果岸顶高度随方位变化，
        //   低的那一侧岸坡会沉到水面以下 —— 水面就在那里悬空，
        //   下方露出一圈黑色空隙（这就是上一版改坏的原因）。
        //
        //   岸顶统一后，水面边缘四周都能压在岸坡上；
        //   岸坡外侧再平滑过渡到各处地形，高差就消化在外圈里。
        const u = Math.min(1, Math.max(0, (rr - FLAT_R) / (BANK_TOP - FLAT_R)));
        y = bankY(u);
      } else {
        // 外侧：从岸顶平滑过渡到真实地形。
        //
        // ★ 关键改动：最外环要【沉进地形里】，不能和地形共面。
        //
        //   实测岸坡外缘顶点和地形高度完全一致（maxGap = 0），
        //   但两套网格的三角剖分不同（岸坡 96 段圆周、地形是方形格），
        //   边界上的三角形互相错开，从低角度看就是一条锯齿裂缝。
        //
        //   解决办法：让岸坡外缘整体下压 0.45，形成一圈"裙边"埋进地下。
        //   地形是实心的，裙边被地形盖住，边界隐形；
        //   而岸坡主体（水线以上）仍然露在地面之上。
        const u = Math.min(1, Math.max(0, (rr - BANK_TOP) / (RIM_OUTER - BANK_TOP)));
        const g = model.heightAt(wx, wz);
        const k = u * u * (3 - 2 * u);
        // 外缘下沉量：越靠外沉得越多（最外环 -0.45）
        const sink = -0.45 * u * u;
        y = shoreY + (g - shoreY) * k + sink;
      }
      rimPositions.push(Math.cos(a) * rr, y, Math.sin(a) * rr);

      // 顶点色：水下淤泥 → 湿土 → 地面草色
      //
      // ★ 草色必须取 groundColorAt(wx, wz) 而不是 PALETTE.grassA：
      //   地面是三层草按噪声混合 + 泥斑 + 噪点，用单色永远对不上，
      //   换季时池边会明显比周围深一档。
      // ★ 取色必须用【原始地形高度】，不能用压低下沉后的 y。
      //   裙边被压到地下 0.45，如果用这个低 y 取色，
      //   groundColorAt 会按"低洼处"配上深色泥土，
      //   整圈裙边就变成一条黑带（虽然被地形盖住，但在边缘处会露出来）。
      //   用原始地形高度取色，裙边的颜色和周围草地完全一致。
      const colorRefY = rr > BANK_TOP ? model.heightAt(wx, wz) : y;
      const gcol = groundColorAt(wx, wz, colorRefY);
      cTmp2.setRGB(gcol.r, gcol.g, gcol.b, THREE.LinearSRGBColorSpace);

      // 顶点色：水下淤泥 → 湿土 → 地面草色
      //
      // ★ 判断"水下/岸上"用【半径】，不是高度。
      //
      //   两个方案都试过，结论：
      //   · 用半径（rr vs waterR）：正确 —— 池子是个圆，水面半径固定，
      //     半径以内就是水下。但岸坡是斜面，交点在网格环之间，
      //     会有 0.1 的误差（已用加密环段解决）。
      //   · 用高度（y vs waterHighY）：错误 —— 岸坡外侧（r=18~23）
      //     的高度本来就低于池外地面（碗的外沿是下凹的），
      //     按高度判会把整圈外围草地都涂成深淤泥色，
      //     从上方看就是水池外面套了一大圈黑边。
      //
      //   最终：用半径分段，水线附近用 smoothstep 过渡。
      //      rr < waterR - 0.6        水下淤泥
      //      waterR ± 0.6             淤泥 → 干土
      //      waterR + 0.6 ~ +1.8      干土 → 地面草色
      //      > waterR + 1.8           纯地面色
      const dR = rr - waterR;
      if (dR < -0.6) {
        cTmp.copy(cWet);
      } else if (dR < 0.6) {
        const k0 = (dR + 0.6) / 1.2;
        const k = k0 * k0 * (3 - 2 * k0);
        cTmp.copy(cWet).lerp(cDry, k);
      } else if (dR < 1.8) {
        const k0 = (dR - 0.6) / 1.2;
        const k = k0 * k0 * (3 - 2 * k0);
        cTmp.copy(cDry).lerp(cTmp2, k);
      } else {
        cTmp.copy(cTmp2);
      }
      // 顶点色入列（★ 之前编辑时漏掉了这一行，
      //   导致 color 属性 count=0、整块岸坡变成纯白，必须保留）
      rimColors.push(cTmp.r, cTmp.g, cTmp.b);

      // 记录"相对水线的归一化半径"，供 shader 按当前水位重新划分泥/草。
      // 水位随季节变化（冬季更低 30%），水面半径会同步收小，
      // shader 用这个值把湿土带一起往里收。
      rimWaterT.push(dR);

      // 草权重：和水下淤泥解耦。
      // 季节染色只作用在"草"上，淤泥/湿土保持原色 —— 否则冬季把整块
      // 岸坡乘成雪白时，水下那圈深色泥也会被染成脏粉。
      // 和顶点色用同一条半径曲线，保证"变草绿"和"可染色"同步。
      let gw;
      if (dR < 0.6) {
        gw = 0;
      } else if (dR >= 1.8) {
        gw = 1;
      } else {
        const k = (dR - 0.6) / 1.2;
        gw = k * k * (3 - 2 * k);
      }
      rimGrassW.push(gw);
    }
  }

  const ringN = ringR.length;
  for (let ri = 0; ri < ringN - 1; ri++) {
    for (let si = 0; si < RIM_SEGS; si++) {
      const s2 = (si + 1) % RIM_SEGS;
      const a0 = ri * RIM_SEGS + si;
      const a1 = ri * RIM_SEGS + s2;
      const b0 = (ri + 1) * RIM_SEGS + si;
      const b1 = (ri + 1) * RIM_SEGS + s2;
      // ★ 绕序必须让法线朝上：a0 -> b1 -> b0 / a0 -> a1 -> b1
      rimIndices.push(a0, b1, b0, a0, a1, b1);
    }
  }

  const rimGeo = new THREE.BufferGeometry();
  rimGeo.setAttribute('position', new THREE.Float32BufferAttribute(rimPositions, 3));
  rimGeo.setAttribute('color', new THREE.Float32BufferAttribute(rimColors, 3));
  rimGeo.setAttribute('aGrassW', new THREE.Float32BufferAttribute(rimGrassW, 1));
  rimGeo.setAttribute('aWaterT', new THREE.Float32BufferAttribute(rimWaterT, 1));
  rimGeo.setIndex(rimIndices);
  rimGeo.computeVertexNormals();

  // shared:false —— 岸坡要跟着季节染色（冬季必须被雪盖住），必须独占
  const rimMat = toonLambert({
    vertexColors: true, flatShading: false, side: THREE.DoubleSide, shared: false,
  });

  // ---------- 岸坡的季节染色：只染"草"，不染淤泥 ----------
  // 顶点色里混着水下淤泥(深褐) → 湿土 → 草(绿)，直接改 material.color
  // 会把淤泥也一起乘掉。这里按 aGrassW 权重，只给"草"乘季节 tint。
  //
  // ★ 不再有单独的"雪色"：冬季变白完全由 tint 提供，
  //   和地形 mesh 走的是同一个乘数 —— 两边颜色严格相等，
  //   不会再出现"池边比周围白一档"。
  rimMat.userData.seasonShader = { uSeasonGrass: null };
  const bankSnow = { value: 0 };

  rimMat.onBeforeCompile = (shader) => {
    // 默认白色 = 不改变顶点色（这是乘数，不是颜色）
    shader.uniforms.uSeasonGrass = { value: new THREE.Color(0xffffff) };
    shader.uniforms.uSnow = bankSnow;
    shader.uniforms.uSnowColor = { value: SNOW_COLOR };
    rimMat.userData.seasonShader.uSeasonGrass = shader.uniforms.uSeasonGrass;

    shader.uniforms.uWaterShift = { value: 0 };   // 水位下降量（世界单位）
    rimMat.userData.seasonShader.uWaterShift = shader.uniforms.uWaterShift;

    shader.vertexShader =
      'attribute float aGrassW;\nattribute float aWaterT;\n' +
      'varying float vGrassW;\nvarying float vWaterT;\n' +
      shader.vertexShader.replace(
        '#include <begin_vertex>',
        '#include <begin_vertex>\n  vGrassW = aGrassW;\n  vWaterT = aWaterT;'
      );

    // ★ 顺序很重要：先乘季节 tint，再盖雪。
    //   之前是两个独立的 onBeforeCompile 串联（染色 + 积雪），
    //   积雪块在前、染色块在后，染色用 mix 把雪又抹回去了 ——
    //   结果冬季池边依然是绿的。合并成一段后顺序确定。
    shader.fragmentShader =
      'uniform vec3 uSeasonGrass;\nuniform float uSnow;\nuniform vec3 uSnowColor;\n' +
      'uniform float uWaterShift;\nvarying float vGrassW;\nvarying float vWaterT;\n' +
      shader.fragmentShader.replace(
        '#include <color_fragment>',
        `#include <color_fragment>
        {
          // vWaterT = 顶点半径 - 基准水面半径（正 = 在水面之外）。
          // uWaterShift = 水位下降导致的水面半径收缩量。
          // 水位降了水面变小，湿土带跟着往里收 —— 所以加上 shift。
          float wt = vWaterT + uWaterShift;
          float gw = clamp(vGrassW + smoothstep(0.6, 1.8, wt) * (1.0 - vGrassW), 0.0, 1.0);

          // 1) 草的部分乘季节 tint（和地形 mesh 的 material.color 同一个值）
          vec3 grass = vColor.rgb * uSeasonGrass;
          diffuseColor.rgb = mix(diffuseColor.rgb, grass, gw);
          // 2) 再盖雪（只盖草，水下淤泥/湿土不受影响）
          diffuseColor.rgb = mix(diffuseColor.rgb, uSnowColor, uSnow * gw);
        }`
      );
  };
  rimMat.customProgramCacheKey = () => 'pond-bank-season-snow';

  const rim = new THREE.Mesh(rimGeo, rimMat);
  rim.name = 'pondBank';
  rim.position.set(center.x, 0, center.z);
  rim.receiveShadow = true;
  group.add(rim);

  // ---------- 水面材质：带波动的自定义 shader ----------
  // 原来用 MeshLambertMaterial，是纯静态的"塑料板"。
  // 现在用 ShaderMaterial：
  //   - 顶点按 sin 波动（轻微上下起伏）
  //   - 片元用 dFdx/dFdy 算假法线，产生波光
  //   - 加 Fresnel 边缘反光，夜晚反射路灯
  const waterMat = new THREE.ShaderMaterial({
    uniforms: {
      uTime: { value: 0 },
      uColor: { value: new THREE.Color(PALETTE.water) },
      uOpacity: { value: 0.62 },
      uNight: { value: 0 },
      // ★ 必须是水面实际半径 waterR，不是池子的 radius。
      //   顶点着色器用 d = length(p.xz)/uRadius 判断"离岸多远"，
      //   写 radius 的话 d 最大只有 waterR/radius ≈ 0.94，边缘衰减永远
      //   走不到 0，水面外圈会一直有波动顶到岸上。
      uRadius: { value: waterR },
      // 顶点波动幅度：春夏水面高、波动大；秋冬水面低、波动小
      uWaveAmp: { value: 0.055 },
      // 波纹贴图强度（0 = 完全平静，1 = 明显波纹）
      uRipple: { value: 0.55 },
    },
    vertexShader: /* glsl */`
      uniform float uTime;
      uniform float uRadius;
      uniform float uWaveAmp;
      varying vec3 vWorldPos;
      varying vec2 vUv;
      varying float vWave;

      void main() {
        vUv = uv;
        vec3 p = position;

        // 距中心的归一化距离（边缘不动，避免穿出岸边）
        float d = length(p.xz) / uRadius;
        float edge = 1.0 - smoothstep(0.75, 1.0, d);

        // 两层交叉波
        float w1 = sin(p.x * 0.55 + uTime * 1.4) * 0.5;
        float w2 = cos(p.z * 0.48 - uTime * 1.1) * 0.5;
        float w3 = sin((p.x + p.z) * 0.35 + uTime * 1.8) * 0.35;
        float wave = (w1 + w2 + w3) * uWaveAmp * edge;

        p.y += wave;
        vWave = wave;

        vec4 wp = modelMatrix * vec4(p, 1.0);
        vWorldPos = wp.xyz;
        gl_Position = projectionMatrix * viewMatrix * wp;
      }
    `,
    fragmentShader: /* glsl */`
      uniform float uTime;
      uniform vec3 uColor;
      uniform float uOpacity;
      uniform float uNight;
      uniform float uRipple;
      varying vec3 vWorldPos;
      varying vec2 vUv;
      varying float vWave;

      // -------------------------------------------------------------------
      // 程序化"波纹贴图"
      //
      // 不引入外部图片：用三层不同频率的解析波叠出可辨认的水面纹路。
      //   - 环状波：从池心向外扩散（像投石入水的同心圆）
      //   - 斜向波：45° 方向的两组正弦，制造流动感
      //   - 细碎波：高频抖动，负责"波光粼粼"的高光点
      //
      // 返回 [-1, 1]，作为法线扰动与高光强度使用。
      // -------------------------------------------------------------------
      float rippleField(vec2 q, float t) {
        float d = length(q);

        // 同心圆：随时间向外推进
        float rings = sin(d * 26.0 - t * 2.1);

        // 两组斜向波，方向不同、速度不同
        float diagA = sin((q.x * 1.0 + q.y * 0.75) * 14.0 + t * 1.6);
        float diagB = sin((q.x * 0.7 - q.y * 1.0) * 18.0 - t * 1.2);

        // 细碎高频
        float fine = sin((q.x * 2.4 + q.y * 1.9) * 31.0 + t * 3.4);

        return rings * 0.46 + diagA * 0.30 + diagB * 0.24 + fine * 0.14;
      }

      void main() {
        // 注意：不要用 dFdx/dFdy 算法线。
        // 水面几乎是平的，叉积结果接近零向量，
        // normalize 后方向不稳定，Fresnel 会失控变成全白。
        //
        // 改用固定的向上法线 + 波动值模拟扰动。

        // 以池心为原点的归一化坐标（-1..1）
        vec2 q = (vUv - 0.5) * 2.0;
        float rp = rippleField(q, uTime) * uRipple;

        // 波纹法线扰动：让 Fresnel 随波纹起伏，水面才有"流动"的层次
        vec3 n = normalize(vec3(vWave * 3.0 + rp * 0.55, 1.0, vWave * 2.0 + rp * 0.42));
        vec3 viewDir = normalize(cameraPosition - vWorldPos);

        // Fresnel：掠射角反光强（水面很平时这个值在 0.02~0.3 之间）
        float ndv = clamp(dot(n, viewDir), 0.0, 1.0);
        float fres = pow(1.0 - ndv, 3.0);

        // 波光：用波动值轻微提亮（幅度要小，否则水会发白）
        float shimmer = vWave * 2.0;

        // ★ 水色要正确转换：
        //   uColor 是 sRGB 值（0x6fb6d8），但 ShaderMaterial 的输出
        //   会被当成线性值做 tone mapping，直接输出会偏亮（显示 0.856）。
        //   必须先转成线性空间，再乘 0.72 才能达到原来的观感（0.50）。
        vec3 srgb = uColor;
        vec3 lin = pow(srgb, vec3(2.2));      // 近似 sRGB -> Linear
        vec3 base = lin * 0.72;
        vec3 col = base + vec3(0.04, 0.06, 0.07) * shimmer;

        // ---------- 波纹的明暗层次 ----------
        // 波峰提亮（天光反射），波谷压暗（看到水底）
        col += vec3(0.055, 0.070, 0.082) * max(rp, 0.0);
        col -= vec3(0.030, 0.026, 0.018) * max(-rp, 0.0);

        // ★ 高光全部去掉（用户要求"高光也要消除"）。
        //   原来这里有两处加亮：波峰高光点（+0.16~0.21）和 Fresnel 边缘反光
        //   （mix 0.22）。正午时它们叠在一起就是水面上那团过曝白斑，
        //   再被 Bloom（阈值 0.90）放大成一整片白。
        //   低多边形风格里水面就是一块干净的颜色，不需要镜面反射。
        float fresR = clamp(fres + rp * 0.10, 0.0, 1.0);

        // 透明度：基础 0.62，边缘稍微实一点（最多 +0.04）
        float a = clamp(uOpacity + fresR * 0.04, 0.0, 0.92);
        gl_FragColor = vec4(col, a);
      }
    `,
    transparent: true,
    depthWrite: false,
    side: THREE.DoubleSide,
  });

  const water = new THREE.Mesh(waterGeo, waterMat);
  // 水面比"岸坡-最高水位交点"再低 0.05：
  // 岸坡是折线网格，顶点高度相对理论曲线有 0.05~0.10 的误差，
  // 压下去一点点，接缝那一环就稳定沉在水下，不会再从水面里冒出来。
  // ★ 关键：水面必须放在 baseY 高度。
  //   之前写成 position.y = 0，而几何体顶点是相对坐标（-0.015~0.015），
  //   结果整个水面沉到世界原点（y=0），比地形（y≈3.9）低了 4 个单位，
  //   完全被地面挡住 —— 这就是"水面消失"的真正原因。
  // ★ 水面高度取"交点处岸坡高度 + 0.02"，而不是固定的 waterHighY。
  //   岸坡是折线网格，实际交点比理论值高一点；
  //   用岸坡真实高度来定水面，水面边缘就永远压在岸坡上，
  //   不会出现"水面里凸起一圈土"。
  // ★ 水面高度 = surfaceY（和反解半径用的高度完全一致），
  //   只往下压 0.008 让水面边缘略微嵌进岸坡，避免浮点误差导致露缝。
  //   之前用 bankYAtWater + 0.02（比岸坡高 0.02），
  //   水面边缘就悬空了 —— 这就是那条深色缝的来源。
  // ★ 水面高度：因为半径收了 0.35，该半径处岸坡比 surfaceY 低约 0.06，
  //   所以水面要跟着降到那个高度，否则边缘又会浮起来。
  //   用半径处实际岸坡高度减去 0.01，让水线稳定嵌在岸坡里。
  const finalBankY = bankY(Math.max(0, Math.min(1, (waterR - FLAT_R) / (BANK_TOP - FLAT_R))));
  water.position.set(center.x, finalBankY - 0.01, center.z);
  water.receiveShadow = true;
  group.add(water);

  // 暴露材质，供主循环更新 uTime / uNight / 水位
  group.userData.waterMat = waterMat;

  // ---------- 四季水位 ----------
  // water.position.y 就是水面高度。四季变化时改这个值，
  // 池壁（rim）保持不动，于是"水面上升/下降"的效果自然出现。
  //
  // 注意：rim 顶部固定在 outsideAvg + 0.15，水位在
  // outsideAvg-0.15（春夏）~ outsideAvg-0.55（秋冬）之间移动，
  // 两端都在池壁覆盖范围内，不会露出水底或淹过岸边。
  group.userData.baseY = baseY;
  group.userData.outsideAvg = outsideAvg;
  group.userData.radius = radius;
  group.userData.waterR = waterR;
  group.userData.bottomY = bottomY;
  group.userData.shoreY = shoreY;
  group.userData.water = water;
  // 岸坡的季节接口（季节染色 / 冬季积雪）
  group.userData.rimMaterial = rimMat;
  // tint 用和地形完全相同的乘数（main.js 里那个 tint() 的结果），
  // 这样岸坡和地面的季节变化严格同步。
  group.userData.setBankSeason = (tintColor, snowAmount) => {
    const u = rimMat.userData.seasonShader;
    if (u && u.uSeasonGrass && tintColor) u.uSeasonGrass.value.copy(tintColor);
    if (bankSnow) bankSnow.value = Math.max(0, Math.min(1, snowAmount));
  };
  // 调试/验证用：暴露雪量 uniform
  group.userData.snowUniform = bankSnow;

  // 由高度反解"该高度处的岸坡半径"（和建网格时同一套 bankY 曲线）
  // bankY(u) = bottomY + (shoreY-bottomY)*smoothstep(u)，u∈[0,1] 对应
  // 半径 FLAT_R ~ BANK_TOP。水位下降时用它把水面半径同步收小，
  // 否则水面圆盘会插进岸坡内侧，露出一圈黑色。
  const radiusAtHeight = (y) => {
    const span = shoreY - bottomY;
    if (span <= 0.001) return BANK_TOP;
    let k = (y - bottomY) / span;
    k = Math.max(0, Math.min(1, k));
    // smoothstep 反解：k = u^2(3-2u) -> 二分几次即可（单调）
    let lo = 0, hi = 1;
    for (let i = 0; i < 24; i++) {
      const mid = (lo + hi) * 0.5;
      const sm = mid * mid * (3 - 2 * mid);
      if (sm < k) lo = mid; else hi = mid;
    }
    const u = (lo + hi) * 0.5;
    return FLAT_R + (BANK_TOP - FLAT_R) * u;
  };

  // 季节 t（0=春 1=夏 2=秋 3=冬）-> 更新水位与波纹强度
  group.userData.setSeason = (seasonT) => {
    const sink = waterSinkFor(seasonT);
    // ★ 必须从 shoreY 推导，不能用 outsideAvg：
    //   岸顶是 shoreY（= outsideMin），如果用 outsideAvg 当基准，
    //   水面会高出岸顶 0.17，水直接漫过岸坡悬在草地上。
    water.position.y = shoreY - sink;

    // ★ 水面半径跟着水位走。
    //   之前水面是固定半径的圆盘，水位一降，盘边就插进岸坡内侧，
    //   从上方看是"水面外有一圈黑环"。
    //   这里按当前水位反解岸坡半径，再留 0.3 埋进岸里，水面始终贴着岸。
    const rAtWater = radiusAtHeight(water.position.y);
    const scale = Math.max(0.55, Math.min(1.0, (rAtWater + 0.30) / waterR));
    water.scale.set(scale, 1, scale);
    // 波纹半径也要同步，否则边缘波动判断会错位
    waterMat.uniforms.uRadius.value = waterR * scale;

    // ★ 水位下降时，岸坡的"湿土带"必须跟着下移。
    //   waterR 是按最高水位反解出来的半径，水位降 0.7 个单位，
    //   露出来的那圈岸坡如果还按旧水线着色，就是一圈突兀的深泥。
    //   这里把"下降量"传给 shader，由它重新划分泥/草。
    // 水位下降 → 水面半径收缩量（世界单位），和 vWaterT 同一量纲。
    // 水位每降 1 个单位，水面半径约缩 0.8。
    const shift = Math.max(0, (sink - WATER_SINK_HIGH) * 0.8);
    const su = rimMat.userData.seasonShader;
    if (su && su.uWaterShift) su.uWaterShift.value = shift;

    // 水位越高，水面越"满"，波动幅度也越大（春夏活泼、秋冬安静）
    const c = Math.max(0, Math.min(3, seasonT));
    // 0=春夏（高水位）、1=秋冬（低水位）
    const lowW = c <= 1 ? 0 : (c <= 2 ? (c - 1) : (c <= 3 ? 1 : Math.max(0, 1 - (c - 3))));
    const k = lowW * lowW * (3 - 2 * lowW);

    waterMat.uniforms.uWaveAmp.value = 0.055 - k * 0.030;   // 0.055 -> 0.025
    waterMat.uniforms.uRipple.value = 0.55 - k * 0.22;      // 0.55 -> 0.33
    waterMat.uniforms.uOpacity.value = 0.62 + k * 0.06;     // 低水位水更"浓"一点

    group.userData.waterY = water.position.y;
  };
  group.userData.setSeason(1);

  return group;
}

export { HALF, PLATEAU_Y };