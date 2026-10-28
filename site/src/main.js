import * as THREE from '../vendor/three/three.module.js';

import { LIGHT, DUSK_T, PALETTE, SEASON } from './config.js';
import { makeRng } from './util/rng.js';
import { detectDevice, getQuality, logDeviceInfo } from './util/quality.js';
import { createTerrainModel, buildTerrain, buildPond } from './world/terrain.js';
import { buildPondLife } from './world/pond.js';
import { buildPondStones } from './world/pondstones.js';
import { buildWatermill } from './world/watermill.js';
import { buildSeasonFX } from './world/seasonfx.js';
import { buildCampfire } from './world/campfire.js';
import { buildOwl, refreshWatertowerPerch, refreshWindmillPerch } from './world/owl.js';
import { buildBigTree, buildTree } from './world/bigtree.js';
import { buildWoodpile } from './world/woodpile.js';
import { buildWell } from './world/well.js';
import { buildWorkshop } from './world/workshop.js';
import { buildGroundStones } from './world/groundstones.js';
import { buildDirtPits } from './world/dirtpits.js';
import { buildContactShadows } from './world/contactshadows.js';
import { buildSky, buildStars, buildClouds } from './world/sky.js';
import { buildBirds } from './world/birds.js';
import { buildForest, buildScatterTrees } from './world/forest.js';
import { buildGrassTufts } from './world/grass.js';
import { buildFarm } from './world/farm.js';
import { buildFields } from './world/fields.js';
import { BUILDINGS, TRUCK, PASTURE, TREE_SPECS, BIG_TREE, WOODPILE, WELL, WORKSHOP } from './world/layout.js';
import { buildTruck, TRUCK_STYLES } from './world/truck.js';
import { buildNightLights } from './world/nightlights.js';
import { buildRoad, buildCar } from './world/road.js';
import { buildAnimals, buildPeople } from './world/animals.js';
import { buildPets } from './world/pets.js';
import { buildLogLady } from './world/loglady.js';
import { createLighting } from './render/lighting.js';
import { createComposer } from './render/composer.js';
import { setToonEnabled, setToonSteps, driveToonTint } from './render/toon.js';
import { createCameraRig } from './camera/rig.js';
import { createAmbient } from './audio/ambient.js';
import { createHud } from './ui/hud.js';
import { addOutlineDeep, setOutlineFog, outlineSettings } from './render/outline.js';
import { installCursors } from './ui/cursors.js';

const app = {};
const clock = new THREE.Clock();
let elapsed = 0;

const ROAD_POINTS = [
  [-118, -6], [-96, 46], [-52, 78], [6, 88], [62, 74],
  [104, 40], [116, -12], [96, -62], [44, -88], [-16, -92], [-72, -66], [-110, -34], [-118, -6],
];

