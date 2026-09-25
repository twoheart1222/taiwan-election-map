import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const repo = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const [rosterArg, overridesArg, outputDirArg, ...flags] = process.argv.slice(2);
if (!rosterArg || !overridesArg || !outputDirArg) {
  throw new Error('Usage: node scripts/reconcile-official-registration-roster.mjs <roster.json> <overrides.json> <output-dir> [--apply-base]');
}

const roster = JSON.parse(fs.readFileSync(path.resolve(rosterArg), 'utf8')).records;
const overrides = JSON.parse(fs.readFileSync(path.resolve(overridesArg), 'utf8'));
const outputDir = path.resolve(outputDirArg);
const applyBase = flags.includes('--apply-base');
const normalize = value => String(value || '').normalize('NFKC').replaceAll('台', '臺').toLowerCase().replace(/[^\p{L}\p{N}]/gu, '');
const aliases = value => {
  const han = String(value || '').normalize('NFKC').match(/\p{Script=Han}+/gu) || [];
  return new Set([normalize(value), normalize(han.sort((a, b) => b.length - a.length)[0])].filter(Boolean));
};
const intersects = (left, right) => [...left].some(value => right.has(value));
const distance = (left, right) => {
  const a = [...normalize(left)], b = [...normalize(right)];
  const row = Array.from({ length: b.length + 1 }, (_, index) => index);
  for (let i = 1; i <= a.length; i++) {
    let previous = row[0]; row[0] = i;
    for (let j = 1; j <= b.length; j++) {
      const saved = row[j];
      row[j] = Math.min(row[j] + 1, row[j - 1] + 1, previous + (a[i - 1] === b[j - 1] ? 0 : 1));
      previous = saved;
    }
  }
  return row[b.length];
};

const files = [path.join(repo, 'data/counties.json')];
for (const directory of ['towns', 'villages']) {
  for (const file of fs.readdirSync(path.join(repo, 'data', directory))) {
    if (file.endsWith('.json')) files.push(path.join(repo, 'data', directory, file));
  }
}
const fileDocuments = new Map();
const baseAreas = new Map();
for (const file of files) {
  const raw = fs.readFileSync(file, 'utf8');
  const document = JSON.parse(raw);
  fileDocuments.set(file, { document, pretty: raw.includes('\n  "') });
  for (const geometry of document.objects.map.geometries) baseAreas.set(String(geometry.properties.id), { properties: geometry.properties, file });
}
const countyNames = new Map([...baseAreas].filter(([code]) => code.length === 5).map(([code, area]) => [code, area.properties.name]));
const townNames = new Map([...baseAreas].filter(([code]) => code.length === 8).map(([code, area]) => [code, area.properties.name]));
const categoryFor = (code, field) => code.length === 5 ? (field === 'councilors' ? 'councilor' : 'mayor') : code.length === 8 ? (field === 'representatives' ? 'representative' : 'townMayor') : 'village';
const areaKeyFor = (code, category, district) => {
  const county = countyNames.get(code.slice(0, 5)) || '';
  const town = code.length >= 8 ? townNames.get(code.slice(0, 8)) || '' : '';
  const area = baseAreas.get(code)?.properties?.name || '';
  if (category === 'mayor') return normalize(county);
  if (category === 'councilor') return normalize(`${county}第${district}選舉區`);
  if (category === 'townMayor') return normalize(`${county}${area}`);
  if (category === 'representative') return normalize(`${county}${town || area}第${district}選舉區`);
  return normalize(`${county}${town}${area}`);
};
const candidatesOf = (document, code) => {
  const rows = [];
  for (const candidate of document.candidates || []) rows.push({ candidate, list: document.candidates, category: categoryFor(code, 'candidates'), district: null });
  for (const field of ['councilors', 'representatives']) for (const block of document[field] || []) {
    for (const candidate of block.candidates || []) rows.push({ candidate, list: block.candidates, category: categoryFor(code, field), district: String(block.district) });
  }
  return rows;
};
const officialByCounty = new Map();
const officialByArea = new Map();
for (const record of roster) {
  const county = [...countyNames.values()].find(name => record.areaKey.startsWith(normalize(name))) || '';
  const countyKey = `${record.category}|${normalize(county)}`;
  const areaKey = `${record.category}|${record.areaKey}`;
  if (!officialByCounty.has(countyKey)) officialByCounty.set(countyKey, []);
  if (!officialByArea.has(areaKey)) officialByArea.set(areaKey, []);
  officialByCounty.get(countyKey).push(record);
  officialByArea.get(areaKey).push(record);
}

const corrections = [], removals = [], changedBaseFiles = new Set(), changedOverrideCodes = new Set();
function reconcileDocument(document, code, target) {
  const county = countyNames.get(code.slice(0, 5)) || '';
  for (const row of candidatesOf(document, code)) {
    const name = row.candidate?.name || '';
    const countyRoster = officialByCounty.get(`${row.category}|${normalize(county)}`) || [];
    if (name && countyRoster.some(record => intersects(aliases(name), new Set(record.nameAliases)))) continue;
    const exactArea = officialByArea.get(`${row.category}|${areaKeyFor(code, row.category, row.district)}`) || [];
    const near = name ? exactArea.filter(record => distance(name, record.name) === 1) : [];
    if (near.length === 1) {
      const before = row.candidate.name;
      row.candidate.name = near[0].name;
      if (near[0].registeredDate) row.candidate.registeredDate = near[0].registeredDate;
      if (near[0].party) row.candidate.party = near[0].party;
      corrections.push({ target, areaCode: code, category: row.category, before, after: row.candidate.name });
    } else {
      row.list.splice(row.list.indexOf(row.candidate), 1);
      removals.push({ target, areaCode: code, county, category: row.category, name, reason: name ? '未出現在同職務、同縣市登記名冊' : '空白姓名候選人' });
    }
  }
}

for (const [code, area] of baseAreas) {
  const before = JSON.stringify(area.properties);
  reconcileDocument(area.properties, code, 'base');
  if (JSON.stringify(area.properties) !== before) changedBaseFiles.add(area.file);
}
for (const [code, document] of Object.entries(overrides)) {
  const before = JSON.stringify(document);
  reconcileDocument(document, code, 'override');
  if (JSON.stringify(document) !== before) changedOverrideCodes.add(code);
}
if (applyBase) for (const file of changedBaseFiles) {
  const { document, pretty } = fileDocuments.get(file);
  fs.writeFileSync(file, `${JSON.stringify(document, null, pretty ? 2 : 0)}\n`);
}
fs.mkdirSync(outputDir, { recursive: true });
fs.writeFileSync(path.join(outputDir, 'corrected-overrides.json'), `${JSON.stringify(overrides, null, 2)}\n`);
const report = {
  sourceRows: roster.length,
  changedBaseFiles: [...changedBaseFiles].map(file => path.relative(repo, file)).sort(),
  changedOverrideCodes: [...changedOverrideCodes].sort(),
  corrections,
  removals,
  note: '上屆票數只表示曾參選，不作為現任判斷依據；登記彙總表備註欄未提供現任身分。',
};
fs.writeFileSync(path.join(outputDir, 'registration-reconciliation-report.json'), `${JSON.stringify(report, null, 2)}\n`);
console.log(JSON.stringify({
  sourceRows: report.sourceRows,
  changedBaseFiles: report.changedBaseFiles.length,
  changedOverrideCodes: report.changedOverrideCodes.length,
  corrections: corrections.length,
  removals: removals.length,
}, null, 2));
