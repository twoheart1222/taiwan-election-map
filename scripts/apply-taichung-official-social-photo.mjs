import { readFile, writeFile } from 'node:fs/promises';

const COUNTY_ID = '66000';
const TOPO_FILE = new URL('../data/counties.json', import.meta.url);
const OFFICIAL_FILE = new URL('../data/tccc_councilors.json', import.meta.url);

const topo = JSON.parse(await readFile(TOPO_FILE, 'utf8'));
const official = JSON.parse(await readFile(OFFICIAL_FILE, 'utf8'));
const geometries = topo?.objects?.map?.geometries || [];
const county = geometries.find(g => String(g?.properties?.id) === COUNTY_ID);
if (!county) throw new Error(`找不到臺中市 ${COUNTY_ID}`);

const blocks = Array.isArray(county.properties?.councilors?.blocks)
  ? county.properties.councilors.blocks
  : (Array.isArray(county.properties?.councilors) ? county.properties.councilors : []);

const cleanName = v => String(v || '').replace(/[\s\u3000]/g, '').trim();
const byName = new Map();
for (const row of official?.councilors || []) {
  const name = cleanName(row?.name);
  if (!name) continue;
  if (byName.has(name)) throw new Error(`官方資料有重複姓名：${row.name}`);
  byName.set(name, row);
}

const rosterByName = new Map();
for (const block of blocks) {
  for (const c of block?.candidates || []) {
    const name = cleanName(c?.name);
    if (!name) continue;
    if (rosterByName.has(name)) throw new Error(`網站候選名冊有重複姓名，無法安全只用姓名比對：${c.name}`);
    rosterByName.set(name, c);
  }
}

let matchedOfficialNames = 0;
let facebookFilled = 0;
let photoFilled = 0;
let facebookAlreadyPresent = 0;
let photoAlreadyPresent = 0;
const officialNotInRoster = [];
const matchedNames = [];

for (const [name, row] of byName) {
  const c = rosterByName.get(name);
  if (!c) {
    officialNotInRoster.push(row.name);
    continue;
  }
  matchedOfficialNames += 1;
  matchedNames.push(c.name);

  const fb = String(row.facebook || '').trim();
  if (fb) {
    if (!String(c.facebook || '').trim()) {
      c.facebook = fb.replace(/^http:\/\//i, 'https://');
      facebookFilled += 1;
    } else {
      facebookAlreadyPresent += 1;
    }
  }

  const photo = String(row.photoUrl || '').trim();
  if (photo) {
    if (!String(c.photoUrl || '').trim()) {
      c.photoUrl = photo.replace(/\\/g, '/');
      photoFilled += 1;
    } else {
      photoAlreadyPresent += 1;
    }
  }
}

await writeFile(TOPO_FILE, `${JSON.stringify(topo)}\n`, 'utf8');
console.log(JSON.stringify({
  totalCandidates: rosterByName.size,
  officialRows: byName.size,
  matchedOfficialNames,
  facebookFilled,
  photoFilled,
  facebookAlreadyPresent,
  photoAlreadyPresent,
  officialNotInRoster,
  matchedNames,
}, null, 2));
