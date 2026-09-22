# 歷年總統副總統選舉資料

這個資料夾保存 Formosa Observatory｜島民觀察室的歷史總統副總統選舉資料。歷史資料與 2026 現行候選人／Cloudflare KV override 分離，避免歷屆資料更新覆蓋現行選舉資料。

## 資料檔

- `presidential.json`：1996、2000、2004、2008、2012、2016、2020、2024 八屆全國結果與候選人 metadata。
- `presidential-counties.json`：八屆皆正規化為現行 22 縣市，可做一致的跨屆縣市比較。
- `presidential-towns.json`：2020、2024 鄉鎮市區結果，兩屆皆完整 368 個鄉鎮市區。

## 資料來源

- 全國結果：中央選舉委員會選舉資料庫。
- 1996–2016：`MISNUK/CECDataSet` 保存的中選會原始格式 `VoteRecords.csv`。
- 2020：`everdark/TW_Presidential_Election_2020` release 0.4，縣市使用 `presidential_counties.csv`，鄉鎮市區使用 `presidential_regions.csv`。
- 2024：`kiang/db.cec.gov.tw` 的中選會 `elbase.csv` / `elctks.csv` 鏡像；鄉鎮市區由投開票所逐筆加總。
- 鄉鎮界線：`taiwan-atlas` 內政部行政區界線衍生 TopoJSON。

## 歷史行政區正規化

跨屆縣市比較採現行 22 縣市一致基準：

- 臺北縣 → 新北市
- 桃園縣 → 桃園市
- 2010 合併前臺中縣＋臺中市 → 臺中市
- 臺南縣＋臺南市 → 臺南市
- 高雄縣＋高雄市 → 高雄市

這個正規化適合做跨屆版圖與數值比較，但不代表當年行政區界線。1996–2016 目前只提供縣市層級；2020、2024 才提供鄉鎮市區下探。

## UI 查詢架構

`/history/` 參考中選會選舉資料庫的查詢邏輯，但保留島民觀察室的黑／紅產品視覺。核心原則是「先選條件，再看資料」，避免把年份、比較器、地圖與結果同時平鋪。

### 單屆結果

使用者依序選擇：

1. 選舉類型：目前為總統副總統。
2. 查詢模式：單屆結果。
3. 選舉年份：八屆任選。
4. 資料層級：全國／縣市。
5. 地區：縣市層級時可直接選擇 22 縣市。

地圖與地區 select 共用同一份縣市結果；點擊地圖會同步地區層級與結果卡。2020、2024 可再下探鄉鎮市區。

### 跨屆比較

切換成跨屆比較後，單屆的年份／層級／地區控制會收起，只顯示比較所需控制：

- A 年份
- B 年份
- `⇄` 交換方向
- 地圖圖層

A、B 可自由選擇八屆中的任兩個不同年份，B 年份同時作為右側全國候選人結果的基準年份。URL 保存 `compareA`、`compareB` 與 `mode=compare`。

目前有三種比較圖層：

1. **勝方版圖**：B 年份縣市勝方政黨色；若相較 A 年份勝方政黨改變，以金色外框標示。
2. **得票率變化**：可選 DPP 或 KMT，顯示 B − A 的縣市得票率百分點變化。使用中性灰階發散色，不用對手政黨色暗示數值方向。
3. **藍綠 Swing**：`(DPP 得票率 − KMT 得票率) B − (DPP 得票率 − KMT 得票率) A`。負值使用 KMT 藍方向、正值使用 DPP 綠方向；只代表數值方向，不加入政治評價。

如果年份組合缺少完整 DPP/KMT 雙方資料，Swing 顯示 `—`，不硬套公式。

## 當選樣式

歷史頁 `elected=true` 與主站後台勾選「當選」後的前台視覺保持一致：米白候選人卡、深色文字、紅色重點、20px 圓角、陰影，以及傾斜的紅色「當選 / ELECTED」圓章。這是語意狀態，不依桌機／手機尺寸改成另一套樣式。

## 手機地圖

660px 以下改用獨立 mobile SVG：

- 臺灣本島使用主要投影，放大閱讀比例。
- 澎湖縣、金門縣、連江縣各自放在 inset box。
- 仍保留完整 22 縣市可點擊與比較圖層狀態。

## 建置與硬性驗證

縣市層級：

1. 每屆必須完整產生現行 22 縣市。
2. 每一組候選人的 22 縣市票數加總，必須完全等於全國得票數。

鄉鎮市區層級（2020、2024）：

1. 每屆必須完整產生 368 個鄉鎮市區。
2. 每一縣市、每一組候選人的鄉鎮票數加總，必須完全等於該縣市總票。

任何驗證不一致，workflow 直接失敗，不寫入網站資料。

## 自動化腳本

- `scripts/build-presidential-history.mjs`：建置與驗證 1996–2016 縣市結果。
- `scripts/append-modern-presidential-history.mjs`：接入並驗證 2020、2024 縣市結果。
- `scripts/build-modern-presidential-towns.mjs`：建置並驗證 2020、2024 鄉鎮市區結果。
- `scripts/patch-history-nav.mjs`：主站 desktop/mobile 歷年選舉入口。
- `scripts/patch-history-drilldown.mjs`：縣市 → 鄉鎮市區入口。
- `scripts/patch-history-product-ui.mjs`：接入 history product UI 與 enhancement assets。
- `scripts/validate-history-ui.mjs`：Chromium desktop/mobile regression。

## Chromium regression guard

目前實際測試 1440×900、390×844、360×800，包含：

- 單屆查詢的 8 個年份、全國／縣市層級與 22 縣市 select。
- 桌機 22 縣市與手機 22 縣市＋3 離島 inset。
- A/B 各 8 個年份、同年份防呆、交換方向。
- 勝方版圖／得票率變化／Swing 三種圖層與圖例。
- 主站同款 elected 視覺。
- 無水平 overflow。
- 手機查詢／比較控制觸控尺寸。
- 臺北市唯一鄉鎮下探 CTA 與 12 區互動。

這套 UI regression 的目的不是只驗 CSS 存在，而是實際操作「單屆 → 縣市 → 跨屆 → 圖層切換 → 回單屆 → 鄉鎮下探」完整流程。

## 後續方向

- 1996–2016 歷史鄉鎮名稱／邊界正規化。
- 加入「當年行政區界線」模式，與現行 22 縣市比較模式分離。
- 以同一套查詢架構擴充立委、縣市長等歷屆選舉類型。
