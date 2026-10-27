import * as THREE from '../../vendor/three/three.module.js';
import { EffectComposer } from '../../vendor/three/examples/jsm/postprocessing/EffectComposer.js';
import { RenderPass } from '../../vendor/three/examples/jsm/postprocessing/RenderPass.js';
import { UnrealBloomPass } from '../../vendor/three/examples/jsm/postprocessing/UnrealBloomPass.js';
import { ShaderPass } from '../../vendor/three/examples/jsm/postprocessing/ShaderPass.js';
import { Pass } from '../../vendor/three/examples/jsm/postprocessing/Pass.js';
import { POST } from '../config.js';

// ---------------------------------------------------------------------------
// 后期管线
//
//   RenderPass -> ToneMap -> Bloom -> [拷贝清晰图] -> 半分辨率高斯模糊 x2 -> 合成
//
// 移轴模糊（tilt-shift）的实现要点：
//
//   早期版本用"单个 pass 打 13 个稀疏采样点覆盖 55px 半径"——
//   采样点之间间隔太大，模糊出来是一堆错位的重影，看起来就是"颗粒感/块状"。
//
//   现在改成业界标准做法：
//     1. 把画面降采样到 1/2 分辨率（本来就是个低通，天然平滑）
//     2. 可分离高斯：先水平模糊一次，再垂直模糊一次（5 次采样 ≈ 9-tap 高斯）
//     3. 迭代 2 次，等效半径足够大
//     4. 升采样回全分辨率，和清晰图按垂直方向掩码混合
//
//   半分辨率下做模糊，成本只有全分辨率的 1/4，但质量远好于稀疏采样。
// ---------------------------------------------------------------------------

const QUAD_VERT = `
  varying vec2 vUv;
  void main() {
    vUv = uv;
    gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
  }
`;

// 全屏四边形工具（自己管理，不依赖 FullScreenQuad）
class ScreenQuad {
  constructor() {
    this.material = null;
    this.camera = new THREE.OrthographicCamera(-1, 1, 1, -1, 0, 1);
    this.scene = new THREE.Scene();
    const geo = new THREE.PlaneGeometry(2, 2);
    this.mesh = new THREE.Mesh(geo, null);
    this.mesh.frustumCulled = false;
    this.scene.add(this.mesh);
  }
  render(renderer, material, target) {
    this.mesh.material = material;
    renderer.setRenderTarget(target);
    renderer.clear();
    renderer.render(this.scene, this.camera);
  }
}

// ---------------------------------------------------------------------------
// ACES tone mapping + sRGB 编码
// 必须在 Bloom 之前：否则 Bloom 看到的是线性 HDR 值，阈值形同虚设。
// ---------------------------------------------------------------------------
const ToneMapShader = {
  uniforms: {
    tDiffuse: { value: null },
    uExposure: { value: 1.0 },
    uSaturation: { value: 1.0 },   // 饱和度 1.0 = 原色，>1 更艳丽
    uContrast: { value: 1.0 },     // 对比度
    uVignette: { value: 0.35 },    // 伪 AO 暗角强度
  },
  vertexShader: QUAD_VERT,
  fragmentShader: `
    uniform sampler2D tDiffuse;
    uniform float uExposure;
    uniform float uSaturation;
    uniform float uContrast;
    uniform float uVignette;
    varying vec2 vUv;

    vec3 ACESFilmic(vec3 x) {
      const float a = 2.51, b = 0.03, c = 2.43, d = 0.59, e = 0.14;
      return clamp((x * (a * x + b)) / (x * (c * x + d) + e), 0.0, 1.0);
    }
    vec3 linearToSRGB(vec3 c) {
      return mix(
        pow(c, vec3(0.41666)) * 1.055 - vec3(0.055),
        c * 12.92,
        step(c, vec3(0.0031308))
      );
    }
    void main() {
      vec3 color = texture2D(tDiffuse, vUv).rgb;
      color *= uExposure;
      color = ACESFilmic(color);
      color = linearToSRGB(color);

      // 饱和度：向亮度灰阶插值（>1 时远离灰阶 = 更艳）
      float lum = dot(color, vec3(0.2126, 0.7152, 0.0722));
      color = mix(vec3(lum), color, uSaturation);

      // 对比度：以 0.5 为中心拉伸
      color = (color - 0.5) * uContrast + 0.5;

      // ---------- 伪 AO：屏幕空间暗角 ----------
      // 真正的 SSAO 需要深度纹理 + 多次采样，代价高且容易有噪点。
      // 这里用"径向亮度衰减"模拟 AO 的视觉效果：
      //   画面边缘轻微压暗，让中心更聚焦，同时模拟角落的环境光遮蔽。
      {
        vec2 d = vUv - 0.5;
        float r2 = dot(d, d);                      // 到中心的距离平方
        float vig = 1.0 - uVignette * r2 * 2.2;    // 边缘衰减
        color *= clamp(vig, 0.0, 1.0);

        // 极边缘再压一点（模拟 AO 的边缘遮蔽）
        float edge = smoothstep(0.42, 0.72, sqrt(r2));
        color *= mix(1.0, 0.88, edge * uVignette);
      }

      color = clamp(color, 0.0, 1.0);

      gl_FragColor = vec4(color, 1.0);
    }
  `,
};

