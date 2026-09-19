import { readFile, writeFile, readdir, unlink } from 'node:fs/promises';
// 以 Facebook 原圖網址（後台「一鍵快取現有照片」會搬到本站）取代 80px 低畫質 /photos/fb/*.jpg。
// 沒有原圖網址者清空 photoUrl（留白）。
const FILE = new URL('../data/counties.json', import.meta.url);
const rows = (await readFile(process.argv[2], 'utf8')).trim().split('\n').map(l => l.split('\t'));
const SKIP = new Set(['吳中源', '劉安祺']); // 頭像來源存疑，不自動填入
const clean = s => String(s || '').normalize('NFKC').replace(/[・．·‧\s　]/g, '');
const map = new Map(rows.filter(r => !SKIP.has(r[2])).map(r => [r[1] + '|' + clean(r[2]), r[5]]));
const topo = JSON.parse(await readFile(FILE, 'utf8'));
let replaced = 0, cleared = 0;
for (const g of topo.objects.map.geometries) {
  const p = g.properties, id = String(p.id);
  const blocks = Array.isArray(p.councilors?.blocks) ? p.councilors.blocks : (Array.isArray(p.councilors) ? p.councilors : []);
  const all = [...(p.candidates || []), ...blocks.flatMap(b => b.candidates || [])];
  for (const c of all) {
    if (!String(c.photoUrl || '').startsWith('/photos/fb/')) continue;
    const u = map.get(id + '|' + clean(c.name));
    if (u) { c.photoUrl = u; replaced++; } else { c.photoUrl = ''; cleared++; }
  }
}
await writeFile(FILE, `${JSON.stringify(topo)}\n`, 'utf8');
const dir = new URL('../photos/fb/', import.meta.url);
for (const f of await readdir(dir)) await unlink(new URL(f, dir));
console.log({ replaced, cleared });
