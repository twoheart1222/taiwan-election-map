import assert from 'node:assert/strict';
import fs from 'node:fs';
import test from 'node:test';
import vm from 'node:vm';
import * as cheerio from 'cheerio';
import '../data/ballot-numbers-2026.js';

const read = path => fs.readFileSync(new URL('../' + path, import.meta.url), 'utf8');
const county = JSON.parse(read('data/counties.json')).objects.map.geometries
  .find(geometry => geometry.properties.id === '10005').properties;
const draw = globalThis.FOBallotNumbers['10005'];
const lookup = globalThis.FOBallotNumberForName;
const supplied = [
  '彭賢淳 呂晟 許櫻萍 曾美露 徐筱菁 魏漢相 楊明燁 巫召清 張志宇 湯維岳 孫素娥 彭晧宇 林志豪 鄭碧玉 黃萬盛',
  '黎尚安 羅貴星 謝昌年',
  '翁杰 王建鑫 徐瑞轅 郭汶沂 杜文卿 陳薈茗 周玉滿',
  '廖英利 鄭秋風 林寶珠 吳亭亭 李文斌 邱毓興 吳翌立 謝美香 廖秀紅 張佳玲 陳碧華 蔡君婷',
  '彭茜柔 鍾孟儒 陳永賢 蕭詠萱 古益弦 陳光軒 鄭聚然 林志學 黎煥強 温俊勇 陳詩弦 張淑芬',
  '楊恭林 盛瑛 詹錦章',
  '朱仲一 風志雄',
  '黃茹君 劉美蘭',
].map(row => row.split(' '));
const registeredName = (names, short) => {
  const matches = names.filter(name => name === short || name.startsWith(short));
  assert.equal(matches.length, 1, short);
  return matches[0];
};

test('Miaoli supplied numbers match all 2 executive and 56 council candidates', () => {
  assert.deepEqual(draw.numbers, { 陳品安: 1, 鍾東錦: 2 });
  assert.equal(Object.keys(draw.councilors).length, 8);
  assert.equal(Object.values(draw.councilors).reduce((sum, rows) => sum + Object.keys(rows).length, 0), 56);
  for (const block of county.councilors) {
    const names = block.candidates.map(candidate => candidate.name);
    const expected = supplied[Number(block.district) - 1];
    assert.equal(names.length, expected.length);
    expected.forEach((short, index) => {
      assert.equal(lookup(draw.councilors[block.district], registeredName(names, short)), index + 1);
    });
  }
});

test('Miaoli cards sort every district by draw and preserve candidate records', () => {
  const html = read('index.html');
  const methods = html.slice(html.indexOf('  _ballotNo('), html.indexOf('  _partyChip(name)'));
  const box = { innerHTML: '', scrollTop: 0 };
  const app = vm.runInNewContext(`new class {${methods}}`, {
    window: { FOBallotNumbers: globalThis.FOBallotNumbers, FOBallotNumberForName: lookup },
    document: { getElementById: id => id === 'candidates' ? box : null, querySelector: () => null },
  });
  app.county = { code: '10005' };
  app._card = (candidate, district) => `${app._ballotNo(candidate, district)} ${candidate.name}|`;
  const before = structuredClone(county);
  app._showCands(county.candidates);
  assert.equal(box.innerHTML, '1 陳品安|2 鍾東錦|');
  for (const block of county.councilors) {
    app._showCands(block.candidates, block.district);
    const names = block.candidates.map(candidate => candidate.name);
    assert.equal(box.innerHTML, supplied[Number(block.district) - 1]
      .map((short, index) => `${index + 1} ${registeredName(names, short)}|`).join(''));
  }
  assert.deepEqual(county, before);
  assert.equal(app._ballotNo({ name: '陳品安', role: '縣市長候選人', ballotNo: null }), null);
});

test('Miaoli county and all town directories show the supplied ballot numbers', () => {
  const files = fs.readdirSync(new URL('../election/', import.meta.url)).filter(name => /^10005(?:\d{3})?\.html$/.test(name));
  assert.equal(files.length, 19);
  let checked = 0;
  for (const file of files) {
    const $ = cheerio.load(read('election/' + file));
    $('table').each((_, table) => {
      $(table).find('tbody tr').each((_, row) => {
        const cells = $(row).find('td');
        const name = cells.eq(1).text().trim();
        const number = [draw.numbers, ...Object.values(draw.councilors)]
          .map(numbers => lookup(numbers, name)).find(value => value !== undefined);
        if (number === undefined) return;
        assert.equal(cells.eq(0).text(), String(number), `${file}: ${name}`);
        checked++;
      });
    });
  }
  assert.ok(checked >= 58);
});
