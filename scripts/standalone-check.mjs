
import { chromium } from 'playwright-core';
const browser = await chromium.launch({
  executablePath: 'C:/Program Files/Google/Chrome/Application/chrome.exe',
  args: ['--use-gl=swiftshader', '--enable-unsafe-swiftshader', '--no-sandbox'],
});
const errs = [];
const page = await browser.newPage({ viewport: { width: 1200, height: 660 } });
page.on('pageerror', e => errs.push('PAGEERROR ' + e.message));
page.on('console', m => { if (m.type() === 'error') errs.push('CONSOLE ' + m.text()); });
await page.goto('file:///C:/Users/83871/Documents/deepseek-harness/default-workspace/farmland/standalone/index.html', { waitUntil: 'load', timeout: 90000 });
await page.waitForFunction(() => !!window.__APP__, null, { timeout: 90000 });
await page.evaluate(() => { const el = document.getElementById('explore'); if (el) el.click(); });
await page.waitForFunction(() => !window.__APP__.rig.flyActive && !window.__APP__.rig.introActive, null, { timeout: 90000 });
await page.waitForTimeout(400);
const d = await page.evaluate(() => {
  const a = window.__APP__;
  return { bgm: (window.__BGM_DATA__ || '').length,
    fog: a.scene.fog.color.getHexString(), near: Math.round(a.scene.fog.near), far: Math.round(a.scene.fog.far),
    glow: +a.sky.material.uniforms.uGlowIntensity.value.toFixed(3),
    sun: +a.lighting.sun.intensity.toFixed(2), fill: +a.lighting.fill.intensity.toFixed(2),
    sat: +a.post.toneMap.uniforms.uSaturation.value.toFixed(2), fov: a.rig.camera.fov };
});
console.log('STANDALONE ' + JSON.stringify(d));
await page.evaluate(() => { const a = window.__APP__; a.setTime(0.08, true); });
await page.waitForTimeout(500);
await page.screenshot({ path: 'standalone-fix.png' });
console.log('ERRORS ' + JSON.stringify(errs.slice(0,5)));
await browser.close();
