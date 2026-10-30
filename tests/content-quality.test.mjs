import assert from 'node:assert/strict';
import fs from 'node:fs';
import test from 'node:test';
import vm from 'node:vm';
import * as cheerio from 'cheerio';
import { execFileSync } from 'node:child_process';
import { countyReadingGuide, townReadingGuide } from '../scripts/election-reading-guides.mjs';
const read = file => fs.readFileSync(new URL('../' + file, import.meta.url), 'utf8');
const root = new URL('..', import.meta.url);
const council = JSON.parse(read('data/history/councilor.json')).years;
const mayor = JSON.parse(read('data/history/local-executive.json')).years;
const article = slug => cheerio.load(read(`observatory/${slug}/index.html`));

test('each article uses its own methodology, preserves original publication and discloses revisions', () => {
  for (const slug of ['mayor-candidates-2018-2022', 'councilor-candidates-2018-2022', 'councilor-turnout-2018-2022']) {
    const $ = article(slug);
    const ld = JSON.parse($('script[type="application/ld+json"]').text());
    assert.equal(ld.datePublished, '2026-10-29');
    assert.equal(ld.dateModified, '2026-10-30');
    assert.equal(ld.author.url, 'https://formosaobservatory.com/about/');
    assert.equal($('main tbody tr').length, 22);
    assert.ok($('a[href="/about/#workflow"]').length);
  }
  const $ = article('councilor-candidates-2018-2022');
  const methodology = $('h2').filter((_, e) => $(e).text() === '統計口徑').next('p').text();
  assert.doesNotMatch(methodology, /嘉義市|縣市長皆以/);
  assert.match($('main').text(), /本次更正/);
  assert.match($('main').text(), /−15 ÷ 73/);
});

test('article examples and table totals agree with source records', () => {
  const $ = article('mayor-candidates-2018-2022');
  const rows = $('tbody tr').map((_, row) => $(row).find('td').map((_, td) => Number($(td).text().replace(/,/g, ''))).get()).get();
  assert.equal(rows.length, 66);
  for (const year of ['2018', '2022']) {
    const total = Object.values(mayor[year].races).reduce((n, r) => n + r.candidates.length, 0);
    assert.match($('main').text(), new RegExp(String(total)));
  }
  const turn = article('councilor-turnout-2018-2022')('main').text();
  for (const year of ['2018', '2022']) {
    const stats = council[year].stats;
    assert.ok(turn.includes(stats.votesCast.toLocaleString('zh-TW')));
    assert.ok(turn.includes(stats.electors.toLocaleString('zh-TW')));
    assert.ok(turn.includes((stats.votesCast / stats.electors * 100).toFixed(2) + '%'));
  }
  for (const [county, record] of Object.entries(council['2022'].counties)) {
    assert.equal(record.districts.reduce((n, d) => n + d.candidates.length, 0), record.stats.candidateCount, county);
  }
});

test('representative guides never change candidate tables or ordering', () => {
  for (const id of ['63000', '63000010', '10002010', '09007010']) {
    const $ = cheerio.load(read(`election/${id}.html`));
    const before = cheerio.load(execFileSync('git', ['show', `HEAD:election/${id}.html`], { cwd: root, encoding: 'utf8' }));
    const cells = doc => doc('table').map((_, table) => doc(table).find('tr').map((_, row) => doc(row).text()).get().join('\n')).get();
    assert.deepEqual(cells($), cells(before), id);
    assert.equal($('.reading-guide').length, 1);
    assert.ok($('.reading-guide a[href^="/about/"]').length);
  }
});

test('town reading counts use supplied records rather than hardcoded snapshot numbers', () => {
  const villages = [{ candidates: [] }, { candidates: [{}] }, { candidates: [{}, {}] }];
  const notes = townReadingGuide({ county: { id: '09007' }, town: { id: '09007010', name: '南竿鄉' }, villages, districtBlocks: [{ district: '1' }], districtMap: { '1': { towns: ['南竿鄉'] } }, quotas: { '1': 5 }, mayors: [], representatives: [] });
  assert.match(notes, /3 個村/);
  assert.match(notes, /1 個村里目前收錄 1 人、1 個收錄 2 人以上/);
  assert.match(notes, /另有 1 個尚未收錄參選人/);
  assert.equal(townReadingGuide({ town: { id: '99999999' } }), '');
  assert.equal(countyReadingGuide({ id: '99999' }), '');
});

