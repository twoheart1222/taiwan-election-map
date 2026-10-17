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
  const method = html.slice(html.indexOf('  _card(c) {'), html.indexOf('  _districtCoverage(code, number)'));
  const app = vm.runInNewContext(`({${method}})`, { window: { ReporterLinks } });
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
  const method = html.slice(html.indexOf('  _card(c) {'), html.indexOf('  _districtCoverage(code, number)'));
  const app = vm.runInNewContext(`({${method}})`, { window: { ReporterLinks } });
  Object.assign(app, { reporterLinks: catalog, county: { code: '00000' }, _partyChip: () => '', _normalizeSearch: value => value, _socialIcon: () => '' });
  const p = catalog.profiles.find(p => p.source === 'councilors');
  const $ = cheerio.load(app._card({ name: p.name, role: '議員候選人', countyCode: p.countyCode, qualificationStatus: 'ineligible', qualificationReason: '審查註記' }));
  const link = $('a[href="' + p.url + '"]');
  assert.equal(link.prev().is('details.qualification-notice'), true);
  assert.equal(link.prev().attr('open'), undefined);
});
