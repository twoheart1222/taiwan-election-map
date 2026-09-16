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

async function fetchHtml(url) {
  let lastError;
  for (let attempt = 1; attempt <= MAX_RETRIES; attempt += 1) {
    try {
      const response = await fetch(url, {
        signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
        redirect: 'follow',
        headers: {
          'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/120 Safari/537.36',
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

function findNewTaipeiProperties(topo) {
  const geometries = [];
  for (const object of Object.values(topo?.objects || {})) {
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

function internalUrl(href) {
  if (!href || /^(?:#|javascript:|mailto:|tel:)/i.test(href)) return '';
  try {
    const u = new URL(href, BASE_URL);
    if (u.hostname !== 'www.ntp.gov.tw' && u.hostname !== 'ntp.gov.tw') return '';
    if (/\.(?:jpg|jpeg|png|gif|webp|svg|pdf|css|js|zip)$/i.test(u.pathname)) return '';
    return u.href;
  } catch {
    return '';
  }
}

function collectLinksNearName($, name) {
  const result = new Set();
  const target = normalizeName(name);

  $('*').each((_, el) => {
    const node = $(el);
    const ownText = cleanText(node.clone().children().remove().end().text());
    if (!ownText || !normalizeName(ownText).includes(target)) return;

    let cur = node;
    for (let depth = 0; depth < 7 && cur.length; depth += 1) {
      cur.find('a[href]').each((__, a) => {
        const url = internalUrl($(a).attr('href'));
        if (url) result.add(url);
      });
      cur = cur.parent();
    }
  });

  return [...result];
}

function findFacebookNearName($, name) {
  const target = normalizeName(name);
  let found = '';

  $('*').each((_, el) => {
    if (found) return;
    const node = $(el);
    const ownText = cleanText(node.clone().children().remove().end().text());
    if (!ownText || !normalizeName(ownText).includes(target)) return;

    let cur = node;
    for (let depth = 0; depth < 7 && cur.length && !found; depth += 1) {
      cur.find('a[href]').each((__, a) => {
        if (found) return;
        const fb = canonicalFacebook($(a).attr('href'));
        if (fb) found = fb;
      });
      cur = cur.parent();
    }
  });

  return found;
}

function extractFacebookFromPage(html) {
  const $ = load(html);
  let fb = '';

  $('a[href]').each((_, a) => {
    if (fb) return;
    const candidate = canonicalFacebook($(a).attr('href'));
    if (candidate) fb = candidate;
  });

  if (!fb) {
    $('iframe[src]').each((_, iframe) => {
      if (fb) return;
      try {
        const u = new URL($(iframe).attr('src') || '', BASE_URL);
        if (!u.hostname.includes('facebook.com')) return;
        const href = u.searchParams.get('href');
        fb = canonicalFacebook(href ? decodeURIComponent(href) : '');
      } catch {}
    });
  }

  return fb;
}

function pageLooksLikePerson(html, name) {
  const $ = load(html);
  const target = normalizeName(name);
  const highSignal = [
    $('title').text(),
    $('meta[property="og:title"]').attr('content') || '',
    $('h1').text(),
    $('h2').text(),
    $('h3').text(),
    $('[class*="name"]').text(),
  ].map(cleanText).join(' ');
  return normalizeName(highSignal).includes(target);
}

const topo = JSON.parse(await readFile(COUNTY_DATA_PATH, 'utf8'));
const ntp = findNewTaipeiProperties(topo);
if (!ntp) throw new Error('Could not find 新北市 (65000) in data/counties.json');

const roster = councilorCandidates(ntp);
if (!roster.length) throw new Error('No existing New Taipei councilors found in data/counties.json');

const listHtml = await fetchHtml(LIST_URL);
const $ = load(listHtml);

const rawInternalLinks = new Set();
$('a[href]').each((_, a) => {
  const url = internalUrl($(a).attr('href'));
  if (!url) return;
  if (url === LIST_URL) return;
  rawInternalLinks.add(url);
});

const results = [];
let updatedFacebook = 0;

for (const { candidate } of roster) {
  const name = candidate?.name;
  if (!name) continue;

  let facebook = findFacebookNearName($, name);
  let matchedUrl = '';

  if (!facebook) {
    const nearLinks = collectLinksNearName($, name);
    const genericProfileLinks = [...rawInternalLinks].filter((url) => {
      const u = new URL(url);
      return /council|member|represent|people|intro|info/i.test(u.pathname + u.search) ||
             /(?:id|no|sn|member|councilor)=/i.test(u.search);
    });
    const candidates = [...new Set([...nearLinks, ...genericProfileLinks])].slice(0, 120);

    for (const url of candidates) {
      try {
        const html = await fetchHtml(url);
        if (!pageLooksLikePerson(html, name) && !nearLinks.includes(url)) continue;
        const fb = extractFacebookFromPage(html);
        if (fb) {
          facebook = fb;
          matchedUrl = url;
          break;
        }
      } catch {}
    }
  }

  if (facebook && candidate.facebook !== facebook) {
    candidate.facebook = facebook;
    updatedFacebook += 1;
  }

  results.push({
    name,
    facebook: facebook || candidate.facebook || '',
    matchedUrl,
    status: facebook ? 'matched' : 'not-found',
  });
}

await writeFile(OUTPUT_PATH, `${JSON.stringify(results, null, 2)}\n`, 'utf8');
await writeFile(COUNTY_DATA_PATH, JSON.stringify(topo), 'utf8');

console.log(JSON.stringify({
  websiteRoster: roster.length,
  updatedFacebook,
  matchedFacebook: results.filter((x) => x.facebook).length,
  notFound: results.filter((x) => !x.facebook).map((x) => x.name),
  discoveredInternalLinks: rawInternalLinks.size,
  rule: 'website roster is authoritative; update existing names only; never add people',
}, null, 2));
