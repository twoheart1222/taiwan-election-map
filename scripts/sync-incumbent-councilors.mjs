import { mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { load } from 'cheerio';

const API_URL = process.env.ELECTION_API_URL || 'https://election-api.uprisevideoproduction.workers.dev/?key=overrides';
const outputDirectory = path.resolve(process.argv[2] || '../councilor-sync');
const MOI_BASE_URL = 'https://www.moi.gov.tw/LocalOfficial.aspx';

const countyCodes = new Map(Object.entries({
  '宜蘭縣': '10002',
  '新竹縣': '10004',
  '苗栗縣': '10005',
  '彰化縣': '10007',
  '南投縣': '10008',
  '雲林縣': '10009',
  '嘉義縣': '10010',
  '屏東縣': '10013',
  '臺東縣': '10014',
  '花蓮縣': '10015',
  '澎湖縣': '10016',
  '基隆市': '10017',
  '新竹市': '10018',
  '嘉義市': '10020',
  '臺北市': '63000',
  '高雄市': '64000',
  '新北市': '65000',
  '臺中市': '66000',
  '臺南市': '67000',
  '桃園市': '68000',
  '連江縣': '09007',
  '金門縣': '09020',
}));
const knownCountyCodes = new Set(countyCodes.values());

// MOI lists these officials but omits them from district-filtered results.
// Districts are cross-checked against Central Election Commission records.
const districtFallbacks = new Map(Object.entries({
  '63000:李傅中武': 8,
  '63000:李建昌': 2,
  '63000:應曉薇': 5,
  '10013:周典論': 4,
  '10013:蘇孟婕': 2,
  '10013:鄭清原': 1,
  '10013:曾義雄': 1,
  '10013:陳明達': 2,
  '10013:洪明江': 3,
  '10013:洪宗麒': 4,
  '10013:鄭張常敏': 4,
  '10013:盧玟欣': 6,
  '10013:王薇茗': 7,
  '10013:李紀財MulanengPaliuliu': 14,
  '10013:林采穎': 15,
  '10013:梁育慈': 1,
}));

function cleanText(value) {
  return String(value || '').replace(/[\s\u3000]+/g, ' ').trim();
}

function normalizeCounty(value) {
  const county = cleanText(value).replaceAll('台', '臺');
  return county === '桃園縣' ? '桃園市' : county;
}

function normalizeName(value) {
  return cleanText(value).replace(/[\s\u3000·‧・]/g, '');
}

function normalizeParty(value) {
  const party = cleanText(value);
  return party === '無' ? '無黨籍' : party;
}

async function fetchResponse(url, options = {}) {
  const response = await fetch(url, {
    ...options,
    headers: { 'User-Agent': 'taiwan-election-map councilor sync/1.0' },
  });
  if (!response.ok) throw new Error(`Request failed (${response.status}): ${url}`);
  return response;
}

async function fetchText(url, options) {
  return (await fetchResponse(url, options)).text();
}

async function fetchJson(url) {
  return (await fetchResponse(url)).json();
}

function parseOfficialRecords(html, sourceType, district = null) {
  const $ = load(html);
  const records = [];

  $('.serv-group .result-list .block').each((_, element) => {
    const block = $(element);
    const name = cleanText(block.find('.essay .caption span').first().text());
    const county = normalizeCounty(block.find('.essay .locate span').first().text());
    if (!name || !county) return;

    records.push({
      name,
      county,
      party: normalizeParty(block.find('.essay .group span').first().text()),
      position: cleanText(block.find('.essay .position').text()),
      photoUrl: block.find('.img img').attr('src') || '',
      detailUrl: new URL(block.find('.more-btn a').attr('href') || '/', MOI_BASE_URL).href,
      sourceType,
      district,
    });
  });
  return records;
}

async function mapLimit(items, limit, callback) {
  const results = new Array(items.length);
  let cursor = 0;

  async function worker() {
    while (cursor < items.length) {
      const index = cursor;
      cursor += 1;
      results[index] = await callback(items[index], index);
    }
  }

  await Promise.all(Array.from({ length: Math.min(limit, items.length) }, worker));
  return results;
}

async function scrapeOfficialCategory(type) {
  const url = new URL(MOI_BASE_URL);
  url.searchParams.set('n', '574');
  url.searchParams.set('sms', '11400');
  url.searchParams.set('TYP', type);
  url.searchParams.set('PageSize', '1000');
  url.searchParams.set('page', '1');

  const initialResponse = await fetchResponse(url);
  const html = await initialResponse.text();
  const $ = load(html);
  const hiddenFields = {};
  $('input[type="hidden"][name]').each((_, element) => {
    hiddenFields[$(element).attr('name')] = $(element).attr('value') || '';
  });
  const cookie = (initialResponse.headers.get('set-cookie') || '').split(';', 1)[0];
  const cities = $('#QCD_CTY_ID option[value]').map((_, option) => ({
    id: $(option).attr('value'),
    name: normalizeCounty($(option).text()),
  })).get().filter((city) => city.id && countyCodes.has(city.name));

  const districtGroups = await mapLimit(cities, 4, async (city) => {
    const body = new URLSearchParams({ type: 'AREA', parid: city.id });
    const response = await fetch('https://www.moi.gov.tw/CustomAPI/LocalOfficialData.ashx', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
        'User-Agent': 'taiwan-election-map councilor sync/1.0',
      },
      body,
    });
    if (!response.ok) throw new Error(`District request failed (${response.status}): ${city.name}`);
    return (await response.json()).map((district) => ({
      city,
      id: district.EDJ_ID,
      name: district.EDJ_NAM,
      number: Number(district.EDJ_NAM.match(/第\s*(\d+)\s*選區/)?.[1]),
    }));
  });

  const districts = districtGroups.flat();
  const districtRecords = (await mapLimit(districts, 6, async (district) => {
    const body = new URLSearchParams({
      ...hiddenFields,
      QCD_CHK_POSI1: 'P0001',
      QCD_CHK_POSI2: 'P0002',
      QCD_CHK_POSI3: 'P0003',
      QCD_CHK_POSI4: 'P0004',
      QCD_CHK_POSI5: 'P0005',
      QCD_YEAR_ID: 'EY00005',
      QCD_CTY_ID: district.city.id,
      QCD_OPT_DTL1: district.id,
      QCD_LST_NAM: '',
      QCD_FIR_NAM: '',
      QCD_PTY_NAM: '',
      JLocalOfficial_btnSendQry: '送出查詢',
    });
    const response = await fetch(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
        'User-Agent': 'taiwan-election-map councilor sync/1.0',
        ...(cookie ? { Cookie: cookie } : {}),
      },
      body,
    });
    if (!response.ok) throw new Error(`Official district request failed (${response.status}): ${district.name}`);
    return parseOfficialRecords(await response.text(), type, district.number);
  })).flat();

  return {
    records: parseOfficialRecords(html, type),
    districtRecords,
    districts: districts.length,
    sourceUrl: url.href,
    updatedAt: cleanText($('.update-time .ct span').last().text()),
  };
}

