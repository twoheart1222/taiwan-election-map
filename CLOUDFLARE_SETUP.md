# Cloudflare 設定

候選人儲存流程已統一，請先閱讀 [STORAGE.md](./STORAGE.md)。

原先的直接寫入 KV、重建空 overrides、Firestore 整包覆蓋及 override:* 雙寫方式已停用。部署前須備份現有資料，使用版本化 API 維護。

API 使用 wrangler.api.toml；前端使用 wrangler.toml。Cloudflare Access、管理者白名單與照片／公告等 KV 設定沿用目前設定。

首次部署、驗證、批次更新與復原方法皆見 STORAGE.md。

## Git 自動部署設定

前端 Worker `taiwan-election-map` 的 Workers Builds 設定：

- Build command：`npm run build:frontend`
- Deploy command：`npx wrangler deploy`
- Root directory：`/`

建置會產生 `wrangler.toml` 指定的 `.public-deploy`。直接執行 `npx wrangler deploy` 不會觸發 npm 的 `predeploy:frontend`，因此不可省略上述 Build command。手動部署仍可使用 `npm run deploy:frontend`。

`manual-site-sync.yml` 在重建搜尋與公開頁面後會提交產物；提交訊息不可加上 `[skip ci]`，否則 Cloudflare 會略過正式網站部署。
