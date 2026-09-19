import { readFile, writeFile } from 'node:fs/promises';

const COUNTY_ID = '10017';
const FILE = new URL('../data/counties.json', import.meta.url);
const PHOTO_BASE = 'https://www.kmc.gov.tw/images/member/2022/';

// 基隆市議員（2026-09-19）
// 1) 現任 23 位：Facebook 與照片來自基隆市議會官方議員頁（https://www.kmc.gov.tw/index.php/mac/mi）。
//    - 郭美秀：官方頁 Facebook id 少一碼（10000370913000），已依搜尋到的個人頁更正為 100003709130009。
//    - 張芳麗：官方頁社群欄為「無」，只補照片。
// 2) 新人：只補有可靠來源者。
//    A = 政黨官方候選人頁、本人競選網站或 Linktree 明列
//    B = 搜尋結果中的個人頁標題與姓名相符，且情境（拆樑領銜人、七堵）吻合
//    其餘查無可靠來源者一律留白（不在此清單內）。
const verified = {
  // ── 現任（官方議員頁） ──
  '藍敏煌': { facebook: 'https://www.facebook.com/keelungblue', photo: 'km01.jpg' },
  '呂美玲': { facebook: 'https://www.facebook.com/profile.php?id=1534122228', photo: 'kmc004.jpg' },
  '韓世昱': { facebook: 'https://www.facebook.com/bruce.hang', photo: 'kmc019.jpg' },
  '陳軍佐': { facebook: 'https://www.facebook.com/profile.php?id=100080191479528', photo: '2022m02-cjz.jpg' },
  '陳宜': { facebook: 'https://www.facebook.com/chenyi.lovekeelung', photo: 'kmc015.jpg' },
  '何淑萍': { facebook: 'https://www.facebook.com/profile.php?id=100000063837269', photo: 'km08.jpg' },
  '張芳麗': { photo: 'kmc010.jpg' },
  '鄭文婷': { facebook: 'https://www.facebook.com/ting.keelung', photo: 'kmc018.jpg' },
  '施偉政': { facebook: 'https://www.facebook.com/shihweijeng', photo: '2022m05-swz.jpg' },
  '宋瑋莉': { facebook: 'https://www.facebook.com/sungweili', photo: 'km16.jpg' },
  '郭美秀': { facebook: 'https://www.facebook.com/profile.php?id=100003709130009', photo: '2022m04-gmx.jpg' },
  '鄭愷玲': { facebook: 'https://www.facebook.com/TheWarmRing', photo: 'kmc020.jpg' },
  '俞叁發': { facebook: 'https://www.facebook.com/sanfa.shu', photo: 'km19.jpg' },
  '吳驊珈': { facebook: 'https://www.facebook.com/HuaJiaGo', photo: '2022m07-whj.jpg' },
  '張之豪': { facebook: 'https://www.facebook.com/JihoTiun', photo: 'kmc008.jpg' },
  '秦鉦': { facebook: 'https://www.facebook.com/www.inkololo.chin', photo: 'kmc007.jpg' },
  '連恩典': { facebook: 'https://www.facebook.com/profile.php?id=100008389719047', photo: 'kmc014.jpg' },
  '陳冠羽': { facebook: 'https://www.facebook.com/hsing.warm', photo: '2022m08-cgy.jpg' },
  '曾怡芳': { facebook: 'https://www.facebook.com/qidusasa', photo: '2022m09-zyf.jpg' },
  '張耿輝': { facebook: 'https://www.facebook.com/profile.php?id=100018143532582', photo: 'kmc011.jpg' },
  '蔡旺璉': { facebook: 'https://www.facebook.com/profile.php?id=100009885730439', photo: 'kmc021.jpg' },
  '楊秀玉': { facebook: 'https://www.facebook.com/yhy1031225', photo: 'km30.jpg' },
  '陳明建': { facebook: 'https://www.facebook.com/profile.php?id=100003527241479', photo: 'kmc016.jpg' },
  // ── 新人 A：政黨候選人頁／本人網站 ──
  '林廷翰': { facebook: 'https://www.facebook.com/share/1Fuoe1wLLb' }, // 民眾黨官網候選人頁
  '呂承祐': { facebook: 'https://www.facebook.com/tpp.lcy' }, // 民眾黨官網候選人頁
  '李文耀': { facebook: 'https://www.facebook.com/share/1CzdTSKnxt' }, // 民眾黨官網候選人頁
  '李嘉濠': { facebook: 'https://www.facebook.com/share/1CtQXgDoVd' }, // 本人 Linktree（信義新世代 基隆新時代）
  '劉韋巡': { facebook: 'https://www.facebook.com/aliuinkeelung' }, // 本人競選網站 aliu.oen.tw
  // ── 新人 B：搜尋標題與姓名相符 ──
  '戴璟安': { facebook: 'https://www.facebook.com/p/%E6%88%B4%E7%92%9F%E5%AE%89-100000469353517' },
};

const topo = JSON.parse(await readFile(FILE, 'utf8'));
const geometries = topo?.objects?.map?.geometries || [];
const county = geometries.find(g => String(g?.properties?.id) === COUNTY_ID);
if (!county) throw new Error(`找不到基隆市 ${COUNTY_ID}`);

const blocks = Array.isArray(county.properties?.councilors?.blocks)
  ? county.properties.councilors.blocks
  : (Array.isArray(county.properties?.councilors) ? county.properties.councilors : []);

const cleanName = v => String(v || '').replace(/[\s　]/g, '').trim();
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
  if (!c) { missingNames.push(rawName); continue; }

  if (incoming.facebook) {
    if (!/^https:\/\/www\.facebook\.com\//i.test(incoming.facebook) || /\/$/.test(incoming.facebook)) {
      throw new Error(`Facebook URL 格式錯誤：${rawName} ${incoming.facebook}`);
    }
    const existing = String(c.facebook || '').trim();
    if (existing && existing !== incoming.facebook) conflicts.push({ name: rawName, field: 'facebook', existing, incoming: incoming.facebook });
    else if (!existing) { c.facebook = incoming.facebook; facebookFilled.push(rawName); }
  }

  if (incoming.photo) {
    const url = PHOTO_BASE + incoming.photo;
    if (!/^https:\/\/www\.kmc\.gov\.tw\/images\/member\/2022\/[\w.-]+\.(jpg|gif|png)$/i.test(url)) {
      throw new Error(`照片 URL 格式錯誤：${rawName} ${url}`);
    }
    const existing = String(c.photoUrl || '').trim();
    if (existing && existing !== url) conflicts.push({ name: rawName, field: 'photoUrl', existing, incoming: url });
    else if (!existing) { c.photoUrl = url; photoFilled.push(rawName); }
  }
}

if (missingNames.length) throw new Error(`安全中止：已驗證姓名不在基隆候選名冊：${missingNames.join('、')}`);
if (conflicts.length) throw new Error(`安全中止：既有資料衝突：${JSON.stringify(conflicts)}`);

await writeFile(FILE, `${JSON.stringify(topo)}\n`, 'utf8');
console.log(JSON.stringify({
  countyId: COUNTY_ID,
  verifiedPeople: Object.keys(verified).length,
  facebookFilled: facebookFilled.length,
  photoFilled: photoFilled.length,
  facebookNames: facebookFilled,
  photoNames: photoFilled,
}, null, 2));
