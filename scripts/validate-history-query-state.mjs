import http from 'node:http';
import fs from 'node:fs/promises';
import path from 'node:path';
import { chromium } from 'playwright';

const ROOT=process.cwd();
const OUT=path.join(ROOT,'artifacts/history-ui');
const MIME={'.html':'text/html; charset=utf-8','.css':'text/css; charset=utf-8','.js':'text/javascript; charset=utf-8','.json':'application/json; charset=utf-8','.png':'image/png','.svg':'image/svg+xml'};

function serve(){
  return http.createServer(async(req,res)=>{
    try{
      const u=new URL(req.url,'http://127.0.0.1');
      const pathname=decodeURIComponent(u.pathname.endsWith('/')?u.pathname+'index.html':u.pathname);
      const file=path.resolve(ROOT,'.'+pathname);
      if(!file.startsWith(ROOT+path.sep))throw new Error('path traversal');
      const data=await fs.readFile(file);
      res.writeHead(200,{'content-type':MIME[path.extname(file)]||'application/octet-stream','cache-control':'no-store'});
      res.end(data);
    }catch{
      res.writeHead(404,{'content-type':'text/plain'});
      res.end('not found');
    }
  });
}
function assert(ok,msg){if(!ok)throw new Error(msg)}
async function waitReady(page){
  await page.locator('#archive-election-type').waitFor({state:'visible',timeout:15000});
  await page.locator('#archive-query-statebar').waitFor({state:'visible'});
  await page.locator('#map path.county.has-result').first().waitFor({state:'attached',timeout:15000});
}
function params(page){return new URL(page.url()).searchParams}
async function text(page,sel){return (await page.locator(sel).textContent())?.replace(/\s+/g,' ').trim()||''}
async function chooseYear(page,year){const button=page.locator(`#years [data-year="${year}"]`);if(await button.isVisible())await button.click();else await page.locator('#archive-year-select').selectOption(String(year))}

await fs.mkdir(OUT,{recursive:true});
const server=serve();
await new Promise(r=>server.listen(0,'127.0.0.1',r));
const base=`http://127.0.0.1:${server.address().port}`;
const browser=await chromium.launch({headless:true});

