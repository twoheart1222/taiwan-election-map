import fs from 'node:fs/promises';
import path from 'node:path';
import process from 'node:process';

const ROOT = process.cwd();
const NATIONAL_PATH = path.join(ROOT, 'data/history/presidential.json');
const OUTPUT_PATH = path.join(ROOT, 'data/history/presidential-counties.json');
const SOURCE_2020 = process.env.HISTORY_2020_CSV || path.join(ROOT, '.history-sources/2020/presidential_counties.csv');
const SOURCE_2024_BASE = process.env.HISTORY_2024_ELBASE || path.join(ROOT, '.history-sources/cec/voteData/2024總統立委/總統/elbase.csv');
const SOURCE_2024_TICKETS = process.env.HISTORY_2024_ELCTKS || path.join(ROOT, '.history-sources/cec/voteData/2024總統立委/總統/elctks.csv');

const COUNTY_ORDER = [
  '臺北市', '新北市', '桃園市', '臺中市', '臺南市', '高雄市',
  '基隆市', '新竹市', '嘉義市', '新竹縣', '苗栗縣', '彰化縣',
  '南投縣', '雲林縣', '嘉義縣', '屏東縣', '宜蘭縣', '花蓮縣',
  '臺東縣', '澎湖縣', '金門縣', '連江縣',
];

function clean(value) { return String(value ?? '').replace(/^\uFEFF/, '').trim(); }
function normalizeCounty(value) { return clean(value).replaceAll('台', '臺'); }
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

