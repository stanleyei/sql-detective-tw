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
  function renderSchemaCols(t) {
    const s = SD.db.schema();
    const cols = $('#schema-cols');
    $('#schema-tabs').querySelectorAll('[data-table]').forEach((b) => b.setAttribute('aria-expanded', String(b.dataset.table === t)));
    if (!t || !s.byTable[t]) { openSchemaTable = null; cols.hidden = true; cols.innerHTML = ''; return; }
    openSchemaTable = t;
    cols.hidden = false;
    cols.innerHTML = '';
    const grid = el('div', 'grid gap-1 grid-cols-[repeat(auto-fill,minmax(13rem,1fr))]');
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
        go.addEventListener('click', () => renderSchemaCols(fk.table));
        cell.appendChild(go);
      }
      grid.appendChild(cell);
    }
    const actions = el('div', 'mt-2 flex flex-wrap gap-2');
    const mk = (label, sql, title) => { const b = el('button', 'btn-ghost btn-sm flex-1', label); b.type = 'button'; if (title) b.title = title; b.addEventListener('click', () => { setEditor(sql); runSql(); }); return b; };
    actions.append(mk('DESCRIBE', `DESCRIBE ${t};`), mk('看 5 筆', `SELECT * FROM ${t} LIMIT 5;`), mk('欄位備註', `SHOW FULL COLUMNS FROM ${t};`, 'SHOW FULL COLUMNS：含中文 Comment'));
    cols.append(grid, actions);
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

  function clueCard(clue, isNew) {
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
  function openBoard() {
    boardFilter = 'current';
    renderBoard();
    boardStage.showModal();
    if (canAnimate()) {
      gsap.fromTo(boardStage, { opacity: 0 }, { opacity: 1, duration: 0.3 });
      gsap.from('#board .polaroid', { y: -24, opacity: 0, duration: 0.45, stagger: 0.04, ease: 'power2.out', clearProps: 'all' });
    }
    // 看過就不算新：標記留到關板才清，讓玩家在板上找得到剛釘的那張
  }
  $('#btn-board').addEventListener('click', openBoard);
  $('#board-close').addEventListener('click', () => boardStage.close());
  boardStage.addEventListener('close', () => { newClueIds.clear(); updateBoardButton(); $('#btn-board').focus(); });

  /* 新增線索：存檔 → 標新 → 右下角提示卡展示後飛進 header 按鈕 */
  function addClue(clue) {
    if (!SD.state.addClue(clue)) return;
    newClueIds.add(clue.id);
    updateBoardButton();
    revealClue(clue);
  }
  function pinClue(step) {
    if (!step.clue) return;
    addClue({ id: step.id, ch: chapter.id, title: step.clue.title, text: step.clue.text });
  }
  let toastTimer = null;
  function revealClue(clue) {
    const toast = $('#clue-toast');
    clearTimeout(toastTimer);
    toast.innerHTML = '';
    const card = clueCard(clue, false);
    card.querySelector('.polaroid-ch').textContent = '新線索已釘上證據板';
    card.insertAdjacentHTML('beforeend', '<button type="button" class="btn-primary btn-sm absolute bottom-3 right-3" data-open-board>看證據板</button>');
    toast.appendChild(card);
    card.querySelector('[data-open-board]').addEventListener('click', () => { dismiss(true); openBoard(); });
    const btn = $('#btn-board');
    const dismiss = (now) => {
      clearTimeout(toastTimer);
      if (!card.isConnected) return;
      if (now || !canAnimate()) { card.remove(); return; }
      // 飛向 header 的證據板按鈕再淡出，讓玩家知道線索收到哪裡去了
      const from = card.getBoundingClientRect();
      const to = btn.getBoundingClientRect();
      gsap.to(card, { x: to.left + to.width / 2 - (from.left + from.width / 2), y: to.top + to.height / 2 - (from.top + from.height / 2), scale: 0.15, opacity: 0, duration: 0.6, ease: 'power2.in', onComplete: () => { card.remove(); gsap.fromTo(btn, { scale: 1.15 }, { scale: 1, duration: 0.4, ease: 'back.out(3)' }); } });
    };
    if (canAnimate()) gsap.from(card, { y: 40, opacity: 0, duration: 0.5, ease: 'back.out(1.4)' });
    toastTimer = setTimeout(() => dismiss(false), 4500);
  }

  /* 結案回顧：指認／提交步驟的卡片下方列出本章已釘上的線索，並提示還有幾條藏在未完成的任務裡 */
  function clueRecapHtml() {
    const got = state.clues.filter((c) => c.ch === chapter.id);
    // 指認成功會多釘一張「結案」，分母把它算進去，數字才不會超過總數
    const total = chapter.steps.filter((s) => s.clue || s.type === 'answer').length;
    const missing = chapter.steps.filter((s) => s.clue && !stepDone(s)).length;
    const rows = got.map((c) => `<li class="clue-row"><img src="${SD.media.clueIcon(c.title)}" alt="" width="40" height="40" loading="lazy" /><div class="min-w-0"><p class="font-bold">${esc(c.title)}</p><p class="text-sm leading-6 text-ink-300">${esc(c.text)}</p></div></li>`).join('');
    return `<div class="clue-recap"><div class="flex flex-wrap items-center justify-between gap-2"><p class="eyebrow text-teal">本章線索 ${got.length} / ${total}</p><button type="button" class="btn-ghost btn-sm" data-open-board>打開證據板</button></div>${rows ? `<ul class="mt-2">${rows}</ul>` : '<p class="mt-2 text-sm text-ink-300">還沒有線索。回頭完成任務，線索會釘在這裡。</p>'}${missing ? `<p class="mt-2 text-sm text-amber">還有 ${missing} 條線索藏在未完成的任務裡。</p>` : ''}</div>`;
  }
  function renderBadges() {
    const wrap = $('#badge-list');
    wrap.innerHTML = '';
    const all = chapters.map((c) => c.badge).concat([{ id: 'master', name: '全星通關', img: './images/badge-master.webp', desc: '完成全部章節。' }]);
    for (const b of all) {
      const has = state.badges.includes(b.id);
      const d = el('div', `flex flex-col items-center gap-1 text-center ${has ? '' : 'opacity-30 grayscale'}`);
      d.title = `${b.name}：${b.desc}`;
      d.innerHTML = `<img src="${b.img}" alt="${esc(b.name)}${has ? '' : '（未取得）'}" width="56" height="56" class="size-14 rounded-full object-cover" loading="lazy" /><span class="text-[0.65rem] leading-tight text-ink-300">${esc(b.name)}</span>`;
      wrap.appendChild(d);
    }
    $('#star-total').textContent = `★ ${totalStars()}`;
  }
  function showBadge(badge, extraHtml) {
    const dlg = $('#dlg-badge');
    $('#badge-body').innerHTML = `
      <p class="eyebrow">徽章解鎖</p>
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
  card.addEventListener('click', (e) => { if (e.target.closest('[data-open-board]')) openBoard(); });

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
  function renderStory(step) {
    renderStoryCard(step);
    openStage(step);
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

  function openStage(step) {
    stageStep = step;
    stageLine = 0;
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
    const s = SD.db.schema();
    wrap.innerHTML = `<p class="text-xs text-ink-300">相關資料表（點開看欄位，點欄位插入編輯器）</p><div class="mt-1 flex flex-wrap gap-2">${tables.map((t) => `<button type="button" class="chip min-h-11 cursor-pointer font-mono text-teal hover:border-amber" data-table="${t}" aria-expanded="false">${esc(t)}</button>`).join('')}</div><div id="task-cols" class="mt-2 flex flex-wrap gap-1.5" hidden></div>`;
    const cols = $('#task-cols', wrap);
    wrap.addEventListener('click', (e) => {
      const tb = e.target.closest('[data-table]');
      if (tb) {
        const open = tb.getAttribute('aria-expanded') === 'true';
        wrap.querySelectorAll('[data-table]').forEach((b) => b.setAttribute('aria-expanded', 'false'));
        if (open) { cols.hidden = true; return; }
        tb.setAttribute('aria-expanded', 'true');
        cols.hidden = false;
        cols.innerHTML = s.byTable[tb.dataset.table].map((c) => `<button type="button" class="inline-flex min-h-11 items-center gap-1 rounded border border-ink-700 bg-ink-950/60 px-2 py-1 font-mono text-xs text-paper hover:border-amber" data-col="${esc(c.name)}">${c.pk ? SD.schemaDoc.keyIcon('pk') : SD.schemaDoc.fk(tb.dataset.table, c.name) || c.fk ? SD.schemaDoc.keyIcon('fk') : ''}${esc(c.name)}</button>`).join('');
        return;
      }
      const cb = e.target.closest('[data-col]');
      if (cb) insertAtCursor(cb.dataset.col);
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
    showHint(hintsUsed);
    $('#btn-hint', card).addEventListener('click', () => {
      const cur = prog().hints[step.id] || 0;
      if (cur >= 3) return;
      if (cur === 2 && !window.confirm('第 3 個提示是完整解答，看了這題只會得到 1 星。確定要看嗎？')) return;
      SD.state.useHint(chapter.id, step.id, cur + 1);
      showHint(cur + 1);
      $('#btn-hint', card).textContent = `💡 提示（${cur + 1}/3）`;
      if (cur + 1 >= 3) $('#btn-hint', card).disabled = true;
    });
    if (hintsUsed >= 3) $('#btn-hint', card).disabled = true;
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
      fb.innerHTML = `<div class="rounded-xl border border-teal/50 bg-teal/10 p-3"><p class="font-bold text-teal">✔ 正確！</p><p class="mt-1 text-sm leading-6">${esc(step.type === 'solution' ? step.success : (step.success || '結果符合預期。'))}</p></div>`;
      const st = $('#task-status', card);
      if (st) { st.className = 'chip border-teal/50 text-teal'; st.innerHTML = `已完成 ${stars(starsForHints(h))}`; }
      if (canAnimate()) gsap.from(fb.firstElementChild, { scale: 0.96, opacity: 0, duration: 0.35, ease: 'back.out(2)' });
      if (!wasDone) pinClue(step);
      renderBadges();
      updateNav();
      showResultFeedback(true, step.type === 'solution' ? step.success : (step.success || '結果符合預期。'));
      showPane('story');
    } else {
      fb.innerHTML = `<div class="rounded-xl border border-amber/40 bg-amber/5 p-3 text-sm leading-6"><span class="font-bold text-amber">還差一點：</span>${esc(result.message)}</div>`;
      showResultFeedback(false, result.message);
    }
  }

  /* 檢核結果也貼在結果區最上方（桌機視線停在中欄），成功時附「下一步」按鈕，不必回左欄找 */
  function showResultFeedback(ok, message) {
    const box = $('#result-feedback');
    box.hidden = false;
    const last = stepIndex === chapter.steps.length - 1;
    box.innerHTML = ok
      ? `<div class="flex flex-wrap items-center gap-3 rounded-xl border border-teal/50 bg-teal/10 p-3"><p class="flex-1 text-sm leading-6"><span class="font-bold text-teal">✔ 正確！</span> ${esc(message)}</p><button type="button" class="btn-teal btn-sm" data-next>${last ? '結束本章 ✔' : '下一步 →'}</button></div>`
      : `<div class="rounded-xl border border-amber/40 bg-amber/5 p-3 text-sm leading-6"><span class="font-bold text-amber">還差一點：</span>${esc(message)}</div>`;
    if (canAnimate()) gsap.from(box.firstElementChild, { y: -8, opacity: 0, duration: 0.3 });
  }
  $('#result-feedback').addEventListener('click', (e) => { if (e.target.closest('[data-next]')) next(); });
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
      <form id="answer-form" class="mt-4 flex flex-wrap gap-2">
        <label class="sr-only" for="answer-input">姓名</label>
        <input id="answer-input" class="min-h-11 flex-1 rounded-lg border border-ink-600 bg-ink-950 px-3 text-paper" placeholder="輸入姓名" autocomplete="off" ${done ? 'disabled' : ''} />
        <button type="submit" class="btn-primary" ${done ? 'disabled' : ''}>提交</button>
      </form>
      <div id="feedback" class="mt-3" aria-live="assertive"></div>
      ${clueRecapHtml()}`;
    const fb = $('#feedback', card);
    const success = () => { fb.innerHTML = `<div class="rounded-xl border border-teal/50 bg-teal/10 p-4"><p class="text-lg font-black text-teal">✔ 破案！</p><p class="mt-2 leading-7">${esc(step.success)}</p></div>`; };
    if (done) success();
    $('#answer-form', card).addEventListener('submit', async (e) => {
      e.preventDefault();
      const v = $('#answer-input', card).value.trim();
      if (!v) return;
      const ok = await SD.check.checkAnswer(v, SD.expect[step.id]);
      if (ok) {
        SD.state.markStep(chapter.id, step.id);
        success();
        if (canAnimate()) gsap.from(fb.firstElementChild, { scale: 0.9, opacity: 0, duration: 0.5, ease: 'back.out(2)' });
        $('#answer-input', card).disabled = true;
        e.target.querySelector('button').disabled = true;
        addClue({ id: step.id, ch: chapter.id, title: '結案', text: `${v}。${step.success.split('。')[0]}。` });
        updateNav();
      } else {
        fb.innerHTML = `<div class="rounded-xl border border-amber/40 bg-amber/5 p-3 text-sm leading-6"><span class="font-bold text-amber">不是這個人。</span>${esc(step.fail)}</div>`;
        if (canAnimate()) gsap.fromTo(fb, { x: -6 }, { x: 0, duration: 0.4, ease: 'elastic.out(1, 0.3)' });
      }
    });
  }

  function renderSolution(step) {
    renderTask(step);
    $('.eyebrow', card).textContent = '結案系統';
    $('#feedback', card).insertAdjacentHTML('beforebegin', clueRecapHtml());
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
    const firstTime = !p.done;
    p.done = true; SD.state.save();
    const st = SD.state.chapterStars(chapter.id, tasksOf(chapter));
    const nextCh = chapters.find((c) => c.id === chapter.id + 1);
    const allDone = chapters.every(isDone);
    let extra = `<p class="text-amber">本章星數 ${st.earned} / ${st.max}</p>`;
    if (nextCh) extra += `<a href="./play.html#${nextCh.slug}" class="btn-teal mt-2" data-goto="${nextCh.slug}">前往第 ${nextCh.id} 章：${esc(nextCh.title)} →</a>`;
    SD.state.addBadge(chapter.badge.id);
    renderBadges();
    populateSelect();
    if (allDone) {
      SD.state.addBadge('master');
      renderBadges();
      const total = totalStars();
      const max = chapters.reduce((s, c) => s + tasksOf(c).length * 3, 0);
      showBadge({ img: './images/badge-master.webp', name: '結案證書', desc: '潮港市六起案件全數偵破。' }, `
        <div class="w-full rounded-xl border border-amber/40 bg-ink-950 p-4 text-left">
          <p class="eyebrow">潮港市警察局 · 結案證書</p>
          <p class="mt-2 text-lg font-bold">資料分析組 實習偵探</p>
          <p class="mt-1 text-sm text-ink-300">完成章節 ${chapters.length} / ${chapters.length} · 總星數 ${total} / ${max} · 線索 ${state.clues.length} 條 · 徽章 ${state.badges.length} 枚</p>
          <p class="mt-1 text-xs text-ink-300">${new Date().toLocaleDateString('zh-TW')} · 截圖此畫面即可作為學習紀錄</p>
        </div>`);
      return;
    }
    if (firstTime) showBadge(chapter.badge, extra);
    else showBadge(chapter.badge, extra);
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
    document.title = `第 ${ch.id} 章 ${ch.title} · SQL 偵探事務所`;
    renderBoard();
    renderHistory();
    if (ch.resettable) addChapterResetButton(); else removeChapterResetButton();
    if (step === undefined) showIntro(); else renderStep();
  }

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
          <p class="eyebrow">第 ${chapter.id} 章 · 約 ${chapter.minutes} 分 · ${tasks.length} 個任務</p>
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
      </div>`;
    closeStage();
    intro.hidden = false;
    main.hidden = true;
    $('#pane-tabs').hidden = true;
    window.scrollTo({ top: 0, behavior: 'instant' });
    renderProgress();
    $('#btn-intro-start', intro).addEventListener('click', () => { coachPending = true; renderStep(); });
    const restart = $('#btn-intro-restart', intro);
    if (restart) restart.addEventListener('click', () => { coachPending = true; stepIndex = 0; renderStep(); });
    if (canAnimate()) gsap.from(intro.children, { y: 16, opacity: 0, duration: 0.5, stagger: 0.1, ease: 'power2.out' });
  }
  function hideIntro() {
    if (intro.hidden) return;
    intro.hidden = true;
    main.hidden = false;
    $('#pane-tabs').hidden = false;
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
    renderBoard();
    renderBadges();
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
