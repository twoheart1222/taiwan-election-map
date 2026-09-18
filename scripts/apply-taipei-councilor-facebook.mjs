import fs from 'node:fs';

const countiesFile = 'data/counties.json';
const socialsFile = 'data/tcc_councilor_socials.json';
const topo = JSON.parse(fs.readFileSync(countiesFile, 'utf8'));
const socials = JSON.parse(fs.readFileSync(socialsFile, 'utf8'));
const geometries = topo?.objects?.map?.geometries || [];
const taipei = geometries.find(g => g?.properties?.id === '63000');
if (!taipei) throw new Error('Taipei City 63000 not found');

const byDistrictName = new Map();
for (const block of taipei.properties.councilors || []) {
  for (const candidate of block.candidates || []) {
    byDistrictName.set(`${block.district}:${candidate.name}`, candidate);
  }
}

let patched = 0;
let already = 0;
const missing = [];
for (const [key, url] of Object.entries(socials.facebook || {})) {
  if (!/^https:\/\/(www\.)?facebook\.com\//i.test(url)) throw new Error(`Invalid Facebook URL for ${key}: ${url}`);
  const candidate = byDistrictName.get(key);
  if (!candidate) {
    missing.push(key);
    continue;
  }
  if (candidate.facebook === url) {
    already++;
    continue;
  }
  if (candidate.facebook && candidate.facebook !== url) {
    throw new Error(`Refusing overwrite for ${key}: ${candidate.facebook} -> ${url}`);
  }
  candidate.facebook = url;
  patched++;
}

if (missing.length) console.warn(`Official socials not in current 2026 roster: ${missing.join(', ')}`);
const all = (taipei.properties.councilors || []).flatMap(b => b.candidates || []);
const withFacebook = all.filter(c => c.facebook).length;
console.log(`Taipei councilor candidates: ${all.length}; patched: ${patched}; already: ${already}; Facebook total: ${withFacebook}; unresolved: ${all.length - withFacebook}`);
fs.writeFileSync(countiesFile, JSON.stringify(topo), 'utf8');
