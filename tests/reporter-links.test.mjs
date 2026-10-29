import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import test from 'node:test';
import * as cheerio from 'cheerio';
import '../reporter-links.js';
const read = name => fs.readFileSync(new URL('../' + name, import.meta.url), 'utf8');
const catalog = JSON.parse(read('data/twreporter-links.json'));

test('every catalog profile resolves uniquely by county, role and name', () => {
  assert.ok(catalog.profiles.length > 300);
  for (const profile of catalog.profiles) {
    const candidate = { name: profile.name, role: profile.source === 'candidates' ? '縣市長候選人' : '議員候選人' };
    assert.equal(ReporterLinks.find(candidate, profile.countyCode, catalog), profile, profile.name);
    assert.equal(ReporterLinks.find(candidate, '00000', catalog), null);
    assert.equal(ReporterLinks.find({ ...candidate, role: '里長候選人' }, profile.countyCode, catalog), null);
  }
});

test('missing, ambiguous and unsafe profile links are hidden', () => {
  const p = catalog.profiles[0];
  const c = { name: p.name, role: p.source === 'candidates' ? '縣市長候選人' : '議員候選人' };
  assert.equal(ReporterLinks.find(c, p.countyCode, {}), null);
  assert.equal(ReporterLinks.find(c, p.countyCode, { profiles: [p, p] }), null);
  assert.equal(ReporterLinks.find({ ...c, name: '未收錄的人物' }, p.countyCode, catalog), null);
  for (const url of ['javascript:alert(1)', 'https://example.com/', 'https://lawmaker.twreporter.org.evil.test/congress/lawmaker/person', 'https://lawmaker.twreporter.org/congress']) {
    assert.equal(ReporterLinks.find(c, p.countyCode, { profiles: [{ ...p, url }] }), null);
  }
});

test('verified profiles appear below gazettes as direct links, including former legislators running for mayor', () => {
  const html = read('index.html');
  const method = html.slice(html.indexOf('  _ballotNo(c)'), html.indexOf('  _showCands(cands)')) + html.slice(html.indexOf('  _card(c) {'), html.indexOf('  _districtCoverage(code, number)'));
  const app = vm.runInNewContext(`new class {${method}}`, { window: { ReporterLinks } });
  Object.assign(app, { reporterLinks: catalog, _partyChip: () => '', _normalizeSearch: value => value, _socialIcon: () => '' });
  for (const name of ['沈伯洋', '蔣萬安', catalog.profiles.find(p => p.source === 'councilors').name]) {
    const profile = catalog.profiles.find(p => p.name === name);
    app.county = { code: profile.countyCode };
    const candidate = { name, role: profile.source === 'candidates' ? '直轄市長候選人' : '議員候選人', gazetteUrl: 'https://example.com/notice.pdf' };
    const before = structuredClone(candidate);
    const $ = cheerio.load(app._card(candidate));
    const link = $('a[href="' + profile.url + '"]');
    assert.equal(link.length, 1);
    assert.match(link.text(), profile.kind === 'congress' ? /立委問政紀錄/ : /議員提案紀錄/);
    assert.equal(link.prev().is('details.gazette-disclosure'), true);
    assert.equal(link.attr('target'), '_blank');
    assert.equal(link.attr('rel'), 'noopener noreferrer');
    assert.deepEqual(candidate, before);
    const without = cheerio.load(app._card({ ...candidate, name: '未收錄的人物' }));
    assert.equal(without('a[href*="lawmaker.twreporter.org"]').length, 0);
  }
});

test('search fallback uses candidate county instead of stale selected county', () => {
  const html = read('index.html');
  const method = html.slice(html.indexOf('  _ballotNo(c)'), html.indexOf('  _showCands(cands)')) + html.slice(html.indexOf('  _card(c) {'), html.indexOf('  _districtCoverage(code, number)'));
  const app = vm.runInNewContext(`new class {${method}}`, { window: { ReporterLinks } });
  Object.assign(app, { reporterLinks: catalog, county: { code: '00000' }, _partyChip: () => '', _normalizeSearch: value => value, _socialIcon: () => '' });
  const p = catalog.profiles.find(p => p.source === 'councilors');
  const $ = cheerio.load(app._card({ name: p.name, role: '議員候選人', countyCode: p.countyCode, qualificationStatus: 'ineligible', qualificationReason: '審查註記' }));
  const link = $('a[href="' + p.url + '"]');
  assert.equal(link.prev().is('details.qualification-notice'), true);
  assert.equal(link.prev().attr('open'), undefined);
});

