import assert from 'node:assert/strict';
import fs from 'node:fs';
import test from 'node:test';
import vm from 'node:vm';
import '../data/ballot-numbers-regional-2026.js';
import '../data/ballot-audit-regional-2026.js';
import '../data/ballot-numbers-2026.js';

const read = filename => fs.readFileSync(new URL('../' + filename, import.meta.url), 'utf8');
const lookup = globalThis.FOBallotNumberForName;

test('regional draw includes ten counties and all 7,547 listed candidates', () => {
  assert.equal(Object.keys(globalThis.FORegionalBallotNumbers).length, 10);
  const sections = Object.values(globalThis.FORegionalBallotNumbers);
  const count = sections.reduce((total, ballot) => total
    + Object.keys(ballot.numbers).length
    + Object.values(ballot.councilors).reduce((sum, rows) => sum + Object.keys(rows).length, 0)
    + Object.values(ballot.townHeads).reduce((sum, rows) => sum + Object.keys(rows).length, 0)
    + Object.values(ballot.representatives).flatMap(Object.values).reduce((sum, rows) => sum + Object.keys(rows).length, 0), 0)
    + Object.values(globalThis.FORegionalVillageBallots).reduce((sum, rows) => sum + Object.keys(rows).length, 0);
  assert.equal(count, 7547);
  assert.equal(globalThis.FORegionalBallotAudit.unmatchedExisting.length, 128);
  assert.equal(globalThis.FORegionalBallotNumbers['10009'].councilors['1'], undefined);
  assert.equal(lookup(globalThis.FOBallotNumbers['10009'].councilors['1'], '黃勝志'), 1);
  assert.equal(lookup(globalThis.FOBallotNumbers['10009'].townHeads['10009010'], '尹令瑛'), 1);
});

test('public candidate numbers use regional villages, and manual values retain priority', () => {
  const html = read('index.html');
  const method = html.slice(html.indexOf('  _ballotNo('), html.indexOf('  _showCands('));
  const app = vm.runInNewContext(`new class {${method}}`, { window: {
    FOBallotNumbers: globalThis.FOBallotNumbers,
    FOBallotNumberForName: lookup,
    FORegionalVillageBallots: globalThis.FORegionalVillageBallots,
  } });
  app.county = { code: '10010' };
  assert.equal(app._ballotNo({ name: '楊麗玉', role: '里長候選人' }, null, '10010030017'), 1);
  assert.equal(app._ballotNo({ name: '楊麗玉', role: '里長候選人', ballotNo: 8 }, null, '10010030017'), 8);
  assert.equal(app._ballotNo({ name: '楊麗玉', role: '里長候選人', ballotNo: null }, null, '10010030017'), null);
  assert.equal(app._ballotNo({ name: '陳泰和', role: '里長候選人' }, null, '10010030017'), null);
});

test('admin review and static candidate pages include newly supplied draws', () => {
  const admin = read('admin.html');
  assert.match(admin, /FORegionalVillageBallots/);
  assert.match(admin, /FORegionalVillageParties/);
  assert.match(admin, /FORegionalBallotParties/);
  assert.match(admin, /既有資料未對應 128 位/);
  assert.doesNotMatch(read('index.html'), /ballot-audit-regional-2026/);
  assert.match(read('election/10010.html'), /<td>1<\/td><td>吳品叡/);
  assert.match(read('election/10010030.html'), /1 號<\/strong> 楊麗玉/);
});
