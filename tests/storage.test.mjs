import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFile, mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { build } from 'esbuild';
import { Miniflare, convertV4MiniflareOptions } from 'miniflare';
import vm from 'node:vm';
import { DatabaseSync } from 'node:sqlite';
import { pathToFileURL } from 'node:url';
import '../election-data.js';

test('legacy migration preserves base information; saved snapshots honor clears, zero, false and deletion', () => {
  const base = { candidates: [{ name: '甲', facebook: 'https://example.org', votes: 99 }, { name: '乙' }],
    councilors: [{ district: '1', candidates: [{ name: '丙', prevVotes: 12 }] }] };
  const legacy = ElectionData.mergeArea(base, { candidates: [{ name: '甲', votes: 0, elected: false }],
    councilors: { blocks: [{ district: '1', candidates: [{ name: '丙' }] }] } });
  assert.equal(legacy.candidates[0].votes, 0);
  assert.equal(legacy.candidates[0].elected, false);
  assert.equal(legacy.candidates[0].facebook, 'https://example.org');
  assert.equal(legacy.candidates.length, 2);
  assert.equal(legacy.councilors[0].candidates[0].prevVotes, 12);
  const saved = { schemaVersion: 2, candidates: [{ name: '甲', facebook: null, votes: 0, elected: false }], councilors: [] };
  const result = ElectionData.mergeArea(base, saved);
  assert.deepEqual(result.candidates, saved.candidates);
  assert.deepEqual(result.councilors, []);
  assert.equal(base.candidates.length, 2);
});

test('browser scripts compile; map and search use the same roster semantics', async () => {
  const html = await readFile(new URL('../index.html', import.meta.url), 'utf8');
  for (const file of ['index.html', 'admin.html']) {
    const text = await readFile(new URL(`../${file}`, import.meta.url), 'utf8');
    for (const m of text.matchAll(/<script\b([^>]*)>([\s\S]*?)<\/script>/gi)) {
      if (/src=|application\/ld\+json/.test(m[1])) continue;
      new vm.Script(m[2], { filename: file });
    }
  }
  const method = html.slice(html.indexOf('  _mergeSearchOverrides('), html.indexOf('  _candidateLocation('));
  const app = vm.runInNewContext(`({${method}})`, { ElectionData });
  const index = { areas: { X: { areaId: 'X', name: '地區' } }, candidates: [
    { areaId: 'X', source: 'candidates', name: '甲', facebook: 'https://example.org' },
    { areaId: 'X', source: 'candidates', name: '乙' },
    { areaId: 'X', source: 'councilors', name: '丙', district: '1', votes: 42 },
  ] };
  const result = app._mergeSearchOverrides(index, { X: { schemaVersion: 2,
    candidates: [{ name: '甲', facebook: null }], councilors: { blocks: [] } } });
  assert.equal(result.candidates.length, 1);
  assert.equal(result.candidates[0].facebook, null);
  assert.equal(result.candidates[0].name, '甲');
});

test('rapid map hover keeps exactly one transient region highlighted', async () => {
  const html = await readFile(new URL('../index.html', import.meta.url), 'utf8');
  const method = html.slice(html.indexOf('  _setHovered(next)'), html.indexOf('  _paint(mesh, mode)'));
  const app = vm.runInNewContext(`({${method}})`);
  const first = { userData: {} }, second = { userData: {} };
  const firstLabel = { style: {} }, secondLabel = { style: {} };
  const paints = [];
  Object.assign(app, {
    active: { meshes: [first, second] },
    labels: [{ mesh: first, el: firstLabel }, { mesh: second, el: secondLabel }],
    _selected: null,
    _paint: (mesh, mode) => paints.push([mesh, mode]),
  });
  app._setHovered(first);
  app._setHovered(second);
  assert.equal(first.userData.hoverHot, false);
  assert.equal(second.userData.hoverHot, true);
  assert.equal(firstLabel.style.background, 'rgba(13,13,13,.68)');
  assert.equal(secondLabel.style.background, '#E4022B');
  assert.deepEqual(paints.map(([, mode]) => mode), ['hot', 'base', 'hot']);
  app._setHovered(null);
  assert.equal(second.userData.hoverHot, false);
  assert.equal(paints.at(-1)[1], 'base');
});

