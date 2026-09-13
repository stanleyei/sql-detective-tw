# AGENTS.md

此文件提供 Codex 在此儲存庫工作時的專案指引。

## 語言與溝通

所有回覆使用適合台灣開發者閱讀的繁體中文，避免簡體字與中國特有用語，並保持專業、精確。

## 專案概述

本專案是「SQL 偵探事務所：潮港市檔案」——以 MariaDB 語法為基準的互動式 SQL 教學遊戲，純靜態站部署於 GitHub Pages。頁面有 `index.html`、`play.html`、`schema.html`；查詢引擎為 vendor 進 repo 的 sql.js，`js/engine/mariadb-compat.js` 把 MariaDB 語法改寫成 SQLite 並翻譯錯誤訊息。Tailwind CSS v4 會將 `src/tailwind.css` 建置成 `css/style.css`。沒有前端框架與 bundler；唯一的自動化測試是 `npm run test:compat`。

資料由 `scripts/gen-data.js` 產生，章節在 `js/chapters/chN.js`，每個任務的第三個提示是標準解答，`scripts/build-tasks.js` 據此產生 `js/chapters/expect.js`。改資料或任務後必跑 `npm run data && npm run tasks && npm run test:compat`。

## 開發指令

```bash
# 安裝依賴
npm install

# 持續監看並建置 Tailwind CSS（不會啟動 HTTP server）
npm run dev

# 正式環境建置
npm run build

# 需要瀏覽器預覽時，另以靜態伺服器提供專案根目錄
npx serve . -l 3000
```

## 開發流程

### 專案陷阱

- `css/style.css` 是被 `.gitignore` 排除的建置產物。剛 clone、切換分支或修改 Tailwind class 後，先執行 `npm run build`；頁面沒有樣式時先確認產物是否存在且為最新版本。
- `npm run dev` 只執行 Tailwind watch，不會啟動網站。瀏覽器預覽需另開靜態伺服器。
- 不要用 `file://` 開啟 `index.html`；其 CSP 含 `upgrade-insecure-requests`，字型和相對路徑行為也與正式站不同。

### 跨平台相容性

此專案在多個作業系統上開發，所有指令與腳本必須同時相容：

- **Windows**：Git Bash、PowerShell 或 WSL
- **macOS**：Terminal 或 iTerm

注意事項：

- 路徑使用正斜線（`../frontend`）
- 指令串接使用 `&&` 而非 `;`

### 靜態資源快取版本號（改版必做）

`index.html`、`play.html`、`schema.html` 引用的 `css/style.css` 與 `js/` 底下所有腳本都帶有 `?v=YYYYMMDD-NN` 版本參數，用於快取破壞。`YYYYMMDD` 為發布當日日期，`NN` 是當日發布流水號，從 `01` 開始遞增（當日第一次發布為 `-01`，第二次為 `-02`，依此類推）：

```html
<link rel="stylesheet" href="./css/style.css?v=YYYYMMDD-NN" />
<script src="./js/game/play.js?v=YYYYMMDD-NN" defer></script>
<script src="./js/main.js?v=YYYYMMDD-NN" defer></script>
```

**只要 `src/tailwind.css`、`css/style.css` 或 `js/` 底下任一檔案有異動，發布前務必將三個 HTML 內所有 `?v=` 同步更新為當日日期與下一個流水號。** 同一天多次發布時，流水號必須遞增，避免 `immutable` 快取因版本號重複而繼續提供舊檔。

原因：正式站（GitHub Pages）與過往 nginx 部署都會長期快取靜態檔，nginx 對 `.css` / `.js` 設定了 `Cache-Control: public, max-age=31536000, immutable`（一年、不重新驗證），版本號沒更新使用者就會一直拿到舊檔。LINE、Facebook 等 App 內建瀏覽器有獨立於系統瀏覽器的快取，且比一般瀏覽器更難清除，這個問題在它們身上最嚴重——曾發生 Tailwind 新增的 utility 因舊 CSS 未更新而未生效、導致圖示爆版的實際案例。

相關的防禦措施：

