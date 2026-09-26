import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFile, readdir } from 'node:fs/promises';

test('footer ads use the vendor native container without the cookie-blocking sandbox', async () => {
  const js = await readFile(new URL('../ads/footer-placement.js', import.meta.url), 'utf8');
  assert.match(js, /container-640f7266bc095f61cfa2140a5b1cfcbe/);
  assert.match(js, /script\.dataset\.cfasync = 'false'/);
  assert.match(js, /if \(started\) return/);
  assert.match(js, /IntersectionObserver/);
  assert.doesNotMatch(js, /createElement\(['"]iframe['"]\)|sandbox=/);
  const home = await readFile(new URL('../index.html', import.meta.url), 'utf8');
  assert.doesNotMatch(home, /src=["']\/ads\/footer\.html/);
});

test('public election and history pages load the current footer ad once', async () => {
  const paths = ['index.html', 'observatory.dc.html'];
  async function walk(dir) {
    for (const entry of await readdir(new URL(`../${dir}/`, import.meta.url), { withFileTypes: true })) {
      const path = `${dir}/${entry.name}`;
      if (entry.isDirectory()) await walk(path);
      else if (entry.name.endsWith('.html')) paths.push(path);
    }
  }
  await walk('election');
  await walk('history');
  for (const path of paths) {
    const html = await readFile(new URL(`../${path}`, import.meta.url), 'utf8');
    assert.equal((html.match(/\/ads\/footer-placement\.js\?v=20260926-native2/g) || []).length, 1, path);
  }
});
