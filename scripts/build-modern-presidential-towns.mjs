import fs from 'node:fs/promises';
import path from 'node:path';
import process from 'node:process';

const ROOT = process.cwd();
const NATIONAL_PATH = path.join(ROOT, 'data/history/presidential.json');
const COUNTY_PATH = path.join(ROOT, 'data/history/presidential-counties.json');
const OUTPUT_PATH = path.join(ROOT, 'data/history/presidential-towns.json');
const SOURCE_2020 = process.env.HISTORY_2020_REGIONS || path.join(ROOT, '.history-sources/2020/presidential_regions.csv');
const SOURCE_2024_BASE = process.env.HISTORY_2024_ELBASE || path.join(ROOT, '.history-sources/cec/voteData/2024總統立委/總統/elbase.csv');
const SOURCE_2024_TICKETS = process.env.HISTORY_2024_ELCTKS || path.join(ROOT, '.history-sources/cec/voteData/2024總統立委/總統/elctks.csv');

const COUNTY_ORDER = [
  '臺北市', '新北市', '桃園市', '臺中市', '臺南市', '高雄市',
  '基隆市', '新竹市', '嘉義市', '新竹縣', '苗栗縣', '彰化縣',
  '南投縣', '雲林縣', '嘉義縣', '屏東縣', '宜蘭縣', '花蓮縣',
  '臺東縣', '澎湖縣', '金門縣', '連江縣',
];

function clean(value) { return String(value ?? '').replace(/^\uFEFF/, '').trim(); }
function normalizeName(value) { return clean(value).replaceAll('台', '臺').replace(/\s+/g, ''); }
function asInt(value) { return Number(clean(value).replaceAll(',', '')) || 0; }

function parseCsv(text) {
  const rows = [];
  let row = [];
  let field = '';
  let quoted = false;
  for (let i = 0; i < text.length; i += 1) {
    const ch = text[i];
    if (quoted) {
      if (ch === '"') {
        if (text[i + 1] === '"') { field += '"'; i += 1; }
        else quoted = false;
      } else field += ch;
      continue;
    }
    if (ch === '"') quoted = true;
    else if (ch === ',') { row.push(field); field = ''; }
    else if (ch === '\n') { row.push(field.replace(/\r$/, '')); rows.push(row); row = []; field = ''; }
    else field += ch;
  }
  if (field.length || row.length) { row.push(field.replace(/\r$/, '')); rows.push(row); }
  return rows.filter(r => r.some(v => clean(v) !== ''));
}

function finalize(candidates) {
  const list = [...candidates].sort((a, b) => Number(a.no) - Number(b.no));
  const validVotes = list.reduce((sum, c) => sum + c.votes, 0);
  const ranked = [...list].sort((a, b) => b.votes - a.votes);
  return {
    validVotes,
    winnerNo: ranked[0]?.no || null,
    margin: ranked.length > 1 ? ranked[0].votes - ranked[1].votes : ranked[0]?.votes || 0,
    candidates: list.map(c => ({ ...c, share: validVotes ? Number((c.votes / validVotes * 100).toFixed(4)) : 0 })),
  };
}

function candidateColumns(header) {
  return header
    .map((name, index) => ({ name, index, match: clean(name).match(/^\((\d+)\)/) }))
    .filter(item => item.match)
    .map(item => ({ no: item.match[1], index: item.index, header: item.name }));
}

function validateTownSums(year, counties, countyArchive, election) {
  const errors = [];
  for (const countyName of COUNTY_ORDER) {
    const towns = counties[countyName];
    const expectedCounty = countyArchive.years?.[String(year)]?.counties?.[countyName];
    if (!expectedCounty) {
      errors.push(`${countyName}: missing county baseline`);
      continue;
    }
    if (!towns || !Object.keys(towns).length) {
      errors.push(`${countyName}: no township results`);
      continue;
    }
    const sums = new Map();
    for (const town of Object.values(towns)) {
      for (const candidate of town.candidates) {
        sums.set(String(candidate.no), (sums.get(String(candidate.no)) || 0) + candidate.votes);
      }
    }
    for (const expected of election.candidates) {
      const countyCandidate = expectedCounty.candidates.find(c => String(c.no) === String(expected.no));
      const actual = sums.get(String(expected.no)) || 0;
      if (!countyCandidate || actual !== countyCandidate.votes) {
        errors.push(`${countyName} #${expected.no}: town sum ${actual} != county ${countyCandidate?.votes ?? 'missing'}`);
      }
    }
  }
  if (errors.length) throw new Error(`${year} township validation failed:\n- ${errors.join('\n- ')}`);
}

function build2020(text, election) {
  const rows = parseCsv(text);
  if (rows.length < 2) throw new Error('2020 processed region CSV is empty');
  const header = rows[0].map(clean);
  const byIndex = header.indexOf('By');
  const regionIndex = header.indexOf('Region');
  if (byIndex < 0 || regionIndex < 0) throw new Error(`2020 regions CSV missing By/Region columns: ${header.join(' | ')}`);
  const cols = candidateColumns(header);
  if (!cols.length) throw new Error('2020 regions CSV has no candidate columns');

  const counties = Object.fromEntries(COUNTY_ORDER.map(name => [name, {}]));
  for (const row of rows.slice(1)) {
    const county = normalizeName(row[byIndex]);
    const town = normalizeName(row[regionIndex]);
    if (!COUNTY_ORDER.includes(county) || !town) continue;
    if (counties[county][town]) throw new Error(`2020 duplicate township row: ${county}${town}`);
    const candidates = cols.map(col => {
      const meta = election.candidates.find(c => String(c.no) === String(col.no));
      if (!meta) throw new Error(`2020 unknown candidate number ${col.no} from ${col.header}`);
      return { no: String(meta.no), name: meta.president, party: meta.party, votes: asInt(row[col.index]) };
    });
    counties[county][town] = finalize(candidates);
  }
  return counties;
}

