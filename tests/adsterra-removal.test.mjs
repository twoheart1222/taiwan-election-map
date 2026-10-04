import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFile, readdir } from 'node:fs/promises';

test('published pages and generator do not load the removed footer advertising vendor', async () => {
  const pages = ['index.html', 'observatory.dc.html'];
  async function collect(dir) {
    for (const entry of await readdir(new URL(`../${dir}/`, import.meta.url), { withFileTypes: true })) {
      const path = `${dir}/${entry.name}`;
      if (entry.isDirectory()) await collect(path);
      else if (entry.name.endsWith('.html')) pages.push(path);
    }
  }
  await collect('history');
  await collect('election');
  for (const path of pages) {
    const html = await readFile(new URL(`../${path}`, import.meta.url), 'utf8');
    assert.doesNotMatch(html, /footer-placement\.js|profitableratecpmnetwork|adsterra/i, path);
  }
  const generator = await readFile(new URL('../scripts/build-seo-pages.mjs', import.meta.url), 'utf8');
  assert.doesNotMatch(generator, /footer-placement\.js|profitableratecpmnetwork|adsterra/i);
  const headers = await readFile(new URL('../_headers', import.meta.url), 'utf8');
  assert.doesNotMatch(headers, /profitableratecpmnetwork|\/ads\/\*/i);
  assert.match(headers, /pagead2\.googlesyndication\.com/);
});
