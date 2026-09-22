import http from 'node:http';
import fs from 'node:fs/promises';
import path from 'node:path';
import { chromium } from 'playwright';

const ROOT = process.cwd();
const OUT = path.join(ROOT, 'artifacts', 'main-ui');
const MIME = { '.html':'text/html; charset=utf-8', '.css':'text/css; charset=utf-8', '.js':'text/javascript; charset=utf-8', '.json':'application/json; charset=utf-8', '.svg':'image/svg+xml', '.png':'image/png' };

function assert(ok, message) { if (!ok) throw new Error(message); }

function server() {
  return http.createServer(async (req, res) => {
    try {
      const url = new URL(req.url, 'http://127.0.0.1');
      const pathname = decodeURIComponent(url.pathname === '/' ? '/index.html' : url.pathname);
      const file = path.resolve(ROOT, '.' + pathname);
      if (!file.startsWith(ROOT + path.sep)) throw new Error('path traversal');
      let data = await fs.readFile(file);
      if (pathname === '/index.html') {
        let html = data.toString('utf8');
        // Regression only needs the real DOM, CSS and App methods. Remove remote libraries
        // so the test is deterministic and does not initialize WebGL/map side effects.
        html = html.replace(/<script\b[^>]*\bsrc="https:\/\/[^\"]+"[^>]*><\/script>/g, '');
        html = html.replace("document.addEventListener('DOMContentLoaded', () => new App().init());", 'window.__ResultsTestApp = App;');
        data = Buffer.from(html);
      }
      res.writeHead(200, { 'content-type': MIME[path.extname(file)] || 'application/octet-stream', 'cache-control':'no-store' });
      res.end(data);
    } catch (error) {
      res.writeHead(404, { 'content-type':'text/plain' });
      res.end(String(error));
    }
  });
}

await fs.mkdir(OUT, { recursive:true });
const srv = server();
await new Promise(resolve => srv.listen(0, '127.0.0.1', resolve));
const base = `http://127.0.0.1:${srv.address().port}`;
const browser = await chromium.launch({ headless:true });