test('manual URLs override automatic matches; explicit clears stay hidden', () => {
  const p = catalog.profiles[0];
  const c = { name: p.name, role: p.source === 'candidates' ? '縣市長候選人' : '議員候選人' };
  const url = 'https://lawmaker.twreporter.org/congress/lawmaker/shen-pao-yang?mt=11#topics';
  assert.equal(ReporterLinks.find({ ...c, reporterUrl: url }, p.countyCode, catalog).url, url);
  assert.equal(ReporterLinks.find({ name: '手動補入', reporterUrl: url }, undefined, {}).manual, true);
  for (const reporterUrl of [null, '', 'javascript:alert(1)', 'https://example.org/person']) {
    assert.equal(ReporterLinks.find({ ...c, reporterUrl }, p.countyCode, catalog), null);
  }
});

test('admin preserves automatic defaults, saves edits, and retains clears across reopening', () => {
  const html = read('admin.html');
  assert.match(html, /class="c-reporter /);
  assert.match(html, /value="\$\{escapeAttr\(row\._reporterInitial\)\}"/);
  assert.match(html, /\[countiesTopo, districtTownMap, reporterLinkCatalog\] = await Promise\.all/);
  const collect = html.slice(html.indexOf('    function collectCandidatesFromForm()'), html.indexOf('    function captureCurrentForm()'));
  const automatic = 'https://lawmaker.twreporter.org/congress/lawmaker/shen-pao-yang';
  const manual = automatic + '?mt=11';
  let original = { name: '測試', manualFieldLocks: { photoUrl: true } };
  const values = { '.c-name': '測試', '.c-reporter': automatic };
  const row = { get _candidate() { return original; }, _reporterInitial: automatic, dataset: { district: '1' }, querySelector: key => ({ value: values[key] || '', checked: false }) };
  const context = vm.createContext({ window: { ReporterLinks }, document: { querySelectorAll: () => [row] } });
  vm.runInContext(collect, context);
  let saved = context.collectCandidatesFromForm()[0];
  assert.equal(Object.hasOwn(saved, 'reporterUrl'), false, 'viewing an automatic match must not create a manual override');
  values['.c-reporter'] = manual;
  values['.c-taiwangogo'] = 'https://example.com/manual';
  saved = context.collectCandidatesFromForm()[0];
  assert.equal(saved.reporterUrl, manual);
  assert.equal(saved.manualFieldLocks.reporterUrl, true);
  assert.equal(saved.manualFieldLocks.taiwanGoGoUrl, true);
  assert.equal(saved.manualFieldLocks.photoUrl, true);
  original = saved; row._reporterInitial = manual;
  saved = context.collectCandidatesFromForm()[0];
  assert.equal(saved.reporterUrl, manual);
  values['.c-reporter'] = '';
  saved = context.collectCandidatesFromForm()[0];
  assert.equal(saved.reporterUrl, null);
  original = saved; row._reporterInitial = '';
  assert.equal(context.collectCandidatesFromForm()[0].reporterUrl, null);
  values['.c-reporter'] = 'https://example.com/invalid';
  assert.throws(() => context.collectCandidatesFromForm(), /HTTPS 人物頁/);
});

test('search index preserves manual links and clears without manufacturing an override for automatic matches', () => {
  const source = read('scripts/build-search-index.mjs');
  const method = source.slice(source.indexOf('function publicCandidate('), source.indexOf('\nfor (const area of allAreas)'));
  const candidates = [];
  const context = vm.createContext({ candidates, phoneticSyllables: () => [], ElectionData: { qualificationFields: [] } });
  vm.runInContext(method, context);
  const url = 'https://lawmaker.twreporter.org/congress/lawmaker/shen-pao-yang';
  for (const extra of [{}, { reporterUrl: url }, { reporterUrl: null }]) context.publicCandidate({ name: '測試', ...extra }, { countyCode: '63000' });
  assert.equal(Object.hasOwn(candidates[0], 'reporterUrl'), false);
  assert.equal(candidates[1].reporterUrl, url);
  assert.equal(candidates[2].reporterUrl, null);
});
