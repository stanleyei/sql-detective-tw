/* SQL 語法上色：只用於顯示（教學卡片、結果上方的回顯），不影響執行 */
(function () {
  'use strict';
  window.SD = window.SD || {};
  const KW = new Set(('SELECT FROM WHERE AND OR NOT IN IS NULL LIKE BETWEEN ORDER BY ASC DESC LIMIT OFFSET DISTINCT AS GROUP HAVING JOIN INNER LEFT RIGHT OUTER ON CROSS UNION ALL CASE WHEN THEN ELSE END EXISTS INSERT INTO VALUES UPDATE SET DELETE CREATE TABLE ALTER DROP ADD COLUMN MODIFY CHANGE RENAME TO TRUNCATE PRIMARY KEY FOREIGN REFERENCES AUTO_INCREMENT DEFAULT UNIQUE INDEX SHOW TABLES DESCRIBE DESC DATABASES INTERVAL DAY HOUR MINUTE SECOND MONTH YEAR WEEK INT INTEGER VARCHAR TEXT DATETIME DATE DECIMAL CHAR IF USE WITH SEPARATOR TRUE FALSE').split(' '));
  const esc = (s) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');

  function highlight(sql) {
    const tokens = SD.compat.tokenize(sql);
    return tokens.map((t) => {
      const v = esc(t.value);
      if (t.type === 'string') return `<span class="sql-str">${v}</span>`;
      if (t.type === 'number') return `<span class="sql-num">${v}</span>`;
      if (t.type === 'comment') return `<span class="sql-cm">${v}</span>`;
      if (t.type === 'word') {
        if (KW.has(t.upper)) return `<span class="sql-kw">${v}</span>`;
        return v;
      }
      return v;
    }).join('').replace(/([A-Za-z_]+)(\s*)(\()/g, (m, name, ws, p) => (KW.has(name.toUpperCase()) ? m : `<span class="sql-fn">${name}</span>${ws}${p}`));
  }
  window.SD.highlight = highlight;
})();
