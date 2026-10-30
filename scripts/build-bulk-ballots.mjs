import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const sourceRoot = process.argv[2];
if (!sourceRoot) throw new Error('Usage: node scripts/build-bulk-ballots.mjs <draw-result directory>');
const regions = [
  ['彰化', '10007'], ['115年地方公職人員選舉候選人姓名號次抽籤結果_雲林', '10009'],
  ['嘉義/嘉義縣', '10010'], ['嘉義/嘉義市', '10020'], ['台南', '67000'],
  ['屏東', '10013'], ['宜蘭', '10002'], ['花蓮', '10015'], ['台東', '10014'], ['澎湖', '10016'],
];
const normalize = value => String(value ?? '').normalize('NFKC').replace(/台/g, '臺').replace(/啓/g, '啟').replace(/爲/g, '為').replace(/[·‧．・]/g, '.').replace(/\s+/g, '').toLowerCase();
// Font-mapping losses and historical spellings are matched to the existing candidate record.
const nameAliases = new Map(Object.entries({
  '蘇世': '蘇世', '賴賢': '賴聰賢', '洪建興': '洪健興', '周如': '周如',
  '張鳳修': '張鳯修', '吳順凉': '吳順涼', '簡榮': '簡榮',
  '葉': '葉', '𡍼寶貴': '塗寶貴', '羅名材Halu•Lihang': '羅名材Halu‧Lihang',
  '張大志Lu’uh Ikung': "張大志Lu'Ikung", '陳聰': '陳聰', '潘宮': '潘宮諭',
  '古勒勒•伐 基尚': '古勒勒‧伐基尚', '巫化•巴阿 立佑司': '巫化‧巴阿立佑司',
  '吳占勝 Suiling.Asi ku': '吳占勝Suilng.Asiku',
}).map(([a, b]) => [normalize(a), b]));
const counties = JSON.parse(fs.readFileSync(path.join(root, 'data/counties.json'))).objects.map.geometries.map(g => g.properties);
const districtOf = area => area.match(/第\s*(\d+)\s*選舉\s*區/)?.[1] || (normalize(area).includes('蘭嶼鄉選舉區') ? '?' : '');
const walk = dir => fs.readdirSync(dir, { withFileTypes: true }).flatMap(entry => entry.isDirectory() ? walk(path.join(dir, entry.name)) : entry.name.endsWith('.md') ? [path.join(dir, entry.name)] : []);
const sourceKind = filename => {
  if (/村里長|[村里]長.*選舉/.test(filename)) return 'village';
  if (/鄉鎮市民代表/.test(filename)) return 'representative';
  if (/鄉鎮市長/.test(filename)) return 'townHead';
  if (/議員/.test(filename)) return 'councilor';
  if (/縣市長|縣長|直轄市長|第\d+屆市長/.test(filename)) return 'mayor';
  throw new Error(`Unknown source kind: ${filename}`);
};
const readRows = (filename, county, defaultKind) => {
  let header;
  const result = [];
  for (const line of fs.readFileSync(filename, 'utf8').split(/\r?\n/)) {
    if (!line.startsWith('|')) continue;
    const cells = line.split('|').slice(1, -1).map(s => s.trim());
    if (cells.includes('姓名') && cells.includes('抽籤號次')) { header = cells; continue; }
    if (!header) continue;
    const get = label => cells[header.indexOf(label)] || '';
    const no = Number(get('抽籤號次'));
    const name = get('姓名');
    if (!Number.isInteger(no) || no <= 0 || !name) continue;
    let area = get('選舉區') || county.name;
    const kind = defaultKind === 'councilor' && normalize(area) === normalize(county.name) ? 'mayor'
      : defaultKind === 'mayor' && /第\s*\d+\s*選舉\s*區/.test(area) ? 'councilor' : defaultKind;
    result.push({ kind, area, name, no, party: get('推薦之政黨'), file: path.relative(sourceRoot, filename).replaceAll('\\', '/') });
  }
  return result;
};

