import assert from 'node:assert/strict';
import fs from 'node:fs';
import test from 'node:test';
import vm from 'node:vm';
import * as cheerio from 'cheerio';
import '../election-data.js';
import { compareReview } from '../scripts/review-qualifications.mjs';

const read = file => fs.readFileSync(new URL('../' + file, import.meta.url), 'utf8');
const review = JSON.parse(read('data/qualification-review-20261016.json'));
const counties = JSON.parse(read('data/counties.json')).objects.map.geometries.map(g => g.properties);
const snapshot = () => Object.fromEntries(counties.map(c => [c.id, { ...structuredClone(c), schemaVersion: 2, _revision: 'test-' + c.id }]));

test('official review matches all 81 mayors and exactly ten councilors by county, district and name', () => {
  const result = compareReview(snapshot(), counties, review);
  assert.equal(result.mayorCount, 81);
  assert.equal(result.councilorCount, 1502);
  assert.deepEqual(result.mayorDifferences, []);
  assert.equal(result.matched.length, 10);
  assert.equal(Object.keys(result.overrides).length, 10);
});

test('review preserves revisions, every roster entry and manual fields, and never mutates its input', () => {
  const original = snapshot();
  const source = review.ineligible[0];
  const candidate = original[source.countyCode].councilors.find(b => String(b.district) === source.district).candidates.find(c => c.name === source.name);
  candidate.photoUrl = null; candidate.facebook = 'https://example.com/manual'; candidate.votes = 0;
  const before = structuredClone(original);
  const result = ElectionData.applyQualificationReview(original, review);
  assert.deepEqual(original, before);
  for (const [code, after] of Object.entries(result.overrides)) {
    assert.equal(after._revision, original[code]._revision);
    assert.equal(result.expectedRevisions[code], original[code]._revision);
    for (let i = 0; i < after.councilors.length; i++) {
      assert.equal(after.councilors[i].candidates.length, original[code].councilors[i].candidates.length);
      after.councilors[i].candidates.forEach((c, index) => {
        const stripped = structuredClone(c);
        ElectionData.qualificationFields.forEach(field => delete stripped[field]);
        assert.deepEqual(stripped, original[code].councilors[i].candidates[index]);
      });
    }
  }
  assert.deepEqual(ElectionData.applyQualificationReview({ ...original, ...result.overrides }, review).overrides, result.overrides);
});

test('ambiguous matches and conflicting saved qualifications stop the import', () => {
  const original = snapshot();
  const first = review.ineligible[0];
  const block = original[first.countyCode].councilors.find(b => String(b.district) === first.district);
  const candidate = block.candidates.find(c => c.name === first.name);
  candidate.qualificationStatus = 'eligible';
  assert.throws(() => ElectionData.applyQualificationReview(original, review), /已有不同資格註記/);
  delete candidate.qualificationStatus;
  block.candidates.push(structuredClone(candidate));
  assert.throws(() => ElectionData.applyQualificationReview(original, review), /比對不唯一/);
});

test('all ten ineligible names remain exact search matches ahead of over thirty suggestions', () => {
  const html = read('index.html');
  const children = [];
  const container = { innerHTML: '', appendChild: child => children.push(child) };
  const document = { createElement: () => ({ children: [], setAttribute() {}, append(...items) { this.children.push(...items); }, addEventListener(event, handler) { this[event] = handler; } }) };
  const methods = html.slice(html.indexOf('  _normalizeSearch(value)'), html.indexOf('  _phoneticCandidateMatches(raw, index)'));
  const renderer = html.slice(html.indexOf('  _renderCandidateSearchResults(container,'), html.indexOf('\n  }', html.indexOf('  _renderCandidateSearchResults(container,')) + 4);
  const app = vm.runInNewContext(`new class {${methods}${renderer}}`, { document });
  Object.assign(app, { _candidateLocation: () => '', _openSearchResult: candidate => { app.opened = candidate; } });
  const search = JSON.parse(read('data/candidate_search.json'));
  for (const entry of review.ineligible) {
    const direct = app._directCandidateMatches(entry.name, search);
    assert.equal(direct[0]?.name, entry.name);
    assert.equal(direct[0].qualificationStatus, 'ineligible');
    const matches = [...direct, ...Array.from({ length: 35 }, (_, i) => ({ name: `讀音建議${i}` }))];
    const before = structuredClone(matches);
    children.length = 0;
    app._renderCandidateSearchResults(container, matches);
    assert.equal(children[0].children[0].textContent, entry.name + '｜資格不符規定');
    assert.equal(children.filter(child => child.className === 'search-result').length, 30);
    children[0].click();
    assert.equal(app.opened, direct[0]);
    assert.deepEqual(matches, before);
  }
});

