import { readFile, writeFile } from 'node:fs/promises';

const COUNTY_ID = '66000';
const FILE = new URL('../data/counties.json', import.meta.url);

// 第二階段：逐人查核後，只納入可確認身分且有穩定網址的 Facebook / 照片。
// Facebook 來源優先為本人服務處、官方帳號、可信新聞明示網址或結構化公開資料。
// 照片僅用可長期載入、授權清楚的直接／穩定轉址圖片來源。
const verified = {
  '王立任': {
    facebook: 'https://www.facebook.com/wanglizen.coastline',
  },
  '謝志忠': {
    facebook: 'https://www.facebook.com/%E8%AC%9D%E5%BF%97%E5%BF%A0-%E5%B9%AB%E6%82%A8%E8%AC%9B%E8%A9%B1-1627016040846724/',
  },
  '吳佩芸': {
    facebook: 'https://www.facebook.com/peiyunjump',
  },
  '張耀中': {
    facebook: 'https://www.facebook.com/ChangYaoChung',
    photoUrl: 'https://commons.wikimedia.org/wiki/Special:Redirect/file/%E5%BC%B5%E8%80%80%E4%B8%AD%E8%AD%B0%E5%93%A1%E5%A4%A7%E9%A0%AD%E7%85%A7.jpg',
  },
  '楊寶楨': {
    facebook: 'https://www.facebook.com/baojhenyang',
    photoUrl: 'https://commons.wikimedia.org/wiki/Special:Redirect/file/%E6%A5%8A%E5%AF%B6%E6%A5%A8.jpg',
  },
  '陳雅惠': {
    facebook: 'https://www.facebook.com/profile.php?id=100063641293200',
  },
  '江和樹': {
    facebook: 'https://www.facebook.com/p/%E6%B1%9F%E5%92%8C%E6%A8%B9-100047297856752',
  },
  '詹智翔': {
    facebook: 'https://www.facebook.com/profile.php?id=61572317135945',
  },
  '蔡怡萱': {
    facebook: 'https://www.facebook.com/syuan0701',
  },
  '劉芩妤': {
    photoUrl: 'https://mimi168.tw/images/hero-mimi.png',
  },
};

const topo = JSON.parse(await readFile(FILE, 'utf8'));
const geometries = topo?.objects?.map?.geometries || [];
const county = geometries.find(g => String(g?.properties?.id) === COUNTY_ID);
if (!county) throw new Error(`找不到臺中市 ${COUNTY_ID}`);

const blocks = Array.isArray(county.properties?.councilors?.blocks)
  ? county.properties.councilors.blocks
  : (Array.isArray(county.properties?.councilors) ? county.properties.councilors : []);

const cleanName = v => String(v || '').replace(/[\s\u3000]/g, '').trim();
const byName = new Map();
for (const block of blocks) {
  for (const c of block?.candidates || []) {
    const name = cleanName(c?.name);
    if (!name) continue;
    if (byName.has(name)) throw new Error(`安全中止：候選名冊有重複姓名 ${c.name}`);
    byName.set(name, c);
  }
}

const missingNames = [];
const conflicts = [];
const facebookFilled = [];
const photoFilled = [];

for (const [rawName, incoming] of Object.entries(verified)) {
  const c = byName.get(cleanName(rawName));
  if (!c) {
    missingNames.push(rawName);
    continue;
  }

  if (incoming.facebook) {
    if (!/^https:\/\/(www\.)?facebook\.com\//i.test(incoming.facebook)) {
      throw new Error(`Facebook URL 格式錯誤：${rawName}`);
    }
    const existing = String(c.facebook || '').trim();
    if (existing && existing !== incoming.facebook) {
      conflicts.push({ name: rawName, field: 'facebook', existing, incoming: incoming.facebook });
    } else if (!existing) {
      c.facebook = incoming.facebook;
      facebookFilled.push(rawName);
    }
  }

  if (incoming.photoUrl) {
    if (!/^https:\/\//i.test(incoming.photoUrl)) throw new Error(`照片 URL 格式錯誤：${rawName}`);
    const existing = String(c.photoUrl || '').trim();
    if (existing && existing !== incoming.photoUrl) {
      conflicts.push({ name: rawName, field: 'photoUrl', existing, incoming: incoming.photoUrl });
    } else if (!existing) {
      c.photoUrl = incoming.photoUrl;
      photoFilled.push(rawName);
    }
  }
}

if (missingNames.length) throw new Error(`安全中止：已驗證姓名不在臺中候選名冊：${missingNames.join('、')}`);
if (conflicts.length) throw new Error(`安全中止：既有資料衝突：${JSON.stringify(conflicts)}`);

await writeFile(FILE, `${JSON.stringify(topo)}\n`, 'utf8');
console.log(JSON.stringify({
  countyId: COUNTY_ID,
  verifiedPeople: Object.keys(verified).length,
  facebookFilled: facebookFilled.length,
  facebookNames: facebookFilled,
  photoFilled: photoFilled.length,
  photoNames: photoFilled,
  conflicts: conflicts.length,
}, null, 2));