function boot() {
  const seed = 20240521;
  const rng = makeRng(seed);

  // ---------- 设备检测与画质分级 ----------
  const device = detectDevice();
  const quality = getQuality(device);
  logDeviceInfo(device, quality);

  // ---------- renderer ----------
  const renderer = new THREE.WebGLRenderer({
    antialias: false,
    powerPreference: 'high-performance',
    alpha: false,
    stencil: false,
  });
  renderer.domElement.id = 'scene';
  renderer.setPixelRatio(Math.min(window.devicePixelRatio, quality.maxPixelRatio));
  renderer.setSize(window.innerWidth, window.innerHeight);
  // 注意：tone mapping 和 sRGB 编码改由 composer 里的 toneMap pass 执行
  // （必须在 Bloom 之前，否则 Bloom 看到的是 HDR 值，阈值失效）
  renderer.outputColorSpace = THREE.LinearSRGBColorSpace;
  renderer.toneMapping = THREE.NoToneMapping;
  renderer.toneMappingExposure = 1.0;
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = THREE.PCFSoftShadowMap;
  document.body.appendChild(renderer.domElement);

  // ---------- scene ----------
  const scene = new THREE.Scene();
  scene.fog = new THREE.Fog(LIGHT.day.fog, LIGHT.day.fogNear, LIGHT.day.fogFar);
  scene.background = new THREE.Color(PALETTE.skyDay);

  const terrainModel = createTerrainModel(seed);
  // 地形细分按画质调整
  const terrain = buildTerrain(terrainModel, quality.terrainSegments);
  scene.add(terrain);

  const sky = buildSky();
  scene.add(sky);

  const stars = buildStars(700);
  stars.material.uniforms.uPixelRatio.value = renderer.getPixelRatio();
  scene.add(stars);

  // 棉花团云朵：数量按画质档位（high 18 / medium 12 / low 8）
  // ★ 不加描边 —— 云不在下面的 addOutlineDeep 列表里，
  //   每个 mesh 另有 userData.noOutline = true 兜底。
  const clouds = buildClouds(quality.cloudCount || 12, rng);
  scene.add(clouds);

  // 太阳 / 月亮不再是独立面片，直接画在天空球 shader 里（见 world/sky.js）。
  // 面片走 AdditiveBlending，在 8bit RT + ACES 管线里叠加量几乎为零，
  // 而且同一状态连渲两次结果都不稳定 —— 画进不透明的天穹最稳。

  // 飞鸟：5 个品种，各自独立飞行
  // 鸟：从 5 只增加到 14 只，配合 3 种飞行模式，天空更热闹
  const birds = buildBirds(14, rng, terrainModel, { BUILDINGS, PASTURE });
  scene.add(birds);

  const lighting = createLighting(scene, quality);
  const rig = createCameraRig(renderer, terrainModel);

  // ---------- world ----------
  const world = new THREE.Group();
  scene.add(world);

  const forest = buildForest(terrainModel, rng, quality.treeCount);
  world.add(forest);

  const grass = buildGrassTufts(terrainModel, rng, quality.grassCount);
  world.add(grass.mesh);

  // 地面散石：单块/成对/成群，避开田地、建筑和池塘
  const groundStones = buildGroundStones(terrainModel, rng, quality.tier === 'low' ? 55 : 95);
  world.add(groundStones);

  // 动物圈里的刨土坑：优先落在黄土地上，带翻出的土块
  const dirtPits = buildDirtPits(terrainModel, rng, quality.tier === 'low' ? 10 : 20);
  world.add(dirtPits);

  const farm = buildFarm(terrainModel);
  world.add(farm);

  const fields = buildFields(terrainModel, rng);
  world.add(fields);

  // ★ 池塘：就在坐着的人 (-78,-23) 正前方，池心 (-78,2)
  const pond = buildPond(terrainModel, { x: BUILDINGS.pond.x, z: BUILDINGS.pond.z }, BUILDINGS.pond.r);
  // 水面用正圆收边：岸坡环保留但隐藏，水盘半径略小于地形水线，
  // 这样水边是光滑圆弧，不是地形粗网格切出来的锯齿。
  const pondBank = pond.getObjectByName('pondBank');
  if (pondBank) pondBank.visible = false;
  const waterMesh = pond.children.find((c) => c.isMesh && c.material && c.material.uniforms && c.material.uniforms.uTime);
  if (waterMesh) {
    const desiredR = BUILDINGS.pond.r * 0.95;
    const baseR = pond.userData.waterR || desiredR;
    const wScale = desiredR / baseR;
    waterMesh.scale.set(wScale, 1, wScale);
    waterMesh.material.uniforms.uRadius.value = desiredR;
    const baseSeason = pond.userData.setSeason;
    pond.userData.setSeason = (t) => {
      baseSeason(t);
      waterMesh.scale.set(wScale, 1, wScale);
      waterMesh.material.uniforms.uRadius.value = desiredR;
    };
    pond.userData.setSeason(0);
  }
  world.add(pond);

  // 池边石圈：大小/高低错落，水车那侧自动留缺口
  const stoneWaterY = pond.userData.waterY ?? 5.35;
  world.add(buildPondStones(terrainModel, { x: BUILDINGS.pond.x, z: BUILDINGS.pond.z }, BUILDINGS.pond.r, rng, stoneWaterY));


  // 水池生态：鱼 + 荷叶 + 水藻
  const pondLife = buildPondLife(
    terrainModel,
    { x: BUILDINGS.pond.x, z: BUILDINGS.pond.z },
    BUILDINGS.pond.r,
    rng
  );
  world.add(pondLife);

  // 季节特效：樱花/落叶/雪 + 蝴蝶/蜜蜂 + 南瓜/雪人
  const seasonFX = buildSeasonFX(terrainModel, rng, quality);
  scene.add(seasonFX);

  // 篝火露营区（农舍南侧开阔地）
  const campfire = buildCampfire(terrainModel, rng, { x: 26, z: 8 });
  world.add(campfire);

  // 水车（池塘西侧）
  const watermill = buildWatermill(terrainModel, rng, { x: -93, z: 2 });
  world.add(watermill);

  // 猫头鹰彩蛋（双峰致敬）：随机停在谷仓/农舍/水塔/风车屋顶
  const owl = buildOwl(terrainModel, rng);

  world.add(owl);

  // 农场正中央的参天大树（地标）
  const bigtree = buildBigTree(terrainModel, rng, { x: BIG_TREE.x, z: BIG_TREE.z });
  world.add(bigtree);

  // 大树下的木材堆（刚劈好的木柴 + 树桩 + 斧头）
  // 大树树干在 (-2, -18)，半径 1.6，树根延伸到约 3 单位。
  // 木材堆自身包围盒约 X[-3.5, 3.5]，所以中心要放到 x >= 2.5 才不碰树干。
  // 实测中心 (2.5, -17) 时左边界 -1.0 会碰到树干，改到 (6.5, -16)。
  const woodpile = buildWoodpile(terrainModel, rng, { x: WOODPILE.x, z: WOODPILE.z });
  world.add(woodpile);

  // 水井：木材堆另一边
  const well = buildWell(terrainModel, rng, { x: WELL.x, z: WELL.z });
  world.add(well);

  // 农舍东侧：修理棚工作区（整体旋转，和农舍平行）
  const workshopInner = buildWorkshop(terrainModel, rng);
  workshopInner.position.set(-66, 0, -2);   // 把原有绝对坐标收回到自己中心
  const workshop = new THREE.Group();
  workshop.name = 'workshop';
  workshop.position.set(WORKSHOP.x, 0, WORKSHOP.z);
  workshop.rotation.y = WORKSHOP.rot;
  workshop.add(workshopInner);
  workshop.userData.setNight = (t) => workshopInner.userData.setNight(t);
  workshop.userData.getStyle = () => workshopInner.userData.getStyle();
  workshop.userData.setStyle = (idx) => workshopInner.userData.setStyle(idx);
  workshop.userData.styleNames = workshopInner.userData.styleNames;
  world.add(workshop);

  // 另外 3 棵不同品种的树（有大有小，丰富场景）
  // 位置都经过间隙检查（≥3 单位），不会穿模
  const extraTrees = new THREE.Group();
  extraTrees.name = 'trees';
  for (const spec of TREE_SPECS) {
    extraTrees.add(buildTree(terrainModel, rng, spec));
  }

  // 点缀树：按俯视图蓝圈标注的 5 处草地空位固定放置（70% / 50% 两档尺寸）
  const scatterTrees = buildScatterTrees(terrainModel, rng, buildTree);
  extraTrees.add(scatterTrees);

  world.add(extraTrees);

  // 接触阴影：建筑脚下、树根、围栏脚边
  {
    const buildings = [
      { x: BUILDINGS.barn.x, z: BUILDINGS.barn.z, sx: 16, sz: 23, rot: BUILDINGS.barn.rot },
      { x: BUILDINGS.farmhouse.x, z: BUILDINGS.farmhouse.z, sx: 14, sz: 16, rot: BUILDINGS.farmhouse.rot },
      { x: BUILDINGS.silo1.x, z: BUILDINGS.silo1.z, sx: 9, sz: 9 },
      { x: BUILDINGS.silo2.x, z: BUILDINGS.silo2.z, sx: 9, sz: 9 },
      { x: BUILDINGS.watertower.x, z: BUILDINGS.watertower.z, sx: 11, sz: 11 },
      { x: BUILDINGS.windmill.x, z: BUILDINGS.windmill.z, sx: 8, sz: 8 },
      { x: workshop.position.x, z: workshop.position.z, sx: 15, sz: 10, rot: WORKSHOP.rot },
      { x: watermill.position.x, z: watermill.position.z, sx: 10, sz: 6 },
      { x: WELL.x, z: WELL.z, sx: 4.5, sz: 4.5 },
      { x: BIG_TREE.x, z: BIG_TREE.z, sx: 8.5, sz: 8.5 },
    ];
    const trees = [];
    extraTrees.traverse((tr) => {
      if (!tr.userData || !tr.userData.kind || !tr.userData.scale) return;
      if (!tr.name || !tr.name.startsWith('tree-')) return;
      const sc = tr.userData.scale || 1;
      trees.push({ x: tr.position.x, z: tr.position.z, sx: 2.05 * sc, sz: 2.05 * sc });
    });
    const contactShadows = buildContactShadows(terrainModel, {
      buildings,
      trees,
      fences: farm.userData.fenceSlots || [],
    });
    world.add(contactShadows);
  }

  const road = buildRoad(terrainModel, ROAD_POINTS, 5.5);
  world.add(road);

  const car = buildCar(terrainModel, road.userData.curve, 0.1);
  world.add(car);

  // 农用卡车（四种造型可运行时切换）
  let truckStyle = 'pickup';
  let truck = buildTruck(truckStyle);
  const truckBaseY = terrainModel.heightAt(TRUCK.x, TRUCK.z) - 0.05;
  truck.position.set(TRUCK.x, truckBaseY, TRUCK.z);
  truck.rotation.y = TRUCK.rot;
  truck.userData.baseY = truckBaseY;   // 悬挂动画的基准高度
  world.add(truck);

  // 重建卡车（切换造型时调用）
  function rebuildTruck(style) {
    if (!TRUCK_STYLES.includes(style)) return null;
    const old = truck;
    if (old) {
      world.remove(old);
      old.traverse((o) => {
        if (o.isMesh) {
          if (o.geometry) o.geometry.dispose();
          if (o.material) {
            if (Array.isArray(o.material)) o.material.forEach((m) => m.dispose());
            else o.material.dispose();
          }
        }
      });
    }
    truckStyle = style;
    const nm = buildTruck(style);
    nm.position.set(TRUCK.x, truckBaseY, TRUCK.z);
    nm.rotation.y = TRUCK.rot;
    nm.userData.baseY = truckBaseY;
    world.add(nm);
    truck = nm;
    // ★ 同步 app.truck —— main.js 每帧调 app.truck.userData.update(dt)，
    //   hud 的存档也读 app.truck，不更新的话会引用已删除的旧对象。
    app.truck = nm;
    return nm;
  }

  const animals = buildAnimals(terrainModel, rng, quality.animalCount);
  world.add(animals);

  const people = buildPeople(terrainModel, rng);
  world.add(people);

  // 宠物：狗 Brioche + 猫 Cortado（随机走动 / 睡觉 / 吃东西）
  const pets = buildPets(terrainModel, rng);
  world.add(pets);

  // Log Lady（双峰致敬）：坐在篝火旁的木桩上，抱着木头跟它说话
  // 必须在 campfire 之后构建 —— 座位坐标来自 campfire.userData.stumpSeats
  const logLady = buildLogLady(terrainModel, campfire);
  world.add(logLady);

  // 夜间灯光（窗户发光 + 路灯）
  const nightLights = buildNightLights(terrainModel, scene);

  const post = createComposer(renderer, scene, rig.camera, quality);
  const ambient = createAmbient();

  Object.assign(app, {
    renderer, scene, terrainModel, terrain, sky, stars, clouds, birds, lighting, rig, device, quality,
    world, forest, grass, farm, fields, pond, pondLife, seasonFX, campfire, watermill, owl, bigtree, extraTrees, woodpile, well, workshop, road, car, truck, animals, people, pets, logLady, nightLights, post, ambient,
    // 默认从中午开始（t=0.5），滑杆向左是早晨迷雾，向右是夜晚
    mode: { t: 0.5, target: 0.5 },
    // 调试/调参用：描边雾衰减（farScale<1 更早入雾，power<1 更早饱和）
    setOutlineFog,
    setOutlineEnabled(v) {
      outlineSettings.enabled = !!v;
      scene.traverse(function (o) {
        if (o.userData && o.userData.isOutline) o.visible = !!v;
      });
    },
  });

  // 季节占位：只改树冠/草地颜色
  const seasonColors = { pines: [], rounds: [] };
  // app.seasonT 必须在第一次 applyMode 之前就有值：
  // applyMode 用它算「春夏季天空提饱和度」的权重，缺省会走 typeof 兜底。
  app.seasonT = 1;
  app.setSeason = (idx) => applySeason(idx);
  // 应用初始季节（夏季），让地形/树的材质色初始化到正确状态
  applySeason(1);   // 默认夏季

  // ---------- 预热着色器 ----------
  // 首次拖时间滑杆会触发大量材质切换（夜晚灯光、窗户贴图、篝火、季节粒子等），
  // 每个新状态首次出现时都要编译着色器，导致明显卡顿。
  //
  // 分两步预热：
  //   1. renderer.compile(scene, camera) —— 编译所有当前可见材质
  //   2. 把时间/季节扫一遍并渲染一帧 —— 让隐藏的材质也编译
  if (quality.tier === 'high') {
  try {
    const t0 = performance.now();

    // ★ 关键：先把场景里所有隐藏对象临时设为可见。
    //   renderer.compile() 只编译 visible 的材质，
    //   而夜晚灯光、篝火、季节粒子在 t=0.5 时都是隐藏的，
    //   所以直接 compile 会漏掉一半 —— 实测拖动时会新编译 33 个 program。
    const hidden = [];
    scene.traverse((o) => {
      if (o.visible === false) {
        hidden.push(o);
        o.visible = true;
      }
    });

    // 第一步：编译场景里所有材质（此时全部可见）
    //   注意：compile() 只处理"当前相机能看到的"，
    //   所以先把相机拉到很远的俯视位置，确保整个场景在视锥内。
    const savedPos = rig.camera.position.clone();
    const savedTarget = rig.controls.target.clone();
    const savedFar = rig.camera.far;

    rig.camera.far = 2000;
    rig.camera.position.set(0, 420, 1);
    rig.controls.target.set(0, 0, 0);
    rig.camera.lookAt(0, 0, 0);
    rig.camera.updateMatrixWorld(true);
    rig.camera.updateProjectionMatrix();

    renderer.compile(scene, rig.camera);

    // 第二步：扫一遍时间和季节，让所有状态都过一遍
    const warmTimes = [0, 0.5, 1];
    const warmSeasons = [0, 1, 2, 3];
    for (const st of warmSeasons) {
      applySeason(st);
      for (const t of warmTimes) {
        applyMode(t);
        app.post.composer.render(0.016);
      }
    }

    // 恢复隐藏状态
    for (const o of hidden) o.visible = false;

    // 恢复相机
    rig.camera.far = savedFar;
    rig.camera.position.copy(savedPos);
    rig.controls.target.copy(savedTarget);
    rig.camera.lookAt(savedTarget);
    rig.camera.updateMatrixWorld(true);
    rig.camera.updateProjectionMatrix();

    // 恢复默认状态
    applySeason(1);
    applyMode(app.mode.t);
    app.post.composer.render(0.016);

    console.log('[Meadowland] 着色器预热完成 (' + Math.round(performance.now() - t0) + 'ms)');
  } catch (e) {
    console.warn('[Meadowland] 预热跳过:', e.message);
  }
  } else if (quality.tier === 'medium') {
    try {
      renderer.compile(scene, rig.camera);
      console.log('[Meadowland] 中配仅编译可见材质');
    } catch (e) {
      console.warn('[Meadowland] 预热跳过:', e.message);
    }
  } else {
    console.log('[Meadowland] 低配跳过着色器预热');
  }

  window.addEventListener('resize', resize, { passive: true });
  window.addEventListener('orientationchange', () => setTimeout(resize, 220));
  resize();

  app.applyMode = applyMode;

  // 卡车造型切换接口
  //   ★ 必须在 boot() 内部暴露 —— rebuildTruck 是 boot 的局部函数，
  //     写到 boot 外面（文件末尾）会报 "rebuildTruck is not defined"。
  app.rebuildTruck = rebuildTruck;
  app.getTruckStyle = () => truckStyle;
  app.truckStyles = TRUCK_STYLES;

  installCursors();

  // ---------------------------------------------------------------------------
  // 卡通描边（反向外壳）
  //
  // 只给【实体】物体加描边，让轮廓清晰 —— 三渲二最标志性的特征。
  // 描边 Mesh 和本体共用 geometry，零额外顶点数据。
  //
  // 自动跳过：半透明物体、MeshBasicMaterial（招牌/窗户/星星）、过小物体。
  // 不给地面/田地加（面积太大会变成粗黑线）。
  // ---------------------------------------------------------------------------
  {
    const THICK_BUILDING = 0.055;   // 建筑
    const THICK_MEDIUM = 0.045;     // 树 / 车 / 水车 / 木材堆
    const THICK_SMALL = 0.020;      // 动物 / 人物
    let total = 0;

    if (app.farm) total += addOutlineDeep(app.farm, THICK_BUILDING);
    if (app.bigtree) total += addOutlineDeep(app.bigtree, THICK_MEDIUM);
    if (app.extraTrees) total += addOutlineDeep(app.extraTrees, THICK_MEDIUM);
    // 周围森林【不加描边】：
    //   森林是远景环抱的 900 棵树，加了描边会变成一大圈黑线，
    //   把视线往外拉、也和"只强调互动场景"的三渲二风格冲突。
    //   （森林本身 castShadow=false，本来就不参与阴影）

    [app.truck, app.car, app.watermill, app.campfire, app.woodpile, app.owl]
      .forEach((o) => { if (o) total += addOutlineDeep(o, THICK_MEDIUM); });

    if (app.animals) total += addOutlineDeep(app.animals, THICK_SMALL);
    if (app.people) total += addOutlineDeep(app.people, THICK_SMALL);
    if (app.pets) total += addOutlineDeep(app.pets, THICK_SMALL);
    if (app.logLady) total += addOutlineDeep(app.logLady, THICK_SMALL);
    if (app.birds) total += addOutlineDeep(app.birds, 0.014, undefined, { minRadius: 0.15 });

    console.log('[Meadowland] 描边: ' + total + ' 个 Mesh');
  }

  app.hud = createHud(app);

  app.running = true;
  loop();
}

