import { readFile } from 'node:fs/promises';
import { overridesUrl } from './_api-url.mjs';

// Read the authoritative snapshot for public builds; never write it to KV.
// An explicit snapshot also permits deterministic/offline builds and previews.
export async function publicBuildOverrides(args = process.argv.slice(2)) {
  const index = args.indexOf('--overrides');
  if (index !== -1) {
    if (!args[index + 1]) throw new Error('--overrides requires a snapshot path');
    return JSON.parse(await readFile(args[index + 1], 'utf8'));
  }
  const response = await fetch(overridesUrl(), { cache: 'no-store', signal: AbortSignal.timeout(30000) });
  if (!response.ok) throw new Error(`讀取公開後台快照失敗 ${response.status}；停止建置，避免產生過期資格資料。`);
  const snapshot = await response.json();
  if (!snapshot || typeof snapshot !== 'object' || Array.isArray(snapshot) || !Object.keys(snapshot).length) throw new Error('公開後台快照不是有效的地區資料');
  return snapshot;
}
