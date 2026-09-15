/* 遊戲主控：章節、步驟、編輯器、結果、證據板、徽章 */
(function () {
  'use strict';
  const $ = (sel, root = document) => root.querySelector(sel);
  const el = (tag, cls, html) => { const e = document.createElement(tag); if (cls) e.className = cls; if (html !== undefined) e.innerHTML = html; return e; };
  const esc = (s) => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
  const reduce = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  const canAnimate = () => !!window.gsap && !reduce;

  const chapters = SD.chapters.slice().sort((a, b) => a.id - b.id);
  const state = SD.state.load();
  let chapter = null;
  let stepIndex = 0;
  let lastResults = [];
  let lastSql = '';
  let dbReady = false;
  let saveTimer = null;

  // ---------------------------------------------------------------------------
  // 工具
  // ---------------------------------------------------------------------------
  const isDone = (ch) => !!(state.chapters[ch.id] && state.chapters[ch.id].done);
  const unlocked = (ch) => ch.id === 0 || isDone(chapters.find((c) => c.id === ch.id - 1));
  const tasksOf = (ch) => ch.steps.filter((s) => s.type === 'task');
  const prog = () => SD.state.chapter(chapter.id);
  const stepDone = (step) => !!(prog().steps[step.id || `${chapter.slug}-s${chapter.steps.indexOf(step)}`] && prog().steps[step.id || `${chapter.slug}-s${chapter.steps.indexOf(step)}`].done);
  const stepKey = (step) => step.id || `${chapter.slug}-s${chapter.steps.indexOf(step)}`;
  const needsCompletion = (step) => ['task', 'blocks', 'quiz', 'answer', 'solution', 'story'].includes(step.type);

  function totalStars() {
    return chapters.reduce((sum, ch) => sum + SD.state.chapterStars(ch.id, tasksOf(ch)).earned, 0);
  }

  // ---------------------------------------------------------------------------
  // 面板切換（手機）
  // ---------------------------------------------------------------------------
  const panes = { story: $('#pane-story'), editor: $('#pane-editor') };
  const lg = window.matchMedia('(min-width: 64rem)');
  let activePane = 'story';
  function applyPanes() {
    for (const [k, p] of Object.entries(panes)) p.hidden = lg.matches ? false : k !== activePane;
    document.querySelectorAll('#pane-tabs [data-pane]').forEach((b) => b.setAttribute('aria-selected', String(b.dataset.pane === activePane)));
  }
  function showPane(name) { activePane = name; applyPanes(); }
  lg.addEventListener('change', applyPanes);
  // 手機上 18 顆表名 chip 會佔掉大半個畫面，預設收合；桌機中欄夠高則維持展開。只在載入時決定一次，不覆寫使用者之後的開合
  if (!lg.matches) $('#schema-card').open = false;
  $('#pane-tabs').addEventListener('click', (e) => { const b = e.target.closest('[data-pane]'); if (b) showPane(b.dataset.pane); });
  applyPanes();

  /* 焦點模式：read（劇情／教學）壓暗右側兩欄，write（任務）點亮編輯器；樣式見 tailwind.css */
  const main = $('#main');
  function setFocus(mode) { main.dataset.focus = mode; }

  // <details class="menu"> 下拉選單（header「⋯」、查詢紀錄）：點外面或按 Esc 關閉，Esc 時焦點回到開關
  const menus = [...document.querySelectorAll('details.menu')];
  document.addEventListener('click', (e) => { menus.forEach((m) => { if (m.open && !m.contains(e.target)) m.open = false; }); });
  document.addEventListener('keydown', (e) => {
    if (e.key !== 'Escape') return;
    menus.forEach((m) => { if (m.open) { m.open = false; m.querySelector('summary').focus(); } });
  });
  const moreMenu = $('#more-menu');
  moreMenu.addEventListener('click', (e) => { if (e.target.closest('.menu-item')) moreMenu.open = false; });

  // ---------------------------------------------------------------------------
  // 編輯器與結果
  // ---------------------------------------------------------------------------
  const editor = $('#editor');
  const resultsEl = $('#results');

  function insertAtCursor(text) {
    showPane('editor');
    const start = editor.selectionStart, end = editor.selectionEnd;
    const before = editor.value.slice(0, start), after = editor.value.slice(end);
    const pad = before && !/\s$/.test(before) ? ' ' : '';
    editor.focus();
    editor.setSelectionRange(start, end);
    if (!execInsert(pad + text)) {
      editor.value = before + pad + text + after;
      const pos = start + pad.length + text.length;
      editor.setSelectionRange(pos, pos);
    }
    saveDraftSoon(500);
  }
  /*
   * 程式寫入編輯器一律用 execCommand('insertText')，不直接設 value：直接設 value 會打亂瀏覽器原生的復原堆疊，
   * 之後按 Ctrl+Z 會救不回被蓋掉的內容，甚至拼出錯亂的文字。execCommand 雖列為過時，主流瀏覽器仍支援。
   */
  function execInsert(text) {
    try { return text ? document.execCommand('insertText', false, text) : document.execCommand('delete'); } catch (e) { return false; }
  }
  /** 整段取代編輯器內容；execInsert 失敗（不支援或編輯器不可見）時才退回設 value */
  function writeEditor(text) {
    editor.focus();
    if (editor.value === text) return;
    editor.select();
    if (!execInsert(text) || editor.value !== text) editor.value = text;
    saveDraftSoon(0);
  }

  /** 所有「整段取代編輯器」的操作都走這裡：原本有內容就先存進紀錄，並提供復原 */
  function replaceEditor(text, message) {
    const prev = editor.value;
    const changed = prev.trim() && prev.trim() !== text.trim();
    if (changed) { SD.state.addHistory({ sql: prev.trim(), kind: 'draft', ch: chapter ? chapter.id : null }); renderHistory(); }
    // 先切到查詢分頁：手機上編輯器所在面板是 hidden，無法聚焦也就無法 execCommand
    showPane('editor');
    writeEditor(text);
    // 沒產生新的復原點時也收掉舊提示，否則「已清空」之類的訊息會對應到錯的內容
    if (changed) showUndo(message, prev); else hideUndo();
  }
  function setEditor(text) { replaceEditor(text, '已用帶入的 SQL 取代原本的內容。'); }

  const undoBox = $('#editor-undo');
  let undoTimer = null;
  function hideUndo() { clearTimeout(undoTimer); undoBox.innerHTML = ''; }
  function showUndo(message, prev) {
    hideUndo();
    const row = el('div', 'flex items-center gap-3 rounded-xl border border-teal/60 bg-ink-900 py-1 pl-3 pr-1 text-sm shadow-card');
    row.appendChild(el('span', 'flex-1', esc(message)));
    const b = el('button', 'btn-ghost btn-sm', '復原');
    b.type = 'button';
    b.addEventListener('click', () => {
      // 帶入後若又改過，復原前把目前內容也留進紀錄，來回切換都不會掉東西
      const cur = editor.value.trim();
      if (cur && cur !== prev.trim()) { SD.state.addHistory({ sql: cur, kind: 'draft', ch: chapter ? chapter.id : null }); renderHistory(); }
      writeEditor(prev);
      hideUndo();
    });
    row.appendChild(b);
    undoBox.appendChild(row);
    // 焦點在復原按鈕上時不收掉，避免鍵盤使用者按到一半按鈕消失
    const schedule = () => { undoTimer = setTimeout(() => { if (undoBox.contains(document.activeElement)) schedule(); else hideUndo(); }, 8000); };
    schedule();
  }

  /* 草稿自動保存：重新整理或關掉分頁後，打到一半的 SQL 仍在 */
  let draftTimer = null;
  function saveDraftSoon(delay) { clearTimeout(draftTimer); draftTimer = setTimeout(() => SD.state.saveDraft(editor.value), delay); }
  editor.value = SD.state.loadDraft();
  editor.addEventListener('input', () => { saveDraftSoon(500); histNav = null; });
  window.addEventListener('pagehide', () => SD.state.saveDraft(editor.value));

  function renderTable(res) {
    const wrap = el('div', 'max-h-[26rem] overflow-auto rounded-xl border border-ink-700');
    const table = el('table', 'result-table');
    // 表頭下方以小字補中文說明；結果集沒有表名，對不到（別名、COUNT(*)）就不顯示
    table.innerHTML = `<thead><tr>${res.columns.map((c) => { const zh = SD.schemaDoc.generic(c); return `<th scope="col">${esc(c)}${zh ? `<span class="th-zh">${esc(zh)}</span>` : ''}</th>`; }).join('')}</tr></thead>`;
    const tbody = el('tbody');
    for (const row of res.values) {
      const tr = el('tr');
      tr.innerHTML = row.map((v) => (v === null ? '<td class="null">NULL</td>' : `<td>${esc(v)}</td>`)).join('');
      tbody.appendChild(tr);
    }
    table.appendChild(tbody);
    wrap.appendChild(table);
    return wrap;
  }

  function renderResults(results) {
    resultsEl.innerHTML = '';
    if (!results.length) { resultsEl.appendChild($('#tpl-results-empty').content.cloneNode(true)); return; }
    for (const r of results) {
      const card = el('div', 'card p-4 flex flex-col gap-3');
      const head = el('div', 'flex flex-wrap items-start justify-between gap-2');
      head.appendChild(el('pre', 'prose-sd m-0 flex-1 rounded-lg bg-ink-950 p-2 text-code', `<code>${SD.highlight(r.sql)}</code>`));
      card.appendChild(head);
      if (r.type === 'result') {
        head.appendChild(el('span', 'chip border-teal/50 text-teal', `${r.total} 筆${r.truncated ? `，只顯示前 ${r.values.length} 筆` : ''}`));
        card.appendChild(r.values.length ? renderTable(r) : el('p', 'text-sm text-ink-300', '查詢成功，但沒有符合條件的資料（0 筆）。'));
      } else if (r.type === 'affected') {
        head.appendChild(el('span', 'chip border-amber/50 text-amber', `Query OK，影響 ${r.count} 筆`));
      } else if (r.type === 'message') {
        head.appendChild(el('span', 'chip border-amber/50 text-amber', r.ddl ? 'Query OK' : '訊息'));
        card.appendChild(el('p', 'text-sm text-paper', esc(r.text)));
      } else if (r.type === 'error') {
        const compat = r.level === 'compat';
        head.appendChild(el('span', `chip ${compat ? 'border-amber/50 text-amber' : 'border-danger/60 text-danger'}`, compat ? '模擬環境限制' : '錯誤'));
        const box = el('div', `rounded-xl border p-3 ${compat ? 'border-amber/40 bg-amber/5' : 'border-danger/40 bg-danger/5'}`);
        box.innerHTML = `<p class="font-bold ${compat ? 'text-amber' : 'text-danger'}">${esc(r.title)}</p><p class="mt-1 text-sm leading-6">${esc(r.text)}</p>${(r.hints || []).map((h) => `<p class="mt-1 text-sm text-ink-300">${esc(h)}</p>`).join('')}`;
        card.appendChild(box);
      }
      if (r.notes && r.notes.length) {
        card.appendChild(el('ul', 'flex flex-col gap-1 text-xs text-ink-300', r.notes.map((n) => `<li>ℹ️ ${esc(n)}</li>`).join('')));
      }
      resultsEl.appendChild(card);
    }
    if (canAnimate()) gsap.from(resultsEl.children, { y: 12, opacity: 0, duration: 0.35, stagger: 0.06, ease: 'power2.out' });
  }

  function scheduleDbSave() {
    clearTimeout(saveTimer);
    saveTimer = setTimeout(() => { try { SD.state.saveDb(SD.db.export()); } catch (e) { /* 忽略 */ } }, 400);
  }

  async function runSql() {
    if (!dbReady) return;
    const sql = editor.value.trim();
    if (!sql) return;
    lastSql = sql;
    lastResults = SD.db.run(sql);
    renderResults(lastResults);
    SD.state.addHistory({ sql, kind: 'run', ch: chapter ? chapter.id : null, ...runSummary(lastResults) });
    renderHistory();
    // 執行後收起欄位格，讓編輯器與結果同時留在視野內；表名 chip 仍在，一鍵可再展開
    if (openSchemaTable) renderSchemaCols(null);
    if (lastResults.some((r) => r.type === 'affected' || r.ddl)) { scheduleDbSave(); renderSchemaList(); }
    const step = chapter.steps[stepIndex];
    if (step && (step.type === 'task' || step.type === 'solution')) await evaluateStep(step);
  }
  $('#btn-run').addEventListener('click', runSql);
  $('#btn-clear').addEventListener('click', () => replaceEditor('', '已清空編輯器。'));
  editor.addEventListener('keydown', (e) => {
    if ((e.ctrlKey || e.metaKey) && e.key === 'Enter') { e.preventDefault(); runSql(); }
    if (e.key === 'Tab') { e.preventDefault(); insertAtCursor('  '); }
    // 只綁 Alt + 方向鍵：單純的上下鍵在多行 textarea 裡是移動游標
    if (e.altKey && (e.key === 'ArrowUp' || e.key === 'ArrowDown')) { e.preventDefault(); stepHistory(e.key === 'ArrowUp' ? 1 : -1); }
  });

  // ---------------------------------------------------------------------------
  // 查詢紀錄（編輯器下方）
  // ---------------------------------------------------------------------------
  function runSummary(results) {
    const err = results.find((r) => r.type === 'error');
    if (err) return { status: 'error', summary: `錯誤：${err.title}` };
    const last = results[results.length - 1];
    if (!last) return { status: 'ok', summary: '沒有結果' };
    if (last.type === 'result') return { status: 'ok', summary: `成功 · ${last.total} 筆` };
    if (last.type === 'affected') return { status: 'ok', summary: `Query OK · 影響 ${last.count} 筆` };
    return { status: 'ok', summary: 'Query OK' };
  }
  const visibleHistory = () => { const all = $('#history-all').checked; return SD.state.history().filter((h) => all || !chapter || h.ch === chapter.id); };
  const timeFmt = new Intl.DateTimeFormat('zh-TW', { month: 'numeric', day: 'numeric', hour: '2-digit', minute: '2-digit', hour12: false });

  function renderHistory() {
    const list = visibleHistory();
    const ol = $('#history-list');
    ol.innerHTML = '';
    list.forEach((h, i) => {
      const li = el('li', 'flex items-center gap-1');
      // 整列就是「帶入」按鈕；狀態以文字標示，不只靠顏色（WCAG 1.4.1）；SQL 來自使用者輸入，一律經 highlight／esc 轉義
      const label = h.kind === 'draft' ? '被取代的草稿' : h.summary;
      const tone = h.kind === 'draft' ? 'border-ink-600 text-ink-300' : h.status === 'error' ? 'border-danger/60 text-danger' : 'border-teal/50 text-teal';
      const where = h.ch !== null && h.ch !== undefined ? `第 ${esc(h.ch)} 章 · ` : '';
      li.innerHTML = `<button type="button" class="history-row" data-history-use="${i}"><span class="sr-only">帶入：</span><span class="flex flex-wrap items-center gap-2"><span class="chip ${tone} py-0">${esc(label)}</span><span class="text-xs text-ink-300">${where}${esc(timeFmt.format(new Date(h.at)))}</span></span><code class="history-sql">${SD.highlight(h.sql)}</code></button><button type="button" class="btn-ghost btn-sm shrink-0" data-history-insert="${i}" aria-label="插入游標處">插入</button>`;
      ol.appendChild(li);
    });
    // 數字與空狀態都以「目前可見的清單」為準：清單預設只看本章，若數字顯示總數會出現「有數字、清單卻是空的」的錯覺
    const others = SD.state.history().length - list.length;
    const emptyEl = $('#history-empty');
    emptyEl.hidden = list.length > 0;
    emptyEl.innerHTML = others
      ? `本章還沒有紀錄，其他章節有 ${others} 筆。<button type="button" id="btn-history-show-all" class="btn-ghost btn-sm ml-1">顯示所有章節</button>`
      : '還沒有紀錄。執行過或被取代的 SQL 會出現在這裡。';
    const count = $('#history-count');
    count.hidden = !list.length;
    count.textContent = list.length;
    $('#history-menu summary').setAttribute('aria-label', list.length ? `查詢紀錄，${$('#history-all').checked ? '共' : '本章'} ${list.length} 筆` : others ? `查詢紀錄，其他章節 ${others} 筆` : '查詢紀錄');
  }
  $('#history-empty').addEventListener('click', (e) => {
    if (!e.target.closest('#btn-history-show-all')) return;
    $('#history-all').checked = true;
    renderHistory();
  });
  $('#history-list').addEventListener('click', (e) => {
    const b = e.target.closest('[data-history-use], [data-history-insert]');
    if (!b) return;
    const list = visibleHistory();
    // 先關面板再寫入，焦點才會落回編輯器
    $('#history-menu').open = false;
    if (b.dataset.historyUse !== undefined) { const h = list[Number(b.dataset.historyUse)]; if (h) replaceEditor(h.sql, '已用紀錄中的 SQL 取代原本的內容。'); }
    else { const h = list[Number(b.dataset.historyInsert)]; if (h) insertAtCursor(h.sql); }
  });
  $('#history-all').addEventListener('change', renderHistory);
  $('#btn-history-clear').addEventListener('click', () => {
    if (!window.confirm('清除所有章節的查詢紀錄？此動作無法復原。')) return;
    SD.state.clearHistory(); histNav = null; renderHistory();
  });

  /*
   * Alt + ↑ ↓ 仿終端機瀏覽紀錄。開始瀏覽時暫存編輯器內容，往下回到起點時還原，
   * 所以單純翻看紀錄不會寫入任何東西；一旦手動輸入就結束瀏覽（input 事件把 histNav 設回 null）。
   */
  let histNav = null;
  function stepHistory(dir) {
    const list = visibleHistory();
    if (!histNav) { if (dir < 0 || !list.length) return; histNav = { pos: -1, stash: editor.value }; }
    const pos = Math.max(-1, Math.min(list.length - 1, histNav.pos + dir));
    if (pos === histNav.pos) return;
    const nav = histNav;
    nav.pos = pos;
    writeEditor(pos === -1 ? nav.stash : list[pos].sql);
    // writeEditor 觸發的 input 事件會清掉 histNav，寫完再掛回去
    histNav = pos === -1 ? null : nav;
  }

  // ---------------------------------------------------------------------------
  // 資料表面板（編輯器下方）
  // ---------------------------------------------------------------------------
  /* 同時只展開一張表，記住上次展開的表名；DDL 後重畫時若該表已被 DROP 就回到收合狀態 */
  let openSchemaTable = null;
  /*
   * 欄位面板的共用渲染器：中欄資料表面板與左欄任務「相關資料表」都用這一份，
   * 才不會兩邊功能落差（曾經任務區只有欄名、沒有中文說明）。
   * 標題列放表名、中文名、欄數與「插入表名」按鈕——表 chip 點擊是展開，表名要另有入口才能帶進編輯器。
   * onGoto：外鍵「→ 表.欄」列被點時要在哪個面板切換到目標表；narrow 讓側欄用較窄的格子。
   */
  function renderColumnGrid(container, t, { onGoto, narrow = false } = {}) {
    const s = SD.db.schema();
    const doc = SD.schemaDoc.table(t);
    const head = el('div', 'flex flex-wrap items-center gap-x-2 gap-y-1 border-b border-ink-800 pb-2 mb-2');
    head.innerHTML = `<span class="font-mono text-sm text-teal">${esc(t)}</span>${doc && doc.zh ? `<span class="text-xs text-ink-300">${esc(doc.zh)}</span>` : ''}<span class="text-xs text-ink-300">${s.byTable[t].length} 欄</span>`;
    const ins = el('button', 'btn-ghost btn-sm ml-auto', '插入表名');
    ins.type = 'button';
    ins.title = `把 ${t} 插入編輯器游標處`;
    ins.addEventListener('click', () => insertAtCursor(t));
    head.appendChild(ins);
    const grid = el('div', `grid gap-1 ${narrow ? 'grid-cols-[repeat(auto-fill,minmax(10rem,1fr))]' : 'grid-cols-[repeat(auto-fill,minmax(13rem,1fr))]'}`);
    for (const c of s.byTable[t]) {
      const fk = SD.schemaDoc.fk(t, c.name) || c.fk;
      // 外鍵不在第一行放補充：目標與補充合成「→ 表.欄（補充）」獨立成第二行的整行按鈕。
      // 放右側時長表名（transit_card.card_id）會把第一行擠到溢出、蓋在按鈕底下，直排才不會重疊
      const zh = fk ? '' : SD.schemaDoc.column(t, c.name);
      const icon = c.pk ? SD.schemaDoc.keyIcon('pk') : fk ? SD.schemaDoc.keyIcon('fk') : '';
      const type = (c.type || '').split(' ')[0].toLowerCase();
      const cell = el('div', 'flex flex-col rounded-lg border border-ink-800 bg-ink-950/40');
      const b = el('button', 'flex min-h-11 min-w-0 flex-col justify-center gap-0.5 rounded-lg px-2.5 py-1.5 text-left hover:bg-ink-800', `<span class="flex min-w-0 flex-wrap items-baseline gap-x-2 font-mono text-xs text-paper"><span class="inline-flex items-center gap-1">${icon}${esc(c.name)}</span><span class="text-ink-300">${esc(type)}</span></span>${zh ? `<span class="truncate text-xs text-ink-300">${esc(zh)}</span>` : ''}`);
      b.type = 'button';
      b.title = zh ? `${zh}，插入 ${c.name}` : `插入 ${c.name}`;
      b.addEventListener('click', () => insertAtCursor(c.name));
      cell.appendChild(b);
      if (fk) {
        const label = `→ ${fk.table}.${fk.column}${fk.note ? `（${fk.note}）` : ''}`;
        const go = el('button', 'min-h-11 rounded-b-lg border-t border-ink-800 px-2.5 py-1.5 text-left font-mono text-xs text-teal hover:bg-ink-800 hover:text-amber', esc(label));
        go.type = 'button';
        go.title = `前往 ${fk.table}`;
        go.setAttribute('aria-label', `外鍵，前往 ${fk.table} 表的 ${fk.column} 欄${fk.note ? `（${fk.note}）` : ''}`);
        go.addEventListener('click', () => onGoto && onGoto(fk.table));
        cell.appendChild(go);
      }
      grid.appendChild(cell);
    }
    container.append(head, grid);
  }
  function renderSchemaCols(t) {
    const s = SD.db.schema();
    const cols = $('#schema-cols');
    $('#schema-tabs').querySelectorAll('[data-table]').forEach((b) => b.setAttribute('aria-expanded', String(b.dataset.table === t)));
    if (!t || !s.byTable[t]) { openSchemaTable = null; cols.hidden = true; cols.innerHTML = ''; return; }
    openSchemaTable = t;
    cols.hidden = false;
    cols.innerHTML = '';
    renderColumnGrid(cols, t, { onGoto: renderSchemaCols });
    const actions = el('div', 'mt-2 flex flex-wrap gap-2');
    const mk = (label, sql, title) => { const b = el('button', 'btn-ghost btn-sm flex-1', label); b.type = 'button'; if (title) b.title = title; b.addEventListener('click', () => { setEditor(sql); runSql(); }); return b; };
    actions.append(mk('DESCRIBE', `DESCRIBE ${t};`), mk('看 5 筆', `SELECT * FROM ${t} LIMIT 5;`), mk('欄位備註', `SHOW FULL COLUMNS FROM ${t};`, 'SHOW FULL COLUMNS：含中文 Comment'));
    cols.appendChild(actions);
  }
  function renderSchemaList() {
    if (!dbReady) return;
    const tabs = $('#schema-tabs');
    const s = SD.db.schema();
    tabs.innerHTML = s.tables.map((t) => `<button type="button" class="chip min-h-9 cursor-pointer font-mono text-teal hover:border-amber aria-expanded:border-amber aria-expanded:text-amber" data-table="${esc(t)}" aria-expanded="false">${esc(t)} <span class="font-sans text-ink-300">${s.byTable[t].length}</span></button>`).join('');
    renderSchemaCols(openSchemaTable);
  }
  $('#schema-tabs').addEventListener('click', (e) => {
    const b = e.target.closest('[data-table]');
    if (b) renderSchemaCols(b.dataset.table === openSchemaTable ? null : b.dataset.table);
  });

  // ---------------------------------------------------------------------------
  // 證據板與徽章
  // ---------------------------------------------------------------------------
  /*
   * 證據板是全螢幕 <dialog>（#board-stage）。板上每張線索是一張拍立得；
   * 尚未在板上看過的線索記在 newClueIds，header 按鈕亮點、卡片加「新」標，開板即清除。
   */
  const boardStage = $('#board-stage');
  const newClueIds = new Set();
  let boardFilter = 'current'; // 'current' | 'all' | 章節 id
  // 'browse' 是平常翻看；'verdict' 是結案室：鎖定本章、頂端釘指認卡、缺的線索留空釘位
  let boardMode = 'browse';
  let boardReturnFocus = null;

  /* 存檔裡的線索文字只是取得當下的快照；文案改版後要讓既有玩家也看到新字，渲染時一律回頭查章節定義，查不到（如「結案」卡）才用存檔值 */
  function liveClue(clue) {
    const ch = chapters.find((c) => c.id === clue.ch);
    const step = ch && ch.steps.find((s) => s.id === clue.id);
    return step && step.clue ? { ...clue, title: step.clue.title, text: step.clue.text } : clue;
  }
  function clueCard(saved, isNew) {
    const clue = liveClue(saved);
    const c = el('article', `polaroid${isNew ? ' is-new' : ''}`);
    c.innerHTML = `<img src="${SD.media.clueIcon(clue.title)}" alt="" width="240" height="240" class="polaroid-photo" loading="lazy" /><div class="min-w-0 flex-1"><p class="polaroid-ch">第 ${clue.ch} 章 · 線索</p><h4>${esc(clue.title)}</h4><p class="clue-text">${esc(clue.text)}</p></div>`;
    return c;
  }
  function updateBoardButton() {
    $('#clue-count').textContent = String(state.clues.length);
    $('#btn-board').classList.toggle('has-new', newClueIds.size > 0);
    $('#clue-new-sr').textContent = newClueIds.size ? `，${newClueIds.size} 條新線索` : '';
  }
  function renderBoard() {
    const board = $('#board');
    board.innerHTML = '';
    const verdict = boardMode === 'verdict' && !!chapter;
    $('#board-title').textContent = verdict ? '結案室' : '證據板';
    $('#board-filter').hidden = verdict;
    $('#board-foot').hidden = verdict;
    if (verdict) { renderVerdictBoard(board); updateBoardButton(); return; }
    const chIds = [...new Set(state.clues.map((c) => c.ch))].sort((a, b) => b - a);
    // 目前章節沒線索時「本章」沒東西可看，退回全部
    if (boardFilter === 'current' && chapter && !chIds.includes(chapter.id)) boardFilter = 'all';
    const shown = chIds.filter((id) => boardFilter === 'all' || (boardFilter === 'current' ? chapter && id === chapter.id : id === boardFilter));
    // 篩選 chip：全部／本章／各章
    const f = $('#board-filter');
    const chips = [['all', '全部'], ...(chapter && chIds.includes(chapter.id) ? [['current', '本章']] : []), ...chIds.filter((id) => !chapter || id !== chapter.id).map((id) => [id, `第 ${id} 章`])];
    f.innerHTML = chips.map(([k, label]) => `<button type="button" class="board-chip" data-filter="${k}" aria-pressed="${String(k) === String(boardFilter)}">${label}</button>`).join('');
    let n = 0;
    for (const id of shown) {
      const ch = chapters.find((c) => c.id === id);
      const clues = state.clues.filter((c) => c.ch === id).reverse();
      n += clues.length;
      const sec = el('section');
      sec.setAttribute('aria-label', `第 ${id} 章線索`);
      sec.innerHTML = `<div class="board-section-title"><p class="eyebrow">第 ${id} 章</p><h3 class="text-xl font-black">${esc(ch ? ch.title : '')}</h3><span class="text-sm text-ink-300">${clues.length} 條線索</span></div>`;
      const grid = el('div', 'board-grid');
      for (const c of clues) grid.appendChild(clueCard(c, newClueIds.has(c.id)));
      sec.appendChild(grid);
      board.appendChild(sec);
    }
    $('#board-empty').hidden = n > 0;
    $('#board-count').textContent = state.clues.length ? `${n} / ${state.clues.length} 條` : '';
    updateBoardButton();
  }
  $('#board-filter').addEventListener('click', (e) => {
    const b = e.target.closest('[data-filter]');
    if (!b) return;
    const k = b.dataset.filter;
    boardFilter = k === 'all' || k === 'current' ? k : Number(k);
    renderBoard();
  });
  function openBoard(mode, returnTo) {
    boardMode = mode === 'verdict' ? 'verdict' : 'browse';
    boardReturnFocus = returnTo || null;
    boardFilter = 'current';
    renderBoard();
    boardStage.showModal();
    $('.board-body', boardStage).scrollTop = 0;
    if (canAnimate()) {
      gsap.fromTo(boardStage, { opacity: 0 }, { opacity: 1, duration: 0.3 });
      gsap.from('#board .polaroid, #board .verdict-card', { y: -24, opacity: 0, duration: 0.45, stagger: 0.04, ease: 'power2.out', clearProps: 'all' });
    }
    // 結案室開啟即可打字；已破案時輸入框停用，焦點留在 dialog 預設位置
    const input = $('#verdict-input', boardStage);
    if (input && !input.disabled) input.focus();
    // 看過就不算新：標記留到關板才清，讓玩家在板上找得到剛釘的那張
  }
  $('#btn-board').addEventListener('click', () => openBoard('browse'));
  $('#board-close').addEventListener('click', () => boardStage.close());
  boardStage.addEventListener('close', () => {
    boardMode = 'browse';
    newClueIds.clear();
    updateBoardButton();
    // 從結案室回來焦點回到「進入結案室」按鈕；主卡片可能已重繪，找不到原按鈕就退回 header
    const back = (boardReturnFocus && boardReturnFocus.isConnected) ? boardReturnFocus : ($('[data-open-verdict]', card) || $('#btn-board'));
    boardReturnFocus = null;
    back.focus();
  });

  /* 新增線索：存檔 → 標新 → 右下角提示卡展示後飛進 header 按鈕 */
  function addClue(clue) {
    if (!SD.state.addClue(clue)) return false;
    newClueIds.add(clue.id);
    updateBoardButton();
    return true;
  }
  /* 回傳剛釘上的線索；已釘過或這一步沒有線索則回 null，呼叫端據此決定要不要畫「新線索」列 */
  function pinClue(step) {
    if (!step.clue) return null;
    const clue = { id: step.id, ch: chapter.id, title: step.clue.title, text: step.clue.text };
    return addClue(clue) ? clue : null;
  }
  /*
   * 新線索不再用右下角浮動卡：答對後視線停在結果區頂端的回饋條（桌機）或劇情面板的回饋（手機），
   * 浮動卡會壓住結果表格末列與上下步按鈕。改成直接嵌在這兩處回饋裡，再讓縮圖飛進 header 的證據板按鈕。
   */
  function clueRowHtml(clue) {
    return `<div class="clue-inline"><img src="${SD.media.clueIcon(clue.title)}" alt="" width="48" height="48" class="clue-inline-photo" data-clue-photo /><div class="min-w-0 flex-1"><p class="eyebrow text-amber">新線索已釘上證據板</p><p class="mt-0.5 text-sm font-bold leading-6">${esc(clue.title)}</p></div><button type="button" class="btn-ghost btn-sm shrink-0" data-open-board>看證據板</button></div>`;
  }
  /* 從目前看得見的那張縮圖複製一份飛向證據板按鈕；桌機兩欄都有縮圖時取結果區那張 */
  function flyClueToBoard() {
    if (!canAnimate()) return;
    const src = [...document.querySelectorAll('[data-clue-photo]')].find((img) => img.offsetParent !== null);
    const btn = $('#btn-board');
    if (!src || !btn) return;
    const from = src.getBoundingClientRect();
    const to = btn.getBoundingClientRect();
    const ghost = src.cloneNode(false);
    ghost.removeAttribute('data-clue-photo');
    ghost.className = 'clue-ghost';
    Object.assign(ghost.style, { left: `${from.left}px`, top: `${from.top}px`, width: `${from.width}px`, height: `${from.height}px` });
    document.body.appendChild(ghost);
    gsap.to(ghost, { x: to.left + to.width / 2 - (from.left + from.width / 2), y: to.top + to.height / 2 - (from.top + from.height / 2), scale: 0.3, opacity: 0, duration: 0.7, delay: 0.9, ease: 'power2.in', onComplete: () => { ghost.remove(); gsap.fromTo(btn, { scale: 1.15 }, { scale: 1, duration: 0.4, ease: 'back.out(3)' }); } });
  }

  const clueTotal = () => chapter.steps.filter((s) => s.clue || s.type === 'answer').length; // 指認成功會多釘一張「結案」，分母算進去數字才不會超過總數

  /* 結案入口：主卡片只放線索齊備狀態與進結案室的按鈕；線索本體在結案室以拍立得牆呈現，不在窄欄裡塞清單 */
  function verdictEntryHtml(step) {
    const got = state.clues.filter((c) => c.ch === chapter.id).length;
    const missing = chapter.steps.filter((s) => s.clue && !stepDone(s)).length;
    const done = stepDone(step);
    const act = step.type === 'answer' ? '指認' : '提交';
    const note = done ? '本章已結案，可回結案室重看整面線索牆。' : missing ? `還有 ${missing} 條線索藏在未完成的任務裡，結案室裡會留空位提醒。` : `線索已齊。到結案室對照全部線索後${act}。`;
    return `<div class="verdict-entry"><div class="min-w-0 flex-1"><p class="eyebrow text-teal">本章線索 ${got} / ${clueTotal()}</p><p class="mt-1 text-sm leading-6 text-ink-300">${note}</p></div><button type="button" class="btn-primary min-h-12" data-open-verdict>${done ? '回顧結案室' : '進入結案室 →'}</button></div>`;
  }

  /*
   * 結案室：只列本章。線索依任務順序排（推理要照時間線看，不像瀏覽模式新到舊），
   * 還沒解出的任務留一張虛線「空釘位」，能跳的給按鈕；指認卡橫跨整列釘在最上面。
   */
  function renderVerdictBoard(board) {
    const step = chapter.steps[stepIndex];
    const got = state.clues.filter((c) => c.ch === chapter.id).length;
    const sec = el('section');
    sec.setAttribute('aria-label', `第 ${chapter.id} 章結案`);
    sec.innerHTML = `<div class="board-section-title"><p class="eyebrow">第 ${chapter.id} 章</p><h3 class="text-xl font-black">${esc(chapter.title)}</h3><span id="verdict-count" class="text-sm text-ink-300">線索 ${got} / ${clueTotal()}</span></div>`;
    const grid = el('div', 'board-grid is-dense');
    grid.appendChild(verdictCard(step));
    for (const t of chapter.steps) {
      if (!t.clue) continue;
      const saved = state.clues.find((c) => c.ch === chapter.id && c.id === t.id);
      grid.appendChild(saved ? clueCard(saved, newClueIds.has(saved.id)) : missingCard(t));
    }
    // 指認步驟本身沒有 clue 定義，破案後釘的「結案」卡以步驟 id 存檔，排在最後
    const closing = step.type === 'answer' && state.clues.find((c) => c.ch === chapter.id && c.id === step.id);
    if (closing) grid.appendChild(clueCard(closing, newClueIds.has(closing.id)));
    sec.appendChild(grid);
    board.appendChild(sec);
    $('#board-empty').hidden = true;
    $('#board-count').textContent = '';
  }
  function missingCard(task) {
    const idx = chapter.steps.indexOf(task);
    const no = tasksOf(chapter).indexOf(task) + 1;
    const reach = taskReachable(task);
    const c = el('article', 'polaroid is-missing');
    c.innerHTML = `<div class="min-w-0 flex-1"><p class="polaroid-ch">${no ? `任務 ${no} · ` : ''}尚未取得</p><h4>${esc(task.title)}</h4><p class="clue-text">${reach ? '完成這個任務，線索就會釘在這裡。' : '前面的任務完成後才會解鎖。'}</p></div>${reach ? `<button type="button" class="btn-ghost btn-sm mt-2 self-start" data-step="${idx}">前往${no ? `任務 ${no}` : '該步驟'} →</button>` : ''}`;
    return c;
  }
  function verdictCard(step) {
    const done = stepDone(step);
    const c = el('article', 'verdict-card');
    if (step.type === 'answer') {
      c.innerHTML = `<div class="min-w-0 flex-1"><p class="eyebrow">結案 · 指認</p><div class="prose-sd mt-2">${step.prompt}</div></div>
        <form id="verdict-form" class="flex w-full flex-wrap gap-2 sm:w-auto sm:min-w-80">
          <label class="sr-only" for="verdict-input">姓名</label>
          <input id="verdict-input" class="min-h-12 flex-1 rounded-lg border border-ink-600 bg-ink-950 px-3 text-lg text-paper" placeholder="輸入姓名" autocomplete="off" ${done ? 'disabled' : ''} />
          <button type="submit" class="btn-primary min-h-12" ${done ? 'disabled' : ''}>提交</button>
          <div id="verdict-feedback" class="w-full" aria-live="assertive"></div>
        </form>`;
      const fb = $('#verdict-feedback', c);
      const success = () => { fb.innerHTML = `<div class="mt-1 rounded-xl border border-teal/50 bg-teal/10 p-4"><p class="text-lg font-black text-teal">✔ 破案！</p><p class="mt-2 leading-7">${esc(step.success)}</p></div>`; };
      if (done) success();
      $('#verdict-form', c).addEventListener('submit', async (e) => {
        e.preventDefault();
        const input = $('#verdict-input', c);
        const v = input.value.trim();
        if (!v) return;
        const ok = await SD.check.checkAnswer(v, SD.expect[step.id]);
        if (!ok) {
          fb.innerHTML = `<div class="mt-1 rounded-xl border border-amber/40 bg-amber/5 p-3 text-sm leading-6"><span class="font-bold text-amber">不是這個人。</span>${esc(step.fail)}</div>`;
          if (canAnimate()) gsap.fromTo(fb, { x: -6 }, { x: 0, duration: 0.4, ease: 'elastic.out(1, 0.3)' });
          return;
        }
        SD.state.markStep(chapter.id, step.id);
        input.disabled = true;
        e.target.querySelector('button[type="submit"]').disabled = true;
        success();
        if (canAnimate()) gsap.from(fb.firstElementChild, { scale: 0.9, opacity: 0, duration: 0.5, ease: 'back.out(2)' });
        solveCase({ id: step.id, ch: chapter.id, title: '結案', text: `${v}。${step.success.split('。')[0]}。` });
      });
    } else {
      // 提交兇手是 SQL 任務：結案室只負責讓玩家看齊線索，實際 INSERT 回查詢區做
      c.innerHTML = `<div class="min-w-0 flex-1"><p class="eyebrow">結案 · ${esc(step.title)}</p><div class="prose-sd mt-2">${step.prompt}</div>${done ? `<div class="mt-3 rounded-xl border border-teal/50 bg-teal/10 p-3"><p class="font-bold text-teal">✔ 已提交</p><p class="mt-1 text-sm leading-6">${esc(step.success)}</p></div>` : ''}</div>
        ${done ? '' : '<button type="button" class="btn-primary min-h-12" data-verdict-editor>回查詢區提交 →</button>'}`;
      const b = $('[data-verdict-editor]', c);
      if (b) b.addEventListener('click', () => {
        showPane('editor');
        // 編輯器是空的才放範本，並把游標停在引號中間；有內容（含還原的草稿）時不覆寫
        if (!editor.value.trim()) { editor.value = "INSERT INTO solution (answer) VALUES ('');"; saveDraftSoon(0); }
        const at = editor.value.indexOf("('") + 2;
        if (at > 1) editor.setSelectionRange(at, at);
        // dialog 的 close 事件晚於這裡執行，焦點交給 close 處理器統一歸位，直接 focus 會被搶回去
        boardReturnFocus = editor;
        boardStage.close();
      });
    }
    return c;
  }
  /*
   * 指認成功：牆上的拍立得依序亮一下，再把「結案」卡釘上牆尾。dialog 位於 top layer 之上，
   * 所以在牆上就地釘卡而不用回饋條的新線索列；主卡片同步重繪成已破案，關掉結案室就是完成狀態。
   */
  function solveCase(clue) {
    if (SD.state.addClue(clue)) newClueIds.add(clue.id);
    updateBoardButton();
    renderStep();
    const pin = () => {
      const grid = $('#board .board-grid');
      if (!grid) return;
      const saved = state.clues.find((c) => c.ch === clue.ch && c.id === clue.id) || clue;
      const cardEl = clueCard(saved, true);
      grid.appendChild(cardEl);
      const cnt = $('#verdict-count');
      if (cnt) cnt.textContent = `線索 ${state.clues.filter((c) => c.ch === chapter.id).length} / ${clueTotal()}`;
      cardEl.scrollIntoView({ block: 'nearest', behavior: canAnimate() ? 'smooth' : 'instant' });
      if (canAnimate()) gsap.from(cardEl, { y: -60, opacity: 0, rotation: -8, duration: 0.6, ease: 'bounce.out' });
    };
    if (!canAnimate()) { pin(); return; }
    gsap.to('#board .polaroid', { scale: 1.05, duration: 0.18, yoyo: true, repeat: 1, stagger: 0.07, ease: 'power1.inOut', clearProps: 'scale', onComplete: pin });
  }
  // ---------------------------------------------------------------------------
  // 偵探檔案：星數、階級、徽章牆、分享卡
  // ---------------------------------------------------------------------------
  /*
   * 成就與線索分開放：證據板是案件的東西，偵探檔案是玩家自己的東西。
   * 徽章解鎖彈窗只在結案當下跳一次，所以這裡要能重看每枚徽章與結案證書，玩家才有第二次截圖的機會。
   */
  const achvStage = $('#achv-stage');
  const MASTER_BADGE = { id: 'master', name: '結案證書', img: './images/badge-master.webp', desc: '潮港市六起案件全數偵破。' };
  const allBadges = () => chapters.map((c) => ({ ...c.badge, ch: c })).concat([MASTER_BADGE]);
  const maxStars = () => chapters.reduce((s, c) => s + tasksOf(c).length * 3, 0);
  /* 階級門檻用總星數的比例而非絕對值，增減任務時不必調整；階級名稱同時印在結案證書上 */
  const RANKS = [[0, '實習偵探'], [0.1, '見習偵探'], [0.4, '正式偵探'], [0.7, '資深偵探'], [0.95, '金牌偵探']];
  function rankOf(earned, max) {
    const ratio = max ? earned / max : 0;
    let i = 0;
    while (i + 1 < RANKS.length && ratio >= RANKS[i + 1][0]) i++;
    const next = RANKS[i + 1] ? { name: RANKS[i + 1][1], stars: Math.ceil(RANKS[i + 1][0] * max) } : null;
    return { name: RANKS[i][1], next };
  }
  const fmtDate = (iso) => new Date(iso || Date.now()).toLocaleDateString('zh-TW');
  const siteUrl = () => new URL('./', location.href).href.replace(/^https?:\/\//, '').replace(/\/$/, '');
  const dim = (html) => `<span class="text-base font-normal text-ink-300">${html}</span>`;
  let badgeNew = false;

  function updateAchvButton() {
    $('#star-total').innerHTML = `★ ${totalStars()}<span class="hidden sm:inline"> / ${maxStars()}</span>`;
    $('#btn-achievements').classList.toggle('has-new', badgeNew);
    $('#badge-new-sr').textContent = badgeNew ? '，有新徽章' : '';
  }
  function unlockBadge(id) {
    if (!SD.state.addBadge(id)) return false;
    badgeNew = true;
    return true;
  }
  function certificateHtml() {
    const total = totalStars(), max = maxStars();
    return `<div class="w-full rounded-xl border border-amber/40 bg-ink-950 p-4 text-left">
      <p class="eyebrow">潮港市警察局 · 結案證書</p>
      <p class="mt-2 text-lg font-bold">資料分析組 ${esc(rankOf(total, max).name)}</p>
      <p class="mt-1 text-sm text-ink-300">完成章節 ${chapters.length} / ${chapters.length} · 總星數 ${total} / ${max} · 線索 ${state.clues.length} 條 · 徽章 ${state.badges.length} 枚</p>
      <p class="mt-1 text-xs text-ink-300">${fmtDate(state.badgeAt.master)} · 截圖此畫面即可作為學習紀錄，之後也能在「偵探檔案」重看</p>
    </div>`;
  }
  function shareText() {
    const total = totalStars(), max = maxStars();
    const badges = allBadges();
    const owned = badges.filter((b) => state.badges.includes(b.id));
    return [
      '【SQL 偵探：潮港市檔案】偵探檔案',
      `階級：${rankOf(total, max).name}`,
      `★ ${total} / ${max} 星 · 結案 ${chapters.filter(isDone).length} / ${chapters.length} · 線索 ${state.clues.length} 條 · 徽章 ${owned.length} / ${badges.length}`,
      `徽章：${owned.length ? owned.map((b) => b.name).join('、') : '尚未取得'}`,
      siteUrl(),
    ].join('\n');
  }
  function renderAchievements() {
    updateAchvButton();
    if (!achvStage.open) return;
    const total = totalStars(), max = maxStars();
    const rank = rankOf(total, max);
    const doneCount = chapters.filter(isDone).length;
    const badges = allBadges();
    const has = (b) => state.badges.includes(b.id);
    const owned = badges.filter(has);
    $('#achv-count').textContent = `徽章 ${owned.length} / ${badges.length}`;

    const rankHtml = `<section class="achv-rank" aria-label="偵探階級">
      <div class="min-w-0 flex-1">
        <p class="eyebrow">目前階級</p>
        <h3 class="mt-1 text-3xl font-black sm:text-4xl">${esc(rank.name)}</h3>
        <p class="mt-2 text-sm leading-6 text-ink-300">${rank.next ? `再拿 <span class="font-bold text-amber">${rank.next.stars - total}</span> 顆星晉升為「${esc(rank.next.name)}」。不看提示解完任務可拿滿 3 星，已完成的任務也能回去重練。` : '已是最高階級。每個任務都拿到 3 星，就是一份完美檔案。'}</p>
        <div id="achv-progress" class="progress mt-3" aria-hidden="true"><span></span></div>
      </div>
      <dl class="achv-stats">
        <div><dt>總星數</dt><dd><span class="text-amber">★</span> ${total} ${dim(`/ ${max}`)}</dd></div>
        <div><dt>結案</dt><dd>${doneCount} ${dim(`/ ${chapters.length}`)}</dd></div>
        <div><dt>線索</dt><dd>${state.clues.length}</dd></div>
        <div><dt>徽章</dt><dd>${owned.length} ${dim(`/ ${badges.length}`)}</dd></div>
      </dl>
    </section>`;

    const cards = badges.map((b) => {
      const st = b.ch ? SD.state.chapterStars(b.ch.id, tasksOf(b.ch)) : null;
      const sub = b.ch ? `第 ${b.ch.id} 章 · ${esc(b.ch.title)}` : '全部章節結案';
      const at = state.badgeAt[b.id] ? ` · ${fmtDate(state.badgeAt[b.id])}` : '';
      const meta = has(b)
        ? (st ? `<span class="text-amber">★</span> ${st.earned} / ${st.max}${at}` : `${chapters.length} 章全數結案${at}`)
        : (b.ch ? `完成第 ${b.ch.id} 章解鎖` : '全部章節結案後解鎖');
      const inner = `<img src="${b.img}" alt="" width="80" height="80" class="size-20 rounded-full object-cover" loading="lazy" /><p class="achv-card-sub">${sub}</p><h4 class="text-base font-black leading-6">${esc(b.name)}${has(b) ? '' : '<span class="sr-only">（未取得）</span>'}</h4><p class="achv-card-meta">${meta}</p>`;
      return has(b)
        ? `<button type="button" class="achv-card" data-badge="${b.id}">${inner}<span class="achv-card-cta">重看 →</span></button>`
        : `<div class="achv-card is-locked">${inner}</div>`;
    }).join('');
    const wallHtml = `<section aria-label="徽章牆">
      <div class="board-section-title"><p class="eyebrow">徽章牆</p><h3 class="text-xl font-black">已取得 ${owned.length} / ${badges.length}</h3><span class="text-sm text-ink-300">點已取得的徽章可以重看解鎖畫面</span></div>
      <div class="achv-grid">${cards}</div>
    </section>`;

    const shareHtml = `<section aria-label="分享">
      <div class="board-section-title"><p class="eyebrow">分享</p><h3 class="text-xl font-black">偵探名片</h3><span class="text-sm text-ink-300">截圖下面這張卡，或複製文字貼到聊天室</span></div>
      <div class="share-card">
        <p class="eyebrow">SQL 偵探：潮港市檔案</p>
        <p class="mt-4 text-sm text-ink-300">潮港市警察局 · 資料分析組</p>
        <p class="text-3xl font-black leading-tight">${esc(rank.name)}</p>
        <dl class="share-stats">
          <div><dt>星數</dt><dd>${total}<span class="share-max">/${max}</span></dd></div>
          <div><dt>結案</dt><dd>${doneCount}<span class="share-max">/${chapters.length}</span></dd></div>
          <div><dt>線索</dt><dd>${state.clues.length}</dd></div>
          <div><dt>徽章</dt><dd>${owned.length}<span class="share-max">/${badges.length}</span></dd></div>
        </dl>
        <ul class="share-badges" aria-label="徽章">${badges.map((b) => `<li${has(b) ? '' : ' class="is-locked"'}><img src="${b.img}" alt="${esc(b.name)}${has(b) ? '' : '（未取得）'}" width="32" height="32" class="size-8 rounded-full object-cover" loading="lazy" /></li>`).join('')}</ul>
        <p class="share-foot"><span>${fmtDate()}</span><span>${esc(siteUrl())}</span></p>
      </div>
      <div class="mt-4 flex flex-wrap justify-center gap-2">
        <button type="button" class="btn-primary btn-sm" data-share-copy>複製成就文字</button>
        ${navigator.share ? '<button type="button" class="btn-ghost btn-sm" data-share-native>分享…</button>' : ''}
      </div>
      <p id="share-status" class="mt-2 min-h-6 text-center text-sm text-teal" role="status"></p>
    </section>`;

    $('#achv').innerHTML = rankHtml + wallHtml + shareHtml;
    // 進度條寬度用 CSSOM 設定：CSP 的 style-src 沒開 unsafe-inline
    $('#achv-progress > span').style.width = `${max ? Math.round((total / max) * 100) : 0}%`;
  }
  function openAchievements() {
    badgeNew = false;
    achvStage.showModal();
    renderAchievements();
    $('.board-body', achvStage).scrollTop = 0;
    if (canAnimate()) {
      gsap.fromTo(achvStage, { opacity: 0 }, { opacity: 1, duration: 0.3 });
      gsap.from('#achv .achv-rank, #achv .achv-card, #achv .share-card', { y: -24, opacity: 0, duration: 0.45, stagger: 0.04, ease: 'power2.out', clearProps: 'all' });
    }
  }
  $('#btn-achievements').addEventListener('click', openAchievements);
  $('#achv-close').addEventListener('click', () => achvStage.close());
  achvStage.addEventListener('close', () => $('#btn-achievements').focus());
  // 證據板底部的「偵探檔案」：兩個都是 modal，先關證據板再開檔案，避免疊兩層全螢幕
  boardStage.addEventListener('click', (e) => { if (e.target.closest('[data-open-achievements]')) { boardStage.close(); openAchievements(); } });
  achvStage.addEventListener('click', async (e) => {
    const cardBtn = e.target.closest('[data-badge]');
    if (cardBtn) {
      const b = allBadges().find((x) => x.id === cardBtn.dataset.badge);
      if (!b) return;
      if (!b.ch) { showBadge(MASTER_BADGE, certificateHtml(), '已取得的徽章'); return; }
      const st = SD.state.chapterStars(b.ch.id, tasksOf(b.ch));
      showBadge(b, `<p class="text-amber">本章星數 ${st.earned} / ${st.max}</p>${state.badgeAt[b.id] ? `<p class="text-xs text-ink-300">取得日期 ${fmtDate(state.badgeAt[b.id])}</p>` : ''}`, '已取得的徽章');
      return;
    }
    const status = $('#share-status');
    if (e.target.closest('[data-share-copy]')) {
      try { await navigator.clipboard.writeText(shareText()); status.textContent = '已複製，貼到聊天室就能分享。'; }
      catch (err) { status.textContent = '這個瀏覽器不允許複製，請直接截圖分享卡。'; }
      return;
    }
    if (e.target.closest('[data-share-native]')) {
      // 使用者取消分享會 reject，不是錯誤，靜默即可
      try { await navigator.share({ title: 'SQL 偵探：潮港市檔案', text: shareText() }); } catch (err) { /* 取消分享 */ }
    }
  });

  function showBadge(badge, extraHtml, label = '徽章解鎖') {
    const dlg = $('#dlg-badge');
    $('#badge-body').innerHTML = `
      <p class="eyebrow">${esc(label)}</p>
      <img id="badge-img" src="${badge.img}" alt="" width="160" height="160" class="size-40 rounded-full object-cover shadow-glow-amber" />
      <h2 class="text-2xl font-black">${esc(badge.name)}</h2>
      <p class="max-w-md text-ink-300">${esc(badge.desc)}</p>
      ${extraHtml || ''}
      <button type="button" class="btn-primary mt-2" data-close>太好了</button>`;
    dlg.showModal();
    if (canAnimate()) gsap.from('#badge-img', { scale: 0.3, rotate: -20, opacity: 0, duration: 0.8, ease: 'back.out(1.7)' });
  }
  document.querySelectorAll('dialog.sd').forEach((d) => d.addEventListener('click', (e) => { if (e.target.closest('[data-close]') || e.target === d) d.close(); }));

  // ---------------------------------------------------------------------------
  // 步驟渲染
  // ---------------------------------------------------------------------------
  const card = $('#step-card');
  card.addEventListener('click', (e) => {
    const v = e.target.closest('[data-open-verdict]');
    if (v) { openBoard('verdict', v); return; }
    if (e.target.closest('[data-open-board]')) openBoard('browse');
  });

  function stars(n) { return `<span aria-label="${n} 星">${[1, 2, 3].map((i) => `<span class="star ${i <= n ? '' : 'off'}">★</span>`).join('')}</span>`; }
  function starsForHints(h) { return h >= 3 ? 1 : h >= 1 ? 2 : 3; }

  function enhanceCode(root) {
    root.querySelectorAll('pre').forEach((pre) => {
      const code = pre.querySelector('code') || pre;
      const raw = code.textContent;
      code.innerHTML = SD.highlight(raw);
      pre.classList.add('has-insert');
      const b = el('button', 'btn-ghost btn-sm absolute right-2 top-2', '帶入編輯器');
      b.type = 'button';
      b.addEventListener('click', () => setEditor(raw.replace(/^\s*--.*$/gm, '').trim()));
      pre.appendChild(b);
    });
  }

  function speaker(who) { return SD.cast[who] || SD.cast.narrator; }

  /*
   * 劇情步驟：對話在全螢幕舞台（#story-stage）逐句播放，左欄卡片只放腳本。
   * 讀完後卡片列出全部句子供回看並提供「下一步」；未讀完只給重新開啟舞台的入口。
   */
  function renderStoryCard(step) {
    const done = stepDone(step);
    const sceneSrc = SD.media.scene(chapter, stepIndex);
    const scene = sceneSrc ? `<figure class="scene"><img src="${sceneSrc}" alt="" width="960" height="540" /></figure>` : '';
    const script = step.lines.map((line) => {
      const sp = speaker(line.who);
      if (!sp.name) return `<li class="italic leading-7 text-ink-300">${esc(line.text)}</li>`;
      return `<li class="flex items-start gap-3"><img src="${sp.img}" alt="" width="40" height="40" class="size-10 shrink-0 rounded-full border border-ink-600 object-cover" /><div class="speech flex-1"><p class="text-xs font-bold text-amber">${esc(sp.name)}<span class="ml-2 font-normal text-ink-300">${esc(sp.role)}</span></p><p class="mt-1">${esc(line.text)}</p></div></li>`;
    }).join('');
    card.innerHTML = `${scene}<p class="eyebrow">第 ${chapter.id} 章 · ${esc(chapter.title)}</p>
      ${done ? `<ul class="mt-4 flex flex-col gap-4">${script}</ul>` : `<p class="mt-4 leading-7 text-ink-300">這段劇情共 ${step.lines.length} 句，在全螢幕舞台播放。看完才能進入下一步。</p>`}
      <div class="mt-4 flex flex-wrap justify-end gap-2">
        <button type="button" id="btn-replay" class="btn-ghost btn-sm">${done ? '重看劇情' : '開啟劇情'}</button>
        ${done ? `<button type="button" id="btn-continue" class="btn-primary btn-sm">${nextLabel()}</button>` : ''}
      </div>`;
    $('#btn-replay', card).addEventListener('click', () => openStage(step));
    const cont = $('#btn-continue', card);
    if (cont) cont.addEventListener('click', next);
  }
  // 已讀過的劇情只畫卡片（卡片本身列出完整台詞），不再自動開全螢幕舞台：
  // 舞台是 modal，往回走或深連結時每段劇情都彈出會擋住「上一步」，等於無法回頭練習。想重看按「重看劇情」。
  function renderStory(step) {
    renderStoryCard(step);
    if (!stepDone(step)) openStage(step);
  }

  // ---------------------------------------------------------------------------
  // 劇情舞台
  // ---------------------------------------------------------------------------
  const stage = $('#story-stage');
  const stageBox = $('#stage-box');
  const stageText = $('#stage-text');
  const stageNext = $('#stage-next');
  let stageStep = null;
  let stageLine = 0;
  let stageTyping = null;
  let portraitToken = 0;
  const preloadedPortraits = new Set();

  // 開舞台時先把本段會出場的立繪抓下來並解碼，換人時才不會在觀眾面前等圖
  function preloadPortraits(step) {
    step.lines.forEach((line) => {
      const src = speaker(line.who).portrait;
      if (!src || preloadedPortraits.has(src)) return;
      preloadedPortraits.add(src);
      const img = new Image();
      img.src = src;
      if (img.decode) img.decode().catch(() => {});
    });
  }

  function openStage(step) {
    stageStep = step;
    stageLine = 0;
    preloadPortraits(step);
    $('#stage-bg').src = SD.media.scene(chapter, stepIndex) || chapter.cover;
    $('#stage-title').textContent = `第 ${chapter.id} 章 · ${chapter.title}`;
    if (!stage.open) stage.showModal();
    stageNext.focus();
    if (canAnimate()) gsap.fromTo(stage, { opacity: 0 }, { opacity: 1, duration: 0.4 });
    // 已讀過的劇情不再逐字打，仍逐句點過；想直接跳到底有「跳過對話」
    showStageLine(stepDone(step));
  }
  function stopTyping() { if (stageTyping) { clearInterval(stageTyping); stageTyping = null; } }
  function markStoryDone() {
    if (stageStep && !stepDone(stageStep)) { SD.state.markStep(chapter.id, stepKey(stageStep)); updateNav(); }
  }
  function showStageLine(instant) {
    const line = stageStep.lines[stageLine];
    const sp = speaker(line.who);
    const last = stageLine === stageStep.lines.length - 1;
    stageBox.classList.toggle('narrator', !sp.name);
    stageBox.classList.toggle('has-portrait', !!sp.portrait);
    const portrait = $('#stage-portrait');
    const switching = !!sp.portrait && portrait.getAttribute('src') !== sp.portrait;
    portrait.hidden = !sp.portrait;
    if (sp.portrait) portrait.src = sp.portrait;
    // 只在換人時滑入，同一人連續說話立繪不動。
    // 改 src 後瀏覽器會繼續畫舊圖直到新圖解碼完成，若立刻播動畫會變成「舊角色滑入、再瞬間跳成新角色」，
    // 因此先壓成透明、等 decode() 完成才滑入；期間又換句時以 token 判定過期，交給後續呼叫處理。
    if (switching && canAnimate()) {
      const token = ++portraitToken;
      gsap.set(portrait, { opacity: 0 });
      portrait.decode().catch(() => {}).then(() => {
        if (token !== portraitToken) return;
        gsap.fromTo(portrait, { x: -16, opacity: 0 }, { x: 0, opacity: 1, duration: 0.3, ease: 'power2.out' });
      });
    }
    const avatar = $('#stage-avatar');
    avatar.hidden = !sp.img;
    if (sp.img) avatar.src = sp.img;
    $('#stage-name').textContent = sp.name;
    $('#stage-role').textContent = sp.role;
    $('#stage-count').textContent = `${stageLine + 1} / ${stageStep.lines.length}`;
    $('#stage-live').textContent = sp.name ? `${sp.name}：${line.text}` : line.text;
    stageNext.textContent = last ? nextLabel() : '下一句 ▼';
    stopTyping();
    if (canAnimate()) gsap.fromTo(stageBox, { y: 8, opacity: 0.6 }, { y: 0, opacity: 1, duration: 0.25, ease: 'power2.out' });
    if (instant || reduce) { stageText.textContent = line.text; if (last) markStoryDone(); return; }
    stageText.textContent = '';
    let k = 0;
    stageTyping = setInterval(() => {
      stageText.textContent = line.text.slice(0, ++k);
      if (k >= line.text.length) { stopTyping(); if (last) markStoryDone(); }
    }, 16);
  }
  function stageAdvance() {
    if (!stageStep) return;
    const last = stageLine === stageStep.lines.length - 1;
    // 打字中先補完整句，再點才換句
    if (stageTyping) { stopTyping(); stageText.textContent = stageStep.lines[stageLine].text; if (last) markStoryDone(); return; }
    if (last) { next(); return; }
    stageLine++;
    showStageLine(false);
  }
  function closeStage() { stopTyping(); stageStep = null; if (stage.open) stage.close(); }

  stageNext.addEventListener('click', stageAdvance);
  $('#stage-skip').addEventListener('click', () => { if (!stageStep) return; stageLine = stageStep.lines.length - 1; showStageLine(true); stageNext.focus(); });
  $('#stage-close').addEventListener('click', () => stage.close());
  $('#stage-tap').addEventListener('click', (e) => { if (!e.target.closest('button')) stageAdvance(); });
  stage.addEventListener('keydown', (e) => {
    if (e.key === 'ArrowRight') { e.preventDefault(); stageAdvance(); return; }
    // 按鈕本身的 Enter／空白鍵交給原生 click，避免推進兩次
    if ((e.key === 'Enter' || e.key === ' ') && !e.target.closest('button')) { e.preventDefault(); stageAdvance(); }
  });
  // Esc（原生 cancel）與「回到辦案畫面」都走這裡：把卡片重畫成目前讀到的狀態，焦點回左欄
  stage.addEventListener('close', () => {
    stopTyping(); stageStep = null;
    const step = chapter && chapter.steps[stepIndex];
    if (step && step.type === 'story') { renderStoryCard(step); $('#btn-replay', card).focus(); }
    startCoachIfPending();
  });

  function renderLesson(step) {
    const art = SD.media.lessonArt(chapter.id);
    card.innerHTML = `${art ? `<img src="${art}" alt="" width="112" height="112" class="lesson-art" loading="lazy" />` : ''}<p class="eyebrow">教學 · ${esc(chapter.title)}</p><h2 class="mt-2 text-2xl font-black">${esc(step.title)}</h2><div class="prose-sd mt-4 clear-both">${step.body}</div>`;
    enhanceCode(card);
    SD.state.markStep(chapter.id, stepKey(step));
  }

  /* 從標準解答（第 3 個提示）抽出任務會用到的資料表，顯示成可展開欄位的 chip；資料庫未就緒時晚點由 boot 補畫 */
  function taskTables(step) {
    const sql = (step.hints && step.hints[2]) || '';
    const names = new Set();
    for (const m of sql.matchAll(/\b(?:FROM|JOIN|INTO|UPDATE|TABLE)\s+`?([a-z_][a-z0-9_]*)`?/gi)) names.add(m[1].toLowerCase());
    if (!dbReady) return [...names];
    const s = SD.db.schema();
    return [...names].filter((n) => s.tables.includes(n));
  }
  function renderTaskTables() {
    const wrap = $('#task-tables', card);
    if (!wrap || !dbReady) return;
    const step = chapter.steps[stepIndex];
    const tables = taskTables(step);
    if (!tables.length) { wrap.hidden = true; return; }
    wrap.hidden = false;
    wrap.innerHTML = `<p class="text-xs text-ink-300">相關資料表（點開看欄位，點欄位插入編輯器）</p><div class="mt-2 flex flex-wrap gap-2">${tables.map((t) => `<button type="button" class="chip min-h-11 cursor-pointer font-mono text-teal hover:border-amber aria-expanded:border-amber aria-expanded:text-amber" data-table="${t}" aria-expanded="false">${esc(t)}</button>`).join('')}</div><div id="task-cols" class="mt-3" hidden></div>`;
    const cols = $('#task-cols', wrap);
    // 外鍵跳轉也留在任務區內切換，不把玩家拉到中欄；目標表不在本任務清單時（如 person）仍可展開，只是沒有對應 chip 亮起
    const open = (t) => {
      wrap.querySelectorAll('[data-table]').forEach((b) => b.setAttribute('aria-expanded', String(b.dataset.table === t)));
      cols.innerHTML = '';
      if (!t) { cols.hidden = true; return; }
      cols.hidden = false;
      renderColumnGrid(cols, t, { onGoto: open, narrow: true });
    };
    wrap.addEventListener('click', (e) => {
      const tb = e.target.closest('[data-table]');
      if (tb) open(tb.getAttribute('aria-expanded') === 'true' ? null : tb.dataset.table);
    });
  }

  function renderTask(step) {
    const p = prog();
    const done = stepDone(step);
    const hintsUsed = p.hints[step.id] || 0;
    const idx = tasksOf(chapter).indexOf(step) + 1;
    card.innerHTML = `
      <div class="flex items-start justify-between gap-2">
        <p class="eyebrow">任務 ${idx} / ${tasksOf(chapter).length}</p>
        <span id="task-status" class="chip ${done ? 'border-teal/50 text-teal' : ''}">${done ? `已完成 ${stars(starsForHints(hintsUsed))}` : '進行中'}</span>
      </div>
      <h2 class="mt-2 text-2xl font-black">${esc(step.title)}</h2>
      <div class="prose-sd mt-3">${step.prompt}</div>
      ${step.lead ? `<p class="mt-1 flex gap-2 rounded-lg border border-ink-700 bg-ink-950/40 px-3 py-2 text-sm leading-6 text-ink-300"><span class="shrink-0 font-bold text-teal">說明</span><span>${esc(step.lead)}</span></p>` : ''}
      <div id="task-tables" class="mt-3" hidden></div>
      <div id="feedback" class="not-empty:mt-3" aria-live="assertive"></div>
      <div class="mt-5 flex flex-wrap gap-2 border-t border-ink-700 pt-4">
        <button type="button" id="btn-goto-editor" class="btn-primary btn-sm lg:hidden">前往查詢區寫 SQL →</button>
        <button type="button" id="btn-hint" class="btn-ghost btn-sm">💡 提示（${Math.min(hintsUsed, 3)}/3）</button>
      </div>
      <ol id="hints" class="mt-3 flex flex-col gap-2"></ol>
      <p class="mt-4 text-xs text-ink-300">在查詢區執行 SQL 後會自動檢核。「說明」不算提示；不看提示 3 星、看第 1～2 個提示 2 星、看解答 1 星。</p>`;
    renderTaskTables();
    const hintsEl = $('#hints', card);
    const showHint = (level) => {
      for (let i = 0; i < level && i < 3; i++) {
        if (hintsEl.children[i]) continue;
        const h = step.hints[i] || '';
        if (!h) { hintsEl.appendChild(el('li', 'hidden')); continue; }
        const li = el('li', 'rounded-lg border border-ink-700 bg-ink-950/60 px-3 py-2 text-sm leading-6', `<span class="mr-2 font-bold text-amber">${i === 2 ? '解答' : `提示 ${i + 1}`}</span><span class="prose-sd text-[0.95rem]">${h}</span>`);
        if (i === 2) {
          const code = li.querySelector('code');
          if (code) { const b = el('button', 'btn-ghost btn-sm ml-2', '帶入'); b.type = 'button'; b.addEventListener('click', () => setEditor(code.textContent)); li.appendChild(b); }
        }
        hintsEl.appendChild(li);
        if (canAnimate()) gsap.from(li, { y: 8, opacity: 0, duration: 0.3 });
      }
    };
    // 已完成的任務回來練習時，提示（含解答）預設收合，按「提示」再逐一展開；
    // 展開已用過的提示不會增加紀錄的提示數，星數不變
    let shown = done ? 0 : hintsUsed;
    showHint(shown);
    const hintBtn = $('#btn-hint', card);
    const refreshHintBtn = () => {
      const used = prog().hints[step.id] || 0;
      hintBtn.textContent = `💡 提示（${Math.min(used, 3)}/3）`;
      hintBtn.disabled = shown >= 3;
    };
    refreshHintBtn();
    hintBtn.addEventListener('click', () => {
      if (shown >= 3) return;
      const used = prog().hints[step.id] || 0;
      if (shown >= used) {
        if (shown === 2 && !window.confirm('第 3 個提示是完整解答，看了這題只會得到 1 星。確定要看嗎？')) return;
        SD.state.useHint(chapter.id, step.id, shown + 1);
      }
      shown++;
      showHint(shown);
      refreshHintBtn();
    });
    $('#btn-goto-editor', card).addEventListener('click', () => showPane('editor'));
    // 起始 SQL 只填進空的編輯器；使用者已有內容（含重新整理後還原的草稿）時不覆寫
    if (step.starter && !editor.value.trim()) { editor.value = step.starter; saveDraftSoon(0); }
  }

  async function evaluateStep(step) {
    const fb = $('#feedback', card);
    if (!fb) return;
    let result;
    if (step.type === 'solution') {
      const q = SD.db.query('SELECT id, answer FROM solution ORDER BY id DESC LIMIT 1');
      if (!q || !q.values.length) return;
      const [id, answer] = q.values[0];
      const ok = await SD.check.checkAnswer(answer, SD.expect[step.id]);
      const msg = ok ? step.success : step.fail;
      SD.db.run(`UPDATE solution SET result = '${msg.replace(/'/g, "''")}' WHERE id = ${id}`);
      result = { ok, message: ok ? '' : step.fail };
      if (!ok && lastResults.some((r) => r.type === 'affected')) renderResults([...lastResults, { type: 'message', text: msg, sql: 'SELECT result FROM solution', notes: [] }]);
    } else {
      result = await SD.check.evaluate(step, lastResults, lastSql, SD.expect[step.id]);
    }
    if (result.ok) {
      const wasDone = stepDone(step);
      SD.state.markStep(chapter.id, step.id);
      const h = prog().hints[step.id] || 0;
      const successMsg = step.type === 'solution' ? step.success : (step.success || '結果符合預期。');
      const newClue = wasDone ? null : pinClue(step);
      fb.innerHTML = `<div class="rounded-xl border border-teal/50 bg-teal/10 p-3"><p class="font-bold text-teal">✔ 正確！</p><p class="mt-1 text-sm leading-6">${esc(successMsg)}</p>${newClue ? clueRowHtml(newClue) : ''}</div>`;
      const st = $('#task-status', card);
      if (st) { st.className = 'chip border-teal/50 text-teal'; st.innerHTML = `已完成 ${stars(starsForHints(h))}`; }
      if (canAnimate()) gsap.from(fb.firstElementChild, { scale: 0.96, opacity: 0, duration: 0.35, ease: 'back.out(2)' });
      const entry = $('.verdict-entry', card);
      if (entry) entry.outerHTML = verdictEntryHtml(step);
      renderAchievements();
      updateNav();
      showResultFeedback(true, successMsg, newClue);
      showPane('story');
      if (newClue) flyClueToBoard();
    } else {
      fb.innerHTML = `<div class="rounded-xl border border-amber/40 bg-amber/5 p-3 text-sm leading-6"><span class="font-bold text-amber">還差一點：</span>${esc(result.message)}</div>`;
      showResultFeedback(false, result.message);
    }
  }

  /* 檢核結果也貼在結果區最上方（桌機視線停在中欄），成功時附「下一步」按鈕，不必回左欄找 */
  function showResultFeedback(ok, message, clue) {
    const box = $('#result-feedback');
    box.hidden = false;
    const last = stepIndex === chapter.steps.length - 1;
    box.innerHTML = ok
      ? `<div class="rounded-xl border border-teal/50 bg-teal/10 p-3"><div class="flex flex-wrap items-center gap-3"><p class="flex-1 text-sm leading-6"><span class="font-bold text-teal">✔ 正確！</span> ${esc(message)}</p><button type="button" class="btn-teal btn-sm" data-next>${last ? '結束本章 ✔' : '下一步 →'}</button></div>${clue ? clueRowHtml(clue) : ''}</div>`
      : `<div class="rounded-xl border border-amber/40 bg-amber/5 p-3 text-sm leading-6"><span class="font-bold text-amber">還差一點：</span>${esc(message)}</div>`;
    if (canAnimate()) gsap.from(box.firstElementChild, { y: -8, opacity: 0, duration: 0.3 });
  }
  $('#result-feedback').addEventListener('click', (e) => {
    if (e.target.closest('[data-next]')) next();
    else if (e.target.closest('[data-open-board]')) openBoard('browse');
  });
  function clearResultFeedback() { const box = $('#result-feedback'); box.hidden = true; box.innerHTML = ''; }

  function renderBlocks(step) {
    const done = stepDone(step);
    card.innerHTML = `
      <p class="eyebrow">拼句練習</p>
      <h2 class="mt-2 text-2xl font-black">${esc(step.title)}</h2>
      <div class="prose-sd mt-3">${step.prompt}</div>
      <p class="mt-2 text-xs text-ink-300">點一下積木就會加到句子裡，點句子裡的積木可以拿回來。也可以用拖曳。</p>
      <div id="slot" class="block-slot mt-3" aria-label="組合區"></div>
      <div id="pool" class="mt-3 flex flex-wrap gap-2" aria-label="積木區"></div>
      <div id="feedback" class="mt-3" aria-live="assertive"></div>
      <div class="mt-4 flex gap-2"><button type="button" id="btn-check-blocks" class="btn-primary btn-sm">檢查</button><button type="button" id="btn-reset-blocks" class="btn-ghost btn-sm">重排</button></div>`;
    const slot = $('#slot', card), pool = $('#pool', card);
    const shuffled = step.blocks.slice().sort(() => Math.random() - 0.5);
    const mk = (text) => { const b = el('button', 'block-chip', esc(text)); b.type = 'button'; b.draggable = true; b.dataset.v = text; return b; };
    const move = (b) => { (b.parentElement === pool ? slot : pool).appendChild(b); if (canAnimate()) gsap.from(b, { scale: 0.8, duration: 0.2 }); };
    (done ? step.answer.split(' ') : shuffled).forEach((t) => (done ? slot : pool).appendChild(mk(t)));
    card.addEventListener('click', (e) => { const b = e.target.closest('.block-chip'); if (b) move(b); });
    let dragging = null;
    card.addEventListener('dragstart', (e) => { dragging = e.target.closest('.block-chip'); });
    for (const zone of [slot, pool]) {
      zone.addEventListener('dragover', (e) => { e.preventDefault(); zone.classList.add('over'); });
      zone.addEventListener('dragleave', () => zone.classList.remove('over'));
      zone.addEventListener('drop', (e) => { e.preventDefault(); zone.classList.remove('over'); if (dragging) { const after = e.target.closest('.block-chip'); if (after && after.parentElement === zone) zone.insertBefore(dragging, after); else zone.appendChild(dragging); } });
    }
    $('#btn-reset-blocks', card).addEventListener('click', () => { [...slot.children].forEach((b) => pool.appendChild(b)); });
    $('#btn-check-blocks', card).addEventListener('click', () => {
      const got = [...slot.children].map((b) => b.dataset.v).join(' ').replace(/\s+/g, ' ').trim();
      const fb = $('#feedback', card);
      if (got === step.answer) {
        SD.state.markStep(chapter.id, step.id);
        fb.innerHTML = `<div class="rounded-xl border border-teal/50 bg-teal/10 p-3 text-sm"><p class="font-bold text-teal">✔ 拼對了！</p><pre class="prose-sd mt-2 rounded bg-ink-950 p-2"><code>${SD.highlight(step.answer)}</code></pre></div>`;
        updateNav();
      } else fb.innerHTML = `<div class="rounded-xl border border-amber/40 bg-amber/5 p-3 text-sm">順序還不對。想想句型：SELECT 欄位 FROM 表 LIMIT 筆數。</div>`;
    });
    if (done) $('#feedback', card).innerHTML = `<div class="rounded-xl border border-teal/50 bg-teal/10 p-3 text-sm text-teal">✔ 已完成</div>`;
  }

  function renderQuiz(step) {
    const done = stepDone(step);
    const rec = prog().steps[step.id] || {};
    card.innerHTML = `
      <p class="eyebrow">小測驗</p>
      <h2 class="mt-2 text-xl font-bold leading-8">${esc(step.question)}</h2>
      <div id="opts" class="mt-4 flex flex-col gap-2" role="group" aria-label="選項"></div>
      <div id="feedback" class="mt-3" aria-live="assertive"></div>`;
    const opts = $('#opts', card);
    step.options.forEach((o, i) => {
      const b = el('button', 'btn-ghost justify-start text-left font-normal', `<span class="mr-2 font-mono text-amber">${String.fromCharCode(65 + i)}</span><span>${esc(o)}</span>`);
      b.type = 'button';
      b.addEventListener('click', () => answer(i));
      opts.appendChild(b);
    });
    function answer(i) {
      const ok = i === step.answer;
      [...opts.children].forEach((b, j) => { b.disabled = true; if (j === step.answer) b.classList.add('border-teal', 'text-teal'); else if (j === i && !ok) b.classList.add('border-danger', 'text-danger'); });
      $('#feedback', card).innerHTML = `<div class="rounded-xl border ${ok ? 'border-teal/50 bg-teal/10' : 'border-amber/40 bg-amber/5'} p-3 text-sm leading-6"><p class="font-bold ${ok ? 'text-teal' : 'text-amber'}">${ok ? '✔ 正確' : '✘ 不對，正確答案是 ' + String.fromCharCode(65 + step.answer)}</p><p class="mt-1">${esc(step.explain)}</p></div>`;
      SD.state.markStep(chapter.id, step.id, { correct: ok });
      updateNav();
    }
    if (done) answer(rec.correct ? step.answer : (step.answer + 1) % step.options.length);
  }

  function renderAnswer(step) {
    const done = stepDone(step);
    card.innerHTML = `
      <p class="eyebrow">結案</p>
      <h2 class="mt-2 text-2xl font-black">指認</h2>
      <div class="prose-sd mt-3">${step.prompt}</div>
      <div id="feedback" class="not-empty:mt-3">${done ? `<div class="rounded-xl border border-teal/50 bg-teal/10 p-4"><p class="text-lg font-black text-teal">✔ 破案！</p><p class="mt-2 leading-7">${esc(step.success)}</p></div>` : ''}</div>
      ${verdictEntryHtml(step)}`;
  }

  function renderSolution(step) {
    renderTask(step);
    $('.eyebrow', card).textContent = '結案系統';
    $('#feedback', card).insertAdjacentHTML('beforebegin', verdictEntryHtml(step));
    const fb = $('#feedback', card);
    if (stepDone(step)) fb.innerHTML = `<div class="rounded-xl border border-teal/50 bg-teal/10 p-3"><p class="font-bold text-teal">✔ 正確！</p><p class="mt-1 text-sm leading-6">${esc(step.success)}</p></div>`;
  }

  function renderStep() {
    const step = chapter.steps[stepIndex];
    card.scrollTop = 0;
    switch (step.type) {
      case 'story': renderStory(step); break;
      case 'lesson': renderLesson(step); break;
      case 'task': renderTask(step); break;
      case 'blocks': renderBlocks(step); break;
      case 'quiz': renderQuiz(step); break;
      case 'answer': renderAnswer(step); break;
      case 'solution': renderSolution(step); break;
      default: card.textContent = '';
    }
    if (step.type !== 'story') closeStage();
    if (SD.audio) SD.audio.setScene(SD.audio.sceneFor(step.type));
    if (canAnimate()) gsap.fromTo(card, { opacity: 0, x: 16 }, { opacity: 1, x: 0, duration: 0.35, ease: 'power2.out' });
    const p = prog();
    p.step = stepIndex; SD.state.save();
    // 焦點模式與編輯器提示條
    const writing = step.type === 'task' || step.type === 'solution';
    setFocus(writing ? 'write' : 'read');
    $('#editor-cue').hidden = !writing;
    if (writing) $('#editor-cue-text').textContent = `在這裡輸入 SQL 完成「${step.title}」，按 Ctrl+Enter 執行，結果會自動檢核。`;
    clearResultFeedback();
    hideIntro();
    renderProgress();
    updateNav();
    showPane('story');
    location.hash = `${chapter.slug}/${stepIndex}`;
    if (step.type !== 'story') startCoachIfPending();
  }

  function renderProgress() {
    const tasks = tasksOf(chapter);
    const done = tasks.filter(stepDone).length;
    $('#progress-label').textContent = `第 ${chapter.id} 章 · 任務 ${done} / ${tasks.length}`;
    $('#progress-fill').style.width = `${tasks.length ? Math.round((done / tasks.length) * 100) : 0}%`;
    $('#step-count').textContent = `步驟 ${stepIndex + 1} / ${chapter.steps.length}`;
  }

  /* 下一步按鈕會預告接下來是什麼，讓讀者知道「往前走會遇到什麼」 */
  function nextLabel() {
    const nxt = chapter.steps[stepIndex + 1];
    if (!nxt) return '結束本章 ✔';
    if (nxt.type === 'task' || nxt.type === 'solution') return `下一步：任務 ${tasksOf(chapter).indexOf(nxt) + 1} →`;
    if (nxt.type === 'lesson') return '下一步：教學 →';
    if (nxt.type === 'story') return '下一步：劇情 →';
    if (nxt.type === 'quiz') return '下一步：小測驗 →';
    return '下一步 →';
  }
  function updateNav() {
    const step = chapter.steps[stepIndex];
    $('#btn-prev').disabled = stepIndex === 0;
    const blocked = needsCompletion(step) && !stepDone(step);
    const nextBtn = $('#btn-next');
    // 劇情步驟一律由卡片內的按鈕推進（讀完變成「下一步」），避免同時出現兩個主要按鈕
    nextBtn.hidden = step.type === 'story';
    nextBtn.disabled = blocked;
    nextBtn.textContent = blocked ? (step.type === 'task' || step.type === 'solution' ? '完成任務後繼續' : '完成本步驟後繼續') : nextLabel();
    renderProgress();
  }

  function next() {
    if (stepIndex < chapter.steps.length - 1) { stepIndex++; renderStep(); return; }
    completeChapter();
  }
  function prev() { if (stepIndex > 0) { stepIndex--; renderStep(); } }
  $('#btn-next').addEventListener('click', next);
  $('#btn-prev').addEventListener('click', prev);

  function completeChapter() {
    closeStage();
    const p = prog();
    p.done = true; SD.state.save();
    const st = SD.state.chapterStars(chapter.id, tasksOf(chapter));
    const nextCh = chapters.find((c) => c.id === chapter.id + 1);
    const allDone = chapters.every(isDone);
    let extra = `<p class="text-amber">本章星數 ${st.earned} / ${st.max}</p>`;
    if (nextCh) extra += `<a href="./play.html#${nextCh.slug}" class="btn-teal mt-2" data-goto="${nextCh.slug}">前往第 ${nextCh.id} 章：${esc(nextCh.title)} →</a>`;
    unlockBadge(chapter.badge.id);
    populateSelect();
    if (allDone) {
      unlockBadge('master');
      renderAchievements();
      showBadge(MASTER_BADGE, certificateHtml());
      return;
    }
    renderAchievements();
    extra += '<p class="text-xs text-ink-300">之後想重看徽章，打開右上角的「偵探檔案」。</p>';
    showBadge(chapter.badge, extra);
    $('#dlg-badge').addEventListener('click', (e) => { const a = e.target.closest('[data-goto]'); if (a) { e.preventDefault(); $('#dlg-badge').close(); loadChapter(chapters.find((c) => c.slug === a.dataset.goto)); } }, { once: true });
  }

  // ---------------------------------------------------------------------------
  // 章節載入
  // ---------------------------------------------------------------------------
  function populateSelect() {
    const sel = $('#chapter-select');
    sel.innerHTML = chapters.map((c) => `<option value="${c.slug}" ${!unlocked(c) ? 'disabled' : ''} ${chapter && c.id === chapter.id ? 'selected' : ''}>第 ${c.id} 章 ${c.title}${isDone(c) ? ' ✔' : unlocked(c) ? '' : ' 🔒'}</option>`).join('');
  }
  $('#chapter-select').addEventListener('change', (e) => loadChapter(chapters.find((c) => c.slug === e.target.value)));

  /**
   * 載入章節。未指定步驟（選章、徽章彈窗的「前往」、沒有 hash 的首次進入）先顯示開場畫面；
   * hash 帶了步驟索引（重新整理、深連結）則直接進入該步驟。
   */
  function loadChapter(ch, step) {
    chapter = ch;
    const p = prog();
    stepIndex = step !== undefined ? Math.min(step, ch.steps.length - 1) : Math.min(p.step || 0, ch.steps.length - 1);
    if (step === undefined && location.hash !== `#${ch.slug}`) {
      history.replaceState(null, '', `#${ch.slug}`);
    }
    populateSelect();
    document.title = `第 ${ch.id} 章 ${ch.title} · SQL 偵探`;
    renderBoard();
    renderHistory();
    if (ch.resettable) addChapterResetButton(); else removeChapterResetButton();
    if (step === undefined) showIntro(); else renderStep();
  }

  // ---------------------------------------------------------------------------
  // 任務清單：讓學員直接跳回已完成的任務練習，不必靠「上一步」逐格倒退。
  // 可跳轉的條件：本章已結案、該任務已完成，或該任務不在目前進度之後。
  // ---------------------------------------------------------------------------
  function taskReachable(task) {
    if (isDone(chapter)) return true;
    return stepDone(task) || chapter.steps.indexOf(task) <= (prog().step || 0);
  }
  function taskListHtml() {
    const tasks = tasksOf(chapter);
    const p = prog();
    return `<ol class="task-list" aria-label="本章任務">${tasks.map((t, i) => {
      const idx = chapter.steps.indexOf(t);
      const done = stepDone(t);
      const reach = taskReachable(t);
      const current = idx === stepIndex;
      const status = done ? stars(starsForHints(p.hints[t.id] || 0)) : reach ? '<span class="text-amber">進行中</span>' : '<span class="text-ink-300">未解鎖</span>';
      const inner = `<span class="task-list-no">${i + 1}</span><span class="task-list-title">${esc(t.title)}</span><span class="task-list-status">${status}</span>`;
      if (!reach) return `<li><span class="task-list-item is-locked" aria-disabled="true">${inner}</span></li>`;
      return `<li><button type="button" class="task-list-item${current ? ' is-current' : ''}" data-step="${idx}"${current ? ' aria-current="step"' : ''}>${inner}</button></li>`;
    }).join('')}</ol>`;
  }
  function bindTaskList(root, before) {
    root.addEventListener('click', (e) => {
      const b = e.target.closest('[data-step]');
      if (!b) return;
      if (before) before();
      coachPending = false;
      stepIndex = Number(b.dataset.step);
      renderStep();
      // 手機版可能已捲到查詢區底部，跳轉後要看得到新任務卡
      window.scrollTo({ top: 0, behavior: 'instant' });
    });
  }
  const dlgTasks = $('#dlg-tasks');
  $('#step-count').addEventListener('click', () => {
    $('#tasks-body').innerHTML = taskListHtml();
    dlgTasks.showModal();
  });
  bindTaskList(dlgTasks, () => dlgTasks.close());
  bindTaskList(boardStage, () => boardStage.close());

  // ---------------------------------------------------------------------------
  // 章節開場
  // ---------------------------------------------------------------------------
  const intro = $('#chapter-intro');
  function showIntro() {
    const p = prog();
    const tasks = tasksOf(chapter);
    const st = SD.state.chapterStars(chapter.id, tasks);
    const doneTasks = tasks.filter(stepDone).length;
    const started = doneTasks > 0 || (p.step || 0) > 0;
    const firstStory = chapter.steps.find((s) => s.type === 'story');
    const teaser = firstStory ? firstStory.lines[0].text : '';
    const clues = state.clues.filter((c) => c.ch === chapter.id).length;
    intro.innerHTML = `
      <div class="intro-banner">
        <img src="${chapter.cover}" alt="" width="1200" height="525" fetchpriority="high" />
        <div class="absolute inset-x-0 bottom-0 z-10 p-6 sm:p-8">
          <p class="eyebrow">第 ${chapter.id} 章 · ${tasks.length} 個任務</p>
          <h1 class="mt-2 text-3xl font-black sm:text-5xl">${esc(chapter.title)}</h1>
          <p class="mt-2 text-lg text-ink-300">${esc(chapter.subtitle)}</p>
        </div>
      </div>
      <div class="mt-6 grid gap-6 lg:grid-cols-[1fr_20rem]">
        <div class="flex flex-col gap-4">
          ${teaser ? `<p class="text-lg italic leading-8 text-ink-300">${esc(teaser)}</p>` : ''}
          <div>
            <p class="eyebrow">本章會學到</p>
            <ul class="mt-2 flex flex-wrap gap-2" aria-label="本章語法">${chapter.skills.map((s) => `<li class="chip border-teal/40 text-teal">${esc(s)}</li>`).join('')}</ul>
          </div>
          <div class="flex flex-wrap items-center gap-3">
            <button type="button" id="btn-intro-start" class="btn-primary text-lg">${isDone(chapter) ? '重看本章 →' : started ? `繼續辦案（步驟 ${stepIndex + 1}）→` : '開始辦案 →'}</button>
            ${started && !isDone(chapter) ? '<button type="button" id="btn-intro-restart" class="btn-ghost">從第一步開始</button>' : ''}
            <a href="./" class="btn-ghost">回首頁</a>
          </div>
        </div>
        <dl class="grid grid-cols-3 gap-3 lg:grid-cols-1">
          <div class="intro-stat"><dt>任務進度</dt><dd>${doneTasks} / ${tasks.length}</dd></div>
          <div class="intro-stat"><dt>本章星數</dt><dd>${st.earned} / ${st.max}</dd></div>
          <div class="intro-stat"><dt>釘上的線索</dt><dd>${clues}</dd></div>
        </dl>
      </div>
      ${started ? `<div class="mt-8">
        <p class="eyebrow">任務清單</p>
        <p class="mt-1 text-sm text-ink-300">點已完成的任務可以直接回去練習，星數以原本的紀錄為準。</p>
        <div class="mt-3" id="intro-tasks">${taskListHtml()}</div>
      </div>` : ''}`;
    closeStage();
    intro.hidden = false;
    main.hidden = true;
    $('#pane-tabs').hidden = true;
    window.scrollTo({ top: 0, behavior: 'instant' });
    renderProgress();
    $('#btn-intro-start', intro).addEventListener('click', () => { coachPending = true; renderStep(); });
    const restart = $('#btn-intro-restart', intro);
    if (restart) restart.addEventListener('click', () => { coachPending = true; stepIndex = 0; renderStep(); });
    const list = $('#intro-tasks', intro);
    if (list) bindTaskList(list);
    if (canAnimate()) gsap.from(intro.children, { y: 16, opacity: 0, duration: 0.5, stagger: 0.1, ease: 'power2.out' });
  }
  function hideIntro() {
    if (intro.hidden) return;
    intro.hidden = true;
    main.hidden = false;
    $('#pane-tabs').hidden = false;
    // 開場頁的任務清單在頁面底部，不重設捲動位置的話辦案畫面一出現就落在底部；與 showIntro 對稱
    window.scrollTo({ top: 0, behavior: 'instant' });
  }

  // ---------------------------------------------------------------------------
  // 首次導覽：三張提示卡依序指向劇情卡、編輯器、證據板（手機只提示面板切換）
  // ---------------------------------------------------------------------------
  const COACH_KEY = 'sd_coach_v1';
  let coachPending = false;
  function startCoachIfPending() { if (!coachPending || stage.open) return; coachPending = false; maybeStartCoach(); }
  function maybeStartCoach() {
    try { if (localStorage.getItem(COACH_KEY)) return; } catch (e) { return; }
    const steps = lg.matches
      ? [
        { target: '#step-card', text: '左邊是劇情、教學與任務。看完一段就按「下一步」，任務會告訴你要查什麼。' },
        { target: '#editor-card', text: '中間是查詢區。在這裡輸入 SQL，按 Ctrl + Enter 執行，結果會自動檢核並顯示在下方。' },
        { target: '#btn-board', text: '右上角是證據板。每完成一個任務，線索就會釘上去，最後靠它們指認兇手。' },
      ]
      : [
        { target: '#pane-tabs', text: '手機上用這兩個分頁切換「劇情、查詢」。任務卡上的按鈕會直接帶你到查詢區。' },
        { target: '#btn-board', text: '右上角是證據板。每完成一個任務，線索就會釘上去，最後靠它們指認兇手。' },
      ];
    let i = 0;
    const overlay = el('div', 'coach');
    overlay.setAttribute('role', 'dialog');
    overlay.setAttribute('aria-label', '操作導覽');
    document.body.appendChild(overlay);
    let current = null;
    const finish = () => { if (current) current.classList.remove('coach-target'); overlay.remove(); try { localStorage.setItem(COACH_KEY, '1'); } catch (e) { /* 私密模式下每次都會再看一次導覽，可接受 */ } };
    function show() {
      if (current) current.classList.remove('coach-target');
      const s = steps[i];
      current = $(s.target);
      if (!current) { finish(); return; }
      current.classList.add('coach-target');
      current.scrollIntoView({ block: 'nearest' });
      const r = current.getBoundingClientRect();
      overlay.innerHTML = `<div class="coach-tip"><p class="eyebrow">導覽 ${i + 1} / ${steps.length}</p><p class="mt-2">${esc(s.text)}</p><div class="mt-3 flex justify-end gap-2"><button type="button" class="btn-ghost btn-sm" data-skip>略過</button><button type="button" class="btn-primary btn-sm" data-go>${i === steps.length - 1 ? '知道了' : '下一個'}</button></div></div>`;
      const tip = overlay.firstElementChild;
      const below = r.bottom + 12 + 180 < window.innerHeight;
      tip.style.top = `${below ? r.bottom + 12 : Math.max(12, r.top - 12 - 180)}px`;
      tip.style.left = `${Math.min(Math.max(12, r.left), window.innerWidth - 20 * 16 - 12)}px`;
      $('[data-go]', tip).focus();
    }
    overlay.addEventListener('click', (e) => {
      if (e.target.closest('[data-skip]')) { finish(); return; }
      if (e.target.closest('[data-go]')) { i++; if (i >= steps.length) finish(); else show(); }
    });
    show();
  }

  function addChapterResetButton() {
    if ($('#btn-reset-ch')) return;
    const b = el('button', 'menu-item', '重置本章資料表'); b.type = 'button'; b.id = 'btn-reset-ch';
    b.title = '刪掉本章建立的 evidence / evidence_photo 表，從第一個任務重做';
    b.addEventListener('click', () => {
      if (!window.confirm('會刪除 evidence 與 evidence_photo 表，並清除本章任務進度。確定？')) return;
      SD.db.run('DROP TABLE IF EXISTS evidence_photo; DROP TABLE IF EXISTS evidence;');
      scheduleDbSave(); renderSchemaList();
      const p = prog(); p.steps = {}; p.hints = {}; p.done = false; p.step = 0; SD.state.save();
      stepIndex = 0; renderStep();
    });
    $('#btn-reset-db').before(b);
  }
  function removeChapterResetButton() { const b = $('#btn-reset-ch'); if (b) b.remove(); }

  function parseHash() {
    const m = location.hash.replace(/^#/, '').split('/');
    const ch = chapters.find((c) => c.slug === m[0]);
    return { ch, step: m[1] !== undefined ? Number(m[1]) : undefined };
  }

  $('#btn-reset-db').addEventListener('click', () => {
    if (!window.confirm('把資料庫還原成初始狀態？你在第 5 章建立的資料表會消失，任務進度不會改變。')) return;
    SD.db.reset(); SD.state.clearDb(); renderSchemaList();
    resultsEl.innerHTML = '';
    resultsEl.appendChild($('#tpl-results-empty').content.cloneNode(true));
    $('#db-status').textContent = '資料庫已重置。';
  });

  // 語法小抄
  $('#btn-cheatsheet').addEventListener('click', () => {
    const body = $('#cheatsheet-body');
    if (!body.children.length) {
      body.innerHTML = SD.cheatsheet.map((g) => `<section class="mb-5"><h3 class="eyebrow mb-2">${esc(g.title)}</h3><ul class="flex flex-col gap-2">${g.items.map(([code, desc]) => `<li class="flex flex-col gap-1 rounded-lg border border-ink-800 p-2 sm:flex-row sm:items-start sm:justify-between"><pre class="prose-sd m-0 flex-1 text-code"><code>${SD.highlight(code)}</code></pre><span class="text-xs text-ink-300 sm:max-w-[40%] sm:text-right">${esc(desc)}</span><button type="button" class="btn-ghost btn-sm shrink-0" data-insert="${esc(code)}">帶入</button></li>`).join('')}</ul></section>`).join('');
      // 先關 dialog 再寫入：modal 開著時頁面其餘部分是 inert，編輯器無法聚焦，insertText 會失敗而退回設 value
      body.addEventListener('click', (e) => { const b = e.target.closest('[data-insert]'); if (b) { $('#dlg-cheatsheet').close(); setEditor(b.dataset.insert); } });
    }
    $('#dlg-cheatsheet').showModal();
  });

  // ---------------------------------------------------------------------------
  // 啟動
  // ---------------------------------------------------------------------------
  /*
   * 開場過場：play.html 內建的 #boot-stage 從第一次繪製就蓋住畫面，這裡只負責換文字、
   * 換成該章封面當背景，以及在資料庫就緒後淡出移除；失敗時停在過場顯示錯誤與重新整理。
   */
  const bootEl = $('#boot-stage');
  const bootStage = { engine: '載入查詢引擎…', snapshot: '還原你上次的資料庫…', seed: '建立潮港市警局資料…' };
  function bootSay(text) { $('#boot-status').textContent = text; }
  function bootDismiss() {
    bootEl.setAttribute('aria-busy', 'false');
    bootSay('檔案調閱完成');
    if (canAnimate()) gsap.to(bootEl, { opacity: 0, duration: 0.45, ease: 'power2.out', onComplete: () => bootEl.remove() });
    else bootEl.remove();
  }
  function bootFail(message) {
    bootEl.setAttribute('aria-busy', 'false');
    bootEl.setAttribute('role', 'alert');
    bootSay(`資料庫載入失敗：${message}。請確認瀏覽器支援 WebAssembly，或重新整理。`);
    const actions = $('#boot-actions');
    const reload = el('button', 'btn-primary btn-sm', '重新整理'); reload.type = 'button';
    reload.addEventListener('click', () => location.reload());
    const home = el('a', 'btn-ghost btn-sm', '回首頁'); home.href = './';
    actions.append(reload, home);
    actions.hidden = false;
    reload.focus();
  }

  async function boot() {
    if (SD.audio) SD.audio.init();
    renderBoard();
    renderAchievements();
    const { ch, step } = parseHash();
    const start = (ch && unlocked(ch)) ? ch : (chapters.find((c) => unlocked(c) && !isDone(c)) || chapters[0]);
    loadChapter(start, ch && unlocked(ch) ? step : undefined);
    const bg = $('#boot-bg');
    if (start.cover) { bg.src = start.cover; bg.hidden = false; }
    resultsEl.appendChild($('#tpl-loading').content.cloneNode(true));
    try {
      await SD.db.init(SD.state.loadDb(), (s) => bootSay(bootStage[s] || '載入中…'));
      dbReady = true;
      $('#db-status').textContent = '資料庫已就緒：chaogang_police（18 張表）。按 Ctrl + Enter 執行。';
      resultsEl.innerHTML = '';
      resultsEl.appendChild($('#tpl-results-empty').content.cloneNode(true));
      renderSchemaList();
      renderTaskTables();
      bootDismiss();
    } catch (e) {
      $('#db-status').textContent = '資料庫載入失敗：' + e.message;
      resultsEl.innerHTML = `<div class="card border-danger/50 text-danger">無法載入 sql.js（${esc(e.message)}）。請確認瀏覽器支援 WebAssembly，或重新整理。</div>`;
      bootFail(e.message);
    }
  }
  window.addEventListener('hashchange', () => { const { ch, step } = parseHash(); if (ch && unlocked(ch) && (ch !== chapter || (step !== undefined && step !== stepIndex))) loadChapter(ch, step); });
  boot();
})();
