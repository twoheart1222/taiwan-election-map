import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

const read = p => fs.readFileSync(new URL('../' + p, import.meta.url), 'utf8');
test('entry pages have distinct titles and crawlable query navigation', () => {
  const home = read('index.html');
  const entry = read('election/index.html');
  const motion = read('assets/ui/fo-motion.js');
  const ui = read('assets/ui/fo-ui.css');
  assert.match(home, /<title>2026 選舉地圖｜候選人與選區查詢｜島民觀察室<\/title>/);
  assert.match(entry, /<title>2026 候選人查詢｜/);
  assert.doesNotMatch(home, /class="navlink">候選人查詢/);
  assert.doesNotMatch(home, /<div id="mobile-menu"[\s\S]*?>候選人查詢 <span/);
  assert.match(home, /href="#candidate-search" data-open-candidate-search[^>]*>2026 全台候選人名單<\/a>/);
  assert.doesNotMatch(motion, /DETAILS\s*=\s*['"][^'"]*#faq details/);
  assert.match(ui, /#faq details\[open\]>p\{animation:fo-faq-reveal/);
  assert.match(home, /id="election-guide"/);
  assert.match(entry, /id="county-list"/);
  for (const html of [entry, read('scripts/build-seo-pages.mjs')]) {
    assert.match(html, /id="lookup-guide"/);
    assert.match(html, /href="\/history\/">歷年選舉結果查詢/);
  }
});
