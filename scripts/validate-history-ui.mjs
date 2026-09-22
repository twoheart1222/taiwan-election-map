import http from 'node:http';
import fs from 'node:fs/promises';
import path from 'node:path';
import process from 'node:process';
import { chromium } from 'playwright';

const ROOT=process.cwd();
const OUT=path.join(ROOT,'artifacts/history-ui');
const MIME={'.html':'text/html; charset=utf-8','.css':'text/css; charset=utf-8','.js':'text/javascript; charset=utf-8','.json':'application/json; charset=utf-8','.png':'image/png','.svg':'image/svg+xml'};

function server(){
  return http.createServer(async(req,res)=>{
    try{
      const url=new URL(req.url,'http://127.0.0.1');
      let pathname=decodeURIComponent(url.pathname);
      if(pathname.endsWith('/'))pathname+='index.html';
      const file=path.resolve(ROOT,'.'+pathname);
      if(!file.startsWith(ROOT+path.sep))throw new Error('path traversal');
      const data=await fs.readFile(file);
      res.writeHead(200,{'content-type':MIME[path.extname(file)]||'application/octet-stream','cache-control':'no-store'});res.end(data);
    }catch(err){res.writeHead(404,{'content-type':'text/plain; charset=utf-8'});res.end('not found');}
  });
}

function assert(ok,message){if(!ok)throw new Error(message)}
async function noOverflow(page,label){
  const m=await page.evaluate(()=>({sw:document.documentElement.scrollWidth,cw:document.documentElement.clientWidth,flag:document.documentElement.dataset.horizontalOverflow}));
  assert(m.sw<=m.cw+2,`${label}: horizontal overflow ${m.sw}-${m.cw}`);
  assert(m.flag!=='true',`${label}: product-ui overflow sentinel is true`);
}
async function visibleSize(page,selector,minW,minH,label){
  const box=await page.locator(selector).boundingBox();assert(box&&box.width>=minW&&box.height>=minH,`${label}: ${selector} too small or hidden (${JSON.stringify(box)})`);
}
async function attachConsoleGuard(page,label){
  const fatal=[];
  page.on('pageerror',err=>fatal.push(`pageerror: ${err.message}`));
  page.on('console',msg=>{if(msg.type()==='error'&&/(ReferenceError|TypeError|SyntaxError|Uncaught)/i.test(msg.text()))fatal.push(`console: ${msg.text()}`)});
  return()=>assert(!fatal.length,`${label}: ${fatal.join(' | ')}`);
}
async function activateCounty(page,name){
  const found=await page.locator('path.county.has-result').evaluateAll((els,target)=>{
    const norm=value=>String(value||'').replaceAll('台','臺').trim();
    const el=els.find(node=>norm(node.__data__?.properties?.name||node.__data__?.properties?.COUNTYNAME||node.__data__?.properties?.COUNTY)===target);
    if(!el)return false;
    el.dispatchEvent(new MouseEvent('click',{bubbles:true,cancelable:true,view:window}));
    return true;
  },name);
  assert(found,`could not find county path for ${name}`);
}

async function openArchive(page,base,label){
  const guard=await attachConsoleGuard(page,label);
  await page.goto(`${base}/history/?year=2024`,{waitUntil:'networkidle',timeout:30000});
  await page.locator('path.county.has-result').first().waitFor({state:'visible',timeout:15000});
  const count=await page.locator('path.county.has-result').count();assert(count>=22,`${label}: expected 22 county result paths, got ${count}`);
  await page.waitForTimeout(1050);
  const fills=await page.locator('path.county.has-result').evaluateAll(els=>[...new Set(els.map(el=>getComputedStyle(el).fill))]);
  assert(fills.length>=2,`${label}: county winner colors are not visually distinct (${fills.join(', ')})`);
  assert(!fills.every(fill=>fill==='rgb(32, 29, 26)'),`${label}: county map is still using the neutral fallback fill`);
  await noOverflow(page,label);
  await visibleSize(page,'.map-panel',300,400,label);
  const title=await page.locator('#election-title').textContent();assert(/2024/.test(title||''),`${label}: 2024 election title missing`);
  guard();
}

