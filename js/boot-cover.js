/* 首屏背景預載：在 <head> 同步執行，於 script 鏈開始前就把開場過場要用的章節封面排入下載。
 * #boot-bg 的 src 由 play.js 的 boot() 依 hash 與進度決定，瀏覽器的預載掃描器看不到，
 * 若不在這裡先發請求，封面會排在二十多支 script 之後才開始載入。
 * 章節選擇邏輯須與 play.js 的 boot() 一致（hash 指定且已解鎖 → 該章；否則第一個已解鎖未完成的章節；否則第 0 章），
 * 封面路徑依慣例為 ./images/ch<N>.webp；猜錯只會多載一張圖，不影響正確性。
 * key 須與 js/game/state.js 的 KEY 一致；不載入 state.js 與章節檔是為了維持極小體積與同步阻塞時間。 */
(function () {
  var LAST = 6;
  var done = {};
  try {
    var raw = localStorage.getItem('sd_progress_v1');
    var s = raw ? JSON.parse(raw) : null;
    if (s && s.chapters) for (var k in s.chapters) done[k] = !!s.chapters[k].done;
  } catch (e) { /* 私密模式或資料損毀時視為無進度 */ }
  function unlocked(id) { return id === 0 || !!done[id - 1]; }
  var m = /^#ch(\d)(?:\/|$)/.exec(location.hash);
  var id = m ? Number(m[1]) : NaN;
  if (!(id >= 0 && id <= LAST && unlocked(id))) {
    id = 0;
    for (var i = 0; i <= LAST; i++) { if (unlocked(i) && !done[i]) { id = i; break; } }
  }
  var link = document.createElement('link');
  link.rel = 'preload';
  link.as = 'image';
  link.href = './images/ch' + id + '.webp';
  link.fetchPriority = 'high';
  document.head.appendChild(link);
})();
