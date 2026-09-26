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
  assert.match(html, /partyVoteBadge\(c\.partyKey,22\)/);
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
  const [presidentHtml, presidentScript, presidentCss, executiveHtml, executiveScript, palette] = await Promise.all([
    readFile(new URL('../history/index.html', import.meta.url), 'utf8'),
    readFile(new URL('../history/archive-enhancements.js', import.meta.url), 'utf8'),
    readFile(new URL('../history/archive-enhancements.css', import.meta.url), 'utf8'),
    readFile(new URL('../history/local-executive.html', import.meta.url), 'utf8'),
    readFile(new URL('../history/local-executive.js', import.meta.url), 'utf8'),
    readFile(new URL('../history/election-palette.css', import.meta.url), 'utf8'),
  ]);
  assert.match(presidentHtml, /href="\.\/election-palette\.css(?:\?[^\"]*)?"/);
  assert.match(executiveHtml, /href="\.\/election-palette\.css(?:\?[^\"]*)?"/);
  assert.match(palette, /body\.history-archive \.map-panel[\s\S]*background:#e9e2d6/);
  assert.match(palette, /body\.history-archive \.result-panel[\s\S]*background:#eee9df/);
  assert.match(palette, /body\.local-executive-page \.local-result[\s\S]*background:#eee9df/);
  assert.match(palette, /body\.local-executive-page \.local-candidate:not\(\.elected\)/);
  assert.match(palette, /body\.councilor-page \.councilor-candidate\.elected\{border-color:#fff/);
  assert.match(palette, /box-shadow:inset 0 0 0 2px #fff/);
  assert.match(presidentHtml, /id="president-election-overview"[^>]*open/);
  assert.match(presidentHtml, /id="president-area-select"/);
  assert.match(executiveHtml, /id="local-election-overview"[^>]*open/);
  assert.match(executiveHtml, /id="local-election-stats"/);
  assert.match(executiveHtml, /id="local-area-select"/);
  assert.match(presidentHtml, /id="archive-map-a"/);
  assert.match(presidentHtml, /id="archive-map-b"/);
  assert.match(presidentHtml, /class="result-panel"[\s\S]*id="archive-compare-result"[\s\S]*id="archive-single-result"/);
  assert.match(executiveHtml, /id="local-exec-map-a"/);
  assert.match(executiveHtml, /id="local-exec-map-b"/);
  assert.match(executiveHtml, /id="local-exec-compare-chart"/);
  assert.match(presidentScript, /function drawComparisonMaps\(/);
  assert.match(presidentScript, /partyVoteBadge\(wA\?\.partyKey/);
  assert.match(presidentCss, /candidate\.elected\.archive-elected-card:hover\{[^}]*border-color:#fff!important/);
  assert.match(presidentScript, /id="archive-compare-chart"/);
  assert.match(presidentScript, /result\.innerHTML=.*archive-compare-body/);
  assert.match(executiveScript, /function renderElectionStats\(/);
  assert.match(executiveScript, /function drawLocalComparisonMaps\(/);
  assert.match(executiveScript, /classList\.toggle\('local-compare-active',mode==='compare'\)/);
  assert.match(palette, /\.archive-result-disclosure:not\(\[open\]\)/);
  assert.match(palette, /body\.archive-comparing \.archive-query-shell/);
  assert.match(palette, /body\.compare-map-active \.local-query-shell/);
  assert.match(palette, /body\.archive-comparing #archive-compare-maps/);
  assert.match(palette, /body\.local-compare-active #local-exec-compare-maps/);
});

test('township results keep the production route, initial selection, and paper palette stable', async () => {
  const [html, productUi, palette, archiveCss, localCss] = await Promise.all([
    readFile(new URL('../history/town.html', import.meta.url), 'utf8'),
    readFile(new URL('../history/product-ui.js', import.meta.url), 'utf8'),
    readFile(new URL('../history/election-palette.css', import.meta.url), 'utf8'),
    readFile(new URL('../history/archive-enhancements.css', import.meta.url), 'utf8'),
    readFile(new URL('../history/local-executive.css', import.meta.url), 'utf8'),
  ]);
  const scripts = [...html.matchAll(/<script\b([^>]*)>([\s\S]*?)<\/script>/gi)]
    .filter(match => !/src=|application\/ld\+json/.test(match[1]));
  scripts.forEach((match, index) => new vm.Script(match[2], { filename: `history/town.html#${index}` }));
  assert.match(productUi, /\/\\\/town\(\?:\\\.html\)\?\\\/\?\$\/i/,
    'the extensionless production route must still be recognized as the township page');
  assert.match(html, /<body class="history-product history-town">/);
  assert.match(html, /href="\.\/election-palette\.css(?:\?[^\"]*)?"/);
  assert.match(html, /if\(initialTown\)renderTownDetail\(initialTown\)/,
    'a county should open with a valid township result instead of an empty detail state');
  assert.match(html, /new ResizeObserver\(scheduleDraw\)/,
    'the map should redraw after its final responsive panel size is known');
  assert.match(html, /featureTown\(d\)===normalize\(selected\)\?' selected'/,
    'responsive redraws must preserve the selected township on the map');
  assert.match(palette, /body\.history-town \.map-panel\{[^}]*background:#e9e2d6/);
  assert.match(palette, /body\.history-town \.side\{[^}]*background:#eee9df/);
  assert.match(archiveCss, /\.archive-query-shell\{position:relative;top:auto/);
  assert.match(localCss, /\.local-query-shell\{position:relative;top:auto/);
});

test('history pages share spring-driven interaction feedback with reduced-motion support', async () => {
  const [productUi, productCss, motion, premium, archivePage] = await Promise.all([
    readFile(new URL('../history/product-ui.js', import.meta.url), 'utf8'),
    readFile(new URL('../history/product-ui.css', import.meta.url), 'utf8'),
    readFile(new URL('../assets/ui/fo-motion.js', import.meta.url), 'utf8'),
    readFile(new URL('../history/premium.js', import.meta.url), 'utf8'),
    readFile(new URL('../history/index.html', import.meta.url), 'utf8'),
  ]);
  new vm.Script(productUi, { filename: 'history/product-ui.js' });
  new vm.Script(motion, { filename: 'assets/ui/fo-motion.js' });
  new vm.Script(premium, { filename: 'history/premium.js' });
  // No cursor light on maps or cards, no ripples.
  assert.doesNotMatch(productUi + productCss, /history-map-atmosphere|history-ripple|--history-spot-x/);
  // Closed-form spring step response, liquid indicators, reduced-motion fallback.
  assert.match(motion, /Math\.exp\(-z \* w \* tau\)|const wd = w \* Math\.sqrt\(1 - z \* z\)/);
  assert.match(motion, /function liquid\(/);
  assert.match(motion, /prefers-reduced-motion: reduce/);
  assert.match(premium, /window\.FOMotion/);
  assert.ok(archivePage.indexOf('/assets/ui/fo-motion.js') < archivePage.indexOf('./premium.js'), 'fo-motion must load before premium.js');
});

test('cross-election comparison keeps the report on the right and both maps inside their cards', async () => {
  const [css, presidentScript, executiveScript, councilorScript] = await Promise.all([
    readFile(new URL('../history/archive-enhancements.css', import.meta.url), 'utf8'),
    readFile(new URL('../history/archive-enhancements.js', import.meta.url), 'utf8'),
    readFile(new URL('../history/local-executive.js', import.meta.url), 'utf8'),
    readFile(new URL('../history/councilor.js', import.meta.url), 'utf8'),
  ]);
  assert.match(css, /body\.history-archive\.archive-comparing \.layout\{[^}]*grid-template-columns:/);
  assert.match(css, /body\.history-archive\.archive-comparing \.map-panel\{[^}]*grid-column:1/);
  assert.match(css, /body\.history-archive\.archive-comparing \.result-panel\{[^}]*grid-column:2/);
  for (const source of [presidentScript, executiveScript, councilorScript]) {
    assert.match(source, /preserveAspectRatio','xMidYMid meet'/);
    assert.match(source, /coordinates:\[\[119\.18,21\.55\],\[122\.12,25\.42\]\]/);
    assert.match(source, /fitExtent\(\[\[32,34\],\[w-32,h-76\]\]/);
  }
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
  assert.equal(archive.years['2022'].townCount, 368);
  assert.equal(Object.keys(archive.years['2022'].townPartyVotes).length, 22);
  for (const [county, towns] of Object.entries(archive.years['2022'].townPartyVotes)) {
    for (const [town, result] of Object.entries(towns)) {
      assert.equal(Object.values(result.parties).reduce((sum, votes) => sum + votes, 0), result.validVotes, `2022 ${county} ${town} party votes`);
    }
  }
  assert.deepEqual(archive.years['2006'].currentAreas['臺中市'].sort(), ['臺中市', '臺中縣']);
  new vm.Script(script, { filename: 'history/councilor.js' });
  assert.match(html, /id="councilor-national-overview"[^>]*open/);
  assert.match(html, /id="councilor-county-overview"[^>]*open hidden/);
  assert.match(html, /id="local-county-seat-grid"/);
  assert.match(html, /id="councilor-election-overview"[^>]*open/);
  assert.match(html, /id="councilor-election-stats"/);
  assert.match(html, /id="councilor-area-select"/);
  assert.match(html, /id="councilor-map-a"/);
  assert.match(html, /id="councilor-map-b"/);
  assert.match(html, /id="councilor-compare-chart"/);
  assert.match(script, /councilorPartyBadgeFallback/);
  assert.match(script, /function electedStamp\(/);
  assert.match(script, /function renderElectionStats\(/);
  assert.match(script, /function renderCountyOverview\(/);
  assert.match(script, /function partyVoteCards\(/);
  assert.match(script, /townPartyVotes/);
  assert.match(script, /function drawComparisonMaps\(/);
  assert.match(script, /classList\.toggle\('compare-map-active',mode==='compare'\)/);
  assert.match(script, /<em>展開查看更多<\/em>/);
  assert.doesNotMatch(script, /class="councilor-district"\$\{i===0\?' open'/);
  assert.match(css, /\.councilor-page\{[^}]*--red:#E4022B/);
  assert.match(css, /\.councilor-page\.compare-map-active \.councilor-compare-maps\{display:grid\}/);
  assert.match(css, /\.councilor-page \.party-badge img[^}]*object-fit:contain/);
  assert.match(css, /\.councilor-status \.local-elected-stamp/);
});

test('official CEC legislator archive covers every published term without inventing legacy party-list data', async () => {
  const archive = await readJson('data/history/legislator.json');
  assert.equal(archive.type, 'legislator');
  assert.equal(archive.boundaryMode, 'historical-official');
  assert.deepEqual(archive.coverage, [1995, 1998, 2001, 2004, 2008, 2012, 2016, 2020, 2024]);
  assert.match(JSON.stringify(archive.source), /db\.cec\.gov\.tw/);
  assert.doesNotMatch(JSON.stringify(archive), /kiang|MISNUK|everdark/i);

  const expected = {
    '1995': [3, 29, 332, 128, null, 164],
    '1998': [4, 31, 397, 176, null, 225],
    '2001': [5, 31, 455, 176, null, 225],
    '2004': [6, 31, 386, 176, null, 225],
    '2008': [7, 75, 295, 79, 34, 113],
    '2012': [8, 75, 283, 79, 34, 113],
    '2016': [9, 75, 377, 79, 34, 113],
    '2020': [10, 75, 431, 79, 34, 113],
    '2024': [11, 75, 328, 79, 34, 113],
  };
  for (const [year, [term, districtCount, candidateCount, directSeats, partyListSeats, totalSeats]] of Object.entries(expected)) {
    const entry = archive.years[year];
    assert.equal(entry.term, term, `${year} term`);
    assert.equal(entry.districtCount, districtCount, `${year} district coverage`);
    assert.equal(entry.directElectedSeats, directSeats, `${year} direct seats`);
    assert.equal(entry.partyListElectedSeats, partyListSeats, `${year} party-list seats`);
    assert.equal(entry.totalLegislatureSeats, totalSeats, `${year} total legislature seats`);
    const regional = entry.categories.find(category => category.officialCode === 'L1');
    const candidateCategories = entry.categories.filter(category => ['L2', 'L3'].includes(category.officialCode));
    const candidates = [
      ...regional.counties.flatMap(county => county.districts.flatMap(district => district.candidates)),
      ...candidateCategories.flatMap(category => category.candidates),
    ];
    assert.equal(candidates.length, candidateCount, `${year} candidate coverage`);
    for (const county of regional.counties) {
      assert.equal(county.districts.reduce((sum, district) => sum + district.validVotes, 0), county.validVotes, `${year} ${county.name} votes`);
      for (const district of county.districts) {
        assert.equal(district.candidates.reduce((sum, candidate) => sum + candidate.votes, 0), district.validVotes, `${year} ${district.name} candidate votes`);
        assert.equal(district.candidates.filter(candidate => candidate.elected).length, district.electedSeats, `${year} ${district.name} elected seats`);
      }
    }
    for (const category of candidateCategories) {
      assert.equal(category.candidates.reduce((sum, candidate) => sum + candidate.votes, 0), category.validVotes, `${year} ${category.label} votes`);
      assert.equal(category.candidates.filter(candidate => candidate.elected).length, category.electedSeats, `${year} ${category.label} elected seats`);
    }
    const partyList = entry.categories.find(category => category.officialCode === 'L4');
    if (partyList) {
      assert.equal(partyList.parties.reduce((sum, party) => sum + party.votes, 0), partyList.validVotes, `${year} party-list votes`);
      assert.equal(partyList.parties.reduce((sum, party) => sum + party.electedSeats, 0), 34, `${year} party-list seats`);
    } else {
      assert.ok(Number(year) <= 2004, `${year} may omit L4 only under the legacy system`);
      assert.equal(entry.legacyAdditionalSeats.reduce((sum, item) => sum + item.seats, 0), totalSeats - directSeats, `${year} legacy additional seats`);
    }
  }
});

test('legislator archive is exposed as a complete interactive history page', async () => {
  const [html, script, css, indexEnhancements, localHtml, councilorHtml] = await Promise.all([
    readFile(new URL('../history/legislator.html', import.meta.url), 'utf8'),
    readFile(new URL('../history/legislator.js', import.meta.url), 'utf8'),
    readFile(new URL('../history/legislator.css', import.meta.url), 'utf8'),
    readFile(new URL('../history/archive-enhancements.js', import.meta.url), 'utf8'),
    readFile(new URL('../history/local-executive.html', import.meta.url), 'utf8'),
    readFile(new URL('../history/councilor.html', import.meta.url), 'utf8'),
  ]);
  new vm.Script(script, { filename: 'history/legislator.js' });
  assert.match(html, /1995–2024/);
  assert.match(html, /id="legislator-special"/);
  assert.match(html, /id="legislator-compare-maps"/);
  assert.match(script, /legislator\.json/);
  assert.match(script, /歷史選區|複數選區/);
  assert.match(script, /legacyAdditionalSeats/);
  assert.match(script, /officialCode==='L4'/);
  assert.match(script, /function renderCompare\(/);
  assert.match(css, /\.legislator-special-card/);
  assert.match(indexEnhancements, /id:'legislator',label:'立法委員',available:true/);
  assert.doesNotMatch(localHtml, /value="legislator" disabled/);
  assert.doesNotMatch(councilorHtml, /value="legislator" disabled/);
});
