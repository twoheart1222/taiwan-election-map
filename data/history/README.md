# 歷年總統選舉資料

這個目錄只存放歷史選舉快照，與 2026 候選人資料、後台 override、Cloudflare KV 完全分離。

## 檔案

- `presidential.json`：1996–2024 八屆總統副總統選舉的全國結果、候選組合與投票率。
- `presidential-counties.json`：八屆各 22 縣市的候選組合票數、得票率、勝方與勝差，由建置腳本產生，不手動修改。

## 資料來源

主要來源皆回到中央選舉委員會選舉資料：

- 1996–2016：`MISNUK/CECDataSet` 整理的中選會原始格式 `VoteRecords.csv`。
- 2020：`everdark/TW_Presidential_Election_2020` release 0.4 的 `presidential_counties.csv`，由中選會原始 Excel 處理而成。
- 2024：`kiang/db.cec.gov.tw` 保存的中選會原始格式 `elbase.csv`、`elctks.csv`。

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

## 驗證規則

`presidential-counties.json` 只允許由 GitHub Actions 建置。每一屆都必須同時通過：

1. 完整產生現行 22 縣市，不可缺縣市或多出未知行政區。
2. 每一組候選人的 22 縣市得票加總，必須 **完全等於** `presidential.json` 的全國得票數。
3. 出現未知候選號、重複縣市／候選人彙總或來源層級判斷異常時，建置直接失敗。

目前 1996、2000、2004、2008、2012、2016、2020、2024 八屆皆已通過上述驗證。

## 建置

- `scripts/build-presidential-history.mjs`：1996–2016
- `scripts/append-modern-presidential-history.mjs`：2020、2024
- `.github/workflows/build-presidential-history.yml`：下載來源、執行驗證並更新產出檔

不要直接編輯 `presidential-counties.json`；若來源或轉換規則需要更新，修改建置腳本後由 workflow 重新產生。
