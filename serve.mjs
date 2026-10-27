// 本地静态服务器：直接跑 site/ 目录（已把裸模块名改成相对路径）
//
// 用法：
//   node serve.mjs              -> 监听 0.0.0.0:5173，手机可用局域网 IP 访问
//   PORT=8080 node serve.mjs    -> 换端口
//   HOST=127.0.0.1 node serve.mjs -> 只允许本机（默认是 0.0.0.0）
import { createServer } from 'node:http';
import { readFileSync, existsSync, statSync } from 'node:fs';
import { join, extname, normalize } from 'node:path';
import { networkInterfaces } from 'node:os';

const PORT = Number(process.env.PORT || 5173);
const ROOT = process.env.ROOT || 'site';
const HOST = process.env.HOST || '0.0.0.0';

const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.mjs': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.svg': 'image/svg+xml',
  '.ico': 'image/x-icon',
  '.woff2': 'font/woff2',
};

const server = createServer((req, res) => {
  const url = decodeURIComponent((req.url || '/').split('?')[0]);
  const rel = url === '/' ? 'index.html' : url.replace(/^\/+/, '');
  const file = normalize(join(process.cwd(), ROOT, rel));

  if (!file.startsWith(normalize(join(process.cwd(), ROOT)))) {
    res.writeHead(403); res.end('403'); return;
  }
  if (!existsSync(file) || statSync(file).isDirectory()) {
    res.writeHead(404, { 'Content-Type': 'text/plain; charset=utf-8' });
    res.end('404 ' + url);
    return;
  }
  res.writeHead(200, {
    'Content-Type': MIME[extname(file)] || 'application/octet-stream',
    'Cache-Control': 'no-store',
  });
  res.end(readFileSync(file));
});

// 找出所有局域网 IPv4 地址
function lanAddresses() {
  const out = [];
  const nets = networkInterfaces();
  for (const name of Object.keys(nets)) {
    for (const net of nets[name] || []) {
      if (net.family === 'IPv4' && !net.internal) {
        out.push({ name, address: net.address });
      }
    }
  }
  return out;
}

server.listen(PORT, HOST, () => {
  console.log('');
  console.log('  Meadowland 开发服务器已启动');
  console.log('  ─────────────────────────────────────');
  console.log('  本机:   http://127.0.0.1:' + PORT);
  if (HOST === '0.0.0.0') {
    const addrs = lanAddresses();
    if (addrs.length === 0) {
      console.log('  局域网: 未检测到可用网卡');
    } else {
      for (const a of addrs) {
        console.log('  手机:   http://' + a.address + ':' + PORT + '   (' + a.name + ')');
      }
      console.log('');
      console.log('  ↑ 手机连同一个 WiFi，在浏览器输入上面的地址');
    }
  } else {
    console.log('  局域网: 已禁用（HOST=' + HOST + '）');
  }
  console.log('  ─────────────────────────────────────');
  console.log('');
});
