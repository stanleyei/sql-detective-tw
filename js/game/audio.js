/* 背景音樂：三段環境聲景（檔案室／劇情／結案），依目前步驟類型切換，預設靜音。
 * 用 Web Audio 而非 <audio loop>：後者在檔案接縫有可聽的空隙，低頻 drone 類聲景特別明顯。
 * 瀏覽器禁止未經使用者互動就出聲，所以 AudioContext 只在按下按鈕（或曾開啟者的首次互動）時建立。 */
(function () {
  'use strict';
  window.SD = window.SD || {};

  const PREF_KEY = 'sd-bgm';       // 'on' | 'off'；沒有值代表從未選擇
  const MASTER = 0.4;              // 音檔已正規化到 -23 LUFS，這裡再壓低當背景
  const FADE = 1.5;                // 場景切換與開關的淡入淡出秒數
  /* 皆為 CC0 音樂（來源見 audio/CREDITS.md）。loop 是音檔的精確長度；
   * AAC 解碼後開頭多出的 priming 靜音靠 duration - loop 算回來 */
  const TRACKS = {
    office: { base: './audio/bgm-office', loop: 88 },
    story: { base: './audio/bgm-story', loop: 52 },
    ending: { base: './audio/bgm-ending', loop: 124.1 },
    /* 片頭：一次性播放不循環，46 秒尾端已在音檔內淡出；演出結束由 opening.js 切回 story */
    opening: { base: './audio/bgm-opening', once: true },
  };
  const SILENCE = './audio/silence.wav';

  let ctx = null;
  let master = null;
  let current = null;   // { name, source, gain }
  let scene = 'office';
  let enabled = false;
  let loadToken = 0;    // 載入途中若切了場景或關掉，舊的載入完成後直接丟棄
  const buffers = {};
  let btn = null;
  let icon = null;
  let keepAlive = null; // iOS 16 以下讓音訊 session 轉為媒體播放用的無聲 <audio>

  function readPref() { try { return localStorage.getItem(PREF_KEY); } catch (e) { return null; } }
  function savePref(v) { try { localStorage.setItem(PREF_KEY, v); } catch (e) { /* 私密模式忽略，本次仍可用 */ } }

  /* iPadOS 桌面模式的 UA 自稱 Macintosh，只能靠觸控點數辨認 */
  const isIOS = /iPhone|iPad|iPod/.test(navigator.userAgent)
    || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);

  /* Safari 不支援 Ogg 容器，canPlayType 卻可能回 'maybe'；先抓 .ogg 會白下載半 MB 再退回 AAC，
   * 所以 WebKit 一律 AAC 優先。其他瀏覽器仍以 Opus 為先（檔案小一半） */
  function extOrder() {
    const a = document.createElement('audio');
    const opus = a.canPlayType && a.canPlayType('audio/ogg; codecs=opus');
    const webkit = isIOS || (/Safari/.test(navigator.userAgent) && !/Chrom/.test(navigator.userAgent));
    return opus && !webkit ? ['.ogg', '.m4a'] : ['.m4a', '.ogg'];
  }

  async function load(name) {
    if (buffers[name]) return buffers[name];
    let lastErr = null;
    for (const ext of extOrder()) {
      try {
        const res = await fetch(TRACKS[name].base + ext);
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        const buf = await ctx.decodeAudioData(await res.arrayBuffer());
        buffers[name] = buf;
        return buf;
      } catch (e) { lastErr = e; }
    }
    throw lastErr;
  }

  function fadeOut(track) {
    const t = ctx.currentTime;
    track.gain.gain.cancelScheduledValues(t);
    track.gain.gain.setValueAtTime(track.gain.gain.value, t);
    track.gain.gain.linearRampToValueAtTime(0, t + FADE);
    track.source.stop(t + FADE + 0.05);
  }

  async function play(name) {
    if (!ctx || !enabled) return;
    if (current && current.name === name) return;
    const token = ++loadToken;
    let buf;
    try { buf = await load(name); } catch (e) { unavailable('背景音樂載入失敗'); return; }
    if (token !== loadToken || !enabled) return;
    if (current) fadeOut(current);
    const source = ctx.createBufferSource();
    source.buffer = buf;
    const once = !!TRACKS[name].once;
    source.loop = !once;
    const extra = once ? 0 : Math.max(0, buf.duration - TRACKS[name].loop);
    if (!once) { source.loopStart = extra; source.loopEnd = buf.duration; }
    const gain = ctx.createGain();
    const t = ctx.currentTime;
    gain.gain.setValueAtTime(0, t);
    gain.gain.linearRampToValueAtTime(1, t + FADE);
    source.connect(gain).connect(master);
    source.start(0, extra);
    current = { name, source, gain };
  }

  /*
   * iOS 把 Web Audio 歸在「環境音」類別，靜音模式會整個消音；<audio>/<video> 則屬「媒體播放」不受影響。
   * iOS 17+ 可用 Audio Session API 直接把整頁宣告為媒體播放。更舊的 iOS 沒有這個 API，
   * 退而讓一段無聲 <audio> 同時循環播放，系統就會把 session 切成媒體播放，Web Audio 跟著出聲。
   * 兩者都必須在使用者手勢內呼叫。
   */
  function claimPlaybackSession() {
    if ('audioSession' in navigator) {
      try { navigator.audioSession.type = 'playback'; } catch (e) { /* 舊版屬性唯讀或型別不同，交給備援 */ }
      return;
    }
    if (!isIOS) return;
    if (!keepAlive) {
      keepAlive = document.createElement('audio');
      keepAlive.src = SILENCE;
      keepAlive.loop = true;
      keepAlive.setAttribute('playsinline', '');
      keepAlive.preload = 'auto';
    }
    const p = keepAlive.play();
    if (p && p.catch) p.catch(() => { /* 手勢外被拒，下一次手勢再試 */ });
  }
  function releasePlaybackSession() {
    if (keepAlive) { keepAlive.pause(); keepAlive.currentTime = 0; }
  }

  /* iOS 首次 resume 可能因手勢不被承認而失敗，或在來電、切 App 後停在 'interrupted'；
   * 之前只在 visibilitychange 重試，這裡改成任何後續手勢都補一次 */
  function resumeIfNeeded() {
    if (!ctx || !enabled) return;
    if (ctx.state !== 'running') ctx.resume().catch(() => { /* 待下一次手勢 */ });
    if (keepAlive && keepAlive.paused) claimPlaybackSession();
  }

  async function enable() {
    claimPlaybackSession();
    if (!ctx) {
      const AC = window.AudioContext || window.webkitAudioContext;
      if (!AC) { unavailable('此瀏覽器不支援背景音樂'); return; }
      ctx = new AC();
      master = ctx.createGain();
      master.gain.value = MASTER;
      master.connect(ctx.destination);
    }
    enabled = true;
    savePref('on');
    render();
    try { await ctx.resume(); } catch (e) { /* 仍在未互動狀態時 resume 會被拒，下一次互動再試 */ }
    play(scene);
  }

  function disable() {
    enabled = false;
    loadToken++;
    savePref('off');
    render();
    if (current && ctx) { fadeOut(current); current = null; }
    setTimeout(() => {
      if (enabled) return;
      if (ctx && ctx.state === 'running') ctx.suspend();
      releasePlaybackSession();
    }, FADE * 1000 + 100);
  }

  function unavailable(reason) {
    enabled = false;
    current = null;
    releasePlaybackSession();
    if (btn) { btn.disabled = true; btn.title = reason; btn.setAttribute('aria-label', reason); }
  }

  function render() {
    if (!btn) return;
    btn.setAttribute('aria-pressed', String(enabled));
    btn.title = enabled ? '關閉背景音樂' : '開啟背景音樂';
    icon.src = enabled ? './images/icon/icon-sound-on.svg' : './images/icon/icon-sound-off.svg';
  }

  function setScene(name) {
    if (!TRACKS[name] || name === scene) return;
    scene = name;
    if (enabled) play(name);
  }

  /* 依步驟類型挑聲景：劇情用港邊懸疑，結案（指認／提交）用明亮收尾，其餘一律檔案室雨夜 */
  function sceneFor(stepType) {
    if (stepType === 'story') return 'story';
    if (stepType === 'answer' || stepType === 'solution') return 'ending';
    return 'office';
  }

  function init() {
    btn = document.getElementById('btn-bgm');
    if (!btn) return;
    icon = btn.querySelector('img');
    btn.addEventListener('click', () => (enabled ? disable() : enable()));

    /* 上次選擇開啟：頁面載入時無法直接出聲，等第一次互動再啟動。
     * 用 click／touchend／keydown 而不用 pointerdown：iOS 對按下（尚未放開）的手勢不一定承認為使用者啟動，
     * AudioContext 會建立在 suspended 狀態且 resume 被拒 */
    const GESTURES = ['click', 'touchend', 'keydown'];
    if (readPref() === 'on') {
      enabled = true;
      render();
      const arm = () => { GESTURES.forEach((ev) => document.removeEventListener(ev, arm, true)); if (enabled) enable(); };
      GESTURES.forEach((ev) => document.addEventListener(ev, arm, true));
    } else {
      render();
    }
    GESTURES.forEach((ev) => document.addEventListener(ev, resumeIfNeeded, true));

    document.addEventListener('visibilitychange', () => {
      if (!ctx || !enabled) return;
      if (document.hidden) ctx.suspend();
      else ctx.resume().catch(() => { /* 待下一次互動 */ });
    });
  }

  /* enable 供開場演出的「有聲播放」按鈕呼叫：它本身就在使用者手勢內，符合自動播放限制。
   * bus 讓開場演出把即時合成的音效（雨聲、打字聲）接到同一個 master：音量與開關跟背景音樂一致，關掉音樂就全靜 */
  function bus() { return enabled && ctx ? { ctx, master } : null; }
  window.SD.audio = { init, enable, setScene, sceneFor, bus, isEnabled: () => enabled };
})();
