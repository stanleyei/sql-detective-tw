---
name: pr-review-publish
description: 將已完成並經使用者確認的 PR／code review 彙整結果發布為單一 GitHub PR 一般 comment。當使用者要求把審查結論發布到 GitHub PR、執行 gh pr comment，或處理多代理審查結果的統一發布時使用。
---

# 發布 PR Review 結果

## 發布前檢查

1. 確認已在對話中展示準備發布的完整審查結果。
2. 確認使用者已針對該完整內容明確同意發布。若未確認，停止並請求確認；不得因使用者先前要求「進行 review」而推定其同意發布。
3. 未取得上述確認前，不得呼叫 `gh` 或任何會對 GitHub 寫入內容的工具。
4. 確認目標 PR。若有多個代理的結果，先去除重複內容並彙整成一份，最終只發布一則 comment。

## 發布

只使用 GitHub CLI 的一般 comment：

```bash
gh pr comment <PR編號或URL> --body-file <審查內容檔案>
```

- 禁止使用 `gh api` 建立行內 review comment。
- 禁止拆成多則 comment。
- 禁止改用 Python、curl 或其他方式發布。
- 執行成功後，從 `gh` 輸出取得 comment URL，回覆：`Comment 已發布：<URL>`。

## 失敗處理

若 `gh` 未安裝、未登入或命令失敗，不要嘗試其他發布方式。直接在對話中保留完整審查結果與錯誤摘要，並提示：

- Windows：`winget install GitHub.cli`
- macOS：`brew install gh`
- 安裝後或需要重新認證時：`gh auth login`

失敗時不得宣稱 comment 已發布。
