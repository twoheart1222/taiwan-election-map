import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const inputDir = process.argv[2];
if (!inputDir) throw new Error('Usage: node scripts/build-taichung-ballots.mjs <directory containing the five Taichung draw Markdown files>');

const files = {
  mayors: '臺中市第5屆市長選舉候選人姓名號次抽籤結果.md',
  councilors: '臺中市議會第5屆議員選舉候選人姓名號次抽籤結果.md',
  townHeads: '臺中市和平區第4屆區長候選人姓名號次抽籤結果.md',
  representatives: '臺中市和平區第4屆區民代表選舉候選人姓名號次抽籤結果.md',
  villageHeads: '臺中市第5屆里長選舉候選人姓名號次抽籤結果-全.md',
};
const expected = { mayors: 3, councilors: 101, townHeads: 5, representatives: 20, villageHeads: 1112 };
const rows = Object.fromEntries(Object.entries(files).map(([kind, filename]) => {
  const lines = fs.readFileSync(path.join(inputDir, filename), 'utf8').split(/\r?\n/);
  const parsed = lines.filter(line => /^\|\s*臺中市/.test(line)).map(line => {
    const [area, no, name, sex, party] = line.split('|').slice(1, 6).map(value => value.trim());
    return { area, no: Number(no), name, sex, party: party.replace(/\s+/g, '') };
  }).filter(row => Number.isInteger(row.no) && row.no > 0 && row.name);
  if (parsed.length !== expected[kind]) throw new Error(`${kind}: expected ${expected[kind]} rows, got ${parsed.length}`);
  return [kind, parsed];
}));

const normalize = value => String(value || '').normalize('NFKC').replace(/[·‧．・]/g, '.').replace(/爲/g, '為').replace(/啓/g, '啟').replace(/\s+/g, '').toLowerCase();
const villageAreaAliases = { '臺中市大安區龜里': '臺中市大安區龜壳里' };
// The PDF visually shows these characters; Markdown extraction drops their font mappings.
const villageNameAliases = { '廖歆': '廖𫎇歆', '王樑': '王鎮樑', '蔡豐': '蔡豐淙', '曾銪': '曾銪寫' };
const towns = JSON.parse(fs.readFileSync(path.join(root, 'data/towns/towns-66000.json'))).objects.map.geometries.map(geometry => geometry.properties);
const villages = new Map(towns.flatMap(town => {
  const file = path.join(root, `data/villages/villages-${town.id}.json`);
  return JSON.parse(fs.readFileSync(file)).objects.map.geometries.map(geometry => [normalize('臺中市' + town.name + geometry.properties.name), {
    id: geometry.properties.id, town: town.name, village: geometry.properties.name, candidates: geometry.properties.candidates || [],
  }]);
}));
const county = JSON.parse(fs.readFileSync(path.join(root, 'data/counties.json'))).objects.map.geometries.find(geometry => geometry.properties.id === '66000').properties;
const peace = towns.find(town => town.name === '和平區');
const newVillageCandidates = new Set(['曾銪寫', '楊文慶', '林耀南']);

