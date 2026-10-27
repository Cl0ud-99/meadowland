
import { chromium } from 'playwright-core';
import { spawn } from 'child_process';
const srv = spawn(process.execPath, ['serve.mjs'], { cwd: process.cwd(), stdio: 'ignore' });
await new Promise(r => setTimeout(r, 1500));
const browser = await chromium.launch({
  executablePath: 'C:/Program Files/Google/Chrome/Application/chrome.exe',
  args: ['--use-gl=swiftshader', '--enable-unsafe-swiftshader', '--no-sandbox'],
});
const errs = [];
for (const vp of [{ width: 390, height: 844, name: 'portrait' }, { width: 844, height: 390, name: 'landscape' }]) {
  const page = await browser.newPage({ viewport: { width: vp.width, height: vp.height }, deviceScaleFactor: 1 });
  page.on('pageerror', e => errs.push(vp.name + ' PAGEERROR ' + e.message));
  await page.goto('http://127.0.0.1:5173/', { waitUntil: 'load', timeout: 60000 });
  await page.waitForFunction(() => !!window.__APP__, null, { timeout: 60000 });
  await page.waitForSelector('#explore', { timeout: 30000 });
  await page.evaluate(() => { const el = document.getElementById('explore'); if (el) el.click(); });
  await page.waitForFunction(() => !window.__APP__.rig.flyActive && !window.__APP__.rig.introActive, null, { timeout: 90000 });
  await page.waitForTimeout(600);
  const d = await page.evaluate(() => {
    const a = window.__APP__;
    return { fov: +a.rig.camera.fov.toFixed(1), aspect: +a.rig.camera.aspect.toFixed(3),
      scrollX: document.documentElement.scrollWidth > window.innerWidth,
      scrollY: document.documentElement.scrollHeight > window.innerHeight,
      lost: a.renderer.getContext().isContextLost() };
  });
  console.log(vp.name + ' ' + JSON.stringify(d));
  await page.evaluate(() => { window.__APP__.setTime(0.08, true); });
  await page.waitForTimeout(500);
  await page.screenshot({ path: 'mob-' + vp.name + '.png' });
  await page.close();
}
console.log('ERRORS ' + JSON.stringify(errs.slice(0,5)));
await browser.close();
srv.kill();
