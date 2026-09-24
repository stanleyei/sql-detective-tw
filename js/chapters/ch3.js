/* 第 3 章 捷運遺失物：COUNT / SUM / AVG / MIN / MAX、GROUP BY、HAVING、GROUP_CONCAT */
SD.chapters.push({
  id: 3,
  slug: 'ch3',
  title: '捷運遺失物',
  subtitle: '統計與分組',
  cover: './images/ch3.webp',
  skills: ['COUNT / SUM / AVG', 'MIN / MAX', 'GROUP BY', 'HAVING', 'GROUP_CONCAT'],
  badge: { id: 'stats', name: '統計高手', img: './images/badge-stats.webp', desc: '用聚合函數從幾百筆紀錄中數出異常。' },
  steps: [
    { type: 'story', lines: [
      { who: 'narrator', text: '第三份積案。5 月 20 日，中央區捷運遺失物中心的站務員送來一份報案，至今沒人接手。她今天又來了一趟：' },
      { who: 'station', text: '四、五月那陣子一直有人來領高價的遺失物，每次簽的名字都不一樣，但字跡很像，而且每次都講得出正確特徵。系統有登記領取人的市民編號，但我們沒人會查。我懷疑是同一個人。' },
      { who: 'mentor', text: '這種案子沒有目擊者、沒有車牌。線索藏在「次數」裡：正常人一年領回一兩件，冒領的人會多得離譜。要學會讓資料庫幫你數。' },
    ] },
    { type: 'lesson', title: '聚合函數：把很多列變成一個數字', body: `
      <p>之前的查詢都是「一列進、一列出」。<strong>聚合函數</strong>會把很多列<strong>算成一個結果</strong>：</p>
      <pre><code>COUNT(*)         -- 幾筆
SUM(est_value)   -- 加總
AVG(est_value)   -- 平均
MIN(est_value)   -- 最小
MAX(est_value)   -- 最大</code></pre>
      <pre><code>SELECT COUNT(*) FROM lost_item;
SELECT SUM(est_value), AVG(est_value) FROM lost_item WHERE status = '已領回';</code></pre>
      <p><code>COUNT(*)</code> 數列數；<code>COUNT(欄位)</code> 只數該欄位不是 NULL 的列。</p>` },
    { type: 'predict', id: 'c3-p1', title: 'COUNT(欄位) 數什麼？', sql: 'SELECT COUNT(phone) FROM person;', question: 'person 有 420 人，其中一些人電話是 NULL。這句會得到？', options: ['420，跟 COUNT(*) 一樣', '比 420 小，NULL 不會被數進去', '會出錯，COUNT 只能放 *'], answer: 1, explain: 'COUNT(*) 數列數；COUNT(欄位) 只數該欄位不是 NULL 的列。想知道「有幾個人沒留電話」可以用 COUNT(*) - COUNT(phone)。' },
    { type: 'task', id: 'c3-t1', title: '總共幾件？', prompt: '<code>lost_item</code>（遺失物）表總共有幾筆紀錄？',
      hints: ['<code>COUNT(*)</code> 可以計算資料表的全部列數。', '<code>SELECT COUNT(*) FROM ___;</code>', '<code>SELECT COUNT(*) FROM lost_item;</code>'],
      check: { kind: 'value' } },
    { type: 'task', id: 'c3-t2', title: '已領回幾件？', prompt: '其中 <code>status</code> 為<strong>已領回</strong>的有幾件？',
      lead: '同樣是 lost_item 的 COUNT(*)，加一個 WHERE status 條件。',
      hints: ['COUNT 加上 WHERE。', "WHERE status = '已領回'", "<code>SELECT COUNT(*) FROM lost_item WHERE status = '已領回';</code>"],
      check: { kind: 'value' } },
    { type: 'task', id: 'c3-t3', title: '價值總覽', prompt: '一次算出所有遺失物 <code>est_value</code>（估價）的<strong>總和、平均、最大值</strong>，三個欄位依此順序，別名 <code>total</code>、<code>avg_value</code>、<code>max_value</code>。',
      lead: 'lost_item 表不用 WHERE，SELECT 裡放 SUM、AVG、MAX 三個函數並各自 AS 別名。',
      hints: ['三個聚合函數放在同一個 SELECT，用逗號分開。', 'SUM(est_value) AS total, AVG(est_value) AS avg_value, MAX(est_value) AS max_value', '<code>SELECT SUM(est_value) AS total, AVG(est_value) AS avg_value, MAX(est_value) AS max_value FROM lost_item;</code>'],
      check: { kind: 'result', cols: null, ordered: false },
      clue: { title: '遺失物規模', text: '137 件遺失物估價總和約 158 萬元，最貴的是 36,000 元的筆電。' } },
    { type: 'lesson', title: 'GROUP BY：分組統計', body: `
      <p>「每個車站各有幾件？」需要<strong>先分組、再各組統計</strong>。這就是 <code>GROUP BY</code>：</p>
      <pre><code>SELECT station, COUNT(*) AS cnt
FROM lost_item
GROUP BY station;</code></pre>
      <p>規則：SELECT 裡<strong>沒有</strong>被聚合的欄位（這裡是 station）<strong>必須</strong>出現在 GROUP BY。把 GROUP BY 想成「每個 station 一列」。</p>` },
    { type: 'task', id: 'c3-t4', title: '每站件數', prompt: '統計<strong>每個車站</strong>（<code>station</code>）的遺失物件數，只選 <code>station</code> 與件數兩欄，件數別名 <code>cnt</code>。',
      hints: ['GROUP BY station', 'SELECT station, COUNT(*) AS cnt', '<code>SELECT station, COUNT(*) AS cnt FROM lost_item GROUP BY station;</code>'],
      check: { kind: 'result', cols: null, ordered: false } },
    { type: 'task', id: 'c3-t5', title: '每類總價值', prompt: '統計<strong>每個類別</strong>（<code>category</code>）的估價總和，只選 <code>category</code> 與總和兩欄，總和別名 <code>total</code>，依總和<strong>由大到小</strong>排序。',
      lead: 'lost_item 表：GROUP BY category，SUM 取別名後 ORDER BY 別名 DESC。',
      hints: ['GROUP BY category，再 ORDER BY total DESC。', 'ORDER BY 可以用別名。', '<code>SELECT category, SUM(est_value) AS total FROM lost_item GROUP BY category ORDER BY total DESC;</code>'],
      check: { kind: 'result', cols: null, ordered: true },
      clue: { title: '3C 是主要目標', text: '3C 類的估價總和遠高於其他類別，高價冒領應集中在這一類。' } },
    { type: 'lesson', title: 'HAVING：篩選「分組後」的結果', body: `
      <p>要找「領取超過 2 件的人」，條件是針對<strong>統計結果</strong>（COUNT）而不是原始列。這時<strong>不能用 WHERE</strong>，要用 <code>HAVING</code>：</p>
      <pre><code>SELECT claimed_by, COUNT(*) AS cnt
FROM lost_item
WHERE claimed_by IS NOT NULL      -- 先過濾原始列
GROUP BY claimed_by
HAVING COUNT(*) &gt; 2;              -- 再過濾分組結果</code></pre>
      <p>順序口訣：<strong>WHERE → GROUP BY → HAVING → ORDER BY → LIMIT</strong>。</p>` },
    { type: 'blocks', id: 'c3-b1', title: '拼出 WHERE → GROUP BY → HAVING', prompt: '組出「排除 NULL 後，找出領取超過 2 件的 <code>claimed_by</code> 與件數」。注意有一塊積木放錯位置了，不該用。',
      blocks: ['SELECT', 'claimed_by, COUNT(*) AS cnt', 'FROM', 'lost_item', 'WHERE', 'claimed_by IS NOT NULL', 'GROUP BY', 'claimed_by', 'HAVING', 'COUNT(*) > 2;'], distractors: ['WHERE COUNT(*) > 2'],
      wrong: '口訣：WHERE 篩原始列 → GROUP BY 分組 → HAVING 篩分組結果。聚合條件不能放 WHERE。' },
    { type: 'task', id: 'c3-t6', title: '誰領太多了？', prompt: '找出<strong>領取超過 2 件</strong>的領取人：顯示 <code>claimed_by</code> 與件數（別名 <code>cnt</code>），排除 <code>claimed_by</code> 為 NULL 的紀錄。',
      hints: ['WHERE claimed_by IS NOT NULL，GROUP BY claimed_by。', 'HAVING COUNT(*) > 2', '<code>SELECT claimed_by, COUNT(*) AS cnt FROM lost_item WHERE claimed_by IS NOT NULL GROUP BY claimed_by HAVING COUNT(*) &gt; 2;</code>'],
      check: { kind: 'result', cols: null, ordered: false },
      clue: { title: '異常領取人', text: '市民編號 14 在兩個月內領走 7 件遺失物，其他人最多 2 件。' } },
    { type: 'task', id: 'c3-d1', variant: 'debug', title: '哪些車站件數超過 18？', prompt: '站務員寫了這句想找<strong>件數超過 18</strong> 的車站，卻被資料庫拒絕。修正後顯示 <code>station</code> 與件數（別名 <code>cnt</code>）。',
      starter: 'SELECT station, COUNT(*) AS cnt FROM lost_item WHERE COUNT(*) > 18 GROUP BY station;',
      hints: ['錯誤訊息已經告訴你：聚合函數不能放在 WHERE。', '把條件搬到 GROUP BY 之後，改用 HAVING。', '<code>SELECT station, COUNT(*) AS cnt FROM lost_item GROUP BY station HAVING COUNT(*) &gt; 18;</code>'],
      check: { kind: 'result', cols: null, ordered: false } },
    { type: 'task', id: 'c3-t7', title: '他領走了什麼？', prompt: '列出 <code>claimed_by</code> 為 <strong>14</strong> 的所有遺失物，顯示 <code>item_name</code>、<code>station</code>、<code>est_value</code>、<code>claimed_date</code>。',
      lead: 'lost_item 表，WHERE claimed_by = 編號，列出四個欄位。',
      hints: ['WHERE claimed_by = 14', '這題不用 GROUP BY，是看明細。', '<code>SELECT item_name, station, est_value, claimed_date FROM lost_item WHERE claimed_by = 14;</code>'],
      check: { kind: 'result', cols: ['item_name', 'station', 'est_value', 'claimed_date'], ordered: false },
      clue: { title: '冒領清單', text: 'iPhone、MacBook、名牌包、相機、Apple Watch、手機、耳機，跨 6 個車站，全是高價 3C 與精品。' } },
    { type: 'task', id: 'c3-t8', title: '總價值與時間範圍', prompt: '算出 14 號領走物品的<strong>估價總和</strong>、<strong>最早</strong>與<strong>最晚</strong>領取日期，三欄依序別名 <code>total</code>、<code>first_date</code>、<code>last_date</code>。',
      lead: 'lost_item 表加 WHERE claimed_by 條件，SELECT 裡用 SUM、MIN、MAX 各取別名。',
      hints: ['SUM、MIN、MAX 可以用在日期欄位。', 'MIN(claimed_date) 是最早日期。', '<code>SELECT SUM(est_value) AS total, MIN(claimed_date) AS first_date, MAX(claimed_date) AS last_date FROM lost_item WHERE claimed_by = 14;</code>'],
      check: { kind: 'result', cols: null, ordered: false },
      clue: { title: '損失 155,000 元', text: '2025-04-05 到 2025-05-16 之間，共冒領價值 155,000 元的物品。' } },
    { type: 'lesson', title: 'GROUP_CONCAT：把一組值串成一行', body: `
      <p>想在每個車站旁邊列出「被誰領走」的清單，用 <code>GROUP_CONCAT</code> 把同組的值接成一個字串：</p>
      <pre><code>SELECT station, GROUP_CONCAT(item_name SEPARATOR '、') AS items
FROM lost_item
WHERE claimed_by = 14
GROUP BY station;</code></pre>` },
    { type: 'task', id: 'c3-t9', title: '每站被冒領的物品', prompt: '針對 14 號領走的物品，<strong>每個車站</strong>一列，顯示 <code>station</code> 與該站物品清單（用 <code>GROUP_CONCAT(item_name)</code>，別名 <code>items</code>）。',
      hints: ['WHERE claimed_by = 14 GROUP BY station', 'GROUP_CONCAT(item_name) AS items', '<code>SELECT station, GROUP_CONCAT(item_name) AS items FROM lost_item WHERE claimed_by = 14 GROUP BY station;</code>'],
      check: { kind: 'result', cols: null, ordered: false } },
    { type: 'task', id: 'c3-t10', title: '14 號是誰？', prompt: '從 <code>person</code> 找出編號 14 的市民，顯示 <code>name</code>、<code>district</code>、<code>street</code>。',
      lead: 'person 表，WHERE id = 編號。',
      hints: ['WHERE id = 14', 'SELECT name, district, street', '<code>SELECT name, district, street FROM person WHERE id = 14;</code>'],
      check: { kind: 'result', cols: ['name', 'district', 'street'], ordered: false },
      clue: { title: '嫌疑人', text: '李建宏，中央區光復路。' } },
    { type: 'story', scene: './images/scene/ch3-gate.webp', lines: [
      { who: 'station', text: '李建宏……就是他！每次都西裝筆挺、彬彬有禮，還會跟我們道謝。我們完全沒懷疑過。' },
      { who: 'mentor', text: '別急。簽名和證詞只能說他「像」，不能證明他「在」。他要領東西，就得進站；捷運的悠遊卡紀錄不會替人說謊。' },
      { who: 'tech', text: 'transit_card 對得到市民，transit_log 是每一次進出站。先拿他的卡號，再看那些站他去過幾次。' },
    ] },
    { type: 'lesson', title: '用悠遊卡驗證行蹤', body: `
      <p>捷運悠遊卡在 <code>transit_card</code>（卡片對應市民）與 <code>transit_log</code>（進出站紀錄）。若他真的到過那些站領東西，進站紀錄應該對得上。</p>` },
    { type: 'task', id: 'c3-t11', title: '他的悠遊卡', prompt: '從 <code>transit_card</code> 找出 <code>person_id</code> 為 14 的卡號 <code>card_id</code>。',
      hints: ['WHERE person_id = 14', 'SELECT card_id ...', '<code>SELECT card_id FROM transit_card WHERE person_id = 14;</code>'],
      check: { kind: 'value' },
      clue: { title: '李建宏的悠遊卡', text: '14 號李建宏的卡號是 TC00001。下一題用這個卡號查進出站紀錄。' } },
    { type: 'task', id: 'c3-t12', after: { step: 'c3-t11', use: 'result' }, title: '他最常從哪站進站？', prompt: '用上一題的卡號（忘了可看線索板），統計 <code>transit_log</code> 中該卡<strong>每個車站的進站次數</strong>（<code>direction = \'進站\'</code>），顯示 <code>station</code> 與次數（別名 <code>cnt</code>），次數<strong>由多到少</strong>排序。',
      lead: 'transit_log 表：WHERE 卡號與方向兩個條件，GROUP BY station，COUNT(*) AS cnt，再 ORDER BY cnt DESC。',
      hints: ["WHERE card_id = 'TC00001' AND direction = '進站'", 'GROUP BY station ORDER BY cnt DESC', "<code>SELECT station, COUNT(*) AS cnt FROM transit_log WHERE card_id = 'TC00001' AND direction = '進站' GROUP BY station ORDER BY cnt DESC;</code>"],
      check: { kind: 'result', cols: null, ordered: false },
      clue: { title: '行蹤重疊', text: '李建宏的悠遊卡在每件遺失物「被撿到當天」與「被領走當天」都從該站進站，港東站最多。他不是碰巧路過，是在盯著失物。' } },
    { type: 'task', id: 'c3-t13', title: '平均每件多少錢？', prompt: '比較：<strong>全部已領回</strong>物品的平均估價，與 <strong>14 號領走</strong>物品的平均估價。先算前者：<code>status = \'已領回\'</code> 的 <code>AVG(est_value)</code>，用 <code>ROUND(..., 0)</code> 四捨五入到整數。',
      lead: 'lost_item 表，SELECT ROUND(AVG(est_value), 0) 加 WHERE status 條件。',
      hints: ['ROUND(AVG(est_value), 0)', "WHERE status = '已領回'", "<code>SELECT ROUND(AVG(est_value), 0) FROM lost_item WHERE status = '已領回';</code>"],
      check: { kind: 'value' },
      clue: { title: '全體平均估價', text: '全部已領回物品的平均估價為 12,353 元。' } },
    { type: 'task', id: 'c3-t14', after: { step: 'c3-t13', use: 'sql' }, title: '他挑的都是貴的', prompt: '再算後者：<code>claimed_by</code> 為 <strong>14</strong> 的物品平均估價，同樣用 <code>ROUND(AVG(est_value), 0)</code> 四捨五入到整數。',
      lead: '同上一題，把 WHERE 換成 claimed_by = 14。',
      hints: ['ROUND(AVG(est_value), 0)', 'WHERE claimed_by = 14', '<code>SELECT ROUND(AVG(est_value), 0) FROM lost_item WHERE claimed_by = 14;</code>'],
      check: { kind: 'value' },
      clue: { title: '專挑高價品', text: '李建宏領走的物品平均估價 22,143 元，接近全體平均的兩倍。他不是撿回自己的東西，是挑貴的拿。' } },
    { type: 'quiz', id: 'c3-q1', question: '想找「件數超過 5 的車站」，條件應該寫在？', options: ['WHERE COUNT(*) > 5', 'HAVING COUNT(*) > 5', 'GROUP BY COUNT(*) > 5', 'ORDER BY COUNT(*) > 5'], answer: 1, explain: '對聚合結果的篩選要用 HAVING；WHERE 只能篩原始列。' },
    { type: 'quiz', id: 'c3-q2', question: 'SELECT station, COUNT(*) FROM lost_item; 這句少了什麼？', options: ['WHERE', 'GROUP BY station', 'LIMIT', 'DISTINCT'], answer: 1, explain: 'SELECT 裡有未聚合的欄位 station，就必須 GROUP BY station。' },
    { type: 'answer', id: 'c3-answer', prompt: '從「次數異常」出發，一路查到姓名與行蹤。<strong>冒領遺失物的人是誰？</strong>',
      success: '李建宏在兩個月內用不同假名冒領 7 件高價遺失物，悠遊卡行蹤與多個領取車站重疊。站務員調出簽名比對後，確認是同一人，他也被依侵占罪送辦。',
      fail: '回頭看 HAVING 那一題：領超過 2 件的只有一個編號，再用 person 表查他的名字。',
      chain: ['c3-t6', 'c3-t10', 'c3-t12'], chainFail: '證據鏈是：領取次數異常的市民編號 → 這個編號是誰 → 他的悠遊卡行蹤是否與領取車站重疊。',
      chainNotes: {
        'c3-t3': '遺失物規模是背景數字，指不出任何人。',
        'c3-t5': '3C 是主要目標只說明動機，還沒指向特定的人。',
        'c3-t7': '冒領清單是「領了什麼」，證據鏈要的是「領了幾次、是誰」。',
        'c3-t8': '損失金額是結果，不是指認的依據。',
        'c3-t11': '卡號只是查行蹤的中繼站，查出來的行蹤才是證據。',
        'c3-t13': '全體平均是比較基準，本身不指向任何人。',
        'c3-t14': '專挑高價品說明手法，但「他當天真的在那個車站」才把人釘在現場。',
      },
      suspects: ['李建宏', '胡育誠', '邱冠宇', '葉信宏'] },
    { type: 'story', scene: './images/scene/ch3-lostfound.webp', lines: [
      { who: 'station', text: '原來是他！每次都西裝筆挺、彬彬有禮，我們完全沒懷疑。' },
      { who: 'mentor', text: '你學會的是資料分析最核心的動作：分組、計數、找異常。下一案，資料分散在四張表裡，得把它們「接」起來。' },
    ] },
  ],
});