function resize() {
  const w = window.innerWidth;
  const h = window.innerHeight;
  app.renderer.setPixelRatio(Math.min(window.devicePixelRatio, app.quality?.maxPixelRatio ?? 2));
  app.renderer.setSize(w, h);
  app.rig.updateFov();
  app.post.setPixelRatio(app.renderer.getPixelRatio());
  app.post.setSize(w, h);
  app.stars.material.uniforms.uPixelRatio.value = app.renderer.getPixelRatio();
}

// ---------- 昼夜插值 ----------
// 三段式天空色：早晨（雾白偏冷）→ 中午（晴朗蓝）→ 夜晚（深蓝）
// 天空色注意：这些值直接输出到画面，不经过光照。
// 如果太亮会超过 Bloom 阈值（0.90），整片天空泛光 → 看起来"过曝"。
// 实测 sRGB 要控制在 0.80 以下才安全。
// 三色渐变：天顶（top）-> 中层（mid）-> 地平线（bottom）
// 注意：天空不经过光照，直接输出，sRGB 要控制在 0.80 以下避免 Bloom 过曝
const skyTopMorning = new THREE.Color(0x4a7ab8);      // 早晨天顶：深蓝
const skyTopDay = new THREE.Color(0x3a7ac8);          // 正午天顶：饱和蓝
const skyTopDusk = new THREE.Color(0x2a3a6a);         // 傍晚天顶：深蓝紫
const skyTopNight = new THREE.Color(0x0a1228);        // 夜晚天顶：深蓝黑

