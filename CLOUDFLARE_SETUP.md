# Cloudflare 設定

候選人儲存流程已統一，請先閱讀 [STORAGE.md](./STORAGE.md)。

原先的直接寫入 KV、重建空 overrides、Firestore 整包覆蓋及 override:* 雙寫方式已停用。部署前須備份現有資料，使用版本化 API 維護。

API 使用 wrangler.api.toml；前端使用 wrangler.toml。Cloudflare Access、管理者白名單與照片／公告等 KV 設定沿用目前設定。

首次部署、驗證、批次更新與復原方法皆見 STORAGE.md。
