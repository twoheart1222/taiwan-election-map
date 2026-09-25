import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readdirSync, readFileSync } from 'node:fs';

const dataUrl = new URL('../data/', import.meta.url);

function candidateRows() {
  const paths = [new URL('counties.json', dataUrl)];
  for (const directory of ['towns', 'villages']) {
    for (const file of readdirSync(new URL(`${directory}/`, dataUrl)).filter(name => name.endsWith('.json'))) {
      paths.push(new URL(`${directory}/${file}`, dataUrl));
    }
  }
  const rows = [];
  for (const file of paths) {
    const topology = JSON.parse(readFileSync(file, 'utf8'));
    for (const geometry of topology.objects.map.geometries) {
      const props = geometry.properties;
      for (const candidate of props.candidates || []) rows.push({ areaId: String(props.id), candidate });
      for (const field of ['councilors', 'representatives']) {
        for (const block of props[field] || []) for (const candidate of block.candidates || []) rows.push({ areaId: String(props.id), candidate });
      }
    }
  }
  return rows;
}

test('published candidate records do not contain blank names', () => {
  const blank = candidateRows().filter(({ candidate }) => !String(candidate.name || '').trim());
  assert.deepEqual(blank, []);
});

test('official registration spellings replace known import typos', () => {
  const rows = candidateRows();
  const namesAt = areaId => rows.filter(row => row.areaId === areaId).map(row => row.candidate.name);
  assert.ok(namesAt('10004120').includes('楊仕龍'));
  assert.ok(namesAt('10015060009').includes('柯貴騰'));
  assert.ok(namesAt('64000050066').includes('吳昱勲'));
  assert.ok(namesAt('65000020110').includes('范玉琦'));
  assert.ok(namesAt('66000290004').includes('張家豐'));
  for (const typo of ['楊士龍', '柯貴腾', '吳昱勳', '范玉崎', '張嘉豐']) {
    assert.equal(rows.some(row => row.candidate.name === typo), false, `${typo} must not remain in the map data`);
  }
});

test('registration reconciliation never treats prior votes as proof of incumbency', () => {
  const script = readFileSync(new URL('../scripts/reconcile-official-registration-roster.mjs', import.meta.url), 'utf8');
  assert.doesNotMatch(script, /prevVotes[^\n]*(?:isIncumbent|現任)/);
  assert.match(script, /上屆票數只表示曾參選，不作為現任判斷依據/);
});
