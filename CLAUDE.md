# CLAUDE.md

此文件提供 Claude Code 在此儲存庫工作時的指引。

## 語言設定

請所有回覆均使用「繁體中文」回答，避免簡體字與中國特有用語，用詞精確且適合台灣地區開發者閱讀。

## 專案概述

「SQL 偵探：潮港市檔案」——以 MariaDB 語法為基準的互動式 SQL 教學遊戲，純靜態站部署於 GitHub Pages。頁面：`index.html`（首頁）、`play.html`（遊戲）、`schema.html`（資料表總覽）。查詢引擎為 vendor 進 repo 的 sql.js，`js/engine/mariadb-compat.js` 負責把 MariaDB 語法改寫成 SQLite 並翻譯錯誤。樣式由 Tailwind CSS v4 從 `src/tailwind.css` 建置成 `css/style.css`。沒有框架與 bundler；唯一的自動化測試是 `npm run test:compat`（相容層回歸測試）。

**內容流程**：資料由 `scripts/gen-data.js` 以固定亂數種子產生（劇情關鍵列在檔案下半段釘入），章節在 `js/chapters/chN.js`，每個任務的第三個提示就是標準解答，`scripts/build-tasks.js` 以此算出期望值寫入 `js/chapters/expect.js`。改資料或任務後必跑 `npm run data && npm run tasks && npm run test:compat`。開放式答案在 `scripts/answers.json`。

## 專案陷阱

**`css/style.css` 不在版控內**：它是建置產物且被 `.gitignore` 排除，剛 clone 或切換分支後必須先 `npm run build`（或以 `npm run dev` 持續 watch）才會有樣式。頁面完全沒有樣式時先確認這點，再懷疑 class 寫錯。

**`npm run dev` 不會啟動伺服器**：它只是 Tailwind watch。要在瀏覽器預覽須另外以靜態伺服器提供專案根目錄（例如 `npx serve .`）。不要用 `file://` 開啟：`index.html` 的 CSP 含 `upgrade-insecure-requests`，字型與相對路徑的行為也與正式站不同。

**跨平台**：Windows（Git Bash / PowerShell / WSL）與 macOS 同時開發，指令與腳本須雙邊相容：路徑用正斜線、串接用 `&&` 而非 `;`。

### 靜態資源快取版本號（改版必做）

`index.html`、`play.html`、`schema.html` 引用的 `css/style.css` 與 `js/` 底下所有腳本都帶有 `?v=YYYYMMDD-NN` 版本參數，用於快取破壞。`YYYYMMDD` 為發布當日日期，`NN` 是當日發布流水號，從 `01` 開始遞增（當日第一次發布為 `-01`，第二次為 `-02`，依此類推）：

```html
<link rel="stylesheet" href="./css/style.css?v=YYYYMMDD-NN" />
<script src="./js/game/play.js?v=YYYYMMDD-NN" defer></script>
<script src="./js/main.js?v=YYYYMMDD-NN" defer></script>
```

**只要 `src/tailwind.css`、`css/style.css` 或 `js/` 底下任一檔案有異動，發布前務必執行 `npm run bump`**，它會讀出三頁現有版本、以今天日期算出下一個流水號並同步改寫三個 HTML 內所有 `?v=`；不要手動逐一替換。`npm run bump:check` 只驗證三頁是否一致不改檔，已納入 `npm test`。同一天多次發布時流水號必須遞增，避免 `immutable` 快取因版本號重複而繼續提供舊檔。`bump` 綁定「發布」而非「建置」，因此刻意不掛進 `build` 或 `dev`。

原因：正式站（GitHub Pages）與過往 nginx 部署都會長期快取靜態檔，nginx 對 `.css` / `.js` 設定了 `Cache-Control: public, max-age=31536000, immutable`（一年、不重新驗證），版本號沒更新使用者就會一直拿到舊檔。LINE、Facebook 等 App 內建瀏覽器有獨立於系統瀏覽器的快取，且比一般瀏覽器更難清除，這個問題在它們身上最嚴重——曾發生 Tailwind 新增的 utility 因舊 CSS 未更新而未生效、導致圖示爆版的實際案例。

### 前端原始碼即公開內容

此專案為純靜態站，`index.html` 與 `js/` 底下所有檔案**原樣**提供給瀏覽器，每一行都等同公開；`src/tailwind.css` 則經 `--minify` 建置，註解不會出現在產物中，可放心寫詳細的設計脈絡。

- **未公開的內容不要寫進前端檔案**，包含用 `hidden` 旗標或 `class="hidden"` 藏起來的資料（未公布的講者、名單、日程）。藏在前端等同已發布，且會被爬蟲與網頁存檔收錄，無法撤回。
- `index.html` 與 `js/` 的註解**不要**寫：`TODO` / `FIXME` 等已知未修缺陷、註解掉的舊程式碼、內部路徑與主機名、人員姓名信箱、票號、「這裡先繞過檢核」這類自陳弱點。這些請寫在 commit message。
- 上述檔案的註解**應該**寫：反直覺手法的理由、瀏覽器 quirk 的成因、刻意的執行順序、空 `catch` 的正當化——即「刪掉會導致後人誤改」的資訊。
- `js/` 若以 `innerHTML` 插入資料，來源必須是檔案內的硬編碼常數；日後接入 query string、表單或外部 API 時，改用 `textContent` 或先行轉義。

