import { readFile, writeFile } from 'node:fs/promises';
const FILE = new URL('../data/counties.json', import.meta.url);
const COUNTY_ID = '68000';
const facebookByName = {
  '徐玉樹': 'https://www.facebook.com/Steadyforward7/',
  '劉安祺': 'https://www.facebook.com/pages/%E5%8A%89%E5%AE%89%E7%A5%BA%E7%B2%89%E7%B5%B2%E5%9C%98/265994436929647',
};
const topo = JSON.parse(await readFile(FILE,'utf8'));
const county = topo.objects.map.geometries.find(g => String(g.properties.id) === COUNTY_ID);
if (!county) throw new Error('找不到桃園市');
const blocks = Array.isArray(county.properties.councilors?.blocks) ? county.properties.councilors.blocks : county.properties.councilors;
let filled = 0;
const found = new Set();
for (const b of blocks || []) for (const c of b.candidates || []) {
  const url = facebookByName[c.name]; if (!url) continue; found.add(c.name);
  if (!c.facebook) { c.facebook = url; filled++; }
}
const missing = Object.keys(facebookByName).filter(n => !found.has(n));
if (missing.length) throw new Error(`姓名未匹配：${missing.join('、')}`);
await writeFile(FILE, JSON.stringify(topo)+'\n','utf8');
console.log({filled, names:[...found]});
