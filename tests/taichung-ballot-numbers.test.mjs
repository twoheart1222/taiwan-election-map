import assert from 'node:assert/strict';
import fs from 'node:fs';
import test from 'node:test';
import vm from 'node:vm';
import '../data/ballot-numbers-taichung-2026.js';
import '../data/ballot-numbers-2026.js';

const read = path => fs.readFileSync(new URL('../' + path, import.meta.url), 'utf8');
const normalize = value => String(value || '').normalize('NFKC').replace(/[·‧．・]/g, '.').replace(/爲/g, '為').replace(/啓/g, '啟').replace(/\s+/g, '').toLowerCase();
const lookup = globalThis.FOBallotNumberForName;
const county = JSON.parse(read('data/counties.json')).objects.map.geometries.find(geometry => geometry.properties.id === '66000').properties;
const towns = JSON.parse(read('data/towns/towns-66000.json')).objects.map.geometries.map(geometry => geometry.properties);
const peace = towns.find(town => town.name === '和平區');
const villages = towns.flatMap(town => JSON.parse(read(`data/villages/villages-${town.id}.json`)).objects.map.geometries.map(geometry => geometry.properties));
const draw = globalThis.FOBallotNumbers['66000'];
const villageDraw = globalThis.FOTaichungVillageBallots;
const villageParties = globalThis.FOTaichungVillageParties;

test('Taichung draw covers every mayor, 101 councilors, Heping elections and 1112 village candidates', () => {
  assert.equal(Object.keys(draw.numbers).length, 3);
  assert.equal(Object.values(draw.councilors).reduce((sum, district) => sum + Object.keys(district).length, 0), 101);
  assert.equal(Object.keys(draw.townHeads[peace.id]).length, 5);
  assert.equal(Object.values(draw.representatives[peace.id]).reduce((sum, district) => sum + Object.keys(district).length, 0), 20);
  assert.equal(Object.keys(villageDraw).length, 625);
  assert.equal(Object.values(villageDraw).reduce((sum, group) => sum + Object.keys(group).length, 0), 1112);
  assert.deepEqual(county.candidates.map(candidate => lookup(draw.numbers, candidate.name)), [1, 3, 2]);
  for (const block of county.councilors) for (const candidate of block.candidates) {
    if (candidate.name === '鄭伯其') continue;
    assert.ok(lookup(draw.councilors[block.district], candidate.name), `${block.district}: ${candidate.name}`);
  }
  for (const candidate of peace.candidates) {
    if (candidate.name === '吳天祐') continue;
    assert.ok(lookup(draw.townHeads[peace.id], candidate.name));
  }
  for (const block of peace.representatives) for (const candidate of block.candidates) {
    assert.ok(lookup(draw.representatives[peace.id][block.district], candidate.name));
  }
  const byId = new Map(villages.map(village => [village.id, village]));
  for (const [id, numbers] of Object.entries(villageDraw)) {
    const candidates = byId.get(id)?.candidates || [];
    assert.ok(byId.has(id), id);
    assert.deepEqual(Object.values(numbers).sort((a, b) => a - b), Array.from({ length: Object.keys(numbers).length }, (_, i) => i + 1), id);
    for (const [name, number] of Object.entries(numbers)) {
      const candidate = candidates.find(candidate => lookup({ [name]: number }, candidate.name) === number);
      assert.ok(candidate, `${id}: ${name}`);
      const party = candidate.party === '無黨籍' ? '無' : String(candidate.party || '').replace(/\s+/g, '');
      assert.equal(normalize(villageParties[id][name]), normalize(party), `${id}: ${name} party`);
    }
  }
});

test('Taichung frontend honors manual ballot edits and leaves unlisted people unnumbered', () => {
  const html = read('index.html');
  const numberMethod = html.slice(html.indexOf('  _ballotNo('), html.indexOf('  _showCands('));
  const app = vm.runInNewContext(`new class {${numberMethod}}`, { window: {
    FOBallotNumbers: globalThis.FOBallotNumbers,
    FOBallotNumberForName: lookup,
    FOTaichungVillageBallots: villageDraw,
  } });
  app.county = { code: '66000' };
  assert.equal(app._ballotNo({ name: '何欣純', role: '縣市長候選人' }), 1);
  assert.equal(app._ballotNo({ name: '施志昌', role: '議員候選人' }, '1'), 4);
  assert.equal(app._ballotNo({ name: '簡正忠', role: '區長候選人' }, null, peace.id), 1);
  assert.equal(app._ballotNo({ name: '管慧莉', role: '區民代表候選人' }, '1', peace.id), 2);
  assert.equal(app._ballotNo({ name: '楊文慶', role: '里長候選人' }, null, '66000230014'), 1);
  assert.equal(app._ballotNo({ name: '魏周森', role: '里長候選人' }, null, '66000230014'), null);
  assert.equal(app._ballotNo({ name: '何欣純', role: '縣市長候選人', ballotNo: 9 }), 9);
  assert.equal(app._ballotNo({ name: '何欣純', role: '縣市長候選人', ballotNo: null }), null);
  assert.equal(app._ballotNo({ name: '鄭伯其', role: '議員候選人' }, '13'), null);
});

test('Taichung admin and public pages expose official draw and review notices', () => {
  const admin = read('admin.html');
  assert.match(admin, /FOTaichungVillageBallots/);
  assert.match(admin, /FOTaichungVillageParties/);
  assert.match(admin, /townHeadParties/);
  assert.match(admin, /鄭伯其/);
  assert.match(read('election/66000.html'), /<td>1<\/td><td>何欣純/);
  assert.match(read('election/66000290.html'), /<td>1<\/td><td>簡正忠/);
  assert.match(read('election/66000230.html'), /1 號<\/strong> 楊文慶/);
});
