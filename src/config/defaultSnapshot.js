// ---------------------------------------------------------------------------
// 默认快照：所有新用户第一次打开时，从这个场景状态开始。
// 用户之后的自定义会覆盖此快照，保存在 localStorage。
//
// SNAPSHOT_VERSION 变更后，老用户本地存档会在下一次打开时被新默认覆盖一次。
// ---------------------------------------------------------------------------
export const SNAPSHOT_VERSION = '0.5.0-snapshot-2';

export const DEFAULT_SNAPSHOT = {
  snapshotVersion: SNAPSHOT_VERSION,
  time: 0.84,
  season: 3,
  buildings: { barn: 0, farmhouse: 1 },
  silos: { silo1: 'concrete', silo2: 'wood' },
  watertowerStyle: 'metal',
  windmillStyle: 'modern',
  fenceStyles: { pasture: 'plank', coop: 'picket', field: 'rail' },
  watermillStyle: 0,
  snowmenStyles: ['lowpoly', 'lowpoly', 'lowpoly'],
  fields: ['wheat', 'cabbage', 'sunflower', 'pasture2'],
  trees: ['apple', 'birch', 'blossom', 'camellia', 'birch', 'blossom', 'maple', 'apple'],
  bigtreeKind: 'purple',
  truckStyle: 'blue',
  muted: true,
};
