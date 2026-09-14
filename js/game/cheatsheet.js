/* MariaDB 語法小抄：右側抽屜用的靜態內容 */
(function () {
  'use strict';
  window.SD = window.SD || {};
  window.SD.cheatsheet = [
    { title: '探索', items: [
      ['SHOW TABLES;', '列出所有資料表'],
      ['DESCRIBE person;', '看欄位、型別、主鍵'],
      ['SHOW FULL COLUMNS FROM person;', '多出 Comment 欄：欄位中文備註'],
      ['SELECT * FROM person LIMIT 10;', '看前 10 筆'],
    ] },
    { title: '查詢骨架', items: [
      ['SELECT 欄位 FROM 表\nWHERE 條件\nGROUP BY 欄位\nHAVING 分組條件\nORDER BY 欄位 DESC\nLIMIT 10;', '關鍵字順序固定'],
      ['SELECT DISTINCT district FROM person;', '去重複'],
      ['SELECT name AS 姓名 FROM person;', 'AS 取別名'],
    ] },
    { title: 'WHERE 條件', items: [
      ["district = '港東區'", '等於（文字用單引號）'],
      ['birth_year > 2000', '大於；也有 < >= <= <> !='],
      ["a = 1 AND (b = 2 OR c = 3)", 'AND / OR / NOT，括號決定先後'],
      ["name LIKE '林%'", '% 任意長度、_ 一個字'],
      ['height_cm BETWEEN 175 AND 180', '含兩端'],
      ["district IN ('港東區', '港西區')", '在清單中'],
      ['phone IS NULL', '空值判斷（不能用 =）'],
    ] },
    { title: '聚合與分組', items: [
      ['COUNT(*), SUM(x), AVG(x), MIN(x), MAX(x)', '五大聚合函數'],
      ['SELECT station, COUNT(*) FROM lost_item\nGROUP BY station;', '分組統計'],
      ['... GROUP BY x HAVING COUNT(*) > 2', '篩選分組結果'],
      ["GROUP_CONCAT(item_name SEPARATOR '、')", '把一組值串成一行'],
    ] },
    { title: 'JOIN', items: [
      ['FROM employee e\nJOIN person p ON p.id = e.person_id', '內連結：兩邊都有才留'],
      ['LEFT JOIN access_log a ON a.employee_id = e.id', '左連結：左邊全留，右邊補 NULL'],
      ['JOIN employee me ON me.id = e.manager_id', 'SELF JOIN：同一張表用不同別名'],
    ] },
    { title: '子查詢', items: [
      ['WHERE house_no = (SELECT MAX(house_no) FROM person)', '單一值用 ='],
      ['WHERE id IN (SELECT person_id FROM gym_member)', '多個值用 IN'],
      ['WHERE EXISTS (SELECT 1 FROM t WHERE t.pid = p.id)', '存在即可'],
    ] },
    { title: '日期時間', items: [
      ['NOW(), CURDATE()', '現在、今天'],
      ['YEAR(d), MONTH(d), DAY(d), HOUR(d), MINUTE(d)', '取出部分'],
      ['DATE_ADD(d, INTERVAL 7 DAY)\nDATE_SUB(d, INTERVAL 40 MINUTE)', '加減時間'],
      ['DATEDIFF(d1, d2)', '差幾天'],
      ["DATE_FORMAT(d, '%Y/%m/%d %H:%i')", '格式化'],
    ] },
    { title: '字串與數學', items: [
      ["CONCAT(a, '-', b)", '串接'],
      ['LEFT(s, 3), RIGHT(s, 3), SUBSTRING(s, 5, 2)', '切字'],
      ['UPPER(s), LOWER(s), TRIM(s), LENGTH(s)', '大小寫、去空白、長度'],
      ['ROUND(x, 2), FLOOR(x), CEIL(x), ABS(x)', '四捨五入、取整'],
      ["CASE WHEN x > 10 THEN '高' ELSE '低' END", '條件輸出'],
      ["IF(x > 10, '高', '低'), IFNULL(x, 0)", '簡化版條件、空值替代'],
    ] },
    { title: '資料異動', items: [
      ["INSERT INTO t (a, b) VALUES (1, 'x');", '新增'],
      ["UPDATE t SET a = 2 WHERE id = 1;", '修改（一定要 WHERE）'],
      ['DELETE FROM t WHERE id = 1;', '刪除（一定要 WHERE）'],
      ['INSERT INTO t (a) SELECT a FROM other;', '從查詢新增'],
    ] },
    { title: '資料表', items: [
      ["CREATE TABLE t (\n  id INT AUTO_INCREMENT PRIMARY KEY,\n  name VARCHAR(100) NOT NULL,\n  created DATETIME DEFAULT CURRENT_TIMESTAMP\n);", '建表'],
      ['ALTER TABLE t ADD COLUMN x INT;', '加欄位'],
      ['ALTER TABLE t MODIFY COLUMN x VARCHAR(50);', '改型別'],
      ['ALTER TABLE t DROP COLUMN x;', '刪欄位'],
      ['DROP TABLE t;  TRUNCATE TABLE t;', '刪表 / 清空'],
      ['FOREIGN KEY (pid) REFERENCES person(id)', '外鍵'],
    ] },
  ];
})();
