import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import test from 'node:test';

const root = path.resolve(import.meta.dirname, '..');
const html = fs.readFileSync(path.join(root, 'index.html'), 'utf8');

test('device location drills through county and town to the matched village', () => {
  const method = html.match(/async _openMyLocation\(setMessage\) \{([\s\S]*?)\n  \}\n\n  async _loadCandidateSearch/);
  assert.ok(method, 'missing _openMyLocation');
  assert.match(method[1], /this\._drillCounty\(county\.properties\)/);
  assert.match(method[1], /this\._drillTown\(town\.properties\)/);
  assert.match(method[1], /this\._drillVillage\(village\.properties\)/);
  assert.match(method[1], /String\(feature\.properties\.id\) === String\(found\.village\.id\)/);
  assert.doesNotMatch(method[1], /_openAddressDrawer/);
  assert.doesNotMatch(method[1], /_loadCandidateSearch/);
});

test('device location asks for a fresh high-accuracy reading', () => {
  const method = html.match(/_getDevicePosition\(\) \{([\s\S]*?)\n  \}\n  async _geoFind/);
  assert.ok(method, 'missing _getDevicePosition');
  assert.match(method[1], /enableHighAccuracy: true/);
  assert.match(method[1], /maximumAge: 0/);
});
