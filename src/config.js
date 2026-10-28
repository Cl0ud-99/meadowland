// ---------------------------------------------------------------------------
// 所有"手感"参数集中在这里。调画面时优先改这个文件，不要散落到各处。
// ---------------------------------------------------------------------------

export const PALETTE = {
  skyDay: 0x9fd0ea,
  skyNight: 0x0a1526,
  fogDay: 0xbfdcef,
  fogNight: 0x0d1a2e,

  grassA: 0x9dc46a,
  grassB: 0xb9d47e,
  grassC: 0x86b05a,
  dirt: 0xc9a878,
  soil: 0x8d6b4a,
  rock: 0xb9b3a6,
  water: 0x6fb6d8,

  trunk: 0x8a5f3c,
  leafA: 0x6fa84e,
  leafB: 0x86bd5f,
  leafC: 0x5c9346,

  wood: 0xb5794f,
  woodDark: 0x8b5836,
  roofRed: 0xb5543c,
  roofBlue: 0x6c8fb5,
  // 墙面白度压低，避免 ACES 后触发 Bloom 泛光
  wall: 0xdcd4c4,
  wallWarm: 0xe0cdb4,
  metal: 0xc7ccd2,
  hay: 0xe3c169,
  fence: 0xe8e2d2,

  cowWhite: 0xf7f4ee,
  cowBlack: 0x3b3630,
  sheepWool: 0xf3efe6,
  sheepFace: 0x4a4038,

  roadAsphalt: 0x5a6068,
  roadLine: 0xe8e4d8,
};

// 相机
export const CAMERA = {
  fov: 31,          // 26 -> 31：视野更宽，能带进更多天空与地平线
  near: 1,
  // 1200：天空球半径 900 必须完整落在远裁面内，否则拉远时天穹被裁掉。
  // 原来 600 比「相机到地形最远角」的 643 还小，远山直接被裁成背景色。
  far: 1200,
  // 开场：从山脊背后升起
  // 开屏随机机位：都在地形边界之外，前景有山坡/松林遮挡
  introSpots: [
    { x: -330, y: 120, z: 250, look: { x: 0, y: 22, z: 0 } },
    { x: -300, y: 120, z: -300, look: { x: 0, y: 22, z: 0 } },
    { x: 330, y: 120, z: 250, look: { x: 0, y: 20, z: 0 } },
  ],
  introFrom: { x: -330, y: 120, z: 250 },
  introLook: { x: 0, y: 22, z: 0 },
  // 全景视角：距离 168、俯角 8.5°
  //
  // 为什么从 y=88 降到 y=40：
  //   原来的俯角 32°，画面顶边还在水平线以下 16°，
  //   整幅画面**一点天空都没有**，太阳更不可能出现。
  //   现在俯角 8.5°，画幅上半部分露出约 23% 天空，
  //   早晨/日落时太阳圆盘正好落在画面上方。
  introTo: { x: 32, y: 40, z: 164 },
  introDuration: 6000,
  introEase: 0.55,          // 0..1，越大越"慢启动快中段"
  // 探索态
  // target.y 15 -> 26：画幅顶边仰角从 6.72° 抬到 10.44°，
  // 天空带从占画面 10% 拉到 22%（probe-cp.mjs 实测）。
  // 云只能活在「山脊轮廓仰角 8.62° ~ 画幅顶边仰角」这条窄带里，
  // 不抬 target.y 就没有带子可以放云。
  target: { x: 0, y: 26, z: 0 },
  minDistance: 55,
  maxDistance: 240,   // 全景距离 155，留余量给用户拉远
  minPolarAngle: 0.32,
  maxPolarAngle: 1.52,
  fullAzimuth: true,        // true = 360° 自由环绕；false 时受 maxAzimuth 限制
  maxAzimuth: 0.85,         // 仅 fullAzimuth=false 时生效，±弧度
  autoRotateSpeed: 0.22,
  damping: 0.055,
  wasdSpeed: 26,            // WASD 平移速度（单位/秒），按住 Shift 加速 2.4 倍
};

// 光照（两套，插值切换）
// ---------------------------------------------------------------------------
// 光照三段式：早晨（迷雾）→ 中午（晴朗）→ 夜晚
//
// 时间滑杆 t 的语义：
//   0.00 = 清晨，浓雾弥漫，光线柔和偏冷
//   0.50 = 正午，通透晴朗，阳光充足
//   1.00 = 夜晚，月光 + 灯光
//
// 三段之间用关键帧插值（见 lighting.js），不是简单的两段线性。
// ---------------------------------------------------------------------------
// 日落关键帧在时间轴上的位置（t=0.78 附近）
export const DUSK_T = 0.78;

