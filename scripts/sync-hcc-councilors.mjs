import { writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { load } from 'cheerio';

const BASE = 'https://www.hsinchu-cc.gov.tw';
const SOURCE = BASE + '/tc/councilors.aspx?mid=39';
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const clean = (value) => String(value || '').replace(/\s+/g, ' ').trim();
const absolute = (value) => new URL(value, BASE).href;
const facebook = (value) => {
  try {
    const url = new URL(value);
    if (!/(^|\.)facebook\.com$/i.test(url.hostname.replace(/^www\./, ''))) return '';
    if (/\/(?:share|sharer|dialog|plugins)\b/i.test(url.pathname)) return '';
    url.protocol = 'https:'; url.hostname = 'www.facebook.com'; url.hash = '';
    return url.href.replace(/\/$/, '');
  } catch { return ''; }
};
async function get(url) {
  const response = await fetch(url, { headers: { 'User-Agent': 'Mozilla/5.0 (compatible; FormosaWatch/1.0)', 'Accept-Language': 'zh-TW,zh;q=0.9' }, signal: AbortSignal.timeout(25000) });
  if (!response.ok) throw new Error(url + ': HTTP ' + response.status);
  return response.text();
}
const detailUrls = Array.from({ length: 34 }, (_, index) => BASE + '/tc/councilor.aspx?mid=39&c=' + (index + 3));
let cursor = 0;
const results = await Promise.all(Array.from({ length: 5 }, async () => {
  const group = [];
  while (cursor < detailUrls.length) {
    const detailUrl = detailUrls[cursor++];
    try {
      const page = load(await get(detailUrl));
      const photo = page('#ltImg').attr('src');
      const name = clean(page('#ltImg').attr('alt')).replace(/\s*議員$/, '');
      if (!name || !photo) continue;
      const member = { name, photoUrl: absolute(photo), detailUrl, facebook: facebook(page('#ltFacebook').attr('href')) };
      console.log(member.name + ': ' + (member.facebook ? 'Facebook 已核對' : '官方頁未列 Facebook'));
      group.push(member);
    } catch (error) { console.warn(detailUrl + ': ' + error.message); }
  }
  return group;
}));
const members = results.flat();
if (members.length < 30) throw new Error('安全中止：只解析到 ' + members.length + ' 位新竹市議員');
const report = { generatedAt: new Date().toISOString(), source: SOURCE, verification: '照片與 Facebook 僅取自新竹市議會本屆議員名單及個別官方介紹頁。', councilors: members };
await writeFile(path.join(root, 'data/hcc_councilors.json'), JSON.stringify(report, null, 2) + '\n');
console.log('完成：' + members.length + ' 位；Facebook ' + members.filter((member) => member.facebook).length + ' 位。');
