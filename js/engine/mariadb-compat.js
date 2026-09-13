/*
 * MariaDB 相容層
 *
 * 瀏覽器端只有 SQLite（sql.js）可用，但課程以 MariaDB 為基準，因此在這裡做三件事：
 *  1. 註冊 MariaDB 常用函數（日期、字串、數學、控制流程、聚合）。
 *  2. 在執行前把 MariaDB 專有語法改寫成 SQLite 能接受的形式（AUTO_INCREMENT、SHOW、DESCRIBE、
 *     INTERVAL、GROUP_CONCAT ... SEPARATOR、ON DUPLICATE KEY UPDATE 等）。
 *  3. 把 SQLite 的英文錯誤訊息翻成白話中文，並區分「MariaDB 也會這樣報」與「模擬環境限制」。
 *
 * 所有改寫都建立在 tokenize() 產生的 token 串上，而不是直接對原始字串做正則替換，
 * 這樣字串常值、註解、反引號識別字裡的內容才不會被誤改。
 */
(function () {
  'use strict';
  window.SD = window.SD || {};

  // ---------------------------------------------------------------------------
  // Tokenizer
  // ---------------------------------------------------------------------------
  const UNIT_WORDS = ['MICROSECOND', 'SECOND', 'MINUTE', 'HOUR', 'DAY', 'WEEK', 'MONTH', 'QUARTER', 'YEAR'];

  /**
   * 將 SQL 切成 token：{ type, value, upper }
   * type: ws | comment | string | ident | quoted(反引號或雙引號) | number | op | word
   */
  function tokenize(sql) {
    const tokens = [];
    let i = 0;
    const n = sql.length;
    const push = (type, value) => tokens.push({ type, value, upper: type === 'word' ? value.toUpperCase() : null });
    while (i < n) {
      const ch = sql[i];
      const next = sql[i + 1];
      if (/\s/.test(ch)) {
        let j = i; while (j < n && /\s/.test(sql[j])) j++;
        push('ws', sql.slice(i, j)); i = j; continue;
      }
      if (ch === '-' && next === '-') {
        let j = sql.indexOf('\n', i); if (j < 0) j = n;
        push('comment', sql.slice(i, j)); i = j; continue;
      }
      if (ch === '#') {
        // MariaDB 的 # 單行註解，SQLite 不認得，改成 --
        let j = sql.indexOf('\n', i); if (j < 0) j = n;
        push('comment', '--' + sql.slice(i + 1, j)); i = j; continue;
      }
      if (ch === '/' && next === '*') {
        let j = sql.indexOf('*/', i + 2); j = j < 0 ? n : j + 2;
        push('comment', sql.slice(i, j)); i = j; continue;
      }
      if (ch === "'" || ch === '"') {
        // MariaDB 的雙引號預設是字串，統一轉成單引號字串；同時處理反斜線跳脫
        const q = ch; let j = i + 1; let out = '';
        while (j < n) {
          const c = sql[j];
          if (c === '\\' && j + 1 < n) {
            const e = sql[j + 1];
            const map = { n: '\n', t: '\t', r: '\r', '0': '\0', '\\': '\\', "'": "'", '"': '"', '%': '\\%', _: '\\_' };
            out += map[e] !== undefined ? map[e] : e; j += 2; continue;
          }
          if (c === q) {
            if (sql[j + 1] === q) { out += q; j += 2; continue; }
            j++; break;
          }
          out += c; j++;
        }
        push('string', "'" + out.replace(/'/g, "''") + "'"); i = j; continue;
      }
      if (ch === '`') {
        let j = sql.indexOf('`', i + 1); j = j < 0 ? n : j + 1;
        push('quoted', sql.slice(i, j)); i = j; continue;
      }
      if (/[0-9]/.test(ch) || (ch === '.' && /[0-9]/.test(next || ''))) {
        let j = i; while (j < n && /[0-9a-zA-Z_.]/.test(sql[j])) j++;
        push('number', sql.slice(i, j)); i = j; continue;
      }
      if (/[A-Za-z_\u00C0-\uFFFF@]/.test(ch)) {
        let j = i; while (j < n && /[A-Za-z0-9_$\u00C0-\uFFFF@]/.test(sql[j])) j++;
        push('word', sql.slice(i, j)); i = j; continue;
      }
      const three = sql.slice(i, i + 3);
      const two = sql.slice(i, i + 2);
      if (three === '<=>') { push('op', three); i += 3; continue; }
      if (['<=', '>=', '<>', '!=', '||', '&&', ':=', '<<', '>>'].includes(two)) { push('op', two); i += 2; continue; }
      push('op', ch); i++;
    }
    return tokens;
  }

  const join = (tokens) => tokens.map((t) => t.value).join('');
  const isWord = (t, w) => t && t.type === 'word' && t.upper === w;
  const isOp = (t, v) => t && t.type === 'op' && t.value === v;
  const significant = (tokens) => tokens.filter((t) => t.type !== 'ws' && t.type !== 'comment');

  /** 找到與 tokens[openIdx]（'('）配對的 ')' 索引 */
  function matchParen(tokens, openIdx) {
    let depth = 0;
    for (let i = openIdx; i < tokens.length; i++) {
      if (isOp(tokens[i], '(')) depth++;
      else if (isOp(tokens[i], ')')) { depth--; if (depth === 0) return i; }
    }
    return -1;
  }
  /** 反向找到與 tokens[closeIdx]（')'）配對的 '(' 索引 */
  function matchParenBack(tokens, closeIdx) {
    let depth = 0;
    for (let i = closeIdx; i >= 0; i--) {
      if (isOp(tokens[i], ')')) depth++;
      else if (isOp(tokens[i], '(')) { depth--; if (depth === 0) return i; }
    }
    return -1;
  }
  function prevSig(tokens, i) { for (let j = i - 1; j >= 0; j--) if (tokens[j].type !== 'ws' && tokens[j].type !== 'comment') return j; return -1; }
  function nextSig(tokens, i) { for (let j = i + 1; j < tokens.length; j++) if (tokens[j].type !== 'ws' && tokens[j].type !== 'comment') return j; return -1; }

  /** 以最外層的分號切割成多個語句（回傳原始字串陣列） */
  function splitStatements(sql) {
    const tokens = tokenize(sql);
    const out = []; let cur = [];
    for (const t of tokens) {
      if (isOp(t, ';')) { const s = join(cur).trim(); if (s) out.push(s); cur = []; }
      else cur.push(t);
    }
    const last = join(cur).trim(); if (last) out.push(last);
    return out;
  }

  // ---------------------------------------------------------------------------
  // 函數註冊
  // ---------------------------------------------------------------------------
  const pad2 = (v) => String(v).padStart(2, '0');
  const WEEKDAYS = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
  const MONTHS = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];

  /** 解析 'YYYY-MM-DD'、'YYYY-MM-DD HH:MM[:SS]'、'HH:MM:SS' 為本地 Date（時間部分缺省視為 00:00:00） */
  function parseDT(v) {
    if (v === null || v === undefined) return null;
    if (v instanceof Date) return v;
    const s = String(v).trim();
    let m = s.match(/^(\d{4})-(\d{1,2})-(\d{1,2})(?:[ T](\d{1,2}):(\d{1,2})(?::(\d{1,2})(?:\.\d+)?)?)?$/);
    if (m) return new Date(+m[1], +m[2] - 1, +m[3], +(m[4] || 0), +(m[5] || 0), +(m[6] || 0));
    m = s.match(/^(\d{4})(\d{2})(\d{2})$/);
    if (m) return new Date(+m[1], +m[2] - 1, +m[3]);
    m = s.match(/^(\d{1,2}):(\d{1,2})(?::(\d{1,2}))?$/);
    if (m) return new Date(1970, 0, 1, +m[1], +m[2], +(m[3] || 0));
    return null;
  }
  const hasTime = (v) => /\d:\d/.test(String(v));
  const fmtDate = (d) => `${d.getFullYear()}-${pad2(d.getMonth() + 1)}-${pad2(d.getDate())}`;
  const fmtTime = (d) => `${pad2(d.getHours())}:${pad2(d.getMinutes())}:${pad2(d.getSeconds())}`;
  const fmtDT = (d) => `${fmtDate(d)} ${fmtTime(d)}`;
  const nowDT = () => new Date();

  function dateFormat(v, fmt) {
    const d = parseDT(v); if (!d || fmt === null) return null;
    const h12 = d.getHours() % 12 === 0 ? 12 : d.getHours() % 12;
    const doy = Math.floor((d - new Date(d.getFullYear(), 0, 1)) / 86400000) + 1;
    const map = {
      Y: d.getFullYear(), y: String(d.getFullYear()).slice(2), m: pad2(d.getMonth() + 1), c: d.getMonth() + 1,
      d: pad2(d.getDate()), e: d.getDate(), H: pad2(d.getHours()), k: d.getHours(), h: pad2(h12), I: pad2(h12), l: h12,
      i: pad2(d.getMinutes()), s: pad2(d.getSeconds()), S: pad2(d.getSeconds()), p: d.getHours() < 12 ? 'AM' : 'PM',
      W: WEEKDAYS[d.getDay()], a: WEEKDAYS[d.getDay()].slice(0, 3), M: MONTHS[d.getMonth()], b: MONTHS[d.getMonth()].slice(0, 3),
      j: String(doy).padStart(3, '0'), w: d.getDay(), T: fmtTime(d), D: d.getDate() + (['th', 'st', 'nd', 'rd'][(d.getDate() % 10 > 3 || Math.floor(d.getDate() % 100 / 10) === 1) ? 0 : d.getDate() % 10]),
      r: `${pad2(h12)}:${pad2(d.getMinutes())}:${pad2(d.getSeconds())} ${d.getHours() < 12 ? 'AM' : 'PM'}`, u: weekNum(d, 1), U: weekNum(d, 0), '%': '%',
    };
    return String(fmt).replace(/%(.)/g, (_, c) => (map[c] !== undefined ? map[c] : c));
  }
  function weekNum(d, mondayFirst) {
    const start = new Date(d.getFullYear(), 0, 1);
    const offset = mondayFirst ? (start.getDay() + 6) % 7 : start.getDay();
    return pad2(Math.floor((Math.floor((d - start) / 86400000) + offset) / 7));
  }
  function addInterval(v, n, unit) {
    const d = parseDT(v); if (!d || n === null) return null;
    const k = Number(n); if (Number.isNaN(k)) return null;
    const u = String(unit).toUpperCase();
    const r = new Date(d);
    if (u === 'YEAR') r.setFullYear(r.getFullYear() + k);
    else if (u === 'QUARTER') r.setMonth(r.getMonth() + 3 * k);
    else if (u === 'MONTH') r.setMonth(r.getMonth() + k);
    else if (u === 'WEEK') r.setDate(r.getDate() + 7 * k);
    else if (u === 'DAY') r.setDate(r.getDate() + k);
    else if (u === 'HOUR') r.setTime(r.getTime() + k * 3600000);
    else if (u === 'MINUTE') r.setTime(r.getTime() + k * 60000);
    else if (u === 'SECOND') r.setTime(r.getTime() + k * 1000);
    else return null;
    const timeUnit = ['HOUR', 'MINUTE', 'SECOND'].includes(u);
    return hasTime(v) || timeUnit ? fmtDT(r) : fmtDate(r);
  }
  const parseInterval = (ivl) => { const m = String(ivl).match(/^(-?[\d.]+)\|(\w+)$/); return m ? [Number(m[1]), m[2]] : null; };
  function dateDiffUnit(unit, a, b) {
    const da = parseDT(a), db = parseDT(b); if (!da || !db) return null;
    const u = String(unit).toUpperCase();
    const ms = db - da;
    if (u === 'SECOND') return Math.trunc(ms / 1000);
    if (u === 'MINUTE') return Math.trunc(ms / 60000);
    if (u === 'HOUR') return Math.trunc(ms / 3600000);
    if (u === 'DAY') return Math.trunc(ms / 86400000);
    if (u === 'WEEK') return Math.trunc(ms / (7 * 86400000));
    let months = (db.getFullYear() - da.getFullYear()) * 12 + (db.getMonth() - da.getMonth());
    if (db.getDate() < da.getDate() && months > 0) months--;
    if (db.getDate() > da.getDate() && months < 0) months++;
    if (u === 'MONTH') return months;
    if (u === 'QUARTER') return Math.trunc(months / 3);
    if (u === 'YEAR') return Math.trunc(months / 12);
    return null;
  }
  const toNum = (v) => (v === null || v === undefined ? null : Number(v));
  /** 標記「任一參數為 NULL 就回傳 NULL」（MariaDB 多數函數的行為） */
  const nul = (fn) => { fn.nullSafe = true; return fn; };

  /**
   * 以可變參數（nArg = -1）註冊函數。
   * sql.js 的 create_function 用 func.length 當參數個數，且同名重複註冊會釋放前一個函數指標，
   * 因此無法靠多次註冊做參數數量多載；把 length 改成 -1 讓 SQLite 接受任意數量的參數，
   * 再在 JS 端自行處理。
   */
  function register(db, name, fn) {
    const wrapper = function () {
      const args = Array.prototype.slice.call(arguments);
      if (fn.nullSafe && args.some((a) => a === null || a === undefined)) return null;
      return fn.apply(null, args);
    };
    Object.defineProperty(wrapper, 'length', { value: -1 });
    db.create_function(name, wrapper);
  }
  const multi = (db, name, min, max, fn) => register(db, name, fn);

  function registerFunctions(db) {
    const f = (name, fn) => register(db, name, fn);
    // ---- 日期時間 ----
    f('now', () => fmtDT(nowDT()));
    f('sysdate', () => fmtDT(nowDT()));
    f('curdate', () => fmtDate(nowDT()));
    f('curtime', () => fmtTime(nowDT()));
    f('sd_current_timestamp', () => fmtDT(nowDT()));
    f('year', nul((v) => { const d = parseDT(v); return d ? d.getFullYear() : null; }));
    f('month', nul((v) => { const d = parseDT(v); return d ? d.getMonth() + 1 : null; }));
    f('day', nul((v) => { const d = parseDT(v); return d ? d.getDate() : null; }));
    f('dayofmonth', nul((v) => { const d = parseDT(v); return d ? d.getDate() : null; }));
    f('hour', nul((v) => { const d = parseDT(v); return d ? d.getHours() : null; }));
    f('minute', nul((v) => { const d = parseDT(v); return d ? d.getMinutes() : null; }));
    f('second', nul((v) => { const d = parseDT(v); return d ? d.getSeconds() : null; }));
    f('dayofweek', nul((v) => { const d = parseDT(v); return d ? d.getDay() + 1 : null; }));
    f('weekday', nul((v) => { const d = parseDT(v); return d ? (d.getDay() + 6) % 7 : null; }));
    f('dayname', nul((v) => { const d = parseDT(v); return d ? WEEKDAYS[d.getDay()] : null; }));
    f('monthname', nul((v) => { const d = parseDT(v); return d ? MONTHS[d.getMonth()] : null; }));
    f('dayofyear', nul((v) => { const d = parseDT(v); return d ? Math.floor((d - new Date(d.getFullYear(), 0, 1)) / 86400000) + 1 : null; }));
    f('quarter', nul((v) => { const d = parseDT(v); return d ? Math.floor(d.getMonth() / 3) + 1 : null; }));
    multi(db, 'week', 1, 2, (v) => { const d = parseDT(v); return d ? Number(weekNum(d, 0)) : null; });
    f('last_day', nul((v) => { const d = parseDT(v); return d ? fmtDate(new Date(d.getFullYear(), d.getMonth() + 1, 0)) : null; }));
    f('date_format', nul(dateFormat));
    f('time_format', nul(dateFormat));
    f('sd_interval', (n, unit) => (n === null ? null : `${n}|${unit}`));
    f('date_add', nul((v, ivl) => { const p = parseInterval(ivl); return p ? addInterval(v, p[0], p[1]) : null; }));
    f('adddate', nul((v, ivl) => { const p = parseInterval(ivl); return p ? addInterval(v, p[0], p[1]) : addInterval(v, ivl, 'DAY'); }));
    f('date_sub', nul((v, ivl) => { const p = parseInterval(ivl); return p ? addInterval(v, -p[0], p[1]) : null; }));
    f('subdate', nul((v, ivl) => { const p = parseInterval(ivl); return p ? addInterval(v, -p[0], p[1]) : addInterval(v, -ivl, 'DAY'); }));
    f('sd_plus_interval', nul((v, ivl) => { const p = parseInterval(ivl); return p ? addInterval(v, p[0], p[1]) : null; }));
    f('sd_minus_interval', nul((v, ivl) => { const p = parseInterval(ivl); return p ? addInterval(v, -p[0], p[1]) : null; }));
    f('timestampadd', nul((unit, n, v) => addInterval(v, n, unit)));
    f('timestampdiff', nul(dateDiffUnit));
    f('datediff', nul((a, b) => { const da = parseDT(a), db2 = parseDT(b); if (!da || !db2) return null; return Math.round((new Date(da.getFullYear(), da.getMonth(), da.getDate()) - new Date(db2.getFullYear(), db2.getMonth(), db2.getDate())) / 86400000); }));
    f('timediff', nul((a, b) => { const da = parseDT(a), db2 = parseDT(b); if (!da || !db2) return null; let s = Math.trunc((da - db2) / 1000); const sign = s < 0 ? '-' : ''; s = Math.abs(s); return `${sign}${pad2(Math.floor(s / 3600))}:${pad2(Math.floor(s % 3600 / 60))}:${pad2(s % 60)}`; }));
    f('addtime', nul((a, b) => { const da = parseDT(a), tb = parseDT(b); if (!da || !tb) return null; const r = new Date(da.getTime() + (tb - new Date(1970, 0, 1))); return hasTime(a) && /\d{4}-/.test(a) ? fmtDT(r) : (/\d{4}-/.test(a) ? fmtDT(r) : fmtTime(r)); }));
    f('to_days', nul((v) => { const d = parseDT(v); return d ? Math.floor(d / 86400000) + 719528 : null; }));
    f('from_days', nul((n) => fmtDate(new Date((n - 719528) * 86400000))));
    multi(db, 'unix_timestamp', 0, 1, (v) => { const d = v === undefined ? nowDT() : parseDT(v); return d ? Math.floor(d / 1000) : null; });
    multi(db, 'from_unixtime', 1, 2, (n, fmt) => { if (n === null) return null; const d = new Date(Number(n) * 1000); return fmt ? dateFormat(fmtDT(d), fmt) : fmtDT(d); });
    f('str_to_date', nul((s, fmt) => {
      // 支援常見格式：%Y %m %d %H %i %s 的任意排列
      const re = String(fmt).replace(/[.*+?^${}()|[\]\\]/g, '\\$&').replace(/%Y/g, '(?<Y>\\d{4})').replace(/%m|%c/g, '(?<m>\\d{1,2})').replace(/%d|%e/g, '(?<d>\\d{1,2})').replace(/%H|%k/g, '(?<H>\\d{1,2})').replace(/%i/g, '(?<i>\\d{1,2})').replace(/%s|%S/g, '(?<s>\\d{1,2})');
      const m = String(s).match(new RegExp('^' + re + '$')); if (!m) return null; const g = m.groups || {};
      const d = new Date(+(g.Y || 2000), +(g.m || 1) - 1, +(g.d || 1), +(g.H || 0), +(g.i || 0), +(g.s || 0));
      return g.H !== undefined || g.i !== undefined ? fmtDT(d) : fmtDate(d);
    }));
    f('makedate', nul((y, doy) => fmtDate(new Date(+y, 0, +doy))));
    f('maketime', nul((h, m, s) => `${pad2(h)}:${pad2(m)}:${pad2(s)}`));
    f('sec_to_time', nul((s) => { s = Math.trunc(Number(s)); return `${pad2(Math.floor(s / 3600))}:${pad2(Math.floor(s % 3600 / 60))}:${pad2(s % 60)}`; }));
    f('time_to_sec', nul((v) => { const d = parseDT(v); return d ? d.getHours() * 3600 + d.getMinutes() * 60 + d.getSeconds() : null; }));
    f('sd_cast_date', nul((v) => { const d = parseDT(v); return d ? fmtDate(d) : null; }));
    f('sd_cast_datetime', nul((v) => { const d = parseDT(v); return d ? fmtDT(d) : null; }));

    // ---- 字串 ----
    // MariaDB 的 CONCAT 遇到 NULL 會回 NULL（SQLite 內建版本會忽略 NULL），因此覆寫
    multi(db, 'concat', 1, 12, (...a) => (a.some((x) => x === null) ? null : a.map(String).join('')));
    multi(db, 'concat_ws', 2, 12, (sep, ...a) => (sep === null ? null : a.filter((x) => x !== null).map(String).join(String(sep))));
    f('left', nul((s, n) => String(s).slice(0, Math.max(0, Number(n)))));
    f('right', nul((s, n) => (Number(n) <= 0 ? '' : String(s).slice(-Number(n)))));
    multi(db, 'mid', 2, 3, (s, pos, len) => (s === null || pos === null ? null : mysqlSubstr(String(s), Number(pos), len === undefined ? undefined : Number(len))));
    multi(db, 'locate', 2, 3, (sub, s, pos) => (sub === null || s === null ? null : String(s).indexOf(String(sub), (pos || 1) - 1) + 1));
    f('lpad', nul((s, n, p) => { s = String(s); n = Number(n); if (s.length >= n) return s.slice(0, n); if (!p) return s.slice(0, n); let out = ''; while (out.length < n - s.length) out += String(p); return out.slice(0, n - s.length) + s; }));
    f('rpad', nul((s, n, p) => { s = String(s); n = Number(n); if (s.length >= n) return s.slice(0, n); if (!p) return s.slice(0, n); let out = ''; while (out.length < n - s.length) out += String(p); return s + out.slice(0, n - s.length); }));
    f('repeat', nul((s, n) => (Number(n) <= 0 ? '' : String(s).repeat(Number(n)))));
    f('reverse', nul((s) => Array.from(String(s)).reverse().join('')));
    f('space', nul((n) => ' '.repeat(Math.max(0, Number(n)))));
    f('insert', nul((s, pos, len, ns) => { s = String(s); pos = Number(pos); if (pos < 1 || pos > s.length) return s; return s.slice(0, pos - 1) + String(ns) + s.slice(pos - 1 + Number(len)); }));
    multi(db, 'field', 2, 12, (v, ...a) => (v === null ? 0 : a.findIndex((x) => String(x) === String(v)) + 1));
    multi(db, 'elt', 2, 12, (n, ...a) => (n === null || n < 1 || n > a.length ? null : a[n - 1]));
    f('char_length', nul((s) => Array.from(String(s)).length));
    f('character_length', nul((s) => Array.from(String(s)).length));
    f('ucase', nul((s) => String(s).toUpperCase()));
    f('lcase', nul((s) => String(s).toLowerCase()));
    f('strcmp', nul((a, b) => (String(a) < String(b) ? -1 : String(a) > String(b) ? 1 : 0)));
    multi(db, 'format', 1, 2, (n, d) => { if (n === null) return null; const dec = d === undefined || d === null ? 0 : Number(d); return Number(n).toLocaleString('en-US', { minimumFractionDigits: dec, maximumFractionDigits: dec }); });
    f('substring_index', nul((s, delim, count) => { const parts = String(s).split(String(delim)); count = Number(count); if (count === 0) return ''; return count > 0 ? parts.slice(0, count).join(delim) : parts.slice(count).join(delim); }));
    f('regexp', nul((pattern, s) => { try { return new RegExp(String(pattern), 'i').test(String(s)) ? 1 : 0; } catch (e) { throw new Error('REGEXP 樣式無效：' + e.message); } }));
    f('regexp_like', nul((s, pattern) => (new RegExp(String(pattern), 'i').test(String(s)) ? 1 : 0)));
    f('regexp_replace', nul((s, pattern, rep) => String(s).replace(new RegExp(String(pattern), 'gi'), String(rep))));
    multi(db, 'regexp_substr', 2, 2, (s, pattern) => { if (s === null || pattern === null) return null; const m = String(s).match(new RegExp(String(pattern), 'i')); return m ? m[0] : null; });
    f('ascii', nul((s) => (String(s).length ? String(s).charCodeAt(0) : 0)));
    f('ord', nul((s) => (String(s).length ? String(s).codePointAt(0) : 0)));
    f('bin', nul((n) => Number(n).toString(2)));
    f('oct', nul((n) => Number(n).toString(8)));
    f('conv', nul((n, from, to) => parseInt(String(n), Number(from)).toString(Number(to)).toUpperCase()));
    f('md5', nul((s) => simpleHash(String(s), 32)));
    f('sha1', nul((s) => simpleHash(String(s), 40)));
    f('uuid', () => crypto.randomUUID());
    f('inet_aton', nul((s) => String(s).split('.').reduce((a, b) => a * 256 + Number(b), 0)));
    f('isnull', (v) => (v === null ? 1 : 0));
    f('sd_trim_leading', nul((s, c) => { s = String(s); c = String(c); while (c && s.startsWith(c)) s = s.slice(c.length); return s; }));
    f('sd_trim_trailing', nul((s, c) => { s = String(s); c = String(c); while (c && s.endsWith(c)) s = s.slice(0, -c.length); return s; }));
    f('sd_trim_both', nul((s, c) => { s = String(s); c = String(c); while (c && s.startsWith(c)) s = s.slice(c.length); while (c && s.endsWith(c)) s = s.slice(0, -c.length); return s; }));

    // ---- 數學（sql.js 未啟用 SQLite math functions，因此全部自行提供）----
    f('floor', nul((n) => Math.floor(Number(n))));
    f('ceil', nul((n) => Math.ceil(Number(n))));
    f('ceiling', nul((n) => Math.ceil(Number(n))));
    f('mod', nul((a, b) => (Number(b) === 0 ? null : Number(a) % Number(b))));
    f('pow', nul((a, b) => Math.pow(Number(a), Number(b))));
    f('power', nul((a, b) => Math.pow(Number(a), Number(b))));
    f('sqrt', nul((n) => (Number(n) < 0 ? null : Math.sqrt(Number(n)))));
    f('exp', nul((n) => Math.exp(Number(n))));
    f('ln', nul((n) => (Number(n) <= 0 ? null : Math.log(Number(n)))));
    multi(db, 'log', 1, 2, (a, b) => { if (a === null) return null; if (b === undefined) return Number(a) <= 0 ? null : Math.log(Number(a)); if (b === null) return null; return Math.log(Number(b)) / Math.log(Number(a)); });
    f('log10', nul((n) => (Number(n) <= 0 ? null : Math.log10(Number(n)))));
    f('log2', nul((n) => (Number(n) <= 0 ? null : Math.log2(Number(n)))));
    f('sign', nul((n) => Math.sign(Number(n))));
    f('pi', () => Math.PI);
    multi(db, 'truncate', 2, 2, (n, d) => { if (n === null || d === null) return null; const m = Math.pow(10, Number(d)); return Math.trunc(Number(n) * m) / m; });
    f('trunc', nul((n) => Math.trunc(Number(n))));
    f('degrees', nul((n) => Number(n) * 180 / Math.PI));
    f('radians', nul((n) => Number(n) * Math.PI / 180));
    ['sin', 'cos', 'tan', 'asin', 'acos', 'atan'].forEach((k) => f(k, nul((n) => Math[k](Number(n)))));
    f('atan2', nul((a, b) => Math.atan2(Number(a), Number(b))));
    multi(db, 'rand', 0, 1, () => Math.random());
    multi(db, 'greatest', 2, 12, (...a) => (a.some((x) => x === null) ? null : a.reduce((m, x) => (compareVal(x, m) > 0 ? x : m))));
    multi(db, 'least', 2, 12, (...a) => (a.some((x) => x === null) ? null : a.reduce((m, x) => (compareVal(x, m) < 0 ? x : m))));
    f('crc32', nul((s) => { let c, crc = 0xFFFFFFFF; const str = String(s); for (let i = 0; i < str.length; i++) { c = (crc ^ str.charCodeAt(i)) & 0xFF; for (let k = 0; k < 8; k++) c = c & 1 ? (c >>> 1) ^ 0xEDB88320 : c >>> 1; crc = (crc >>> 8) ^ c; } return (crc ^ 0xFFFFFFFF) >>> 0; }));
    f('sd_div', nul((a, b) => (Number(b) === 0 ? null : Math.trunc(Number(a) / Number(b)))));

    // ---- 控制流程 / 資訊 ----
    f('if', (c, a, b) => (c !== null && c !== 0 && c !== '0' && c !== '' ? a : b));
    f('database', () => 'chaogang_police');
    f('schema', () => 'chaogang_police');
    f('version', () => '11.4.0-MariaDB (SQL 偵探事務所模擬環境)');
    f('user', () => 'trainee@localhost');
    f('current_user', () => 'trainee@localhost');
    f('session_user', () => 'trainee@localhost');
    f('connection_id', () => 1);
    f('last_insert_id', () => { const r = db.exec('SELECT last_insert_rowid()'); return r[0].values[0][0]; });
    f('row_count', () => db.getRowsModified());
    f('found_rows', () => 0);
    f('sleep', () => 0);
    f('benchmark', () => 0);

    // ---- 聚合 ----
    const variance = (population) => ({
      init: () => ({ n: 0, mean: 0, m2: 0 }),
      step: (st, v) => { if (v === null) return st; const x = Number(v); st.n++; const d = x - st.mean; st.mean += d / st.n; st.m2 += d * (x - st.mean); return st; },
      finalize: (st) => (st.n === 0 ? null : population ? st.m2 / st.n : (st.n < 2 ? null : st.m2 / (st.n - 1))),
    });
    const stddev = (population) => { const v = variance(population); return { ...v, finalize: (st) => { const r = v.finalize(st); return r === null ? null : Math.sqrt(r); } }; };
    db.create_aggregate('std', stddev(true));
    db.create_aggregate('stddev', stddev(true));
    db.create_aggregate('stddev_pop', stddev(true));
    db.create_aggregate('stddev_samp', stddev(false));
    db.create_aggregate('variance', variance(true));
    db.create_aggregate('var_pop', variance(true));
    db.create_aggregate('var_samp', variance(false));
    db.create_aggregate('bit_or', { init: () => 0, step: (s, v) => (v === null ? s : s | Number(v)), finalize: (s) => s });
    db.create_aggregate('bit_and', { init: () => null, step: (s, v) => (v === null ? s : s === null ? Number(v) : s & Number(v)), finalize: (s) => (s === null ? 0 : s) });
    db.create_aggregate('json_arrayagg', { init: () => [], step: (s, v) => { s.push(v); return s; }, finalize: (s) => JSON.stringify(s) });
    db.create_aggregate('any_value', { init: () => ({ v: null, set: false }), step: (s, v) => { if (!s.set) { s.v = v; s.set = true; } return s; }, finalize: (s) => s.v });
  }
  function mysqlSubstr(s, pos, len) {
    const chars = Array.from(s);
    let start = pos > 0 ? pos - 1 : pos < 0 ? chars.length + pos : null;
    if (start === null) return '';
    if (len !== undefined && len < 0) return '';
    return chars.slice(start, len === undefined ? undefined : start + len).join('');
  }
  function compareVal(a, b) { if (typeof a === 'number' && typeof b === 'number') return a - b; return String(a) < String(b) ? -1 : String(a) > String(b) ? 1 : 0; }
  function simpleHash(s, len) {
    // 非密碼學用途：只為了讓教學查詢有可重現的固定長度輸出
    let h1 = 0xdeadbeef, h2 = 0x41c6ce57;
    for (let i = 0; i < s.length; i++) { const ch = s.charCodeAt(i); h1 = Math.imul(h1 ^ ch, 2654435761); h2 = Math.imul(h2 ^ ch, 1597334677); }
    let out = '';
    while (out.length < len) { h1 = Math.imul(h1 ^ (h1 >>> 16), 2246822507); h2 = Math.imul(h2 ^ (h2 >>> 13), 3266489909); out += ((h1 ^ h2) >>> 0).toString(16).padStart(8, '0'); }
    return out.slice(0, len);
  }

  // ---------------------------------------------------------------------------
  // 語法改寫
  // ---------------------------------------------------------------------------
  const TYPE_MAP = {
    TINYINT: 'INTEGER', SMALLINT: 'INTEGER', MEDIUMINT: 'INTEGER', INT: 'INTEGER', INTEGER: 'INTEGER', BIGINT: 'INTEGER', BIT: 'INTEGER', BOOL: 'INTEGER', BOOLEAN: 'INTEGER', SERIAL: 'INTEGER',
    DECIMAL: 'REAL', DEC: 'REAL', NUMERIC: 'REAL', FLOAT: 'REAL', DOUBLE: 'REAL', REAL: 'REAL',
    VARCHAR: 'TEXT', CHAR: 'TEXT', TEXT: 'TEXT', TINYTEXT: 'TEXT', MEDIUMTEXT: 'TEXT', LONGTEXT: 'TEXT', ENUM: 'TEXT', SET: 'TEXT', JSON: 'TEXT', NVARCHAR: 'TEXT', NCHAR: 'TEXT',
    DATE: 'TEXT', DATETIME: 'TEXT', TIMESTAMP: 'TEXT', TIME: 'TEXT', YEAR: 'INTEGER',
    BLOB: 'BLOB', TINYBLOB: 'BLOB', MEDIUMBLOB: 'BLOB', LONGBLOB: 'BLOB', BINARY: 'BLOB', VARBINARY: 'BLOB',
  };
  const TEXT_TYPES = ['VARCHAR', 'CHAR', 'TEXT', 'TINYTEXT', 'MEDIUMTEXT', 'LONGTEXT', 'ENUM', 'SET', 'NVARCHAR', 'NCHAR'];

  /** 把一段 token 依最外層逗號切開 */
  function splitTopLevel(tokens) {
    const parts = []; let cur = []; let depth = 0;
    for (const t of tokens) {
      if (isOp(t, '(')) depth++;
      if (isOp(t, ')')) depth--;
      if (depth === 0 && isOp(t, ',')) { parts.push(cur); cur = []; } else cur.push(t);
    }
    parts.push(cur);
    return parts;
  }

  /** 處理一個欄位定義：回傳改寫後字串與是否含 AUTO_INCREMENT */
  function rewriteColumnDef(defTokens, notes) {
    const sig = significant(defTokens);
    if (!sig.length) return { text: join(defTokens), auto: false, name: null };
    const first = sig[0];
    const firstUpper = first.type === 'word' ? first.upper : null;
    // 表層級約束
    if (['PRIMARY', 'UNIQUE', 'KEY', 'INDEX', 'FULLTEXT', 'SPATIAL', 'CONSTRAINT', 'FOREIGN', 'CHECK'].includes(firstUpper)) {
      if (firstUpper === 'KEY' || firstUpper === 'INDEX' || firstUpper === 'FULLTEXT' || firstUpper === 'SPATIAL') {
        notes.push('已略過表層級的 KEY/INDEX 定義：SQLite 要用獨立的 CREATE INDEX 建索引，這不影響查詢結果。');
        return { text: null, auto: false, name: null, isPk: false };
      }
      if (firstUpper === 'UNIQUE' && sig[1] && (isWord(sig[1], 'KEY') || isWord(sig[1], 'INDEX'))) {
        // UNIQUE KEY name (cols) → UNIQUE (cols)
        const open = sig.findIndex((t) => isOp(t, '('));
        return { text: 'UNIQUE ' + join(sig.slice(open)), auto: false, name: null };
      }
      if (firstUpper === 'PRIMARY') {
        const open = sig.findIndex((t) => isOp(t, '('));
        const cols = significant(sig.slice(open + 1, sig.length - 1)).filter((t) => !isOp(t, ',')).map((t) => t.value.replace(/`/g, ''));
        return { text: join(defTokens).trim(), auto: false, name: null, isPk: true, pkCols: cols };
      }
      return { text: join(defTokens).trim(), auto: false, name: null };
    }
    // 欄位定義：name type(...) [modifiers]
    const name = first.value;
    let i = 1;
    const typeTok = sig[i];
    if (!typeTok) return { text: join(defTokens).trim(), auto: false, name };
    let typeUpper = typeTok.type === 'word' ? typeTok.upper : null;
    let sqlType = TYPE_MAP[typeUpper] || typeTok.value;
    i++;
    // 型別參數 (n) / (p,s) / ENUM('a','b')
    if (sig[i] && isOp(sig[i], '(')) {
      let depth = 0;
      while (i < sig.length) { if (isOp(sig[i], '(')) depth++; if (isOp(sig[i], ')')) depth--; i++; if (depth === 0) break; }
    }
    const mods = [];
    let auto = false, pk = false, notNull = false, unique = false, defVal = null, check = null, refs = null, collateNocase = TEXT_TYPES.includes(typeUpper);
    while (i < sig.length) {
      const t = sig[i];
      const u = t.type === 'word' ? t.upper : null;
      if (u === 'UNSIGNED' || u === 'ZEROFILL' || u === 'SIGNED') { i++; continue; }
      if (u === 'AUTO_INCREMENT') { auto = true; i++; continue; }
      if (u === 'PRIMARY') { pk = true; i += isWord(sig[i + 1], 'KEY') ? 2 : 1; continue; }
      if (u === 'KEY') { pk = true; i++; continue; }
      if (u === 'UNIQUE') { unique = true; i += isWord(sig[i + 1], 'KEY') ? 2 : 1; continue; }
      if (u === 'NOT' && isWord(sig[i + 1], 'NULL')) { notNull = true; i += 2; continue; }
      if (u === 'NULL') { i++; continue; }
      if (u === 'DEFAULT') {
        let j = i + 1; let expr;
        if (isOp(sig[j], '(')) { const close = matchParen(sig, j); expr = join(sig.slice(j, close + 1)); j = close + 1; }
        else { expr = sig[j] ? sig[j].value : 'NULL'; j++; if (isOp(sig[j], '(') && isOp(sig[j + 1], ')')) j += 2; }
        if (/^(CURRENT_TIMESTAMP|NOW|SYSDATE|LOCALTIME|LOCALTIMESTAMP)$/i.test(expr)) expr = 'CURRENT_TIMESTAMP';
        defVal = expr; i = j; continue;
      }
      if (u === 'ON' && isWord(sig[i + 1], 'UPDATE')) { i += 3; if (isOp(sig[i], '(')) i += 2; notes.push(`欄位 ${name} 的 ON UPDATE CURRENT_TIMESTAMP 已略過（模擬環境不支援自動更新時間）。`); continue; }
      if (u === 'COMMENT') { i += 2; continue; }
      if (u === 'CHARACTER' && isWord(sig[i + 1], 'SET')) { i += 3; continue; }
      if (u === 'CHARSET') { i += 2; continue; }
      if (u === 'COLLATE') { i += 2; continue; }
      if (u === 'COLUMN_FORMAT' || u === 'STORAGE') { i += 2; continue; }
      if (u === 'GENERATED' || u === 'VIRTUAL' || u === 'STORED' || u === 'PERSISTENT') { i++; continue; }
      if (u === 'AS' && isOp(sig[i + 1], '(')) { const close = matchParen(sig, i + 1); mods.push('AS ' + join(sig.slice(i + 1, close + 1))); i = close + 1; continue; }
      if (u === 'CHECK') { const close = matchParen(sig, i + 1); check = join(sig.slice(i, close + 1)); i = close + 1; continue; }
      if (u === 'REFERENCES') {
        let j = i + 1; let s = 'REFERENCES ' + sig[j].value; j++;
        if (isOp(sig[j], '(')) { const close = matchParen(sig, j); s += join(sig.slice(j, close + 1)); j = close + 1; }
        while (j < sig.length && isWord(sig[j], 'ON')) { s += ' ' + sig[j].value + ' ' + sig[j + 1].value + ' ' + sig[j + 2].value; j += 3; if (sig[j] && (isWord(sig[j], 'NULL') || isWord(sig[j], 'DEFAULT')) && /SET/i.test(sig[j - 1].value)) { s += ' ' + sig[j].value; j++; } }
        refs = s; i = j; continue;
      }
      if (u === 'INVISIBLE' || u === 'VISIBLE') { i++; continue; }
      // 其他未知 modifier 原樣保留
      mods.push(t.value); i++;
    }
    if (auto) {
      if (sqlType !== 'INTEGER') notes.push(`欄位 ${name}：AUTO_INCREMENT 只能用在整數欄位，已改為 INTEGER。`);
      // SQLite 的自動編號必須是 INTEGER PRIMARY KEY AUTOINCREMENT
      return { text: `${name} INTEGER PRIMARY KEY AUTOINCREMENT${notNull ? ' NOT NULL' : ''}`, auto: true, name, isAutoPk: true };
    }
    let out = `${name} ${sqlType}`;
    if (pk) out += ' PRIMARY KEY';
    if (notNull) out += ' NOT NULL';
    if (unique) out += ' UNIQUE';
    if (defVal !== null) out += ' DEFAULT ' + defVal;
    if (check) out += ' ' + check;
    if (refs) out += ' ' + refs;
    if (collateNocase) out += ' COLLATE NOCASE';
    if (mods.length) out += ' ' + mods.join(' ');
    return { text: out, auto: false, name, isPk: pk };
  }

  function rewriteCreateTable(tokens, notes) {
    const sig = significant(tokens);
    // CREATE [TEMPORARY] TABLE [IF NOT EXISTS] name ( ... ) [table options]
    let i = 1;
    let head = 'CREATE ';
    if (isWord(sig[i], 'TEMPORARY')) { head += 'TEMPORARY '; i++; }
    head += 'TABLE '; i++;
    if (isWord(sig[i], 'IF')) { head += 'IF NOT EXISTS '; i += 3; }
    const nameTok = sig[i]; i++;
    head += nameTok.value.replace(/^\w+\./, '') + ' ';
    if (isWord(sig[i], 'LIKE') || isWord(sig[i], 'AS') || isWord(sig[i], 'SELECT')) {
      // CREATE TABLE x AS SELECT ... / LIKE y
      if (isWord(sig[i], 'LIKE')) {
        notes.push('CREATE TABLE ... LIKE 在模擬環境以複製結構的方式處理。');
        return { sql: head + `AS SELECT * FROM ${sig[i + 1].value} WHERE 0`, kind: 'ddl' };
      }
      return { sql: head + join(tokens.slice(tokens.indexOf(sig[i]))), kind: 'ddl' };
    }
    if (!isOp(sig[i], '(')) return { sql: join(tokens), kind: 'ddl' };
    const openIdx = tokens.indexOf(sig[i]);
    const closeIdx = matchParen(tokens, openIdx);
    const body = tokens.slice(openIdx + 1, closeIdx);
    const defs = splitTopLevel(body).map((d) => rewriteColumnDef(d, notes));
    const autoCol = defs.find((d) => d.isAutoPk);
    let out = [];
    for (const d of defs) {
      if (d.text === null) continue;
      if (autoCol && d.isPk && d.pkCols && d.pkCols.length === 1 && d.pkCols[0].toLowerCase() === autoCol.name.replace(/`/g, '').toLowerCase()) continue; // 表層級 PRIMARY KEY(id) 與 AUTO_INCREMENT 欄位重複
      if (autoCol && d.isPk && d.pkCols && d.pkCols.length > 1) { notes.push('複合主鍵與 AUTO_INCREMENT 同時存在時，模擬環境只保留自動編號主鍵。'); continue; }
      out.push(d.text);
    }
    // 表選項（ENGINE=... DEFAULT CHARSET=... COMMENT=...）全部略過
    const after = significant(tokens.slice(closeIdx + 1));
    if (after.length) notes.push('已略過 ENGINE / CHARSET / COLLATE 等表選項（SQLite 不需要，MariaDB 上寫法仍正確）。');
    return { sql: `${head}(\n  ${out.join(',\n  ')}\n)`, kind: 'ddl' };
  }

  function rewriteAlterTable(tokens, notes) {
    const sig = significant(tokens);
    const table = sig[2].value;
    const rest = sig.slice(3);
    const u = (t) => (t && t.type === 'word' ? t.upper : null);
    const stmts = [];
    // 依最外層逗號切多個動作
    const actions = splitTopLevel(rest);
    for (const act of actions) {
      const a = significant(act);
      if (!a.length) continue;
      const k = u(a[0]);
      if (k === 'ADD') {
        let j = 1;
        if (u(a[j]) === 'COLUMN') j++;
        if (u(a[j]) === 'INDEX' || u(a[j]) === 'KEY') {
          const idxName = isOp(a[j + 1], '(') ? `idx_${table}_${Date.now() % 100000}` : a[j + 1].value;
          const open = a.findIndex((t) => isOp(t, '('));
          stmts.push(`CREATE INDEX IF NOT EXISTS ${idxName} ON ${table} ${join(a.slice(open))}`);
          continue;
        }
        if (u(a[j]) === 'UNIQUE') {
          let jj = j + 1; if (u(a[jj]) === 'INDEX' || u(a[jj]) === 'KEY') jj++;
          const idxName = isOp(a[jj], '(') ? `uq_${table}_${Date.now() % 100000}` : a[jj].value;
          const open = a.findIndex((t) => isOp(t, '('));
          stmts.push(`CREATE UNIQUE INDEX IF NOT EXISTS ${idxName} ON ${table} ${join(a.slice(open))}`);
          continue;
        }
        if (u(a[j]) === 'PRIMARY') throw compatError('ALTER TABLE ... ADD PRIMARY KEY', 'SQLite 建表後無法再新增主鍵。請在 CREATE TABLE 時就宣告 PRIMARY KEY，或先 DROP TABLE 重建。');
        if (u(a[j]) === 'CONSTRAINT' || u(a[j]) === 'FOREIGN') throw compatError('ALTER TABLE ... ADD FOREIGN KEY', 'SQLite 建表後無法再新增外鍵約束。請在 CREATE TABLE 內用 REFERENCES 宣告。');
        // ADD COLUMN def [FIRST | AFTER col]
        let defToks = a.slice(j);
        const afterIdx = defToks.findIndex((t) => u(t) === 'AFTER' || u(t) === 'FIRST');
        if (afterIdx >= 0) { defToks = defToks.slice(0, afterIdx); notes.push('ADD COLUMN 的 FIRST / AFTER 位置指定已略過（SQLite 只能加在最後，不影響查詢）。'); }
        if (isOp(defToks[0], '(')) defToks = defToks.slice(1, -1);
        const def = rewriteColumnDef(defToks, notes);
        if (def.auto) throw compatError('ALTER TABLE ... ADD COLUMN ... AUTO_INCREMENT', 'SQLite 無法事後新增自動編號欄位，請改在 CREATE TABLE 時宣告。');
        stmts.push(`ALTER TABLE ${table} ADD COLUMN ${def.text.replace(/ PRIMARY KEY/i, '')}`);
        continue;
      }
      if (k === 'DROP') {
        let j = 1;
        if (u(a[j]) === 'COLUMN') j++;
        if (u(a[j]) === 'INDEX' || u(a[j]) === 'KEY') { stmts.push(`DROP INDEX IF EXISTS ${a[j + 1].value}`); continue; }
        if (u(a[j]) === 'PRIMARY') throw compatError('ALTER TABLE ... DROP PRIMARY KEY', 'SQLite 不支援移除主鍵。');
        if (u(a[j]) === 'FOREIGN') throw compatError('ALTER TABLE ... DROP FOREIGN KEY', 'SQLite 不支援移除外鍵約束。');
        stmts.push(`ALTER TABLE ${table} DROP COLUMN ${a[j].value}`);
        continue;
      }
      if (k === 'RENAME') {
        if (u(a[1]) === 'COLUMN') { stmts.push(`ALTER TABLE ${table} RENAME COLUMN ${a[2].value} TO ${a[4].value}`); continue; }
        if (u(a[1]) === 'TO' || u(a[1]) === 'AS') { stmts.push(`ALTER TABLE ${table} RENAME TO ${a[2].value}`); continue; }
        if (u(a[1]) === 'INDEX' || u(a[1]) === 'KEY') { notes.push('RENAME INDEX 已略過。'); continue; }
        stmts.push(`ALTER TABLE ${table} RENAME TO ${a[1].value}`);
        continue;
      }
      if (k === 'MODIFY' || k === 'CHANGE') {
        // SQLite 沒有 MODIFY/CHANGE：以「新增暫存欄位→複製→刪除→改名」模擬
        let j = 1; if (u(a[j]) === 'COLUMN') j++;
        const oldName = a[j].value;
        let defToks = k === 'CHANGE' ? a.slice(j + 1) : a.slice(j);
        const afterIdx = defToks.findIndex((t) => u(t) === 'AFTER' || u(t) === 'FIRST');
        if (afterIdx >= 0) defToks = defToks.slice(0, afterIdx);
        const def = rewriteColumnDef(defToks, notes);
        if (def.auto || def.isPk) throw compatError(`ALTER TABLE ... ${k}`, '模擬環境無法把既有欄位改成主鍵或 AUTO_INCREMENT，請 DROP TABLE 後重建。');
        const newName = def.name;
        const tmp = `__sd_tmp_${newName.replace(/`/g, '')}`;
        const defText = def.text.replace(new RegExp('^' + newName.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')), tmp).replace(/ NOT NULL/i, '').replace(/ UNIQUE/i, '');
        stmts.push(`ALTER TABLE ${table} ADD COLUMN ${defText}`);
        stmts.push(`UPDATE ${table} SET ${tmp} = ${oldName}`);
        stmts.push(`ALTER TABLE ${table} DROP COLUMN ${oldName}`);
        stmts.push(`ALTER TABLE ${table} RENAME COLUMN ${tmp} TO ${newName}`);
        notes.push(`${k} COLUMN 在模擬環境以「新增欄位→複製資料→刪除舊欄位→改名」四步完成，MariaDB 上一行就能做到。`);
        continue;
      }
      if (k === 'ENGINE' || k === 'DEFAULT' || k === 'CHARSET' || k === 'CHARACTER' || k === 'COLLATE' || k === 'COMMENT' || k === 'AUTO_INCREMENT') { notes.push(`表選項 ${a[0].value} 已略過。`); continue; }
      if (k === 'ORDER' || k === 'CONVERT') { notes.push(`ALTER TABLE ${a[0].value} 已略過。`); continue; }
      throw compatError(`ALTER TABLE ${a[0].value}`, '模擬環境尚未支援這種 ALTER 動作。');
    }
    return { sql: stmts, kind: 'ddl' };
  }

  function compatError(feature, detail) {
    const e = new Error(`${feature}：${detail}`);
    e.compat = true;
    return e;
  }

  /** 處理 INSERT 的 MariaDB 變體 */
  function rewriteInsert(tokens, notes) {
    const sig = significant(tokens);
    let i = 0;
    let head = 'INSERT';
    i++;
    const mods = [];
    while (isWord(sig[i], 'LOW_PRIORITY') || isWord(sig[i], 'DELAYED') || isWord(sig[i], 'HIGH_PRIORITY') || isWord(sig[i], 'IGNORE')) {
      if (isWord(sig[i], 'IGNORE')) mods.push('OR IGNORE'); i++;
    }
    if (mods.length) head += ' ' + mods.join(' ');
    if (isWord(sig[i], 'INTO')) i++;
    const table = sig[i].value; i++;
    let partsStart = i;
    // INSERT INTO t SET a=1, b=2
    if (isWord(sig[i], 'SET')) {
      const assigns = splitTopLevel(sig.slice(i + 1));
      const cols = [], vals = [];
      for (const as of assigns) { const eq = as.findIndex((t) => isOp(t, '=')); cols.push(join(as.slice(0, eq)).trim()); vals.push(join(as.slice(eq + 1)).trim()); }
      return { sql: `${head} INTO ${table} (${cols.join(', ')}) VALUES (${vals.join(', ')})`, kind: 'dml' };
    }
    // ON DUPLICATE KEY UPDATE
    const odk = sig.findIndex((t, idx) => isWord(t, 'ON') && isWord(sig[idx + 1], 'DUPLICATE'));
    if (odk >= 0) {
      const before = join(tokens.slice(tokens.indexOf(sig[partsStart]), tokens.indexOf(sig[odk]))).trim();
      const assigns = sig.slice(odk + 4).map((t) => (isWord(t, 'VALUES') ? { ...t, value: 'excluded', upper: 'EXCLUDED' } : t));
      // VALUES(col) → excluded.col
      let assignText = join(assigns).replace(/excluded\s*\(\s*([^)]+?)\s*\)/gi, 'excluded.$1');
      notes.push('ON DUPLICATE KEY UPDATE 已轉為 SQLite 的 ON CONFLICT DO UPDATE，效果相同。');
      return { sql: `${head} INTO ${table} ${before} ON CONFLICT DO UPDATE SET ${assignText}`, kind: 'dml' };
    }
    return { sql: `${head} INTO ${table} ${join(tokens.slice(tokens.indexOf(sig[partsStart])))}`, kind: 'dml' };
  }

  /** UPDATE / DELETE 帶 ORDER BY / LIMIT：改成 rowid IN (子查詢) */
  function rewriteUpdateDeleteLimit(tokens, kind) {
    const sig = significant(tokens);
    const limitIdx = sig.findIndex((t, idx) => isWord(t, 'LIMIT') && !sig.slice(0, idx).some((x) => isOp(x, '(')) );
    const orderIdx = sig.findIndex((t, idx) => isWord(t, 'ORDER') && isWord(sig[idx + 1], 'BY'));
    if (limitIdx < 0 && orderIdx < 0) return null;
    // 只支援單表且不含子查詢的簡單寫法
    const tailStart = orderIdx >= 0 ? orderIdx : limitIdx;
    const table = kind === 'DELETE' ? sig[sig.findIndex((t) => isWord(t, 'FROM')) + 1].value : sig[1].value;
    const whereIdx = sig.findIndex((t) => isWord(t, 'WHERE'));
    const joinSp = (toks) => toks.map((x) => x.value).join(' ');
    const whereText = whereIdx >= 0 ? joinSp(sig.slice(whereIdx, tailStart)) : '';
    const tailText = joinSp(sig.slice(tailStart));
    const sub = `rowid IN (SELECT rowid FROM ${table} ${whereText} ${tailText})`;
    const main = joinSp(sig.slice(0, whereIdx >= 0 ? whereIdx : tailStart));
    return `${main} WHERE ${sub}`;
  }

  /**
   * 表達式層級的改寫：INTERVAL、GROUP_CONCAT SEPARATOR、POSITION IN、DIV、<=>、||/&&、
   * 整數除法、CAST AS UNSIGNED、EXTRACT、TRIM(BOTH ...)、CURRENT_TIMESTAMP()、FROM DUAL、REGEXP/RLIKE。
   */
  function rewriteExpressions(tokens, notes) {
    let t = tokens.filter((x) => x.type !== 'comment');
    const out = [];
    let pipesNoted = false;
    for (let i = 0; i < t.length; i++) {
      const tok = t[i];
      const u = tok.type === 'word' ? tok.upper : null;

      // INTERVAL expr UNIT  → sd_interval((expr), 'UNIT')；若前一個有效 token 是 + / -，改成函數呼叫
      if (u === 'INTERVAL') {
        let j = i + 1; const exprToks = [];
        let unitTok = null;
        while (j < t.length) {
          const x = t[j];
          if (x.type === 'word' && UNIT_WORDS.includes(x.upper) && exprToks.some((e) => e.type !== 'ws')) { unitTok = x; break; }
          if (x.type === 'word' && /^(SQL_TSI_)?(\w+)S?$/.test(x.upper) && UNIT_WORDS.includes(x.upper.replace(/^SQL_TSI_/, '').replace(/S$/, '')) && exprToks.some((e) => e.type !== 'ws')) { unitTok = { ...x, upper: x.upper.replace(/^SQL_TSI_/, '').replace(/S$/, '') }; break; }
          exprToks.push(x); j++;
        }
        if (!unitTok) { out.push(tok); continue; }
        const ivl = `sd_interval((${join(exprToks).trim()}), '${unitTok.upper}')`;
        // 檢查運算子形式：<date> + INTERVAL ... / <date> - INTERVAL ...
        let p = out.length - 1; while (p >= 0 && out[p].type === 'ws') p--;
        if (p >= 0 && (isOp(out[p], '+') || isOp(out[p], '-'))) {
          const sign = out[p].value;
          // 找左操作元：字串/數字/識別字（含 a.b）/括號群組（含前置函數名）
          let q = p - 1; while (q >= 0 && out[q].type === 'ws') q--;
          let start = q;
          if (q >= 0 && isOp(out[q], ')')) {
            start = matchParenBack(out, q);
            let r = start - 1; while (r >= 0 && out[r].type === 'ws') r--;
            if (r >= 0 && out[r].type === 'word') start = r;
          } else if (q >= 0 && (out[q].type === 'word' || out[q].type === 'string' || out[q].type === 'number' || out[q].type === 'quoted')) {
            start = q;
            while (start - 2 >= 0 && isOp(out[start - 1], '.') && out[start - 2].type === 'word') start -= 2;
          }
          if (start >= 0 && start <= q) {
            const left = join(out.slice(start, q + 1));
            out.splice(start);
            out.push({ type: 'word', value: `${sign === '+' ? 'sd_plus_interval' : 'sd_minus_interval'}(${left}, ${ivl})`, upper: null });
            i = j; continue;
          }
        }
        out.push({ type: 'word', value: ivl, upper: null });
        i = j; continue;
      }

      // GROUP_CONCAT( ... SEPARATOR 'x')
      if (u === 'GROUP_CONCAT' && isOp(t[nextSig(t, i)], '(')) {
        const open = nextSig(t, i); const close = matchParen(t, open);
        const inner = t.slice(open + 1, close);
        const innerRewritten = rewriteExpressions(inner, notes);
        const sepIdx = innerRewritten.findIndex((x) => isWord(x, 'SEPARATOR'));
        let body;
        if (sepIdx >= 0) {
          const sep = join(innerRewritten.slice(sepIdx + 1)).trim();
          const before = innerRewritten.slice(0, sepIdx);
          const ob = before.findIndex((x, idx) => isWord(x, 'ORDER') && isWord(before[nextSig(before, idx)], 'BY'));
          const isDistinct = isWord(significant(before)[0], 'DISTINCT');
          if (isDistinct) {
            // SQLite 的 DISTINCT 聚合只能有一個參數：先用預設逗號串接，再把逗號換成指定分隔符
            body = join(before).trim();
            if (sep.replace(/^'|'$/g, '') !== ',') { out.push({ type: 'word', value: `REPLACE(GROUP_CONCAT(${body}), ',', ${sep})`, upper: null }); notes.push('GROUP_CONCAT(DISTINCT ... SEPARATOR) 在模擬環境以 REPLACE 換分隔符，若值本身含逗號會一併被換掉。'); i = close; continue; }
          } else if (ob >= 0) body = `${join(before.slice(0, ob)).trim()}, ${sep} ${join(before.slice(ob)).trim()}`;
          else body = `${join(before).trim()}, ${sep}`;
        } else body = join(innerRewritten);
        out.push({ type: 'word', value: `GROUP_CONCAT(${body})`, upper: null });
        i = close; continue;
      }

      // TIMESTAMPDIFF(UNIT, a, b) / TIMESTAMPADD(UNIT, n, d)：把裸寫的單位字改成字串
      if ((u === 'TIMESTAMPDIFF' || u === 'TIMESTAMPADD') && isOp(t[nextSig(t, i)], '(')) {
        const open = nextSig(t, i); const unitIdx = nextSig(t, open);
        if (t[unitIdx] && t[unitIdx].type === 'word' && UNIT_WORDS.includes(t[unitIdx].upper.replace(/^SQL_TSI_/, ''))) {
          t[unitIdx] = { type: 'string', value: `'${t[unitIdx].upper.replace(/^SQL_TSI_/, '')}'`, upper: null };
        }
        out.push(tok); continue;
      }

      // POSITION(sub IN str) → INSTR(str, sub)
      if (u === 'POSITION' && isOp(t[nextSig(t, i)], '(')) {
        const open = nextSig(t, i); const close = matchParen(t, open);
        const inner = t.slice(open + 1, close);
        const inIdx = inner.findIndex((x) => isWord(x, 'IN'));
        if (inIdx >= 0) {
          out.push({ type: 'word', value: `INSTR(${join(rewriteExpressions(inner.slice(inIdx + 1), notes)).trim()}, ${join(rewriteExpressions(inner.slice(0, inIdx), notes)).trim()})`, upper: null });
          i = close; continue;
        }
      }

      // EXTRACT(UNIT FROM expr)
      if (u === 'EXTRACT' && isOp(t[nextSig(t, i)], '(')) {
        const open = nextSig(t, i); const close = matchParen(t, open);
        const inner = significant(t.slice(open + 1, close));
        const fromIdx = inner.findIndex((x) => isWord(x, 'FROM'));
        if (fromIdx >= 0 && UNIT_WORDS.includes(inner[0].upper)) {
          out.push({ type: 'word', value: `${inner[0].upper.toLowerCase()}(${join(rewriteExpressions(inner.slice(fromIdx + 1), notes))})`, upper: null });
          i = close; continue;
        }
      }

      // TRIM([BOTH|LEADING|TRAILING] [remstr] FROM str)
      if (u === 'TRIM' && isOp(t[nextSig(t, i)], '(')) {
        const open = nextSig(t, i); const close = matchParen(t, open);
        const inner = t.slice(open + 1, close);
        const sigIn = significant(inner);
        const fromIdx = sigIn.findIndex((x) => isWord(x, 'FROM'));
        if (fromIdx >= 0) {
          let mode = 'both'; let k = 0;
          if (['BOTH', 'LEADING', 'TRAILING'].includes(sigIn[0].upper)) { mode = sigIn[0].upper.toLowerCase(); k = 1; }
          const rem = fromIdx > k ? join(sigIn.slice(k, fromIdx)) : "' '";
          const str = join(rewriteExpressions(sigIn.slice(fromIdx + 1), notes));
          out.push({ type: 'word', value: `sd_trim_${mode}(${str}, ${rem})`, upper: null });
          i = close; continue;
        }
      }

      // CAST(x AS UNSIGNED|SIGNED|CHAR(n)|DATE|DATETIME|DECIMAL(...))
      if ((u === 'CAST' || u === 'CONVERT') && isOp(t[nextSig(t, i)], '(')) {
        const open = nextSig(t, i); const close = matchParen(t, open);
        const inner = t.slice(open + 1, close);
        const sigIn = significant(inner);
        let asIdx = sigIn.findIndex((x) => isWord(x, 'AS'));
        let exprToks, typeToks;
        if (u === 'CONVERT' && asIdx < 0) {
          const parts = splitTopLevel(sigIn);
          if (parts.length === 2) { exprToks = parts[0]; typeToks = parts[1]; }
        } else if (asIdx >= 0) { exprToks = sigIn.slice(0, asIdx); typeToks = sigIn.slice(asIdx + 1); }
        if (exprToks && typeToks && typeToks.length) {
          const expr = join(rewriteExpressions(exprToks, notes)).trim();
          const ty = typeToks[0].upper;
          let rep;
          if (ty === 'UNSIGNED' || ty === 'SIGNED' || ty === 'INT' || ty === 'INTEGER') rep = `CAST(${expr} AS INTEGER)`;
          else if (ty === 'CHAR' || ty === 'VARCHAR' || ty === 'NCHAR') rep = `CAST(${expr} AS TEXT)`;
          else if (ty === 'DECIMAL' || ty === 'FLOAT' || ty === 'DOUBLE' || ty === 'REAL') rep = `CAST(${expr} AS REAL)`;
          else if (ty === 'DATE') rep = `sd_cast_date(${expr})`;
          else if (ty === 'DATETIME' || ty === 'TIMESTAMP') rep = `sd_cast_datetime(${expr})`;
          else if (ty === 'TIME') rep = `time(${expr})`;
          else if (ty === 'BINARY') rep = `CAST(${expr} AS BLOB)`;
          else rep = `CAST(${expr} AS ${join(typeToks)})`;
          out.push({ type: 'word', value: rep, upper: null });
          i = close; continue;
        }
      }

      // CURRENT_TIMESTAMP() / CURRENT_DATE() / CURRENT_TIME()：SQLite 不接受括號
      if ((u === 'CURRENT_TIMESTAMP' || u === 'CURRENT_DATE' || u === 'CURRENT_TIME' || u === 'LOCALTIME' || u === 'LOCALTIMESTAMP') && isOp(t[nextSig(t, i)], '(')) {
        const open = nextSig(t, i); const close = matchParen(t, open);
        out.push({ type: 'word', value: u === 'CURRENT_DATE' ? 'curdate()' : u === 'CURRENT_TIME' ? 'curtime()' : 'now()', upper: null });
        i = close; continue;
      }
      if (u === 'CURRENT_TIMESTAMP' || u === 'LOCALTIME' || u === 'LOCALTIMESTAMP') {
        // SQLite 的 CURRENT_TIMESTAMP 是 UTC，改用本地時間函數
        let p = out.length - 1; while (p >= 0 && out[p].type === 'ws') p--;
        if (!(p >= 0 && isWord(out[p], 'DEFAULT'))) { out.push({ type: 'word', value: 'now()', upper: null }); continue; }
      }
      if (u === 'CURRENT_DATE') { out.push({ type: 'word', value: 'curdate()', upper: null }); continue; }
      if (u === 'CURRENT_TIME') { out.push({ type: 'word', value: 'curtime()', upper: null }); continue; }

      // FROM DUAL
      if (u === 'FROM' && isWord(t[nextSig(t, i)], 'DUAL')) { i = nextSig(t, i); continue; }

      // BINARY x / _utf8mb4'x' 前綴
      if (u === 'BINARY' && t[nextSig(t, i)] && (t[nextSig(t, i)].type === 'string' || t[nextSig(t, i)].type === 'word')) { continue; }
      if (/^_UTF8(MB4|MB3)?$|^_LATIN1$|^_BIG5$/.test(u || '') && t[nextSig(t, i)] && t[nextSig(t, i)].type === 'string') continue;

      // DIV 整數除法：a DIV b → sd_div(a, b)（只處理簡單操作元）
      if (u === 'DIV') {
        let p = out.length - 1; while (p >= 0 && out[p].type === 'ws') p--;
        let start = p;
        if (p >= 0 && isOp(out[p], ')')) { start = matchParenBack(out, p); let r = start - 1; while (r >= 0 && out[r].type === 'ws') r--; if (r >= 0 && out[r].type === 'word') start = r; }
        else if (p >= 0) { while (start - 2 >= 0 && isOp(out[start - 1], '.') && out[start - 2].type === 'word') start -= 2; }
        const nx = nextSig(t, i);
        let end = nx;
        if (isOp(t[nx], '(')) end = matchParen(t, nx);
        else if (t[nx] && t[nx].type === 'word' && isOp(t[nx + 1], '(')) end = matchParen(t, nx + 1);
        else if (t[nx] && t[nx].type === 'word') { while (isOp(t[end + 1], '.') && t[end + 2] && t[end + 2].type === 'word') end += 2; }
        if (start >= 0 && nx >= 0) {
          const left = join(out.slice(start, p + 1)); const right = join(rewriteExpressions(t.slice(nx, end + 1), notes));
          out.splice(start);
          out.push({ type: 'word', value: `sd_div(${left}, ${right})`, upper: null });
          i = end; continue;
        }
      }

      // RLIKE → REGEXP
      if (u === 'RLIKE') { out.push({ type: 'word', value: 'REGEXP', upper: 'REGEXP' }); continue; }
      // XOR
      if (u === 'XOR') { out.push({ type: 'op', value: '<>' }); notes.push('XOR 已以 <> 模擬（兩邊皆為布林值時結果相同）。'); continue; }

      if (tok.type === 'op') {
        if (tok.value === '<=>') { out.push({ type: 'word', value: 'IS', upper: 'IS' }); continue; }
        if (tok.value === '&&') { out.push({ type: 'word', value: 'AND', upper: 'AND' }); continue; }
        if (tok.value === '||') {
          // MariaDB 預設 || 是 OR
          out.push({ type: 'word', value: 'OR', upper: 'OR' });
          if (!pipesNoted) { notes.push('|| 依 MariaDB 預設視為 OR；字串串接請用 CONCAT()。'); pipesNoted = true; }
          continue;
        }
        if (tok.value === '/') {
          // MariaDB 的 / 永遠是浮點除法，SQLite 對整數會取整；a / b → a / 1.0 / b 等價於浮點結果
          out.push({ type: 'op', value: '/' }); out.push({ type: 'number', value: '1.0' }); out.push({ type: 'op', value: '/' });
          continue;
        }
        if (tok.value === '!' && !(t[i + 1] && isOp(t[i + 1], '='))) { out.push({ type: 'word', value: 'NOT', upper: 'NOT' }); out.push({ type: 'ws', value: ' ' }); continue; }
        if (tok.value === ':=') { out.push({ type: 'op', value: '=' }); continue; }
      }
      // 反引號識別字 → 原樣（SQLite 支援）；雙引號已在 tokenizer 轉為字串
      out.push(tok);
    }
    return out;
  }

  /** 把 LIMIT 內的 offset 形式維持不動（SQLite 支援 LIMIT a, b）；此函數保留給未來擴充 */

  /**
   * 主入口：把一段 MariaDB 語句轉為可執行物件
   * 回傳 { kind: 'query'|'dml'|'ddl'|'meta', sql: string|string[], meta?: {...}, notes: [] }
   */
  function rewriteStatement(raw) {
    const notes = [];
    const tokens = tokenize(raw);
    const sig = significant(tokens);
    if (!sig.length) return null;
    const first = sig[0].type === 'word' ? sig[0].upper : '';
    const second = sig[1] && sig[1].type === 'word' ? sig[1].upper : '';
    const rest = (n) => join(sig.slice(n)).trim();

    // ---- 管理指令 ----
    if (first === 'SHOW') {
      if (second === 'TABLES' || (second === 'FULL' && isWord(sig[2], 'TABLES'))) {
        const likeIdx = sig.findIndex((t) => isWord(t, 'LIKE'));
        const where = likeIdx >= 0 ? ` AND name LIKE ${sig[likeIdx + 1].value}` : '';
        return { kind: 'query', sql: `SELECT name AS Tables_in_chaogang_police FROM sqlite_master WHERE type='table' AND name NOT LIKE 'sqlite_%'${where} ORDER BY name`, notes };
      }
      if (second === 'DATABASES' || second === 'SCHEMAS') return { kind: 'query', sql: `SELECT 'chaogang_police' AS "Database" UNION ALL SELECT 'information_schema'`, notes };
      if (second === 'COLUMNS' || second === 'FIELDS' || (second === 'FULL' && (isWord(sig[2], 'COLUMNS') || isWord(sig[2], 'FIELDS')))) {
        const fromIdx = sig.findIndex((t) => isWord(t, 'FROM') || isWord(t, 'IN'));
        return { kind: 'meta', meta: { op: 'describe', table: sig[fromIdx + 1].value.replace(/`/g, ''), full: second === 'FULL' }, notes };
      }
      if (second === 'CREATE' && isWord(sig[2], 'TABLE')) return { kind: 'meta', meta: { op: 'showcreate', table: sig[3].value.replace(/`/g, '') }, notes };
      if (second === 'INDEX' || second === 'INDEXES' || second === 'KEYS') { const fromIdx = sig.findIndex((t) => isWord(t, 'FROM') || isWord(t, 'IN')); return { kind: 'meta', meta: { op: 'showindex', table: sig[fromIdx + 1].value.replace(/`/g, '') }, notes }; }
      if (second === 'TABLE' && isWord(sig[2], 'STATUS')) return { kind: 'meta', meta: { op: 'tablestatus' }, notes };
      if (second === 'VARIABLES' || second === 'STATUS' || second === 'ENGINES' || second === 'PROCESSLIST' || second === 'GRANTS' || second === 'WARNINGS' || second === 'ERRORS' || second === 'CHARSET' || second === 'COLLATION') return { kind: 'meta', meta: { op: 'info', what: second }, notes };
      throw compatError(`SHOW ${second}`, '模擬環境尚未支援這個 SHOW 指令。');
    }
    if (first === 'DESCRIBE' || first === 'DESC' || (first === 'EXPLAIN' && sig.length === 2)) {
      if (!sig[1]) throw compatError('DESCRIBE', '請在 DESCRIBE 後面接資料表名稱，例如 DESCRIBE person;');
      return { kind: 'meta', meta: { op: 'describe', table: sig[1].value.replace(/`/g, ''), column: sig[2] ? sig[2].value : null }, notes };
    }
    if (first === 'EXPLAIN') return { kind: 'query', sql: 'EXPLAIN QUERY PLAN ' + join(rewriteExpressions(tokens.slice(tokens.indexOf(sig[1])), notes)), notes: [...notes, 'EXPLAIN 顯示的是 SQLite 的查詢計畫，格式與 MariaDB 不同。'] };
    if (first === 'USE') return { kind: 'meta', meta: { op: 'use', db: sig[1] ? sig[1].value : '' }, notes };
    if (first === 'HELP') return { kind: 'meta', meta: { op: 'help' }, notes };
    if ((first === 'CREATE' || first === 'DROP') && (second === 'DATABASE' || second === 'SCHEMA')) return { kind: 'meta', meta: { op: first.toLowerCase() + 'db', db: rest(2) }, notes };
    if (first === 'SET' || first === 'START' || first === 'BEGIN' || first === 'COMMIT' || first === 'ROLLBACK' || first === 'LOCK' || first === 'UNLOCK' || first === 'FLUSH' || first === 'GRANT' || first === 'REVOKE' || first === 'ANALYZE' || first === 'OPTIMIZE' || first === 'CHECK') {
      if (first === 'BEGIN' || first === 'START' || first === 'COMMIT' || first === 'ROLLBACK') return { kind: 'meta', meta: { op: 'txn', what: first }, notes };
      return { kind: 'meta', meta: { op: 'noop', what: first }, notes };
    }
    if (first === 'TRUNCATE') {
      const table = (isWord(sig[1], 'TABLE') ? sig[2] : sig[1]).value;
      return { kind: 'dml', sql: [`DELETE FROM ${table}`, `DELETE FROM sqlite_sequence WHERE name='${table.replace(/`/g, '')}'`], notes };
    }
    if (first === 'CREATE') {
      const tIdx = sig.findIndex((t) => isWord(t, 'TABLE'));
      if (tIdx >= 0 && tIdx <= 2) return { ...rewriteCreateTable(tokens, notes), notes };
      if (second === 'INDEX' || second === 'UNIQUE' || second === 'VIEW' || (second === 'OR' && isWord(sig[3], 'VIEW'))) {
        let s = join(rewriteExpressions(tokens, notes));
        s = s.replace(/\s+USING\s+(BTREE|HASH)/gi, '');
        return { kind: 'ddl', sql: s, notes };
      }
      if (second === 'PROCEDURE' || second === 'FUNCTION' || second === 'TRIGGER' || second === 'EVENT') throw compatError(`CREATE ${second}`, '模擬環境不支援儲存程序、函數、觸發器與事件，這些屬於進階主題。');
    }
    if (first === 'ALTER' && second === 'TABLE') return { ...rewriteAlterTable(tokens, notes), notes };
    if (first === 'DROP') {
      let s = join(tokens).replace(/\bTEMPORARY\b/i, '').replace(/\bRESTRICT\b|\bCASCADE\b/gi, '');
      return { kind: 'ddl', sql: s, notes };
    }
    if (first === 'RENAME' && second === 'TABLE') {
      const parts = splitTopLevel(sig.slice(2));
      return { kind: 'ddl', sql: parts.map((p) => { const s = significant(p); return `ALTER TABLE ${s[0].value} RENAME TO ${s[2].value}`; }), notes };
    }
    if (first === 'INSERT') {
      const r = rewriteInsert(tokens, notes);
      return { kind: 'dml', sql: join(rewriteExpressions(tokenize(r.sql), notes)), notes };
    }
    if (first === 'REPLACE') return { kind: 'dml', sql: join(rewriteExpressions(tokens, notes)), notes };
    if (first === 'UPDATE' || first === 'DELETE') {
      let toks = tokens;
      // UPDATE LOW_PRIORITY IGNORE / DELETE QUICK 等修飾詞
      toks = toks.filter((t) => !(t.type === 'word' && ['LOW_PRIORITY', 'IGNORE', 'QUICK'].includes(t.upper)));
      const rewritten = rewriteExpressions(toks, notes);
      const lim = rewriteUpdateDeleteLimit(rewritten, first);
      if (lim) { notes.push(`${first} 的 ORDER BY / LIMIT 在模擬環境以 rowid 子查詢實作，結果與 MariaDB 相同。`); return { kind: 'dml', sql: lim, notes }; }
      return { kind: 'dml', sql: join(rewritten), notes };
    }
    if (first === 'SELECT' || first === 'WITH' || first === '(' || first === 'VALUES' || first === 'TABLE') {
      let s = join(rewriteExpressions(tokens, notes));
      s = s.replace(/\bSQL_CALC_FOUND_ROWS\b|\bSQL_NO_CACHE\b|\bSQL_CACHE\b|\bSTRAIGHT_JOIN\b|\bHIGH_PRIORITY\b/gi, '');
      s = s.replace(/\bFOR\s+UPDATE\b|\bLOCK\s+IN\s+SHARE\s+MODE\b/gi, '');
      s = s.replace(/\bLIMIT\s+(\d+)\s*,\s*(\d+)/gi, 'LIMIT $2 OFFSET $1');
      return { kind: 'query', sql: s, notes };
    }
    if (first === 'CALL' || first === 'DELIMITER' || first === 'SOURCE' || first === 'LOAD') throw compatError(first, '模擬環境不支援這個指令。');
    // 其他語句照原樣嘗試
    return { kind: 'query', sql: join(rewriteExpressions(tokens, notes)), notes };
  }

  // ---------------------------------------------------------------------------
  // 錯誤翻譯
  // ---------------------------------------------------------------------------
  function levenshtein(a, b) {
    a = a.toLowerCase(); b = b.toLowerCase();
    const m = a.length, n = b.length; if (!m) return n; if (!n) return m;
    const dp = Array.from({ length: m + 1 }, (_, i) => [i, ...Array(n).fill(0)]);
    for (let j = 1; j <= n; j++) dp[0][j] = j;
    for (let i = 1; i <= m; i++) for (let j = 1; j <= n; j++) {
      dp[i][j] = Math.min(dp[i - 1][j] + 1, dp[i][j - 1] + 1, dp[i - 1][j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1));
      // 相鄰字元交換（nmae → name）視為一步
      if (i > 1 && j > 1 && a[i - 1] === b[j - 2] && a[i - 2] === b[j - 1]) dp[i][j] = Math.min(dp[i][j], dp[i - 2][j - 2] + 1);
    }
    return dp[m][n];
  }
  function closest(name, candidates) {
    let best = null, bestD = Infinity;
    for (const c of candidates) { const d = levenshtein(name, c); if (d < bestD) { bestD = d; best = c; } }
    return bestD <= Math.max(2, Math.floor(name.length / 3)) ? best : null;
  }
  const FULLWIDTH = /[，；（）「」『』‘’“”、：！？．　]/;

  /**
   * @param {Error} err
   * @param {string} sql 原始 SQL
   * @param {{tables: string[], columns: string[]}} schema
   */
  function translateError(err, sql, schema) {
    const msg = err.message || String(err);
    if (err.compat) return { title: '模擬環境限制', text: msg, level: 'compat' };
    let m;
    const hints = [];
    if (FULLWIDTH.test(sql)) hints.push('SQL 裡出現全形標點（例如「，」或「（」），SQL 只認半形的 , ( ) \' ; 等符號。');
    if ((m = msg.match(/no such table: (\S+)/))) {
      const s = closest(m[1], schema.tables);
      return { title: `找不到資料表「${m[1]}」`, text: s ? `你是不是想找「${s}」？` : '用 SHOW TABLES; 看看有哪些資料表。', level: 'user', hints };
    }
    if ((m = msg.match(/no such column: (\S+)/))) {
      const col = m[1].split('.').pop();
      const s = closest(col, schema.columns);
      const extra = !s ? ' 如果你想比對的是文字，記得用單引號包起來，例如 「港東區」外面加上英文單引號。' : '';
      return { title: `找不到欄位「${m[1]}」`, text: (s ? `你是不是想用「${s}」？` : '用 DESCRIBE 資料表名; 看看欄位名稱。') + extra, level: 'user', hints };
    }
    if ((m = msg.match(/ambiguous column name: (\S+)/))) return { title: `欄位「${m[1]}」有歧義`, text: `多張表都有「${m[1]}」這個欄位，請加上表名或別名，例如 p.${m[1].split('.').pop()}。`, level: 'user', hints };
    if ((m = msg.match(/near "(.+?)": syntax error/))) {
      const near = m[1];
      let tip = '檢查這個位置前後：關鍵字順序（SELECT → FROM → WHERE → GROUP BY → HAVING → ORDER BY → LIMIT）、逗號、括號與引號。';
      if (/^(FROM|WHERE|GROUP|ORDER|HAVING|LIMIT)$/i.test(near)) tip = `「${near}」前面可能少了東西，或多了一個逗號。`;
      if (near === ',') tip = '多了一個逗號？欄位清單最後一個欄位後面不能有逗號。';
      if (near === ')' || near === '(') tip = '括號沒有成對，或括號裡是空的。';
      if (/^'/.test(near)) tip = '字串前面可能少了運算子（= 或 LIKE），或引號沒有關好。';
      return { title: `語法錯誤：在「${near}」附近`, text: tip, level: 'user', hints };
    }
    if (/incomplete input/.test(msg)) return { title: 'SQL 不完整', text: '引號或括號沒有關閉，或語句在中途就結束了。', level: 'user', hints };
    if ((m = msg.match(/unrecognized token: "(.+?)"/))) return { title: `無法辨識的符號「${m[1]}」`, text: hints.length ? hints.shift() : '這個符號 SQL 不認得，請確認是不是打錯或用了中文標點。', level: 'user', hints };
    if (/misuse of aggregate/.test(msg)) return { title: '聚合函數用錯位置', text: 'COUNT、SUM、AVG 這類函數不能放在 WHERE 裡，請改用 HAVING（在 GROUP BY 之後）。', level: 'user', hints };
    if (/a GROUP BY clause is required before HAVING/.test(msg)) return { title: 'HAVING 前面需要 GROUP BY', text: 'HAVING 是用來篩選分組結果的，請先加上 GROUP BY。', level: 'user', hints };
    if ((m = msg.match(/no such function: (\S+)/))) return { title: `找不到函數「${m[1]}」`, text: `MariaDB 可能有這個函數，但模擬環境尚未支援；也請檢查拼字是否正確。`, level: 'compat', hints };
    if ((m = msg.match(/UNIQUE constraint failed: (\S+)/))) return { title: '主鍵或唯一值重複', text: `欄位 ${m[1]} 已經有相同的值，MariaDB 會回報 Duplicate entry 錯誤。`, level: 'user', hints };
    if ((m = msg.match(/NOT NULL constraint failed: (\S+)/))) return { title: '必填欄位沒有值', text: `欄位 ${m[1]} 宣告為 NOT NULL，新增或更新時必須給值。`, level: 'user', hints };
    if (/FOREIGN KEY constraint failed/.test(msg)) return { title: '外鍵約束失敗', text: '參照的資料不存在，或被參照的資料仍有子資料。', level: 'user', hints };
    if ((m = msg.match(/table (\S+) already exists/))) return { title: `資料表「${m[1]}」已存在`, text: '要重建請先 DROP TABLE，或改用 CREATE TABLE IF NOT EXISTS。', level: 'user', hints };
    if ((m = msg.match(/table (\S+) has no column named (\S+)/))) { const s = closest(m[2], schema.columns); return { title: `資料表「${m[1]}」沒有欄位「${m[2]}」`, text: s ? `你是不是想用「${s}」？` : '用 DESCRIBE 檢查欄位名稱。', level: 'user', hints }; }
    if (/(\d+) values for (\d+) columns/.test(msg)) { m = msg.match(/(\d+) values for (\d+) columns/); return { title: '值的數量與欄位不符', text: `你給了 ${m[1]} 個值，但資料表有 ${m[2]} 個欄位。請指定欄位清單，或補齊每個欄位的值。`, level: 'user', hints }; }
    if (/duplicate column name/.test(msg)) return { title: '欄位名稱重複', text: msg.replace('duplicate column name:', '重複的欄位：'), level: 'user', hints };
    if (/no such index/.test(msg)) return { title: '找不到索引', text: msg, level: 'user', hints };
    if (/cannot drop column/.test(msg) || /cannot add a PRIMARY KEY column/.test(msg)) return { title: '模擬環境限制', text: 'SQLite 對 ALTER TABLE 的支援有限：' + msg, level: 'compat', hints };
    if (/SELECTs to the left and right of UNION do not have the same number of result columns/.test(msg)) return { title: 'UNION 兩邊欄位數不同', text: 'UNION 上下兩個 SELECT 必須選出相同數量的欄位。', level: 'user', hints };
    if (/datatype mismatch/.test(msg)) return { title: '資料型別不符', text: '寫入的值型別與欄位不符，例如把文字塞進整數主鍵。', level: 'user', hints };
    if (/too many terms in ORDER BY/.test(msg) || /ORDER BY term out of range/.test(msg)) return { title: 'ORDER BY 位置超出範圍', text: 'ORDER BY 用數字時，數字不能超過 SELECT 的欄位數。', level: 'user', hints };
    if (/REGEXP 樣式無效/.test(msg)) return { title: 'REGEXP 樣式無效', text: msg, level: 'user', hints };
    if (/sub-select returns \d+ columns - expected 1/.test(msg)) return { title: '子查詢欄位過多', text: '放在 WHERE ... IN (...) 或 = (...) 裡的子查詢只能選出一個欄位。', level: 'user', hints };
    if (/row value misused/.test(msg)) return { title: '子查詢或括號用法有誤', text: '用 = 比較子查詢時，子查詢只能回傳一列一欄；多列請改用 IN。', level: 'user', hints };
    return { title: '執行錯誤', text: msg, level: 'unknown', hints };
  }

  window.SD.compat = { tokenize, splitStatements, rewriteStatement, registerFunctions, translateError, TYPE_MAP };
})();
