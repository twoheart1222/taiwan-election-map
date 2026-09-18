import fs from 'node:fs';

const file = 'data/counties.json';
const topo = JSON.parse(fs.readFileSync(file, 'utf8'));
const taipei = topo?.objects?.map?.geometries?.find(g => g?.properties?.id === '63000');
if (!taipei) throw new Error('Taipei City 63000 not found');

// Current/recently cross-verified accounts from official social listings, current structured data,
// or reputable media that explicitly attributes posts/images to the named Facebook account.
const facebook = {
  '2:何孟樺': 'https://www.facebook.com/TaipeiHmh',
  '5:鍾小平': 'https://www.facebook.com/chung.siao.ping',
  '6:簡舒培': 'https://www.facebook.com/justmatchtaipei',
  '6:王閔生': 'https://www.facebook.com/iwangyou',
};

const index = new Map();
for (const block of taipei.properties.councilors || []) {
  for (const c of block.candidates || []) index.set(`${block.district}:${c.name}`, c);
}

let patched = 0;
for (const [key, url] of Object.entries(facebook)) {
  if (!/^https:\/\/(www\.)?facebook\.com\//i.test(url)) throw new Error(`Invalid URL: ${key}`);
  const c = index.get(key);
  if (!c) throw new Error(`Candidate not found: ${key}`);
  if (c.facebook && c.facebook !== url) throw new Error(`Refusing overwrite: ${key} ${c.facebook} -> ${url}`);
  if (!c.facebook) { c.facebook = url; patched++; }
}

const all = (taipei.properties.councilors || []).flatMap(b => b.candidates || []);
console.log(`Taipei round2 patched: ${patched}; Facebook total: ${all.filter(c => c.facebook).length}/${all.length}`);
fs.writeFileSync(file, JSON.stringify(topo), 'utf8');