test('map navigation retains its hover until the transition veil has finished', async () => {
  const html = await readFile(new URL('../index.html', import.meta.url), 'utf8');
  const method = html.slice(html.indexOf('  _transitionMap(change'), html.indexOf('  _miniCue(change'));
  const nodes = {
    'page-transition': {},
    'page-transition-label': {},
    'page-transition-kicker': {},
    'page-transition-rule': {},
  };
  const app = vm.runInNewContext(`({${method}})`, { document: { getElementById: id => nodes[id] } });
  let finishTransition, changed = false, cleared = false;
  app._playVeil = (_veil, _title, _kicker, _rule, change, _key, onDone) => {
    assert.equal(app._mapTransitioning, true);
    change();
    finishTransition = onDone;
  };
  app._setHovered = value => { if (value === null) cleared = true; };
  app._transitionMap(() => { changed = true; }, '新北市', '縣市選情 / COUNTY');
  assert.equal(changed, true);
  assert.equal(cleared, false);
  assert.equal(app._mapTransitioning, true);
  finishTransition();
  assert.equal(app._mapTransitioning, false);
  assert.equal(cleared, true);
});

test('API migration, version conflicts, concurrent writes, atomic batches and KV parity', async t => {
  const dir = await mkdtemp(join(tmpdir(), 'election-storage-'));
  await build({ entryPoints: [new URL('../worker.js', import.meta.url).pathname.replace(/^\/([A-Za-z]:)/, '$1')],
    bundle: true, format: 'esm', platform: 'browser', minifySyntax: true, minifyWhitespace: true,
    external: ['cloudflare:*'], outfile: join(dir, 'worker.mjs') });
  const mf = new Miniflare(convertV4MiniflareOptions({ workers: [{ name: 'api', modules: true, modulesRoot: dir, scriptPath: join(dir, 'worker.mjs'),
    compatibilityDate: '2026-09-16', kvNamespaces: ['ELECTION_KV'],
    email: { send_email: [{ name: 'CONTACT_EMAIL' }] },
    durableObjects: { OVERRIDE_STORE: { className: 'OverrideStore', useSQLite: true } },
    bindings: { ADMIN_TOKEN: 'test-only-token' } }] }));
  t.after(async () => { await mf.dispose(); await rm(dir, { recursive: true, force: true }); });
  const kv = await mf.getKVNamespace('ELECTION_KV');
  const fixture = process.env.ELECTION_TEST_SNAPSHOT ? JSON.parse(await readFile(process.env.ELECTION_TEST_SNAPSHOT, 'utf8')) : {};
  const original = { ...fixture, A: { candidates: [{ name: '甲', votes: 1 }], representatives: [], extra: 'keep' },
    B: { candidates: [{ name: '乙', votes: 2 }] },
    '63000': { candidates: [{ name: '縣市資料' }] },
    '63000010': { candidates: [{ name: '鄉鎮資料' }] } };
  await kv.put('overrides', JSON.stringify(original));
  await kv.put('override:A', JSON.stringify({ candidates: [{ name: '過期資料' }] }));
  const request = async (path, method = 'GET', body, revision) => {
    const headers = { Authorization: 'Bearer test-only-token', 'Content-Type': 'application/json' };
    if (revision !== undefined) headers['If-Match'] = revision;
    const response = await mf.dispatchFetch(`https://test${path}`, { method, headers,
      ...(body === undefined ? {} : { body: JSON.stringify(body) }) });
    return { status: response.status, body: await response.json() };
  };
  const read = () => request('/api/admin/overrides');
  const announcement = await request('/api/admin/announcement', 'PUT', { items: [{
    id: 'history-alert', enabled: true, title: '歷屆公告', message: '測試內容',
    pages: { history: true }, display: 'fullscreen', supportLock: false,
  }] });
  assert.equal(announcement.status, 200);
  assert.equal(announcement.body.items[0].pages.history, true);
  assert.equal(announcement.body.items[0].display, 'fullscreen');
  assert.deepEqual((await request('/?key=site_announcement')).body.items, announcement.body.items);
  const parity = async () => {
    const admin = await read();
    const publicData = await request('/?key=overrides');
    assert.equal(admin.status, 200);
    assert.deepEqual(admin.body, publicData.body);
    assert.deepEqual(admin.body, await kv.get('overrides', 'json'));
    return admin.body;
  };
  let data = await parity();
  const countyOnly = await request('/?key=overrides&scope=county');
  assert.equal(countyOnly.status, 200);
  assert.deepEqual(Object.keys(countyOnly.body), ['63000']);
  assert.deepEqual(countyOnly.body['63000'], data['63000']);
  assert.equal(data.A.schemaVersion, 2);
  assert.equal(data.A.candidates[0].name, '甲');
  assert.deepEqual(await kv.get('backup:overrides:before-unified-store', 'json'), original);
  assert.equal((await request('/api/admin/overrides/A', 'PUT', { candidates: [] })).status, 428);
  const initial = data;
  const updates = await Promise.all([
    request('/api/admin/overrides/A', 'PUT', { candidates: [{ name: '甲', votes: 0, elected: false, facebook: null }] }, data.A._revision),
    request('/api/admin/overrides/B', 'PUT', { candidates: [] }, data.B._revision),
  ]);
  assert.deepEqual(updates.map(r => r.status), [200, 200]);
  data = await parity();
  assert.equal(data.A.candidates[0].votes, 0);
  assert.equal(data.A.extra, 'keep');
  assert.deepEqual(data.A.representatives, []);
  assert.deepEqual(data.B.candidates, []);
  assert.equal((await request('/api/admin/overrides/A', 'PUT', { candidates: [] }, initial.A._revision)).status, 409);
  const competing = await Promise.all([
    request('/api/admin/overrides/A', 'PUT', { quota: 1 }, data.A._revision),
    request('/api/admin/overrides/A', 'PUT', { quota: 2 }, data.A._revision),
  ]);
  assert.deepEqual(competing.map(r => r.status).sort(), [200, 409]);
  data = await parity();
  const failedBatch = await request('/api/admin/overrides', 'PUT', {
    overrides: { A: { quota: 999 }, B: { quota: 999 } },
    expectedRevisions: { A: data.A._revision, B: initial.B._revision },
  });
  assert.equal(failedBatch.status, 409);
  assert.deepEqual(await parity(), data);
  const batch = await request('/api/admin/overrides', 'PUT', {
    overrides: { A: { quota: 7 } }, expectedRevisions: { A: data.A._revision },
  });
  assert.equal(batch.status, 200);
  data = await parity();
  assert.ok(data.B);
  assert.equal((await request('/api/admin/kv/overrides', 'PUT', {})).status, 409);
  assert.equal((await request('/api/admin/kv/override:A', 'PUT', {})).status, 409);
  assert.equal((await request('/api/admin/overrides/A', 'DELETE', undefined, data.A._revision)).status, 200);
  assert.equal((await parity()).A, undefined);
  assert.equal((await request('/?key=override:A')).status, 404);
  assert.equal((await mf.dispatchFetch('https://test/api/admin/overrides')).status, 401);
  const recreated = await request('/api/admin/overrides/A', 'PUT', { schemaVersion: 2, candidates: [] }, '0');
  assert.equal(recreated.status, 200);
  await parity();
});

