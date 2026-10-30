import { test } from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import { readFile } from 'node:fs/promises';

test('support page uses the public ECPay link without presenting a local payment confirmation', async () => {
  const html = await readFile(new URL('../index.html', import.meta.url), 'utf8');
  assert.match(html, /id="ecpay-donate" href="https:\/\/p\.ecpay\.com\.tw\/A8F8C79" target="_blank" rel="noopener noreferrer"/);
  assert.match(html, /href="#support" data-view="support"/);
  assert.match(html, /\['observatory', 'support', 'contact'\]\.includes\(initialHash\)/);
  assert.match(html, /name === 'support' && location\.hash !== '#support'/);
  assert.match(html, /name !== 'support' && location\.hash === '#support'/);
  assert.doesNotMatch(html, /id="don-submit"|data-freq="monthly"|感謝支持！NT\$/);

  const legacy = await readFile(new URL('../support.dc.html', import.meta.url), 'utf8');
  assert.match(legacy, /location\.replace\('\/#support'\)/);
  assert.doesNotMatch(legacy, /id="don-submit"/);
});

test('support entries skip the map countdown before paint, including blocked storage', async () => {
  const html = await readFile(new URL('../index.html', import.meta.url), 'utf8');
  const bootstrap = [...html.matchAll(/<script>([\s\S]*?)<\/script>/g)].map(m => m[1]).find(s => s.includes('const entryTarget'));
  for (const blocked of [false, true]) {
    for (const hash of ['#support', '#contact', '#observatory', '#map', '']) {
      const classes = new Set();
      const window = {};
      let removed = false;
      vm.runInNewContext(bootstrap, { window, location: { hash }, document: { documentElement: { classList: { add: c => classes.add(c) } } }, sessionStorage: { getItem: () => { if (blocked) throw Error('blocked'); return JSON.stringify({ ts: Date.now(), label: '支持島民觀察室' }); }, removeItem: () => { removed = true; } } });
      const content = ['#support', '#contact', '#observatory'].includes(hash);
      assert.equal(window.__skipMapIntro, content);
      assert.equal(classes.has('content-entry'), content);
      if (hash === '#support' && !blocked) {
        assert.equal(window.__historyInbound.label, '支持島民觀察室');
        assert.equal(classes.has('history-inbound'), true);
        assert.equal(removed, true);
      }
    }
  }
  assert.match(html, /html\.content-entry #preloader,html\.history-inbound #preloader\{display:none !important\}/);
  assert.match(html, /this\._revealed = window\.__skipMapIntro === true/);
});