function finalizeCountyCandidates(candidates) {
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

function validateCounties(year, counties, election) {
  const names = Object.keys(counties);
  const missing = COUNTY_ORDER.filter(name => !names.includes(name));
  const extra = names.filter(name => !COUNTY_ORDER.includes(name));
  if (missing.length || extra.length) {
    throw new Error(`${year} county set invalid; missing=[${missing.join(', ')}], extra=[${extra.join(', ')}]`);
  }

  const sums = new Map();
  for (const county of Object.values(counties)) {
    for (const candidate of county.candidates) {
      sums.set(String(candidate.no), (sums.get(String(candidate.no)) || 0) + candidate.votes);
    }
  }
  const errors = [];
  for (const expected of election.candidates) {
    const actual = sums.get(String(expected.no)) || 0;
    if (actual !== expected.votes) errors.push(`#${expected.no} ${expected.president}: county sum ${actual} != national ${expected.votes}`);
  }
  if (errors.length) throw new Error(`${year} validation failed:\n- ${errors.join('\n- ')}`);
}

function build2020(text, election) {
  const rows = parseCsv(text);
  if (rows.length < 2) throw new Error('2020 processed county CSV is empty');
  const header = rows[0].map(clean);
  const regionIndex = header.indexOf('Region');
  if (regionIndex < 0) throw new Error('2020 CSV has no Region column');
  const candidateColumns = header
    .map((name, index) => ({ name, index, match: name.match(/^\((\d+)\)/) }))
    .filter(item => item.match)
    .map(item => ({ no: item.match[1], index: item.index, header: item.name }));
  if (!candidateColumns.length) throw new Error('2020 CSV has no candidate columns');

  const counties = {};
  for (const row of rows.slice(1)) {
    const county = normalizeCounty(row[regionIndex]);
    if (!COUNTY_ORDER.includes(county)) continue;
    const candidates = candidateColumns.map(col => {
      const meta = election.candidates.find(c => String(c.no) === String(col.no));
      if (!meta) throw new Error(`2020 unknown candidate number ${col.no} from ${col.header}`);
      return { no: String(col.no), name: meta.president, party: meta.party, votes: asInt(row[col.index]) };
    });
    if (counties[county]) throw new Error(`2020 duplicate county row: ${county}`);
    counties[county] = finalizeCountyCandidates(candidates);
  }
  validateCounties(2020, counties, election);
  return counties;
}

function build2024(elbaseText, elctksText, election) {
  const baseRows = parseCsv(elbaseText);
  const ticketRows = parseCsv(elctksText);
  const countyNames = new Map();

  // elbase: 省市別, 縣市別, 選別, 鄉鎮市區, 村里別, 名稱
  for (const row of baseRows) {
    const [provinceCity, countyCode, district, town, village, rawName] = row;
    const name = normalizeCounty(rawName);
    if (district !== '00' || town !== '000' || village !== '0000') continue;
    if (provinceCity === '00' || name === '全國' || !COUNTY_ORDER.includes(name)) continue;
    countyNames.set(`${provinceCity}|${countyCode}`, name);
  }

  const buckets = new Map();
  // elctks: 省市別, 縣市別, 選區別, 鄉鎮市區, 村里別, 投開票所, 候選人號次, 得票數, 得票率, 當選註記
  for (const row of ticketRows) {
    const [provinceCity, countyCode, district, town, village, poll, candidateNo, votes] = row;
    if (district !== '00' || town !== '000' || village !== '0000' || asInt(poll) !== 0) continue;
    if (provinceCity === '00') continue;
    const county = countyNames.get(`${provinceCity}|${countyCode}`);
    if (!county) continue;
    const meta = election.candidates.find(c => String(c.no) === String(asInt(candidateNo)));
    if (!meta) throw new Error(`2024 unknown candidate number ${candidateNo} for ${county}`);
    if (!buckets.has(county)) buckets.set(county, new Map());
    const bucket = buckets.get(county);
    const no = String(meta.no);
    if (bucket.has(no)) throw new Error(`2024 duplicate county/candidate summary: ${county} #${no}`);
    bucket.set(no, { no, name: meta.president, party: meta.party, votes: asInt(votes) });
  }

  const counties = {};
  for (const [county, candidates] of buckets) counties[county] = finalizeCountyCandidates([...candidates.values()]);
  validateCounties(2024, counties, election);
  return counties;
}

async function main() {
  const [nationalText, outputText, text2020, base2024, tickets2024] = await Promise.all([
    fs.readFile(NATIONAL_PATH, 'utf8'),
    fs.readFile(OUTPUT_PATH, 'utf8'),
    fs.readFile(SOURCE_2020, 'utf8'),
    fs.readFile(SOURCE_2024_BASE, 'utf8'),
    fs.readFile(SOURCE_2024_TICKETS, 'utf8'),
  ]);
  const national = JSON.parse(nationalText);
  const output = JSON.parse(outputText);
  const byYear = new Map(national.elections.map(e => [Number(e.year), e]));

  const counties2020 = build2020(text2020, byYear.get(2020));
  output.years['2020'] = {
    sourceUrl: 'https://github.com/everdark/TW_Presidential_Election_2020/releases/tag/0.4',
    sourceNote: '中選會原始資料之 county-level processed CSV',
    counties: counties2020,
  };
  console.log('2020: 22 counties; national totals verified.');

  const counties2024 = build2024(base2024, tickets2024, byYear.get(2024));
  output.years['2024'] = {
    sourceUrl: 'https://github.com/kiang/db.cec.gov.tw/tree/master/voteData/2024總統立委/總統',
    sourceNote: '中選會原始 elbase/elctks 格式鏡像',
    counties: counties2024,
  };
  console.log('2024: 22 counties; national totals verified.');

  output.source.coverage = '1996–2024';
  output.source.modernAdapters = [
    '2020: everdark/TW_Presidential_Election_2020 release 0.4 county CSV',
    '2024: kiang/db.cec.gov.tw CEC raw elbase/elctks mirror',
  ];
  await fs.writeFile(OUTPUT_PATH, `${JSON.stringify(output, null, 2)}\n`, 'utf8');
  console.log(`Updated ${path.relative(ROOT, OUTPUT_PATH)} with 2020 and 2024.`);
}

main().catch(error => {
  console.error(error.stack || error);
  process.exitCode = 1;
});
