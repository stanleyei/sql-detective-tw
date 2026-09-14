#!/usr/bin/env node
/**
 * 靜態資源快取版本號（?v=YYYYMMDD-NN）統一管理。
 *
 *   npm run bump          把三個 HTML 內所有 ?v= 改成今天的下一個流水號
 *   npm run bump:check    只檢查三頁版本號是否一致（不改檔），不一致回傳非零
 *
 * 規則：取三頁現有版本的最大值；日期等於今天就流水號 +1，否則以今天日期從 01 起算。
 * 這支腳本只綁「發布」，不掛進 build，避免 dev watch 期間每次建置都浪費流水號。
 */
const fs = require('fs');
const path = require('path');

const ROOT = path.join(__dirname, '..');
const PAGES = ['index.html', 'play.html', 'schema.html'];
const RE = /\?v=(\d{8})-(\d{2})/g;

function today() {
  const d = new Date();
  const p = (n) => String(n).padStart(2, '0');
  return `${d.getFullYear()}${p(d.getMonth() + 1)}${p(d.getDate())}`;
}

/** 讀出每頁所有版本號；回傳 { file, src, versions: Set<string> } */
function scan() {
  return PAGES.map((file) => {
    const src = fs.readFileSync(path.join(ROOT, file), 'utf8');
    const versions = new Set([...src.matchAll(RE)].map((m) => `${m[1]}-${m[2]}`));
    return { file, src, versions };
  });
}

function check(pages) {
  const all = new Set(pages.flatMap((p) => [...p.versions]));
  let ok = true;
  for (const p of pages) {
    if (p.versions.size === 0) { console.error(`✗ ${p.file}：找不到任何 ?v= 版本號`); ok = false; }
    else if (p.versions.size > 1) { console.error(`✗ ${p.file}：同一頁出現多個版本 ${[...p.versions].join(', ')}`); ok = false; }
  }
  if (all.size > 1) {
    console.error(`✗ 三頁版本不一致：${pages.map((p) => `${p.file}=${[...p.versions].join('/') || '(無)'}`).join('、')}`);
    ok = false;
  }
  if (ok) console.log(`✓ 版本號一致：${[...all][0]}`);
  return ok;
}

function bump(pages) {
  const all = [...new Set(pages.flatMap((p) => [...p.versions]))].sort();
  const latest = all[all.length - 1] || '';
  const [date, seq] = latest.split('-');
  const t = today();
  const next = date === t ? `${t}-${String(Number(seq) + 1).padStart(2, '0')}` : `${t}-01`;
  let n = 0;
  for (const p of pages) {
    const out = p.src.replace(RE, () => { n += 1; return `?v=${next}`; });
    fs.writeFileSync(path.join(ROOT, p.file), out);
  }
  console.log(`${latest || '(無)'} → ${next}，共更新 ${n} 處（${PAGES.join('、')}）`);
}

const pages = scan();
if (process.argv.includes('--check')) process.exit(check(pages) ? 0 : 1);
bump(pages);
