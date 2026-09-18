import fs from 'node:fs';

const countyArg = process.argv.slice(2).join(' ').trim();
if (!countyArg) throw new Error('Usage: node scripts/report-missing-councilor-facebook.mjs <county id or name>');

const topo = JSON.parse(fs.readFileSync('data/counties.json', 'utf8'));
const geometries = topo?.objects?.map?.geometries || [];
const county = geometries.find(g => String(g?.properties?.id) === countyArg || g?.properties?.name === countyArg);
if (!county) throw new Error(`County not found: ${countyArg}`);

const p = county.properties;
const rows = [];
for (const block of p.councilors || []) {
  for (const c of block.candidates || []) {
    if (!c.facebook) {
      rows.push({
        countyId: p.id,
        county: p.name,
        district: block.district ?? '',
        districtName: block.name ?? block.districtName ?? '',
        name: c.name,
        party: c.party ?? '',
        role: c.role ?? '',
        facebook: c.facebook ?? null,
      });
    }
  }
}

console.log(JSON.stringify({
  countyId: p.id,
  county: p.name,
  totalCouncilorCandidates: (p.councilors || []).reduce((n, b) => n + (b.candidates || []).length, 0),
  missingFacebook: rows.length,
  rows,
}, null, 2));
