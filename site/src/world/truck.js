import * as THREE from '../../vendor/three/three.module.js';
import { PALETTE } from '../config.js';
import { box, meshFrom } from '../util/geo.js';
import { toonLambert } from '../render/toon.js';
import { makePickup, makeGrainTruck, makeBlueHauler, makeOrangeHauler } from './truckDemo.js';

// ---------------------------------------------------------------------------
// 农用卡车（低多边形皮卡）
//   车头 + 驾驶室 + 货斗 + 四个轮子 + 车斗里的干草
// 返回的 group.userData.update(dt) 可以做轻微的悬挂起伏
// ---------------------------------------------------------------------------

// 简易几何合并（无顶点色，只保留 position/normal）
function mergeSimple(list) {
  let vTotal = 0, iTotal = 0;
  for (const g of list) {
    vTotal += g.attributes.position.count;
    iTotal += g.index ? g.index.count : g.attributes.position.count;
  }
  const positions = new Float32Array(vTotal * 3);
  const normals = new Float32Array(vTotal * 3);
  const indices = new Uint32Array(iTotal);
  let vOff = 0, iOff = 0;
  for (const g of list) {
    const p = g.attributes.position, n = g.attributes.normal;
    positions.set(p.array.subarray(0, p.count * 3), vOff * 3);
    normals.set(n.array.subarray(0, n.count * 3), vOff * 3);
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
  out.setIndex(new THREE.BufferAttribute(indices, 1));
  out.computeBoundingSphere();
  return out;
}

// ---------------------------------------------------------------------------
// 农用卡车：四种造型可切换
//
//   'pickup'  农场皮卡（砖红 + 木栏货斗 + 干草）
//   'grain'   谷物运输车（灰绿 + 封闭罐体 + 侧梯）
//   'blue'    蓝斗运粮车（深蓝 + 高箱货斗 + 麻袋）
//   'orange'  橙斗农用车（橙色 + 果蔬筐 + 侧梯）
// ---------------------------------------------------------------------------
export const TRUCK_STYLES = ['pickup', 'grain', 'blue', 'orange'];

const TRUCK_BUILDERS = {
  pickup: makePickup,
  grain: makeGrainTruck,
  blue: makeBlueHauler,
  orange: makeOrangeHauler,
};

export function buildTruck(style = 'pickup') {
  const group = new THREE.Group();
  group.name = 'truck';

  const fn = TRUCK_BUILDERS[style] || TRUCK_BUILDERS.pickup;
  const body = fn();
  group.add(body);

  // ---------- 轻微悬挂起伏 ----------
  //   ★ 保留原来的 update 接口 —— main.js 每帧调用 app.truck.userData.update(dt)，
  //     去掉的话卡车就不动了。
  let t = 0;
  group.userData.update = (dt) => {
    t += dt;
    // 整车极轻微的上下浮动（模拟悬挂）
    group.position.y = group.userData.baseY !== undefined
      ? group.userData.baseY + Math.sin(t * 1.6) * 0.012
      : Math.sin(t * 1.6) * 0.012;
  };

  group.userData.truckStyle = style;
  return group;
}