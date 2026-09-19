import { writeFile } from 'node:fs/promises';
import { overridesUrl } from './_api-url.mjs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { load } from 'cheerio';

const BASE_URL = 'https://www.tcc.gov.tw';
const LIST_URL = `${BASE_URL}/cp.aspx?n=13898`;
const API_URL = overridesUrl();
const COUNTY_CODE = '63000';
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const concurrency = 4;

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

function cleanText(value) {
  return String(value || '').replace(/[\s\u3000]+/g, ' ').trim();
}

function normalizeName(value) {
  return cleanText(value).normalize('NFKC').replace(/[・．·‧\s]/g, '');
}

function districtNumber(value) {
  const token = cleanText(value).match(/第([一二三四五六七八九十\d]+)選區/)?.[1] || '';
  if (/^\d+$/.test(token)) return token;
  const map = { 一: 1, 二: 2, 三: 3, 四: 4, 五: 5, 六: 6, 七: 7, 八: 8, 九: 9, 十: 10 };
  return map[token] ? String(map[token]) : '';
}

function canonicalFacebook(value) {
  if (!value) return '';
  try {
    const url = new URL(cleanText(value));
    const host = url.hostname.toLowerCase().replace(/^(?:m|web)\./, 'www.');
    if (host !== 'facebook.com' && host !== 'www.facebook.com') return '';
    if (/\/(?:sharer|share|dialog|plugins|login)\b/i.test(url.pathname)) return '';
    url.protocol = 'https:';
    url.hostname = 'www.facebook.com';
    url.hash = '';
    if (url.pathname.toLowerCase() === '/profile.php') {
      const id = url.searchParams.get('id');
      url.search = id ? `?id=${encodeURIComponent(id)}` : '';
    } else {
      url.search = '';
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
        redirect: 'follow',
        headers: {
          'User-Agent': 'Mozilla/5.0 (compatible; taiwan-election-map/1.0)',
          'Accept-Language': 'zh-TW,zh;q=0.9,en;q=0.7',
          Accept: 'text/html,application/xhtml+xml',
        },
        signal: AbortSignal.timeout(25000),
      });
      if (!response.ok) throw new Error(`HTTP ${response.status}`);
      return await response.text();
    } catch (error) {
      lastError = error;
      if (attempt < attempts) await sleep(attempt * 800);
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
  const $ = load(html);
  const members = [];
  $('a[href*="Councilor_Content.aspx"]').each((_, element) => {
    const link = $(element);
    const group = link.closest('.area-customize.icons-g2');
    const districtLabel = cleanText(group.find('.dropdown-menu .flip').first().text()) ||
      cleanText(group.find('> .in > .hd a').first().attr('title'));
    const district = districtNumber(districtLabel);
    const name = cleanText(link.attr('title')) || cleanText(link.find('.caption span').text());
    const href = link.attr('href');
    const photoSource = link.find('.img img').first().attr('src') || '';
    if (!district || !name || !href || !photoSource) return;
    members.push({
      district,
      name,
      detailUrl: new URL(href, BASE_URL).href,
      photoUrl: new URL(photoSource, BASE_URL).href,
    });
  });
  return members;
}

function parsePersonalWebsite(html) {
  const $ = load(html);
  let website = '';
  $('tr').each((_, row) => {
    if (website || !/個人網站/.test(cleanText($(row).find('th').text()))) return;
    const href = $(row).find('a[href]').first().attr('href');
    if (href) {
      const url = new URL(href, BASE_URL);
      // Many legacy profile links still say http even though those hosts now only
      // answer on TLS. Upgrade official councilor subdomains before fetching.
      if (url.protocol === 'http:' && /\.tcc\.gov\.tw$/i.test(url.hostname)) url.protocol = 'https:';
      website = url.href;
    }
  });
  return website;
}

function extractFacebook(html) {
  const $ = load(html);
  const candidates = [];
  $('a[href]').each((_, element) => {
    const fb = canonicalFacebook($(element).attr('href'));
    if (fb) candidates.push(fb);
  });
  $('iframe[src*="facebook.com/plugins/"]').each((_, element) => {
    try {
      const plugin = new URL($(element).attr('src'));
      const fb = canonicalFacebook(plugin.searchParams.get('href'));
      if (fb) candidates.push(fb);
    } catch {}
  });
  return [...new Set(candidates)][0] || '';
}

