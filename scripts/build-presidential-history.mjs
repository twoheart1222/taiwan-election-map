import fs from 'node:fs/promises';
import path from 'node:path';
import process from 'node:process';

const ROOT = process.cwd();
const NATIONAL_PATH = path.join(ROOT, 'data/history/presidential.json');
const OUTPUT_PATH = path.join(ROOT, 'data/history/presidential-counties.json');

const COLUMNS = [
  'CountyCityName', 'TownshipName', 'VillageName', 'PollStationNo', 'DistrictName',
  'DrawNo', 'VoteCounts', 'VoteRate', 'CandidateName', 'EndorsementPartyName',
  'Gender', 'IsIncumbent', 'Elected',
];

const SOURCES = [
  [1996, '1996_第09任總統（副總統）選舉'],
  [2000, '2000_第10任總統（副總統）選舉'],
  [2004, '2004_第11任總統（副總統）選舉'],
  [2008, '2008_第12任總統（副總統）選舉'],
  [2012, '2012_第13任總統（副總統）選舉'],
  [2016, '2016_第14任總統（副總統）選舉'],
].map(([year, dir]) => ({
  year,
  dir,
  url: `https://raw.githubusercontent.com/MISNUK/CECDataSet/master/data/${encodeURIComponent(dir)}/VoteRecords.csv`,
}));

const COUNTY_ORDER = [
  '臺北市', '新北市', '桃園市', '臺中市', '臺南市', '高雄市',
  '基隆市', '新竹市', '嘉義市', '新竹縣', '苗栗縣', '彰化縣',
  '南投縣', '雲林縣', '嘉義縣', '屏東縣', '宜蘭縣', '花蓮縣',
  '臺東縣', '澎湖縣', '金門縣', '連江縣',
];

const LEGACY_TO_CURRENT = new Map([
  ['臺北縣', '新北市'],
  ['桃園縣', '桃園市'],
  ['臺中縣', '臺中市'],
  ['臺南縣', '臺南市'],
  ['高雄縣', '高雄市'],
]);

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
  return rows.filter(r => r.some(v => String(v).trim() !== ''));
}

function normalizeCounty(value) {
  const name = String(value || '').replace(/^\uFEFF/, '').replaceAll('台', '臺').trim();
  return LEGACY_TO_CURRENT.get(name) || name;
}

function clean(value) { return String(value ?? '').replace(/^\uFEFF/, '').trim(); }
function asInt(value) { return Number(clean(value).replaceAll(',', '')) || 0; }
function isZeroish(value) { const v = clean(value); return !v || /^0+$/.test(v); }
function isCountyName(value) { const v = clean(value).replaceAll('台', '臺'); return Boolean(v) && v !== '全國'; }

function rowsToObjects(rows) {
  if (!rows.length) return [];
  const first = rows[0].map(clean);
  const hasHeader = first.includes('CountyCityName') && first.includes('DrawNo');
  const header = hasHeader ? first : COLUMNS;
  return rows.slice(hasHeader ? 1 : 0).map(row => Object.fromEntries(header.map((key, i) => [key, row[i] ?? ''])));
}

function extractCountyRows(records) {
  const strict = records.filter(r => isCountyName(r.CountyCityName)
    && !clean(r.TownshipName)
    && !clean(r.VillageName)
    && isZeroish(r.PollStationNo)
    && isZeroish(r.DistrictName));
  if (strict.length) return strict;
  return records.filter(r => isCountyName(r.CountyCityName)
    && !clean(r.TownshipName)
    && !clean(r.VillageName)
    && isZeroish(r.PollStationNo));
}

function aggregateCountyRows(rows) {
  // VoteRecords may contain duplicated rows for president and vice-president on
  // the same ticket. Collapse identical ticket totals inside the ORIGINAL county,
  // then normalize historical county names and sum only genuine merger units.
  const originalTickets = new Map();
  for (const r of rows) {
    const originalCounty = clean(r.CountyCityName).replaceAll('台', '臺');
    const no = clean(r.DrawNo);
    if (!originalCounty || !no) continue;
    const key = `${originalCounty}\u0000${no}`;
    const votes = asInt(r.VoteCounts);
    const existing = originalTickets.get(key);
    if (existing && existing.votes !== votes) {
      throw new Error(`Conflicting duplicate ticket rows for ${originalCounty} #${no}: ${existing.votes} vs ${votes}`);
    }
    if (!existing) {
      originalTickets.set(key, {
        originalCounty,
        no,
        name: clean(r.CandidateName || r.CandIdateName),
        party: clean(r.EndorsementPartyName),
        votes,
      });
    }
  }

  const counties = new Map();
  for (const ticket of originalTickets.values()) {
    const county = normalizeCounty(ticket.originalCounty);
    if (!counties.has(county)) counties.set(county, new Map());
    const bucket = counties.get(county);
    const current = bucket.get(ticket.no) || { no: ticket.no, name: ticket.name, party: ticket.party, votes: 0 };
    current.votes += ticket.votes;
    bucket.set(ticket.no, current);
  }
  return counties;
}

