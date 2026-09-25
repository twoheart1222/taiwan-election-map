import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';
import { fileURLToPath } from 'node:url';

const repo = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const [overridesArg, outputArg] = process.argv.slice(2);
if (!overridesArg || !outputArg) {
  throw new Error('Usage: node scripts/build-incumbent-review.mjs <overrides.json> <output.json>');
}

vm.runInThisContext(fs.readFileSync(path.join(repo, 'election-data.js'), 'utf8'));
const overrides = JSON.parse(fs.readFileSync(path.resolve(overridesArg), 'utf8'));
const councilHistory = JSON.parse(fs.readFileSync(path.join(repo, 'data/history/councilor.json'), 'utf8')).years['2022'];
const mayorHistory = JSON.parse(fs.readFileSync(path.join(repo, 'data/history/local-executive.json'), 'utf8')).years['2022'];
const villageVerified = JSON.parse(fs.readFileSync(path.join(repo, 'data/village_incumbent_sync.json'), 'utf8')).records;

const normalize = value => String(value || '').normalize('NFKC').replaceAll('台', '臺').replace(/[・．·‧\s\u3000]/g, '');
const historyKey = (county, name) => `${normalize(county)}|${normalize(name)}`;
const councilOutcomes = new Map();
for (const [county, countyData] of Object.entries(councilHistory.counties || {})) {
  for (const [district, block] of Object.entries(countyData.districts || {})) {
    for (const candidate of block.candidates || []) {
      const key = historyKey(county, candidate.name);
      if (!councilOutcomes.has(key)) councilOutcomes.set(key, []);
      councilOutcomes.get(key).push({ district, elected: candidate.elected === true, votes: candidate.votes });
    }
  }
}
const mayorOutcomes = new Map();
for (const [county, race] of Object.entries(mayorHistory.races || {})) {
  for (const candidate of race.candidates || []) {
    const key = historyKey(county, candidate.name);
    if (!mayorOutcomes.has(key)) mayorOutcomes.set(key, []);
    mayorOutcomes.get(key).push({ district: '', elected: candidate.elected === true, votes: candidate.votes });
  }
}
const verifiedVillageKeys = new Set(villageVerified.map(record => `${record.areaId}|${normalize(record.name)}`));

const files = [path.join(repo, 'data/counties.json')];
for (const directory of ['towns', 'villages']) {
  for (const file of fs.readdirSync(path.join(repo, 'data', directory))) {
    if (file.endsWith('.json')) files.push(path.join(repo, 'data', directory, file));
  }
}
const baseAreas = new Map();
for (const file of files) {
  const topology = JSON.parse(fs.readFileSync(file, 'utf8'));
  for (const geometry of topology.objects.map.geometries) baseAreas.set(String(geometry.properties.id), geometry.properties);
}
const countyNames = new Map([...baseAreas].filter(([code]) => code.length === 5).map(([code, area]) => [code, area.name]));
const townNames = new Map([...baseAreas].filter(([code]) => code.length === 8).map(([code, area]) => [code, area.name]));

const rows = [];
function addCandidate(areaId, area, category, district, candidate) {
  if (candidate?.prevVotes == null || String(candidate.prevVotes).trim() === '' || candidate.isIncumbent === true) return;
  const county = countyNames.get(areaId.slice(0, 5)) || '';
  const town = areaId.length >= 8 ? townNames.get(areaId.slice(0, 8)) || '' : '';
  const village = areaId.length === 11 ? area.name || '' : '';
  let status = '需人工查證：尚無現任名冊交叉資料';
  let officialOutcome = '';
  let historicalDistrict = '';
  let recommendation = '查證目前是否仍在同一職位；確認後再勾選。';
  let evidence = '';

  if (candidate.priorRace) {
    status = '職位變更：不要標成同職位連任';
    officialOutcome = candidate.priorRace;
    recommendation = '保留上屆得票，使用轉換職位標記，不勾選現任爭取連任。';
    evidence = '網站候選人資料 priorRace';
  } else if (category === 'councilor' || category === 'mayor') {
    const outcomes = (category === 'councilor' ? councilOutcomes : mayorOutcomes).get(historyKey(county, candidate.name)) || [];
    historicalDistrict = outcomes.map(item => item.district).filter(Boolean).join('、');
    if (outcomes.some(item => item.elected)) {
      status = '優先查證：2022當選但未標示連任';
      officialOutcome = '2022 當選';
      recommendation = '查證目前是否仍在任；仍在任才勾選「現任爭取連任」。';
    } else if (outcomes.length) {
      status = '可排除：2022未當選';
      officialOutcome = '2022 未當選';
      recommendation = '不要勾選「現任爭取連任」。';
    } else {
      status = '需人工查證：找不到2022同名結果';
      recommendation = '先核對姓名、選區與上屆得票來源。';
    }
    evidence = category === 'councilor' ? '中選會 2022 議員選舉結果' : '中選會 2022 縣市長選舉結果';
  } else if (category === 'village') {
    if (verifiedVillageKeys.has(`${areaId}|${normalize(candidate.name)}`)) {
      status = '優先查證：內政部現任名冊有列但未標示';
      officialOutcome = '內政部現任名冊有列';
      recommendation = '核對姓名與村里後勾選「現任爭取連任」。';
    } else {
      status = '可排除：內政部現任村里長名冊未列';
      officialOutcome = '內政部現任名冊未列';
      recommendation = '不要只因有上屆得票就勾選。';
    }
    evidence = '中選會登記名單 × 內政部現任村里長名冊';
  }

  rows.push({
    status,
    county,
    town,
    village,
    areaId,
    category,
    role: candidate.role || '',
    district: district || '',
    name: candidate.name || '',
    party: candidate.party || '',
    prevVotes: candidate.prevVotes,
    officialOutcome,
    historicalDistrict,
    priorRace: candidate.priorRace || '',
    evidence,
    recommendation,
  });
}

for (const [areaId, base] of baseAreas) {
  const area = ElectionData.mergeArea(base, overrides[areaId]);
  const category = areaId.length === 5 ? 'mayor' : areaId.length === 8 ? 'townMayor' : 'village';
  for (const candidate of area.candidates || []) addCandidate(areaId, area, category, '', candidate);
  if (areaId.length === 5) for (const block of ElectionData.blocksOf(area.councilors)) {
    for (const candidate of block.candidates || []) addCandidate(areaId, area, 'councilor', String(block.district || ''), candidate);
  }
  if (areaId.length === 8) for (const block of ElectionData.blocksOf(area.representatives)) {
    for (const candidate of block.candidates || []) addCandidate(areaId, area, 'representative', String(block.district || ''), candidate);
  }
}

const priority = rows.filter(row => row.status.startsWith('優先查證'));
const counts = Object.fromEntries([...new Set(rows.map(row => row.status))].sort().map(status => [status, rows.filter(row => row.status === status).length]));
const report = {
  generatedAt: new Date().toISOString(),
  source: '正式站基礎資料與公開 overrides 合併結果；2022 中選會歷史結果；內政部現任村里長名冊。',
  rule: '上屆得票只代表曾參選；只有官方當選或現任名冊能作為優先查證依據。',
  totalWithPrevVotesNotMarked: rows.length,
  priorityCount: priority.length,
  counts,
  priority,
  rows,
};
fs.mkdirSync(path.dirname(path.resolve(outputArg)), { recursive: true });
fs.writeFileSync(path.resolve(outputArg), `${JSON.stringify(report, null, 2)}\n`);
console.log(JSON.stringify({ total: rows.length, priority: priority.length, counts }, null, 2));
