import * as THREE from 'three';
import { BUILDINGS } from '../world/layout.js';
import { makeWindowGlowTexture } from './windows.js';
import { toonLambert } from '../render/toon.js';

// ---------------------------------------------------------------------------
// 夜间灯光：窗户发光 + 屋内暖光 + 路灯
//
// 关于"光扩散"：
//   MeshBasicMaterial 的圆盘是硬边的（截图里那种一刀切的黄圈），
//   这里改成自定义 shader 的径向衰减贴图 —— 中心亮、边缘完全透明，
//   再加一层随距离衰减的点光源照亮周围物体（真正产生明暗过渡）。
// ---------------------------------------------------------------------------

const WINDOW_COLOR = 0xffd9a0;

// ---------------------------------------------------------------------------
// 径向渐变光斑：中心亮 -> 边缘透明，并带一点暖色调偏移
// ---------------------------------------------------------------------------
const PoolShader = {
  uniforms: {
    uColor: { value: new THREE.Color(0xffcf90) },
    uOpacity: { value: 0 },
    uRadius: { value: 6.0 },
    uFalloff: { value: 3.4 },   // 越大边缘越柔（从 2.2 提到 3.4，避免中心死白）
  },
  vertexShader: /* glsl */`
    varying vec2 vUv;
    void main() {
      vUv = uv;
      gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
    }
  `,
  fragmentShader: /* glsl */`
    uniform vec3 uColor;
    uniform float uOpacity;
    uniform float uRadius;
    uniform float uFalloff;
    varying vec2 vUv;

    void main() {
      // 以圆心为中心计算径向距离（uv 是 0..1，中心在 0.5）
      float d = length(vUv - 0.5) * 2.0;   // 0 = 圆心, 1 = 边缘
      if (d > 1.0) discard;

      // 平滑衰减：中心 1，边缘 0
      // 注意：不要额外加"中心高光"（hotspot），
      // 那会让光斑正中心叠加到纯白，配合 Bloom 直接过曝。
      float a = pow(1.0 - d, uFalloff);

      gl_FragColor = vec4(uColor, a * uOpacity);
    }
  `,
};

// 夜间发光层：必须比白天窗户更靠外，否则会被挡住或产生 z-fighting
const NIGHT_LAYER_EXTRA = 0.06;

// 发光窗贴图缓存
let glowTexBarn = null;
let glowTexHouse = null;

function getGlowTex(variant) {
  if (variant === 'barn') {
    if (!glowTexBarn) {
      glowTexBarn = makeWindowGlowTexture({
        frameColor: '#4a3220',
        glowInner: '#fff6d8',
        glowOuter: '#ffc964',
      });
    }
    return glowTexBarn;
  }
  if (!glowTexHouse) {
    glowTexHouse = makeWindowGlowTexture({
      frameColor: '#5a3d28',
      glowInner: '#fff2c8',
      glowOuter: '#ffbf5e',
    });
  }
  return glowTexHouse;
}

// 夜间窗户：与白天窗户**同尺寸、同结构**（含十字窗棂），
// 只是贴图换成暖黄发光版，这样夜里是"四格窗发光"而不是一整块光斑。
function makeWindow(w, h, x, y, z, rotY = 0, variant = 'house') {
  const geo = new THREE.PlaneGeometry(w, h);
  const mat = new THREE.MeshBasicMaterial({
    map: getGlowTex(variant),
    transparent: true,
    opacity: 0,
    depthWrite: false,
    side: THREE.DoubleSide,
    // 注意：这里不能用 AdditiveBlending。
    // 叠加混合会把窗棂的深色"加"成透明，四宫格结构就消失了（变成一整块光斑）。
    // 用普通混合才能保留窗棂，发光感由贴图本身的暖黄色提供。
    blending: THREE.NormalBlending,
  });
  const mesh = new THREE.Mesh(geo, mat);
  mesh.position.set(x, y, z);
  mesh.rotation.y = rotY;
  mesh.renderOrder = 3;
  mesh.name = 'night-window';
  return mesh;
}

