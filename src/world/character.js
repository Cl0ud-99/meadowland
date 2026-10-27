import * as THREE from 'three';
import { box, cyl, cone, tint, meshFrom } from '../util/geo.js';
import { toonLambert } from '../render/toon.js';

// ---------------------------------------------------------------------------
// 程序化角色动画（无需骨骼）
//
// 低多边形风格的标准做法：把角色拆成几个**独立可旋转的部件**，
// 用正弦函数驱动关节角度，而不是引入骨骼系统。
//
// 结构：
//   root（整体位置/朝向）
//    ├─ body（身体，上下起伏）
//    ├─ head（头部，可点头/摆动）
//    ├─ legFL / legFR / legBL / legBR（四条腿，绕髋关节摆动）
//    └─ tail（尾巴，左右摇摆）
//
// 每条腿的几何都以**髋关节为原点**建模，这样 rotation.x 就是自然的摆腿。
// ---------------------------------------------------------------------------

// ---------------------------------------------------------------------------
// 通用：把一组几何合并成一个以关节为原点的网格
// ---------------------------------------------------------------------------
function limbMesh(parts, castShadow = true) {
  return meshFrom(parts, { castShadow });
}

// ---------------------------------------------------------------------------
// 四足动物（牛 / 羊 / 马 / 羊驼）—— 体素方块风
//
// 按用户给的参考图重构：整体是"方块拼装 + 大量装饰件"：
//   牛   黑白花斑、粉色方鼻、红项圈金铃、粉色乳房、黑蹄、小角
//   羊   蓬松奶油毛（身体略圆）、粉色方脸、小灰角、红项圈金铃、深色蹄
//   马   枣红、黑鬃毛（一排方块）、白额头、鞍具（鞍座+肚带+马镫）、
//        红项圈金铃、黑蹄
//   羊驼 奶油绒毛、长脖子、小头、彩纹鞍布（红蓝黄）+ 流苏、红项圈金铃
//
// 与旧版的区别：
//   · 身体是纯方块，不做球体；羊用"略圆一点的方块 + 角上的小方块凸起"
//   · 头是方块 + 前伸的方形口鼻，鼻子是独立的粉色方块
//   · 耳朵是横向的方块薄片（参考图里耳朵是水平伸出的）
//   · 腿是直立方柱，末端一小块深色蹄子
//   · 新增：项圈 + 铃铛、牛乳房、马鞍具、羊驼鞍布（用 extraNeck / extraBody 注入）
// ---------------------------------------------------------------------------
export function makeQuadruped(cfg) {
  const {
    bodyW, bodyH, bodyD,
    bodyColor, patchColor, patchSlots = [],
    headColor, muzzleColor, hornColor, horned = true,
    legColor, legLen, legW,
    tailColor,
    headSize = 0.9, muzzleSize = 0.75,
    ears = true,
    wool = false,
    extraParts = null,
    // ---- 新增可选：体素装饰件 ----
    noseColor = null,          // 粉色方鼻（牛/羊/羊驼）
    hoofColor = 0x3a3330,      // 蹄子颜色
    collarColor = null,        // 项圈
    bellColor = null,          // 铃铛
    udderColor = null,         // 乳房（牛）
    saddleColor = null,        // 鞍具（马）
    saddleStrapColor = null,   // 肚带
    blanketColors = null,      // 鞍布配色数组（羊驼）
    earStyle = 'side',         // 'side' 水平伸出 / 'up' 竖起
    maneColor = null,          // 鬃毛（马）
    tailStyle = 'tuft',        // 'tuft' 末端毛球 / 'plain'
    neckLen = 0,               // 脖子长度（羊驼/马）
  } = cfg;

  const root = new THREE.Group();
  root.name = 'animal';

  const hipY = legLen;

  // ---------- 身体 ----------
  const bodyGroup = new THREE.Group();
  bodyGroup.name = 'body';
  bodyGroup.position.y = hipY;

  const bodyParts = [];
  if (wool) {
    // 羊：主方块 + 少量凸起。
    //
    // ★ 不要再堆密集毛团（试过 1 主团 + 7 小团，正面看是一团乱毛，
    //   反而没有低多边形的干净感）。参考图里的羊也是"一块身体 + 几处起伏"，
    //   这里保留 1 个主方块 + 4 个顶部凸起，足够读成"羊毛蓬松"。
    bodyParts.push(box(bodyW, bodyH, bodyD, bodyColor, 0, 0, 0));
    const bump = Math.min(bodyW, bodyH, bodyD) * 0.26;
    const bumpList = [
      [-bodyW * 0.28, bodyH * 0.94, -bodyD * 0.26],
      [bodyW * 0.28, bodyH * 0.94, bodyD * 0.24],
      [0, bodyH * 1.00, 0],
      [0, bodyH * 0.92, -bodyD * 0.42],
    ];
    for (const [bx, by, bz] of bumpList) {
      bodyParts.push(box(bump * 1.7, bump * 1.1, bump * 1.7, bodyColor, bx, by - bump * 0.55, bz));
    }
  } else {
    bodyParts.push(box(bodyW, bodyH, bodyD, bodyColor, 0, 0, 0));
    // 花斑：略凸出身体表面的薄片
    for (const slot of patchSlots) {
      bodyParts.push(box(bodyW + 0.05, slot.h, slot.d, patchColor, 0, slot.y, slot.z));
    }
  }
  if (extraParts) extraParts.forEach((p) => bodyParts.push(p));

  // 牛：乳房（腹部下方偏后，粉色，四个小方块）
  if (udderColor !== null) {
    const uy = -bodyH * 0.12;
    bodyParts.push(box(bodyW * 0.34, bodyH * 0.30, bodyD * 0.26, udderColor, 0, uy, -bodyD * 0.14));
    const teat = Math.min(bodyW, bodyD) * 0.055;
    for (const sx of [-1, 1]) {
      for (const sz of [-1, 1]) {
        bodyParts.push(box(teat, teat * 1.4, teat, udderColor, sx * bodyW * 0.10, uy - teat * 1.35, -bodyD * 0.14 + sz * bodyD * 0.06));
      }
    }
  }

  // 马：鞍具（鞍座 + 两侧鞍翼 + 肚带 + 马镫）
  if (saddleColor !== null) {
    const sy = bodyH * 0.98;
    bodyParts.push(box(bodyW * 0.72, bodyH * 0.16, bodyD * 0.30, saddleColor, 0, sy, -bodyD * 0.02));
    // 鞍座前沿翘起
    bodyParts.push(box(bodyW * 0.60, bodyH * 0.20, bodyD * 0.10, saddleColor, 0, sy + bodyH * 0.14, bodyD * 0.12));
    // 两侧鞍翼
    for (const sx of [-1, 1]) {
      bodyParts.push(box(bodyW * 0.06, bodyH * 0.42, bodyD * 0.26, saddleColor, sx * bodyW * 0.5, bodyH * 0.62, -bodyD * 0.02));
    }
    // 肚带（从鞍下绕到腹部的细带）
    if (saddleStrapColor !== null) {
      bodyParts.push(box(bodyW * 1.02, bodyH * 0.10, bodyD * 0.08, saddleStrapColor, 0, -bodyH * 0.02, -bodyD * 0.02));
      // 马镫
      for (const sx of [-1, 1]) {
        bodyParts.push(box(bodyW * 0.05, bodyH * 0.16, bodyD * 0.05, saddleStrapColor, sx * bodyW * 0.54, bodyH * 0.30, -bodyD * 0.02));
      }
    }
  }

  // 羊驼：彩纹鞍布（多层色带 + 两侧流苏）
  //
  // ★ box() 的 y 是【底边】，所以"叠层"必须往下走（负偏移），
  //   否则会一路往上长、从身体顶面飞出去（之前头顶那根黑条就是它）。
  //   顶层贴身体顶面，下面几层依次往下，形成垂在两侧的布。
  if (blanketColors) {
    const [c1, c2, c3] = blanketColors;
    const topY = bodyH - bodyH * 0.02;    // 顶层面 = 身体顶面略下
    // 主布面（盖住背部）
    bodyParts.push(box(bodyW * 1.03, bodyH * 0.10, bodyD * 0.50, c1, 0, topY - bodyH * 0.10, -bodyD * 0.04));
    // 两侧垂下的布（蓝 / 黄色带）
    for (const sx of [-1, 1]) {
      bodyParts.push(box(bodyW * 0.05, bodyH * 0.34, bodyD * 0.50, c2, sx * bodyW * 0.515, topY - bodyH * 0.34, -bodyD * 0.04));
      bodyParts.push(box(bodyW * 0.06, bodyH * 0.10, bodyD * 0.50, c3, sx * bodyW * 0.52, topY - bodyH * 0.42, -bodyD * 0.04));
      // 流苏（挂在蓝布下缘）
      const fr = bodyW * 0.030;
      for (let i = 0; i < 5; i++) {
        const fz = -bodyD * 0.04 + (i - 2) * bodyD * 0.10;
        bodyParts.push(box(fr, bodyH * 0.14, fr, c1, sx * bodyW * 0.52, topY - bodyH * 0.52, fz));
      }
    }
  }

  bodyGroup.add(limbMesh(bodyParts));
  root.add(bodyGroup);

  // ---------- 脖子（羊驼 / 马）----------
  // 参考图里羊驼是"长脖子 + 小头"，马是"斜上的粗脖子"。
  const neckGroup = new THREE.Group();
  neckGroup.name = 'neck';
  // 脖子根部 = 身体顶面稍下（保证和身体接上）
  const neckBaseY = hipY + bodyH * 0.62;
  neckGroup.position.set(0, neckBaseY, bodyD * 0.42);
  const neckParts = [];
  if (neckLen > 0) {
    // 脖子本体：一段竖直方柱。
    // ★ 必须比头【细】：之前用 bodyW*0.52，羊驼 bodyW=0.95 → 0.49 宽，
    //   而头只有 0.52 宽，两者几乎一样粗，头完全被脖子吞掉。
    //   现在脖子只用 0.34*bodyW，头明显比脖子宽，轮廓才读得出来。
    const nh = neckLen;
    const nw = bodyW * 0.34;
    const nd = bodyD * 0.30;
    neckParts.push(box(nw, nh, nd, bodyColor, 0, 0, 0));
    // 绒毛：脖子根部略粗（和身体衔接），往上收窄
    if (wool) {
      neckParts.push(box(nw * 1.5, nh * 0.42, nd * 1.5, bodyColor, 0, 0, 0));
    }
  }
  if (neckParts.length) neckGroup.add(limbMesh(neckParts));
  root.add(neckGroup);

  // ---------- 头 ----------
  const headGroup = new THREE.Group();
  headGroup.name = 'head';
  // 有脖子时头架在脖子【顶端】；否则直接贴在身体前上方。
  //
  // ★ 必须用 neckBaseY + neckLen 这个绝对方程，不能再用 hipY 推算 ——
  //   脖子的组 y 是 neckBaseY，方块从组原点往上长 neckLen，
  //   所以脖子顶面 = neckBaseY + neckLen。
  //   头底落在那个高度即可（颅骨从 y=0 起画，就是头的世界底边）。
  const neckTopY = neckBaseY + neckLen;
  const headBaseY = neckLen > 0 ? neckTopY : hipY + bodyH * 0.42;
  const headGroupZ0 = bodyD * 0.42 + (neckLen > 0 ? bodyD * 0.10 : 0.10);
  headGroup.position.set(0, headBaseY, headGroupZ0);

  const headParts = [];
  // 颅骨（方块）
  headParts.push(box(headSize, headSize * 0.92, headSize * 1.0, headColor, 0, 0, 0));

  // 口鼻：从脸的下半部前伸的一块。
  // ★ 高度别超过头高的一半，宽度别超过头的 0.8 倍 ——
  //   否则正面看就是"一整块粉色平面盖住脸"。
  const muzzleH2 = Math.min(muzzleSize, headSize * 0.55) * 0.62;
  const muzzleY = -headSize * 0.16;          // 底边位置（box 的 y 是底边）
  headParts.push(box(
    Math.min(muzzleSize, headSize * 0.82), muzzleH2, headSize * 0.34,
    muzzleColor, 0, muzzleY, headSize * 0.46
  ));

  // 鼻子：独立的粉色/深色方块，贴在口鼻前端
  if (noseColor !== null) {
    headParts.push(box(
      Math.min(muzzleSize, headSize * 0.82) * 0.74, muzzleH2 * 0.72, headSize * 0.12,
      noseColor, 0, muzzleY + muzzleH2 * 0.10, headSize * 0.46 + headSize * 0.30
    ));
  }

  // 眼睛：已按用户要求移除（牛/羊/羊驼都不画眼睛）。
  // 低多边形动物头上的两颗深色小方块，近景看像"两个洞"，
  // 远看也只是脏点，反而降低质感 —— 靠头部朝向表达神态就够了。

  // 耳朵
  if (ears) {
    if (earStyle === 'up') {
      // 竖起（羊驼 / 马）：短粗的方块耳，带一点内耳浅色。
      // ★ 之前 headSize*0.52 高、0.20 宽 —— 又细又长，像两根天线。
      //   参考图里是"短而宽"的小方耳。
      for (const sx of [-1, 1]) {
        headParts.push(box(headSize * 0.24, headSize * 0.34, headSize * 0.20, patchColor, sx * headSize * 0.30, headSize * 0.88, -headSize * 0.02));
        headParts.push(box(headSize * 0.12, headSize * 0.18, headSize * 0.06, muzzleColor, sx * headSize * 0.30, headSize * 0.92, headSize * 0.08));
      }
    } else {
      // 水平伸出（牛/羊）：方块薄片，从头的两侧往外伸。
      // ★ 中心必须超出头的半宽（headSize*0.5），否则整只耳朵埋在头里。
      //   之前中心在 0.52+0.28=0.80 倍，长度只有 0.62 —— 外端 1.11 倍、
      //   内端 0.49 倍，内端刚好在头内，看起来像"贴了个小片"。
      for (const sx of [-1, 1]) {
        const earW = headSize * 0.48;
        const earX = sx * (headSize * 0.50 + earW * 0.42);
        headParts.push(box(earW, headSize * 0.22, headSize * 0.36, patchColor, earX, headSize * 0.50, -headSize * 0.02));
        // 耳朵内侧浅色
        headParts.push(box(earW * 0.55, headSize * 0.10, headSize * 0.20, muzzleColor, earX, headSize * 0.55, headSize * 0.06));
      }
    }
  }

  // 角（小方块，参考图里是短短的两截）
  if (horned) {
    for (const sx of [-1, 1]) {
      headParts.push(box(headSize * 0.13, headSize * 0.34, headSize * 0.13, hornColor, sx * headSize * 0.34, headSize * 0.86, -headSize * 0.10));
    }
  }

  // 马鬃：沿脖子【后缘】一排方块，从头顶一直垂到脖子根。
  //   z 用负值（脖子后方），y 从头顶往下排。
  if (maneColor !== null) {
    const mn = Math.max(4, Math.round(neckLen * 5));
    for (let i = 0; i < mn; i++) {
      const k = i / (mn - 1 || 1);
      headParts.push(box(
        headSize * 0.20, headSize * 0.26, headSize * 0.34,
        0,
        headSize * 0.62 - k * (neckLen + headSize * 0.55),
        -headSize * 0.52
      ));
    }
  }

  headGroup.add(limbMesh(headParts));

  // 项圈 + 铃铛（参考图里非常显眼，挂在头下方的脖子上）
  if (collarColor !== null) {
    const collarParts = [];
    collarParts.push(box(headSize * 1.14, headSize * 0.13, headSize * 0.92, collarColor, 0, -headSize * 0.14, 0));
    if (bellColor !== null) {
      collarParts.push(box(headSize * 0.26, headSize * 0.26, headSize * 0.18, bellColor, 0, -headSize * 0.40, headSize * 0.40));
    }
    const collar = limbMesh(collarParts);
    collar.name = 'collar';
    headGroup.add(collar);
  }

  root.add(headGroup);

  // -------------------------------------------------------------------------
  // 量一次"头底相对 headGroup 原点"的偏移
  //
  // ★ 吃草时头要低到贴近地面，但下压量不能靠公式估算 ——
  //   每种动物的头型（有没有角、鬃毛、长吻）都不一样，
  //   实测牛的头底在原点下方 0.79、羊驼 0.62、羊 0.23。
  //   这里在构建时用几何包围盒直接量出来，
  //   animate 里就能算出"要让头底落到地面上方 0.12，headGroup 该降多少"。
  // -------------------------------------------------------------------------
  let headBottomLocal = 0;
  {
    headGroup.updateMatrixWorld(true);
    const box3 = new THREE.Box3().setFromObject(headGroup);
    // headGroup.position.y 是它在 root 里的高度，box3.min.y 是世界高度，
    // 两者相减 = 头底相对 headGroup 原点的偏移（负数）
    headBottomLocal = box3.min.y - headGroup.position.y;
  }

  // ---------- 四条腿 ----------
  const makeLeg = (x, z) => {
    const g = new THREE.Group();
    g.name = 'leg';
    g.position.set(x, hipY, z);
    const parts = [];
    parts.push(box(legW, legLen, legW, legColor, 0, -legLen, 0));
    // 蹄子：底部一小块深色
    parts.push(box(legW * 1.12, legW * 0.42, legW * 1.12, hoofColor, 0, -legLen, 0));
    g.add(limbMesh(parts));
    return g;
  };

  const legX = bodyW / 2 * 0.66;
  const legZ = bodyD / 2 * 0.60;
  const legs = {
    fl: makeLeg(-legX, legZ),
    fr: makeLeg(legX, legZ),
    bl: makeLeg(-legX, -legZ),
    br: makeLeg(legX, -legZ),
  };
  Object.values(legs).forEach((l) => root.add(l));

  // ---------- 尾巴 ----------
  const tailGroup = new THREE.Group();
  tailGroup.name = 'tail';
  tailGroup.position.set(0, hipY + bodyH * 0.72, -bodyD / 2 - 0.03);
  const tailParts = [box(0.10, bodyH * 0.62, 0.10, tailColor, 0, -bodyH * 0.62, 0)];
  if (tailStyle === 'tuft') {
    // 末端毛球（牛/马/羊驼参考图都有）
    tailParts.push(box(0.22, 0.26, 0.22, tailColor, 0, -bodyH * 0.62 - 0.10, 0));
  }
  tailGroup.add(limbMesh(tailParts));
  root.add(tailGroup);

  // ---------- 动画接口 ----------
  root.userData.parts = { bodyGroup, headGroup, legs, tailGroup, hipY };
  root.userData.animate = (t, state) => {
    const { walk = 0, graze = 0, phase = 0, speed = 1, stride = 1.1 } = state;

    const strideLen = legLen * stride;
    const stepFreq = Math.max(0.8, speed / strideLen) * Math.PI * 2;
    const swing = 0.55 * walk;

    const s = Math.sin(t * stepFreq + phase);
    const s2 = Math.sin(t * stepFreq + phase + Math.PI);

    legs.fl.rotation.x = s * swing;
    legs.br.rotation.x = s * swing;
    legs.fr.rotation.x = s2 * swing;
    legs.bl.rotation.x = s2 * swing;

    const bob = Math.abs(Math.sin(t * stepFreq * 0.5 + phase)) * 0.055 * walk;
    bodyGroup.position.y = hipY + bob;
    bodyGroup.rotation.z = Math.sin(t * stepFreq * 0.5 + phase) * 0.03 * walk;

    const headBob = Math.sin(t * stepFreq * 0.5 + phase) * 0.06 * walk;
    // ★ 符号必须是【正】：模型正面是 +Z，绕 X 轴正旋转会把 +Z 往下转。
    //   实测同一个头：rotationX=+0.5 → 鼻尖 y 从 0.61 降到 0.25；
    //                rotationX=-0.5 → 鼻尖 y 升到 0.95。
    //   之前写成 - graze*0.75，三种动物吃草全都在【抬头看天】。
    headGroup.rotation.x = headBob + graze * 0.75;
    // ★ 吃草下压量 = 从站立高度降到"头底几乎贴地"所需的距离。
    //
    //   之前用 headSize*1.6 做上限，对羊驼（headSize=0.56）只能降 0.90，
    //   而它的头站立时离地 1.97 —— 低头后离地还有 1.32，根本够不到草。
    //
    //
    //   用构建时实测的 headBottomLocal（头底相对原点，负数）：
    //   站立时头底高度 = headBaseY + headBottomLocal
    //   想让头底落到地面上方 headSize*0.12 处 →
    //   下压量 = (headBaseY + headBottomLocal) - headSize*0.12
    const wantHeadBottom = headSize * 0.12;
    const grazeDrop = Math.max(0, (headBaseY + headBottomLocal) - wantHeadBottom);
    headGroup.position.y = headBaseY - graze * grazeDrop;

    // ★ 低头时略微前伸，避免头埋进胸腔；
    //   但幅度要小 —— headSize*0.70 会让长脖动物（羊驼）的头
    //   跑到身体前面一大段，看起来像"头飞出去了"。0.22 刚好。
    headGroup.position.z = headGroupZ0 + graze * headSize * 0.22;

    // ★ 脖子必须跟着低头 —— 否则头降下去了、脖子还直挺挺竖在原地，
    //   两者直接断开（羊驼最明显：头跑到腿边，脖子还在半空）。
    //
    //   做法：脖子绕【根部】往前下方转，同时缩短一点（转 90° 后
    //   原来竖直的柱子就变成水平伸出，视觉上"脖子伸出去低头吃草"）。
    //   转角 = graze * 0.85 rad（约 49°），缩放 y 到 1 - graze*0.18。
    if (neckLen > 0) {
      // ★ 脖子绕根部往前下方倾，约 62° —— 现实里羊驼吃草就是这个幅度。
      //
      //   几何：脖子轴向 +Y，绕 X 转 θ 后在父空间是 (0, cosθ, sinθ)。
      //   θ=0 → 竖直；θ=90° → 水平。62° 时顶端下移 53%、前伸 88%，
      //   正好把头顶到草边，又不会横成"断脖子"。
      //
      //   （试过 32°：顶端几乎没下降，头反而被抬得比站着还高。
      //     试过 132°：脖子整个翻到身体下面，像断掉。
      //     62° 是这两者之间唯一自然的角度。）
      const th = graze * 1.08;
      neckGroup.rotation.x = th;

      const len = neckLen;
      const tipY = neckBaseY + len * Math.cos(th);
      const tipZ = bodyD * 0.42 + len * Math.sin(th);

      // 头挂在脖子顶端：头【底边】贴住顶端
      headGroup.position.y = tipY - headBottomLocal;
      headGroup.position.z = tipZ;
      // ★ 头在父空间（已转 62° 的脖子）里只需要再补一点点角度。
      //
      //   实测鼻子相对头心的高度（脖子固定 1.08 rad）：
      //     headRotX=0.4 → -0.087  鼻子略低于头心  ← 自然、头朝前下
      //     headRotX=0.8 → +0.186  鼻子反而抬高
      //     headRotX=2.0 → -0.178  鼻子低，但头整个翻过去（嘴朝天）
      //   取 0.45：鼻子朝前下方，是"低头啃草"的自然姿态。
      headGroup.rotation.x = headBob + graze * 0.45;
    }

    root.rotation.x = -graze * 0.06;

    tailGroup.rotation.z = Math.sin(t * (2.2 + walk * 2.5) + phase) * (0.18 + walk * 0.2);
    tailGroup.rotation.x = Math.sin(t * 1.7 + phase) * 0.08;
  };

  return root;
}
// ---------------------------------------------------------------------------
// 绵羊专属骨架
//
// ★ 为什么不复用 makeQuadruped：
//   那套骨架是给牛/马/羊驼写的 —— 身体是长方体、头按 headSize 放大。
//   套到羊身上，头会占到身体宽度的 65%，看起来像"大头娃娃"，
//   而羊的真实比例是"一大团毛 + 一颗小脑袋"。
//
// 参考图里的羊是这样的：
//   身体  一团蓬松的椭圆毛球，占整体高度的 ~65%，宽度是头的 2.2 倍
//   头    一颗小方头，长在身体前下部（比身体顶面低），
//         浅粉色脸 + 黑方眼 + 粉方鼻
//   耳朵  两片小而薄的水平方片，贴在头两侧微微下垂
//   腿    四根短方柱，只有身体高度的一半，露出一点点
//   尾巴  一小撮毛球，贴在臀部
//
// 这里完全独立实现，接口仍然返回
// { parts: { bodyGroup, headGroup, legs, tailGroup, hipY }, animate }，
// 这样状态机、poseSleep、hud 都不用改。
// ---------------------------------------------------------------------------
export function makeSheepRig(cfg) {
  const {
    woolColor = 0xe8dcc4,
    faceColor = 0xf0c8c0,
    hoofColor = 0x4a4440,
    collarColor = 0xb02a2a,
    bellColor = 0xf0c030,
    noseColor = 0xe89aa0,
    // 体型（世界单位）
    // ★ 腿要短而粗：参考图里羊腿几乎被身体挡住，只露出一小截。
    //   legLen 0.45 -> 0.34，legW 0.19 -> 0.22（更墩实）。
    bodyW = 1.5, bodyH = 1.05, bodyD = 1.45,
    // ★ 参考图里羊的肚子几乎贴地，腿只从身体下缘露出很短一截。
    //   legLen 0.34 时腿仍然偏长、显得身体悬空，压到 0.24；
    //   同时加粗到 0.24，看起来是"短短的肉柱"而不是细棍。
    legLen = 0.24, legW = 0.24,
    headW = 0.52, headH = 0.46, headD = 0.44,
    ears = true,
  } = cfg;

  const root = new THREE.Group();
  root.name = 'animal';

  const mat = (c) => toonLambert({ color: c, flatShading: true });
  const woolMat = mat(woolColor);
  const faceMat = mat(faceColor);
  const hoofMat = mat(hoofColor);
  const noseMat = mat(noseColor);

  const hipY = legLen;

  // ---------- 身体：一大团毛 ----------
  //
  // ★ 只用【1 个主球 + 3 个大凸块】，不要堆很多小球：
  //   小球一多，轮廓就变成"一堆噪点"，失去低多边形的干净块面。
  //   凸块尺寸至少是身体的 1/3，才读得成"毛的起伏"而不是碎屑。
  const bodyGroup = new THREE.Group();
  bodyGroup.name = 'body';
  bodyGroup.position.y = hipY;

  const rx = bodyW * 0.5;
  const ry = bodyH * 0.5;
  const rz = bodyD * 0.5;

  const bodyParts = [];
  // 主团块：二十面体细分 1（80 面），flatShading 下是漂亮的多面体
  // 主团块：球心抬到 ry*1.02，让身体底面【高于髋关节一点点】，
  // 这样四条腿能露出来一小截（如果球心压在 hipY 上，腿会被毛完全吞掉）。
  const main = new THREE.IcosahedronGeometry(1, 1);
  main.scale(rx, ry, rz);
  main.translate(0, ry * 1.10, 0);
  bodyParts.push(tint(main, woolColor));

  // 3 个大凸块：顶部一块、前胸一块、臀部一块（都很大，不是碎球）
  const lobes = [
    [0, ry * 1.84, -rz * 0.10, 0.62],          // 头顶一片
    [0, ry * 1.27, rz * 0.72, 0.58],           // 前胸
    [0, ry * 1.17, -rz * 0.82, 0.56],          // 臀部
  ];
  for (const [lx, ly, lz, s] of lobes) {
    const g = new THREE.IcosahedronGeometry(1, 0);
    g.scale(rx * s, ry * s * 0.82, rz * s);
    g.translate(lx, ly, lz);
    bodyParts.push(tint(g, woolColor));
  }

  bodyGroup.add(limbMesh(bodyParts));
  root.add(bodyGroup);

  // ---------- 头：小而扁，长在身体【前面】 ----------
  //
  // ★ 位置是这套骨架最关键的一处，之前踩了坑：
  //   headZ 写成 rz*0.86 + headD*0.28，结果整颗头缩在毛球前半部里 ——
  //   因为毛球的半径是 rz（椭圆），头中心离球心只有 0.86*rz，
  //   加上头自身深度的一半也还在球内，正面只剩半张脸露出来。
  //
  //   正确做法：头中心放到【球心 + rz + headD*0.55】，
  //   也就是让头的后半截刚好嵌进球体、前半截完全露在外面，
  //   视觉上是"毛球前面长了个脑袋"。
  const headGroup = new THREE.Group();
  headGroup.name = 'head';
  const headY = hipY + ry * 0.82;                 // 略低于球心偏上
  const headZ = rz + headD * 0.55;                // 完全推到球体前面
  headGroup.position.set(0, headY, headZ);

  const headParts = [];
  // 脸：略扁的方块
  headParts.push(box(headW, headH, headD, faceColor, 0, 0, 0));

  // 头顶的一撮毛（盖住额头后半部分，露出脸）
  const capW = headW * 1.06;
  const capH = headH * 0.46;
  const capD = headD * 0.86;
  headParts.push(box(capW, capH, capD, woolColor, 0, headH * 0.56, -headD * 0.10));

  // 口鼻：往前伸一小块
  headParts.push(box(headW * 0.62, headH * 0.34, headD * 0.30, faceColor, 0, headH * 0.06, headD * 0.44));
  // 鼻头
  headParts.push(box(headW * 0.34, headH * 0.20, headD * 0.10, noseColor, 0, headH * 0.12, headD * 0.60));

  // 眼睛：已按用户要求移除（羊也是干净的一张脸）。

  // 耳朵：两片往外伸、略微下垂的薄方片。
  //
  // ★ 位置要在脸的上半部（headH*0.62），并且往外伸出一截，
  //   否则贴着腮帮子会看起来像"脸上贴了两块皮"。
  //   厚度用 0.14 倍头高（薄片），宽度 0.5 倍头宽（明显能看见）。
  if (ears !== false) {
    const earW = headW * 0.50;
    const earH = headH * 0.14;
    const earD = headD * 0.40;
    for (const sx of [-1, 1]) {
      headParts.push(box(
        earW, earH, earD,
        faceColor,
        sx * (headW * 0.5 + earW * 0.46),
        headH * 0.62,
        -headD * 0.02
      ));
    }
  }

  headGroup.add(limbMesh(headParts));

  // 项圈 + 铃铛：挂在头的下缘
  // 项圈 + 铃铛
  //
  // ★ 必须做成"贴着脖子的一圈细环"，不能是一块大板：
  //   之前宽度用 headW*1.06、深度用 headD*1.00、高度 headH*0.13，
  //   挂在头下缘时看起来像一张红色小桌面横在身体前面。
  //   现在：宽度只比头略宽、深度只取头深的 45%（正好绕脖子一圈）、
  //   高度压到 headH*0.10，整体是一个窄环。
  if (collarColor !== null) {
    // ★ 项圈必须做成"绕脖子一圈的细环"，而且要藏到头后面（z 负方向），
    //   否则会浮在身体前面像一块红色小桌面。
    //   这里把它压成 4 条细边（左右各一条 + 上下各一条），围成一个方框。
    const collarH = headH * 0.10;
    const collarW = headW * 0.98;
    const collarD = headD * 0.34;
    const cy = -headH * 0.36;
    const cz = -headD * 0.30;     // 藏到头后方
    const collar = [];
    // 左右两条竖边
    for (const sx of [-1, 1]) {
      collar.push(box(collarW * 0.10, collarH * 1.6, collarD * 2, collarColor, sx * collarW * 0.46, cy, cz));
    }
    // 前后两条横边
    for (const sz of [-1, 1]) {
      collar.push(box(collarW, collarH, collarD * 0.26, collarColor, 0, cy, cz + sz * collarD));
    }
    if (bellColor !== null) {
      const bellH = headH * 0.15;
      collar.push(box(bellH * 1.2, bellH, bellH, bellColor, 0, cy - bellH * 0.9, cz + collarD * 1.15));
    }
    const cm = limbMesh(collar);
    cm.name = 'collar';
    headGroup.add(cm);
  }

  root.add(headGroup);

  // ---------- 四条短腿 ----------
  const makeLeg = (x, z) => {
    const g = new THREE.Group();
    g.name = 'leg';
    g.position.set(x, hipY, z);
    const parts = [];
    parts.push(box(legW, legLen, legW, faceColor, 0, -legLen, 0));
    parts.push(box(legW * 1.1, legW * 0.42, legW * 1.1, hoofColor, 0, -legLen, 0));
    g.add(limbMesh(parts));
    return g;
  };

  const legX = bodyW * 0.30;
  const legZ = bodyD * 0.30;
  const legs = {
    fl: makeLeg(-legX, legZ),
    fr: makeLeg(legX, legZ),
    bl: makeLeg(-legX, -legZ),
    br: makeLeg(legX, -legZ),
  };
  Object.values(legs).forEach((l) => root.add(l));

  // ---------- 尾巴：一小撮毛 ----------
  const tailGroup = new THREE.Group();
  tailGroup.name = 'tail';
  tailGroup.position.set(0, hipY + ry * 0.9, -rz * 0.92);
  const tailParts = [];
  tailParts.push(box(bodyW * 0.16, bodyH * 0.22, bodyD * 0.16, woolColor, 0, -bodyH * 0.18, 0));
  tailGroup.add(limbMesh(tailParts));
  root.add(tailGroup);

  // ---------- 动画 ----------
  root.userData.parts = { bodyGroup, headGroup, legs, tailGroup, hipY };
  root.userData.headLift = headY - hipY;
  root.userData.animate = (t, state) => {
    const { walk = 0, graze = 0, phase = 0, speed = 1 } = state;
    const strideLen = legLen * 1.1;
    const stepFreq = Math.max(0.8, speed / strideLen) * Math.PI * 2;
    const swing = 0.55 * walk;

    const s = Math.sin(t * stepFreq + phase);
    const s2 = Math.sin(t * stepFreq + phase + Math.PI);

    legs.fl.rotation.x = s * swing;
    legs.br.rotation.x = s * swing;
    legs.fr.rotation.x = s2 * swing;
    legs.bl.rotation.x = s2 * swing;

    const bob = Math.abs(Math.sin(t * stepFreq * 0.5 + phase)) * 0.045 * walk;
    bodyGroup.position.y = hipY + bob;
    bodyGroup.rotation.z = Math.sin(t * stepFreq * 0.5 + phase) * 0.028 * walk;

    const headBob = Math.sin(t * stepFreq * 0.5 + phase) * 0.05 * walk;
    // ★ 同 makeQuadruped：正数才是低头（+Z 向下的方向）。
    headGroup.rotation.x = headBob + graze * 0.80;

    // ★ 吃草下压量要按【地面高度】算，不能写死 headH*1.6：
    //   headY 本身只有 hipY + ry*0.82 ≈ 0.24+0.43 = 0.67，
    //   再减 1.6*headH(=0.74) 就变成负值，头直接穿到地下（实测沉 0.447）。
    //   这里限制：低头后头底最低只能到"地面 + 0.06"。
    //   头底相对 headGroup 原点大约是 -headH*0.5，所以
    //   headGroup.position.y 的下限 = 0.06 + headH*0.5。
    const minHeadY = 0.10 + headH * 0.55;
    const drop = Math.max(0, headY - minHeadY);
    headGroup.position.y = headY - graze * drop;

    tailGroup.rotation.z = Math.sin(t * (2.4 + walk * 2.2) + phase) * (0.20 + walk * 0.18);
  };

  return root;
}

