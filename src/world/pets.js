import * as THREE from 'three';
import { toonLambert } from '../render/toon.js';
import { box, cyl, tint } from '../util/geo.js';
import { STONE_COLLIDERS } from './groundstones.js';
import { BUILDINGS, FIELD_RECTS, PASTURE, COOP, HORSE_PASTURE, HAY_BALES } from './layout.js';
import { pointInPolygon, distToPolygonEdge } from '../util/poly.js';

// ---------------------------------------------------------------------------
// 宠物：狗 Brioche + 猫 Cortado
//
// 行为（随机触发，不是固定循环）：
//   walk  走动 —— 在各自活动范围内挑目标点走过去
//   sleep 睡觉 —— 趴下，身体压低、腿收拢、头搁在前爪上
//   eat   吃东西 —— 低头在地上嗅/啃，头小幅上下点
//
// 三个状态之间按权重随机切换，每种状态持续几秒到十几秒。
//
// 特写（点击）时的叫声规则：
//   只有【行走中】被点才叫 —— 睡觉和吃东西时不叫，
//   因为动物在睡觉/进食时被打扰不叫更符合直觉。
// ---------------------------------------------------------------------------

// ★ 造型参数（2026-11 重做：体素方块风）
//
// 用户给了参考图：**体素/方块风**的猫狗 ——
//   猫：三花（奶油底 + 橘斑 + 深褐斑）、红项圈 + 金铃铛、
//       条纹尾巴、白胡须、尖立耳（内耳浅粉）
//   狗：金毛浅褐、垂耳、橙色领巾、黑色鼻头、白色口鼻
//
// 所以骨架从"球体解剖"改成"方块拼装"：
//   躯干  = 一个主立方体 + 胸口浅色块 + 背/臀的斑块
//   头    = 略扁的立方体 + 前伸的口鼻块 + 头顶斑块
//   腿    = 细长方柱（前腿稍短、后腿稍长），不做关节球
//   耳朵  = 立方体薄片（猫立耳带内耳、狗垂耳往外撇）
//   尾巴  = 分段方块，每段一个颜色（条纹）
//
// 保留 makePetRig 的返回结构（parts.bodyGroup / headGroup / legs /
// tailGroup / hipY + animate），状态机、poseSleep、poseEat、hud 都不用改。
const DOG = {
  name: 'Brioche',
  // 金毛：暖沙色身体 + 更浅的口鼻/胸口
  bodyColor: 0xe8b878,
  chestColor: 0xf2d0a0,
  legColor: 0xe0ad6c,
  tailColor: 0xe8b878,
  muzzleColor: 0xf5dfc0,
  noseColor: 0x3a2a22,
  earColor: 0xd9a462,
  // 领巾（参考图里是橙色）
  scarfColor: 0xe0603a,
  // 体型（方块尺寸：w/h/d）
  bodyW: 0.42, bodyH: 0.40, bodyD: 0.62,
  headW: 0.34, headH: 0.30, headD: 0.30,
  legLen: 0.26, legW: 0.115,
  // ★ 口鼻要"小而扁"：参考图里狗的口鼻只占脸的下 1/4，
  //   之前 0.20×0.14×0.12 相对 headH=0.30 太大，
  //   把眼睛挤到头顶去了。
  muzzleW: 0.17, muzzleH: 0.10, muzzleD: 0.10,
  earStyle: 'floppy',
  tailSegs: 4, tailSize: 0.062, tailBase: -0.85, tailCurve: 0.24,
};

const CAT = {
  name: 'Cortado',
  // 三花：奶油底
  bodyColor: 0xf0e4d0,
  chestColor: 0xf7efe0,
  legColor: 0xf0e4d0,
  tailColor: 0xf0e4d0,
  muzzleColor: 0xfaf4e8,
  noseColor: 0xd88a94,
  earColor: 0xf0e4d0,
  // 斑块色
  patchOrange: 0xe08a2c,
  patchDark: 0x4a3428,
  // 项圈 + 铃铛
  collarColor: 0xc8302a,
  bellColor: 0xf0c030,
  // 体型：明显比狗小一圈
  bodyW: 0.30, bodyH: 0.28, bodyD: 0.44,
  headW: 0.26, headH: 0.23, headD: 0.22,
  legLen: 0.17, legW: 0.08,
  muzzleW: 0.12, muzzleH: 0.07, muzzleD: 0.07,
  earStyle: 'erect',
  tailSegs: 6, tailSize: 0.040, tailBase: -0.45, tailCurve: 0.34,
};

