/* 開場演出：第 0 章第一次按「開始辦案」時播放的網頁內 MV。
 * 不用影片檔而以既有場景圖 + GSAP 推移 + 字卡打字機組成：體積為零、字卡是真實文字（讀屏器可讀、可選取），
 * 且改文案不必重新編碼。背景音樂沿用 audio.js 的 story 聲景；未開啟音樂者先選「有聲／靜音」再播。
 * 雨聲、打字聲與片名落點全部以 Web Audio 即時合成，不引入任何音效素材，也就沒有授權問題。 */
(function () {
  'use strict';
  window.SD = window.SD || {};

  const SEEN_KEY = 'sd_opening_v1';
  const reduce = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  const canAnimate = () => !!window.gsap && !reduce;

  /* 每幕：背景圖、Ken Burns 起訖（scale 與位移百分比）、字卡。hold 是整幕打完字後停留的秒數。
   * 文案只講城市、雨夜與積案，不解說遊戲機制；整段唯一的 SQL 留在片名卡。eyebrow 是卷宗式的地點時間戳 */
  const SCENES = [
    { img: './images/hero-1600.webp', w: 1536, h: 1024, from: { scale: 1.15, x: 3, y: 2 }, to: { scale: 1, x: 0, y: 0 },
      eyebrow: '潮港市 · 夜', lines: ['潮港市。海風裡總帶著一點鹹味，和一點沒人說出口的事。', '這座城市，只在夜裡誠實。'], hold: 3.4 },
    { img: './images/scene/ch0-lobby.webp', w: 960, h: 640, from: { scale: 1, x: 0, y: 0 }, to: { scale: 1.12, x: -2, y: -2 },
      eyebrow: '市警局 · 九月', lines: ['九月，一張調職令把你送進市警局。', '等著你的不是歡迎會，而是一疊今年還沒有答案的案子。'], hold: 3.4 },
    { img: './images/scene/ch2-store-cctv.webp', w: 960, h: 640, from: { scale: 1.12, x: -3, y: 0 }, to: { scale: 1, x: 2, y: 1 },
      eyebrow: '港東區 · 02:14', lines: ['凌晨兩點十四分，一輛車在店門口停了四分鐘。', '沒有人記得它。除了鏡頭。'], hold: 3.4 },
    { img: './images/scene/ch4-serverroom.webp', w: 960, h: 640, from: { scale: 1, x: 0, y: 2 }, to: { scale: 1.14, x: 0, y: -2 },
      eyebrow: '地下二樓', lines: ['大家都以為，真相會被雨水沖掉。', '其實它只是被收進了沒人願意讀的地方。'], hold: 3.4 },
    { img: './images/scene/ch6-harbor-end.webp', w: 960, h: 640, from: { scale: 1.16, x: 2, y: -2 }, to: { scale: 1, x: 0, y: 0 },
      eyebrow: '', lines: ['這座城市把一切都記了下來。', '現在，它需要一個懂得提問的人。'], hold: 3.6 },
    { title: true, img: './images/scene/ch6-harbor-end.webp', w: 960, h: 640, from: { scale: 1, x: 0, y: 0 }, to: { scale: 1.06, x: 0, y: 0 },
      code: "SELECT truth FROM chaogang_city;", lines: [], hold: 3.6 },
  ];
  const TYPE_MS = 60;     // 每字毫秒；比劇情對話（16ms）慢，配合打字聲讓字卡有「被敲出來」的節奏
  const GAP_S = 0.6;      // 同一幕兩行字之間的停頓
  const FADE_S = 0.9;     // 幕與幕交叉淡化
  /* 各幕 hold 的加總讓片名卡落在約 35 秒：bgm-opening 的鼓組 drop 在 35 秒，片名與落點同時出現 */

  let dlg, layerA, layerB, textEl, eyebrowEl, codeEl, liveEl, progressEl, chooser, skipBtn, nextBtn;
  let running = false;
  let sceneIdx = 0;
  let timers = [];
  let onDone = null;
  let finished = false;

  const seen = () => { try { return !!localStorage.getItem(SEEN_KEY); } catch (e) { return true; } };
  const markSeen = () => { try { localStorage.setItem(SEEN_KEY, '1'); } catch (e) { /* 私密模式下每次都會再看一次，可接受 */ } };

  function later(fn, sec) { const t = setTimeout(fn, sec * 1000); timers.push(t); return t; }
  function clearTimers() { timers.forEach(clearTimeout); timers = []; }

  // ---------------------------------------------------------------------------
  // 音效合成。全部接到 audio.js 的 master：使用者關掉音樂時 bus() 回 null，這裡就什麼都不做
  // ---------------------------------------------------------------------------
  let rain = null;        // { src, gain }
  let noiseBuf = null;    // 50ms 白噪音，打字聲與落點共用

  function bus() { return SD.audio && SD.audio.bus ? SD.audio.bus() : null; }

  function noise(ctx) {
    if (noiseBuf && noiseBuf.sampleRate === ctx.sampleRate) return noiseBuf;
    const buf = ctx.createBuffer(1, Math.floor(ctx.sampleRate * 0.05), ctx.sampleRate);
    const d = buf.getChannelData(0);
    for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1;
    noiseBuf = buf;
    return buf;
  }

  /* 雨聲：白噪音一階積分成偏紅的噪音，再用高通去掉轟隆的低頻、低通削掉刺耳的高頻，剩下的就是雨的沙沙聲。
   * 疊一個 0.13Hz 的緩慢起伏當陣雨，避免聽起來像固定的電視雜訊 */
  function rainStart() {
    const b = bus();
    if (!b || rain) return;
    const { ctx, master } = b;
    const len = ctx.sampleRate * 2;
    const buf = ctx.createBuffer(1, len, ctx.sampleRate);
    const d = buf.getChannelData(0);
    let last = 0;
    for (let i = 0; i < len; i++) { last = (last + 0.02 * (Math.random() * 2 - 1)) / 1.02; d[i] = last * 3.5; }
    const src = ctx.createBufferSource();
    src.buffer = buf; src.loop = true;
    const hp = ctx.createBiquadFilter(); hp.type = 'highpass'; hp.frequency.value = 400;
    const lp = ctx.createBiquadFilter(); lp.type = 'lowpass'; lp.frequency.value = 2600;
    const gain = ctx.createGain();
    const t = ctx.currentTime;
    gain.gain.setValueAtTime(0, t);
    gain.gain.linearRampToValueAtTime(0.32, t + 2.5);
    const lfo = ctx.createOscillator(); lfo.frequency.value = 0.13;
    const depth = ctx.createGain(); depth.gain.value = 0.07;
    lfo.connect(depth).connect(gain.gain);
    src.connect(hp).connect(lp).connect(gain).connect(master);
    src.start(); lfo.start();
    rain = { src, lfo, gain };
  }
  function rainStop() {
    if (!rain) return;
    const b = bus();
    const r = rain; rain = null;
    if (!b) { try { r.src.stop(); r.lfo.stop(); } catch (e) { /* 已停止 */ } return; }
    const t = b.ctx.currentTime;
    r.gain.gain.cancelScheduledValues(t);
    r.gain.gain.setValueAtTime(r.gain.gain.value, t);
    r.gain.gain.linearRampToValueAtTime(0, t + 1.5);
    r.src.stop(t + 1.6); r.lfo.stop(t + 1.6);
  }

  /* 打字聲：一小段噪音過帶通（中心頻率隨機飄一點，才不會像機關槍），40ms 內衰減到無 */
  function click(soft) {
    const b = bus();
    if (!b) return;
    const { ctx, master } = b;
    const t = ctx.currentTime;
    const src = ctx.createBufferSource(); src.buffer = noise(ctx);
    const bp = ctx.createBiquadFilter(); bp.type = 'bandpass'; bp.Q.value = 1.8;
    bp.frequency.value = (soft ? 1400 : 2000) + Math.random() * 700;
    const g = ctx.createGain();
    g.gain.setValueAtTime(soft ? 0.09 : 0.16, t);
    g.gain.exponentialRampToValueAtTime(0.001, t + 0.04);
    src.connect(bp).connect(g).connect(master);
    src.start(t); src.stop(t + 0.05);
  }

  /* 片名落點：低頻正弦由 70Hz 滑到 32Hz 的一聲悶響，疊一個低通噪音當空氣感 */
  function hit() {
    const b = bus();
    if (!b) return;
    const { ctx, master } = b;
    const t = ctx.currentTime;
    const osc = ctx.createOscillator(); osc.type = 'sine';
    osc.frequency.setValueAtTime(70, t);
    osc.frequency.exponentialRampToValueAtTime(32, t + 1.4);
    const og = ctx.createGain();
    og.gain.setValueAtTime(0.0001, t);
    og.gain.exponentialRampToValueAtTime(0.7, t + 0.03);
    og.gain.exponentialRampToValueAtTime(0.001, t + 1.8);
    osc.connect(og).connect(master);
    osc.start(t); osc.stop(t + 1.9);
    const src = ctx.createBufferSource(); src.buffer = noise(ctx); src.loop = true;
    const lp = ctx.createBiquadFilter(); lp.type = 'lowpass'; lp.frequency.value = 320;
    const ng = ctx.createGain();
    ng.gain.setValueAtTime(0.35, t);
    ng.gain.exponentialRampToValueAtTime(0.001, t + 0.5);
    src.connect(lp).connect(ng).connect(master);
    src.start(t); src.stop(t + 0.55);
  }

  // ---------------------------------------------------------------------------
  // 演出
  // ---------------------------------------------------------------------------
  function bind() {
    dlg = document.getElementById('opening-stage');
    if (!dlg) return false;
    layerA = dlg.querySelector('[data-layer="a"]');
    layerB = dlg.querySelector('[data-layer="b"]');
    textEl = dlg.querySelector('#opening-text');
    eyebrowEl = dlg.querySelector('#opening-eyebrow');
    codeEl = dlg.querySelector('#opening-code');
    liveEl = dlg.querySelector('#opening-live');
    progressEl = dlg.querySelector('#opening-progress');
    chooser = dlg.querySelector('#opening-chooser');
    skipBtn = dlg.querySelector('#opening-skip');
    nextBtn = dlg.querySelector('#opening-next');

    skipBtn.addEventListener('click', finish);
    nextBtn.addEventListener('click', advance);
    // 點字卡以外的區域也能推進（與劇情舞台一致）；鍵盤使用者用「下一幕」按鈕
    dlg.querySelector('#opening-tap').addEventListener('click', (e) => { if (!e.target.closest('button')) advance(); });
    // Esc 會觸發 cancel → close；統一在 close 收尾，避免焦點留在已關閉的 dialog 上
    dlg.addEventListener('close', () => { if (!finished) finish(); });
    // 先把場景切成片頭再 enable：否則 enable 會先起檔案室的曲子，下一刻又被片頭淡掉
    chooser.querySelector('[data-sound="on"]').addEventListener('click', () => { if (SD.audio) { SD.audio.setScene('opening'); SD.audio.enable(); } start(); });
    chooser.querySelector('[data-sound="off"]').addEventListener('click', start);
    chooser.querySelector('[data-sound="skip"]').addEventListener('click', finish);

    progressEl.innerHTML = SCENES.map((_, i) => `<span data-dot="${i}"></span>`).join('');
    return true;
  }

  /* 圖片先載入再切幕：交叉淡化時若新圖還沒到，會淡成一片 ink-950 底色 */
  function preload(src) {
    return new Promise((resolve) => {
      const im = new Image();
      im.onload = im.onerror = () => resolve();
      im.src = src;
    });
  }

  function setLayer(layer, scene) {
    layer.src = scene.img;
    layer.width = scene.w;
    layer.height = scene.h;
  }

  function showScene(i) {
    if (!running) return;
    const scene = SCENES[i];
    const front = i % 2 === 0 ? layerA : layerB;
    const back = i % 2 === 0 ? layerB : layerA;
    progressEl.querySelectorAll('span').forEach((d, k) => d.classList.toggle('is-on', k <= i));

    setLayer(front, scene);
    if (canAnimate()) {
      gsap.killTweensOf([front, back]);
      gsap.set(front, { opacity: 0, scale: scene.from.scale, xPercent: scene.from.x, yPercent: scene.from.y });
      gsap.to(front, { opacity: 1, duration: FADE_S, ease: 'power1.inOut' });
      gsap.to(back, { opacity: 0, duration: FADE_S, ease: 'power1.inOut' });
      const total = sceneSeconds(scene) + FADE_S;
      gsap.to(front, { scale: scene.to.scale, xPercent: scene.to.x, yPercent: scene.to.y, duration: total, ease: 'none' });
    } else {
      front.style.opacity = '1';
      back.style.opacity = '0';
    }

    eyebrowEl.textContent = scene.eyebrow || '';
    eyebrowEl.hidden = !scene.eyebrow;
    textEl.textContent = '';
    codeEl.hidden = !scene.title;
    codeEl.textContent = '';
    dlg.classList.toggle('is-title', !!scene.title);
    liveEl.textContent = scene.title ? `SQL 偵探：潮港市檔案。${scene.code}` : scene.lines.join(' ');

    if (scene.title) { hit(); typeCode(scene); return; }
    typeLines(scene, 0);
  }

  function sceneSeconds(scene) {
    if (scene.title) return scene.code.length * (TYPE_MS + 20) / 1000 + scene.hold;
    const chars = scene.lines.reduce((n, l) => n + l.length, 0);
    return reduce ? scene.lines.length * 1.8 + scene.hold : chars * TYPE_MS / 1000 + (scene.lines.length - 1) * GAP_S + scene.hold;
  }

  /* 逐行打字：每行各自一個 <span>，前一行打完保留在畫面上，讀屏器則由 live region 一次唸整幕。
   * 標點不出聲（打字員在句尾會停一下），空白也不出聲 */
  const SILENT = /[\s，。、；：！？「」…—,.]/;
  function typeLines(scene, li) {
    if (!running) return;
    if (li >= scene.lines.length) { later(advance, scene.hold); return; }
    const line = scene.lines[li];
    const span = document.createElement('span');
    span.className = 'opening-line';
    textEl.appendChild(span);
    if (reduce) { span.textContent = line; later(() => typeLines(scene, li + 1), 1.8); return; }
    let k = 0;
    const iv = setInterval(() => {
      if (!running) { clearInterval(iv); return; }
      const ch = line[k];
      span.textContent = line.slice(0, ++k);
      if (!SILENT.test(ch)) click(false);
      if (k >= line.length) { clearInterval(iv); later(() => typeLines(scene, li + 1), GAP_S); }
    }, TYPE_MS);
    timers.push(iv);
  }

  function typeCode(scene) {
    const text = scene.code;
    if (reduce) { codeEl.textContent = text; later(advance, scene.hold); return; }
    let k = 0;
    const iv = setInterval(() => {
      if (!running) { clearInterval(iv); return; }
      const ch = text[k];
      codeEl.textContent = text.slice(0, ++k);
      if (!SILENT.test(ch)) click(true);
      if (k >= text.length) { clearInterval(iv); later(advance, scene.hold); }
    }, TYPE_MS + 20);
    timers.push(iv);
  }

  function advance() {
    if (!running) return;
    clearTimers();
    sceneIdx++;
    if (sceneIdx >= SCENES.length) { finish(); return; }
    preload(SCENES[sceneIdx].img).then(() => showScene(sceneIdx));
  }

  function start() {
    chooser.hidden = true;
    running = true;
    sceneIdx = 0;
    if (SD.audio) SD.audio.setScene('opening');
    rainStart();
    skipBtn.focus();
    preload(SCENES[0].img).then(() => showScene(0));
  }

  function finish() {
    if (finished) return;
    finished = true;
    running = false;
    clearTimers();
    rainStop();
    // 片頭曲是一次性的，跳過或播完都交叉淡化回劇情聲景；之後 renderStep 會再依步驟類型調整
    if (SD.audio) SD.audio.setScene('story');
    if (window.gsap) gsap.killTweensOf([layerA, layerB]);
    markSeen();
    const done = onDone; onDone = null;
    if (dlg.open) dlg.close();
    if (done) done();
  }

  /**
   * 播放開場。已開啟背景音樂者直接開始；否則先讓玩家選有聲／靜音（課堂情境不該突然出聲）。
   * @param {() => void} done 演出結束或被跳過時呼叫（恰好一次）
   */
  function play(done) {
    if (!dlg && !bind()) { done(); return; }
    onDone = done;
    finished = false;
    running = false;
    sceneIdx = 0;
    [layerA, layerB].forEach((l) => { l.removeAttribute('src'); l.style.opacity = '0'; });
    textEl.textContent = '';
    eyebrowEl.textContent = '';
    codeEl.textContent = '';
    liveEl.textContent = '';
    dlg.classList.remove('is-title');
    progressEl.querySelectorAll('span').forEach((d) => d.classList.remove('is-on'));
    dlg.showModal();
    const soundOn = SD.audio && SD.audio.isEnabled();
    chooser.hidden = !!soundOn;
    if (soundOn) start();
    else chooser.querySelector('[data-sound="on"]').focus();
  }

  window.SD.opening = { play, seen };
})();
