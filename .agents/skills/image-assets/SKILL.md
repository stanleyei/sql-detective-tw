---
name: image-assets
description: 處理此靜態網站的圖片素材。新增、更換或正規化 images/ 內的圖片，處理設計原圖，或建立響應式 srcset 與 sizes 時使用；單純修改既有 SVG 程式碼時不需使用。
---

# 圖片素材處理

此流程協助判斷圖片是否適合直接入庫或需要正規化，不是強制壓縮門檻。需要保留高解析原圖時直接沿用，並在交付說明或 commit message 記錄原因。不確定時保守處理或詢問使用者，不得自行降低素材解析度。

## 專案限制

本專案沒有 bundler，也不會在 build 時自動產生多尺寸圖片或 `srcset`。瀏覽器會直接下載 repo 內的檔案，因此應在入庫前確認尺寸、格式與檔案大小。

一般圖片放在 `images/`，圖示放在 `images/icon/`，HTML 使用 `./images/...` 相對路徑。

## 判斷與處理

先執行唯讀檢查：

```bash
npm run img -- inspect <檔案>
```

依素材選擇 preset：

- `photo`：照片、人像、風景或商品；預設最大寬度 2400px、WebP quality 82。
- `graphic`：線稿、UI 截圖或含文字圖片；預設最大寬度 2400px、WebP 無損。
- `og`：社群分享圖；輸出 1200×630 並裁切。完成後同步設定 `og:image`，確認 `og:image:alt` 有意義。
- `raw`：上述 preset 不適用時，由參數指定格式與尺寸。

可用 `--max-width`、`--quality`、`--format` 覆寫 preset，並以 `--out` 指定輸出。完整選項以 `npm run img -- --help` 為準。腳本會避免放大、覆寫來源或保留比原檔更大的產物，並跳過 SVG 與 GIF。

## 響應式圖片

只有手機與桌機實際顯示尺寸差距明顯的大圖才建立多尺寸版本。以同一原圖分別輸出所需寬度，然後手寫 `srcset`：

```bash
npm run img -- photo hero.jpg --max-width 800 --out images/hero-800.webp
npm run img -- photo hero.jpg --max-width 1600 --out images/hero-1600.webp
```

```html
<img
  src="./images/hero-800.webp"
  srcset="./images/hero-800.webp 800w, ./images/hero-1600.webp 1600w"
  sizes="(max-width: 768px) 100vw, 800px"
  width="800"
  height="450"
  alt="..."
/>
```

- `sizes` 必須反映實際版型，避免瀏覽器選擇過大的檔案。
- `width` 與 `height` 使用最小版本的實際尺寸；所有版本須維持相同長寬比。
- 固定尺寸圖片與圖示使用單一檔案即可。
- HTML `<img>` 與 SVG 內在尺寸的共通要求依 repository 根目錄的 `AGENTS.md` 執行。