// ---------------------------------------------------------------------------
// 人形角色
// ---------------------------------------------------------------------------
// ---------------------------------------------------------------------------
// 外观随机化：发型 / 帽子 / 肤色 / 衣色
//
// ★ 之前三位农人是同一个模子：皮肤色写死 0xf0c8a0、身高写死 1.0、
//   全部戴同一顶草帽、没有任何发型，只有衣服颜色按索引轮换，
//   走在一起像三个克隆人。这里把"长什么样"抽成一组可选参数，
//   由 buildPeople 用场景自己的随机源挑，保证每次刷新都不一样。
// ---------------------------------------------------------------------------
export const HAIR_COLORS = [0x2e2119, 0x4a3122, 0x6b4a2f, 0x8a6a3e, 0xb08a52, 0x33251c];
// 肤色：全部往上提一档。
// ★ 原来最深的两档（0xd2a074 / 0xb98a5e）在 ACES + 饱和度 1.12~1.38 的
//   管线里会被推成和头发（深棕）几乎一样的颜色 —— 近景看就是
//   "整颗头是棕色的，分不出脸和头发"。提亮后脸部始终比发色亮一截。
export const SKIN_TONES = [0xf8dcc0, 0xf4d0a8, 0xecc09a, 0xe0ac84, 0xd09a72];
export const SHIRT_COLORS = [0xd05a4a, 0x4a7fb5, 0xe0a33c, 0x6f9e58, 0xc4708f, 0x7a6bb0, 0x4fa39a, 0xd98545];
export const PANTS_COLORS = [0x3a4a5a, 0x5a4a3a, 0x2e3a44, 0x6a5a48, 0x4a4438, 0x554a5e];
export const HAT_COLORS = [0xd8b96a, 0xc9a45a, 0x8a5a3a, 0x5a6a7a, 0xb04a3a, 0xe8dcc0];