const skyMidMorning = new THREE.Color(0x88b4dc);      // 早晨中层：中蓝
const skyMidDay = new THREE.Color(0x8ac0f0);          // 正午中层：浅蓝
const skyMidDusk = new THREE.Color(0x7a5a8a);         // 傍晚中层：紫（日落过渡）
const skyMidNight = new THREE.Color(0x1a2a4a);        // 夜晚中层：深蓝

const skyBottomMorning = new THREE.Color(0xc4d4e0);   // 早晨地平线：雾白
const skyBottomDay = new THREE.Color(0xb4d2e4);       // 正午地平线：浅蓝白
const skyBottomDusk = new THREE.Color(0xe0906a);      // 傍晚地平线：橙
const skyBottomNight = new THREE.Color(0x14294a);     // 夜晚地平线
const bgMorning = new THREE.Color(0xbfd0da);
const bgDay = new THREE.Color(PALETTE.skyDay);
const bgDusk = new THREE.Color(0x9a7a92);             // 傍晚背景：紫灰
const bgNight = new THREE.Color(PALETTE.skyNight);
const _c = new THREE.Color();
const _c2 = new THREE.Color();
const _white = new THREE.Color(0xffffff);
const _sunVec = new THREE.Vector3();
const _tmpB = new THREE.Color();

// ---------------------------------------------------------------------------
// 天空"更蓝"：把 HSL 饱和度乘一个系数（色相、明度都不动）
//
// 用户反馈春夏季的天空不够蓝。直接把天顶色改深会同时压暗整片天，
// 这里只提饱和度：色相还是那个蓝，明度不变，只是"更纯"。
//   skyTopDay   0x3a7ac8 -> 饱和度 x1.30
//   skyMidDay   0x8ac0f0 -> 饱和度 x1.30
// 只在春/夏生效，秋天变褐、冬天变灰时不加，避免和季节色打架。
// ---------------------------------------------------------------------------
function boostSatHex(hex, mul) {
  const r = ((hex >> 16) & 255) / 255;
  const g = ((hex >> 8) & 255) / 255;
  const b = (hex & 255) / 255;

  const max = Math.max(r, g, b);
  const min = Math.min(r, g, b);
  const l = (max + min) / 2;
  const d = max - min;

  let h = 0;
  let s = 0;
  if (d > 1e-6) {
    s = l > 0.5 ? d / (2 - max - min) : d / (max + min);
    if (max === r) h = ((g - b) / d + (g < b ? 6 : 0)) / 6;
    else if (max === g) h = ((b - r) / d + 2) / 6;
    else h = ((r - g) / d + 4) / 6;
  }
  s = Math.min(1, s * mul);

  const hue2rgb = (p, q, t) => {
    let u = t;
    if (u < 0) u += 1;
    if (u > 1) u -= 1;
    if (u < 1 / 6) return p + (q - p) * 6 * u;
    if (u < 1 / 2) return q;
    if (u < 2 / 3) return p + (q - p) * (2 / 3 - u) * 6;
    return p;
  };

  let R = l, G = l, B = l;
  if (s > 1e-6) {
    const q = l < 0.5 ? l * (1 + s) : l + s - l * s;
    const p = 2 * l - q;
    R = hue2rgb(p, q, h + 1 / 3);
    G = hue2rgb(p, q, h);
    B = hue2rgb(p, q, h - 1 / 3);
  }
  const to255 = (v) => Math.max(0, Math.min(255, Math.round(v * 255)));
  return (to255(R) << 16) | (to255(G) << 8) | to255(B);
}

