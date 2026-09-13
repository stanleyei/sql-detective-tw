/*
 * 任務檢核：把查詢結果正規化後做 SHA-256，與 build 時算好的期望值比對。
 * 這個檔案同時在瀏覽器與 Node（scripts/build-tasks.js）執行，因此只用兩邊都有的 API。
 */
(function () {
  'use strict';
  const root = typeof window !== 'undefined' ? window : globalThis;
  root.SD = root.SD || {};

  const ROW_SEP = '';
  const CELL_SEP = '';

  function cell(v) {
    if (v === null || v === undefined) return '∅';
    if (typeof v === 'number') {
      if (Number.isInteger(v)) return String(v);
      return String(Math.round(v * 10000) / 10000);
    }
    if (v instanceof Uint8Array) return '[blob]';
    const s = String(v).trim();
    // 數字字串與數字視為相同（例如 '3' 與 3）
    if (/^-?\d+(\.\d+)?$/.test(s)) return cell(Number(s));
    return s;
  }

  const normName = (c) => String(c).toLowerCase().replace(/^.*\./, '').replace(/`/g, '').trim();

  /**
   * 依 spec 投影欄位並正規化成單一字串。
   * @returns {{ ok: boolean, text?: string, error?: string, rows?: number }}
   */
  function normalizeResult(columns, values, spec) {
    let idx;
    if (spec && Array.isArray(spec.cols) && spec.cols.length) {
      const lower = columns.map(normName);
      idx = [];
      for (const c of spec.cols) {
        const i = lower.indexOf(normName(c));
        if (i < 0) return { ok: false, error: `結果需要包含欄位「${c}」，目前的欄位是：${columns.join('、')}` };
        idx.push(i);
      }
    } else idx = columns.map((_, i) => i);
    let rows = values.map((r) => idx.map((i) => cell(r[i])).join(CELL_SEP));
    if (!(spec && spec.ordered)) rows = rows.slice().sort();
    return { ok: true, text: rows.join(ROW_SEP), rows: values.length };
  }

  async function sha256(str) {
    const data = new TextEncoder().encode(str);
    const subtle = (root.crypto && root.crypto.subtle) || (typeof require === 'function' ? require('crypto').webcrypto.subtle : null);
    const buf = await subtle.digest('SHA-256', data);
    return Array.from(new Uint8Array(buf)).map((b) => b.toString(16).padStart(2, '0')).join('');
  }

  /** 取出 run() 結果中最後一個成功的結果集 */
  function lastResult(results) {
    for (let i = results.length - 1; i >= 0; i--) if (results[i].type === 'result') return results[i];
    return null;
  }

  /**
   * @param {object} step 任務步驟（含 check）
   * @param {Array} results SD.db.run 的回傳
   * @param {string} sql 學生輸入的原始 SQL
   * @param {object} expect SD.expect[step.id]
   * @returns {Promise<{ok: boolean, message: string}>}
   */
  async function evaluate(step, results, sql, expect) {
    const check = step.check;
    if (results.some((r) => r.type === 'error')) return { ok: false, message: '查詢有錯誤，先修正錯誤再送出。' };
    if (!expect && check.kind !== 'regex') return { ok: false, message: '找不到這個任務的期望值（expect.js 未建置）。' };
    if (check.kind === 'regex') {
      const re = new RegExp(check.pattern, 'i');
      const stmts = root.SD.compat.splitStatements(sql);
      return stmts.some((s) => re.test(s)) ? { ok: true, message: '' } : { ok: false, message: '指令不對，看看提示。' };
    }
    if (check.kind === 'probe') {
      const q = root.SD.db.query(check.probe);
      if (!q) return { ok: false, message: '還沒達成目標：資料表或欄位尚未建立。' };
      const n = normalizeResult(q.columns, q.values, { cols: null, ordered: true });
      const h = await sha256(n.text);
      return h === expect.hash ? { ok: true, message: '' } : { ok: false, message: '資料表目前的狀態與目標不同。用 SELECT 看看內容，或按「重置本章」從頭來。' };
    }
    const last = lastResult(results);
    if (!last) return { ok: false, message: '這個任務需要查詢出結果。' };
    if (last.truncated) return { ok: false, message: '結果超過 500 筆，請加上條件縮小範圍。' };
    if (check.kind === 'value') {
      if (!last.values.length) return { ok: false, message: '查詢沒有回傳任何資料。' };
      const h = await sha256(cell(last.values[0][0]));
      return h === expect.hash ? { ok: true, message: '' } : { ok: false, message: '答案不對。檢查條件是否正確，或看看提示。' };
    }
    // result
    const n = normalizeResult(last.columns, last.values, check);
    if (!n.ok) return { ok: false, message: n.error };
    const h = await sha256(n.text);
    if (h === expect.hash) return { ok: true, message: '' };
    let msg = '結果不符。';
    if (expect.rows !== undefined && n.rows !== expect.rows) msg += `你的結果有 ${n.rows} 筆，預期 ${expect.rows} 筆。`;
    else if (check.ordered) msg += '筆數正確但順序不同，檢查 ORDER BY。';
    else msg += '筆數正確但內容不同，檢查選取的欄位與條件。';
    return { ok: false, message: msg };
  }

  async function checkAnswer(text, expect) {
    const h = await sha256(String(text).trim());
    return h === expect.hash;
  }

  root.SD.check = { normalizeResult, sha256, evaluate, checkAnswer, cell };
})();
