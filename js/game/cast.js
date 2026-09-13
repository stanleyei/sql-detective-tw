/* 登場人物：對話卡片用的名稱與頭像 */
(function () {
  'use strict';
  window.SD = window.SD || {};
  window.SD.cast = {
    narrator: { name: '', img: null, role: '' },
    mentor: { name: '林曉青 警官', img: './images/char-mentor.webp', role: '你的指導警官' },
    chief: { name: '陳大川 局長', img: './images/char-chief.webp', role: '潮港市警察局長' },
    tech: { name: '張哲', img: './images/char-tech.webp', role: '鑑識技術員' },
    vendor: { name: '洪美玲', img: './images/char-vendor.webp', role: '夜市攤商' },
    clerk: { name: '許承恩', img: './images/char-clerk.webp', role: '便利商店店員' },
    station: { name: '楊詩涵', img: './images/char-station.webp', role: '捷運站務員' },
    manager: { name: '許國棟', img: './images/char-manager.webp', role: '潮港科技 研發部經理' },
    suspect: { name: '蔡明哲', img: './images/char-suspect.webp', role: '嫌疑人' },
  };
  window.SD.chapters = [];
})();
