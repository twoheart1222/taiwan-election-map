import assert from 'node:assert/strict';
import fs from 'node:fs';
import test from 'node:test';
import * as cheerio from 'cheerio';
const read=p=>fs.readFileSync(new URL('../'+p,import.meta.url),'utf8');
const $=cheerio.load(read('observatory/index.html'));
const council=JSON.parse(read('data/history/councilor.json')).years;
const executive=JSON.parse(read('data/history/local-executive.json')).years;
const audit=JSON.parse(read('data/representative-incumbent-review-20261030.json'));
const report=id=>$(`#report-${id}`);

test('political observatory leads with four readable chart reports, leaving lookup tools collapsed',()=>{
  assert.equal($('.report-card').length,4);
  assert.equal($('.report-figure').length,4);
  assert.equal($('.report-filters button').length,4);
  for(const el of $('.report-card').toArray()){
    const r=$(el);assert.equal(r.find('.report-copy p').length,3);assert.ok(r.find('header h2').text().length>15);
    assert.equal(r.find('time').attr('datetime'),'2026-11-04');
    assert.ok(r.find('.report-footer details a[href^="https://"]').length);
  }
  assert.ok($('.research-tools').is('details'));
  assert.equal($('.research-tools').attr('open'),undefined);
  assert.ok($('main').html().indexOf('id="field-notes"') < $('main').html().indexOf('class="research-tools"'));
  assert.ok($('script[src^="/observatory/reports.js"]').length);
});

test('net-change report shows separately summed local increases and decreases',()=>{
  const changes=Object.keys(executive['2022'].races).map(c=>executive['2022'].races[c].candidates.length-executive['2018'].races[c].candidates.length);
  const added=changes.reduce((s,v)=>s+Math.max(0,v),0),removed=changes.reduce((s,v)=>s+Math.max(0,-v),0);
  const r=report('one-more-candidate');
  assert.equal(added,15);assert.equal(removed,14);
  assert.deepEqual(r.find('.report-bar-row b').map((_,el)=>Number($(el).text())).get(),[added,removed]);
  assert.match(r.find('.report-equation').text(),/\+15 − 14 = \+1 人/);
});

test('turnout report compares relative quantities on a shared indexed scale and preserves raw counts',()=>{
  const a=council['2018'].stats,b=council['2022'].stats,r=report('more-electors-fewer-ballots');
  const indices=r.find('.report-index-row>b').map((_,el)=>Number($(el).text())).get();
  assert.deepEqual(indices,[Number((b.electors/a.electors*100).toFixed(2)),Number((b.votesCast/a.votesCast*100).toFixed(2))]);
  assert.ok(r.text().includes((a.votesCast-b.votesCast).toLocaleString('zh-TW')));
  assert.match(r.find('figcaption').text(),/2018＝100.*0–110/);
  const widths=r.find('.report-index-track i').map((_,el)=>Number($(el).attr('style').match(/width:([\d.]+)%/)[1])).get();
  assert.ok(Math.abs(widths[0]/100*110-b.electors/a.electors*100)<1e-10);
  assert.ok(Math.abs(widths[1]/100*110-b.votesCast/a.votesCast*100)<1e-10);
  assert.match(r.find('.report-chart-foot').text(),/不是投票率/);
});

test('invalid ballots use ballots cast as denominator, with full 100% bars',()=>{
  const r=report('two-different-denominators');
  for(const [i,year] of ['2018','2022'].entries()){
    const s=council[year].stats,row=r.find('.report-invalid-row').eq(i);
    assert.equal(row.find('strong').text(),(s.invalidVotes/s.votesCast*100).toFixed(2)+'%');
    const widths=row.find('.report-stacked>*').map((_,el)=>Number($(el).attr('style').match(/width:([\d.]+)%/)[1])).get();
    assert.ok(Math.abs(widths.reduce((a,b)=>a+b,0)-100)<1e-10);
    assert.ok(Math.abs(widths[1]-s.invalidVotes/s.votesCast*100)<1e-10);
  }
  assert.match(r.find('.report-copy').text(),/無效票仍是已投下的選票/);
});

test('incumbent audit discloses its snapshot date and does not interpret unmatched officials as non-candidates',()=>{
  const r=report('incumbent-is-not-reelection');
  const same=audit.records.filter(r=>r.kind==='incumbent').length,career=audit.records.filter(r=>r.kind==='careerMove').length;
  const counts=r.find('.report-audit-key b').map((_,el)=>Number($(el).text().replaceAll(',',''))).get();
  assert.deepEqual(counts,[same,career,audit.officialCount-same-career]);
  assert.equal(counts.reduce((a,b)=>a+b,0),audit.officialCount);
  assert.equal(new Set(audit.records.map(r=>r.official.url)).size,same+career);
  assert.match(r.text(),/2026-10-30/);
  assert.match(r.text(),/不能直接讀成「未參選」/);
  assert.match(r.text(),/並非 11 月 4 日重新確認全部現職狀態/);
});
