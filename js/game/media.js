/* 遊戲頁的插畫對照表：場景圖、教學主視覺、線索圖示、空狀態。素材由 scripts/gen-images.js 產生。 */
(function () {
  'use strict';
  window.SD = window.SD || {};

  /* 每章教學卡右上角的主視覺（象徵該章語法主題） */
  const lessonArt = {
    0: './images/lesson/ch0-cabinet.webp',
    1: './images/lesson/ch1-filter.webp',
    2: './images/lesson/ch2-time.webp',
    3: './images/lesson/ch3-stats.webp',
    4: './images/lesson/ch4-join.webp',
    5: './images/lesson/ch5-build.webp',
    6: './images/lesson/ch6-nested.webp',
  };

  /* 線索標題關鍵字 → 圖示。順序即優先序，第一個命中的生效；都沒中用 casefile。 */
  const clueRules = [
    [/車牌|車主/, 'plate'],
    [/監視器|路線|逃逸/, 'cctv'],
    [/悠遊卡|行蹤|捷運/, 'transit'],
    [/門禁|的卡|在場|動態/, 'keycard'],
    [/筆錄|證詞|目擊|證明|說謊/, 'testimony'],
    [/損失|價值|熱賣|元|規模|3C/, 'money'],
    [/總覽|表結構|系統|入庫|證物|重編號|行政區/, 'database'],
    [/嫌疑|人|會員|女性|主使|兇手|經理|員工|清單|直屬|落網|符合/, 'person'],
  ];

  /* 劇情步驟的場景圖：寫在各章 story 步驟的 scene 欄位；沒寫的第一段劇情沿用章節封面。
     不用「步驟索引」對照，因為章節中間插入題目就會讓索引漂移、場景圖無聲失效。 */
  function scene(chapter, stepIndex) {
    const step = chapter.steps[stepIndex];
    if (!step || step.type !== 'story') return null;
    if (step.scene) return step.scene;
    const firstStory = chapter.steps.findIndex((s) => s.type === 'story');
    return stepIndex === firstStory ? chapter.cover || null : null;
  }

  function clueIcon(title) {
    const hit = clueRules.find(([re]) => re.test(title || ''));
    return `./images/clue/${hit ? hit[1] : 'casefile'}.webp`;
  }

  window.SD.media = {
    scene,
    lessonArt: (chapterId) => lessonArt[chapterId] || null,
    clueIcon,
    empty: {
      dbLoading: './images/empty/db-loading.webp',
      board: './images/empty/board-empty.webp',
      results: './images/empty/results-empty.webp',
    },
  };
})();
