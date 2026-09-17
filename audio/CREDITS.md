# 背景音樂來源

三段背景音樂皆取自 OpenGameArt.org，原作者以 **CC0 1.0（公眾領域貢獻宣告）** 釋出，可自由使用、修改與散布，無須標示出處；此處仍列出來源以便日後追溯與更換。

音檔以 ffmpeg 裁切、正規化至 -23 LUFS 後轉為 Opus（`.ogg`）與 AAC（`.m4a`）兩種格式，由 `js/game/audio.js` 依瀏覽器支援擇一載入。

| 檔案 | 場景 | 原曲 | 作者 | 來源 | 處理 |
|---|---|---|---|---|---|
| `bgm-office.*` | 事務所（教學、任務、小測驗） | Moil | ruskerdax | https://opengameart.org/content/moil | 取第 1.0 至 89.0 秒（第一段落，止於樂曲自然停頓），頭尾短淡入淡出 |
| `bgm-story.*` | 劇情 | Investigation | umplix | https://opengameart.org/content/investigation-0 | 取前 56 秒，尾端 4 秒與開頭交叉淡化成 52 秒無縫循環 |
| `bgm-ending.*` | 結案（指認、提交） | Forget Me Not in F Major (Looped) | kistol | https://opengameart.org/content/forget-me-not | 原作者提供的循環版，僅調整音量 |

## silence.wav

0.5 秒全靜音 WAV，由腳本產生、非第三方素材。僅供 iOS 16 以下讓音訊 session 轉為媒體播放（見 js/game/audio.js）。