// 状态
const ST_WALK = 0;
const ST_SLEEP = 1;
const ST_EAT = 2;

const STATE_NAME = ['walk', 'sleep', 'eat'];

// ---------------------------------------------------------------------------
// 造型
// ---------------------------------------------------------------------------
// ---------------------------------------------------------------------------
// 宠物骨架：体素方块风
//
// 按用户给的参考图重建 —— 参考图是"体素/像素风"的猫狗：
//   猫：三花（奶油底 + 橘斑 + 深褐斑）、红项圈金铃铛、条纹尾巴、白胡须
//   狗：金毛浅褐、垂耳、橙色领巾、黑鼻头、浅色口鼻
//
// 所以不用球体解剖了，改成**方块拼装**：
//   躯干   主立方体 + 胸口浅色块 + 背上/臀部的斑块
//   头     略扁立方体 + 前伸口鼻块 + 头顶斑块 + 眼睛 + 鼻子
//   腿     细长方柱（pivot 在髋部，直接旋转）
//   耳朵   立方体薄片（猫立耳带内耳，狗垂耳往外撇）
//   尾巴   分段方块，逐段给颜色做条纹
//
// 返回结构保持与旧骨架一致（parts.bodyGroup / headGroup / legs /
// tailGroup / hipY + animate），这样 poseSleep、poseEat、
// 状态机和 hud 都不用改。
// ---------------------------------------------------------------------------
function makePetRig(cfg) {
  const {
    bodyColor, chestColor, legColor, tailColor, muzzleColor, noseColor, earColor,
    bodyW, bodyH, bodyD,
    headW, headH, headD,
    legLen, legW,
    muzzleW, muzzleH, muzzleD,
    earStyle, tailSegs, tailSize, tailBase, tailCurve,
    // 可选：猫的斑块 / 项圈 / 铃铛，狗没有就用不到
    patchOrange, patchDark, collarColor, bellColor, scarfColor,
  } = cfg;

  const root = new THREE.Group();
  const mat = (c) => toonLambert({ color: c, flatShading: true });

  const bodyMat = mat(bodyColor);
  const chestMat = mat(chestColor);
  const legMat = mat(legColor);
  const muzzleMat = mat(muzzleColor);
  const noseMat = mat(noseColor);
  const earMat = mat(earColor);

  // 立方体工具：y 是底面（和 geo.box 一致，方便按"脚底贴地"摆）
  const cube = (matRef, w, h, d, x, y, z) => {
    const g = new THREE.BoxGeometry(w, h, d);
    g.translate(x, y + h / 2, z);
    const m = new THREE.Mesh(g, matRef);
    m.castShadow = true;
    m.receiveShadow = true;
    return m;
  };

  // 髋关节高度 = 腿长（站立时腿从髋垂直落地）。
  // ★ 方块风的关键：身体【底面】要和髋关节齐平，
  //   腿才能整段露在身体下面。所以身体立方体的 y 从 -bodyH 开始
  //   （cube 的 y 参数是底面），而不是从 0 往下画。
  const hipY = legLen;

  // ---------- 躯干 ----------
  const bodyGroup = new THREE.Group();
  bodyGroup.name = 'body';
  bodyGroup.position.y = hipY;

  // 主体：底面贴髋关节（y = 0 处是身体底面，向上 bodyH）
  bodyGroup.add(cube(bodyMat, bodyW, bodyH, bodyD, 0, 0, 0));

  // 胸口浅色块（参考图里狗/猫的胸前都是浅色）。
  // ★ 位置要【略微嵌进】身体正面，而不是贴在 0.5*bodyD 之外：
  //   厚度 0.08 的块中心放在 bodyD*0.5 时，外表面是 0.54*bodyD，
  //   会整块浮在胸前像个挂件。改到 0.46*bodyD，一半嵌进身体。
  // ★ 胸块要【嵌进】身体表面，只露出一层薄薄的浅色。
  //   cube 的 z 是底面，厚度 0.10 时中心在 z+0.05。
  //   身体半深 = bodyD*0.5，所以底面取 bodyD*0.44 时，
  //   外表面 = bodyD*0.44 + 0.10 = bodyD*0.44 + 0.10，
  //   比身体表面（bodyD*0.5）低一点点，正好"贴"在胸前一薄层。
  bodyGroup.add(cube(
    chestMat,
    bodyW * 0.42, bodyH * 0.36, bodyD * 0.10,
    0, bodyH * 0.06, bodyD * 0.45
  ));

  // 猫：背上两片斑块（一橘一褐，还原三花）
  if (patchOrange !== undefined) {
    bodyGroup.add(cube(mat(patchOrange), bodyW * 0.5, bodyH * 0.10, bodyD * 0.32, -bodyW * 0.16, bodyH * 0.90, -bodyD * 0.12));
    bodyGroup.add(cube(mat(patchDark), bodyW * 0.42, bodyH * 0.10, bodyD * 0.24, bodyW * 0.20, bodyH * 0.90, bodyD * 0.12));
    // 侧腹的斑
    bodyGroup.add(cube(mat(patchOrange), bodyW * 0.10, bodyH * 0.34, bodyD * 0.26, -bodyW * 0.5, bodyH * 0.22, -bodyD * 0.06));
  }

  // 狗：领巾 —— 放到 headGroup 里（脖子位置），见下方 headGroup 部分。
  //   放在 bodyGroup 里会随身体起伏而错位，而且身体底面已上移，
  //   bodyH*0.72 会跑到头顶上去。

  root.add(bodyGroup);

  // ---------- 腿 ----------
  // 方块风不需要膝关节：一条方柱直接绕髋旋转就够了。
  // 但 poseSleep / poseEat 会读 leg.userData.knee —— 所以仍然挂一个空的 knee 组。
  const makeLeg = (x, z, back) => {
    const hipJoint = new THREE.Group();
    hipJoint.name = 'leg';
    hipJoint.position.set(x, hipY, z);

    const h = legLen;
    hipJoint.add(cube(legMat, legW, h, legW, 0, -h, 0));

    // 爪子/脚：比腿略宽一点的小方块，贴地
    hipJoint.add(cube(legMat, legW * 1.15, legW * 0.5, legW * 1.3, 0, -h, legW * 0.14));

    const knee = new THREE.Group();   // 空组，保持接口兼容
    hipJoint.add(knee);

    hipJoint.userData.knee = knee;
    hipJoint.userData.back = back;
    return hipJoint;
  };

  const legX = bodyW * 0.34;
  const legZF = bodyD * 0.32;
  const legZB = bodyD * 0.32;
  const legs = {
    fl: makeLeg(-legX, legZF, false),
    fr: makeLeg(legX, legZF, false),
    bl: makeLeg(-legX, -legZB, true),
    br: makeLeg(legX, -legZB, true),
  };
  Object.values(legs).forEach((l) => root.add(l));

  // ---------- 头 ----------
  const headGroup = new THREE.Group();
  headGroup.name = 'head';
  // ★ 头的【中心】落在身体顶面上方，中间留一段"脖子"。
  //   没有脖子的话，头和身体顶面贴合，项圈/领巾只能挤在脸的下缘，
  //   看起来像"横在脸上的红条"。
  //   neckGap 就是给配饰留的脖子高度。
  const neckGap = (collarColor !== undefined || scarfColor !== undefined)
    ? headH * 0.30
    : headH * 0.08;
  const headLift = bodyH + neckGap + headH * 0.42;
  headGroup.position.set(0, hipY + headLift, bodyD * 0.5 + headD * 0.10);

  // 脖子：一根比头略细的方柱，把头和身体连起来
  headGroup.add(cube(
    bodyMat,
    headW * 0.62, neckGap + headH * 0.30, headD * 0.62,
    0, -headH * 0.5 - neckGap - headH * 0.30 + headH * 0.30, -headD * 0.06
  ));

  // 颅骨方块（以 headGroup 原点为中心）
  headGroup.add(cube(bodyMat, headW, headH, headD, 0, -headH / 2, 0));

  // 口鼻：往前伸出一块，浅色。
  // ★ 位置要卡在"脸的下半部但仍在头内"：
  //   头 y ∈ [-headH/2, +headH/2]，口鼻高 muzzleH。
  //   取底边 = -headH*0.38，则中心 = -headH*0.38 + muzzleH*0.5，
  //   不会掉到头底之外（之前 -0.62 时几乎和项圈同一高度）。
  headGroup.add(cube(
    muzzleMat,
    muzzleW, muzzleH, muzzleD,
    0, -headH * 0.38, headD * 0.42
  ));

  // 鼻头：小方块贴在口鼻前端
  headGroup.add(cube(
    noseMat,
    muzzleW * 0.42, muzzleH * 0.40, muzzleD * 0.34,
    0, -headH * 0.32, headD * 0.42 + muzzleD * 0.92
  ));

  // 眼睛：两个小方块，贴在颅骨正面两侧。
  // ★ 位置用"口鼻顶边"反推，保证永远在口鼻上方：
  //   口鼻底边 = -headH*0.38，顶边 = -headH*0.38 + muzzleH。
  //   眼睛底边放到顶边之上 0.02。
  const eyeMat = mat(0x241c18);
  const muzzleTop = -headH * 0.38 + muzzleH;
  for (const sx of [-1, 1]) {
    headGroup.add(cube(
      eyeMat,
      headW * 0.13, headH * 0.15, headD * 0.06,
      sx * headW * 0.26, muzzleTop + 0.02, headD * 0.48
    ));
  }

  // 猫：头顶的橘斑（参考图里额头一块橘色）
  if (patchOrange !== undefined) {
    headGroup.add(cube(
      mat(patchOrange),
      headW * 0.46, headH * 0.10, headD * 0.50,
      -headW * 0.16, headH * 0.46, -headD * 0.06
    ));
    // 侧脸深色斑
    headGroup.add(cube(
      mat(patchDark),
      headW * 0.30, headH * 0.30, headD * 0.30,
      headW * 0.36, headH * 0.10, -headD * 0.14
    ));
  }

  // 耳朵
  if (earStyle === 'erect') {
    // 猫：立方体立耳 + 内耳浅粉
    for (const sx of [-1, 1]) {
      const ear = new THREE.Mesh(
        new THREE.BoxGeometry(headW * 0.30, headH * 0.36, headD * 0.22),
        earMat
      );
      ear.position.set(sx * headW * 0.30, headH * 0.56, -headD * 0.04);
      ear.rotation.z = -sx * 0.10;
      ear.castShadow = true;
      headGroup.add(ear);

      const inner = new THREE.Mesh(
        new THREE.BoxGeometry(headW * 0.16, headH * 0.20, headD * 0.06),
        mat(0xf0b0b8)
      );
      inner.position.set(sx * headW * 0.30, headH * 0.55, headD * 0.06);
      inner.rotation.z = -sx * 0.10;
      headGroup.add(inner);
    }
  } else {
    // 狗：垂耳，扁方块挂在头两侧、往外撇（参考图里耳朵是明显的一块）
    for (const sx of [-1, 1]) {
      const ear = new THREE.Mesh(
        new THREE.BoxGeometry(headW * 0.20, headH * 0.62, headD * 0.40),
        earMat
      );
      ear.position.set(sx * headW * 0.55, headH * 0.02, -headD * 0.06);
      ear.rotation.z = -sx * 0.22;
      ear.castShadow = true;
      headGroup.add(ear);
    }
  }

  // ---------- 脖子上的配饰：猫项圈 / 狗领巾 ----------
  //
  // ★ 必须挂在【头下沿之下】（= 脖子），而且厚度要小、尺寸略大于头围。
  //   判据：头的 y 范围是 ±headH/2。配饰的顶边要从 -headH*0.5 以下开始，
  //   否则会横穿口鼻（之前放在 -0.52 时刚好压在脸下半部）。
  // ★ cube() 的 y 参数是【底面】，块会从 y 往上长 h。
  //   所以"顶边贴着头底"应该写成 y = neckTop - h。
  const neckTop = -headH * 0.5;      // 头底

  if (collarColor !== undefined) {
    // 猫：红色细项圈（顶边正好贴头底）
    const collarH = headH * 0.13;
    headGroup.add(cube(
      mat(collarColor),
      headW * 1.04, collarH, headD * 1.06,
      0, neckTop - collarH, 0
    ));
    if (bellColor !== undefined) {
      const bellH = headH * 0.16;
      headGroup.add(cube(
        mat(bellColor),
        headW * 0.18, bellH, headD * 0.12,
        0, neckTop - collarH - bellH * 0.7, headD * 0.52
      ));
    }
  }

  if (scarfColor !== undefined) {
    // 狗：橙色领巾（顶边贴头底，往下垂一块三角）
    const scarfMat = mat(scarfColor);
    const ringH = headH * 0.14;
    headGroup.add(cube(
      scarfMat,
      headW * 1.06, ringH, headD * 1.08,
      0, neckTop - ringH, 0
    ));
    // 前垂的三角：挂在环的下方
    const tipH = headH * 0.26;
    headGroup.add(cube(
      scarfMat,
      headW * 0.36, tipH, headD * 0.09,
      0, neckTop - ringH - tipH, headD * 0.46
    ));
  }

  root.add(headGroup);

  // ---------- 尾巴：分段方块，逐段变色做条纹 ----------
  // ★ 锚点：臀部后上角（身体顶面 × 尾端）。
  //   之前写 bodyH*0.86 时离顶面太近，加上尾巴第一节是向上翘的，
  //   视觉上像"从背上长出来"。改到 bodyH*0.62 并贴紧尾端 -bodyD*0.5。
  const tailGroup = new THREE.Group();
  tailGroup.name = 'tail';
  tailGroup.position.set(0, hipY + bodyH * 0.62, -bodyD * 0.5);

  // 条纹色：猫用橘/褐交替，狗用本体色（略微深浅）
  const stripe = [];
  for (let i = 0; i < tailSegs; i++) {
    if (patchOrange !== undefined) {
      stripe.push([patchOrange, patchDark, bodyColor][i % 3]);
    } else {
      stripe.push(i % 2 === 0 ? bodyColor : earColor);
    }
  }

  let parent = tailGroup;
  for (let i = 0; i < tailSegs; i++) {
    const seg = new THREE.Group();
    seg.rotation.x = i === 0 ? tailBase : tailCurve;
    // 尾巴逐段变细。宽度只取 size（不要 ×1.9，否则像柱子），
    // 段长也压到 2.2 倍，整体长度更接近参考图。
    const size = tailSize * (1 - i / (tailSegs + 1.8));
    const len = tailSize * 2.2;
    const m = new THREE.Mesh(new THREE.BoxGeometry(size, len, size), mat(stripe[i]));
    m.position.y = len * 0.5;
    m.castShadow = true;
    seg.add(m);
    const next = new THREE.Group();
    next.position.y = len;
    seg.add(next);
    parent.add(seg);
    parent = next;
  }

  root.add(tailGroup);

  // ---------- 动画 ----------
  root.userData.parts = { bodyGroup, headGroup, legs, tailGroup, hipY };
  root.userData.headLift = headLift;
  root.userData.animate = (t, state) => {
    const { walk = 0, graze = 0, phase = 0, speed = 1 } = state;
    const strideLen = legLen * 1.1;
    const stepFreq = Math.max(0.8, speed / strideLen) * Math.PI * 2;
    const swing = 0.5 * walk;

    const s = Math.sin(t * stepFreq + phase);
    const s2 = Math.sin(t * stepFreq + phase + Math.PI);

    // 对角步态
    for (const [key, ph] of [['fl', s], ['br', s], ['fr', s2], ['bl', s2]]) {
      legs[key].rotation.x = ph * swing;
    }

    // 身体起伏 + 轻微侧摆
    const bob = Math.abs(Math.sin(t * stepFreq * 0.5 + phase)) * 0.035 * walk;
    bodyGroup.position.y = hipY + bob;
    bodyGroup.rotation.z = Math.sin(t * stepFreq * 0.5 + phase) * 0.026 * walk;

    // 头：走路轻点头，吃草低头
    const headBob = Math.sin(t * stepFreq * 0.5 + phase) * 0.045 * walk;
    headGroup.rotation.x = headBob - graze * 0.95;
    headGroup.position.y = hipY + headLift - graze * 0.16;

    // 尾巴：猫摆得慢而小，狗摇得快
    const wag = tailSegs >= 5 ? 0.12 + walk * 0.10 : 0.24 + walk * 0.28;
    tailGroup.rotation.z = Math.sin(t * (2.0 + walk * 2.6) + phase) * wag;
    tailGroup.rotation.x = Math.sin(t * 1.5 + phase) * 0.06;
  };

  return root;
}
function makeDog() {
  const root = makePetRig(DOG);
  root.name = 'dog';
  // 舌头（吃东西时伸出来）：挂在头节点下，位置对齐口鼻下沿
  const tongue = new THREE.Mesh(
    new THREE.BoxGeometry(DOG.muzzleW * 0.5, DOG.muzzleH * 0.32, 0.09),
    toonLambert({ color: 0xe8788a, flatShading: true })
  );
  tongue.position.set(0, -DOG.headH * 0.72, DOG.headD * 0.5 + DOG.muzzleD * 0.75);
  tongue.visible = false;
  root.userData.parts.headGroup.add(tongue);
  root.userData.tongue = tongue;
  return root;
}

