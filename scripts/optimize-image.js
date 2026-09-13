#!/usr/bin/env node

/**
 * 設計素材入庫工具
 *
 * 用途：把設計師交付的原始圖檔正規化成適合進入 repo 的「來源檔」。
 * 各版位的尺寸／srcset 沒有 build 期機制自動產生，需要多尺寸時以本腳本多次輸出後手寫 srcset。
 *
 * 這是工具不是門檻——不會有任何流程強制執行它，需要保留高解析原圖時就別用。
 */

const fs = require('fs');
const path = require('path');
const os = require('os');
const { execSync } = require('child_process');

const sharp = require('sharp');

// Windows 編碼修正
if (os.platform() === 'win32') {
  try {
    execSync('chcp 65001', { stdio: 'pipe' });
  } catch (error) {
    // 忽略編碼設定錯誤
  }
}

/**
 * preset 只描述「這個來源檔要給誰用」，所有數值都可用參數覆寫。
 */
const PRESETS = {
  photo: {
    description: '照片類素材（人像、風景、商品）',
    maxWidth: 2400,
    format: 'webp',
    quality: 82,
  },
  graphic: {
    description: '線稿、UI 截圖、含文字的圖，避免壓縮痕跡',
    maxWidth: 2400,
    format: 'webp',
    lossless: true,
  },
  og: {
    description: '社群分享圖，固定 1200×630 且會裁切',
    width: 1200,
    height: 630,
    exact: true,
    format: 'jpeg',
    quality: 85,
  },
  raw: {
    description: 'preset 不合用時的逃生口，數值全由參數指定',
    format: 'keep',
  },
};

const SKIP_EXTENSIONS = ['.svg', '.gif'];

function formatBytes(bytes) {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / 1024 / 1024).toFixed(2)} MB`;
}

function printUsage() {
  console.log(`
設計素材入庫工具

用法：
  npm run img -- inspect <檔案...>              唯讀檢視，不產生任何檔案
  npm run img -- <preset> <檔案...> [選項]      依 preset 產生來源檔

preset：`);
  for (const [name, preset] of Object.entries(PRESETS)) {
    console.log(`  ${name.padEnd(10)} ${preset.description}`);
  }
  console.log(`
選項：
  --out <路徑>        輸出檔案或目錄，預設為原檔同層
  --max-width <數字>  覆寫 preset 的最大邊長
  --quality <數字>    覆寫 preset 的品質（1-100）
  --format <格式>     webp | avif | jpeg | png | keep
  --no-resize         只轉檔不縮圖
  --flatten           去除透明度並填白，轉 jpeg 時需要
  --dry-run           只顯示會做什麼，不寫檔
  --force             即使產出比原檔大也保留

通則（所有 preset 皆適用）：
  · 絕不放大原圖，原圖小於目標尺寸時只轉檔
  · 絕不覆寫來源檔，輸出路徑與來源相同時直接中止
  · 保留 ICC 色彩描述檔，只清除其餘 EXIF
  · 先套用 EXIF 方向再清除，避免手機照片轉向
  · 含透明度時不轉 jpeg，除非指定 --flatten
  · 產出比原檔大時捨棄並回報，除非指定 --force
  · SVG 與 GIF 一律跳過
