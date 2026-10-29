import assert from 'node:assert/strict';
import fs from 'node:fs';
import test from 'node:test';
import vm from 'node:vm';
import '../data/ballot-numbers-2026.js';

const read = path => fs.readFileSync(new URL('../' + path, import.meta.url), 'utf8');
const county = JSON.parse(read('data/counties.json')).objects.map.geometries
  .find(geometry => geometry.properties.id === '68000').properties;
const official = globalThis.FOBallotNumbers['68000'];
const lookup = globalThis.FOBallotNumberForName;

test('Taoyuan draw covers both mayors and 108 councilors in 14 districts', () => {
  assert.equal(Object.keys(official.numbers).length, 2);
  assert.equal(Object.keys(official.councilors).length, 14);
  assert.equal(Object.values(official.councilors).reduce((total, district) => total + Object.keys(district).length, 0), 108);
  for (const candidate of county.candidates) {
    assert.ok(lookup(official.numbers, candidate.name));
    assert.equal(official.parties[candidate.name], candidate.party);
  }
  for (const block of county.councilors) {
    const numbers = official.councilors[block.district];
    const parties = official.councilorParties[block.district];
    assert.deepEqual(Object.values(numbers).sort((a, b) => a - b),
      Array.from({ length: Object.keys(numbers).length }, (_, i) => i + 1));
    for (const candidate of block.candidates) {
      const number = lookup(numbers, candidate.name);
      if (!number) {
        assert.equal(block.district, '1');
        assert.equal(candidate.name, '蕭湘瀚');
        continue;
      }
      const officialName = Object.keys(numbers).find(name => lookup({ [name]: number }, candidate.name) === number);
      assert.equal(parties[officialName], candidate.party, `${block.district}: ${candidate.name}`);
    }
  }
});

test('Taoyuan cards sort by number without changing manually edited candidate fields', () => {
  const html = read('index.html');
  const methods = html.slice(html.indexOf('  _ballotNo('), html.indexOf('  _partyChip(name)'));
  const box = { innerHTML: '', scrollTop: 0 };
  const document = { getElementById: id => id === 'candidates' ? box : null, querySelector: () => null };
  const app = vm.runInNewContext(`new class {${methods}}`, {
    window: { FOBallotNumbers: globalThis.FOBallotNumbers, FOBallotNumberForName: lookup }, document,
  });
  app.county = { code: '68000' };
  app._card = (candidate, district) => `${app._ballotNo(candidate, district) ?? '—'} ${candidate.name}|`;
  const mayors = county.candidates.map(candidate => ({ ...candidate, photoUrl: 'https://example.com/manual.jpg' }));
  app._showCands(mayors);
  assert.equal(box.innerHTML, '1 黃世杰|2 張善政|');
  assert.ok(mayors.every(candidate => candidate.photoUrl === 'https://example.com/manual.jpg'));
  const district = county.councilors.find(block => block.district === '1');
  app._showCands(district.candidates, '1');
  assert.ok(box.innerHTML.startsWith('1 徐千晴|2 余信憲|'));
  assert.ok(box.innerHTML.endsWith('19 許孟祥|— 蕭湘瀚|'));
  assert.match(read('admin.html'), /source\?\.councilorParties/);
});