function pack(group, context, candidates, permitNew = false) {
  const numbers = {};
  const parties = {};
  for (const row of group) {
    const name = permitNew ? villageNameAliases[row.name] || row.name : row.name;
    if (Object.hasOwn(numbers, name)) throw new Error(`${context}: duplicate ${name}`);
    const matches = (candidates || []).filter(candidate => normalize(candidate.name) === normalize(name));
    if (matches.length !== 1 && !(permitNew && newVillageCandidates.has(name) && matches.length === 0)) {
      throw new Error(`${context}: ${name} matches ${matches.length} existing candidates`);
    }
    if (matches.length === 1) {
      const present = matches[0].party === '無黨籍' ? '無' : String(matches[0].party || '').replace(/\s+/g, '');
      if (normalize(present) !== normalize(row.party)) throw new Error(`${context}: ${name} party ${present} differs from ${row.party}`);
    }
    numbers[name] = row.no;
    parties[name] = row.party;
  }
  const values = Object.values(numbers).sort((a, b) => a - b);
  if (values.some((number, index) => number !== index + 1)) throw new Error(`${context}: ballot numbers are not 1…${values.length}`);
  return { numbers, parties };
}
function byDistrict(group) {
  return Object.groupBy(group, row => row.area.match(/第(\d+)選舉區/)?.[1] || '');
}
const mayor = pack(rows.mayors, '臺中市長', county.candidates);
const councilors = {};
const councilorParties = {};
for (const [district, group] of Object.entries(byDistrict(rows.councilors))) {
  const packed = pack(group, `議員第 ${district} 區`, county.councilors.find(block => block.district === district)?.candidates);
  councilors[district] = packed.numbers;
  councilorParties[district] = packed.parties;
}
const town = pack(rows.townHeads, '和平區長', peace.candidates);
const representatives = {};
const representativeParties = {};
for (const [district, group] of Object.entries(byDistrict(rows.representatives))) {
  const packed = pack(group, `和平區代表第 ${district} 區`, peace.representatives.find(block => block.district === district)?.candidates);
  representatives[district] = packed.numbers;
  representativeParties[district] = packed.parties;
}
const groupedVillages = new Map();
for (const row of rows.villageHeads) {
  const area = villageAreaAliases[row.area] || row.area;
  const village = villages.get(normalize(area));
  if (!village) throw new Error(`Village not found: ${row.area}`);
  const group = groupedVillages.get(village.id) || { village, rows: [] };
  group.rows.push(row);
  groupedVillages.set(village.id, group);
}
const villageBallots = {};
const villageParties = {};
for (const [id, { village, rows: group }] of [...groupedVillages].sort(([a], [b]) => a.localeCompare(b))) {
  const packed = pack(group, `${village.town}${village.village}`, village.candidates, true);
  villageBallots[id] = packed.numbers;
  villageParties[id] = packed.parties;
}

const js = value => JSON.stringify(value);
const frozen = value => `Object.freeze(${js(value)})`;
const nested = value => `Object.freeze({${Object.entries(value).map(([key, entries]) => `${js(key)}:${frozen(entries)}`).join(',')}})`;
const lines = [
  '// 臺中市選舉委員會 115 年 10 月 27 日候選人姓名號次抽籤結果。',
  '// Derived from the five Markdown files with scripts/build-taichung-ballots.mjs; manual backend fields retain priority.',
  'globalThis.FOTaichungBallotNumbers = Object.freeze({',
  `  election: ${js('市長、市議員、和平區區長與區民代表、里長')},`,
  `  source: ${js('臺中市選舉委員會候選人姓名號次抽籤結果')},`,
  `  date: ${js('2026-10-27')},`,
  `  numbers: ${frozen(mayor.numbers)},`,
  `  parties: ${frozen(mayor.parties)},`,
  `  councilors: ${nested(councilors)},`,
  `  councilorParties: ${nested(councilorParties)},`,
  `  townHeads: Object.freeze({${js(peace.id)}:${frozen(town.numbers)}}),`,
  `  townHeadParties: Object.freeze({${js(peace.id)}:${frozen(town.parties)}}),`,
  `  representatives: Object.freeze({${js(peace.id)}:${nested(representatives)}}),`,
  `  representativeParties: Object.freeze({${js(peace.id)}:${nested(representativeParties)}}),`,
  '});',
  'globalThis.FOTaichungVillageBallots = Object.freeze({',
  ...Object.entries(villageBallots).map(([id, numbers]) => `  ${js(id)}: ${frozen(numbers)}, // ${groupedVillages.get(id).village.town}${groupedVillages.get(id).village.village}`),
  '});',
  'globalThis.FOTaichungVillageParties = Object.freeze({',
  ...Object.entries(villageParties).map(([id, parties]) => `  ${js(id)}: ${frozen(parties)},`),
  '});',
];
const output = path.join(root, 'data/ballot-numbers-taichung-2026.js');
fs.writeFileSync(output, lines.join('\n') + '\n');
console.log(`Built ${path.relative(root, output)}: 3 mayors, 101 councilors, 5 town heads, 20 representatives, ${Object.keys(villageBallots).length} villages / 1112 village candidates.`);
