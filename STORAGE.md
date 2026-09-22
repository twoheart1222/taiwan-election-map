# 候選人資料維護規則

## 哪一份才是目前資料？

前台及後台都透過同一個 API 讀取 `OverrideStore` 的完整紀錄。每次儲存會先原子更新紀錄及版本，再將整份快照寫入 KV `overrides`；KV 寫入成功才回報成功。Durable Object 用來依序處理更新，避免 KV 同時讀寫造成資料遺失。

KV `override:<代碼>` 是舊版留下的副本，新版不讀取、不寫入。保留它們供歷史比對，不要拿來還原或當作目前紀錄。`backup:overrides:before-unified-store` 是第一次遷移前的原始整包備份。照片、公告、資料來源、聯絡表單等其他 KV key 沿用既有功能。

`data/counties.json`、`data/towns/`、`data/villages/` 是尚未建立後台紀錄的基礎資料。已有後台紀錄的地區，以後台為準；修改 GitHub 基礎 JSON 不會覆蓋該地區的後台紀錄。要更新這些地區，請使用後台或版本化 API。

## 首次部署

1. 在同一個 checkout 執行 `npm ci`、`npm test`。
2. 執行 `npm run deploy:api`。此命令先產生遷移用基礎資料，部署 SQLite Durable Object binding 及 migration。
3. 開啟公開 API `https://api.formosaobservatory.com/?key=overrides`。第一次讀取會先備份 KV、檢查資料格式，再把既有紀錄與該次部署的基礎資料合併成完整快照。KV 不存在或 JSON 損壞時會停止，不會清空正式資料。
4. 執行 `npm run deploy:frontend`，重新整理後台。先前開啟的舊後台會因缺少版本而被拒絕儲存，需要重新載入。
5. 比對後台 GET `/api/admin/overrides`、公開 GET `/?key=overrides` 與 KV `overrides` 的 JSON。KV 跨地區的讀取仍可能有傳播延遲，前後台使用同一個 Durable Object 避免讀到不同快取。

請勿只部署前端：新版 API 和 `wrangler.api.toml` 必須一起部署。GitHub 建置若只負責前端，仍需另行執行 API 部署。

## 儲存語意

- `schemaVersion: 2` 是完整候選人快照。`null`、空字串、`0`、`false` 及空名單都保留原意，不會自動把清空或刪除的內容補回。
- 單筆 PUT/DELETE `/api/admin/overrides/<代碼>` 必須帶 `If-Match`，值為該紀錄 `_revision`。新增資料使用 `0`。
- 批次 PUT `/api/admin/overrides` 使用 `{ overrides: {代碼: 修改紀錄}, expectedRevisions: {代碼: 版本} }`。沒有列出的紀錄保留；版本檢查和整批修改一起成功或一起拒絕。
- `409` 代表其他編輯已更新資料；`428` 代表未提供版本。請先下載編輯備份，再重新載入比較，勿自動覆蓋。
- `503` 可能表示儲存或 KV 發布尚未完成。已提交的修改會保留，KV 發布會自動重試。重新載入確認版本後再操作；不要直接還原舊 KV。

## 批次整理資料

先從目前公開 API 匯出 JSON，保留 `_revision`，再以資料整理程式修改所需欄位：

```sh
node scripts/import-overrides.mjs edited-overrides.json
node scripts/import-overrides.mjs edited-overrides.json --apply
```

第一個命令只預覽。第二個命令需要環境變數 `ADMIN_TOKEN`；若 Cloudflare Access 的政策要求 service token，另設 `CF_ACCESS_CLIENT_ID` 和 `CF_ACCESS_CLIENT_SECRET`，並在 Access 配置適當政策。不要把權杖寫入 Git。

舊 `build:kv-bulk` 已停用，避免再次分別寫入 `overrides` 和 `override:*`。Firestore 工具僅供匯出歷史資料；不得直接拿舊資料覆蓋現在的 KV。

## 備份與復原

目前公開 API 可匯出完整候選人快照；KV 中也保有成功發布的快照。需要復原個別資料時，以目前 API 匯出檔的版本為基準，套入備份中欲復原的欄位，透過版本化 API 儲存。**不要回退到直接寫 KV 的舊版 API**，否則會產生另一套可寫資料來源。若一定要回退架構，必須先停止編輯、匯出最新 Durable Object 資料並完成獨立回退計畫。

Cloudflare 文件：[KV 寫入與一致性限制](https://developers.cloudflare.com/kv/api/write-key-value-pairs/)、[Durable Objects 儲存](https://developers.cloudflare.com/durable-objects/api/sqlite-storage-api/)。
