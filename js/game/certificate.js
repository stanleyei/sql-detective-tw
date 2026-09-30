/* 結案證書頁：資料全部來自網址參數（進度存在玩家自己的瀏覽器，分享只能靠網址帶值）。
 * 參數是外部輸入，一律以 textContent 寫入、數字強制轉型、徽章 id 只認章節定義裡有的。 */
(function () {
  'use strict';
  const $ = (s) => document.querySelector(s);
  const q = new URLSearchParams(location.search);
  const num = (k, max) => { const n = parseInt(q.get(k), 10); return Number.isFinite(n) && n >= 0 ? Math.min(n, max) : 0; };
  const chapters = (window.SD && SD.chapters ? SD.chapters.slice() : []).sort((a, b) => a.id - b.id);
  const tasksOf = (ch) => ch.steps.filter((s) => s.type === 'task');
  const badgeDefs = chapters.map((c) => c.badge).concat([{ id: 'master', name: '結案證書', img: './images/badge-master.webp' }]);
  const maxStars = chapters.reduce((s, c) => s + tasksOf(c).length * 3, 0);

  const RANKS = ['實習偵探', '見習偵探', '正式偵探', '資深偵探', '金牌偵探'];
  const rank = RANKS.includes(q.get('r')) ? q.get('r') : null;
  const has = q.has('r');

  const chaptersDone = num('c', chapters.length);
  const stars = num('s', maxStars);
  const clues = num('k', 999);
  const ownedIds = (q.get('b') || '').split(',').filter((id) => badgeDefs.some((b) => b.id === id));
  const date = /^\d{4}-\d{2}-\d{2}$/.test(q.get('d') || '') ? q.get('d') : null;

  $('#cert-rank').textContent = rank || (has ? '偵探' : '—');
  $('#cert-chapters').textContent = String(chaptersDone);
  $('#cert-chapters-max').textContent = ` / ${chapters.length} 章`;
  $('#cert-stars').textContent = String(stars);
  $('#cert-stars-max').textContent = ` / ${maxStars}`;
  $('#cert-clues').textContent = String(clues);
  $('#cert-badges').textContent = String(ownedIds.length);
  $('#cert-badges-max').textContent = ` / ${badgeDefs.length} 枚`;
  $('#cert-date').textContent = date ? new Date(`${date}T00:00:00`).toLocaleDateString('zh-TW') : '—';

  const wall = $('#cert-wall');
  for (const b of badgeDefs) {
    const li = document.createElement('li');
    const owned = ownedIds.includes(b.id);
    if (!owned) li.className = 'is-locked';
    const img = document.createElement('img');
    img.src = b.img; img.width = 56; img.height = 56; img.loading = 'lazy';
    img.alt = owned ? b.name : `${b.name}（未取得）`;
    li.appendChild(img);
    wall.appendChild(li);
  }

  $('#cert-empty').hidden = has;
  $('#cert-print').addEventListener('click', () => window.print());
  $('#cert-copy').addEventListener('click', async () => {
    const status = $('#cert-status');
    try { await navigator.clipboard.writeText(location.href); status.textContent = '已複製網址，貼給朋友就能看到這張證書。'; }
    catch (e) { status.textContent = '這個瀏覽器不允許複製，請直接複製網址列。'; }
  });
})();
