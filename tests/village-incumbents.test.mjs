import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import test from 'node:test';

const root = path.resolve(import.meta.dirname, '..');
const readJson = relativePath => JSON.parse(fs.readFileSync(path.join(root, relativePath), 'utf8'));
const villageDirectory = path.join(root, 'data', 'villages');

function villageCandidates() {
  const rows = [];
  for (const file of fs.readdirSync(villageDirectory).filter(name => name.endsWith('.json'))) {
    const topology = readJson(`data/villages/${file}`);
    for (const village of topology.objects.map.geometries) {
      for (const candidate of village.properties.candidates || []) {
        rows.push({ areaId: String(village.properties.id), village: village.properties.name, ...candidate });
      }
    }
  }
  return rows;
}

test('village incumbent data records the CEC roster and MOI cross-check method', () => {
  const metadata = readJson('data/moi_village_chiefs.json');
  assert.equal(metadata.candidateRosterSource.title, '9-(115年村里長選舉候選人登記彙總表)');
  assert.equal(metadata.candidateRosterSource.candidateRows, 14100);
  assert.match(metadata.candidateRosterSource.note, /備註欄未標示現任身分/);
  assert.match(metadata.markingMethod, /中選會登記名單.*內政部現任村里長名冊/);
});

test('published incumbent sync records exactly match verified village candidates', () => {
  const candidates = villageCandidates();
  const expected = candidates
    .filter(candidate => candidate.isIncumbent === true)
    .map(candidate => `${candidate.areaId}|${candidate.name}`)
    .sort();
  const sync = readJson('data/village_incumbent_sync.json');
  const actual = sync.records.map(record => `${record.areaId}|${record.name}`).sort();

  assert.ok(expected.length >= 6500, `expected broad national coverage, got ${expected.length}`);
  assert.deepEqual(actual, expected);

  const xinbu = candidates.find(candidate => candidate.areaId === '65000040045' && candidate.name === '紀詠心');
  assert.equal(xinbu?.village, '新廍里');
  assert.equal(xinbu?.isIncumbent, true);

  const yuanchangWayao = candidates.find(candidate => candidate.areaId === '10009170018');
  assert.equal(yuanchangWayao?.village, '瓦磘村');
});

test('candidate search and admin KV sync preserve the incumbent marker', () => {
  const search = readJson('data/candidate_search.json');
  const xinbu = search.candidates.find(candidate => candidate.areaId === '65000040045' && candidate.name === '紀詠心');
  assert.equal(xinbu?.isIncumbent, true);
  assert.equal(search.areas['10009170018']?.areaName, '瓦磘村');
  assert.ok(search.candidates
    .filter(candidate => candidate.areaId === '10009170018')
    .every(candidate => candidate.village === '瓦磘村'));

  const adminSync = fs.readFileSync(path.join(root, 'admin-kv-sync.js'), 'utf8');
  assert.doesNotThrow(() => new Function(adminSync));
  assert.match(adminSync, /candidate\.isIncumbent = true/);
  assert.doesNotMatch(adminSync, /candidate\.isIncumbent = false/);
});