// 四段插值：morning → day → dusk → night
// （加了日落关键帧，否则傍晚会出现"暖光配蓝天空"的割裂感）
function triLerp(t, cMorning, cDay, cDusk, cNight, out) {
  if (t <= 0.5) {
    const k = smoothstep01(t / 0.5);
    return out.copy(cMorning).lerp(cDay, k);
  }
  if (t <= DUSK_T) {
    const k = smoothstep01((t - 0.5) / (DUSK_T - 0.5));
    return out.copy(cDay).lerp(cDusk, k);
  }
  const k = smoothstep01((t - DUSK_T) / (1 - DUSK_T));
  return out.copy(cDusk).lerp(cNight, k);
}

function smoothstep01(x) {
  const v = Math.max(0, Math.min(1, x));
  return v * v * (3 - 2 * v);
}

// 三段数值插值
function triNum(t, morning, day, dusk, night) {
  if (t <= 0.5) {
    const k = smoothstep01(t / 0.5);
    return morning + (day - morning) * k;
  }
  if (t <= DUSK_T) {
    const k = smoothstep01((t - 0.5) / (DUSK_T - 0.5));
    return day + (dusk - day) * k;
  }
  const k = smoothstep01((t - DUSK_T) / (1 - DUSK_T));
  return dusk + (night - dusk) * k;
}

function applyMode(t) {
  app.lighting.apply(t);

  // 曝光：早晨略高（雾天要提亮）、中午标准、夜晚再提一点
  const exposure = triNum(t, LIGHT.morning.exposure, LIGHT.day.exposure, LIGHT.dusk.exposure, LIGHT.night.exposure);
  app.renderer.toneMappingExposure = exposure;
  if (app.post && app.post.toneMap) {
    app.post.toneMap.uniforms.uExposure.value = exposure;
  }

  // ---------- 饱和度 / 对比度：中午最艳丽 ----------
  // 用一个"正午权重"：t=0.5 时最强，两端减弱
  //   t=0   早晨：sat 1.0（自然）
  //   t=0.5 中午：sat 1.38（艳丽）+ 对比 1.10
  //   t=1   夜晚：sat 1.05（略强，让灯光更暖）
  const noonW = Math.max(0, 1 - Math.abs(t - 0.5) / 0.5);   // 0~1，t=0.5 时为 1
  const smoothNoon = noonW * noonW * (3 - 2 * noonW);        // smoothstep

  // 三渲二风格：整体提高饱和度（不只是中午）
  //   基础 1.12（让所有时段都更鲜艳）
  //   中午额外 +0.26 -> 1.38
  const sat = 1.12 + smoothNoon * 0.26;
  const contrast = 1.0 + smoothNoon * 0.10;

  if (app.post && app.post.toneMap) {
    app.post.toneMap.uniforms.uSaturation.value = sat;
    app.post.toneMap.uniforms.uContrast.value = contrast;
  }

  // ---------- 三渲二色温：由三光源实际颜色驱动 ----------
  // 之前 uShadowTint 是写死的常量，冷补光的颜色进不到画面里。
  // 现在暗部色跟着冷补光走、亮部色跟着主光走，冷暖对比才看得见。
  driveToonTint(
    app.lighting.sun.color,
    app.lighting.fill.color,
    app.lighting.ambient.color,
    1.0
  );

  // 后期：Bloom / 移轴强度也走三段
  app.post.setDayNight(t);

  // 夜间灯光：只有后半段（中午→夜晚）才逐渐亮起
  // 早晨完全没有灯光，中午也没有，到傍晚开始亮
  app.nightLights.userData.update(t);

  // 星星：只在夜晚可见（0.75 之后才出现）
  // 星星：天完全黑下来才出现（0.85 之后）
  app.stars.material.uniforms.uOpacity.value =
    t <= 0.85 ? 0 : smoothstep01((t - 0.85) / 0.15);

  // 天空 / 背景：三段插值
  triLerp(t, bgMorning, bgDay, bgDusk, bgNight, _c);
  app.scene.background.copy(_c);

  // 春夏季天空更蓝：只提饱和度（+30%），色相和明度都不动。
  // 秋季（c>=1）逐渐退掉，冬天完全不提 —— 秋天天空本来就要偏暖褐。
  const sc = typeof app.seasonT === 'number' ? app.seasonT : 1;
  const blueW = sc <= 1 ? 1 : Math.max(0, 1 - (sc - 1) / 1.0);
  const SKY_SAT_BOOST = 1.30;
  const skySat = 1 + (SKY_SAT_BOOST - 1) * blueW;

  triLerp(t, skyTopMorning, skyTopDay, skyTopDusk, skyTopNight, _c);
  if (skySat > 1.001) {
    _c.setHex(boostSatHex(_c.getHex(), skySat));
  }
  app.sky.material.uniforms.uTop.value.copy(_c);

  // 中层色（三色渐变）
  if (app.sky.material.uniforms.uMid) {
    triLerp(t, skyMidMorning, skyMidDay, skyMidDusk, skyMidNight, _c);
    if (skySat > 1.001) {
      _c.setHex(boostSatHex(_c.getHex(), skySat));
    }
    app.sky.material.uniforms.uMid.value.copy(_c);
  }

  triLerp(t, skyBottomMorning, skyBottomDay, skyBottomDusk, skyBottomNight, _c2);
  app.sky.material.uniforms.uBottom.value.copy(_c2);

  // ---------- 雾色 = 远处天空的颜色 ----------
  // 之前雾色是写死的暖白（早晨 0xe6d8c8），把远处 74 单位高的外圈山脊
  // 整片洗成 (196,192,186) 的暖白，叠加 Bloom 后直接爆成纯白 ——
  // 这就是用户说的"镜头拉远之后地平线上的白色光团"。
  //
  // 现在雾色跟着天空地平线色走（地平线色 → 中层色 lerp 0.40），
  // 雾和天空同一个颜色，远处山脊只会"淡入天空"，不会再出现色块边界。
  if (app.scene.fog) {
    app.scene.fog.color.copy(_c2).lerp(app.sky.material.uniforms.uMid.value, 0.40);
  }

  // ---------- 云朵受光 ----------
  // 云不走三渲二（分阶光照会把云切成硬块），自己算：
  //   顶面 = 主光色往白里提，底面 = 天空中层色掺一点主光，
  //   边缘 = 地平线色提亮（逆光时的那圈亮边）。
  // dayW 控制昼夜：夜里云几乎化进夜空，白天才清晰。
  if (app.clouds && app.clouds.userData.setLight) {
    const dayW = 1 - smoothstep01((t - 0.80) / 0.20);
    app.clouds.userData.setLight(
      app.lighting.sun.color,
      app.sky.material.uniforms.uMid.value,
      _c2,
      dayW
    );
  }

  // ---------- 地平线辉光（三渲二特征）----------
  // 早晨和傍晚最强（太阳在地平线附近），中午较弱，夜晚中等（月光）
  const glow = app.sky.material.uniforms;
  if (glow.uGlowIntensity) {
    let gi = 0;
    let gcol = new THREE.Color();

    // 强度整体压到 0.3 量级：band 峰值本身是 1.0，颜色再乘 0.85~1.15
    // 会让地平线附近的像素值直接超过 1.0，ACES 后接近纯白，
    // 再被 Bloom（阈值 0.90）放大，就是用户看到的那团"白色光斑"。
    if (t < 0.25) {
      // 早晨：日出橙（0.85 -> 0.30）
      gi = (1 - t / 0.25) * 0.30;
      gcol.setHex(0xffb070);
    } else if (t < 0.55) {
      // 中午：弱白
      gi = 0.08;
      gcol.setHex(0xffffff);
    } else if (t < 0.85) {
      // 傍晚：日落橙红（1.15 -> 0.42）
      const k = (t - 0.55) / 0.30;
      gi = k * 0.42;
      gcol.setHex(0xff8a4a);
    } else {
      // 夜晚：月光蓝白
      gi = 0.18;
      gcol.setHex(0x8ab0ff);
    }

    glow.uGlowIntensity.value = gi;
    glow.uGlowColor.value.copy(gcol);
  }

  // ---------- 太阳 / 月亮（画在天空球里） ----------
  // 颜色跟着主光走：早晨暖橙、中午近白、日落橙红、夜晚冷白（月亮）
  {
    const su = app.sky.material.uniforms;
    if (su.uSunIntensity) {
      su.uSunCore.value.copy(app.lighting.sun.color).lerp(_white, 0.72);
      su.uSunHalo.value.copy(app.lighting.sun.color);

      // 夜间权重：夜里切成月亮 —— 更小、更暗、更冷
      const nightW = smoothstep01((t - 0.86) / 0.14);

      // 强度：白天够亮才有实体感；夜里压到 0.55 当月亮
      su.uSunIntensity.value = (1.0 - nightW * 0.45) * (0.75 + 0.25 * smoothNoon);
      su.uSunSize.value = 0.022 - nightW * 0.008;
      su.uSunHaloSize.value = 0.18 - nightW * 0.06;
      // 核心亮度：只压太阳本体，不改变主光/环境光。
      // 原值 6.0 + 2.5，整体降低 30% 以避免日盘过爆。
      su.uSunCoreBoost.value = (6.0 + smoothNoon * 2.5) * 0.7;
    }
  }

  // ---------- 昼夜变化时更新树的 emissive ----------
  // applySeason 只在季节变化时调用，但昼夜变化也要更新树的发光强度，
  // 否则夜里树会保持白天的 emissive（看起来像霓虹灯）。
  const daylightNow = (() => {
    if (t <= 0.5) return 0.85 + (t / 0.5) * 0.15;
    return Math.max(0, 1 - (t - 0.5) / 0.42);
  })();

  if (app.bigtree && app.bigtree.userData.setSeason) {
    app.bigtree.userData.setSeason(app.seasonT ?? 1, daylightNow);
  }
  if (app.extraTrees) {
    app.extraTrees.traverse((tree) => {
      if (tree.userData && tree.userData.setSeason) tree.userData.setSeason(app.seasonT ?? 1, daylightNow);
    });
  }
}