try{
  const page=await browser.newPage({viewport:{width:1440,height:900}});
  await page.goto(`${base}/history/?year=2024`,{waitUntil:'networkidle',timeout:30000});
  await waitReady(page);

  const type=page.locator('#archive-election-type');
  assert(await type.locator('option').count()===4,'election type catalog should expose 4 architecture slots');
  assert(await type.inputValue()==='president','president should be active');
  assert(await type.locator('option[value="local-executive"]').evaluate(el=>el.disabled===false),'local-executive should be enabled after data integration');
  assert((await type.locator('option[value="local-executive"]').textContent())?.trim()==='縣市長','local-executive label should no longer say building');
  assert(await type.locator('option[value="councilor"]').evaluate(el=>el.disabled===false),'councilor should be enabled after data integration');
  assert((await type.locator('option[value="councilor"]').textContent())?.trim()==='縣市議員','councilor label should no longer say building');
  assert(await type.locator('option[value="legislator"]').evaluate(el=>el.disabled===false),'legislator should be enabled after data integration');
  assert((await type.locator('option[value="legislator"]').textContent())?.trim()==='立法委員','legislator label should no longer say building');
  let summary=await text(page,'#archive-query-path');
  assert(summary.includes('總統副總統')&&summary.includes('2024')&&summary.includes('全國'),'default query summary is incomplete');
  assert(params(page).get('type')==='president','type query state missing');
  assert(params(page).get('level')==='national','default level query state missing');

  await page.locator('#archive-level-switch [data-level="county"]').click();
  await page.locator('#archive-region-select').selectOption('臺北市');
  await page.locator('#county-detail.county-card').waitFor({state:'visible'});
  summary=await text(page,'#archive-query-path');
  assert(summary.includes('縣市')&&summary.includes('臺北市'),'county query summary missing');
  assert(params(page).get('level')==='county'&&params(page).get('region')==='臺北市','county URL state missing');
  const singleDeepLink=page.url();

  await page.reload({waitUntil:'networkidle'});
  await waitReady(page);
  await page.locator('#county-detail.county-card').waitFor({state:'visible'});
  assert(await page.locator('#archive-region-select').inputValue()==='臺北市','single deep link did not restore region');
  assert((await text(page,'#county-detail')).includes('臺北市'),'single deep link did not restore county result');

  await page.locator('#archive-mode-compare').click();
  await page.locator('#archive-compare-a').selectOption('2012');
  await page.locator('#archive-compare-b').selectOption('2016');
  await page.locator('.archive-layer-switch [data-layer="share"]').click();
  await page.locator('#archive-party-switch [data-party="KMT"]').click();
  await page.waitForFunction(()=>document.body.dataset.compareLayer==='share'&&document.body.dataset.compareA==='2012'&&document.body.dataset.compareB==='2016');

  summary=await text(page,'#archive-query-path');
  assert(summary.includes('2012 → 2016')&&summary.includes('得票率變化')&&summary.includes('中國國民黨'),'compare query summary incomplete');
  let q=params(page);
  assert(q.get('mode')==='compare'&&q.get('compareA')==='2012'&&q.get('compareB')==='2016','compare pair URL state missing');
  assert(q.get('layer')==='share'&&q.get('party')==='KMT','compare layer URL state missing');
  assert(!q.has('level')&&!q.has('region'),'single-only URL params should be removed in compare mode');

  const compareDeepLink=page.url();
  await page.goto(compareDeepLink,{waitUntil:'networkidle'});
  await waitReady(page);
  await page.locator('.archive-compare-workspace').waitFor({state:'visible'});
  assert(await page.locator('#archive-compare-a').inputValue()==='2012','compare deep link A not restored');
  assert(await page.locator('#archive-compare-b').inputValue()==='2016','compare deep link B not restored');
  assert(await page.locator('.archive-layer-switch [data-layer="share"].on').count()===1,'compare deep link layer not restored');
  assert(await page.locator('#archive-party-switch [data-party="KMT"].on').count()===1,'compare deep link party not restored');
  assert((await text(page,'#archive-query-path')).includes('中國國民黨'),'compare deep link summary not restored');

  await page.screenshot({path:path.join(OUT,'history-query-state-desktop.png'),fullPage:true});

  await page.locator('#archive-query-reset').click();
  await page.waitForFunction(()=>document.body.dataset.archiveMode==='single');
  assert(await page.locator('#archive-year-select').inputValue()==='2024','reset should restore latest year');
  assert(await page.locator('#archive-region-select').inputValue()==='','reset should restore national region');
  q=params(page);
  assert(!q.has('mode')&&!q.has('compareA')&&!q.has('compareB')&&!q.has('layer')&&!q.has('party'),'reset should clear compare URL state');
  assert(q.get('level')==='national','reset should restore national level');
  assert((await text(page,'#archive-query-path')).includes('全國'),'reset summary should be national');

  const mobile=await browser.newPage({viewport:{width:390,height:844},isMobile:true,hasTouch:true});
  await mobile.goto(compareDeepLink,{waitUntil:'networkidle',timeout:30000});
  await mobile.locator('#archive-query-statebar').waitFor({state:'attached',timeout:15000});
  const overflow=await mobile.evaluate(()=>({sw:document.documentElement.scrollWidth,cw:document.documentElement.clientWidth}));
  assert(overflow.sw<=overflow.cw+2,`mobile query state overflow ${overflow.sw}-${overflow.cw}`);
  const modeBox=await mobile.locator('#archive-mode-single').boundingBox();
  assert(modeBox&&modeBox.height>=40,`mobile mode target too small: ${modeBox?.height}`);
  await mobile.screenshot({path:path.join(OUT,'history-query-state-mobile-390.png'),fullPage:true});
  await mobile.close();

  const routePage=await browser.newPage({viewport:{width:1440,height:900}});
  await routePage.goto(`${base}/history/?year=2024`,{waitUntil:'networkidle',timeout:30000});
  await waitReady(routePage);
  await routePage.locator('#archive-election-type').selectOption('local-executive');
  await routePage.waitForURL(/\/history\/local-executive\.html\?type=local-executive&year=2022&level=national/,{timeout:10000});
  await routePage.locator('#local-seat-grid .local-seat-card').first().waitFor({state:'visible',timeout:30000});
  assert(await routePage.locator('#local-election-type').inputValue()==='local-executive','archive type router did not land on county mayor page');
  await routePage.locator('#local-election-type').selectOption('president');
  await routePage.waitForURL(/\/history\/\?type=president&year=2024&level=national/,{timeout:10000});
  await waitReady(routePage);
  assert(await routePage.locator('#archive-election-type').inputValue()==='president','county mayor page did not route back to president archive');
  await routePage.locator('#archive-election-type').selectOption('councilor');
  await routePage.waitForURL(/\/history\/councilor\.html\?type=councilor&year=2022&level=national/,{timeout:10000});
  await routePage.locator('#local-seat-grid .local-seat-card').first().waitFor({state:'visible',timeout:30000});
  assert(await routePage.locator('#local-election-type').inputValue()==='councilor','archive type router did not land on councilor page');
  await routePage.locator('#local-election-type').selectOption('legislator');
  await routePage.waitForURL(/\/history\/legislator\.html\?type=legislator&year=2024&level=national/,{timeout:10000});
  await routePage.locator('#legislator-special-content .legislator-special-card').first().waitFor({state:'visible',timeout:30000});
  assert(await routePage.locator('#local-election-type').inputValue()==='legislator','archive type router did not land on legislator page');
  await routePage.close();

  console.log('History query-state validation passed:',{singleDeepLink,compareDeepLink,typeRouting:'president ↔ legislator / local-executive / councilor'});
  await page.close();
}finally{
  await browser.close();
  await new Promise(r=>server.close(r));
}
