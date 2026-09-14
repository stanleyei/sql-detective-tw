# SQL 偵探事務所：潮港市檔案

以 MariaDB 語法為基準的互動式 SQL 教學遊戲。玩家扮演潮港市警局的資料分析實習生，用 SQL 破解六起案件，從 `SELECT` 一路學到 `JOIN`、子查詢與資料異動，約 8 小時課程。靈感來自 [SQL Murder Mystery](https://mystery.knightlab.com)（Knight Lab，CC BY-SA 4.0）。

純靜態網站，所有查詢在瀏覽器內以 sql.js（SQLite WebAssembly）執行，並透過自製的 MariaDB 相容層改寫語法、翻譯錯誤訊息。不需要後端，可直接部署到 GitHub Pages。

## 內容

| 章 | 案件 | 語法 |
|---|---|---|
| 0 | 報到日 | SHOW TABLES、DESCRIBE、SELECT、WHERE |
| 1 | 夜市失竊 | AND / OR、LIKE、IN、BETWEEN、IS NULL、ORDER BY、DISTINCT |
| 2 | 超商監視器 | 日期時間函數、INTERVAL、字串函數、CASE、AS |
| 3 | 捷運遺失物 | COUNT / SUM / AVG、GROUP BY、HAVING、GROUP_CONCAT |
| 4 | 公司內鬼 | INNER JOIN、LEFT JOIN、多表、SELF JOIN |
| 5 | 資料室整理 | CREATE TABLE、AUTO_INCREMENT、INSERT / UPDATE / DELETE、ALTER、DROP |
| 6 | 海景大樓命案 | 子查詢、綜合推理、INSERT INTO solution |

## 開發

```bash
npm install
npm run build        # 產生 seed.js、expect.js 與 css/style.css
npx serve . -l 3000  # 另開靜態伺服器預覽
```

其他指令：

| 指令 | 用途 |
|---|---|
| `npm run dev` | Tailwind watch（不含伺服器） |
| `npm run data` | 重新產生資料庫種子 `js/engine/seed.js` |
| `npm run tasks` | 重新計算任務期望值 `js/chapters/expect.js` |
| `npm run test:compat` | MariaDB 相容層回歸測試（Node） |
| `npm run favicon -- <圖>` | 由方形圖產生 favicon.ico 與 apple-touch-icon |
| `npm run img -- ...` | 圖片素材正規化 |

## 結構

```
index.html            首頁與章節地圖
play.html             遊戲主畫面（劇情 / 查詢區 / 證據板）
schema.html           資料表總覽
src/tailwind.css      設計 token 與元件樣式
js/engine/            sql.js 封裝、MariaDB 相容層、資料種子
js/chapters/          七個章節的劇情、教學與任務；expect.js 為任務期望值
js/game/              遊戲主控、進度儲存、檢核、語法小抄、語法上色
scripts/              資料產生、任務建置、相容層測試、圖片與 favicon 工具
vendor/               sql.js 與 GSAP（自帶，CSP 只允許同源腳本）
```

## 修改內容時

- 改了資料（`scripts/gen-data.js`）或章節任務：執行 `npm run data && npm run tasks`，再跑 `npm run test:compat`。
- 任務的標準解答就是每題的第三個提示，`build-tasks.js` 以它算出期望值；提示改了期望值就要重建。
- 開放式答案在 `scripts/answers.json`。
- 改了 CSS 或 `js/` 任何檔案：更新三個 HTML 內所有 `?v=YYYYMMDD-NN` 版本號。

## 部署

推送到 `main` 後由 GitHub Actions 建置並部署到 GitHub Pages（`.github/workflows/pages.yml`）。
