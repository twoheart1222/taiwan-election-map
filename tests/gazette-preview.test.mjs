import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

test('candidate cards expose a pending or expandable gazette preview', async () => {
  const html = await readFile(new URL('../index.html', import.meta.url), 'utf8');
  assert.match(html, /查看選舉公報/);
  assert.match(html, /待選舉公報公告後更新/);
  assert.match(html, /gazettePreviewUrl/);
  assert.match(html, /class="gazette-preview-button"/);
  assert.match(html, /className = 'gazette-lightbox'/);
  assert.match(html, /data-gazette-action="zoom-in"/);
});

test('admin and shared storage paths preserve editable gazette metadata', async () => {
  const [admin, electionData, sync, worker] = await Promise.all([
    readFile(new URL('../admin.html', import.meta.url), 'utf8'),
    readFile(new URL('../election-data.js', import.meta.url), 'utf8'),
    readFile(new URL('../admin-kv-sync.js', import.meta.url), 'utf8'),
    readFile(new URL('../worker.js', import.meta.url), 'utf8'),
  ]);
  for (const field of ['gazetteUrl', 'gazettePreviewUrl', 'gazettePage', 'gazetteAlt']) {
    assert.match(admin, new RegExp(`${field}: row\\.querySelector`), `admin must collect ${field}`);
    assert.match(electionData, new RegExp(`['"]${field}['"]`), `frontend merge must retain ${field}`);
    assert.match(sync, new RegExp(`['"]${field}['"]`), `GitHub/KV sync must understand ${field}`);
  }
  assert.match(worker, /'gazettePreviewUrl'/, 'preview images must pass the API URL validator');
  assert.match(admin, /留空時前台顯示「待選舉公報公告後更新」/);
});

test('candidate search highlight stays clipped to the selected card', async () => {
  const html = await readFile(new URL('../index.html', import.meta.url), 'utf8');
  assert.match(html, /\.candidate-card\.search-target-ring\{[^}]*overflow:hidden/);
  assert.match(html, /\.candidate-search-orbit\{[^}]*inset:0[^}]*width:100%[^}]*height:100%[^}]*overflow:hidden/);
  assert.match(html, /const width = Math\.max\(1, el\.clientWidth\), height = Math\.max\(1, el\.clientHeight\)/);
  assert.doesNotMatch(html, /candidate-search-orbit\{[^}]*overflow:visible/);
});
