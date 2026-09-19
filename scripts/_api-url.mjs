import { readFileSync } from 'node:fs';
// 預設從 site-config.js 的 ELECTION_API_BASE 取得 API 網址；也可用環境變數 ELECTION_API_URL 覆寫。
export function overridesUrl() {
  if (process.env.ELECTION_API_URL) return process.env.ELECTION_API_URL;
  const src = readFileSync(new URL('../site-config.js', import.meta.url), 'utf8');
  const m = src.match(/ELECTION_API_BASE\s*=\s*'([^']*)'/);
  if (!m || !m[1]) throw new Error('請設定環境變數 ELECTION_API_URL（site-config.js 的 ELECTION_API_BASE 為空）');
  return `${m[1]}/?key=overrides`;
}
