import { readFile, writeFile, access } from 'node:fs/promises';

// 已有 Facebook、但沒有照片的候選人：使用 Facebook 個人檔案大頭照（80×80 JPEG，已存於 photos/fb/）。
// 每張照片在擷取時都比對過 Facebook 頁面頭像的 aria-label 與候選人姓名。
// 另外補上有第一手來源（政黨候選人頁、本人網站／Linktree）確認的 Instagram / YouTube。
// 只填空白、不覆蓋；姓名必須在該縣市內唯一。
const FILE = new URL('../data/counties.json', import.meta.url);
const PHOTOS = [
  ["09007", "王忠銘", "dd304bbb"],
  ["09020", "陳玉珍", "5f020465"],
  ["09020", "梁文韜", "6ca5176f"],
  ["10002", "吳宗憲", "d4f88bb7"],
  ["10002", "林國漳", "c52630c1"],
  ["10007", "陳重嘉", "61a06125"],
  ["10007", "陳素月", "79166113"],
  ["10007", "邱建富", "bf085509"],
  ["10008", "許淑華", "dd80fcf4"],
  ["10009", "張嘉郡", "ad642539"],
  ["10009", "劉建國", "c07701db"],
  ["10013", "蘇清泉", "a2ef8a80"],
  ["10013", "周春米", "edebef9e"],
  ["10014", "陳瑩", "b3e4ad4a"],
  ["10014", "吳秀華", "426c56ad"],
  ["10015", "張峻", "d6d93722"],
  ["10015", "魏嘉賢", "8fb5cd51"],
  ["10016", "周倪安", "b0f0e8e0"],
  ["10016", "葉竹林", "aed483d5"],
  ["10017", "謝國樑", "76b45b4b"],
  ["10017", "童子瑋", "c4a67262"],
  ["10017", "林廷翰", "9fb46193"],
  ["10017", "李嘉濠", "1a88514a"],
  ["10017", "呂承祐", "d4077a65"],
  ["10017", "李文耀", "86fa59cd"],
  ["10017", "劉韋巡", "2c06c32a"],
  ["10017", "戴璟安", "86b01db4"],
  ["10018", "高虹安", "00bd62a7"],
  ["10018", "莊競程", "591090f2"],
  ["10018", "何志勇", "1a190e91"],
  ["63000", "沈伯洋", "17335b6c"],
  ["63000", "蔣萬安", "942cee3e"],
  ["63000", "吳欣岱", "637aa339"],
  ["63000", "高嘉瑜", "d92c97c1"],
  ["65000", "蘇巧慧", "9340ca80"],
  ["65000", "李四川", "5d43e6fb"],
  ["65000", "張昭隆", "f54fc601"],
  ["65000", "甘崇緯", "fd043eda"],
  ["65000", "陳俊維", "6e1df8c4"],
  ["65000", "董俊良", "78f064c6"],
  ["65000", "邸聖德", "17e58b7c"],
  ["65000", "張佑輔", "67e013c3"],
  ["65000", "游皓麟", "0cf65719"],
  ["65000", "黃瑞傳", "96fdf526"],
  ["66000", "何欣純", "00bcfa94"],
  ["66000", "江啟臣", "eecb3e98"],
  ["66000", "陳永祥", "6df29418"],
  ["66000", "蔡怡萱", "9e66d947"],
  ["66000", "陳映辰", "db9ee25d"],
  ["66000", "林鈺梅", "59c0906b"],
  ["66000", "邱于珊", "1c641ac7"],
  ["66000", "段體佩", "905cb574"],
  ["66000", "曾咨耀", "8d1125ff"],
  ["66000", "陳諭韋", "66ea1082"],
  ["66000", "簡嘉佑", "6123d1c1"],
  ["66000", "何翊綾", "6ddfedf5"],
  ["66000", "周啓揚", "a1373dc6"],
  ["66000", "許書豪", "afb8eade"],
  ["66000", "張書華", "8a87a4e6"],
  ["66000", "鄒明諺", "548fcf90"],
  ["66000", "詹智翔", "b94b4f65"],
  ["67000", "謝龍介", "9fc6ec4b"],
  ["67000", "陳亭妃", "af4ccbc8"],
  ["68000", "張善政", "fddbbaee"],
  ["68000", "黃世杰", "ecdf2de0"],
  ["68000", "劉安祺", "921f6562"],
  ["10005", "陳品安", "fcef429b"],
  ["10005", "鍾東錦", "f18c8939"],
  ["10004", "鄭朝方", "83ec3997"],
  ["10004", "徐欣瑩", "c6aff5cf"],
  ["10020", "張啓楷", "4e188acf"],
  ["10020", "王美惠", "c4ad0451"],
  ["10010", "蔡易餘", "04ee5230"],
  ["64000", "賴瑞隆", "c37c75c7"],
  ["64000", "柯志恩", "ecaf62ef"]
];
// [姓名, 欄位, 網址]
const SOCIAL = [
  ['蔡怡萱', 'instagram', 'https://www.instagram.com/syuan_0701'],
  ['劉芩妤', 'instagram', 'https://www.instagram.com/mimicfight'],
  ['劉芩妤', 'youtube', 'https://www.youtube.com/@Mimi%E5%8A%89%E8%8A%A9%E5%A6%A4'],
  ['陳永祥', 'instagram', 'https://www.instagram.com/voteoceanaxiang'],
  ['邱愛珊', 'instagram', 'https://www.instagram.com/5423chiu/'],
  ['邱愛珊', 'youtube', 'https://www.youtube.com/@5423chiu'],
  ['林鈺梅', 'instagram', 'https://www.instagram.com/yumeilin.1017'],
  ['林鈺梅', 'youtube', 'https://www.youtube.com/@yumeilin.1017'],
  ['張書華', 'instagram', 'https://www.instagram.com/tpahua0402'],
  ['李嘉濠', 'instagram', 'https://www.instagram.com/bluemapstrategy'],
  ['林廷翰', 'instagram', 'https://www.instagram.com/lth.9116.keelung'],
  ['李文耀', 'instagram', 'https://www.instagram.com/edwardlee2507'],
  ['李文耀', 'youtube', 'https://www.youtube.com/channel/UCDbOyidtr9zPl3iDUk-mEKg'],
  ['呂承祐', 'instagram', 'https://www.instagram.com/tpp.lcy'],
  ['劉韋巡', 'instagram', 'https://www.instagram.com/andyliu0331'],
];

