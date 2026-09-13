#!/usr/bin/env node
/**
 * 由一張正方形來源圖產生 favicon.ico（16/32/48 多尺寸，PNG 內嵌）與 apple-touch-icon.png（180）。
 * 用法：node scripts/make-favicon.js <來源圖.png>
 * ICO 容器以 PNG 條目組成，所有現代瀏覽器皆支援，不需額外套件。
 */
const fs = require('fs');
const path = require('path');
const sharp = require('sharp');

const src = process.argv[2];
if (!src) { console.error('用法：node scripts/make-favicon.js <來源圖>'); process.exit(1); }
const root = path.join(__dirname, '..');

function ico(pngs) {
  // pngs: [{size, buf}]
  const count = pngs.length;
  const header = Buffer.alloc(6);
  header.writeUInt16LE(0, 0); header.writeUInt16LE(1, 2); header.writeUInt16LE(count, 4);
  const dir = Buffer.alloc(16 * count);
  let offset = 6 + 16 * count;
  pngs.forEach((p, i) => {
    const o = i * 16;
    dir.writeUInt8(p.size >= 256 ? 0 : p.size, o); dir.writeUInt8(p.size >= 256 ? 0 : p.size, o + 1);
    dir.writeUInt8(0, o + 2); dir.writeUInt8(0, o + 3); dir.writeUInt16LE(1, o + 4); dir.writeUInt16LE(32, o + 6);
    dir.writeUInt32LE(p.buf.length, o + 8); dir.writeUInt32LE(offset, o + 12);
    offset += p.buf.length;
  });
  return Buffer.concat([header, dir, ...pngs.map((p) => p.buf)]);
}

(async () => {
  const sizes = [16, 32, 48];
  const pngs = [];
  for (const size of sizes) {
    const buf = await sharp(src).resize(size, size, { fit: 'cover' }).png({ compressionLevel: 9 }).toBuffer();
    pngs.push({ size, buf });
  }
  fs.writeFileSync(path.join(root, 'favicon.ico'), ico(pngs));
  await sharp(src).resize(180, 180, { fit: 'cover' }).png().toFile(path.join(root, 'images', 'apple-touch-icon.png'));
  await sharp(src).resize(512, 512, { fit: 'cover' }).png().toFile(path.join(root, 'images', 'icon-512.png'));
  console.log('favicon.ico（16/32/48）、images/apple-touch-icon.png、images/icon-512.png 已產生');
})();
