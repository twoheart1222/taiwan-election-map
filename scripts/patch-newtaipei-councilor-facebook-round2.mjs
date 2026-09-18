import { readFile, writeFile } from 'node:fs/promises';

const COUNTY_ID = '65000';
const FILE = new URL('../data/counties.json', import.meta.url);

// 第二輪：議會官方頁未直接列 FB，但已由本人網站、政府/政黨頁、
// 持續更新的本人社群鏡像或多來源交叉確認。
const facebookByName = {
  '鄭宇恩': 'https://www.facebook.com/yuencheng1986',
  '蔡淑君': 'https://www.facebook.com/profile.php?id=100003586138208',
  '蔡健棠': 'https://www.facebook.com/BBTtou/',
  '邱婷蔚': 'https://www.facebook.com/TingweiChiu',
  '山田摩衣': 'https://www.facebook.com/yamada.banqiao',
  '林秉宥': 'https://www.facebook.com/profile.php?id=100015507095868',
  '林金結': 'https://www.facebook.com/%E6%9E%97%E9%87%91%E7%B5%90-659037314174633/',
  '劉哲彰': 'https://www.facebook.com/clarkliuntc',
  '陳儀君': 'https://www.facebook.com/e.dream.sindian.fans',
  '彭一書': 'https://www.facebook.com/abook1028',
  '白珮茹': 'https://www.facebook.com/FansPai/',
  '張嘉玲': 'https://www.facebook.com/102978608998815/',
};

const topo = JSON.parse(await readFile(FILE, 'utf8'));
const geometries = topo?.objects?.map?.geometries;
if (!Array.isArray(geometries)) throw new Error('找不到 topo.objects.map.geometries');

const county = geometries.find(g => String(g?.properties?.id) === COUNTY_ID);
if (!county) throw new Error(`找不到新北市 ${COUNTY_ID}`);

const councilors = county.properties?.councilors;
const blocks = Array.isArray(councilors?.blocks)
  ? councilors.blocks
  : Array.isArray(councilors)
    ? councilors
    : [];

const found = new Set();
const filled = [];
const alreadySame = [];
const conflicts = [];

for (const block of blocks) {
  for (const candidate of block?.candidates || []) {
    const url = facebookByName[candidate?.name];
    if (!url) continue;
    found.add(candidate.name);

    if (!/^https:\/\/(www\.)?facebook\.com\//i.test(url)) {
      throw new Error(`Facebook URL 格式錯誤：${candidate.name} ${url}`);
    }

    const existing = String(candidate.facebook || '').trim();
    if (existing && existing !== url) {
      conflicts.push({ name: candidate.name, existing, incoming: url });
      continue;
    }
    if (existing === url) {
      alreadySame.push(candidate.name);
      continue;
    }
    candidate.facebook = url;
    filled.push(candidate.name);
  }
}

const missingNames = Object.keys(facebookByName).filter(name => !found.has(name));
if (missingNames.length) {
  throw new Error(`安全中止：以下已驗證姓名不在新北市網站名冊：${missingNames.join('、')}`);
}
if (conflicts.length) {
  throw new Error(`安全中止：既有 Facebook 與本批資料衝突：${JSON.stringify(conflicts)}`);
}

await writeFile(FILE, `${JSON.stringify(topo)}\n`, 'utf8');
console.log(JSON.stringify({
  countyId: COUNTY_ID,
  verifiedLinks: Object.keys(facebookByName).length,
  filled: filled.length,
  filledNames: filled,
  alreadySame: alreadySame.length,
  conflicts: conflicts.length,
}, null, 2));
