// Regression target: expanded 2022 previous-election section on 390px mobile.
import http from 'node:http';
import fs from 'node:fs/promises';
import path from 'node:path';
import { chromium } from 'playwright';

const ROOT = process.cwd();
const OUT = path.join(ROOT, 'artifacts', 'prev-results-ui');
const MIME = { '.html':'text/html; charset=utf-8', '.css':'text/css; charset=utf-8', '.js':'text/javascript; charset=utf-8', '.json':'application/json; charset=utf-8' };
const assert = (ok, msg) => { if (!ok) throw new Error(msg); };

// 歷年縣市長的當選樣式必須與目前總統歷年頁一致：深色卡＋黃色右上角「當選」。
const localExecutiveCss = await fs.readFile(path.join(ROOT, 'history', 'local-executive.css'), 'utf8');
assert(localExecutiveCss.includes('.local-candidate.elected{border-color:#5b5147}'), 'local elected card border does not match president style');
assert(localExecutiveCss.includes(".local-candidate.elected:before{content:'當選'"), 'local elected yellow corner badge missing');
assert(localExecutiveCss.includes('background:var(--yellow);color:#0d0d0d'), 'local elected badge colors do not match president style');
assert(!localExecutiveCss.includes("content:'當選 / ELECTED'"), 'old local elected stamp still present');
assert(!localExecutiveCss.includes('.local-candidate.elected{background:#f4f1ea'), 'old cream elected card still present');

const server = http.createServer(async (req, res) => {
  try {
    const url = new URL(req.url, 'http://127.0.0.1');
    const pathname = url.pathname === '/' ? '/index.html' : url.pathname;
    const file = path.resolve(ROOT, '.' + pathname);
    let data = await fs.readFile(file);
    if (pathname === '/index.html') {
      let html = data.toString('utf8');
      html = html.replace(/<script\b[^>]*\bsrc="https:\/\/[^\"]+"[^>]*><\/script>/g, '');
      html = html.replace("document.addEventListener('DOMContentLoaded', () => new App().init());", 'window.__PrevResultsApp = App;');
      data = Buffer.from(html);
    }
    res.writeHead(200, { 'content-type': MIME[path.extname(file)] || 'application/octet-stream', 'cache-control':'no-store' });
    res.end(data);
  } catch (e) {
    res.writeHead(404, { 'content-type':'text/plain' }); res.end(String(e));
  }
});

await fs.mkdir(OUT, { recursive:true });
await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
const base = `http://127.0.0.1:${server.address().port}`;
const browser = await chromium.launch({ headless:true });

try {
  const page = await browser.newPage({ viewport:{ width:390, height:844 }, isMobile:true, hasTouch:true });
  await page.goto(base + '/', { waitUntil:'domcontentloaded', timeout:30000 });
  await page.waitForFunction(() => typeof window.__PrevResultsApp === 'function');

  const metrics = await page.evaluate(() => {
    const AppClass = window.__PrevResultsApp;
    const app = Object.create(AppClass.prototype);
    app._headCands = p => p.candidates || [];
    const p = {
      id:'10009', name:'雲林縣',
      candidates:[
        { name:'張嘉郡', party:'中國國民黨', role:'縣市長' },
        { name:'劉建國', party:'民主進步黨', role:'縣市長' },
        { name:'林佳瑜', party:'無', role:'縣市長' }
      ]
    };
    const prev = {
      voteDate:'2022-11-26', electors:559273, votesCast:376649, turnout:67.35,
      validVotes:366833, invalidVotes:9816,
      candidates:[
        { name:'張麗善', party:'中國國民黨', votes:207519, pct:56.57, elected:true },
        { name:'劉建國', party:'民主進步黨', votes:152620, pct:41.60, elected:false },
        { name:'林佳瑜', party:'無', votes:6694, pct:1.82, elected:false }
      ]
    };
    const panel = app._resultsPanel(p, prev, null);
    panel.classList.add('open');
    document.body.innerHTML = '';
    document.body.style.margin = '0';
    document.body.style.padding = '20px';
    document.body.style.background = '#0d0d0d';
    document.body.appendChild(panel);

    const section = panel.querySelector('.prev-election-section');
    const head = panel.querySelector('.prev-results-head');
    const inner = panel.querySelector('.res-panel-content > div');
    const names = ['張麗善','劉建國','林佳瑜'];
    const rows = names.map(name => [...section.children].find(el => el.textContent.includes(name)));
    const nameNodes = rows.map(row => row?.firstElementChild?.firstElementChild);
    if (!section || !head || !inner || rows.some(row => !row) || nameNodes.some(node => !node)) throw new Error('previous result DOM missing');

    const sr = section.getBoundingClientRect();
    const hr = head.getBoundingClientRect();
    const winnerRect = rows[0].getBoundingClientRect();
    const nameLefts = nameNodes.map(node => node.getBoundingClientRect().left);
    const pr = panel.getBoundingClientRect();
    return {
      panelLeft:pr.left, panelRight:pr.right,
      sectionTop:sr.top, sectionLeft:sr.left, sectionRight:sr.right,
      headTop:hr.top, headBottom:hr.bottom, headHeight:hr.height,
      winnerLeft:winnerRect.left, winnerRight:winnerRect.right,
      winnerTextInset:nameLefts[0] - sr.left,
      nameLefts,
      nameAlignmentSpread:Math.max(...nameLefts)-Math.min(...nameLefts),
      openOverflow:getComputedStyle(inner).overflow,
      headText:head.textContent.trim(),
      panelText:panel.textContent
    };
  });

  assert(metrics.headText.includes('上期（2022）'), `previous heading missing: ${metrics.headText}`);
  assert(metrics.headHeight >= 20, `previous heading line box too short: ${metrics.headHeight}`);
  assert(metrics.headTop >= metrics.sectionTop, 'previous heading is clipped above its section');
  assert(metrics.openOverflow === 'visible', `expanded results still clip content: ${metrics.openOverflow}`);
  assert(metrics.winnerLeft >= metrics.sectionLeft - 1, `winner row escapes section left: ${metrics.winnerLeft} < ${metrics.sectionLeft}`);
  assert(metrics.winnerRight <= metrics.sectionRight + 1, `winner row escapes section right: ${metrics.winnerRight} > ${metrics.sectionRight}`);
  assert(metrics.winnerTextInset >= 10, `winner name lacks safe left inset: ${metrics.winnerTextInset}px`);
  assert(metrics.nameAlignmentSpread <= 1, `candidate names are not left-aligned: ${metrics.nameLefts.join(', ')}`);
  assert(metrics.panelText.includes('207,519'), '2022 winner votes missing');
  assert(metrics.panelText.includes('56.57%'), '2022 winner share missing');

  await page.locator('.prev-election-section').screenshot({ path:path.join(OUT, 'prev-election-mobile-390.png') });
  console.log('Previous election mobile regression passed:', metrics);
} finally {
  await browser.close();
  await new Promise(resolve => server.close(resolve));
}
