import { readFile, writeFile } from 'node:fs/promises';

const COUNTY_ID = '65000';
const FILE = new URL('../data/counties.json', import.meta.url);

// 第三輪：完成新北市逐人查核後，僅納入可取得穩定 Facebook URL 且身分可交叉確認者。
// 不使用搜尋結果裡只有 share/...、無法確認同名身分，或僅推測 username 的網址。
const facebookByName = {
  '張昭隆': 'https://www.facebook.com/wangyeDirector',
  '蔣根煌': 'https://www.facebook.com/profile.php?id=100063630175655',
  '甘崇緯': 'https://www.facebook.com/Pugubird/',
  '陳俊維': 'https://www.facebook.com/profile.php?id=100001963734337',
  '董俊良': 'https://www.facebook.com/people/%E8%91%A3%E4%BF%8A%E8%89%AF/100001229912411',
  '曾煥嘉': 'https://www.facebook.com/cenghuanjia',
  '羅文崇': 'https://www.facebook.com/wen20141129',
  '邸聖德': 'https://www.facebook.com/KMTi2026',
  '張佑輔': 'https://www.facebook.com/twservant',
  '陳乃瑜': 'https://www.facebook.com/newsevalynchen',
  '游皓麟': 'https://www.facebook.com/Xindianhaolin/',
  '林裔綺': 'https://www.facebook.com/pages/%E6%9E%97%E8%A3%94%E7%B6%BA%E7%B2%89%E7%B5%B2%E5%9C%98/1410569355864524',
  '黃瑞傳': 'https://www.facebook.com/people/%E9%BB%83%E7%91%9E%E5%82%B3/100005145967522',
  '宋雨蓁Nikar‧Falong': 'https://www.facebook.com/nikar.falong',
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
if (missingNames.length) throw new Error(`安全中止：已驗證姓名不在新北市名冊：${missingNames.join('、')}`);
if (conflicts.length) throw new Error(`安全中止：既有 Facebook 衝突：${JSON.stringify(conflicts)}`);

await writeFile(FILE, `${JSON.stringify(topo)}\n`, 'utf8');
console.log(JSON.stringify({
  countyId: COUNTY_ID,
  verifiedLinks: Object.keys(facebookByName).length,
  filled: filled.length,
  filledNames: filled,
  alreadySame: alreadySame.length,
  conflicts: conflicts.length,
}, null, 2));