- **SVG 圖示必須有可辨識的內在尺寸與長寬比**。新增或修改 `images/icon/*.svg` 時，外層 `<svg>` 應使用與 `viewBox` 對應的數值 `width` / `height`，例如 `<svg width="24" height="24" viewBox="0 0 24 24">`，不要使用 `width="100%" height="100%"`。`viewBox` 可提供 SVG 的內在長寬比，但百分比型的 SVG `width` / `height` 不會提供固定的內在寬高。
- **icon 預設不要使用 `preserveAspectRatio="none"`**。這個屬性不是尺寸設定，而是讓 `viewBox` 內容以不同的 X、Y 縮放比例填滿 SVG viewport；當外層 `<img>` 與 `viewBox` 的長寬比不同時，可能造成圖示變形。只有刻意需要滿版拉伸的裝飾性 SVG（例如 wave、mask、線條與分隔線）才保留 `preserveAspectRatio="none"`。
- **HTML 中的 `<img>` 一律補上 `width` / `height` 屬性**，包含 `js/` 動態產生的 `<img>`；數值對應設計上的預設顯示尺寸與長寬比（即該元素的 `size-*` utility）。這可先確定外層圖片盒尺寸、降低 CLS，並作為 CSS 失效時的安全底線，但不會覆寫 SVG 內部的 `preserveAspectRatio`，也不能避免 `none` 在比例不一致時造成的變形。

### 前端原始碼即公開內容

此專案為純靜態站，`index.html` 與 `js/` 底下所有檔案**原樣**提供給瀏覽器，每一行都等同公開；`src/tailwind.css` 則經 `--minify` 建置，註解不會出現在產物中，可放心寫詳細的設計脈絡。

- **未公開的內容不要寫進前端檔案**，包含用 `hidden` 旗標或 `class="hidden"` 藏起來的資料（未公布的講者、名單、日程）。藏在前端等同已發布，且會被爬蟲與網頁存檔收錄，無法撤回。
- `index.html` 與 `js/` 的註解**不要**寫：`TODO` / `FIXME` 等已知未修缺陷、註解掉的舊程式碼、內部路徑與主機名、人員姓名信箱、票號、「這裡先繞過檢核」這類自陳弱點。這些請寫在 commit message。
- 上述檔案的註解**應該**寫：反直覺手法的理由、瀏覽器 quirk 的成因、刻意的執行順序、空 `catch` 的正當化——即「刪掉會導致後人誤改」的資訊。
- `js/` 若以 `innerHTML` 插入資料，來源必須是檔案內的硬編碼常數；若接入 query string、表單或外部 API，必須改用 `textContent` 或先行轉義。

## Tailwind CSS 使用規範

本專案使用 **Tailwind CSS v4**（透過 `@tailwindcss/cli`），採 **CSS-first 設定**：所有設定寫在 `src/tailwind.css` 的 `@theme` 區塊，**沒有** `tailwind.config.js`。撰寫樣式時須遵守：

### 優先使用設計 token 與內建 utility，避免 arbitrary value

- **有對應的內建 utility 或 `@theme` token 就不要用 arbitrary value `[]`**。例如優先 `text-lg`、`gap-3`、`rounded-full`，而非 `text-[18px]`、`gap-[12px]`。
- 顏色一律使用 `@theme` 定義的語意色 utility（如 `bg-brand-orange`、`text-ink`），**禁止**寫死色碼（如 `bg-[#c0501f]`）。新色彩先在 `@theme` 新增 `--color-*` token。
- 間距、字級、圓角優先使用內建 scale（spacing `4` = `1rem`）。若專案反覆用到某個非標準值，**在 `@theme` 定義具語意的 token**（如 `--text-eyebrow`、`--spacing-*`）再引用，而不是每處寫 `[...]`。
- arbitrary value 僅在「一次性、無語意、且不值得建 token」的特例才使用，並在該行加註說明原因。

### 抽象與組織

- 重複出現的 utility 組合應抽成 `@layer components` 內的類別，搭配 `@apply`（如既有的 `.section-title`、`.schedule-pill`）。
- 響應式使用 breakpoint 前綴（`sm:`、`md:`），**不要**自行撰寫 `@media`（`prefers-*` 等 Tailwind 未涵蓋的查詢例外）。

## 無障礙（Accessibility）規範

以 **WCAG 2.1 AA** 為目標。撰寫 HTML/CSS 時須遵守：