test('candidate cards retain roster order regardless of qualification', () => {
  const html = read('index.html');
  const method = html.slice(html.indexOf('  _ballotNo(c)'), html.indexOf('  _partyChip(name)'));
  const box = {};
  const app = vm.runInNewContext(`new class {${method}}`, { window: {}, document: { getElementById: id => id === 'candidates' ? box : null, querySelector: () => null } });
  app._card = candidate => `<p>${candidate.name}</p>`;
  const candidates = [{ name: '甲', qualificationStatus: 'ineligible' }, { name: '乙' }, { name: '丙', qualificationStatus: 'eligible' }, { name: '丁', qualificationStatus: 'ineligible' }];
  app._showCands(candidates);
  assert.equal(box.innerHTML, '<p>甲</p><p>乙</p><p>丙</p><p>丁</p>');
});

test('ineligible cards replace the gazette with an escaped official note; ordinary cards retain gazettes', () => {
  const html = read('index.html');
  const method = html.slice(html.indexOf('  _ballotNo(c)'), html.indexOf('  _showCands(cands)')) + html.slice(html.indexOf('  _card(c) {'), html.indexOf('  _districtCoverage(code, number)'));
  const app = vm.runInNewContext(`new class {${method}}`, { window: {} });
  Object.assign(app, { _partyChip: () => '', _normalizeSearch: value => value, _socialIcon: () => '' });
  const card = app._card({ name: '測試', qualificationStatus: 'ineligible', qualificationReason: '<script>alert(1)</script>', qualificationDate: '2026-10-16', qualificationSourceUrl: 'javascript:alert(1)', elected: true });
  assert.match(card, /資格不符規定/);
  assert.match(card, /&lt;script&gt;/);
  const notice = cheerio.load(card)('details.qualification-notice');
  assert.equal(notice.length, 1);
  assert.equal(notice.attr('open'), undefined);
  assert.match(notice.children('summary').text(), /資格不符規定.*查看原因/);
  assert.doesNotMatch(card, /<script>|href="javascript:|查看選舉公報|未開票|bn-win-bar/);
  assert.match(app._card({ name: '一般候選人', gazetteUrl: 'https://example.com/notice.pdf' }), /查看選舉公報/);
});

test('public county pages and search retain all ten notices with official source and review date', () => {
  const index = JSON.parse(read('data/candidate_search.json'));
  for (const entry of review.ineligible) {
    const $ = cheerio.load(read(`election/${entry.countyCode}.html`));
    const row = $('tr').filter((_, el) => $(el).find('td').first().text().startsWith(entry.name));
    assert.equal(row.length, 1, entry.name);
    assert.match(row.text(), /資格不符規定/);
    assert.match(row.text(), /2026-10-16/);
    assert.equal(row.find('a').attr('href'), review.sourceUrl);
    const indexed = index.candidates.filter(c => c.areaId === entry.countyCode && c.source === 'councilors' && c.name === entry.name && String(c.district) === entry.district);
    assert.equal(indexed.length, 1, entry.name);
    assert.equal(indexed[0].qualificationStatus, 'ineligible');
  }
});

test('qualification validation rejects unsupported statuses, missing reasons, invalid dates and unsafe links', () => {
  const src = read('override-store.js');
  const method = src.slice(src.indexOf('export function validateMap'), src.indexOf('\nfunction failure')).replace('export ', '');
  const validate = vm.runInNewContext(`${method}; validateMap`);
  for (const candidate of [
    { qualificationStatus: 'unknown-status' },
    { qualificationStatus: 'ineligible', qualificationReason: ' ' },
    { qualificationDate: '2026-02-30' },
    { qualificationSourceUrl: 'javascript:alert(1)' },
    { qualificationReason: '字'.repeat(2401) },
  ]) assert.throws(() => validate({ A: { councilors: [{ district: '1', candidates: [candidate] }] } }));
  assert.doesNotThrow(() => validate({ A: { candidates: [{ name: '測試', qualificationStatus: 'ineligible', qualificationReason: '官方原因', qualificationDate: '2026-10-16', qualificationSourceUrl: review.sourceUrl }] } }));
});
