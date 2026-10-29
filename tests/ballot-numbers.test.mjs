import assert from 'node:assert/strict';
import fs from 'node:fs';
import test from 'node:test';
import vm from 'node:vm';
import * as cheerio from 'cheerio';
import '../data/ballot-numbers-2026.js';

const html = fs.readFileSync(new URL('../index.html', import.meta.url), 'utf8');
const numberMethod = html.slice(html.indexOf('  _ballotNo('), html.indexOf('  _showCands('));
const yunlin = JSON.parse(fs.readFileSync(new URL('../data/counties.json', import.meta.url), 'utf8'))
  .objects.map.geometries.find(g => g.properties.id === '10009').properties;

test('Yunlin mayor roster uses official draw order without mutating manually edited candidates', () => {
  const box = { innerHTML: '', scrollTop: 0 };
  const document = { getElementById: id => id === 'candidates' ? box : null, querySelector: () => null };
  const showMethod = html.slice(html.indexOf('  _showCands('), html.indexOf('  _partyChip(name)'));
  const app = vm.runInNewContext(`new class {${numberMethod}${showMethod}}`, { window: { FOBallotNumbers: globalThis.FOBallotNumbers }, document });
  app.county = { code: '10009' };
  app._card = c => `<p>${app._ballotNo(c)} ${c.name}</p>`;
  const candidates = ['林佳瑜', '劉建國', '吳炳輝', '張嘉郡'].map(name => ({ name, role: '縣市長候選人', photoUrl: 'https://example.com/manual.jpg' }));
  const before = structuredClone(candidates);
  app._showCands(candidates);
  assert.equal(box.innerHTML, '<p>1 吳炳輝</p><p>2 張嘉郡</p><p>3 劉建國</p><p>4 林佳瑜</p>');
  assert.deepEqual(candidates, before);
  assert.equal(app._ballotNo({ ...candidates[0], ballotNo: null }), null);
  assert.equal(app._ballotNo({ name: '林佳瑜', role: '議員候選人' }), null);
});

test('official number sits before the photo and keeps its manual photo URL', () => {
  const cardMethod = html.slice(html.indexOf('  _card('), html.indexOf('  _districtCoverage(code, number)'));
  const app = vm.runInNewContext(`new class {${numberMethod}${cardMethod}}`, { window: { FOBallotNumbers: globalThis.FOBallotNumbers } });
  Object.assign(app, { county: { code: '10009' }, _partyChip: () => '', _normalizeSearch: value => value, _socialIcon: () => '' });
  const $ = cheerio.load(app._card({ name: '張嘉郡', role: '縣市長候選人', photoUrl: 'https://example.com/manual.jpg' }));
  assert.equal($('.bn-headtile').children('.bn-ballot-no').text(), '2');
  assert.equal($('.bn-ballot-no').next().hasClass('bn-photo'), true);
  assert.equal($('.bn-photo img').attr('src'), 'https://example.com/manual.jpg');
});

test('all 72 Yunlin councilor draw entries match one district candidate and have contiguous numbers', () => {
  const districts = globalThis.FOBallotNumbers['10009'].councilors;
  assert.equal(Object.values(districts).reduce((count, entries) => count + Object.keys(entries).length, 0), 72);
  for (const block of yunlin.councilors) {
    const entries = districts[block.district];
    assert.ok(entries, `missing district ${block.district}`);
    assert.deepEqual(Object.values(entries).sort((a, b) => a - b), Array.from({ length: Object.keys(entries).length }, (_, i) => i + 1));
    const names = block.candidates.map(c => c.name).filter(name => name !== '鍾任明').sort();
    assert.deepEqual(Object.keys(entries).sort(), names, `district ${block.district}`);
  }
  assert.equal(districts['4']['鍾任明'], undefined);
});

test('district four sorts by draw number and leaves the ineligible unnumbered candidate last', () => {
  const box = { innerHTML: '', scrollTop: 0 };
  const document = { getElementById: id => id === 'candidates' ? box : null, querySelector: () => null };
  const showMethod = html.slice(html.indexOf('  _showCands('), html.indexOf('  _partyChip(name)'));
  const app = vm.runInNewContext(`new class {${numberMethod}${showMethod}}`, { window: { FOBallotNumbers: globalThis.FOBallotNumbers }, document });
  app.county = { code: '10009' };
  app._card = (c, district) => `<p>${app._ballotNo(c, district) ?? '—'} ${c.name}</p>`;
  const block = yunlin.councilors.find(b => b.district === '4');
  const candidates = block.candidates;
  const before = structuredClone(candidates);
  app._showCands(candidates, '4');
  assert.match(box.innerHTML, /^<p>1 楊智凱<\/p><p>2 王裔迪<\/p>/);
  assert.match(box.innerHTML, /<p>10 洪如萍<\/p><p>— 鍾任明<\/p>$/);
  assert.deepEqual(candidates, before);
});

test('councilor cards and static county page display district-specific numbers', () => {
  const cardMethod = html.slice(html.indexOf('  _card('), html.indexOf('  _districtCoverage(code, number)'));
  const app = vm.runInNewContext(`new class {${numberMethod}${cardMethod}}`, { window: { FOBallotNumbers: globalThis.FOBallotNumbers } });
  Object.assign(app, { county: { code: '10009' }, _partyChip: () => '', _normalizeSearch: value => value, _socialIcon: () => '' });
  const $card = cheerio.load(app._card({ name: '楊智凱', role: '議員候選人', photoUrl: 'https://example.com/manual.jpg' }, '4'));
  assert.equal($card('.bn-ballot-no').text(), '1');
  assert.equal($card('.bn-ballot-no').next().hasClass('bn-photo'), true);
  assert.equal($card('.bn-photo img').attr('src'), 'https://example.com/manual.jpg');
  const $page = cheerio.load(fs.readFileSync(new URL('../election/10009.html', import.meta.url), 'utf8'));
  const districtFour = $page('h3').filter((_, el) => $page(el).text().includes('第 4 選舉區')).first().next('table');
  const rows = districtFour.find('tbody tr');
  assert.equal(rows.first().find('td').eq(0).text(), '1');
  assert.equal(rows.first().find('td').eq(1).text(), '楊智凱');
  assert.equal(rows.last().find('td').eq(0).text(), '—');
  assert.match(rows.last().find('td').eq(1).text(), /鍾任明.*資格不符規定/);
});

test('Yunlin town directory pages retain their district ballot numbers', () => {
  const electionDir = new URL('../election/', import.meta.url);
  const files = fs.readdirSync(electionDir).filter(name => /^10009\d{3}\.html$/.test(name));
  assert.equal(files.length, 20);
  for (const file of files) {
    const $ = cheerio.load(fs.readFileSync(new URL(file, electionDir), 'utf8'));
    $('h2').filter((_, heading) => /雲林縣議員第\s*\d+\s*選舉區候選人/.test($(heading).text())).each((_, heading) => {
      const district = $(heading).text().match(/第\s*(\d+)\s*選舉區/)[1];
      const numbers = globalThis.FOBallotNumbers['10009'].councilors[district];
      const rows = $(heading).nextAll('table').first().find('tbody tr');
      assert.ok(rows.length > 0, `${file}: district ${district}`);
      rows.each((_, row) => {
        const cells = $(row).find('td');
        const name = cells.eq(1).text().trim().replace(/\s*資格不符規定$/, '');
        assert.equal(cells.eq(0).text(), String(numbers[name] ?? '—'), `${file}: ${name}`);
      });
    });
  }
});
