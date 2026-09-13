---
name: pr-review-publish
description: 將 PR 審查結果發布到 GitHub PR 的流程規範。當需要把 code review / PR review 的結論以 comment 形式發布到 GitHub PR 時載入，包含發布前確認、彙整規則、gh CLI 使用方式與失敗處理。
---

# PR Review 結果發布

## 發布前

1. **必須先在對話中展示完整審查結果**，經使用者明確確認後才可執行發布
2. **不得推定同意**：使用者先前要求「進行 review」不等於同意發布。未針對「即將發布的完整內容」取得明確同意前，停止並請求確認
3. 未取得確認前，不得呼叫任何會在 GitHub 寫入內容的命令或工具
4. 確認目標 PR。無論有多少個審查代理參與，先去除重複內容彙整成一份，最終只發布**一則** comment

## 發布方式

統一使用一般 comment：

```bash
gh pr comment <PR編號或URL> --body-file <審查內容檔案>
```

- **禁止**使用 `gh api` 貼行內 review comment —— 行內 comment 需精確對應 diff 行號，極易失敗
- **禁止**拆成多則 comment
- 只使用 `gh` CLI，不要 fallback 到 Python、curl 或其他替代方式

## 發布後

將指令輸出的 comment URL 顯示於對話中，方便審核者點擊查看：

```
Comment 已發布：<URL>
```

## 失敗處理

若 `gh` 未安裝、未登入或指令失敗，**不要嘗試其他發布方式**。直接在對話中保留完整審查結果與錯誤摘要，並提醒安裝 GitHub CLI：

- Windows：`winget install GitHub.cli`
- macOS：`brew install gh`
- 安裝後或需要重新認證時執行 `gh auth login`

**失敗時不得宣稱 comment 已發布。**
