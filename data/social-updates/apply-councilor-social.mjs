import { readFile, writeFile } from 'node:fs/promises';
// 用法：node scripts/apply-councilor-social.mjs data/social-updates/<檔名>.json
// 資料檔格式：{ "countyId": "63000", "entries": [{ "name", "fb", "ig", "th", "yt", "photo" }] }
// 每個 Facebook 頁面都在瀏覽器實際開啟，比對頁面名稱與「議員（參選人）」等自述後才收錄。
// photo 為 Facebook 大頭照原圖網址（有效期限有限，請於後台「一鍵快取現有照片」搬到本站）。
// 只填空白、不覆蓋；同縣市同名者不處理。
const src = process.argv[2];
if (!src) { console.error('請指定資料檔'); process.exit(1); }
const FILE = new URL('../data/counties.json', import.meta.url);
const job = JSON.parse(await readFile(new URL(`../${src}`, import.meta.url), 'utf8'));
const clean = s => String(s || '').normalize('NFKC').replace(/[・．·‧\s　]/g, '');
const topo = JSON.parse(await readFile(FILE, 'utf8'));
const g = topo.objects.map.geometries.find(x => String(x.properties.id) === String(job.countyId));
if (!g) { console.error('找不到縣市 ' + job.countyId); process.exit(1); }
const p = g.properties;
const blocks = Array.isArray(p.councilors?.blocks) ? p.councilors.blocks : p.councilors;
const all = blocks.flatMap(b => b.candidates || []);
const rep = { fb: 0, ig: 0, th: 0, yt: 0, photo: 0, skipped: [] };
for (const d of job.entries) {
  const hits = all.filter(c => clean(c.name) === clean(d.name));
  if (hits.length !== 1) { rep.skipped.push(d.name); continue; }
  const c = hits[0];
  for (const [k, f] of [['facebook', 'fb'], ['instagram', 'ig'], ['threads', 'th'], ['youtube', 'yt']]) {
    if (d[f] && !String(c[k] || '').trim()) { c[k] = d[f]; rep[f]++; }
  }
  if (d.photo && !String(c.photoUrl || '').trim()) { c.photoUrl = d.photo; rep.photo++; }
}
await writeFile(FILE, `${JSON.stringify(topo)}\n`, 'utf8');
console.log(JSON.stringify(rep, null, 2));