// ---------------------------------------------------------------------------
// 路灯
// ---------------------------------------------------------------------------
function makeLampPost(height = 6) {
  const group = new THREE.Group();
  group.name = 'lamp';

  const poleMat = toonLambert({ color: 0x4a4038 });
  const pole = new THREE.Mesh(new THREE.CylinderGeometry(0.14, 0.2, height, 6), poleMat);
  pole.position.y = height / 2;
  pole.castShadow = false;   // 细杆的长投影在雪地上像一根黑线
  group.add(pole);

  const shade = new THREE.Mesh(
    new THREE.ConeGeometry(0.75, 0.75, 8),
    toonLambert({ color: 0x5a5048 })
  );
  shade.position.y = height + 0.1;
  group.add(shade);

  // 灯泡：外层光晕 + 内芯
  const bulbMat = new THREE.MeshBasicMaterial({
    color: 0xffe8c0,
    transparent: true,
    opacity: 0,
    depthWrite: false,
    blending: THREE.AdditiveBlending,
  });
  // 灯泡本体：小而亮，不放大光晕（大光晕在远处会变成明显的球体）
  const bulb = new THREE.Mesh(new THREE.SphereGeometry(0.22, 8, 6), bulbMat);
  bulb.position.y = height - 0.3;
  group.add(bulb);

  // ---------- 地面光斑（径向衰减 shader） ----------
  // 光斑从 16 放大到 22：牧场是开阔区域，太小的光斑会显得像"手电筒"
  const poolGeo = new THREE.PlaneGeometry(22, 22);
  const poolMat = new THREE.ShaderMaterial({
    uniforms: THREE.UniformsUtils.clone(PoolShader.uniforms),
    vertexShader: PoolShader.vertexShader,
    fragmentShader: PoolShader.fragmentShader,
    transparent: true,
    depthWrite: false,
    blending: THREE.AdditiveBlending,
    side: THREE.DoubleSide,
  });
  const pool = new THREE.Mesh(poolGeo, poolMat);
  pool.rotation.x = -Math.PI / 2;
  pool.position.y = 0.08;
  pool.renderOrder = 2;
  group.add(pool);

  // ---------- 点光源（真正照亮周围物体） ----------
  // 注意：decay=2 时衰减极快，intensity 必须给大值才有可见照明
  // 照射范围从 26 提到 34：路灯现在在牧场里，需要照亮更大的区域
  const light = new THREE.PointLight(0xffc888, 0, 34, 2);
  light.position.y = height - 0.4;
  group.add(light);

  group.userData.bulb = bulb;
  group.userData.pool = pool;
  group.userData.light = light;
  group.userData.height = height;
  return group;
}