const report = { files: [], rows: 0, matched: 0, missingCandidates: [], missingAreas: [], partyMismatches: [], unmatchedExisting: [], duplicateNumbers: [], nameAliases: [] };
const output = {};
for (const [regionDir, countyId] of regions) {
  const county = counties.find(c => c.id === countyId);
  const towns = JSON.parse(fs.readFileSync(path.join(root, `data/towns/towns-${countyId}.json`))).objects.map.geometries.map(g => g.properties);
  const allVillages = towns.flatMap(town => JSON.parse(fs.readFileSync(path.join(root, `data/villages/villages-${town.id}.json`))).objects.map.geometries.map(g => ({ ...g.properties, town })));
  const villageMap = new Map(allVillages.map(v => [normalize(county.name + v.town.name + v.name), v]));
  const townMap = new Map(towns.map(t => [normalize(county.name + t.name), t]));
  const files = walk(path.join(sourceRoot, regionDir));
  const rows = files.flatMap(file => {
    const parsed = readRows(file, county, sourceKind(path.basename(file)));
    report.files.push({ file: path.relative(sourceRoot, file).replaceAll('\\', '/'), count: parsed.length });
    return parsed;
  });
  if (!rows.length) throw new Error(`No rows for ${county.name}`);
  report.rows += rows.length;
  const ballot = { election: '115 年地方公職人員選舉', source: `${county.name}選舉委員會候選人姓名號次抽籤結果`, date: '2026-10-27', numbers: {}, parties: {}, councilors: {}, councilorParties: {}, townHeads: {}, townHeadParties: {}, representatives: {}, representativeParties: {} };
  const villageBallots = {};
  const villageParties = {};
  const seenCandidate = new Map();
  const listedByArea = new Map();
  for (const row of rows) {
    const area = normalize(row.area);
    const district = districtOf(row.area);
    let candidates, numbers, parties, scope;
    if (row.kind === 'mayor') {
      scope = countyId; candidates = county.candidates; numbers = ballot.numbers; parties = ballot.parties;
    } else if (row.kind === 'councilor') {
      scope = `${countyId}:councilor:${district}`;
      candidates = county.councilors.find(c => String(c.district) === district)?.candidates;
      numbers = ballot.councilors[district] ||= {}; parties = ballot.councilorParties[district] ||= {};
    } else if (row.kind === 'townHead') {
      const town = townMap.get(area); scope = `${countyId}:town:${town?.id || row.area}`;
      candidates = town?.candidates; numbers = ballot.townHeads[town?.id] ||= {}; parties = ballot.townHeadParties[town?.id] ||= {};
    } else if (row.kind === 'representative') {
      const townName = normalize(row.area.replace(/第\s*\d+\s*選舉\s*區.*/, '').replace(/選\s*舉\s*區.*/, ''));
      const town = townMap.get(townName); scope = `${countyId}:representative:${town?.id || row.area}:${district}`;
      candidates = town?.representatives.find(c => String(c.district) === district)?.candidates;
      numbers = (ballot.representatives[town?.id] ||= {})[district] ||= {};
      parties = (ballot.representativeParties[town?.id] ||= {})[district] ||= {};
    } else {
      const byName = area === normalize(county.name) ? allVillages.filter(v => (v.candidates || []).some(c => normalize(c.name) === normalize(row.name))) : [];
      const village = villageMap.get(area) || (byName.length === 1 ? byName[0] : undefined); scope = `${countyId}:village:${village?.id || row.area}`;
      candidates = village?.candidates; numbers = villageBallots[village?.id] ||= {}; parties = villageParties[village?.id] ||= {};
    }
    if (!candidates) { report.missingAreas.push(row); continue; }
    const canonicalName = nameAliases.get(normalize(row.name)) || row.name;
    if (canonicalName !== row.name) report.nameAliases.push({ ...row, canonicalName });
    const key = `${scope}:${normalize(canonicalName)}`;
    if (seenCandidate.has(key) && seenCandidate.get(key) !== row.no) throw new Error(`Conflicting numbers: ${key}`);
    seenCandidate.set(key, row.no);
    const prior = Object.entries(numbers).find(([, no]) => no === row.no);
    if (prior && normalize(prior[0]) !== normalize(canonicalName)) report.duplicateNumbers.push({ ...row, previous: prior[0] });
    numbers[canonicalName] = row.no;
    if (row.party) parties[canonicalName] = row.party;
    const listed = listedByArea.get(scope) || { candidates, names: new Set(), area: row.area };
    listed.names.add(normalize(canonicalName)); listedByArea.set(scope, listed);
    const matches = candidates.filter(c => normalize(c.name) === normalize(canonicalName));
    if (matches.length !== 1) { report.missingCandidates.push({ ...row, scope, matches: matches.length }); continue; }
    report.matched++;
    if (row.party && normalize(matches[0].party === '無黨籍' ? '無' : matches[0].party) !== normalize(row.party)) report.partyMismatches.push({ ...row, currentParty: matches[0].party, scope });
  }
  for (const [scope, { candidates, names, area }] of listedByArea) for (const c of candidates) if (!names.has(normalize(c.name))) report.unmatchedExisting.push({ scope, area, name: c.name, party: c.party });
  output[countyId] = { ballot, villageBallots, villageParties };
}
fs.mkdirSync(path.join(root, 'tmp'), { recursive: true });
fs.writeFileSync(path.join(root, 'tmp/bulk-ballot-report.json'), JSON.stringify(report, null, 2));
fs.writeFileSync(path.join(root, 'tmp/bulk-ballot-output.json'), JSON.stringify(output));
if (report.missingAreas.length || report.missingCandidates.length || report.partyMismatches.length || report.duplicateNumbers.length) {
  throw new Error('Ballot audit has unresolved areas, candidates, party differences, or duplicate numbers; inspect tmp/bulk-ballot-report.json');
}
const flatten = key => Object.assign({}, ...Object.values(output).map(region => region[key]));
const numberFields = ballot => {
  const { parties, councilorParties, townHeadParties, representativeParties, ...numbers } = ballot;
  return numbers;
};
const partyFields = ballot => ({ parties: ballot.parties, councilorParties: ballot.councilorParties,
  townHeadParties: ballot.townHeadParties, representativeParties: ballot.representativeParties });