// ---------- 季节：无极插值 ----------
// 季节滑杆 t ∈ [0, 3]：
//   0 = 春, 1 = 夏, 2 = 秋, 3 = 冬
// 中间值是两个季节的混合（比如 0.5 = 春末夏初）。
//
// 和昼夜一样用 smoothstep 缓动，拖动时不会突变。
const SEASON_KEYS = ['spring', 'summer', 'autumn', 'winter'];

function seasonSample(t) {
  const c = Math.max(0, Math.min(3, t));
  const i = Math.min(2, Math.floor(c));
  const k = c - i;
  // 每一段内部用 smoothstep，两端慢中间快
  const e = k * k * (3 - 2 * k);
  return { a: SEASON[SEASON_KEYS[i]], b: SEASON[SEASON_KEYS[i + 1]], k: e };
}

// 线性插值两个 hex 颜色（在 sRGB 空间，避免颜色空间转换失真）
function lerpHex(ha, hb, k) {
  const ar = (ha >> 16) & 255, ag = (ha >> 8) & 255, ab = ha & 255;
  const br = (hb >> 16) & 255, bg = (hb >> 8) & 255, bb = hb & 255;
  return (
    (Math.round(ar + (br - ar) * k) << 16) |
    (Math.round(ag + (bg - ag) * k) << 8) |
    Math.round(ab + (bb - ab) * k)
  );
}

function applySeason(t) {
  const { a, b, k } = seasonSample(t);
  app.seasonT = t;
  app.season = { ...a };

  // 混合出当前季节的颜色
  const leafA = lerpHex(a.leafA, b.leafA, k);
  const leafB = lerpHex(a.leafB, b.leafB, k);
  const grassA = lerpHex(a.grassA, b.grassA, k);

  // 冬季积雪量 0~1：和 farm.js 屋顶雪、树上的雪点用的是同一套曲线
  // （c = 2.5 起开始积雪，c = 3.0 盖满）
  const snowAmount = Math.max(0, Math.min(1, (t - 2.5) / 0.5));

  // 色调乘数：目标色 / 夏季基准
  const srgbOf = (hex) => ({
    r: ((hex >> 16) & 255) / 255,
    g: ((hex >> 8) & 255) / 255,
    b: (hex & 255) / 255,
  });
  const tint = (baseHex, targetHex) => {
    const bs = srgbOf(baseHex);
    const tg = srgbOf(targetHex);
    const clampRatio = (v) => Math.max(0.3, Math.min(2.5, v));
    const c = new THREE.Color();
    c.setRGB(
      clampRatio(tg.r / Math.max(0.02, bs.r)),
      clampRatio(tg.g / Math.max(0.02, bs.g)),
      clampRatio(tg.b / Math.max(0.02, bs.b)),
      THREE.LinearSRGBColorSpace
    );
    return c;
  };

  // 树木：直接重写树冠顶点色（乘 material.color 变不出褐色，见 forest.js 注释）
  // 树干树枝不动，只有叶子跟着季节走。
  const forest = app.forest;
  if (forest && forest.userData.applyLeafColor) {
    forest.userData.applyLeafColor(leafA);
    // 材质自身的 color 保持白色，避免和顶点色二次相乘
    forest.userData.materials[0].color.setRGB(1, 1, 1);
    forest.userData.materials[1].color.setRGB(1, 1, 1);
  }

  // 草簇：直接设色（冬季跟着草地一起变白，否则雪地上会留一圈绿草刺）
  if (app.grass && app.grass.material) {
    const gc = srgbOf(grassA);
    // 草簇和地面同步压暗；冬季雪量上来后逐步恢复白色
    const grassK = 1 - 0.16 * (1 - snowAmount);
    app.grass.material.color.setRGB(
      gc.r * grassK, gc.g * grassK, gc.b * grassK, THREE.SRGBColorSpace
    );
  }

  // 地形：草地主体 + 冬季积雪。
  // ★ 雪量必须和池塘岸坡传同一个值，否则池边会比周围地面白一档。
  if (app.terrain && app.terrain.material) {
    app.terrain.material.color.copy(tint(SEASON.summer.grassA, grassA));
    const su = app.terrain.userData.snowUniform;
    if (su) su.value = snowAmount;
  }

  // 水池岸坡：和地形用【完全同一个 tint + 同一个雪量】。
  // 岸坡顶点色已经含地面那套配色（三层草 + 泥斑 + 噪点），
  // 乘同一个 tint、盖同一层雪，两边颜色严格相等。
  // 淤泥/湿土不参与染色，所以水线以下不会被雪盖住。
  if (app.pond && app.pond.userData.setBankSeason) {
    app.pond.userData.setBankSeason(tint(SEASON.summer.grassA, grassA), snowAmount);
  }

  // ---------- 建筑屋顶的冬季雪花 ----------
  if (app.farm && app.farm.userData.setSeason) {
    app.farm.userData.setSeason(t);
  }

  // ---------- 树木随季节变色 + 冬季雪花 ----------
  // daylight：0=深夜，1=正午。用于控制 emissive 强度，
  //   否则夜里树会自己发光（像霓虹灯）。
  //
  // ★ 注意：这里必须用【昼夜值 app.mode.t】，不是参数 t（那是季节值 0~3）！
  //   之前写成 t，导致季节 2（秋）算出 daylight = 0，emissive 被乘成 0。
  const dT = app.mode.t;
  const daylight = (() => {
    if (dT <= 0.5) return 0.85 + (dT / 0.5) * 0.15;      // 0.85 -> 1.0
    return Math.max(0, 1 - (dT - 0.5) / 0.42);           // 1.0 -> 0（0.92 时归零）
  })();

  if (app.bigtree && app.bigtree.userData.setSeason) {
    app.bigtree.userData.setSeason(t, daylight);
  }
  if (app.extraTrees) {
    app.extraTrees.traverse((tree) => {
      if (tree.userData && tree.userData.setSeason) tree.userData.setSeason(t, daylight);
    });
  }

  // ---------- 水池：四季水位 ----------
  // 春夏水面高、秋冬水面低，中间用 smoothstep 渐变（见 terrain.js 的 waterSinkFor）。
  // 池壁不动，只抬降水面的 mesh，于是"水涨水落"自然出现。
  // 鱼/荷叶/浮藻要跟着新的水面高度走，否则会浮在空中或沉进水底。
  if (app.pond && app.pond.userData.setSeason) {
    app.pond.userData.setSeason(t);
    const wy = app.pond.userData.waterY;
    if (app.pondLife && app.pondLife.userData.setWaterLevel) {
      app.pondLife.userData.setWaterLevel(wy);
    }
  }

  // 通知季节元素（雪、落叶、花等）更新可见度
  // seasonFX 的方法挂在 userData 上
  if (app.seasonFX && app.seasonFX.userData && app.seasonFX.userData.update) {
    app.seasonFX.userData.update(t);
  }
}

