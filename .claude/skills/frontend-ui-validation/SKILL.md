---
name: frontend-ui-validation
description: 靜態 HTML 站的畫面驗收流程。當異動涉及版面、樣式、互動狀態、響應式排版時載入。以 Playwright MCP 實際開啟頁面檢查截圖、console、互動流程、RWD 溢出與無 CSS 降級，這是本專案唯一的驗證手段。
---

# 前端 UI 驗證

## 為什麼需要這個流程

本專案沒有 lint、型別檢查與自動化測試，任何「畫面壞了」的問題——手機版斷版、內容被遮擋、按鈕跑版、文字截斷、非預期水平捲動、圖示在 CSS 失效時撐爆——都只能實際開瀏覽器看。涉及 UI 的異動，未經實際檢視不得宣告完成。

## 執行流程

### 1. 建置樣式並啟動靜態伺服器

`css/style.css` 不在版控內，`npm run dev` 也只是 Tailwind watch、不會提供頁面。驗證前需要兩件事：

```bash
npm run build          # 或另開背景 process 執行 npm run dev 持續 watch
npx serve . -l 3000    # 以專案根目錄提供靜態檔案
```

- 先確認 `http://localhost:3000` 是否已有可用伺服器，有則沿用，**不要重複啟動**。沿用前以異動後的 DOM 或文字確認它提供的是本 worktree 的內容，不是別的專案。
- 不要用 `file://` 開啟 `index.html`：CSP 含 `upgrade-insecure-requests`，字型與相對路徑行為也與正式站不同。
- 修改 `src/tailwind.css` 或 `index.html` 的 class 後，若沒有 watch 在跑，必須重新 `npm run build` 再重載頁面，否則看到的是舊樣式。
- 由本次驗證啟動的伺服器與 watch，驗證結束後應關閉，不要遺留背景 process。

### 2. 檢查 viewport

至少涵蓋兩種尺寸：

- 桌機：`1440x900`
- 手機：依目標介面選擇合理尺寸，例如 `390x844`

**每個 viewport 都要從乾淨的初始狀態開始**：`browser_resize` 只改視窗尺寸，不會重載頁面。設定尺寸後必須重新載入頁面；不要沿用另一尺寸操作後殘留的捲動位置、focus 或展開狀態，否則會把測試狀態殘留誤判成版面缺陷（例如桌機捲到底再縮成手機寬，回到頂部按鈕已顯示，但這不是手機版首次載入的狀態）。

### 3. 每個 viewport 逐項確認

- **截圖**：檢視版面、間距、文字、元件狀態與視覺層級。**檔名一律給絕對路徑，指向 session 的 scratchpad 目錄**——`browser_take_screenshot` 的相對檔名是相對 MCP server 的工作目錄（專案根）解析，會在 repo 根目錄留下未被 gitignore 的 PNG 並汙染 `git status`
- **console**：檢查 error 與 warning，特別留意 CSP 封鎖訊息——新增外部資源（字型、圖片、script）時，`index.html` 的 `Content-Security-Policy` 必須同步放行，否則正式站會靜默載入失敗
- **互動**：操作本次異動涉及的流程——捲動觸發、開啟、關閉、切換、hover 與 focus 狀態
- **鍵盤**：以 Tab 走訪互動元素，確認焦點可見且順序合理；跳至主要內容連結在 focus 時應可見
- **溢出**：確認內容沒有非預期溢出、遮擋、截斷或產生水平捲動。除了看截圖，可用 `browser_evaluate` 量測：

  ```js
  ({ scrollW: document.documentElement.scrollWidth, clientW: document.documentElement.clientWidth })
  ```

  `scrollW > clientW` 代表有水平捲動，再回頭找是哪個元素撐開的。判讀時區分「容器內的刻意橫向捲動」與「整頁被撐開」——前者是設計，後者是缺陷
- **疑似遮擋、位移、截斷**：須先重載頁面以乾淨初始狀態重現，才可列為缺陷。必要時以 `browser_evaluate` 檢查目標元素的 `getBoundingClientRect()`，並用 `document.elementFromPoint()` 確認實際覆蓋在該位置的元素

### 4. 無 CSS 降級檢查

**在本次異動新增或修改 `<img>`、`images/` 素材或圖示尺寸時執行**；純文案異動可略過。這一步模擬正式站快取拿到舊 CSS、或 LINE、Facebook 等 in-app 瀏覽器擋掉 CSS 的情境，是本專案曾實際發生過的問題（見 CLAUDE.md「靜態資源快取版本號」）。

在手機 viewport 下執行：

```js
document.querySelectorAll('link[rel="stylesheet"], style').forEach(el => { el.disabled = true; });
```

**判讀標準是「比設計尺寸明顯放大」，不是「撐滿整行」。** 撐開幅度取決於父層——父層是 shrink-to-fit 的 `<button>` 時只會放大數倍，只有 block 容器才會撐到整行寬。用 `getBoundingClientRect()` 量出實際尺寸再與 `width` / `height` 屬性比對：

```js
[...document.querySelectorAll('img')].map(el => ({
  src: el.getAttribute('src'),
  attr: el.getAttribute('width') + 'x' + el.getAttribute('height'),
  rendered: Math.round(el.getBoundingClientRect().width) + 'x' + Math.round(el.getBoundingClientRect().height),
}));
```

放大代表該 `<img>` 缺少數值 `width` / `height` 屬性，或 SVG 檔本身缺少數值內在尺寸，依 CLAUDE.md「圖片與圖示」補上後重新確認。有數值屬性的圖示在此時會由 utility 值回落到屬性值，這是安全底線生效的預期行為，不是缺陷。

**頁面整體失去樣式是預期的，只看圖示與圖片的尺寸是否失控**，不要把版面變醜當成缺陷回報。檢查完重新載入頁面還原樣式再繼續。

### 5. 工具故障處置

Playwright MCP 的 stdio 模式不穩時，改用 HTTP MCP server 後繼續相同檢查。**不可因傳輸模式失敗而略過視覺驗證。**

### 6. 清理產出物

驗證結束後，連同第 1 節的伺服器與 watch 一併清除本次產生的暫存檔：

```bash
rm -rf "$CLAUDE_PROJECT_DIR/.playwright-mcp"
```

`.playwright-mcp/` 是 Playwright MCP 自動寫入的頁面快照（`.yml`）與 console 記錄（`.log`），已由 `.gitignore` 排除，但不會自我清理——單輪驗證約產生 50～60 個檔案，且正因為被 ignore，長期累積不會有人察覺。務必用絕對路徑或 `$CLAUDE_PROJECT_DIR`，相對路徑在不同工作目錄下會刪到不存在的路徑且不報錯。

**不要改用 MCP 的 `--output-max-size` 自動淘汰**：其實作會在任務進行中依 mtime 由舊到新刪除同一 session 較早的 console log，且對話中已回傳的路徑會失效、事後無法回讀。

## 完成回報

回報必須包含：

- 實際檢查的 URL、viewport 與主要互動流程
- 截圖確認的結果
- 發現的 console error/warning、CSP 封鎖、responsive overflow 或視覺異常，以及是否已修正
- 因環境或工具限制而**未能執行**的驗證項目及原因

**不得將未執行的項目描述為通過。** 未看過的畫面就是未看過。