test('navigation indexes and publication methods do not request ads; articles retain one ad loader', () => {
  for (const file of ['about/index.html', 'related/index.html', 'observatory/index.html']) {
    assert.doesNotMatch(read(file), /adsbygoogle|pagead2\.googlesyndication/);
  }
  assert.equal((read('observatory/councilor-turnout-2018-2022/index.html').match(/pagead2\.googlesyndication/g) || []).length, 1);
  const $ = cheerio.load(read('about/index.html'));
  assert.equal($('#workflow').length, 1);
  assert.equal($('#corrections').length, 1);
  assert.match($('main').text(), /並非即時同步/);
  assert.match($('main').text(), /產製日期不表示每一筆/);
  assert.match(read('index.html'), /href="\/about\/"/);
  assert.match(read('sitemap.xml'), /<loc>https:\/\/formosaobservatory.com\/about\/<\/loc>/);
});

test('historical page has source-linked baseline facts even before JavaScript runs', () => {
  const $ = cheerio.load(read('history/councilor.html'));
  const text = $('#history-reading-title').parent().text();
  for (const field of ['candidateCount', 'electedSeats', 'electors', 'votesCast']) assert.ok(text.includes(council['2022'].stats[field].toLocaleString('zh-TW')));
  assert.match(text, /固定摘要指向 2022/);
  assert.equal($('#history-reading-title').parent().find('a[href="/data/history/councilor.json"]').length, 1);
});

test('reserved-seat winning marks are recognized without treating losing marks as elected', async () => {
  const { cecElected } = await import('../scripts/cec-result-flags.mjs');
  for (const mark of ['*', '!', ' ! ', 'Y', true]) assert.equal(cecElected(mark), true);
  for (const mark of ['', ' ', '-', null, false, 'N']) assert.equal(cecElected(mark), false);
  const corrections = JSON.parse(read('data/history/corrections/2026-10-30-councilor-flags.json'));
  assert.equal(corrections.changes.length, 8);
  const before = JSON.parse(execFileSync('git', ['show', 'HEAD:data/history/councilor.json'], { cwd: root, encoding: 'utf8', maxBuffer: 20 * 1024 * 1024 }));
  for (const [year, entry] of Object.entries(council)) {
    const previous = before.years[year];
    if (!['2018', '2022'].includes(year)) { assert.deepEqual(entry, previous); continue; }
    let corrected = 0;
    for (const [name, county] of Object.entries(entry.counties)) {
      const old = previous.counties[name];
      for (let i = 0; i < county.districts.length; i++) {
        const district = county.districts[i];
        district.candidates.forEach((c, index) => {
          const prior = old.districts[i].candidates[index];
          const { elected, ...fields } = c;
          const { elected: wasElected, ...priorFields } = prior;
          assert.deepEqual(fields, priorFields, `${year} ${name} ${c.name}: preserved candidate data`);
          if (elected !== wasElected) {
            corrected++;
            assert.ok(corrections.changes.some(change => change.year === year && change.county === name && change.name === c.name));
            assert.equal(elected, true);
          }
        });
      }
    }
    assert.equal(corrected, 4);
    assert.equal(entry.stats.electedSeats, year === '2018' ? 912 : 910);
    assert.equal(Object.values(entry.partySeats).reduce((s, n) => s + n, 0), entry.stats.electedSeats);
  }
});

test('about mission lives on the standalone page while source register remains on the homepage', () => {
  const home = cheerio.load(read('index.html'));
  const about = cheerio.load(read('about/index.html'));
  assert.equal(home('#about').length, 0);
  assert.equal(home('#sources').length, 1);
  assert.equal(home('#sources-title').text(), '資料來源與核對');
  assert.ok(home('#sources .source-links a').length > 20);
  assert.doesNotMatch(home('#sources').text(), /用資料，看懂我們|了解維護背景/);
  assert.match(about('.about-mission').text(), /用資料，看懂我們/);
  assert.match(about('.about-mission').text(), /公民參與的門檻/);
  assert.equal(about('.source-links').length, 0);
  assert.equal(about('a[href="/#sources"]').length, 1);
  const old = cheerio.load(execFileSync('git', ['show', 'HEAD:index.html'], { cwd: root, encoding: 'utf8' }));
  assert.deepEqual(home('.source-links a').map((_, a) => home(a).attr('href')).get(), old('.source-links a').map((_, a) => old(a).attr('href')).get());
});

test('public about navigation points to the standalone page and legacy anchors redirect', () => {
  for (const file of ['index.html','privacy/index.html','election/index.html','history/index.html','history/councilor.html','history/local-executive.html','history/legislator.html','history/town.html']) {
    const $ = cheerio.load(read(file));
    const links = $('a').filter((_, a) => $(a).text().trim().startsWith('關於我們'));
    assert.ok(links.length, file);
    links.each((_, a) => { assert.equal($(a).attr('href'), '/about/', file); assert.equal($(a).attr('data-section'), undefined, file); });
  }
  const $ = cheerio.load(read('index.html'));
  let redirected;
  vm.runInNewContext($('head script').first().text(), { location: { hash: '#about', replace: path => { redirected = path; } } });
  assert.equal(redirected, '/about/');
});
