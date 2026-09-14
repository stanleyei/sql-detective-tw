/* 第 5 章 資料室整理：CREATE TABLE、INSERT、UPDATE、DELETE、ALTER TABLE、DROP */
SD.chapters.push({
  id: 5,
  slug: 'ch5',
  title: '資料室整理',
  subtitle: '建表與資料異動',
  cover: './images/ch5.webp',
  minutes: 60,
  skills: ['CREATE TABLE', 'AUTO_INCREMENT', 'INSERT', 'UPDATE', 'DELETE', 'ALTER TABLE', 'DROP TABLE'],
  badge: { id: 'admin', name: '資料管理員', img: './images/badge-admin.webp', desc: '從零建立證物登錄系統，並安全地新增、修改與刪除資料。' },
  resettable: true,
  steps: [
    { type: 'story', lines: [
      { who: 'chief', text: '前面四個案子辦得漂亮。現在有件苦差事：證物一直用紙本登記，鑑識組要一套「證物登錄」資料表。你來建。' },
      { who: 'tech', text: '需求很簡單：每件證物要有自動編號、屬於哪個案件、名稱、發現地點、狀態（預設「保管中」）、登錄時間。' },
      { who: 'mentor', text: '到目前為止你只「讀」資料。這章開始「寫」：建表、新增、修改、刪除。放心，這是模擬環境，弄壞了按「重置本章」就好。' },
    ] },
    { type: 'lesson', title: 'CREATE TABLE：設計一張表', body: `
      <p>建表要一次講清楚每個欄位的<strong>名稱</strong>、<strong>型別</strong>與<strong>限制</strong>：</p>
      <pre><code>CREATE TABLE evidence (
  id         INT AUTO_INCREMENT PRIMARY KEY,
  report_id  INT NOT NULL,
  item_name  VARCHAR(100) NOT NULL,
  location   VARCHAR(100),
  status     VARCHAR(20) DEFAULT '保管中',
  logged_at  DATETIME
);</code></pre>
      <ul>
        <li><code>INT</code> 整數、<code>VARCHAR(n)</code> 最多 n 字的文字、<code>DATETIME</code> 日期時間、<code>DECIMAL(10,2)</code> 小數。</li>
        <li><code>PRIMARY KEY</code> 主鍵：每列唯一。<code>AUTO_INCREMENT</code> 讓 MariaDB 自動編號。</li>
        <li><code>NOT NULL</code> 必填、<code>DEFAULT</code> 沒給值時的預設。</li>
      </ul>` },
    { type: 'task', id: 'c5-t1', title: '建立證物表', prompt: '依上面的規格建立 <code>evidence</code> 表：欄位依序為 <code>id</code>（自動編號主鍵）、<code>report_id</code>（INT NOT NULL）、<code>item_name</code>（VARCHAR(100) NOT NULL）、<code>location</code>（VARCHAR(100)）、<code>status</code>（VARCHAR(20) 預設 \'保管中\'）、<code>logged_at</code>（DATETIME）。',
      hints: ['直接照範例輸入即可，注意每個欄位之間有逗號、最後一個沒有。', 'AUTO_INCREMENT 與 PRIMARY KEY 都放在 id 那一行。', "<code>CREATE TABLE evidence (id INT AUTO_INCREMENT PRIMARY KEY, report_id INT NOT NULL, item_name VARCHAR(100) NOT NULL, location VARCHAR(100), status VARCHAR(20) DEFAULT '保管中', logged_at DATETIME);</code>"],
      check: { kind: 'probe', probe: "SELECT (SELECT GROUP_CONCAT(name) FROM pragma_table_info('evidence')) AS cols, (SELECT sql LIKE '%AUTOINCREMENT%' FROM sqlite_master WHERE name = 'evidence') AS auto" },
      clue: { title: '證物登錄系統上線', text: 'evidence 表建立完成，共 6 個欄位，id 自動編號。' } },
    { type: 'task', id: 'c5-t2', title: '確認結構', prompt: '用 <code>DESCRIBE</code> 檢查 <code>evidence</code> 表，確認 <code>id</code> 的 Key 是 PRI、Extra 是 auto_increment。',
      lead: 'DESCRIBE 表名; 就會列出每個欄位的 Type、Null、Key、Default、Extra。',
      hints: ['DESCRIBE evidence;', 'DESC evidence; 也行。', '<code>DESCRIBE evidence;</code>'],
      check: { kind: 'regex', pattern: '^\\s*(DESCRIBE|DESC|SHOW\\s+(FULL\\s+)?COLUMNS\\s+FROM)\\s+`?evidence`?' } },
    { type: 'lesson', title: 'INSERT：新增資料', body: `
      <p>新增一列，指定欄位與對應的值；沒列出的欄位會用預設值（自動編號、DEFAULT 或 NULL）：</p>
      <pre><code>INSERT INTO evidence (report_id, item_name, location)
VALUES (36, '空展示盒', '金鑫手機配件攤位');</code></pre>
      <p>一次新增多列，用逗號隔開多組括號：</p>
      <pre><code>INSERT INTO evidence (report_id, item_name, location) VALUES
  (36, '監視器畫面', '漁市街口'),
  (50, '收銀機', '海濱門市');</code></pre>` },
    { type: 'task', id: 'c5-t3', title: '登錄三件證物', prompt: '新增三筆證物（只給 <code>report_id</code>、<code>item_name</code>、<code>location</code>，其餘用預設）：<br>① 36、空展示盒、金鑫手機配件攤位<br>② 36、監視器畫面、漁市街口<br>③ 50、收銀機、海濱門市',
      hints: ['可以分三句 INSERT，也可以一句多列。', '文字要單引號，數字不用。', "<code>INSERT INTO evidence (report_id, item_name, location) VALUES (36, '空展示盒', '金鑫手機配件攤位'), (36, '監視器畫面', '漁市街口'), (50, '收銀機', '海濱門市');</code>"],
      check: { kind: 'probe', probe: 'SELECT id, report_id, item_name, location, status, logged_at FROM evidence ORDER BY id' },
      clue: { title: '三件證物入庫', text: 'id 自動編為 1、2、3，status 自動填入「保管中」。' } },
    { type: 'task', id: 'c5-t4', title: '看看結果', prompt: '查詢 <code>evidence</code> 全部欄位，確認 <code>id</code> 自動編號、<code>status</code> 有預設值。',
      lead: 'SELECT * FROM evidence; 看剛新增的三筆。',
      hints: ['SELECT * FROM evidence;', '沒有條件、不用 WHERE，星號代表全部欄位。', '<code>SELECT * FROM evidence;</code>'],
      check: { kind: 'result', cols: ['id', 'report_id', 'item_name', 'location', 'status', 'logged_at'], ordered: false } },
    { type: 'lesson', title: 'UPDATE：修改資料（一定要 WHERE）', body: `
      <pre><code>UPDATE evidence
SET status = '已送鑑識'
WHERE item_name = '監視器畫面';</code></pre>
      <p><strong>沒有 WHERE 的 UPDATE 會改掉整張表的每一列。</strong>執行前先用同樣的 WHERE 做一次 SELECT，確認會影響哪幾筆，是老手的保命習慣。可以一次改多個欄位：<code>SET a = 1, b = 2</code>。</p>` },
    { type: 'task', id: 'c5-t5', title: '送鑑識', prompt: '把 <code>item_name</code> 為<strong>監視器畫面</strong>的證物 <code>status</code> 改成 <strong>已送鑑識</strong>。',
      hints: ["UPDATE evidence SET status = '已送鑑識' WHERE ...", "WHERE item_name = '監視器畫面'", "<code>UPDATE evidence SET status = '已送鑑識' WHERE item_name = '監視器畫面';</code>"],
      check: { kind: 'probe', probe: 'SELECT id, report_id, item_name, location, status, logged_at FROM evidence ORDER BY id' } },
    { type: 'task', id: 'c5-t6', title: '補登錄時間', prompt: '把 <code>report_id</code> 為 <strong>36</strong> 的所有證物 <code>logged_at</code> 設為 <code>\'2025-03-09 09:00:00\'</code>。',
      lead: 'UPDATE evidence SET 欄位 = 值 WHERE report_id = ...，時間值要加引號。',
      hints: ['一句 UPDATE 會改到兩筆，這是正常的。', "SET logged_at = '2025-03-09 09:00:00' WHERE report_id = 36", "<code>UPDATE evidence SET logged_at = '2025-03-09 09:00:00' WHERE report_id = 36;</code>"],
      check: { kind: 'probe', probe: 'SELECT id, report_id, item_name, location, status, logged_at FROM evidence ORDER BY id' } },
    { type: 'lesson', title: 'DELETE：刪除資料（更要 WHERE）', body: `
      <pre><code>DELETE FROM evidence WHERE item_name = '收銀機';</code></pre>
      <p>沒有 WHERE 的 DELETE 會清空整張表。刪除前同樣先 SELECT 確認。</p>` },
    { type: 'task', id: 'c5-t7', title: '歸還收銀機', prompt: '收銀機已歸還店家，把 <code>item_name</code> 為<strong>收銀機</strong>的那筆<strong>刪除</strong>。',
      hints: ["DELETE FROM evidence WHERE item_name = '收銀機';", '刪除後 SELECT * FROM evidence 應剩 2 筆。', "<code>DELETE FROM evidence WHERE item_name = '收銀機';</code>"],
      check: { kind: 'probe', probe: 'SELECT id, report_id, item_name, location, status, logged_at FROM evidence ORDER BY id' },
      clue: { title: '刪除不會重編號', text: '刪掉 id 3 之後，下一筆新增會是 id 4，而不是回填 3。AUTO_INCREMENT 只會往前走。' } },
    { type: 'lesson', title: 'INSERT ... SELECT：從別的表搬資料', body: `
      <p>第三章那 7 件被冒領的遺失物也該列為證物。不用手打，直接從 <code>lost_item</code> 查出來塞進去：</p>
      <pre><code>INSERT INTO evidence (report_id, item_name, location)
SELECT 67, item_name, station
FROM lost_item
WHERE claimed_by = 14;</code></pre>
      <p>SELECT 的欄位順序要和 INSERT 的欄位清單一一對應。<code>67</code> 是遺失物案的 report_id，寫成常數會套用到每一列。</p>` },
    { type: 'task', id: 'c5-t8', title: '批次登錄遺失物', prompt: '照上面的寫法，把 <code>lost_item</code> 中 <code>claimed_by = 14</code> 的物品全部新增到 <code>evidence</code>（<code>report_id</code> 為 67，<code>location</code> 填車站）。',
      hints: ['INSERT INTO ... SELECT ...，中間沒有 VALUES。', 'SELECT 67, item_name, station FROM lost_item WHERE claimed_by = 14', '<code>INSERT INTO evidence (report_id, item_name, location) SELECT 67, item_name, station FROM lost_item WHERE claimed_by = 14;</code>'],
      check: { kind: 'probe', probe: 'SELECT report_id, item_name, location, status FROM evidence ORDER BY item_name, location' },
      clue: { title: '9 件證物', text: 'evidence 現在有 9 筆：夜市案 2 件、遺失物案 7 件。' } },
    { type: 'lesson', title: 'ALTER TABLE：事後改結構', body: `
      <pre><code>ALTER TABLE evidence ADD COLUMN weight_g INT;          -- 加欄位
ALTER TABLE evidence MODIFY COLUMN location VARCHAR(200); -- 改型別
ALTER TABLE evidence DROP COLUMN weight_g;             -- 刪欄位
ALTER TABLE evidence RENAME COLUMN location TO found_at; -- 改名</code></pre>` },
    { type: 'task', id: 'c5-t9', title: '加一個重量欄位', prompt: '鑑識組要記錄證物重量。在 <code>evidence</code> 加一個 <code>weight_g</code> 欄位，型別 <code>INT</code>。',
      hints: ['ALTER TABLE evidence ADD COLUMN weight_g INT;', 'ADD 後面的 COLUMN 可以省略。', '<code>ALTER TABLE evidence ADD COLUMN weight_g INT;</code>'],
      check: { kind: 'probe', probe: "SELECT GROUP_CONCAT(name) FROM pragma_table_info('evidence')" } },
    { type: 'task', id: 'c5-t10', title: '登記重量', prompt: '把 <code>item_name</code> 為 <strong>MacBook Air</strong> 的證物 <code>weight_g</code> 改成 <strong>1240</strong>。',
      lead: 'UPDATE evidence SET weight_g = 數字 WHERE item_name = ...，數字不加引號。',
      hints: ["UPDATE evidence SET weight_g = 1240 WHERE item_name = 'MacBook Air';", '數字不用引號。', "<code>UPDATE evidence SET weight_g = 1240 WHERE item_name = 'MacBook Air';</code>"],
      check: { kind: 'probe', probe: 'SELECT item_name, weight_g FROM evidence WHERE weight_g IS NOT NULL' } },
    { type: 'lesson', title: '第二張表與外鍵', body: `
      <p>證物照片是「一件證物、多張照片」，另開一張表，用<strong>外鍵 FOREIGN KEY</strong> 指回 evidence：</p>
      <pre><code>CREATE TABLE evidence_photo (
  id          INT AUTO_INCREMENT PRIMARY KEY,
  evidence_id INT NOT NULL,
  file_name   VARCHAR(200) NOT NULL,
  FOREIGN KEY (evidence_id) REFERENCES evidence(id)
);</code></pre>
      <p>外鍵宣告「evidence_id 的值必須存在於 evidence.id」，這就是 JOIN 時 ON 條件的來源。</p>` },
    { type: 'task', id: 'c5-t11', title: '建立照片表', prompt: '依上面規格建立 <code>evidence_photo</code> 表。',
      hints: ['三個欄位加一行 FOREIGN KEY。', 'FOREIGN KEY (evidence_id) REFERENCES evidence(id)', '<code>CREATE TABLE evidence_photo (id INT AUTO_INCREMENT PRIMARY KEY, evidence_id INT NOT NULL, file_name VARCHAR(200) NOT NULL, FOREIGN KEY (evidence_id) REFERENCES evidence(id));</code>'],
      check: { kind: 'probe', probe: "SELECT (SELECT GROUP_CONCAT(name) FROM pragma_table_info('evidence_photo')) AS cols, (SELECT COUNT(*) FROM pragma_foreign_key_list('evidence_photo')) AS fks" } },
    { type: 'task', id: 'c5-t12', title: '新增照片並 JOIN 回來', prompt: '先新增一筆照片：<code>evidence_id</code> 為 1、<code>file_name</code> 為 <code>\'box-001.jpg\'</code>。然後用 JOIN 查出這張照片對應的證物名稱：顯示 <code>ph.file_name</code>、<code>ev.item_name</code>。',
      lead: '兩句 SQL：先 INSERT INTO evidence_photo (...) VALUES (...);，再 SELECT ... FROM evidence_photo ph JOIN evidence ev ON ev.id = ph.evidence_id。',
      hints: ["INSERT INTO evidence_photo (evidence_id, file_name) VALUES (1, 'box-001.jpg');", 'SELECT ph.file_name, ev.item_name FROM evidence_photo ph JOIN evidence ev ON ev.id = ph.evidence_id;', "<code>INSERT INTO evidence_photo (evidence_id, file_name) VALUES (1, 'box-001.jpg'); SELECT ph.file_name, ev.item_name FROM evidence_photo ph JOIN evidence ev ON ev.id = ph.evidence_id;</code>"],
      check: { kind: 'probe', probe: 'SELECT ph.file_name, ev.item_name FROM evidence_photo ph JOIN evidence ev ON ev.id = ph.evidence_id ORDER BY ph.id' } },
    { type: 'lesson', title: 'DROP、TRUNCATE、DELETE 的差別', body: `
      <ul>
        <li><code>DELETE FROM t WHERE ...</code>：刪<strong>部分列</strong>，結構保留，可以有條件。</li>
        <li><code>TRUNCATE TABLE t</code>：<strong>清空全部列</strong>並重設自動編號，結構保留。</li>
        <li><code>DROP TABLE t</code>：<strong>整張表消失</strong>，含結構。</li>
      </ul>
      <p>三個都不可逆，實務上會先備份。</p>` },
    { type: 'task', id: 'c5-t13', title: '撤掉照片表', prompt: '照片決定改存到雲端系統。把 <code>evidence_photo</code> 表整張<strong>刪除</strong>。',
      hints: ['DROP TABLE evidence_photo;', '這會連結構一起刪掉。', '<code>DROP TABLE evidence_photo;</code>'],
      check: { kind: 'probe', probe: "SELECT COUNT(*) FROM sqlite_master WHERE type = 'table' AND name = 'evidence_photo'" } },
    { type: 'quiz', id: 'c5-q1', question: '執行 UPDATE evidence SET status = \'已結案\'; 會發生什麼？', options: ['只改第一筆', '出現錯誤', '整張表每一筆都被改成已結案', '什麼都不會發生'], answer: 2, explain: '沒有 WHERE 的 UPDATE 會影響所有列，執行前務必確認。' },
    { type: 'quiz', id: 'c5-q2', question: '想「清空整張表但保留結構、自動編號歸零」，用？', options: ['DROP TABLE', 'TRUNCATE TABLE', 'DELETE FROM t WHERE id > 0', 'ALTER TABLE'], answer: 1, explain: 'TRUNCATE 清空並重設 AUTO_INCREMENT；DROP 會連表一起刪。' },
    { type: 'story', lines: [
      { who: 'tech', text: '證物系統可以用了！這樣我就不用再翻那本快散掉的登記簿了。' },
      { who: 'chief', text: '很好。現在，我要交給你一件從你報到那天就一直放在那裡的案子。' },
      { who: 'mentor', text: '海景大樓命案。這次沒有一步一步的提示，只有目擊者的證詞與你學過的所有東西。準備好了嗎？' },
    ] },
  ],
});
