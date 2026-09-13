#!/usr/bin/env node
/**
 * 相容層測試：在 Node 端模擬瀏覽器全域，把一批 MariaDB 語法丟進 SD.db.run，
 * 確認都能執行且結果符合預期。執行：npm run test:compat
 */
const path = require('path');
const fs = require('fs');
const initSqlJs = require('sql.js');

global.window = global;
global.initSqlJs = initSqlJs;
global.crypto = require('crypto').webcrypto;
require(path.join(__dirname, '..', 'js', 'engine', 'seed.js'));
require(path.join(__dirname, '..', 'js', 'engine', 'mariadb-compat.js'));
require(path.join(__dirname, '..', 'js', 'engine', 'db.js'));

const CASES = [
  // [sql, 檢查函數(results) → true/false 或錯誤訊息]
  ['SHOW TABLES;', (r) => r[0].type === 'result' && r[0].values.length >= 17],
  ['SHOW DATABASES', (r) => r[0].values.length === 2],
  ['DESCRIBE person;', (r) => r[0].columns[0] === 'Field' && r[0].values.some((v) => v[0] === 'name')],
  ['DESC crime_report', (r) => r[0].values.length === 5],
  ['SHOW COLUMNS FROM store', (r) => r[0].values.length === 7],
  ['SHOW FULL COLUMNS FROM store', (r) => r[0].columns.length === 9 && r[0].columns[8] === 'Comment' && r[0].values.length === 7],
  ['SHOW CREATE TABLE person', (r) => /CREATE TABLE/.test(r[0].values[0][1])],
  ['SELECT * FROM person LIMIT 3;', (r) => r[0].values.length === 3],
  ['SELECT name, district FROM person WHERE district = "港東區" LIMIT 5', (r) => r[0].values.length === 5],
  ['SELECT * FROM person LIMIT 2, 3', (r) => r[0].values.length === 3 && r[0].values[0][0] === 3],
  ['SELECT 7/2 AS a, 7 DIV 2 AS b, 7 % 2 AS c, MOD(7,2) AS d', (r) => r[0].values[0].join() === '3.5,3,1,1'],
  ['SELECT CONCAT(name, "(", district, ")") FROM person WHERE id = 1', (r) => r[0].values[0][0] === '林曉青(中央區)'],
  ["SELECT CONCAT('a', NULL) AS x, CONCAT_WS('-', 'a', NULL, 'b') AS y, IFNULL(NULL, 'z') AS z", (r) => r[0].values[0].join() === ',a-b,z'],
  ["SELECT YEAR('2025-03-08'), MONTH('2025-03-08 21:30:00'), DAY('2025-03-08'), HOUR('2025-03-08 21:30:00'), MINUTE('21:30:15'), DAYOFWEEK('2025-03-08'), WEEKDAY('2025-03-08'), DAYNAME('2025-03-08')", (r) => r[0].values[0].join() === '2025,3,8,21,30,7,5,Saturday'],
  ["SELECT DATE_FORMAT('2025-03-08 21:05:09', '%Y/%m/%d %H:%i:%s %W %p')", (r) => r[0].values[0][0] === '2025/03/08 21:05:09 Saturday PM'],
  ["SELECT DATE_ADD('2025-03-08', INTERVAL 10 DAY), DATE_SUB('2025-03-08 21:30:00', INTERVAL 40 MINUTE), DATE_ADD('2025-01-31', INTERVAL 1 MONTH)", (r) => r[0].values[0].join() === '2025-03-18,2025-03-08 20:50:00,2025-03-03'],
  ["SELECT '2025-03-08' + INTERVAL 1 DAY AS a, '2025-03-08 10:00:00' - INTERVAL 2 HOUR AS b", (r) => r[0].values[0].join() === '2025-03-09,2025-03-08 08:00:00'],
  ["SELECT report_date + INTERVAL 7 DAY FROM crime_report WHERE id = 1", (r) => /^\d{4}-\d{2}-\d{2}$/.test(r[0].values[0][0])],
  ["SELECT DATEDIFF('2025-03-10', '2025-03-08'), TIMESTAMPDIFF(MINUTE, '2025-03-08 21:00:00', '2025-03-08 22:30:00'), TIMESTAMPDIFF(YEAR, '1990-05-01', '2025-03-08')", (r) => r[0].values[0].join() === '2,90,34'],
  ["SELECT LEFT('ABC-1234', 3), RIGHT('ABC-1234', 3), MID('ABC-1234', 5, 2), SUBSTRING('ABC-1234', 5), LOCATE('-', 'ABC-1234'), LPAD('7', 3, '0'), RPAD('7', 3, '*'), REPEAT('ab', 2), REVERSE('abc'), CHAR_LENGTH('中文'), UCASE('abc')", (r) => r[0].values[0].join() === 'ABC,234,12,1234,4,007,7**,abab,cba,2,ABC'],
  ["SELECT POSITION('-' IN 'ABC-1234'), TRIM(BOTH 'x' FROM 'xxaxx'), TRIM(LEADING '0' FROM '0012'), EXTRACT(YEAR FROM '2025-03-08')", (r) => r[0].values[0].join() === '4,a,12,2025'],
  ["SELECT IF(1 > 2, 'yes', 'no'), IF(NULL, 1, 2), CASE WHEN 1 THEN 'a' ELSE 'b' END", (r) => r[0].values[0].join() === 'no,2,a'],
  ["SELECT FLOOR(2.7), CEIL(2.1), CEILING(2.1), ROUND(2.456, 2), TRUNCATE(2.456, 1), POWER(2, 10), SQRT(16), ABS(-3), PI() > 3, GREATEST(1, 9, 3), LEAST(4, 2, 8)", (r) => r[0].values[0].join() === '2,3,3,2.46,2.4,1024,4,3,1,9,2'],
  ["SELECT COUNT(*), SUM(est_value), AVG(est_value), MIN(est_value), MAX(est_value) FROM lost_item", (r) => r[0].values[0][0] > 100],
  ["SELECT station, COUNT(*) AS c FROM lost_item GROUP BY station HAVING c > 5 ORDER BY c DESC", (r) => r[0].values.length > 0],
  ["SELECT GROUP_CONCAT(item_name SEPARATOR ' | ') FROM lost_item WHERE claimed_by = 14", (r) => r[0].values[0][0].split(' | ').length === 7],
  ["SELECT GROUP_CONCAT(DISTINCT district ORDER BY district SEPARATOR ',') FROM person", (r) => r[0].values[0][0] === '中央區,山城區,海濱區,港東區,港西區'],
  ["SELECT GROUP_CONCAT(name) FROM person WHERE id <= 2", (r) => r[0].values[0][0] === '林曉青,陳大川'],
  ["SELECT STDDEV(est_value) > 0, VARIANCE(est_value) > 0, STD(est_value) > 0 FROM lost_item", (r) => r[0].values[0].join() === '1,1,1'],
  ["SELECT p.name, d.plate_number FROM person p INNER JOIN driver_license d ON p.license_id = d.id WHERE d.plate_number LIKE 'MKJ%'", (r) => r[0].values.length === 4],
  ["SELECT p.name, e.title FROM person p LEFT JOIN employee e ON e.person_id = p.id WHERE p.id <= 3", (r) => r[0].values.length === 3],
  ["SELECT p.name FROM person p RIGHT JOIN employee e ON e.person_id = p.id WHERE e.company_id = 1 AND e.title = '經理'", (r) => r[0].values.length >= 1],
  ["SELECT name FROM person WHERE name REGEXP '^林' LIMIT 3", (r) => r[0].values.length === 3],
  ["SELECT name FROM person WHERE name RLIKE '^林' LIMIT 3", (r) => r[0].values.length === 3],
  ["SELECT 1 && 1, 1 || 0, NOT 0, 1 XOR 0, NULL <=> NULL, 1 <> 2, 1 != 2", (r) => r[0].values[0].join() === '1,1,1,1,1,1,1'],
  ["SELECT NOW() IS NOT NULL, CURDATE() LIKE '20%', CURRENT_TIMESTAMP IS NOT NULL, CURRENT_DATE() LIKE '20%', DATABASE(), VERSION() LIKE '%MariaDB%'", (r) => r[0].values[0].join() === '1,1,1,1,chaogang_police,1'],
  ["SELECT * FROM (SELECT district, COUNT(*) AS n FROM person GROUP BY district) AS t WHERE n > 50", (r) => r[0].values.length >= 1],
  ["SELECT name FROM person WHERE id IN (SELECT person_id FROM interview WHERE report_id = (SELECT id FROM crime_report WHERE crime_type = '命案'))", (r) => r[0].values.length === 4],
  ["SELECT name FROM person WHERE EXISTS (SELECT 1 FROM gym_member g WHERE g.person_id = person.id AND g.id LIKE '48Z%')", (r) => r[0].values.length === 2],
  // # 註解、雙引號、反斜線
  ["SELECT 1 # 這是註解\n, 2", (r) => r[0].values[0].join() === '1,2'],
  ["SELECT 'it\\'s', \"say \\\"hi\\\"\"", (r) => r[0].values[0].join() === "it's,say \"hi\""],
  ["SELECT `name` FROM `person` WHERE `id` = 1", (r) => r[0].values[0][0] === '林曉青'],
  // DDL
  ["CREATE TABLE evidence (id INT AUTO_INCREMENT PRIMARY KEY, case_id INT NOT NULL, item VARCHAR(100) NOT NULL, found_at DATETIME DEFAULT CURRENT_TIMESTAMP, note TEXT, INDEX idx_case (case_id)) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;", (r) => r[0].type === 'message'],
  ["INSERT INTO evidence (case_id, item) VALUES (1, '指紋'), (1, '監視器畫面');", (r) => r[0].type === 'affected' && r[0].count === 2],
  ["INSERT INTO evidence SET case_id = 2, item = '鞋印'", (r) => r[0].count === 1],
  ["SELECT id, item, found_at IS NOT NULL FROM evidence ORDER BY id", (r) => r[0].values.map((v) => v[0]).join() === '1,2,3' && r[0].values[0][2] === 1],
  ["SELECT LAST_INSERT_ID()", (r) => r[0].values[0][0] === 3],
  ["DESCRIBE evidence", (r) => r[0].values[0][5] === 'auto_increment' && r[0].values[0][3] === 'PRI'],
  ["UPDATE evidence SET note = '已送鑑識' WHERE case_id = 1 ORDER BY id LIMIT 1", (r) => r[0].count === 1],
  ["SELECT COUNT(*) FROM evidence WHERE note IS NULL", (r) => r[0].values[0][0] === 2],
  ["DELETE FROM evidence ORDER BY id DESC LIMIT 1", (r) => r[0].count === 1],
  ["ALTER TABLE evidence ADD COLUMN weight DECIMAL(6,2) UNSIGNED DEFAULT 0 AFTER item", (r) => r[0].type === 'message'],
  ["ALTER TABLE evidence MODIFY COLUMN note VARCHAR(500)", (r) => r[0].type === 'message'],
  ["ALTER TABLE evidence CHANGE item item_name VARCHAR(200) NOT NULL", (r) => r[0].type === 'message'],
  ["SELECT item_name, weight, note FROM evidence ORDER BY id", (r) => r[0].values.length === 2 && r[0].values[0][0] === '指紋' && r[0].values[0][2] === '已送鑑識'],
  ["ALTER TABLE evidence DROP COLUMN weight", (r) => r[0].type === 'message'],
  ["ALTER TABLE evidence ADD INDEX idx_item (item_name)", (r) => r[0].type === 'message'],
  ["SHOW INDEX FROM evidence", (r) => r[0].values.some((v) => v[2] === 'idx_item')],
  ["INSERT INTO evidence (id, case_id, item_name) VALUES (1, 9, 'X') ON DUPLICATE KEY UPDATE case_id = VALUES(case_id)", (r) => r[0].type === 'affected'],
  ["SELECT case_id FROM evidence WHERE id = 1", (r) => r[0].values[0][0] === 9],
  ["INSERT IGNORE INTO evidence (id, case_id, item_name) VALUES (1, 5, 'Y')", (r) => r[0].type === 'affected' && r[0].count === 0],
  ["REPLACE INTO evidence (id, case_id, item_name) VALUES (1, 7, 'Z')", (r) => r[0].type === 'affected'],
  ["TRUNCATE TABLE evidence", (r) => r[0].type === 'affected'],
  ["INSERT INTO evidence (case_id, item_name) VALUES (3, '重新開始')", (r) => r[0].count === 1],
  ["SELECT id FROM evidence", (r) => r[0].values[0][0] === 1],
  ["RENAME TABLE evidence TO evidence2", (r) => r[0].type === 'message'],
  ["DROP TABLE IF EXISTS evidence2", (r) => r[0].type === 'message'],
  ["CREATE TABLE t2 (a INT, b VARCHAR(10), PRIMARY KEY (a), UNIQUE KEY uq_b (b), KEY k (b)) ENGINE=InnoDB", (r) => r[0].type === 'message'],
  ["CREATE TABLE t3 (id INT NOT NULL AUTO_INCREMENT, v ENUM('a','b') DEFAULT 'a', PRIMARY KEY (id))", (r) => r[0].type === 'message'],
  ["INSERT INTO t3 (v) VALUES ('b'), ('a')", (r) => r[0].count === 2],
  ["SELECT id, v FROM t3", (r) => r[0].values.length === 2 && r[0].values[1][0] === 2],
  ["CREATE TABLE t4 AS SELECT id, name FROM person WHERE id <= 5", (r) => r[0].type === 'message'],
  ["SELECT COUNT(*) FROM t4", (r) => r[0].values[0][0] === 5],
  ["USE chaogang_police", (r) => r[0].type === 'message'],
  ["CREATE DATABASE school", (r) => r[0].type === 'message'],
  ["SELECT * FROM t4 WHERE name = 'abc' or 1=1; DROP TABLE t4; SELECT 1", (r) => r.length === 3 && r[2].values[0][0] === 1],
  // 錯誤翻譯
  ["SELECT * FROM persons", (r) => r[0].type === 'error' && /person/.test(r[0].text)],
  ["SELECT nmae FROM person", (r) => r[0].type === 'error' && /name/.test(r[0].text)],
  ["SELECT name FROM person WHERE district = 港東區", (r) => r[0].type === 'error' && /單引號/.test(r[0].text)],
  ["SELECT name， district FROM person", (r) => r[0].type === 'error' && /全形/.test(r[0].text + r[0].hints.join())],
  ["SELECT COUNT(*) FROM person WHERE COUNT(*) > 1", (r) => r[0].type === 'error' && /HAVING/.test(r[0].text)],
  ["SELECT name FROM person p JOIN employee e ON e.person_id = p.id WHERE id = 1", (r) => r[0].type === 'error' && /歧義/.test(r[0].title)],
  ["SELECT name FROM person WHERE", (r) => r[0].type === 'error'],
  ["ALTER TABLE person ADD PRIMARY KEY (id)", (r) => r[0].type === 'error' && r[0].level === 'compat'],
  ["CREATE PROCEDURE p() BEGIN END", (r) => r[0].type === 'error' && r[0].level === 'compat'],
  // 案件驗證
  ["SELECT p.name FROM driver_license d JOIN person p ON p.license_id = d.id WHERE d.plate_number LIKE 'MKJ%' AND d.car_color = '白' AND d.vehicle_type = '機車' AND d.height_cm BETWEEN 175 AND 180", (r) => r[0].values.length === 2],
  ["SELECT DISTINCT plate_number FROM cctv_log WHERE plate_number LIKE '%528' AND capture_time BETWEEN DATE_SUB('2025-04-12 23:30:00', INTERVAL 60 MINUTE) AND '2025-04-12 23:30:00'", (r) => r[0].values.length === 2],
  ["SELECT claimed_by, COUNT(*) AS cnt, SUM(est_value) AS total FROM lost_item WHERE status = '已領回' GROUP BY claimed_by HAVING cnt >= 3", (r) => r[0].values.length === 1 && r[0].values[0][0] === 14],
  ["SELECT p.name FROM access_log a JOIN employee e ON e.id = a.employee_id JOIN person p ON p.id = e.person_id WHERE a.door = '機房' AND a.event_time BETWEEN '2025-06-20 22:00:00' AND '2025-06-20 23:00:00'", (r) => r[0].values.length === 2 && r[0].values[0][0] === '許國棟'],
  ["SELECT e.id, p.name, m.name AS manager FROM employee e JOIN person p ON p.id = e.person_id LEFT JOIN employee me ON me.id = e.manager_id LEFT JOIN person m ON m.id = me.person_id WHERE e.company_id = 1 AND e.department = '研發部'", (r) => r[0].values.length >= 4],
  ["SELECT p.name FROM employee e JOIN person p ON p.id = e.person_id LEFT JOIN access_log a ON a.employee_id = e.id AND a.event_time LIKE '2025-06-20 2%' WHERE e.company_id = 1 AND e.department = '研發部' AND a.id IS NULL", (r) => r[0].values.length >= 2],
  ["INSERT INTO solution (answer) VALUES ('蔡明哲')", (r) => r[0].count === 1],
  ["SELECT answer FROM solution", (r) => r[0].values[0][0] === '蔡明哲'],
];

(async () => {
  await SD.db.init();
  let pass = 0, fail = 0;
  for (const [sql, check] of CASES) {
    let results;
    try { results = SD.db.run(sql); } catch (e) { results = [{ type: 'error', text: 'THROW ' + e.message }]; }
    let ok = false;
    try { ok = check(results); } catch (e) { ok = false; }
    if (ok) pass++;
    else { fail++; console.log('FAIL:', sql.replace(/\n/g, ' ')); console.log('   →', JSON.stringify(results).slice(0, 400)); }
  }
  console.log(`\n${pass} passed, ${fail} failed`);
  process.exit(fail ? 1 : 0);
})();