function build2024(elbaseText, elctksText, election) {
  const baseRows = parseCsv(elbaseText);
  const ticketRows = parseCsv(elctksText);
  const countyNames = new Map();
  const townNames = new Map();

  // elbase: 省市, 縣市, 選區, 鄉鎮市區, 村里, 名稱
  for (const row of baseRows) {
    const [provinceCity, countyCode, district, townCode, villageCode, rawName] = row;
    if (district !== '00' || villageCode !== '0000') continue;
    if (townCode === '000') {
      const county = normalizeName(rawName);
      if (provinceCity !== '00' && COUNTY_ORDER.includes(county)) countyNames.set(`${provinceCity}|${countyCode}`, county);
    }
  }
  for (const row of baseRows) {
    const [provinceCity, countyCode, district, townCode, villageCode, rawName] = row;
    if (district !== '00' || townCode === '000' || villageCode !== '0000') continue;
    const county = countyNames.get(`${provinceCity}|${countyCode}`);
    if (!county) continue;
    const town = normalizeName(rawName);
    if (!town) continue;
    townNames.set(`${provinceCity}|${countyCode}|${townCode}`, { county, town });
  }

  const buckets = new Map();
  // 2024 elctks does not expose reliable township-summary rows. Aggregate the
  // unique polling-place rows into townships, then verify back to county totals.
  for (const row of ticketRows) {
    const [provinceCity, countyCode, district, townCode, villageCode, poll, candidateNo, votes] = row;
    if (district !== '00' || townCode === '000' || asInt(poll) === 0) continue;
    const area = townNames.get(`${provinceCity}|${countyCode}|${townCode}`);
    if (!area) continue;
    const meta = election.candidates.find(c => String(c.no) === String(asInt(candidateNo)));
    if (!meta) throw new Error(`2024 unknown candidate number ${candidateNo} for ${area.county}${area.town}`);
    const key = `${area.county}\u0000${area.town}`;
    if (!buckets.has(key)) buckets.set(key, new Map());
    const bucket = buckets.get(key);
    const no = String(meta.no);
    const current = bucket.get(no) || { no, name: meta.president, party: meta.party, votes: 0 };
    current.votes += asInt(votes);
    bucket.set(no, current);
  }

  const counties = Object.fromEntries(COUNTY_ORDER.map(name => [name, {}]));
  for (const [key, candidateMap] of buckets) {
    const [county, town] = key.split('\u0000');
    counties[county][town] = finalize([...candidateMap.values()]);
  }
  return counties;
}

async function main() {
  const [nationalText, countyText, text2020, base2024, tickets2024] = await Promise.all([
    fs.readFile(NATIONAL_PATH, 'utf8'),
    fs.readFile(COUNTY_PATH, 'utf8'),
    fs.readFile(SOURCE_2020, 'utf8'),
    fs.readFile(SOURCE_2024_BASE, 'utf8'),
    fs.readFile(SOURCE_2024_TICKETS, 'utf8'),
  ]);
  const national = JSON.parse(nationalText);
  const countyArchive = JSON.parse(countyText);
  const byYear = new Map(national.elections.map(e => [Number(e.year), e]));

  const result2020 = build2020(text2020, byYear.get(2020));
  validateTownSums(2020, result2020, countyArchive, byYear.get(2020));
  console.log(`2020: ${Object.values(result2020).reduce((n, towns) => n + Object.keys(towns).length, 0)} townships; county totals verified.`);

  const result2024 = build2024(base2024, tickets2024, byYear.get(2024));
  validateTownSums(2024, result2024, countyArchive, byYear.get(2024));
  console.log(`2024: ${Object.values(result2024).reduce((n, towns) => n + Object.keys(towns).length, 0)} townships; county totals verified.`);

  const output = {
    schemaVersion: 1,
    boundaryMode: 'current-townships',
    coverage: [2020, 2024],
    note: '鄉鎮市區下探第一階段僅開放 2020、2024；每個鄉鎮市區加總已逐候選人核對該縣市總票。',
    topology: 'https://cdn.jsdelivr.net/npm/taiwan-atlas/towns-10t.json',
    source: {
      2020: 'everdark/TW_Presidential_Election_2020 release 0.4 presidential_regions.csv',
      2024: 'kiang/db.cec.gov.tw CEC raw elbase/elctks mirror (polling places aggregated to township)',
    },
    years: {
      '2020': { counties: result2020 },
      '2024': { counties: result2024 },
    },
  };

  await fs.writeFile(OUTPUT_PATH, `${JSON.stringify(output, null, 2)}\n`, 'utf8');
  console.log(`Wrote ${path.relative(ROOT, OUTPUT_PATH)}`);
}

main().catch(error => {
  console.error(error.stack || error);
  process.exitCode = 1;
});
