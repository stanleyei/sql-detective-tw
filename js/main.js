/* 首頁：卷宗（章節清單）、進度、Hero 開場序列與手電筒 */
(function () {
  'use strict';
  const reduce = window.matchMedia('(prefers-reduced-motion: reduce)').matches;

  // 回到頂部
  const goTop = document.getElementById('go-top');
  if (goTop) {
    window.addEventListener('scroll', () => {
      const show = window.scrollY >= 600;
      goTop.classList.toggle('hidden', !show);
      goTop.classList.toggle('flex', show);
    }, { passive: true });
    goTop.addEventListener('click', () => window.scrollTo({ top: 0, behavior: reduce ? 'auto' : 'smooth' }));
  }

  /* ---------- Hero：手電筒 ----------
   * 亮版插畫以 mask 露出游標周圍；座標寫成百分比，視窗縮放時光圈位置不會漂 */
  const hero = document.getElementById('hero');
  if (hero && window.matchMedia('(hover: hover)').matches) {
    const art = hero.querySelector('.hero-art');
    hero.addEventListener('pointermove', (e) => {
      const r = hero.getBoundingClientRect();
      art.style.setProperty('--tx', `${((e.clientX - r.left) / r.width * 100).toFixed(2)}%`);
      art.style.setProperty('--ty', `${((e.clientY - r.top) / r.height * 100).toFixed(2)}%`);
      hero.classList.add('is-lit');
    }, { passive: true });
    hero.addEventListener('pointerleave', () => hero.classList.remove('is-lit'));
  }

  /* ---------- Hero：開場序列 ----------
   * 先打出一句 SQL，「結果回來」時標題逐行亮起、插畫變亮。減少動態或沒有 GSAP 時直接把整段顯示出來 */
  const codeEl = document.getElementById('hero-code-text');
  const CODE = 'SELECT truth FROM chaogang_city;';
  if (hero && codeEl) {
    if (reduce || !window.gsap) {
      codeEl.textContent = CODE;
      hero.classList.add('is-done');
    } else {
      hero.classList.add('is-animating');
      const tl = gsap.timeline({ delay: 0.3, onComplete: () => hero.classList.remove('is-animating') });
      const typed = { n: 0 };
      tl.to(typed, {
        n: CODE.length, duration: CODE.length * 0.045, ease: 'none',
        onUpdate: () => { codeEl.textContent = CODE.slice(0, Math.round(typed.n)); },
      });
      tl.add(() => hero.classList.add('is-done'), '+=0.35');
      tl.to('.hero-img-dim', { opacity: 0.6, duration: 1.2, ease: 'power2.out' }, '<');
      tl.fromTo('.hero-line', { opacity: 0, y: 18 }, { opacity: 1, y: 0, duration: 0.8, stagger: 0.14, ease: 'power3.out', clearProps: 'opacity,transform' }, '<');
    }
  }

  const grid = document.getElementById('chapter-grid');
  if (!grid || !window.SD || !SD.chapters) return;
  const state = SD.state.load();
  const chapters = SD.chapters.slice().sort((a, b) => a.id - b.id);

  const tasksOf = (ch) => ch.steps.filter((s) => s.type === 'task');
  const isDone = (ch) => !!(state.chapters[ch.id] && state.chapters[ch.id].done);
  const unlocked = (ch) => ch.id === 0 || isDone(chapters.find((c) => c.id === ch.id - 1));

  /* ---------- 卷宗封面的數字 ---------- */
  const dc = document.getElementById('dossier-chapters');
  const dt = document.getElementById('dossier-tasks');
  if (dc) dc.textContent = String(chapters.length);
  if (dt) dt.textContent = String(chapters.reduce((n, ch) => n + tasksOf(ch).length, 0));

  /* ---------- 卷宗：章節清單 ---------- */
  grid.innerHTML = chapters.map((ch) => {
    const done = isDone(ch);
    const open = unlocked(ch);
    const prog = state.chapters[ch.id];
    const stars = SD.state.chapterStars(ch.id, tasksOf(ch));
    const total = tasksOf(ch).length;
    const doneTasks = prog ? tasksOf(ch).filter((t) => prog.steps[t.id] && prog.steps[t.id].done).length : 0;
    const cls = done ? 'is-done' : open ? 'is-open' : 'is-locked';
    const status = done
      ? `<span class="stamp stamp-done">已破案</span><span>${stars.earned} / ${stars.max} ★</span>`
      : open
        ? (doneTasks
          ? `<span class="stamp stamp-open">辦案中</span><span>${doneTasks} / ${total} 題</span>`
          : `<span class="stamp stamp-open">可開始</span><span>${total} 題</span>`)
        : `<span>完成第 ${ch.id - 1} 章解鎖 · ${total} 題</span>`;
    const figStamp = done ? '' : open ? '' : '<span class="stamp stamp-locked">封存</span>';
    const inner = `
      <p class="docket-no"><span>${ch.id}</span><small>章</small></p>
      <figure class="docket-fig">
        <img src="${ch.cover}" alt="" width="600" height="400" loading="lazy" />
        ${figStamp}
      </figure>
      <div class="docket-body">
        <h3>${ch.title}</h3>
        <p class="docket-sub">${ch.subtitle}</p>
        <ul class="flex flex-wrap gap-1.5" aria-label="本章語法">${ch.skills.map((s) => `<li class="chip">${s}</li>`).join('')}</ul>
        <p class="docket-status">${status}</p>
      </div>`;
    return open
      ? `<li class="docket-row ${cls}"><a href="./play.html#${ch.slug}" class="docket-link" aria-label="第 ${ch.id} 章 ${ch.title}">${inner}</a></li>`
      : `<li class="docket-row ${cls}"><div class="docket-link" aria-label="第 ${ch.id} 章 ${ch.title}（尚未解鎖）">${inner}</div></li>`;
  }).join('');

  // 續玩區
  const started = Object.keys(state.chapters).length > 0;
  const resume = document.getElementById('resume');
  if (started && resume) {
    const cur = chapters.find((c) => unlocked(c) && !isDone(c)) || chapters[chapters.length - 1];
    resume.hidden = false;
    document.getElementById('resume-text').textContent = `上次進度：第 ${cur.id} 章「${cur.title}」。已收集 ${state.clues.length} 條線索、${state.badges.length} 枚徽章。`;
    const href = `./play.html#${cur.slug}`;
    document.getElementById('resume-btn').href = href;
    // 按鈕文字已由 js/boot-flag.js + CSS 在首屏切成「繼續辦案」，這裡只補 href 與保險旗標
    document.documentElement.setAttribute('data-resume', '');
    for (const id of ['hero-cta', 'nav-play']) document.getElementById(id).href = href;
    document.getElementById('reset-btn').addEventListener('click', async () => {
      // 重新開始會清掉所有進度，先問一次
      const ok = await SD.ui.confirm({
        title: '從第 0 章重新開始？',
        body: '會清除所有章節進度、已收集的線索與徽章，此動作無法復原。',
        okText: '清除並重新開始', danger: true,
      });
      if (ok) { SD.state.resetAll(); location.reload(); }
    });
  }

  /* ---------- 捲動 ----------
   * 只留兩處：Hero 插畫比文字慢半拍的視差、卷宗各列進場。其餘區塊不做進場動畫 */
  if (!window.gsap || reduce) return;
  gsap.registerPlugin(ScrollTrigger);
  gsap.to('.hero-art', { yPercent: 18, ease: 'none', scrollTrigger: { trigger: '#hero', start: 'top top', end: 'bottom top', scrub: true } });
  gsap.utils.toArray('.docket-row').forEach((el) => {
    gsap.from(el, { y: 40, opacity: 0, duration: 0.8, ease: 'power2.out', scrollTrigger: { trigger: el, start: 'top 85%', once: true } });
  });
})();