## Tailwind CSS

採 **CSS-first 設定**：所有 token 寫在 `src/tailwind.css` 的 `@theme` 區塊，**沒有** `tailwind.config.js`。

- 顏色只透過 `@theme` 的語意色 token 使用（既有範例 `--color-brand-orange` → `bg-brand-orange`），不寫死色碼。新色彩先加 `--color-*` token，並在註解標明驗證過的對比情境。
- 間距、字級、圓角優先用內建 scale。同一個非標準值反覆出現時，在 `@theme` 建具語意的 token（如 `--text-eyebrow`）再引用，而不是到處寫 arbitrary value `[]`；一次性、無語意的特例才用 `[]`，並在該行加註原因。
- 重複出現的 utility 組合抽成 `@layer components` 類別搭配 `@apply`。
- 響應式用 breakpoint 前綴（`sm:`、`md:`）；只有 Tailwind 未涵蓋的查詢（`prefers-*` 等）才自行寫 `@media`。

## 無障礙

目標 **WCAG 2.1 AA**。模板本身幾乎是空的，以下慣例無法從既有程式碼模仿，故在此列出：

- 字級用 `rem`（Tailwind 的 `text-*` 本身即 rem，WCAG 1.4.4）；行高用無單位比值（`leading-*`）；段落間距、字距、詞距用 `em`（WCAG 1.4.12）。邊框、陰影等不需隨字級縮放的裝飾尺寸可用 px。
- 觸控／點擊目標至少 `44 × 44 px`（WCAG 2.5.5）。
- 文字對比一般 ≥ 4.5:1、大字（≥ 18.66px 粗體或 ≥ 24px）≥ 3:1（WCAG 1.4.3）；不可單靠顏色傳達資訊（WCAG 1.4.1）。
- 語意化標籤，互動元素用 `<button>` / `<a>` 而非 `<div>` 綁事件；圖片給 `alt`，裝飾性用 `alt=""`；視覺隱藏但需輔助技術可讀的內容用 Tailwind 內建的 `sr-only`。
- 鍵盤焦點須可見，新增動畫須尊重 `prefers-reduced-motion`。模板**尚未**在 `@layer base` 預先處理這兩項，新增互動元件或動畫時自行補上。

## 圖片與圖示

新增或更換圖片素材時，載入 `/image-assets` skill 依其流程處理；**不確定時保守處理或詢問使用者，不要自行降級高解析素材。**

圖示以 `<img src="./images/icon/...svg">` 引用。為了在 CSS 未生效（快取拿到舊檔、in-app 瀏覽器擋 CSS）時圖示不會撐爆版面：

- **SVG 圖示必須有可辨識的內在尺寸與長寬比**。新增或修改 `images/icon/*.svg` 時，外層 `<svg>` 應使用與 `viewBox` 對應的數值 `width` / `height`，例如 `<svg width="24" height="24" viewBox="0 0 24 24">`，不要使用 `width="100%" height="100%"`。`viewBox` 可提供內在長寬比，但百分比型的 `width` / `height` 不會提供固定的內在寬高。
- **icon 預設不要使用 `preserveAspectRatio="none"`**。這個屬性不是尺寸設定，而是讓 `viewBox` 內容以不同的 X、Y 縮放比例填滿 viewport；外層 `<img>` 與 `viewBox` 長寬比不同時會造成圖示變形。只有刻意需要滿版拉伸的裝飾性 SVG（wave、mask、線條與分隔線）才保留。
- **HTML 中的 `<img>` 一律補上 `width` / `height` 屬性**，包含 `js/` 動態產生的 `<img>`；數值對應設計上的預設顯示尺寸與長寬比（即該元素的 `size-*` utility）。這可先確定外層圖片盒尺寸、降低 CLS，並作為 CSS 失效時的安全底線，但不會覆寫 SVG 內部的 `preserveAspectRatio`。

## UI 驗證

異動涉及版面、樣式、互動狀態或響應式排版時，載入 `/frontend-ui-validation` skill 以 Playwright MCP 實際開啟頁面檢視。本專案沒有 lint 與自動化測試，瀏覽器是唯一的驗證手段，未看過的畫面不得宣告完成。

## Subagent 使用規範

- 涉及同一檔案的修改**禁止**分派到不同 subagent，應合併為同一任務
- Subagent 的 prompt 需自帶完整任務描述與檔案路徑，它看不到主對話內容
- **Subagent 禁止對外發布**：不得執行 `gh pr comment`、`gh issue comment`、`git push` 等對外操作，一律回傳主對話統一處理；派發時須在 prompt 中明確指示此限制

## PR Review 發布

**發布前必須先在對話中展示完整審查結果，經使用者確認後才可發布**，且只發布一則彙整後的 comment。詳細流程請載入 `/pr-review-publish` skill。

## Git Commit 規範

- 採用 Conventional Commits 格式，type 與 scope 用英文（`fix:`、`feat(api):`）
- subject 與 body 使用繁體中文，避免簡體字與中國特有用語
- 不要加 `Co-Authored-By` 行
