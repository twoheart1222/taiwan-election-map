import { access, readFile, writeFile } from 'node:fs/promises';
import { load } from 'cheerio';

const BASE_URL = 'https://www.ntp.gov.tw';
const LIST_URL = `${BASE_URL}/councilor-info.php?program=37`;
const LOCAL_SOURCE_PATH = 'data/ntp_source.html';
const COUNTY_DATA_PATH = 'data/counties.json';
const OUTPUT_PATH = 'data/ntp_councilors.json';
const REQUEST_TIMEOUT_MS = 20000;
const MAX_RETRIES = 2;
const DETAIL_CONCURRENCY = 4;

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

function cleanText(value) {
  return String(value || '').replace(/[\s\u3000]+/g, ' ').trim();
}

function normalizeName(value) {
  return cleanText(value)
    .replace(/^(?:新北市議會|新北市|議員)\s*/u, '')
    .replace(/\s*(?:議員|委員|Councilor).*$/iu, '')
    .replace(/[\s\u3000．.・·‧]/g, '')
    .trim();
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

async function fileExists(path) {
  try {
    await access(path);
    return true;
  } catch {
    return false;
  }
}

async function fetchBytes(url) {
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
      return {
        bytes: new Uint8Array(await response.arrayBuffer()),
        contentType: response.headers.get('content-type') || '',
      };
    } catch (error) {
      lastError = error;
      if (attempt < MAX_RETRIES) await sleep(800 * attempt);
    }
  }
  throw lastError;
}

function decodeCandidate(bytes, encoding) {
  try {
    return new TextDecoder(encoding, { fatal: false }).decode(bytes);
  } catch {
    return '';
  }
}

function parseCouncilorList(html) {
  const $ = load(html);
  const rows = [];
  const seen = new Set();

  $('a[href]').each((_, el) => {
    const a = $(el);
    const href = cleanText(a.attr('href'));
    if (!/councilor-detail(?:\?|$)/i.test(href)) return;

    let detailUrl = '';
    try {
      detailUrl = new URL(href, BASE_URL).href;
    } catch {
      return;
    }

    const pName = cleanText(a.find('p').first().text());
    const alt = cleanText(a.find('img').first().attr('alt'));
    const altName = alt
      .replace(/^成員\s*/u, '')
      .replace(/議員.*$/u, '')
      .trim();
    const name = pName || altName;
    const key = normalizeName(name);
    if (!key || seen.has(key)) return;

    seen.add(key);
    rows.push({ name, key, detailUrl });
  });

  return rows;
}

function scoreHtml(html, roster, encoding = 'local-file') {
  const websiteNames = new Set(roster.map((x) => normalizeName(x?.name)).filter(Boolean));
  const list = parseCouncilorList(html);
  const matched = list.filter((x) => websiteNames.has(x.key)).length;
  const replacementChars = (html.match(/�/g) || []).length;
  return { encoding, html, list, matched, replacementChars };
}

