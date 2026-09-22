# 歷年總統選舉資料

這個目錄只存放歷史選舉快照，與 2026 候選人資料、後台 override、Cloudflare KV 完全分離。

## 檔案

- `presidential.json`：1996–2024 八屆總統副總統選舉的全國結果、候選組合與投票率。
- `presidential-counties.json`：八屆各 22 縣市的候選組合票數、得票率、勝方與勝差，由建置腳本產生，不手動修改。
- `presidential-towns.json`：2020、2024 的鄉鎮市區候選組合票數、得票率、勝方與勝差，由建置腳本產生，不手動修改。

## 資料來源

主要來源皆回到中央選舉委員會選舉資料：

- 1996–2016：`MISNUK/CECDataSet` 整理的中選會原始格式 `VoteRecords.csv`。
- 2020：`everdark/TW_Presidential_Election_2020` release 0.4；縣市層級使用 `presidential_counties.csv`，鄉鎮市區使用 `presidential_regions.csv`，皆由中選會原始 Excel 處理而成。
- 2024：`kiang/db.cec.gov.tw` 保存的中選會原始格式 `elbase.csv`、`elctks.csv`。鄉鎮市區結果由投開票所層級逐筆加總後，再回頭核對縣市總票。

網站上的來源入口仍指向中央選舉委員會選舉資料庫：
`https://db.cec.gov.tw/Visual/?type=President`

## 跨屆行政區基準

目前歷史地圖的目的為跨屆比較，因此統一使用現行 22 縣市邊界。合併／升格前資料依下列方式正規化：

- 臺北縣 → 新北市
- 桃園縣 → 桃園市
- 臺中縣 + 臺中市 → 臺中市
- 臺南縣 + 臺南市 → 臺南市
- 高雄縣 + 高雄市 → 高雄市

這是「current-22-normalized」比較模式，不代表當年行政區界線。未來若需要呈現選舉當時的真實邊界，應另建 historical-boundary topology，不覆蓋此資料。

## 鄉鎮市區下探

第一階段開放 2020、2024 兩屆，兩屆皆產生 368 個鄉鎮市區結果。

- 使用者在 `/history/` 選擇 2020 或 2024 後，點擊縣市可進一步開啟該縣市鄉鎮市區地圖。
- 鄉鎮市區頁面使用 `taiwan-atlas` 的內政部界線衍生 TopoJSON 作為地理底圖。
- 2020 直接讀取 region-level 結果。
- 2024 因來源沒有穩定的鄉鎮總計列，改由投開票所資料加總至鄉鎮市區。
- 兩屆均逐候選人驗證：該縣市所有鄉鎮市區得票加總必須完全等於 `presidential-counties.json` 的縣市票數；否則 workflow 直接失敗。

1996–2016 目前維持縣市層級，不用現代鄉鎮界線硬套歷史資料。後續若擴充，需先完成各年份行政區名稱與邊界正規化。

## 歷史頁產品 UI

`/history/` 與 `/history/town.html` 共用 `history/product-ui.css` 與 `history/product-ui.js`，避免兩個頁面各自維護不同的互動語言。

- 轉場沿用主站 GSAP 語言：多欄全螢幕遮罩、`power3` / `expo` easing，以及接近主站 `cubic-bezier(.16,1,.3,1)` 的位移節奏。
- 頁面初次進場會依序顯示 hero、地圖與結果區；縣市／鄉鎮結果更新則使用較短的局部 transition，避免每次操作都出現重動畫。
- 2020、2024 的「縣市 → 鄉鎮市區」導覽使用同一套轉場，並以 `sessionStorage` 銜接下一頁的入場動畫。
- 手機版使用獨立漢堡選單、水平年份選擇器、堆疊式地圖／結果區與至少約 40–48px 的主要觸控目標；hover tooltip 在觸控裝置停用。
- 支援 `prefers-reduced-motion`；使用者要求減少動態時會略過裝飾性轉場。
- `/history/*` 有獨立 CSP，明確允許頁面使用的 D3、TopoJSON、GSAP 與行政區 TopoJSON 來源。

## 瀏覽器與手機驗證

`.github/workflows/validate-history-ui.yml` 會用 Playwright + Chromium 實際操作歷史頁，而不是只做靜態 CSS 檢查。

目前驗證 viewport：

- Desktop：1440 × 900
- Mobile：390 × 844
- Mobile：360 × 800

驗證內容包含：

1. 2024 全台 22 個有結果縣市皆成功渲染。
2. 頁面不得產生水平 overflow。
3. 手機漢堡選單可開關，年份與主要操作按鈕具足夠觸控高度。
4. 縣市點擊後必須出現結果卡，且 2020／2024 只允許一個鄉鎮市區下探入口。
5. 下探轉場後鄉鎮市區地圖必須渲染，鄉鎮按鈕可點並能開啟票數結果。
6. CI 會保存桌面、390px 歷史頁與 390px 鄉鎮頁全頁截圖，供人工目視檢查。

這組瀏覽器驗證曾實際抓到重複產生「查看鄉鎮市區」按鈕的問題，因此 `scripts/patch-history-drilldown.mjs` 現在會先清除舊 block，再確保每次建置後只存在一個 canonical drilldown CTA。

## 資料驗證規則

`presidential-counties.json` 與 `presidential-towns.json` 只允許由 GitHub Actions 建置。

縣市層級每一屆都必須同時通過：

1. 完整產生現行 22 縣市，不可缺縣市或多出未知行政區。
2. 每一組候選人的 22 縣市得票加總，必須 **完全等於** `presidential.json` 的全國得票數。
3. 出現未知候選號、重複縣市／候選人彙總或來源層級判斷異常時，建置直接失敗。

鄉鎮市區層級 2020、2024 另外必須通過：

1. 完整產生 368 個鄉鎮市區。
2. 每一個縣市、每一組候選人的鄉鎮市區得票加總，必須 **完全等於** 該縣市的已驗證總票。

目前 1996、2000、2004、2008、2012、2016、2020、2024 八屆縣市層級，以及 2020、2024 鄉鎮市區層級皆已通過上述驗證。

## 建置

- `scripts/build-presidential-history.mjs`：1996–2016 縣市資料
- `scripts/append-modern-presidential-history.mjs`：2020、2024 縣市資料
- `scripts/build-modern-presidential-towns.mjs`：2020、2024 鄉鎮市區資料
- `scripts/patch-history-nav.mjs`：首頁歷年選舉入口
- `scripts/patch-history-drilldown.mjs`：歷史頁的縣市 → 鄉鎮市區入口，並保證 patch 冪等。
- `scripts/patch-history-product-ui.mjs`：將共用產品 UI 資產接入全台與鄉鎮頁。
- `scripts/validate-history-ui.mjs`：Playwright 桌機／手機互動驗證。
- `.github/workflows/build-presidential-history.yml`：下載來源、執行資料驗證並更新產出檔。
- `.github/workflows/validate-history-ui.yml`：實際 Chromium UI 驗證與截圖。

不要直接編輯產出的 JSON；若來源或轉換規則需要更新，修改建置腳本後由 workflow 重新產生。
