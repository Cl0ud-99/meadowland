
import { chromium } from 'playwright-core';
import { spawn } from 'child_process';
const srv = spawn(process.execPath, ['serve.mjs'], { cwd: process.cwd(), stdio: 'ignore' });
await new Promise(r => setTimeout(r, 1600));
const browser = await chromium.launch({
  executablePath: 'C:/Program Files/Google/Chrome/Application/chrome.exe',
  args: ['--use-gl=swiftshader', '--enable-unsafe-swiftshader', '--no-sandbox'],
});
const errs = [];
const page = await browser.newPage({ viewport: { width: 1200, height: 680 } });
page.on('pageerror', e => errs.push('PAGEERROR ' + e.message));
page.on('console', m => { if (m.type() === 'error') errs.push('CONSOLE ' + m.text()); });
await page.goto('http://127.0.0.1:5173/', { waitUntil: 'load', timeout: 60000 });
await page.waitForFunction(() => !!window.__APP__, null, { timeout: 60000 });
await page.evaluate(() => { const el = document.getElementById('explore'); if (el) el.click(); });
await page.waitForFunction(() => !window.__APP__.rig.flyActive && !window.__APP__.rig.introActive, null, { timeout: 60000 });
await page.waitForTimeout(400);

// 水位四季
const water = await page.evaluate(() => {
  const a = window.__APP__;
  const out = [];
  for (let s = 0; s <= 3; s++) {
    a.setSeason(s, true);
    out.push({ s, y: +a.pond.userData.water.position.y.toFixed(3) });
  }
  return out;
});
console.log('WATER ' + JSON.stringify(water));

// 夜间亮度：树/屋顶的暗部
const night = await page.evaluate(() => {
  const a = window.__APP__;
  a.setSeason(1, true); a.setTime(0.96, true);
  return { hemi: +a.lighting.hemi.intensity.toFixed(2), sun: +a.lighting.sun.intensity.toFixed(2),
           amb: +a.lighting.ambient.intensity.toFixed(2), ambCol: a.lighting.ambient.color.getHexString() };
});
console.log('NIGHT ' + JSON.stringify(night));

// 宠物状态分布（采样 4 秒）
const petStates = await page.evaluate(async () => {
  const a = window.__APP__;
  a.setTime(0.45, true);
  const seen = {};
  const t0 = performance.now();
  while (performance.now() - t0 < 4200) {
    a.pets.traverse(o => {
      if (o.name === 'dog' || o.name === 'cat') {
        const st = a.pets.userData.stateName(o);
        const k = o.name + ':' + st;
        seen[k] = (seen[k] || 0) + 1;
      }
    });
    await new Promise(r => setTimeout(r, 60));
  }
  return seen;
});
console.log('PETSTATES ' + JSON.stringify(petStates));

// 森林密度
const forest = await page.evaluate(() => {
  const a = window.__APP__;
  const f = a.scene.getObjectByName('forest');
  return f.children.map(c => (c.isInstancedMesh ? c.count : 1));
});
console.log('FOREST ' + JSON.stringify(forest));

// 品牌字号
const brand = await page.evaluate(() => {
  const el = document.querySelector('.brand') || document.getElementById('brand');
  if (!el) return null;
  const cs = getComputedStyle(el);
  return { text: el.textContent.trim(), fontSize: cs.fontSize, letterSpacing: cs.letterSpacing };
});
console.log('BRAND ' + JSON.stringify(brand));

// 春夏天空
const skySpring = await page.evaluate(() => {
  const a = window.__APP__;
  a.setSeason(0, true); a.setTime(0.45, true);
  const u = a.sky.material.uniforms;
  return { top: u.uTop.value.getHexString(), mid: u.uMid.value.getHexString(), bottom: u.uBottom.value.getHexString() };
});
console.log('SKYSPRING ' + JSON.stringify(skySpring));

console.log('ERRORS ' + JSON.stringify(errs.slice(0, 8)));
await browser.close();
srv.kill();
