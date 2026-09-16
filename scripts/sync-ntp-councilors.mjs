import { access, readFile, writeFile } from 'node:fs/promises';
import { load } from 'cheerio';

const BASE_URL = 'https://www.ntp.gov.tw';
const LIST_URL = `${BASE_URL}/councilor-info.php?program=37`;
const COUNTY_DATA_PATH = 'data/counties.json';
const RAW_SOURCE_PATH = 'data/ntp_source_raw.html';
const WRAPPED_SOURCE_PATH = 'data/ntp_source.html';
const OUTPUT_PATH = 'data/ntp_councilors.json';
const REQUEST_TIMEOUT_MS = 30000;
const DETAIL_CONCURRENCY = 3;
const DETAIL_RETRIES = 3;

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

async function exists(path) {
  try {
    await access(path);
    return true;
  } catch {
    return false;
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

function unwrapChromeViewSource(html) {
  const $ = load(html);
  const cells = $('td.line-content');
  if (!cells.length) return html;
  const lines = [];
  cells.each((_, el) => lines.push($(el).text()));
  return lines.join('\n');
}

function parseCouncilorList(html) {
  const $ = load(html);
  const rows = [];
  const seen = new Set();

  $('a[href]').each((_, el) => {
    const a = $(el);
    const href = cleanText(a.attr('href'));
    if (!/councilor-detail(?:\?|$)/i.test(href)) return;

    let detailUrl;
    try {
      detailUrl = new URL(href.replace(/&amp;/g, '&'), BASE_URL).href;
    } catch {
      return;
    }

    const pName = cleanText(a.find('p').first().text());
    const alt = cleanText(a.find('img').first().attr('alt'));
    const altName = alt.replace(/^成員\s*/u, '').replace(/議員.*$/u, '').trim();
    const name = pName || altName;
    const key = normalizeName(name);
    if (!key || seen.has(key)) return;

    seen.add(key);
    rows.push({ name, key, detailUrl });
  });

  return rows;
}

async function loadOfficialListHtml() {
  if (await exists(RAW_SOURCE_PATH)) {
    return { html: await readFile(RAW_SOURCE_PATH, 'utf8'), source: RAW_SOURCE_PATH };
  }

  if (await exists(WRAPPED_SOURCE_PATH)) {
    const wrapped = await readFile(WRAPPED_SOURCE_PATH, 'utf8');
    return { html: unwrapChromeViewSource(wrapped), source: WRAPPED_SOURCE_PATH };
  }

  const response = await fetch(LIST_URL, {
    signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
    redirect: 'follow',
    headers: {
      'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/120 Safari/537.36',
      'Accept-Language': 'zh-TW,zh;q=0.9,en;q=0.7',
      Accept: 'text/html,application/xhtml+xml',
      Referer: BASE_URL + '/',
    },
  });
  if (!response.ok) throw new Error(`名單頁抓取失敗 HTTP ${response.status}`);
  return { html: await response.text(), source: LIST_URL };
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
  const candidates = [];

  $('a[href]').each((_, el) => {
    const a = $(el);
    const fb = canonicalFacebook(a.attr('href'));
    if (!fb) return;
    const context = cleanText(a.closest('li, tr, td, dd, dt, dl, p, div').text());
    const label = cleanText(a.text());
    const priority = /網站連結|facebook|\bfb\b/i.test(`${context} ${label}`) ? 2 : 1;
    candidates.push({ fb, priority });
  });

  candidates.sort((a, b) => b.priority - a.priority);
  return candidates[0]?.fb || '';
}

async function fetchDetailFacebook(detailUrl) {
  let lastError = '';

  for (let attempt = 1; attempt <= DETAIL_RETRIES; attempt += 1) {
    try {
      const response = await fetch(detailUrl, {
        signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
        redirect: 'follow',
        headers: {
          'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/120 Safari/537.36',
          'Accept-Language': 'zh-TW,zh;q=0.9,en;q=0.7',
          Accept: 'text/html,application/xhtml+xml',
          Referer: LIST_URL,
        },
      });

      if (!response.ok) {
        lastError = `HTTP ${response.status}`;
      } else {
        const html = await response.text();
        return { facebook: extractFacebook(html), error: '', attempts: attempt };
      }
    } catch (error) {
      lastError = error?.message || String(error);
    }

    if (attempt < DETAIL_RETRIES) {
      await sleep(1200 * attempt);
    }
  }

  return { facebook: '', error: `${lastError}（已重試 ${DETAIL_RETRIES} 次）`, attempts: DETAIL_RETRIES };
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

const { html, source } = await loadOfficialListHtml();
const officialList = parseCouncilorList(html);
console.log(`使用名單來源：${source}`);
console.log(`官方名單解析：${officialList.length} 人`);

if (officialList.length < 40) {
  throw new Error(`安全中止：官方名單只解析到 ${officialList.length} 人，未達安全門檻 40。`);
}

const officialByName = new Map(officialList.map((x) => [x.key, x]));
const matchedRoster = roster
  .map((candidate) => ({ candidate, official: officialByName.get(normalizeName(candidate?.name)) || null }))
  .filter((x) => x.official);

console.log(`網站 ↔ 官方姓名命中：${matchedRoster.length}/${roster.length}`);
if (matchedRoster.length < 30) {
  throw new Error(`安全中止：只命中 ${matchedRoster.length}/${roster.length} 位網站既有人員。`);
}

console.log(`開始抓 ${matchedRoster.length} 位官方詳細頁的 FB（失敗最多重試 ${DETAIL_RETRIES} 次）…`);
let completed = 0;
const crawled = await mapLimit(matchedRoster, DETAIL_CONCURRENCY, async ({ candidate, official }) => {
  const result = await fetchDetailFacebook(official.detailUrl);
  completed += 1;
  const suffix = result.attempts > 1 && !result.error ? `（第 ${result.attempts} 次成功）` : '';
  console.log(`[${completed}/${matchedRoster.length}] ${candidate.name} → ${result.facebook ? `找到 FB${suffix}` : result.error ? `抓取失敗：${result.error}` : `未找到 FB${suffix}`}`);
  return {
    key: normalizeName(candidate.name),
    officialName: official.name,
    detailUrl: official.detailUrl,
    facebook: result.facebook,
    error: result.error,
    attempts: result.attempts,
  };
});

const crawledByName = new Map(crawled.map((x) => [x.key, x]));
const preview = roster.map((candidate) => {
  const sourceRow = crawledByName.get(normalizeName(candidate?.name));
  return {
    name: candidate?.name || '',
    existingFacebook: candidate?.facebook || '',
    officialFacebook: sourceRow?.facebook || '',
    detailUrl: sourceRow?.detailUrl || '',
    matchedOfficialRoster: Boolean(sourceRow),
    safeToApply: Boolean(sourceRow?.facebook),
    error: sourceRow?.error || '',
    attempts: sourceRow?.attempts || 0,
  };
});

const officialFacebookHits = preview.filter((x) => x.officialFacebook).length;
const requestFailures = preview.filter((x) => x.error).length;

await writeFile(OUTPUT_PATH, `${JSON.stringify({
  generatedAt: new Date().toISOString(),
  source,
  websiteRoster: roster.length,
  officialRosterParsed: officialList.length,
  websiteOfficialNameMatches: matchedRoster.length,
  officialFacebookHits,
  requestFailures,
  mode: 'preview-only',
  rule: 'website roster is authoritative; update existing names only; never add people; data/counties.json is not modified',
  councilors: preview,
}, null, 2)}\n`, 'utf8');

console.log('');
console.log('預覽完成。');
console.log(`官方名單解析：${officialList.length} 人`);
console.log(`網站 ↔ 官方姓名命中：${matchedRoster.length}/${roster.length}`);
console.log(`官方 FB 找到：${officialFacebookHits} 個`);
console.log(`仍抓取失敗：${requestFailures} 個`);
console.log(`已輸出：${OUTPUT_PATH}`);
console.log('尚未修改 data/counties.json。');
