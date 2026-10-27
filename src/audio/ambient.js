// ---------------------------------------------------------------------------
// 音频系统
//
// 两层：
//   1. 环境白噪声：风声（滤波噪声 + LFO 调制）+ 偶尔鸟叫（全部 WebAudio 合成）
//   2. 背景音乐：真实 MP3（Sunlight Over the Orchard），循环播放
//
// MP3 的来源有两种：
//   - 单文件版：bundle.mjs 把它转成 Base64 内嵌到 window.__BGM_DATA__
//   - 开发版：直接用 ./assets/bgm.mp3
//
// iOS Safari 需要用户手势后才能播放，在第一次点击时解锁。
// ---------------------------------------------------------------------------

export function createAmbient() {
  let ctx = null;
  let master = null;
  let started = false;
  let muted = false;

  // 背景音乐
  let bgm = null;          // HTMLAudioElement
  let bgmGain = null;      // 用 WebAudio 控制音量（和 master 联动）
  let bgmSource = null;
  let bgmReady = false;

  // 环境音调度
  let birdTimer = 2.5;

  const MASTER_VOLUME = 0.5;
  const BGM_VOLUME = 0.42;     // 背景音乐相对音量（不盖过环境音）

  function ensure() {
    if (ctx) return ctx;
    const AC = window.AudioContext || window.webkitAudioContext;
    if (!AC) return null;
    ctx = new AC();
    master = ctx.createGain();
    master.gain.value = 0.0;
    master.connect(ctx.destination);
    return ctx;
  }

  // -------------------------------------------------------------------------
  // 背景音乐（真实 MP3）
  // -------------------------------------------------------------------------
  function setupBGM() {
    if (bgm) return;

    // 优先用内嵌的 Base64（单文件版）
    let src = null;
    if (typeof window !== 'undefined' && window.__BGM_DATA__) {
      src = window.__BGM_DATA__;
    } else {
      // 开发版：相对路径
      src = './assets/bgm.mp3';
    }

    bgm = new Audio();
    bgm.src = src;
    bgm.loop = true;              // 自动循环
    bgm.preload = 'auto';
    bgm.crossOrigin = 'anonymous';

    bgm.addEventListener('canplaythrough', () => { bgmReady = true; });
    bgm.addEventListener('loadeddata', () => { bgmReady = true; });
    bgm.addEventListener('error', (e) => {
      console.warn('[ambient] 背景音乐加载失败:', e);
    });

    // 用 WebAudio 接管音量，这样能和 master 一起淡入淡出
    try {
      bgmSource = ctx.createMediaElementSource(bgm);
      bgmGain = ctx.createGain();
      bgmGain.gain.value = BGM_VOLUME;
      bgmSource.connect(bgmGain).connect(master);
    } catch (err) {
      // 某些浏览器不允许 MediaElementSource（比如跨域），退回直接播放
      console.warn('[ambient] 无法接入 WebAudio，直接播放:', err);
      bgm.volume = BGM_VOLUME;
      bgmSource = null;
      bgmGain = null;
    }

    // 开始加载
    bgm.load();
  }

  function playBGM() {
    if (!bgm) return;
    if (!bgm.paused) return;
    const p = bgm.play();
    if (p && p.catch) {
      p.catch((err) => {
        // 浏览器策略：需要用户手势。下次点击时再试。
        console.warn('[ambient] 背景音乐播放被阻止:', err.message);
      });
    }
  }

  function pauseBGM() {
    if (bgm && !bgm.paused) bgm.pause();
  }

  // -------------------------------------------------------------------------
  // 环境白噪声（风声 + 鸟叫）
  // -------------------------------------------------------------------------
  function noiseBuffer(seconds = 3) {
    const len = ctx.sampleRate * seconds;
    const buf = ctx.createBuffer(1, len, ctx.sampleRate);
    const d = buf.getChannelData(0);
    let last = 0;
    for (let i = 0; i < len; i++) {
      const w = Math.random() * 2 - 1;
      last = (last + 0.02 * w) / 1.02;
      d[i] = last * 3.2;
    }
    return buf;
  }

  function buildAmbience() {
    const buf = noiseBuffer(3);
    const src = ctx.createBufferSource();
    src.buffer = buf;
    src.loop = true;

    // 风声：低通 + 缓慢 LFO 调制音量
    const lp = ctx.createBiquadFilter();
    lp.type = 'lowpass';
    lp.frequency.value = 620;
    lp.Q.value = 0.6;

    const windGain = ctx.createGain();
    windGain.gain.value = 0.13;

    const lfo = ctx.createOscillator();
    lfo.frequency.value = 0.07;
    const lfoGain = ctx.createGain();
    lfoGain.gain.value = 0.07;
    lfo.connect(lfoGain).connect(windGain.gain);

    src.connect(lp).connect(windGain).connect(master);
    src.start();
    lfo.start();

    // 鸟叫：定时触发
    function birdLoop() {
      birdTimer -= 0.5;
      if (birdTimer <= 0) {
        scheduleBird();
        birdTimer = 3 + Math.random() * 7;
      }
      setTimeout(birdLoop, 500);
    }
    birdLoop();
  }

  function scheduleBird() {
    if (!started || muted || !ctx) return;
    const now = ctx.currentTime;
    const osc = ctx.createOscillator();
    const g = ctx.createGain();
    osc.type = 'sine';
    const base = 1400 + Math.random() * 900;
    osc.frequency.setValueAtTime(base, now);
    osc.frequency.exponentialRampToValueAtTime(base * 1.6, now + 0.07);
    osc.frequency.exponentialRampToValueAtTime(base * 0.85, now + 0.16);
    g.gain.setValueAtTime(0, now);
    g.gain.linearRampToValueAtTime(0.04, now + 0.015);
    g.gain.exponentialRampToValueAtTime(0.0008, now + 0.22);
    osc.connect(g).connect(master);
    osc.start(now);
    osc.stop(now + 0.26);
  }

  // -------------------------------------------------------------------------
  // 对外接口
  // -------------------------------------------------------------------------
  function unlock() {
    const c = ensure();
    if (!c) return;
    if (c.state === 'suspended') c.resume();

    if (!started) {
      started = true;
      buildAmbience();
      setupBGM();
      master.gain.cancelScheduledValues(ctx.currentTime);
      master.gain.setValueAtTime(0, ctx.currentTime);
    }

    // 每次点击都尝试播放背景音乐（浏览器要求用户手势）
    if (!muted) playBGM();
  }

  function setMuted(m) {
    const wasMuted = muted;
    muted = m;
    if (!ctx || !master) return;

    const now = ctx.currentTime;
    master.gain.cancelScheduledValues(now);
    master.gain.setValueAtTime(Math.max(master.gain.value, 0.0001), now);

    if (m) {
      // 渐出 2.2 秒
      master.gain.exponentialRampToValueAtTime(0.0001, now + 2.2);
      setTimeout(() => {
        if (muted && master) {
          master.gain.setValueAtTime(0, ctx.currentTime);
          pauseBGM();      // 真正暂停，省电
        }
      }, 2300);
    } else {
      // 渐入 2.8 秒
      if (wasMuted && master.gain.value < 0.001) {
        master.gain.setValueAtTime(0.0001, now);
      }
      master.gain.exponentialRampToValueAtTime(MASTER_VOLUME, now + 2.8);
      playBGM();
    }
  }

  // -------------------------------------------------------------------------
  // 点击音效：气泡"波"声
  // -------------------------------------------------------------------------
  function playClick() {
    if (!ctx || !master || muted) return;
    const now = ctx.currentTime;

    const osc = ctx.createOscillator();
    const g = ctx.createGain();
    osc.type = 'sine';
    // 音高从高滑到低，形成"啵"的气泡感
    const base = 720 + Math.random() * 260;
    osc.frequency.setValueAtTime(base, now);
    osc.frequency.exponentialRampToValueAtTime(base * 0.5, now + 0.10);

    // 音量调大（0.14 -> 0.30）
    g.gain.setValueAtTime(0, now);
    g.gain.linearRampToValueAtTime(0.30, now + 0.006);
    g.gain.exponentialRampToValueAtTime(0.001, now + 0.15);

    osc.connect(g).connect(master);
    osc.start(now);
    osc.stop(now + 0.17);
  }

  // -------------------------------------------------------------------------
  // 动物 / 人物语音（WebAudio 合成，音量已调大）
  //
  //   cow     奶牛：低沉的"哞"
  //   sheep   绵羊：颤音"咩"
  //   chicken 小鸡："叽叽"
  //   person  农人："Have a good day" 的语调轮廓
  // -------------------------------------------------------------------------
  function playVoice(kind) {
    if (!ctx || !master || muted) return;
    const now = ctx.currentTime;

    const osc = ctx.createOscillator();
    const g = ctx.createGain();
    const filter = ctx.createBiquadFilter();
    let stopAt = now + 0.3;

    if (kind === 'cow') {
      // 奶牛：低频"哞" —— 130Hz 锯齿波 + 低通
      osc.type = 'sawtooth';
      osc.frequency.setValueAtTime(135, now);
      osc.frequency.exponentialRampToValueAtTime(96, now + 0.55);
      osc.frequency.exponentialRampToValueAtTime(112, now + 1.1);
      filter.type = 'lowpass';
      filter.frequency.value = 700;
      filter.Q.value = 1.2;
      g.gain.setValueAtTime(0, now);
      g.gain.linearRampToValueAtTime(0.42, now + 0.08);   // 音量调大
      g.gain.setValueAtTime(0.38, now + 0.7);
      g.gain.exponentialRampToValueAtTime(0.002, now + 1.2);
      stopAt = now + 1.25;

    } else if (kind === 'sheep') {
      // 绵羊：中频颤音"咩"
      osc.type = 'triangle';
      osc.frequency.setValueAtTime(430, now);
      osc.frequency.exponentialRampToValueAtTime(370, now + 0.32);
      osc.frequency.exponentialRampToValueAtTime(400, now + 0.66);
      // 18Hz 颤音
      const vib = ctx.createOscillator();
      const vibGain = ctx.createGain();
      vib.frequency.value = 17;
      vibGain.gain.value = 30;
      vib.connect(vibGain).connect(osc.frequency);
      vib.start(now);
      vib.stop(now + 0.75);
      filter.type = 'bandpass';
      filter.frequency.value = 950;
      filter.Q.value = 2.5;
      g.gain.setValueAtTime(0, now);
      g.gain.linearRampToValueAtTime(0.36, now + 0.04);
      g.gain.setValueAtTime(0.32, now + 0.45);
      g.gain.exponentialRampToValueAtTime(0.002, now + 0.72);
      stopAt = now + 0.75;

    } else if (kind === 'chicken') {
      // 小鸡：两声短促"叽叽"
      osc.type = 'square';
      osc.frequency.setValueAtTime(1500, now);
      osc.frequency.exponentialRampToValueAtTime(2100, now + 0.05);
      osc.frequency.exponentialRampToValueAtTime(1300, now + 0.12);
      osc.frequency.setValueAtTime(1550, now + 0.16);
      osc.frequency.exponentialRampToValueAtTime(2200, now + 0.21);
      osc.frequency.exponentialRampToValueAtTime(1350, now + 0.30);
      filter.type = 'highpass';
      filter.frequency.value = 800;
      g.gain.setValueAtTime(0, now);
      g.gain.linearRampToValueAtTime(0.24, now + 0.015);
      g.gain.setValueAtTime(0.20, now + 0.14);
      g.gain.linearRampToValueAtTime(0.26, now + 0.18);
      g.gain.exponentialRampToValueAtTime(0.002, now + 0.33);
      stopAt = now + 0.35;

    } else if (kind === 'horse') {
      // 马嘶：高频起、降调、带颤音的"咴儿"
      osc.type = 'sawtooth';
      osc.frequency.setValueAtTime(620, now);
      osc.frequency.exponentialRampToValueAtTime(420, now + 0.18);
      osc.frequency.exponentialRampToValueAtTime(360, now + 0.55);
      osc.frequency.exponentialRampToValueAtTime(300, now + 0.85);
      // 颤音（马嘶的"抖"）
      const vib = ctx.createOscillator();
      const vibGain = ctx.createGain();
      vib.frequency.value = 26;
      vibGain.gain.value = 40;
      vib.connect(vibGain).connect(osc.frequency);
      vib.start(now);
      vib.stop(now + 0.9);
      filter.type = 'bandpass';
      filter.frequency.value = 1100;
      filter.Q.value = 1.8;
      g.gain.setValueAtTime(0, now);
      g.gain.linearRampToValueAtTime(0.40, now + 0.05);
      g.gain.setValueAtTime(0.34, now + 0.5);
      g.gain.exponentialRampToValueAtTime(0.002, now + 0.9);
      stopAt = now + 0.95;

    } else if (kind === 'alpaca') {
      // 羊驼：柔和的中频"哼"（类似绵羊但更短更软）
      osc.type = 'sine';
      osc.frequency.setValueAtTime(380, now);
      osc.frequency.exponentialRampToValueAtTime(320, now + 0.25);
      osc.frequency.exponentialRampToValueAtTime(290, now + 0.45);
      filter.type = 'lowpass';
      filter.frequency.value = 1400;
      g.gain.setValueAtTime(0, now);
      g.gain.linearRampToValueAtTime(0.30, now + 0.04);
      g.gain.setValueAtTime(0.26, now + 0.3);
      g.gain.exponentialRampToValueAtTime(0.002, now + 0.5);
      stopAt = now + 0.55;

    } else if (kind === 'dog') {
      // 狗 Brioche：两声短促的"汪汪"
      // 用锯齿波从 260Hz 快速掉到 150Hz，模拟胸腔共鸣的犬吠；
      // 两声之间留 0.16s 空隙，第二声略低（像真的狗叫完降调）
      osc.type = 'sawtooth';
      osc.frequency.setValueAtTime(260, now);
      osc.frequency.exponentialRampToValueAtTime(148, now + 0.10);
      osc.frequency.setValueAtTime(240, now + 0.17);
      osc.frequency.exponentialRampToValueAtTime(135, now + 0.28);
      filter.type = 'lowpass';
      filter.frequency.value = 1250;
      filter.Q.value = 2.2;
      g.gain.setValueAtTime(0, now);
      g.gain.linearRampToValueAtTime(0.42, now + 0.012);   // 第一声
      g.gain.exponentialRampToValueAtTime(0.03, now + 0.13);
      g.gain.linearRampToValueAtTime(0.38, now + 0.18);    // 第二声
      g.gain.exponentialRampToValueAtTime(0.002, now + 0.32);
      stopAt = now + 0.34;

    } else if (kind === 'cat') {
      // 猫 Cortado：一声"喵" —— 先升后降的滑音
      // 三角波比正弦更接近猫的鼻音，bandpass 放在 1200Hz 出"喵"的元音感
      osc.type = 'triangle';
      osc.frequency.setValueAtTime(560, now);
      osc.frequency.exponentialRampToValueAtTime(880, now + 0.12);   // 起音上扬
      osc.frequency.exponentialRampToValueAtTime(700, now + 0.30);
      osc.frequency.exponentialRampToValueAtTime(470, now + 0.52);   // 收尾下沉
      filter.type = 'bandpass';
      filter.frequency.value = 1200;
      filter.Q.value = 2.0;
      g.gain.setValueAtTime(0, now);
      g.gain.linearRampToValueAtTime(0.30, now + 0.05);
      g.gain.setValueAtTime(0.27, now + 0.32);
      g.gain.exponentialRampToValueAtTime(0.002, now + 0.55);
      stopAt = now + 0.58;

    } else if (kind === 'person') {
      // 农人："Have a good day" 语调轮廓（5 个音节）
      osc.type = 'sine';
      filter.type = 'lowpass';
      filter.frequency.value = 2400;

      const sylls = [
        { f: 225, t: 0.00, d: 0.15 },   // ha
        { f: 258, t: 0.17, d: 0.13 },   // ve
        { f: 205, t: 0.32, d: 0.11 },   // a
        { f: 240, t: 0.45, d: 0.17 },   // good
        { f: 188, t: 0.64, d: 0.32 },   // day（降调）
      ];
      osc.frequency.setValueAtTime(sylls[0].f, now);
      sylls.forEach(s => {
        osc.frequency.setValueAtTime(s.f, now + s.t);
        osc.frequency.linearRampToValueAtTime(s.f * 0.9, now + s.t + s.d);
      });

      // 每个音节一个音量包络
      g.gain.setValueAtTime(0, now);
      sylls.forEach(s => {
        g.gain.linearRampToValueAtTime(0.34, now + s.t + 0.02);
        g.gain.linearRampToValueAtTime(0.10, now + s.t + s.d - 0.02);
      });
      g.gain.exponentialRampToValueAtTime(0.002, now + 1.0);
      stopAt = now + 1.05;

    } else {
      // 通用：轻柔的"啾"
      osc.type = 'sine';
      osc.frequency.setValueAtTime(880, now);
      osc.frequency.exponentialRampToValueAtTime(560, now + 0.16);
      g.gain.setValueAtTime(0, now);
      g.gain.linearRampToValueAtTime(0.24, now + 0.02);
      g.gain.exponentialRampToValueAtTime(0.002, now + 0.22);
      stopAt = now + 0.24;
    }

    osc.connect(filter).connect(g).connect(master);
    osc.start(now);
    osc.stop(stopAt);
  }

  function dispose() {
    pauseBGM();
    if (bgm) { bgm.src = ''; bgm = null; }
    if (ctx) ctx.close();
  }

  return {
    unlock,
    setMuted,
    playClick,
    playVoice,
    dispose,
    get muted() { return muted; },
    get ready() { return started; },
    get bgmReady() { return bgmReady; },
  };
}