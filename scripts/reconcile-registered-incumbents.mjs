import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const repo = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const [inputArg, textDirArg, outputDirArg] = process.argv.slice(2);
if (!inputArg || !textDirArg || !outputDirArg) {
  throw new Error('Usage: node scripts/reconcile-registered-incumbents.mjs <overrides.json> <pdf-text-dir> <output-dir>');
}
const input = path.resolve(inputArg);
const textDir = path.resolve(textDirArg);
const outputDir = path.resolve(outputDirArg);

const normalize = value => String(value || '')
  .normalize('NFKC')
  .replaceAll('台', '臺')
  .toLowerCase()
  .replace(/[^\p{L}\p{N}]/gu, '');
const readText = name => normalize(fs.readFileSync(path.join(textDir, name), 'utf8'));
const sources = {
  mayorMetro: readText('1-1(115年直轄市長選舉候選人登記彙總表).txt'),
  councilMetro: readText('2-1(115年直轄市議員選舉候選人登記彙總表).txt'),
  mayorCounty: readText('3-1(115年縣市長選舉候選人登記彙總表).txt'),
  councilCounty: readText('4-1(115年縣市議員選舉候選人登記彙總表).txt'),
  townMayor: readText('5-(115年直轄市山地原住民區長選舉候選人登記彙總表).txt')
    + readText('7-(115年鄉鎮市長選舉候選人登記彙總表).txt'),
  representative: readText('6-(115年直轄市山地原住民區民代表選舉候選人登記彙總表).txt')
    + readText('8-(115年鄉鎮市民代表選舉候選人登記彙總表).txt'),
  village: readText('9-(115年村里長選舉候選人登記彙總表).txt'),
};

const counties = JSON.parse(fs.readFileSync(path.join(repo, 'data/counties.json'), 'utf8'))
  .objects.map.geometries.map(geometry => geometry.properties);
const countyNames = new Map(counties.map(county => [String(county.id), county.name]));
const metroCodes = new Set(['63000', '64000', '65000', '66000', '67000', '68000']);
const labels = {
  mayor: '縣市長',
  councilor: '縣市議員',
  townMayor: '鄉鎮市長／直轄市山地原住民區長',
  representative: '鄉鎮市民代表／直轄市山地原住民區民代表',
  village: '村里長',
};

function sourceKey(category, countyCode) {
  if (category === 'mayor') return metroCodes.has(countyCode) ? 'mayorMetro' : 'mayorCounty';
  if (category === 'councilor') return metroCodes.has(countyCode) ? 'councilMetro' : 'councilCounty';
  return category;
}

function isRegistered(category, countyCode, name) {
  const text = sources[sourceKey(category, countyCode)];
  const county = normalize(countyNames.get(countyCode));
  const fullName = normalize(name);
  const hanRuns = String(name).normalize('NFKC').match(/\p{Script=Han}+/gu) || [];
  const longestHan = hanRuns.sort((a, b) => b.length - a.length)[0] || '';
  for (const candidate of new Set([fullName, normalize(longestHan)].filter(Boolean))) {
    let at = text.indexOf(candidate);
    while (at !== -1) {
      const around = text.slice(Math.max(0, at - 140), Math.min(text.length, at + candidate.length + 140));
      if (around.includes(county)) return true;
      at = text.indexOf(candidate, at + 1);
    }
  }
  return false;
}

function categoryFor(areaCode, field) {
  if (areaCode.length === 5) return field === 'councilors' ? 'councilor' : 'mayor';
  if (areaCode.length === 8) return field === 'representatives' ? 'representative' : 'townMayor';
  return 'village';
}

function candidatesOf(document, areaCode) {
  const rows = [];
  for (const candidate of document.candidates || []) {
    rows.push({ candidate, list: document.candidates, category: categoryFor(areaCode, 'candidates'), district: candidate.district ?? null });
  }
  for (const field of ['councilors', 'representatives']) {
    for (const block of document[field] || []) {
      for (const candidate of block.candidates || []) {
        rows.push({ candidate, list: block.candidates, category: categoryFor(areaCode, field), district: block.district ?? null });
      }
    }
  }
  return rows;
}

const data = JSON.parse(fs.readFileSync(input, 'utf8'));
const all = [];
for (const [areaCode, document] of Object.entries(data)) {
  const countyCode = areaCode.slice(0, 5);
  for (const row of candidatesOf(document, areaCode)) all.push({ ...row, areaCode, countyCode });
}

const baseDocuments = new Map();
function topologyCandidates(file) {
  const topology = JSON.parse(fs.readFileSync(file, 'utf8'));
  const rows = [];
  for (const geometry of topology.objects.map.geometries) {
    const areaCode = String(geometry.properties.id);
    const countyCode = areaCode.slice(0, 5);
    baseDocuments.set(areaCode, geometry.properties);
    for (const row of candidatesOf(geometry.properties, areaCode)) rows.push({ ...row, areaCode, countyCode });
  }
  return rows;
}

const baseFiles = [path.join(repo, 'data/counties.json')];
for (const directory of ['towns', 'villages']) {
  for (const file of fs.readdirSync(path.join(repo, 'data', directory))) {
    if (file.endsWith('.json')) baseFiles.push(path.join(repo, 'data', directory, file));
  }
}
const baseCandidates = baseFiles.flatMap(topologyCandidates);

