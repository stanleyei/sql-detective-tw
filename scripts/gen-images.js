#!/usr/bin/env node
/**
 * 用本機 codex CLI（image generation）依 scripts/image-prompts.json 批次產生插畫，
 * 再以 sharp 轉成指定寬度的 webp 放進 images/ 對應資料夾。
 *
 *   node scripts/gen-images.js                      # 產生所有缺少的圖
 *   node scripts/gen-images.js ch1-forensics plate  # 只產生指定 id
 *   node scripts/gen-images.js --force              # 重生成（覆寫既有 png 與 webp）
 *   node scripts/gen-images.js --convert            # 不呼叫 codex，只把既有 png 轉 webp
 *
 * 原始 png 留在 scripts/.image-raw/（已 gitignore），要重新裁切時不必再花錢生成。
 */
const fs = require('fs');
const path = require('path');
const { spawn } = require('child_process');
const sharp = require('sharp');

const ROOT = path.resolve(__dirname, '..');
const RAW = path.join(__dirname, '.image-raw');
const manifest = JSON.parse(fs.readFileSync(path.join(__dirname, 'image-prompts.json'), 'utf8'));
const args = process.argv.slice(2);
const force = args.includes('--force');
const convertOnly = args.includes('--convert');
const concurrency = 3;
const ids = args.filter((a) => !a.startsWith('--'));
const jobs = manifest.images.filter((im) => !ids.length || ids.includes(im.id));
fs.mkdirSync(RAW, { recursive: true });

const rawPath = (im) => path.join(RAW, `${im.set}-${im.id}.png`);
const outPath = (im) => path.join(ROOT, manifest.sets[im.set].dir, `${im.id}.webp`);

function generate(im) {
  const set = manifest.sets[im.set];
  const dst = rawPath(im).replace(/\\/g, '/');
  const prompt = [
    `請使用內建的 image generation 工具產生一張 ${set.size} 的插畫，並把檔案存到 ${dst}（若目錄不存在請建立）。`,
    `主題：${im.prompt}`,
    manifest.style,
    '完成後只需回報檔案路徑。',
  ].join('\n');
  return new Promise((resolve, reject) => {
    const p = spawn('codex', ['exec', '-m', 'gpt-5.6-sol', '-s', 'workspace-write', '--enable', 'image_generation', '--skip-git-repo-check', '-C', RAW, '-'], {
      // Windows 上需 shell:true 才能解析 codex.cmd，但 shell 會弄壞含空白與引號的引數，所以 prompt 改由 stdin 送入
      stdio: ['pipe', 'pipe', 'pipe'],
      shell: process.platform === 'win32',
    });
    p.stdin.end(prompt);
    let log = '';
    p.stdout.on('data', (d) => { log += d; });
    p.stderr.on('data', (d) => { log += d; });
    p.on('close', (code) => {
      if (code === 0 && fs.existsSync(rawPath(im))) resolve();
      else reject(new Error(`codex 失敗 (${code})：${im.id}\n${log.slice(-800)}`));
    });
  });
}

async function convert(im) {
  const set = manifest.sets[im.set];
  const out = outPath(im);
  fs.mkdirSync(path.dirname(out), { recursive: true });
  await sharp(rawPath(im)).resize({ width: set.width, withoutEnlargement: true }).webp({ quality: set.quality }).toFile(out);
  const kb = (fs.statSync(out).size / 1024).toFixed(0);
  console.log(`✔ ${path.relative(ROOT, out)}  ${kb} KB`);
}

async function run(im) {
  if (!convertOnly && (force || !fs.existsSync(rawPath(im)))) {
    console.log(`… 生成 ${im.set}/${im.id}`);
    await generate(im);
  }
  if (fs.existsSync(rawPath(im)) && (force || convertOnly || !fs.existsSync(outPath(im)))) await convert(im);
}

(async () => {
  const queue = jobs.slice();
  const failed = [];
  await Promise.all(Array.from({ length: concurrency }, async () => {
    while (queue.length) {
      const im = queue.shift();
      try { await run(im); } catch (e) { failed.push(im.id); console.error(`✘ ${im.id}: ${e.message}`); }
    }
  }));
  if (failed.length) { console.error(`\n失敗：${failed.join(', ')}（重跑同一指令只會補缺少的）`); process.exit(1); }
  console.log('\n全部完成。');
})();
