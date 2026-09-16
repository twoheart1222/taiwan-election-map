import { readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import * as cheerio from 'cheerio';

const BASE_URL = 'https://www.tccc.gov.tw';
const LIST_URL = `${BASE_URL}/wb_introduction01.asp`;
const API_URL = process.env.ELECTION_API_URL ||
  'https://election-api.uprisevideoproduction.workers.dev/?key=overrides';
const COUNTY_CODE = '66000';
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const concurrency = 5;

function cleanText(value) {
  return String(value || '').replace(/\s+/g, ' ').trim();
}

function normalizeName(value) {
  return cleanText(value).normalize('NFKC').replace(/[・．·‧\s]/g, '');
}

function canonicalFacebook(value) {
  try {
    const url = new URL(cleanText(value));
    if (!/(^|\.)facebook\.com$/i.test(url.hostname)) return '';
    url.protocol = 'https:';
    url.hostname = 'www.facebook.com';
    url.hash = '';
    for (const key of [...url.searchParams.keys()]) {
      if (!['id', 'story_fbid'].includes(key)) url.searchParams.delete(key);
    }
    return url.href.replace(/\/$/, '');
  } catch {
    return '';
  }
}

async function fetchText(url, attempts = 3) {
  let lastError;
  for (let attempt = 1; attempt <= attempts; attempt += 1) {
    try {
      const response = await fetch(url, {
        headers: { 'User-Agent': 'Mozilla/5.0 (compatible; taiwan-election-map/1.0)' },
        signal: AbortSignal.timeout(20000),
      });
      if (!response.ok) throw new Error(`HTTP ${response.status}`);
      return await response.text();
    } catch (error) {
      lastError = error;
      if (attempt < attempts) await new Promise((resolve) => setTimeout(resolve, attempt * 700));
    }
  }
  throw new Error(`${url}: ${lastError?.message || lastError}`);
}

async function mapLimit(items, limit, callback) {
  const output = new Array(items.length);
  let cursor = 0;
  async function worker() {
    while (cursor < items.length) {
      const index = cursor;
      cursor += 1;
      output[index] = await callback(items[index], index);
    }
  }
  await Promise.all(Array.from({ length: Math.min(limit, items.length) }, worker));
  return output;
}

function parseRoster(html) {
  const $ = cheerio.load(html);
  const members = [];
  $('.Mcouncillor_title').each((districtIndex, title) => {
    const district = String(districtIndex + 1);
    $(title).next('.Mcouncillor_list').find('.list_block').each((_, block) => {
      const link = $(block).find('.list_note > a[href*="cno="]').first();
      const name = cleanText(link.text());
      const cno = new URL(link.attr('href') || '', BASE_URL).searchParams.get('cno');
      if (!name || !cno) return;
      members.push({
        district,
        name,
        cno,
        detailUrl: `${BASE_URL}/wb_introduction02.asp?cno=${encodeURIComponent(cno)}`,
      });
    });
  });
  return members;
}

function parseProfile(member, html) {
  const $ = cheerio.load(html);
  const photoSource = $('img[src*="ConnThumb.asp"]').first().attr('src') || '';
  const photoUrl = photoSource ? new URL(photoSource, BASE_URL).href : '';
  let facebook = '';
  $('a[href*="facebook.com"]').each((_, link) => {
    if (!facebook) facebook = canonicalFacebook($(link).attr('href'));
  });
  return { ...member, photoUrl, facebook };
}

const [listHtml, overrides] = await Promise.all([
  fetchText(LIST_URL),
  fetch(`${API_URL}${API_URL.includes('?') ? '&' : '?'}v=${crypto.randomUUID()}`, {
    cache: 'no-store',
  }).then(async (response) => {
    if (!response.ok) throw new Error(`overrides API returned ${response.status}`);
    return response.json();
  }),
]);

const roster = parseRoster(listHtml);
if (roster.length < 50) throw new Error(`安全中止：只解析到 ${roster.length} 位臺中市議員`);

let completed = 0;
const official = await mapLimit(roster, concurrency, async (member) => {
  const row = parseProfile(member, await fetchText(member.detailUrl));
  completed += 1;
  console.log(`[${completed}/${roster.length}] ${row.name}: ${row.facebook ? 'Facebook' : '無 Facebook'}`);
  return row;
});

const document = overrides[COUNTY_CODE];
if (!document) throw new Error(`安全中止：正式資料沒有縣市代碼 ${COUNTY_CODE}`);

let matched = 0;
let photosAdded = 0;
let facebookAdded = 0;
let incumbentsAdded = 0;
const unmatched = [];
for (const member of official) {
  const block = (document.councilors || []).find(
    (item) => String(item.district) === member.district,
  );
  const matches = (block?.candidates || []).filter(
    (candidate) => normalizeName(candidate.name) === normalizeName(member.name),
  );
  if (matches.length === 0) {
    unmatched.push({ district: member.district, name: member.name });
    continue;
  }
  if (matches.length !== 1) {
    throw new Error(`安全中止：第 ${member.district} 選區 ${member.name} 命中 ${matches.length} 筆`);
  }
  matched += 1;
  const candidate = matches[0];
  if (!candidate.photoUrl && member.photoUrl) {
    candidate.photoUrl = member.photoUrl;
    photosAdded += 1;
  }
  if (member.facebook && candidate.facebook !== member.facebook) {
    candidate.facebook = member.facebook;
    facebookAdded += 1;
  }
  if (candidate.isIncumbent !== true) {
    candidate.isIncumbent = true;
    incumbentsAdded += 1;
  }
}

document.updatedAt = new Date().toISOString();
document.updatedBy = 'tccc-official-sync';
const report = {
  generatedAt: document.updatedAt,
  source: LIST_URL,
  officialCount: official.length,
  matched,
  unmatched,
  officialPhotos: official.filter((member) => member.photoUrl).length,
  officialFacebook: official.filter((member) => member.facebook).length,
  photosAdded,
  facebookAdded,
  incumbentsAdded,
  councilors: official,
};

await Promise.all([
  writeFile(path.join(root, 'data', 'tccc_councilors.json'), `${JSON.stringify(report, null, 2)}\n`),
  writeFile(path.join(root, 'overrides_deploy.json'), `${JSON.stringify(overrides)}\n`),
  writeFile(
    path.join(root, 'overrides_bulk_deploy.json'),
    `${JSON.stringify([{ key: 'overrides', value: JSON.stringify(overrides) }])}\n`,
  ),
]);

console.log(JSON.stringify({
  officialCount: report.officialCount,
  matched,
  unmatched: unmatched.length,
  officialPhotos: report.officialPhotos,
  officialFacebook: report.officialFacebook,
  photosAdded,
  facebookAdded,
  incumbentsAdded,
}, null, 2));
