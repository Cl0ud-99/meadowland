import * as THREE from '../../vendor/three/three.module.js';
import { CROP_TYPES } from '../world/cropTypes.js';
import { FENCE_STYLES } from '../world/farm.js';
import { TRUCK_STYLES } from '../world/truck.js';
import { SNOWMAN_STYLES } from '../world/snowmanDemo.js';
import { TREE_SPECIES, BIG_TREE_SPECIES } from '../world/bigtree.js';
import { loadState, saveState, STORAGE_OK } from '../util/save.js';
import { DEFAULT_SNAPSHOT, SNAPSHOT_VERSION } from '../config/defaultSnapshot.js';
import { CAMERA } from '../config.js';


// ---------------------------------------------------------------------------
// UI 层：开场、顶栏、菜单、提示、点击拾取
// 全部逻辑集中在这里，main.js 只负责装配与渲染循环
// ---------------------------------------------------------------------------

export function createHud(app) {
  const $ = (id) => document.getElementById(id);

  const intro = $('intro');
  const header = $('header');
  const loader = $('loader');
  const hint = $('hint');
  const btnAudio = $('btn-audio');
  const timeSlider = $('time-slider');
  const stylePanel = $('style-panel');
  const btnBrand = $('btn-brand');
  const aboutPanel = $('about');
  const aboutClose = $('about-close');
  const timeBar = $('time-bar');
  const btnRotate = $('btn-rotate');
  const btnReset = $('btn-reset');
  const btnRandom = $('btn-random');
  const btnFences = $('btn-fences');

  let hintTimer = 0;
  function showHint(text, ms = 3000) {
    if (!hint) return;
    hint.textContent = text;
    hint.classList.add('show');
    clearTimeout(hintTimer);
    hintTimer = setTimeout(() => hint.classList.remove('show'), ms);
  }

  const state = { audioOn: false, seasonIdx: 1, autoRotate: true, fencesHidden: false };

  // ★ 隐藏加载动画时【必须】同时取消 index.html 里的兜底超时 ——
  //   那个 guard 在 8 秒后检查 loader 是否还有 hidden 类，
  //   但它不会自己取消，8 秒一到就把 intro 内容替换成"加载超时"，
  //   即使场景早就加载成功了（表现为正常进游戏后画面中央冒出超时提示）。
  setTimeout(() => {
    if (loader) loader.classList.add('hidden');
    if (window.__loaderGuard) {
      clearTimeout(window.__loaderGuard);
      window.__loaderGuard = null;
    }
  }, 520);

  // 首屏先把镜头摆到起点（不播放运镜）
  app.rig.placeAtIntroStart();

  // ---------- 开场：点击屏幕任意处进入 ----------
  if (intro) {
    intro.addEventListener('click', () => {
      if (intro.classList.contains('hidden')) return;
      app.ambient.unlock();
      intro.classList.add('hidden');
      app.rig.playIntro(() => {
        if (header) header.classList.add('visible');
        if (timeBar) timeBar.classList.add('visible');
        app.rig.controls.autoRotate = state.autoRotate;
      });
    });
  }

  // ---------- 声音 ----------
  if (btnAudio) {
    btnAudio.classList.add('off');
    btnAudio.addEventListener('click', () => {
      state.audioOn = !state.audioOn;
      // 顺序很重要：先 unlock（可能创建 AudioContext），再设静音状态
      app.ambient.unlock();
      app.ambient.setMuted(!state.audioOn);
      btnAudio.classList.toggle('off', !state.audioOn);
      showHint(state.audioOn ? '环境音 开' : '环境音 关', 1600);
      if (app.markDirty) app.markDirty();
    });
  }

  // ---------- 昼夜：底部滑杆无极调节 ----------
  // 左端 = 白天，右端 = 夜晚，中间是黄昏/黎明
  function setTime(v, fromSlider = false) {
    v = Math.max(0, Math.min(1, v));
    app.mode.target = v;
    // 滑杆拖动时直接跟随，不做插值，保证手感跟手
    if (fromSlider) {
      app.mode.t = v;
      app.applyMode(v);
      if (app.markDirty) app.markDirty();
    }
    if (timeSlider && !fromSlider) timeSlider.value = String(Math.round(v * 100));
    if (header) header.classList.toggle('dark', v > 0.5);
    if (timeBar) timeBar.classList.toggle('night', v > 0.5);
  }
  app.setTime = setTime;

  // 应用初始时间（默认中午 t=0.5）
  setTime(app.mode.t, false);

  if (timeSlider) {
    timeSlider.addEventListener('input', (e) => {
      setTime(Number(e.target.value) / 100, true);
    });
    // 拖动时暂停自动环绕，并阻止事件传到 canvas（否则会同时旋转镜头）
    timeSlider.addEventListener('pointerdown', (e) => {
      wakeBar();
      e.stopPropagation();
      app.rig.controls.autoRotate = false;
    });
    timeSlider.addEventListener('pointermove', (e) => { wakeBar(); e.stopPropagation(); });
    timeSlider.addEventListener('pointerup', (e) => {
      e.stopPropagation();
      if (state.autoRotate) app.rig.controls.autoRotate = true;
    });
  }

  // 键盘 N 切换，1/2 直接跳到白天/夜晚
  setTime(0, false);

  // ---------- 季节：无极滑杆 ----------
  // 滑杆值 0~300 映射到 0~3（春/夏/秋/冬），中间值是混合过渡。
  const SEASON_NAMES = ['春', '夏', '秋', '冬'];
  const seasonSlider = $('season-slider');
  let lastSeasonLabel = '';

  function setSeasonValue(v, fromSlider = false) {
    v = Math.max(0, Math.min(3, v));
    state.seasonT = v;
    if (app.setSeason) app.setSeason(v);
    if (app.markDirty) app.markDirty();
    if (seasonSlider && !fromSlider) seasonSlider.value = String(Math.round(v * 100));

    // 提示当前季节（只在跨越整数时提示，避免拖动时刷屏）
    const idx = Math.round(v) % 4;
    const label = SEASON_NAMES[idx];
    if (label !== lastSeasonLabel) {
      lastSeasonLabel = label;
    }
  }
  app.setSeasonValue = setSeasonValue;

  if (seasonSlider) {
    seasonSlider.addEventListener('input', (e) => {
      setSeasonValue(Number(e.target.value) / 100, true);
    });
    seasonSlider.addEventListener('pointerdown', (e) => {
      wakeBar();
      e.stopPropagation();
      app.rig.controls.autoRotate = false;
      state.autoRotate = false;
      if (btnRotate) btnRotate.classList.add('off');
    });
    seasonSlider.addEventListener('pointermove', (e) => { wakeBar(); e.stopPropagation(); });
    seasonSlider.addEventListener('pointerup', (e) => e.stopPropagation());
  }

  // ---------- 自动环绕 ----------
  // ---------- 控制条收起 / 唤醒 ----------
  // 用户操作 UI 或画布时保持展开；空闲 2 秒后收起，让画面干净。
  let autoHideTimer = 0;

  function setBarCollapsed(collapsed) {
    if (!timeBar) return;
    timeBar.classList.toggle('collapsed', collapsed);
  }

  // 空闲 2 秒后收起
  function scheduleCollapse() {
    clearTimeout(autoHideTimer);
    autoHideTimer = setTimeout(() => {
      setBarCollapsed(true);
    }, 2000);
  }

  // 唤醒：立刻弹出，并重新计时 2 秒收起
  function wakeBar() {
    setBarCollapsed(false);
    scheduleCollapse();
  }

  app.wakeBar = wakeBar;

  if (btnRotate) {
    btnRotate.addEventListener('click', () => {
      state.autoRotate = !state.autoRotate;
      app.rig.controls.autoRotate = state.autoRotate;
      // 自动漫游时收起，停止时展开
      setBarCollapsed(state.autoRotate);
      btnRotate.classList.toggle('off', !state.autoRotate);
      showHint(state.autoRotate ? '自动环绕 开' : '自动环绕 关', 1400);
    });
  }

  // ---------- 回到全景 ----------
  if (btnReset) {
    btnReset.addEventListener('click', () => {
      wakeBar();
      if (app.hideStylePanel) app.hideStylePanel();
      // 退出第一人称跟随，否则回到全景后镜头会被拉回角色身上
      app.followCharacter = null;
      // 回到全景后停住，不再被自动环绕转走
      state.autoRotate = false;
      app.rig.controls.autoRotate = false;
      if (btnRotate) btnRotate.classList.add('off');
      app.rig.reset();
    });
  }

  // 第一人称跟随：每帧把相机锁到当前角色的头部和朝向
  function updateFollowCamera() {
    const ch = app.followCharacter;
    if (!ch) return;
    const head = new THREE.Vector3();
    const parts = ch.userData.parts;
    if (parts && parts.headGroup) {
      parts.headGroup.updateWorldMatrix(true, false);
      parts.headGroup.getWorldPosition(head);
    } else {
      const bb = new THREE.Box3().setFromObject(ch);
      bb.getCenter(head);
      head.y = bb.max.y - 0.15;
    }
    const heading = (typeof ch.userData.heading === 'number') ? ch.userData.heading : 0;
    const fwd = new THREE.Vector3(Math.sin(heading), 0, Math.cos(heading));
    const look = head.clone().addScaledVector(fwd, 12);
    const cam = app.rig.camera;
    cam.position.copy(head);
    app.rig.controls.target.copy(look);
    cam.lookAt(look);
  }
  app.updateFollowCamera = updateFollowCamera;

  // ---------- 随机第一人称视角（人物 / 动物） ----------
  if (btnRandom) {
    btnRandom.addEventListener('click', () => {
      wakeBar();
      if (app.hideStylePanel) app.hideStylePanel();

      const pool = [];
      [app.people, app.animals, app.pets].forEach((grp) => {
        if (!grp) return;
        grp.children.forEach((o) => {
          if (o && o.userData) pool.push(o);
        });
      });
      if (app.logLady && app.logLady.userData) pool.push(app.logLady);
      if (!pool.length) return;

      const ch = pool[Math.floor(Math.random() * pool.length)];
      const head = new THREE.Vector3();
      const parts = ch.userData.parts;
      if (parts && parts.headGroup) {
        parts.headGroup.updateWorldMatrix(true, false);
        parts.headGroup.getWorldPosition(head);
      } else {
        const bb = new THREE.Box3().setFromObject(ch);
        bb.getCenter(head);
        head.y = bb.max.y - 0.15;
      }

      // 进入第一人称跟随
      app.followCharacter = ch;
      app.rig.controls.enabled = true;
      app.rig.controls.autoRotate = false;
      app.rig.controls.minDistance = Math.min(app.rig.controls.minDistance, 1);
      updateFollowCamera();
    });
  }

  // ---------- 隐藏 / 显示牧场围栏 ----------
  function applyFencesHidden(hidden) {
    state.fencesHidden = !!hidden;
    const h = state.fencesHidden;
    if (app.farm && app.farm.userData.setLivestockFencesHidden) {
      app.farm.userData.setLivestockFencesHidden(h);
    }
    if (app.animals && app.animals.userData.setRoamScale) {
      app.animals.userData.setRoamScale(h ? 1.6 : 1);
    }
    if (btnFences) {
      btnFences.classList.toggle('off', h);
      btnFences.title = h ? '显示牧场围栏' : '隐藏牧场围栏';
      btnFences.setAttribute('aria-label', btnFences.title);
    }
  }
  if (btnFences) {
    btnFences.addEventListener('click', () => {
      wakeBar();
      applyFencesHidden(!state.fencesHidden);
    });
  }
  applyFencesHidden(false);

  // 使用底部 UI 时保持常驻，移出后 2 秒收起
  if (timeBar) {
    timeBar.addEventListener('pointerenter', wakeBar);
    timeBar.addEventListener('pointermove', wakeBar);
    timeBar.addEventListener('pointerdown', wakeBar);
    timeBar.addEventListener('pointerleave', scheduleCollapse);
  }

  // ---------- 拖动暂停环绕 ----------
  const canvas = app.renderer.domElement;
  let resumeTimer = 0;
  // 任何交互都唤醒控制条
  canvas.addEventListener('pointerdown', () => {
    wakeBar();
    // 点击屏幕任意处：退出第一人称跟随
    app.followCharacter = null;
    canvas.classList.add('dragging');
    app.rig.controls.autoRotate = false;
    clearTimeout(resumeTimer);
    // 用户开始拖拽 = 想操作场景，收起样式面板
    if (app.hideStylePanel) app.hideStylePanel();
  });
  const endDrag = () => {
    canvas.classList.remove('dragging');
    clearTimeout(resumeTimer);
    resumeTimer = setTimeout(() => {
      if (state.autoRotate) {
        app.rig.controls.autoRotate = true;
      }
    }, 2800);
  };
  canvas.addEventListener('pointerup', endDrag);
  canvas.addEventListener('pointercancel', endDrag);

  // 滚轮缩放也唤醒控制条
  canvas.addEventListener('wheel', () => {
    wakeBar();
    if (app.hideStylePanel) app.hideStylePanel();
    clearTimeout(resumeTimer);
    resumeTimer = setTimeout(() => {
      if (state.autoRotate) {
        app.rig.controls.autoRotate = true;
      }
    }, 2800);
  }, { passive: true });

  // ---------- 可交互目标（点击和悬停共用） ----------
  // 建筑、田地、卡车、汽车、动物群、人群都能点。
  // 注意：悬停检测必须用同一份列表，否则会出现
  // "能点但光标不变"的情况（之前动物/车辆就是这样）。
  const interactiveTargets = () => [
    app.farm, app.fields, app.truck, app.car,
    app.animals, app.people, app.pets, app.logLady,
    app.pondLife, app.pond, app.watermill, app.campfire,
    app.owl, app.bigtree, app.extraTrees, app.woodpile, app.well, app.workshop, app.seasonFX,
  ].filter(Boolean);

  // ---------- 树冠障碍（供相机落点避障）----------
  //   返回场景里所有树的"竖直圆柱"近似：{ x, z, r, baseY, topY }
  //   rig.flyTo 用它检测相机落点是否钻进树冠。
  function collectTreeObstacles() {
    const out = [];
    const push = (obj) => {
      if (!obj) return;
      obj.updateMatrixWorld(true);
      let minX = 1e9, maxX = -1e9, minY = 1e9, maxY = -1e9, minZ = 1e9, maxZ = -1e9;
      obj.traverse((o) => {
        if (!o.isMesh || !o.geometry) return;
        if (o.userData && o.userData.isOutline) return;
        if (o.parent && o.parent.name === 'snow-dots') return;
        o.geometry.computeBoundingBox();
        const bb = o.geometry.boundingBox;
        for (const x of [bb.min.x, bb.max.x]) {
          for (const y of [bb.min.y, bb.max.y]) {
            for (const z of [bb.min.z, bb.max.z]) {
              const v = new THREE.Vector3(x, y, z);
              v.applyMatrix4(o.matrixWorld);
              if (v.x < minX) minX = v.x; if (v.x > maxX) maxX = v.x;
              if (v.y < minY) minY = v.y; if (v.y > maxY) maxY = v.y;
              if (v.z < minZ) minZ = v.z; if (v.z > maxZ) maxZ = v.z;
            }
          }
        }
      });
      if (minX > maxX) return;
      out.push({
        x: (minX + maxX) / 2,
        z: (minZ + maxZ) / 2,
        // 用水平半径的 0.62 倍做避障半径：树冠是球/椭球，
        // 圆柱近似要收一点，否则相机会被推得太远。
        r: Math.max((maxX - minX), (maxZ - minZ)) / 2 * 0.62,
        baseY: minY,
        topY: maxY,
      });
    };
    push(app.bigtree);
    const walk = (c) => {
      c.children.forEach((ch) => {
        if (ch.name === 'scatter-trees') { walk(ch); return; }
        if (ch.name && ch.name.startsWith('tree-')) push(ch);
      });
    };
    if (app.extraTrees) walk(app.extraTrees);
    return out;
  }

  // ---------- 点击聚焦 ----------
  const raycaster = new THREE.Raycaster();
  const pointer = new THREE.Vector2();
  let downAt = 0;
  let downPos = { x: 0, y: 0 };

  canvas.addEventListener('pointerdown', (e) => {
    downAt = performance.now();
    downPos = { x: e.clientX, y: e.clientY };
  });

  canvas.addEventListener('pointerup', (e) => {
    // 触摸屏手指抖动大，容差放宽到 18px、时间 900ms
    const isTouch = e.pointerType === 'touch';
    const moveTolerance = isTouch ? 18 : 9;
    const timeTolerance = isTouch ? 900 : 700;

    const moved = Math.hypot(e.clientX - downPos.x, e.clientY - downPos.y);
    if (moved > moveTolerance || performance.now() - downAt > timeTolerance) return;
    if (!app.rig.controls.enabled || app.rig.introActive) return;

    pointer.x = (e.clientX / window.innerWidth) * 2 - 1;
    pointer.y = -(e.clientY / window.innerHeight) * 2 + 1;
    raycaster.setFromCamera(pointer, app.rig.camera);

    // 射线上可能有多个物体（比如牛羊站在田里），取最近的那个符合直觉
    const targets = interactiveTargets();
    const hits = raycaster.intersectObjects(targets, true).filter((h) => h.object.isMesh);
    if (!hits.length) return;

    // ---------- 找到"有意义的那一层" ----------
    // 从命中的 mesh 往上走，找到直接挂在目标组下面的那一层。
    // 例如：动物群 -> 某只羊 -> 腿 -> mesh，我们要的是"某只羊"。
    let root = hits[0].object;
    // ★ 上溯时遇到「本身就是一个可交互对象」的层就停 ——
    //   例如树 mesh → tree-oak（父级是 scatter-trees，不在 targets 里）：
    //   旧逻辑会一直上溯到 scatter-trees 组，那个组没有 setKind、名字也不以
    //   tree- 开头，于是点击无反应（后加的 5 棵点缀树就是这样失效的）。
    while (root.parent && !targets.includes(root.parent)) {
      // 这一层自己就是可换品种的树（tree-oak / bigtree）→ 停
      if (root.userData && typeof root.userData.setKind === 'function') break;
      // 雪人被 snowmen 容器包了一层，必须在 snowman 这一层停下
      if (root.name === 'snowman') break;
      root = root.parent;
    }
    // ★ 补充：循环可能在"父级已在 targets 里"时一次都不进（root 停在子 mesh 上）。
    //   例如 bigtree 的 body mesh 直接挂在 bigtree 组下 —— 此时 root 是未命名
    //   mesh、没有 setKind，必须再往上走一层拿到 bigtree 组。
    //   判据：父级有 setKind（说明它是"一棵树/一辆车"），且当前层自己没有。
    if (root.parent && typeof root.parent.userData?.setKind === 'function') {
      root = root.parent;
    }

    // ★ 关键：区分「单实例对象」和「多实例集合」两种父级，不能一刀切。
    //
    //   情况 A（需要上溯）：卡车的车身 mesh 叫 truckPickup，
    //     父级是 app.truck（单个 Group，name='truck'）。
    //     必须上溯到 truck 组，否则 root.name 是 'truckPickup'，
    //     PROFILE 查不到、卡车分支不匹配 → 点击无反应。
    //
    //   情况 B（不能上溯）：动物/树木/田地的子对象本身就是「被点的那个」。
    //     例如 animals 组下有 20 只羊，每只羊 name='sheep'，
    //     羊的父级是 app.animals。如果无脑上溯，root 会变成 animals 组
    //     （name='animals'），所有动物都点不出特写、全部退化成 farm 全景。
    //     bigtree 的 'tree-oak'、fields 的 'field-wheat' 同理。
    //
    //   判据：只有父级本身是「单实例组」时才上溯 —— 即父级的名字
    //   在 PROFILE 里能查到、且父级不是集合类（animals/fields/trees/pets/people）。
    //   ★ 用【白名单】而不是黑名单：只有这几类父级才值得上溯 ——
    //     它们本身就是"一个整体"（一个卡车、一辆车、一个水车…），
    //     子网格只是它的零件。
    //     而 farm / animals / fields / trees / people / pets / pondLife
    //     都是"集合"，子对象才是被点的那个，绝不能上溯。
    const SINGLE_GROUPS = ['truck', 'car', 'watermill', 'campfire', 'owl', 'pond', 'woodpile', 'bigtree', 'well'];
    if (root.parent && SINGLE_GROUPS.includes(root.parent.name)) {
      root = root.parent;
    }

    // 工作区是两层组（pivot → inner），点击零件后统一归到 workshop 根
    if (app.workshop) {
      let wp = root;
      while (wp && wp !== app.workshop) wp = wp.parent;
      if (wp === app.workshop) root = app.workshop;
    }

    if (!root || !root.parent) return;

    // 点击音效（气泡波声）
    if (app.ambient && app.ambient.playClick) app.ambient.playClick();

    const box = new THREE.Box3().setFromObject(root);
    const sphere = box.getBoundingSphere(new THREE.Sphere());
    const center = sphere.center;
    const radius = Math.max(sphere.radius, 0.8);

    // ---------- 每类目标的特写参数 ----------
    // distMul：相机距离 = 包围球半径 × distMul
    //   动物很小（半径 ~1.5），需要贴近；建筑很大（半径 ~10），要退远
    const PROFILE = {
      barn:       { label: '谷仓',     distMul: 2.6 },
      farmhouse:  { label: '农舍',     distMul: 2.6 },
      silo:       { label: '筒仓',     distMul: 2.8 },
      watertower: { label: '水塔',     distMul: 2.8 },
      windmill:   { label: '风车',     distMul: 2.6 },
      hay:        { label: '干草堆',   distMul: 3.0 },
      fence:      { label: '围栏',     distMul: 3.0 },
      truck:      { label: '农用卡车', distMul: 2.8 },
      car:        { label: '小汽车',   distMul: 2.8 },
      cow:        { label: '奶牛',     distMul: 4.2 },
      sheep:      { label: '绵羊',     distMul: 4.4 },
      chicken:    { label: '小鸡',     distMul: 4.8 },
      horse:      { label: '马',       distMul: 3.6 },
      alpaca:     { label: '羊驼',     distMul: 4.2 },
      person:     { label: '农人',     distMul: 3.2 },
      dog:        { label: 'Brioche',  distMul: 4.6 },
      cat:        { label: 'Cortado',  distMul: 5.0 },
      'loglady-body': { label: 'Log Lady', distMul: 3.4 },
      fish:       { label: '游鱼',     distMul: 5.5 },
      lilypad:    { label: '荷叶',     distMul: 5.0 },
      algae:      { label: '浮藻',     distMul: 5.5 },
      pond:       { label: '水池',     distMul: 2.2 },
      watermill:  { label: '水车',     distMul: 2.6 },
      campfire:   { label: '篝火',     distMul: 2.4 },
      // ★ 树：distMul 由【树高】反推 —— 相机 FOV 31°（半角 15.5°），
      //   要在画面里完整容纳树高 h（含 15% 边距），所需距离 = h/2*1.15 / tan(15.5°)。
      //   实测各树：
      //     bigtree   h=25.6 r=20.6 → 需 53.1m → distMul 2.58
      //     tree-oak  h=15.1 r=12.8 → 需 31.3m → distMul 2.45
      //     tree-birch h=13.8 r=11.0 → 需 28.6m → distMul 2.60
      //     tree-autumn h=7.5 r=6.6  → 需 15.6m → distMul 2.36
      //   统一取 2.6（原来的默认值恰好正确，之前误调到 1.75 把树冠裁掉了）。
      //   参天大树略给 2.65，留出树顶雪花和描边的余量。
      bigtree:      { label: '参天大树', distMul: 2.65 },
      'tree-oak':   { label: '橡树',     distMul: 2.60 },
      'tree-birch': { label: '白桦',     distMul: 2.60 },
      'tree-spruce': { label: '云杉',    distMul: 2.55 },
      'tree-autumn': { label: '秋树',    distMul: 2.60 },
      owl:        { label: 'Owl',      distMul: 6.5 },
      bigtree:    { label: '参天大树',  distMul: 2.4 },
      woodpile:   { label: '木材堆',    distMul: 4.0 },
      well:       { label: '水井',      distMul: 2.7 },
      workshop:   { label: '修理棚',    distMul: 2.5 },
      snowman:    { label: '雪人',      distMul: 2.8 },
      wheel:      { label: '水车',     distMul: 3.0 },
      mill:       { label: '小磨坊',   distMul: 3.0 },
    };

    // 田地是 field-wheat / field-cabbage / ...
    let profile = PROFILE[root.name];
    if (!profile && root.name && root.name.startsWith('field-')) {
      const CROPS = {
        wheat: '麦田', cabbage: '菜地',
        pumpkin: '南瓜地', sunflower: '向日葵地',
      };
      const kind = root.name.slice(6);
      profile = { label: CROPS[kind] || '田地', distMul: 2.2 };
    }
    // 树是按品种命名的 tree-oak / tree-birch / tree-maple
    if (!profile && root.name && root.name.startsWith('tree-')) {
      const TREES = { oak: '橡树', birch: '白桦', maple: '枫树' };
      const kind = root.name.slice(5);
      profile = { label: TREES[kind] || '树', distMul: 2.6 };
    }

    if (!profile) profile = { label: root.name || '农场', distMul: 2.6 };

    // ---------- 人物打招呼 ----------
    // 点击农人时：停下、转向镜头、挥手 5 秒，并显示名字
    if (root.name === 'person' && root.userData) {
      const u = root.userData;
      u.greetTimer = 5.0;                       // 挥 5 秒
      u.greetAmount = 0;                        // 从 0 淡入

      // 计算朝向镜头的角度
      const cam = app.rig.camera.position;
      u.greetTarget = Math.atan2(cam.x - u.x, cam.z - u.z);

      // 顺便让他站到画面中心：用他当前的位置做目标
      const dist2 = Math.max(radius * profile.distMul, 9);
      app.rig.flyTo(center, dist2, { radius });

      // 播放 "Have a good day" 语音
      if (app.ambient && app.ambient.playVoice) app.ambient.playVoice('person');

      // 显示名字（Cooper / Harry / Andy）
      const personName = root.userData.personName || '农人';
      showHint(personName + ': Have a good day!', 3000);
      return;
    }

    // 特写距离：半径 × 倍数，但保证不会贴到物体脸上
    // ★ 下限从 14 降到 9：Log Lady / 猫狗的包围球半径只有 0.5~1.1，
    //   乘 3.4~5.0 后仍然只有 2~5，被 14 抬起来后画面里还是个小点。
    //   建筑类半径 6~10，乘 2.6 得 16~26，完全不受这个下限影响。
    // ★ 特写距离：同时考虑【半径】和【高度】——
    //   只按半径算会让"又高又窄"的树（白桦、云杉）把相机推进树冠里，
    //   或让树顶被裁掉。相机 FOV 31°（半角 15.5°），
    //   要在竖直方向完整容纳树高 h（含 15% 边距），需要距离 = h/2*1.15/tan(15.5°)。
    //   最终取两者较大值，保证既不钻树、也不裁顶。
    const FOV_HALF_TAN = Math.tan((app.rig.camera.fov * Math.PI / 180) / 2);
    const fitHeightDist = (radius / 0.8) * 1.15 / (2 * FOV_HALF_TAN);   // 半径≈0.8×半高
    const dist = Math.max(radius * profile.distMul, fitHeightDist, 9);
    // ★ 传入树冠障碍列表 —— 相机落点若钻进别的树冠，rig 会自动偏转方位角
    app.rig.flyTo(center, dist, { radius, avoidTrees: collectTreeObstacles });

    // ---------- 参天大树：8 种低多边形巨树 ----------
    //   ★ 单独一个面板（8 个品种），和普通树的 4 品种区分开。
    if (root.name === 'bigtree' && root.userData.setKind) {
      const curKind = root.userData.getKind();
      const curName = BIG_TREE_SPECIES.find(s => s.kind === curKind)?.name || '参天大树';

      app.focusedBuilding = { kind: 'bigtree', tree: root };
      app.showTreePanel(
        '参天大树 品种',
        BIG_TREE_SPECIES,
        curKind,
        (pickIdx) => {
          const sp = BIG_TREE_SPECIES[pickIdx];
          if (!sp) return;
          root.userData.setKind(sp.kind);

          if (app.markDirty) app.markDirty();
        }
      );
      return;
    }

    // ---------- 雪人可换风格（7 种，每个雪人独立）----------
    if (root.name === 'snowman' && root.userData && typeof root.userData.setSnowmanStyle === 'function') {
      const cur = root.userData.getSnowmanStyle();
      app.focusedBuilding = { kind: 'snowman' };
      const items = SNOWMAN_STYLES.map((s) => ({ id: s.id, name: s.name, icon: SNOWMAN_ICON[s.id] || '⛄' }));
      app.showOptionPanel('', items, cur, (pickId) => {
        if (root.userData.setSnowmanStyle(pickId)) {
          if (app.markDirty) app.markDirty();
        }
      });
      return;
    }

    // ---------- 普通树可换品种（4 种）----------
    if (root.name && root.name.startsWith('tree-') && root.userData.setKind) {
      const curKind = root.userData.getKind();
      const curName = TREE_SPECIES.find(s => s.kind === curKind)?.name || '树';

      app.focusedBuilding = { kind: 'tree', tree: root };
      app.showTreePanel(
        profile.label + ' 品种',
        TREE_SPECIES,
        curKind,
        (pickIdx) => {
          const sp = TREE_SPECIES[pickIdx];
          if (!sp) return;
          root.userData.setKind(sp.kind);

          if (app.markDirty) app.markDirty();
        }
      );
      return;
    }

    // ---------- 宠物：只有【行走中】被点才叫 ----------
    // 睡觉和吃东西时被打扰不叫 —— 更符合直觉，也是用户明确要求的行为。
    if (root.name === 'dog' || root.name === 'cat') {
      const u = root.userData;
      const petName = u.petName || profile.label;
      const walking = app.pets?.userData?.isWalking?.(root);

      if (walking) {
        // 停下、转身面向镜头，叫完 2.6 秒再继续
        const cam = app.rig.camera.position;
        const heading = Math.atan2(cam.x - u.x, cam.z - u.z);
        if (app.pets?.userData?.faceCamera) {
          app.pets.userData.faceCamera(root, heading, 2.6);
        }
        if (app.ambient && app.ambient.playVoice) app.ambient.playVoice(root.name);
        const petIcon = ANIMAL_ICON[root.name] || '🐾';
        showHint(petIcon + ' 💬', 2400);
      } else {
        const st = app.pets?.userData?.stateName?.(root);
        const petIcon = ANIMAL_ICON[root.name] || '🐾';
        showHint(petIcon + (st === 'sleep' ? ' 😴' : ' 🍖'), 2200);
      }
      return;
    }

    // ---------- Log Lady：特写时保持抱木头说话，不挥手 ----------
    if (root.name === 'loglady-body') {
      showHint('🪵👩', 2400);
      return;
    }

    // ---------- 动物语音 ----------
    if (root.name && ['cow', 'sheep', 'chicken', 'horse', 'alpaca'].includes(root.name)) {
      if (app.ambient && app.ambient.playVoice) app.ambient.playVoice(root.name);
    }

    // ---------- 猫头鹰特写 ----------
    // 注意：这里【不能】再调一次 flyTo —— 上面已经调过了，
    // 连续两次 flyTo 会让相机"先飞一段再被重置"，表现为抽动。
    if (root.name === 'owl') {
      showHint('🦉', 2400);
      app.focusedBuilding = { kind: 'farm', key: 'owl' };
      app.hideStylePanel();
      return;
    }

    // ---------- 水塔：先选【造型】，再选颜色 ----------
    //
    // 水塔有两种可切换维度：
    //   1) 造型：metal / barrel / shingle（重建网格）
    //   2) 配色：5 种（改顶点色）
    // 点击时先弹造型面板，选完造型后再弹配色面板。
    if (root.name === 'watertower' && app.farm?.userData?.setWatertowerStyle) {
      const curStyle = app.farm.userData.getWatertowerStyle();
      const STYLE_META = {
        metal: { name: '金属水塔', swatch: '#8a8f94' },
        barrel: { name: '木桶水塔', swatch: '#8a6038' },
        shingle: { name: '深木水塔', swatch: '#6e4a2c' },
      };

      app.focusedBuilding = { kind: 'farm', key: 'watertower' };
      const styleItems = [
        { id: 'metal', name: STYLE_META.metal.name, icon: '🛢️' },
        { id: 'barrel', name: STYLE_META.barrel.name, icon: '🪵' },
        { id: 'shingle', name: STYLE_META.shingle.name, icon: '🏠' },
      ];
      app.showOptionPanel('水塔 造型', styleItems, curStyle, (pickStyle) => {
        app.farm.userData.setWatertowerStyle(pickStyle);

        if (app.markDirty) app.markDirty();
      });
      return;
    }

    // ---------- 卡车：选【造型】（四种）----------
    if (root.name === 'truck' && app.truck && app.rebuildTruck) {
      const curStyle = app.truck.userData.truckStyle || 'pickup';
      const TRUCK_META = {
        pickup: { name: '农场皮卡', swatch: '#c0513e' },
        grain: { name: '谷物运输车', swatch: '#5f8a68' },
        blue: { name: '蓝斗运粮车', swatch: '#3a4a6a' },
        orange: { name: '橙斗农用车', swatch: '#d8842e' },
      };

      app.focusedBuilding = { kind: 'truck' };
      const items = [
        { id: 'pickup', name: TRUCK_META.pickup.name, icon: '🚙' },
        { id: 'grain', name: TRUCK_META.grain.name, icon: '🚚' },
        { id: 'blue', name: TRUCK_META.blue.name, icon: '🚛' },
        { id: 'orange', name: TRUCK_META.orange.name, icon: '🚜' },
      ];
      app.showOptionPanel('卡车 造型', items, curStyle, (pickStyle) => {
        const nm = app.rebuildTruck(pickStyle);

        if (app.markDirty) app.markDirty();
      });
      return;
    }

    // ---------- 筒仓：选【造型】（三种）----------
    if (root.name === 'silo' && app.farm?.userData?.setSiloStyle) {
      const siloKey = root.position.z < -8 ? 'silo1' : 'silo2';
      const curStyle = app.farm.userData.getSiloStyle(siloKey);
      const SILO_META = {
        metal: { name: '金属筒仓', swatch: '#a8b0b8' },
        wood: { name: '红木筒仓', swatch: '#9a4438' },
        concrete: { name: '混凝土筒仓', swatch: '#c8c0b0' },
      };

      app.focusedBuilding = { kind: 'farm', key: siloKey };
      const items = [
        { id: 'metal', name: SILO_META.metal.name, icon: '🛢️' },
        { id: 'wood', name: SILO_META.wood.name, icon: '🪵' },
        { id: 'concrete', name: SILO_META.concrete.name, icon: '🏛️' },
      ];
      app.showOptionPanel('筒仓 造型', items, curStyle, (pickStyle) => {
        app.farm.userData.setSiloStyle(siloKey, pickStyle);

        if (app.markDirty) app.markDirty();
      });
      return;
    }

    // ---------- 风车：选【造型】（五种）----------
    if (root.name === 'windmill' && app.farm?.userData?.setWindmillStyle) {
      const curStyle = app.farm.userData.getWindmillStyle();
      const MILL_META = {
        modern: { name: '现代风机', swatch: '#f0f2f4' },
        mediterranean: { name: '地中海帆布', swatch: '#3a6ec4' },
        ranch: { name: '牧场风车', swatch: '#9aa0a6' },
        brick: { name: '红砖风车', swatch: '#a8402e' },
        candy: { name: '糖果风车', swatch: '#f0a8c0' },
      };

      app.focusedBuilding = { kind: 'farm', key: 'windmill' };
      const items = [
        { id: 'modern', name: MILL_META.modern.name, icon: '🌀' },
        { id: 'mediterranean', name: MILL_META.mediterranean.name, icon: '⛵' },
        { id: 'ranch', name: MILL_META.ranch.name, icon: '🌾' },
        { id: 'brick', name: MILL_META.brick.name, icon: '🧱' },
        { id: 'candy', name: MILL_META.candy.name, icon: '🍭' },
      ];
      app.showOptionPanel('风车 造型', items, curStyle, (pickStyle) => {
        app.farm.userData.setWindmillStyle(pickStyle);

        if (app.markDirty) app.markDirty();
      });
      return;
    }

    // ---------- 水井：换配色 ----------
    if (root.name === 'well' && app.well?.userData?.setStyle) {
      const info = app.well.userData.getStyle();
      const names = app.well.userData.styleNames || [];
      const swatches = ['#8d8d87', '#a85442', '#6f7f7a', '#d2ccbc'];
      app.focusedBuilding = { kind: 'well' };
      const items = names.map((name, i) => ({ id: String(i), name, swatch: swatches[i] || '#888' }));
      app.showOptionPanel('水井 配色', items, info.idx, (pick) => {
        if (app.well.userData.setStyle(Number(pick))) {
          if (app.markDirty) app.markDirty();
        }
      });
      return;
    }

    // ---------- 修理棚：换配色 ----------
    if (root.name === 'workshop' && app.workshop?.userData?.setStyle) {
      const info = app.workshop.userData.getStyle();
      const names = app.workshop.userData.styleNames || [];
      const swatches = ['#8a6a44', '#6f7a4a', '#5a6f86', '#b08a58'];
      app.focusedBuilding = { kind: 'workshop' };
      const items = names.map((name, i) => ({ id: String(i), name, swatch: swatches[i] || '#888' }));
      app.showOptionPanel('修理棚 配色', items, info.idx, (pick) => {
        if (app.workshop.userData.setStyle(Number(pick))) {
          if (app.markDirty) app.markDirty();
        }
      });
      return;
    }

    // ---------- 建筑可换风格（UI 点选）----------
    const STYLEABLE = ['barn', 'farmhouse'];
    let styleKey = null;
    if (STYLEABLE.includes(root.name)) {
      styleKey = root.name === 'silo'
        ? (root.position.z < -8 ? 'silo1' : 'silo2')
        : root.name;
    }

    if (styleKey && app.farm?.userData?.getBuildingStyle) {
      const info = app.farm.userData.getBuildingStyle(styleKey);
      if (info) {

        app.focusedBuilding = { kind: 'farm', key: styleKey };
        // 显示点选面板
        app.showBuildingPanel(
          profile.label + ' 风格',
          app.farm.userData.styleNames,
          info.idx,
          (pickIdx) => {
            app.farm.userData.setBuildingStyle(styleKey, pickIdx);
            const now = app.farm.userData.getBuildingStyle(styleKey);

            if (app.markDirty) app.markDirty();
          }
        );
        return;
      }
    }

    // 水车
    if (root.name === 'watermill' && app.watermill?.userData?.getStyle) {
      const info = app.watermill.userData.getStyle();

      app.focusedBuilding = { kind: 'watermill' };
      app.showBuildingPanel(
        '水车 风格',
        app.farm.userData.styleNames,
        info.idx,
        (pickIdx) => {
          const st = app.watermill.userData.setStyle(pickIdx);

        }
      );
      return;
    }

    // ---------- 围栏可换风格（UI 点选）----------
    //
    // 三种围栏（牧场/鸡舍/田地）都能单独切换，也能一键全部统一。
    // 点击围栏 → 弹出风格面板。
    if (root.userData && root.userData.fenceKind && app.farm?.userData?.setFenceStyle) {
      const kind = root.userData.fenceKind;
      const curStyle = app.farm.userData.getFenceStyle(kind);
      const meta = FENCE_META[curStyle] || { name: curStyle };
      const kindLabel = kind.startsWith('field-')
        ? '田地围栏'
        : (kind === 'pasture' ? '牧场围栏' : '鸡舍围栏');

      app.focusedBuilding = { kind: 'fence', key: kind };
      app.showFencePanel(
        kindLabel + ' 风格',
        curStyle,
        (pickStyle) => {
          if (pickStyle === null) {
            // 「全部统一」
            app.farm.userData.setAllFenceStyles(curStyle === 'plank' ? 'picket' : 'plank');

          } else {
            app.farm.userData.setFenceStyle(kind, pickStyle);
            const nowMeta = FENCE_META[pickStyle] || { name: pickStyle };

          }
          if (app.markDirty) app.markDirty();
        },
        true   // withAll
      );
      return;
    }

    // ---------- 田地可换作物（UI 点选）----------
    if (root.name && root.name.startsWith('field-') && app.fields?.userData?.setFieldCrop) {
      const fieldIdx = app.fields.children.indexOf(root);
      if (fieldIdx >= 0) {
        const curKind = app.fields.userData.getFieldCrop(fieldIdx);
        const curCrop = CROP_TYPES.find(c => c.kind === curKind);

        app.focusedBuilding = { kind: 'field', idx: fieldIdx };
        app.showCropPanel(
          profile.label + ' 作物',
          CROP_TYPES,
          curKind,
          (pickIdx) => {
            const crop = CROP_TYPES[pickIdx];
            if (!crop) return;
            app.fields.userData.setFieldCrop(fieldIdx, crop);

            if (app.markDirty) app.markDirty();
          }
        );
        return;
      }
    }

    app.focusedBuilding = null;
    app.hideStylePanel();
    const fallbackIcon = root.name === 'hay' ? '🌾' : (root.name === 'pond' ? '🌊' : ANIMAL_ICON[root.name]);
    showHint(fallbackIcon || profile.label, 2400);
  });

  // ---------- 悬停指针 ----------
  // 悬停在可交互物体上时切换成"小灯泡箭头"光标
  let hoverRaf = 0;
  let lastHoverState = false;

  canvas.addEventListener('pointermove', (e) => {
    if (app.rig.introActive || !app.rig.controls.enabled) return;
    // 触摸设备没有 hover，跳过射线检测（省性能）
    if (e.pointerType === 'touch') return;
    if (hoverRaf) return;   // 每帧最多检测一次，避免高频射线检测
    hoverRaf = requestAnimationFrame(() => {
      hoverRaf = 0;
      pointer.x = (e.clientX / window.innerWidth) * 2 - 1;
      pointer.y = -(e.clientY / window.innerHeight) * 2 + 1;
      raycaster.setFromCamera(pointer, app.rig.camera);
      // ★ 必须和点击用同一组目标，否则动物/车辆能点但光标不变
      const hits = raycaster.intersectObjects(interactiveTargets(), true)
        .filter((h) => h.object.isMesh);
      const hovering = hits.length > 0;
      if (hovering !== lastHoverState) {
        lastHoverState = hovering;
        canvas.classList.toggle('hoverable', hovering);
      }
    });
  });

  canvas.addEventListener('pointerleave', () => {
    canvas.classList.remove('hoverable');
    lastHoverState = false;
  });

  // ---------- 键盘（桌面快捷） ----------
  window.addEventListener('keydown', (e) => {
    const tag = (e.target && e.target.tagName) || '';
    if (tag === 'INPUT' || tag === 'TEXTAREA') return;
    if (e.key === 'n' || e.key === 'N') setTime(app.mode.target < 0.5 ? 1 : 0, false);
    if (e.key === 'h' || e.key === 'H') app.rig.reset();
    // 1/2 快速切换，+/- 微调时间
    if (e.key === '1') setTime(0, false);
    if (e.key === '2') setTime(1, false);
    if (e.key === '+' || e.key === '=') setTime(app.mode.target + 0.1, false);
    if (e.key === '-' || e.key === '_') setTime(app.mode.target - 0.1, false);
  });

  // ---------- 关于面板（点击 Meadowland）----------
  function openAbout() {
    if (!aboutPanel) return;
    aboutPanel.classList.add('show');
    // 打开时暂停自动旋转
    if (app.rig?.controls) app.rig.controls.autoRotate = false;
  }
  function closeAbout() {
    if (!aboutPanel) return;
    aboutPanel.classList.remove('show');
    // 恢复自动旋转
    if (app.rig?.controls && state.autoRotate) app.rig.controls.autoRotate = true;
  }

  if (btnBrand) {
    btnBrand.addEventListener('click', (e) => {
      e.stopPropagation();
      openAbout();
    });
  }
  if (aboutClose) {
    aboutClose.addEventListener('click', (e) => {
      e.stopPropagation();
      closeAbout();
    });
  }
  if (aboutPanel) {
    // 点击空白处关闭
    aboutPanel.addEventListener('click', (e) => {
      if (e.target === aboutPanel) closeAbout();
    });
  }
  // Esc 关闭
  window.addEventListener('keydown', (e) => {
    if (e.key === 'Escape' && aboutPanel?.classList.contains('show')) closeAbout();
  });

  // ---------- 样式选择面板 ----------
  // 点击建筑/田地后，顶部出现可点选的面板。
  // 每个建筑/田地独立换样式，不影响其他。
  const BUILDING_SWATCH = {
    '经典红': '#b5543c',
    '北欧蓝': '#7a95b5',
    '秋日橙': '#d88a3a',
    '森林绿': '#4a6a4a',
    '海盐白': '#f0f0ec',
  };

  const CROP_SWATCH = {
    '小麦': '#dfc062', '卷心菜': '#74b84e', '南瓜': '#e08a3c', '向日葵': '#f0c04a',
    '玉米': '#7ab05a', '番茄': '#d8402a', '胡萝卜': '#e07a2a', '薰衣草': '#9a7ac8',
  };

  // 纯图标方案：作物 / 小树 / 大树都用小图案，不用文字
  const CROP_ICON = {
    wheat: '🌾', cabbage: '🥬', pumpkin: '🎃', sunflower: '🌻',
    corn: '🌽', tomato: '🍅', carrot: '🥕', lavender: '💜',
  };
  const TREE_ICON = { apple: '🍎', blossom: '🌸', maple: '🍁', birch: '🍃', camellia: '🌼' };
  const BIG_TREE_ICON = {
    broadleaf: '🌳', poinciana: '🌺', cactus: '🌵', purple: '🟣',
    baobab: '🪵', fir: '🌲', acacia: '🌿', ginkgo: '🌟',
  };
  const ANIMAL_ICON = {
    cow: '🐄', sheep: '🐑', chicken: '🐔', horse: '🐴', alpaca: '🦙',
    dog: '🐶', cat: '🐱',
  };
  const SNOWMAN_ICON = {
    lowpoly: '⛄', clay: '🧶', frosted: '🧊', crystal: '💎',
    wood: '🪵', jelly: '🍬', thermal: '🔥',
  };

  let panelTarget = null;   // { kind: 'building'|'watermill'|'field', key/idx }

  // 面板自动隐藏计时器
  let panelAutoHide = 0;

  function hideStylePanel() {
    if (stylePanel) stylePanel.classList.remove('show');
    panelTarget = null;
    app.focusedBuilding = null;
    clearTimeout(panelAutoHide);
  }

  // 重新计时：8 秒无操作后自动隐藏
  function schedulePanelAutoHide() {
    clearTimeout(panelAutoHide);
    panelAutoHide = setTimeout(() => {
      hideStylePanel();
    }, 2000);
  }

  // 用户操作面板时重置计时
  function keepPanelAlive() {
    if (!stylePanel || !stylePanel.classList.contains('show')) return;
    schedulePanelAutoHide();
  }

  // 显示建筑风格面板
  function showBuildingPanel(title, names, currentIdx, onPick) {
    if (!stylePanel) return;
    // 如果面板已经显示，先移除 show 再重新加，让入场动画重播
    // （否则切换建筑时面板会"呆在原地"没有反馈）
    const wasShown = stylePanel.classList.contains('show');
    if (wasShown) {
      stylePanel.classList.remove('show');
      void stylePanel.offsetWidth;   // 强制重排，让动画能重播
    }
    const titleEl = stylePanel.querySelector('.style-title');
    const listEl = stylePanel.querySelector('.style-list');
    if (!titleEl || !listEl) return;

    titleEl.textContent = '';
    listEl.innerHTML = '';
    names.forEach((name, i) => {
      const btn = document.createElement('button');
      btn.className = 'style-item' + (i === currentIdx ? ' active' : '');
      btn.type = 'button';
      btn.title = name;
      btn.setAttribute('aria-label', name);
      const sw = document.createElement('span');
      sw.className = 'swatch';
      sw.style.background = BUILDING_SWATCH[name] || '#888';
      btn.appendChild(sw);
      btn.addEventListener('click', (e) => {
        e.stopPropagation();
        onPick(i);
        // 更新 active 状态
        Array.from(listEl.children).forEach((c, k) => {
          c.classList.toggle('active', k === i);
        });
      });
      listEl.appendChild(btn);
    });
    stylePanel.classList.add('show');
    schedulePanelAutoHide();
  }

  // 显示树品种面板
  function showTreePanel(title, species, currentKind, onPick) {
    if (!stylePanel) return;
    const wasShown = stylePanel.classList.contains('show');
    if (wasShown) {
      stylePanel.classList.remove('show');
      void stylePanel.offsetWidth;
    }

    const titleEl = stylePanel.querySelector('.style-title');
    const listEl = stylePanel.querySelector('.style-list');
    if (!titleEl || !listEl) return;

    titleEl.textContent = '';
    listEl.innerHTML = '';
    const treeIcons = species[0] && species[0].desc === '参天巨树' ? BIG_TREE_ICON : TREE_ICON;
    species.forEach((sp, i) => {
      const btn = document.createElement('button');
      btn.className = 'style-item' + (sp.kind === currentKind ? ' active' : '');
      btn.type = 'button';
      btn.title = sp.name;
      btn.setAttribute('aria-label', sp.name);
      const ic = document.createElement('span');
      ic.className = 'icon';
      ic.textContent = treeIcons[sp.kind] || '🌳';
      btn.appendChild(ic);
      btn.addEventListener('click', (e) => {
        e.stopPropagation();
        onPick(i);
        Array.from(listEl.children).forEach((c, k) => {
          c.classList.toggle('active', k === i);
        });
      });
      listEl.appendChild(btn);
    });
    stylePanel.classList.add('show');
    schedulePanelAutoHide();
  }

  // 显示农作物面板
  function showCropPanel(title, cropTypes, currentKind, onPick) {
    if (!stylePanel) return;
    const wasShown = stylePanel.classList.contains('show');
    if (wasShown) {
      stylePanel.classList.remove('show');
      void stylePanel.offsetWidth;
    }
    const titleEl = stylePanel.querySelector('.style-title');
    const listEl = stylePanel.querySelector('.style-list');
    if (!titleEl || !listEl) return;

    titleEl.textContent = '';
    listEl.innerHTML = '';
    cropTypes.forEach((crop, i) => {
      const btn = document.createElement('button');
      btn.className = 'style-item' + (crop.kind === currentKind ? ' active' : '');
      btn.type = 'button';
      btn.title = crop.name;
      btn.setAttribute('aria-label', crop.name);
      const ic = document.createElement('span');
      ic.className = 'icon';
      ic.textContent = CROP_ICON[crop.kind] || '🌱';
      btn.appendChild(ic);
      btn.addEventListener('click', (e) => {
        e.stopPropagation();
        onPick(i);
        Array.from(listEl.children).forEach((c, k) => {
          c.classList.toggle('active', k === i);
        });
      });
      listEl.appendChild(btn);
    });
    stylePanel.classList.add('show');
    schedulePanelAutoHide();
  }

  // ---------- 围栏风格面板 ----------
  const FENCE_META = {
    plank: { name: '尖顶木板', swatch: '#8a6a48', icon: '🪵' },
    picket: { name: '白色尖桩', swatch: '#e8e2d4', icon: '⬜' },
    rail: { name: '横板围栏', swatch: '#9a7a52', icon: '🟫' },
  };

  function showFencePanel(title, currentStyle, onPick, withAll) {
    if (!stylePanel) return;
    const wasShown = stylePanel.classList.contains('show');
    if (wasShown) {
      stylePanel.classList.remove('show');
      void stylePanel.offsetWidth;
    }
    const titleEl = stylePanel.querySelector('.style-title');
    const listEl = stylePanel.querySelector('.style-list');
    if (!titleEl || !listEl) return;

    titleEl.textContent = '';
    listEl.innerHTML = '';

    // 「全部」按钮：一次性切换所有围栏
    if (withAll) {
      const allBtn = document.createElement('button');
      allBtn.className = 'style-item';
      allBtn.type = 'button';
      allBtn.title = '全部统一';
      allBtn.setAttribute('aria-label', '全部统一');
      const allIc = document.createElement('span');
      allIc.className = 'icon';
      allIc.textContent = '🔀';
      allBtn.appendChild(allIc);
      allBtn.addEventListener('click', (e) => {
        e.stopPropagation();
        onPick(null);   // null = 全部
      });
      listEl.appendChild(allBtn);
    }

    FENCE_STYLES.forEach((style, i) => {
      const meta = FENCE_META[style] || { name: style, swatch: '#888', icon: '🪵' };
      const btn = document.createElement('button');
      btn.className = 'style-item' + (style === currentStyle ? ' active' : '');
      btn.type = 'button';
      btn.title = meta.name;
      btn.setAttribute('aria-label', meta.name);
      const ic = document.createElement('span');
      ic.className = 'icon';
      ic.textContent = meta.icon || '🪵';
      btn.appendChild(ic);
      btn.addEventListener('click', (e) => {
        e.stopPropagation();
        onPick(style);
        // 更新高亮（跳过第 0 个「全部」按钮）
        const offset = withAll ? 1 : 0;
        Array.from(listEl.children).forEach((c, k) => {
          if (k < offset) return;
          c.classList.toggle('active', k - offset === i);
        });
      });
      listEl.appendChild(btn);
    });
    stylePanel.classList.add('show');
    schedulePanelAutoHide();
  }

  // ---------- 通用选项面板 ----------
  //   items: [{ id, name, swatch }]
  //   currentId: 当前选中
  //   onPick(id)
  function showOptionPanel(title, items, currentId, onPick) {
    if (!stylePanel) return;
    const wasShown = stylePanel.classList.contains('show');
    if (wasShown) {
      stylePanel.classList.remove('show');
      void stylePanel.offsetWidth;
    }
    const titleEl = stylePanel.querySelector('.style-title');
    const listEl = stylePanel.querySelector('.style-list');
    if (!titleEl || !listEl) return;

    titleEl.textContent = '';
    listEl.innerHTML = '';

    items.forEach((it) => {
      const btn = document.createElement('button');
      btn.className = 'style-item' + (it.id === currentId ? ' active' : '');
      btn.type = 'button';
      btn.title = it.name;
      btn.setAttribute('aria-label', it.name);
      if (it.icon) {
        const ic = document.createElement('span');
        ic.className = 'icon';
        ic.textContent = it.icon;
        btn.appendChild(ic);
      } else {
        const sw = document.createElement('span');
        sw.className = 'swatch';
        sw.style.background = it.swatch || '#888';
        btn.appendChild(sw);
      }
      btn.addEventListener('click', (e) => {
        e.stopPropagation();
        onPick(it.id);
        Array.from(listEl.children).forEach((c, k) => {
          c.classList.toggle('active', k === items.findIndex((x) => x.id === it.id));
        });
      });
      listEl.appendChild(btn);
    });
    stylePanel.classList.add('show');
    schedulePanelAutoHide();
  }

  // 鼠标在面板上时重置自动隐藏计时
  if (stylePanel) {
    stylePanel.addEventListener('pointerenter', keepPanelAlive);
    stylePanel.addEventListener('pointermove', keepPanelAlive);
    stylePanel.addEventListener('pointerdown', (e) => e.stopPropagation());
  }

  app.showBuildingPanel = showBuildingPanel;
  app.showCropPanel = showCropPanel;
  app.showTreePanel = showTreePanel;
  app.showFencePanel = showFencePanel;
  app.showOptionPanel = showOptionPanel;
  app.hideStylePanel = hideStylePanel;
  app.keepPanelAlive = keepPanelAlive;

  // 收集所有"可以换品种的树"（含 5 棵点缀树，它们嵌套在 scatter-trees 里）
  const collectTreeNodes = () => {
    const out = [];
    if (!app.extraTrees) return out;
    app.extraTrees.traverse((t) => {
      if (t.userData && typeof t.userData.getKind === 'function' && t.name && t.name.startsWith('tree-')) {
        out.push(t);
      }
    });
    return out;
  };

  // ---------- 状态记忆 ----------
  function collectState() {
    const s = { snapshotVersion: SNAPSHOT_VERSION };
    try {
      // time 不写入快照：开屏时间由随机时间线决定，
      // 快照只保存时间之外的场景状态。
      // 优先用 app.seasonT（applySeason 一定会设置它），
      // 这样即使季节是被外部代码改的，也能正确保存。
      s.season = (typeof app.seasonT === 'number') ? app.seasonT
               : (typeof state.seasonT === 'number') ? state.seasonT : 1;

      // 建筑风格
      if (app.farm && app.farm.userData.getBuildingStyle) {
        const b = {};
        for (const k of Object.keys(app.farm.userData.buildings || {})) {
          b[k] = app.farm.userData.getBuildingStyle(k).idx;
        }
        s.buildings = b;
      }

      // 筒仓 / 水塔 / 风车 / 围栏 / 水车样式（这些是独立建模，不走 buildings 表）
      const fu = app.farm && app.farm.userData;
      if (fu) {
        if (fu.getSiloStyle) s.silos = { silo1: fu.getSiloStyle('silo1'), silo2: fu.getSiloStyle('silo2') };
        if (fu.getWatertowerStyle) s.watertowerStyle = fu.getWatertowerStyle();
        if (fu.getWindmillStyle) s.windmillStyle = fu.getWindmillStyle();
        if (fu.getFenceStyle) {
          s.fenceStyles = {
            pasture: fu.getFenceStyle('pasture'),
            coop: fu.getFenceStyle('coop'),
            field: fu.getFenceStyle('field-0'),
          };
        }
      }
      if (app.watermill && app.watermill.userData.getStyle) {
        s.watermillStyle = app.watermill.userData.getStyle().idx;
      }
      if (app.well && app.well.userData.getStyle) {
        s.wellStyle = app.well.userData.getStyle().idx;
      }
      if (app.workshop && app.workshop.userData.getStyle) {
        s.workshopStyle = app.workshop.userData.getStyle().idx;
      }

      // 雪人风格（每个雪人独立）
      if (app.seasonFX && Array.isArray(app.seasonFX.userData.snowmen)) {
        s.snowmenStyles = app.seasonFX.userData.snowmen.map((sm) => sm.userData.getSnowmanStyle());
      }

      // 田地作物
      if (app.fields && app.fields.userData.getFieldCrop) {
        const f = [];
        for (let i = 0; i < app.fields.children.length; i++) {
          f.push(app.fields.userData.getFieldCrop(i));
        }
        s.fields = f;
      }

      // 树品种（含嵌套在 scatter-trees 里的 5 棵点缀树）
      if (app.extraTrees) {
        s.trees = collectTreeNodes().map(t => t.userData.getKind());
      }
      if (app.bigtree && app.bigtree.userData.getKind) {
        s.bigtreeKind = app.bigtree.userData.getKind();
      }

      // 卡车造型
      if (app.truck && app.truck.userData && app.truck.userData.truckStyle) {
        s.truckStyle = app.truck.userData.truckStyle;
      }

      s.muted = !state.audioOn;
    } catch (e) { /* ignore */ }
    return s;
  }

  function applyState(d) {
    if (!d) return;
    try {
      if (typeof d.time === 'number') {
        setTime(d.time, false);
        app.mode.t = d.time;
        if (app.applyMode) app.applyMode(d.time);
      }
      if (typeof d.season === 'number') setSeasonValue(d.season, false);

      if (d.buildings && app.farm && app.farm.userData.setBuildingStyle) {
        for (const k of Object.keys(d.buildings)) {
          const idx = d.buildings[k];
          if (typeof idx === 'number') {
            try { app.farm.userData.setBuildingStyle(k, idx); } catch (e) {}
          }
        }
      }

      // 恢复独立建模的样式（筒仓/水塔/风车/围栏/水车）
      const fu = app.farm && app.farm.userData;
      if (fu) {
        if (d.silos && fu.setSiloStyle) {
          for (const k of ['silo1', 'silo2']) {
            const st = d.silos[k];
            if (st) { try { fu.setSiloStyle(k, st); } catch (e) {} }
          }
        }
        if (typeof d.watertowerStyle === 'string' && fu.setWatertowerStyle) {
          try { fu.setWatertowerStyle(d.watertowerStyle); } catch (e) {}
        }
        if (typeof d.windmillStyle === 'string' && fu.setWindmillStyle) {
          try { fu.setWindmillStyle(d.windmillStyle); } catch (e) {}
        }
        if (d.fenceStyles && fu.setFenceStyle) {
          if (d.fenceStyles.pasture) { try { fu.setFenceStyle('pasture', d.fenceStyles.pasture); } catch (e) {} }
          if (d.fenceStyles.coop) { try { fu.setFenceStyle('coop', d.fenceStyles.coop); } catch (e) {} }
          if (d.fenceStyles.field && Array.isArray(fu.fenceSlots)) {
            fu.fenceSlots.filter((s) => s.kind.startsWith('field-')).forEach((s) => {
              try { fu.setFenceStyle(s.kind, d.fenceStyles.field); } catch (e) {}
            });
          }
        }
      }
      if (typeof d.watermillStyle === 'number' && app.watermill && app.watermill.userData.setStyle) {
        try { app.watermill.userData.setStyle(d.watermillStyle); } catch (e) {}
      }
      if (typeof d.wellStyle === 'number' && app.well && app.well.userData.setStyle) {
        try { app.well.userData.setStyle(d.wellStyle); } catch (e) {}
      }
      if (typeof d.workshopStyle === 'number' && app.workshop && app.workshop.userData.setStyle) {
        try { app.workshop.userData.setStyle(d.workshopStyle); } catch (e) {}
      }
      if (Array.isArray(d.snowmenStyles) && app.seasonFX && Array.isArray(app.seasonFX.userData.snowmen)) {
        d.snowmenStyles.forEach((style, i) => {
          const sm = app.seasonFX.userData.snowmen[i];
          if (sm && typeof sm.userData.setSnowmanStyle === 'function') {
            try { sm.userData.setSnowmanStyle(style); } catch (e) {}
          }
        });
      }

      if (Array.isArray(d.fields) && app.fields && app.fields.userData.setFieldCrop) {
        d.fields.forEach((kind, i) => {
          const crop = CROP_TYPES.find(c => c.kind === kind);
          if (crop) {
            try { app.fields.userData.setFieldCrop(i, crop); } catch (e) {}
          }
        });
      }

      if (Array.isArray(d.trees) && app.extraTrees) {
        const nodes = collectTreeNodes();
        d.trees.forEach((kind, i) => {
          const t = nodes[i];
          if (t && t.userData.setKind) {
            try { t.userData.setKind(kind); } catch (e) {}
          }
        });
      }

      if (d.bigtreeKind && app.bigtree && app.bigtree.userData.setKind) {
        // ★ setKind 内部兼容旧存档的品种名
        try { app.bigtree.userData.setKind(d.bigtreeKind); } catch (e) {}
      }

      if (typeof d.truckStyle === 'string' && app.truck && app.rebuildTruck) {
        const style = TRUCK_STYLES.includes(d.truckStyle) ? d.truckStyle : 'pickup';
        try { app.rebuildTruck(style); } catch (e) {}
      }

      if (d.muted === true) {
        state.audioOn = false;
        if (btnAudio) btnAudio.classList.add('off');
      }
    } catch (e) { /* ignore */ }
  }

  // 保存（节流 800ms）
  let saveTimer = 0;
  function markDirty() {
    if (!STORAGE_OK) return;
    clearTimeout(saveTimer);
    saveTimer = setTimeout(() => saveState(collectState()), 800);
  }
  app.markDirty = markDirty;
  app.getState = collectState;

  // 恢复：必须在 createHud 返回前同步应用，
  // 这样 loop() 的第一帧就是记忆中的场景，开屏不会"先默认、再跳变"。
  // 首次打开用默认快照，之后用户自定义会覆盖（保存在 localStorage）
  if (STORAGE_OK) {
    const saved = loadState();
    // 快照版本变化时，强制用新默认覆盖一次；之后用户的自定义正常保存。
    const initial = (!saved || saved.snapshotVersion !== SNAPSHOT_VERSION)
      ? DEFAULT_SNAPSHOT
      : saved;
    if (initial) applyState(initial);
  } else {
    applyState(DEFAULT_SNAPSHOT);
  }

  // 开屏时间线优先级高于默认快照：默认快照不含 time，
  // 这里在早/中/晚里随机选一个，
  // 先应用到背景场景；点击后进入的就是这个时间。
  // 注意：不调用 markDirty，用户没主动改时间时不会把它当作自定义存档。
  if (intro && !intro.classList.contains('hidden')) {
    const times = Array.isArray(CAMERA.introTimes) && CAMERA.introTimes.length
      ? CAMERA.introTimes
      : [0.22, 0.5, 0.84];
    const introTime = times[Math.floor(Math.random() * times.length)];
    const seasons = Array.isArray(CAMERA.introSeasons) && CAMERA.introSeasons.length
      ? CAMERA.introSeasons
      : [0, 1, 2, 3];
    const introSeason = seasons[Math.floor(Math.random() * seasons.length)];

    // 时间/季节都是开屏背景，不写 markDirty；用户主动改滑杆才会保存。
    setTime(introTime, false);
    app.mode.t = introTime;
    if (app.applyMode) app.applyMode(introTime);

    state.seasonT = introSeason;
    if (app.setSeason) app.setSeason(introSeason);
    if (seasonSlider) seasonSlider.value = String(Math.round(introSeason * 100));
  }

  // 关闭前保存
  window.addEventListener('beforeunload', () => {
    if (STORAGE_OK) saveState(collectState());
  });

  return { state, showHint, update() {} };
}