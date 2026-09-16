import { readFile, writeFile } from 'node:fs/promises';
import { load } from 'cheerio';

const BASE_URL = 'https://www.ntp.gov.tw';
const LIST_URL = `${BASE_URL}/councilor-info.php?program=37`;
const COUNTY_DATA_PATH = 'data/counties.json';
const OUTPUT_PATH = 'data/ntp_councilors.json';
const REQUEST_TIMEOUT_MS = 30000;
const MAX_RETRIES = 3;

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

function cleanText(value) {
  return String(value || '').replace(/[\s\u3000]+/g, ' ').trim();
}

function normalizeName(value) {
  return cleanText(value)
    .replace(/^(?:新北市議會|新北市|議員)\s*/u, '')
    .replace(/\s*(?:議員|委員|Councilor).*$/iu, '')
    .replace(/[\s\u3000]/g, '')
    .trim();
}

function plausibleName(value) {
  const name = normalizeName(value);
  if (!name || name.length < 2 || name.length > 40) return '';
  if (/新北市議會|議員介紹|議員資訊|首頁|網站連結|服務處|電話|傳真|信箱|facebook/i.test(name)) return '';
  if (!/[\u3400-\u9fff]/u.test(name)) return '';
  return name;
}

async function fetchHtml(url) {
  let lastError;
  for (let attempt = 1; attempt <= MAX_RETRIES; attempt += 1) {
    try {
      const response = await fetch(url, {
        signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
        redirect: 'follow',
        headers: {
          'User-Agent': 'Mozilla/5.0 (compatible; taiwan-election-map/1.0; +https://github.com/twoheart1222/taiwan-election-map)',
          'Accept-Language': 'zh-TW,zh;q=0.9,en;q=0.7',
          Accept: 'text/html,application/xhtml+xml',
          Referer: BASE_URL + '/',
        },
      });
      if (!response.ok) throw new Error(`Request failed (${response.status}): ${url}`);
      return await response.text();
    } catch (error) {
      lastError = error;
      if (attempt < MAX_RETRIES) await sleep(1200 * attempt);
    }
  }
  throw lastError;
}

