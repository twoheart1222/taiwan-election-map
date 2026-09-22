# 儲存架構（Codex、Claude 與其他維護工具共用）

- 修改資料前先讀 `STORAGE.md`。候選人資料只有一個可寫入口：Worker 的版本化 `/api/admin/overrides` API。
- 不可直接覆蓋正式 KV `overrides`，不可恢復 `override:*` 雙寫；KV 是由 `OverrideStore` 發布的快照。
- 前台、搜尋、後台的合併規則放在 `election-data.js`，不要各自新增回填邏輯。完整快照的空值、零值、false、刪除都必須保留。
- GitHub 基礎 JSON 不會自動覆蓋已建立的後台紀錄。批次更新使用 `scripts/import-overrides.mjs`，保留原始 `_revision`。
- 修改儲存路徑需執行 `npm test`。API 部署使用 `npm run deploy:api`，前端使用 `npm run deploy:frontend`。
