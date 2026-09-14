#!/usr/bin/env node
/**
 * 任務檢核測試：確認每個任務的標準解答能過關、scripts/task-cases.json 裡的
 * 「應該過」與「不該過」寫法判定正確，並對章節內容做幾項一致性檢查。
 * 執行：npm run test:tasks（改動資料、任務或 check.js 後都要跑）
 *
 * task-cases.json 格式：
 *   { "c2-t4": { "pass": ["SQL", ...], "fail": ["SQL", ...] } }
 *   fail 的元素也可寫成 { "sql": "...", "msg": "訊息需包含的片段" }
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
R('js/chapters/expect.js');
const CASES = JSON.parse(fs.readFileSync(path.join(__dirname, 'task-cases.json'), 'utf8'));

const strip = (html) => String(html || '').replace(/<[^>]+>/g, '').replace(/&gt;/g, '>').replace(/&lt;/g, '<').replace(/&amp;/g, '&').replace(/&quot;/g, '"').replace(/&#39;/g, "'").trim();
const solutionOf = (step) => strip(step.hints && step.hints[2]);

let passed = 0, failed = 0;
const ok = (msg) => { passed++; };
const bad = (msg) => { failed++; console.log(`✗ ${msg}`); };

async function evaluate(step, sql) {
  const results = SD.db.run(sql);
  return SD.check.evaluate(step, results, sql, SD.expect[step.id]);
}

/** 重置資料庫並重播該章此步驟之前所有任務的標準解答（第 5 章的 DDL / DML 任務彼此依賴） */
function replayBefore(chapter, step) {
  SD.db.reset();
  for (const s of chapter.steps) {
    if (s === step) break;
    if (s.type === 'task') SD.db.run(solutionOf(s));
  }
}

(async () => {
  await SD.db.init();
  const allSteps = [];
  for (const ch of SD.chapters) for (const s of ch.steps) allSteps.push({ ch, step: s });
  const tasks = allSteps.filter((x) => x.step.type === 'task');

  // ---- 1. 標準解答必須過關 ----
  for (const ch of SD.chapters) {
    SD.db.reset();
    for (const step of ch.steps) {
      if (step.type !== 'task') continue;
      const sol = solutionOf(step);
      const r = await evaluate(step, sol);
      r.ok ? ok() : bad(`${step.id} 標準解答未過關：${r.message}\n    ${sol}`);
    }
  }

  // ---- 2. 案例：應過／不應過 ----
  for (const [id, spec] of Object.entries(CASES)) {
    const found = tasks.find((x) => x.step.id === id);
    if (!found) { bad(`task-cases.json 有未知任務 ${id}`); continue; }
    const { ch, step } = found;
    for (const sql of spec.pass || []) {
      replayBefore(ch, step);
      const r = await evaluate(step, sql);
      r.ok ? ok() : bad(`${id} 應過而未過：${r.message}\n    ${sql}`);
    }
    for (const c of spec.fail || []) {
      const sql = typeof c === 'string' ? c : c.sql;
      replayBefore(ch, step);
      const r = await evaluate(step, sql);
      if (r.ok) { bad(`${id} 不應過卻過了：\n    ${sql}`); continue; }
      if (typeof c === 'object' && c.msg && !r.message.includes(c.msg)) { bad(`${id} 訊息不含「${c.msg}」，實際：${r.message}\n    ${sql}`); continue; }
      ok();
    }
  }

  // ---- 3. 內容一致性 ----
  SD.db.reset();
  const schema = SD.db.schema();
  const DIRECTION = /由[^，。]{1,3}到[^，。]{1,3}|ASC|DESC|最高|最低|最新|最舊|最大|最小|最多|最少/;
  for (let i = 0; i < allSteps.length; i++) {
    const { ch, step } = allSteps[i];
    if (step.type !== 'task') continue;
    const prompt = strip(step.prompt);
    if (!step.hints || step.hints.length < 3 || step.hints.some((h) => !h)) bad(`${step.id} 提示不足三個`);
    // 排序任務的題面必須講清楚方向
    if (step.check && step.check.ordered && /ORDER\s+BY/i.test(solutionOf(step)) && !DIRECTION.test(prompt)) bad(`${step.id} 是排序任務但題面沒寫方向：${prompt.slice(0, 60)}`);
    // 引用上一題結果時，上一題要有線索釘在板上，否則使用者離開再回來就找不到那個值
    if (/上一題|上題/.test(prompt) && !/線索板/.test(prompt)) {
      let prev = null;
      for (let j = i - 1; j >= 0; j--) if (allSteps[j].ch === ch && allSteps[j].step.type === 'task') { prev = allSteps[j].step; break; }
      if (prev && !prev.clue) bad(`${step.id} 引用上一題（${prev.id}）的結果，但 ${prev.id} 沒有 clue`);
    }
    // 題面標成 <code>欄位</code> 為 <code>'值'</code> 的字串，值必須真的存在於該欄位
    const re = /<code>([a-z_]+)<\/code>\s*為\s*<code>\\?'([^'<]+)\\?'<\/code>/g;
    let m;
    while (step.check && step.check.kind !== 'probe' && (m = re.exec(step.prompt || ''))) {
      const [, col, val] = m;
      const tablesWithCol = schema.tables.filter((t) => schema.byTable[t].some((c) => c.name === col));
      const exists = tablesWithCol.some((t) => { const q = SD.db.query(`SELECT 1 FROM "${t}" WHERE "${col}" = '${val.replace(/'/g, "''")}' LIMIT 1`); return q && q.values.length; });
      exists ? ok() : bad(`${step.id} 題面寫 ${col} = '${val}'，但沒有任何資料表的 ${col} 欄位有這個值`);
    }
  }

  console.log(`\n${passed} passed, ${failed} failed`);
  process.exit(failed ? 1 : 0);
})();
