import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const text = (name) => fs.readFileSync(path.join(root, name), 'utf8');
const client = 'ca-pub-5043287080308993';
const slot = '6122170693';

test('interactive homepage stays free of AdSense runtime work', () => {
  const html = text('index.html');
  assert.doesNotMatch(html, /adsbygoogle/);
  assert.doesNotMatch(html, new RegExp(client));
});

test('historical election pages contain one responsive ad unit', () => {
  for (const file of ['history/index.html', 'history/local-executive.html', 'history/town.html']) {
    const html = text(file);
    assert.equal(html.match(/pagead2\.googlesyndication\.com\/pagead\/js\/adsbygoogle\.js/g)?.length, 1, file);
    assert.equal(html.match(new RegExp(`data-ad-slot="${slot}"`, 'g'))?.length, 1, file);
    assert.equal(html.match(/\(adsbygoogle=window\.adsbygoogle\|\|\[\]\)\.push\(\{\}\)/g)?.length, 1, file);
    assert.match(html, /data-ad-format="auto"/);
    assert.match(html, /data-full-width-responsive="true"/);
  }
});

test('generated election pages retain the same single-unit placement', () => {
  const generator = text('scripts/build-seo-pages.mjs');
  assert.match(generator, new RegExp(client));
  assert.match(generator, new RegExp(slot));

  for (const file of ['election/index.html', 'election/63000.html', 'election/63000030.html']) {
    const html = text(file);
    assert.equal(html.match(/pagead2\.googlesyndication\.com\/pagead\/js\/adsbygoogle\.js/g)?.length, 1, file);
    assert.equal(html.match(new RegExp(`data-ad-slot="${slot}"`, 'g'))?.length, 1, file);
  }
});