async function desktop(browser,base){
  const page=await browser.newPage({viewport:{width:1440,height:900},deviceScaleFactor:1});
  await openArchive(page,base,'desktop');
  await activateCounty(page,'臺北市');
  await page.locator('#county-detail.county-card').waitFor({state:'visible',timeout:5000});
  await page.waitForTimeout(520);
  const drill=page.locator('[data-history-town-drilldown]');
  assert(await drill.count()===1,'desktop: expected exactly one township drilldown CTA');
  await drill.waitFor({state:'visible'});
  const h=await drill.evaluate(el=>el.getBoundingClientRect().height);assert(h>=40,`desktop: drilldown target too short (${h})`);
  await page.screenshot({path:path.join(OUT,'history-desktop-1440.png'),fullPage:true});
  await page.close();
}

async function mobileArchive(browser,base,width,height,label,screenshot=false){
  const page=await browser.newPage({viewport:{width,height},deviceScaleFactor:1,isMobile:true,hasTouch:true});
  await openArchive(page,base,label);
  const toggle=page.locator('.history-mobile-toggle');await toggle.waitFor({state:'visible'});
  const tb=await toggle.boundingBox();assert(tb&&tb.width>=40&&tb.height>=40,`${label}: mobile menu touch target is too small`);
  await toggle.click();assert(await page.locator('.history-mobile-menu').evaluate(el=>el.classList.contains('open')),`${label}: mobile menu did not open`);
  await toggle.click();
  const yearH=await page.locator('.year-btn.on').evaluate(el=>el.getBoundingClientRect().height);assert(yearH>=40,`${label}: year touch target too small (${yearH})`);
  await activateCounty(page,'臺北市');
  await page.locator('#county-detail.county-card').waitFor({state:'visible',timeout:5000});
  await page.waitForTimeout(520);
  const drill=page.locator('[data-history-town-drilldown]');
  assert(await drill.count()===1,`${label}: expected exactly one township drilldown CTA`);
  await drill.waitFor({state:'visible',timeout:5000});
  const dh=await drill.evaluate(el=>el.getBoundingClientRect().height);assert(dh>=44,`${label}: drilldown touch target too small (${dh})`);
  if(screenshot)await page.screenshot({path:path.join(OUT,`history-mobile-${width}.png`),fullPage:true});
  const href=await drill.getAttribute('href');assert(href&&href.includes('town.html')&&href.includes('%E8%87%BA%E5%8C%97%E5%B8%82'),`${label}: Taipei drilldown href missing`);
  await Promise.all([page.waitForURL(/town\.html\?year=2024/,{timeout:10000}),drill.click()]);
  await page.locator('path.town').first().waitFor({state:'visible',timeout:15000});
  await page.waitForTimeout(850);
  const townCount=await page.locator('path.town').count();assert(townCount>=12,`${label}: Taipei township map did not render expected districts`);
  await noOverflow(page,`${label}-town`);
  const townBtn=page.locator('.town-btn').first();await townBtn.waitFor({state:'visible'});
  const bh=await townBtn.evaluate(el=>el.getBoundingClientRect().height);assert(bh>=44,`${label}: township touch target too small (${bh})`);
  await townBtn.click();await page.locator('#town-detail .county-summary').waitFor({state:'visible',timeout:5000});
  await page.waitForTimeout(520);
  await page.evaluate(()=>window.scrollTo(0,0));
  await page.waitForTimeout(120);
  if(screenshot)await page.screenshot({path:path.join(OUT,`history-town-mobile-${width}.png`),fullPage:true});
  await page.close();
}

await fs.mkdir(OUT,{recursive:true});
const s=server();await new Promise(resolve=>s.listen(0,'127.0.0.1',resolve));
const address=s.address();const base=`http://127.0.0.1:${address.port}`;
const browser=await chromium.launch({headless:true});
try{
  await desktop(browser,base);
  await mobileArchive(browser,base,390,844,'mobile-390',true);
  await mobileArchive(browser,base,360,800,'mobile-360',false);
  console.log('History UI validation passed: desktop 1440px, mobile 390px and mobile 360px.');
}finally{await browser.close();await new Promise(resolve=>s.close(resolve));}