test('KV publish failure retains committed data and retries after store restart', async t => {
  const dir = await mkdtemp(join(tmpdir(), 'election-recovery-'));
  const output = join(dir, 'store.mjs');
  await build({ entryPoints: [new URL('../override-store.js', import.meta.url).pathname.replace(/^\/([A-Za-z]:)/, '$1')],
    bundle: true, format: 'esm', platform: 'node', outfile: output });
  const { OverrideStore } = await import(pathToFileURL(output));
  const db = new DatabaseSync(':memory:');
  t.after(async () => { db.close(); await rm(dir, { recursive: true, force: true }); });
  let alarm = null, fail = false;
  const kv = new Map([['overrides', JSON.stringify({ A: { candidates: [] } })]]);
  const env = { ELECTION_KV: { get: async key => kv.get(key) ?? null, put: async (key, value) => {
    if (fail && key === 'overrides') throw new Error('Simulated KV outage');
    kv.set(key, value);
  } } };
  const ctx = { blockConcurrencyWhile: fn => fn(), storage: {
    sql: { exec: (query, ...args) => db.prepare(query).all(...args) },
    transactionSync: fn => { db.exec('BEGIN'); try { const result = fn(); db.exec('COMMIT'); return result; } catch (err) { db.exec('ROLLBACK'); throw err; } },
    setAlarm: async time => { alarm = time; }, deleteAlarm: async () => { alarm = null; },
  } };
  let store = new OverrideStore(ctx, env);
  const initial = await (await store.fetch(new Request('http://store'))).json();
  fail = true;
  const failed = await store.fetch(new Request('http://store', { method: 'POST', body: JSON.stringify({
    changes: { A: { candidates: [{ name: '新資料' }] } }, expected: { A: initial.A._revision }, actor: 'test',
  }) }));
  assert.equal(failed.status, 503);
  assert.ok(alarm);
  assert.deepEqual(JSON.parse(kv.get('overrides')), initial);
  fail = false;
  store = new OverrideStore(ctx, env);
  await store.alarm();
  const recovered = await (await store.fetch(new Request('http://store'))).json();
  assert.equal(recovered.A.candidates[0].name, '新資料');
  assert.deepEqual(JSON.parse(kv.get('overrides')), recovered);
  assert.equal(alarm, null);
});

