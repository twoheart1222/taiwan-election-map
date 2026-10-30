import assert from 'node:assert/strict';
import fs from 'node:fs';
import test from 'node:test';
import vm from 'node:vm';
import * as cheerio from 'cheerio';
import '../data/ballot-numbers-hsinchu-county-2026.js';
import '../data/ballot-numbers-2026.js';

const read = file => fs.readFileSync(new URL('../' + file, import.meta.url), 'utf8');
const json = file => JSON.parse(read(file));
const county = json('data/counties.json').objects.map.geometries.find(g => g.properties.id === '10004').properties;
const towns = json('data/towns/towns-10004.json').objects.map.geometries.map(g => g.properties);
const villages = towns.flatMap(t => json(`data/villages/villages-${t.id}.json`).objects.map.geometries.map(g => ({ ...g.properties, town: t.name })));
const source = json('tests/fixtures/hsinchu-county-ballot-draw-2026.json');
const draw = globalThis.FOBallotNumbers['10004'];
const villageDraw = globalThis.FOHsinchuCountyVillageBallots;
const lookup = globalThis.FOBallotNumberForName;
const norm = value => value.normalize('NFKC').replace(/\s+/g, '').replace(/[·‧．・]/g, '.').replace(/啓/g, '啟');
const sourceRows = Object.entries(source).flatMap(([kind, doc]) => doc.rows.map(row => ({ ...row, kind })));
function resolve(row) {
  const town = towns.find(t => row.area.startsWith('新竹縣' + t.name));
  const district = row.area.match(/第(\d+)選舉區/)?.[1];
  const village = row.kind === '5' ? villages.find(v => row.area === '新竹縣' + v.town + v.name) : null;
  const numbers = row.kind === '1' ? draw.numbers : row.kind === '2' ? draw.councilors[district]
    : row.kind === '3' ? draw.townHeads[town.id] : row.kind === '4' ? draw.representatives[town.id][district] : villageDraw[village.id];
  const candidates = row.kind === '1' ? county.candidates : row.kind === '2' ? county.councilors.find(b => b.district === district).candidates
    : row.kind === '3' ? town.candidates : row.kind === '4' ? town.representatives.find(b => b.district === district).candidates : village.candidates;
  return { numbers, candidates, district, areaId: village?.id || town?.id || county.id };
}

test('all 716 PDF rows map to the correct office and geographical scope', () => {
  assert.deepEqual(Object.values(source).map(doc => doc.rows.length), [3, 68, 31, 248, 366]);
  assert.equal(sourceRows.length, 716);
  assert.equal(Object.keys(draw.councilors).length, 14);
  assert.equal(Object.keys(draw.townHeads).length, 13);
  assert.equal(Object.values(draw.representatives).reduce((sum, blocks) => sum + Object.keys(blocks).length, 0), 47);
  assert.equal(Object.keys(villageDraw).length, 193);
  for (const row of sourceRows) assert.equal(lookup(resolve(row).numbers, row.name), row.no, `${row.area}: ${row.name}`);
  for (const numbers of [draw.numbers, ...Object.values(draw.councilors), ...Object.values(draw.townHeads),
    ...Object.values(draw.representatives).flatMap(Object.values), ...Object.values(villageDraw)]) {
    assert.deepEqual(Object.values(numbers).sort((a, b) => a - b), Array.from({ length: Object.keys(numbers).length }, (_, i) => i + 1));
  }
});

test('front-end cards resolve all 714 existing candidates and preserve saved manual values', () => {
  const html = read('index.html');
  const method = html.slice(html.indexOf('  _ballotNo('), html.indexOf('  _showCands('));
  const app = vm.runInNewContext(`new class {${method}}`, { window: {
    FOBallotNumbers: globalThis.FOBallotNumbers, FOBallotNumberForName: lookup,
    FOHsinchuCountyVillageBallots: villageDraw,
  } });
  app.county = { code: '10004' };
  let checked = 0;
  for (const row of sourceRows) {
    const { candidates, district, areaId } = resolve(row);
    const candidate = candidates.find(c => norm(c.name) === norm(row.name));
    if (!candidate) continue;
    assert.equal(app._ballotNo(candidate, district, areaId), row.no, `${row.area}: ${row.name}`);
    assert.equal(app._ballotNo({ ...candidate, ballotNo: 99 }, district, areaId), 99);
    assert.equal(app._ballotNo({ ...candidate, ballotNo: null }, district, areaId), null);
    checked++;
  }
  assert.equal(checked, 714);
  assert.equal(app._ballotNo({ name: '陳瑞玉', role: '里長候選人' }, null, '10004020009'), 1);
  assert.equal(app._ballotNo({ name: '鍾宏達', role: '里長候選人' }, null, '10004020009'), null);
  assert.equal(app._ballotNo({ name: '何信橋', role: '村長候選人' }, null, '10004070012'), null);
});

test('county and town public pages display county, town and village ballot numbers', () => {
  const files = fs.readdirSync(new URL('../election/', import.meta.url)).filter(name => /^10004(?:\d{3})?\.html$/.test(name));
  assert.equal(files.length, 14);
  let checked = 0;
  for (const file of files) {
    const $ = cheerio.load(read('election/' + file));
    const town = towns.find(t => file === t.id + '.html');
    $('table tbody tr').each((_, row) => {
      const cells = $(row).find('td');
      const name = cells.eq(1).text().trim().replace(/\s*資格不符規定$/, '');
      const options = [draw.numbers, ...Object.values(draw.councilors), ...(town ? [draw.townHeads[town.id], ...Object.values(draw.representatives[town.id])] : [])];
      const number = options.map(numbers => lookup(numbers, name)).find(value => value !== undefined);
      if (number === undefined) return;
      assert.equal(cells.eq(0).text(), String(number), `${file}: ${name}`);checked++;
    });
    if (town) for (const village of villages.filter(v => v.id.startsWith(town.id))) {
      const row = $('table tbody tr').filter((_, el) => $(el).find('td').eq(0).text() === village.name);
      assert.equal(row.length, 1, `${file}: ${village.name}`);
      for (const candidate of village.candidates) {
        const no = lookup(villageDraw[village.id], candidate.name);
        if (no === undefined) continue;
        assert.ok(row.find('td').eq(1).text().includes(`${no} 號 ${candidate.name}（`), `${file}: ${candidate.name}`);checked++;
      }
    }
  }
  assert.ok(checked >= 714);
});

test('admin and public build load Hsinchu numbers before the main draw catalog and expose roster differences', () => {
  for (const file of ['index.html', 'admin.html']) {
    const html = read(file);
    assert.ok(html.indexOf('/data/ballot-numbers-hsinchu-county-2026.js') < html.indexOf('/data/ballot-numbers-2026.js'));
    assert.match(html, /FOHsinchuCountyVillageBallots/);
  }
  assert.match(read('scripts/build-seo-pages.mjs'), /FOHsinchuCountyVillageBallots/);
  const audit = globalThis.FOHsinchuCountyBallotAudit;
  assert.deepEqual(audit.pendingCandidates.map(c => [c.areaId, c.name, c.ballotNo]), [['10004020009', '陳瑞玉', 1], ['10004070012', '謝玉凌', 1]]);
  assert.equal(audit.unlistedExisting.length, 10);
  assert.match(read('admin.html'), /hsinchu-county-ballot-audit/);
});