function canonicalFacebook(value) {
  if (!value) return '';
  try {
    const url = new URL(value, BASE_URL);
    const host = url.hostname.toLowerCase().replace(/^m\./, 'www.');
    if (host !== 'facebook.com' && host !== 'www.facebook.com') return '';
    if (/\/(?:sharer|share|dialog|plugins|login)\b/i.test(url.pathname)) return '';
    url.protocol = 'https:';
    url.hostname = 'www.facebook.com';
    url.search = '';
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

function extractListName($, link) {
  const candidates = [
    link.attr('title'),
    link.attr('aria-label'),
    link.find('img').first().attr('alt'),
    link.find('img').first().attr('title'),
    link.text(),
  ];

  const container = link.closest('li, article, .item, .member, .councilor, .card, div');
  if (container.length) candidates.push(container.text());

  for (const raw of candidates) {
    const text = cleanText(raw);
    if (!text) continue;
    const direct = plausibleName(text);
    if (direct && direct.length <= 20) return direct;
    const match = text.match(/(?:議員[：:\s]*)?([\u3400-\u9fff][\u3400-\u9fff·．・‧A-Za-z\s]{1,28})(?=\s*(?:議員|$))/u);
    const fromMatch = plausibleName(match?.[1]);
    if (fromMatch) return fromMatch;
  }
  return '';
}

function parseList(html) {
  const $ = load(html);
  const byUrl = new Map();

  $('a[href]').each((_, element) => {
    const link = $(element);
    const href = link.attr('href') || '';
    if (!/councilor-detail/i.test(href)) return;
    let detailUrl;
    try {
      detailUrl = new URL(href, BASE_URL).href;
    } catch {
      return;
    }
    if (!/program=37/i.test(detailUrl)) return;
    byUrl.set(detailUrl, {
      detailUrl,
      listName: extractListName($, link),
    });
  });

  return [...byUrl.values()];
}

function extractDetailName($, fallback = '') {
  const candidates = [];
  $('h1, h2, h3, .councilor-name, .member-name, [class*="memberName"], [class*="councilorName"]').each((_, el) => {
    candidates.push($(el).text());
  });
  candidates.push($('meta[property="og:title"]').attr('content'));
  candidates.push($('title').text());
  candidates.push(fallback);

  for (const raw of candidates) {
    const text = cleanText(raw);
    if (!text) continue;

    const labelled = text.match(/(?:議員|姓名|Name)\s*[：:]?\s*([\u3400-\u9fff][\u3400-\u9fff·．・‧A-Za-z\s]{1,28})/iu);
    const labelledName = plausibleName(labelled?.[1]);
    if (labelledName) return labelledName;

    const parts = text.split(/[|｜\-–—]/).map((x) => plausibleName(x)).filter(Boolean);
    const compact = parts.find((x) => x.length <= 20);
    if (compact) return compact;

    const direct = plausibleName(text);
    if (direct && direct.length <= 20) return direct;
  }
  return plausibleName(fallback);
}

function parseDetail(item, html) {
  const $ = load(html);
  const name = extractDetailName($, item.listName);
  let facebook = '';

  // Prefer the official page's “網站連結 / FB” area when present.
  $('a[href]').each((_, element) => {
    if (facebook) return;
    const a = $(element);
    const href = a.attr('href') || '';
    const fb = canonicalFacebook(href);
    if (!fb) return;
    const context = cleanText(a.closest('li, tr, dl, p, div').text());
    const label = cleanText(a.text());
    if (/網站連結|facebook|\bfb\b/i.test(`${context} ${label}`)) facebook = fb;
  });

  if (!facebook) {
    $('a[href*="facebook.com"], a[href*="facebook.com/"]').each((_, element) => {
      if (facebook) return;
      facebook = canonicalFacebook($(element).attr('href'));
    });
  }

  if (!facebook) {
    $('iframe[src]').each((_, element) => {
      if (facebook) return;
      facebook = facebookFromIframe($(element).attr('src'));
    });
  }

  return { name, facebook, detailUrl: item.detailUrl };
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

function findNewTaipeiProperties(topo) {
  const objects = topo?.objects || {};
  const geometries = [];
  for (const object of Object.values(objects)) {
    if (Array.isArray(object?.geometries)) geometries.push(...object.geometries);
    else if (object) geometries.push(object);
  }
  return geometries.find((g) => {
    const p = g?.properties || {};
    return String(p.id || '') === '65000' || cleanText(p.name) === '新北市';
  })?.properties || null;
}

function councilorCandidates(properties) {
  const raw = properties?.councilors;
  const blocks = Array.isArray(raw?.blocks) ? raw.blocks : Array.isArray(raw) ? raw : [];
  const rows = [];
  for (const block of blocks) {
    for (const candidate of block?.candidates || []) rows.push({ block, candidate });
  }
  return rows;
}

const listHtml = await fetchHtml(LIST_URL);
const listed = parseList(listHtml);
if (listed.length < 40) {
  throw new Error(`NTP list parser found only ${listed.length} councilor detail links; aborting.`);
}

const details = await mapLimit(listed, 2, async (item) => parseDetail(item, await fetchHtml(item.detailUrl)));
const valid = details.filter((item) => item.name);
if (valid.length < 40) {
  throw new Error(`NTP detail parser resolved only ${valid.length} names from ${details.length} pages; aborting.`);
}

const sourceByName = new Map();
for (const item of valid) {
  const key = normalizeName(item.name);
  if (key && !sourceByName.has(key)) sourceByName.set(key, item);
}

const topo = JSON.parse(await readFile(COUNTY_DATA_PATH, 'utf8'));
const ntp = findNewTaipeiProperties(topo);
if (!ntp) throw new Error('Could not find 新北市 (65000) in data/counties.json');

const roster = councilorCandidates(ntp);
if (roster.length < 30) {
  throw new Error(`Website New Taipei roster has only ${roster.length} candidates; aborting to avoid corrupt merge.`);
}

let matched = 0;
let updatedFacebook = 0;
const matchedSource = new Set();
const websiteMissingInSource = [];
for (const { candidate } of roster) {
  const key = normalizeName(candidate?.name);
  if (!key) continue;
  const source = sourceByName.get(key);
  if (!source) {
    websiteMissingInSource.push(candidate.name);
    continue;
  }
  matched += 1;
  matchedSource.add(key);
  if (source.facebook && candidate.facebook !== source.facebook) {
    candidate.facebook = source.facebook;
    updatedFacebook += 1;
  }
}

// Critical rule: the website roster is authoritative. Official-site people not already
// present in the website are intentionally ignored and are NEVER appended.
const sourceOnlyIgnored = valid
  .filter((item) => !matchedSource.has(normalizeName(item.name)))
  .map((item) => item.name);

await writeFile(OUTPUT_PATH, `${JSON.stringify(valid.sort((a, b) => a.name.localeCompare(b.name, 'zh-Hant')), null, 2)}\n`, 'utf8');
await writeFile(COUNTY_DATA_PATH, JSON.stringify(topo), 'utf8');

console.log(JSON.stringify({
  officialDetailPages: listed.length,
  officialResolvedNames: valid.length,
  officialFacebookLinks: valid.filter((x) => x.facebook).length,
  websiteRoster: roster.length,
  matchedWebsiteNames: matched,
  updatedFacebook,
  sourceOnlyIgnored,
  websiteMissingInSource,
  rule: 'match-existing-only; no councilor is ever added to the website roster',
}, null, 2));
