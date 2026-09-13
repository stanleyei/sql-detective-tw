---
name: frontend-ui-validation
description: 驗證此靜態網站的視覺與互動結果。修改版面、Tailwind 樣式、互動狀態或響應式排版後使用；純文件、設定或不影響畫面的程式變更不需使用。
---

# 前端 UI 驗證

涉及 UI 的異動必須實際開啟頁面檢查。建置成功不能取代視覺驗證；未執行的項目必須如實回報，不得描述為通過。

## 準備頁面

1. 執行 `npm run build`，確保被忽略的 `css/style.css` 存在且為最新版本。
2. 確認 `http://localhost:3000` 是否已有伺服器。若有，先用本次異動的 DOM 或文字確認它提供的是目前 worktree；否則從 repository 根目錄啟動 `npx serve . -l 3000`。
3. 不要以 `file://` 開啟頁面。驗證結束後，關閉本次啟動的 server 或 watch process。

先確認目前 session 可用的瀏覽器自動化能力，再選擇能操作 localhost、截圖與互動的工具。不要假設 repository 的 `.mcp.json` 已在 Codex profile 生效，也不要為了驗證自行安裝或修改使用者層級的 MCP 設定。若缺少必要能力，完成仍可執行的檢查並在回報中列出限制。

## Viewport 與狀態

至少檢查：

- 桌機 `1440×900`。
- 手機 `390×844`，或更符合目標裝置的合理尺寸。

每個 viewport 都要重新載入頁面，從乾淨的捲動位置、焦點與展開狀態開始，避免把前一尺寸的操作殘留誤判成缺陷。

## 檢查項目

依本次異動範圍完成下列項目：

- 截圖檢視版面、間距、文字、元件狀態與視覺層級。若工具需要輸出檔案，使用 session scratchpad 或系統暫存目錄的絕對路徑，不要在 repo 根目錄留下 PNG。
- 檢查 console error 與 warning，尤其是 CSP 封鎖。新增外部資源時確認 `Content-Security-Policy` 已允許所需來源。
- 操作受影響的開啟、關閉、切換、捲動、hover、focus 與鍵盤流程。
- 以 Tab 檢查焦點可見性與順序；確認跳至主要內容連結在 focus 時可見。
- 確認沒有非預期遮擋、截斷或整頁水平捲動。工具支援頁面 JavaScript 時量測：

```js
({
  scrollW: document.documentElement.scrollWidth,
  clientW: document.documentElement.clientWidth,
})
```

`scrollW > clientW` 表示整頁可能被撐開；容器內刻意設計的橫向捲動不算缺陷。疑似位移或遮擋應先重新載入乾淨頁面重現，再視需要用 `getBoundingClientRect()` 與 `document.elementFromPoint()` 定位。

## 無 CSS 降級

本次異動新增或修改 `<img>`、圖片素材或圖示尺寸時，在手機 viewport 執行；純文案或不涉及圖片的變更可略過。

若工具支援頁面 JavaScript，停用樣式：

```js
document.querySelectorAll('link[rel="stylesheet"], style').forEach((element) => {
  element.disabled = true;
});
```

只判斷圖片與圖示是否相較設計尺寸明顯失控；整體頁面失去排版是預期結果。可量測：

```js
[...document.querySelectorAll('img')].map((element) => ({
  src: element.getAttribute('src'),
  attr: `${element.getAttribute('width')}x${element.getAttribute('height')}`,
  rendered: `${Math.round(element.getBoundingClientRect().width)}x${Math.round(element.getBoundingClientRect().height)}`,
}));
```

尺寸失控時，依 `AGENTS.md` 補齊 `<img>` 的數值 `width` / `height`，並確認 SVG 根元素具有和 `viewBox` 對應的數值內在尺寸。完成後重新載入頁面恢復樣式。

## 清理與回報

只清理由本次驗證建立的暫存檔與 process。若工具產生 `.playwright-mcp/`，刪除前先解析並確認目標是目前 repository 根目錄下的確切資料夾；依目前 shell 使用原生、安全的檔案操作，不使用 Claude 專屬環境變數。

完成回報包含：

- 實際檢查的 URL 與 viewport。
- 執行的主要互動及截圖觀察結果。
- console、CSP、responsive overflow 與視覺異常，以及是否已修正。
- 因工具或環境限制未執行的項目與原因。
