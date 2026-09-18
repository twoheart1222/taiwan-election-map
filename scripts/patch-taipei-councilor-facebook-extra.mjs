import fs from 'node:fs';

const file = 'data/counties.json';
const topo = JSON.parse(fs.readFileSync(file, 'utf8'));
const taipei = topo?.objects?.map?.geometries?.find(g => g?.properties?.id === '63000');
if (!taipei) throw new Error('Taipei City 63000 not found');

// Manually verified public politician/campaign pages not present in the TCC official social map.
// Keep district+name keys explicit to avoid same-name collisions.
const facebook = {
  '2:吳欣岱': 'https://www.facebook.com/TSPDrShe',
  '2:高嘉瑜': 'https://www.facebook.com/ntufishfans',
  '4:林亮君': 'https://www.facebook.com/sabrinalim.tw',
  '4:葉林傳': 'https://www.facebook.com/YeLinChuan',
  '6:鍾沛君': 'https://www.facebook.com/ave5639c',
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
  if (!c.facebook) {
    c.facebook = url;
    patched++;
  }
}

const all = (taipei.properties.councilors || []).flatMap(b => b.candidates || []);
console.log(`Additional Taipei links patched: ${patched}; Facebook total: ${all.filter(c => c.facebook).length}/${all.length}`);
fs.writeFileSync(file, JSON.stringify(topo), 'utf8');
