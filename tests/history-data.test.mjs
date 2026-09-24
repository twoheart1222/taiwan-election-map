import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFile, stat } from 'node:fs/promises';
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
  const [html, enhancements] = await Promise.all([
    readFile(new URL('../history/index.html', import.meta.url), 'utf8'),
    readFile(new URL('../history/archive-enhancements.js', import.meta.url), 'utf8'),
  ]);
  const scripts = [...html.matchAll(/<script\b([^>]*)>([\s\S]*?)<\/script>/gi)]
    .filter(match => !/src=|application\/ld\+json/.test(match[1]));
  scripts.forEach((match, index) => new vm.Script(match[2], { filename: `history/index.html#${index}` }));
  assert.match(html, /function renderInsights\(/);
  assert.match(html, /得票率低於 5% 列為其他/);
  assert.doesNotMatch(html, /fetch\(['"]\.\.\/data\/history\/presidential-towns\.json/,
    'the history landing page must not eagerly fetch the multi-megabyte township archive');
  assert.match(html, /window\.__historyArchiveDataPromise/);
  assert.match(enhancements, /await window\.__historyArchiveDataPromise/,
    'enhancements should reuse the already parsed landing-page data');
  assert.doesNotMatch(enhancements, /fetch\(['"]\.\.\/data\/history\/presidential(?:-counties)?\.json/,
    'enhancements must not parse the same presidential data a second time');
});

test('history pages use a lightweight county-only topology', async () => {
  const [full, compact, compactStat, fullStat, historyHtml, localScript, councilorScript] = await Promise.all([
    readJson('data/counties.json'),
    readJson('data/history/counties.topo.json'),
    stat(new URL('../data/history/counties.topo.json', import.meta.url)),
    stat(new URL('../data/counties.json', import.meta.url)),
    readFile(new URL('../history/index.html', import.meta.url), 'utf8'),
    readFile(new URL('../history/local-executive.js', import.meta.url), 'utf8'),
    readFile(new URL('../history/councilor.js', import.meta.url), 'utf8'),
  ]);
  const objectOf = topology => topology.objects[Object.keys(topology.objects)[0]];
  const namesOf = topology => objectOf(topology).geometries.map(item => item.properties.name).sort((a, b) => a.localeCompare(b, 'zh-Hant'));
  assert.deepEqual(namesOf(compact), namesOf(full));
  assert.equal(objectOf(compact).geometries.length, 22);
  assert.ok(compactStat.size < fullStat.size * 0.05, 'history topology should stay below 5% of the candidate-rich source file');
  assert.doesNotMatch(JSON.stringify(compact), /candidates|councilors|villages/);
  for (const source of [historyHtml, localScript, councilorScript]) {
    assert.match(source, /data\/history\/counties\.topo\.json/);
  }
});

test('presidential and local executive archives share the councilor result palette', async () => {
  const [presidentHtml, executiveHtml, palette] = await Promise.all([
    readFile(new URL('../history/index.html', import.meta.url), 'utf8'),
    readFile(new URL('../history/local-executive.html', import.meta.url), 'utf8'),
    readFile(new URL('../history/election-palette.css', import.meta.url), 'utf8'),
  ]);
  assert.match(presidentHtml, /href="\.\/election-palette\.css"/);
  assert.match(executiveHtml, /href="\.\/election-palette\.css"/);
  assert.match(palette, /body\.history-archive \.map-panel[\s\S]*background:#e9e2d6/);
  assert.match(palette, /body\.history-archive \.result-panel[\s\S]*background:#eee9df/);
  assert.match(palette, /body\.local-executive-page \.local-result[\s\S]*background:#eee9df/);
  assert.match(palette, /body\.local-executive-page \.local-candidate:not\(\.elected\)/);
});

test('official CEC councilor archive covers every published cycle, council and district', async () => {
  const [archive, script, html, css] = await Promise.all([
    readJson('data/history/councilor.json'),
    readFile(new URL('../history/councilor.js', import.meta.url), 'utf8'),
    readFile(new URL('../history/councilor.html', import.meta.url), 'utf8'),
    readFile(new URL('../history/councilor.css', import.meta.url), 'utf8'),
  ]);
  assert.deepEqual(archive.coverage, [1994, 1998, 2002, 2006, 2010, 2014, 2018, 2022]);
  assert.match(JSON.stringify(archive.source), /db\.cec\.gov\.tw/);
  assert.doesNotMatch(JSON.stringify(archive), /kiang|MISNUK|everdark/i);
  assert.doesNotMatch(script, /raw\.githubusercontent\.com|kiang|MISNUK|everdark/i);
  const expected = {
    '1994': [2, 14, 96], '1998': [25, 207, 983], '2002': [25, 208, 992], '2006': [25, 208, 1032],
    '2010': [22, 213, 890], '2014': [22, 217, 898], '2018': [22, 214, 908], '2022': [22, 215, 906],
  };
  for (const [year, [councils, districts, seats]] of Object.entries(expected)) {
    const entry = archive.years[year];
    assert.equal(entry.countyCount, councils, `${year} council coverage`);
    assert.equal(entry.districtCount, districts, `${year} district coverage`);
    assert.equal(entry.stats.electedSeats, seats, `${year} elected seats`);
    for (const county of Object.values(entry.counties)) {
      assert.equal(county.districts.reduce((sum, district) => sum + district.electedSeats, 0), county.stats.electedSeats, `${year} ${county.area} seats`);
      for (const district of county.districts) {
        assert.equal(district.candidates.reduce((sum, candidate) => sum + candidate.votes, 0), district.validVotes, `${year} ${county.area} ${district.name} votes`);
        assert.equal(district.candidates.filter(candidate => candidate.elected).length, district.electedSeats, `${year} ${county.area} ${district.name} elected`);
      }
    }
  }
  assert.equal(archive.years['1994'].complete, false);
  assert.equal(archive.years['2022'].stats.candidateCount, 1677);
  assert.deepEqual(archive.years['2006'].currentAreas['臺中市'].sort(), ['臺中市', '臺中縣']);
  new vm.Script(script, { filename: 'history/councilor.js' });
  assert.match(html, /id="councilor-national-overview"[^>]*open/);
  assert.match(html, /id="councilor-area-select"/);
  assert.match(html, /id="councilor-map-a"/);
  assert.match(html, /id="councilor-map-b"/);
  assert.match(html, /id="councilor-compare-chart"/);
  assert.match(script, /councilorPartyBadgeFallback/);
  assert.match(script, /function electedStamp\(/);
  assert.match(script, /function drawComparisonMaps\(/);
  assert.match(script, /classList\.toggle\('compare-map-active',mode==='compare'\)/);
  assert.match(script, /<em>展開查看更多<\/em>/);
  assert.doesNotMatch(script, /class="councilor-district"\$\{i===0\?' open'/);
  assert.match(css, /\.councilor-page\{[^}]*--red:#E4022B/);
  assert.match(css, /\.councilor-page\.compare-map-active \.councilor-compare-maps\{display:grid\}/);
  assert.match(css, /\.councilor-page \.party-badge img[^}]*object-fit:contain/);
  assert.match(css, /\.councilor-status \.local-elected-stamp/);
});
