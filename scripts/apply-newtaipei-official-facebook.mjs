import { readFile, writeFile } from 'node:fs/promises';

const countyId = '65000';
const countiesPath = new URL('../data/counties.json', import.meta.url);
const officialPath = new URL('../data/ntp_councilors.json', import.meta.url);

const topo = JSON.parse(await readFile(countiesPath, 'utf8'));
const official = JSON.parse(await readFile(officialPath, 'utf8'));
const geometries = topo?.objects?.map?.geometries || [];
const county = geometries.find(g => String(g?.properties?.id) === countyId);
if (!county) throw new Error(`找不到新北市 countyId=${countyId}`);

const officialByName = new Map(
  (official?.councilors || [])
    .filter(c => c?.name && /^https:\/\/(www\.)?facebook\.com\//i.test(c?.officialFacebook || ''))
    .map(c => [String(c.name).replace(/[\s\u3000]/g, ''), c.officialFacebook])
);

let matched = 0;
let filled = 0;
let alreadySame = 0;
let conflicts = 0;
const conflictRows = [];
const notFound = new Set(officialByName.keys());

const blocks = county.properties?.councilors?.blocks || county.properties?.councilors || [];
for (const block of blocks) {
  for (const cand of block?.candidates || []) {
    const cleanName = String(cand?.name || '').replace(/[\s\u3000]/g, '');
    const fb = officialByName.get(cleanName);
    if (!fb) continue;
    matched += 1;
    notFound.delete(cleanName);
    const current = String(cand.facebook || '').trim();
    if (!current) {
      cand.facebook = fb;
      filled += 1;
    } else if (current === fb) {
      alreadySame += 1;
    } else {
      conflicts += 1;
      conflictRows.push({ name: cand.name, current, official: fb });
    }
  }
}

if (conflicts > 0) {
  console.error(JSON.stringify({ conflicts, conflictRows }, null, 2));
  throw new Error('安全中止：發現既有 Facebook 與新北市議會官方資料衝突，不自動覆蓋。');
}

if (matched < 20) {
  throw new Error(`安全中止：只比對到 ${matched} 位官方 Facebook，低於安全門檻 20。`);
}

await writeFile(countiesPath, `${JSON.stringify(topo)}\n`, 'utf8');
console.log(JSON.stringify({ countyId, officialFacebookLinks: officialByName.size, matched, filled, alreadySame, conflicts, officialNamesNotInWebsiteRoster: [...notFound] }, null, 2));
