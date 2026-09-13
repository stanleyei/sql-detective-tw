/*
 * 資料庫執行封裝：載入 sql.js、匯入種子資料、註冊相容函數，
 * 並提供 run(sql) 一次執行多語句、回傳結構化結果。
 */
(function () {
  'use strict';
  window.SD = window.SD || {};
  const compat = window.SD.compat;
  const MAX_ROWS = 500;

  let SQL = null;
  let db = null;
  let schemaCache = null;

  /** @param {Uint8Array|null} snapshot 先前 export() 的資料庫快照；有效就還原，否則重建種子 */
  async function init(snapshot) {
    if (db) return db;
    SQL = await initSqlJs({ locateFile: (f) => `./vendor/${f}` });
    if (snapshot) {
      try { createDb(snapshot); return db; } catch (e) { /* 快照損毀就退回種子資料 */ }
    }
    createDb();
    return db;
  }

  function createDb(snapshot) {
    if (db) db.close();
    db = snapshot ? new SQL.Database(snapshot) : new SQL.Database();
    db.exec('PRAGMA foreign_keys = OFF;');
    if (!snapshot) db.exec(window.SD_SEED);
    else db.exec('SELECT COUNT(*) FROM person'); // 驗證快照可讀
    compat.registerFunctions(db);
    schemaCache = null;
  }

  function reset() { createDb(); }
  function exportDb() { return db.export(); }

  /** 回傳 { tables: [...], columns: [...], byTable: {t: [{name,type,pk,notnull,dflt}]} } */
  function schema() {
    if (schemaCache) return schemaCache;
    const tables = db.exec("SELECT name FROM sqlite_master WHERE type='table' AND name NOT LIKE 'sqlite_%' ORDER BY name");
    const names = tables.length ? tables[0].values.map((r) => r[0]) : [];
    const byTable = {};
    const columns = new Set();
    for (const t of names) {
      const info = db.exec(`PRAGMA table_info("${t}")`);
      byTable[t] = (info.length ? info[0].values : []).map((r) => ({ cid: r[0], name: r[1], type: r[2], notnull: r[3], dflt: r[4], pk: r[5] }));
      byTable[t].forEach((c) => columns.add(c.name));
    }
    schemaCache = { tables: names, columns: [...columns], byTable };
    return schemaCache;
  }

  function invalidateSchema() { schemaCache = null; }

  /** MariaDB 風格的 DESCRIBE 輸出 */
  function describe(table, column) {
    const s = schema();
    const real = s.tables.find((t) => t.toLowerCase() === table.toLowerCase());
    if (!real) { const e = new Error(`no such table: ${table}`); throw e; }
    const uniques = new Set();
    const idx = db.exec(`PRAGMA index_list("${real}")`);
    if (idx.length) for (const r of idx[0].values) { if (r[2] === 1) { const ii = db.exec(`PRAGMA index_info("${r[1]}")`); if (ii.length && ii[0].values.length === 1) uniques.add(ii[0].values[0][2]); } }
    const create = db.exec(`SELECT sql FROM sqlite_master WHERE name='${real}'`)[0].values[0][0] || '';
    const rows = s.byTable[real].filter((c) => !column || c.name.toLowerCase() === column.toLowerCase()).map((c) => {
      const auto = c.pk && /AUTOINCREMENT/i.test(create) && new RegExp(`${c.name}\\s+INTEGER\\s+PRIMARY\\s+KEY\\s+AUTOINCREMENT`, 'i').test(create);
      const typeMap = { INTEGER: 'int(11)', TEXT: 'varchar(255)', REAL: 'double', BLOB: 'blob' };
      return [c.name, typeMap[(c.type || '').toUpperCase().split(' ')[0]] || (c.type || 'text').toLowerCase(), c.notnull || c.pk ? 'NO' : 'YES', c.pk ? 'PRI' : uniques.has(c.name) ? 'UNI' : '', c.dflt === null ? null : String(c.dflt).replace(/^'(.*)'$/, '$1'), auto ? 'auto_increment' : ''];
    });
    return { columns: ['Field', 'Type', 'Null', 'Key', 'Default', 'Extra'], values: rows };
  }

  function showCreate(table) {
    const r = db.exec(`SELECT name, sql FROM sqlite_master WHERE type='table' AND lower(name)=lower('${table.replace(/'/g, "''")}')`);
    if (!r.length) throw new Error(`no such table: ${table}`);
    return { columns: ['Table', 'Create Table'], values: [[r[0].values[0][0], r[0].values[0][1] + ' ENGINE=InnoDB DEFAULT CHARSET=utf8mb4']] };
  }

  function showIndex(table) {
    const r = db.exec(`PRAGMA index_list("${table}")`);
    const rows = [];
    const s = schema();
    const real = s.tables.find((t) => t.toLowerCase() === table.toLowerCase());
    if (!real) throw new Error(`no such table: ${table}`);
    const pk = s.byTable[real].filter((c) => c.pk);
    pk.forEach((c, i) => rows.push([real, 0, 'PRIMARY', i + 1, c.name, 'BTREE']));
    if (r.length) for (const ix of r[0].values) {
      const ii = db.exec(`PRAGMA index_info("${ix[1]}")`);
      if (ii.length) ii[0].values.forEach((c) => rows.push([real, ix[2] ? 0 : 1, ix[1], c[0] + 1, c[2], 'BTREE']));
    }
    return { columns: ['Table', 'Non_unique', 'Key_name', 'Seq_in_index', 'Column_name', 'Index_type'], values: rows };
  }

  function tableStatus() {
    const s = schema();
    return { columns: ['Name', 'Engine', 'Rows', 'Collation'], values: s.tables.map((t) => [t, 'InnoDB', db.exec(`SELECT COUNT(*) FROM "${t}"`)[0].values[0][0], 'utf8mb4_general_ci']) };
  }

  function runMeta(meta) {
    switch (meta.op) {
      case 'describe': return { type: 'result', ...describe(meta.table, meta.column) };
      case 'showcreate': return { type: 'result', ...showCreate(meta.table) };
      case 'showindex': return { type: 'result', ...showIndex(meta.table) };
      case 'tablestatus': return { type: 'result', ...tableStatus() };
      case 'use': return { type: 'message', text: `Database changed（模擬環境只有 chaogang_police 一個資料庫，USE 不會有任何改變）` };
      case 'createdb': return { type: 'message', text: `模擬環境無法建立新資料庫，但 MariaDB 上 CREATE DATABASE ${meta.db} 是正確的寫法。請直接在目前資料庫建表。` };
      case 'dropdb': return { type: 'message', text: '模擬環境不允許刪除資料庫。若要復原資料，請按「重置資料庫」。' };
      case 'txn': return { type: 'message', text: `${meta.what}：模擬環境每次執行都會自動提交，交易指令不會有作用。` };
      case 'noop': return { type: 'message', text: `${meta.what} 指令已略過（模擬環境不需要）。` };
      case 'help': return { type: 'message', text: '試試 SHOW TABLES; 或 DESCRIBE person; 開始探索，右側的「語法小抄」也有常用指令。' };
      case 'info': return { type: 'result', columns: ['Variable_name', 'Value'], values: [['version', '11.4.0-MariaDB (模擬)'], ['character_set_database', 'utf8mb4'], ['sql_mode', 'STRICT_TRANS_TABLES']] };
      default: return { type: 'message', text: '已略過。' };
    }
  }

  /**
   * 執行一段可能含多個語句的 SQL。
   * 回傳陣列，每個元素：
   *  { type:'result', columns, values, truncated, total, sql, notes }
   *  { type:'affected', count, sql, notes }
   *  { type:'message', text, sql, notes }
   *  { type:'error', title, text, level, hints, sql }
   */
  function run(text) {
    const statements = compat.splitStatements(text);
    const out = [];
    for (const raw of statements) {
      let rewritten;
      try {
        rewritten = compat.rewriteStatement(raw);
      } catch (e) {
        out.push({ type: 'error', ...compat.translateError(e, raw, schema()), sql: raw });
        if (e.compat) continue;
        break;
      }
      if (!rewritten) continue;
      try {
        if (rewritten.kind === 'meta') {
          out.push({ ...runMeta(rewritten.meta), sql: raw, notes: rewritten.notes });
          continue;
        }
        const sqls = Array.isArray(rewritten.sql) ? rewritten.sql : [rewritten.sql];
        let last = null;
        let affected = 0;
        for (const s of sqls) {
          const stmt = db.prepare(s);
          const columns = stmt.getColumnNames();
          const values = [];
          let total = 0;
          while (stmt.step()) { total++; if (values.length < MAX_ROWS) values.push(stmt.get()); }
          stmt.free();
          if (columns.length) last = { type: 'result', columns, values, truncated: total > MAX_ROWS, total };
          else { affected += db.getRowsModified(); last = null; }
        }
        if (rewritten.kind === 'ddl') { invalidateSchema(); out.push({ type: 'message', text: 'Query OK（結構已更新）', sql: raw, notes: rewritten.notes, ddl: true }); }
        else if (last) out.push({ ...last, sql: raw, notes: rewritten.notes });
        else out.push({ type: 'affected', count: affected, sql: raw, notes: rewritten.notes });
      } catch (e) {
        out.push({ type: 'error', ...compat.translateError(e, raw, schema()), sql: raw, rewritten: rewritten.sql });
        break;
      }
    }
    return out;
  }

  /** 供任務檢核用的靜默查詢：回傳 {columns, values} 或 null */
  function query(sql) {
    try {
      const r = db.exec(sql);
      return r.length ? { columns: r[0].columns, values: r[0].values } : { columns: [], values: [] };
    } catch (e) { return null; }
  }

  window.SD.db = { init, reset, run, query, schema, describe, export: exportDb, get raw() { return db; } };
})();
