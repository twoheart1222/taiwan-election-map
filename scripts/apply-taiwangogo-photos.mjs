import { readFile, writeFile } from 'node:fs/promises';
// 沒有 Facebook、也沒有照片的候選人：若「台灣前進 2026 議員參選人刑事紀錄圖鑑」
// (https://council2026.taiwangogo.tw) 有收錄，就取用該站的大頭照（依 縣市＋選區＋姓名 對應）。
// 只填空白、不覆蓋；已有 Facebook 或照片者不動。網址為外部圖片，請用後台「一鍵快取現有照片」搬到本站。
const FILE = new URL('../data/counties.json', import.meta.url);
const BASE = 'https://council2026.taiwangogo.tw/assets/photos/';
// [縣市代碼, 選區(M=縣市長), 姓名, 圖片檔名]
const DATA = [["63000","1","李文","4e9db6e1e91a63b62cd40b9a"],["63000","1","林揚庭","e0ca01078c9f44f95202e9f7"],["63000","1","賴苡任","9ee2caefb87df520586bbd46"],["63000","3","許原榮","85d3a793607a65a89dd652ec"],["63000","5","應佳妤","ff6222992b26bc59280c6622"],["63000","6","李道翔","9aae53c31f640fe0f83f6fa8"],["63000","6","游智彬","2eeb714dc153ee7074e6f11a"],["63000","8","李傅鈺婷","a26f876f9f8028a255dd0fc2"],["65000","5","周韋翰","095ea46da14a73b758bd0d67"],["65000","12","忠仁‧達祿斯","0079b2411420f6ab56bd3a88"],["68000","1","朱永煇","5241eae8a661fec89dd2a7e0"],["68000","1","蕭湘瀚","628bc12176c2eb63f030899c"],["68000","1","李凱倫","110e2eee154cff924719aa2f"],["68000","3","段林淑婷","5935e867f06eabb3271ae4a4"],["68000","3","劉茂羣","4cd5e726ed53795bc6f6266f"],["68000","4","郭麗華","4c56ad9f2731ab18a7e3c71a"],["68000","7","毛嘉慶","b33f0aa6dd549ecc8fc5216b"],["68000","10","吳平娥","a0987c17eb248bf36163cbb6"],["68000","14","林秋霖","32b90f559b177b15412024c4"],["68000","14","張倉豪","3ff3fc5df406ac5ada5ea4e2"],["66000","3","林汝洲","7ae98767abd8168cd6c4cbfa"],["66000","13","鄭伯其","86ba52f9111e78562cd6d890"],["64000","2","陳琳潔","c6ea6451c09af01363dbb879"],["64000","7","黃淑美","88cad9ff0514604cabe637fe"],["64000","7","童燕珍","7cb99e5c1a605faedacc6de9"],["64000","8","鄒約翰","70ea421ec68ab794e68be783"],["64000","8","黃鈺婷","3fe08427d048cdd7e55f17ba"],["64000","9","徐尚賢","d43198ea198c06d24b659bb4"],["10002","1","莊淑如","ca247eca6bdfccf437a032fb"],["10002","12","陳傑麟","2c2c89748ee562a755cfdcdc"],["10004","3","余筱菁","db6f49fe0c503efbf221abd0"],["10004","9","羅俊傑","291f7a784e084bebf3ce60d5"],["10005","5","鍾孟儒","7ff2b9d59152d7e8117e7ff2"],["10005","5","温俊勇","0ae386368c19199256e8cd56"],["10005","8","劉美蘭 Iwan．Sigiy","24b9cc36532b4ae09efbe792"],["10007","1","顧勝敏","5a12bc18f39cca28dd45b7bf"],["10007","3","曾煥燁","d0101e7b59872c82cd9f56f7"],["10007","3","鍾雅茹","be31868a787a5d09e32efb77"],["10007","4","賴澤民","277b2c94f1c8f056667a1482"],["10007","4","張愉婕","668727fd91a525261df67752"],["10007","5","黃佳惠","c27974fd7238e81af9c7a317"],["10007","6","蕭岳倫","9703c69bb0e426e0b78601e4"],["10008","1","賴燕雪","89b2874343a257ac8036e4b0"],["10008","2","簡百聰","05ce8b8ae677684cd3b53b5c"],["10008","4","林哲生","d3016f983ab2dedcf0e6b0f5"],["10008","5","羅俞欣","125d80ca9df41ed3a9e7a19f"],["10008","7","田東憲","d3ff20ee3313c864eff41939"],["10008","7","全文才Balan‧Soqluman","790775d92db09e27b769e36a"],["10009","1","王竣毅","33a85b44c230792ac801ba4d"],["10009","2","吳延豐","dcb63f186b6e3a0b0dfec9c6"],["10009","3","沈昱霆","c8ed46db0317b0a02d5612af"],["10009","4","李泓儀","2c285e9b590816efd4872cba"],["10009","4","楊智凱","97b0483e7cf1879b4c37700c"],["10009","5","蔡永順","faf31e27a7037ec9d5ffd485"],["10009","5","蘇國誼","44dc8cb76d5c2521d8b1f258"],["10009","6","黃美蘭","a7ca84d623afcb2b995441c2"],["10009","8","蔡嘉峻PisawHakaw","45f397a689336178ae29a55c"],["10010","6","何博倫","418ad55b7e497d4e97cf09c1"],["10013","2","王景山","cac9dee4f66a276199df30c9"],["10013","3","潘連周","48e4406a86491879b0b1b010"],["10013","4","方冠丁","6c0a461113c3802e9290886b"],["10013","4","周芸均","a6d0cd87c6ec6772d5c2d5c5"],["10015","6","邱福順Kacaw．Folaw","d727a6848c006cf834982954"],["10014","1","傅文鵬","bf0583de2485ad4a7f447dcc"],["10014","1","王春梅","a5cbec35bd10cecfbf3b7d56"],["09007","1","吳軾子","62409564411db986974c9dff"],["09007","1","曹以標","fa7849915509f08b0aad8361"],["09007","3","王孝榛","2f2b3be2ab6709289e2afe6a"],["10020","1","郭文居","328627445b9eceb712829a86"],["10020","2","林子淨","20ab9dcf01453ff686be2153"],["10020","2","魏志軒","66cc283adff7c77db4ab7840"],["67000","6","唐儀靜","37c4b7502d933895c7afdae8"],["67000","6","郭品辰","43313075d085c0563ab7b25e"],["67000","7","曹暐國","f0f4dab4a5596c688f116b8f"],["67000","8","鄭方形","7693afeab165beddd43d73b9"],["09020","1","尚文凱","1df8246971f62d27f6276e0b"],["09020","1","楊霈璿","fdd577b9ff4aa80f661dab1b"],["09020","2","陳麒翔","e9460291f97038c0f7fd11eb"],["09020","2","楊育菡","80c4707537bb182079f3a90e"],["64000","M","張靜","52527d645f1078c9e36161c7"],["09020","M","張國威","b3bc10ff6902296ca911a8b1"]];
const clean = s => String(s || '').normalize('NFKC').replace(/[・．·‧\s　]/g, '');
const topo = JSON.parse(await readFile(FILE, 'utf8'));
const geoms = topo.objects.map.geometries;
const rep = { filled: 0, skipped: [] };
for (const [id, dist, name, hash] of DATA) {
  const p = geoms.find(g => String(g.properties.id) === id)?.properties;
  if (!p) { rep.skipped.push(name + ':無縣市'); continue; }
  let pool;
  if (dist === 'M') pool = p.candidates || [];
  else {
    const blocks = Array.isArray(p.councilors?.blocks) ? p.councilors.blocks : (Array.isArray(p.councilors) ? p.councilors : []);
    pool = blocks.filter(b => String(b.district) === dist).flatMap(b => b.candidates || []);
  }
  const hits = pool.filter(c => clean(c.name) === clean(name));
  if (hits.length !== 1) { rep.skipped.push(name + ':命中' + hits.length); continue; }
  const c = hits[0];
  if (String(c.facebook || '').trim() || String(c.photoUrl || '').trim()) continue;
  c.photoUrl = BASE + hash + '.jpg';
  rep.filled += 1;
}
await writeFile(FILE, `${JSON.stringify(topo)}\n`, 'utf8');
console.log(JSON.stringify(rep, null, 2));
