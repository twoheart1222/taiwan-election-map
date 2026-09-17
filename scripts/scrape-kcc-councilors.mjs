import { mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { load } from 'cheerio';

const BASE_URL = 'https://www.kcc.gov.tw';
const LIST_URL = `${BASE_URL}/Member_List1.aspx?n=39&sms=9028`;
const outputPath = path.resolve(process.argv[2] || 'data/kcc_councilors.json');
const includeInactive = process.argv.includes('--include-inactive');
const REQUEST_TIMEOUT_MS = 25000;
const MAX_RETRIES = 3;

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

function cleanText(value) {
  return String(value || '').replace(/[\s\u3000]+/g, ' ').trim();
}

function normalizeName(value) {
  return cleanText(value)
    .replace(/第\s*\d+\s*選區.*$/u, '')
    .replace(/\((?:轉任立委|解職)\)/g, '')
    .trim();
}

function memberStatus(value) {
  const text = cleanText(value);
  if (text.includes('轉任立委')) return 'transferred';
  if (text.includes('解職')) return 'removed';
  return 'active';
}

async function fetchHtml(url) {
  let lastError;
  for (let attempt = 1; attempt <= MAX_RETRIES; attempt += 1) {
    try {
      const response = await fetch(url, {
        signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
        headers: {
          'User-Agent': 'Mozilla/5.0 (compatible; taiwan-election-map/1.0; +https://github.com/twoheart1222/taiwan-election-map)',
          'Accept-Language': 'zh-TW,zh;q=0.9,en;q=0.7',
          Accept: 'text/html,application/xhtml+xml',
        },
      });
      if (!response.ok) throw new Error(`Request failed (${response.status}): ${url}`);
      return await response.text();
    } catch (error) {
      lastError = error;
      if (attempt < MAX_RETRIES) await sleep(1000 * attempt);
    }
  }
  throw lastError;
}

function parseList(html) {
  const $ = load(html);
  const rows = [];

  $('a[href*="MemberInfo_New.aspx"]').each((_, element) => {
    const link = $(element);
    const href = link.attr('href');
    const rawText = cleanText(link.text());
    if (!href || !rawText) return;

    const district = Number(rawText.match(/第\s*(\d+)\s*選區/u)?.[1]);
    const name = normalizeName(rawText);
    if (!name || !/第\s*\d+\s*選區/u.test(rawText)) return;

    rows.push({
      name,
      district: Number.isInteger(district) ? district : null,
      status: memberStatus(rawText),
      detailUrl: new URL(href, BASE_URL).href,
    });
  });

  return rows;
}

async function fetchMemberList() {
  const members = new Map();

  const largePageUrl = new URL(LIST_URL);
  largePageUrl.searchParams.set('PageSize', '100');
  for (const member of parseList(await fetchHtml(largePageUrl.href))) {
    members.set(member.detailUrl, member);
  }

  if (members.size < 50) {
    let unchangedPages = 0;
    for (let page = 1; page <= 10 && unchangedPages < 2; page += 1) {
      const url = new URL(LIST_URL);
      url.searchParams.set('page', String(page));
      const before = members.size;
      for (const member of parseList(await fetchHtml(url.href))) {
        members.set(member.detailUrl, member);
      }
      unchangedPages = members.size === before ? unchangedPages + 1 : 0;
    }
  }

  return [...members.values()];
}

function canonicalFacebook(value) {
  if (!value) return '';
  try {
    const url = new URL(value, BASE_URL);
    if (!/(^|\.)facebook\.com$/i.test(url.hostname)) return '';
    if (/\/(?:sharer|share|dialog|plugins)\b/i.test(url.pathname)) return '';
    url.protocol = 'https:';
    url.hostname = 'www.facebook.com';
    const profileId = /\/profile\.php$/i.test(url.pathname) ? url.searchParams.get('id') : '';
    url.search = '';
    if (profileId) url.searchParams.set('id', profileId);
    url.hash = '';
    return url.href;
  } catch {
    return '';
  }
}

function facebookFromIframe(src) {
  if (!src) return '';
  try {
    const url = new URL(src, BASE_URL);
    if (!url.hostname.includes('facebook.com')) return '';
    const href = url.searchParams.get('href');
    return canonicalFacebook(href ? decodeURIComponent(href) : '');
  } catch {
    return '';
  }
}

function parseDetail(member, html) {
  const $ = load(html);
  let photoUrl = '';
  let facebook = '';

  $('img').each((_, element) => {
    if (photoUrl) return;
    const image = $(element);
    const src = image.attr('src') || image.attr('data-src') || '';
    const alt = cleanText(image.attr('alt'));
    if (!src) return;
    if (alt === member.name || /\/Upload\/member\//i.test(src)) {
      photoUrl = new URL(src, BASE_URL).href;
    }
  });

  $('iframe[src]').each((_, element) => {
    if (facebook) return;
    facebook = facebookFromIframe($(element).attr('src'));
  });

  if (!facebook) {
    $('a[href*="facebook.com"]').each((_, element) => {
      if (facebook) return;
      facebook = canonicalFacebook($(element).attr('href'));
    });
  }

  const bodyText = cleanText($('body').text());
  const party = bodyText.match(/所屬政黨[：:]\s*([^\s]+)/u)?.[1] || '';

  return {
    ...member,
    party,
    photoUrl,
    facebook,
  };
}

async function mapLimit(items, limit, callback) {
  const results = new Array(items.length);
  let cursor = 0;
  async function worker() {
    while (cursor < items.length) {
      const index = cursor++;
      results[index] = await callback(items[index], index);
    }
  }
  await Promise.all(Array.from({ length: Math.min(limit, items.length) }, worker));
  return results;
}

function isOfficialKccImage(url) {
  try {
    const parsed = new URL(url);
    return /(^|\.)kcc\.gov\.tw$/i.test(parsed.hostname) && /\/Upload\/member\//i.test(parsed.pathname);
  } catch {
    return false;
  }
}

const listed = await fetchMemberList();
if (listed.length < 50) {
  throw new Error(`KCC list parser returned only ${listed.length} members; aborting to avoid publishing incomplete data.`);
}

const selected = includeInactive ? listed : listed.filter((member) => member.status === 'active');
const details = await mapLimit(selected, 2, async (member) => {
  const html = await fetchHtml(member.detailUrl);
  return parseDetail(member, html);
});

const uniqueNames = new Set(details.map((member) => member.name));
if (uniqueNames.size !== details.length) {
  throw new Error(`Duplicate councilor names detected: ${details.length - uniqueNames.size}`);
}

const missingPhotos = details.filter((member) => !member.photoUrl);
if (missingPhotos.length) {
  throw new Error(`Missing photoUrl for: ${missingPhotos.map((member) => member.name).join(', ')}`);
}

const invalidPhotos = details.filter((member) => !isOfficialKccImage(member.photoUrl));
if (invalidPhotos.length) {
  throw new Error(`Non-KCC photo URLs: ${invalidPhotos.map((member) => member.name).join(', ')}`);
}

const invalidFacebook = details.filter((member) => member.facebook && !/^https:\/\/(www\.)?facebook\.com\//i.test(member.facebook));
if (invalidFacebook.length) {
  throw new Error(`Invalid Facebook URLs: ${invalidFacebook.map((member) => member.name).join(', ')}`);
}

const facebookPresent = details.filter((member) => member.facebook).length;
const output = details.sort((a, b) => (a.district ?? 999) - (b.district ?? 999) || a.name.localeCompare(b.name, 'zh-Hant'));
await mkdir(path.dirname(outputPath), { recursive: true });
await writeFile(outputPath, `${JSON.stringify(output, null, 2)}\n`, 'utf8');

console.log(JSON.stringify({
  outputPath,
  listedMembers: listed.length,
  exportedMembers: output.length,
  activeOnly: !includeInactive,
  officialPhotos: output.length,
  facebookLinks: facebookPresent,
  missingFacebook: output.length - facebookPresent,
}, null, 2));