// ---------------------------------------------------------------------------
// 可分离高斯模糊（5 次采样近似 9-tap）
// 权重是标准的高斯核，用线性采样合并成 5 次 fetch。
// ---------------------------------------------------------------------------
const BlurShader = {
  uniforms: {
    tDiffuse: { value: null },
    uDir: { value: new THREE.Vector2(0, 0) },   // 采样方向（1/宽 或 1/高）
    uRadiusPx: { value: 14.0 },                 // 最外层采样点的像素距离
  },
  vertexShader: QUAD_VERT,
  fragmentShader: `
    uniform sampler2D tDiffuse;
    uniform vec2 uDir;
    uniform float uRadiusPx;
    varying vec2 vUv;

    void main() {
      // 把"像素半径"换算成 uv 步长
      // 3.2307692308 是高斯核最外层偏移（以 sigma=2 为单位）
      vec2 step = uDir * (uRadiusPx / 3.2307692308);

      vec4 sum = texture2D(tDiffuse, vUv) * 0.2270270270;
      sum += texture2D(tDiffuse, vUv + step * 1.3846153846) * 0.3162162162;
      sum += texture2D(tDiffuse, vUv - step * 1.3846153846) * 0.3162162162;
      sum += texture2D(tDiffuse, vUv + step * 3.2307692308) * 0.0702702703;
      sum += texture2D(tDiffuse, vUv - step * 3.2307692308) * 0.0702702703;

      gl_FragColor = sum;
    }
  `,
};

// ---------------------------------------------------------------------------
// 合成：清晰图 + 模糊图，按垂直方向的掩码混合
// ---------------------------------------------------------------------------
const CompositeShader = {
  uniforms: {
    tSharp: { value: null },
    tBlur: { value: null },
    uAmount: { value: 0.85 },
    uFocus: { value: 0.52 },
    uBand: { value: 0.18 },
    uVignette: { value: 0.3 },
  },
  vertexShader: QUAD_VERT,
  fragmentShader: `
    uniform sampler2D tSharp;
    uniform sampler2D tBlur;
    uniform float uAmount;
    uniform float uFocus;
    uniform float uBand;
    uniform float uVignette;
    varying vec2 vUv;

    void main() {
      vec3 sharp = texture2D(tSharp, vUv).rgb;
      vec3 blurred = texture2D(tBlur, vUv).rgb;

      // ---------- 移轴掩码 ----------
      // 清晰带内完全锐利（mask = 0），只有上下两端才模糊。
      // 注意：不要给清晰带加"基础模糊"——那会让整个画面都糊掉，
      // 就失去了移轴"中间清晰、上下虚化"的本意。
      float d = abs(vUv.y - uFocus);
      float t = smoothstep(uBand, uBand + 0.26, d);
      t = pow(t, 0.55);              // 远端快速饱和
      float mask = t * uAmount;

      vec3 color = mix(sharp, blurred, mask);

      // 轻微暗角
      vec2 p = vUv - 0.5;
      color *= clamp(1.0 - dot(p, p) * 1.1 * uVignette, 0.0, 1.0);

      gl_FragColor = vec4(color, 1.0);
    }
  `,
};

