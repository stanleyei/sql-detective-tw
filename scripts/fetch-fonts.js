/* 把 Google Fonts 的字型切片鏡射到本機 fonts/，並產生 src/fonts.css（由 tailwind.css @import 進 style.css）。
 * 自架的理由：正式站 CSP 可收斂為 'self'；首屏不必多連兩個網域；in-app 瀏覽器擋第三方字型時也不會退回系統字。
 * 沿用 Google 的 unicode-range 切片而非自行子集化：資料表內容與玩家輸入的中文字無法事先列舉，
 * 切片能保證任何字都有對應檔、而瀏覽器只下載用到的片段。要求 wght 範圍會拿到可變字型，一組切片涵蓋所有字重。 */
'use strict';
const fs = require('fs');
const path = require('path');

const ROOT = path.join(__dirname, '..');
const OUT_DIR = path.join(ROOT, 'fonts');
const CSS_OUT = path.join(ROOT, 'src', 'fonts.css');
const FAMILIES = 'family=Noto+Sans+TC:wght@400..900&family=JetBrains+Mono:wght@400..700';
const URL = `https://fonts.googleapis.com/css2?${FAMILIES}&display=swap`;
/* Google 依 UA 決定回傳格式；Chrome UA 才拿得到 woff2 與 unicode-range 切片 */
const UA = 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/128.0 Safari/537.36';

async function main() {
  const res = await fetch(URL, { headers: { 'User-Agent': UA } });
  if (!res.ok) throw new Error(`fetch css ${res.status}`);
  const css = await res.text();
  fs.mkdirSync(OUT_DIR, { recursive: true });

  const blocks = css.match(/@font-face\s*{[^}]*}/g) || [];
  const counters = {};
  const tasks = [];
  const outBlocks = [];
  for (const block of blocks) {
    const family = /font-family:\s*'([^']+)'/.exec(block)[1];
    const url = /url\((https:[^)]+)\)/.exec(block)[1];
    const slug = family.toLowerCase().replace(/\s+/g, '-');
    counters[slug] = (counters[slug] || 0) + 1;
    const file = `${slug}-${String(counters[slug]).padStart(3, '0')}.woff2`;
    tasks.push({ url, file });
    /* 路徑相對於建置產物 css/style.css */
    outBlocks.push(block.replace(url, `../fonts/${file}`));
  }

  let done = 0;
  const queue = tasks.slice();
  const worker = async () => {
    while (queue.length) {
      const { url, file } = queue.shift();
      const dest = path.join(OUT_DIR, file);
      const r = await fetch(url, { headers: { 'User-Agent': UA } });
      if (!r.ok) throw new Error(`fetch ${url} ${r.status}`);
      fs.writeFileSync(dest, Buffer.from(await r.arrayBuffer()));
      done++;
      if (done % 20 === 0) process.stdout.write(`  ${done}/${tasks.length}\n`);
    }
  };
  await Promise.all(Array.from({ length: 8 }, worker));

  const header = `/* 由 scripts/fetch-fonts.js 產生，請勿手改；重新抓取：node scripts/fetch-fonts.js */\n`;
  fs.writeFileSync(CSS_OUT, header + outBlocks.join('\n') + '\n');
  console.log(`fonts: ${tasks.length} files → fonts/, css → src/fonts.css`);
}

main().catch((e) => { console.error(e); process.exit(1); });
