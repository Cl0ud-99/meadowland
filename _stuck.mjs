import { chromium } from 'playwright-core';
const browser = await chromium.launch({
  executablePath: 'C:/Program Files/Google/Chrome/Application/chrome.exe',
  args: ['--use-gl=swiftshader', '--enable-unsafe-swiftshader', '--no-sandbox'],
});
const page = await browser.newPage({ viewport: { width: 1000, height: 700 } });
const logs = [];
page.on('console', m => logs.push(m.type() + ': ' + m.text()));
page.on('pageerror', e => logs.push('PAGEERROR: ' + e.message));
await page.goto('http://127.0.0.1:5173/', { waitUntil: 'load', timeout: 90000 });
await page.waitForFunction(() => !!window.__APP__ && !!window.__APP__.running, null, { timeout: 90000 });
await page.click('#explore');
await page.waitForTimeout(4000);
const d = await page.evaluate(() => {
  const a = window.__APP__;
  return {
    running: a.running,
    introActive: a.rig.introActive,
    flyActive: a.rig.flyActive,
    camY: +a.rig.camera.position.y.toFixed(2),
    camPos: a.rig.camera.position.toArray().map(v => +v.toFixed(2)),
    target: a.rig.controls.target.toArray().map(v => +v.toFixed(2)),
    sceneChildren: a.scene.children.length,
    drawCalls: a.renderer.info.render.calls,
    triangles: a.renderer.info.render.triangles,
    frame: a.renderer.info.render.frame,
  };
});
await page.screenshot({ path: 'stuck-check.png' });
console.log(JSON.stringify(d));
console.log('LOGS ' + JSON.stringify(logs.slice(-10)));
await browser.close();
