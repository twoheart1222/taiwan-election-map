import assert from 'node:assert/strict';
import fs from 'node:fs';
import test from 'node:test';
import vm from 'node:vm';
import * as cheerio from 'cheerio';
import '../data/ballot-numbers-2026.js';

const html = fs.readFileSync(new URL('../index.html', import.meta.url), 'utf8');
const numberMethod = html.slice(html.indexOf('  _ballotNo(c)'), html.indexOf('  _showCands(cands)'));

test('Yunlin mayor roster uses official draw order without mutating manually edited candidates', () => {
  const box = { innerHTML: '', scrollTop: 0 };
  const document = { getElementById: id => id === 'candidates' ? box : null, querySelector: () => null };
  const showMethod = html.slice(html.indexOf('  _showCands(cands)'), html.indexOf('  _partyChip(name)'));
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
  const cardMethod = html.slice(html.indexOf('  _card(c) {'), html.indexOf('  _districtCoverage(code, number)'));
  const app = vm.runInNewContext(`new class {${numberMethod}${cardMethod}}`, { window: { FOBallotNumbers: globalThis.FOBallotNumbers } });
  Object.assign(app, { county: { code: '10009' }, _partyChip: () => '', _normalizeSearch: value => value, _socialIcon: () => '' });
  const $ = cheerio.load(app._card({ name: '張嘉郡', role: '縣市長候選人', photoUrl: 'https://example.com/manual.jpg' }));
  assert.equal($('.bn-headtile').children('.bn-ballot-no').text(), '2');
  assert.equal($('.bn-ballot-no').next().hasClass('bn-photo'), true);
  assert.equal($('.bn-photo img').attr('src'), 'https://example.com/manual.jpg');
});
