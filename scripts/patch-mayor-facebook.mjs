import fs from 'node:fs';

const file = 'data/counties.json';
const topo = JSON.parse(fs.readFileSync(file, 'utf8'));

// 2026-09-18：只收錄已能以官方網站、政府/政黨資料、Wikidata verified account、
// 主流媒體或候選人公開官方頁面交叉確認的 Facebook URL。
// 無法唯一辨識的候選人維持 null，避免同名帳號或猜測網址污染資料庫。
const facebookByCounty = {
  '09007': {
    '王忠銘': 'https://www.facebook.com/people/%E7%8E%8B%E5%BF%A0%E9%8A%98/100071514671190/',
  },
  '09020': {
    '陳玉珍': 'https://www.facebook.com/KinmenMyLove',
    '梁文韜': 'https://www.facebook.com/share/182Frybi8D/',
  },
  '10002': {
    '吳宗憲': 'https://www.facebook.com/jameswu88',
    '林國漳': 'https://www.facebook.com/profile.php?id=61582589525417',
  },
  '10007': {
    '陳重嘉': 'https://www.facebook.com/politicianccc',
    '陳素月': 'https://www.facebook.com/chengSayYes',
    '邱建富': 'https://www.facebook.com/chenfu168',
  },
  '10008': {
    '許淑華': 'https://www.facebook.com/130771133668155',
  },
  '10009': {
    '張嘉郡': 'https://www.facebook.com/Sweet.Yunlin/',
    '劉建國': 'https://www.facebook.com/liucnko.fans',
  },
  '10013': {
    '蘇清泉': 'https://www.facebook.com/ptdrsu',
    '周春米': 'https://www.facebook.com/RiceChouChunMi',
  },
  '10014': {
    '陳瑩': 'https://www.facebook.com/11YIG',
    '吳秀華': 'https://www.facebook.com/100090624231494',
  },
  '10015': {
    '張峻': 'https://www.facebook.com/profile.php?id=100003835876655',
    '魏嘉賢': 'https://www.facebook.com/sunwei038563787',
  },
  '10016': {
    '周倪安': 'https://www.facebook.com/nian.chou',
    '葉竹林': 'https://www.facebook.com/YEHCHULINinPENGHU',
  },
  '10017': {
    '謝國樑': 'https://www.facebook.com/hsieh.kuo.liang',
    '童子瑋': 'https://www.facebook.com/wayne201817',
  },
  '10018': {
    '高虹安': 'https://www.facebook.com/DrAnnKao',
    '莊競程': 'https://www.facebook.com/Power3C',
    '何志勇': 'https://www.facebook.com/HoChihyung',
  },
  '63000': {
    '沈伯洋': 'https://www.facebook.com/pumashen',
    '蕭文乾': 'https://www.facebook.com/wen.hsiao.100',
    '蔣萬安': 'https://www.facebook.com/chiangwanan',
  },
  '65000': {
    '蘇巧慧': 'https://www.facebook.com/chiaohui.su',
    '李四川': 'https://www.facebook.com/105183017832041',
  },
  '66000': {
    '何欣純': 'https://www.facebook.com/94achun',
    '江啟臣': 'https://www.facebook.com/johnnyccchiang',
  },
  '67000': {
    '謝龍介': 'https://www.facebook.com/TEL062268268',
    '陳亭妃': 'https://www.facebook.com/fififans',
  },
  '68000': {
    '張善政': 'https://www.facebook.com/SanCheng624',
    '黃世杰': 'https://www.facebook.com/SCHuangLawyer',
  },
  '10005': {
    '陳品安': 'https://www.facebook.com/pinanchen064',
    '鍾東錦': 'https://www.facebook.com/DongJinZhong',
  },
  '10020': {
    '張啓楷': 'https://www.facebook.com/chikaizhang',
    '王美惠': 'https://www.facebook.com/ahueimoto',
  },
  '10010': {
    '蔡易餘': 'https://www.facebook.com/chiayionefish',
  },
  '64000': {
    '賴瑞隆': 'https://www.facebook.com/zenolai2',
    '柯志恩': 'https://www.facebook.com/KoChihEn',
  },
  '10004': {
    '鄭朝方': 'https://www.facebook.com/newchange13/',
    '徐欣瑩': 'https://www.facebook.com/shesinging.tw',
  },
};

const geometries = topo?.objects?.map?.geometries;
if (!Array.isArray(geometries)) {
  throw new Error('Unexpected counties.json structure: objects.map.geometries missing');
}

const expected = Object.values(facebookByCounty).reduce((sum, rows) => sum + Object.keys(rows).length, 0);
const patched = [];

for (const geometry of geometries) {
  const props = geometry?.properties;
  const id = String(props?.id || '');
  const countyMap = facebookByCounty[id];
  if (!countyMap) continue;

  const candidates = Array.isArray(props.candidates) ? props.candidates : [];
  for (const [name, facebook] of Object.entries(countyMap)) {
    if (!/^https:\/\/(www\.)?facebook\.com\//i.test(facebook)) {
      throw new Error(`Invalid Facebook URL for ${props.name} ${name}: ${facebook}`);
    }

    const candidate = candidates.find((row) => row?.name === name);
    if (!candidate) {
      throw new Error(`Candidate not found: ${props.name} ${name}`);
    }

    candidate.facebook = facebook;
    patched.push(`${props.name}:${name}`);
  }
}

if (patched.length !== expected) {
  throw new Error(`Expected to patch ${expected} candidates, patched ${patched.length}`);
}

const allMayors = geometries.flatMap((g) => {
  const county = g?.properties?.name || '';
  return (g?.properties?.candidates || []).map((candidate) => ({ county, ...candidate }));
});
const unresolved = allMayors.filter((candidate) => !candidate.facebook);

fs.writeFileSync(file, JSON.stringify(topo), 'utf8');

console.log(`Verified Facebook patch targets: ${patched.length}`);
console.log(`Mayor candidates total: ${allMayors.length}`);
console.log(`Mayor candidates with Facebook after patch: ${allMayors.length - unresolved.length}`);
console.log(`Still unresolved: ${unresolved.length}`);
for (const candidate of unresolved) {
  console.log(`- ${candidate.county}: ${candidate.name}`);
}