function councilorBlocks(document) {
  if (Array.isArray(document?.councilors)) return document.councilors;
  if (Array.isArray(document?.councilors?.blocks)) return document.councilors.blocks;
  return null;
}

const [cityOfficials, countyOfficials, overrides] = await Promise.all([
  scrapeOfficialCategory('KND0001'),
  scrapeOfficialCategory('KND0002'),
  fetchJson(API_URL),
]);
const overridesBackup = structuredClone(overrides);

const officialsByKey = new Map();
for (const official of [...cityOfficials.records, ...countyOfficials.records]) {
  const countyCode = countyCodes.get(official.county);
  if (!countyCode) throw new Error(`Unknown official county: ${official.county}`);
  officialsByKey.set(`${countyCode}:${normalizeName(official.name)}`, { ...official, countyCode });
}

for (const official of [...cityOfficials.districtRecords, ...countyOfficials.districtRecords]) {
  const countyCode = countyCodes.get(official.county);
  const key = `${countyCode}:${normalizeName(official.name)}`;
  if (officialsByKey.has(key) && Number.isInteger(official.district)) {
    officialsByKey.get(key).district = official.district;
  }
}

let fallbackDistrictsApplied = 0;
for (const [key, district] of districtFallbacks) {
  const official = officialsByKey.get(key);
  if (official && !Number.isInteger(official.district)) {
    official.district = district;
    fallbackDistrictsApplied += 1;
  }
}

