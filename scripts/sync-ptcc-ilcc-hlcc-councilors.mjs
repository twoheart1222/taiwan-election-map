import { readFile, writeFile } from 'node:fs/promises';
import { execFile } from 'node:child_process';
import path from 'node:path';
import { promisify } from 'node:util';
import { fileURLToPath } from 'node:url';
import { load } from 'cheerio';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const overridesPath = path.join(root, 'overrides_deploy.json');
const reportPath = path.join(root, 'data', 'ptcc_ilcc_hlcc_councilors.json');
const PTCC_SOURCE = 'https://www.ptcc.gov.tw/?Page=Persional&Guid=1c445ed1-8f2f-4c7f-75f6-6d6aafa3516e';
const ILCC_SOURCE = 'https://www.ilcc.gov.tw/H0051.aspx';
const ILCC_ROSTER = 'https://www.ilcc.gov.tw/Html/H_05/H_05.asp';
const HLCC_SOURCE = 'https://www.hlcc.gov.tw/councillor.php';
const MOI_SOURCE = 'https://www.moi.gov.tw/LocalOfficial.aspx?n=574&sms=11400&TYP=KND0002&PageSize=1000&page=1';
const execFileAsync = promisify(execFile);

const clean = (value) => String(value || '').replace(/[\s\u3000]+/g, ' ').trim();
const normalizeName = (value) => clean(value).normalize('NFKC')
  .replace(/[・．·‧.\s]/g, '').replace(/議長|副議長|議員/g, '')
  .replaceAll('顔', '顏').replaceAll('暦', '曆');

function canonicalFacebook(value) {
  if (!value) return '';
  try {
    const url = new URL(clean(value));
    const host = url.hostname.toLowerCase().replace(/^(?:m|web)\./, 'www.');
    if (!['facebook.com', 'www.facebook.com'].includes(host)) return '';
    if (/\/(?:sharer|share|dialog|plugins|login)\b/i.test(url.pathname)) return '';
    url.protocol = 'https:';
    url.hostname = 'www.facebook.com';
    url.hash = '';
    if (url.pathname.toLowerCase() === '/profile.php') {
      const id = url.searchParams.get('id');
      url.search = id ? `?id=${encodeURIComponent(id)}` : '';
    } else url.search = '';
    return url.href.replace(/\/$/, '');
  } catch { return ''; }
}

async function fetchBuffer(url, attempts = 3) {
  let lastError;
  for (let attempt = 1; attempt <= attempts; attempt += 1) {
    try {
      const { stdout } = await execFileAsync('curl', [
        '--location', '--fail', '--silent', '--show-error', '--max-time', '60',
        '--user-agent', 'Mozilla/5.0 (compatible; FormosaWatch/1.0)',
        '--header', 'Accept-Language: zh-TW,zh;q=0.9,en;q=0.7', url,
      ], { encoding: 'buffer', maxBuffer: 8 * 1024 * 1024 });
      return stdout;
    } catch (error) {
      lastError = error;
      if (attempt < attempts) await new Promise((resolve) => setTimeout(resolve, attempt * 600));
    }
  }
  throw new Error(`${url}: ${lastError?.message || lastError}`);
}

async function fetchText(url) { return (await fetchBuffer(url)).toString('utf8'); }
async function mapLimit(items, limit, callback) {
  const output = new Array(items.length); let cursor = 0;
  async function worker() { while (cursor < items.length) { const index = cursor++; output[index] = await callback(items[index], index); } }
  await Promise.all(Array.from({ length: Math.min(limit, items.length) }, worker));
  return output;
}
function findFacebook(html, excluded = new Set()) {
  const $ = load(html); const links = [];
  $('a[href]').each((_, node) => {
    const link = canonicalFacebook($(node).attr('href'));
    if (link && !excluded.has(link)) links.push(link);
  });
  return [...new Set(links)][0] || '';
}

function parsePingtungList(html) {
  const $ = load(html); const byUrl = new Map();
  $('a[href*="Page=PersionalDetail"]').each((_, node) => {
    const href = $(node).attr('href'); const name = clean($(node).text());
    if (!href || !name) return;
    const detailUrl = new URL(href, PTCC_SOURCE).href;
    if (!byUrl.has(detailUrl)) byUrl.set(detailUrl, { name, detailUrl, photoUrl: '', facebook: '' });
  });
  return [...byUrl.values()];
}
function parsePingtungDetail(html, detailUrl) {
  const $ = load(html);
  const img = $('img[alt*="相片"], img[src*="upload/upimage"]').first().attr('src');
  return { photoUrl: img ? new URL(img, detailUrl).href : '', facebook: findFacebook(html) };
}

