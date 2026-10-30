import assert from 'node:assert/strict';
import fs from 'node:fs';
import test from 'node:test';
import '../election-data.js';
const read = p => fs.readFileSync(new URL('../' + p, import.meta.url), 'utf8');
const officialReview = JSON.parse(read('data/representative-incumbent-review-20261030.json'));
const candidate = { name: '王小明', role: '鄉鎮市長候選人', isIncumbent: false, photoUrl: '', votes: 0, facebook: null };
const snapshot = () => ({ '10002010': { _revision: '4', schemaVersion: 2, candidates: [structuredClone(candidate)], representatives: [] } });
const fields = { isIncumbent: false, isCareerMove: true, priorRace: '現任宜蘭縣宜蘭市民代表會', incumbentOffice: '宜蘭縣宜蘭市民代表會', incumbentSourceUrl: 'https://www.moi.gov.tw/LocalOfficial_Content.aspx?n=575' };
const record = () => ({ areaId: '10002010', field: 'candidates', district: null, name: candidate.name, role: candidate.role, kind: 'careerMove', fields, before: { isIncumbent: false } });

test('representative sync preserves candidates, explicit empty fields and revisions, and is idempotent', () => {
  const original = snapshot();
  const plan = ElectionData.applyRepresentativeIncumbents(original, { records: [record()] });
  assert.equal(plan.expectedRevisions['10002010'], '4');
  const updated = plan.overrides['10002010'];
  assert.equal(updated.candidates.length, 1);
  assert.deepEqual(updated.candidates[0], { ...candidate, ...fields });
  assert.deepEqual(original, snapshot());
  assert.deepEqual(ElectionData.applyRepresentativeIncumbents({ '10002010': updated }, { records: [record()] }).overrides, {});
});

test('changed manual flags, missing names and duplicate identities abort before any save', () => {
  const changed = snapshot(); changed['10002010'].candidates[0].isCareerMove = false;
  assert.throws(() => ElectionData.applyRepresentativeIncumbents(changed, { records: [record()] }), /已被修改/);
  const missing = snapshot(); missing['10002010'].candidates = [];
  assert.throws(() => ElectionData.applyRepresentativeIncumbents(missing, { records: [record()] }), /比對不唯一/);
  const duplicate = snapshot(); duplicate['10002010'].candidates.push(structuredClone(candidate));
  assert.throws(() => ElectionData.applyRepresentativeIncumbents(duplicate, { records: [record()] }), /比對不唯一/);
  assert.throws(() => ElectionData.applyRepresentativeIncumbents(snapshot(), { records: [record(), record()] }), /核對紀錄重複/);
});

test('new backend areas keep the entire base candidate list and require revision zero', () => {
  const base = snapshot()['10002010']; delete base._revision;
  const r = record(); base.candidates[0] = { ...candidate, ...fields };
  const plan = ElectionData.applyRepresentativeIncumbents({}, { records: [r] }, { '10002010': base });
  assert.equal(plan.expectedRevisions['10002010'], '0');
  assert.equal(plan.overrides['10002010'].candidates.length, 1);
});

test('published review uses official geography and keeps re-election separate from career moves', () => {
  const districts = JSON.parse(read('data/district_town_map.json'));
  assert.equal(officialReview.officialCount, 2043);
  assert.equal(officialReview.records.filter(r => r.kind === 'incumbent').length, 1632);
  assert.equal(officialReview.records.filter(r => r.kind === 'careerMove').length, 135);
  for (const r of officialReview.records) {
    assert.match(r.official.url, /^https:\/\/www\.moi\.gov\.tw\/LocalOfficial_Content\.aspx\?/);
    assert.ok(r.official.office.startsWith(r.official.county + r.official.town));
    if (r.kind === 'incumbent') {
      assert.equal(r.areaId, r.official.townId);
      assert.equal(r.field, 'representatives');
      assert.equal(r.fields.isIncumbent, true);
    } else {
      assert.equal(r.fields.isIncumbent, false);
      assert.equal(r.fields.isCareerMove, true);
      assert.equal(r.fields.priorRace, '現任' + r.official.office);
      if (r.field === 'councilors') assert.ok(districts[r.areaId].districts[r.district].towns.includes(r.official.town));
      else assert.equal(r.areaId.slice(0, 8), r.official.townId);
    }
  }
});

test('search, candidate cards, public pages and backend retain the career move fields', () => {
  const search = JSON.parse(read('data/candidate_search.json'));
  for (const r of officialReview.records) {
    const c = search.candidates.find(c => c.areaId === r.areaId && c.source === r.field && String(c.district ?? '') === String(r.district ?? '') && c.name === r.name);
    assert.ok(c, `${r.areaId} ${r.name}`);
    for (const [key, value] of Object.entries(r.fields)) assert.equal(c[key], value, `${r.name} ${key}`);
  }
  assert.match(read('index.html'), /現任轉職/);
  assert.match(read('scripts/build-seo-pages.mjs'), /現任轉職/);
  assert.match(read('admin.html'), /admin-representative-sync\.js/);
  assert.ok(read('admin.html').indexOf('<script src="./admin-kv-sync.js') < read('admin.html').indexOf('<script src="./admin-representative-sync.js'));
  assert.match(read('scripts/build-public-assets.mjs'), /'admin-representative-sync\.js'/);
  assert.match(read('admin-representative-sync.js'), /expectedRevisions: pending.expectedRevisions/);
  assert.doesNotMatch(read('admin-representative-sync.js'), /\/api\/admin\/kv/);
});
