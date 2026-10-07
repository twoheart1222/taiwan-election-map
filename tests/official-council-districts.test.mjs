import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

const read = (path) => JSON.parse(readFileSync(new URL(path, import.meta.url), 'utf8'));
const announcement = read('./fixtures/cec-1153150253-council-districts.json').counties;
const districtMap = read('../data/district_town_map.json');
const quotaMap = read('../data/district_quota.json');
const hsinchuCityTowns = { 1: '東區', 2: '東區', 3: '北區', 4: '北區', 5: '香山區' };

test('22 縣市 221 個議員選區的範圍與席次符合中選會 115 年公告', () => {
  assert.equal(Object.keys(announcement).length, 22);
  assert.equal(Object.values(announcement).reduce((count, county) => count + Object.keys(county).length, 0), 221);
  assert.deepEqual(new Set(Object.keys(districtMap)), new Set(Object.keys(announcement)));

  for (const [countyCode, districts] of Object.entries(announcement)) {
    const actual = districtMap[countyCode].districts;
    assert.deepEqual(new Set(Object.keys(actual)), new Set(Object.keys(districts)), countyCode);
    for (const [number, { scope, seats }] of Object.entries(districts)) {
      const label = `${districtMap[countyCode].countyName}第 ${number} 選舉區`;
      const district = actual[number];
      assert.equal(quotaMap[countyCode][number], seats, `${label}應選席次`);
      if (scope.includes('原住民')) {
        assert.deepEqual(district.towns, [], `${label}原住民選區不可歸入一般地區`);
        assert.equal(district.type, scope.includes('平地原住民') ? 'indigenous_plains' : 'indigenous_mountain', label);
        assert.equal(district.note, scope, label);
      } else if (district.villages) {
        assert.equal(district.towns.length, 1, label);
        const expectedTown = countyCode === '10004' ? '竹北市' : hsinchuCityTowns[number];
        assert.equal(district.towns[0], expectedTown, label);
        assert.equal(`${countyCode === '10004' ? expectedTown : ''}${district.villages.join('、')}`, scope, label);
      } else {
        assert.equal(district.towns.join('、'), scope, label);
      }
    }
  }
});

test('依里劃分的竹北市、新竹市選區與村里地圖一一對應', () => {
  for (const countyCode of ['10004', '10018']) {
    const towns = read(`../data/towns/towns-${countyCode}.json`).objects.map.geometries;
    const split = Object.values(districtMap[countyCode].districts).filter((district) => district.villages);
    for (const townName of new Set(split.map((district) => district.towns[0]))) {
      const townId = towns.find((town) => town.properties.name === townName)?.properties.id;
      assert.ok(townId, `${countyCode} ${townName}`);
      const villages = read(`../data/villages/villages-${townId}.json`).objects.map.geometries
        .map((village) => village.properties.name).filter(Boolean);
      const assigned = split.filter((district) => district.towns[0] === townName)
        .flatMap((district) => district.villages);
      assert.equal(assigned.length, new Set(assigned).size, `${townName}不可重複分配村里`);
      assert.deepEqual(new Set(assigned), new Set(villages), `${townName}每個村里都要有議員選區`);
    }
  }
});
