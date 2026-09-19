import { readFile, writeFile } from 'node:fs/promises';
// 全縣市：以 repo 內的議會官方名冊（data/*_councilors.json）補「空白的」Facebook 與照片。
// 只填空白、不覆蓋；姓名須在該縣市內唯一；Facebook 須為 facebook.com 網址；照片須為 https 的 *.gov.tw。
const FILE = new URL('../data/counties.json', import.meta.url);
const read = async n => JSON.parse(await readFile(new URL(`../data/${n}`, import.meta.url), 'utf8'));
const clean = s => String(s || '').normalize('NFKC').replace(/[・．·‧\s　]/g, '').replace(/議員/g, '');
const src = []; // {code,name,fb,photo,from}
const add = (code, rows, from, k = {}) => {
  for (const r of rows || []) {
    if ((r.status && r.status !== 'active') || r.matchedOfficialRoster === false) continue;
    const name = clean(r.name); if (!name) continue;
    const fb = String(r[k.fb || 'facebook'] || '').trim().replace(/^http:\/\//i, 'https://');
    const photo = String(r[k.photo || 'photoUrl'] || '').trim().replace(/\\/g, '/');
    src.push({ code, name, fb: /^https:\/\/(www\.|m\.)?facebook\.com\//i.test(fb) ? fb : '', photo: /^https:\/\/[\w.-]+\.gov\.tw\//i.test(photo) ? photo : '', from });
  }
};
add('63000', (await read('tcc_councilors.json')).councilors, 'tcc');
add('64000', await read('kcc_councilors.json'), 'kcc');
add('65000', (await read('ntp_councilors.json')).councilors, 'ntp', { fb: 'officialFacebook', photo: 'officialPhoto' });
add('68000', await read('tycc_councilors.json'), 'tycc');
add('10018', (await read('hcc_councilors.json')).councilors, 'hcc');
add('10007', (await read('chcc_councilors.json')).councilors, 'chcc');
add('10005', (await read('mcc_councilors.json')).councilors, 'mcc');
add('66000', (await read('tccc_councilors.json')).councilors, 'tccc');
const pt = await read('ptcc_ilcc_hlcc_councilors.json');
add('10013', pt.pingtung?.councilors, 'ptcc'); add('10002', pt.yilan?.councilors, 'ilcc'); add('10015', pt.hualien?.councilors, 'hlcc');
const yl = await read('ylcc_cycc_councilors.json');
add('10009', yl.yunlin?.councilors, 'ylcc'); add('10020', yl.chiayiCity?.councilors, 'cycc');
add('67000', (await read('tncc_mayors.json')).tainan?.councilors, 'tncc');
const by = new Map();
for (const s of src) { const k = s.code + '|' + s.name; (by.get(k) || by.set(k, []).get(k)).push(s); }
const topo = JSON.parse(await readFile(FILE, 'utf8'));
const rep = { fb: {}, photo: {}, skipped: [] };
for (const g of topo.objects.map.geometries) {
  const p = g.properties, code = String(p.id);
  const blocks = Array.isArray(p.councilors?.blocks) ? p.councilors.blocks : (Array.isArray(p.councilors) ? p.councilors : []);
  const all = blocks.flatMap(b => b.candidates || []);
  const cnt = new Map(); for (const c of all) cnt.set(clean(c.name), (cnt.get(clean(c.name)) || 0) + 1);
  for (const c of all) {
    const n = clean(c.name), m = by.get(code + '|' + n); if (!m) continue;
    if (cnt.get(n) > 1) { rep.skipped.push(p.name + ' ' + c.name + ' 同名'); continue; }
    const fbs = [...new Set(m.map(x => x.fb).filter(Boolean))], ph = [...new Set(m.map(x => x.photo).filter(Boolean))];
    if (fbs.length === 1 && !String(c.facebook || '').trim()) { c.facebook = fbs[0]; rep.fb[p.name] = (rep.fb[p.name] || 0) + 1; }
    if (ph.length === 1 && !String(c.photoUrl || '').trim()) { c.photoUrl = ph[0]; rep.photo[p.name] = (rep.photo[p.name] || 0) + 1; }
  }
}
await writeFile(FILE, `${JSON.stringify(topo)}\n`, 'utf8');
console.log(JSON.stringify(rep, null, 1));