// ---------- 主循环 ----------
// 自适应降级：连续低帧率时关掉移轴模糊，保证流畅
const perf = { frames: 0, time: 0, stage: 0 };

function loop() {
  if (!app.running) return;
  requestAnimationFrame(loop);

  const dt = Math.min(clock.getDelta(), 0.1);
  elapsed += dt;

  // ---------- 帧率监控与分级降级 ----------
  // 注意：不要一上来就关移轴 —— 移轴是这个场景的质感核心，
  // 关掉后画面会显得"廉价"。按代价从低到高逐级降：
  //   1. 降像素比（1.5 -> 1.0），画质损失小
  //   2. 减模糊迭代（3 -> 1），模糊略糙但仍在
  //   3. 实在不行才关移轴
  if (perf.stage < 3) {
    perf.frames++;
    perf.time += dt;
    if (perf.time >= 3) {
      const fps = perf.frames / perf.time;
      if (fps < 26) {
        perf.stage++;
        if (perf.stage === 1) {
          const r = app.renderer;
          const cur = r.getPixelRatio();
          const next = Math.max(1.0, cur * 0.75);
          r.setPixelRatio(next);
          app.post.setPixelRatio(next);
          console.warn('[Meadowland] ' + fps.toFixed(0) + ' fps，像素比降到 ' + next.toFixed(2));
        } else if (perf.stage === 2) {
          if (app.post?.setBlurIterations) app.post.setBlurIterations(1);
          console.warn('[Meadowland] ' + fps.toFixed(0) + ' fps，模糊迭代降到 1');
        } else {
          if (app.post?.setTiltEnabled) app.post.setTiltEnabled(false);
          console.warn('[Meadowland] ' + fps.toFixed(0) + ' fps，已关闭移轴模糊');
        }
      }
      perf.frames = 0;
      perf.time = 0;
    }
  }

  if (app.rig.introActive) {
    app.rig.updateIntro(performance.now());
  } else if (app.rig.introPending) {
    // 开屏待机：只跑低振幅的专用视差，不跑 OrbitControls。
    // 开屏机位在 maxDistance 之外，走 controls.update() 会把相机拉回，
    // 普通视差又按远距离放大，两者叠加才会抖/撕裂。
    app.rig.applyIntroParallax(dt);
  } else {
    // ★ 关键：飞行期间【不能】调用 controls.update()。
    //   OrbitControls.update() 即使 enabled=false 也会执行，
    //   它会用内部缓存的球坐标重算 camera.position，
    //   把 updateFly 刚设置的位置覆盖掉 ——
    //   同一帧内相机被设了两次，表现为"重影/抽动"。
    // ★ 关键：必须在 updateFly 之后读取 flyActive。
    //
    //   之前是先读 const flying = flyActive，再调 updateFly。
    //   飞行结束的那一帧，updateFly 把 flyActive 改成 false，
    //   但 flying 变量还是 true —— 于是这一帧跳过了 controls.update()，
    //   下一帧才执行，相机被重新推导 → 表现为"镜头抽动一下"。
    app.rig.updateReset(dt);
    app.rig.updateFly(dt);
    app.rig.updateMovement(dt);   // WASD

    const stillFlying = app.rig.flyActive || app.rig.resetActive;   // ← 用最新状态

    if (!stillFlying) {
      // 不在飞行：控制器接管
      app.rig.syncRotateSpeed();
      app.rig.controls.update();
      app.rig.restoreMinDistance();
      app.rig.applyParallax(dt);
      // 第一人称跟随：锁到角色头部与朝向
      if (app.updateFollowCamera && app.followCharacter) app.updateFollowCamera();
      // ★ 交接帧【不能】再调 clampCameraAboveGround：
      //   updateFly 在结束帧已经按"落点"算好了离地余量，
      //   这里再压一次会把相机往下沉（实测低矮目标掉 1.9）。
      //   地面保护只保留在飞行途中。
    } else {
      // 飞行中：只做地面保护，不碰相机朝向
      app.rig.clampCameraAboveGround();
    }
  }

  app.forest.userData.update(elapsed);
  if (app.farm && app.farm.userData.update) app.farm.userData.update(elapsed, dt);
  app.grass.update(elapsed);
  app.animals.userData.update(elapsed, dt);
  app.people.userData.update(elapsed, dt);
  app.pets.userData.update(elapsed, dt);
  app.logLady.userData.update(elapsed, dt);
  app.car.userData.update(dt);
  app.truck.userData.update(dt);
  if (app.truck.userData.setNight) app.truck.userData.setNight(app.mode.t);
  if (app.well && app.well.userData.setNight) app.well.userData.setNight(app.mode.t);
  if (app.workshop && app.workshop.userData.setNight) app.workshop.userData.setNight(app.mode.t);
  app.farm.userData.windmill.userData.blades.rotation.z += dt * 0.55;

  // 云朵：绕世界原点缓慢飘动。
  app.birds.userData.update(elapsed, dt, app.rig.camera);
  if (app.pondLife) app.pondLife.userData.update(elapsed, dt);
  app.seasonFX.userData.tick(dt, elapsed);

  // 篝火：只在夜晚点亮（t > 0.55 开始，0.85 全亮）
  {
    const ct = Math.max(0, Math.min(1, (app.mode.t - 0.55) / 0.30));
    const nightAmount = ct * ct * (3 - 2 * ct);
    app.campfire.userData.update(elapsed, dt, nightAmount);
  }

  // 参天大树的飘落叶子
  if (app.bigtree && app.bigtree.userData.update) {
    app.bigtree.userData.update(elapsed, dt, app.seasonT || 1);
  }

  // 猫头鹰：特写时不能飞走，且盯着镜头
  if (app.owl && app.owl.userData.update) {
    const owlCloseup = app.focusedBuilding &&
      app.focusedBuilding.kind === 'farm' &&
      app.focusedBuilding.key === 'owl';
    app.owl.userData.update(elapsed, dt, {
      closeup: !!owlCloseup,
      camera: app.rig.camera,
    });
  }

  // 水车转动
  if (app.watermill && app.watermill.userData.update) {
    app.watermill.userData.update(elapsed, dt);
  }

  // 水面波动
  if (app.pond && app.pond.userData.waterMat) {
    const wm = app.pond.userData.waterMat;
    wm.uniforms.uTime.value = elapsed;
    wm.uniforms.uNight.value = app.mode.t;
  }

  app.sky.position.copy(app.rig.camera.position);
  app.stars.position.copy(app.rig.camera.position);

  // 云朵：缓慢公转 + 上下浮动。云不跟随相机（它是场景里的实体，
  // 有真实透视和远近关系，跟着相机走会露馅）。
  if (app.clouds && app.clouds.userData.update) {
    app.clouds.userData.update(elapsed, dt);
  }

  // 太阳方向：主光位置就是「从原点指向太阳」的方向，
  // 天穹 shader 用 dot(视线方向, uSunDir) 判断像素是否落在太阳上。
  // 这样太阳永远和真正打光的方向一致，且不随镜头平移而漂移。
  {
    const su = app.sky.material.uniforms;
    if (su.uSunDir) {
      _sunVec.copy(app.lighting.sun.position).normalize();
      su.uSunDir.value.copy(_sunVec);
    }
  }

  // 昼夜插值：只有目标与当前差距明显时才平滑过渡
  // （滑杆拖动时 setTime 会直接把 t 设为目标值，这里不会重复插值）
  const dtMode = Math.abs(app.mode.t - app.mode.target);
  if (dtMode > 0.002) {
    // 差距大时用平滑（按钮切换），差距小时用快速跟随（滑杆微调）
    const speed = dtMode > 0.15 ? 2.0 : 12.0;
    app.mode.t += (app.mode.target - app.mode.t) * Math.min(1, dt * speed);
    applyMode(app.mode.t);
  }

  app.post.composer.render();
}

