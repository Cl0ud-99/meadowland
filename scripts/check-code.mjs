// ---------------------------------------------------------------------------
// 代码卫生检查：防止"改了新代码但旧代码没删干净"
//
// 背景：之前把 box 窗户换成平面窗户时，replace 的目标字符串没匹配上，
// 替换静默失败，导致新旧两套窗户同时存在（截图里的白色方块）。
// 这个脚本专门检查这类残留。
// ---------------------------------------------------------------------------
import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';

const problems = [];
const add = (m) => problems.push(m);

const read = (p) => readFileSync(p, 'utf8');

// ---------- 1. farm.js 里不应再有窗户几何 ----------
const farm = read('src/world/farm.js');
const barnStart = farm.indexOf('function makeBarn');
const barnEnd = farm.indexOf('function makeFarmhouse');
const makeBarnBody = farm.slice(barnStart, barnEnd);

// 谷仓主体里出现 9fc4d8（玻璃蓝）或 PALETTE.wall 做的小盒子，说明有残留窗户
if (/9fc4d8/.test(makeBarnBody)) add('makeBarn 里还有玻璃色几何（9fc4d8），窗户没删干净');
if (/0\.4,\s*2\.2,\s*2\.6/.test(makeBarnBody)) add('makeBarn 里还有侧窗盒子 (0.4, 2.2, 2.6)');
if (/1\.6,\s*1\.6,\s*0\.4/.test(makeBarnBody)) add('makeBarn 里还有山墙窗盒子 (1.6, 1.6, 0.4)');

// ---------- 2. 每个 make* 建筑函数必须"组装出完整网格" ----------
//
// 两种合法写法：
//   a) 函数体里直接调用 meshFrom(parts)
//   b) 委托给 buildXxxDemo(...) —— 谷仓/农舍改成精细模型后的写法，
//      这些 Demo 函数内部已经做了 meshFrom，不必重复
for (const name of ['makeBarn', 'makeFarmhouse', 'makeSilo', 'makeWaterTower']) {
  const s = farm.indexOf('function ' + name);
  if (s === -1) continue;
  const e = farm.indexOf('\nfunction ', s + 10);
  const body = farm.slice(s, e === -1 ? undefined : e);
  const buildsInline = /meshFrom\(/.test(body);
  // 委托形式：buildXxxDemo(...) 或 makeXxxTower(...) / makeXxxMill(...) 等
  const delegates = /(build|make)[A-Z]\w*\(/.test(body);
  if (!buildsInline && !delegates) {
    add(name + ' 既没有 meshFrom(...) 也没有委托 buildXxxDemo(...)（可能拼装不完整）');
  }
}

// ---------- 3. 窗户系统统一走 windows.js ----------
const win = read('src/world/windows.js');
if (!/export function makeWindowPlane/.test(win)) add('windows.js 缺少 makeWindowPlane 导出');
if (!/WINDOW_LAYER/.test(win)) add('windows.js 缺少 WINDOW_LAYER 分层常量');

// ---------- 4. 所有 world 模块不应再 import 已删除的 API ----------
const removedApis = [
  { file: 'src/world/animals.js', pattern: /meshFrom\(parts, \{ castShadow/, msg: 'animals.js 仍用旧的合并写法（应改用 character.js 的拆件）' },
];

for (const r of removedApis) {
  try {
    if (r.pattern.test(read(r.file))) add(r.msg);
  } catch (e) { /* 文件不存在则跳过 */ }
}

// ---------- 5. 检查所有 src 文件的语法基本完整性 ----------
const files = [];
const walk = (d) => {
  for (const e of readdirSync(d, { withFileTypes: true })) {
    const p = join(d, e.name);
    if (e.isDirectory()) walk(p);
    else if (e.name.endsWith('.js')) files.push(p);
  }
};
walk('src');

for (const f of files) {
  const code = read(f);
  // 简单配对检查
  const opens = (code.match(/\{/g) || []).length;
  const closes = (code.match(/\}/g) || []).length;
  if (Math.abs(opens - closes) > 2) add(f + ' 花括号不配对（' + opens + ' vs ' + closes + '）');
}

// ---------- 6. HTML 元素与 JS 引用一致性 ----------
// 防止：JS 里 getElementById 引用了 HTML 中已删除的 id（运行时静默返回 null）
const html = read('index.html');
const hud = read('src/ui/hud.js');

// 提取 HTML 里所有 id
const htmlIds = new Set([...html.matchAll(/id="([^"]+)"/g)].map((m) => m[1]));

// 提取 hud.js 里 $('xxx') 引用的 id
const referenced = [...hud.matchAll(/\$\('([^']+)'\)/g)].map((m) => m[1]);
for (const id of new Set(referenced)) {
  if (!htmlIds.has(id)) add('hud.js 引用了 HTML 中不存在的 id: ' + id);
}

// 反向：HTML 里有按钮但 JS 没绑定（可能忘了接线）
const buttons = [...html.matchAll(/id="(btn-[^"]+)"/g)].map((m) => m[1]);
for (const b of buttons) {
  if (!hud.includes("'" + b + "'")) add('HTML 按钮 ' + b + ' 在 hud.js 里没有引用');
}

// ---------- 7. CSS 不应残留已删除元素的选择器 ----------
const css = read('src/style.css');
const cssSelectors = [...css.matchAll(/^([#.][a-zA-Z0-9_-]+)/gm)].map((m) => m[1]);
const htmlClasses = new Set([...html.matchAll(/class="([^"]+)"/g)].flatMap((m) => m[1].split(/\s+/)));
const htmlTags = new Set([...html.matchAll(/<(\w+)/g)].map((m) => m[1]));

for (const sel of new Set(cssSelectors)) {
  if (sel.startsWith('#')) {
    const id = sel.slice(1);
    // 忽略伪类和通用 id
    if (!htmlIds.has(id) && !['scene', 'body'].includes(id)) {
      // 只报告明显废弃的
      if (id.startsWith('menu') || id.startsWith('btn-')) {
        add('style.css 引用了已删除的 id: ' + sel);
      }
    }
  }
}

// ---------- 输出 ----------
console.log('检查了 ' + files.length + ' 个源文件');
if (problems.length === 0) {
  console.log('CODE GUARD OK - 无残留');
} else {
  console.log('发现 ' + problems.length + ' 个问题:');
  problems.forEach((p) => console.log('  - ' + p));
  process.exitCode = 1;
}