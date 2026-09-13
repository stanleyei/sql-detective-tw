/* 首頁：章節地圖、進度、GSAP 進場 */
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

  const grid = document.getElementById('chapter-grid');
  if (!grid || !window.SD || !SD.chapters) return;
  const state = SD.state.load();
  const chapters = SD.chapters.slice().sort((a, b) => a.id - b.id);

  const tasksOf = (ch) => ch.steps.filter((s) => s.type === 'task');
  const isDone = (ch) => !!(state.chapters[ch.id] && state.chapters[ch.id].done);
  const unlocked = (ch) => ch.id === 0 || isDone(chapters.find((c) => c.id === ch.id - 1));

  grid.innerHTML = chapters.map((ch) => {
    const done = isDone(ch);
    const open = unlocked(ch);
    const prog = state.chapters[ch.id];
    const stars = SD.state.chapterStars(ch.id, tasksOf(ch));
    const doneTasks = prog ? tasksOf(ch).filter((t) => prog.steps[t.id] && prog.steps[t.id].done).length : 0;
    const status = done
      ? `<span class="chip border-teal/50 text-teal">已破案 · ${stars.earned}/${stars.max} ★</span>`
      : open
        ? (doneTasks ? `<span class="chip border-amber/50 text-amber">進行中 ${doneTasks}/${tasksOf(ch).length}</span>` : '<span class="chip border-amber/50 text-amber">可開始</span>')
        : '<span class="chip">🔒 完成上一章解鎖</span>';
    const inner = `
      <img src="${ch.cover}" alt="" width="600" height="400" loading="lazy" />
      <div class="flex flex-1 flex-col gap-2 p-5">
        <div class="flex items-center justify-between gap-2">
          <p class="eyebrow">第 ${ch.id} 章 · 約 ${ch.minutes} 分</p>
          ${status}
        </div>
        <h3 class="text-xl font-bold">${ch.title}</h3>
        <p class="text-sm text-ink-300">${ch.subtitle}</p>
        <ul class="mt-1 flex flex-wrap gap-1.5" aria-label="本章語法">${ch.skills.map((s) => `<li class="chip">${s}</li>`).join('')}</ul>
      </div>`;
    return open
      ? `<a href="./play.html#${ch.slug}" class="chapter-card reveal" aria-label="第 ${ch.id} 章 ${ch.title}">${inner}</a>`
      : `<div class="chapter-card locked reveal" aria-label="第 ${ch.id} 章 ${ch.title}（尚未解鎖）">${inner}</div>`;
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
    for (const id of ['hero-cta', 'nav-play']) { const el = document.getElementById(id); el.textContent = '繼續辦案'; el.href = href; }
    document.getElementById('reset-btn').addEventListener('click', () => {
      // 重新開始會清掉所有進度，先問一次
      if (window.confirm('確定要清除所有進度、線索與徽章，從第 0 章重新開始嗎？')) { SD.state.resetAll(); location.reload(); }
    });
  }

  // 動畫
  if (!window.gsap) return;
  gsap.registerPlugin(ScrollTrigger);
  const mm = gsap.matchMedia();
  mm.add('(prefers-reduced-motion: no-preference)', () => {
    gsap.from('.hero-in', { y: 24, opacity: 0, duration: 0.9, stagger: 0.12, ease: 'power3.out' });
    gsap.utils.toArray('.reveal').forEach((el) => {
      gsap.from(el, { y: 30, opacity: 0, duration: 0.7, ease: 'power2.out', scrollTrigger: { trigger: el, start: 'top 88%', once: true } });
    });
  });
})();
