#!/usr/bin/env node
/**
 * 任務期望值建置：讀取 js/chapters/*.js，把每個任務的「第三個提示」當作標準解答執行，
 * 正規化結果後算 SHA-256 寫入 js/chapters/expect.js。
 * 開放式答案（answer / solution 步驟）的期望值來自 scripts/answers.json。
 * 執行：npm run tasks（改動資料或章節後都要重跑）
 */
const path = require('path');
const fs = require('fs');
const initSqlJs = require('sql.js');

global.window = global;
global.initSqlJs = initSqlJs;
global.crypto = require('crypto').webcrypto;
const R = (p) => require(path.join(__dirname, '..', p));
R('js/engine/seed.js');
R('js/engine/mariadb-compat.js');
R('js/engine/db.js');
R('js/game/cast.js');
R('js/game/check.js');
for (const f of fs.readdirSync(path.join(__dirname, '..', 'js', 'chapters')).filter((f) => /^ch\d+\.js$/.test(f)).sort()) R('js/chapters/' + f);
const ANSWERS = JSON.parse(fs.readFileSync(path.join(__dirname, 'answers.json'), 'utf8'));

const decode = (html) => html.replace(/<[^>]+>/g, '').replace(/&gt;/g, '>').replace(/&lt;/g, '<').replace(/&amp;/g, '&').replace(/&quot;/g, '"').replace(/&#39;/g, "'").trim();

(async () => {
  await SD.db.init();
  const expect = {};
  let problems = 0;
  for (const ch of SD.chapters) {
    SD.db.reset();
    for (const step of ch.steps) {
      if (step.type === 'answer' || step.type === 'solution') {
        const ans = ANSWERS[step.id];
        if (!ans) { console.log(`缺少答案：${step.id}`); problems++; continue; }
        expect[step.id] = { hash: await SD.check.sha256(ans.trim()) };
        continue;
      }
      if (step.type !== 'task') continue;
      const sol = decode(step.hints[2] || '');
      if (!sol) { console.log(`缺少解答：${step.id}`); problems++; continue; }
      const results = SD.db.run(sol);
      const err = results.find((r) => r.type === 'error');
      if (err) { console.log(`解答執行失敗 ${step.id}: ${err.title} ${err.text}\n   ${sol}`); problems++; continue; }
      const check = step.check;
      if (check.kind === 'regex') {
        if (!new RegExp(check.pattern, 'i').test(sol)) { console.log(`regex 不符 ${step.id}`); problems++; }
        continue;
      }
      if (check.kind === 'probe') {
        const q = SD.db.query(check.probe);
        if (!q) { console.log(`probe 失敗 ${step.id}`); problems++; continue; }
        const n = SD.check.normalizeResult(q.columns, q.values, { cols: null, ordered: true });
        expect[step.id] = { hash: await SD.check.sha256(n.text), rows: q.values.length };
        continue;
      }
      const last = [...results].reverse().find((r) => r.type === 'result');
      if (!last) { console.log(`解答沒有結果集 ${step.id}`); problems++; continue; }
      if (check.kind === 'value') {
        if (!last.values.length) { console.log(`解答結果為空 ${step.id}`); problems++; continue; }
        expect[step.id] = { hash: await SD.check.sha256(SD.check.cell(last.values[0][0])), rows: 1 };
        continue;
      }
      const n = SD.check.normalizeResult(last.columns, last.values, check);
      if (!n.ok) { console.log(`欄位投影失敗 ${step.id}: ${n.error}`); problems++; continue; }
      if (n.rows === 0) { console.log(`警告：解答結果 0 筆 ${step.id}`); }
      expect[step.id] = { hash: await SD.check.sha256(n.text), rows: n.rows };
    }
  }
  const out = `// 由 scripts/build-tasks.js 產生，請勿手動編輯。執行 npm run tasks 重新產生。\nSD.expect = ${JSON.stringify(expect, null, 1)};\n`;
  fs.writeFileSync(path.join(__dirname, '..', 'js', 'chapters', 'expect.js'), out);
  const total = Object.keys(expect).length;
  console.log(`${total} 個期望值已寫入 js/chapters/expect.js${problems ? `，${problems} 個問題` : ''}`);
  process.exit(problems ? 1 : 0);
})();