function pickOne(arr, r) {
  const i = Math.min(arr.length - 1, Math.max(0, Math.floor(r * arr.length)));
  return arr[i];
}

// r 是返回 [0,1) 的随机函数；over 可强制指定某一项（例如 Log Lady 要固定发型）
export function randomLook(r, over = {}) {
  return {
    shirtColor: pickOne(SHIRT_COLORS, r()),
    pantsColor: pickOne(PANTS_COLORS, r()),
    skinColor: pickOne(SKIN_TONES, r()),
    hairColor: pickOne(HAIR_COLORS, r()),
    // 发型：短发偏多（乡村场景），少量丸子头/长发/寸头。
    // 注：'bald' 现在表示"超短寸头"，仍然有头发（用户要求不出现光头）。
    hairStyle: pickOne(['short', 'short', 'short', 'bun', 'long', 'bald'], r()),
    // 帽子：一半不戴，其余草帽/鸭舌帽/毛线帽
    hatStyle: pickOne(['none', 'none', 'straw', 'straw', 'cap', 'beanie'], r()),
    hatColor: pickOne(HAT_COLORS, r()),
    // 身高 0.92~1.08：并排站时肩线不齐，一眼能分出是不同的人
    height: 0.92 + r() * 0.16,
    ...over,
  };
}

