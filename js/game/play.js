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
  const panes = { story: $('#pane-story'), editor: $('#pane-editor'), board: $('#pane-board') };
  const lg = window.matchMedia('(min-width: 64rem)');
  let activePane = 'story';
  function applyPanes() {
    for (const [k, p] of Object.entries(panes)) p.hidden = lg.matches ? false : k !== activePane;
    document.querySelectorAll('#pane-tabs [data-pane]').forEach((b) => b.setAttribute('aria-selected', String(b.dataset.pane === activePane)));
  }
  function showPane(name) { activePane = name; applyPanes(); }
  lg.addEventListener('change', applyPanes);
  $('#pane-tabs').addEventListener('click', (e) => { const b = e.target.closest('[data-pane]'); if (b) showPane(b.dataset.pane); });
  applyPanes();

  /* 焦點模式：read（劇情／教學）壓暗右側兩欄，write（任務）點亮編輯器；樣式見 tailwind.css */
  const main = $('#main');
  function setFocus(mode) { main.dataset.focus = mode; }

  // header「⋯」選單：點外面或按 Esc 關閉
  const moreMenu = $('#more-menu');
  document.addEventListener('click', (e) => { if (moreMenu.open && !moreMenu.contains(e.target)) moreMenu.open = false; });
  document.addEventListener('keydown', (e) => { if (e.key === 'Escape' && moreMenu.open) moreMenu.open = false; });
  moreMenu.addEventListener('click', (e) => { if (e.target.closest('.menu-item')) moreMenu.open = false; });

  // ---------------------------------------------------------------------------
  // 編輯器與結果
  // ---------------------------------------------------------------------------
  const editor = $('#editor');
  const resultsEl = $('#results');

  function insertAtCursor(text) {
    const start = editor.selectionStart, end = editor.selectionEnd;
    const before = editor.value.slice(0, start), after = editor.value.slice(end);
    const pad = before && !/\s$/.test(before) ? ' ' : '';
    editor.value = before + pad + text + after;
    const pos = start + pad.length + text.length;
    editor.setSelectionRange(pos, pos);
    editor.focus();
    showPane('editor');
  }
  function setEditor(text) { editor.value = text; editor.focus(); showPane('editor'); }

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
    // 執行後收起欄位格，讓編輯器與結果同時留在視野內；表名 chip 仍在，一鍵可再展開
    if (openSchemaTable) renderSchemaCols(null);
    if (lastResults.some((r) => r.type === 'affected' || r.ddl)) { scheduleDbSave(); renderSchemaList(); }
    const step = chapter.steps[stepIndex];
    if (step && (step.type === 'task' || step.type === 'solution')) await evaluateStep(step);
  }
  $('#btn-run').addEventListener('click', runSql);
  $('#btn-clear').addEventListener('click', () => { editor.value = ''; editor.focus(); });
  editor.addEventListener('keydown', (e) => {
    if ((e.ctrlKey || e.metaKey) && e.key === 'Enter') { e.preventDefault(); runSql(); }
    if (e.key === 'Tab') { e.preventDefault(); insertAtCursor('  '); }
  });

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
      // 外鍵的第二行只放補充（受訪者、直屬主管…），「→ 表.欄」獨立成右側按鈕才點得到
      const zh = fk ? fk.note || '' : SD.schemaDoc.column(t, c.name);
      const icon = c.pk ? SD.schemaDoc.keyIcon('pk') : fk ? SD.schemaDoc.keyIcon('fk') : '';
      const type = (c.type || '').split(' ')[0].toLowerCase();
      const cell = el('div', 'flex items-stretch rounded-lg border border-ink-800 bg-ink-950/40');
      const b = el('button', 'flex min-h-11 min-w-0 flex-1 flex-col justify-center gap-0.5 rounded-lg px-2.5 py-1.5 text-left hover:bg-ink-800', `<span class="flex items-baseline gap-2 font-mono text-xs text-paper"><span class="inline-flex items-center gap-1">${icon}${esc(c.name)}</span><span class="text-ink-300">${esc(type)}</span></span>${zh ? `<span class="truncate text-xs text-ink-300">${esc(zh)}</span>` : ''}`);
      b.type = 'button';
      b.title = zh ? `${zh}，插入 ${c.name}` : `插入 ${c.name}`;
      b.addEventListener('click', () => insertAtCursor(c.name));
      cell.appendChild(b);
      if (fk) {
        const go = el('button', 'min-h-11 shrink-0 rounded-r-lg border-l border-ink-800 px-2 font-mono text-xs text-teal hover:bg-ink-800 hover:text-amber', `→ ${esc(fk.table)}.${esc(fk.column)}`);
        go.type = 'button';
        go.title = `前往 ${fk.table}`;
        go.setAttribute('aria-label', `外鍵，前往 ${fk.table} 表的 ${fk.column} 欄`);
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
  function clueCard(clue) {
    const c = el('article', 'clue-card');
    c.innerHTML = `<img src="${SD.media.clueIcon(clue.title)}" alt="" width="56" height="56" class="clue-thumb" loading="lazy" /><div class="min-w-0 flex-1"><p class="eyebrow text-[0.65rem] text-teal">第 ${clue.ch} 章 · 線索</p><h4 class="mt-1 font-bold">${esc(clue.title)}</h4><p class="mt-1 leading-6 text-ink-300">${esc(clue.text)}</p></div>`;
    return c;
  }
  function renderBoard() {
    const board = $('#board');
    board.innerHTML = '';
    const all = $('#board-all').checked;
    const clues = state.clues.filter((c) => all || !chapter || c.ch === chapter.id).reverse();
    for (const c of clues) board.appendChild(clueCard(c));
    $('#board-empty').hidden = clues.length > 0;
    $('#board-empty-text').textContent = state.clues.length && !clues.length ? '本章還沒有線索。勾選上方可看其他章節。' : '完成任務後，線索會釘在這裡。';
    $('#clue-count').textContent = `${clues.length} / ${state.clues.length} 條線索`;
  }
  $('#board-all').addEventListener('change', renderBoard);
  function pinClue(step) {
    if (!step.clue) return;
    const clue = { id: step.id, ch: chapter.id, title: step.clue.title, text: step.clue.text };
    if (!SD.state.addClue(clue)) return;
    const board = $('#board');
    const card = clueCard(clue);
    $('#board-empty').hidden = true;
    $('#clue-count').textContent = `${state.clues.filter((c) => $('#board-all').checked || c.ch === chapter.id).length} / ${state.clues.length} 條線索`;
    // 線索卡從任務卡「飛」到證據板（Flip）；小螢幕看不到證據板時只做淡入
    const anchor = $('#step-card');
    if (canAnimate() && window.Flip && lg.matches) {
      anchor.appendChild(card);
      card.style.position = 'absolute';
      const flipState = Flip.getState(card);
      card.style.position = '';
      board.prepend(card);
      Flip.from(flipState, { duration: 0.9, ease: 'power2.inOut', absolute: true, scale: true });
    } else {
      board.prepend(card);
      if (canAnimate()) gsap.from(card, { y: -20, opacity: 0, duration: 0.5 });
    }
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

  function renderStory(step) {
    const key = stepKey(step);
    const done = stepDone(step);
    const sceneSrc = SD.media.scene(chapter, stepIndex);
    const scene = sceneSrc ? `<figure class="scene"><img src="${sceneSrc}" alt="" width="960" height="540" /></figure>` : '';
    card.innerHTML = `${scene}<p class="eyebrow">第 ${chapter.id} 章 · ${esc(chapter.title)}</p><div id="lines" class="mt-4 flex flex-col gap-4"></div><div class="mt-4 flex justify-end"><button type="button" id="btn-continue" class="btn-primary btn-sm">繼續</button></div>`;
    const lines = $('#lines', card);
    let i = 0;
    const btn = $('#btn-continue', card);
    let typing = null;
    function reveal(instant) {
      if (i >= step.lines.length) return;
      const line = step.lines[i++];
      const sp = speaker(line.who);
      const row = el('div', 'flex items-start gap-3');
      if (sp.img) row.innerHTML = `<img src="${sp.img}" alt="" width="48" height="48" class="size-12 shrink-0 rounded-full border border-ink-600 object-cover" />`;
      const bubble = el('div', line.who === 'narrator' ? 'flex-1 italic leading-7 text-ink-300' : 'speech flex-1');
      if (sp.name) bubble.innerHTML = `<p class="text-xs font-bold text-amber">${esc(sp.name)}<span class="ml-2 font-normal text-ink-300">${esc(sp.role)}</span></p>`;
      const p = el('p', 'mt-1');
      bubble.appendChild(p);
      row.appendChild(bubble);
      lines.appendChild(row);
      if (canAnimate()) gsap.from(row, { y: 10, opacity: 0, duration: 0.3 });
      // 打字機效果；尊重 reduced-motion
      if (instant || reduce) { p.textContent = line.text; finish(); return; }
      let k = 0;
      typing = setInterval(() => { p.textContent = line.text.slice(0, ++k); if (k >= line.text.length) finish(); }, 22);
      function finish() { clearInterval(typing); typing = null; p.textContent = line.text; if (i >= step.lines.length) { btn.textContent = nextLabel(); if (!done) SD.state.markStep(chapter.id, key); updateNav(); } }
    }
    btn.addEventListener('click', () => {
      if (typing) { const last = lines.lastElementChild.querySelector('p:last-child'); clearInterval(typing); typing = null; last.textContent = step.lines[i - 1].text; if (i >= step.lines.length) { btn.textContent = nextLabel(); SD.state.markStep(chapter.id, key); updateNav(); } return; }
      if (i >= step.lines.length) { next(); return; }
      reveal(false);
    });
    if (done) { while (i < step.lines.length) reveal(true); } else reveal(false);
  }

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
    wrap.innerHTML = `<p class="text-xs text-ink-300">相關資料表（點開看欄位，點欄位插入編輯器）</p><div class="mt-1 flex flex-wrap gap-2">${tables.map((t) => `<button type="button" class="chip min-h-9 cursor-pointer font-mono text-teal hover:border-amber" data-table="${t}" aria-expanded="false">${esc(t)}</button>`).join('')}</div><div id="task-cols" class="mt-2 flex flex-wrap gap-1.5" hidden></div>`;
    const cols = $('#task-cols', wrap);
    wrap.addEventListener('click', (e) => {
      const tb = e.target.closest('[data-table]');
      if (tb) {
        const open = tb.getAttribute('aria-expanded') === 'true';
        wrap.querySelectorAll('[data-table]').forEach((b) => b.setAttribute('aria-expanded', 'false'));
        if (open) { cols.hidden = true; return; }
        tb.setAttribute('aria-expanded', 'true');
        cols.hidden = false;
        cols.innerHTML = s.byTable[tb.dataset.table].map((c) => `<button type="button" class="inline-flex items-center gap-1 rounded border border-ink-700 bg-ink-950/60 px-2 py-1 font-mono text-xs text-paper hover:border-amber" data-col="${esc(c.name)}">${c.pk ? SD.schemaDoc.keyIcon('pk') : SD.schemaDoc.fk(tb.dataset.table, c.name) || c.fk ? SD.schemaDoc.keyIcon('fk') : ''}${esc(c.name)}</button>`).join('');
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
      <div id="task-tables" class="mt-3" hidden></div>
      <div id="feedback" class="mt-3" aria-live="assertive"></div>
      <div class="mt-4 flex flex-wrap gap-2">
        <button type="button" id="btn-goto-editor" class="btn-primary btn-sm lg:hidden">前往查詢區寫 SQL →</button>
        <button type="button" id="btn-hint" class="btn-ghost btn-sm">💡 提示（${Math.min(hintsUsed, 3)}/3）</button>
      </div>
      <ol id="hints" class="mt-3 flex flex-col gap-2"></ol>
      <p class="mt-4 text-xs text-ink-300">在查詢區執行 SQL 後會自動檢核。不看提示 3 星、看第 1～2 個提示 2 星、看解答 1 星。</p>`;
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
    if (step.starter) editor.value = step.starter;
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
      <div id="feedback" class="mt-3" aria-live="assertive"></div>`;
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
        SD.state.addClue({ id: step.id, ch: chapter.id, title: '結案', text: `${v}。${step.success.split('。')[0]}。` });
        renderBoard();
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
    populateSelect();
    document.title = `第 ${ch.id} 章 ${ch.title} · SQL 偵探事務所`;
    renderBoard();
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
    intro.hidden = false;
    main.hidden = true;
    $('#pane-tabs').hidden = true;
    window.scrollTo({ top: 0, behavior: 'instant' });
    renderProgress();
    $('#btn-intro-start', intro).addEventListener('click', () => { renderStep(); maybeStartCoach(); });
    const restart = $('#btn-intro-restart', intro);
    if (restart) restart.addEventListener('click', () => { stepIndex = 0; renderStep(); maybeStartCoach(); });
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
  function maybeStartCoach() {
    try { if (localStorage.getItem(COACH_KEY)) return; } catch (e) { return; }
    const steps = lg.matches
      ? [
        { target: '#step-card', text: '左邊是劇情、教學與任務。看完一段就按「下一步」，任務會告訴你要查什麼。' },
        { target: '#editor-card', text: '中間是查詢區。在這裡輸入 SQL，按 Ctrl + Enter 執行，結果會自動檢核並顯示在下方。' },
        { target: '#pane-board .card', text: '右邊是證據板。每完成一個任務，線索就會釘在這裡，最後靠它們指認兇手。' },
      ]
      : [{ target: '#pane-tabs', text: '手機上用這三個分頁切換「劇情、查詢、證據板」。任務卡上的按鈕會直接帶你到查詢區。' }];
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
      body.addEventListener('click', (e) => { const b = e.target.closest('[data-insert]'); if (b) { setEditor(b.dataset.insert); $('#dlg-cheatsheet').close(); } });
    }
    $('#dlg-cheatsheet').showModal();
  });

  // ---------------------------------------------------------------------------
  // 啟動
  // ---------------------------------------------------------------------------
  async function boot() {
    renderBoard();
    renderBadges();
    const { ch, step } = parseHash();
    const start = (ch && unlocked(ch)) ? ch : (chapters.find((c) => unlocked(c) && !isDone(c)) || chapters[0]);
    loadChapter(start, ch && unlocked(ch) ? step : undefined);
    resultsEl.appendChild($('#tpl-loading').content.cloneNode(true));
    try {
      await SD.db.init(SD.state.loadDb());
      dbReady = true;
      $('#db-status').textContent = '資料庫已就緒：chaogang_police（18 張表）。按 Ctrl + Enter 執行。';
      resultsEl.innerHTML = '';
      resultsEl.appendChild($('#tpl-results-empty').content.cloneNode(true));
      renderSchemaList();
      renderTaskTables();
    } catch (e) {
      $('#db-status').textContent = '資料庫載入失敗：' + e.message;
      resultsEl.innerHTML = `<div class="card border-danger/50 text-danger">無法載入 sql.js（${esc(e.message)}）。請確認瀏覽器支援 WebAssembly，或重新整理。</div>`;
    }
  }
  window.addEventListener('hashchange', () => { const { ch, step } = parseHash(); if (ch && unlocked(ch) && (ch !== chapter || (step !== undefined && step !== stepIndex))) loadChapter(ch, step); });
  boot();
})();
