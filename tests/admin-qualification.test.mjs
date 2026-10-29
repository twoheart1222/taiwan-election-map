import assert from 'node:assert/strict';
import fs from 'node:fs';
import test from 'node:test';
import vm from 'node:vm';
import '../election-data.js';

const read = name => fs.readFileSync(new URL('../' + name, import.meta.url), 'utf8');
const html = read('admin.html');
const review = JSON.parse(read('data/qualification-review-20261016.json'));
const counties = JSON.parse(read('data/counties.json')).objects.map.geometries.map(g => g.properties);

function mockElement() {
  const classes = new Set(['hidden']);
  return { textContent: '', disabled: false, children: [],
    classList: { add: value => classes.add(value), remove: value => classes.delete(value), contains: value => classes.has(value) },
    appendChild(child) { this.children.push(child); }, replaceChildren() { this.children = []; } };
}

function controller() {
  const state = Object.fromEntries(counties.map(c => [c.id, { ...structuredClone(c), schemaVersion: 2, _revision: 'v1-' + c.id }]));
  const elements = new Map();
  const element = id => { if (!elements.has(id)) elements.set(id, mockElement()); return elements.get(id); };
  const writes = [];
  const context = vm.createContext({ ElectionData, currentUser: { email: 'test@example.org' }, overridesLoaded: true,
    mutationBusy: false, editorTouched: false, document: { getElementById: element, createElement: mockElement },
    fetchJSON: async () => structuredClone(review), refreshCandidateEditorAfterSync: async () => {},
    apiFetch: async (path, options = {}) => {
      assert.equal(path, '/api/admin/overrides');
      if (!options.method) return structuredClone(state);
      assert.equal(options.method, 'PUT');
      const body = JSON.parse(options.body);
      for (const [code, revision] of Object.entries(body.expectedRevisions)) {
        if (state[code]._revision !== revision) throw new Error('409 資料已被更新');
      }
      writes.push(body);
      for (const [code, value] of Object.entries(body.overrides)) state[code] = { ...value, _revision: 'v2-' + code };
      return { ok: true, overrides: structuredClone(body.overrides) };
    },
  });
  const handlers = html.slice(html.indexOf('    let pendingQualificationReview'), html.indexOf('    // End qualification review.'));
  assert.ok(handlers.length > 0, 'admin review handlers are missing');
  vm.runInContext(`window=globalThis; ${handlers}`, context);
  return { context, state, writes, element };
}

test('admin offers editable qualification fields and a visible batch-review entry', () => {
  assert.match(html, /id="qualification-review-manager"/);
  for (const field of ['status', 'reason', 'date', 'source']) assert.match(html, new RegExp('class="c-qualification-' + field));
  assert.match(html, /election-data\.js\?v=20261016-qualifications/);
});

test('batch preview writes nothing; applying saves exactly ten versioned county documents and verifies readback', async () => {
  const { context, state, writes, element } = controller();
  const untouchedCounty = structuredClone(state['64000']);
  await context.previewQualificationReview();
  assert.equal(writes.length, 0);
  assert.equal(element('qualification-review-list').children.length, 10);
  assert.equal(element('qualification-review-apply').classList.contains('hidden'), false);
  await context.saveQualificationReview();
  assert.equal(writes.length, 1);
  assert.equal(Object.keys(writes[0].overrides).length, 10);
  assert.equal(Object.keys(writes[0].expectedRevisions).length, 10);
  assert.deepEqual(state['64000'], untouchedCounty);
  for (const entry of review.ineligible) {
    const candidate = state[entry.countyCode].councilors.find(b => String(b.district) === entry.district).candidates.find(c => c.name === entry.name);
    assert.equal(candidate.qualificationStatus, 'ineligible');
    assert.equal(candidate.qualificationSourceUrl, review.sourceUrl);
  }
  assert.match(element('qualification-review-status').textContent, /已儲存並確認 10 人/);
  await context.previewQualificationReview();
  assert.equal(element('qualification-review-apply').classList.contains('hidden'), true);
  await context.saveQualificationReview();
  assert.equal(writes.length, 1, 'already-applied notes must not be rewritten');
});

test('batch review requires login, protects unsaved edits and never retries a stale revision', async () => {
  const { context, state, writes, element } = controller();
  context.currentUser = null;
  await context.previewQualificationReview();
  assert.match(element('qualification-review-status').textContent, /登入/);
  context.currentUser = { email: 'test@example.org' }; context.editorTouched = true;
  await context.previewQualificationReview();
  assert.match(element('qualification-review-status').textContent, /未儲存修改/);
  context.editorTouched = false;
  await context.previewQualificationReview();
  state[review.ineligible[0].countyCode]._revision = 'edited-elsewhere';
  await context.saveQualificationReview();
  assert.equal(writes.length, 0);
  assert.match(element('qualification-review-status').textContent, /409/);
  assert.equal(element('qualification-review-apply').classList.contains('hidden'), true);
});

test('opening default form fields does not fabricate a manual status; edits and explicit clears survive collection', () => {
  const collect = html.slice(html.indexOf('    function collectCandidatesFromForm()'), html.indexOf('    function captureCurrentForm()'));
  let original = { name: '測試', gazetteUrl: null, qualificationStatus: null, qualificationReason: '' };
  const values = { '.c-name': '測試', '.c-qualification-status': 'unreviewed' };
  const row = { get _candidate() { return original; }, dataset: { district: '1' }, querySelector: key => ({ value: values[key] || '', checked: false }) };
  const context = vm.createContext({ document: { querySelectorAll: () => [row] } });
  vm.runInContext(collect, context);
  let candidate = context.collectCandidatesFromForm()[0];
  assert.equal(candidate.qualificationStatus, null);
  assert.equal(candidate.qualificationReason, '');
  original = { name: '測試' };
  candidate = context.collectCandidatesFromForm()[0];
  assert.equal(Object.hasOwn(candidate, 'qualificationStatus'), false);
  values['.c-qualification-status'] = 'ineligible'; values['.c-qualification-reason'] = '官方原因';
  candidate = context.collectCandidatesFromForm()[0];
  assert.equal(candidate.qualificationStatus, 'ineligible');
  assert.equal(candidate.qualificationReason, '官方原因');
  values['.c-ballot-mode'] = 'manual'; values['.c-ballot-no'] = '7';
  candidate = context.collectCandidatesFromForm()[0];
  assert.equal(candidate.ballotNo, 7);
  values['.c-ballot-mode'] = 'hidden';
  candidate = context.collectCandidatesFromForm()[0];
  assert.equal(candidate.ballotNo, null);
  values['.c-ballot-mode'] = 'official';
  candidate = context.collectCandidatesFromForm()[0];
  assert.equal(candidate.ballotNo, undefined);
  values['.c-ballot-mode'] = 'manual'; values['.c-ballot-no'] = '0';
  assert.throws(() => context.collectCandidatesFromForm(), /1～999/);
});
