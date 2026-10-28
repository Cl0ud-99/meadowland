import { readFileSync, writeFileSync, mkdirSync, rmSync, readdirSync, copyFileSync, existsSync } from 'node:fs';
import { join, dirname, relative, resolve } from 'node:path';

const OUT = 'site';
rmSync(OUT, { recursive: true, force: true });
mkdirSync(join(OUT, 'src'), { recursive: true });

const JSM_ROOT = 'node_modules/three/examples/jsm';
const VENDOR_JSM = join(OUT, 'vendor/three/examples/jsm');
mkdirSync(join(OUT, 'vendor/three'), { recursive: true });
copyFileSync('node_modules/three/build/three.module.js', join(OUT, 'vendor/three/three.module.js'));

const queue = [
  'postprocessing/EffectComposer.js',
  'postprocessing/RenderPass.js',
  'postprocessing/UnrealBloomPass.js',
  'postprocessing/ShaderPass.js',
  'postprocessing/Pass.js',
  'postprocessing/OutputPass.js',
  'controls/OrbitControls.js',
];
const seen = new Set();
while (queue.length) {
  const rel = queue.shift().replace(/\\/g, '/');
  if (seen.has(rel)) continue;
  seen.add(rel);
  const abs = resolve(JSM_ROOT, rel);
  if (!existsSync(abs)) { console.warn('MISSING', rel); continue; }
  const raw = readFileSync(abs, 'utf8');

  // ★ 关键：官方插件里写的是 from 'three'（裸模块名），
  //   浏览器无法解析裸模块名，必须改写成指向 vendor 的相对路径。
  //   jsm 文件都在 vendor/three/examples/jsm/<sub>/<file>.js，
  //   到 vendor/three/three.module.js 的相对路径是 '../../../three.module.js'
  const depth = rel.split('/').length - 1;         // jsm 下的子目录层数
  const toThree = '../'.repeat(depth + 2) + 'three.module.js';
  const code = raw.replace(/from\s+['"]three['"]/g, "from '" + toThree + "'");

  const dest = join(VENDOR_JSM, rel);
  mkdirSync(dirname(dest), { recursive: true });
  writeFileSync(dest, code);

  for (const m of raw.matchAll(/from\s+['"]([^'"]+)['"]/g)) {
    const spec = m[1];
    if (spec === 'three') continue;
    if (spec.startsWith('.')) {
      queue.push(relative(JSM_ROOT, resolve(dirname(abs), spec)).replace(/\\/g, '/'));
    } else {
      console.warn('BARE DEP:', spec, 'in', rel);
    }
  }
}

const files = [];
function walk(dir) {
  for (const e of readdirSync(dir, { withFileTypes: true })) {
    const p = join(dir, e.name);
    if (e.isDirectory()) walk(p);
    else if (/\.(js|css)$/.test(e.name)) files.push(p);
  }
}
walk('src');

const RE_THREE = /from ['"]three['"]/g;
const RE_JSM = /from ['"]three\/examples\/jsm\/([^'"]+)['"]/g;
const RE_CSS = /^import\s+['"][^'"]+\.css['"];?\s*$/gm;

for (const f of files) {
  let code = readFileSync(f, 'utf8');
  const rel = f.split(/[\\/]/).slice(1).join('/');
  const depth = rel.split('/').length - 1;
  const up = '../'.repeat(depth + 1);
  code = code.replace(RE_CSS, '');
  const threePath = up + 'vendor/three/three.module.js';
  code = code.replace(RE_THREE, "from '" + threePath + "'");
  code = code.replace(RE_JSM, function (m, p) { return "from '" + up + 'vendor/three/examples/jsm/' + p + "'"; });
  const dest = join(OUT, 'src', rel);
  mkdirSync(dirname(dest), { recursive: true });
  writeFileSync(dest, code);
}

let html = readFileSync('index.html', 'utf8');
html = html.replace(
  '<script type="module" src="/src/main.js"></script>',
  '<link rel="stylesheet" href="./src/style.css" />' + String.fromCharCode(10) + '  <script type="module" src="./src/main.js"></script>'
);
writeFileSync(join(OUT, 'index.html'), html);
console.log('done | jsm:', seen.size, '| src:', files.length);

// ---------------------------------------------------------------------------
// 复制音频资源（背景音乐）
// ---------------------------------------------------------------------------
const ASSETS_SRC = 'assets';
const ASSETS_DST = join(OUT, 'assets');
if (existsSync(ASSETS_SRC)) {
  mkdirSync(ASSETS_DST, { recursive: true });
  for (const f of readdirSync(ASSETS_SRC)) {
    copyFileSync(join(ASSETS_SRC, f), join(ASSETS_DST, f));
  }
  console.log('assets -> site/assets (含 bgm.mp3)');
}

// ---------------------------------------------------------------------------
// 复制根目录下的独立 demo 页面（demo-*.html）
//
// ★ prepare.mjs 开头会 rmSync('site') 整个重建，而它只复制 src/ 和 assets/，
//   根目录的 demo HTML 不会自动带过去 —— 每次重新构建后这些页面就 404。
//   这里把它们一起复制过去。
// ---------------------------------------------------------------------------
const demoPages = readdirSync('.', { withFileTypes: true })
  .filter((e) => e.isFile() && /^demo-.*\.html$/.test(e.name))
  .map((e) => e.name);
for (const f of demoPages) {
  copyFileSync(f, join(OUT, f));
}
if (demoPages.length) {
  console.log('demo pages -> site/', demoPages.join(', '));
}


// ---------------------------------------------------------------------------
// 预览 demo（dev/previews/*.html + *.js）→ site/ 根目录
//   这些页面用 importmap 指向 ./vendor/three/three.module.js，
//   脚本里的 ./src/... 也在 site/src 下，直接复制即可。
// ---------------------------------------------------------------------------
const PREVIEW_SRC = 'dev/previews';
if (existsSync(PREVIEW_SRC)) {
  let n = 0;
  for (const f of readdirSync(PREVIEW_SRC)) {
    if (!/\.(html|js)$/.test(f)) continue;
    copyFileSync(join(PREVIEW_SRC, f), join(OUT, f));
    n++;
  }
  if (n) console.log('previews -> site/', n, 'files');
}