export function makeHuman(cfg) {
  const {
    shirtColor, pantsColor, skinColor,
    hatColor = 0xd8b96a, hatStyle = 'straw',
    hairColor = 0x3a2a20, hairStyle = 'short',
    height = 1.0,
  } = cfg;

  const root = new THREE.Group();
  root.name = 'person';

  const legLen = 0.8 * height;
  const hipY = legLen;

  // ---------- 身体 ----------
  const bodyGroup = new THREE.Group();
  bodyGroup.name = 'body';
  bodyGroup.position.y = hipY;

  const bodyParts = [];
  bodyParts.push(box(0.62, 0.78, 0.4, shirtColor, 0, 0, 0));
  bodyGroup.add(limbMesh(bodyParts));
  root.add(bodyGroup);

  // ---------- 头 ----------
  const headGroup = new THREE.Group();
  headGroup.name = 'head';
  headGroup.position.y = hipY + 0.78 + 0.24;

  // ---------- 头发 ----------
  // 头发单独成一个网格（不并入头），name='hair'，
  // 需要"换头"的角色（Log Lady）可以按 name 精确移除，不会误删脸。
  //
  // ★ 关键几何约束（之前"粉色衣服的人没头发"就是这个）：
  //   头是半径 0.25 的球。头发壳必须【比头大一圈】并且【不被压扁】，
  //   否则壳整个嵌在头里，从任何角度看都只是一颗光头。
  //   旧参数 crownR=0.252 + scale.y=0.82 → 顶部只到 0.21，
  //   比头的 0.25 还低 0.04，等于完全没有头发。
  //
  //   现在：用【实心球体】堆出头发体积（见下方详细说明），
  //     头顶一块压扁球 + 后脑一块扁球，正面留出脸的位置。
  const hairParts = [];
  const hasHat = hatStyle !== 'none';
  {
    const isBald = hairStyle === 'bald';
    const crownR = isBald ? 0.258 : (hasHat ? 0.263 : 0.268);

    // ---------- 头发：实心球体叠加，不用开口壳体 ----------
    //
    // 反复试错的结论（三次都翻车）：
    //   ① 完整球壳同心 → 必然包住整张脸（变成棕色脑袋）
    //   ② 球壳 z 压扁    → 侧面/顶部缩进头里（变成光头）
    //   ③ SphereGeometry 切 theta → 切口是敞开的，从外看进去是一圈锯齿
    //
    // 正解：用【实心球体】堆出头发体积，不依赖薄壳。
    //   一块盖头顶（压扁的大球），一块盖后脑（扁球后移），
    //   两者都比头的半径大，且只在需要的位置与头相交。
    //   实心几何没有开口，也就不存在锯齿。
    //
    // ★ 不戴帽子时头发要更"贴"，否则正面的球会盖住脸。
    const noHat = !hasHat;
    const capR = isBald ? 0.248 : (noHat ? 0.250 : 0.262);

    // 头顶：压扁的球
    //   没帽子时：z 收到 0.88、中心后移 -0.030，
    //     正面 z = 0.250*0.88 - 0.030 = 0.190 < 0.25（脸露出来）
    //     顶部 y = 0.058 + 0.250*0.86 = 0.273 > 0.25（头顶有发）
    //   有帽子时：可以更饱满，帽子会盖住上半部分
    const top = new THREE.IcosahedronGeometry(capR, 1);
    if (noHat) {
      top.scale(1.04, isBald ? 0.70 : 0.86, 0.88);
      top.translate(0, isBald ? 0.042 : 0.056, -0.030);
    } else {
      top.scale(1.02, isBald ? 0.72 : 0.86, 0.98);
      top.translate(0, isBald ? 0.045 : 0.058, -0.012);
    }
    hairParts.push(tint(top, hairColor));

    // 后脑：扁球往后下方挂，形成后脑勺和鬓角。
    // ★ 半径和 z 偏移必须保证"正面顶点 < 头的 0.25"：
    //   backR*scale.z + translate.z 必须 < 0.25。
    //   实测 0.25*0.80 - 0.072 = 0.128 ✓（原 0.96 倍时是 0.21，太靠前）
    const backR = capR * 1.06;
    const back = new THREE.IcosahedronGeometry(backR, 1);
    back.scale(1.0, 1.02, 0.86);
    back.translate(0, -0.015, -0.075);
    hairParts.push(tint(back, hairColor));

    if (hairStyle === 'bun') {
      const bun = new THREE.IcosahedronGeometry(0.115, 0);
      bun.translate(0, 0.05, -0.27);
      hairParts.push(tint(bun, hairColor));
    } else if (hairStyle === 'long') {
      // 长发：两缕垂到肩侧。
      // ★ 必须放在头的【两侧偏后】（z 负），不能放在 z≈0 的正侧面，
      //   否则球体会从两侧包到正面，把脸糊住（实测整颗头会变成棕色球）。
      //   x=±0.235 略在头（0.25）内侧，靠 scale.z 收窄保证不盖脸。
      for (const sx of [-1, 1]) {
        const lock = new THREE.IcosahedronGeometry(0.135, 1);
        lock.scale(0.58, 1.55, 0.72);
        lock.translate(sx * 0.215, -0.145, -0.105);
        hairParts.push(tint(lock, hairColor));
      }
    }
  }

  // ---------- 帽子 ----------
  if (hatStyle === 'straw') {
    // 宽檐草帽（原来所有人都是这顶）
    hairParts.push(cyl(0.34, 0.34, 0.06, 8, hatColor, 0, 0.165, 0));
    hairParts.push(cyl(0.2, 0.24, 0.2, 8, hatColor, 0, 0.245, 0));
  } else if (hatStyle === 'cap') {
    // 鸭舌帽：圆帽身 + 前伸的帽舌
    hairParts.push(cyl(0.245, 0.255, 0.135, 8, hatColor, 0, 0.145, 0));
    hairParts.push(box(0.34, 0.035, 0.2, hatColor, 0, 0.128, 0.235));
  } else if (hatStyle === 'beanie') {
    // 毛线帽：压扁的球顶 + 帽箍 + 顶上的小球
    const dome = new THREE.IcosahedronGeometry(0.268, 1);
    dome.scale(1, 0.72, 1);
    dome.translate(0, 0.10, -0.01);
    hairParts.push(tint(dome, hatColor));
    hairParts.push(cyl(0.268, 0.268, 0.07, 10, hatColor, 0, 0.10, 0));
    const pom = new THREE.IcosahedronGeometry(0.075, 0);
    pom.translate(0, 0.31, 0);
    hairParts.push(tint(pom, 0xe8e0d4));
  }

  // ---------- 头（不再画眼睛）----------
  // ★ 用户要求去掉眼睛：低多边形小人脸上的两颗深色方块
  //   近景看是"两个洞"，远看是脏点，反而降低质感。
  //   现在脸是干净的一块肤色，靠头部朝向和身体动作表达情绪。
  const headParts = [];
  const head = new THREE.IcosahedronGeometry(0.25, 1);
  headParts.push(tint(head, skinColor));

  headGroup.add(limbMesh(headParts));
  if (hairParts.length) {
    const hairMesh = limbMesh(hairParts);
    hairMesh.name = 'hair';
    // ★ 头发/帽子【不加描边】。
    //   它们是紧贴头皮的部件，反向外壳（沿法线外扩 thickness）会
    //   变成一个比头还大的实心壳，从外面把整张脸和头发一起包住 ——
    //   这就是"粉色衣服的人没有头发"的真正原因：
    //   描边壳（深色）盖住了皮肤和头发，看起来就是一颗棕色/深色球。
    //   低多边形小人的头发本来就不需要描边（参考图里也没有）。
    hairMesh.userData.noOutline = true;
    headGroup.add(hairMesh);
  }
  root.add(headGroup);

  // ---------- 手臂 ----------
  const makeArm = (x) => {
    const g = new THREE.Group();
    g.name = 'arm';
    g.position.set(x, hipY + 0.72, 0);
    // ★ box() 的 y 参数是【底边】，内部会 +h/2。
    //   手臂要从肩关节（0）向下垂到 -0.66，所以底边必须是 -0.66。
    //   之前写 -0.33，盒子跨度变成 [-0.33, +0.33]（以肩膀为中心），
    //   上半截直接戳进脑袋里，下半截只到手肘 —— 挥手时整条手臂绕着
    //   自己的中点转，看起来像两根横着伸出去的棍子。
    const parts = [box(0.18, 0.66, 0.18, shirtColor, 0, -0.66, 0)];
    g.add(limbMesh(parts));
    return g;
  };
  const armL = makeArm(-0.4);
  const armR = makeArm(0.4);
  root.add(armL, armR);

  // ---------- 腿 ----------
  const makeLeg = (x) => {
    const g = new THREE.Group();
    g.name = 'leg';
    g.position.set(x, hipY, 0);
    // ★ 注意：box() 的 y 参数是【底边】位置（内部会 +h/2）。
    //   腿要从髋关节（0）向下延伸到 -legLen，所以底边应该是 -legLen。
    //   之前写 -legLen/2，导致腿整体上移 legLen/2，人物悬空 0.4。
    const parts = [box(0.26, legLen, 0.26, pantsColor, 0, -legLen, 0)];
    g.add(limbMesh(parts));
    return g;
  };
  const legL = makeLeg(-0.16);
  const legR = makeLeg(0.16);
  root.add(legL, legR);

  // ---------- 动画 ----------
  root.userData.parts = { bodyGroup, headGroup, armL, armR, legL, legR, hipY };
  root.userData.animate = (t, state) => {
    const { walk = 1, phase = 0, speed = 1, greet = 0 } = state;
    // 人走路步幅约 0.75m，步频 = 速度 / 步幅
    const strideLen = legLen * 0.9;
    // 人腿长 0.8、步幅约 0.72 -> 速度 1.0 时约 1.4 步/秒。
    // 同样需要转换成角频率（rad/s）。
    const freq = Math.max(0.9, speed / strideLen) * Math.PI * 2;
    // 打招呼时手臂不摆动（避免和挥手动作打架）
    // 摆动幅度从 0.75 降到 0.55：
    //   0.75 rad 时脚抬起 0.8×(1-cos(0.75)) ≈ 0.21，看起来像"悬空"
    //   0.55 rad 时只有 0.8×(1-cos(0.55)) ≈ 0.12，更贴地
    const swing = 0.55 * walk * (1 - greet);

    const s = Math.sin(t * freq + phase);
    const s2 = Math.sin(t * freq + phase + Math.PI);

    // 腿：左右交替（打招呼时停住不动）
    legL.rotation.x = s * swing;
    legR.rotation.x = s2 * swing;

    // 手臂：与腿反相（人走路时手臂与对侧腿同步）
    armL.rotation.x = s2 * swing * 0.8;

    if (greet > 0.01) {
      // ---------- 打招呼 ----------
      // 右臂抬起并举高，然后左右挥动。
      // 抬起角度 -2.5 rad（约 -143°），让手臂从自然下垂转到斜上方。
      // 挥动靠 rotation.z 左右摆动。
      const raise = -2.5 * greet;
      const wave = Math.sin(t * 9.5) * 0.45 * greet;
      armR.rotation.x = raise;
      armR.rotation.z = wave;

      // 左臂也稍微抬一点，显得更自然
      armL.rotation.x = armL.rotation.x * (1 - greet) - 0.25 * greet;
      armL.rotation.z = -0.12 * greet;

      // 身体微微前倾表示致意
      bodyGroup.rotation.x = -0.08 * greet;
    } else {
      armR.rotation.x = s * swing * 0.8;
      armR.rotation.z = 0;
      armL.rotation.z = 0;
      bodyGroup.rotation.x = 0;
    }

    // 身体上下起伏（每步一次，频率是摆腿的一半）
    const bob = Math.abs(Math.sin(t * freq * 0.5 + phase)) * 0.045 * walk;
    bodyGroup.position.y = hipY + bob;

    // 身体轻微左右摇摆
    bodyGroup.rotation.z = Math.sin(t * freq * 0.5 + phase) * 0.035 * walk;
    root.rotation.z = Math.sin(t * freq * 0.5 + phase) * 0.02 * walk;

    // 头：轻微上下点动；打招呼时抬头看镜头
    headGroup.position.y = hipY + 0.78 + 0.24 + bob * 0.6;
    headGroup.rotation.z = -bodyGroup.rotation.z * 0.5;
    headGroup.rotation.x = -0.18 * greet;
  };

  return root;
}
// ---------------------------------------------------------------------------
// 坐姿小人：坐在草地上（腿向前平伸、身体略后仰、双手撑在身侧）
//
// ★ 为什么要单独做一个而不是复用 makeHuman + animate：
//   现有 makeHuman 的腿是【一整块方柱】，从髋关节向下垂，
//   animate 只能让它绕 X 轴摆动 —— 无法做出"大腿前伸 + 小腿下垂"的弯膝。
//   这里直接把腿改成【两段】（大腿 + 小腿），并预设成坐姿角度，
//   再让 root 落到地面高度。
// ---------------------------------------------------------------------------
export function makeSittingHuman(cfg) {
  const {
    shirtColor, pantsColor, skinColor,
    hatColor = 0xd8b96a, hatStyle = 'straw',
    hairColor = 0x3a2a20, hairStyle = 'short',
    height = 1.0,
    lookYaw = 0,          // 面朝方向（朝向池塘）
  } = cfg;

  const root = new THREE.Group();
  root.name = 'person-sitting';

  const legLen = 0.8 * height;
  const thighLen = legLen * 0.52;      // 大腿
  const shinLen = legLen * 0.48;       // 小腿
  // 坐姿髋部高度 = 小腿长度（屁股离地 = 小腿垂直高度）
  const hipY = shinLen * 0.95;

  // ---------- 身体 ----------
  const bodyGroup = new THREE.Group();
  bodyGroup.name = 'body';
  bodyGroup.position.y = hipY;
  const bodyParts = [box(0.62, 0.78, 0.4, shirtColor, 0, 0, 0)];
  bodyGroup.add(limbMesh(bodyParts));
  // ★ 身体整体略后仰 12°，坐姿轮廓才明显（直立看和站姿没区别）
  bodyGroup.rotation.x = -0.20;
  root.add(bodyGroup);

  // ---------- 头 ----------
  const headGroup = new THREE.Group();
  headGroup.name = 'head';
  headGroup.position.y = hipY + 0.78 + 0.24;
  const headParts = [];
  const head = new THREE.IcosahedronGeometry(0.25, 1);
  headParts.push(tint(head, skinColor));
  headGroup.add(limbMesh(headParts));

  // 头发
  const hairParts = [];
  const hasHat = hatStyle !== 'none';
  const isBald = hairStyle === 'bald';
  const capR = isBald ? 0.258 : (hasHat ? 0.263 : 0.268);
  const noHat = !hasHat;
  {
    const top = new THREE.IcosahedronGeometry(capR, 1);
    if (noHat) {
      top.scale(1.04, isBald ? 0.70 : 0.86, 0.88);
      top.translate(0, isBald ? 0.042 : 0.056, -0.030);
    } else {
      top.scale(1.02, isBald ? 0.72 : 0.86, 0.98);
      top.translate(0, isBald ? 0.045 : 0.058, -0.012);
    }
    hairParts.push(tint(top, hairColor));

    const backR = capR * 1.06;
    const back = new THREE.IcosahedronGeometry(backR, 1);
    back.scale(1.0, 1.02, 0.86);
    back.translate(0, -0.015, -0.075);
    hairParts.push(tint(back, hairColor));
  }
  if (hatStyle === 'straw') {
    hairParts.push(cyl(0.34, 0.34, 0.06, 8, hatColor, 0, 0.165, 0));
    hairParts.push(cyl(0.2, 0.24, 0.2, 8, hatColor, 0, 0.245, 0));
  } else if (hatStyle === 'cap') {
    hairParts.push(cyl(0.245, 0.255, 0.135, 8, hatColor, 0, 0.145, 0));
    hairParts.push(box(0.34, 0.035, 0.2, hatColor, 0, 0.128, 0.235));
  }
  if (hairParts.length) {
    const hairMesh = limbMesh(hairParts);
    hairMesh.name = 'hair';
    hairMesh.userData.noOutline = true;
    headGroup.add(hairMesh);
  }
  root.add(headGroup);

  // ---------- 手臂：两段（大臂 + 小臂），双手搭在膝盖上 ----------
  //
  // ★ 之前是"一整根直臂向后撑地"，看起来像往后仰着坐。
  //   现在改成两段：大臂向下略前伸 → 小臂向前伸到膝盖 → 手掌搭在膝盖上。
  //
  // 几何参考：肩 (±0.4, hipY+0.72, 0)、膝 (±0.16, hipY, +thighLen)
  //   肩→膝 直线距离 0.865，用 0.34+0.34 两段略微弯肘刚好够到。
  // ★ 长度按几何反推：肘→膝 实测 0.49，所以小臂要 >= 0.49 才够得到膝盖。
  //   取 大臂 0.36 / 小臂 0.50（略微前伸搭在膝上，不是绷直）。
  const upperLen = 0.36, foreLen = 0.50;
  const makeArm = (x, side) => {
    const g = new THREE.Group();
    g.name = 'arm';
    g.position.set(x, hipY + 0.72, 0);

    // 大臂：按 IK 解算的精确角度
    //   肩 (±0.34, 1.11, 0) → 膝 (±0.16, 0.39, 0.416)
    //   方向 (-0.212, -0.846, +0.489)（右臂）
    //   ★ three.js rotation.x=θ 时 (0,-L,0) → (0, -L·cosθ, -L·sinθ)，
    //     Z 分量带负号 —— 所以要朝前方(+Z)必须用【负】rotX。
    //   rotX = -atan2(0.489, 0.846) = -0.524；rotZ = -asin(0.212) = -0.213
    const upper = new THREE.Group();
    upper.name = 'upperArm';
    upper.rotation.x = -0.524;
    upper.rotation.z = -side * 0.213;
    upper.add(limbMesh([box(0.18, upperLen, 0.18, shirtColor, 0, -upperLen, 0)]));

    // 小臂：肩→膝 几乎是一条直线（臂长 0.86 ≈ 距离 0.851），
    //   所以小臂相对大臂几乎不弯（rotX ≈ 0），只做轻微自然弯折。
    const fore = new THREE.Group();
    fore.name = 'forearm';
    fore.position.y = -upperLen;
    fore.rotation.x = -0.08;
    fore.add(limbMesh([box(0.16, foreLen, 0.16, shirtColor, 0, -foreLen, 0)]));

    // 手掌：搭在膝盖上（扁平方块，略微向前伸过膝盖）
    fore.add(limbMesh([box(0.20, 0.09, 0.26, skinColor, 0, -foreLen - 0.04, 0.03)]));

    upper.add(fore);
    g.add(upper);
    return g;
  };
  const armL = makeArm(-0.34, -1);
  const armR = makeArm(0.34, 1);
  root.add(armL, armR);

  // ---------- 腿：两段（大腿前伸 + 小腿下垂）----------
  const makeLeg = (x) => {
    const hip = new THREE.Group();
    hip.name = 'leg';
    hip.position.set(x, hipY, 0);

    // 大腿：从髋关节向前水平伸出
    const thigh = new THREE.Group();
    thigh.name = 'thigh';
    thigh.rotation.x = -Math.PI / 2;      // 向前平伸
    thigh.add(limbMesh([box(0.26, thighLen, 0.26, pantsColor, 0, -thighLen, 0)]));

    // 小腿：接在大腿末端，向下垂
    const shin = new THREE.Group();
    shin.name = 'shin';
    shin.position.y = -thighLen;
    shin.rotation.x = Math.PI / 2;        // 转回竖直向下
    shin.add(limbMesh([box(0.24, shinLen, 0.24, pantsColor, 0, -shinLen, 0)]));

    // 脚
    shin.add(limbMesh([box(0.26, 0.1, 0.34, 0x4a3a2a, 0, -shinLen - 0.1, 0.08)]));

    thigh.add(shin);
    hip.add(thigh);
    return hip;
  };
  const legL = makeLeg(-0.16);
  const legR = makeLeg(0.16);
  root.add(legL, legR);

  // ---------- 轻微呼吸动画（坐着不动，只呼吸 + 偶尔转头看鱼）----------
  root.userData.parts = { bodyGroup, headGroup, armL, armR, legL, legR, hipY };
  root.userData.animate = (t) => {
    // 呼吸：身体极轻微起伏
    const breathe = Math.sin(t * 1.5) * 0.012;
    bodyGroup.position.y = hipY + breathe;
    headGroup.position.y = hipY + 0.78 + 0.24 + breathe;

    // 头部：缓慢左右微动，像在看池塘里的鱼
    headGroup.rotation.y = Math.sin(t * 0.55) * 0.22;
    headGroup.rotation.x = -0.10 + Math.sin(t * 0.8) * 0.05;

    // 身体轻微前倾（专注看鱼）
    bodyGroup.rotation.x = 0.10;
  };

  // 朝向池塘
  root.rotation.y = lookYaw;

  return root;
}