### 尺寸單位

- **字級（font-size）用 `rem`**（不要用 `px`），確保使用者放大瀏覽器字級時等比縮放（WCAG 1.4.4）。Tailwind 內建 `text-xs`…`text-9xl` 本身即為 rem，優先使用；`@theme` 只需補內建 scale 沒有的設計專屬值（以 rem 定義）。
- **行高（line-height）用「無單位比值」**（如 `leading-normal`/`leading-loose`，即 `1.5`、`2`），不要用固定 `px`。無單位值會隨各元素自身字級連動，優於 rem（WCAG 1.4.12 要求行高可達字級的 1.5 倍）。
- **段落間距、字距（letter-spacing）、詞距（word-spacing）用 `em`**（相對於該段文字字級），使版面隨字級縮放（WCAG 1.4.12：段後間距 ≥ 2×、字距 ≥ 0.12×、詞距 ≥ 0.16× 字級）。rem 亦可，但 em 更貼合「跟隨這段文字」。
- 邊框、陰影、`1px` 分隔線等「不需隨字級縮放」的裝飾性尺寸可用 px。
- 觸控／點擊目標至少 `44 × 44 px`（約 `2.75rem`，WCAG 2.5.5）。

### 對比與色彩

- 文字對比：一般文字 ≥ **4.5:1**、大字（≥ 18.66px 粗體或 ≥ 24px）≥ **3:1**（WCAG 1.4.3）。新增色彩組合時須驗證對比（`@theme` 色票註解已標註各色的適用對比情境）。
- **不可單靠顏色**傳達資訊（狀態、必填等須另有文字、圖示或形狀輔助，WCAG 1.4.1）。

### 語意與可操作性

- 使用語意化標籤（`<header>`、`<nav>`、`<main>`、`<button>`、`<h1>`–`<h6>` 依層級），互動元素用 `<button>`／`<a>` 而非 `<div>` 綁事件。
- 圖片提供 `alt`（裝飾性圖片用 `alt=""`）；純視覺隱藏但需輔助技術可讀的內容用既有的 `.sr-only`。
- 鍵盤焦點須可見，動態效果須尊重 `prefers-reduced-motion`。模板目前尚未在 `@layer base` 預先處理這兩項；新增互動元件或動畫時自行補上，且不得以 `outline: none` 移除焦點樣式而不提供替代方案。

## 圖片素材

新增、更換或正規化圖片素材，或需要建立 `srcset` / `sizes` 時，使用 `$image-assets` skill。這套流程是工具而非強制門檻；需要保留高解析原圖時可直接沿用。不確定時保守處理或詢問使用者，不得自行降級素材。

## UI 驗證

異動涉及版面、樣式、互動狀態或響應式排版時，使用 `$frontend-ui-validation` skill 實際開啟頁面檢查。視覺結果未經瀏覽器檢視，不得宣稱已通過；因工具或環境限制而未執行的項目必須明確回報。

## Subagent 派任

- 只有兩個以上可獨立執行且不重疊檔案的任務才平行派任；小幅單一修改由主代理處理。
- 前後端獨立修改優先分派給不同 subagent；同一檔案不得交給多個 subagent。
- 委派內容必須自包含，包含任務、相關路徑、限制、預期結果與驗證方式。
- Subagent 禁止執行 `git push`、`gh pr comment`、`gh issue comment` 或其他對外操作；主代理統一審查並彙整結果。

## PR Review 發布

- 發布前必須先在對話中展示完整彙整結果，並取得使用者明確確認。
- 確認後使用 `$pr-review-publish` skill；無論有多少審查代理，最終只能發布一則彙整 comment。
- 未取得確認前不得呼叫任何會在 GitHub 寫入內容的命令或工具。

## Git Commit

- Commit 採用 Conventional Commits；type 與 scope 使用英文固定格式，例如 `fix:`、`feat(api):`。
- Subject 與 body 使用繁體中文，避免簡體字與中國特有用語，且不得加入 `Co-Authored-By`。
- Codex 介面的「送交及推送」以及任何自動建立 commit 的流程，都必須遵守上述語言與格式規則；除專有名詞、檔名與程式識別字外，不得產生全英文的 subject 或 body。
