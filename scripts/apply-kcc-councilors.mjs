import { readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';

const [overridesInput, kccInput = 'data/kcc_councilors.json', overridesOutput] = process.argv.slice(2);
const updateBase = process.argv.includes('--update-base');

if (!overridesInput || !overridesOutput) {
  console.error('Usage: node scripts/apply-kcc-councilors.mjs <overrides-input.json> [kcc.json] <overrides-output.json> [--update-base]');
  process.exit(1);
}

function normalizeName(value) {
  return String(value || '').replace(/[\s\u3000·‧・]/g, '');
}

function councilorBlocks(document) {
  if (Array.isArray(document?.councilors)) return document.councilors;
  if (Array.isArray(document?.councilors?.blocks)) return document.councilors.blocks;
  return null;
}

function applyFacebook(blocks, officialByName) {
  const report = { candidates: 0, matched: 0, added: 0, preserved: 0, matchedNames: new Set() };
  for (const block of blocks || []) {
    for (const candidate of block.candidates || []) {
      report.candidates += 1;
      const official = officialByName.get(normalizeName(candidate.name));
      if (!official) continue;
      report.matched += 1;
      report.matchedNames.add(normalizeName(official.name));
      if (candidate.facebook) {
        report.preserved += 1;
        continue;
      }
      candidate.facebook = official.facebook;
      report.added += 1;
    }
  }
  return report;
}

const [overrides, kccRows] = await Promise.all([
  readFile(path.resolve(overridesInput), 'utf8').then(JSON.parse),
  readFile(path.resolve(kccInput), 'utf8').then(JSON.parse),
]);

const invalidOfficials = kccRows.filter((row) => !row.name || !/^https:\/\/www\.facebook\.com\//i.test(row.facebook || ''));
if (invalidOfficials.length) {
  throw new Error(`Invalid KCC rows: ${invalidOfficials.map((row) => row.name || '(missing name)').join(', ')}`);
}

const officialByName = new Map(kccRows.map((row) => [normalizeName(row.name), row]));
if (officialByName.size !== kccRows.length) throw new Error('Duplicate KCC councilor names detected');

const county = overrides['64000'];
const blocks = councilorBlocks(county);
if (!blocks) throw new Error('Kaohsiung councilor blocks are missing from overrides');

const overrideReport = applyFacebook(blocks, officialByName);
county.updatedAt = new Date().toISOString();
county.updatedBy = 'KCC official councilor sync';

let baseReport = null;
if (updateBase) {
  const basePath = path.resolve('data/counties.json');
  const topo = JSON.parse(await readFile(basePath, 'utf8'));
  const objectKey = Object.keys(topo.objects || {})[0];
  const countyGeometry = topo.objects?.[objectKey]?.geometries?.find((geometry) => String(geometry.properties?.id) === '64000');
  if (!countyGeometry) throw new Error('Kaohsiung is missing from data/counties.json');
  baseReport = applyFacebook(councilorBlocks(countyGeometry.properties), officialByName);
  await writeFile(basePath, `${JSON.stringify(topo)}\n`, 'utf8');
}

const unmatchedOfficials = kccRows
  .filter((row) => !overrideReport.matchedNames.has(normalizeName(row.name)))
  .map((row) => ({ name: row.name, district: row.district, detailUrl: row.detailUrl }));

await writeFile(path.resolve(overridesOutput), `${JSON.stringify(overrides, null, 2)}\n`, 'utf8');

console.log(JSON.stringify({
  output: path.resolve(overridesOutput),
  officialCouncilors: kccRows.length,
  overrideCandidates: overrideReport.candidates,
  matchedOfficials: overrideReport.matched,
  facebookAdded: overrideReport.added,
  existingFacebookPreserved: overrideReport.preserved,
  baseFacebookAdded: baseReport?.added ?? 0,
  unmatchedOfficials,
}, null, 2));
