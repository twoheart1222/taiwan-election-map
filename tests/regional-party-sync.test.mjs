import assert from 'node:assert/strict';
import fs from 'node:fs';
import test from 'node:test';
import '../admin-ballot-party-sync.js';

test('party correction changes only matched party fields and preserves revisions and manual media', () => {
  const original = { '10020': { _revision: 'rev-9', schemaVersion: 2,
    candidates: [{ name: '市長甲', party: '無', photoUrl: 'manual-photo' }],
    councilors: [{ district: '2', candidates: [
      { name: '王浩', party: '時代力量', photoUrl: 'keep-photo', facebook: 'keep-link', ballotNo: 8 },
      { name: '未列入者', party: '無', photoUrl: 'other-photo' },
    ] }], customField: { value: 0 } } };
  const parties = { '10020': { parties: { 市長甲: '無' }, councilorParties: { '2': { 王浩: '無' } } } };
  const plan = globalThis.FORegionalPartySync.prepare(original, parties, {});
  assert.deepEqual(plan.expectedRevisions, { '10020': 'rev-9' });
  assert.deepEqual(plan.differences.map(d => [d.name, d.from, d.to]), [['王浩', '時代力量', '無']]);
  assert.equal(original['10020'].councilors[0].candidates[0].party, '時代力量');
  assert.deepEqual(plan.changes['10020'], {
    ...original['10020'], councilors: [{ district: '2', candidates: [
      { name: '王浩', party: '無', photoUrl: 'keep-photo', facebook: 'keep-link', ballotNo: 8 },
      { name: '未列入者', party: '無', photoUrl: 'other-photo' },
    ] }],
  });
  assert.equal(globalThis.FORegionalPartySync.prepare(plan.changes, parties, {}).differences.length, 0);
});

test('admin applies the prepared revisions through the versioned API and verifies readback', () => {
  const html = fs.readFileSync(new URL('../admin.html', import.meta.url), 'utf8');
  assert.match(html, /FORegionalPartySync\.prepare\(fresh/);
  assert.match(html, /plan\.differences\.length !== 17/);
  assert.match(html, /apiFetch\('\/api\/admin\/overrides', \{ method: 'PUT'/);
  assert.match(html, /expectedRevisions: plan\.expectedRevisions/);
  assert.match(html, /FORegionalPartySync\.prepare\(verified/);
});