const candidateMatches = new Map();
const duplicateCandidates = [];
let candidateCount = 0;

for (const [countyCode, document] of Object.entries(overrides)) {
  const blocks = councilorBlocks(document);
  if (!blocks || !knownCountyCodes.has(countyCode)) continue;

  for (const block of blocks) {
    for (const candidate of block.candidates || []) {
      candidateCount += 1;
      candidate.isIncumbent = false;
      const key = `${countyCode}:${normalizeName(candidate.name)}`;
      if (candidateMatches.has(key)) duplicateCandidates.push({ key, district: block.district, name: candidate.name });
      candidateMatches.set(key, { candidate, district: block.district });
    }
  }
}

const matched = [];
const added = [];
const unmatchedOfficials = [];
for (const [key, official] of officialsByKey) {
  const match = candidateMatches.get(key);
  if (!match) {
    const document = overrides[official.countyCode];
    const blocks = councilorBlocks(document);
    const block = blocks?.find((item) => Number(item.district) === official.district);
    if (!block) {
      unmatchedOfficials.push(official);
      continue;
    }
    const candidate = {
      name: official.name,
      party: official.party || '無黨籍',
      role: official.county.endsWith('市') ? '市議員候選人' : '縣議員候選人',
      photoUrl: official.photoUrl || '',
      facebook: '',
      isIncumbent: true,
    };
    block.candidates ||= [];
    block.candidates.push(candidate);
    candidateMatches.set(key, { candidate, district: block.district });
    added.push({ ...official, district: block.district });
    continue;
  }

  match.candidate.isIncumbent = true;
  if (official.photoUrl) match.candidate.photoUrl = official.photoUrl;
  if (official.party) match.candidate.party = official.party;
  matched.push({ ...official, district: match.district });
}

const incumbentCount = [...candidateMatches.values()].filter(({ candidate }) => candidate.isIncumbent).length;
const unmatchedCandidates = [...candidateMatches.entries()]
  .filter(([key]) => !officialsByKey.has(key))
  .map(([key, value]) => ({ key, district: value.district, name: value.candidate.name }));

const report = {
  generatedAt: new Date().toISOString(),
  officialUpdatedAt: {
    directMunicipalities: cityOfficials.updatedAt,
    countiesAndCities: countyOfficials.updatedAt,
  },
  sourceUrls: [cityOfficials.sourceUrl, countyOfficials.sourceUrl],
  districtFallbackSourceUrls: [
    'https://web.cec.gov.tw/',
    'https://eebulletin.cec.gov.tw/',
  ],
  officialRecords: cityOfficials.records.length + countyOfficials.records.length,
  uniqueOfficials: officialsByKey.size,
  candidateCount,
  matchedOfficials: matched.length,
  addedOfficials: added.length,
  incumbentCount,
  unmatchedOfficialCount: unmatchedOfficials.length,
  unmatchedCandidateCount: unmatchedCandidates.length,
  duplicateCandidateCount: duplicateCandidates.length,
  fallbackDistrictsApplied,
  unmatchedOfficials,
  added,
  duplicateCandidates,
};

await mkdir(outputDirectory, { recursive: true });
await Promise.all([
  writeFile(path.join(outputDirectory, 'overrides-backup.json'), `${JSON.stringify(overridesBackup, null, 2)}\n`),
  writeFile(path.join(outputDirectory, 'overrides-with-incumbents.json'), `${JSON.stringify(overrides, null, 2)}\n`),
  writeFile(path.join(outputDirectory, 'official-councilors.json'), `${JSON.stringify([...officialsByKey.values()], null, 2)}\n`),
  writeFile(path.join(outputDirectory, 'sync-report.json'), `${JSON.stringify(report, null, 2)}\n`),
]);

console.log(JSON.stringify({
  outputDirectory,
  officialRecords: report.officialRecords,
  uniqueOfficials: report.uniqueOfficials,
  matchedOfficials: report.matchedOfficials,
  addedOfficials: report.addedOfficials,
  incumbentCount: report.incumbentCount,
  unmatchedOfficialCount: report.unmatchedOfficialCount,
  duplicateCandidateCount: report.duplicateCandidateCount,
  fallbackDistrictsApplied: report.fallbackDistrictsApplied,
  officialUpdatedAt: report.officialUpdatedAt,
}, null, 2));
