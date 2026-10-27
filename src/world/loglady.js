import * as THREE from 'three';
import { makeHuman } from './character.js';
import { cyl, tint } from '../util/geo.js';
import { toonLambert } from '../render/toon.js';

// ---------------------------------------------------------------------------
// Log Lady —— 致敬《双峰》里抱着木头说话的 Margaret Lanterman
//
// 她的设定：
//   - 一直坐在篝火旁的木桩上，怀里抱着一截木头
//   - 会低头凑近木头，像是在跟它说话（头/身体小幅摆动）
//   - 点开特写时【动作不变】—— 她不会挥手打招呼，也不会站起来
//
// 和其他三位农人（Cooper / Harry / Andy）的区别：
//   - 裙装（锥形裙摆），露出小腿
//   - 深棕色长发 + 脑后发髻
//   - 驼色披肩，配色偏暗、偏暖
// ---------------------------------------------------------------------------

const HEIGHT = 0.94;

export function buildLogLady(model, campfire) {
  const group = new THREE.Group();
  group.name = 'loglady';

  // ---------- 找一张空木桩坐下 ----------
  const seats = (campfire && campfire.userData && campfire.userData.stumpSeats) || [];
  const fire = (campfire && campfire.userData && campfire.userData.center) || { x: 26, z: 8, y: 0 };
  // 没有木桩就退化成站在篝火旁（不应该发生，但别让场景崩）
  const seat = seats[0] || {
    x: fire.x + 3.2, z: fire.z + 2.0, topY: model.heightAt(fire.x + 3.2, fire.z + 2.0),
  };

  // ---------- 身体 ----------
  const lady = makeHuman({
    // 上衣：深墨绿，和裙摆同色系（裙摆更深一档）
    shirtColor: 0x47685e,
    // 腿用肤色（裙摆下面露小腿，不是裤子）
    pantsColor: 0xe0b894,
    skinColor: 0xf0c8a0,
    // 她固定用长发+发髻，不戴帽子
    hatStyle: 'none',
    hairStyle: 'long',
    hairColor: 0x3a2a20,
    height: HEIGHT,
  });
  lady.name = 'loglady-body';

  const parts = lady.userData.parts;

  // 去掉 makeHuman 给的头发/帽子，换成她自己的发型
  // ★ 现在 headGroup 里是「头（含眼睛）」+「name='hair' 的头发/帽子」两个网格。
  //   早先是"移除全部 isMesh 再补一个脸"，一旦 makeHuman 往头上加别的东西
  //   （眼睛）就会被一起抹掉。改成按 name 精确移除。
  const headKids = parts.headGroup.children.slice();
  for (const c of headKids) {
    if (c.isMesh && c.name === 'hair') parts.headGroup.remove(c);
  }

  const hairMat = toonLambert({ color: 0x3a2a20, flatShading: true });

  // 头顶头发：比头略大的二十面体，往后上方偏移
  //
  // ★ 半径 0.27 时它的前表面在 z = -0.035 + 0.27 = 0.235，
  //   而脸（半径 0.25）的前表面在 0.25 —— 两者只差 0.015，
  //   二十面体的顶点会在正脸上戳出一个个小黑三角（截图里脸中央那个黑点）。
  //   收到 0.255 并再往后挪一点，让整颗头稳定地"包"在头发里。
  const crown = new THREE.Mesh(new THREE.IcosahedronGeometry(0.255, 1), hairMat);
  crown.position.set(0, 0.045, -0.055);
  crown.scale.set(1.0, 0.92, 1.02);
  parts.headGroup.add(crown);

  // 两侧长发（垂到肩）
  // ★ 原来用 BoxGeometry(0.13, 0.42, 0.16)：从正面看是两块纯黑的长方形板，
  //   低多边形角色上格外突兀，像在耳朵两边各插了一块黑板。
  //   改成压扁的椭球（二十面体缩放），有厚度、有弧面，读起来才是"头发"。
  for (const sx of [-1, 1]) {
    const side = new THREE.Mesh(new THREE.IcosahedronGeometry(0.16, 1), hairMat);
    side.position.set(sx * 0.215, -0.11, -0.06);
    side.scale.set(0.62, 1.55, 0.95);
    parts.headGroup.add(side);
  }

  // 脑后发髻
  const bun = new THREE.Mesh(new THREE.IcosahedronGeometry(0.13, 0), hairMat);
  bun.position.set(0, 0.02, -0.26);
  parts.headGroup.add(bun);

  // 脸直接用 makeHuman 的头网格（skinColor 已经是 0xf0c8a0，还带眼睛），
  // 不再额外套一层球 —— 多套的那层半径一旦超过 0.25 就会把眼睛盖住。

  // ---------- 裙摆 ----------
  // 上窄下宽的圆台（CylinderGeometry 两端半径不同），是坐着时裙摆铺开的形状。
  //
  // ★ 配色：原来用 0x6a4a3c（褐色），和木桩(0x6a5240)、怀里的木头(0x6a4a30)、
  //   篝火的木柴几乎是同一个色系，近景下整个人和座位糊成"一坨木头"。
  //   改成深墨绿 0x3c5a52 —— 冷色、低明度，既符合乡村裙装，又能从褐色环境里跳出来。
  //
  // ★ 尺寸：木桩顶面在 seat.topY = 6.145，她坐下时髋部就压在桩面上，
  //   所以裙摆【必须完全在桩面之上】，否则会从木桩侧面穿出来（之前就是
  //   0.46 半径 + 0.62 高度，整圈绿边从木桩底部戳出来）。
  //   这里改成高 0.22、底半径 0.55，底面正好落在桩面上，看起来是裙摆铺在座位上。
  // ★ 裙摆的尺寸和位置由"下沿要盖住膝盖、又要露出小腿"反推，
  //   所以在这里定义常量，下面腿部那段直接复用同一组值。
  const SKIRT_H = 0.42;
  const SKIRT_Y = 0.10;      // 相对髋部
  const skirt = new THREE.Mesh(
    new THREE.CylinderGeometry(0.29, 0.46, SKIRT_H, 10, 1, true),
    toonLambert({ color: 0x3c5a52, flatShading: true, side: THREE.DoubleSide })
  );
  // ★ 注意坐标系：bodyGroup 自身已经在 y = hipY 处，
  //   所以这里的位置是【相对髋部】，不能再加一次 hipY
  //   （加了会把裙摆顶到头顶上去，看起来像戴了个尖帽子）。
  //   高 0.42、中心 -0.01 → 裙摆从髋部向下垂 0.22，
  //   正好盖住木桩顶面 0.2，读起来是"裙子铺在座位上"而不是"屁股上垫了块布"。
  // ★ 位置：裙摆必须**完全盖住坐着的大腿**，只让小腿露出来。
  //   相对髋部的范围取 [-0.24, +0.28]（高 0.52、中心 0.02）：
  //     - 下沿在髋下 0.24，比大腿底面（髋下 0.20）还低，大腿整段藏在裙里；
  //     - 木桩顶面在髋下 0.02，此处裙摆半径 ≈ 0.38 > 桩半径 0.32，
  //       所以裙摆是"罩在桩子外面"，不会穿进木头里。
  //   ★ 下沿不能只到 -0.12：那样大腿底面的方角会从裙摆下面戳出来，
  //     近景看是两个肉色的三角尖。
  //   ★ 挂在 root 而不是 bodyGroup 上：bodyGroup 每帧有 lean（0.10~0.30）的
  //     前倾，裙摆跟着转会把前摆抬起来、又露出大腿。裙摆挂在根节点上就
  //     稳稳罩住，只有上半身（和怀里的木头）在倾。
  skirt.position.y = parts.hipY + SKIRT_Y;
  lady.add(skirt);

  // 披肩：肩上一圈短斗篷。用比裙摆浅一档的灰绿，形成上下层次
  // ★ 半径 0.44 时锥面比躯干（半宽 0.31）外扩 0.13，8 段锥的棱线在侧面
  //    silhouette 上形成一个尖角，看起来像背上插了一片鳍。
  //   收成 0.37 / 高 0.26，正好搭在肩上一点点。
  // ★ 原来是 ConeGeometry(0.44, 0.34, 8, 1, true) 的敞口锥 —— 8 段平面在
  //   正面轮廓上正好形成两块外翻的"翅膀"，看着像穿了护肩。
  //   改成贴肩的短圆筒（上下半径差很小），只在领口加一圈厚度，
  //   既有披肩的层次感，又不会破坏低多边形人物的整体剪影。
  const shawl = new THREE.Mesh(
    new THREE.CylinderGeometry(0.31, 0.35, 0.20, 10, 1, true),
    toonLambert({ color: 0x5a7a6a, flatShading: true, side: THREE.DoubleSide })
  );
  // 相对髋部：躯干高 0.78，肩在 0.72，披肩中心放在 0.66 正好搭住肩线
  shawl.position.y = 0.66;
  parts.bodyGroup.add(shawl);

  // ---------- 怀里的木头 ----------
  // 一截带树皮纹的圆木，横抱在胸前
  // ★ 原来 1.05 长 —— 比她的肩宽（0.62）还宽 70%，抱起来像扛一根电线杆。
  //   0.86 × 0.15 才是"一截能抱在怀里的木头"。
  const LOG_LEN = 0.86;
  const LOG_R = 0.15;
  const logMat = toonLambert({ color: 0x6a4a30, flatShading: true });
  const logMatEnd = toonLambert({ color: 0xa87c4e, flatShading: true });

  const log = new THREE.Group();
  log.name = 'held-log';

  const trunk = new THREE.Mesh(new THREE.CylinderGeometry(LOG_R, LOG_R * 1.06, LOG_LEN, 9), logMat);
  trunk.rotation.z = Math.PI / 2;      // 横过来
  trunk.castShadow = true;
  log.add(trunk);

  // 两端年轮截面（浅色圆片）
  for (const sx of [-1, 1]) {
    const cap = new THREE.Mesh(new THREE.CircleGeometry(LOG_R * 0.94, 9), logMatEnd);
    cap.position.x = sx * LOG_LEN * 0.5;
    cap.rotation.y = sx * Math.PI / 2;
    log.add(cap);
  }

  // 树皮结节，让它不像一根光滑的圆柱
  for (let i = 0; i < 4; i++) {
    const knot = new THREE.Mesh(new THREE.IcosahedronGeometry(0.07, 0), logMat);
    const a = (i / 4) * Math.PI * 2;
    knot.position.set(-0.28 + i * 0.18, Math.cos(a) * LOG_R * 0.9, Math.sin(a) * LOG_R * 0.9);
    log.add(knot);
  }

  // 木头抱在胸前：位置相对 lady 的根（脚底）
  // ★ 0.48/0.36 时木头举在胸口正中、离身体 0.36，读起来是"端着"；
  //   压到 0.40/0.30 让它落在怀里的高度，手臂前伸 1.12 rad 正好搭上去。
  // y = hipY + 0.36 = 1.112，z = 0.30，前表面在 z = 0.45
  log.position.set(0, parts.hipY + 0.36, 0.30);
  log.rotation.z = 0.10;
  lady.add(log);

  // ---------- 坐姿 ----------
  // 木桩顶 = seat.topY。人的原点在脚底，髋在 hipY，
  // 所以 root.y = topY - hipY 时髋正好落在桩面上。
  lady.position.set(seat.x, seat.topY - parts.hipY + 0.02, seat.z);

  // 面朝篝火
  const heading = Math.atan2(fire.x - seat.x, fire.z - seat.z);
  lady.rotation.y = heading;

  // ---------- 坐姿的腿：大腿前伸 + 小腿垂直（带膝盖） ----------
  //
  // ★ 为什么不能用 makeHuman 那根直腿：
  //   木桩顶只比地面高 0.545，腿长却有 0.752 —— 坐着的时候大腿必须
  //   近乎水平地伸出去，小腿再垂直落地。makeHuman 的腿是一整根从髋到脚的
  //   方盒子（没有膝关节），绕髋转任何角度都只能是一块斜插在身前的"木板"：
  //     转得少 → 整根腿埋进木桩里；
  //     转得多 → 两条腿像木板一样平伸出去，人像在漂浮。
  //   之前在这两个极端之间反复试（-0.54 / -1.42 / -0.80）都难看，
  //   根因是几何本身缺一个关节。
  //
  // ★ 做法：清空原来的直腿，重建成 thigh（大腿，水平前伸）+
  //   knee（膝关节组）+ shin（小腿，垂直向下）+ foot。
  //   大腿整段藏在裙摆下面，画面里只看得到小腿，正好是穿裙子坐着的读法。
  // 腿用比肤色深一档的暖驼色：原来的 0xe0b894 在深绿裙摆下面太跳，
  // 近景看像两块发光的面板。0xcfa87e 有肉感又不刺眼。
  const legMat = toonLambert({ color: 0xcfa87e, flatShading: true });
  const shoeMat = toonLambert({ color: 0x4a3a30, flatShading: true });
  // ★ 只建小腿，不建大腿。
  //   之前试过"大腿水平前伸 + 膝盖 + 小腿垂直"，几何是对的，但裙摆是
  //   openEnded 的圆台（没有底盖），从正面稍微俯视就会透过下沿的空洞
  //   看到大腿顶面 —— 画面里是两块肉色的梯形，像裙子里塞了两块面包。
  //   坐着的姿势本来就看不到大腿，直接省掉：小腿顶端挂在裙摆里面
  //   （被裙摆完全遮住），只有膝下一截露出来，读起来干净得多。
  // ★ 尺寸全部由"不穿模"反推：
  //   裙摆是个 10 段圆台，顶点半径最大、棱之间的弦最短（×cos18° = 0.951）。
  //   小腿是方盒子，最靠外的角在 (x + 半宽, z + 半深)。
  //   只要这个角的轴距 < 该高度上的弦半径，就绝不会从裙面戳出来。
  //   之前 0.155/0.24 + 0.10 半宽 → 角距 0.425 > 弦半径 0.380，
  //   于是裙摆下沿左右各冒出一个肉色小三角（截图上很显眼）。
  // ★ 尺寸全部由座位反推，不再写死数字：
  //   桩高一变（campfire.js 里的 STUMP_H），鞋就该跟着落到地面上，
  //   否则要么悬空、要么陷进草里。
  //     rootY  = seat.topY - hipY + 0.02      髋压在桩面上
  //     hemY   = rootY + hipY + SKIRT_Y - SKIRT_H/2   裙摆下沿
  //     鞋底贴地 => 小腿下端 = seat.groundY + FOOT_H
  //   小腿顶端藏进裙摆 4cm，从上往下俯视也看不到断口。
  const FOOT_H = 0.075;
  const rootY = seat.topY - parts.hipY + 0.02;
  const hemY = rootY + parts.hipY + SKIRT_Y - SKIRT_H * 0.5;
  const shinTopY = hemY + 0.04;
  const shinBotY = seat.groundY + FOOT_H;
  const SHIN_LEN = Math.max(0.10, shinTopY - shinBotY);
  // 小腿要挂在木桩【前面】：桩半径 0.27 + 小腿半深 0.075 + 余量
  const SHIN_Z = 0.36;
  for (const [leg, sx] of [[parts.legL, -1], [parts.legR, 1]]) {
    leg.clear();
    leg.rotation.set(0, 0, 0);
    leg.position.set(sx * 0.14, shinTopY - rootY, SHIN_Z);
    const shin = new THREE.Mesh(new THREE.BoxGeometry(0.15, SHIN_LEN, 0.15), legMat);
    shin.position.y = -SHIN_LEN * 0.5;
    leg.add(shin);
    // 鞋：从小腿底端往前伸一小截
    const foot = new THREE.Mesh(new THREE.BoxGeometry(0.15, FOOT_H, 0.22), shoeMat);
    foot.position.set(0, -SHIN_LEN + FOOT_H * 0.5, 0.045);
    leg.add(foot);
  }

  // 手臂环抱木头（往前下方收）。
  // ★ rotation.z 的符号很关键：手臂默认朝下（-Y），绕 +Z 转正角度会把
  //   手臂末端往 +X 推。armL 在 x=-0.4、armR 在 x=+0.4，
  //   所以 armL 要 +z、armR 要 -z 才是"往中间收"。
  //   之前用了 ±0.34，收得太多，两只手臂在胸前交叉成一个 X，
  //   看起来像在跟木头搏斗而不是抱着它。改成 ±0.10，只是轻轻拢住。
  // ★ 角度按几何反推：肩在 y = hipY + 0.72 = 1.472，臂长 0.66。
  //   rotation.x = -a → 手落在 y = 1.472 − 0.66·cos(a)、z = 0.66·sin(a)。
  //   木头中心 y 1.112 / z 0.30、半径 0.15 → 前表面 z = 0.45。
  //   要手落在 z = 0.45 需 sin(a) = 0.682 → a ≈ 0.75，
  //   此时手在 y ≈ 0.99，正好从下往上托住木头（不是从上面压过去）。
  //   之前写 −1.30 时手在 z = 0.636，整条手臂穿过木头戳到外面。
  // ★ 手臂重建：makeHuman 的手臂是 0.18×0.66 的方柱子，挂在 x=±0.4。
  //   直接旋转它，近景下会变成两块又宽又长的深色板子从肩膀往外撇，
  //   看着像穿了护肩 / 背了块木板，完全读不出"手臂"。
  //   这里清空重建成细一点的圆柱手 + 一小块手掌：
  //     ARM_W 0.15（原来 0.18）、ARM_LEN 0.62（原来 0.66）
  //     肩点收到 ±0.33（躯干半宽 0.31，只探出 0.02，不再向外张）
  //     末端加一块肤色的手掌，抱木头的手才有"抓握"的读法
  const ARM_W = 0.15;
  const ARM_LEN = 0.62;
  const armMat = toonLambert({ color: 0x47685e, flatShading: true });
  const handMat = toonLambert({ color: 0xf0c8a0, flatShading: true });
  for (const [arm, sx] of [[parts.armL, -1], [parts.armR, 1]]) {
    arm.clear();
    arm.position.set(sx * 0.33, parts.hipY + 0.70, 0.05);
    const upper = new THREE.Mesh(new THREE.BoxGeometry(ARM_W, ARM_LEN, ARM_W), armMat);
    upper.position.y = -ARM_LEN * 0.5;
    arm.add(upper);
    // 手掌：0.14×0.11×0.15。第一版 0.1575×0.13×0.1725 在四分之三侧看是
    // 两块发亮的粉色方块，比脸还抢眼；收到略小于前臂截面才是"手"的读法。
    const hand = new THREE.Mesh(new THREE.BoxGeometry(0.14, 0.11, 0.15), handMat);
    hand.position.set(0, -ARM_LEN + 0.045, 0.012);
    arm.add(hand);
  }
  // 环抱角度：绕 X 转到 -0.95（前伸 54°），手落在木头前表面 z≈0.55、y≈1.09；
  // 绕 Z 只收 ±0.13，两只手在胸前汇拢但不交叉。
  parts.armL.rotation.x = -0.95;
  parts.armR.rotation.x = -0.95;
  parts.armL.rotation.z = 0.13;
  parts.armR.rotation.z = -0.13;

  // 身体微微前倾，像是在倾听怀里的木头
  parts.bodyGroup.rotation.x = 0.10;

  group.add(lady);

  // ---------- 状态 ----------
  // 供 hud 使用：她有名字，点开时不挥手（isLogLady 让 hud 跳过打招呼逻辑）
  lady.userData.personName = 'Log Lady';
  lady.userData.isLogLady = true;

  group.userData.lady = lady;
  group.userData.parts = parts;
  group.userData.log = log;
  group.userData.seat = seat;

  // ---------- 每帧动画 ----------
  group.userData.update = (t, dt) => {
    // 两段循环：6 秒一轮
    //   0.0~0.6  抱着木头安静坐着，只是呼吸
    //   0.6~0.9  低头凑近木头，像在说话（头小幅点动）
    //   0.9~1.0  抬头，望向篝火
    const cycle = (t * 0.16) % 1;

    let lean = 0;      // 身体前倾
    let headDown = 0;  // 低头
    let headTurn = 0;  // 转头

    if (cycle < 0.60) {
      // 安静
      const k = cycle / 0.60;
      lean = 0.10 + Math.sin(k * Math.PI) * 0.015;
      headDown = 0.10;
      headTurn = Math.sin(t * 0.45) * 0.06;
    } else if (cycle < 0.90) {
      // 对着木头说话
      const k = (cycle - 0.60) / 0.30;
      const ease = k * k * (3 - 2 * k);
      lean = 0.10 + ease * 0.20;
      // 说话时的点头：频率 4.2Hz 的小幅上下
      headDown = 0.10 + ease * 0.44 + Math.sin(t * 4.2) * 0.055 * ease;
      headTurn = Math.sin(t * 1.7) * 0.05;
    } else {
      // 抬头看篝火
      const k = (cycle - 0.90) / 0.10;
      const ease = k * k * (3 - 2 * k);
      lean = 0.30 - ease * 0.20;
      headDown = 0.54 - ease * 0.44;
      headTurn = -0.10 * ease;
    }

    parts.bodyGroup.rotation.x = lean;
    parts.headGroup.rotation.x = headDown;
    parts.headGroup.rotation.y = headTurn;

    // 呼吸：胸口极轻微的起伏
    const breath = Math.sin(t * 1.15) * 0.012;
    parts.bodyGroup.position.y = parts.hipY + breath;

    // 手臂跟着身体前倾，木头始终在怀里
    // （基准值和上面摆姿势时的 -1.22 / -1.14 保持一致，否则第一帧会跳一下）
    parts.armL.rotation.x = -0.95 - lean * 0.35;
    parts.armR.rotation.x = -0.95 - lean * 0.35;

    // 木头随身体轻微晃动
    log.rotation.z = 0.10 + Math.sin(t * 0.7) * 0.018;
  };

  return group;
}