export function buildNightLights(model, scene) {
  const group = new THREE.Group();
  group.name = 'nightLights';
  scene.add(group);

  const windows = [];
  const lamps = [];
  const interiorLights = [];
  const groundAt = (x, z) => model.heightAt(x, z);

  // ---------- 谷仓 ----------
  const barn = BUILDINGS.barn;
  const by = groundAt(barn.x, barn.z);
  const bw = 13, bd = 20, bh = 9;

  // ★ 新谷仓模型（barnDemo）只有【山墙阁楼窗】，没有侧窗。
  //   坐标要和 barnDemo.js 里的阁楼窗对齐：
  //     x=0, y=H+0.55=9.55, z=D/2=10, 尺寸 2.6×1.9
  //   之前按旧模型的「阁楼窗 + 两侧窗」放了 3 个发光平面，
  //   新模型上侧窗位置是实墙，会看到两块浮空的亮斑。
  // ★ 谷仓阁楼窗的发光平面必须推到【所有几何之外】。
  //   新模型阁楼窗的层次（局部 z，D=20 → gableZ=10）：
  //     外框      10.06
  //     深色窗洞  10.14（前表面 10.22）
  //     干草      10.22（前表面 10.43）  ← 最靠外
  //     干草暗层  10.32（前表面 10.47）  ← 最靠外
  //   原来发光平面放在 10.20，被干草完全挡住，夜里只看到一个黑洞。
  //   现在推到 10.56（比干草暗层再外 0.09）。
  const gableWin = makeWindow(2.6, 1.9, 0, 9.55 + 0.95, bd / 2 + 0.56, 0, 'barn');
  gableWin.position.applyAxisAngle(new THREE.Vector3(0, 1, 0), barn.rot);
  gableWin.position.x += barn.x;
  gableWin.position.y += by;
  gableWin.position.z += barn.z;
  gableWin.rotation.y = barn.rot;
  group.add(gableWin);
  windows.push(gableWin);

  const barnLight = new THREE.PointLight(0xffb060, 0, 30, 2);
  barnLight.position.set(barn.x, by + 5, barn.z);
  group.add(barnLight);
  interiorLights.push(barnLight);

  // ---------- 谷仓门口壁灯（左右各一盏）----------
  const wallLampParts = [];
  const wallLampLocalX = 4.4;
  for (const side of [-1, 1]) {
    const off = new THREE.Vector3(side * wallLampLocalX, 0, bd / 2 + 0.3)
      .applyAxisAngle(new THREE.Vector3(0, 1, 0), barn.rot);
    const lx = barn.x + off.x;
    const lz = barn.z + off.z;
    const ly = by + 5.51;

    const bulbMat = new THREE.MeshBasicMaterial({
      color: 0xffc870, transparent: true, opacity: 0,
      depthWrite: false, blending: THREE.AdditiveBlending,
    });
    const bulb = new THREE.Mesh(new THREE.SphereGeometry(0.13, 8, 6), bulbMat);
    bulb.position.set(lx, ly, lz);
    bulb.renderOrder = 3;
    group.add(bulb);

    const poolMat = new THREE.ShaderMaterial({
      uniforms: THREE.UniformsUtils.clone(PoolShader.uniforms),
      vertexShader: PoolShader.vertexShader,
      fragmentShader: PoolShader.fragmentShader,
      transparent: true, depthWrite: false,
      blending: THREE.AdditiveBlending, side: THREE.DoubleSide,
    });
    const pool = new THREE.Mesh(new THREE.PlaneGeometry(9, 9), poolMat);
    pool.rotation.x = -Math.PI / 2;
    pool.position.set(lx + side * 0.8, by + 0.08, lz + 2.0);
    pool.renderOrder = 2;
    group.add(pool);

    const light = new THREE.PointLight(0xffb860, 0, 18, 2);
    light.position.set(lx, ly - 0.1, lz + 0.15);
    group.add(light);
    wallLampParts.push({ bulb, pool, light });
  }

  // ---------- 牛羊圈苹果树：吊灯 ----------
  // 树本身可以通过 UI 换模型，所以灯泡不写死坐标：
  // 每帧读取这棵树的包围盒，按当前树高/树冠宽度重新计算挂点。
  let pastureTree = null;
  scene.traverse((o) => {
    if (pastureTree) return;
    if (!o.name || !o.name.startsWith('tree-')) return;
    if (Math.hypot(o.position.x + 38, o.position.z - 50) < 3) pastureTree = o;
  });

  const treeLamp = new THREE.Group();
  treeLamp.name = 'tree-hanging-lamp';
  const cordH = 1.8;
  const cord = new THREE.Mesh(
    new THREE.CylinderGeometry(0.022, 0.028, cordH, 5),
    new THREE.MeshBasicMaterial({ color: 0x2f241b })
  );
  const branch = new THREE.Mesh(
    new THREE.CylinderGeometry(0.075, 0.095, 1, 5),
    new THREE.MeshBasicMaterial({ color: 0x7a4a2c })
  );
  treeLamp.add(branch);

  const socket = new THREE.Mesh(
    new THREE.CylinderGeometry(0.10, 0.12, 0.16, 8),
    new THREE.MeshBasicMaterial({ color: 0x2a2018 })
  );
  const treeBulbMat = new THREE.MeshBasicMaterial({
    color: 0xffc46a,
    transparent: true,
    opacity: 0.72,
    depthWrite: false,
    toneMapped: false,
  });
  const treeBulb = new THREE.Mesh(new THREE.SphereGeometry(0.21, 8, 6), treeBulbMat);
  treeBulb.renderOrder = 3;
  const treeLight = new THREE.PointLight(0xffb060, 0, 15, 2);
  const shade = new THREE.Mesh(
    new THREE.ConeGeometry(0.30, 0.22, 8),
    new THREE.MeshBasicMaterial({ color: 0x2a2018 })
  );
  treeLamp.add(cord, socket, treeBulb, shade, treeLight);
  group.add(treeLamp);

  const treeBox = new THREE.Box3();
  function updateTreeLamp() {
    if (!pastureTree) { treeLamp.visible = false; return; }
    treeLamp.visible = true;
    treeBox.setFromObject(pastureTree);
    const min = treeBox.min, max = treeBox.max;
    const h = Math.max(0.8, max.y - min.y);
    const cx = (min.x + max.x) * 0.5;
    const cz = (min.z + max.z) * 0.5;
    const rx = Math.max(0.6, (max.x - min.x) * 0.5);
    const rz = Math.max(0.6, (max.z - min.z) * 0.5);
    // 灯泡挂在树冠外的枝端，再用一根小树枝连回树干，避免浮空。
    const x = cx + rx * 0.62;
    const z = cz + rz * 0.68;
    const gy = groundAt(x, z);
    const bulbY = gy + h * 0.32;
    // 挂枝只比灯泡高一点，保证从树冠下缘就能看到连接
    const cordTop = gy + h * 0.32 + 0.75;
    const cordLen = Math.max(0.7, cordTop - bulbY - 0.1);
    cord.scale.y = cordLen / cordH;
    cord.position.set(x, cordTop - cordLen * 0.5, z);
    // 从树干中心伸到吊线顶部的小树枝
    const bx = x - cx, bz = z - cz;
    const blen = Math.max(0.35, Math.hypot(bx, bz));
    branch.position.set((x + cx) * 0.5, cordTop, (z + cz) * 0.5);
    branch.scale.set(1, blen, 1);
    branch.quaternion.setFromUnitVectors(
      new THREE.Vector3(0, 1, 0),
      new THREE.Vector3(bx, 0, bz).normalize()
    );
    socket.position.set(x, bulbY + 0.13, z);
    treeBulb.position.set(x, bulbY, z);
    shade.position.set(x, bulbY + 0.24, z);
    treeLight.position.set(x, bulbY - 0.06, z);
  }
  updateTreeLamp();
  group.userData.updateTreeLamp = updateTreeLamp;

  // ---------- 农舍 ----------  // ---------- 农舍 ----------
  const house = BUILDINGS.farmhouse;
  const hy = groundAt(house.x, house.z);
  const hw = 11, hd = 13;

  // ★ 坐标要和 barnDemo.js 里农舍的窗户对齐：
  //   正面 windowAt(2.5, 2.3, dz) / windowAt(-4.2, 2.3, dz)，dz = D/2 = 6.5
  //   侧面 sideWin(W/2, 1.8)，W/2 = 5.5
  //   窗玻璃中心比窗框中心高 0.28+0.62/2 ≈ 0.9
  const houseWinDefs = [
    // ★ 正面窗层次（局部 z，D=13 → dz=6.5）：
    //     白框 z+0.08 / 蓝框 z+0.14 / 玻璃 z+0.18 / 十字窗棂 z+0.23
    //   发光平面放 z+0.26，正好在窗棂外面。
    { lx: 2.5, ly: 3.2, lz: hd / 2 + 0.26, ry: 0 },
    { lx: -4.2, ly: 3.2, lz: hd / 2 + 0.26, ry: 0 },
    // 侧面窗同理：玻璃前表面 x+0.18，发光平面放 x+0.26
    { lx: hw / 2 + 0.26, ly: 3.2, lz: 1.8, ry: Math.PI / 2 },
  ];

  for (const d of houseWinDefs) {
    const win = makeWindow(1.44, 1.24, d.lx, d.ly, d.lz, d.ry, 'house');
    win.position.applyAxisAngle(new THREE.Vector3(0, 1, 0), house.rot);
    win.position.x += house.x;
    win.position.y += hy;
    win.position.z += house.z;
    win.rotation.y = house.rot + d.ry;
    group.add(win);
    windows.push(win);
  }

  const houseLight = new THREE.PointLight(0xffc080, 0, 26, 2);
  houseLight.position.set(house.x, hy + 3.5, house.z);
  group.add(houseLight);
  interiorLights.push(houseLight);

  // ---------- 路灯 ----------
  const lampSpots = [
    // 谷仓旁：照亮谷仓门前的空地
    { x: barn.x + 10, z: barn.z + 14 },
    // ★ 草垛和水塔之间：右侧草垛在 (20,18)/(23,21)，水塔在 (48,10)，
    //   这盏灯放在中点 (35,15)，正好照亮这片开阔地。
    { x: 35, z: 15 },
    // 空地：农舍与田地之间
    { x: 12, z: -18 },
  ];

  for (const spot of lampSpots) {
    const lamp = makeLampPost(5.5);
    lamp.position.set(spot.x, groundAt(spot.x, spot.z), spot.z);
    group.add(lamp);
    lamps.push(lamp);
  }

  // ---------- 更新 ----------
  group.userData.update = (t) => {
    // 灯光只在"傍晚之后"亮起。
    // t=0.5 是中午，t=1.0 是夜晚。
    // 之前 0.55 就亮（相当于下午两三点），太早了。
    // 现在 0.72 才开始微亮（约傍晚六点），0.95 全亮。
    const k = Math.max(0, Math.min(1, (t - 0.72) / 0.23));
    const winOpacity = k * k * (3 - 2 * k);

    // 阈值从 0.01 提到 0.06：透明度极低时直接不渲染，
    // 减少透明物体的排序和混合开销（夜晚有 9 扇窗 + 5 个室内光 + 3 个路灯）
    for (const w of windows) {
      w.material.opacity = winOpacity * 0.95;
      w.visible = winOpacity > 0.06;
    }

    // 室内光：decay=2 需要较大强度
    for (const l of interiorLights) {
      l.intensity = winOpacity * 42;
      l.visible = winOpacity > 0.06;
    }

    // 壁灯：左右两盏同步
    for (const wl of wallLampParts) {
      wl.bulb.material.opacity = winOpacity * 0.90;
      wl.bulb.visible = winOpacity > 0.06;
      wl.pool.material.uniforms.uOpacity.value = winOpacity * 0.16;
      wl.pool.visible = winOpacity > 0.06;
      wl.light.intensity = winOpacity * 20;
      wl.light.visible = winOpacity > 0.06;
    }

    updateTreeLamp();
    // 树吊灯：白天保留暗黄玻璃，夜里点亮
    treeBulb.material.opacity = 0.72 + winOpacity * 0.28;
    treeBulb.visible = true;
    treeLight.intensity = winOpacity * 16;
    treeLight.visible = winOpacity > 0.06;

    for (const lamp of lamps) {
      const u = lamp.userData;
      u.bulb.material.opacity = winOpacity * 0.95;
      u.bulb.visible = winOpacity > 0.06;

      // 光斑：柔和径向衰减
      // 光斑不透明度从 0.55 降到 0.28：
      // AdditiveBlending 叠加在亮草地上会过曝，中心变成纯白一片
      u.pool.material.uniforms.uOpacity.value = winOpacity * 0.28;
      u.pool.visible = winOpacity > 0.06;

      // 点光源：必须和灯泡同步，否则"灯没亮但地面已经被照亮"
      // （之前用 t * 55，t=0.5 时强度就 27.5，下午路灯就在照地了）
      // 范围从 26 -> 34 后，同样距离的衰减更强，强度要补一点
      // 强度从 78 降到 52：光斑减淡后不需要那么强的点光，
      // 否则地面还是会亮成一片
      u.light.intensity = winOpacity * 52;
      u.light.visible = winOpacity > 0.06;
    }
  };

  group.userData.update(0);
  return group;
}