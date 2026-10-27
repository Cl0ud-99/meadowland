// ---------------------------------------------------------------------------
// 默认快照：所有新用户第一次打开时，从这个场景状态开始。
// 用户之后的自定义会覆盖此快照，保存在 localStorage。
// ---------------------------------------------------------------------------
export const DEFAULT_SNAPSHOT = {
  time: 0.21,
  season: 0.27,
  buildings: { barn: 0, farmhouse: 0 },
  silos: { silo1: 'metal', silo2: 'metal' },
  watertowerStyle: 'metal',
  windmillStyle: 'ranch',
  fenceStyles: { pasture: 'plank', coop: 'picket', field: 'rail' },
  watermillStyle: 0,
  snowmenStyles: ['jelly', 'lowpoly', 'crystal'],
  fields: ['wheat', 'cabbage', 'pumpkin', 'pasture2'],
  trees: ['oak', 'birch', 'birch', 'birch', 'birch', 'birch', 'oak', 'oak'],
  bigtreeKind: 'broadleaf',
  truckStyle: 'pickup',
  muted: true,
};
