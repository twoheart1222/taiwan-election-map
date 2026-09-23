import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import vm from 'node:vm';

const readJson = async file => JSON.parse(await readFile(new URL(`../${file}`, import.meta.url), 'utf8'));

test('historical election profiles cover every year and normalized county', async () => {
  const [national, countyArchive] = await Promise.all([
    readJson('data/history/presidential.json'),
    readJson('data/history/presidential-counties.json'),
  ]);
  assert.equal(national.elections.length, 8);
  for (const election of national.elections) {
    assert.equal(election.votesCast, election.validVotes + election.invalidVotes, `${election.year} national ballot arithmetic`);
    assert.ok(election.electors > election.votesCast, `${election.year} national electors`);
    const counties = countyArchive.years[String(election.year)].counties;
    assert.equal(Object.keys(counties).length, 22, `${election.year} current county coverage`);
    for (const [name, result] of Object.entries(counties)) {
      assert.equal(result.votesCast, result.validVotes + result.invalidVotes, `${election.year} ${name} ballot arithmetic`);
      assert.ok(result.turnout > 0 && result.turnout <= 100, `${election.year} ${name} turnout`);
    }
  }
});

test('official CEC artifacts cover every presidential township and local executive race', async () => {
  const [national, counties, towns, localExecutives, localScript] = await Promise.all([
    readJson('data/history/presidential.json'),
    readJson('data/history/presidential-counties.json'),
    readJson('data/history/presidential-towns.json'),
    readJson('data/history/local-executive.json'),
    readFile(new URL('../history/local-executive.js', import.meta.url), 'utf8'),
  ]);
  const artifactText = JSON.stringify({ national, counties, towns, localExecutives });
  assert.match(artifactText, /db\.cec\.gov\.tw/);
  assert.doesNotMatch(artifactText, /kiang|MISNUK|everdark/i);
  assert.doesNotMatch(localScript, /raw\.githubusercontent\.com|kiang|MISNUK|everdark/i);

  assert.deepEqual(towns.coverage, [1996, 2000, 2004, 2008, 2012, 2016, 2020, 2024]);
  for (const election of national.elections) {
    const year = String(election.year);
    const countyResults = counties.years[year].counties;
    const townCounties = towns.years[year].counties;
    assert.equal(Object.values(townCounties).reduce((sum, entries) => sum + Object.keys(entries).length, 0), 368, `${year} township coverage`);
    for (const [county, result] of Object.entries(countyResults)) {
      for (const candidate of result.candidates) {
        const townVotes = Object.values(townCounties[county]).reduce((sum, town) => sum + (town.candidates.find(item => String(item.no) === String(candidate.no))?.votes || 0), 0);
        assert.equal(townVotes, candidate.votes, `${year} ${county} candidate ${candidate.no} township sum`);
      }
    }
  }

  const localExpected = { '1994': 2, '1998': 25, '2002': 25, '2006': 25, '2010': 22, '2014': 22, '2018': 22, '2022': 22 };
  assert.deepEqual(localExecutives.coverage, Object.keys(localExpected).map(Number));
  for (const [year, expected] of Object.entries(localExpected)) {
    const races = localExecutives.years[year].races;
    assert.equal(Object.keys(races).length, expected, `${year} local executive coverage`);
    for (const [county, race] of Object.entries(races)) {
      assert.equal(race.candidates.reduce((sum, candidate) => sum + candidate.votes, 0), race.validVotes, `${year} ${county} valid votes`);
      assert.equal(race.candidates.filter(candidate => candidate.elected).length, 1, `${year} ${county} elected candidate`);
    }
  }
  assert.equal(localExecutives.years['1994'].complete, false);
  assert.deepEqual(localExecutives.years['2006'].currentAreas['臺中市'].sort(), ['臺中市', '臺中縣']);
  assert.deepEqual(localExecutives.years['2010'].dates, ['2009-12-05', '2010-11-27']);
  assert.equal(localExecutives.years['2022'].races['嘉義市'].note, '2022-12-18 重行選舉');
});

test('history page script compiles and exposes the overview renderers', async () => {
  const html = await readFile(new URL('../history/index.html', import.meta.url), 'utf8');
  const scripts = [...html.matchAll(/<script\b([^>]*)>([\s\S]*?)<\/script>/gi)]
    .filter(match => !/src=|application\/ld\+json/.test(match[1]));
  scripts.forEach((match, index) => new vm.Script(match[2], { filename: `history/index.html#${index}` }));
  assert.match(html, /function renderInsights\(/);
  assert.match(html, /得票率低於 5% 列為其他/);
});
