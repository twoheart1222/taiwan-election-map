import assert from 'node:assert/strict';
import fs from 'node:fs';
import test from 'node:test';
import vm from 'node:vm';
import '../data/ballot-numbers-2026.js';
import '../data/ballot-numbers-keelung-villages-2026.js';

const read = path => fs.readFileSync(new URL('../' + path, import.meta.url), 'utf8');
const html = read('index.html');
const county = globalThis.FOBallotNumbers['10017'];
const villages = globalThis.FOKeelungVillageBallots;
const partyReferences = globalThis.FOKeelungVillageParties;
const townRows = JSON.parse(read('data/towns/towns-10017.json')).objects.map.geometries.map(g => g.properties);
const villageRows = townRows.flatMap(town => JSON.parse(read(`data/villages/villages-${town.id}.json`)).objects.map.geometries.map(g => g.properties));
const numberMethod = html.slice(html.indexOf('  _ballotNo('), html.indexOf('  _showCands('));

test('Keelung draw covers 3 mayors, 59 councilors and 275 village candidates in 157 villages', () => {
  assert.equal(Object.keys(county.numbers).length, 3);
  assert.equal(Object.values(county.councilors).reduce((sum, group) => sum + Object.keys(group).length, 0), 59);
  assert.equal(Object.keys(villages).length, 157);
  assert.equal(Object.values(villages).reduce((sum, group) => sum + Object.keys(group).length, 0), 275);
  const byId = new Map(villageRows.map(village => [village.id, village]));
  for (const [id, numbers] of Object.entries(villages)) {
    const candidates = byId.get(id)?.candidates || [];
    assert.ok(byId.has(id), id);
    assert.deepEqual(Object.values(numbers).sort((a, b) => a - b), Array.from({ length: Object.keys(numbers).length }, (_, i) => i + 1), id);
    for (const [name, number] of Object.entries(numbers)) {
      assert.ok(candidates.some(candidate => globalThis.FOBallotNumberForName({ [name]: number }, candidate.name) === number), `${id}: ${name}`);
      assert.ok(partyReferences[id][name], `${id}: ${name} missing party reference`);
    }
  }
});

test('Keelung numbers respect manual edits and leave unmatched candidates unnumbered', () => {
  const app = vm.runInNewContext(`new class {${numberMethod}}`, { window: {
    FOBallotNumbers: globalThis.FOBallotNumbers,
    FOBallotNumberForName: globalThis.FOBallotNumberForName,
    FOKeelungVillageBallots: villages,
  } });
  app.county = { code: '10017' };
  assert.equal(app._ballotNo({ name: '童子瑋', role: '市長候選人' }), null);
  assert.equal(app._ballotNo({ name: '童子瑋', role: '縣市長候選人' }), 1);
  assert.equal(app._ballotNo({ name: '郭美秀', role: '議員候選人' }, '4'), 3);
  assert.equal(app._ballotNo({ name: '郭美秀', role: '議員候選人', ballotNo: 9 }, '4'), 9);
  assert.equal(app._ballotNo({ name: '張芳麗', role: '議員候選人' }, '3'), null);
  assert.equal(app._ballotNo({ name: '林國星', role: '里長候選人' }, null, '10017040004'), null);
  assert.equal(app._ballotNo({ name: '郭美秀', role: '議員候選人', ballotNo: null }, '4'), null);
});

test('Keelung party references and admin mismatch notices are available', () => {
  assert.equal(county.councilorParties['4']['郭美秀'], '中國國民黨');
  assert.equal(county.parties['童子瑋'], '民主進步黨');
  assert.match(read('admin.html'), /FOKeelungVillageParties/);
  assert.match(read('admin.html'), /抽籤名冊政黨不一致/);
  assert.match(read('admin.html'), /張芳麗/);
  assert.match(read('admin.html'), /林國星/);
  assert.match(read('scripts/build-seo-pages.mjs'), /FOKeelungVillageBallots/);
});