const [listHtml, overrides] = await Promise.all([
  fetchText(LIST_URL),
  fetch(`${API_URL}${API_URL.includes('?') ? '&' : '?'}v=${crypto.randomUUID()}`, { cache: 'no-store' })
    .then(async (response) => {
      if (!response.ok) throw new Error(`overrides API returned ${response.status}`);
      return response.json();
    }),
]);

const roster = parseRoster(listHtml);
if (roster.length < 50) throw new Error(`安全中止：臺北市議會名單只解析到 ${roster.length} 位`);
if (new Set(roster.map((member) => normalizeName(member.name))).size !== roster.length) {
  throw new Error('安全中止：臺北市議會名單出現重複姓名');
}

let completed = 0;
const official = await mapLimit(roster, concurrency, async (member) => {
  const row = { ...member, personalWebsite: '', facebook: '', error: '' };
  try {
    row.personalWebsite = parsePersonalWebsite(await fetchText(member.detailUrl));
    if (row.personalWebsite) row.facebook = extractFacebook(await fetchText(row.personalWebsite));
  } catch (error) {
    row.error = error?.message || String(error);
  }
  completed += 1;
  console.log(`[${completed}/${roster.length}] ${row.name}: ${row.personalWebsite ? '個人網站' : '無個人網站'} / ${row.facebook ? 'Facebook' : '無 Facebook'}`);
  return row;
});

const document = overrides[COUNTY_CODE];
if (!document?.councilors) throw new Error(`安全中止：正式後台沒有臺北市 ${COUNTY_CODE} 議員資料`);

let matched = 0;
let photosAdded = 0;
let photosPreserved = 0;
let facebookAdded = 0;
const unmatched = [];
const conflicts = [];
const changes = [];

for (const member of official) {
  const block = document.councilors.find((item) => String(item.district) === member.district);
  const matches = (block?.candidates || []).filter(
    (candidate) => normalizeName(candidate.name) === normalizeName(member.name),
  );
  if (matches.length === 0) {
    unmatched.push({ district: member.district, name: member.name });
    continue;
  }
  if (matches.length !== 1) {
    throw new Error(`安全中止：第 ${member.district} 選區 ${member.name} 命中 ${matches.length} 筆後台資料`);
  }
  matched += 1;
  const candidate = matches[0];
  const before = { photoUrl: cleanText(candidate.photoUrl), facebook: cleanText(candidate.facebook) };
  if (!before.photoUrl && member.photoUrl) {
    candidate.photoUrl = member.photoUrl;
    photosAdded += 1;
  } else if (before.photoUrl) {
    photosPreserved += 1;
  }
  if (!before.facebook && member.facebook) {
    candidate.facebook = member.facebook;
    facebookAdded += 1;
  } else if (before.facebook && member.facebook && canonicalFacebook(before.facebook) !== member.facebook) {
    conflicts.push({ name: member.name, existing: before.facebook, official: member.facebook });
  }
  const after = { photoUrl: cleanText(candidate.photoUrl), facebook: cleanText(candidate.facebook) };
  if (before.photoUrl !== after.photoUrl || before.facebook !== after.facebook) {
    changes.push({ district: member.district, name: member.name, before, after });
  }
}

if (matched < 45) throw new Error(`安全中止：53 位現任議員只命中 ${matched} 位後台資料`);

document.updatedAt = new Date().toISOString();
document.updatedBy = 'tcc-official-sync';
const report = {
  generatedAt: document.updatedAt,
  source: LIST_URL,
  officialCount: official.length,
  matched,
  unmatched,
  officialPhotos: official.filter((member) => member.photoUrl).length,
  personalWebsites: official.filter((member) => member.personalWebsite).length,
  officialFacebook: official.filter((member) => member.facebook).length,
  photosAdded,
  photosPreserved,
  facebookAdded,
  conflicts,
  errors: official.filter((member) => member.error).map(({ name, detailUrl, error }) => ({ name, detailUrl, error })),
  changes,
  councilors: official,
};

await Promise.all([
  writeFile(path.join(root, 'data', 'tcc_councilors.json'), `${JSON.stringify(report, null, 2)}\n`),
  writeFile(path.join(root, 'overrides_deploy.json'), `${JSON.stringify(overrides)}\n`),
]);

console.log(JSON.stringify({
  officialCount: report.officialCount,
  matched,
  unmatched: unmatched.length,
  officialPhotos: report.officialPhotos,
  personalWebsites: report.personalWebsites,
  officialFacebook: report.officialFacebook,
  photosAdded,
  photosPreserved,
  facebookAdded,
  conflicts: conflicts.length,
  errors: report.errors.length,
}, null, 2));
