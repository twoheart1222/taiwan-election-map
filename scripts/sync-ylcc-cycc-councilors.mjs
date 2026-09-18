import { readFile, writeFile } from 'node:fs/promises';
import { execFile } from 'node:child_process';
import path from 'node:path';
import { promisify } from 'node:util';
import { fileURLToPath } from 'node:url';
import { load } from 'cheerio';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const overridesPath = path.join(root, 'overrides_deploy.json');
const YLCC_SOURCE = 'https://www.ylcc.gov.tw/cp.aspx?n=22126';
const CYCC_SOURCE = 'https://www.cycc.gov.tw/web/UnitStaff_New/listUnitStaff.aspx?c0=3716';
const CYCC_BASE = 'https://www.cycc.gov.tw/web/UnitStaff_New/';
const execFileAsync = promisify(execFile);

const clean = (value) => String(value || '').replace(/[\s\u3000]+/g, ' ').trim();
const normalizeName = (value) => clean(value)
  .normalize('NFKC')
  .replace(/[・．·‧\s]/g, '')
  .replaceAll('顔', '顏')
  .replaceAll('暦', '曆');

function canonicalFacebook(value) {
  if (!value) return '';
  try {
    const url = new URL(clean(value));
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
      const { stdout } = await execFileAsync('curl', [
        '--location', '--fail', '--silent', '--show-error',
        '--max-time', '60',
        '--user-agent', 'Mozilla/5.0 (compatible; FormosaWatch/1.0)',
        '--header', 'Accept-Language: zh-TW,zh;q=0.9,en;q=0.7',
        url,
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

function parseYunlin(html) {
  const $ = load(html);
  const members = [];
  const districtNumbers = { 一: '1', 二: '2', 三: '3', 四: '4', 五: '5', 六: '6', 七: '7', 八: '8' };
  $('.area-customize.news-card').each((_, group) => {
    const title = clean($(group).find('> .in > .hd a[title]').first().attr('title'));
    const token = title.match(/第\s*([一二三四五六七八\d]+)\s*選區/)?.[1] || '';
    const district = districtNumbers[token] || token;
    if (!district) return;
    $(group).find('a[href*="Congress_Detail.aspx"]').each((__, link) => {
      const node = $(link);
      const name = clean(node.find('.caption').text());
      const photo = node.find('.img img').first().attr('src');
      const href = node.attr('href');
      if (!name || !photo || !href) return;
      members.push({
        district,
        name,
        photoUrl: new URL(photo, YLCC_SOURCE).href,
        detailUrl: new URL(href, YLCC_SOURCE).href,
        facebook: canonicalFacebook(node.find('a[href*="facebook.com"]').attr('href')),
      });
    });
  });
  return members;
}

function cleanChiayiName(value) {
  return clean(value).replace(/議長|副議長|議員/g, '');
}

function parseChiayiRoster(html, district) {
  const $ = load(html);
  const members = [];
  $('a[href*="Default2.aspx"]').each((_, link) => {
    const node = $(link);
    const item = node.closest('li');
    const photo = item.find('img').first().attr('src');
    const href = node.attr('href');
    const name = cleanChiayiName(node.attr('title') || node.text());
    if (!name || !photo || !href) return;
    members.push({
      district,
      name,
      photoUrl: new URL(photo, CYCC_BASE).href,
      detailUrl: new URL(href, CYCC_BASE).href,
      facebook: '',
    });
  });
  return members;
}

function parseFacebook(html) {
  const $ = load(html);
  const links = [];
  $('a[href]').each((_, link) => {
    const value = canonicalFacebook($(link).attr('href'));
    if (value) links.push(value);
  });
  return [...new Set(links)][0] || '';
}

function applyOfficialMembers(overrides, countyCode, members, minimumMatches, updatedBy) {
  const document = overrides[countyCode];
  if (!document?.councilors) throw new Error(`安全中止：後台沒有 ${countyCode} 議員資料`);
  const result = {
    matched: 0,
    unmatched: [],
    photosAdded: 0,
    photosPreserved: 0,
    facebookAdded: 0,
    facebookPreserved: 0,
    conflicts: [],
    changes: [],
  };

  for (const member of members) {
    const block = document.councilors.find((item) => String(item.district) === String(member.district));
    const matches = (block?.candidates || []).filter(
      (candidate) => normalizeName(candidate.name) === normalizeName(member.name),
    );
    if (matches.length === 0) {
      result.unmatched.push({ district: member.district, name: member.name });
      continue;
    }
    if (matches.length !== 1) {
      throw new Error(`安全中止：${countyCode} 第 ${member.district} 選區 ${member.name} 命中 ${matches.length} 筆`);
    }
    result.matched += 1;
    const candidate = matches[0];
    const before = { photoUrl: clean(candidate.photoUrl), facebook: clean(candidate.facebook) };
    if (!before.photoUrl && member.photoUrl) {
      candidate.photoUrl = member.photoUrl;
      result.photosAdded += 1;
    } else if (before.photoUrl) {
      result.photosPreserved += 1;
    }
    if (!before.facebook && member.facebook) {
      candidate.facebook = member.facebook;
      result.facebookAdded += 1;
    } else if (before.facebook) {
      result.facebookPreserved += 1;
      if (member.facebook && canonicalFacebook(before.facebook) !== member.facebook) {
        result.conflicts.push({ name: member.name, existing: before.facebook, official: member.facebook });
      }
    }
    const after = { photoUrl: clean(candidate.photoUrl), facebook: clean(candidate.facebook) };
    if (before.photoUrl !== after.photoUrl || before.facebook !== after.facebook) {
      result.changes.push({ district: member.district, name: member.name, before, after });
    }
  }
  if (result.matched < minimumMatches) {
    throw new Error(`安全中止：${countyCode} 只命中 ${result.matched} 位，最低要求 ${minimumMatches} 位`);
  }
  if (result.changes.length) {
    document.updatedAt = new Date().toISOString();
    document.updatedBy = updatedBy;
  }
  return result;
}

// Fetch the two council sites sequentially. The Yunlin server intermittently
// throttles concurrent requests with timeouts.
const overridesText = await readFile(overridesPath, 'utf8');
const yunlinHtml = process.env.YLCC_HTML_PATH
  ? await readFile(process.env.YLCC_HTML_PATH, 'utf8')
  : await fetchText(YLCC_SOURCE);
const chiayiDistrict1Html = await fetchText(`${CYCC_BASE}Default.aspx?c0=3716&d0=3680&p0=0`);
const chiayiDistrict2Html = await fetchText(`${CYCC_BASE}Default.aspx?c0=3716&d0=3680&p0=1`);
const overrides = JSON.parse(overridesText);
const yunlin = parseYunlin(yunlinHtml);
if (yunlin.length < 40) throw new Error(`安全中止：雲林官方名單只解析到 ${yunlin.length} 位`);
const chiayiRoster = [
  ...parseChiayiRoster(chiayiDistrict1Html, '1'),
  ...parseChiayiRoster(chiayiDistrict2Html, '2'),
];
if (chiayiRoster.length < 18) throw new Error(`安全中止：嘉義市官方名單只解析到 ${chiayiRoster.length} 位`);

let completed = 0;
const chiayi = await mapLimit(chiayiRoster, 4, async (member) => {
  const row = { ...member, error: '' };
  try {
    row.facebook = parseFacebook(await fetchText(member.detailUrl));
  } catch (error) {
    row.error = error?.message || String(error);
  }
  completed += 1;
  console.log(`[${completed}/${chiayiRoster.length}] 嘉義市 ${row.name}: ${row.facebook ? 'Facebook 已核對' : '官方頁未列 Facebook'}`);
  return row;
});

const yunlinResult = applyOfficialMembers(overrides, '10009', yunlin, 30, 'ylcc-official-sync');
const chiayiResult = applyOfficialMembers(overrides, '10020', chiayi, 18, 'cycc-official-sync');
const generatedAt = new Date().toISOString();
const report = {
  generatedAt,
  sources: [YLCC_SOURCE, CYCC_SOURCE],
  verification: '照片與 Facebook 僅取自雲林縣議會、嘉義市議會本屆議員列表及個別官方介紹頁；只補空值，不覆蓋既有資料。雲林官方頁若只有「前往 FB」文字但沒有可驗證連結，Facebook 保持空白。',
  yunlin: { officialCount: yunlin.length, ...yunlinResult, councilors: yunlin },
  chiayiCity: {
    officialCount: chiayi.length,
    officialFacebook: chiayi.filter((member) => member.facebook).length,
    errors: chiayi.filter((member) => member.error).map(({ name, detailUrl, error }) => ({ name, detailUrl, error })),
    ...chiayiResult,
    councilors: chiayi,
  },
};

await Promise.all([
  writeFile(overridesPath, `${JSON.stringify(overrides)}\n`),
  writeFile(path.join(root, 'data', 'ylcc_cycc_councilors.json'), `${JSON.stringify(report, null, 2)}\n`),
]);

console.log(JSON.stringify({
  yunlin: {
    official: yunlin.length,
    matched: yunlinResult.matched,
    unmatched: yunlinResult.unmatched.length,
    photosAdded: yunlinResult.photosAdded,
    photosPreserved: yunlinResult.photosPreserved,
    facebookAdded: yunlinResult.facebookAdded,
  },
  chiayiCity: {
    official: chiayi.length,
    matched: chiayiResult.matched,
    unmatched: chiayiResult.unmatched.length,
    officialFacebook: report.chiayiCity.officialFacebook,
    photosAdded: chiayiResult.photosAdded,
    photosPreserved: chiayiResult.photosPreserved,
    facebookAdded: chiayiResult.facebookAdded,
    errors: report.chiayiCity.errors.length,
  },
}, null, 2));
