import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { overridesUrl } from './_api-url.mjs';
import { existsSync } from 'node:fs';
import path from 'node:path';
import { load } from 'cheerio';

const SOURCE_URL = 'https://www.moi.gov.tw/LocalOfficial.aspx?n=577&sms=11395&TYP=KND0007';
const API_URL = overridesUrl();
const PAGE_SIZE = 200;
const PLACEHOLDER_PHOTOS = new Set([
  'https://ws.moi.gov.tw/001/Upload/400/relpic/8999/2352/a923fbd9-30da-44ba-90c4-ae26fc10d863.png',
]);
const outputDirectory = path.resolve(process.argv[2] || '../moi-village-sync');
const dryRun = process.argv.includes('--dry-run');

function cleanText(value) {
  return String(value || '').replace(/[\s\u3000]+/g, '').trim();
}

function normalizeText(value) {
  return cleanText(value).replaceAll('台', '臺').replace(/[·‧・]/g, '');
}

function usablePhoto(value) {
  return value && !PLACEHOLDER_PHOTOS.has(value) ? value : '';
}

async function fetchText(url, attempt = 1) {
  const response = await fetch(url, {
    headers: { 'User-Agent': 'taiwan-election-map village-chief sync/1.0' },
  });
  if (response.ok) return response.text();
  if (attempt < 4) {
    await new Promise((resolve) => setTimeout(resolve, attempt * 800));
    return fetchText(url, attempt + 1);
  }
  throw new Error(`Request failed (${response.status}): ${url}`);
}

async function mapLimit(items, limit, callback) {
  const results = new Array(items.length);
  let cursor = 0;
  async function worker() {
    while (cursor < items.length) {
      const index = cursor++;
      results[index] = await callback(items[index], index);
    }
  }
  await Promise.all(Array.from({ length: Math.min(limit, items.length) }, worker));
  return results;
}

function parseOfficials(html) {
  const $ = load(html);
  const records = [];
  $('.serv-group .result-list .block').each((_, element) => {
    const block = $(element);
    const spans = block.find('.essay .position span');
    const name = cleanText(block.find('.essay .caption span').first().text());
    const place = cleanText(spans.first().text());
    const role = cleanText(spans.last().text());
    const photoUrl = block.find('.img img').attr('src') || '';
    if (!name || !place || role !== '里長' && role !== '村長') return;
    records.push({
      name,
      place,
      county: cleanText(block.find('.essay .locate span').first().text()).replaceAll('台', '臺'),
      party: cleanText(block.find('.essay .group span').first().text()),
      photoUrl: usablePhoto(photoUrl ? new URL(photoUrl, SOURCE_URL).href : ''),
      detailUrl: new URL(block.find('.more-btn a').attr('href') || '/', SOURCE_URL).href,
    });
  });
  return records;
}

async function scrapeOfficials() {
  const firstUrl = `${SOURCE_URL}&page=1&PageSize=${PAGE_SIZE}`;
  const firstHtml = await fetchText(firstUrl);
  const $ = load(firstHtml);
  const pages = Math.max(1, ...$('a[href*="page="]').map((_, link) => {
    const href = $(link).attr('href') || '';
    return Number(new URL(href, SOURCE_URL).searchParams.get('page')) || 1;
  }).get());
  const rest = await mapLimit(Array.from({ length: pages - 1 }, (_, index) => index + 2), 4, async (page) => {
    const html = await fetchText(`${SOURCE_URL}&page=${page}&PageSize=${PAGE_SIZE}`);
    process.stdout.write(`\rDownloaded MOI pages ${page}/${pages}`);
    return parseOfficials(html);
  });
  process.stdout.write('\n');
  return {
    records: [...parseOfficials(firstHtml), ...rest.flat()],
    pages,
    updatedAt: cleanText($('.update-time .ct span').last().text()),
  };
}

function geometries(topology) {
  const key = Object.keys(topology.objects)[0];
  return topology.objects[key].geometries;
}

const countiesTopology = JSON.parse(await readFile('data/counties.json', 'utf8'));
const targets = [];
const villageById = new Map();

for (const county of geometries(countiesTopology)) {
  const countyId = county.properties.id;
  const countyName = county.properties.name;
  const townsPath = `data/towns/towns-${countyId}.json`;
  if (!existsSync(townsPath)) continue;
  const townsTopology = JSON.parse(await readFile(townsPath, 'utf8'));
  for (const town of geometries(townsTopology)) {
    const villagePath = `data/villages/villages-${town.properties.id}.json`;
    if (!existsSync(villagePath)) continue;
    const topology = JSON.parse(await readFile(villagePath, 'utf8'));
    let changed = false;
    for (const village of geometries(topology)) {
      const meta = {
        county: countyName,
        town: town.properties.name,
        village: village.properties.name,
        villageId: village.properties.id,
        place: `${countyName}${town.properties.name}${village.properties.name}`,
        candidates: village.properties.candidates || [],
      };
      villageById.set(String(meta.villageId), meta);
      for (const candidate of meta.candidates) {
        targets.push({ candidate, meta, topology, villagePath, markChanged: () => { changed = true; } });
      }
    }
  }
}

