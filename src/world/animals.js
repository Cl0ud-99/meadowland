import * as THREE from 'three';
import { box, tint, meshFrom } from '../util/geo.js';
import { makeQuadruped, makeSheepRig, makeHuman, makeSittingHuman, randomLook } from './character.js';
import { PASTURE, COOP, BUILDINGS, HAY_BALES, PEOPLE_PATHS, FIELD_RECTS, HORSE_PASTURE, TREE_SPECS, BIG_TREE, WELL } from './layout.js';
import { SCATTER_SPOTS } from './forest.js';
import { STONE_COLLIDERS } from './groundstones.js';
import { pointInPolygon, circleInsidePolygon, distToPolygonEdge } from '../util/poly.js';

// 人物需要避让的树（树干体积）：固定品种树 + 5 棵点缀树 + 参天大树
const TREE_OBSTACLES = [
  ...TREE_SPECS.map((t) => ({ x: t.x, z: t.z, r: 1.0 * t.scale })),
  ...SCATTER_SPOTS.map((s) => ({ x: s.x, z: s.z, r: 1.1 })),
  { x: BIG_TREE.x, z: BIG_TREE.z, r: 2.2 },
];
import { toonLambert } from '../render/toon.js';

// ---------------------------------------------------------------------------
// 动物 + 小人（带程序化关节动画）
//
// 每个角色由 makeQuadruped / makeHuman 构建成"拆件模型"，
// 腿、头、尾巴、手臂都是独立 Group，可以各自旋转。
// 运动时根据"是否在移动"驱动关节角度，而不是整体平移。
// ---------------------------------------------------------------------------

// ---- 牛的品种 ----
const COW_BREEDS = [
  // 荷斯坦的白色同样压低，避免泛光
  { name: 'holstein',  base: 0xdcd7cc, patch: 0x3b3630, horn: 0xc8c2b4, muzzle: 0xc9a7a0, horned: true },
  { name: 'angus',     base: 0x35302b, patch: 0x241f1b, horn: 0x6b6258, muzzle: 0x4a4038, horned: false },
  { name: 'hereford',  base: 0x9a5a38, patch: 0xd8d0c0, horn: 0xd8d2c4, muzzle: 0xd8b8a8, horned: true },
  { name: 'simmental', base: 0xd8a878, patch: 0xe0d8c8, horn: 0xe0d8c8, muzzle: 0xc9a7a0, horned: true },
  { name: 'jersey',    base: 0xb98a5c, patch: 0x8a6240, horn: 0xd8d2c4, muzzle: 0xb08878, horned: true },
];

// ---- 羊的品种 ----
const SHEEP_BREEDS = [
  // 羊毛色不要用纯白，否则在 ACES 后接近 1.0 会触发 Bloom 泛光
  { name: 'white',   wool: 0xd8d2c4, face: 0x4a4038 },
  { name: 'black',   wool: 0x3d3833, face: 0x2a2521 },
  { name: 'grey',    wool: 0xb8b2a8, face: 0x5a524a },
  { name: 'brown',   wool: 0xa8886a, face: 0x5a4636 },
  { name: 'spotted', wool: 0xcdc5b4, face: 0x4a4038 },
];

// ---- 鸡的品种 ----
const CHICKEN_BREEDS = [
  { name: 'leghorn', body: 0xd8d4c8, comb: 0xd05a4a },
  { name: 'brown',   body: 0xa8703c, comb: 0xc04030 },
  { name: 'dark',    body: 0x6b4a2e, comb: 0xd05a4a },
  { name: 'buff',    body: 0xd8c8a8, comb: 0xc85840 },
];

// ---------------------------------------------------------------------------
// 马（3 个品种）
// ---------------------------------------------------------------------------
const HORSE_BREEDS = [
  { name: '枣红马', base: 0x8a4a2a, mane: 0x3a2418, muzzle: 0x5a3a28, hoof: 0x2a2420, horned: false },
  { name: '白马', base: 0xe8e4dc, mane: 0xb8b0a4, muzzle: 0xd0c8bc, hoof: 0x4a4440, horned: false },
  { name: '黑马', base: 0x3a3430, mane: 0x1a1614, muzzle: 0x2a2420, hoof: 0x1a1614, horned: false },
];

// ---------------------------------------------------------------------------
// 羊驼（3 个品种）
// ---------------------------------------------------------------------------
const ALPACA_BREEDS = [
  { name: '白羊驼', base: 0xf0ece4, mane: 0xe0d8cc, muzzle: 0xd8d0c4, hoof: 0x5a5048, horned: false },
  { name: '驼色羊驼', base: 0xc8a878, mane: 0xb89868, muzzle: 0xa88860, hoof: 0x5a5048, horned: false },
  { name: '灰羊驼', base: 0x9a948c, mane: 0x8a847c, muzzle: 0x7a746c, hoof: 0x4a4440, horned: false },
];

// ---------------------------------------------------------------------------
// 随机羊驼配色
//
// 用户要求"马全部换成羊驼，随机颜色"。所以不再用固定的 3 个品种，
// 而是每只现场生成一套：主体毛色 + 略深的鬃毛/耳朵 + 更浅的口鼻，
// 再随机挑一种鞍布配色（红蓝黄 / 绿橙紫 / 粉青…）。
//
// 色相从一组"羊驼常见色"里挑（奶油/驼/灰/棕/黑/白），
// 避免生成荧光色破坏农场氛围。
// ---------------------------------------------------------------------------
const ALPACA_BASES = [
  { name: '奶油', base: 0xf0e8d8, mane: 0xdccfb8, muzzle: 0xd8ccb8, hoof: 0x6a5a50 },
  { name: '驼色', base: 0xc8a878, mane: 0xb08f62, muzzle: 0xa88860, hoof: 0x5a4a40 },
  { name: '浅棕', base: 0xa8804e, mane: 0x8e6a3e, muzzle: 0x8a6a45, hoof: 0x4a3a30 },
  { name: '深棕', base: 0x7a5636, mane: 0x5e4028, muzzle: 0x6a4a30, hoof: 0x3a2c22 },
  { name: '银灰', base: 0xb8b2a8, mane: 0x9e988e, muzzle: 0xa8a096, hoof: 0x504a44 },
  { name: '炭黑', base: 0x5a544e, mane: 0x403a34, muzzle: 0x4a443e, hoof: 0x2a2420 },
  { name: '雪白', base: 0xf4f0e8, mane: 0xe4ddd2, muzzle: 0xdcd5c8, hoof: 0x6a6058 },
  { name: '焦糖', base: 0xb87a3e, mane: 0x96602c, muzzle: 0x9a6a38, hoof: 0x4a3628 },
];

