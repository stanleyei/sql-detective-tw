/* 進度儲存：localStorage，單一 key，版本化 */
(function () {
  'use strict';
  window.SD = window.SD || {};
  const KEY = 'sd_progress_v1';
  const DB_KEY = 'sd_db_v1';
  /* 查詢紀錄與草稿各用獨立 key：不跟進度搶同一個 JSON，資料庫快照吃滿配額時也只影響各自的寫入 */
  const HISTORY_KEY = 'sd_history_v1';
  const DRAFT_KEY = 'sd_draft_v1';
  const HISTORY_MAX = 50;

  /* badgeAt 記每枚徽章的取得時間，供偵探檔案顯示日期；舊存檔沒有此欄位時由 empty() 的展開補上空物件 */
  const empty = () => ({ v: 1, chapters: {}, clues: [], badges: [], badgeAt: {}, updatedAt: null });
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
    if (!s.badges.includes(id)) { s.badges.push(id); s.badgeAt[id] = new Date().toISOString(); save(); return true; }
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
  function resetAll() {
    state = empty(); save();
    try { [DB_KEY, HISTORY_KEY, DRAFT_KEY].forEach((k) => localStorage.removeItem(k)); } catch (e) { /* 忽略 */ }
  }
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

  /**
   * 查詢紀錄，新的在前。entry：{ sql, kind: 'run' | 'draft', ch, status, summary, at }
   * 與最新一筆 SQL 相同時只更新那一筆，連按執行不會洗版；但草稿不覆寫同內容的執行紀錄，免得執行結果被洗掉。
   */
  function history() {
    try { const list = JSON.parse(localStorage.getItem(HISTORY_KEY) || '[]'); return Array.isArray(list) ? list : []; } catch (e) { return []; }
  }
  function addHistory(entry) {
    const list = history();
    const item = { ...entry, at: new Date().toISOString() };
    if (list[0] && list[0].sql === item.sql) { if (item.kind === 'draft') return; list[0] = item; } else list.unshift(item);
    try { localStorage.setItem(HISTORY_KEY, JSON.stringify(list.slice(0, HISTORY_MAX))); } catch (e) { /* 配額不足時放棄紀錄，不影響遊戲 */ }
  }
  function clearHistory() { try { localStorage.removeItem(HISTORY_KEY); } catch (e) { /* 忽略 */ } }
  function saveDraft(text) { try { if (text) localStorage.setItem(DRAFT_KEY, text); else localStorage.removeItem(DRAFT_KEY); } catch (e) { /* 忽略 */ } }
  function loadDraft() { try { return localStorage.getItem(DRAFT_KEY) || ''; } catch (e) { return ''; } }

  window.SD.state = { load, save, chapter, markStep, useHint, addClue, addBadge, chapterStars, resetAll, resetChapter, saveDb, loadDb, clearDb, history, addHistory, clearHistory, saveDraft, loadDraft };
})();
