import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';
import { fillFromAutomatedSource } from '../scripts/automated-source-merge.mjs';

test('automated candidate sources never replace manually saved photos or links', () => {
  const candidate = {
    name: '測試候選人',
    photoUrl: '/api/photo/manual',
    facebook: 'https://facebook.com/manual',
    taiwanGoGoUrl: 'https://example.com/manual-record',
  };
  const result = fillFromAutomatedSource(candidate, {
    photoUrl: 'https://source.example/photo.jpg',
    facebook: 'https://facebook.com/source',
    taiwanGoGoUrl: 'https://council2026.taiwangogo.tw/?person=source',
  }, ['photoUrl', 'facebook', 'taiwanGoGoUrl'], { explicitSnapshot: true });

  assert.equal(candidate.photoUrl, '/api/photo/manual');
  assert.equal(candidate.facebook, 'https://facebook.com/manual');
  assert.equal(candidate.taiwanGoGoUrl, 'https://example.com/manual-record');
  assert.deepEqual(result.filled, []);
  assert.deepEqual(result.conflicts.sort(), ['facebook', 'photoUrl', 'taiwanGoGoUrl']);
});

test('explicitly cleared backend fields stay cleared while genuinely missing fields may be supplemented', () => {
  const candidate = { name: '測試候選人', photoUrl: null, facebook: '', instagram: undefined };
  const result = fillFromAutomatedSource(candidate, {
    photoUrl: 'https://source.example/photo.jpg',
    facebook: 'https://facebook.com/source',
    instagram: 'https://instagram.com/source',
    local2026Url: 'https://local2026.taiwangogo.tw/people/source/',
  }, ['photoUrl', 'facebook', 'instagram', 'local2026Url'], { explicitSnapshot: true });

  assert.equal(candidate.photoUrl, null);
  assert.equal(candidate.facebook, '');
  assert.equal(candidate.instagram, undefined);
  assert.equal(candidate.local2026Url, 'https://local2026.taiwangogo.tw/people/source/');
  assert.deepEqual(result.filled, ['local2026Url']);
});

test('candidate sync contains no destructive Taiwan GoGo reset and legacy JSON import only fills absent fields', async () => {
  const [sync, admin] = await Promise.all([
    readFile(new URL('../scripts/sync-taiwangogo-links.mjs', import.meta.url), 'utf8'),
    readFile(new URL('../admin.html', import.meta.url), 'utf8'),
  ]);
  assert.doesNotMatch(sync, /delete\s+candidate\.taiwanGoGoUrl/);
  assert.match(sync, /manualLinksPreserved/);
  assert.match(admin, /!Object\.hasOwn\(c, 'photoUrl'\)/);
  assert.match(admin, /!Object\.hasOwn\(c, 'facebook'\)/);
  assert.match(admin, /!Object\.hasOwn\(c, 'isIncumbent'\)/);
});
