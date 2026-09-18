import { execFile } from 'node:child_process';
import { readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { promisify } from 'node:util';
import { fileURLToPath } from 'node:url';
import { load } from 'cheerio';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const overridesPath = path.join(root, 'overrides_deploy.json');
const execFileAsync = promisify(execFile);
const TNCC_SOURCE = 'https://www.tncc.gov.tw/subhome.asp?orcaid=C56635AE-3C35-4233-8561-7B2CAA2DF01F';
const TNCC_BASE = 'https://www.tncc.gov.tw/';
const MOI_METRO_SOURCE = 'https://www.moi.gov.tw/LocalOfficial.aspx?TYP=KND0004&n=578&PageSize=100';
const MOI_COUNTY_SOURCE = 'https://www.moi.gov.tw/LocalOfficial.aspx?TYP=KND0005&n=579&PageSize=100';

const COUNTY_CODES = {
  臺北市: '63000', 新北市: '65000', 桃園市: '68000', 臺中市: '66000', 臺南市: '67000', 高雄市: '64000',
  基隆市: '10017', 新竹市: '10018', 嘉義市: '10020', 宜蘭縣: '10002', 新竹縣: '10004', 苗栗縣: '10005',
  彰化縣: '10007', 南投縣: '10008', 雲林縣: '10009', 嘉義縣: '10010', 屏東縣: '10013', 臺東縣: '10014',
  花蓮縣: '10015', 澎湖縣: '10016', 金門縣: '09020', 連江縣: '09007',
};

const clean = (value) => String(value || '').replace(/[\s\u3000]+/g, ' ').trim();
const normalizeName = (value) => clean(value)
  .normalize('NFKC')
  .replace(/[・．·‧\s]/g, '')
  .replaceAll('黄', '黃')
  .replaceAll('啓', '啟');

function canonicalFacebook(value) {
  if (!value || /^javascript:/i.test(value)) return '';
  try {
    const url = new URL(clean(value));
    const host = url.hostname.toLowerCase().replace(/^(?:m|web)\./, 'www.');
    if (host !== 'facebook.com' && host !== 'www.facebook.com') return '';
    if (/\/(?:sharer|share|dialog|plugins|login)\b/i.test(url.pathname)) return '';
    if (url.pathname === '/' || url.pathname === '') return '';
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
      const { stdout } = await execFileAsync('curl', [
        '--location', '--fail', '--silent', '--show-error', '--max-time', '60',
        '--user-agent', 'Mozilla/5.0 (compatible; FormosaWatch/1.0)',
        '--header', 'Accept-Language: zh-TW,zh;q=0.9,en;q=0.7', url,
      ], { encoding: 'utf8', maxBuffer: 8 * 1024 * 1024 });
      return stdout;
    } catch (error) {
      lastError = error;
      if (attempt < attempts) await new Promise((resolve) => setTimeout(resolve, attempt * 600));
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

function districtLinks(html) {
  const $ = load(html);
  const links = [];
  $('a[href*="subhome.asp"][href*="orcaid2="]').each((_, link) => {
    const node = $(link);
    const title = clean(node.attr('title'));
    const district = clean(node.text()).match(/第([一二三四五六七八九十]+)選區/)?.[1];
    const numberMap = { 一: 1, 二: 2, 三: 3, 四: 4, 五: 5, 六: 6, 七: 7, 八: 8, 九: 9, 十: 10, 十一: 11, 十二: 12, 十三: 13 };
    if (!district || !numberMap[district]) return;
    links.push({ district: String(numberMap[district]), title, url: new URL(node.attr('href'), TNCC_SOURCE).href });
  });
  return [...new Map(links.map((item) => [item.district, item])).values()];
}

function parseTainanDistrict(html, district) {
  const $ = load(html);
  const members = [];
  $('.image-box').each((_, card) => {
    const node = $(card);
    const link = node.find('a[href*="councilorpage.asp"]').first();
    const href = link.attr('href');
    const rawName = clean(node.find('.peoplebold').text());
    const name = rawName.replace(/\s*[（(]歿[）)]\s*$/, '');
    const style = link.find('[style*="background-image"]').attr('style') || '';
    const photo = style.match(/background-image\s*:\s*url\((['"]?)(.*?)\1\)/i)?.[2] || '';
    if (!href || !name || !photo || /[（(]歿[）)]|解職/.test(rawName)) return;
    members.push({ district, name, photoUrl: new URL(photo, TNCC_BASE).href, detailUrl: new URL(href, TNCC_BASE).href, facebook: '' });
  });
  return members;
}

function parseFacebook(html) {
  const $ = load(html);
  const candidates = [];
  $('a[href]').each((_, link) => {
    const value = canonicalFacebook($(link).attr('href'));
    if (value && value !== 'https://www.facebook.com/at.tncc') candidates.push(value);
  });
  return [...new Set(candidates)][0] || '';
}

function parseMayors(html, source) {
  const $ = load(html);
  const mayors = [];
  $('.result-list .block > .in').each((_, card) => {
    const node = $(card);
    const name = clean(node.find('.caption').text());
    const county = clean(node.find('.locate').text());
    const photo = node.find('.img img').attr('src');
    const href = node.find('a[href*="LocalOfficial_Content.aspx"]').attr('href');
    const countyCode = COUNTY_CODES[county];
    if (!name || !countyCode || !photo || !href) return;
    mayors.push({ county, countyCode, name, photoUrl: new URL(photo, source).href, detailUrl: new URL(href, source).href });
  });
  return mayors;
}

function applyTainan(overrides, members) {
  const document = overrides['67000'];
  if (!document?.councilors) throw new Error('安全中止：後台沒有臺南市議員資料');
  const result = { matched: 0, unmatched: [], photosAdded: 0, photosPreserved: 0, facebookAdded: 0, facebookPreserved: 0, conflicts: [], changes: [] };
  for (const member of members) {
    const block = document.councilors.find((item) => String(item.district) === member.district);
    const matches = (block?.candidates || []).filter((candidate) => normalizeName(candidate.name) === normalizeName(member.name));
    if (!matches.length) { result.unmatched.push({ district: member.district, name: member.name }); continue; }
    if (matches.length !== 1) throw new Error(`安全中止：臺南第 ${member.district} 選區 ${member.name} 命中 ${matches.length} 筆`);
    result.matched += 1;
    const candidate = matches[0];
    const before = { photoUrl: clean(candidate.photoUrl), facebook: clean(candidate.facebook) };
    if (!before.photoUrl && member.photoUrl) { candidate.photoUrl = member.photoUrl; result.photosAdded += 1; } else if (before.photoUrl) result.photosPreserved += 1;
    if (!before.facebook && member.facebook) { candidate.facebook = member.facebook; result.facebookAdded += 1; }
    else if (before.facebook) {
      result.facebookPreserved += 1;
      if (member.facebook && canonicalFacebook(before.facebook) !== member.facebook) result.conflicts.push({ name: member.name, existing: before.facebook, official: member.facebook });
    }
    const after = { photoUrl: clean(candidate.photoUrl), facebook: clean(candidate.facebook) };
    if (JSON.stringify(before) !== JSON.stringify(after)) result.changes.push({ district: member.district, name: member.name, before, after });
  }
  if (result.matched < 45) throw new Error(`安全中止：臺南議員只命中 ${result.matched} 位`);
  if (result.changes.length) { document.updatedAt = new Date().toISOString(); document.updatedBy = 'tncc-official-sync'; }
  return result;
}

function applyMayors(overrides, mayors) {
  const result = { matched: 0, unmatched: [], photosAdded: 0, photosPreserved: 0, incumbentFlagsAdded: 0, changes: [] };
  for (const mayor of mayors) {
    const candidates = overrides[mayor.countyCode]?.candidates || [];
    const matches = candidates.filter((candidate) => normalizeName(candidate.name) === normalizeName(mayor.name));
    if (!matches.length) { result.unmatched.push({ county: mayor.county, countyCode: mayor.countyCode, name: mayor.name }); continue; }
    if (matches.length !== 1) throw new Error(`安全中止：${mayor.county} ${mayor.name} 命中 ${matches.length} 筆首長候選人`);
    result.matched += 1;
    const candidate = matches[0];
    const before = { photoUrl: clean(candidate.photoUrl), isIncumbent: candidate.isIncumbent === true };
    if (!before.photoUrl) { candidate.photoUrl = mayor.photoUrl; result.photosAdded += 1; } else result.photosPreserved += 1;
    if (!before.isIncumbent) { candidate.isIncumbent = true; result.incumbentFlagsAdded += 1; }
    const after = { photoUrl: clean(candidate.photoUrl), isIncumbent: candidate.isIncumbent === true };
    if (JSON.stringify(before) !== JSON.stringify(after)) {
      result.changes.push({ county: mayor.county, name: mayor.name, before, after });
      const document = overrides[mayor.countyCode];
      document.updatedAt = new Date().toISOString();
      document.updatedBy = 'moi-mayor-official-sync';
    }
  }
  if (mayors.length !== 22 || result.matched < 8) throw new Error(`安全中止：首長官方 ${mayors.length} 位、後台只命中 ${result.matched} 位`);
  return result;
}

const overrides = JSON.parse(await readFile(overridesPath, 'utf8'));
const [tnccHome, moiMetro, moiCounty] = await Promise.all([fetchText(TNCC_SOURCE), fetchText(MOI_METRO_SOURCE), fetchText(MOI_COUNTY_SOURCE)]);
const links = districtLinks(tnccHome);
if (links.length !== 13) throw new Error(`安全中止：臺南只解析到 ${links.length} 個議員選區`);
const districtRows = [];
for (const item of links) {
  districtRows.push(parseTainanDistrict(await fetchText(item.url), item.district));
}
console.log('臺南各選區解析：' + districtRows.map((rows, index) => `${links[index].district}:${rows.length}`).join('、'));
const roster = districtRows.flat();
if (roster.length < 50) throw new Error(`安全中止：臺南官方名單只解析到 ${roster.length} 位在任議員`);
let completed = 0;
const tainan = await mapLimit(roster, 2, async (member) => {
  const row = { ...member, error: '' };
  try { row.facebook = parseFacebook(await fetchText(member.detailUrl)); }
  catch (error) { row.error = error?.message || String(error); }
  completed += 1;
  console.log(`[${completed}/${roster.length}] 臺南 ${row.name}: ${row.facebook ? 'Facebook 已核對' : '官方頁未列 Facebook'}`);
  return row;
});
const mayors = [...parseMayors(moiMetro, MOI_METRO_SOURCE), ...parseMayors(moiCounty, MOI_COUNTY_SOURCE)];
const tainanResult = applyTainan(overrides, tainan);
const mayorResult = applyMayors(overrides, mayors);
const generatedAt = new Date().toISOString();
const report = {
  generatedAt,
  sources: { tainanCouncil: TNCC_SOURCE, metroMayors: MOI_METRO_SOURCE, countyMayors: MOI_COUNTY_SOURCE },
  verification: '臺南市議員照片與 Facebook 僅取自臺南市議會名單及個人官方介紹頁；縣市首長姓名與照片僅取自內政部地方公職人員資訊。只補空值，不覆蓋既有照片或社群資料；未出現在本站參選名單者不新增。',
  tainan: { officialCount: tainan.length, officialFacebook: tainan.filter((item) => item.facebook).length, errors: tainan.filter((item) => item.error).map(({ name, detailUrl, error }) => ({ name, detailUrl, error })), ...tainanResult, councilors: tainan },
  mayors: { officialCount: mayors.length, ...mayorResult, people: mayors },
};
await Promise.all([
  writeFile(overridesPath, `${JSON.stringify(overrides)}\n`),
  writeFile(path.join(root, 'data', 'tncc_mayors.json'), `${JSON.stringify(report, null, 2)}\n`),
]);
console.log(JSON.stringify({
  tainan: { official: tainan.length, matched: tainanResult.matched, unmatched: tainanResult.unmatched.length, officialFacebook: report.tainan.officialFacebook, photosAdded: tainanResult.photosAdded, photosPreserved: tainanResult.photosPreserved, facebookAdded: tainanResult.facebookAdded, errors: report.tainan.errors.length },
  mayors: { official: mayors.length, matched: mayorResult.matched, unmatched: mayorResult.unmatched.length, photosAdded: mayorResult.photosAdded, photosPreserved: mayorResult.photosPreserved, incumbentFlagsAdded: mayorResult.incumbentFlagsAdded },
}, null, 2));
