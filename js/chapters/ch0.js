/* 第 0 章 報到日：認識資料庫、SELECT、WHERE */
SD.chapters.push({
  id: 0,
  slug: 'ch0',
  title: '報到日',
  subtitle: '認識警局資料庫',
  cover: './images/ch0.webp',
  skills: ['SHOW TABLES', 'DESCRIBE', 'SELECT', 'WHERE', '比較運算'],
  badge: { id: 'rookie', name: '菜鳥實習生', img: './images/badge-rookie.webp', desc: '完成報到，學會用 SELECT 打開資料抽屜。' },
  steps: [
    { type: 'story', lines: [
      { who: 'narrator', text: '潮港市，一座靠海的港口城市。九月，今天是你到市警局報到的第一天，被分派到局長剛開始籌備的「資料分析組」。' },
      { who: 'chief', text: '歡迎加入！我們局裡什麼都缺，最缺的就是看得懂資料的人。今年積了一疊沒破的案子，線索其實都在資料庫裡，只是沒人會把它們撈出來。' },
      { who: 'mentor', text: '我是林曉青，接下來由我帶你。別緊張，SQL 不是魔法，它只是一種「跟資料庫講話」的方式。我們從最簡單的開始。' },
    ] },
    { type: 'lesson', title: '資料庫是一整櫃檔案', body: `
      <p>把<strong>資料庫</strong>想成警局的一整櫃檔案。櫃子裡每個抽屜是一張<strong>資料表（table）</strong>，例如「市民」、「案件」、「駕照」。</p>
      <p>每張表像一張試算表：一<strong>列（row）</strong>是一筆資料（一個人、一件案子），一<strong>欄（column）</strong>是一種資訊（姓名、生日、地區）。</p>
      <p>要看有哪些抽屜，MariaDB 的指令是：</p>
      <pre><code>SHOW TABLES;</code></pre>
      <p>把它貼到右邊的查詢區，按「執行」（或 Ctrl + Enter）。每一句 SQL 結尾習慣加分號 <code>;</code>。</p>` },
    { type: 'task', id: 'c0-t1', title: '打開檔案櫃', prompt: '列出資料庫裡所有的資料表。',
      hints: ['列出資料表要用 MariaDB 的專用指令，不需要 SELECT。', '<code>SHOW</code> 後面接 <code>TABLES</code>，關鍵字大小寫都可以。', '<code>SHOW TABLES;</code>'],
      check: { kind: 'regex', pattern: '^\\s*SHOW\\s+(FULL\\s+)?TABLES\\b' },
      clue: { title: '資料庫總覽', text: '警局資料庫共有 18 張資料表，包含市民 person、案件 crime_report、駕照 driver_license、監視器 cctv_log 等。' } },
    { type: 'lesson', title: '看看抽屜裡有哪些欄位', body: `
      <p>知道有哪些表之後，下一步是看某張表<strong>有哪些欄位</strong>。用 <code>DESCRIBE</code>（或簡寫 <code>DESC</code>）：</p>
      <pre><code>DESCRIBE person;</code></pre>
      <p>結果會列出每個欄位的名稱（Field）、型別（Type）、能不能是空值（Null）、是否為主鍵（Key）。<strong>主鍵 PRI</strong> 就是每筆資料獨一無二的編號，像市民的身分證字號。</p>` },
    { type: 'task', id: 'c0-t2', title: '檢查市民資料表', prompt: '查看 <code>person</code>（市民）資料表有哪些欄位。',
      hints: ['查看資料表結構要用 <code>DESCRIBE</code>，也可以簡寫成 <code>DESC</code>。', '<code>DESCRIBE 表名;</code>，這題的表名是 <code>person</code>。', '<code>DESCRIBE person;</code>'],
      check: { kind: 'regex', pattern: '^\\s*(DESCRIBE|DESC|SHOW\\s+(FULL\\s+)?COLUMNS\\s+FROM)\\s+`?person`?\\s*;?\\s*$' },
      clue: { title: 'person 表結構', text: 'person 有 id、name、gender、birth_year、district、street、house_no、phone、license_id 九個欄位。' } },
    { type: 'lesson', title: 'SELECT：把資料撈出來', body: `
      <p>真正「讀資料」的指令是 <code>SELECT</code>。最基本的句型只有三個部分：</p>
      <pre><code>SELECT 想看的欄位
FROM   哪張表
LIMIT  最多幾筆;</code></pre>
      <p><code>*</code> 是「全部欄位」的意思。例如看案件表的前 5 筆：</p>
      <pre><code>SELECT * FROM crime_report LIMIT 5;</code></pre>
      <p>資料表可能有幾百筆，先加 <code>LIMIT</code> 只看前幾筆，是個好習慣。</p>` },
    { type: 'blocks', id: 'c0-b1', title: '把 SQL 拼起來', prompt: '把下面的積木拖到正確位置，組出「從 crime_report 表取出全部欄位、只看前 5 筆」的 SQL。',
      blocks: ['SELECT', '*', 'FROM', 'crime_report', 'LIMIT', '5;'],
      answer: 'SELECT * FROM crime_report LIMIT 5;' },
    { type: 'task', id: 'c0-t3', title: '先看五件案子', prompt: '從 <code>crime_report</code> 表取出<strong>全部欄位</strong>，只看前 5 筆。',
      lead: 'SELECT * 取全部欄位，最後用 LIMIT 控制筆數。',
      hints: ['句型是 SELECT 欄位、FROM 資料表、LIMIT 筆數。', '<code>SELECT * FROM crime_report LIMIT ___;</code>', '<code>SELECT * FROM crime_report LIMIT 5;</code>'],
      check: { kind: 'result', cols: ['id', 'report_date', 'crime_type', 'district', 'description'], ordered: true } },
    { type: 'lesson', title: '只挑你要的欄位', body: `
      <p><code>*</code> 會把所有欄位都倒出來，很快就眼花。實務上會<strong>只列出需要的欄位</strong>，用逗號分開：</p>
      <pre><code>SELECT name, district FROM person;</code></pre>
      <p>注意：最後一個欄位後面<strong>不能</strong>有逗號，這是初學者最常見的錯誤之一。</p>` },
    { type: 'task', id: 'c0-t4', title: '市民名冊', prompt: '列出所有市民的 <code>name</code> 與 <code>district</code> 兩個欄位（不加 LIMIT，看看總共幾筆）。',
      hints: ['SELECT 後面放兩個欄位名稱，用逗號分開。', '<code>SELECT ___, ___ FROM person;</code>', '<code>SELECT name, district FROM person;</code>'],
      check: { kind: 'result', cols: ['name', 'district'], ordered: false },
      clue: { title: '潮港市有五個行政區', text: '港東區、港西區、山城區、中央區、海濱區，共 420 位登記市民。' } },
    { type: 'lesson', title: 'WHERE：只留下符合條件的', body: `
      <p>辦案不會把全市 420 人都叫來問話。<code>WHERE</code> 用來<strong>篩選</strong>符合條件的列：</p>
      <pre><code>SELECT name FROM person
WHERE district = '港東區';</code></pre>
      <p>重點：</p>
      <ul>
        <li>文字要用<strong>單引號</strong>包起來：<code>'港東區'</code>。數字不用：<code>birth_year &gt; 2000</code>。</li>
        <li>常用比較：<code>=</code> 等於、<code>&lt;&gt;</code> 不等於、<code>&gt;</code>、<code>&lt;</code>、<code>&gt;=</code>、<code>&lt;=</code>。</li>
        <li>不等於也可以寫成 <code>!=</code>，兩者完全同義：<code>&lt;&gt;</code> 是 SQL 標準寫法，<code>!=</code> 則常見於 Laravel、PHP 等程式碼中，選一種並在同一份程式裡保持一致即可。</li>
        <li>順序固定是 <code>SELECT → FROM → WHERE → LIMIT</code>。</li>
      </ul>` },
    { type: 'task', id: 'c0-t5', title: '港東區的居民', prompt: '列出住在<strong>港東區</strong>的市民姓名（<code>name</code>）。',
      hints: ['在 FROM person 後面加上 WHERE 條件。', '條件是 district 等於 \'港東區\'，記得單引號。', '<code>SELECT name FROM person WHERE district = \'港東區\';</code>'],
      check: { kind: 'result', cols: ['name'], ordered: false } },
    { type: 'task', id: 'c0-t5b', title: '中央區以外的人', prompt: '列出<strong>不住在中央區</strong>的市民姓名（<code>name</code>）與行政區（<code>district</code>）。',
      lead: '還是 person 表。「不等於」用 <> 或 !=，也可以用 NOT。',
      hints: ['「不等於」用 &lt;&gt; 或 !=，兩種寫法都可以。', '條件是 district &lt;&gt; \'中央區\'。', '<code>SELECT name, district FROM person WHERE district &lt;&gt; \'中央區\';</code>'],
      check: { kind: 'result', cols: ['name', 'district'], ordered: false } },
    { type: 'task', id: 'c0-t6', title: '年輕世代', prompt: '列出 <strong>2000 年之後</strong>（不含 2000）出生的市民 <code>name</code> 與 <code>birth_year</code>。',
      lead: 'person 表的 birth_year 是數字，用 > 比大小，數字不加引號。',
      hints: ['出生年欄位是 birth_year，是數字，不用引號。', '「之後、不含」就是大於 &gt;。', '<code>SELECT name, birth_year FROM person WHERE birth_year &gt; 2000;</code>'],
      check: { kind: 'result', cols: ['name', 'birth_year'], ordered: false } },
    { type: 'task', id: 'c0-t7', title: '編號 1 號是誰？', prompt: '用 <code>id</code> 找出市民編號為 <strong>1</strong> 的人，顯示 <code>name</code>。',
      lead: 'person 表用 WHERE id = 數字 鎖定一個人，只 SELECT 需要的欄位。',
      hints: ['主鍵 id 是數字。', 'WHERE id = 1', '<code>SELECT name FROM person WHERE id = 1;</code>'],
      check: { kind: 'value' },
      clue: { title: '編號 1 號', text: '市民編號 1 號正是你的指導警官林曉青。資料庫裡連警察自己都有紀錄。' } },
    { type: 'story', lines: [
      { who: 'mentor', text: '對，1 號就是我。資料庫裡沒有秘密，只有你會不會問。' },
      { who: 'mentor', text: '最後一題。案件表裡有一種案件類型叫「命案」。查出來看看，但先別急著碰，那件案子等你練好功夫再說。' },
    ] },
    { type: 'task', id: 'c0-t8', title: '那件命案', prompt: '從 <code>crime_report</code> 找出 <code>crime_type</code> 為 <strong>命案</strong> 的案件，顯示 <code>report_date</code>、<code>district</code> 與 <code>description</code>。',
      lead: 'crime_report 表，WHERE 比對文字要加單引號。三個欄位用逗號分開。',
      hints: ['條件放在 WHERE，文字要單引號。', '<code>WHERE crime_type = \'命案\'</code>', '<code>SELECT report_date, district, description FROM crime_report WHERE crime_type = \'命案\';</code>'],
      check: { kind: 'result', cols: ['report_date', 'district', 'description'], ordered: false },
      clue: { title: '海景大樓命案', text: '2025-08-15 海濱區「海景大樓」發生命案，死者游致遠。兩名目擊者：海濱路門牌最大那戶的住戶、住中央路的林姓市民。' } },
    { type: 'quiz', id: 'c0-q1', question: '想「只看住在山城區的人」，條件應該寫在哪個關鍵字後面？', options: ['SELECT', 'FROM', 'WHERE', 'LIMIT'], answer: 2, explain: 'WHERE 負責篩選列；SELECT 決定看哪些欄位、FROM 決定哪張表、LIMIT 限制筆數。' },
    { type: 'quiz', id: 'c0-q2', question: '下面哪一句是正確的？', options: ["SELECT name FROM person WHERE district = 港東區;", "SELECT name FROM person WHERE district = '港東區';", "SELECT name WHERE district = '港東區' FROM person;", "SELECT name, FROM person;"], answer: 1, explain: '文字要用單引號；WHERE 必須在 FROM 之後；欄位清單最後不能有多餘的逗號。' },
    { type: 'story', lines: [
      { who: 'chief', text: '第一天就能自己撈資料，不錯。明天從三月港東夜市那件積案開始，一件一件重查，正好給你練手。' },
      { who: 'mentor', text: '今天記住四個關鍵字就夠了：SELECT、FROM、WHERE、LIMIT。明天我們翻開檔案櫃，開始真正辦案。' },
    ] },
  ],
});
