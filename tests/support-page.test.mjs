import { test } from 'node:test';
import assert from 'node:assert/strict';
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
