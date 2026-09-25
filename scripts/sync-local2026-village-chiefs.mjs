import { existsSync } from 'node:fs';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { overridesUrl } from './_api-url.mjs';

const SOURCE_URL = 'https://local2026.taiwangogo.tw/export/records.json';
const SITE_ORIGIN = 'https://local2026.taiwangogo.tw';
const outputDirectory = path.resolve(process.argv[2] || 'work/local2026-village-sync');
const applyRepo = process.argv.includes('--apply-repo');

const normalize = value => String(value || '')
  .normalize('NFKC')
  .replaceAll('台', '臺')
  .replace(/[\s　·‧・．.]/g, '');
const locationKey = (county, town, village) => [county, town, village].map(normalize).join('|');
const personKey = (county, town, village, name) => `${locationKey(county, town, village)}|${normalize(name)}`;

async function fetchJson(url) {
  const response = await fetch(url, {
    cache: 'no-store',
    headers: { 'User-Agent': 'taiwan-election-map local2026 village sync/1.0' },
  });
  if (!response.ok) throw new Error(`Request failed (${response.status}): ${url}`);
  return response.json();
}

function geometries(topology) {
  const key = Object.keys(topology.objects)[0];
  return topology.objects[key].geometries;
}

function addCandidate(index, key, entry) {
  if (!index.has(key)) index.set(key, []);
  index.get(key).push(entry);
}

const countyTopology = JSON.parse(await readFile('data/counties.json', 'utf8'));
const villageById = new Map();
const repoCandidates = new Map();
const topologies = new Map();

for (const county of geometries(countyTopology)) {
  const countyId = String(county.properties.id);
  const countyName = county.properties.name;
  const townsPath = `data/towns/towns-${countyId}.json`;
  if (!existsSync(townsPath)) continue;
  const towns = geometries(JSON.parse(await readFile(townsPath, 'utf8')));
  for (const town of towns) {
    const villagePath = `data/villages/villages-${town.properties.id}.json`;
    if (!existsSync(villagePath)) continue;
    const topology = JSON.parse(await readFile(villagePath, 'utf8'));
    topologies.set(villagePath, { topology, changed: false });
    for (const village of geometries(topology)) {
      const meta = {
        county: countyName,
        town: town.properties.name,
        village: village.properties.name,
        villageId: String(village.properties.id),
      };
      villageById.set(meta.villageId, meta);
      for (const candidate of village.properties.candidates || []) {
        addCandidate(repoCandidates, personKey(meta.county, meta.town, meta.village, candidate.name), {
          candidate, meta, villagePath,
        });
      }
    }
  }
}

const [source, overrides] = await Promise.all([
  fetchJson(SOURCE_URL),
  fetchJson(overridesUrl()),
]);
const originalOverrides = structuredClone(overrides);
const overrideCandidates = new Map();
for (const [villageId, document] of Object.entries(overrides)) {
  const meta = villageById.get(String(villageId));
  if (!meta || !Array.isArray(document?.candidates)) continue;
  for (const candidate of document.candidates) {
    addCandidate(overrideCandidates, personKey(meta.county, meta.town, meta.village, candidate.name), { candidate, meta });
  }
}

const report = {
  sourceUrl: SOURCE_URL,
  sourceDataAsOf: source.dataAsOf,
  syncedAt: new Date().toISOString(),
  sourcePeople: source.people?.length || 0,
  sourcePeopleWithPhotos: (source.people || []).filter(person => person.photoUrl).length,
  matchedPeople: 0,
  repoPhotosAdded: 0,
  overridePhotosAdded: 0,
  existingRepoPhotosPreserved: 0,
  existingOverridePhotosPreserved: 0,
  unmatched: [],
  ambiguous: [],
  matched: [],
};

function supplement(person, target, photoCounter, preservedCounter) {
  const profileUrl = `${SITE_ORIGIN}/people/${encodeURIComponent(person.personId)}/`;
  let changed = false;
  if (target.local2026Url !== profileUrl) {
    target.local2026Url = profileUrl;
    changed = true;
  }
  if (String(target.photoUrl || '').trim()) report[preservedCounter] += 1;
  else if (person.photoUrl) {
    target.photoUrl = new URL(person.photoUrl, SITE_ORIGIN).href;
    report[photoCounter] += 1;
    changed = true;
  }
  return { profileUrl, changed };
}

for (const person of source.people || []) {
  const key = personKey(person.county, person.township, person.village, person.name);
  const repoMatches = repoCandidates.get(key) || [];
  const overrideMatches = overrideCandidates.get(key) || [];
  if (repoMatches.length > 1 || overrideMatches.length > 1) {
    report.ambiguous.push({ county: person.county, town: person.township, village: person.village, name: person.name, repoMatches: repoMatches.length, overrideMatches: overrideMatches.length });
    continue;
  }
  if (repoMatches.length !== 1 && overrideMatches.length !== 1) {
    report.unmatched.push({ county: person.county, town: person.township, village: person.village, name: person.name, personId: person.personId });
    continue;
  }

  let villageId = '';
  let profileUrl = '';
  if (repoMatches.length === 1) {
    const match = repoMatches[0];
    villageId = match.meta.villageId;
    const supplemented = supplement(person, match.candidate, 'repoPhotosAdded', 'existingRepoPhotosPreserved');
    profileUrl = supplemented.profileUrl;
    if (supplemented.changed) topologies.get(match.villagePath).changed = true;
  }
  if (overrideMatches.length === 1) {
    const match = overrideMatches[0];
    villageId ||= match.meta.villageId;
    const supplemented = supplement(person, match.candidate, 'overridePhotosAdded', 'existingOverridePhotosPreserved');
    profileUrl ||= supplemented.profileUrl;
  }
  report.matchedPeople += 1;
  report.matched.push({ county: person.county, town: person.township, village: person.village, villageId, name: person.name, profileUrl });
}

report.changedVillageFiles = [...topologies.values()].filter(item => item.changed).length;
report.changedOverrideCodes = Object.keys(overrides).filter(code => JSON.stringify(overrides[code]) !== JSON.stringify(originalOverrides[code]));

await mkdir(outputDirectory, { recursive: true });
await writeFile(path.join(outputDirectory, 'report.json'), `${JSON.stringify(report, null, 2)}\n`, 'utf8');
await writeFile(path.join(outputDirectory, 'overrides.json'), `${JSON.stringify(overrides)}\n`, 'utf8');

if (applyRepo) {
  for (const [file, item] of topologies) {
    if (item.changed) await writeFile(file, `${JSON.stringify(item.topology)}\n`, 'utf8');
  }
}

console.log(JSON.stringify(report, null, 2));
if (!applyRepo) console.log('Preview only: pass --apply-repo to update repository village files.');
