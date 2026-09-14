/* 第 2 章 超商搶案：日期時間函數、INTERVAL、字串函數、CASE、運算與別名 */
SD.chapters.push({
  id: 2,
  slug: 'ch2',
  title: '超商監視器',
  subtitle: '時間、字串與 CASE',
  cover: './images/ch2.webp',
  skills: ['日期時間函數', 'DATE_SUB / INTERVAL', 'RIGHT / LEFT / CONCAT', 'CASE WHEN', 'AS 別名'],
  badge: { id: 'time', name: '時間旅人', img: './images/badge-time.webp', desc: '用日期時間函數重建案發時間線。' },
  steps: [
    { type: 'story', lines: [
      { who: 'narrator', text: '4 月 12 日深夜，港西區「海濱門市」便利商店。打烊前，一名戴口罩的女子衝進店裡，抓走收銀機裡的現金。' },
      { who: 'clerk', text: '我……我只記得她開一台銀色的車，車牌最後三碼是 528。時間大概是打烊前四十分鐘吧？我沒看時鐘。' },
      { who: 'mentor', text: '「打烊前四十分鐘」不是一個時間，是一道算式。這章要學的就是讓資料庫幫你算時間。' },
    ] },
    { type: 'task', id: 'c2-t1', title: '找出報案紀錄', prompt: '從 <code>crime_report</code> 找出 <strong>2025-04-12</strong> 發生在<strong>港西區</strong>的案件，顯示 <code>id</code>、<code>crime_type</code>、<code>description</code>。',
      lead: 'crime_report 表，日期與行政區兩個條件用 AND。',
      hints: ['兩個條件 AND。', "report_date = '2025-04-12' AND district = '港西區'", "<code>SELECT id, crime_type, description FROM crime_report WHERE report_date = '2025-04-12' AND district = '港西區';</code>"],
      check: { kind: 'result', cols: ['id', 'crime_type', 'description'], ordered: false },
      clue: { title: '案件 #50', text: '打烊前約 40 分鐘，戴口罩女子搶走收銀機現金，開銀色汽車，車牌後三碼 528。' } },
    { type: 'task', id: 'c2-t2', title: '幾點打烊？', prompt: '從 <code>store</code> 找出名稱為<strong>海濱門市</strong>的店，顯示 <code>name</code>、<code>open_time</code>、<code>close_time</code>。',
      lead: 'store 表，用 WHERE name = 比對店名。',
      hints: ["WHERE name = '海濱門市'", '店名是文字，記得單引號。', "<code>SELECT name, open_time, close_time FROM store WHERE name = '海濱門市';</code>"],
      check: { kind: 'result', cols: ['name', 'open_time', 'close_time'], ordered: false },
      clue: { title: '海濱門市營業時間', text: '06:00 開店、23:30 打烊。案發約在 22:50 前後。' } },
    { type: 'lesson', title: '讓資料庫幫你算時間', body: `
      <p>MariaDB 有一整組日期時間函數。最常用的：</p>
      <pre><code>NOW()                          -- 現在的日期時間
CURDATE()                      -- 今天
YEAR(d)  MONTH(d)  DAY(d)      -- 取出年、月、日
HOUR(d)  MINUTE(d)             -- 取出時、分
DATE_ADD(d, INTERVAL 7 DAY)    -- 往後 7 天
DATE_SUB(d, INTERVAL 40 MINUTE)-- 往前 40 分鐘
DATEDIFF(d1, d2)               -- 兩個日期差幾天</code></pre>
      <p>INTERVAL 後面的單位可以是 <code>SECOND</code>、<code>MINUTE</code>、<code>HOUR</code>、<code>DAY</code>、<code>MONTH</code>、<code>YEAR</code>。</p>
      <p>SELECT 不一定要 FROM 某張表，可以直接算：<code>SELECT DATE_SUB('2025-04-12 23:30:00', INTERVAL 40 MINUTE);</code></p>` },
    { type: 'task', id: 'c2-t3', title: '推算案發時間', prompt: '打烊時間是 <code>2025-04-12 23:30:00</code>。用 <code>DATE_SUB</code> 算出「打烊前 40 分鐘」是幾點。',
      hints: ['不需要 FROM，直接 SELECT 函數。', "DATE_SUB('2025-04-12 23:30:00', INTERVAL 40 MINUTE)", "<code>SELECT DATE_SUB('2025-04-12 23:30:00', INTERVAL 40 MINUTE);</code>"],
      check: { kind: 'value' },
      clue: { title: '推估案發時間', text: '2025-04-12 22:50:00。店員的印象不精確，搜尋時前後各留 20 分鐘緩衝。' } },
    { type: 'lesson', title: '時間也能 BETWEEN', body: `
      <p>日期時間在資料庫裡是有順序的文字，可以直接比大小：</p>
      <pre><code>WHERE capture_time BETWEEN '2025-04-12 22:30:00' AND '2025-04-12 23:10:00'</code></pre>
      <p>只想比「幾點」可以用 <code>HOUR(capture_time) = 22</code>。</p>` },
    { type: 'task', id: 'c2-t4', title: '案發前後的監視器', prompt: '從 <code>cctv_log</code> 找出 <code>camera_location</code> 為<strong>海濱門市前</strong>、<code>capture_time</code> 在 <strong>2025-04-12 22:30:00</strong> 到 <strong>2025-04-12 23:10:00</strong> 之間（兩端都要含日期）的紀錄，顯示 <code>capture_time</code>、<code>plate_number</code>、<code>note</code>，依時間<strong>由早到晚</strong>排序。',
      hints: ['地點用 =，時間用 BETWEEN，兩個時間都寫完整的「日期 時間」。', 'ORDER BY capture_time（由早到晚，不用加 DESC）', "<code>SELECT capture_time, plate_number, note FROM cctv_log WHERE camera_location = '海濱門市前' AND capture_time BETWEEN '2025-04-12 22:30:00' AND '2025-04-12 23:10:00' ORDER BY capture_time;</code>"],
      check: { kind: 'result', cols: ['capture_time', 'plate_number', 'note'], ordered: true },
      clue: { title: '門口監視器', text: '22:41 RBK-7528 銀色汽車停靠；22:47 QWE-9528 銀色汽車停靠；22:53 RBK-7528 快速離開。' } },
    { type: 'lesson', title: '字串函數：切、接、找', body: `
      <p>店員只記得車牌「最後三碼」。用字串函數取部分文字：</p>
      <pre><code>RIGHT(plate_number, 3)      -- 右邊 3 個字  'ABC-1234' → '234'
LEFT(plate_number, 3)       -- 左邊 3 個字  → 'ABC'
SUBSTRING(plate_number, 5)  -- 從第 5 個字開始 → '1234'
LENGTH(name)                -- 字串長度（位元組）
CONCAT(name, '（', district, '）')  -- 把多段文字接起來
UPPER(x)  LOWER(x)  TRIM(x) -- 大寫、小寫、去頭尾空白</code></pre>
      <p>函數可以放在 SELECT 裡（顯示用），也可以放在 WHERE 裡（篩選用）。</p>` },
    { type: 'task', id: 'c2-t5', title: '後三碼 528', prompt: '從 <code>driver_license</code> 找出車牌<strong>最後三碼是 528</strong> 的駕照，顯示 <code>plate_number</code>、<code>car_color</code>、<code>gender</code>、<code>person_id</code>。',
      hints: ["用 RIGHT(plate_number, 3) = '528'，或 LIKE '%528'。", '兩種寫法都對，試試看結果一樣嗎？', "<code>SELECT plate_number, car_color, gender, person_id FROM driver_license WHERE RIGHT(plate_number, 3) = '528';</code>"],
      check: { kind: 'result', cols: ['plate_number', 'car_color', 'gender', 'person_id'], ordered: false },
      clue: { title: '四張 528 車牌', text: 'RBK-7528 銀/女、TXA-2528 藍/女、QWE-9528 銀/男、LLP-0528 銀/女。' } },
    { type: 'task', id: 'c2-t6', title: '銀色、女性', prompt: '同上，但只留下 <code>car_color</code> 為 <code>\'銀\'</code> 且 <code>gender</code> 為 <code>\'女\'</code>（資料表用單字）的駕照，顯示 <code>plate_number</code> 與 <code>person_id</code>。',
      lead: '沿用上一題的 driver_license 查詢，在 WHERE 後面再 AND 兩個條件。',
      hints: ["加上 AND car_color = '銀' AND gender = '女'。", '三個條件都要成立。', "<code>SELECT plate_number, person_id FROM driver_license WHERE RIGHT(plate_number, 3) = '528' AND car_color = '銀' AND gender = '女';</code>"],
      check: { kind: 'result', cols: ['plate_number', 'person_id'], ordered: false },
      clue: { title: '剩兩張', text: 'RBK-7528（車主 9）與 LLP-0528（車主 12）。' } },
    { type: 'task', id: 'c2-t7', title: '交叉比對時間', prompt: '這兩張車牌，哪一張在 <strong>2025-04-12 22:30 到 23:10</strong> 之間出現在 <code>cctv_log</code>？（時間條件要含日期，其他日子也有紀錄）顯示<strong>不重複</strong>的 <code>plate_number</code>。',
      lead: 'cctv_log 表：車牌用 IN、時間用 BETWEEN（含日期），前面加 DISTINCT 去重。',
      hints: ["plate_number IN ('RBK-7528', 'LLP-0528')", '加上 BETWEEN 時間條件與 DISTINCT。', "<code>SELECT DISTINCT plate_number FROM cctv_log WHERE plate_number IN ('RBK-7528', 'LLP-0528') AND capture_time BETWEEN '2025-04-12 22:30:00' AND '2025-04-12 23:10:00';</code>"],
      check: { kind: 'value' },
      clue: { title: '鎖定車牌', text: 'RBK-7528。LLP-0528 當天只在 19:05 出現過，早已離開。' } },
    { type: 'lesson', title: 'AS：幫欄位取個好名字', body: `
      <p>算出來的欄位名稱會很醜，例如 <code>2025 - birth_year</code>。用 <code>AS</code> 取別名：</p>
      <pre><code>SELECT name, 2025 - birth_year AS age FROM person;</code></pre>
      <p>別名也能用在排序：<code>ORDER BY age DESC</code>。</p>` },
    { type: 'task', id: 'c2-t8', title: '車主檔案', prompt: 'RBK-7528 的車主編號是 9。從 <code>person</code> 找出她，顯示 <code>name</code>，並算出 <strong>2025 年時的年齡</strong>（<code>2025 - birth_year</code>），別名為 <code>age</code>。',
      hints: ['WHERE id = 9', 'SELECT name, 2025 - birth_year AS age', '<code>SELECT name, 2025 - birth_year AS age FROM person WHERE id = 9;</code>'],
      check: { kind: 'result', cols: null, ordered: false },
      clue: { title: '車主', text: '黃雅婷，32 歲，港西區造船街。' } },
    { type: 'task', id: 'c2-t9', title: '她說了什麼？', prompt: '從 <code>interview</code> 取出 <code>person_id</code> 為 <strong>9</strong> 的筆錄 <code>transcript</code>。',
      lead: 'interview 表，WHERE person_id = 編號，只 SELECT transcript。',
      hints: ['WHERE person_id = 9', 'SELECT transcript ...', '<code>SELECT transcript FROM interview WHERE person_id = 9;</code>'],
      check: { kind: 'value' },
      clue: { title: '黃雅婷筆錄', text: '「我那天晚上是有去海濱門市買東西，但我沒有搶錢。」她承認在場，但否認犯案。' } },
    { type: 'lesson', title: 'CASE WHEN：幫資料貼標籤', body: `
      <p><code>CASE</code> 像是 SQL 裡的 if / else，可以依條件輸出不同文字：</p>
      <pre><code>SELECT capture_time,
  CASE
    WHEN HOUR(capture_time) BETWEEN 6 AND 17 THEN '白天'
    WHEN HOUR(capture_time) BETWEEN 18 AND 23 THEN '晚上'
    ELSE '深夜'
  END AS period
FROM cctv_log;</code></pre>
      <p>由上到下比對，第一個成立的 WHEN 就是答案；都不成立走 ELSE。</p>` },
    { type: 'task', id: 'c2-t10', title: '她的車出現在什麼時段？', prompt: '列出 <code>cctv_log</code> 中車牌 <strong>RBK-7528</strong> 的所有紀錄，顯示 <code>capture_time</code>，並用 CASE 依小時標記 <code>period</code>（6~17 白天、18~23 晚上、其他深夜），依時間<strong>由早到晚</strong>排序。記得用 <code>AS period</code> 取別名。',
      hints: ['照上面的範例，把 FROM 後面加 WHERE 車牌條件。', "WHERE plate_number = 'RBK-7528' ORDER BY capture_time", "<code>SELECT capture_time, CASE WHEN HOUR(capture_time) BETWEEN 6 AND 17 THEN '白天' WHEN HOUR(capture_time) BETWEEN 18 AND 23 THEN '晚上' ELSE '深夜' END AS period FROM cctv_log WHERE plate_number = 'RBK-7528' ORDER BY capture_time;</code>"],
      check: { kind: 'result', cols: ['capture_time', 'period'], ordered: true } },
    { type: 'task', id: 'c2-t11', title: '格式化時間', prompt: '同樣是 RBK-7528 的紀錄，用 <code>DATE_FORMAT(capture_time, \'%m/%d %H:%i\')</code> 顯示成「月/日 時:分」，別名 <code>t</code>，並把 <code>camera_location</code> 一起列出，依時間<strong>由早到晚</strong>排序。',
      lead: '沿用上一題的 WHERE，把 SELECT 換成 DATE_FORMAT(...) AS t 與 camera_location。',
      hints: ["DATE_FORMAT 的格式符號：%Y 年、%m 月、%d 日、%H 時、%i 分。", 'ORDER BY capture_time（排序用原本的欄位比較準）。', "<code>SELECT DATE_FORMAT(capture_time, '%m/%d %H:%i') AS t, camera_location FROM cctv_log WHERE plate_number = 'RBK-7528' ORDER BY capture_time;</code>"],
      check: { kind: 'result', cols: ['t', 'camera_location'], ordered: true },
      clue: { title: '逃逸路線', text: '04/12 22:41 停在門市前 → 22:53 快速離開 → 22:55 通過海濱路與造船街口，朝她住的造船街方向。' } },
    { type: 'task', id: 'c2-t12', title: '整理成一句話', prompt: '用 <code>CONCAT</code> 把車主 9 號的資料接成「姓名（行政區·街道）」的格式，例如「王小明（港東區·漁市街）」，別名 <code>label</code>。',
      lead: 'person 表，SELECT 裡用 CONCAT() 把欄位與固定文字串起來，最後 AS label。',
      hints: ["CONCAT(name, '（', district, '·', street, '）')", '每段文字都用逗號分開放進 CONCAT。', "<code>SELECT CONCAT(name, '（', district, '·', street, '）') AS label FROM person WHERE id = 9;</code>"],
      check: { kind: 'value' } },
    { type: 'quiz', id: 'c2-q1', question: "想知道 '2025-04-12 22:50:00' 是幾點（小時），要用哪個函數？", options: ['MINUTE()', 'HOUR()', 'DAY()', 'TIME()'], answer: 1, explain: 'HOUR() 取小時、MINUTE() 取分鐘、DAY() 取日。' },
    { type: 'quiz', id: 'c2-q2', question: "RIGHT('KHT-4271', 4) 的結果是？", options: ['KHT-', '4271', '-427', 'KHT'], answer: 1, explain: 'RIGHT 從右邊數 4 個字元。' },
    { type: 'answer', id: 'c2-answer', prompt: '銀色汽車、後三碼 528、女性駕駛、案發時段出現在門口並快速離開。<strong>搶匪是誰？</strong>',
      success: '車牌、車色、性別、時間四個條件同時指向黃雅婷。鑑識人員在她車內找到收銀機的零錢盤，她隨後認罪。',
      fail: '四張 528 車牌裡，同時符合「銀色、女性、22:30~23:10 出現在門口」的只有一張。' },
    { type: 'story', lines: [
      { who: 'clerk', text: '原來真的是她……謝謝你們。我下次一定看時鐘。' },
      { who: 'mentor', text: '你把「打烊前四十分鐘」變成了一段可以查的時間區間，這就是資料分析。接下來的案子沒有明確嫌犯，得從幾百筆資料裡「數」出異常。' },
    ] },
  ],
});
