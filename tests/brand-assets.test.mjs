import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const read = (name) => fs.readFileSync(path.join(root, name));
const text = (name) => read(name).toString('utf8');

function pngSize(name) {
  const file = read(name);
  assert.equal(file.subarray(1, 4).toString('ascii'), 'PNG');
  return [file.readUInt32BE(16), file.readUInt32BE(20)];
}

test('favicon assets use square Google-compatible dimensions', () => {
  assert.deepEqual(pngSize('favicon.png'), [512, 512]);
  assert.deepEqual(pngSize('favicon-192.png'), [192, 192]);
  assert.deepEqual(pngSize('favicon-48.png'), [48, 48]);
  assert.deepEqual(pngSize('apple-touch-icon.png'), [180, 180]);
  assert.ok(read('favicon.ico').length > 0);
});

test('public entry pages declare the stable favicon and manifest URLs', () => {
  for (const file of ['index.html', 'admin.html', 'observatory.dc.html', 'support.dc.html']) {
    const html = text(file);
    assert.match(html, /href="\/favicon\.png"/);
    assert.match(html, /href="\/site\.webmanifest"/);
  }
});

test('homepage displays both the compact mark and full lockup', () => {
  const html = text('index.html');
  assert.match(html, /assets\/brand\/formosa-mark\.png/);
  assert.match(html, /assets\/brand\/formosa-lockup\.png/);
  assert.match(html, /"logo": "https:\/\/formosaobservatory\.com\/favicon\.png"/);
});

test('manifest references installable square icons', () => {
  const manifest = JSON.parse(text('site.webmanifest'));
  assert.equal(manifest.name, 'Formosa Observatory｜島民觀察室');
  assert.deepEqual(manifest.icons.map(({ sizes }) => sizes), ['192x192', '512x512']);
});

test('SEO page generator carries the same brand and favicon', () => {
  const generator = text('scripts/build-seo-pages.mjs');
  assert.match(generator, /assets\/brand\/formosa-mark\.png/);
  assert.match(generator, /href="\/favicon\.png"/);
  assert.match(generator, /logo: SITE \+ '\/favicon\.png'/);
});