export const LIGHT = {
  // ---------- 早晨：薄雾、曙光、冷暖对比 ----------
  morning: {
    skyTop: 0x4a7ab8,       // 天顶：深蓝
    skyMid: 0x88b4dc,       // 中层：中蓝
    sky: 0xa8c8e8,          // 天空：更蓝（原来偏灰）
    ground: 0x9a88b8,       // 地面反射：偏紫（三渲二的阴影色）
    hemi: 0.50,             // 0.62 -> 0.50（减少灰蒙蒙的漫射）
    sunColor: 0xffd9a8,     // 晨光：暖橙
    sunIntensity: 0.85,     // 0.55 -> 0.85（+55%，让曙光透进来）
    sunPos: { x: 95, y: 26, z: 60 },   // 低角度斜射（长影子）
    ambient: 0.24,          // 0.28 -> 0.24（略降，但别太暗）
    // 雾色不再写死：运行时由「天空地平线色 → 中层色」lerp 0.40 得出
    // （见 main.js applyMode），保证雾色永远等于远处天空的颜色，
    // 否则暖白雾 (0xe6d8c8) 会把远处山脊整片洗成 (196,192,186) 的白斑。
    fog: 0xafc8df,
    // 雾距推远：原来 130~520，远处山脊在 200~400 就被冲成一片白。
    // 实测 260~1400 雾几乎消失（失去"薄雾"的治愈感），
    // 180~900 保留了可见的晨雾层次，同时远山轮廓清晰。
    fogNear: 180,
    fogFar: 900,
    exposure: 1.06,

    // ---------- 三光源：冷补光 + 暖反弹光 ----------
    // 主光（sun）是暖色，这里再补一盏冷色侧逆光压出体积，
    // 以及一盏从地面反上来的暖光，避免阴影区死黑发脏。
    fillColor: 0x7fa6e0,       // 冷蓝补光
    fillIntensity: 0.78,       // 0.62 -> 0.78（早晨冷暖分离太弱，加强冷补）
    fillPos: { x: -82, y: 44, z: -58 },   // 与晨光(95,26,60)几乎反向
    bounceColor: 0xffcf9e,     // 暖橙反弹光
    bounceIntensity: 0.20,
    bouncePos: { x: -34, y: -30, z: -62 }, // Y 为负 = 从地面往上打
  },

  // ---------- 中午：阳光强烈、色彩艳丽、几乎无雾 ----------
  day: {
    skyTop: 0x3a7ac8,       // 天顶：饱和蓝
    skyMid: 0x8ac0f0,       // 中层：浅蓝
    sky: 0xbfe4ff,          // 更蓝的天空（原来偏白）
    ground: 0xa090d0,       // 地面反射：紫（三渲二阴影色，更明显）
    // 光照：提高对比度，让亮部更亮、暗部更暗
    //   hemi 降低（减少漫射的"灰"感）
    //   sunIntensity 提高（直射光更强，阴影更明确）
    hemi: 0.52,             // 0.42 -> 0.52（阴影区更亮）
    sunColor: 0xfff8e8,     // 更白的阳光（接近正午的日光）
    sunIntensity: 1.85,     // 1.05 -> 1.85（+76%，阳光更强烈）
    sunPos: { x: 62, y: 88, z: 40 },
    ambient: 0.18,          // 0.06 -> 0.18（照亮阴影区，避免死黑）
    // 雾：几乎消除，只有极远处才有一点点
    //   雾色运行时改成「天空地平线色」，不再写死成浅蓝白
    fog: 0xc8e0f0,
    fogNear: 420,
    fogFar: 1000,
    exposure: 1.08,         // 略提曝光，让画面更亮

    // 正午阳光最硬，冷补光稍收、暖反弹稍强，
    // 让"亮部暖 / 暗部冷"的冷暖对比最明显。
    fillColor: 0x8ab4e8,
    fillIntensity: 0.46,
    fillPos: { x: -76, y: 38, z: -64 },
    bounceColor: 0xffd9a8,
    bounceIntensity: 0.24,
    bouncePos: { x: -38, y: -32, z: -58 },
  },
  // ---------- 傍晚：日落暖光 ----------
  // 原来只有 morning/day/night 三段，t>0.5 之后是"正午暖白"直接混向"夜晚冷月光"，
  // 结果 t≈0.78 时主光已经是 #bdd0f6 的淡蓝、强度却还有 1.05，
  // 打在绿草地上就是一片灰绿"雾"。补一段日落暖色关键帧解决。
  dusk: {
    skyTop: 0x2a3a6a,       // 天顶：深蓝紫
    skyMid: 0x7a5a8a,       // 中层：紫（日落过渡色）
    sky: 0xe08a5a,          // 天空：橙
    ground: 0x6a4a68,       // 地面反射：紫褐
    hemi: 0.42,
    sunColor: 0xff8a4a,     // 落日：强橙
    sunIntensity: 1.25,
    sunPos: { x: -110, y: 16, z: 20 },  // 很低的角度，斜射
    ambient: 0.16,
    fog: 0xd08a6a,          // 暖色薄雾（运行时按天空色校正）
    fogNear: 300,
    fogFar: 820,
    exposure: 1.14,

    // 傍晚冷暖反差最大：冷补光偏蓝紫，暖反弹是余晖橙
    fillColor: 0x5a6aa8,
    fillIntensity: 0.40,
    fillPos: { x: 70, y: 40, z: -50 },
    bounceColor: 0xff9a58,
    bounceIntensity: 0.22,
    bouncePos: { x: -30, y: -28, z: -50 },
  },
  night: {
    skyTop: 0x0a1228,       // 天顶：深蓝黑
    skyMid: 0x1a2a4a,       // 中层：深蓝
    sky: 0x2c4a7a,
    ground: 0x1a1a38,       // 夜晚地面反射：深蓝紫
    // 月光整体抬一档：树木和屋顶在夜里会死黑成一片剪影，
    // 抬一点点就能保住体积感，又不至于把夜色洗成灰蓝。
    //   hemi      0.50 -> 0.56
    //   sun       0.50 -> 0.60（月光）
    //   ambient   0.10 -> 0.12
    // 这三项是联动实测出来的：只抬 sun 时地面亮度只 +5%（方向性太强，
    // 背光面还是死黑），把 hemi/ambient 一起抬才让"暗部有体积"这件事成立。
    // 实测地面亮度分位（1000x560，夜间 t=0.96，只统计画面下方 60%）：
    //   p15 19.9 -> 22.0（+10.6%） / p50 32.4 -> 36.3（+12.0%）
    hemi: 0.56,
    sunColor: 0x8fb4ff,      // 月光
    sunIntensity: 0.60,
    sunPos: { x: -70, y: 70, z: -50 },
    ambient: 0.12,
    fog: 0x0d1a2e,
    fogNear: 150,
    fogFar: 520,
    exposure: 1.22,

    // 夜里主光是冷月光，冷补光降得很低；
    // 暖光改成篝火/窗口的橙色，从低处反上来。
    fillColor: 0x3a5a9a,
    fillIntensity: 0.30,
    fillPos: { x: 62, y: 32, z: 56 },
    bounceColor: 0xff9a58,
    bounceIntensity: 0.14,
    bouncePos: { x: 42, y: -26, z: 52 },
  },
};

