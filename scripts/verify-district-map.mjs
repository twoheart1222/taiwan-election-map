import fs from 'node:fs';
import path from 'node:path';
import process from 'node:process';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const districtMap = JSON.parse(
  fs.readFileSync(path.join(root, 'data', 'district_town_map.json'), 'utf8'),
);

const errors = [];
let districtCount = 0;

for (const [countyCode, county] of Object.entries(districtMap)) {
  const topoPath = path.join(root, 'data', 'towns', `towns-${countyCode}.json`);
  if (!fs.existsSync(topoPath)) {
    errors.push(`${countyCode} ${county.countyName}: missing ${path.relative(root, topoPath)}`);
    continue;
  }

  const topology = JSON.parse(fs.readFileSync(topoPath, 'utf8'));
  const object = Object.values(topology.objects ?? {})[0];
  const knownTowns = new Set(
    (object?.geometries ?? [])
      .map((geometry) => geometry.properties?.name ?? geometry.properties?.TOWNNAME)
      .filter(Boolean),
  );

  for (const [districtNumber, district] of Object.entries(county.districts ?? {})) {
    districtCount += 1;
    for (const town of district.towns ?? []) {
      if (!knownTowns.has(town)) {
        errors.push(`${countyCode} ${county.countyName} 第${districtNumber}選舉區: unknown town ${town}`);
      }
    }
  }
}

if (errors.length > 0) {
  console.error(errors.join('\n'));
  process.exitCode = 1;
} else {
  console.log(`Verified ${districtCount} districts across ${Object.keys(districtMap).length} counties/cities.`);
}
