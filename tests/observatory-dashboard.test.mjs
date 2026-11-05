import assert from 'node:assert/strict';
import fs from 'node:fs';
import { createHash } from 'node:crypto';
import test from 'node:test';
import * as cheerio from 'cheerio';
import { validateDashboard, selectRows, observations, renderPanel, csvFor, delta, axisMaximum } from '../observatory/dashboard-model.js';
const read = p => fs.readFileSync(new URL('../'+p,import.meta.url),'utf8');
const data = JSON.parse(read('observatory/dashboard-data.json'));
const council = JSON.parse(read('data/history/councilor.json')).years;
const mayor = JSON.parse(read('data/history/local-executive.json')).years;
const metric = id => data.metrics.find(m=>m.id===id);

test('dashboard values are reproducible from all county candidate records and election totals', () => {
  assert.equal(validateDashboard(data),data);
  for (const m of data.metrics) for (const row of m.rows) for (const [year,key] of [['2018','a'],['2022','b']]) {
    const c = council[year].counties[row.county];
    const expected = m.id === 'turnout' ? c.stats.turnout : m.id === 'mayor-candidates' ? mayor[year].races[row.county].candidates.length : m.id === 'seats' ? c.districts.flatMap(d=>d.candidates).filter(c=>c.elected).length : c.districts.reduce((sum,d)=>sum+d.candidates.length,0);
    assert.equal(row[key],expected,`${m.id} ${year} ${row.county}`);
  }
  for (const source of data.sourceFiles) assert.equal(source.sha256,createHash('sha256').update(read(source.file).replace(/\r\n/g,'\n')).digest('hex'));
});

test('national turnout uses electoral weight and differences use percentage points', () => {
  const m = metric('turnout');
  for (const [year,key] of [['2018','a'],['2022','b']]) {
    const stats = council[year].stats;
    assert.equal(m.national[key],Number((stats.votesCast/stats.electors*100).toFixed(2)));
    const unweighted = m.rows.reduce((sum,r)=>sum+r[key],0)/22;
    assert.notEqual(m.national[key],Number(unweighted.toFixed(2)));
  }
  assert.equal(delta(m.national),-5.85);
  assert.match(observations(m)[0],/−5.85 個百分點/);
  assert.equal(axisMaximum(m),15);
  assert.equal(axisMaximum(m,selectRows(m,'臺北市')),axisMaximum(m));
});

test('county filter, sort, analysis, chart, table and CSV describe the same selection', () => {
  const m = metric('council-candidates'), before = structuredClone(m.rows);
  const $ = cheerio.load(renderPanel(m,{county:'宜蘭縣',sort:'deltaDesc'}));
  assert.equal($('.compare-row').length,1);
  assert.equal($('tbody tr').length,1);
  assert.equal($('.compare-bar').length,1);
  assert.match($('.metric-stat').text(),/73人.*58人.*−15 人/);
  assert.match($('.metric-analysis p').first().text(),/宜蘭縣.*−15 人/);
  const csv = csvFor(m,'宜蘭縣','deltaDesc');
  assert.ok(csv.startsWith('\ufeff'));
  assert.equal(csv.split('\r\n').length,2);
  assert.match(csv,/"宜蘭縣","73","58","-15","人"/);
  assert.deepEqual(m.rows,before);
  const sorted = selectRows(m,'all','deltaDesc');
  assert.equal(sorted[0].county,'南投縣');
  assert.equal(sorted.at(-1).county,'宜蘭縣');
  assert.throws(()=>selectRows(m,'不存在'),/找不到/);
});

test('all category narratives reconcile direction counts and use safe escaped labels', () => {
  for (const m of data.metrics) {
    const up = m.rows.filter(r=>r.b>r.a).length, down = m.rows.filter(r=>r.b<r.a).length;
    assert.ok(observations(m)[1].includes(`${up} 個增加、${down} 個減少、${22-up-down} 個持平`));
    const $ = cheerio.load(renderPanel(m));
    assert.equal($('.compare-row').length,22);
    assert.equal($('tbody tr').length,22);
    for (const bar of $('.compare-bar').toArray()) {
      const width = Number($(bar).attr('style').match(/width:([\d.]+)%/)[1]);
      assert.ok(width>=0&&width<=50);
      const left = Number($(bar).attr('style').match(/left:([\d.]+)%/)[1]);
      assert.ok(left>=0&&left+width<=100.001);
      assert.equal($(bar).hasClass('is-negative') ? Math.round((left+width)*100)/100 : left,50);
      const county = $(bar).closest('.compare-row').find('.compare-county').contents().filter((_,n)=>n.type==='text').text();
      const row = m.rows.find(r=>r.county===county);
      const encoded = width/50*axisMaximum(m)*($(bar).hasClass('is-negative')?-1:1);
      assert.ok(Math.abs(encoded-delta(row))<0.0001,`${county}: plotted difference matches source`);
      assert.equal($(bar).hasClass('is-zero'),delta(row)===0);
    }
  }
  assert.match(observations(metric('seats'))[3],/不是個人當選機率/);
  const unsafe = structuredClone(metric('turnout')); unsafe.title='<img src=x onerror=alert(1)>';
  assert.ok(!renderPanel(unsafe).includes('<img src=x'));
  const incomplete=structuredClone(data);incomplete.metrics[0].rows.pop();
  assert.throws(()=>validateDashboard(incomplete),/縣市資料不完整/);
});

test('index includes useful static content without JavaScript and retains article links and no ads', () => {
  const html=read('observatory/index.html'),$=cheerio.load(html);
  assert.equal($('#metric-panel .compare-row').length,22);
  assert.equal($('#metric-panel tbody tr').length,22);
  assert.equal($('.metric-analysis p').length,2);
  assert.ok($('.metric-method summary').text().includes('完整分析'));
  assert.equal($('.compare-bar').length,22);
  assert.equal($('[role=tab]').length,4);
  assert.equal($('#dashboard-county option').length,23);
  assert.equal($('.observatory-reading .story-card').length,3);
  assert.match($('#data-observatory').text(),/2026-11-04/);
  assert.match($('#data-observatory').text(),/不預測 2026 年勝負/);
  assert.equal($('script[type=module][src^="/observatory/dashboard.js"]').length,1);
  assert.equal(JSON.parse($('script[type="application/ld+json"]').first().text()).dateModified,'2026-11-04');
  assert.doesNotMatch(html,/adsbygoogle|pagead2\.googlesyndication/);
});
