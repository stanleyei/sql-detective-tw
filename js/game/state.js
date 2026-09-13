/* 進度儲存：localStorage，單一 key，版本化 */
(function () {
  'use strict';
  window.SD = window.SD || {};
  const KEY = 'sd_progress_v1';
  const DB_KEY = 'sd_db_v1';

  const empty = () => ({ v: 1, chapters: {}, clues: [], badges: [], updatedAt: null });
  let state = null;

  function load() {
    if (state) return state;
    try {
      const raw = localStorage.getItem(KEY);
      state = raw ? { ...empty(), ...JSON.parse(raw) } : empty();
    } catch (e) { state = empty(); }
    return state;
  }
  function save() {
    state.updatedAt = new Date().toISOString();
    try { localStorage.setItem(KEY, JSON.stringify(state)); } catch (e) { /* 私密模式或配額不足時忽略，遊戲仍可進行 */ }
  }
  function chapter(id) {
    const s = load();
    if (!s.chapters[id]) s.chapters[id] = { step: 0, done: false, steps: {}, hints: {}, stars: 0 };
    return s.chapters[id];
  }
  function markStep(chId, stepId, extra) {
    const ch = chapter(chId);
    ch.steps[stepId] = { done: true, ...(extra || {}) };
    save();
  }
  function useHint(chId, stepId, level) {
    const ch = chapter(chId);
    ch.hints[stepId] = Math.max(ch.hints[stepId] || 0, level);
    save();
  }
  function addClue(clue) {
    const s = load();
    if (!s.clues.some((c) => c.id === clue.id)) { s.clues.push(clue); save(); return true; }
    return false;
  }
  function addBadge(id) {
    const s = load();
    if (!s.badges.includes(id)) { s.badges.push(id); save(); return true; }
    return false;
  }
  /** 章節星數：每個任務 3 星起算，用第 1~2 個提示扣 1 星、看解答扣 2 星 */
  function chapterStars(chId, tasks) {
    const ch = load().chapters[chId];
    if (!ch) return { earned: 0, max: tasks.length * 3 };
    let total = 0;
    for (const t of tasks) {
      if (!ch.steps[t.id] || !ch.steps[t.id].done) continue;
      const h = ch.hints[t.id] || 0;
      total += h >= 3 ? 1 : h >= 1 ? 2 : 3;
    }
    return { earned: total, max: tasks.length * 3 };
  }
  function resetAll() { state = empty(); save(); try { localStorage.removeItem(DB_KEY); } catch (e) { /* 忽略 */ } }
  function resetChapter(chId) { const s = load(); delete s.chapters[chId]; save(); }

  /** 資料庫快照（ch5 的 DDL/DML 成果要跨重新整理保留） */
  function saveDb(u8) {
    try {
      let bin = '';
      for (let i = 0; i < u8.length; i += 0x8000) bin += String.fromCharCode.apply(null, u8.subarray(i, i + 0x8000));
      localStorage.setItem(DB_KEY, btoa(bin));
    } catch (e) { /* 配額不足時放棄快照，不影響遊戲 */ }
  }
  function loadDb() {
    try {
      const b64 = localStorage.getItem(DB_KEY);
      if (!b64) return null;
      const bin = atob(b64);
      const u8 = new Uint8Array(bin.length);
      for (let i = 0; i < bin.length; i++) u8[i] = bin.charCodeAt(i);
      return u8;
    } catch (e) { return null; }
  }
  function clearDb() { try { localStorage.removeItem(DB_KEY); } catch (e) { /* 忽略 */ } }

  window.SD.state = { load, save, chapter, markStep, useHint, addClue, addBadge, chapterStars, resetAll, resetChapter, saveDb, loadDb, clearDb };
})();
