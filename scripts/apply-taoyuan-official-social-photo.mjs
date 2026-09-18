import { readFile, writeFile } from 'node:fs/promises';

const COUNTY_ID = '68000';
const FILE = new URL('../data/counties.json', import.meta.url);
const SOURCE = new URL('../data/tycc_councilors.json', import.meta.url);

const clean = v => String(v ?? '').trim();
const normalizeUrl = v => clean(v).replace(/^http:\/\//i, 'https://').replace(/\\/g, '/');

const topo = JSON.parse(await readFile(FILE, 'utf8'));
const source = JSON.parse(await readFile(SOURCE, 'utf8'));
const geos = topo?.objects?.map?.geometries;
if (!Array.isArray(geos)) throw new Error('找不到 topo.objects.map.geometries');
const county = geos.find(g => String(g?.properties?.id) === COUNTY_ID);
if (!county) throw new Error(`找不到桃園市 ${COUNTY_ID}`);

const blocks = Array.isArray(county.properties?.councilors?.blocks)
  ? county.properties.councilors.blocks
  : Array.isArray(county.properties?.councilors)
    ? county.properties.councilors
    : [];

const byName = new Map();
for (const row of source) {
  const name = clean(row?.name);
  if (!name) continue;
  const facebook = normalizeUrl(row?.facebook);
  const photoUrl = normalizeUrl(row?.photoUrl);
  // 僅收可用的社群/圖片欄位；來源中「行政單位 / FAQ / 介紹」不會匹配候選人姓名。
  if (!facebook && !photoUrl) continue;
  byName.set(name, { facebook, photoUrl, detailUrl: clean(row?.detailUrl) });
}

const stats = {
  totalCandidates: 0,
  matchedOfficialNames: 0,
  facebookFilled: 0,
  photoFilled: 0,
  facebookAlreadyPresent: 0,
  photoAlreadyPresent: 0,
  matchedNames: [],
};

for (const block of blocks) {
  for (const candidate of block?.candidates || []) {
    stats.totalCandidates += 1;
    const src = byName.get(clean(candidate?.name));
    if (!src) continue;
    stats.matchedOfficialNames += 1;
    stats.matchedNames.push(candidate.name);

    if (src.facebook) {
      if (!clean(candidate.facebook)) {
        candidate.facebook = src.facebook;
        stats.facebookFilled += 1;
      } else {
        stats.facebookAlreadyPresent += 1;
      }
    }

    if (src.photoUrl) {
      if (!clean(candidate.photoUrl)) {
        candidate.photoUrl = src.photoUrl;
        stats.photoFilled += 1;
      } else {
        stats.photoAlreadyPresent += 1;
      }
    }
  }
}

await writeFile(FILE, `${JSON.stringify(topo)}\n`, 'utf8');
console.log(JSON.stringify(stats, null, 2));
