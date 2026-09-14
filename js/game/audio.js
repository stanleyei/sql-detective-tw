/* 背景音樂：三段環境聲景（事務所／劇情／結案），依目前步驟類型切換，預設靜音。
 * 用 Web Audio 而非 <audio loop>：後者在檔案接縫有可聽的空隙，低頻 drone 類聲景特別明顯。
 * 瀏覽器禁止未經使用者互動就出聲，所以 AudioContext 只在按下按鈕（或曾開啟者的首次互動）時建立。 */
(function () {
  'use strict';
  window.SD = window.SD || {};

  const PREF_KEY = 'sd-bgm';       // 'on' | 'off'；沒有值代表從未選擇
  const HINT_KEY = 'sd-bgm-hint';  // 提示氣泡看過一次就不再出現
  const MASTER = 0.4;              // 音檔已正規化到 -23 LUFS，這裡再壓低當背景
  const FADE = 1.5;                // 場景切換與開關的淡入淡出秒數
  /* 三段皆為 CC0 音樂（來源見 audio/CREDITS.md）。loop 是音檔的精確長度；
   * AAC 解碼後開頭多出的 priming 靜音靠 duration - loop 算回來 */
  const TRACKS = {
    office: { base: './audio/bgm-office', loop: 88 },
    story: { base: './audio/bgm-story', loop: 52 },
    ending: { base: './audio/bgm-ending', loop: 124.1 },
  };

  let ctx = null;
  let master = null;
  let current = null;   // { name, source, gain }
  let scene = 'office';
  let enabled = false;
  let loadToken = 0;    // 載入途中若切了場景或關掉，舊的載入完成後直接丟棄
  const buffers = {};
  let btn = null;
  let icon = null;
  let hint = null;

  function readPref() { try { return localStorage.getItem(PREF_KEY); } catch (e) { return null; } }
  function savePref(v) { try { localStorage.setItem(PREF_KEY, v); } catch (e) { /* 私密模式忽略，本次仍可用 */ } }

  /* Safari 對 Ogg Opus 的支援較晚，先問 canPlayType，解碼失敗再退到 AAC */
  function extOrder() {
    const a = document.createElement('audio');
    const opus = a.canPlayType && a.canPlayType('audio/ogg; codecs=opus');
    return opus ? ['.ogg', '.m4a'] : ['.m4a', '.ogg'];
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
    source.loop = true;
    const extra = Math.max(0, buf.duration - TRACKS[name].loop);
    source.loopStart = extra;
    source.loopEnd = buf.duration;
    const gain = ctx.createGain();
    const t = ctx.currentTime;
    gain.gain.setValueAtTime(0, t);
    gain.gain.linearRampToValueAtTime(1, t + FADE);
    source.connect(gain).connect(master);
    source.start(0, extra);
    current = { name, source, gain };
  }

  async function enable() {
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
    hideHint();
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
    setTimeout(() => { if (!enabled && ctx && ctx.state === 'running') ctx.suspend(); }, FADE * 1000 + 100);
  }

  function unavailable(reason) {
    enabled = false;
    current = null;
    if (btn) { btn.disabled = true; btn.title = reason; btn.setAttribute('aria-label', reason); }
    hideHint();
  }

  function render() {
    if (!btn) return;
    btn.setAttribute('aria-pressed', String(enabled));
    btn.title = enabled ? '關閉背景音樂' : '開啟背景音樂';
    icon.src = enabled ? './images/icon/icon-sound-on.svg' : './images/icon/icon-sound-off.svg';
  }

  function hideHint() {
    if (!hint || hint.hidden) return;
    hint.hidden = true;
    try { localStorage.setItem(HINT_KEY, '1'); } catch (e) { /* 忽略 */ }
  }

  function showHintOnce() {
    let seen = null;
    try { seen = localStorage.getItem(HINT_KEY); } catch (e) { seen = '1'; }
    if (seen || readPref() !== null) return;
    // 等開場過場退場後再冒出來，避免和載入文字搶注意力
    setTimeout(() => {
      if (enabled || !hint) return;
      hint.hidden = false;
      // 靠右對齊在手機上會衝出左緣，量到超出就改靠左對齊按鈕
      if (hint.getBoundingClientRect().left < 8) hint.classList.add('bgm-hint-left');
      setTimeout(hideHint, 20000);
    }, 2500);
  }

  function setScene(name) {
    if (!TRACKS[name] || name === scene) return;
    scene = name;
    if (enabled) play(name);
  }

  /* 依步驟類型挑聲景：劇情用港邊懸疑，結案（指認／提交）用明亮收尾，其餘一律事務所雨夜 */
  function sceneFor(stepType) {
    if (stepType === 'story') return 'story';
    if (stepType === 'answer' || stepType === 'solution') return 'ending';
    return 'office';
  }

  function init() {
    btn = document.getElementById('btn-bgm');
    if (!btn) return;
    icon = btn.querySelector('img');
    hint = document.getElementById('bgm-hint');
    btn.addEventListener('click', () => (enabled ? disable() : enable()));
    const close = hint && hint.querySelector('button');
    if (close) close.addEventListener('click', hideHint);

    // 上次選擇開啟：頁面載入時無法直接出聲，等第一次任何互動再啟動
    if (readPref() === 'on') {
      enabled = true;
      render();
      const arm = () => { document.removeEventListener('pointerdown', arm, true); document.removeEventListener('keydown', arm, true); if (enabled) enable(); };
      document.addEventListener('pointerdown', arm, true);
      document.addEventListener('keydown', arm, true);
    } else {
      render();
      showHintOnce();
    }

    document.addEventListener('visibilitychange', () => {
      if (!ctx || !enabled) return;
      if (document.hidden) ctx.suspend();
      else ctx.resume().catch(() => { /* 待下一次互動 */ });
    });
  }

  window.SD.audio = { init, setScene, sceneFor };
})();
