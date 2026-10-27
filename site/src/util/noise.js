// 轻量 2D 值噪声 + fbm，避免引入依赖
import { mulberry32 } from './rng.js';

function buildPerm(seed) {
  const rnd = mulberry32(seed);
  const p = new Uint8Array(512);
  const src = new Uint8Array(256);
  for (let i = 0; i < 256; i++) src[i] = i;
  for (let i = 255; i > 0; i--) {
    const j = Math.floor(rnd() * (i + 1));
    const t = src[i]; src[i] = src[j]; src[j] = t;
  }
  for (let i = 0; i < 512; i++) p[i] = src[i & 255];
  return p;
}

const fade = (t) => t * t * t * (t * (t * 6 - 15) + 10);
const lerp = (a, b, t) => a + (b - a) * t;
const grad = (h, x, y) => {
  switch (h & 3) {
    case 0: return x + y;
    case 1: return -x + y;
    case 2: return x - y;
    default: return -x - y;
  }
};

function createNoise2D(seed = 1337) {
  const p = buildPerm(seed);
  return function noise(x, y) {
    const X = Math.floor(x) & 255;
    const Y = Math.floor(y) & 255;
    const xf = x - Math.floor(x);
    const yf = y - Math.floor(y);
    const u = fade(xf);
    const v = fade(yf);
    const aa = p[p[X] + Y];
    const ab = p[p[X] + Y + 1];
    const ba = p[p[X + 1] + Y];
    const bb = p[p[X + 1] + Y + 1];
    const x1 = lerp(grad(aa, xf, yf), grad(ba, xf - 1, yf), u);
    const x2 = lerp(grad(ab, xf, yf - 1), grad(bb, xf - 1, yf - 1), u);
    return lerp(x1, x2, v); // 约 -1..1
  };
}

export function makeFbm(seed = 1337, octaves = 4, lacunarity = 2.0, gain = 0.5) {
  const n = createNoise2D(seed);
  return function fbm(x, y) {
    let amp = 1, freq = 1, sum = 0, norm = 0;
    for (let i = 0; i < octaves; i++) {
      sum += n(x * freq, y * freq) * amp;
      norm += amp;
      amp *= gain;
      freq *= lacunarity;
    }
    return sum / norm;
  };
}

export const smoothstep = (e0, e1, x) => {
  const t = Math.min(1, Math.max(0, (x - e0) / (e1 - e0)));
  return t * t * (3 - 2 * t);
};

export const clamp = (v, a, b) => Math.min(b, Math.max(a, v));
export const lerpN = lerp;