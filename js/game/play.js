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
    table.innerHTML = `<thead><tr>${res.columns.map((c) => `<th scope="col">${esc(c)}</th>`).join('')}</tr></thead>`;
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
  // 資料表側欄
  // ---------------------------------------------------------------------------
  function renderSchemaList() {
    if (!dbReady) return;
    const list = $('#schema-list');
    const s = SD.db.schema();
    list.innerHTML = '';
    for (const t of s.tables) {
      const d = el('details', 'rounded-lg border border-ink-800');
      d.innerHTML = `<summary class="flex min-h-11 cursor-pointer items-center justify-between px-3 py-2 font-mono text-teal"><span>${esc(t)}</span><span class="text-xs text-ink-300">${s.byTable[t].length} 欄</span></summary>`;
      const ul = el('ul', 'flex flex-col border-t border-ink-800 px-2 py-1');
      for (const c of s.byTable[t]) {
        const li = el('li');
        const b = el('button', 'flex min-h-9 w-full items-center justify-between gap-2 rounded px-2 text-left font-mono text-xs hover:bg-ink-800', `<span>${c.pk ? '🔑 ' : ''}${esc(c.name)}</span><span class="text-ink-300">${esc((c.type || '').split(' ')[0].toLowerCase())}</span>`);
        b.type = 'button';
        b.title = `插入 ${c.name}`;
        b.addEventListener('click', () => insertAtCursor(c.name));
        li.appendChild(b);
        ul.appendChild(li);
      }
      const actions = el('div', 'flex gap-1 border-t border-ink-800 p-2');
      const b1 = el('button', 'btn-ghost btn-sm flex-1', 'DESCRIBE'); b1.type = 'button';
      b1.addEventListener('click', () => { setEditor(`DESCRIBE ${t};`); runSql(); });
      const b2 = el('button', 'btn-ghost btn-sm flex-1', '看 5 筆'); b2.type = 'button';
      b2.addEventListener('click', () => { setEditor(`SELECT * FROM ${t} LIMIT 5;`); runSql(); });
      actions.append(b1, b2);
      d.append(ul, actions);
      list.appendChild(d);
    }
  }

  // ---------------------------------------------------------------------------
  // 證據板與徽章
  // ---------------------------------------------------------------------------
  function clueCard(clue) {
    const c = el('article', 'clue-card');
    c.innerHTML = `<p class="eyebrow text-[0.65rem] text-teal">第 ${clue.ch} 章 · 線索</p><h4 class="mt-1 font-bold">${esc(clue.title)}</h4><p class="mt-1 leading-6 text-ink-300">${esc(clue.text)}</p>`;
    return c;
  }
  function renderBoard() {
    const board = $('#board');
    board.innerHTML = '';
    const all = $('#board-all').checked;
    const clues = state.clues.filter((c) => all || !chapter || c.ch === chapter.id).reverse();
    for (const c of clues) board.appendChild(clueCard(c));
    $('#board-empty').hidden = clues.length > 0;
    $('#board-empty').textContent = state.clues.length && !clues.length ? '本章還沒有線索。勾選上方可看其他章節。' : '完成任務後，線索會釘在這裡。';
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
    card.innerHTML = `<p class="eyebrow">第 ${chapter.id} 章 · ${esc(chapter.title)}</p><div id="lines" class="mt-4 flex flex-col gap-4"></div><div class="mt-4 flex justify-end"><button type="button" id="btn-continue" class="btn-primary btn-sm">繼續</button></div>`;
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
      function finish() { clearInterval(typing); typing = null; p.textContent = line.text; if (i >= step.lines.length) { btn.textContent = '下一步 →'; if (!done) SD.state.markStep(chapter.id, key); updateNav(); } }
    }
    btn.addEventListener('click', () => {
      if (typing) { const last = lines.lastElementChild.querySelector('p:last-child'); clearInterval(typing); typing = null; last.textContent = step.lines[i - 1].text; if (i >= step.lines.length) { btn.textContent = '下一步 →'; SD.state.markStep(chapter.id, key); updateNav(); } return; }
      if (i >= step.lines.length) { next(); return; }
      reveal(false);
    });
    if (done) { while (i < step.lines.length) reveal(true); } else reveal(false);
  }

  function renderLesson(step) {
    card.innerHTML = `<p class="eyebrow">教學 · ${esc(chapter.title)}</p><h2 class="mt-2 text-2xl font-black">${esc(step.title)}</h2><div class="prose-sd mt-4">${step.body}</div>`;
    enhanceCode(card);
    SD.state.markStep(chapter.id, stepKey(step));
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
      <div id="feedback" class="mt-3" aria-live="assertive"></div>
      <div class="mt-4 flex flex-wrap gap-2">
        <button type="button" id="btn-hint" class="btn-ghost btn-sm">💡 提示（${Math.min(hintsUsed, 3)}/3）</button>
        <button type="button" id="btn-goto-editor" class="btn-ghost btn-sm lg:hidden">前往查詢區 →</button>
      </div>
      <ol id="hints" class="mt-3 flex flex-col gap-2"></ol>
      <p class="mt-4 text-xs text-ink-300">在查詢區執行 SQL 後會自動檢核。不看提示 3 星、看第 1～2 個提示 2 星、看解答 1 星。</p>`;
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
      showPane('story');
    } else {
      fb.innerHTML = `<div class="rounded-xl border border-amber/40 bg-amber/5 p-3 text-sm leading-6"><span class="font-bold text-amber">還差一點：</span>${esc(result.message)}</div>`;
    }
  }

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
    renderProgressDots();
    updateNav();
    showPane('story');
    location.hash = `${chapter.slug}/${stepIndex}`;
  }

  function renderProgressDots() {
    const wrap = $('#chapter-progress');
    wrap.innerHTML = chapter.steps.map((s, i) => `<span class="dot ${stepDone(s) ? 'done' : ''} ${i === stepIndex ? 'cur' : ''}" title="步驟 ${i + 1}"></span>`).join('');
    $('#step-count').textContent = `${stepIndex + 1} / ${chapter.steps.length}`;
  }

  function updateNav() {
    const step = chapter.steps[stepIndex];
    const last = stepIndex === chapter.steps.length - 1;
    $('#btn-prev').disabled = stepIndex === 0;
    const blocked = needsCompletion(step) && !stepDone(step);
    $('#btn-next').disabled = blocked;
    $('#btn-next').textContent = last ? (blocked ? '完成本步驟' : '結束本章 ✔') : blocked ? '完成任務後繼續' : '下一步 →';
    renderProgressDots();
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

  function loadChapter(ch, step) {
    chapter = ch;
    const p = prog();
    stepIndex = step !== undefined ? Math.min(step, ch.steps.length - 1) : Math.min(p.step || 0, ch.steps.length - 1);
    populateSelect();
    document.title = `第 ${ch.id} 章 ${ch.title} · SQL 偵探事務所`;
    renderBoard();
    renderStep();
    if (ch.resettable) addChapterResetButton(); else removeChapterResetButton();
  }
  function addChapterResetButton() {
    if ($('#btn-reset-ch')) return;
    const b = el('button', 'btn-ghost btn-sm', '重置本章資料表'); b.type = 'button'; b.id = 'btn-reset-ch';
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
      renderSchemaList();
    } catch (e) {
      $('#db-status').textContent = '資料庫載入失敗：' + e.message;
      resultsEl.innerHTML = `<div class="card border-danger/50 text-danger">無法載入 sql.js（${esc(e.message)}）。請確認瀏覽器支援 WebAssembly，或重新整理。</div>`;
    }
  }
  window.addEventListener('hashchange', () => { const { ch, step } = parseHash(); if (ch && unlocked(ch) && (ch !== chapter || (step !== undefined && step !== stepIndex))) loadChapter(ch, step); });
  boot();
})();
