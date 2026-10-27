// ---------------------------------------------------------------------------
// 建筑风格：5 套配色方案
//
// 每套风格定义谷仓、农舍、风车、水车、水塔的颜色。
// 点击建筑特写时，画面上会出现"换风格"按钮，循环切换。
//
// 设计思路：
//   - 每套风格有明确的色相主题，不是随便换颜色
//   - 保持低多边形风格，颜色饱和度适中（避免 Bloom 过曝）
//   - 屋顶/墙面/装饰三层次分明
// ---------------------------------------------------------------------------

export const BUILDING_STYLES = [
  {
    name: '经典红',
    desc: '经典美式农场，红墙白边',
    // 谷仓：红墙 + 深色屋顶
    barn: {
      wall: 0xb5543c,       // 红墙
      trim: 0xe8e2d2,       // 白色装饰线
      roof: 0x6a3a2e,       // 深棕屋顶
      door: 0x8b5836,       // 木门
      doorTrim: 0xe8e2d2,
      path: 0xc9a878,
    },
    // 农舍：米黄墙 + 红屋顶
    house: {
      wall: 0xe0cdb4,
      trim: 0x8b5836,
      roof: 0xb5543c,
      door: 0x8b5836,
      path: 0xc9a878,
    },
    // 风车：木色
    windmill: { tower: 0xd8cdb8, blade: 0xe8e2d2, hub: 0x8b5836 },
    // 水车：深木色
    watermill: { wood: 0x6a5240, blade: 0x7a6248, roof: 0x8a4a38 },
    // 水塔：金属 + 木
    watertower: { tank: 0xc7ccd2, roof: 0x6c8fb5, leg: 0x8b5836 },
    // 筒仓：银灰金属
    silo: { body: 0xc7ccd2, band: 0xa8aeb4, cap: 0xb8bec4 },
  },

  {
    name: '北欧蓝',
    desc: '北欧风格，蓝灰墙 + 白屋顶',
    barn: {
      wall: 0x7a95b5,       // 蓝灰
      trim: 0xf0f4f8,       // 亮白装饰
      roof: 0x3a4a5e,       // 深蓝屋顶
      door: 0x5a6a7a,
      doorTrim: 0xf0f4f8,
      path: 0xb8c8d8,
    },
    house: {
      wall: 0xe8eef4,
      trim: 0x7a95b5,
      roof: 0x4a6a8a,
      door: 0x5a6a7a,
      path: 0xb8c8d8,
    },
    windmill: { tower: 0xe8eef4, blade: 0xa8c0d8, hub: 0x5a6a7a },
    watermill: { wood: 0x5a6a7a, blade: 0x7a8a9a, roof: 0x4a6a8a },
    watertower: { tank: 0xd8e4f0, roof: 0x4a6a8a, leg: 0x5a6a7a },
    silo: { body: 0xd8e4f0, band: 0xb8c8d8, cap: 0xc8d8e8 },
  },

  {
    name: '秋日橙',
    desc: '秋季丰收，橙褐墙 + 深红屋顶',
    barn: {
      wall: 0xd88a3a,       // 橙
      trim: 0xf0e0c8,
      roof: 0x8a3a28,       // 深红屋顶
      door: 0x7a4a2a,
      doorTrim: 0xf0e0c8,
      path: 0xd8b888,
    },
    house: {
      wall: 0xf0e0c8,
      trim: 0xa86a3a,
      roof: 0x9a4a2a,
      door: 0x7a4a2a,
      path: 0xd8b888,
    },
    windmill: { tower: 0xf0e0c8, blade: 0xe0c090, hub: 0x7a4a2a },
    watermill: { wood: 0x7a4a2a, blade: 0x9a6a3a, roof: 0x9a4a2a },
    watertower: { tank: 0xe0c090, roof: 0x8a3a28, leg: 0x7a4a2a },
    silo: { body: 0xe0c090, band: 0xc8a878, cap: 0xd8b898 },
  },

  {
    name: '森林绿',
    desc: '森林小屋，墨绿墙 + 木色屋顶',
    barn: {
      wall: 0x4a6a4a,       // 墨绿
      trim: 0xd8e0d0,
      roof: 0x3a4a3a,       // 深绿屋顶
      door: 0x6a5a3a,
      doorTrim: 0xd8e0d0,
      path: 0xa8b898,
    },
    house: {
      wall: 0xd8e0d0,
      trim: 0x4a6a4a,
      roof: 0x5a7a5a,
      door: 0x6a5a3a,
      path: 0xa8b898,
    },
    windmill: { tower: 0xd8e0d0, blade: 0xa8c0a8, hub: 0x4a6a4a },
    watermill: { wood: 0x5a4a3a, blade: 0x7a6a4a, roof: 0x4a6a4a },
    watertower: { tank: 0xc8d8c8, roof: 0x3a4a3a, leg: 0x6a5a3a },
    silo: { body: 0xc8d8c8, band: 0xa8b8a8, cap: 0xb8c8b8 },
  },

  {
    name: '海盐白',
    desc: '海岸风格，纯白墙 + 蓝顶',
    barn: {
      wall: 0xf0f0ec,       // 近白
      trim: 0xa8c0d0,
      roof: 0x5a8aa8,       // 海蓝屋顶
      door: 0x8a9aa8,
      doorTrim: 0xa8c0d0,
      path: 0xd8d8d0,
    },
    house: {
      wall: 0xf4f4f0,
      trim: 0x8aa8b8,
      roof: 0x6a9ab8,
      door: 0x8a9aa8,
      path: 0xd8d8d0,
    },
    windmill: { tower: 0xf4f4f0, blade: 0xc8dce8, hub: 0x6a8a9a },
    watermill: { wood: 0x8a7a6a, blade: 0xa89a8a, roof: 0x5a8aa8 },
    watertower: { tank: 0xe8f0f4, roof: 0x5a8aa8, leg: 0x8a7a6a },
    silo: { body: 0xf0f4f8, band: 0xd0dce4, cap: 0xe0e8f0 },
  },
];