// 鞍布配色：参考图是"红底 + 蓝边 + 黄纹"，这里给几组同风格的
const ALPACA_BLANKETS = [
  [0xc8302a, 0x3a6ab0, 0xf0c030],   // 红 / 蓝 / 黄
  [0x3a8a4a, 0xd88a2a, 0xf0e0a0],   // 绿 / 橙 / 米黄
  [0x8a4a9a, 0xe0a030, 0x50b0c0],   // 紫 / 金 / 青
  [0xd85a8a, 0x4a8ac0, 0xf0e8d0],   // 粉 / 蓝 / 奶
  [0x2a6a8a, 0xf0b030, 0xe0e8f0],   // 深青 / 黄 / 白
  [0xb03a2a, 0x2a7a5a, 0xe8c860],   // 砖红 / 墨绿 / 芥黄
];

function randomAlpacaBreed(rng) {
  const b = ALPACA_BASES[Math.floor(rng.next() * ALPACA_BASES.length) % ALPACA_BASES.length];
  // 主体色相 ±8% 抖动，避免同色完全一样
  const jitter = (hex, amt) => {
    const r = Math.min(255, Math.max(0, ((hex >> 16) & 255) + Math.round((rng.next() - 0.5) * 2 * amt)));
    const g = Math.min(255, Math.max(0, ((hex >> 8) & 255) + Math.round((rng.next() - 0.5) * 2 * amt)));
    const bl = Math.min(255, Math.max(0, (hex & 255) + Math.round((rng.next() - 0.5) * 2 * amt)));
    return (r << 16) | (g << 8) | bl;
  };
  const blanket = ALPACA_BLANKETS[Math.floor(rng.next() * ALPACA_BLANKETS.length) % ALPACA_BLANKETS.length];
  return {
    name: '羊驼·' + b.name,
    base: jitter(b.base, 14),
    mane: jitter(b.mane, 12),
    muzzle: jitter(b.muzzle, 12),
    hoof: b.hoof,
    blanket,
  };
}


// ---------------------------------------------------------------------------
function makeCow(breed, rng) {
  const patchSlots = [
    { y: 0.22, h: 0.5, d: 0.8, z: -0.55 },
    { y: 0.05, h: 0.42, d: 0.55, z: 0.7 },
  ];
  if (rng.chance(0.5)) patchSlots.push({ y: 0.38, h: 0.38, d: 0.5, z: 0.15 });

  return makeQuadruped({
    bodyW: 1.5, bodyH: 1.15, bodyD: 2.6,
    bodyColor: breed.base,
    patchColor: breed.patch,
    patchSlots,
    headColor: breed.base,
    muzzleColor: breed.muzzle,
    hornColor: breed.horn,
    horned: breed.horned,
    legColor: breed.base,
    legLen: 0.78,
    legW: 0.3,
    tailColor: breed.base,
    headSize: 0.9,
    muzzleSize: 0.75,
    // 参考图：粉色方鼻 + 红项圈金铃 + 粉色乳房 + 黑蹄
    noseColor: 0xe89aa0,
    collarColor: 0xb02a2a,
    bellColor: 0xf0c030,
    udderColor: 0xe8a0a8,
    hoofColor: 0x2e2622,
    earStyle: 'side',
  });
}

// ---------------------------------------------------------------------------
// 绵羊：用专属骨架（见 character.js 的 makeSheepRig）
//
// ★ 不再走 makeQuadruped。那套骨架是给牛/马/羊驼用的"长方体身体 +
//   按 headSize 放大的头"，套到羊身上头会占身体宽度的 65%，
//   看起来像大头娃娃，完全不是"一大团毛 + 小脑袋"的羊。
//
// 新骨架：蓬松的大毛团身体（占整体高度 ~65%）+ 小方头 +
//   短腿（只有身体高的一半）+ 小垂耳 + 小毛尾巴。
// ---------------------------------------------------------------------------
function makeSheep(breed, rng) {
  // 参考图：浅粉脸 + 奶油羊毛，两者要拉出对比。
  // 黑羊/棕羊的脸略压深一点，保留品种差异但不至于糊成一团。
  const faceColor = breed.name === 'black' ? 0xd8b8b4
    : breed.name === 'brown' ? 0xe8c8b4
      : 0xf4ccc4;

  const root = makeSheepRig({
    woolColor: breed.wool,
    faceColor,
    hoofColor: 0x4a4440,
    collarColor: 0xb02a2a,
    bellColor: 0xf0c030,
    noseColor: 0xe89aa0,
    // 体型：一大团毛身体 + 小脑袋 + 短短的腿
    //
    // ★ 这里的值【会覆盖】makeSheepRig 的默认值，所以必须按目标比例给：
    //   身体 1.55 宽 / 1.05 高、腿只有 0.24（身体的 23%）、头 0.54。
    bodyW: 1.55, bodyH: 1.05, bodyD: 1.5,
    legLen: 0.24, legW: 0.24,
    headW: 0.54, headH: 0.46, headD: 0.44,
    ears: true,
  });

  return root;
}

// 鸡：简化版四足（用两条腿）
// ---------------------------------------------------------------------------
// 马：高大、长腿、长脖子、有鬃毛
// ---------------------------------------------------------------------------
function makeHorse(breed, rng) {
  const root = makeQuadruped({
    // 马的体型：身体更长更窄，腿更长，头更小（显得脖子长）
    bodyW: 1.15, bodyH: 1.0, bodyD: 3.0,
    bodyColor: breed.base,
    patchColor: breed.base,
    patchSlots: [],
    headColor: breed.base,
    muzzleColor: breed.muzzle,
    hornColor: breed.mane,
    horned: false,
    legColor: breed.base,
    legLen: 1.40,
    legW: 0.22,
    tailColor: breed.mane,
    // ★ 马头要"窄长"：参考图里是细长的方块脸，口鼻只占下半一小段。
    //   之前 headSize 0.62 / muzzleSize 0.54 —— 口鼻几乎和头一样宽，
    //   正面看就是一大块粉色平面。
    headSize: 0.58,
    muzzleSize: 0.34,
    // 参考图：黑鬃毛一排、鞍具、红项圈金铃、黑蹄、竖起的耳朵
    neckLen: 0.52,
    maneColor: breed.mane,
    saddleColor: 0x8a4a32,
    saddleStrapColor: 0x5a3a28,
    collarColor: 0xb02a2a,
    bellColor: 0xf0c030,
    hoofColor: 0x2a2420,
    earStyle: 'up',
    noseColor: 0xd8a0a0,
    tailStyle: 'tuft',
  });

  // 白额头（参考图里马脸上有一道浅色条纹）
  //
  // ★ 必须是【细长竖条】贴在脸上，而不是一块大方块：
  //   headSize=0.62 时，宽 0.16 / 高 0.42 的块几乎盖住整张脸，
  //   看起来像个白十字。改成宽 0.10、高 0.30，贴在颅骨正面偏上，
  //   并且 z 只比颅骨表面多一点点，不穿到口鼻上。
  const head = root.children.find(c => c.name === 'head');
  if (head) {
    const blaze = meshFrom([
      box(0.10, 0.30, 0.035, 0xf0e4d4, 0, 0.20, 0.315),
    ]);
    blaze.name = 'blaze';
    head.add(blaze);
  }

  root.name = 'horse';
  return root;
}

