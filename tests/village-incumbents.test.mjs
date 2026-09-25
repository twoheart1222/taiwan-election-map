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

test('Zuoying uses the July 2026 village boundaries and official candidate roster', () => {
  const topology = readJson('data/villages/villages-64000030.json');
  const villages = topology.objects.map.geometries
    .map(geometry => geometry.properties)
    .filter(village => village.name);
  const byName = new Map(villages.map(village => [village.name, village]));
  const expectedSplit = {
    '福山里': ['64000030044', '鄭祺寶', '謝印順', '黃國增'],
    '福愛里': ['64000030045', '陳榆臻'],
    '福華里': ['64000030046', '劉品茵', '卜憲威'],
    '福榮里': ['64000030047', '陳秉義', '黃彥森', '萬春賢'],
  };

  assert.equal(villages.length, 41);
  assert.equal(villages.reduce((total, village) => total + village.candidates.length, 0), 81);
  for (const [name, [id, ...candidateNames]] of Object.entries(expectedSplit)) {
    const village = byName.get(name);
    assert.equal(village?.id, id);
    assert.deepEqual(village?.candidates.map(candidate => candidate.name), candidateNames);
  }

  for (const name of ['新超里', '菜福里', '高鐵里', '廍後里', '崇聖里']) {
    assert.ok(byName.has(name), `missing adjusted village ${name}`);
  }

  const chenBingyi = byName.get('福榮里').candidates.find(candidate => candidate.name === '陳秉義');
  assert.match(chenBingyi.photoUrl, /^https:\/\/local2026\.taiwangogo\.tw\/assets\/photos\//);
  assert.equal(chenBingyi.local2026Url, 'https://local2026.taiwangogo.tw/people/person-10251e4aede7c6/');
});

test('Rende publishes Wenxian Village instead of the pre-2018 Tianjiao and Sanjia villages', () => {
  const topology = readJson('data/villages/villages-67000270.json');
  const villages = topology.objects.map.geometries.map(geometry => geometry.properties);
  const byName = new Map(villages.map(village => [village.name, village]));

  assert.equal(villages.length, 16);
  assert.equal(byName.has('田厝里'), false);
  assert.equal(byName.has('三甲里'), false);

  const wenxian = byName.get('文賢里');
  assert.equal(wenxian?.id, '67000270019');
  assert.deepEqual(wenxian?.candidates.map(candidate => candidate.name), ['林江溪']);
  assert.equal(wenxian.candidates[0].registeredDate, '115/08/31');
  assert.equal(wenxian.candidates[0].isIncumbent, true);
  assert.match(wenxian.candidates[0].photoUrl, /^https:\/\/local2026\.taiwangogo\.tw\/assets\/photos\//);
  assert.equal(wenxian.candidates[0].local2026Url, 'https://local2026.taiwangogo.tw/people/person-1fe02491628ce3/');
});