try {
  const page = await browser.newPage({ viewport:{ width:390, height:844 }, isMobile:true, hasTouch:true });
  await page.goto(base + '/', { waitUntil:'domcontentloaded', timeout:30000 });
  await page.waitForFunction(() => typeof window.__ResultsTestApp === 'function');

  const metrics = await page.evaluate(async () => {
    const AppClass = window.__ResultsTestApp;
    const app = Object.create(AppClass.prototype);
    const shell = document.querySelector('.drawer-body-scroll');
    const box = document.getElementById('candidates');
    const drawer = document.getElementById('drawer');
    if (!shell || !box || !drawer) throw new Error('drawer DOM missing');

    // Put the real mobile drawer into a deterministic visible state. The production
    // App normally does this when a county is opened; here we only exercise results rendering.
    drawer.style.setProperty('transform', 'none', 'important');
    drawer.style.setProperty('transition', 'none', 'important');
    drawer.style.setProperty('top', '0', 'important');
    drawer.style.setProperty('right', '0', 'important');
    drawer.style.setProperty('width', '100%', 'important');
    drawer.style.setProperty('height', '844px', 'important');
    drawer.style.setProperty('z-index', '99999', 'important');
    drawer.style.setProperty('background', '#141210', 'important');
    drawer.style.setProperty('opacity', '1', 'important');
    drawer.style.setProperty('visibility', 'visible', 'important');
    shell.style.height = '620px';
    shell.style.maxHeight = '620px';
    shell.style.overflowY = 'scroll';
    box.style.display = 'flex';
    box.style.flexDirection = 'column';
    box.style.overflow = 'visible';

    // Reproduce the old failure mode: user is looking part-way through current
    // candidate content when the asynchronous results panel is inserted above it.
    box.innerHTML = Array.from({ length:7 }, (_, i) => `<div style="height:150px;flex:none">候選人 ${i + 1}</div>`).join('');
    shell.scrollTop = 320;

    const p = {
      id:'10009', name:'雲林縣',
      candidates:[
        { name:'張嘉郡', party:'中國國民黨', role:'縣市長' },
        { name:'劉建國', party:'民主進步黨', role:'縣市長' },
        { name:'林佳瑜', party:'無', role:'縣市長' }
      ]
    };
    app.county = { code:'10009' };
    app._resTok = 0;
    app._loadPrevElection = async () => ({ levels:{ county:{ '10009':{
      voteDate:'2022-11-26', electors:559273, votesCast:376649, turnout:67.35,
      validVotes:366833, invalidVotes:9816,
      candidates:[
        { name:'張麗善', party:'中國國民黨', votes:207519, pct:56.57, elected:true },
        { name:'劉建國', party:'民主進步黨', votes:152620, pct:41.60, elected:false },
        { name:'林佳瑜', party:'無', votes:6694, pct:1.82, elected:false }
      ]
    } } } });
    app._loadResults26 = async () => ({ levels:{ county:{} } });

    await app._appendResults(p);
    await new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve)));

    const kicker = box.querySelector('.results-kicker');
    const panel = box.querySelector('.res-panel');
    if (!kicker || !panel) throw new Error('results panel missing');
    const kr = kicker.getBoundingClientRect();
    const pr = panel.getBoundingClientRect();
    const sr = shell.getBoundingClientRect();
    const ks = getComputedStyle(kicker);
    return {
      scrollTop:shell.scrollTop,
      shellTop:sr.top,
      panelTop:pr.top,
      kickerTop:kr.top,
      kickerBottom:kr.bottom,
      kickerHeight:kr.height,
      lineHeight:Number.parseFloat(ks.lineHeight),
      overflowAnchor:getComputedStyle(shell).overflowAnchor,
      text:kicker.textContent.trim()
    };
  });

  assert(metrics.text === '選情數據 / RESULTS', `unexpected heading: ${metrics.text}`);
  assert(metrics.scrollTop <= 1, `drawer retained async scroll offset: ${metrics.scrollTop}`);
  assert(metrics.panelTop >= metrics.shellTop - 1, `results panel starts above scroll viewport: ${metrics.panelTop} < ${metrics.shellTop}`);
  assert(metrics.kickerTop >= metrics.panelTop + 14, `kicker lacks safe top inset: ${metrics.kickerTop - metrics.panelTop}px`);
  assert(metrics.kickerHeight >= 15, `kicker box too short: ${metrics.kickerHeight}px`);
  assert(metrics.lineHeight >= 15, `kicker line-height too tight: ${metrics.lineHeight}px`);
  assert(metrics.overflowAnchor === 'none', `drawer scroll anchoring still enabled: ${metrics.overflowAnchor}`);

  await page.evaluate(() => {
    document.getElementById('preloader')?.remove();
    const shell = document.querySelector('.drawer-body-scroll');
    if (shell) shell.scrollTop = 0;
    document.querySelectorAll('#drawer > :not(.drawer-body-scroll)').forEach(el => { el.style.display = 'none'; });
    const drawer = document.getElementById('drawer');
    drawer.style.setProperty('display', 'block', 'important');
    drawer.style.setProperty('height', 'auto', 'important');
    const box = document.getElementById('candidates');
    box.style.setProperty('padding', '16px', 'important');
    box.querySelectorAll(':scope > :not(.res-panel)').forEach(el => el.style.display = 'none');
  });
  await page.locator('.res-panel').scrollIntoViewIfNeeded();
  await page.locator('.res-panel').screenshot({ path:path.join(OUT, 'results-panel-mobile-390.png') });
  console.log('Results panel mobile regression passed:', metrics);
} finally {
  await browser.close();
  await new Promise(resolve => srv.close(resolve));
}
