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

async function fetchBytes(url) {
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
  return {
    bytes: new Uint8Array(await response.arrayBuffer()),
    contentType: response.headers.get('content-type') || '',
  };
}

function decodeCandidate(bytes, encoding) {
  try {
    return new TextDecoder(encoding, { fatal: false }).decode(bytes);
  } catch {
    return '';
  }
}

function chooseDecoding(bytes, roster, contentType) {
  const encodings = ['utf-8', 'big5', 'gb18030'];
  const headerMatch = contentType.match(/charset\s*=\s*([^;\s]+)/i);
  if (headerMatch) encodings.unshift(headerMatch[1].replace(/["']/g, '').toLowerCase());

  const unique = [...new Set(encodings)];
  const scored = unique.map((encoding) => {
    const html = decodeCandidate(bytes, encoding);
    const normalizedHtml = normalizeName(html);
    const hits = roster.reduce((count, candidate) => {
      const name = normalizeName(candidate?.name);
      return count + (name && normalizedHtml.includes(name) ? 1 : 0);
    }, 0);
    const replacementChars = (html.match(/�/g) || []).length;
    return { encoding, html, hits, replacementChars };
  }).sort((a, b) => b.hits - a.hits || a.replacementChars - b.replacementChars);

  return { best: scored[0], all: scored.map(({ encoding, hits, replacementChars }) => ({ encoding, hits, replacementChars })) };
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

function findFacebookNearExactName($, name) {
  const target = normalizeName(name);
  let result = '';

  $('*').each((_, el) => {
    if (result) return;
    const node = $(el);
    const ownText = cleanText(node.clone().children().remove().end().text());
    if (!ownText || normalizeName(ownText) !== target) return;

    let current = node;
    for (let depth = 0; depth < 7 && current.length; depth += 1) {
      const blockText = cleanText(current.text());
      if (blockText.length > 2200) break;

      current.find('a[href]').each((__, a) => {
        if (result) return;
        const fb = canonicalFacebook($(a).attr('href'));
        if (fb) result = fb;
      });
      current = current.parent();
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
console.log('安全模式：這次只輸出預覽 JSON，不會修改 data/counties.json。');

const { bytes, contentType } = await fetchBytes(LIST_URL);
const decoding = chooseDecoding(bytes, roster, contentType);

console.log('編碼候選：');
for (const row of decoding.all) {
  console.log(`  ${row.encoding}: 姓名命中 ${row.hits}，� 字元 ${row.replacementChars}`);
}
console.log(`採用編碼：${decoding.best.encoding}`);

const html = decoding.best.html;
const pageNameHits = decoding.best.hits;
const minSafeNameHits = Math.max(10, Math.ceil(roster.length * 0.2));

if (pageNameHits < minSafeNameHits) {
  throw new Error(`安全中止：官方頁只辨識到 ${pageNameHits}/${roster.length} 個你網站既有姓名，未達安全門檻 ${minSafeNameHits}。不會寫入任何網站資料。`);
}

const $ = load(html);
const results = [];
let found = 0;

for (let i = 0; i < roster.length; i += 1) {
  const candidate = roster[i];
  const name = candidate?.name || '';
  if (!name) continue;

  const appearsOnPage = normalizeName(html).includes(normalizeName(name));
  const facebook = appearsOnPage ? findFacebookNearExactName($, name) : '';
  if (facebook) found += 1;

  console.log(`[${i + 1}/${roster.length}] ${name} → ${facebook ? '找到 FB' : appearsOnPage ? '找到姓名，但此頁未找到 FB' : '官方頁未找到姓名'}`);

  results.push({
    name,
    existingFacebook: candidate.facebook || '',
    officialFacebook: facebook,
    appearsOnOfficialPage: appearsOnPage,
    safeToApply: Boolean(facebook),
  });
}

await writeFile(OUTPUT_PATH, `${JSON.stringify({
  generatedAt: new Date().toISOString(),
  source: LIST_URL,
  encoding: decoding.best.encoding,
  websiteRoster: roster.length,
  officialNameHits: pageNameHits,
  officialFacebookHits: found,
  mode: 'preview-only',
  rule: 'website roster is authoritative; no people are added; data/counties.json is never modified in this run',
  councilors: results,
}, null, 2)}\n`, 'utf8');

console.log('');
console.log('預覽完成。');
console.log(`姓名命中：${pageNameHits}/${roster.length}`);
console.log(`FB 命中：${found}/${roster.length}`);
console.log(`已輸出：${OUTPUT_PATH}`);
console.log('尚未修改 data/counties.json。');