// ---------------------------------------------------------------------------
// 启动：包一层错误处理
// 老设备 / 不支持 WebGL 的浏览器会抛异常，给用户一个可读的提示，
// 而不是白屏。
// ---------------------------------------------------------------------------
function showFatal(message) {
  // ★ 必须先把加载动画藏掉，否则页面会一直转圈，
  //   用户根本看不到错误信息（这就是"一直在加载"的原因）
  const loader = document.getElementById('loader');
  if (loader) loader.classList.add('hidden');

  const el = document.getElementById('intro');
  if (el) {
    el.innerHTML =
      '<div class="title" style="font-size:clamp(24px,6vw,40px)">无法启动</div>' +
      '<p class="subtitle" style="max-width:34ch;line-height:1.7">' + message + '</p>';
    el.style.opacity = '1';
    el.style.visibility = 'visible';
    el.style.pointerEvents = 'auto';
  }
  console.error('[Meadowland]', message);
}

try {
  // 先检查 WebGL 是否可用
  const testCanvas = document.createElement('canvas');
  const gl = testCanvas.getContext('webgl2') || testCanvas.getContext('webgl');
  if (!gl) {
    showFatal('你的浏览器不支持 WebGL，无法显示 3D 场景。请换用最新版 Chrome / Safari / Edge。');
  } else {
    boot();
    // 水塔切换造型后，刷新猫头鹰的停留高度
//   三种造型的屋顶高度差 3.5 米左右，不刷新的话猫头鹰会悬在半空或陷进屋顶。
//   ★ 必须在 app 装配完成后再挂回调（farm 已经在 app 里了）。
if (app.farm && app.farm.userData && app.owl) {
  //   ★ forceFlyAway = true：如果猫头鹰正停在水塔上，先让它飞走 ——
  //     造型刚换、屋顶高度可能差 3 米，原地改 y 会看到"突然弹起/陷下去"。
  app.farm.userData.onWatertowerRebuilt = () => {
    const h = refreshWatertowerPerch(app.scene, app.terrainModel);
    if (h !== null && app.owl.userData.setPerchHeight) {
      app.owl.userData.setPerchHeight('水塔', h, { forceFlyAway: true });
    }
  };
  // 初始化一次（让水塔停留点匹配当前造型）
  const h0 = refreshWatertowerPerch(app.scene, app.terrainModel);
  if (h0 !== null && app.owl.userData.setPerchHeight) {
    app.owl.userData.setPerchHeight('水塔', h0);
  }

  // 风车切换造型后，刷新猫头鹰停留高度
  //   ★ 五种造型塔顶差 8 米（modern 19.62 / candy 11.49），
  //     不刷新的话猫头鹰会悬空或陷进屋顶。
  app.farm.userData.onWindmillRebuilt = () => {
    const h = refreshWindmillPerch(app.scene, app.terrainModel);
    if (h !== null && app.owl.userData.setPerchHeight) {
      app.owl.userData.setPerchHeight('风车', h, { forceFlyAway: true });
    }
  };
  // 初始化一次
  const hw = refreshWindmillPerch(app.scene, app.terrainModel);
  if (hw !== null && app.owl.userData.setPerchHeight) {
    app.owl.userData.setPerchHeight('风车', hw);
  }
}

window.__APP__ = app;
  }
} catch (err) {
  const msg = String(err && err.message || err);
  showFatal(
    '场景初始化失败：' + msg +
    '<br><br>可能是显卡驱动或浏览器版本过旧，建议更新浏览器后重试。'
  );
}