// ---------------------------------------------------------------------------
// 羊驼：细长脖子、毛茸茸身体、小头
// ---------------------------------------------------------------------------
function makeAlpaca(breed, rng) {
  // 每只羊驼现场随机配色（breed 可能来自 ALPACA_BREEDS 或 randomAlpacaBreed）
  const skin = breed.blanket ? breed : randomAlpacaBreed(rng);
  const root = makeQuadruped({
    // ★ 参考图里羊驼身体是"厚实的毛团"，不是细棍：
    //   宽 0.95 -> 1.25、深 1.5 -> 1.7，看起来才有体积。
    bodyW: 1.25, bodyH: 1.05, bodyD: 1.7,
    bodyColor: skin.base,
    patchColor: skin.mane,
    patchSlots: [],
    headColor: skin.base,
    muzzleColor: skin.muzzle,
    hornColor: skin.mane,
    horned: false,
    legColor: skin.muzzle,
    legLen: 0.82,
    legW: 0.22,
    tailColor: skin.base,
    headSize: 0.56,
    muzzleSize: 0.40,
    // 参考图：长脖子、竖起长耳、彩纹鞍布、红项圈金铃、粉鼻
    // ★ 脖子加长到 0.78、头放大到 0.56 —— 参考图里羊驼是
    //   "细长脖子 + 明显的小方头"，头必须比脖子宽才看得出来。
    neckLen: 0.78,
    // ★ 羊驼不用 wool（wool 现在专指"羊的蓬松毛团身体"）。
    //   用户要求羊驼保持干净的方块造型，不要密集的毛。
    wool: false,
    earStyle: 'up',
    noseColor: 0xe0a0a8,
    collarColor: 0xb02a2a,
    bellColor: 0xf0c030,
    hoofColor: skin.hoof,
    // 鞍布：每组羊驼随机挑一套配色（红蓝黄 / 绿橙米 / 紫金青…）
    blanketColors: skin.blanket || [0xc8302a, 0x3a6ab0, 0xf0c030],
    tailStyle: 'tuft',
  });

  root.name = 'alpaca';
  return root;
}


function makeChicken(breed) {
  const root = new THREE.Group();
  root.name = 'chicken';

  const legLen = 0.22;
  const hipY = legLen;

  const bodyGroup = new THREE.Group();
  bodyGroup.name = 'body';
  bodyGroup.position.y = hipY + 0.3;
  const bodyParts = [];
  bodyParts.push(box(0.34, 0.3, 0.42, breed.body, 0, 0, 0));
  bodyParts.push(box(0.2, 0.22, 0.22, breed.body, 0, 0.25, 0.16));
  bodyParts.push(cone2(0.07, 0.16, 4, 0xe0a33c, 0, 0.2, 0.3));
  bodyParts.push(cone2(0.06, 0.18, 4, breed.comb, 0, 0.32, 0.18));
  bodyParts.push(box(0.2, 0.22, 0.1, breed.body, 0, 0.2, -0.22));
  bodyGroup.add(meshFrom2(bodyParts));
  root.add(bodyGroup);

  const makeLeg = (x) => {
    const g = new THREE.Group();
    g.name = 'leg';
    g.position.set(x, hipY, 0);
    g.add(meshFrom2([box(0.06, legLen, 0.06, 0xe0a33c, 0, -legLen / 2, 0)]));
    return g;
  };
  const legL = makeLeg(-0.09);
  const legR = makeLeg(0.09);
  root.add(legL, legR);

  root.userData.animate = (t, state) => {
    const { walk = 1, phase = 0, speed = 1, peck = 0 } = state;

    // 腿：按真实步频摆动（速度 0.55、步幅 0.24 -> 约 2.3 步/秒）
    const strideLen = 0.24;
    const stepFreq = Math.max(1.2, speed / strideLen);
    const legAng = Math.PI * 2 * stepFreq;

    // 身体：**不能和腿同频**，否则三个动作叠在一起像抽搐。
    // 用 abs(sin) 做点头节奏时，它的周期是 sin 的一半（频率翻倍），
    // 所以这里取 stepFreq * 0.25，实际点头频率 = 步频的一半。
    const bodyFreq = stepFreq * 0.25;
    const bodyAng = Math.PI * 2 * bodyFreq;

    const s = Math.sin(t * legAng + phase);
    const s2 = Math.sin(t * legAng + phase + Math.PI);
    legL.rotation.x = s * 0.6 * walk;
    legR.rotation.x = s2 * 0.6 * walk;

    // 点头：每两步一次，幅度压低到原来的一半
    const nod = Math.abs(Math.sin(t * bodyAng + phase));
    bodyGroup.position.z = (nod - 0.5) * 0.035 * walk;
    bodyGroup.rotation.x = (nod - 0.5) * 0.07 * walk;

    // ---------- 啄食 ----------
    // peck ∈ [0,1]：0 = 不啄，1 = 啄到最低点
    // 动作：整个身体前倾 + 下沉（鸡的头和身体是一体的，所以靠身体前倾实现）
    if (peck > 0.01) {
      const dip = peck;
      // 前倾 55°（0.96 rad），头会接近地面
      bodyGroup.rotation.x = bodyGroup.rotation.x * (1 - dip) + 0.96 * dip;
      // 身体下压
      bodyGroup.position.y = (hipY + 0.3) - 0.16 * dip;
      // 腿微弯（蹲一点）
      legL.rotation.x = legL.rotation.x * (1 - dip) + 0.35 * dip;
      legR.rotation.x = legR.rotation.x * (1 - dip) + 0.35 * dip;
    }
  };

  return root;
}