function parseYilanRoster(buffer) {
  const html = new TextDecoder('big5').decode(buffer); const $ = load(html); const byName = new Map();
  $('a[href*="PBrowse.aspx"][href*="PMZ"]').each((_, node) => {
    const href = $(node).attr('href'); const name = clean($(node).text());
    if (!href || !name) return;
    const detailUrl = new URL(href, ILCC_ROSTER).href;
    if (!byName.has(normalizeName(name))) byName.set(normalizeName(name), { name, detailUrl, photoUrl: '', facebook: '' });
  });
  return [...byName.values()];
}

function parseHualienList(html) {
  const $ = load(html); const byId = new Map();
  $('a[href*="councillor-data.php?index_no="]').each((_, node) => {
    const href = $(node).attr('href'); if (!href) return;
    const detailUrl = new URL(href, HLCC_SOURCE).href;
    const id = new URL(detailUrl).searchParams.get('index_no'); if (!id) return;
    const item = byId.get(id) || { detailUrl, name: '', photoUrl: '', facebook: '' };
    const name = clean($(node).text()); const photo = $(node).find('img').first().attr('src');
    if (name) item.name = name;
    if (photo) item.photoUrl = new URL(photo, HLCC_SOURCE).href;
    byId.set(id, item);
  });
  return [...byId.values()].filter((item) => item.name);
}

function parseMoiPhotos(html) {
  const $ = load(html); const photos = new Map();
  $('.serv-group .result-list .block').each((_, node) => {
    const name = clean($(node).find('.caption').text());
    const county = clean($(node).find('.locate').text());
    const src = $(node).find('.img img').attr('src');
    if (!name || !county || !src) return;
    photos.set(`${county}:${normalizeName(name)}`, new URL(src, MOI_SOURCE).href);
  });
  return photos;
}
function matchingPhoto(moi, county, name) {
  const normalized = normalizeName(name);
  const exact = moi.get(`${county}:${normalized}`); if (exact) return exact;
  const found = [...moi.entries()].filter(([key]) => {
    const [place, candidate] = key.split(':');
    return place === county && (candidate.startsWith(normalized) || normalized.startsWith(candidate));
  });
  return found.length === 1 ? found[0][1] : '';
}
function matchCandidate(document, name) {
  const target = normalizeName(name);
  const matches = document.councilors.flatMap((district) => (district.candidates || []).map((candidate) => ({ district, candidate })))
    .filter(({ candidate }) => normalizeName(candidate.name) === target);
  return matches;
}
function applyMembers(overrides, countyCode, members, minimumMatches, updatedBy) {
  const document = overrides[countyCode];
  if (!document?.councilors) throw new Error(`安全中止：後台沒有 ${countyCode} 議員資料`);
  const result = { matched: 0, unmatched: [], photosAdded: 0, photosPreserved: 0, facebookAdded: 0, facebookPreserved: 0, changes: [] };
  for (const member of members) {
    const matches = matchCandidate(document, member.name);
    if (!matches.length) { result.unmatched.push(member.name); continue; }
    if (matches.length !== 1) throw new Error(`安全中止：${countyCode} ${member.name} 命中 ${matches.length} 筆`);
    const { district, candidate } = matches[0]; result.matched += 1;
    const before = { photoUrl: clean(candidate.photoUrl), facebook: clean(candidate.facebook), isIncumbent: candidate.isIncumbent === true };
    if (!before.photoUrl && member.photoUrl) { candidate.photoUrl = member.photoUrl; result.photosAdded += 1; } else if (before.photoUrl) result.photosPreserved += 1;
    if (!before.facebook && member.facebook) { candidate.facebook = member.facebook; result.facebookAdded += 1; } else if (before.facebook) result.facebookPreserved += 1;
    candidate.isIncumbent = true;
    const after = { photoUrl: clean(candidate.photoUrl), facebook: clean(candidate.facebook), isIncumbent: candidate.isIncumbent === true };
    if (JSON.stringify(before) !== JSON.stringify(after)) result.changes.push({ district: district.district, name: member.name, before, after });
  }
  if (result.matched < minimumMatches) throw new Error(`安全中止：${countyCode} 只命中 ${result.matched} 位，最低要求 ${minimumMatches} 位`);
  if (result.changes.length) { document.updatedAt = new Date().toISOString(); document.updatedBy = updatedBy; }
  return result;
}

