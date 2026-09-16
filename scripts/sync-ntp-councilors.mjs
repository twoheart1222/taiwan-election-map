import { readFile, writeFile } from 'node:fs/promises';
import { load } from 'cheerio';

const BASE_URL = 'https://www.ntp.gov.tw';
const LIST_URL = `${BASE_URL}/councilor-info.php?program=37`;
const COUNTY_DATA_PATH = 'data/counties.json';
const OUTPUT_PATH = 'data/ntp_councilors.json';
const REQUEST_TIMEOUT_MS = 30000;

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
  console.log(`抓取：${url}`);
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
  return response.text();
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
    for (const candidate of block?.candidates || []) rows.push(candidate);
  }
  return rows;
}

function findFacebookInCandidateBlock($, name) {
  const target = normalizeName(name);
  let result = '';

  const matching = $('*').filter((_, el) => {
    const node = $(el);
    const own = cleanText(node.clone().children().remove().end().text());
    return own && normalizeName(own) === target;
  });

  matching.each((_, el) => {
    if (result) return;
    let node = $(el);

    for (let depth = 0; depth < 8 && node.length; depth += 1) {
      const text = cleanText(node.text());
      if (text.length > 1800) break;

      node.find('a[href]').each((__, a) => {
        if (result) return;
        const fb = canonicalFacebook($(a).attr('href'));
        if (fb) result = fb;
      });

      node = node.parent();
    }
  });

  return result;
}

const topo = JSON.parse(await readFile(COUNTY_DATA_PATH, 'utf8'));
const ntp = findNewTaipeiProperties(topo);
if (!ntp) throw new Error('找不到 data/counties.json 內的新北市資料');

const roster = councilorCandidates(ntp);
if (!roster.length) throw new Error('你的網站目前沒有新北市議員名單');

console.log(`網站既有新北市議員：${roster.length} 位`);
console.log('只會更新現有姓名，不會新增任何人。');
console.log('開始抓新北市議會名單頁…');

const html = await fetchHtml(LIST_URL);
const $ = load(html);

console.log(`頁面抓取完成，HTML 大小：${html.length} bytes`);
console.log('開始依你網站既有姓名比對 FB…');

const results = [];
let updated = 0;
let found = 0;

for (let i = 0; i < roster.length; i += 1) {
  const candidate = roster[i];
  const name = candidate?.name || '';
  if (!name) continue;

  const fb = findFacebookInCandidateBlock($, name);

  if (fb) {
    found += 1;
    if (candidate.facebook !== fb) {
      candidate.facebook = fb;
      updated += 1;
    }
    console.log(`[${i + 1}/${roster.length}] ${name} → 找到 FB`);
  } else {
    console.log(`[${i + 1}/${roster.length}] ${name} → 此頁未找到 FB`);
  }

  results.push({
    name,
    facebook: fb || candidate.facebook || '',
    foundOnOfficialPage: Boolean(fb),
  });
}

await writeFile(OUTPUT_PATH, `${JSON.stringify(results, null, 2)}\n`, 'utf8');
await writeFile(COUNTY_DATA_PATH, JSON.stringify(topo), 'utf8');

console.log('');
console.log('完成。');
console.log(JSON.stringify({
  websiteRoster: roster.length,
  officialPageMatchedFacebook: found,
  updatedFacebook: updated,
  notFoundOnOfficialPage: results.filter((x) => !x.foundOnOfficialPage).map((x) => x.name),
  rule: 'website roster is authoritative; existing names only; never add people',
}, null, 2));
