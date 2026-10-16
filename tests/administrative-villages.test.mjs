import assert from 'node:assert/strict';
import fs from 'node:fs';
import test from 'node:test';
import * as cheerio from 'cheerio';
import '../election-data.js';

const root = new URL('../', import.meta.url);
const read = file => fs.readFileSync(new URL(file, root), 'utf8');

test('Nangan keeps its offshore geometry but counts nine named villages and all 15 candidates', () => {
  const topo = JSON.parse(read('data/villages/villages-09007010.json'));
  const shapes = topo.objects.map.geometries;
  const villages = shapes.map(g => g.properties).filter(ElectionData.isAdministrativeVillage);
  assert.equal(shapes.length, 48, 'offshore geometry must not be deleted');
  assert.equal(villages.length, 9);
  assert.deepEqual(villages.map(v => v.name).sort(), ['介壽村', '仁愛村', '復興村', '津沙村', '清水村', '珠螺村', '福沃村', '四維村', '馬祖村'].sort());
  assert.equal(villages.reduce((n, v) => n + v.candidates.length, 0), 15);
  assert.equal(shapes.filter(g => !ElectionData.isAdministrativeVillage(g.properties)).flatMap(g => g.properties.candidates || []).length, 0);
});

test('generated Nangan directory has nine real rows and matching metadata', () => {
  const $ = cheerio.load(read('election/09007010.html'));
  const table = $('h2').filter((_, h) => $(h).text() === '南竿鄉村里長候選人').next('table');
  assert.equal(table.find('tbody tr').length, 9);
  table.find('tbody tr').each((_, row) => assert.ok($(row).find('td').first().text().trim()));
  assert.match($('main').text(), /轄內共 9 個村里，村里長候選人 15 人/);
  assert.match($('meta[name="description"]').attr('content'), /9 個村里/);
  assert.doesNotMatch($('main').text(), /尚無登記/);
});

test('excluding unnamed cartographic shapes does not discard any candidate in village source files', () => {
  for (const file of fs.readdirSync(new URL('data/villages/', root)).filter(f => f.endsWith('.json'))) {
    const topo = JSON.parse(read(`data/villages/${file}`));
    for (const g of topo.objects.map.geometries) {
      if (!ElectionData.isAdministrativeVillage(g.properties)) {
        assert.equal((g.properties?.candidates || []).length, 0, `${file}: ${g.properties?.id}`);
      }
    }
  }
});