function chooseListDecoding(bytes, roster, contentType) {
  const encodings = ['utf-8', 'big5', 'gb18030'];
  const headerMatch = contentType.match(/charset\s*=\s*([^;\s]+)/i);
  if (headerMatch) encodings.unshift(headerMatch[1].replace(/["']/g, '').toLowerCase());

  return [...new Set(encodings)].map((encoding) => {
    const html = decodeCandidate(bytes, encoding);
    return scoreHtml(html, roster, encoding);
  }).sort((a, b) => b.matched - a.matched || b.list.length - a.list.length || a.replacementChars - b.replacementChars);
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
    return url.href.replace(/\/$/, '');
  } catch {
    return '';
  }
}

function extractFacebook(html) {
  const $ = load(html);
  let preferred = '';
  let fallback = '';

  $('a[href]').each((_, el) => {
    const a = $(el);
    const fb = canonicalFacebook(a.attr('href'));
    if (!fb) return;

    if (!fallback) fallback = fb;
    const context = cleanText(a.closest('li, tr, td, dd, dt, dl, p, div').text());
    const label = cleanText(a.text());
    if (!preferred && /網站連結|facebook|\bfb\b/i.test(`${context} ${label}`)) preferred = fb;
  });

  return preferred || fallback;
}

async function fetchFacebook(detailUrl) {
  try {
    const { bytes, contentType } = await fetchBytes(detailUrl);
    const charset = contentType.match(/charset\s*=\s*([^;\s]+)/i)?.[1]?.replace(/["']/g, '') || 'utf-8';
    const html = decodeCandidate(bytes, charset) || decodeCandidate(bytes, 'utf-8');
    return extractFacebook(html);
  } catch (error) {
    return { error: error?.message || String(error) };
  }
}

async function mapLimit(items, limit, callback) {
  const results = new Array(items.length);
  let cursor = 0;
  async function worker() {
    while (true) {
      const index = cursor++;
      if (index >= items.length) return;
      results[index] = await callback(items[index], index);
    }
  }
  await Promise.all(Array.from({ length: Math.min(limit, items.length) }, worker));
  return results;
}

const topo = JSON.parse(await readFile(COUNTY_DATA_PATH, 'utf8'));
const ntp = findNewTaipeiProperties(topo);
if (!ntp) throw new Error('找不到 data/counties.json 內的新北市資料');

const roster = councilorCandidates(ntp);
if (!roster.length) throw new Error('你的網站目前沒有新北市議員名單');

console.log(`網站既有新北市議員：${roster.length} 位`);
console.log('安全模式：只產生預覽，不會修改 data/counties.json，也不會新增任何人。');

let best;
if (await fileExists(LOCAL_SOURCE_PATH)) {
  const localHtml = await readFile(LOCAL_SOURCE_PATH, 'utf8');
  best = scoreHtml(localHtml, roster, 'browser-saved-html');
  console.log(`使用瀏覽器另存的名單原始碼：${LOCAL_SOURCE_PATH}`);
  console.log(`官方名單 ${best.list.length} 人，與網站命中 ${best.matched} 人`);
} else {
  console.log(`找不到 ${LOCAL_SOURCE_PATH}，改用 Node 直接抓取：${LIST_URL}`);
  const { bytes, contentType } = await fetchBytes(LIST_URL);
  const scored = chooseListDecoding(bytes, roster, contentType);
  console.log('名單解析候選：');
  for (const row of scored) {
    console.log(`  ${row.encoding}: 官方名單 ${row.list.length} 人，與網站命中 ${row.matched} 人，� ${row.replacementChars}`);
  }
  best = scored[0];
  console.log(`採用編碼：${best.encoding}`);
}

if (best.list.length < 40 || best.matched < 30) {
  throw new Error(`安全中止：官方名單解析 ${best.list.length} 人、與網站僅命中 ${best.matched} 人。請在瀏覽器按 Ctrl+U → Ctrl+S，將原始碼存成 ${LOCAL_SOURCE_PATH} 後再執行。`);
}

const officialByName = new Map(best.list.map((x) => [x.key, x]));
const matchedRoster = roster
  .map((candidate) => ({ candidate, official: officialByName.get(normalizeName(candidate?.name)) || null }))
  .filter((x) => x.official);

console.log(`準備抓取 ${matchedRoster.length} 位「網站已有且官方名單也存在」的議員詳細頁…`);

let completed = 0;
const crawled = await mapLimit(matchedRoster, DETAIL_CONCURRENCY, async ({ candidate, official }) => {
  const result = await fetchFacebook(official.detailUrl);
  completed += 1;

  const facebook = typeof result === 'string' ? result : '';
  const error = typeof result === 'object' && result ? result.error || '' : '';
  console.log(`[${completed}/${matchedRoster.length}] ${candidate.name} → ${facebook ? '找到 FB' : error ? `抓取失敗：${error}` : '未找到 FB'}`);

  return {
    key: normalizeName(candidate.name),
    officialName: official.name,
    detailUrl: official.detailUrl,
    facebook,
    error,
  };
});

const crawledByName = new Map(crawled.map((x) => [x.key, x]));
const preview = roster.map((candidate) => {
  const key = normalizeName(candidate?.name);
  const source = crawledByName.get(key);
  return {
    name: candidate?.name || '',
    existingFacebook: candidate?.facebook || '',
    officialFacebook: source?.facebook || '',
    detailUrl: source?.detailUrl || '',
    matchedOfficialRoster: Boolean(source),
    safeToApply: Boolean(source?.facebook),
    error: source?.error || '',
  };
});

const officialFacebookHits = preview.filter((x) => x.officialFacebook).length;

await writeFile(OUTPUT_PATH, `${JSON.stringify({
  generatedAt: new Date().toISOString(),
  source: (await fileExists(LOCAL_SOURCE_PATH)) ? LOCAL_SOURCE_PATH : LIST_URL,
  encoding: best.encoding,
  websiteRoster: roster.length,
  officialRosterParsed: best.list.length,
  websiteOfficialNameMatches: matchedRoster.length,
  officialFacebookHits,
  mode: 'preview-only',
  rule: 'website roster is authoritative; update existing names only; never add people; data/counties.json is not modified',
  councilors: preview,
}, null, 2)}\n`, 'utf8');

console.log('');
console.log('預覽完成。');
console.log(`官方名單解析：${best.list.length} 人`);
console.log(`網站 ↔ 官方姓名命中：${matchedRoster.length}/${roster.length}`);
console.log(`官方 FB 找到：${officialFacebookHits} 個`);
console.log(`已輸出：${OUTPUT_PATH}`);
console.log('尚未修改 data/counties.json。');