function makeCat() {
  const root = makePetRig(CAT);
  root.name = 'cat';
  // 胡须：参考图里是从口鼻两侧伸出的三根细棍，左右各三根、略微上扬
  const whiskerMat = toonLambert({ color: 0xfaf4e8, flatShading: true });
  const head = root.userData.parts.headGroup;
  const wz = CAT.headD * 0.5 + CAT.muzzleD * 0.6;
  const wy = -CAT.headH * 0.50;
  const wx = CAT.muzzleW * 0.5;
  for (const sx of [-1, 1]) {
    for (let i = 0; i < 3; i++) {
      const w = new THREE.Mesh(
        new THREE.BoxGeometry(0.085, 0.008, 0.008),
        whiskerMat
      );
      w.position.set(sx * (wx + 0.042), wy + (i - 1) * 0.022, wz);
      w.rotation.z = sx * (0.12 + i * 0.14);
      w.rotation.y = sx * 0.30;
      head.add(w);
    }
  }
  return root;
}

// ---------------------------------------------------------------------------
// 睡姿 / 进食姿势
//
// makeQuadruped 自带的 animate 只处理 walk / graze，
// 这里在它跑完之后再覆盖几个骨骼，得到"趴下"和"啃东西"。
// ---------------------------------------------------------------------------
function poseSleep(root, amount) {
  if (amount < 0.001) return;
  const p = root.userData.parts;
  const a = amount;

  // 身体压到接近地面。
  // ★ 方块骨架的腿只有 legLen 高、并且整条腿随髋关节旋转，
  //   所以"趴下"时身体底面要落在腿根附近（约 legLen*0.35），
  //   再低就会把身体压进地面（实测 0.05 的穿地）。
  const lie = p.hipY * 0.35;
  p.bodyGroup.position.y = p.hipY + (lie - p.hipY) * a;

  // 四条腿向内收（方块风没有膝关节，整条腿绕髋转）
  for (const key of ['fl', 'fr']) {
    p.legs[key].rotation.x = -1.15 * a;
  }
  for (const key of ['bl', 'br']) {
    p.legs[key].rotation.x = 1.05 * a;
  }

  // 头低下去，搁在前爪上
  // ★ 新骨架的 headGroup 初始 y 是 hipY + headLift（不再固定 bodyH*0.35），
  //   所以要用 root.userData.headLift 反推，否则趴下时头会悬在半空。
  const lift = root.userData.headLift || p.hipY * 0.4;
  // 头落到"趴下后的身体顶面之上"，不能低于地面。
  // ★ 实测 headY 落到 hipY*0.62 时，头部最低点会低于地面 0.063，
  //   所以抬到 0.78，并减小低头角度。
  p.headGroup.position.y = p.hipY + lift + (p.hipY * 0.78 - (p.hipY + lift)) * a;
  p.headGroup.rotation.x = 0.22 * a;

  // 尾巴贴地
  p.tailGroup.rotation.x = 0.9 * a;
  p.tailGroup.rotation.z = 0;
}

