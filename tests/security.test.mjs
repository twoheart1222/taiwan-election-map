import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFile, readdir } from 'node:fs/promises';
import { createHash } from 'node:crypto';

test('every public admin URL receives the hardened no-store header policy', async () => {
  const headers = await readFile(new URL('../_headers', import.meta.url), 'utf8');
  for (const route of ['/admin.html', '/admin', '/admin/']) {
    const start = headers.indexOf(`\n${route}\n`);
    assert.notEqual(start, -1, `${route} is missing from _headers`);
    const rest = headers.slice(start + route.length + 2);
    const block = rest.split(/\n(?=\/)/, 1)[0];
    assert.match(block, /Cache-Control: no-store/);
    assert.match(block, /X-Frame-Options: DENY/);
    assert.match(block, /X-Robots-Tag: noindex, nofollow, noarchive/);
    assert.match(block, /Cross-Origin-Resource-Policy: same-origin/);
    assert.match(block, /Content-Security-Policy: default-src 'self'/);
    assert.match(block, /script-src 'self' 'unsafe-inline' 'unsafe-eval' https:\/\/unpkg\.com/);
    assert.match(block, /connect-src 'self' https:\/\/api\.formosaobservatory\.com/);
    assert.match(block, /frame-ancestors 'none'/);
    assert.match(block, /object-src 'none'/);
  }
});

test('generated election pages restrict scripts and cannot be framed', async () => {
  const headers = await readFile(new URL('../_headers', import.meta.url), 'utf8');
  const start = headers.indexOf('\n/election/*\n');
  assert.notEqual(start, -1, '/election/* is missing from _headers');
  const rest = headers.slice(start + '\n/election/*\n'.length);
  const block = rest.split(/\n(?=\/)/, 1)[0];
  assert.match(block, /Content-Security-Policy: default-src 'self'/);
  assert.match(block, /script-src 'self' 'unsafe-inline' https:\/\/pagead2\.googlesyndication\.com/);
  assert.match(block, /frame-ancestors 'none'/);
  assert.match(block, /object-src 'none'/);
  assert.match(block, /base-uri 'self'/);
});

test('third-party executable scripts are version-pinned and integrity-checked', async () => {
  for (const file of ['index.html', 'admin.html', 'history/index.html']) {
    const html = await readFile(new URL(`../${file}`, import.meta.url), 'utf8');
    const externalScripts = [...html.matchAll(/<script\b[^>]*\bsrc=["'](https:\/\/[^"']+)["'][^>]*>/gi)];
    assert.ok(externalScripts.length > 0, `${file} should contain the audited external scripts`);
    for (const match of externalScripts) {
      const [tag, src] = match;
      if (src.includes('pagead2.googlesyndication.com')) continue;
      assert.doesNotMatch(src, /@latest|@(?:3|7)(?:\/|$)|cdn\.tailwindcss\.com\/?$/i, `${file}: ${src} is not pinned`);
      assert.match(tag, /\bintegrity=["']sha384-[A-Za-z0-9+/=]+["']/i, `${file}: ${src} has no SRI`);
      assert.match(tag, /\bcrossorigin=["']anonymous["']/i, `${file}: ${src} has no anonymous CORS mode`);
    }
  }
  const admin = await readFile(new URL('../admin.html', import.meta.url), 'utf8');
  const local = admin.match(/src=["']\/vendor\/tailwindcss-3\.4\.17\.js["'][^>]*integrity=["'](sha384-[A-Za-z0-9+/=]+)["']/i);
  assert.ok(local, 'the local Tailwind runtime should be versioned and integrity-checked');
  const bytes = await readFile(new URL('../vendor/tailwindcss-3.4.17.js', import.meta.url));
  assert.equal(local[1], `sha384-${createHash('sha384').update(bytes).digest('base64')}`);
});

test('GitHub Actions dependencies are pinned to immutable commit SHAs', async () => {
  const workflows = new URL('../.github/workflows/', import.meta.url);
  for (const file of await readdir(workflows)) {
    if (!/\.ya?ml$/i.test(file)) continue;
    const yaml = await readFile(new URL(file, workflows), 'utf8');
    for (const match of yaml.matchAll(/\buses:\s*([^\s#]+)/g)) {
      const action = match[1];
      assert.match(action, /^[^/@\s]+\/[^/@\s]+@[0-9a-f]{40}$/i, `${file}: ${action} is mutable`);
    }
  }
});

test('the public security contact points to the repository disclosure policy', async () => {
  const text = await readFile(new URL('../.well-known/security.txt', import.meta.url), 'utf8');
  assert.match(text, /^Contact: mailto:contact@formosaobservatory\.com$/m);
  assert.match(text, /^Canonical: https:\/\/formosaobservatory\.com\/\.well-known\/security\.txt$/m);
  assert.match(text, /^Policy: https:\/\/github\.com\/twoheart1222\/taiwan-election-map\/security\/policy$/m);
  const expires = text.match(/^Expires: (.+)$/m)?.[1];
  assert.ok(expires && Number.isFinite(Date.parse(expires)) && Date.parse(expires) > Date.now());
});

test('admin exposes an authenticated manual whole-site sync without a timer', async () => {
  const [admin, worker, workflow] = await Promise.all([
    readFile(new URL('../admin.html', import.meta.url), 'utf8'),
    readFile(new URL('../worker.js', import.meta.url), 'utf8'),
    readFile(new URL('../.github/workflows/manual-site-sync.yml', import.meta.url), 'utf8'),
  ]);
  assert.match(admin, /id="site-sync-btn"/);
  assert.match(admin, /\/api\/admin\/site-sync/);
  assert.match(admin, /GITHUB_SYNC_TOKEN/);
  assert.match(worker, /path === 'site-sync'/);
  assert.match(worker, /actions\/workflows\/\$\{workflow\}\/dispatches/);
  assert.match(workflow, /workflow_dispatch:/);
  assert.doesNotMatch(workflow, /\bschedule:/);
  assert.match(workflow, /npm run build:official-history/);
  assert.match(workflow, /sync-local2026-village-chiefs\.mjs/);
  assert.match(workflow, /npm test/);
});
