---
name: image-assets
description: 圖片素材的處理與使用流程。當新增或更換圖片素材、處理設計師交付的原圖、將圖片放入 images/、或需要響應式尺寸（srcset）時載入。涵蓋 npm run img 的 preset 選擇、多尺寸輸出與手寫 srcset / sizes 的原則。
---

# 圖片素材處理

**這是可用的工具，不是必經流程。** 需要保留高解析原圖時（商品放大圖、可下載素材、印刷用圖）就別處理，直接沿用原檔並在 commit message 說明原因。

**不確定時保守處理或詢問使用者，不要自行降級高解析素材。**

## 本專案的限制

純靜態站沒有 bundler，**沒有任何 build 期機制會自動產生多尺寸或 `srcset`**。所有進 repo 的圖片都會原樣被瀏覽器下載，因此來源檔的尺寸與格式就是使用者實際拿到的東西，入庫前正規化比框架專案更重要。

圖片一律放 `images/`（圖示放 `images/icon/`），以相對路徑 `./images/...` 引用。

## 判斷流程

新增圖片素材時，先 `npm run img -- inspect <檔案>` 看實際尺寸、格式、透明度、ICC 與預估壓縮效果，再依素材性質選 preset：

- `photo`：照片類（人像、風景、商品），2400px / webp q82
- `graphic`：線稿、UI 截圖、含文字的圖，2400px / webp 無損
- `og`：社群分享圖，固定 1200×630 且會裁切；產出後填入 `index.html` 的 `og:image`，並確認 `og:image:alt` 有內容。現行的 `images/og-v2.jpg` 是由 `npm run og`（`scripts/make-og.js`）以 codex 底圖加程式疊字合成，改文案或版面請改該腳本再 `npm run og -- --compose`，換圖後檔名要遞增（`og-v3.jpg`）並同步三頁的 `og:image` / `twitter:image`，因為 FB、LINE 對 OG 圖有各自的快取
- `raw`：preset 不合用時的逃生口

preset 數值可用 `--max-width`、`--quality`、`--format` 覆寫，`--out` 指定輸出位置；完整選項見 `npm run img -- --help`。腳本內建的通則（不放大、不覆寫來源、保留 ICC、產出變大即捨棄、SVG 跳過）不需另外交代。

## 響應式尺寸

需要 `srcset` 時，以同一原圖多次執行腳本產出不同寬度並手寫標記：

```bash
npm run img -- photo hero.jpg --max-width 800  --out images/hero-800.webp
npm run img -- photo hero.jpg --max-width 1600 --out images/hero-1600.webp
```

```html
<img
  src="./images/hero-800.webp"
  srcset="./images/hero-800.webp 800w, ./images/hero-1600.webp 1600w"
  sizes="(max-width: 768px) 100vw, 800px"
  width="800" height="450"
  alt="..."
/>
```

- `sizes` 必須依實際版型填寫，否則瀏覽器會假設圖片佔滿視窗寬度而選過大的檔案。
- `width` / `height` 填最小那份的尺寸（長寬比與所有尺寸一致），供 CSS 失效時作為安全底線。
- 只需一種尺寸的圖（圖示、固定尺寸裝飾）直接放單一檔案即可，不必產多份。
- 多尺寸檔案只在真正有大圖且手機與桌機顯示尺寸差距明顯時才值得做，不要為小圖建 `srcset`。

## 相關規範

`<img>` 與 SVG 檔的數值 `width` / `height` 屬性要求見 CLAUDE.md「圖片與圖示」段——該規範適用於所有 HTML 編輯，不限圖片素材任務，故不在本 skill 重複。
