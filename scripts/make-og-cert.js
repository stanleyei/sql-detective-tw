#!/usr/bin/env node
/**
 * 產生結案證書頁的社群分享圖 images/og-cert.jpg（1200×630）。
 * 不呼叫生圖模型：底圖由 sharp 以 SVG 漸層繪製，疊上既有的結案徽章與程式合成的標題文字。
 * 字型與 make-og.js 共用 scripts/.image-raw/fonts/，透過 fontconfig 鎖定，避免不同機器 fallback 到不同字型。
 *
 *   node scripts/make-og-cert.js
 */
const fs = require('fs');
const path = require('path');

const ROOT = path.resolve(__dirname, '..');
const FONT_DIR = path.join(__dirname, '.image-raw', 'fonts');
const OUT = path.join(ROOT, 'images', 'og-cert.jpg');
const W = 1200;
const H = 630;

const fontsConf = path.join(FONT_DIR, 'fonts.conf');
fs.mkdirSync(FONT_DIR, { recursive: true });
fs.writeFileSync(fontsConf, `<?xml version="1.0"?><!DOCTYPE fontconfig SYSTEM "fonts.dtd"><fontconfig><dir>${FONT_DIR}</dir><cachedir>${path.join(FONT_DIR, '.cache')}</cachedir></fontconfig>`);
process.env.FONTCONFIG_FILE = fontsConf;
process.env.PANGOCAIRO_BACKEND = 'fontconfig';
const sharp = require('sharp');

async function main() {
  const bg = Buffer.from(`<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}">
    <defs>
      <radialGradient id="g1" cx="82%" cy="0%" r="70%"><stop offset="0" stop-color="#ff5fa2" stop-opacity="0.22"/><stop offset="1" stop-color="#0b1020" stop-opacity="0"/></radialGradient>
      <radialGradient id="g2" cx="0%" cy="10%" r="60%"><stop offset="0" stop-color="#2ee6c5" stop-opacity="0.16"/><stop offset="1" stop-color="#0b1020" stop-opacity="0"/></radialGradient>
      <radialGradient id="glow" cx="50%" cy="50%" r="50%"><stop offset="0" stop-color="#f5b942" stop-opacity="0.45"/><stop offset="1" stop-color="#f5b942" stop-opacity="0"/></radialGradient>
    </defs>
    <rect width="${W}" height="${H}" fill="#0b1020"/>
    <rect width="${W}" height="${H}" fill="url(#g1)"/>
    <rect width="${W}" height="${H}" fill="url(#g2)"/>
    <circle cx="300" cy="315" r="250" fill="url(#glow)"/>
    <rect x="36" y="36" width="${W - 72}" height="${H - 72}" fill="none" stroke="#c98f1a" stroke-width="3" stroke-opacity="0.7"/>
    <rect x="48" y="48" width="${W - 96}" height="${H - 96}" fill="none" stroke="#c98f1a" stroke-width="1.5" stroke-opacity="0.5"/>
  </svg>`);

  const badge = await sharp(path.join(ROOT, 'images', 'badge-master.webp')).resize(360, 360).png().toBuffer();
  const mask = Buffer.from(`<svg width="360" height="360"><circle cx="180" cy="180" r="180" fill="#fff"/></svg>`);
  const round = await sharp(badge).composite([{ input: mask, blend: 'dest-in' }]).png().toBuffer();

  const text = Buffer.from(`<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}">
    <style>
      .org { font-family: 'Noto Sans CJK TC'; font-weight: 500; font-size: 26px; fill: #9aa7c7; letter-spacing: 6px; }
      .title { font-family: 'Noto Sans CJK TC'; font-weight: 900; font-size: 120px; fill: #f3efe6; }
      .sub { font-family: 'Noto Sans CJK TC'; font-weight: 900; font-size: 44px; fill: #f5b942; }
      .code { font-family: 'JetBrains Mono'; font-weight: 700; font-size: 26px; fill: #2ee6c5; }
    </style>
    <text x="560" y="200" class="org">潮港市警察局 · 資料分析組</text>
    <text x="552" y="330" class="title">結案證書</text>
    <text x="560" y="405" class="sub">SQL 偵探：潮港市檔案</text>
    <text x="560" y="470" class="code">SELECT truth FROM chaogang_city;</text>
  </svg>`);

  await sharp(bg)
    .composite([{ input: round, left: 120, top: 135 }, { input: text, left: 0, top: 0 }])
    .jpeg({ quality: 88, mozjpeg: true })
    .toFile(OUT);
  console.log(`og-cert → ${path.relative(ROOT, OUT)}`);
}

main().catch((e) => { console.error(e); process.exit(1); });