function poseEat(root, amount, t) {
  if (amount < 0.001) return;
  const p = root.userData.parts;
  const a = amount;

  // 低头（比吃草更彻底），带小幅上下点动
  const nibble = Math.sin(t * 6.5) * 0.10 * a;
  const lift = root.userData.headLift || p.hipY * 0.4;
  p.headGroup.rotation.x = 0.95 * a + nibble;
  p.headGroup.position.y = p.hipY + lift - 0.18 * a;

  // 前腿微微岔开支撑
  p.legs.fl.rotation.x = 0.18 * a;
  p.legs.fr.rotation.x = 0.18 * a;
  if (p.legs.fl.userData.knee) p.legs.fl.userData.knee.rotation.x = 0.05 + 0.10 * a;
  if (p.legs.fr.userData.knee) p.legs.fr.userData.knee.rotation.x = 0.05 + 0.10 * a;
}

// ---------------------------------------------------------------------------
// 活动范围检查：不能走进建筑/田地/围栏/干草堆
// ---------------------------------------------------------------------------
function makeWalkable(pad) {
  return (x, z) => {
    for (const b of Object.values(BUILDINGS)) {
      const r = b.r ?? Math.max(b.w ?? 0, b.d ?? 0) * 0.5;
      if (Math.hypot(x - b.x, z - b.z) < r + pad) return false;
    }
    for (const st of STONE_COLLIDERS) {
      if (Math.hypot(x - st.x, z - st.z) < st.r + pad) return false;
    }
    for (const f of FIELD_RECTS) {
      const cos = Math.cos(-f.rot), sin = Math.sin(-f.rot);
      const dx = x - f.x, dz = z - f.z;
      const lx = dx * cos - dz * sin;
      const lz = dx * sin + dz * cos;
      if (Math.abs(lx) < f.w / 2 + pad && Math.abs(lz) < f.d / 2 + pad) return false;
    }
    for (const poly of [PASTURE, COOP, HORSE_PASTURE]) {
      if (pointInPolygon(x, z, poly)) return false;
      if (distToPolygonEdge(x, z, poly) < pad) return false;
    }
    for (const [hx, hz, hr] of HAY_BALES) {
      if (Math.hypot(x - hx, z - hz) < hr + pad) return false;
    }
    return true;
  };
}

