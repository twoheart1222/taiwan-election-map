import assert from 'node:assert/strict';
import fs from 'node:fs';
import test from 'node:test';
import vm from 'node:vm';
import * as cheerio from 'cheerio';
import '../data/ballot-numbers-2026.js';

const html = fs.readFileSync(new URL('../index.html', import.meta.url), 'utf8');
const county = JSON.parse(fs.readFileSync(new URL('../data/counties.json', import.meta.url), 'utf8'))
  .objects.map.geometries.find(g => g.properties.id === '64000').properties;
const numbers = globalThis.FOBallotNumbers['64000'];
const numberMethod = html.slice(html.indexOf('  _ballotNo('), html.indexOf('  _showCands('));
const showMethod = html.slice(html.indexOf('  _showCands('), html.indexOf('  _partyChip(name)'));
const browserWindow = () => ({ FOBallotNumbers: globalThis.FOBallotNumbers, FOBallotNumberForName: globalThis.FOBallotNumberForName });

test('Kaohsiung draw covers five mayors and all 101 councilors across fifteen districts', () => {
  assert.deepEqual(Object.values(numbers.numbers).sort((a, b) => a - b), [1, 2, 3, 4, 5]);
  assert.deepEqual(county.candidates.map(c => globalThis.FOBallotNumberForName(numbers.numbers, c.name)).sort((a, b) => a - b), [1, 2, 3, 4, 5]);
  assert.equal(Object.keys(numbers.councilors).length, 15);
  assert.equal(Object.values(numbers.councilors).reduce((count, district) => count + Object.keys(district).length, 0), 101);
  for (const block of county.councilors) {
    const district = numbers.councilors[block.district];
    assert.ok(district, `missing district ${block.district}`);
    assert.deepEqual(Object.values(district).sort((a, b) => a - b), Array.from({ length: block.candidates.length }, (_, i) => i + 1));
    const mapped = block.candidates.map(c => globalThis.FOBallotNumberForName(district, c.name));
    assert.deepEqual(mapped.sort((a, b) => a - b), Array.from({ length: block.candidates.length }, (_, i) => i + 1), `district ${block.district}`);
  }
  assert.equal(globalThis.FOBallotNumberForName(numbers.councilors['14'], '高忠德Taki ludun‧Anu'), 3);
});

test('the Kaohsiung mayor roster sorts by ballot number and preserves manual fields', () => {
  const box = { innerHTML: '', scrollTop: 0 };
  const document = { getElementById: id => id === 'candidates' ? box : null, querySelector: () => null };
  const app = vm.runInNewContext(`new class {${numberMethod}${showMethod}}`, { window: browserWindow(), document });
  app.county = { code: '64000' };
  app._card = c => `<p>${app._ballotNo(c)} ${c.name}</p>`;
  const candidates = county.candidates.map(c => ({ ...c, photoUrl: 'https://example.com/manual.jpg' }));
  const before = structuredClone(candidates);
  app._showCands(candidates);
  assert.equal(box.innerHTML, '<p>1 張靜</p><p>2 王肇民</p><p>3 柯志恩</p><p>4 洪方隆</p><p>5 賴瑞隆</p>');
  assert.deepEqual(candidates, before);
  assert.equal(app._ballotNo({ ...candidates[0], ballotNo: null }), null);
});

test('district fourteen handles the saved Indigenous name variant without changing it', () => {
  const box = { innerHTML: '', scrollTop: 0 };
  const document = { getElementById: id => id === 'candidates' ? box : null, querySelector: () => null };
  const app = vm.runInNewContext(`new class {${numberMethod}${showMethod}}`, { window: browserWindow(), document });
  app.county = { code: '64000' };
  app._card = (c, district) => `<p>${app._ballotNo(c, district)} ${c.name}</p>`;
  const candidates = county.councilors.find(b => b.district === '14').candidates.map(c => c.name.startsWith('高忠德')
    ? { ...c, name: '高忠德Taki ludun‧Anu' } : c);
  app._showCands(candidates, '14');
  assert.equal(box.innerHTML, '<p>1 洪英雄Salizan．binkinuan</p><p>2 林錫閔</p><p>3 高忠德Taki ludun‧Anu</p>');
  assert.equal(candidates.find(c => c.name.startsWith('高忠德')).name, '高忠德Taki ludun‧Anu');
});

test('published Kaohsiung county and district pages use the same numbers', () => {
  const electionDir = new URL('../election/', import.meta.url);
  const $county = cheerio.load(fs.readFileSync(new URL('64000.html', electionDir), 'utf8'));
  const mayorTable = $county('h2').filter((_, heading) => $county(heading).text().includes('市長候選人')).first().next('table');
  assert.deepEqual(mayorTable.find('tbody tr').map((_, row) => $county(row).find('td').eq(1).text()).get(), ['張靜', '王肇民', '柯志恩', '洪方隆', '賴瑞隆']);
  const districtFourteen = $county('h3').filter((_, heading) => $county(heading).text().includes('第 14 選舉區')).first().next('table');
  assert.equal(districtFourteen.find('tbody tr').last().find('td').eq(0).text(), '3');
  assert.match(districtFourteen.find('tbody tr').last().find('td').eq(1).text(), /^高忠德/);
  const files = fs.readdirSync(electionDir).filter(name => /^64000\d{3}\.html$/.test(name));
  assert.equal(files.length, 38);
  for (const file of files) {
    const $ = cheerio.load(fs.readFileSync(new URL(file, electionDir), 'utf8'));
    $('h2').filter((_, heading) => /高雄市議員第\s*\d+\s*選舉區候選人/.test($(heading).text())).each((_, heading) => {
      const district = $(heading).text().match(/第\s*(\d+)\s*選舉區/)[1];
      const rows = $(heading).nextAll('table').first().find('tbody tr');
      assert.ok(rows.length > 0, `${file}: district ${district}`);
      rows.each((_, row) => {
        const cells = $(row).find('td');
        const name = cells.eq(1).text().trim();
        assert.equal(cells.eq(0).text(), String(globalThis.FOBallotNumberForName(numbers.councilors[district], name)), `${file}: ${name}`);
      });
    });
  }
});