const ballotJs = [
  '// Derived from the user-provided 115/10/27 election commission draw tables.',
  'globalThis.FORegionalBallotNumbers = Object.freeze({',
  ...Object.entries(output).map(([id, region]) => `  ${JSON.stringify(id)}: Object.freeze(${JSON.stringify(numberFields(region.ballot))}),`),
  '});',
  'globalThis.FORegionalVillageBallots = Object.freeze({',
  ...Object.entries(flatten('villageBallots')).map(([id, value]) => `  ${JSON.stringify(id)}: Object.freeze(${JSON.stringify(value)}),`),
  '});',
];
const auditJs = [
  '// Party references and unmatched records are loaded only in the admin.',
  'globalThis.FORegionalBallotParties = Object.freeze({',
  ...Object.entries(output).map(([id, region]) => `  ${JSON.stringify(id)}: Object.freeze(${JSON.stringify(partyFields(region.ballot))}),`),
  '});',
  'globalThis.FORegionalVillageParties = Object.freeze({',
  ...Object.entries(flatten('villageParties')).map(([id, value]) => `  ${JSON.stringify(id)}: Object.freeze(${JSON.stringify(value)}),`),
  '});',
  `globalThis.FORegionalBallotAudit = Object.freeze(${JSON.stringify({ unmatchedExisting: report.unmatchedExisting, nameAliases: report.nameAliases })});`,
];
fs.writeFileSync(path.join(root, 'data/ballot-numbers-regional-2026.js'), ballotJs.join('\n') + '\n');
fs.writeFileSync(path.join(root, 'data/ballot-audit-regional-2026.js'), auditJs.join('\n') + '\n');
console.log(JSON.stringify({ files: report.files.length, rows: report.rows, matched: report.matched, missingCandidates: report.missingCandidates.length, missingAreas: report.missingAreas.length, partyMismatches: report.partyMismatches.length, unmatchedExisting: report.unmatchedExisting.length, duplicateNumbers: report.duplicateNumbers.length }));
