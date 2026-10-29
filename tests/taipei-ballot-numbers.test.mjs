import assert from 'node:assert/strict';
import fs from 'node:fs';
import test from 'node:test';
import vm from 'node:vm';
import * as cheerio from 'cheerio';
import '../data/ballot-numbers-2026.js';
import '../data/ballot-numbers-taipei-villages-2026.js';

const read = file => fs.readFileSync(new URL('../' + file, import.meta.url), 'utf8');
const html = read('index.html');
const county = JSON.parse(read('data/counties.json')).objects.map.geometries.find(g => g.properties.id === '63000').properties;
const towns = JSON.parse(read('data/towns/towns-63000.json')).objects.map.geometries.map(g => g.properties);
const villages = towns.flatMap(town => JSON.parse(read(`data/villages/villages-${town.id}.json`)).objects.map.geometries.map(g => g.properties));
const ballot = globalThis.FOBallotNumbers['63000'];
const villageBallots = globalThis.FOTaipeiVillageBallots;
const numberMethod = html.slice(html.indexOf('  _ballotNo('), html.indexOf('  _showCands('));
const showMethod = html.slice(html.indexOf('  _showCands('), html.indexOf('  _partyChip(name)'));
const browserWindow = () => ({
  FOBallotNumbers: globalThis.FOBallotNumbers,
  FOBallotNumberForName: globalThis.FOBallotNumberForName,
  FOTaipeiVillageBallots: villageBallots,
});

test('Taipei draw covers six mayors, 97 councilors, and 812 village candidates in 455 villages', () => {
  assert.deepEqual(county.candidates.map(c => globalThis.FOBallotNumberForName(ballot.numbers, c.name)).sort((a, b) => a - b), [1, 2, 3, 4, 5, 6]);
  assert.equal(Object.keys(ballot.councilors).length, 8);
  assert.equal(Object.values(ballot.councilors).reduce((n, district) => n + Object.keys(district).length, 0), 97);
  for (const block of county.councilors) {
    const district = ballot.councilors[block.district];
    const drawn = block.candidates.map(c => globalThis.FOBallotNumberForName(district, c.name)).filter(Number.isInteger).sort((a, b) => a - b);
    assert.deepEqual(drawn, Array.from({ length: Object.keys(district).length }, (_, i) => i + 1), `council district ${block.district}`);
  }
  assert.equal(ballot.councilors['6']['游智彬'], undefined);
  assert.equal(Object.keys(villageBallots).length, 455);
  assert.equal(Object.values(villageBallots).reduce((n, area) => n + Object.keys(area).length, 0), 812);
  const byId = new Map(villages.map(v => [v.id, v]));
  for (const [id, numbers] of Object.entries(villageBallots)) {
    const village = byId.get(id);
    assert.ok(village, `unknown village ${id}`);
    assert.deepEqual(Object.values(numbers).sort((a, b) => a - b), Array.from({ length: Object.keys(numbers).length }, (_, i) => i + 1), id);
    for (const name of Object.keys(numbers)) {
      assert.ok(village.candidates.some(c => globalThis.FOBallotNumberForName({ [name]: 1 }, c.name) === 1), `${id}: ${name}`);
    }
  }
  assert.equal(globalThis.FOBallotNumberForName(villageBallots['63000010004'], '不存在'), undefined);
});

test('Taipei village cards sort by village number and leave unlisted candidates without numbers', () => {
  const box = { innerHTML: '', scrollTop: 0 };
  const document = { getElementById: id => id === 'candidates' ? box : null, querySelector: () => null };
  const app = vm.runInNewContext(`new class {${numberMethod}${showMethod}}`, { window: browserWindow(), document });
  app.county = { code: '63000' };
  app._card = (c, district, areaId) => `<p>${app._ballotNo(c, district, areaId) ?? '—'} ${c.name}</p>`;
  const sanmin = villages.find(v => v.id === '63000010004');
  app._showCands(sanmin.candidates, null, sanmin.id);
  assert.equal(box.innerHTML, '<p>1 李士得</p><p>2 謝翠鈴</p>');
  const zhuangjing = villages.find(v => v.id === '63000010002');
  app._showCands(zhuangjing.candidates, null, zhuangjing.id);
  assert.equal(box.innerHTML, '<p>1 周政諭</p><p>— 陳宏義</p>');
  assert.equal(app._ballotNo({ ...sanmin.candidates[0], ballotNo: null }, null, sanmin.id), null);
});

test('Taipei search and map cards resolve village name variants without replacing photos', () => {
  const cardMethod = html.slice(html.indexOf('  _card('), html.indexOf('  _districtCoverage(code, number)'));
  const app = vm.runInNewContext(`new class {${numberMethod}${cardMethod}}`, { window: browserWindow() });
  Object.assign(app, { county: { code: '63000' }, _partyChip: () => '', _normalizeSearch: value => value, _socialIcon: () => '' });
  const village = villages.find(v => v.id === '63000020003');
  const candidate = village?.candidates.find(c => c.name === '吉娃斯．吉果');
  assert.ok(candidate);
  const $ = cheerio.load(app._card({ ...candidate, areaId: village.id, photoUrl: 'https://example.com/manual.jpg' }));
  assert.equal($('.bn-ballot-no').text(), '2');
  assert.equal($('.bn-ballot-no').next().hasClass('bn-photo'), true);
  assert.equal($('.bn-photo img').attr('src'), 'https://example.com/manual.jpg');
});

test('published Taipei county and town pages carry the drawn numbers', () => {
  const $county = cheerio.load(read('election/63000.html'));
  const mayorTable = $county('h2').filter((_, heading) => $county(heading).text().includes('市長候選人')).first().next('table');
  assert.deepEqual(mayorTable.find('tbody tr').map((_, row) => $county(row).find('td').eq(1).text()).get(), ['郭璽', '林志成', '沈伯洋', '蕭文乾', '蔣萬安', '唐新民']);
  const districtSix = $county('h3').filter((_, heading) => $county(heading).text().includes('第 6 選舉區')).first().next('table');
  assert.equal(districtSix.find('tbody tr').last().find('td').eq(0).text(), '—');
  assert.match(districtSix.find('tbody tr').last().find('td').eq(1).text(), /^游智彬/);
  let totalNumbers = 0;
  for (const town of towns) {
    const $ = cheerio.load(read(`election/${town.id}.html`));
    const heading = $('h2').filter((_, node) => $(node).text().includes(`${town.name}村里長候選人`)).first();
    const villageTable = heading.next('table');
    assert.ok(villageTable.length, town.name);
    totalNumbers += villageTable.find('td strong').filter((_, strong) => /\d+ 號/.test($(strong).text())).length;
  }
  assert.equal(totalNumbers, 812);
});
