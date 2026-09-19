import { readFile, writeFile } from 'node:fs/promises';
// 新竹市議員候選人：Facebook（＋第一手來源確認的 IG／Threads／YouTube）。
// 每個 Facebook 頁面都在瀏覽器實際開啟，比對頁面名稱與「新竹市議員（參選人）」等自述後才收錄。
// photoUrl 為 Facebook 大頭照原圖網址（有效期限有限，請於後台「一鍵快取現有照片」搬到本站）。
// 只填空白、不覆蓋；只針對網站上目前尚無照片者附 photoUrl。
const FILE = new URL('../data/counties.json', import.meta.url);
const DATA = [
 {
  "name": "林妤芬",
  "fb": "https://www.facebook.com/profile.php?id=61579331195688",
  "ig": "https://www.instagram.com/attorney_sophialin",
  "th": "https://www.threads.com/@attorney_sophialin",
  "yt": "",
  "photo": "https://scontent.fkhh1-2.fna.fbcdn.net/v/t39.30808-6/813520622_122173961492977706_5551719273555164434_n.jpg?stp=dst-jpg_tt6&cstp=mx1440x1440&ctp=s1080x2048&_nc_cat=108&ccb=1-7&_nc_sid=127cfc&_nc_ohc=zbka5yknPkcQ7kNvwGgoS1D&_nc_oc=Adq5-ILm3VT6VghcKVb3AbzyCtF5qhb-QZqi_yxjqaUxNGzFZXHBhkeVFolvewVpo44&_nc_zt=23&_nc_ht=scontent.fkhh1-2.fna&_nc_gid=iLChkMea5WshiUD0cujXyA&_nc_ss=792a8&oh=00_AQIZJDL88OZD3kIV67i8qaY3pOE3ro2HxgK3xFFw0qk67A&oe=6AB42C13"
 },
 {
  "name": "李玫",
  "fb": "https://www.facebook.com/HsinChu.Mei",
  "ig": "https://www.instagram.com/hsinchusomei",
  "th": "",
  "yt": "https://www.youtube.com/channel/UCu6Pp-SGRmjtq0q1pfAhuig",
  "photo": "https://scontent.fkhh1-1.fna.fbcdn.net/v/t39.30808-6/675384202_1358128429667995_6177960852133246590_n.jpg?stp=dst-jpg_tt6&cstp=mx960x960&ctp=s960x960&_nc_cat=102&ccb=1-7&_nc_sid=6ee11a&_nc_ohc=DLNkRUfT5DwQ7kNvwFYxTnQ&_nc_oc=AdrUu77svaZAuWDXKvfFhW-RF8P5bAbJa0oy0dkP21Wb_nrG1sO7U8rp58Rdfp4M55A&_nc_zt=23&_nc_ht=scontent.fkhh1-1.fna&_nc_gid=B9j6CUkGduAUP5Pb31A5dg&_nc_ss=7b2a8&oh=00_AQLtwgDag7MzMnBBzySJKWMPyHXyIfUuaxY_F_UGtJS7bw&oe=6AB43BD0"
 },
 {
  "name": "張祖琰",
  "fb": "https://www.facebook.com/ChangTsuYen.KMT/",
  "ig": "",
  "th": "",
  "yt": "",
  "photo": ""
 },
 {
  "name": "林士凱",
  "fb": "https://www.facebook.com/p/%E6%9E%97%E5%A3%AB%E5%87%B1-61555693297671/",
  "ig": "",
  "th": "https://www.threads.com/@shihkai_lin",
  "yt": "",
  "photo": "https://scontent.fkhh1-1.fna.fbcdn.net/v/t39.99422-6/816928988_1800723707728431_2729412986891368089_n.png?stp=dst-jpg_tt6&cstp=mx2090x1773&ctp=s2048x2048&_nc_cat=105&ccb=1-7&_nc_sid=127cfc&_nc_ohc=rQyb6dKjKF0Q7kNvwFkW_OT&_nc_oc=Adp20RpGxSs88aspeROxItH4-nel73O97uViDZf9HZR9iZndcHu40s7lN-LLhy0y1r0&_nc_zt=14&_nc_ht=scontent.fkhh1-1.fna&_nc_gid=tjRi6kZlg0xMExTSRPu5ww&_nc_ss=792a8&oh=00_AQK4xc3Q1KfsB9ntVILIKECihfjwyltnVGTqYnIkvKjFoA&oe=6AB43221"
 },
 {
  "name": "鍾淑英",
  "fb": "https://www.facebook.com/ShuYing1012/",
  "ig": "",
  "th": "",
  "yt": "",
  "photo": ""
 },
 {
  "name": "葉國文",
  "fb": "https://www.facebook.com/POWERANDYEH",
  "ig": "https://www.instagram.com/andy_ya_",
  "th": "",
  "yt": "https://www.youtube.com/@YayaIii2",
  "photo": ""
 },
 {
  "name": "曾翰揚",
  "fb": "https://www.facebook.com/Raker.young",
  "ig": "",
  "th": "",
  "yt": "",
  "photo": "https://scontent.fkhh1-1.fna.fbcdn.net/v/t39.99422-6/816928991_1327589949300860_4579448487835890803_n.png?stp=dst-jpg_tt6&cstp=mx1477x1108&ctp=s1477x1108&_nc_cat=102&ccb=1-7&_nc_sid=833d8c&_nc_ohc=9ClAo7dQ7SMQ7kNvwF1btCg&_nc_oc=AdrJnbqq1v5gJOOzDgkvEQ2doRxnxn44eTMg5QUc2PSdQ31m8Qb69Rz4sqIbstcjI_Y&_nc_zt=14&_nc_ht=scontent.fkhh1-1.fna&_nc_gid=NiMDRPqBwRL1fc3OyBD-7w&_nc_ss=792a8&oh=00_AQJVgzxhqF7ghd-HRYyWQaF9W_frX3Z27c5-VTsmVKEvkQ&oe=6AB43D04"
 },
 {
  "name": "曾國維",
  "fb": "https://www.facebook.com/profile.php?id=61577735596730",
  "ig": "",
  "th": "",
  "yt": "",
  "photo": "https://scontent.fkhh1-1.fna.fbcdn.net/v/t39.99422-6/795583340_2175060830034736_2568683781245685696_n.png?stp=dst-jpg_tt6&cstp=mx1440x1080&ctp=p960x960&_nc_cat=105&ccb=1-7&_nc_sid=833d8c&_nc_ohc=UJg9WNx2FmkQ7kNvwGtSlY3&_nc_oc=Adr6Atoiio8YBeFzZIz40gXH-f7zwZYKsS4A1Cg2IH2TFdfxTk7dOjlFf3zEnjLb5yQ&_nc_zt=14&_nc_ht=scontent.fkhh1-1.fna&_nc_gid=0DAyzcJCZ9_1V0i_7zpqfg&_nc_ss=792a8&oh=00_AQL-yTVke7kcOeXAn0xLDLQSIrsE6qYsfGepcKQz06lmGQ&oe=6AB43179"
 },
 {
  "name": "卡伊．馬賴",
  "fb": "https://www.facebook.com/haleluyadavid",
  "ig": "",
  "th": "",
  "yt": "",
  "photo": "https://scontent.fkhh1-2.fna.fbcdn.net/v/t39.30808-6/797872877_29394528746803186_3959516581351923701_n.jpg?stp=dst-jpg_tt6&cstp=mx2048x1365&ctp=s2048x1365&_nc_cat=110&ccb=1-7&_nc_sid=6ee11a&_nc_ohc=Bv7iIagVNWsQ7kNvwGYlFrR&_nc_oc=AdpWMMuCCvfUm69bO6QeGnc-4gCxEVVwv-9m4DqwjV4fnSCUElG7e46_cSOaiX9S45U&_nc_zt=23&_nc_ht=scontent.fkhh1-2.fna&_nc_gid=0iIqOvvI-7M2HyLr4zSwlg&_nc_ss=7b2a8&oh=00_AQKUJPSZIppm9gp9zy707wYi5M7cy8WuET93d_JZbbwDWQ&oe=6AB43AA9"
 },
 {
  "name": "趙若芸",
  "fb": "https://www.facebook.com/profile.php?id=61587764979714",
  "ig": "",
  "th": "",
  "yt": "",
  "photo": "https://scontent.fkhh1-2.fna.fbcdn.net/v/t39.30808-6/800085441_122124735219258832_8121565991133381428_n.jpg?stp=dst-jpg_tt6&cstp=mx1254x1254&ctp=s1080x2048&_nc_cat=110&ccb=1-7&_nc_sid=127cfc&_nc_ohc=FA4UR3db5rkQ7kNvwFwyV3s&_nc_oc=AdoptHPRWa9Q9VuH31ETc7oSuZ5SC2R7h1XMjErzeRzY9VVXILBqWH586iFrqaI1qaw&_nc_zt=23&_nc_ht=scontent.fkhh1-2.fna&_nc_gid=62sWQWK5uFsYdRJbda11ZA&_nc_ss=792a8&oh=00_AQKBWrqfhMcuoRmwF8IjQywNliOushX-BLSnLCmtRe2D1A&oe=6AB43C0F"
 },
 {
  "name": "陳鶴文",
  "fb": "https://www.facebook.com/hewen.coming",
  "ig": "",
  "th": "",
  "yt": "",
  "photo": "https://scontent.fkhh1-1.fna.fbcdn.net/v/t39.30808-6/616830359_861995506465911_4188902877132217253_n.jpg?stp=cp6_dst-jpg_tt6&cstp=mx2048x1536&ctp=p843x403&_nc_cat=102&ccb=1-7&_nc_sid=833d8c&_nc_ohc=_--XK1VHS4UQ7kNvwG4mMFL&_nc_oc=Ado9AHDO3Y8QIzVmK-uxJUIHdGNWp1AJo2-6khW4VhN5gL2RnDEn6cEp3Ia7lWc9JOk&_nc_zt=23&_nc_ht=scontent.fkhh1-1.fna&_nc_gid=mK2K2JnA_AtfkhwDZmMF2g&_nc_ss=792a8&oh=00_AQIkDo__r91G4dUTln7Fqwmpspf2hV-Qu-wOO7ZPxk4-oA&oe=6AB44206"
 },
 {
  "name": "吳若茵",
  "fb": "https://www.facebook.com/wurosin",
  "ig": "",
  "th": "",
  "yt": "",
  "photo": "https://scontent.fkhh1-2.fna.fbcdn.net/v/t39.30808-6/704592421_122098878249328562_5128206379473554645_n.jpg?stp=dst-jpg_tt6&cstp=mx1254x1254&ctp=s1254x1254&_nc_cat=109&ccb=1-7&_nc_sid=cc71e4&_nc_ohc=eAiMV08pyowQ7kNvwEcRF_n&_nc_oc=AdpwxqDG3thb-7ntGfJb0CYzK4KfT1T84uqEMsnyTK9axuf4M5-Qa737C7Xb4ArMaEI&_nc_zt=23&_nc_ht=scontent.fkhh1-2.fna&_nc_gid=RoHn1UpcEfuyZxa3bJkseQ&_nc_ss=792a8&oh=00_AQIHQ31E-WhTNqIwOOmtLz8YDzlDB5IaFXlZ7IGNkPMbtQ&oe=6AB42620"
 },
 {
  "name": "林夏陞",
  "fb": "https://www.facebook.com/profile.php?id=61571799993458",
  "ig": "",
  "th": "",
  "yt": "",
  "photo": "https://scontent.fkhh1-2.fna.fbcdn.net/v/t39.30808-6/811304213_122171948564726666_1793066147810650709_n.jpg?stp=dst-jpg_tt6&cstp=mx2048x1542&ctp=s2048x1542&_nc_cat=110&ccb=1-7&_nc_sid=127cfc&_nc_ohc=7TyNE6o1VbIQ7kNvwH_FGJl&_nc_oc=Adqwx6AeqcUGuPnL3NfBdK-57gtKZm8qV1UKDjI0xY9WaAIJWli4kqZ6X7DFsgKNN-A&_nc_zt=23&_nc_ht=scontent.fkhh1-2.fna&_nc_gid=PpGcMtADjd4OiD9eYHnq9w&_nc_ss=792a8&oh=00_AQLFQrB3pQu6F_UtTKM8RTok-QLWNMew8swtrcqtA7W37w&oe=6AB42E2A"
 },
 {
  "name": "王雲慶",
  "fb": "https://www.facebook.com/boyce6510",
  "ig": "",
  "th": "",
  "yt": "",
  "photo": "https://scontent.fkhh1-1.fna.fbcdn.net/v/t39.30808-6/759320693_122136513009180768_5801154302145070430_n.jpg?stp=cp6_dst-jpg_tt6&cstp=mx1296x865&ctp=s1296x865&_nc_cat=102&ccb=1-7&_nc_sid=cc71e4&_nc_ohc=WIdAF_rCjtYQ7kNvwFFysqz&_nc_oc=AdpAXRDJOD0K9ZqUP8LQ2Z7wFUCdMp8ENz8_VTDxfgWLWrI6WBgMWCK669bhFk3lhCg&_nc_zt=23&_nc_ht=scontent.fkhh1-1.fna&_nc_gid=6drBdMTtvpe3xOWeAsF7Og&_nc_ss=792a8&oh=00_AQKgAOjo1Mb8D0Jm15f7usvN0rYxeHczwEt6XjWOWaV8Bg&oe=6AB442E1"
 },
 {
  "name": "陳思妤",
  "fb": "https://www.facebook.com/profile.php?id=61579769033175",
  "ig": "",
  "th": "",
  "yt": "",
  "photo": "https://scontent.fkhh1-2.fna.fbcdn.net/v/t39.99422-6/815535855_844270488713881_5939735398200716152_n.png?stp=dst-jpg_tt6&cstp=mx1206x1224&ctp=s1080x2048&_nc_cat=111&ccb=1-7&_nc_sid=833d8c&_nc_ohc=f9AhqGyDrMoQ7kNvwF5dG10&_nc_oc=Adr5UQiysE7xpx34ru2ADVLaomoenPDaaBSwUt_W0quFKpcOIoh8cSuGO0mEwG0o7BE&_nc_zt=14&_nc_ht=scontent.fkhh1-2.fna&_nc_gid=PhD58LNhBCgkIB7tjl9vSQ&_nc_ss=792a8&oh=00_AQI0CtxtfSn5gmGOuritjGfXn8n1D08_V-E69KpVrQ4sDQ&oe=6AB42638"
 }
];
const clean = s => String(s || '').normalize('NFKC').replace(/[・．·‧\s　]/g, '');
const topo = JSON.parse(await readFile(FILE, 'utf8'));
const g = topo.objects.map.geometries.find(x => String(x.properties.id) === '10018');
const p = g.properties;
const blocks = Array.isArray(p.councilors?.blocks) ? p.councilors.blocks : p.councilors;
const all = blocks.flatMap(b => b.candidates || []);
const rep = { fb: 0, ig: 0, th: 0, yt: 0, photo: 0, skipped: [] };
for (const d of DATA) {
  const hits = all.filter(c => clean(c.name) === clean(d.name));
  if (hits.length !== 1) { rep.skipped.push(d.name); continue; }
  const c = hits[0];
  for (const [k, f, r] of [['facebook', 'fb', 'fb'], ['instagram', 'ig', 'ig'], ['threads', 'th', 'th'], ['youtube', 'yt', 'yt']]) {
    if (d[f] && !String(c[k] || '').trim()) { c[k] = d[f]; rep[r]++; }
  }
  if (d.photo && !String(c.photoUrl || '').trim()) { c.photoUrl = d.photo; rep.photo++; }
}
await writeFile(FILE, `${JSON.stringify(topo)}\n`, 'utf8');
console.log(JSON.stringify(rep, null, 2));