const clean = s => String(s || '').normalize('NFKC').replace(/[・．·‧\s　]/g, '');
const topo = JSON.parse(await readFile(FILE, 'utf8'));
const geoms = topo.objects.map.geometries;

const people = c => {
  const p = c.properties;
  const list = [...(p.candidates || []).map(x => ({ x, kind: 'mayor' }))];
  const blocks = Array.isArray(p.councilors?.blocks) ? p.councilors.blocks : (Array.isArray(p.councilors) ? p.councilors : []);
  for (const b of blocks) for (const x of b.candidates || []) list.push({ x, kind: 'councilor' });
  return list;
};

const report = { photosFilled: 0, socialFilled: 0, skipped: [] };

for (const [id, name, sha] of PHOTOS) {
  const g = geoms.find(g => String(g.properties.id) === id);
  const hits = people(g).filter(r => clean(r.x.name) === clean(name));
  if (hits.length !== 1) { report.skipped.push(`${g.properties.name} ${name}: 同名 ${hits.length}`); continue; }
  const c = hits[0].x;
  if (!String(c.facebook || '').trim()) { report.skipped.push(`${name}: 無 Facebook`); continue; }
  if (String(c.photoUrl || '').trim()) continue;
  await access(new URL(`../photos/fb/${sha}.jpg`, import.meta.url));
  c.photoUrl = `/photos/fb/${sha}.jpg`;
  report.photosFilled += 1;
}

for (const [name, field, url] of SOCIAL) {
  const hits = geoms.flatMap(g => people(g).filter(r => clean(r.x.name) === clean(name)).map(r => ({ g, c: r.x })));
  if (hits.length !== 1) { report.skipped.push(`${name}.${field}: 全資料命中 ${hits.length} 筆`); continue; }
  const { c } = hits[0];
  if (String(c[field] || '').trim()) continue;
  c[field] = url;
  report.socialFilled += 1;
}

await writeFile(FILE, `${JSON.stringify(topo)}\n`, 'utf8');
console.log(JSON.stringify(report, null, 2));
