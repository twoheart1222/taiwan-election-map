repo: twoheart1222/taiwan-election-map
branch: main
path:

## Last sync
date: 2026-09-15T16:48:00Z

### Updated in this project
- index.dc.html：Preloader 顯示倒數天數 + 模糊放大進場動畫；進場後直接為 3D 立體台灣地圖
- 3D 地圖點選縣市開啟候選人抽屜（沿用原 index.html 的 card/drawer/party/選舉區選單功能，改為紅黑白主題）
- 導覽列小型「距投票 XX 天」滾動倒數；刪除關鍵數字與時程區塊
- 新增 observatory.dc.html（政治觀測站，獨立頁）與 support.dc.html（支持我們・小額捐款）

## Screen map
| 專案畫面 | 來源檔案 |
| --- | --- |
| index.dc.html | index.html（drawer/card/partyConfig/districtLabel 移植）, data/counties.json, data/district_town_map.json, data/district_quota.json |
| observatory.dc.html | index.html（SITES 觀測站清單） |
| support.dc.html | 全新設計 |

## Notes
- 抽屜為縣市層級（首長 + 議員候選人依選舉區）；原 index.html 另有鄉鎮/村里逐層下探的 Leaflet 版本。
