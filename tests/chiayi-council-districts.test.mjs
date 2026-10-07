import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

const districtMap = JSON.parse(readFileSync(new URL('../data/district_town_map.json', import.meta.url), 'utf8'));
const quotaMap = JSON.parse(readFileSync(new URL('../data/district_quota.json', import.meta.url), 'utf8'));
const county = districtMap['10010'];

test('嘉義縣 2026 議員選區與中選會 115 年公告一致', () => {
  const expected = {
    '1': ['水上鄉', '太保市', '鹿草鄉'],
    '2': ['民雄鄉', '新港鄉'],
    '3': ['大林鎮', '溪口鄉', '梅山鄉'],
    '4': ['朴子市', '六腳鄉', '東石鄉'],
    '5': ['布袋鎮', '義竹鄉'],
    '6': ['中埔鄉', '竹崎鄉', '番路鄉', '大埔鄉', '阿里山鄉'],
  };

  for (const [number, towns] of Object.entries(expected)) {
    assert.deepEqual(new Set(county.districts[number].towns), new Set(towns), `第 ${number} 選舉區`);
  }

  const assignedTowns = Object.values(expected).flat();
  assert.equal(new Set(assignedTowns).size, 18, '18 個鄉鎮市各屬一個區域選區');
  assert.deepEqual([2, 3, 6].map(number => quotaMap['10010'][number]), [8, 4, 7]);
  assert.equal(county.districts['7'].type, 'indigenous_mountain');
  assert.equal(county.districts['7'].towns.length, 0);
});

test('公開鄉鎮候選人頁顯示正確的議員選區', () => {
  const pages = {
    '10010070': 2, // 新港鄉
    '10010060': 3, // 溪口鄉
    '10010140': 6, // 竹崎鄉
    '10010180': 6, // 阿里山鄉
  };

  for (const [townId, district] of Object.entries(pages)) {
    const html = readFileSync(new URL(`../election/${townId}.html`, import.meta.url), 'utf8');
    const districts = [...html.matchAll(/屬嘉義縣議員第 (\d+) 選舉區/g)].map(match => Number(match[1]));
    assert.deepEqual(districts, [district], townId);
  }
});
