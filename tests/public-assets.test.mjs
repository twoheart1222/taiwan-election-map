import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import test from 'node:test';
import * as parse5 from 'parse5';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const published = path.join(root, '.public-deploy');
execFileSync(process.execPath, ['scripts/build-public-assets.mjs'], { cwd: root });
const read = file => fs.readFileSync(path.join(published, file), 'utf8');

test('public build excludes internal instructions and source comments', () => {
  for (const file of ['AGENTS.md', 'CLAUDE.md', 'STORAGE.md', 'CLOUDFLARE_SETUP.md', 'worker.js', 'override-store.js', 'scripts/import-overrides.mjs', 'data/history/README.md']) {
    assert.equal(fs.existsSync(path.join(published, file)), false, file);
  }
  for (const file of ['index.html', 'about/index.html', 'admin.html', 'site-config.js', 'election-data.js', 'data/ballot-numbers-keelung-villages-2026.js']) {
    assert.ok(fs.existsSync(path.join(published, file)), file);
  }
  assert.ok(!read('index.html').includes('保險絲：8 秒後'));
  assert.ok(!read('admin.html').includes('<!-- 頂部導覽 -->'));
  assert.ok(!read('site-config.js').includes('日後更換網域'));
  assert.ok(!read('data/ballot-numbers-keelung-villages-2026.js').includes('只記錄名冊資料'));
  assert.ok(!read('robots.txt').startsWith('#'));
  assert.match(read('index.html'), /site-config\.js\?b=[a-f0-9]{12}/);
  assert.match(read('admin.html'), /admin-source-order\.js\?v=20261017&amp;b=[a-f0-9]{12}/);
});

test('generated HTML has no HTML comments and keeps script and structured data', () => {
  for (const file of ['index.html', 'about/index.html', 'admin.html', 'election/index.html', 'history/index.html', 'source/index.html']) {
    const html = read(file);
    let comments = 0;
    const visit = node => {
      if (node.nodeName === '#comment') comments++;
      for (const child of node.childNodes || []) visit(child);
      if (node.content) visit(node.content);
    };
    visit(parse5.parse(html));
    assert.equal(comments, 0, file);
    assert.match(html, /<script/i);
  }
  assert.match(read('index.html'), /島民觀察室/);
  assert.match(read('election/index.html'), /application\/ld\+json/);
});

test('pinned vendor asset remains byte-for-byte identical for its integrity hash', () => {
  const file = 'vendor/tailwindcss-3.4.17.js';
  const source = fs.readFileSync(path.join(root, file));
  const output = fs.readFileSync(path.join(published, file));
  assert.equal(createHash('sha384').update(source).digest('base64'), createHash('sha384').update(output).digest('base64'));
  assert.match(read('_headers'), /Content-Security-Policy:/);
});

// Exercise the deployment output, since the source preview can serve pages omitted from it.
test('About navigation has a published HTML destination and its transition assets', () => {
  assert.match(read('index.html'), /href="\/about\/"/);
  const about = read('about/index.html');
  assert.match(about, /<!doctype html>/i);
  assert.match(about, /about-mission/);
  assert.match(about, /用資料，看懂我們/);
  assert.match(about, /page-transition\.js\?v=20261030&amp;b=[a-f0-9]{12}/);
  assert.ok(fs.existsSync(path.join(published, 'assets/ui/page-transition.js')));
});
