
import { chromium } from 'playwright-core';
import { spawn } from 'child_process';
const srv = spawn(process.execPath, ['serve.mjs'], { cwd: process.cwd(), stdio: 'ignore' });
await new Promise(r => setTimeout(r, 1500));
const browser = await chromium.launch({
  executablePath: 'C:/Program Files/Google/Chrome/Application/chrome.exe',
  args: ['--use-gl=swiftshader', '--enable-unsafe-swiftshader', '--no-sandbox'],
});
const errs = [];
const page = await browser.newPage({ viewport: { width: 1000, height: 560 } });
page.on('pageerror', e => errs.push('PAGEERROR ' + e.message));
page.on('console', m => { if (m.type() === 'error') errs.push('CONSOLE ' + m.text()); });
await page.goto('http://127.0.0.1:5173/', { waitUntil: 'load', timeout: 60000 });
await page.waitForFunction(() => !!window.__APP__, null, { timeout: 60000 });
await page.evaluate(() => { const el = document.getElementById('explore'); if (el) el.click(); });
await page.waitForFunction(() => !window.__APP__.rig.flyActive && !window.__APP__.rig.introActive, null, { timeout: 60000 });
await page.waitForTimeout(300);

// 1) 四季 x 八时段参数有效性
const grid = [];
for (let s = 0; s <= 3; s++) {
  for (const t of [0, 0.12, 0.28, 0.42, 0.5, 0.65, 0.78, 0.92]) {
    const d = await page.evaluate((o) => {
      const a = window.__APP__;
      a.setSeason(o.s, true);
      a.setTime(o.t, true);
      const f = a.scene.fog;
      const u = a.sky.material.uniforms;
      const sun = a.lighting.sun;
      const bad = [];
      const ok = (n, v) => { if (!Number.isFinite(v)) bad.push(n + '=NaN'); };
      ok('fogNear', f.near); ok('fogFar', f.far); ok('sunI', sun.intensity);
      ok('glow', u.uGlowIntensity.value); ok('expo', a.renderer.toneMappingExposure);
      ok('sat', a.post.toneMap.uniforms.uSaturation.value);
      if (f.far <= f.near) bad.push('fogFar<=fogNear');
      if (sun.intensity < 0) bad.push('sunI<0');
      return { s: o.s, t: o.t, bad, fog: f.color.getHexString(), near: Math.round(f.near), far: Math.round(f.far),
               sun: sun.color.getHexString(), sunI: +sun.intensity.toFixed(2), glow: +u.uGlowIntensity.value.toFixed(2) };
    }, { s, t });
    grid.push(d);
  }
}
const badCells = grid.filter(g => g.bad.length);
console.log('GRID cells=' + grid.length + ' bad=' + badCells.length + (badCells.length ? ' ' + JSON.stringify(badCells.slice(0,4)) : ''));

// 2) 可交互对象
const objs = await page.evaluate(() => {
  const a = window.__APP__;
  const names = ['farm','fields','truck','car','animals','people','pondLife','pond','watermill','campfire','owl','bigtree','extraTrees','woodpile'];
  const out = {};
  for (const n of names) {
    const o = a[n];
    out[n] = o ? (o.isObject3D ? true : 'notObj') : false;
  }
  let meshes = 0, outlines = 0;
  a.scene.traverse(o => {
    if (o.isMesh || o.isInstancedMesh) {
      if (o.userData && o.userData.isOutline) outlines++; else meshes++;
    }
  });
  return { out, meshes, outlines };
});
console.log('OBJECTS ' + JSON.stringify(objs.out) + ' meshes=' + objs.meshes + ' outlines=' + objs.outlines);

// 3) 风：树不再摆动
const wind = await page.evaluate(async () => {
  const a = window.__APP__;
  const f = a.scene.getObjectByName('forest');
  const before = f.children[0].geometry.attributes.position.array.slice(0, 6);
  const t0 = performance.now();
  await new Promise(r => setTimeout(r, 600));
  const after = f.children[0].geometry.attributes.position.array.slice(0, 6);
  const same = before.every((v, i) => Math.abs(v - after[i]) < 1e-6);
  return { forestStatic: same, hasWindShader: f.children.some(c => c.material.userData && c.material.userData.shader) };
});
console.log('WIND ' + JSON.stringify(wind));

// 4) 建筑不摆动：抓两次世界矩阵
const bld = await page.evaluate(async () => {
  const a = window.__APP__;
  const barn = a.farm;
  const m1 = barn.matrixWorld.elements.slice();
  await new Promise(r => setTimeout(r, 700));
  const m2 = barn.matrixWorld.elements.slice();
  return m1.every((v, i) => Math.abs(v - m2[i]) < 1e-6);
});
console.log('BUILDING_STATIC ' + bld);

console.log('ERRORS ' + JSON.stringify(errs.slice(0, 8)));
await browser.close();
srv.kill();
