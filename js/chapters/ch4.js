/* 第 4 章 公司內鬼：INNER JOIN、多表 JOIN、LEFT JOIN、自我連結、JOIN + GROUP BY */
SD.chapters.push({
  id: 4,
  slug: 'ch4',
  title: '公司內鬼',
  subtitle: '把資料表接起來',
  cover: './images/ch4.webp',
  minutes: 90,
  skills: ['INNER JOIN', '多表 JOIN', 'LEFT JOIN', '表別名', '自我連結'],
  badge: { id: 'join', name: '連結專家', img: './images/badge-join.webp', desc: '用 JOIN 把門禁、員工、市民、捷運四張表串成一條證據鏈。' },
  steps: [
    { type: 'story', lines: [
      { who: 'narrator', text: '6 月 21 日早上，山城區「潮港科技」的法務打電話進來：昨晚 22:00 到 23:00 之間，機房裡的客戶資料被複製外流。' },
      { who: 'manager', text: '門禁系統只記錄員工編號，不會記名字。你們要自己對照員工表跟市民表。對了，我昨天六點多就下班了。' },
      { who: 'mentor', text: '注意到了嗎？門禁表 access_log 記的是 employee_id，員工表 employee 記的是 person_id，名字在 person。三張表，三把鑰匙。這章學 JOIN。' },
    ] },
    { type: 'task', id: 'c4-t1', title: '公司編號', prompt: '從 <code>company</code> 找出名稱以<strong>潮港科技</strong>開頭的公司，顯示 <code>id</code>、<code>name</code>、<code>district</code>。',
      lead: 'company 表，名稱開頭用 LIKE 加 %。',
      hints: ["LIKE '潮港科技%'", 'SELECT id, name, district', "<code>SELECT id, name, district FROM company WHERE name LIKE '潮港科技%';</code>"],
      check: { kind: 'result', cols: ['id', 'name', 'district'], ordered: false },
      clue: { title: '潮港科技', text: 'company_id = 1，位於山城區。' } },
    { type: 'lesson', title: 'JOIN：把兩張表並排接起來', body: `
      <p><code>employee</code> 表只有 <code>person_id</code>，看不到名字。要看名字，得把 <code>employee</code> 和 <code>person</code> <strong>接在一起</strong>：</p>
      <pre><code>SELECT e.id, p.name, e.department, e.title
FROM employee AS e
JOIN person AS p ON p.id = e.person_id
WHERE e.company_id = 1;</code></pre>
      <ul>
        <li><code>ON</code> 後面寫「兩張表怎麼對上」：員工的 person_id 等於市民的 id。</li>
        <li><code>e</code>、<code>p</code> 是<strong>表別名</strong>，之後用 <code>e.欄位</code>、<code>p.欄位</code> 指明是哪張表的欄位，避免同名混淆。</li>
        <li><code>JOIN</code> 就是 <code>INNER JOIN</code>：只留下<strong>兩邊都對得上</strong>的列。</li>
      </ul>` },
    { type: 'task', id: 'c4-t2', title: '員工名冊', prompt: '列出 <code>company_id = 1</code> 的所有員工：顯示 <code>e.id</code>、<code>p.name</code>、<code>e.department</code>、<code>e.title</code>（employee 別名 e、person 別名 p）。',
      hints: ['FROM employee e JOIN person p ON p.id = e.person_id', 'WHERE e.company_id = 1', '<code>SELECT e.id, p.name, e.department, e.title FROM employee e JOIN person p ON p.id = e.person_id WHERE e.company_id = 1;</code>'],
      check: { kind: 'result', cols: ['id', 'name', 'department', 'title'], ordered: false },
      clue: { title: '潮港科技員工', text: '共 30 名員工，分屬研發、業務、人資、財務、資訊五個部門。' } },
    { type: 'task', id: 'c4-t3', title: '誰刷進了機房？', prompt: '從 <code>access_log</code> 找出 <code>door</code> 為<strong>機房</strong>、時間在 <strong>2025-06-20 22:00:00 到 23:00:00</strong> 之間的紀錄，顯示 <code>employee_id</code>、<code>action</code>、<code>event_time</code>。',
      lead: 'access_log 表，door 與 event_time 兩個條件用 AND，時間用 BETWEEN 並寫完整日期時間。',
      hints: ["door = '機房' AND event_time BETWEEN ... AND ...", '這題還不需要 JOIN。', "<code>SELECT employee_id, action, event_time FROM access_log WHERE door = '機房' AND event_time BETWEEN '2025-06-20 22:00:00' AND '2025-06-20 23:00:00';</code>"],
      check: { kind: 'result', cols: ['employee_id', 'action', 'event_time'], ordered: false },
      clue: { title: '機房門禁', text: '員工編號 1 的卡在 22:17 進入機房、22:41 離開。' } },
    { type: 'lesson', title: '三張表一起 JOIN', body: `
      <p>JOIN 可以一路接下去。門禁 → 員工 → 市民：</p>
      <pre><code>SELECT p.name, e.title, a.door, a.event_time
FROM access_log AS a
JOIN employee AS e ON e.id = a.employee_id
JOIN person   AS p ON p.id = e.person_id
WHERE a.door = '機房';</code></pre>
      <p>每多一張表，就多一行 <code>JOIN ... ON ...</code>。</p>` },
    { type: 'task', id: 'c4-t4', title: '那張卡是誰的？', prompt: '把上一題的機房紀錄接上員工與市民，顯示 <code>p.name</code>、<code>e.title</code>、<code>a.action</code>、<code>a.event_time</code>（access_log 別名 a）。',
      hints: ['FROM access_log a JOIN employee e ON e.id = a.employee_id JOIN person p ON p.id = e.person_id', '時間與門的條件放 WHERE，記得用 a. 前綴。', "<code>SELECT p.name, e.title, a.action, a.event_time FROM access_log a JOIN employee e ON e.id = a.employee_id JOIN person p ON p.id = e.person_id WHERE a.door = '機房' AND a.event_time BETWEEN '2025-06-20 22:00:00' AND '2025-06-20 23:00:00';</code>"],
      check: { kind: 'result', cols: ['name', 'title', 'action', 'event_time'], ordered: false },
      clue: { title: '經理的卡', text: '刷進機房的是研發部經理許國棟的門禁卡。但他說他六點就下班了。' } },
    { type: 'story', lines: [
      { who: 'manager', text: '我的卡？我……我好像把它放在辦公桌抽屜裡沒帶走。我真的六點多就搭捷運回家了，山城站上車。' },
      { who: 'mentor', text: '他說搭捷運。捷運資料我們有。把 transit_log、transit_card、person 接起來，看他的卡那天晚上在哪裡。' },
    ] },
    { type: 'task', id: 'c4-t5', title: '經理的捷運紀錄', prompt: '接起 <code>transit_log</code>（別名 t）、<code>transit_card</code>（別名 c，用 <code>card_id</code> 對應）、<code>person</code>（別名 p，用 <code>person_id</code> 對應），找出 <strong>許國棟</strong> 在 <strong>2025-06-20</strong> 的進出站紀錄，顯示 <code>t.station</code>、<code>t.direction</code>、<code>t.log_time</code>。',
      lead: '三張表兩個 JOIN：transit_log → transit_card（card_id）→ person（person_id），WHERE 放姓名與日期。',
      hints: ['JOIN transit_card c ON c.card_id = t.card_id JOIN person p ON p.id = c.person_id', "WHERE p.name = '許國棟' AND t.log_time LIKE '2025-06-20%'", "<code>SELECT t.station, t.direction, t.log_time FROM transit_log t JOIN transit_card c ON c.card_id = t.card_id JOIN person p ON p.id = c.person_id WHERE p.name = '許國棟' AND t.log_time LIKE '2025-06-20%';</code>"],
      check: { kind: 'result', cols: ['station', 'direction', 'log_time'], ordered: false },
      clue: { title: '經理不在現場', text: '許國棟的悠遊卡 22:05 在山城站進站、22:35 在港東站出站。機房刷卡 22:17 時，他人在捷運上。有人用了他的卡。' } },
    { type: 'lesson', title: 'LEFT JOIN：對不上的也要留下來', body: `
      <p><code>JOIN</code> 只留兩邊都有的。但「哪些員工<strong>當晚沒有</strong>任何門禁紀錄」這種問題，需要把<strong>沒對上的也留下</strong>，右邊補 NULL。這就是 <code>LEFT JOIN</code>：</p>
      <pre><code>SELECT p.name, a.door, a.event_time
FROM employee AS e
JOIN person AS p ON p.id = e.person_id
LEFT JOIN access_log AS a
  ON a.employee_id = e.id
  AND a.event_time BETWEEN '2025-06-20 20:00:00' AND '2025-06-20 23:59:59'
WHERE e.company_id = 1 AND e.department = '研發部';</code></pre>
      <p>把時間條件寫在 <code>ON</code> 裡而不是 WHERE，這樣沒有紀錄的員工才會以 NULL 保留下來。</p>` },
    { type: 'task', id: 'c4-t6', title: '研發部當晚誰在公司？', prompt: '照上面的寫法，列出研發部每位員工在 <strong>6 月 20 日 20:00 之後</strong>的門禁紀錄（沒有的顯示 NULL），顯示 <code>p.name</code>、<code>a.door</code>、<code>a.event_time</code>。',
      hints: ['先 JOIN person，再 LEFT JOIN access_log。', '時間條件放在 LEFT JOIN 的 ON 裡。', "<code>SELECT p.name, a.door, a.event_time FROM employee e JOIN person p ON p.id = e.person_id LEFT JOIN access_log a ON a.employee_id = e.id AND a.event_time BETWEEN '2025-06-20 20:00:00' AND '2025-06-20 23:59:59' WHERE e.company_id = 1 AND e.department = '研發部';</code>"],
      check: { kind: 'result', cols: ['name', 'door', 'event_time'], ordered: false },
      clue: { title: '研發部當晚動態', text: '只有兩人有紀錄：許國棟（研發區、機房）與周文傑（大門 21:55 進、23:05 出）。其餘研發部員工當晚都沒有回公司。' } },
    { type: 'task', id: 'c4-t7', title: '整棟樓還有誰？', prompt: '不限部門：列出 <strong>6 月 20 日 20:00 到 23:59:59</strong> 之間有任何門禁紀錄的<strong>不重複</strong>員工姓名 <code>p.name</code>。',
      lead: '同上一題的三表 JOIN，WHERE 只留時間範圍，SELECT DISTINCT p.name。',
      hints: ['FROM access_log a JOIN employee e ... JOIN person p ...', 'SELECT DISTINCT p.name', "<code>SELECT DISTINCT p.name FROM access_log a JOIN employee e ON e.id = a.employee_id JOIN person p ON p.id = e.person_id WHERE a.event_time BETWEEN '2025-06-20 20:00:00' AND '2025-06-20 23:59:59';</code>"],
      check: { kind: 'result', cols: ['name'], ordered: false },
      clue: { title: '當晚在場名單', text: '許國棟（卡片，本人不在）、周文傑、以及一位業務部員工郭曼玲（22:20 就離開了）。' } },
    { type: 'task', id: 'c4-t8', title: '兩個人的說法', prompt: '從 <code>interview</code> 接上 <code>person</code>，取出 <strong>許國棟</strong> 與 <strong>周文傑</strong> 的筆錄，顯示 <code>p.name</code>、<code>i.transcript</code>。',
      lead: 'interview JOIN person ON p.id = i.person_id，WHERE p.name IN (...)。',
      hints: ["WHERE p.name IN ('許國棟', '周文傑')", 'JOIN person p ON p.id = i.person_id', "<code>SELECT p.name, i.transcript FROM interview i JOIN person p ON p.id = i.person_id WHERE p.name IN ('許國棟', '周文傑');</code>"],
      check: { kind: 'result', cols: ['name', 'transcript'], ordered: false },
      clue: { title: '周文傑說謊', text: '周文傑聲稱「加班到十點就回家」，但門禁顯示他 21:55 才進大門、23:05 才離開，中間正是機房被刷開的時段。' } },
    { type: 'lesson', title: '自我連結：員工與他的主管在同一張表', body: `
      <p><code>employee.manager_id</code> 指向<strong>同一張表</strong>的另一列。要列出「員工與主管姓名」，就把 employee 跟自己 JOIN 一次，用兩個不同別名：</p>
      <pre><code>SELECT p.name AS employee, m.name AS manager
FROM employee AS e
JOIN person AS p ON p.id = e.person_id
LEFT JOIN employee AS me ON me.id = e.manager_id
LEFT JOIN person   AS m  ON m.id = me.person_id
WHERE e.company_id = 1;</code></pre>
      <p>用 LEFT JOIN 是因為經理自己沒有主管（manager_id 為 NULL），也要列出來。</p>` },
    { type: 'task', id: 'c4-t9', title: '研發部的指揮鏈', prompt: '列出研發部（<code>e.department = \'研發部\'</code>、<code>company_id = 1</code>）每位員工與其主管的姓名，兩欄別名 <code>employee</code>、<code>manager</code>。',
      hints: ['照上面的範例加上部門條件。', "WHERE e.company_id = 1 AND e.department = '研發部'", "<code>SELECT p.name AS employee, m.name AS manager FROM employee e JOIN person p ON p.id = e.person_id LEFT JOIN employee me ON me.id = e.manager_id LEFT JOIN person m ON m.id = me.person_id WHERE e.company_id = 1 AND e.department = '研發部';</code>"],
      check: { kind: 'result', cols: null, ordered: false },
      clue: { title: '直屬關係', text: '周文傑是許國棟的直屬部下，知道經理的座位與習慣，有機會拿到抽屜裡的門禁卡。' } },
    { type: 'lesson', title: 'JOIN 也能配 GROUP BY', body: `
      <p>接起來的表一樣可以分組統計：</p>
      <pre><code>SELECT c.name, COUNT(*) AS headcount
FROM employee AS e
JOIN company AS c ON c.id = e.company_id
GROUP BY c.name;</code></pre>` },
    { type: 'task', id: 'c4-t10', title: '各公司人數', prompt: '統計<strong>每家公司</strong>的員工人數，顯示 <code>c.name</code> 與人數（別名 <code>headcount</code>），依人數由多到少排序。',
      hints: ['JOIN company c ON c.id = e.company_id', 'GROUP BY c.name ORDER BY headcount DESC', '<code>SELECT c.name, COUNT(*) AS headcount FROM employee e JOIN company c ON c.id = e.company_id GROUP BY c.name ORDER BY headcount DESC;</code>'],
      check: { kind: 'result', cols: null, ordered: false } },
    { type: 'task', id: 'c4-t11', title: '各部門平均薪資', prompt: '潮港科技（<code>company_id = 1</code>）<strong>每個部門</strong>的平均薪資，顯示 <code>department</code> 與 <code>ROUND(AVG(salary), 0)</code>（別名 <code>avg_salary</code>）。',
      lead: 'employee 表：WHERE company_id 條件，GROUP BY department，ROUND(AVG(salary), 0) AS avg_salary。',
      hints: ['這題只需要 employee 一張表。', 'GROUP BY department', '<code>SELECT department, ROUND(AVG(salary), 0) AS avg_salary FROM employee WHERE company_id = 1 GROUP BY department;</code>'],
      check: { kind: 'result', cols: null, ordered: false } },
    { type: 'quiz', id: 'c4-q1', question: '想列出「所有員工，包含沒有任何門禁紀錄的人」，該用？', options: ['JOIN', 'INNER JOIN', 'LEFT JOIN', 'GROUP BY'], answer: 2, explain: 'LEFT JOIN 會保留左表全部的列，右表對不上就補 NULL。' },
    { type: 'quiz', id: 'c4-q2', question: 'JOIN 裡的 ON 是用來？', options: ['篩選日期', '指定兩張表用哪個欄位對應', '排序', '限制筆數'], answer: 1, explain: 'ON 描述兩張表的對應關係，例如 ON p.id = e.person_id。' },
    { type: 'answer', id: 'c4-answer', prompt: '門禁卡屬於經理，但經理在捷運上；當晚只有一名研發部員工在公司，而且說了謊。<strong>內鬼是誰？</strong>',
      success: '周文傑趁經理下班後，從抽屜取出門禁卡刷進機房複製資料。捷運紀錄替許國棟洗清嫌疑，門禁紀錄則戳破周文傑「十點就回家」的說法。公司在他的私人硬碟中找到外流資料。',
      fail: '看看 LEFT JOIN 那題：研發部裡除了經理的卡，還有誰當晚有大門紀錄？他的筆錄跟門禁對得上嗎？' },
    { type: 'story', lines: [
      { who: 'manager', text: '是文傑……他跟了我五年。我以後不會再把卡放抽屜了。' },
      { who: 'mentor', text: '這一案你把四張表串成了一條證據鏈，這是資料庫最強的地方。休息一下，下一章不辦案，我們來整理資料室。' },
    ] },
  ],
});
