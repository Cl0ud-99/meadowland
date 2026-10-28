import * as THREE from 'three';

// ---------------------------------------------------------------------------
// 设备性能检测 + 画质分级
//
// 手机上不能直接跑桌面配置（19 万三角面 + 13-tap 全屏模糊会掉帧）。
// 这里按设备能力分成三档，自动降低树数量、地形细分、模糊采样。
//
// 检测依据（按可靠性排序）：
//   1. devicePixelRatio × 屏幕面积（像素预算）
//   2. navigator.hardwareConcurrency（CPU 核心数）
//   3. navigator.deviceMemory（内存 GB，Chrome 支持）
//   4. UA 里的移动设备标识
// ---------------------------------------------------------------------------

export function detectDevice() {
  const ua = navigator.userAgent || '';
  const isMobileUA = /Android|iPhone|iPad|iPod|Mobile|HarmonyOS/i.test(ua);
  const isIOS = /iPhone|iPad|iPod/i.test(ua);
  const isSafari = /^((?!chrome|android).)*safari/i.test(ua);

  const dpr = window.devicePixelRatio || 1;
  const w = window.innerWidth || 390;
  const h = window.innerHeight || 844;
  const pixels = w * h * dpr * dpr;

  const cores = navigator.hardwareConcurrency || 4;
  const memory = navigator.deviceMemory || 4;   // GB，Chrome 才有

  // 微信小程序 / 内嵌浏览器
  const isWechat = /MicroMessenger/i.test(ua);

  // ---------- 分级 ----------
  // 注意：不能用"屏幕像素数"作为主要判据 —— iPhone 15 Pro 是 393x852x9 = 301 万像素，
  // 但它的 GPU 完全能跑。像素数只作为"极端情况"的补充判据。
  let tier = 'high';   // high | medium | low

  if (isMobileUA) {
    // 手机：主要看 CPU 核心数和内存
    //   <= 4 核 或 <= 3GB  -> low
    //   <= 6 核 或 <= 4GB  -> medium
    //   其余               -> high（现代旗舰机）
    if (cores <= 4 || (memory !== undefined && memory <= 3)) {
      tier = 'low';
    } else if (cores <= 6 || (memory !== undefined && memory <= 4)) {
      tier = 'medium';
    } else if (pixels > 4.5e6) {
      // 超大分辨率屏幕（折叠屏/平板）且核心数刚好够，降一档
      tier = 'medium';
    }
  } else {
    // 桌面：低配笔记本
    if (cores <= 2 || (memory !== undefined && memory <= 2)) tier = 'medium';
  }

  // 移动端一律不超过 medium：手机 GPU 的持续性能远低于桌面，
  // 即使是旗舰机，跑 19 万三角面 + 13-tap 全屏模糊也会发热降频。
  if (isMobileUA && tier === 'high') tier = 'medium';

  // iOS Safari 的 WebGL 驱动更保守：再降一档到 low 的情况：
  // 如果 DPR >= 3 且核心数 <= 6（iPhone 数字系列），用 low 更稳
  if (isIOS && dpr >= 3 && cores <= 6) tier = 'low';

  return {
    tier, isMobile: isMobileUA, isIOS, isSafari, isWechat,
    dpr, pixels, cores, memory,
  };
}

// 各档位的画质参数
const PRESETS = {
  high: {
    maxPixelRatio: 2,
    animalCount: { cow: 8, sheep: 11, chicken: 8 },
    // 森林扩大 + 加密 30%：900 -> 1170
    treeCount: 1170,
    grassCount: 3600,
    terrainSegments: 190,
    bloomResolution: 512,
    tiltBlurTaps: 13,      // 13-tap
    enableTilt: true,
    enableBloom: true,
    shadowMapSize: 2048,
    antialias: false,
    // 棉花团云朵数量（每朵 = 一个合并几何体，1 个 draw call）
    cloudCount: 18,
  },
  medium: {
    maxPixelRatio: 1.5,
    animalCount: { cow: 5, sheep: 7, chicken: 5 },
    // 同比例 +30%：520 -> 676
    treeCount: 676,
    grassCount: 1600,
    terrainSegments: 120,
    bloomResolution: 192,
    tiltBlurTaps: 8,
    enableTilt: true,
    enableBloom: true,
    shadowMapSize: 1024,
    antialias: false,
    cloudCount: 12,
  },
  low: {
    // 像素比 1.25：在 Retina 屏上肉眼几乎看不出差别，但像素量只有 1.5 的 70%
    maxPixelRatio: 1.25,
    // 手机端减少动物：每只动物 6~7 个 draw call
    animalCount: { cow: 3, sheep: 5, chicken: 4 },
    // 低端只 +10%（260 -> 286），避免软渲染/老手机掉帧
    treeCount: 286,
    grassCount: 650,
    terrainSegments: 88,
    // 低端也保留 Bloom（夜晚的灯光全靠它），但分辨率降到 96，
    // 相当于只在 1/8 分辨率上做辉光，开销很小
    bloomResolution: 96,
    tiltBlurTaps: 5,
    enableTilt: true,
    enableBloom: true,
    shadowMapSize: 512,
    antialias: false,
    cloudCount: 8,
  },
};

export function getQuality(device) {
  const preset = { ...PRESETS[device.tier] };
  // 像素比不能超过设备实际 DPR
  preset.maxPixelRatio = Math.min(preset.maxPixelRatio, device.dpr);
  return preset;
}

// 把分级结果打印到控制台，方便排查
export function logDeviceInfo(device, quality) {
  console.log(
    '[Meadowland] 设备: ' + device.tier +
    ' | 移动端: ' + device.isMobile +
    ' | DPR: ' + device.dpr +
    ' | 核心: ' + device.cores +
    ' | 内存: ' + device.memory + 'GB' +
    '\n  画质: 树 ' + quality.treeCount +
    ' | 草 ' + quality.grassCount +
    ' | 地形 ' + quality.terrainSegments +
    ' | Bloom ' + (quality.enableBloom ? quality.bloomResolution : '关') +
    ' | 移轴 ' + quality.tiltBlurTaps + '-tap'
  );
}