`);
}

function parseArgs(argv) {
  const options = { files: [] };
  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i];
    switch (arg) {
      case '--out':
        options.out = argv[++i];
        break;
      case '--max-width':
        options.maxWidth = Number(argv[++i]);
        break;
      case '--quality':
        options.quality = Number(argv[++i]);
        break;
      case '--format':
        options.format = argv[++i];
        break;
      case '--no-resize':
        options.noResize = true;
        break;
      case '--flatten':
        options.flatten = true;
        break;
      case '--dry-run':
        options.dryRun = true;
        break;
      case '--force':
        options.force = true;
        break;
      default:
        options.files.push(arg);
    }
  }
  return options;
}

/**
 * 建立處理管線，inspect 與實際輸出共用同一套規則。
 */
function buildPipeline(inputPath, metadata, config) {
  let pipeline = sharp(inputPath).rotate(); // rotate() 無參數時套用 EXIF 方向

  if (config.exact) {
    pipeline = pipeline.resize(config.width, config.height, { fit: 'cover' });
  } else if (!config.noResize && config.maxWidth && metadata.width > config.maxWidth) {
    pipeline = pipeline.resize({ width: config.maxWidth, withoutEnlargement: true });
  }

  if (config.flatten) {
    pipeline = pipeline.flatten({ background: '#ffffff' });
  }

  const quality = config.quality;
  // 高品質輸出保留完整色度取樣，避免文字與色塊邊緣出現色偏
  const chromaSubsampling = quality >= 90 ? '4:4:4' : undefined;

  switch (config.format) {
    case 'webp':
      pipeline = pipeline.webp(config.lossless ? { lossless: true } : { quality });
      break;
    case 'avif':
      pipeline = pipeline.avif({ quality, chromaSubsampling });
      break;
    case 'jpeg':
      pipeline = pipeline.jpeg({ quality, chromaSubsampling, mozjpeg: true });
      break;
    case 'png':
      pipeline = pipeline.png({ compressionLevel: 9 });
      break;
    default:
      break; // keep：維持原格式
  }

  return pipeline.keepIccProfile();
}

async function inspect(filePath) {
  const stats = fs.statSync(filePath);
  const metadata = await sharp(filePath).metadata();
  const ratio = (metadata.width / metadata.height).toFixed(2);

  console.log(`\n${path.basename(filePath)}`);
  console.log(`  尺寸    ${metadata.width} × ${metadata.height}  (${ratio}:1)`);
  console.log(`  格式    ${metadata.format}${metadata.hasAlpha ? '（含透明度）' : ''}`);
  console.log(`  大小    ${formatBytes(stats.size)}`);
  console.log(`  色彩    ${metadata.space}${metadata.icc ? ' + ICC 描述檔' : '（無 ICC）'}`);
  if (metadata.orientation && metadata.orientation > 1) {
    console.log(`  EXIF    orientation ${metadata.orientation}（需旋轉）`);
  }

  // 以 photo preset 試壓，讓 agent 有具體數字可判斷是否值得處理
  const preview = await buildPipeline(filePath, metadata, {
    ...PRESETS.photo,
    format: 'webp',
  }).toBuffer();
  const saved = ((1 - preview.length / stats.size) * 100).toFixed(0);
  console.log(`  提示    以 photo preset 處理後約 ${formatBytes(preview.length)}（省 ${saved}%）`);
}

async function convert(filePath, presetName, options) {
  const preset = PRESETS[presetName];
  const config = {
    ...preset,
    maxWidth: options.maxWidth ?? preset.maxWidth,
    quality: options.quality ?? preset.quality ?? 80,
    format: options.format ?? preset.format,
    noResize: options.noResize,
    flatten: options.flatten,
  };

  const stats = fs.statSync(filePath);
  const metadata = await sharp(filePath).metadata();

  if (metadata.hasAlpha && config.format === 'jpeg' && !config.flatten) {
    console.error(`❌ ${path.basename(filePath)}：含透明度，轉 jpeg 會變黑底。請加 --flatten 或改用 webp`);
    return false;
  }

  const extension = config.format === 'keep' ? path.extname(filePath).slice(1) : config.format;
  const outputName = `${path.basename(filePath, path.extname(filePath))}.${extension === 'jpeg' ? 'jpg' : extension}`;
  // --out 沒有副檔名時視為目錄，避免尚未建立的目錄被當成檔名
  const outIsDirectory = options.out
    && ((fs.existsSync(options.out) && fs.statSync(options.out).isDirectory()) || path.extname(options.out) === '');

  let outputPath;
  if (!options.out) {
    outputPath = path.join(path.dirname(filePath), outputName);
  } else if (outIsDirectory) {
    outputPath = path.join(options.out, outputName);
  } else {
    outputPath = options.out;
  }

  if (path.resolve(outputPath) === path.resolve(filePath)) {
    console.error(`❌ ${path.basename(filePath)}：輸出會覆寫來源檔，請用 --out 指定其他位置`);
    return false;
  }

  const buffer = await buildPipeline(filePath, metadata, config).toBuffer({ resolveWithObject: true });
  const { data, info } = buffer;

  const summary = `${metadata.width}×${metadata.height} ${formatBytes(stats.size)} → ${info.width}×${info.height} ${formatBytes(data.length)}`;

  if (data.length >= stats.size && !options.force) {
    console.log(`⚠️  ${path.basename(filePath)}：產出比原檔大（${summary}），已捨棄。原檔可直接使用，或加 --force 覆寫此判斷`);
    return true;
  }

  if (options.dryRun) {
    console.log(`🔍 ${path.basename(filePath)} → ${outputPath}`);
    console.log(`   ${summary}`);
    return true;
  }

  fs.mkdirSync(path.dirname(outputPath), { recursive: true });
  fs.writeFileSync(outputPath, data);
  console.log(`✅ ${path.basename(filePath)} → ${outputPath}`);
  console.log(`   ${summary}`);
  return true;
}

async function main() {
  const [command, ...rest] = process.argv.slice(2);

  if (!command || command === '--help' || command === '-h') {
    printUsage();
    return;
  }

  if (command !== 'inspect' && !PRESETS[command]) {
    console.error(`❌ 未知的 preset：${command}`);
    printUsage();
    process.exitCode = 1;
    return;
  }

  const options = parseArgs(rest);
  if (options.files.length === 0) {
    console.error('❌ 請指定至少一個檔案');
    process.exitCode = 1;
    return;
  }

  let failed = false;
  for (const file of options.files) {
    if (!fs.existsSync(file)) {
      console.error(`❌ 找不到檔案：${file}`);
      failed = true;
      continue;
    }

    if (SKIP_EXTENSIONS.includes(path.extname(file).toLowerCase())) {
      console.log(`⏭️  ${path.basename(file)}：向量圖或動圖，跳過不處理`);
      continue;
    }

    try {
      if (command === 'inspect') {
        await inspect(file);
      } else if (!(await convert(file, command, options))) {
        failed = true;
      }
    } catch (error) {
      console.error(`❌ ${path.basename(file)} 處理失敗：${error.message}`);
      failed = true;
    }
  }

  if (failed) {
    process.exitCode = 1;
  }
}

main();
