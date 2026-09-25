import { readdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const dataDir = path.join(root, 'data');

async function readTopo(file) {
  const document = JSON.parse(await readFile(file, 'utf8'));
  const object = Object.values(document.objects || {})[0];
  return object?.geometries?.map(item => item.properties || {}) || [];
}

async function jsonFiles(directory) {
  return (await readdir(directory))
    .filter(file => file.endsWith('.json'))
    .sort()
    .map(file => path.join(directory, file));
}

const countyProperties = await readTopo(path.join(dataDir, 'counties.json'));
const townFiles = await jsonFiles(path.join(dataDir, 'towns'));
const villageFiles = await jsonFiles(path.join(dataDir, 'villages'));
const townProperties = (await Promise.all(townFiles.map(readTopo))).flat();
const villageProperties = (await Promise.all(villageFiles.map(readTopo))).flat();
const allAreas = [...countyProperties, ...townProperties, ...villageProperties];

const countyNames = new Map(countyProperties.map(area => [String(area.id), area.name]));
const townNames = new Map(townProperties.map(area => [String(area.id), area.name]));
const areas = {};
const candidates = [];

function publicCandidate(candidate, context, district = null, source = 'candidates') {
  if (!candidate?.name) return;

  candidates.push({
    name: candidate.name,
    party: candidate.party || '',
    role: candidate.role || '',
    photoUrl: candidate.photoUrl || null,
    gazetteUrl: candidate.gazetteUrl || null,
    taiwanGoGoUrl: candidate.taiwanGoGoUrl || null,
    local2026Url: candidate.local2026Url || null,
    facebook: candidate.facebook || null,
    instagram: candidate.instagram || null,
    threads: candidate.threads || null,
    youtube: candidate.youtube || null,

    // 選舉資料欄位：不能在建立搜尋索引時遺失
    votes: candidate.votes ?? null,
    prevVotes: candidate.prevVotes ?? null,
    elected: Boolean(candidate.elected),

    isIncumbent: Boolean(candidate.isIncumbent),
    district,
    source,
    ...context,
  });
}

for (const area of allAreas) {
  const areaId = String(area.id || '');
  if (!areaId) continue;

  const countyCode = areaId.slice(0, 5);
  const townCode = areaId.length >= 8 ? areaId.slice(0, 8) : null;

  const context = {
    areaId,
    countyCode,
    county: countyNames.get(countyCode) || '',
    town: townCode ? (townNames.get(townCode) || '') : '',
    village: areaId.length > 8 ? (area.name || '') : '',
  };

  areas[areaId] = {
    ...context,
    areaName: area.name || '',
  };

  for (const candidate of area.candidates || []) {
    publicCandidate(candidate, context);
  }

  for (const block of area.councilors || []) {
    for (const candidate of block.candidates || []) {
      publicCandidate(candidate, context, block.district || null, 'councilors');
    }
  }

  for (const block of area.representatives || []) {
    for (const candidate of block.candidates || []) {
      publicCandidate(candidate, context, block.district || null, 'representatives');
    }
  }
}

const unique = [...new Map(
  candidates.map(candidate => [
    [
      candidate.name,
      candidate.role,
      candidate.areaId,
      candidate.district || '',
      candidate.source || '',
    ].join('\u0000'),
    candidate,
  ])
).values()].sort((a, b) => a.name.localeCompare(b.name, 'zh-Hant'));

const output = {
  generatedAt: new Date().toISOString(),
  areas,
  candidates: unique,
};

await writeFile(
  path.join(dataDir, 'candidate_search.json'),
  JSON.stringify(output),
);

const withVotes = unique.filter(candidate =>
  candidate.votes !== null && candidate.votes !== undefined
).length;

const withPrevVotes = unique.filter(candidate =>
  candidate.prevVotes !== null && candidate.prevVotes !== undefined
).length;

console.log(
  `Built candidate search index: ${unique.length} candidates across ${Object.keys(areas).length} areas.`
);
console.log(`Candidates with votes: ${withVotes}`);
console.log(`Candidates with prevVotes: ${withPrevVotes}`);
