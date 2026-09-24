#!/usr/bin/env node
/**
 * 產生社群分享圖 images/og-v2.jpg（1200×630）。
 *
 * 兩層合成：底圖由本機 codex CLI（image generation）依 scripts/image-prompts.json 的 og.variants 生成，
 * 標題文字改由 sharp 疊 SVG，因為生圖模型寫中文必定爆字，程式合成才可重複、可微調文案。
 *
 *   node scripts/make-og.js                 # 生成所有缺少的底圖並合成候選到 scripts/.image-raw/og-preview/
 *   node scripts/make-og.js magnifier-grid  # 只處理指定 variant
 *   node scripts/make-og.js --compose       # 不呼叫 codex，只重新合成（調文案／版面時用）
 *   node scripts/make-og.js --force         # 重生成底圖
 *   node scripts/make-og.js --final <id>    # 把指定 variant 輸出成 images/og-v2.jpg
 *
 * 字型需事先放在 scripts/.image-raw/fonts/（NotoSansCJKtc-Black.otf、NotoSansCJKtc-Medium.otf、JetBrainsMono-Bold.ttf），
 * 透過 FONTCONFIG_FILE 讓 librsvg 只認這個目錄，避免不同機器 fallback 到不同系統字型。
 * macOS 上 sharp 內建的 pango 預設走 CoreText、完全不看 fontconfig，必須同時設 PANGOCAIRO_BACKEND=fontconfig。
 */
const fs = require('fs');
const path = require('path');
const { spawn } = require('child_process');

const ROOT = path.resolve(__dirname, '..');
const RAW = path.join(__dirname, '.image-raw');
const FONT_DIR = path.join(RAW, 'fonts');
const PREVIEW = path.join(RAW, 'og-preview');
const FINAL = path.join(ROOT, 'images', 'og-v2.jpg');
const W = 1200;
const H = 630;

// fontconfig 必須在 sharp 載入前設定
const fontsConf = path.join(FONT_DIR, 'fonts.conf');
fs.mkdirSync(FONT_DIR, { recursive: true });
fs.writeFileSync(fontsConf, `<?xml version="1.0"?><!DOCTYPE fontconfig SYSTEM "fonts.dtd"><fontconfig><dir>${FONT_DIR}</dir><cachedir>${path.join(FONT_DIR, '.cache')}</cachedir></fontconfig>`);
process.env.FONTCONFIG_FILE = fontsConf;
process.env.PANGOCAIRO_BACKEND = 'fontconfig';
const sharp = require('sharp');

const manifest = JSON.parse(fs.readFileSync(path.join(__dirname, 'image-prompts.json'), 'utf8'));
const args = process.argv.slice(2);
const force = args.includes('--force');
const composeOnly = args.includes('--compose');
const finalIdx = args.indexOf('--final');
const finalId = finalIdx >= 0 ? args[finalIdx + 1] : null;
const ids = args.filter((a, i) => !a.startsWith('--') && args[i - 1] !== '--final');
const variants = manifest.og.variants.filter((v) => (finalId ? v.id === finalId : !ids.length || ids.includes(v.id)));
fs.mkdirSync(PREVIEW, { recursive: true });

const rawPath = (v) => path.join(RAW, `og-${v.id}.png`);

function generate(v) {
  const dst = rawPath(v).replace(/\\/g, '/');
  const prompt = [
    `請使用內建的 image generation 工具產生一張 ${manifest.og.size} 的插畫，並把檔案存到 ${dst}（若目錄不存在請建立）。`,
    `主題：${v.prompt}`,
    manifest.og.style || manifest.style,
    '完成後只需回報檔案路徑。',
  ].join('\n');
  return new Promise((resolve, reject) => {
    const p = spawn('codex', ['exec', '-m', 'gpt-5.6-sol', '-s', 'workspace-write', '--enable', 'image_generation', '--skip-git-repo-check', '-C', RAW, '-'], {
      stdio: ['pipe', 'pipe', 'pipe'],
      shell: process.platform === 'win32',
    });
    p.stdin.end(prompt);
    let log = '';
    p.stdout.on('data', (d) => { log += d; });
    p.stderr.on('data', (d) => { log += d; });
    p.on('close', (code) => {
      if (code === 0 && fs.existsSync(rawPath(v))) resolve();
      else reject(new Error(`codex 失敗 (${code})：${v.id}\n${log.slice(-800)}`));
    });
  });
}

const esc = (s) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');

/**
 * 文字層只放英文標題，放在左下角的純色留白區；其餘資訊由 og:title / og:description 承載。
 * 左下角局部壓暗保證對比，不做整面漸層，避免把海報底圖蓋成一般插畫。
 */
function textLayer() {
  const x = 72;
  const y = H - 92;
  return Buffer.from(`
<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}" viewBox="0 0 ${W} ${H}">
  <defs>
    <radialGradient id="shade" cx="0.12" cy="0.9" r="0.7">
      <stop offset="0" stop-color="#0b1020" stop-opacity="0.85"/>
      <stop offset="1" stop-color="#0b1020" stop-opacity="0"/>
    </radialGradient>
  </defs>
  <rect width="${W}" height="${H}" fill="url(#shade)"/>
  <rect x="${x}" y="${y - 76}" width="10" height="78" fill="#f5b942"/>
  <text x="${x + 32}" y="${y}" font-family="Noto Sans CJK TC" font-weight="900" font-size="104" letter-spacing="-2" fill="#f8fafc"><tspan fill="#f5b942">SQL</tspan> DETECTIVE</text>
</svg>`);
}

/** 細微膠片顆粒：讓平塗色塊有印刷質感，也打破生成圖過於乾淨的表面 */
async function grain() {
  return sharp({ create: { width: W, height: H, channels: 3, noise: { type: 'gaussian', mean: 128, sigma: 18 } } }).png().toBuffer();
}

async function compose(v, out) {
  // 底圖左半是刻意留白的深色，往右平移 shift px 讓右側主體遠離標題，左側補純底色再由漸層蓋過
  const shift = v.shift ?? 0;
  // sharp 同一條管線內 extract 固定先於 extend 執行，所以三步各自 toBuffer，否則寬度會多出 shift
  const fitted = await sharp(rawPath(v)).resize(W, H, { fit: 'cover', position: 'right' }).toBuffer();
  const extended = await sharp(fitted).extend({ left: shift, background: '#0b1020' }).toBuffer();
  const base = await sharp(extended).extract({ left: 0, top: 0, width: W, height: H }).toBuffer();
  await sharp(base)
    .composite([
      { input: await grain(), blend: 'soft-light' },
      { input: textLayer(), top: 0, left: 0 },
    ])
    .jpeg({ quality: 85, mozjpeg: true, progressive: true })
    .toFile(out);
  console.log(`✔ ${path.relative(ROOT, out)}  ${(fs.statSync(out).size / 1024).toFixed(0)} KB`);
}

(async () => {
  const failed = [];
  await Promise.all(variants.map(async (v) => {
    try {
      if (!composeOnly && !finalId && (force || !fs.existsSync(rawPath(v)))) {
        console.log(`… 生成 og/${v.id}`);
        await generate(v);
      }
      if (!fs.existsSync(rawPath(v))) throw new Error(`缺底圖 ${path.relative(ROOT, rawPath(v))}`);
      await compose(v, finalId ? FINAL : path.join(PREVIEW, `${v.id}.jpg`));
    } catch (e) { failed.push(v.id); console.error(`✘ ${v.id}: ${e.message}`); }
  }));
  if (failed.length) { console.error(`\n失敗：${failed.join(', ')}`); process.exit(1); }
  console.log('\n完成。');
})();