const [overridesText, ptccHtml, ilccHtml, hlccHtml, moiHtml] = await Promise.all([
  readFile(overridesPath, 'utf8'), fetchText(PTCC_SOURCE), fetchBuffer(ILCC_ROSTER), fetchText(HLCC_SOURCE), fetchText(MOI_SOURCE),
]);
const overrides = JSON.parse(overridesText);
// The Hualien detail template repeats the council's own Facebook page on every
// member page. It is not a member-owned account; remove only values introduced
// by the aborted local verification run before any data is uploaded.
for (const district of overrides['10015']?.councilors || []) {
  for (const candidate of district.candidates || []) {
    if (canonicalFacebook(candidate.facebook) === 'https://www.facebook.com/hlcctw') candidate.facebook = '';
  }
}
const pingtungBase = parsePingtungList(ptccHtml);
const hualienBase = parseHualienList(hlccHtml);
const yilanBase = parseYilanRoster(ilccHtml);
if (pingtungBase.length < 45 || yilanBase.length < 30 || hualienBase.length < 28) throw new Error(`安全中止：官方名冊解析數量異常（屏東 ${pingtungBase.length}、宜蘭 ${yilanBase.length}、花蓮 ${hualienBase.length}）`);
const moi = parseMoiPhotos(moiHtml);

let progress = 0;
const pingtung = await mapLimit(pingtungBase, 4, async (member) => {
  const detail = parsePingtungDetail(await fetchText(member.detailUrl), member.detailUrl);
  progress += 1; console.log(`[${progress}/${pingtungBase.length}] 屏東 ${member.name}: ${detail.facebook ? 'Facebook 已核對' : '官方頁未列 Facebook'}`);
  return { ...member, ...detail, photoUrl: detail.photoUrl || matchingPhoto(moi, '屏東縣', member.name) };
});
progress = 0;
const hualien = await mapLimit(hualienBase, 4, async (member) => {
  const facebook = findFacebook(await fetchText(member.detailUrl), new Set(['https://www.facebook.com/hlcctw']));
  progress += 1; console.log(`[${progress}/${hualienBase.length}] 花蓮 ${member.name}: ${facebook ? 'Facebook 已核對' : '官方頁未列 Facebook'}`);
  return { ...member, facebook, photoUrl: member.photoUrl || matchingPhoto(moi, '花蓮縣', member.name) };
});
const yilan = yilanBase.map((member) => ({ ...member, photoUrl: matchingPhoto(moi, '宜蘭縣', member.name) }));

const pingtungResult = applyMembers(overrides, '10013', pingtung, 40, 'ptcc-official-sync');
const yilanResult = applyMembers(overrides, '10002', yilan, 25, 'ilcc-official-sync');
const hualienResult = applyMembers(overrides, '10015', hualien, 25, 'hlcc-official-sync');
const report = {
  generatedAt: new Date().toISOString(), sources: [PTCC_SOURCE, ILCC_SOURCE, HLCC_SOURCE, MOI_SOURCE],
  verification: '以三個議會的現任議員名冊作為身分核對；照片優先取自屏東、花蓮議會官方個人頁，宜蘭議會頁未提供可用個人照時才以內政部現任地方公職人員官方名冊補齊。Facebook 僅在個別議員官方頁有可驗證連結時補入；只補空值，絕不覆寫既有照片或社群連結。',
  pingtung: { officialCount: pingtung.length, officialFacebook: pingtung.filter((item) => item.facebook).length, ...pingtungResult, councilors: pingtung },
  yilan: { officialCount: yilan.length, officialFacebook: 0, ...yilanResult, councilors: yilan },
  hualien: { officialCount: hualien.length, officialFacebook: hualien.filter((item) => item.facebook).length, ...hualienResult, councilors: hualien },
};
await Promise.all([writeFile(overridesPath, `${JSON.stringify(overrides)}\n`), writeFile(reportPath, `${JSON.stringify(report, null, 2)}\n`)]);
console.log(JSON.stringify({
  pingtung: { official: pingtung.length, ...pingtungResult }, yilan: { official: yilan.length, ...yilanResult }, hualien: { official: hualien.length, ...hualienResult },
}, null, 2));