// ---------------------------------------------------------------------------
// 自定义 pass 包装
// ---------------------------------------------------------------------------
class QuadPass extends Pass {
  constructor(material, target) {
    super();
    this.material = material;
    this.renderToScreen = false;
    this._target = target;      // null = 输出到 writeBuffer
    this._quad = new ScreenQuad();
  }
  setTarget(t) { this._target = t; }
  render(renderer, writeBuffer, readBuffer) {
    this._quad.render(
      renderer,
      this.material,
      this._target === null ? writeBuffer : this._target
    );
  }
}

// 把当前画面拷贝到一个固定的 render target（不参与 buffer 交换）
class CapturePass extends QuadPass {
  constructor(material, target) {
    super(material, target);
    this.needsSwap = false;
  }
}

function makeRT(w, h) {
  return new THREE.WebGLRenderTarget(Math.max(1, w), Math.max(1, h), {
    minFilter: THREE.LinearFilter,
    magFilter: THREE.LinearFilter,
    format: THREE.RGBAFormat,
    type: THREE.UnsignedByteType,
    depthBuffer: false,
    stencilBuffer: false,
  });
}

export function createComposer(renderer, scene, camera, quality = null) {
  const size = renderer.getSize(new THREE.Vector2());
  const dpr = renderer.getPixelRatio();
  const lastSize = { w: size.x, h: size.y };

  const composer = new EffectComposer(renderer);
  composer.setPixelRatio(dpr);
  composer.setSize(size.x, size.y);

  const q = quality || {
    bloomResolution: 512, enableBloom: true, tiltBlurTaps: 13,
  };

  // 模糊迭代次数按画质：高质量 3 次，中等 2 次，低端 1 次
  // 迭代次数：越多越平滑（等效 sigma = 单次 sigma × √次数）
  const blurIterations = q.tiltBlurTaps >= 13 ? 4 : (q.tiltBlurTaps >= 8 ? 3 : 2);
  // 每次迭代的采样半径（半分辨率下的像素）。
  // 半径必须足够大才能把细草、树叶这类高频细节彻底抹平，
  // 否则会留下"锐利细线"的颗粒感。实测 26 能覆盖 1~2 像素宽的草。
  // 1/3 分辨率下，半径 18 等效于全分辨率 54px 的视觉模糊
  const blurRadiusPx = q.tiltBlurTaps >= 13 ? 18 : (q.tiltBlurTaps >= 8 ? 14 : 10);

  const renderPass = new RenderPass(scene, camera);
  composer.addPass(renderPass);

  // ---------- tone mapping ----------
  const toneMap = new ShaderPass(ToneMapShader);
  toneMap.uniforms.uExposure.value = 1.0;
  composer.addPass(toneMap);

  // ---------- Bloom ----------
  const bloom = new UnrealBloomPass(
    new THREE.Vector2(q.bloomResolution, q.bloomResolution),
    POST.bloom.strength,
    POST.bloom.radius,
    POST.bloom.threshold
  );
  bloom.enabled = q.enableBloom;
  if (q.enableBloom) composer.addPass(bloom);

  // ---------- 模糊用的 render target ----------
  const W = Math.max(1, Math.floor(size.x * dpr));
  const H = Math.max(1, Math.floor(size.y * dpr));
  // 1/3 分辨率：降采样比 1/2 更激进，天然把细草、树枝这类
  // 1~2 像素的高频细节彻底抹掉。这是"纯高斯感"的关键。
  const hw = Math.max(1, Math.floor(W / 3));
  const hh = Math.max(1, Math.floor(H / 3));

  const rtSharp = makeRT(W, H);      // 清晰图（全分辨率）
  const rtA = makeRT(hw, hh);        // 模糊 ping
  const rtB = makeRT(hw, hh);        // 模糊 pong

  const captureMat = new THREE.ShaderMaterial({
    uniforms: { tDiffuse: { value: null } },
    vertexShader: QUAD_VERT,
    fragmentShader: `
      uniform sampler2D tDiffuse;
      varying vec2 vUv;
      void main() { gl_FragColor = texture2D(tDiffuse, vUv); }
    `,
    depthTest: false,
    depthWrite: false,
  });

  const capturePass = new CapturePass(captureMat, rtSharp);
  capturePass.material.uniforms.tDiffuse.value = null;   // 每帧由 ShaderPass 逻辑填充
  // CapturePass 读的是 readBuffer，需要手动接上
  capturePass.render = function (renderer, writeBuffer, readBuffer) {
    this.material.uniforms.tDiffuse.value = readBuffer.texture;
    this._quad.render(renderer, this.material, this._target);
  };
  composer.addPass(capturePass);

  // ---------- 可分离高斯模糊（半分辨率，ping-pong） ----------
  const blurH = new QuadPass(
    new THREE.ShaderMaterial({
      uniforms: {
        tDiffuse: { value: null },
        uDir: { value: new THREE.Vector2(1 / hw, 0) },
        uRadiusPx: { value: blurRadiusPx },
      },
      vertexShader: BlurShader.vertexShader,
      fragmentShader: BlurShader.fragmentShader,
      depthTest: false,
      depthWrite: false,
    }),
    rtB
  );
  const blurV = new QuadPass(
    new THREE.ShaderMaterial({
      uniforms: {
        tDiffuse: { value: null },
        uDir: { value: new THREE.Vector2(0, 1 / hh) },
        uRadiusPx: { value: blurRadiusPx },
      },
      vertexShader: BlurShader.vertexShader,
      fragmentShader: BlurShader.fragmentShader,
      depthTest: false,
      depthWrite: false,
    }),
    rtA
  );

  // 第一趟水平模糊需要先把全分辨率清晰图降采样进 rtA
  const downsampleMat = new THREE.ShaderMaterial({
    uniforms: {
      tDiffuse: { value: null },
      uTexel: { value: new THREE.Vector2(1 / W, 1 / H) },
    },
    vertexShader: QUAD_VERT,
    fragmentShader: `
      uniform sampler2D tDiffuse;
      uniform vec2 uTexel;
      varying vec2 vUv;
      void main() {
        // 4 次双线性采样平均：降采样时抑制摩尔纹，模糊更干净
        vec3 c = texture2D(tDiffuse, vUv + vec2(-0.5, -0.5) * uTexel).rgb;
        c += texture2D(tDiffuse, vUv + vec2( 0.5, -0.5) * uTexel).rgb;
        c += texture2D(tDiffuse, vUv + vec2(-0.5,  0.5) * uTexel).rgb;
        c += texture2D(tDiffuse, vUv + vec2( 0.5,  0.5) * uTexel).rgb;
        gl_FragColor = vec4(c * 0.25, 1.0);
      }
    `,
    depthTest: false,
    depthWrite: false,
  });
  const downsamplePass = new QuadPass(downsampleMat, rtA);
  downsamplePass.render = function (renderer, writeBuffer, readBuffer) {
    this.material.uniforms.tDiffuse.value = rtSharp.texture;
    this._quad.render(renderer, this.material, this._target);
  };
  composer.addPass(downsamplePass);

  // blurH: rtA -> rtB, blurV: rtB -> rtA
  // 每个迭代是"一对" pass，按迭代数重复添加。
  // 降级时可以直接禁用后面的迭代对（保持 ping-pong 数据流完整）。
  blurH.render = function (renderer) {
    this.material.uniforms.tDiffuse.value = rtA.texture;
    this._quad.render(renderer, this.material, rtB);
  };
  blurV.render = function (renderer) {
    this.material.uniforms.tDiffuse.value = rtB.texture;
    this._quad.render(renderer, this.material, rtA);
  };

  const blurPasses = [];
  for (let i = 0; i < blurIterations; i++) {
    // 每个迭代用独立的 pass 实例，方便单独禁用
    const h = new QuadPass(blurH.material, rtB);
    h.render = blurH.render;
    const v = new QuadPass(blurV.material, rtA);
    v.render = blurV.render;
    composer.addPass(h);
    composer.addPass(v);
    blurPasses.push({ h, v, index: i });
  }

  // ---------- 最终合成到屏幕 ----------
  const tilt = new Pass();
  tilt.renderToScreen = true;
  tilt.needsSwap = false;
  const compMat = new THREE.ShaderMaterial({
    uniforms: {
      tSharp: { value: rtSharp.texture },
      tBlur: { value: rtA.texture },
      uAmount: { value: POST.tiltShift.amount ?? 0.85 },
      uFocus: { value: POST.tiltShift.focus ?? 0.52 },
      uBand: { value: POST.tiltShift.band ?? 0.18 },
      uVignette: { value: POST.tiltShift.vignette ?? 0.3 },
    },
    vertexShader: CompositeShader.vertexShader,
    fragmentShader: CompositeShader.fragmentShader,
    depthTest: false,
    depthWrite: false,
  });
  const compQuad = new ScreenQuad();
  tilt.render = function (renderer) {
    compQuad.render(renderer, compMat, null);
  };
  // 让 pass 持有 material 引用（调试 / 运行时调参用）
  tilt.material = compMat;
  tilt.uniforms = compMat.uniforms;
  composer.addPass(tilt);

  // ---------- 对外接口 ----------
  let tiltAmount = POST.tiltShift.amount ?? 0.85;

  return {
    composer, renderPass, toneMap, bloom, tilt,

    setSize(w, h) {
      lastSize.w = w;
      lastSize.h = h;
      composer.setSize(w, h);
      const pr = renderer.getPixelRatio();
      const W2 = Math.max(1, Math.floor(w * pr));
      const H2 = Math.max(1, Math.floor(h * pr));
      const hw2 = Math.max(1, Math.floor(W2 / 3));
      const hh2 = Math.max(1, Math.floor(H2 / 3));
      rtSharp.setSize(W2, H2);
      rtA.setSize(hw2, hh2);
      rtB.setSize(hw2, hh2);
      blurH.material.uniforms.uDir.value.set(1 / hw2, 0);
      blurV.material.uniforms.uDir.value.set(0, 1 / hh2);
      downsampleMat.uniforms.uTexel.value.set(1 / W2, 1 / H2);
    },

    setPixelRatio(r) {
      composer.setPixelRatio(r);
      // 用记录下来的 CSS 尺寸重建 render target
      this.setSize(lastSize.w, lastSize.h);
    },

    // 自适应降级用：关闭/开启移轴（不是禁用 pass，而是把强度归零）
    setTiltEnabled(on) {
      compMat.uniforms.uAmount.value = on ? tiltAmount : 0.0;
    },

    // 自适应降级用：减少模糊迭代（保留至少 1 次，否则模糊消失）
    setBlurIterations(n) {
      const keep = Math.max(1, Math.min(blurPasses.length, n));
      blurPasses.forEach((p, i) => {
        p.h.enabled = i < keep;
        p.v.enabled = i < keep;
      });
      console.warn('[Meadowland] 模糊迭代 -> ' + keep);
    },

    setDayNight(t) {
      const a = POST.bloom, b = POST.bloomNight;
      if (bloom) {
        bloom.strength = a.strength + (b.strength - a.strength) * t;
        bloom.radius = a.radius + (b.radius - a.radius) * t;
        bloom.threshold = a.threshold + (b.threshold - a.threshold) * t;
      }
      compMat.uniforms.uVignette.value = 0.3 + 0.28 * t;
      // 夜晚稍微加强移轴
      tiltAmount = (POST.tiltShift.amount ?? 0.85) * (1 + 0.15 * t);
      compMat.uniforms.uAmount.value = tiltAmount;
    },
  };
}