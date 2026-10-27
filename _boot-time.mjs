import { chromium } from 'playwright-core';
const browser = await chromium.launch({
  executablePath: 'C:/Program Files/Google/Chrome/Application/chrome.exe',
  args: ['--use-gl=swiftshader', '--enable-unsafe-swiftshader', '--no-sandbox'],
});
const page = await browser.newPage({ viewport: { width: 1000, height: 700 } });
await page.goto('http://127.0.0.1:5173/', { waitUntil: 'load', timeout: 90000 });
await page.waitForFunction(() => !!window.__APP__ && !!window.__APP__.running, null, { timeout: 120000 });
await page.waitForTimeout(2500);
const d = await page.evaluate(() => ({ dc: window.__APP__.renderer.info.render.calls, tris: window.__APP__.renderer.info.render.triangles, running: window.__APP__.running }));
console.log(JSON.stringify(d));
await browser.close();
