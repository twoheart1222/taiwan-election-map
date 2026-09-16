# Cloudflare Worker + KV 設定

這個版本已移除後台對 Firebase Auth / Firestore 的依賴。資料讀寫改由 Cloudflare Worker 代理，資料存放在 Cloudflare KV。

## 1. 建立 KV namespace

```bash
npx wrangler kv namespace create ELECTION_KV
npx wrangler kv namespace create ELECTION_KV --preview
```

將輸出的 production `id` 與 preview `preview_id` 填入 `wrangler.api.toml`：

```toml
[[kv_namespaces]]
binding = "ELECTION_KV"
id = "你的 production namespace id"
preview_id = "你的 preview namespace id"
```

## 2. 匯入初始資料

至少先寫入 `election_summary`，讓既有公開 API 可讀：

```bash
npx wrangler kv key put election_summary --binding ELECTION_KV --path ./data/election_summary.json --config wrangler.api.toml
```

後台覆寫資料使用 `overrides` 這個 key。第一次可以放一個空物件：

```bash
echo {} > overrides.json
npx wrangler kv key put overrides --binding ELECTION_KV --path ./overrides.json --config wrangler.api.toml
```

如果你在 Windows PowerShell：

```powershell
'{}' | Set-Content -Encoding UTF8 overrides.json
npx wrangler kv key put overrides --binding ELECTION_KV --path .\overrides.json --config wrangler.api.toml
```

## 3. 設定管理者驗證

建議正式環境使用 Cloudflare Access：

目前正式環境已完成以下設定：

1. Cloudflare Zero Trust Free 已啟用。
2. Access application 保護 `https://election-api.uprisevideoproduction.workers.dev/api/admin/*`。
3. Policy `Taiwan Election Admin` 只允許 `Uprisevideoproduction@gmail.com`。
4. `wrangler.api.toml` 的 `ENABLE_CF_ACCESS_AUTH` 已設為 `"true"`。
5. Worker 的 `ADMIN_EMAILS` 也限制為相同信箱，作為第二層檢查。

```bash
npx wrangler secret put ADMIN_EMAILS
```

多個信箱用逗號分隔，例如：

```text
you@example.com,editor@example.com
```

開發或緊急維護時也可以另外設定管理權杖：

```bash
npx wrangler secret put ADMIN_TOKEN
```

部署後開啟 `admin.html`，在登入畫面輸入這個權杖即可維護資料。

## 4. 部署 API Worker

```bash
npm install
npm run deploy:api
```

根目錄的 `wrangler.toml` 僅部署前端靜態資產；API 必須使用 `wrangler.api.toml`。這可避免 GitHub 自動建置把 API Worker 覆蓋到前端服務。

部署後確認公開 API：

```bash
curl "https://election-api.uprisevideoproduction.workers.dev/?key=election_summary"
```

確認後台 API：

```bash
curl "https://election-api.uprisevideoproduction.workers.dev/api/admin/me" ^
  -H "Authorization: Bearer 你的_ADMIN_TOKEN"
```

PowerShell：

```powershell
Invoke-WebRequest `
  -Uri "https://election-api.uprisevideoproduction.workers.dev/api/admin/me" `
  -Headers @{ Authorization = "Bearer 你的_ADMIN_TOKEN" }
```

## 5. 後台維護流程

1. 開啟 `admin.html`。
2. 點擊「使用 Cloudflare Access 登入」，以允許的 Google 帳號完成驗證。
3. 選擇縣市、鄉鎮或村里。
4. 修改候選人資料。
5. 點擊「儲存修改（寫入 Cloudflare KV）」。

後台會寫入：

- `overrides`: 全部覆寫資料的索引物件。
- `override:{行政區代碼}`: 單一行政區覆寫資料，方便日後除錯或拆分。

## 6. 搬移舊 Firestore 圖片資料

舊 Firestore 的 `overrides` 已在 2026-09-16 搬入 Cloudflare KV，共 665 筆文件、443 個圖片網址。圖片欄位保存的是議會網站與 Wikimedia 等外部網址，並不是 Firebase Storage 檔案。

需要重新匯入時，在 PowerShell 執行：

```powershell
$env:FIREBASE_API_KEY = "你的 Firebase Web API Key"
node scripts/migrate-firestore-overrides.mjs .\firestore-overrides.json
npx wrangler kv key put overrides `
  --namespace-id f667c7a8748e48089998150bf83ce550 `
  --path .\firestore-overrides.json `
  --remote
Remove-Item Env:FIREBASE_API_KEY
```

匯出檔 `firestore-overrides.json` 已加入 `.gitignore`，避免把舊資料誤提交到 GitHub。

## 7. 完全停用 Firebase 前檢查

確認以下指令不再找到 Firebase SDK 或 Firestore 程式碼：

```bash
rg -n "firebase|firestore|firebaseapp|gstatic.com/firebasejs" admin.html worker.js wrangler.api.toml
```

確認 admin 儲存成功後，就可以停用 Firebase Auth / Firestore。

## 8. 同步全台現任議員

同步工具會讀取內政部「直轄市議員」與「縣市議員」名冊，依縣市、姓名及官方選舉區比對候選人。現任議員會更新官方照片、黨籍並設為 `isIncumbent: true`；名冊沒有的人會設為 `false`。

```powershell
npm install
npm run sync:councilors -- ..\councilor-sync
npm run build:kv-bulk -- `
  ..\councilor-sync\overrides-with-incumbents.json `
  ..\councilor-sync\kv-bulk.json
```

先確認 `sync-report.json` 的 `unmatchedOfficialCount` 與 `duplicateCandidateCount` 都是 `0`，再更新 KV：

```powershell
npx wrangler kv bulk put ..\councilor-sync\kv-bulk.json `
  --namespace-id f667c7a8748e48089998150bf83ce550 `
  --remote
npx wrangler kv key put overrides `
  --namespace-id f667c7a8748e48089998150bf83ce550 `
  --path ..\councilor-sync\overrides-with-incumbents.json `
  --remote
```

`overrides-backup.json` 是同步前備份。系統依管理需求將所有現任議員顯示為「爭取連任」；這個標示不代表已逐一確認本人正式登記或宣布參選。
