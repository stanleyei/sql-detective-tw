/* 遊戲頁的插畫對照表：場景圖、教學主視覺、線索圖示、空狀態。素材由 scripts/gen-images.js 產生。 */
(function () {
  'use strict';
  window.SD = window.SD || {};

  /* 劇情步驟 → 場景圖。key 為「章節 slug/步驟索引」；各章第一段劇情沿用章節封面（見 scene()）。 */
  const scenes = {
    'ch0/15': './images/scene/ch0-office.webp',
    'ch0/19': './images/scene/ch0-lobby.webp',
    'ch1/10': './images/scene/ch1-forensics.webp',
    'ch1/23': './images/scene/ch1-nightmarket-end.webp',
    'ch2/21': './images/scene/ch2-store-end.webp',
    'ch3/22': './images/scene/ch3-lostfound.webp',
    'ch4/7': './images/scene/ch4-drawer.webp',
    'ch4/21': './images/scene/ch4-serverroom.webp',
    'ch5/24': './images/scene/ch5-evidence-room.webp',
    'ch6/11': './images/scene/ch6-interrogation.webp',
    'ch6/19': './images/scene/ch6-harbor-end.webp',
  };

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

  function scene(chapter, stepIndex) {
    const step = chapter.steps[stepIndex];
    if (!step || step.type !== 'story') return null;
    const firstStory = chapter.steps.findIndex((s) => s.type === 'story');
    if (stepIndex === firstStory) return chapter.cover || null;
    return scenes[`${chapter.slug}/${stepIndex}`] || null;
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
