/* 首屏進度旗標：在 <head> 同步執行，於首次繪製前替 <html> 加上 data-resume。
 * 「開始辦案／繼續辦案」與續玩區靠 CSS 依此屬性切換，避免 main.js 尚未載入時先閃出「開始辦案」誤導有進度的玩家。
 * key 須與 js/game/state.js 的 KEY 一致；這裡不載入 state.js 是為了維持極小體積與同步阻塞時間。 */
(function () {
  try {
    var raw = localStorage.getItem('sd_progress_v1');
    var s = raw ? JSON.parse(raw) : null;
    if (s && s.chapters && Object.keys(s.chapters).length > 0) document.documentElement.setAttribute('data-resume', '');
  } catch (e) { /* 私密模式或資料損毀時視為無進度，維持「開始辦案」 */ }
})();
