import { rollup } from 'rollup';
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { join, resolve } from 'node:path';

// 把 vendor 里 jsm 的裸 'three' 解析到本地 three.module.js
const THREE_PATH = resolve('site/vendor/three/three.module.js');
const resolveThree = {
  name: 'resolve-three',
  resolveId(source) {
    if (source === 'three') return THREE_PATH;
    return null;
  },
};

const bundle = await rollup({
  input: 'site/src/main.js',
  plugins: [resolveThree],
  onwarn(w, warn) {
    if (w.code === 'CIRCULAR_DEPENDENCY' || w.code === 'THIS_IS_UNDEFINED') return;
    warn(w);
  },
});

const { output } = await bundle.generate({ format: 'iife', name: 'Farmland' });
const js = output[0].code;
const css = readFileSync('site/src/style.css', 'utf8');
const html = readFileSync('site/index.html', 'utf8');

// ---------------------------------------------------------------------------
// 内嵌背景音乐（Base64）
// 单文件版必须能双击直接播放，所以把 MP3 转成 data URI 塞进 HTML。
// ---------------------------------------------------------------------------
import { existsSync as _exists, statSync } from 'node:fs';

let bgmScript = '';
let bgmBytes = 0;
const BGM_PATH = 'assets/bgm.mp3';
if (_exists(BGM_PATH)) {
  const raw = readFileSync(BGM_PATH);
  bgmBytes = raw.length;
  const b64 = raw.toString('base64');
  bgmScript = '<script>window.__BGM_DATA__="data:audio/mpeg;base64,' + b64 + '";</script>\n';
}

const inlined = html
  .replace(
    /<link rel="stylesheet" href="\.\/src\/style\.css" \/>/,
    '<style>\n' + css + '\n</style>'
  )
  .replace(
    /<script type="module" src="\.\/src\/main\.js"><\/script>/,
    bgmScript + '<script>\n' + js + '\n</script>'
  );

mkdirSync('standalone', { recursive: true });
writeFileSync(join('standalone', 'index.html'), inlined);
await bundle.close();

const kb = (s) => (s.length / 1024).toFixed(0) + ' KB';
console.log('JS   :', kb(js));
console.log('CSS  :', kb(css));
console.log('单文件:', kb(inlined), '-> standalone/index.html');
console.log('BGM  :', (bgmBytes / 1024 / 1024).toFixed(2), 'MB (Base64 内嵌)');
console.log('无外部依赖:', !/from\s*['"]three['"]/.test(js) ? 'yes' : 'NO (仍有裸 import)');