// ---------------------------------------------------------------------------
// 主构建
// ---------------------------------------------------------------------------
export function buildPets(model, rng) {
  const group = new THREE.Group();
  group.name = 'pets';

  const list = [];

  // 狗在农舍附近，猫在谷仓/木材堆一带（各自有活动中心）
  const SPECS = [
    { make: makeDog, kind: 'dog', name: DOG.name, cx: 22, cz: -14, r: 14, speed: 1.5, scale: 1.0 },
    { make: makeCat, kind: 'cat', name: CAT.name, cx: -20, cz: -18, r: 12, speed: 1.15, scale: 1.0 },
  ];

  for (const spec of SPECS) {
    const pet = spec.make();
    pet.userData.petName = spec.name;
    pet.userData.petKind = spec.kind;

    const isWalkable = makeWalkable(spec.kind === 'dog' ? 0.9 : 0.7);

    // 找一个合法的出生点
    let sx = spec.cx, sz = spec.cz;
    for (let i = 0; i < 40; i++) {
      const a = rng.next() * Math.PI * 2;
      const rr = Math.sqrt(rng.next()) * spec.r;
      const x = spec.cx + Math.cos(a) * rr;
      const z = spec.cz + Math.sin(a) * rr;
      if (isWalkable(x, z)) { sx = x; sz = z; break; }
    }

    pet.userData = {
      ...pet.userData,
      homeX: spec.cx,
      homeZ: spec.cz,
      homeR: spec.r,
      x: sx, z: sz,
      targetX: sx, targetZ: sz,
      heading: rng.next() * Math.PI * 2,
      phase: rng.next() * 6.28,
      speed: spec.speed,
      state: ST_WALK,
      // 初始错开：狗先走，猫先睡
      stateTimer: spec.kind === 'dog' ? 4 + rng.next() * 3 : 2 + rng.next() * 2,
      walkAmount: 0,
      sleepAmount: spec.kind === 'dog' ? 0 : 1,
      eatAmount: 0,
      isWalkable,
      // 特写时叫一声
      speakTimer: 0,
      // 被点开特写时：站着面向镜头叫（hud 写入角度，倒计时结束恢复自由行动）
      faceTimer: 0,
      faceHeading: 0,
    };

    pet.position.set(sx, model.heightAt(sx, sz), sz);
    group.add(pet);
    list.push(pet);
  }

  // -------------------------------------------------------------------------
  // 状态切换：按权重随机
  //   狗：走 55% / 睡 20% / 吃 25%
  //   猫：走 40% / 睡 40% / 吃 20%（猫更能睡）
  // -------------------------------------------------------------------------
  const pickState = (kind) => {
    const r = rng.next();
    if (kind === 'dog') {
      if (r < 0.55) return ST_WALK;
      if (r < 0.75) return ST_SLEEP;
      return ST_EAT;
    }
    if (r < 0.40) return ST_WALK;
    if (r < 0.80) return ST_SLEEP;
    return ST_EAT;
  };

  const stateDuration = (state) => {
    if (state === ST_WALK) return 4 + rng.next() * 6;
    if (state === ST_SLEEP) return 8 + rng.next() * 12;
    return 3 + rng.next() * 5;
  };

  const pickTarget = (u) => {
    for (let tries = 0; tries < 24; tries++) {
      const a = rng.next() * Math.PI * 2;
      const rr = Math.sqrt(rng.next());
      const x = u.homeX + Math.cos(a) * u.homeR * rr;
      const z = u.homeZ + Math.sin(a) * u.homeR * rr;
      if (!u.isWalkable(x, z)) continue;
      if (Math.hypot(x - u.x, z - u.z) < 3) continue;
      return { x, z };
    }
    return null;
  };

  group.userData.update = (t, dt) => {
    const step = Math.min(dt, 0.05);

    for (const pet of list) {
      const u = pet.userData;
      u.stateTimer -= step;

      // ---------- 状态切换 ----------
      if (u.stateTimer <= 0) {
        const next = pickState(u.petKind);
        u.state = next;
        u.stateTimer = stateDuration(next);
        if (next === ST_WALK) {
          const tgt = pickTarget(u);
          if (tgt) { u.targetX = tgt.x; u.targetZ = tgt.z; }
        }
      }

      // ---------- 面向镜头（被点开特写时）----------
      // 这段时间里它站着不动、把身体转向相机，叫完再继续自己的事。
      const facing = u.faceTimer > 0;
      if (facing) u.faceTimer -= step;

      // ---------- 姿态权重平滑 ----------
      const targetWalk = (u.state === ST_WALK && !facing) ? 1 : 0;
      const targetSleep = u.state === ST_SLEEP ? 1 : 0;
      const targetEat = u.state === ST_EAT ? 1 : 0;

      u.walkAmount += (targetWalk - u.walkAmount) * Math.min(1, step * 3.5);
      u.sleepAmount += (targetSleep - u.sleepAmount) * Math.min(1, step * 2.2);
      u.eatAmount += (targetEat - u.eatAmount) * Math.min(1, step * 3.0);

      // ---------- 面向镜头 ----------
      if (facing) {
        let diff = u.faceHeading - u.heading;
        while (diff > Math.PI) diff -= Math.PI * 2;
        while (diff < -Math.PI) diff += Math.PI * 2;
        u.heading += diff * Math.min(1, step * 6);
      }

      // ---------- 移动 ----------
      if (!facing && u.state === ST_WALK) {
        const dx = u.targetX - u.x;
        const dz = u.targetZ - u.z;
        const dist = Math.hypot(dx, dz);

        if (dist < 0.9) {
          // 到了就换个目标，避免原地抖动
          const tgt = pickTarget(u);
          if (tgt) { u.targetX = tgt.x; u.targetZ = tgt.z; }
          else { u.stateTimer = Math.min(u.stateTimer, 0.6); }
        } else {
          const nx = dx / dist;
          const nz = dz / dist;
          const nextX = u.x + nx * u.speed * step;
          const nextZ = u.z + nz * u.speed * step;
          if (u.isWalkable(nextX, nextZ)) {
            u.x = nextX;
            u.z = nextZ;
            const targetHeading = Math.atan2(nx, nz);
            let diff = targetHeading - u.heading;
            while (diff > Math.PI) diff -= Math.PI * 2;
            while (diff < -Math.PI) diff += Math.PI * 2;
            u.heading += diff * Math.min(1, step * 5);
          } else {
            const tgt = pickTarget(u);
            if (tgt) { u.targetX = tgt.x; u.targetZ = tgt.z; }
            u.stateTimer = Math.min(u.stateTimer, 1.0);
          }
        }
      }

      // ---------- 应用位置 ----------
      pet.position.set(u.x, model.heightAt(u.x, u.z), u.z);
      pet.rotation.y = u.heading;

      // ---------- 动画 ----------
      if (pet.userData.animate) {
        pet.userData.animate(t, {
          walk: u.walkAmount,
          phase: u.phase,
          speed: 1,
          graze: 0,
        });
      }
      // 在基础动画之上叠加睡姿 / 进食
      poseSleep(pet, u.sleepAmount);
      poseEat(pet, u.eatAmount, t);

      // 睡觉时整只趴着，贴地一点点
      pet.position.y -= u.sleepAmount * 0.06;

      // 舌头：只有吃东西时伸出来
      if (pet.userData.tongue) {
        pet.userData.tongue.visible = u.eatAmount > 0.35;
      }

      // 猫的尾巴慢慢摆（猫尾巴和狗尾巴的摆动幅度不同）
      if (u.petKind === 'cat' && u.sleepAmount < 0.5) {
        const tail = pet.userData.parts.tailGroup;
        tail.rotation.z = Math.sin(t * 1.4 + u.phase) * 0.28;
      }

      // 特写时的叫声窗口（由 hud 设置 speakTimer）
      if (u.speakTimer > 0) u.speakTimer -= step;
    }
  };

  group.userData.list = list;
  group.userData.count = list.length;

  // 供 hud 查询：这只宠物现在是不是在走
  group.userData.isWalking = (pet) => {
    const u = pet && pet.userData;
    return !!u && u.state === ST_WALK && u.sleepAmount < 0.35;
  };
  group.userData.stateName = (pet) => {
    const u = pet && pet.userData;
    return u ? STATE_NAME[u.state] : 'walk';
  };
  // hud 点开特写时调用：让宠物停下、转身面向镜头（keep 秒后恢复）
  group.userData.faceCamera = (pet, heading, keep = 2.6) => {
    const u = pet && pet.userData;
    if (!u) return;
    u.faceHeading = heading;
    u.faceTimer = keep;
  };

  return group;
}
