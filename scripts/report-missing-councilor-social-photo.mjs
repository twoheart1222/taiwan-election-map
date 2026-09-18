import fs from 'node:fs';

const countyArg = process.argv.slice(2).join(' ').trim();
if (!countyArg) throw new Error('Usage: node scripts/report-missing-councilor-social-photo.mjs <county id or name>');

const topo = JSON.parse(fs.readFileSync('data/counties.json', 'utf8'));
const geometries = topo?.objects?.map?.geometries || [];
const county = geometries.find(g => String(g?.properties?.id) === countyArg || g?.properties?.name === countyArg);
if (!county) throw new Error(`County not found: ${countyArg}`);

const p = county.properties;
const blocks = Array.isArray(p.councilors?.blocks) ? p.councilors.blocks : (Array.isArray(p.councilors) ? p.councilors : []);
const rows = [];
let total = 0, missingFacebook = 0, missingPhoto = 0, missingEither = 0;
for (const block of blocks) {
  for (const c of block.candidates || []) {
    total += 1;
    const noFb = !String(c.facebook || '').trim();
    const noPhoto = !String(c.photoUrl || '').trim();
    if (noFb) missingFacebook += 1;
    if (noPhoto) missingPhoto += 1;
    if (noFb || noPhoto) {
      missingEither += 1;
      rows.push({
        countyId: p.id,
        county: p.name,
        district: block.district ?? '',
        districtName: block.name ?? block.districtName ?? '',
        name: c.name,
        party: c.party ?? '',
        role: c.role ?? '',
        facebook: c.facebook ?? null,
        photoUrl: c.photoUrl ?? null,
      });
    }
  }
}

console.log(JSON.stringify({ countyId: p.id, county: p.name, total, missingFacebook, missingPhoto, missingEither, rows }, null, 2));
