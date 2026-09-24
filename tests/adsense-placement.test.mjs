import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const text = (name) => fs.readFileSync(path.join(root, name), 'utf8');
const client = 'ca-pub-5043287080308993';

test('interactive homepage stays free of AdSense runtime work', () => {
  const html = text('index.html');
  assert.doesNotMatch(html, /adsbygoogle/);
  assert.doesNotMatch(html, new RegExp(client));
});

test('historical election pages load AdSense for site-managed automatic ads', () => {
  for (const file of ['history/index.html', 'history/local-executive.html', 'history/councilor.html', 'history/town.html']) {
    const html = text(file);
    assert.equal(html.match(/pagead2\.googlesyndication\.com\/pagead\/js\/adsbygoogle\.js/g)?.length, 1, file);
    assert.match(html, new RegExp(client));
    assert.doesNotMatch(html, /<ins class="adsbygoogle"/);
    assert.doesNotMatch(html, /data-ad-slot=/);
  }
});

test('generated election pages use the same site-managed automatic ads setup', () => {
  const generator = text('scripts/build-seo-pages.mjs');
  assert.match(generator, new RegExp(client));
  assert.doesNotMatch(generator, /ADSENSE_SLOT/);

  for (const file of ['election/index.html', 'election/63000.html', 'election/63000030.html']) {
    const html = text(file);
    assert.equal(html.match(/pagead2\.googlesyndication\.com\/pagead\/js\/adsbygoogle\.js/g)?.length, 1, file);
    assert.match(html, new RegExp(client));
    assert.doesNotMatch(html, /<ins class="adsbygoogle"/);
    assert.doesNotMatch(html, /data-ad-slot=/);
  }
});
