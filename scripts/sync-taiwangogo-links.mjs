import { readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const SOURCE_BASE = 'https://council2026.taiwangogo.tw';
const API_URL = process.env.ELECTION_API_URL ||
  'https://election-api.uprisevideoproduction.workers.dev/?key=overrides';
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

function normalize(value) {
  return String(value || '')
    .normalize('NFKC')
    .replaceAll('臺', '台')
    .replace(/[・．·‧\s]/g, '');
}

function districtNumber(value) {
  return String(value || '').match(/\d+/)?.[0] || '';
}

async function fetchJson(url) {
  const response = await fetch(url, {
    cache: 'no-store',
    headers: { 'User-Agent': 'taiwan-election-map taiwangogo sync/1.0' },
  });
  if (!response.ok) throw new Error(`${url} returned ${response.status}`);
  return response.json();
}

function candidateGroups(document) {
  return [
    { district: 'mayor', candidates: document.candidates || [] },
    ...(document.councilors || []).map((block) => ({
      district: String(block.district || ''),
      candidates: block.candidates || [],
    })),
  ];
}

function personUrl(person, cityId, districtId) {
  const url = new URL('/', SOURCE_BASE);
  if (person.level !== '縣市長') {
    url.searchParams.set('city', cityId);
    url.searchParams.set('district', districtId);
  }
  url.searchParams.set('person', person.id);
  return url.href;
}

const [topology, people, districts, overrides] = await Promise.all([
  readFile(path.join(root, 'data', 'counties.json'), 'utf8').then(JSON.parse),
  fetchJson(`${SOURCE_BASE}/export/people.json`),
  fetchJson(`${SOURCE_BASE}/export/districts.json`),
  fetchJson(`${API_URL}${API_URL.includes('?') ? '&' : '?'}v=${crypto.randomUUID()}`),
]);

const objectKey = Object.keys(topology.objects)[0];
const countyCodeByName = new Map(
  topology.objects[objectKey].geometries.map((geometry) => [
    normalize(geometry.properties.name),
    geometry.properties.id,
  ]),
);
const sourceDistrictByPerson = new Map();
for (const city of districts.cities || []) {
  for (const personId of city.mayorPeopleIds || []) {
    sourceDistrictByPerson.set(personId, { cityId: city.id, districtId: `${city.id}-mayor` });
  }
  for (const district of city.districts || []) {
    for (const personId of district.peopleIds || []) {
      sourceDistrictByPerson.set(personId, { cityId: city.id, districtId: district.id });
    }
  }
}

for (const document of Object.values(overrides)) {
  for (const group of candidateGroups(document)) {
    for (const candidate of group.candidates) delete candidate.taiwanGoGoUrl;
  }
}

const rows = [];
const errors = [];
for (const person of people) {
  const countyCode = countyCodeByName.get(normalize(person.city));
  const document = overrides[countyCode];
  const sourceDistrict = sourceDistrictByPerson.get(person.id);
  if (!countyCode || !document || !sourceDistrict) {
    errors.push({ id: person.id, reason: '找不到縣市或來源選區' });
    continue;
  }

  const wantedDistrict = person.level === '縣市長' ? 'mayor' : districtNumber(person.district);
  const group = candidateGroups(document).find((item) => item.district === wantedDistrict);
  const matches = (group?.candidates || []).filter(
    (candidate) => normalize(candidate.name) === normalize(person.name),
  );
  if (matches.length !== 1) {
    errors.push({ id: person.id, reason: `候選人命中 ${matches.length} 筆` });
    continue;
  }

  const url = personUrl(person, sourceDistrict.cityId, sourceDistrict.districtId);
  matches[0].taiwanGoGoUrl = url;
  rows.push({
    countyCode,
    city: person.city,
    district: person.district,
    name: person.name,
    personId: person.id,
    url,
  });
}

if (errors.length) {
  console.error(JSON.stringify(errors, null, 2));
  throw new Error(`安全中止：${errors.length} 筆無法唯一對應`);
}

const generatedAt = new Date().toISOString();
await Promise.all([
  writeFile(
    path.join(root, 'data', 'taiwangogo_links.json'),
    `${JSON.stringify({ generatedAt, source: SOURCE_BASE, count: rows.length, links: rows }, null, 2)}\n`,
  ),
  writeFile(path.join(root, 'overrides_deploy.json'), `${JSON.stringify(overrides)}\n`),
  writeFile(
    path.join(root, 'overrides_bulk_deploy.json'),
    `${JSON.stringify([{ key: 'overrides', value: JSON.stringify(overrides) }])}\n`,
  ),
]);

console.log(JSON.stringify({ sourcePeople: people.length, matched: rows.length, errors: 0 }, null, 2));