function addCandidateFromBase(row, priorRace) {
  let document = data[row.areaCode];
  if (!document) {
    document = structuredClone(baseDocuments.get(row.areaCode));
    if (!document) throw new Error(`Missing base document for ${row.areaCode}`);
    document.schemaVersion = 2;
    document._revision = '0';
    data[row.areaCode] = document;
    const existing = candidatesOf(document, row.areaCode).find(target =>
      target.category === row.category
      && String(target.district) === String(row.district)
      && normalize(target.candidate.name) === normalize(row.candidate.name));
    if (!existing) throw new Error(`Cloned document lost ${row.areaCode} ${row.candidate.name}`);
    existing.candidate.isIncumbent = false;
    existing.candidate.priorRace = priorRace;
    const added = { ...existing, areaCode: row.areaCode, countyCode: row.countyCode };
    all.push(added);
    return added;
  }

  const candidate = structuredClone(row.candidate);
  candidate.isIncumbent = false;
  candidate.priorRace = priorRace;
  let list;
  if (row.category === 'councilor' || row.category === 'representative') {
    const field = row.category === 'councilor' ? 'councilors' : 'representatives';
    let block = (document[field] || []).find(item => String(item.district) === String(row.district));
    if (!block) {
      block = { district: String(row.district), candidates: [] };
      (document[field] ||= []).push(block);
    }
    list = block.candidates;
  } else {
    list = document.candidates ||= [];
  }
  list.push(candidate);
  const added = { candidate, list, category: row.category, areaCode: row.areaCode, countyCode: row.countyCode };
  all.push(added);
  return added;
}

const items = [];
const isRegisteredCandidate = (category, countyCode, name) => isRegistered(category, countyCode, name)
  && baseCandidates.some(candidate => candidate.category === category
    && candidate.countyCode === countyCode
    && normalize(candidate.candidate.name) === normalize(name));
const stale = all.filter(row => row.candidate.isIncumbent
  && !isRegisteredCandidate(row.category, row.countyCode, row.candidate.name));
for (const row of stale) {
  const registeredElsewhere = Object.keys(labels)
    .filter(category => category !== row.category && isRegisteredCandidate(category, row.countyCode, row.candidate.name));
  const targetCards = all.filter(target =>
    target.countyCode === row.countyCode
    && normalize(target.candidate.name) === normalize(row.candidate.name)
    && registeredElsewhere.includes(target.category));
  const addedCards = [];
  if (!targetCards.length && registeredElsewhere.length) {
    const baseTargets = baseCandidates.filter(target =>
      target.countyCode === row.countyCode
      && normalize(target.candidate.name) === normalize(row.candidate.name)
      && registeredElsewhere.includes(target.category));
    for (const target of baseTargets) {
      const added = addCandidateFromBase(target, `現任${labels[row.category]}`);
      targetCards.push(added);
      addedCards.push(added);
    }
  }
  for (const target of targetCards) target.candidate.priorRace = `現任${labels[row.category]}`;
  items.push({
    countyCode: row.countyCode,
    county: countyNames.get(row.countyCode),
    name: row.candidate.name,
    removedFrom: labels[row.category],
    registeredElsewhere: registeredElsewhere.map(category => labels[category]),
    markedCards: targetCards.map(target => ({ areaCode: target.areaCode, role: target.candidate.role })),
    addedCards: addedCards.map(target => ({ areaCode: target.areaCode, role: target.candidate.role })),
  });
  row.list.splice(row.list.indexOf(row.candidate), 1);
}

const summary = {
  auditedIncumbents: all.filter(row => row.candidate.isIncumbent).length,
  removedCards: stale.length,
  transfers: items.filter(row => row.registeredElsewhere.length).length,
  markedCards: items.reduce((sum, row) => sum + row.markedCards.length, 0),
  addedTransferCards: items.reduce((sum, row) => sum + row.addedCards.length, 0),
};
fs.mkdirSync(outputDir, { recursive: true });
fs.writeFileSync(path.join(outputDir, 'corrected-overrides.json'), `${JSON.stringify(data, null, 2)}\n`);
fs.writeFileSync(path.join(outputDir, 'incumbent-audit-report.json'), `${JSON.stringify({ summary, items }, null, 2)}\n`);
const csvCell = value => `"${String(value ?? '').replaceAll('"', '""')}"`;
const csvRows = [
  ['縣市', '姓名', '移除的錯誤卡片', '登記轉戰職位', '標記卡片代碼', '是否補回遺漏卡片'],
  ...items.map(item => [
    item.county,
    item.name,
    item.removedFrom,
    item.registeredElsewhere.join('、'),
    item.markedCards.map(card => card.areaCode).join('、'),
    item.addedCards.length ? '是' : '否',
  ]),
];
fs.writeFileSync(path.join(outputDir, 'incumbent-audit-report.csv'), `\uFEFF${csvRows.map(row => row.map(csvCell).join(',')).join('\n')}\n`);
console.log(JSON.stringify(summary, null, 2));
