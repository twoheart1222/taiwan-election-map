import assert from 'node:assert/strict';
import fs from 'node:fs';
import test from 'node:test';
import vm from 'node:vm';
import '../data/ballot-numbers-2026.js';

const read = path => fs.readFileSync(new URL('../' + path, import.meta.url), 'utf8');
const county = JSON.parse(read('data/counties.json')).objects.map.geometries
  .find(geometry => geometry.properties.id === '10018').properties;
const draw = globalThis.FOBallotNumbers['10018'];
const lookup = globalThis.FOBallotNumberForName;

test('Hsinchu draw numbers match every existing mayor and all 56 councilors', () => {
  assert.equal(Object.keys(draw.numbers).length, 3);
  assert.equal(Object.keys(draw.councilors).length, 7);
  assert.equal(Object.values(draw.councilors).reduce((total, district) => total + Object.keys(district).length, 0), 56);
  for (const candidate of county.candidates) assert.ok(lookup(draw.numbers, candidate.name));
  for (const block of county.councilors) {
    const numbers = draw.councilors[block.district];
    assert.deepEqual(Object.values(numbers).sort((a, b) => a - b),
      Array.from({ length: block.candidates.length }, (_, i) => i + 1));
    for (const candidate of block.candidates) assert.ok(lookup(numbers, candidate.name), `${block.district}: ${candidate.name}`);
  }
});

test('Hsinchu mayor and councilor cards follow ballot order', () => {
  const html = read('index.html');
  const methods = html.slice(html.indexOf('  _ballotNo('), html.indexOf('  _partyChip(name)'));
  const box = { innerHTML: '', scrollTop: 0 };
  const app = vm.runInNewContext(`new class {${methods}}`, {
    window: { FOBallotNumbers: globalThis.FOBallotNumbers, FOBallotNumberForName: lookup },
    document: { getElementById: id => id === 'candidates' ? box : null, querySelector: () => null },
  });
  app.county = { code: '10018' };
  app._card = (candidate, district) => `${app._ballotNo(candidate, district)} ${candidate.name}|`;
  app._showCands(county.candidates);
  assert.equal(box.innerHTML, '1 高虹安|2 何志勇|3 莊競程|');
  app._showCands(county.councilors[0].candidates, '1');
  assert.ok(box.innerHTML.startsWith('1 劉詳樽|2 曾翰揚|3 鄭宏輝|'));
  assert.ok(box.innerHTML.endsWith('19 黃文政|'));
});

test('Hsinchu public directory labels its mayor as a city mayor', () => {
  assert.match(read('election/10018.html'), /新竹市市長候選人/);
  assert.match(read('election/10018.html'), /<td>2<\/td><td>何志勇/);
});
