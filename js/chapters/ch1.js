/* 第 1 章 夜市失竊：AND / OR / NOT、LIKE、IN、BETWEEN、IS NULL、ORDER BY、LIMIT、DISTINCT */
SD.chapters.push({
  id: 1,
  slug: 'ch1',
  title: '夜市失竊',
  subtitle: '篩選條件與排序',
  cover: './images/ch1.webp',
  skills: ['AND / OR / NOT', 'LIKE', 'IN', 'BETWEEN', 'IS NULL', 'ORDER BY', 'DISTINCT'],
  badge: { id: 'filter', name: '篩選大師', img: './images/badge-filter.webp', desc: '用 WHERE 的各種條件從人海中撈出嫌疑人。' },
  steps: [
    { type: 'story', lines: [
      { who: 'narrator', text: '第一份積案，案發於 3 月 8 日，星期六晚上。港東夜市人聲鼎沸，直到「金鑫手機配件」的老闆娘尖叫一聲。老闆娘今天再次來局裡陳述：' },
      { who: 'vendor', text: '警官！我轉身拿貨才幾秒，回頭展示盒就被打開了，裡面的耳機全沒了！有個穿黑外套的男生跳上白色機車跑掉，車牌開頭是 MKJ！這案子擱了半年，拜託你們。' },
      { who: 'mentor', text: '目擊描述當時都記在報案紀錄裡了。第一步永遠一樣：把案件本身找出來。這次條件不只一個，你需要 AND。' },
    ] },
    { type: 'lesson', title: 'AND、OR、NOT：組合多個條件', body: `
      <p>條件可以用 <code>AND</code>（而且）、<code>OR</code>（或者）串起來，用 <code>NOT</code> 反過來：</p>
      <pre><code>WHERE crime_type = '竊盜' AND district = '港東區'
WHERE district = '港東區' OR district = '港西區'
WHERE NOT district = '中央區'</code></pre>
      <p>AND 與 OR 混用時，用<strong>括號</strong>標清楚先算誰，例如 <code>WHERE (a OR b) AND c</code>。</p>` },
    { type: 'task', id: 'c1-t1', title: '找出案件紀錄', prompt: '從 <code>crime_report</code> 找出 <strong>2025-03-08</strong>、發生在<strong>港東區</strong>的<strong>竊盜</strong>案，顯示 <code>id</code> 與 <code>description</code>。',
      hints: ['三個條件用 AND 連起來。', '日期也是文字，寫成 \'2025-03-08\'。', "<code>SELECT id, description FROM crime_report WHERE crime_type = '竊盜' AND district = '港東區' AND report_date = '2025-03-08';</code>"],
      check: { kind: 'result', cols: ['id', 'description'], ordered: false },
      clue: { title: '案件 #36 目擊描述', text: '嫌犯身高約 175 到 180 公分，騎白色機車逃逸，車牌開頭為 MKJ。' } },
    { type: 'lesson', title: 'LIKE：只知道一部分怎麼找？', body: `
      <p>目擊者只記得車牌「開頭是 MKJ」。這時用 <code>LIKE</code> 搭配萬用字元：</p>
      <ul>
        <li><code>%</code> 代表<strong>任意長度</strong>的任何文字（包含空字串）</li>
        <li><code>_</code> 代表<strong>剛好一個</strong>字元</li>
      </ul>
      <pre><code>WHERE plate_number LIKE 'MKJ%'     -- MKJ 開頭
WHERE name LIKE '%志%'             -- 名字裡有「志」
WHERE plate_number LIKE '___-1234' -- 三個任意字元加 -1234</code></pre>` },
    { type: 'blocks', id: 'c1-b1', title: '拼出 LIKE 查詢', prompt: '組出「從 <code>driver_license</code> 找出車牌以 MKJ 開頭的 <code>plate_number</code>」。注意有一塊積木是多餘的。',
      blocks: ['SELECT', 'plate_number', 'FROM', 'driver_license', 'WHERE', 'plate_number', 'LIKE', "'MKJ%';"], distractors: ["'%MKJ';"],
      wrong: '順序還不對。句型：SELECT 欄位 FROM 表 WHERE 欄位 LIKE 樣式。開頭是 MKJ，% 要放在後面。' },
    { type: 'task', id: 'c1-t2', title: 'MKJ 開頭的車牌', prompt: '從 <code>driver_license</code>（駕照）找出車牌 <code>plate_number</code> 以 <strong>MKJ</strong> 開頭的紀錄，顯示 <code>id</code>、<code>plate_number</code>、<code>car_color</code>、<code>vehicle_type</code>、<code>height_cm</code>。',
      hints: ['先 DESCRIBE driver_license 看欄位。', "LIKE 'MKJ%'，% 放在後面。", "<code>SELECT id, plate_number, car_color, vehicle_type, height_cm FROM driver_license WHERE plate_number LIKE 'MKJ%';</code>"],
      check: { kind: 'result', cols: ['plate_number', 'car_color', 'vehicle_type', 'height_cm'], ordered: false },
      clue: { title: '四張 MKJ 車牌', text: 'MKJ 開頭的車牌有 4 張：白色機車 2 台、白色汽車 1 台、黑色機車 1 台。' } },
    { type: 'lesson', title: 'BETWEEN 與 IN：範圍與清單', body: `
      <p>身高「175 到 180 之間」可以寫 <code>height_cm &gt;= 175 AND height_cm &lt;= 180</code>，但 <code>BETWEEN</code> 更好讀（<strong>含</strong>兩端）：</p>
      <pre><code>WHERE height_cm BETWEEN 175 AND 180</code></pre>
      <p>「是這幾個值之一」用 <code>IN</code>，取代一長串 OR：</p>
      <pre><code>WHERE district IN ('港東區', '港西區', '海濱區')
WHERE id IN (10001, 10002)</code></pre>` },
    { type: 'task', id: 'c1-t3', after: { step: 'c1-t2', use: 'sql' }, title: '縮小範圍', prompt: '在上一題的基礎上，只留下 <code>car_color</code> 為 <code>\'白\'</code>（資料表用單字，不是「白色」）、<code>vehicle_type</code> 為 <code>\'機車\'</code>、身高 <code>height_cm</code> 在 <strong>175 到 180</strong> 之間的駕照，顯示 <code>id</code>、<code>plate_number</code>、<code>person_id</code>。',
      hints: ['四個條件全部用 AND 串起來。', "car_color = '白' AND vehicle_type = '機車' AND height_cm BETWEEN 175 AND 180", "<code>SELECT id, plate_number, person_id FROM driver_license WHERE plate_number LIKE 'MKJ%' AND car_color = '白' AND vehicle_type = '機車' AND height_cm BETWEEN 175 AND 180;</code>"],
      check: { kind: 'result', cols: ['plate_number', 'person_id'], ordered: false },
      clue: { title: '符合特徵的兩張車牌', text: '四張 MKJ 車牌中，只有 MKJ-5821（車主編號 4）與 MKJ-3390（車主編號 5）同時符合白色機車與身高特徵。' } },
    { type: 'task', id: 'c1-t4', after: { step: 'c1-t3', use: 'result' }, title: '車主是誰？', prompt: '用上一題查到的 <code>person_id</code>，從 <code>person</code> 找出這兩位市民，顯示 <code>id</code>、<code>name</code>、<code>district</code>、<code>phone</code>。',
      lead: '查 person 表，用 WHERE id IN (...) 一次帶入兩個編號。',
      hints: ['person 的 id 就是駕照上的 person_id。', 'WHERE id IN (4, 5)', '<code>SELECT id, name, district, phone FROM person WHERE id IN (4, 5);</code>'],
      check: { kind: 'result', cols: ['id', 'name', 'district', 'phone'], ordered: false },
      clue: { title: '嫌疑人身分查核', text: '車主編號 4 是吳志豪（港東區，沒有登記電話）、5 是蘇建豪（港東區）。' } },
    { type: 'lesson', title: 'IS NULL：空值不能用等號', body: `
      <p>你可能注意到吳志豪的電話是 <strong>NULL</strong>，代表「沒有資料」。NULL 不是 0 也不是空字串，<strong>不能</strong>用 <code>= NULL</code> 比較，要用：</p>
      <pre><code>WHERE phone IS NULL
WHERE phone IS NOT NULL</code></pre>
      <p>同理，<code>&lt;&gt;</code>（或 <code>!=</code>）也<strong>選不到</strong> NULL：<code>WHERE phone &lt;&gt; '0900-000000'</code> 不會列出沒登記電話的人，因為 NULL 跟任何值比較的結果都不是「真」。要把他們也算進來，得另外加上 <code>OR phone IS NULL</code>。</p>` },
    { type: 'task', id: 'c1-t5', title: '沒留電話的人', prompt: '找出 <code>person</code> 中<strong>沒有登記電話</strong>的市民，列出他們的 <code>name</code>。',
      hints: ['NULL 要用 IS NULL。', 'WHERE phone IS NULL', '<code>SELECT name FROM person WHERE phone IS NULL;</code>'],
      check: { kind: 'result', cols: ['name'], ordered: false } },
    { type: 'task', id: 'c1-d1', variant: 'debug', title: '為什麼查不到人？', prompt: '同事想找<strong>港東區</strong>裡<strong>沒有登記電話</strong>的人，這句 SQL 跑得動卻回傳 0 筆。找出問題並修正，顯示 <code>name</code>。',
      starter: "SELECT name FROM person WHERE phone = NULL AND district = '港東區';",
      hints: ['沒有錯誤訊息不代表沒錯。看看 phone 的條件是怎麼寫的。', 'NULL 不能用 = 比較，要用 IS NULL。', "<code>SELECT name FROM person WHERE phone IS NULL AND district = '港東區';</code>"],
      check: { kind: 'result', cols: ['name'], ordered: false } },
    { type: 'predict', id: 'c1-p1', title: 'NULL 會不會被「不等於」選到？', sql: "SELECT name FROM person WHERE phone <> '0912345678';", question: '吳志豪的電話是 NULL。他會出現在結果裡嗎？', options: ['會，NULL 當然不等於那個號碼', '不會，NULL 跟任何值比較都不算「真」', '會出錯，NULL 不能比較'], answer: 1, explain: 'NULL 代表「未知」，未知不等於任何值，也不「不等於」任何值，所以 <> 會把他排除。要把沒電話的人也算進來，得加上 OR phone IS NULL。' },
    { type: 'story', lines: [
      { who: 'tech', text: '嗨，我是鑑識組的張哲。夜市周邊的監視器紀錄都已經匯進 cctv_log 表了，車牌辨識也做好了，你可以直接查。' },
    ] },
    { type: 'task', id: 'c1-t6', title: '監視器抓到誰？', prompt: '從 <code>cctv_log</code> 找出 <strong>3 月 8 日</strong>（<code>capture_time</code> 以 <code>2025-03-08</code> 開頭）、車牌為 <strong>MKJ-5821 或 MKJ-3390</strong> 的紀錄，顯示 <code>capture_time</code>、<code>camera_location</code>、<code>plate_number</code>、<code>note</code>。',
      lead: 'cctv_log 表。日期用 LIKE 比開頭，兩張車牌用 IN 或 OR（記得括號）。',
      hints: ['日期開頭用 LIKE \'2025-03-08%\'。', "車牌用 IN ('MKJ-5821', 'MKJ-3390')。", "<code>SELECT capture_time, camera_location, plate_number, note FROM cctv_log WHERE capture_time LIKE '2025-03-08%' AND plate_number IN ('MKJ-5821', 'MKJ-3390');</code>"],
      check: { kind: 'result', cols: ['capture_time', 'camera_location', 'plate_number', 'note'], ordered: false },
      clue: { title: '監視器紀錄', text: 'MKJ-5821 在 21:12 於夜市入口停靠、21:38 在漁市街口高速離開；MKJ-3390 只在 19:02 出現在燈塔路停車場。' } },
    { type: 'lesson', title: 'ORDER BY 與 LIMIT：排序、取前幾名', body: `
      <p>結果的順序預設沒有保證。要排序用 <code>ORDER BY</code>，加 <code>DESC</code> 由大到小（預設 <code>ASC</code> 由小到大）：</p>
      <pre><code>SELECT sale_date, item_name, amount
FROM store_sale
WHERE store_id = 1
ORDER BY amount DESC
LIMIT 3;</code></pre>
      <p>ORDER BY 永遠寫在 WHERE 之後、LIMIT 之前。可以排多個欄位：<code>ORDER BY sale_date DESC, amount DESC</code>。</p>` },
    { type: 'task', id: 'c1-t7', title: '當晚賣最好的一筆', prompt: '「金鑫手機配件」的 <code>store_id</code> 是 1。從 <code>store_sale</code> 找出這家店<strong>金額最高的一筆</strong>銷售，顯示 <code>sale_date</code>、<code>item_name</code>、<code>amount</code>。',
      hints: ['先篩 store_id = 1，再依 amount 由大到小排。', 'ORDER BY amount DESC LIMIT 1', '<code>SELECT sale_date, item_name, amount FROM store_sale WHERE store_id = 1 ORDER BY amount DESC LIMIT 1;</code>'],
      check: { kind: 'result', cols: ['sale_date', 'item_name', 'amount'], ordered: true },
      clue: { title: '當晚熱賣品', text: '3 月 8 日當晚耳機賣出 5 副共 6,450 元，是攤位的熱賣品；被偷的正是展示盒裡剩下的耳機存貨。' } },
    { type: 'task', id: 'c1-t8', title: '嫌疑人筆錄', prompt: '從 <code>interview</code>（筆錄）找出 <code>person_id</code> 為 <strong>4 或 5</strong> 的筆錄，顯示 <code>person_id</code>、<code>transcript</code>，並依 <code>person_id</code> <strong>由小到大</strong>排序（ASC，可省略）。',
      lead: 'interview 表，IN 篩兩個人，最後加 ORDER BY。',
      hints: ['IN (4, 5)', 'ORDER BY person_id（不寫 DESC 就是由小到大）', '<code>SELECT person_id, transcript FROM interview WHERE person_id IN (4, 5) ORDER BY person_id;</code>'],
      check: { kind: 'result', cols: ['person_id', 'transcript'], ordered: true },
      clue: { title: '兩份筆錄', text: '吳志豪：「只是去逛逛，沒買東西。」蘇建豪：「九點到十點半都在潮港健身上課，有打卡紀錄。」' } },
    { type: 'lesson', title: '驗證不在場證明', body: `
      <p>蘇建豪說他在健身房。健身房的資料在兩張表：<code>gym_member</code>（會員，內含 <code>person_id</code>）與 <code>gym_checkin</code>（打卡，用 <code>membership_id</code> 對應會員編號）。</p>
      <p>先從會員表找出他的會員編號，再拿編號去打卡表查。這種「先查一張表、再查另一張」的兩步查法，下一章會學到一次搞定的方法。</p>` },
    { type: 'task', id: 'c1-t9', title: '會員編號', prompt: '從 <code>gym_member</code> 找出 <code>person_id</code> 為 <strong>5</strong> 的會員，顯示 <code>id</code> 與 <code>membership_status</code>。',
      hints: ['WHERE person_id = 5', 'SELECT id, membership_status ...', '<code>SELECT id, membership_status FROM gym_member WHERE person_id = 5;</code>'],
      check: { kind: 'result', cols: ['id', 'membership_status'], ordered: false },
      clue: { title: '蘇建豪的會員編號', text: '蘇建豪（5 號）的健身房會員編號是 YX4BY（銀卡）。下一題要用這個編號查打卡紀錄。' } },
    { type: 'task', id: 'c1-t10', after: { step: 'c1-t9', use: 'result' }, title: '打卡紀錄', prompt: '用上一題查到的會員編號（<code>membership_id</code>，忘了可看線索板），在 <code>gym_checkin</code> 找出 <strong>2025-03-08</strong> 的打卡，顯示 <code>checkin_time</code> 與 <code>checkout_time</code>。',
      lead: 'gym_checkin 表，兩個條件用 AND：會員編號是文字要加引號，日期欄是 checkin_date。',
      hints: ['會員編號是文字，要加單引號。', "AND checkin_date = '2025-03-08'", "<code>SELECT checkin_time, checkout_time FROM gym_checkin WHERE membership_id = 'YX4BY' AND checkin_date = '2025-03-08';</code>"],
      check: { kind: 'result', cols: ['checkin_time', 'checkout_time'], ordered: false },
      clue: { title: '不在場證明成立', text: '蘇建豪 3 月 8 日 21:00 到 22:30 在健身房打卡，案發 21:30 時他不可能在夜市。' } },
    { type: 'lesson', title: 'DISTINCT：去掉重複', body: `
      <p>想知道「有哪幾種店家類型」，直接 <code>SELECT kind FROM store</code> 會列出重複值。加 <code>DISTINCT</code> 只留不重複的：</p>
      <pre><code>SELECT DISTINCT kind FROM store;</code></pre>` },
    { type: 'task', id: 'c1-t11', title: '有哪些行政區出現過監視器紀錄？', prompt: '從 <code>cctv_log</code> 列出<strong>不重複</strong>的 <code>district</code>。',
      hints: ['SELECT DISTINCT 欄位', 'DISTINCT 放在 SELECT 後面、欄位名前面。', '<code>SELECT DISTINCT district FROM cctv_log;</code>'],
      check: { kind: 'result', cols: ['district'], ordered: false } },
    { type: 'quiz', id: 'c1-q1', question: "想找名字裡有「豪」的人，哪個寫法正確？", options: ["WHERE name = '%豪%'", "WHERE name LIKE '%豪%'", "WHERE name LIKE '豪'", "WHERE name IN ('%豪%')"], answer: 1, explain: '萬用字元 % 只有搭配 LIKE 才有效，= 與 IN 會把 % 當成普通字元。' },
    { type: 'quiz', id: 'c1-q2', question: '哪一句能找出「電話沒有登記」的人？', options: ["WHERE phone = NULL", "WHERE phone = ''", "WHERE phone IS NULL", "WHERE phone = 0"], answer: 2, explain: 'NULL 代表沒有資料，只能用 IS NULL / IS NOT NULL 判斷。' },
    { type: 'answer', id: 'c1-answer', prompt: '綜合所有線索：目擊特徵、監視器、筆錄與不在場證明，<strong>竊賊是誰？</strong>',
      success: '吳志豪的機車在案發前後都出現在夜市周邊，筆錄含糊其詞，而另一位嫌疑人有健身房打卡佐證。老闆娘指認後，吳志豪承認犯案，耳機也找回來了。',
      fail: '再看看證據板：誰的車在 21:38 高速離開漁市街口？誰又有不在場證明？',
      chain: ['c1-t3', 'c1-t6', 'c1-t10'], chainFail: '證據鏈是：把四張車牌篩到兩張的那一步 → 監視器在案發現場拍到的車牌 → 能證實（不只是主張）不在場的紀錄。',
      chainNotes: {
        'c1-t1': '目擊描述是篩選的條件，不是篩選的結果。哪一張把四張車牌縮成兩張？',
        'c1-t2': '四張車牌還沒套上白色機車與身高條件，範圍太大。',
        'c1-t4': '名字是查表查出來的，讓四張車牌變成兩個人的是前一步。',
        'c1-t7': '賣得好只說明耳機值錢，跟是誰偷的無關。',
        'c1-t8': '筆錄只是他自己的說法，哪一張證明了它？',
        'c1-t9': '會員編號只是查打卡的中繼站，打卡結果才是證據。',
      },
      suspects: ['吳志豪', '蘇建豪', '賴世偉', '簡冠霖'] },
    { type: 'story', lines: [
      { who: 'vendor', text: '太感謝了！耳機找回來，我請你們吃蚵仔煎！' },
      { who: 'mentor', text: '不錯。你已經會用 AND、LIKE、IN、BETWEEN 這些條件從幾百筆資料裡撈出兩個人。下一個案子的關鍵不在「是誰」，而在「什麼時候」。' },
    ] },
  ],
});
