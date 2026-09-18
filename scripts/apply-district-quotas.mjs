import { readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const overridesPath = path.join(root, 'overrides_deploy.json');
const quotasPath = path.join(root, 'data', 'district_quota.json');

const [overridesText, quotasText] = await Promise.all([
  readFile(overridesPath, 'utf8'),
  readFile(quotasPath, 'utf8'),
]);
const overrides = JSON.parse(overridesText);
const quotas = JSON.parse(quotasText);
const missing = [];
let updated = 0;

for (const [countyCode, document] of Object.entries(overrides)) {
  // Every county/city chief election elects one person. This is used by the
  // county-level drawer before a council district is selected.
  if (Array.isArray(document.candidates) && document.candidates.length) document.quota = '1 席';
  for (const block of document.councilors || []) {
    const seats = quotas[countyCode]?.[String(block.district)];
    if (!Number.isInteger(seats) || seats < 1) {
      missing.push(`${countyCode} 第 ${block.district} 選舉區`);
      continue;
    }
    const quota = `${seats} 席`;
    if (block.quota !== quota) { block.quota = quota; updated += 1; }
  }
}

if (missing.length) throw new Error(`安全中止：缺少應選席次：${missing.join('、')}`);
await writeFile(overridesPath, `${JSON.stringify(overrides)}\n`);
console.log(JSON.stringify({ councilDistrictsUpdated: updated, source: 'data/district_quota.json' }, null, 2));