// 局部小工具（避免循环依赖）
function cone2(r, h, seg, color, x, y, z) {
  const g = new THREE.ConeGeometry(r, h, seg);
  g.translate(x, y + h / 2, z);
  return tint(g, color);
}
function meshFrom2(parts) {
  // 复用 character.js 里的逻辑：直接构造 Mesh
  const group = new THREE.Group();
  const merged = mergeParts(parts);
  const mat = toonLambert({ vertexColors: true, flatShading: true });
  const m = new THREE.Mesh(merged, mat);
  m.castShadow = true;
  m.receiveShadow = true;
  return m;
}
function mergeParts(parts) {
  let vTotal = 0, iTotal = 0;
  for (const g of parts) {
    vTotal += g.attributes.position.count;
    iTotal += g.index ? g.index.count : g.attributes.position.count;
  }
  const positions = new Float32Array(vTotal * 3);
  const normals = new Float32Array(vTotal * 3);
  const colors = new Float32Array(vTotal * 3);
  const indices = new Uint32Array(iTotal);
  let vOff = 0, iOff = 0;
  for (const g of parts) {
    const p = g.attributes.position, n = g.attributes.normal, c = g.attributes.color;
    positions.set(p.array.subarray(0, p.count * 3), vOff * 3);
    normals.set(n.array.subarray(0, n.count * 3), vOff * 3);
    if (c) colors.set(c.array.subarray(0, c.count * 3), vOff * 3);
    else colors.fill(1, vOff * 3, (vOff + p.count) * 3);
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
  out.setAttribute('color', new THREE.BufferAttribute(colors, 3));
  out.setIndex(new THREE.BufferAttribute(indices, 1));
  out.computeBoundingSphere();
  return out;
}

// ---------------------------------------------------------------------------
function sampleInside(poly, rng, bodyRadius, margin = 1.2, tries = 600) {
  let minX = Infinity, maxX = -Infinity, minZ = Infinity, maxZ = -Infinity;
  for (const [x, z] of poly) {
    if (x < minX) minX = x;
    if (x > maxX) maxX = x;
    if (z < minZ) minZ = z;
    if (z > maxZ) maxZ = z;
  }
  let best = null, bestClearance = -1;
  for (let i = 0; i < tries; i++) {
    const x = rng.range(minX, maxX);
    const z = rng.range(minZ, maxZ);
    if (!circleInsidePolygon(x, z, bodyRadius, poly, margin)) continue;
    const clearance = distToPolygonEdge(x, z, poly);
    if (clearance > bestClearance) { bestClearance = clearance; best = { x, z, clearance }; }
    if (clearance > bodyRadius + margin + 2.5) return { x, z, clearance };
  }
  return best;
}

export function buildAnimals(model, rng, counts = null) {
  const C = counts || { cow: 8, sheep: 11, chicken: 8 };
  const group = new THREE.Group();
  group.name = 'animals';
  const list = [];
  const BODY_R = { cow: 2.0, sheep: 1.15, chicken: 0.5, horse: 2.2, alpaca: 1.3 };

  // ★ 牧场内的静态障碍（树）：动物逐帧避开，防止从树干穿过。
  //   树放在牛羊群中心靠左 (-38, 50)，oak 70% 缩放 → 树冠半径约 2.5。
  //   这里用碰撞半径 2.6（树冠 + 一点余量），动物 bodyR 会在排斥时叠加。
  const staticObstacles = [
    { x: -38, z: 50, r: 2.6 },
    ...STONE_COLLIDERS,
  ];

  const spawnIn = (factory, kind, count, poly, opts) => {
    const bodyR = BODY_R[kind];
    let placed = 0, breedIdx = 0;
    for (let i = 0; i < count; i++) {
      const spot = sampleInside(poly, rng, bodyR, opts.margin ?? 1.4);
      if (!spot) break;
      const maxRadius = Math.max(0, spot.clearance - bodyR - 0.8);
      const radius = Math.min(opts.radius, maxRadius);
      if (radius < 0.6) continue;

      const breed = opts.breeds[breedIdx++ % opts.breeds.length];
      const a = factory(breed, rng);
      // name 用于点击特写时识别类型
      a.name = kind;
      const y = model.heightAt(spot.x, spot.z);
      a.position.set(spot.x, y, spot.z);
      a.rotation.y = rng.next() * Math.PI * 2;
      a.scale.setScalar(rng.range(opts.scale[0], opts.scale[1]));
      a.userData = {
        ...a.userData,
        cx: spot.x, cz: spot.z,
        phase: rng.next() * Math.PI * 2,
        speed: opts.speed,
        radius,
        graze: opts.graze !== false,
        poly, basePoly: poly, bodyR,
        clearance: spot.clearance,
        breed: breed.name,
        kind,
        // 动画状态
        walkAmount: 0,
        grazeAmount: 0,
        peckAmount: 0,
        peckTimer: 0,
        lastX: spot.x, lastZ: spot.z,
      };
      group.add(a);
      list.push(a);
      placed++;
    }
    return placed;
  };

  // 速度单位：世界单位/秒（约等于米/秒）
  // 参考真实动物步速：牛 ~1.1、羊 ~0.9、鸡 ~0.8
  const cowCount = spawnIn(makeCow, 'cow', C.cow, PASTURE, {
    radius: 5.5, speed: 1.1, scale: [0.9, 1.15], margin: 2.0, breeds: COW_BREEDS,
  });
  const sheepCount = spawnIn(makeSheep, 'sheep', C.sheep, PASTURE, {
    radius: 4.2, speed: 0.85, scale: [0.85, 1.1], margin: 2.0, breeds: SHEEP_BREEDS,
  });
  const chickenCount = spawnIn(makeChicken, 'chicken', C.chicken, COOP, {
    radius: 2.4, speed: 0.55, scale: [0.9, 1.2], margin: 0.8, graze: false, breeds: CHICKEN_BREEDS,
  });

  // 坡地牧场：全部是羊驼（用户要求"马全部换成羊驼"）
  //
  // ★ 原来这里分两批：4 只马 + 5 只羊驼。现在统一成羊驼，
  //   总数保持 9 只（马的 4 只并入羊驼），每只现场随机配色。
  //   breeds 传空数组只是占位，makeAlpaca 内部会用 randomAlpacaBreed 生成。
  const alpacaCount = spawnIn(makeAlpaca, 'alpaca', Math.max(0, (C.alpaca || 5) + (C.horse || 4) - 2), HORSE_PASTURE, {
    radius: 4.5, speed: 0.95, scale: [0.9, 1.12], margin: 1.6, breeds: [{}],
  });
  const horseCount = 0;

  const breeds = {};
  for (const a of list) breeds[a.userData.breed] = (breeds[a.userData.breed] || 0) + 1;

  group.userData.counts = {
    cow: cowCount, sheep: sheepCount, chicken: chickenCount,
    horse: horseCount, alpaca: alpacaCount,
  };
  group.userData.breeds = breeds;

  // ---------------------------------------------------------------------------
  // 更新：状态机驱动的"朝前走"运动
  //
  // 问题背景：之前用"圆周轨道积分 + 朝向取切线"，
  //   分离力一推，位置和朝向就脱钩，表现为左右横向漂移。
  //
  // 现在改成状态机：
  //   WALK    —— 朝当前 heading 直线前进
  //   PAUSE   —— 原地停下（吃草/反刍）
  //   TURN    —— 原地转身到新的 heading（身体先转，位置不动）
  //
  // 这样"向前走"是几何上严格成立的：位移向量 === heading 方向。
  // ---------------------------------------------------------------------------
  const WALK = 0, PAUSE = 1, TURN = 2, PECK = 3;   // 状态机：走 / 停 / 转 / 啄食

  // 初始化每只动物的状态机
  for (const a of list) {
    const u = a.userData;
    if (u.state === undefined) {
      const ang0 = u.phase;
      u.curX = u.cx + Math.cos(ang0) * u.radius * 0.6;
      u.curZ = u.cz + Math.sin(ang0) * u.radius * 0.6;
      u.heading = rng.next() * Math.PI * 2;      // 当前朝向（弧度）
      u.targetHeading = u.heading;                // 目标朝向
      u.state = WALK;
      u.stateTimer = 2 + rng.next() * 4;          // 当前状态剩余时间
      u.walkSpeed = 0.88 + rng.next() * 0.28;     // 个体速度差异（±14%）
      u.lastX = u.curX;
      u.lastZ = u.curZ;
    }
  }

  group.userData.update = (t, dt) => {
    const n = list.length;

    // ---- 1. 状态机推进 ----
    for (const a of list) {
      const u = a.userData;
      u.stateTimer -= dt;

      if (u.stateTimer <= 0) {
        if (u.state === WALK) {
          // 走了一段，停下休息
          // 鸡有 55% 概率进入啄食，其他动物只是站着
          if (u.kind === 'chicken' && rng.chance(0.55)) {
            u.state = PECK;
            u.stateTimer = 0.5 + rng.next() * 0.7;   // 啄 0.5~1.2 秒
          } else {
            u.state = PAUSE;
            u.stateTimer = 2.5 + rng.next() * 5;
          }
        } else if (u.state === PAUSE) {
          // 休息够了，选一个新方向并原地转身
          u.targetHeading = u.heading + (rng.next() - 0.5) * Math.PI * 1.4;
          u.state = TURN;
          u.stateTimer = 1.2 + rng.next() * 0.8;
        } else if (u.state === PECK) {
          // 啄食结束，回到停留
          u.state = PAUSE;
          u.stateTimer = 0.6 + rng.next() * 2.0;
        } else {
          // 转完了，继续走
          u.state = WALK;
          u.stateTimer = 3 + rng.next() * 6;
        }
      }
    }

    // ---- 2. 各状态行为 ----
    for (const a of list) {
      const u = a.userData;

      // ---------- 啄食动画 ----------
      if (u.state === PECK) {
        // 用正弦做出"低头-抬头"的循环：0.5 秒一个来回
        const cycle = Math.sin(t * 8.5 + u.phase);
        u.peckAmount = Math.max(0, cycle);   // 只在正半周低头
        u.walkAmount = 0;
      } else if (u.peckAmount > 0) {
        // 退出啄食时平滑回到 0
        u.peckAmount = Math.max(0, u.peckAmount - dt * 6);
      }

      if (u.state === TURN) {
        // 原地转身：只改朝向，位置不动
        let d = u.targetHeading - u.heading;
        while (d > Math.PI) d -= Math.PI * 2;
        while (d < -Math.PI) d += Math.PI * 2;
        const turnRate = Math.min(1, dt * 2.6);
        u.heading += d * turnRate;
        // 归一化到 [-PI, PI]，防止长时间运行后数值无限增长
        if (u.heading > Math.PI) u.heading -= Math.PI * 2;
        else if (u.heading < -Math.PI) u.heading += Math.PI * 2;
      } else if (u.state === WALK) {
        // 朝 heading 直线前进（u.speed 就是世界单位/秒，个体差异用 walkSpeed 微调）
        const spd = u.speed * u.walkSpeed;
        u.curX += Math.sin(u.heading) * spd * dt;
        u.curZ += Math.cos(u.heading) * spd * dt;
      }
      // PAUSE：位置不变
    }

    // ---- 3. 碰撞分离 ----
    // 只在 WALK 状态下把被推开的位移**反向修正朝向**，
    // 避免"被挤到侧面却还朝前走"导致的横向漂移感
    const ITER = 3, SAFETY = 1.12;
    for (let iter = 0; iter < ITER; iter++) {
      let moved = false;
      for (let i = 0; i < n; i++) {
        const ui = list[i].userData;
        for (let j = i + 1; j < n; j++) {
          const uj = list[j].userData;
          if (ui.poly !== uj.poly) continue;
          let dx = ui.curX - uj.curX, dz = ui.curZ - uj.curZ;
          let dist = Math.hypot(dx, dz);
          const minDist = (ui.bodyR + uj.bodyR) * SAFETY;
          if (dist >= minDist) continue;
          if (dist < 1e-4) {
            const a2 = ((i * 2.399 + j * 1.618) % 1) * Math.PI * 2;
            dx = Math.cos(a2); dz = Math.sin(a2); dist = 1;
          }
          const overlap = minDist - dist;
          const nx = dx / dist, nz = dz / dist;
          ui.curX += nx * overlap * 0.5;
          ui.curZ += nz * overlap * 0.5;
          uj.curX -= nx * overlap * 0.5;
          uj.curZ -= nz * overlap * 0.5;
          moved = true;
        }
      }
      if (!moved) break;
    }

    // ---- 3.5 动物回避静态障碍（树）----
    //   在同类分离之后、边界约束之前执行：把走进树干范围的动物沿径向推开。
    //   只作用于 WALK / PAUSE 状态（TURN 原地不动，不需要推）。
    for (const a of list) {
      const u = a.userData;
      for (const ob of staticObstacles) {
        const ox = u.curX - ob.x, oz = u.curZ - ob.z;
        const od = Math.hypot(ox, oz);
        const minDist = ob.r + u.bodyR;
        if (od >= minDist || od < 1e-4) continue;
        const nx = ox / od, nz = oz / od;
        const push = minDist - od;
        u.curX += nx * push;
        u.curZ += nz * push;
      }
    }

    // ---- 4. 边界约束 + 落地 + 朝向 + 动画 ----
    for (const a of list) {
      const u = a.userData;

      // 出界处理：撞到围栏就转向（而不是被挤着横向滑）
      if (!circleInsidePolygon(u.curX, u.curZ, u.bodyR, u.poly, 0.35)) {
        // 回退到上一个安全位置
        u.curX = u.lastX;
        u.curZ = u.lastZ;

        // 撞墙后立刻进入转身状态，朝围栏内部转
        if (u.state === WALK) {
          const toCenterX = u.cx - u.curX;
          const toCenterZ = u.cz - u.curZ;
          u.targetHeading = Math.atan2(toCenterX, toCenterZ) + (rng.next() - 0.5) * 1.2;
          u.state = TURN;
          u.stateTimer = 0.9 + rng.next() * 0.6;
        }
      }

      // ---- 碰撞修正朝向 ----
      // 如果被其他动物推开，实际位移方向和 heading 会不一致，
      // 这时让 heading 平滑追随实际位移方向 —— 看起来就是"被挤着走"，而不是横着飘。
      const realDx = u.curX - u.lastX;
      const realDz = u.curZ - u.lastZ;
      const realDist = Math.hypot(realDx, realDz);
      // 只在位移足够大时才修正朝向：太小的位移是碰撞分离的微调，
      // 让它改朝向反而会造成抖动
      if (realDist > 0.05) {
        const moveAng = Math.atan2(realDx, realDz);
        let diff = moveAng - u.heading;
        while (diff > Math.PI) diff -= Math.PI * 2;
        while (diff < -Math.PI) diff += Math.PI * 2;

        // 偏差大于 15° 才修正，避免抖动
        if (Math.abs(diff) > 0.26) {
          // 走路时快速跟随（被挤开要立刻转头），其他状态慢一点
          const followRate = u.state === 0 ? Math.min(1, dt * 5.5) : Math.min(1, dt * 2.0);
          u.heading += diff * followRate;
          if (u.heading > Math.PI) u.heading -= Math.PI * 2;
          else if (u.heading < -Math.PI) u.heading += Math.PI * 2;
        }
      }

      u.lastX = u.curX;
      u.lastZ = u.curZ;

      const py = model.heightAt(u.curX, u.curZ);
      a.position.set(u.curX, py, u.curZ);

      // 朝向：直接用 heading（模型正面是 +Z，所以用 atan2(sin, cos)）
      a.rotation.y = u.heading;

      // ---- 动画状态 ----
      // 只有 WALK 才迈腿；PAUSE 时吃草
      const wantWalk = u.state === WALK ? 1 : 0;
      u.walkAmount += (wantWalk - u.walkAmount) * Math.min(1, dt * 4);

      const wantGraze = (u.graze && u.state === PAUSE) ? 1 : 0;
      u.grazeAmount += (wantGraze - u.grazeAmount) * Math.min(1, dt * 1.8);

      if (a.userData.animate) {
        a.userData.animate(t, {
          walk: u.walkAmount,
          graze: u.grazeAmount,
          phase: u.phase,
          speed: u.walkSpeed,
        });
      }
    }
  };

  // 围栏隐藏后，牛羊/羊驼的活动范围整体放大（scale=1.6 表示线性扩大 60%）
  group.userData.setRoamScale = (scale) => {
    const k = Number.isFinite(scale) ? Math.max(1, scale) : 1;
    const cache = new Map();
    for (const a of list) {
      const u = a.userData;
      if (!u) continue;
      if (u.kind !== 'cow' && u.kind !== 'sheep' && u.kind !== 'alpaca') continue;
      const base = u.basePoly || u.poly;
      if (!base) continue;
      u.basePoly = base;
      if (k === 1) { u.poly = base; continue; }
      let out = cache.get(base);
      if (!out) {
        let cx = 0, cz = 0;
        for (const [px, pz] of base) { cx += px; cz += pz; }
        cx /= base.length; cz /= base.length;
        out = base.map(([px, pz]) => [cx + (px - cx) * k, cz + (pz - cz) * k]);
        cache.set(base, out);
      }
      u.poly = out;
    }
    group.userData.roamScale = k;
  };
  group.userData.setRoamScale(1);

  return group;
}

// ---------------------------------------------------------------------------
// 小人
// ---------------------------------------------------------------------------
export function buildPeople(model, rng) {
  const group = new THREE.Group();
  group.name = 'people';
  const list = [];
  const sitters = [];   // 坐着的人（不漫游，只做呼吸/转头动画）

  const isSafe = (x, z) => {
    const pad = 2.5;
    for (const b of Object.values(BUILDINGS)) {
      const r = b.r ?? Math.max(b.w ?? 0, b.d ?? 0) * 0.5;
      if (Math.hypot(x - b.x, z - b.z) < r + pad) return false;
    }
    for (const f of FIELD_RECTS) {
      const cos = Math.cos(-f.rot), sin = Math.sin(-f.rot);
      const dx = x - f.x, dz = z - f.z;
      const lx = dx * cos - dz * sin;
      const lz = dx * sin + dz * cos;
      if (Math.abs(lx) < f.w / 2 + pad && Math.abs(lz) < f.d / 2 + pad) return false;
    }
    for (const poly of [PASTURE, COOP]) {
      if (pointInPolygon(x, z, poly)) return false;
      if (distToPolygonEdge(x, z, poly) < pad) return false;
    }
    for (const [hx, hz, hr] of HAY_BALES) {
      if (Math.hypot(x - hx, z - hz) < hr + pad) return false;
    }
    // 水井体积碰撞：不能走进井口
    if (Math.hypot(x - WELL.x, z - WELL.z) < WELL.r + pad) return false;
    // ★ 树的体积碰撞：不能走进树干
    for (const tr of TREE_OBSTACLES) {
      if (Math.hypot(x - tr.x, z - tr.z) < tr.r + pad) return false;
    }
    // 散石体积碰撞
    for (const st of STONE_COLLIDERS) {
      if (Math.hypot(x - st.x, z - st.z) < st.r + pad) return false;
    }
    return true;
  };

  // ★ 三个人的外观完全由 randomLook() 从场景随机源里挑：
  //   衣色 / 裤色 / 肤色 / 发色 / 发型 / 帽子 / 身高全部独立随机，
  //   不再是"同一张脸 + 只有衣服颜色轮换"。randomLook 定义在 character.js。

  // ---------------------------------------------------------------------
  // 随机漫游：每个人在各自"活动范围"内随机选目标点走过去，
  // 到了就随机停一会儿，再选下一个点。
  //
  // 之前是固定椭圆轨迹（cx + cos(ang)*rx），位置完全可预测，
  // 看起来像在跑圈。现在改成真正的漫游。
  // ---------------------------------------------------------------------

  // 逐帧移动时的安全检测：人有一定体积，不能贴到围栏上
  const BODY_R = 0.55;   // 人的身体半径
  const isWalkable = (x, z) => {
    const pad = BODY_R + 0.35;   // 留一点余量，避免视觉上"贴脸"
    for (const b of Object.values(BUILDINGS)) {
      const r = b.r ?? Math.max(b.w ?? 0, b.d ?? 0) * 0.5;
      if (Math.hypot(x - b.x, z - b.z) < r + pad) return false;
    }
    for (const f of FIELD_RECTS) {
      const cos = Math.cos(-f.rot), sin = Math.sin(-f.rot);
      const dx = x - f.x, dz = z - f.z;
      const lx = dx * cos - dz * sin;
      const lz = dx * sin + dz * cos;
      if (Math.abs(lx) < f.w / 2 + pad && Math.abs(lz) < f.d / 2 + pad) return false;
    }
    // ★ 关键：牧场和鸡舍的围栏。人在外面走，不能穿进去
    for (const poly of [PASTURE, COOP]) {
      if (pointInPolygon(x, z, poly)) return false;
      if (distToPolygonEdge(x, z, poly) < pad) return false;
    }
    for (const [hx, hz, hr] of HAY_BALES) {
      if (Math.hypot(x - hx, z - hz) < hr + pad) return false;
    }
    // 水井体积碰撞：不能走进井口
    if (Math.hypot(x - WELL.x, z - WELL.z) < WELL.r + pad) return false;
    // ★ 树的体积碰撞：不能穿过树干
    for (const tr of TREE_OBSTACLES) {
      if (Math.hypot(x - tr.x, z - tr.z) < tr.r + pad) return false;
    }
    // 散石体积碰撞
    for (const st of STONE_COLLIDERS) {
      if (Math.hypot(x - st.x, z - st.z) < st.r + pad) return false;
    }
    return true;
  };

  // 如果角色已经被树干/石头挤进碰撞体，先沿径向推出，避免原地永远无路可走。
  const pushOutOfStatic = (u) => {
    const obs = [...TREE_OBSTACLES, ...STONE_COLLIDERS];
    for (let pass = 0; pass < 2; pass++) {
      for (const ob of obs) {
        const dx = u.x - ob.x, dz = u.z - ob.z;
        const d = Math.hypot(dx, dz);
        const minD = ob.r + 0.65;
        if (d >= minD || d < 1e-4) continue;
        u.x = ob.x + (dx / d) * minD;
        u.z = ob.z + (dz / d) * minD;
      }
    }
  };

  // 在活动范围内找一个安全的目标点
  const pickTarget = (u) => {
    for (let tries = 0; tries < 24; tries++) {
      const a = rng.next() * Math.PI * 2;
      // sqrt 让点分布更均匀（否则会偏向圆心）
      const rr = Math.sqrt(rng.next());
      const x = u.homeX + Math.cos(a) * u.homeR * rr;
      const z = u.homeZ + Math.sin(a) * u.homeR * rr;
      if (!isWalkable(x, z)) continue;
      // 不要选太近的点（避免原地抖动）
      if (Math.hypot(x - u.x, z - u.z) < 6) continue;
      return { x, z };
    }
    return null;
  };

  let idx = 0;
  // 三个农人的名字（用于特写时显示）
  const PEOPLE_NAMES = ['Cooper', 'Harry', 'Andy'];

  for (const path of PEOPLE_PATHS) {
    // ★ 每个人用不同的随机种子：三个人彼此独立，不共享外观
    let seed = (idx + 1) * 7919 + 13;
    const prand = () => {
      seed = (seed * 1103515245 + 12345) & 0x7fffffff;
      return seed / 0x7fffffff;
    };
    const look = randomLook(prand);
    // ★ Andy 固定黑色头发（用户指定）。
    //   其他两个人继续随机，保留"三个人看起来不一样"的效果。
    const personName = PEOPLE_NAMES[idx % PEOPLE_NAMES.length];
    if (personName === 'Andy') look.hairColor = 0x1a1614;

    const p = makeHuman(look);
    // 名字挂到 userData，供点击特写时读取
    p.userData.personName = personName;

    // 活动范围：用原路径的中心 + 半径放大一点，保证有足够活动空间
    const homeR = Math.max(path.rx, path.rz) * 1.9;

    const startAng = rng.next() * Math.PI * 2;
    const sx = path.cx + Math.cos(startAng) * path.rx * 0.5;
    const sz = path.cz + Math.sin(startAng) * path.rz * 0.5;

    p.userData = {
      ...p.userData,
      homeX: path.cx,
      homeZ: path.cz,
      homeR,
      x: sx, z: sz,
      targetX: sx, targetZ: sz,
      heading: rng.next() * Math.PI * 2,
      phase: rng.next() * 6.28,
      // 速度：每个个体略有差异（0.9~1.5 世界单位/秒，接近正常步行）
      speed: 0.9 + rng.next() * 0.6,
      // 状态：走 / 停 / 转身
      state: 'walk',
      stateTimer: 1 + rng.next() * 3,
      stuckX: sx, stuckZ: sz, stuckTimer: 0,
      walkAmount: 0,
      // 打招呼
      greetTimer: 0,
      greetAmount: 0,
      greetTarget: 0,
    };

    // 初始目标
    const t0 = pickTarget(p.userData);
    if (t0) { p.userData.targetX = t0.x; p.userData.targetZ = t0.z; }

    p.position.set(sx, model.heightAt(sx, sz), sz);
    group.add(p);
    list.push(p);
    idx++;
  }

  group.userData.update = (t, dt) => {
    // 每帧最多推进 1/20 秒，防止切后台回来后瞬移
    const step = Math.min(dt, 0.05);

    for (const p of list) {
      const u = p.userData;
      pushOutOfStatic(u);

      // ---------- 状态机 ----------
      u.stateTimer -= step;

      // ---------- 打招呼状态 ----------
      // 被点击后进入这个状态：停下、转向镜头、挥手，持续若干秒
      if (u.greetTimer > 0) {
        u.greetTimer -= step;
        u.greetAmount = Math.min(1, u.greetAmount + step * 4);
        u.walkAmount = 0;

        // 转向镜头
        if (u.greetTarget) {
          let d = u.greetTarget - u.heading;
          while (d > Math.PI) d -= Math.PI * 2;
          while (d < -Math.PI) d += Math.PI * 2;
          u.heading += d * Math.min(1, step * 5);
        }

        p.position.set(u.x, model.heightAt(u.x, u.z), u.z);
        p.rotation.y = u.heading;
        if (p.userData.animate) {
          p.userData.animate(t, {
            walk: 0, phase: u.phase, speed: 1, greet: u.greetAmount,
          });
        }
        continue;   // 跳过正常状态机
      } else if (u.greetAmount > 0) {
        // 打招呼结束，动作淡出
        u.greetAmount = Math.max(0, u.greetAmount - step * 3);
      }

      if (u.state === 'walk') {
        // 朝目标点走
        const dx = u.targetX - u.x;
        const dz = u.targetZ - u.z;
        const dist = Math.hypot(dx, dz);

        // 到了（或卡住太久）就换目标
        if (dist < 1.2) {
          u.state = 'pause';
          u.stateTimer = 1.5 + rng.next() * 4.5;   // 停 1.5~6 秒
        } else {
          // 朝目标移动
          const nx = dx / dist;
          const nz = dz / dist;
          const nextX = u.x + nx * u.speed * step;
          const nextZ = u.z + nz * u.speed * step;

          // ★ 逐帧碰撞检测：不能走进围栏/建筑/田地
          //   之前只验证了目标点，但移动路径上仍会穿过障碍物
          if (isWalkable(nextX, nextZ)) {
            u.x = nextX;
            u.z = nextZ;
            u.walkAmount = 1;

            // 平滑转向（不要瞬间掉头）
            const targetHeading = Math.atan2(nx, nz);
            let diff = targetHeading - u.heading;
            while (diff > Math.PI) diff -= Math.PI * 2;
            while (diff < -Math.PI) diff += Math.PI * 2;
            u.heading += diff * Math.min(1, step * 4);
          } else {
            // 撞到障碍：围绕目标方向依次尝试左右绕行，选最接近目标的可行方向。
            const base = Math.atan2(nx, nz);
            const offsets = [0.55, -0.55, 1.05, -1.05, 1.55, -1.55, 2.0, -2.0];
            let best = null;
            for (const off of offsets) {
              const a = base + off;
              const sx = u.x + Math.sin(a) * u.speed * step;
              const sz = u.z + Math.cos(a) * u.speed * step;
              if (!isWalkable(sx, sz)) continue;
              const d = Math.hypot(u.targetX - sx, u.targetZ - sz);
              if (!best || d < best.d) best = { x: sx, z: sz, a, d };
            }
            if (best) {
              u.x = best.x;
              u.z = best.z;
              u.walkAmount = 1;
              u.heading = best.a;
            } else {
              u.state = 'pause';
              u.stateTimer = 0.25 + rng.next() * 0.5;
              u.walkAmount = 0;
            }
          }
          // 连续一段时间没有实际位移：强制换目标，避免永久顶着障碍发呆
          u.stuckTimer += step;
          if (Math.hypot(u.x - u.stuckX, u.z - u.stuckZ) > 0.18) {
            u.stuckX = u.x; u.stuckZ = u.z; u.stuckTimer = 0;
          } else if (u.stuckTimer > 1.4) {
            u.state = 'pause';
            u.stateTimer = 0.15;
            u.stuckTimer = 0;
          }
        }
      } else if (u.state === 'pause') {
        // 原地休息，随机小幅张望
        u.walkAmount = 0;
        if (u.stateTimer <= 0) {
          const tgt = pickTarget(u);
          if (tgt) {
            u.targetX = tgt.x;
            u.targetZ = tgt.z;
            u.state = 'walk';
            u.stateTimer = 10 + rng.next() * 10;
          } else {
            // 找不到目标就再等一会儿
            u.stateTimer = 1;
          }
        }
      }

      // 目标点可能被别的东西占用，超时后强制重选
      if (u.state === 'walk' && u.stateTimer <= 0) {
        const tgt = pickTarget(u);
        if (tgt) { u.targetX = tgt.x; u.targetZ = tgt.z; }
        u.stateTimer = 10 + rng.next() * 10;
      }

      // ---------- 应用位置与朝向 ----------
      p.position.set(u.x, model.heightAt(u.x, u.z), u.z);
      p.rotation.y = u.heading;

      if (p.userData.animate) {
        // 走路时腿部摆动，站着时静止
        p.userData.animate(t, {
          walk: u.walkAmount, phase: u.phase, speed: 1,
          greet: u.greetAmount || 0,
        });
      }
    }

    // 坐着的人：只做呼吸 + 缓慢转头（看池塘里的鱼）
    for (const s of sitters) {
      if (s.userData.animate) s.userData.animate(t);
    }
  };

  // ---------------------------------------------------------------------
  // 树下坐着看鱼的人（水池北岸，橡树 (-78,-22) 南侧）
  //
  // ★ 位置：(-78, -17) —— 在橡树和池塘之间、池塘北岸(z=-14)之外，
  //   朝南(+Z)面向池塘，能看到水里游的鱼。
  // ★ 外观复用 randomLook()，和漫游的小人风格一致。
  // ---------------------------------------------------------------------
  {
    // ★ 独立的随机源（prand 是上面 for 循环里的局部变量，这里拿不到）
    let sseed = 9001;
    const srand = () => {
      sseed = (sseed * 1103515245 + 12345) & 0x7fffffff;
      return sseed / 0x7fffffff;
    };
    const sitLook = randomLook(srand);
    const sitter = makeSittingHuman({
      ...sitLook,
      lookYaw: 0,          // 模型正面 +Z 朝南 → 正对池塘
    });
    // ★ 位置修正（两轮）：
    //   ① 池塘【实际】半径 25.9（配置写 16 不准），北岸在 z=-23.9。
    //      最初放 z=-15.5 完全在水里，人物沉到水下看不见。
    //   ② 树 (-78,-22) 距池心 24，也在水线内侧 —— 人若坐树南侧就是水。
    //      所以把树北移到 (-78,-27)，人坐 (-78,-23)：
    //        · 树南侧 4 单位、地形 5.73（岸上）
    //        · 距池心 25，正好在岸边缓坡顶，朝南能看见水面
    //        · 视线不被树干挡住
    const sx = -78, sz = -23;
    sitter.position.set(sx, model.heightAt(sx, sz), sz);
    sitter.name = 'person-sitting';
    group.add(sitter);
    sitters.push(sitter);
  }

  group.userData.sitters = sitters;
  group.userData.count = list.length;
  return group;
}