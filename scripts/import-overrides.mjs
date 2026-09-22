import { readFile } from 'node:fs/promises';
import { overridesUrl } from './_api-url.mjs';

const path = process.argv[2];
if (!path) throw new Error('Usage: node scripts/import-overrides.mjs <overrides.json> [--apply]');
const desired = JSON.parse(await readFile(path, 'utf8'));
const base = new URL(overridesUrl()).origin;
const response = await fetch(`${base}/?key=overrides`, { cache: 'no-store' });
if (!response.ok) throw new Error(`讀取失敗：${response.status}`);
const current = await response.json();
const changes = {}, expectedRevisions = {};
const comparable = value => JSON.stringify(value, (key, item) => ['_revision', 'updatedAt', 'updatedBy'].includes(key) ? undefined : item);
for (const [code, value] of Object.entries(desired)) {
  if (comparable(value) === comparable(current[code])) continue;
  if (current[code] && value?._revision !== current[code]._revision) {
    throw new Error(`${code} 缺少目前版本或已過期。請重新匯出公開 API 資料，再套用修改；勿直接覆蓋 KV。`);
  }
  changes[code] = { ...value, schemaVersion: 2 };
  expectedRevisions[code] = current[code]?._revision || '0';
}
console.log(JSON.stringify({ mode: process.argv.includes('--apply') ? 'apply' : 'preview', changedCodes: Object.keys(changes) }, null, 2));
if (process.argv.includes('--apply') && Object.keys(changes).length) {
  if (!process.env.ADMIN_TOKEN) throw new Error('請透過環境變數 ADMIN_TOKEN 提供管理權杖。');
  const headers = { 'Content-Type': 'application/json', Authorization: `Bearer ${process.env.ADMIN_TOKEN}` };
  if (process.env.CF_ACCESS_CLIENT_ID && process.env.CF_ACCESS_CLIENT_SECRET) {
    headers['CF-Access-Client-Id'] = process.env.CF_ACCESS_CLIENT_ID;
    headers['CF-Access-Client-Secret'] = process.env.CF_ACCESS_CLIENT_SECRET;
  }
  const result = await fetch(`${base}/api/admin/overrides`, {
    method: 'PUT', headers, body: JSON.stringify({ overrides: changes, expectedRevisions }),
  });
  const body = await result.json();
  if (!result.ok) throw new Error(body.error || `儲存失敗：${result.status}`);
  console.log(`已同步 ${Object.keys(body.overrides).length} 筆資料至後台與 KV。`);
}
