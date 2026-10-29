import assert from 'node:assert/strict';
import fs from 'node:fs';
import test from 'node:test';
import vm from 'node:vm';
import '../data/ballot-numbers-2026.js';
import '../data/ballot-numbers-new-taipei-villages-2026.js';

const read = path => fs.readFileSync(new URL('../' + path, import.meta.url), 'utf8');
const html = read('index.html');
const data = globalThis.FOBallotNumbers['65000'];
const villages = globalThis.FONewTaipeiVillageBallots;
const townProps = JSON.parse(read('data/towns/towns-65000.json')).objects.map.geometries.map(g => g.properties);
const allVillages = townProps.flatMap(town => JSON.parse(read(`data/villages/villages-${town.id}.json`)).objects.map.geometries.map(g => g.properties));
const numberMethod = html.slice(html.indexOf('  _ballotNo('), html.indexOf('  _showCands('));
const storeSource = read('override-store.js');
const validateMap = vm.runInNewContext(`(${storeSource.slice(storeSource.indexOf('export function validateMap'), storeSource.indexOf('function failure')).replace('export function validateMap', 'function validateMap')})`);
const browserWindow = () => ({ FOBallotNumbers: globalThis.FOBallotNumbers,
  FOBallotNumberForName: globalThis.FOBallotNumberForName,
  FONewTaipeiVillageBallots: villages });

test('New Taipei draw covers all 3 mayors, 111 councilors, 3 Wulai heads, 14 representatives and 1653 village candidates', () => {
  assert.equal(Object.keys(data.numbers).length, 3);
  assert.equal(Object.values(data.councilors).reduce((sum, block) => sum + Object.keys(block).length, 0), 111);
  assert.equal(Object.keys(data.townHeads['65000290']).length, 3);
  assert.equal(Object.values(data.representatives['65000290']).reduce((sum, block) => sum + Object.keys(block).length, 0), 14);
  assert.equal(Object.keys(villages).length, 1036);
  assert.equal(Object.values(villages).reduce((sum, block) => sum + Object.keys(block).length, 0), 1653);
  const byId = new Map(allVillages.map(village => [village.id, village]));
  for (const [id, numbers] of Object.entries(villages)) {
    const village = byId.get(id);
    assert.ok(village, id);
    assert.deepEqual(Object.values(numbers).sort((a, b) => a - b), Array.from({ length: Object.keys(numbers).length }, (_, i) => i + 1), id);
    for (const name of Object.keys(numbers)) {
      assert.ok((village.candidates || []).some(candidate => globalThis.FOBallotNumberForName({ [name]: 1 }, candidate.name) === 1), `${id}: ${name}`);
    }
  }
});

test('manual ballot number wins, explicit hiding persists, and unmatched records remain unnumbered', () => {
  const app = vm.runInNewContext(`new class {${numberMethod}}`, { window: browserWindow() });
  app.county = { code: '65000' };
  assert.equal(app._ballotNo({ name: '蘇輝湟', role: '直轄市長候選人' }), 2);
  assert.equal(app._ballotNo({ name: '蘇輝湟', role: '直轄市長候選人', ballotNo: 9 }), 9);
  assert.equal(app._ballotNo({ name: '蘇輝湟', role: '直轄市長候選人', ballotNo: null }), null);
  assert.equal(app._ballotNo({ name: '林正峰', role: '市議員候選人' }, '10'), null);
  assert.equal(app._ballotNo({ name: '周大為', role: '里長候選人' }, null, '65000130037'), 2);
  assert.equal(app._ballotNo({ name: '鄭啟賢', role: '里長候選人' }, null, allVillages.find(v => v.name === '萬順里')?.id), 2);
  assert.equal(app._ballotNo({ name: '游再發', role: '區民代表候選人' }, '3', '65000290'), null);
});

test('backend accepts integer or explicit hidden ballot number and rejects invalid manual values', () => {
  for (const value of [1, 999, null]) assert.doesNotThrow(() => validateMap({ '65000': { candidates: [{ name: '測試', ballotNo: value }] } }));
  for (const value of [0, 1000, '1', 1.5, '']) assert.throws(() => validateMap({ '65000': { candidates: [{ name: '測試', ballotNo: value }] } }), /號次/);
  assert.match(read('admin.html'), /class="c-ballot-mode/);
  assert.match(read('admin.html'), /class="c-ballot-no/);
  assert.match(read('admin.html'), /10\/27 抽籤名冊未對應/);
});

test('official second registrations are included without discarding prior village candidates', () => {
  const xiujing = allVillages.find(v => v.id === '65000030030');
  const yuanxin = allVillages.find(v => v.id === '65000130037');
  assert.deepEqual(['李蘇秀梅', '林均澔'].map(name => xiujing.candidates.find(c => c.name === name)?.party), ['無', '無']);
  assert.deepEqual(['杜書文', '周大為', '陶莉莉', '張庭瑋'].map(name => yuanxin.candidates.find(c => c.name === name)?.party), ['無', '無', '無', '無']);
  assert.ok(xiujing.candidates.some(c => c.name === '李淙河'));
  assert.ok(yuanxin.candidates.some(c => c.name === '杜萬來'));
});