const scraped = await scrapeOfficials();
const officials = new Map();
for (const record of scraped.records) {
  const key = `${normalizeText(record.place)}|${normalizeText(record.name)}`;
  if (!officials.has(key)) officials.set(key, record);
}

const overrides = JSON.parse(await fetchText(API_URL));
const originalOverrides = structuredClone(overrides);
const changedTopologies = new Map();
const countyStats = new Map();
const matchedKeys = new Set();

function statsFor(county) {
  if (!countyStats.has(county)) countyStats.set(county, { candidates: 0, incumbents: 0, photosAvailable: 0, photosAdded: 0, overrideIncumbents: 0, overridePhotosAvailable: 0, overridePhotosAdded: 0 });
  return countyStats.get(county);
}

for (const target of targets) {
  const { candidate, meta } = target;
  const stats = statsFor(meta.county);
  stats.candidates += 1;
  if (PLACEHOLDER_PHOTOS.has(candidate.photoUrl)) {
    candidate.photoUrl = null;
    target.markChanged();
    changedTopologies.set(target.villagePath, target.topology);
  }
  const key = `${normalizeText(meta.place)}|${normalizeText(candidate.name)}`;
  const official = officials.get(key);
  const wasIncumbent = Boolean(candidate.isIncumbent);
  candidate.isIncumbent = Boolean(official);
  if (candidate.isIncumbent !== wasIncumbent) {
    target.markChanged();
    changedTopologies.set(target.villagePath, target.topology);
  }
  if (!official) continue;
  matchedKeys.add(key);
  stats.incumbents += 1;
  if (!candidate.photoUrl && official.photoUrl) {
    candidate.photoUrl = official.photoUrl;
    stats.photosAdded += 1;
    target.markChanged();
    changedTopologies.set(target.villagePath, target.topology);
  }
  if (candidate.photoUrl) stats.photosAvailable += 1;
}

for (const [villageId, document] of Object.entries(overrides)) {
  const meta = villageById.get(String(villageId));
  if (!meta || !Array.isArray(document?.candidates)) continue;
  const stats = statsFor(meta.county);
  for (const candidate of document.candidates) {
    if (PLACEHOLDER_PHOTOS.has(candidate.photoUrl)) candidate.photoUrl = null;
    const key = `${normalizeText(meta.place)}|${normalizeText(candidate.name)}`;
    const official = officials.get(key);
    candidate.isIncumbent = Boolean(official);
    if (!official) continue;
    stats.overrideIncumbents += 1;
    if (!candidate.photoUrl && official.photoUrl) {
      candidate.photoUrl = official.photoUrl;
      stats.overridePhotosAdded += 1;
    }
    if (candidate.photoUrl) stats.overridePhotosAvailable += 1;
  }
}

const sourceStats = new Map();
for (const record of scraped.records) sourceStats.set(record.county, (sourceStats.get(record.county) || 0) + 1);
const report = {
  sourceUrl: SOURCE_URL,
  sourceUpdatedAt: scraped.updatedAt,
  syncedAt: new Date().toISOString(),
  sourceRecords: scraped.records.length,
  sourcePages: scraped.pages,
  siteCandidates: targets.length,
  matchedCandidates: matchedKeys.size,
  changedVillageFiles: changedTopologies.size,
  changedOverrides: JSON.stringify(overrides) !== JSON.stringify(originalOverrides),
  counties: [...countyStats].map(([county, stats]) => ({ county, sourceOfficials: sourceStats.get(county) || 0, ...stats })),
};

await mkdir(outputDirectory, { recursive: true });
await writeFile(path.join(outputDirectory, 'report.json'), `${JSON.stringify(report, null, 2)}\n`, 'utf8');
await writeFile(path.join(outputDirectory, 'overrides.json'), `${JSON.stringify(overrides)}\n`, 'utf8');

if (!dryRun) {
  for (const [file, topology] of changedTopologies) {
    await writeFile(file, `${JSON.stringify(topology)}\n`, 'utf8');
  }
  await writeFile('data/moi_village_chiefs.json', `${JSON.stringify({
    sourceUrl: SOURCE_URL,
    sourceUpdatedAt: scraped.updatedAt,
    syncedAt: report.syncedAt,
    sourceRecords: report.sourceRecords,
    matchedCandidates: report.matchedCandidates,
    counties: report.counties,
  }, null, 2)}\n`, 'utf8');
}

console.log(JSON.stringify(report, null, 2));
if (dryRun) console.log('Dry run: repository files were not changed.');
