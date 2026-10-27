// ---------------------------------------------------------------------------
// 默认快照：所有新用户第一次打开时，从这个场景状态开始。
// 用户之后的自定义会覆盖此快照，保存在 localStorage。
// ---------------------------------------------------------------------------
export const DEFAULT_SNAPSHOT = {
  time: 0.82,
  season: 2.34,
  buildings: { barn: 0, farmhouse: 0 },
  silos: { silo1: 'concrete', silo2: 'wood' },
  watertowerStyle: 'metal',
  windmillStyle: 'modern',
  fenceStyles: { pasture: 'plank', coop: 'picket', field: 'rail' },
  watermillStyle: 0,
  snowmenStyles: ['jelly', 'lowpoly', 'crystal'],
  fields: ['wheat', 'cabbage', 'sunflower', 'pasture2'],
  trees: ['oak', 'birch', 'birch', 'birch', 'birch', 'birch', 'autumn', 'autumn'],
  bigtreeKind: 'purple',
  truckStyle: 'blue',
  muted: true,
};