// 后期
export const POST = {
  // 阈值 0.90：只有接近纯白的材质（羊白 0.89）边缘轻微泛光，
  // 草地 0.80 / 彩色物体完全不发光。
  bloom: { strength: 0.5, radius: 0.5, threshold: 0.90 },
  // 夜晚阈值降到 0.78，让窗户和路灯发光
  bloomNight: { strength: 0.9, radius: 0.6, threshold: 0.78 },
  dof: { focus: 0.016, aperture: 0.0016, maxblur: 0.008 },
  tiltShift: {
    amount: 0.85,      // 移轴强度 0..1
    focus: 0.52,       // 清晰带中心（0=顶部, 1=底部）
    band: 0.18,        // 清晰带半宽（越小清晰区越窄）
    maxBlur: 1.0,      // 最大模糊倍数
    vignette: 0.3,     // 暗角强度
  },
};

// 世界
export const WORLD = {
  size: 620,          // 地形边长
  segments: 190,      // 地形细分
  hillHeight: 30,
  // 森林扩大 + 加密 30%（900 -> 1170）。
  // 撒点密度同步提高 30%，实际落树数量按 canPlantTree 的排除结果走。
  treeCount: 1170,
  grassTufts: 0,
  roadY: 0.06,
  bounds: { minX: -150, maxX: 150, minZ: -150, maxZ: 150 },  // 相机可移动的软边界
};

// 季节（后期扩展用，现在先给两套配色占位）
export const SEASON = {
  spring: { leafA: 0x8fc25e, leafB: 0xa5d472, leafC: 0x74ad4c, grassA: 0xa9cd77, grassB: 0xc2dc8c, grassC: 0x92ba62 },
  summer: { leafA: 0x6fa84e, leafB: 0x86bd5f, leafC: 0x5c9346, grassA: 0x9dc46a, grassB: 0xb9d47e, grassC: 0x86b05a },
  autumn: { leafA: 0xd09a4a, leafB: 0xe0b35c, leafC: 0xb87f38, grassA: 0xbfae6a, grassB: 0xd0c07d, grassC: 0xa89a5c },
  // 冬季：树冠用【和秋季完全相同】的褐色（枯枝），地面接近雪白。
  // 这样"春绿 -> 夏绿 -> 秋褐 -> 冬褐"是连续的，
  // 且秋冬两季的树冠明度/饱和度严格一致（之前冬季另给了一组更暗的褐色，
  // 导致"冬季比秋季亮/暗"的观感反复出现）。
  winter: { leafA: 0xd09a4a, leafB: 0xe0b35c, leafC: 0xb87f38, grassA: 0xf4f8fb, grassB: 0xfdfeff, grassC: 0xe8f0f6 },
};