function finalizeCounties(map) {
  const output = {};
  const names = [...map.keys()].sort((a, b) => {
    const ai = COUNTY_ORDER.indexOf(a); const bi = COUNTY_ORDER.indexOf(b);
    if (ai >= 0 || bi >= 0) return (ai < 0 ? 999 : ai) - (bi < 0 ? 999 : bi);
    return a.localeCompare(b, 'zh-Hant');
  });
  for (const county of names) {
    const candidates = [...map.get(county).values()].sort((a, b) => Number(a.no) - Number(b.no));
    const validVotes = candidates.reduce((sum, c) => sum + c.votes, 0);
    const ranked = [...candidates].sort((a, b) => b.votes - a.votes);
    output[county] = {
      validVotes,
      winnerNo: ranked[0]?.no || null,
      margin: ranked.length > 1 ? ranked[0].votes - ranked[1].votes : ranked[0]?.votes || 0,
      candidates: candidates.map(c => ({ ...c, share: validVotes ? Number((c.votes / validVotes * 100).toFixed(4)) : 0 })),
    };
  }
  return output;
}

function validateAgainstNational(year, counties, election) {
  const sums = new Map();
  for (const county of Object.values(counties)) {
    for (const candidate of county.candidates) sums.set(String(candidate.no), (sums.get(String(candidate.no)) || 0) + candidate.votes);
  }
  const errors = [];
  for (const expected of election.candidates) {
    const actual = sums.get(String(expected.no)) || 0;
    if (actual !== expected.votes) errors.push(`#${expected.no} ${expected.president}: county sum ${actual} != national ${expected.votes}`);
  }
  const unknown = [...sums.keys()].filter(no => !election.candidates.some(c => String(c.no) === no));
  if (unknown.length) errors.push(`unknown candidate numbers: ${unknown.join(', ')}`);
  if (errors.length) throw new Error(`${year} validation failed:\n- ${errors.join('\n- ')}`);
}

async function downloadText(url) {
  const response = await fetch(url, { headers: { 'user-agent': 'Formosa-Observatory-history-builder/1.0' } });
  if (!response.ok) throw new Error(`HTTP ${response.status} for ${url}`);
  return response.text();
}

async function main() {
  const archive = JSON.parse(await fs.readFile(NATIONAL_PATH, 'utf8'));
  const byYear = new Map(archive.elections.map(e => [Number(e.year), e]));
  const output = {
    schemaVersion: 1,
    generatedAt: new Date().toISOString(),
    boundaryMode: 'current-22-normalized',
    boundaryNote: '跨屆比較使用現行 22 縣市邊界。舊臺北縣對應新北市、桃園縣對應桃園市；2010 合併前的臺中縣市、臺南縣市、高雄縣市票數分別加總。',
    source: {
      primary: '中央選舉委員會選舉資料庫',
      mirror: 'MISNUK/CECDataSet',
      mirrorUrl: 'https://github.com/MISNUK/CECDataSet',
      coverage: '1996–2016',
    },
    years: {},
  };

  for (const source of SOURCES) {
    const election = byYear.get(source.year);
    if (!election) throw new Error(`Missing ${source.year} national election in ${NATIONAL_PATH}`);
    console.log(`Downloading ${source.year}...`);
    const text = await downloadText(source.url);
    const records = rowsToObjects(parseCsv(text));
    const countyRows = extractCountyRows(records);
    if (!countyRows.length) throw new Error(`${source.year}: no county summary rows found`);
    const counties = finalizeCounties(aggregateCountyRows(countyRows));
    validateAgainstNational(source.year, counties, election);
    const unexpected = Object.keys(counties).filter(name => !COUNTY_ORDER.includes(name));
    if (unexpected.length) throw new Error(`${source.year}: unexpected county names after normalization: ${unexpected.join(', ')}`);
    output.years[String(source.year)] = { sourceUrl: source.url, counties };
    console.log(`  ${Object.keys(counties).length} normalized counties; national totals verified.`);
  }

  await fs.mkdir(path.dirname(OUTPUT_PATH), { recursive: true });
  await fs.writeFile(OUTPUT_PATH, `${JSON.stringify(output, null, 2)}\n`, 'utf8');
  console.log(`Wrote ${path.relative(ROOT, OUTPUT_PATH)}`);
}

main().catch(error => {
  console.error(error.stack || error);
  process.exitCode = 1;
});
