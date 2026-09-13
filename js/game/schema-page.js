/* 資料表總覽頁：從實際資料庫讀出結構，加上 schema-doc.js 的中文說明與關聯 */
(function () {
  'use strict';
  const esc = (s) => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');

  // 欄位說明與關聯來自 schema-doc.js，與 play.html 共用同一份
  const DOC = SD.schemaDoc.tables;

  async function boot() {
    const root = document.getElementById('tables');
    await SD.db.init();
    const s = SD.db.schema();
    root.innerHTML = s.tables.map((t) => {
      const doc = DOC[t] || { zh: '' };
      const rows = s.byTable[t].map((c) => {
        const fk = SD.schemaDoc.fk(t, c.name) || c.fk;
        const icon = c.pk ? SD.schemaDoc.keyIcon('pk') : fk ? SD.schemaDoc.keyIcon('fk') : '';
        const note = fk ? `<a href="#t-${esc(fk.table)}" class="font-mono text-teal underline decoration-dotted hover:text-amber">→ ${esc(fk.table)}.${esc(fk.column)}</a>${fk.note ? `（${esc(fk.note)}）` : ''}` : esc(SD.schemaDoc.column(t, c.name));
        return `<tr><td class="py-1 pr-3 font-mono text-teal"><span class="inline-flex items-center gap-1">${icon}${esc(c.name)}</span></td><td class="py-1 pr-3 text-ink-300">${esc((c.type || '').split(' ')[0].toLowerCase() || 'text')}</td><td class="py-1 text-sm">${note}</td></tr>`;
      }).join('');
      const count = SD.db.query(`SELECT COUNT(*) FROM "${t}"`).values[0][0];
      return `<article class="card scroll-mt-24 p-4" id="t-${t}">
        <div class="flex items-start justify-between gap-2">
          <div><h2 class="font-mono text-lg font-bold text-amber">${esc(t)}</h2><p class="text-sm text-ink-300">${esc(doc.zh)} · ${count} 筆</p></div>
          <button type="button" class="btn-ghost btn-sm" data-sample="${esc(t)}">看範例</button>
        </div>
        <table class="mt-3 w-full text-sm"><thead><tr class="text-left text-xs text-ink-300"><th class="pb-1">欄位</th><th class="pb-1">型別</th><th class="pb-1">說明</th></tr></thead><tbody>${rows}</tbody></table>
        <div class="sample mt-3" hidden></div>
      </article>`;
    }).join('');
    root.addEventListener('click', (e) => {
      const b = e.target.closest('[data-sample]');
      if (!b) return;
      const t = b.dataset.sample;
      const box = document.querySelector(`#t-${t} .sample`);
      if (!box.hidden) { box.hidden = true; b.textContent = '看範例'; return; }
      const q = SD.db.query(`SELECT * FROM "${t}" LIMIT 3`);
      box.innerHTML = `<div class="overflow-x-auto rounded-lg border border-ink-700"><table class="result-table"><thead><tr>${q.columns.map((c) => `<th>${esc(c)}</th>`).join('')}</tr></thead><tbody>${q.values.map((r) => `<tr>${r.map((v) => (v === null ? '<td class="null">NULL</td>' : `<td>${esc(v)}</td>`)).join('')}</tr>`).join('')}</tbody></table></div>`;
      box.hidden = false;
      b.textContent = '收起';
    });
  }
  boot();
})();