test('editor preserves edits across role/district switches and keeps unedited metadata', async () => {
  const html = await readFile(new URL('../admin.html', import.meta.url), 'utf8');
  const functions = html.slice(html.indexOf('    window.switchCountyRole'), html.indexOf('    function councilDistrictLabel'));
  const capture = html.slice(html.indexOf('    function captureCurrentForm()'), html.indexOf('    function buildCurrentPayload()'));
  const elements = new Map();
  const element = id => { if (!elements.has(id)) elements.set(id, { value: '', classList: { add() {}, remove() {} } }); return elements.get(id); };
  const context = vm.createContext({ document: { getElementById: element }, lucide: { createIcons() {} },
    currentScope: 'county', currentCountyRole: 'mayor', currentDistrictMode: 'all', formReady: true,
    workingCandidates: [{ name: '舊首長' }], workingCouncilors: [
      { district: '1', candidates: [{ name: '甲' }] }, { district: '2', candidates: [{ name: '乙' }] }],
    rows: [{ name: '修改首長' }], escapeHTML: x => x, councilDistrictLabel: b => b.district });
  vm.runInContext(`window = globalThis; collectCandidatesFromForm = () => rows;
    renderCandidateRows = (list, all) => { rows = structuredClone(list); formReady = true; };
    ${capture}\n${functions}`, Object.assign(context, { structuredClone }));
  context.switchCountyRole('councilor');
  assert.equal(context.workingCandidates[0].name, '修改首長');
  context.rows = [{ name: '修改甲', district: '1' }, { name: '乙', district: '2' }];
  element('select-council-district').value = '1';
  context.onCouncilDistrictChange();
  assert.equal(context.workingCouncilors[0].candidates[0].name, '修改甲');
  context.rows = [{ name: '修改乙', district: '2' }];
  context.switchCountyRole('mayor');
  assert.equal(context.workingCouncilors[1].candidates[0].name, '修改乙');
  assert.equal(context.rows[0].name, '修改首長');
  const collect = html.slice(html.indexOf('    function collectCandidatesFromForm()'), html.indexOf('    function captureCurrentForm()'));
  context.document.querySelectorAll = () => [{ _candidate: { name: '甲', registeredDate: '115/09/01', olcId: 'keep' },
    dataset: { district: '1' }, querySelector: selector => ({ value: selector === '.c-name' ? '甲' : '', checked: false }) }];
  vm.runInContext(collect, context);
  const candidate = context.collectCandidatesFromForm()[0];
  assert.equal(candidate.registeredDate, '115/09/01');
  assert.equal(candidate.olcId, 'keep');
  assert.equal(candidate.facebook, null);
});
