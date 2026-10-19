import { test } from 'node:test';
import assert from 'node:assert/strict';
import { planTaiwanGoGoSync, taiwanGoGoSourceSnapshot, taiwanGoGoSourceSnapshotFromLinks } from '../taiwangogo-kv-sync.js';

test('Taiwan GoGo sync fills only missing links and preserves every manual field', () => {
  const snapshot = { '63000': {
    _revision: 'r1', schemaVersion: 2,
    candidates: [{ name: '市長甲', taiwanGoGoUrl: null, photoUrl: 'https://example.org/manual.jpg' }],
    councilors: [{ district: '1', candidates: [
      { name: '議員甲', taiwanGoGoUrl: null, facebook: 'https://example.org/manual' },
      { name: '議員乙', taiwanGoGoUrl: 'https://example.org/manual-link' },
      { name: '議員丙', taiwanGoGoUrl: null, manualFieldLocks: { taiwanGoGoUrl: true } },
    ] }],
  } };
  const people = [
    { id: 'p1', name: '市長甲', city: '台北市', level: '縣市長' },
    { id: 'p2', name: '議員甲', city: '臺北市', district: '第1選區', level: '議員' },
    { id: 'p3', name: '議員乙', city: '台北市', district: '第1選區', level: '議員' },
    { id: 'p4', name: '議員丙', city: '台北市', district: '第1選區', level: '議員' },
    { id: 'p5', name: '尚未登記', city: '台北市', district: '第1選區', level: '議員' },
  ];
  const districts = { cities: [{ id: 'tpe', mayorPeopleIds: ['p1'], districts: [{ id: 'tpe-1', peopleIds: ['p2', 'p3', 'p4', 'p5'] }] }] };
  const plan = planTaiwanGoGoSync(snapshot, people, districts);
  assert.equal(plan.summary.filled, 2);
  assert.equal(plan.summary.preserved, 2);
  assert.deepEqual(plan.summary.unmatched, ['p5']);
  assert.deepEqual(plan.expected, { '63000': 'r1' });
  assert.equal(plan.changes['63000'].candidates[0].photoUrl, 'https://example.org/manual.jpg');
  assert.equal(plan.changes['63000'].candidates[0].taiwanGoGoUrl, 'https://council2026.taiwangogo.tw/?person=p1');
  assert.equal(plan.changes['63000'].councilors[0].candidates[0].taiwanGoGoUrl,
    'https://council2026.taiwangogo.tw/?city=tpe&district=tpe-1&person=p2');
  assert.equal(plan.changes['63000'].councilors[0].candidates[0].facebook, 'https://example.org/manual');
  assert.equal(plan.changes['63000'].councilors[0].candidates[1].taiwanGoGoUrl, 'https://example.org/manual-link');
  assert.equal(plan.changes['63000'].councilors[0].candidates[2].taiwanGoGoUrl, null);
  assert.equal(snapshot['63000'].candidates[0].taiwanGoGoUrl, null);
  const repeat = planTaiwanGoGoSync(plan.changes, people, districts);
  assert.equal(repeat.summary.filled, 0);
  assert.deepEqual(repeat.changes, {});
});

test('Taiwan GoGo sync reports disappeared source people and stale KV links without deleting manual data', () => {
  const oldPerson = { id: '台北市|第1選區|議員甲', name: '議員甲', city: '台北市', district: '第1選區', level: '議員' };
  const currentPerson = { id: '台北市|第1選區|議員乙', name: '議員乙', city: '台北市', district: '第1選區', level: '議員' };
  const oldUrl = `https://council2026.taiwangogo.tw/?person=${encodeURIComponent(oldPerson.id)}`;
  const snapshot = { '63000': {
    _revision: 'r1', schemaVersion: 2, candidates: [],
    councilors: [{ district: '1', candidates: [
      { name: '議員甲', taiwanGoGoUrl: oldUrl, photoUrl: 'https://example.org/manual.jpg', manualFieldLocks: { taiwanGoGoUrl: true } },
      { name: '議員乙', taiwanGoGoUrl: null },
    ] }],
  } };
  const districts = { cities: [{ id: 'tpe', districts: [{ id: 'tpe-1', peopleIds: [currentPerson.id] }] }] };
  const plan = planTaiwanGoGoSync(snapshot, [currentPerson], districts, taiwanGoGoSourceSnapshot([oldPerson, currentPerson]));

  assert.equal(plan.summary.comparedWithPrevious, true);
  assert.equal(plan.summary.previousSourcePeople, 2);
  assert.deepEqual(plan.summary.sourceRemoved, [oldPerson]);
  assert.deepEqual(plan.summary.linkedMissing, [{
    id: oldPerson.id, name: '議員甲', city: '台北市', district: '第1選區', url: oldUrl, manual: true,
  }]);
  assert.equal(plan.summary.filled, 1);
  assert.equal(plan.changes['63000'].councilors[0].candidates[0].taiwanGoGoUrl, oldUrl);
  assert.equal(plan.changes['63000'].councilors[0].candidates[0].photoUrl, 'https://example.org/manual.jpg');
  assert.equal(snapshot['63000'].councilors[0].candidates[1].taiwanGoGoUrl, null);
  assert.equal(planTaiwanGoGoSync(snapshot, [currentPerson], districts).summary.comparedWithPrevious, false);
});

test('first sync can compare against the previous GitHub source export', () => {
  const previous = taiwanGoGoSourceSnapshotFromLinks({
    generatedAt: '2026-10-16T00:00:00.000Z',
    links: [{ personId: '台北市|第1選區|議員甲', name: '議員甲', city: '台北市', district: '第1選區' }],
  });
  const current = [{ id: '台北市|第1選區|議員乙', name: '議員乙', city: '台北市', district: '第1選區', level: '議員' }];
  const districts = { cities: [{ id: 'tpe', districts: [{ id: 'tpe-1', peopleIds: [current[0].id] }] }] };
  const plan = planTaiwanGoGoSync({ '63000': { candidates: [], councilors: [] } }, current, districts, previous);
  assert.equal(plan.summary.previousSourceAt, '2026-10-16T00:00:00.000Z');
  assert.deepEqual(plan.summary.sourceRemoved.map(person => person.name), ['議員甲']);
  assert.equal(taiwanGoGoSourceSnapshotFromLinks({ links: [] }), null);
});
