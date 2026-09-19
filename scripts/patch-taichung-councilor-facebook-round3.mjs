import { readFile, writeFile } from 'node:fs/promises';

const COUNTY_ID = '66000';
const FILE = new URL('../data/counties.json', import.meta.url);

// 第三階段（2026-09-19）：
// 1) 臺中市議會官方名冊（data/tccc_councilors.json）的 Facebook / 照片已與網站完全一致，這裡不再重複套用。
// 2) 以下為逐人查核後才補入的 Facebook。來源分級：
//    A = 候選人本人／所屬政黨官方候選人頁、本人競選網站或 Linktree 明列
//    B = 搜尋結果中的粉絲專頁標題含本人姓名，且帶有選區／口號／帳號 handle 可與其他公開帳號互相對應
// 查不到可靠來源者一律留白（不在此清單內）。
// 照片：非現任者僅接受政府或 Wikimedia Commons 來源；本輪沒有可驗證者，因此不新增。
const verified = {
  // ── A：官方／本人來源 ──
  '蔡怡萱': 'https://www.facebook.com/syuan0701', // 本人 Linktree
  '陳永祥': 'https://www.facebook.com/profile.php?id=100034584800457', // 民眾黨官網候選人頁
  '劉芩妤': 'https://www.facebook.com/MimiCo0913', // 民眾黨官網候選人頁
  '許書豪': 'https://www.facebook.com/share/1CWeu6kPMU', // 民眾黨官網候選人頁（分享連結）
  '林鈺梅': 'https://www.facebook.com/profile.php?id=61572754954500', // 本人競選網站 yumeilin.tw
  '張書華': 'https://www.facebook.com/profile.php?id=61572718089448', // 本人 Linktree（太平阿華）
  '周啓揚': 'https://www.facebook.com/SEnewpower', // 本人競選網站 youngchou.oen.tw
  '邱愛珊': 'https://www.facebook.com/5423chiu', // 帳號與本人網站 5423chiu.tw 的 IG/YouTube/LINE 一致
  // ── B：搜尋標題含本人姓名＋選區／口號／帳號對應 ──
  '簡嘉佑': 'https://www.facebook.com/kaiutwn', // 與 Threads @kaiutwn 同帳號名
  '吳呈賢': 'https://www.facebook.com/wunew1213', // 「雅潭神最用心」
  '謝家宜': 'https://www.facebook.com/p/%E8%AC%9D%E5%AE%B6%E5%AE%9C-%E5%AE%9C%E8%B5%B7%E6%8B%BC%E6%9C%AA%E4%BE%86-100078246512890', // 「宜起拼未來」
  '楊大鋐': 'https://www.facebook.com/dahungtouchyourheart',
  '吳中源': 'https://www.facebook.com/coastlinekeepgoing', // 「吳中源＆吳敏濟 繼續為您服務」（與父親共用服務專頁）
  '曾威': 'https://www.facebook.com/taichungtsengwei',
  '陳俞融': 'https://www.facebook.com/chenitaiwan',
  '林霈涵': 'https://www.facebook.com/p/%E6%9E%97%E9%9C%88%E6%B6%B5-%E5%8F%B0%E4%B8%AD%E5%B8%82%E8%AD%B0%E5%93%A1%E6%9D%B1%E5%8D%80%E5%8D%97%E5%8D%80-100053078032944', // 「林霈涵-台中市議員（東區、南區）」
  '黃佳恬': 'https://www.facebook.com/taipingservice', // 「接勵向前 我是佳恬」
  '張芬郁': 'https://www.facebook.com/Changphenyu', // 與 Threads @chang_phenyu 對應
  '吳振嘉': 'https://www.facebook.com/p/%E5%90%B3%E6%8C%AF%E5%98%89-%E6%8C%AF%E8%88%88%E5%B1%B1%E5%9F%8E-%E6%9C%89%E5%98%89%E5%9C%A8-100082882327363', // 「振興山城 有嘉在」
  '古秀英': 'https://www.facebook.com/kumupihaw', // 「古秀英議員服務團隊」
  '邱于珊': 'https://www.facebook.com/yushancmd', // 「于您同在北屯靠珊」
  '陳映辰': 'https://www.facebook.com/inchen329', // 與 Threads @im.inchen 對應
  '曾咨耀': 'https://www.facebook.com/OnlyTseng', // 與 Threads「曾咨耀|北屯真需耀」對應
  '鄒明諺': 'https://www.facebook.com/MingYen.DaliWufeng', // 「鄒明諺＠大里霧峰」
  '何翊綾': 'https://www.facebook.com/mingchen4417', // 專頁名稱「何翊綾」（帳號沿用其父何敏誠）
  '段體佩': 'https://www.facebook.com/tipeiduan', // 「小市民段體佩」
  '陳諭韋': 'https://www.facebook.com/p/%E5%8F%B0%E4%B8%AD%E5%B8%82%E5%8C%97%E5%B1%AF%E5%8D%80%E5%B8%82%E8%AD%B0%E5%93%A1%E5%8F%83%E9%81%B8%E4%BA%BA-%E9%99%B3%E8%AB%AD%E9%9F%8B-61561671998984', // 「台中市北屯區市議員參選人 陳諭韋」
};

const topo = JSON.parse(await readFile(FILE, 'utf8'));
const geometries = topo?.objects?.map?.geometries || [];
const county = geometries.find(g => String(g?.properties?.id) === COUNTY_ID);
if (!county) throw new Error(`找不到臺中市 ${COUNTY_ID}`);

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
const filled = [];

for (const [rawName, url] of Object.entries(verified)) {
  if (!/^https:\/\/www\.facebook\.com\//i.test(url) || /\/$/.test(url)) {
    throw new Error(`Facebook URL 格式錯誤：${rawName} ${url}`);
  }
  const c = byName.get(cleanName(rawName));
  if (!c) { missingNames.push(rawName); continue; }
  const existing = String(c.facebook || '').trim();
  if (existing && existing !== url) conflicts.push({ name: rawName, existing, incoming: url });
  else if (!existing) { c.facebook = url; filled.push(rawName); }
}

if (missingNames.length) throw new Error(`安全中止：已驗證姓名不在臺中候選名冊：${missingNames.join('、')}`);
if (conflicts.length) throw new Error(`安全中止：既有資料衝突：${JSON.stringify(conflicts)}`);

await writeFile(FILE, `${JSON.stringify(topo)}\n`, 'utf8');
console.log(JSON.stringify({ countyId: COUNTY_ID, verifiedPeople: Object.keys(verified).length, facebookFilled: filled.length, names: filled }, null, 2));
