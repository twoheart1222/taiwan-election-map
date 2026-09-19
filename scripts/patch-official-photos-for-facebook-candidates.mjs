import { readFile, writeFile } from 'node:fs/promises';

// 全縣市：候選人「已有 Facebook、但還沒有照片」時，用 repo 內既有的議會官方名冊資料補照片。
// 只填空白、不覆蓋；姓名須在同縣市內唯一比對；照片網址須為 https 的 *.gov.tw。
const FILE = new URL('../data/counties.json', import.meta.url);
const read = async name => JSON.parse(await readFile(new URL(`../data/${name}`, import.meta.url), 'utf8'));

const clean = s => String(s || '').normalize('NFKC').replace(/[・．·‧\s　]/g, '');
const stripTitle = s => String(s || '').replace(/議員/g, '');

const sources = []; // { code, name, photo, from }
const add = (code, rows, from, { photoKey = 'photoUrl', ok = () => true } = {}) => {
  for (const row of rows || []) {
    if (!ok(row)) continue;
    const name = clean(stripTitle(row.name));
    const photo = String(row[photoKey] || '').trim().replace(/\\/g, '/');
    if (name && photo) sources.push({ code, name, photo, from });
  }
};

add('63000', (await read('tcc_councilors.json')).councilors, 'tcc');
add('64000', await read('kcc_councilors.json'), 'kcc', { ok: r => !r.status || r.status === 'active' });
add('65000', (await read('ntp_councilors.json')).councilors, 'ntp', { photoKey: 'officialPhoto', ok: r => r.matchedOfficialRoster === true });
add('68000', await read('tycc_councilors.json'), 'tycc');
add('10018', (await read('hcc_councilors.json')).councilors, 'hcc');
add('10007', (await read('chcc_councilors.json')).councilors, 'chcc');
add('10005', (await read('mcc_councilors.json')).councilors, 'mcc');
add('66000', (await read('tccc_councilors.json')).councilors, 'tccc');
const pt = await read('ptcc_ilcc_hlcc_councilors.json');
add('10013', pt.pingtung?.councilors, 'ptcc');
add('10002', pt.yilan?.councilors, 'ilcc');
add('10015', pt.hualien?.councilors, 'hlcc');
const yl = await read('ylcc_cycc_councilors.json');
add('10009', yl.yunlin?.councilors, 'ylcc');
add('10020', yl.chiayiCity?.councilors, 'cycc');
add('67000', (await read('tncc_mayors.json')).tainan?.councilors, 'tncc');

const byKey = new Map();
for (const s of sources) {
  const k = `${s.code}|${s.name}`;
  if (!byKey.has(k)) byKey.set(k, []);
  byKey.get(k).push(s);
}

const topo = JSON.parse(await readFile(FILE, 'utf8'));
const geometries = topo?.objects?.map?.geometries || [];
const filled = [];
const skipped = [];

for (const g of geometries) {
  const p = g.properties;
  const code = String(p.id);
  const blocks = Array.isArray(p.councilors?.blocks) ? p.councilors.blocks : (Array.isArray(p.councilors) ? p.councilors : []);
  const rosterCount = new Map();
  for (const b of blocks) for (const c of b.candidates || []) {
    const n = clean(c.name);
    rosterCount.set(n, (rosterCount.get(n) || 0) + 1);
  }
  for (const b of blocks) for (const c of b.candidates || []) {
    if (!String(c.facebook || '').trim() || String(c.photoUrl || '').trim()) continue;
    const n = clean(c.name);
    const matches = byKey.get(`${code}|${n}`) || [];
    if (!matches.length) continue;
    const photos = [...new Set(matches.map(m => m.photo))];
    if (rosterCount.get(n) > 1 || photos.length !== 1) { skipped.push({ county: p.name, name: c.name, reason: '同名或多筆來源' }); continue; }
    const photo = photos[0];
    if (!/^https:\/\/[\w.-]+\.gov\.tw\//i.test(photo)) { skipped.push({ county: p.name, name: c.name, reason: '非政府網域' }); continue; }
    c.photoUrl = photo;
    filled.push({ county: p.name, name: c.name, from: matches[0].from });
  }
}

await writeFile(FILE, `${JSON.stringify(topo)}\n`, 'utf8');
const by = filled.reduce((m, r) => ((m[r.county] = (m[r.county] || 0) + 1), m), {});
console.log(JSON.stringify({ photosFilled: filled.length, byCounty: by, skipped }, null, 2));
