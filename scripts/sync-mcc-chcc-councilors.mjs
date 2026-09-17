import { writeFile } from 'node:fs/promises';
import { load } from 'cheerio';

const fetchText = async (url) => {
  let last;
  for (let attempt = 0; attempt < 3; attempt++) {
    try {
      const r = await fetch(url, { headers: { 'User-Agent': 'Mozilla/5.0 (compatible; FormosaWatch/1.0)' }, signal: AbortSignal.timeout(25000) });
      if (!r.ok) throw new Error(url + ': HTTP ' + r.status);
      return await r.text();
    } catch (error) { last = error; await new Promise(resolve => setTimeout(resolve, 450 * (attempt + 1))); }
  }
  throw last;
};
const norm = value => String(value || '').normalize('NFKC').replace(/[・．·‧\s]/g, '');
const fb = value => {
  try { const u = new URL(value); if (!/(^|\.)facebook\.com$/i.test(u.hostname.replace(/^www\./, '')) || /sharer|share\.php/i.test(u.pathname)) return ''; u.protocol = 'https:'; u.hostname = 'www.facebook.com'; u.hash = ''; return u.href.replace(/\/$/, ''); } catch { return ''; }
};

const mccSource = 'https://www.mcc.gov.tw/iframimgtxt_list.php?menu=&typeid=2580&typeid2=2599';
const mccResponse = await fetch(mccSource, { headers: { 'User-Agent': 'Mozilla/5.0 (compatible; FormosaWatch/1.0)' }, signal: AbortSignal.timeout(25000) });
if (!mccResponse.ok) throw new Error(mccSource + ': HTTP ' + mccResponse.status);
const mcc = load(new TextDecoder('big5').decode(await mccResponse.arrayBuffer()));
const mccCouncilors = [];
mcc('tr.line01').each((_, row) => {
  const node = mcc(row), img = node.find('img[alt]').first();
  const name = String(img.attr('alt') || '').trim(), photo = node.find('a[href*="admin/upload/"]').first().attr('href');
  if (name && photo) mccCouncilors.push({ name, photoUrl: new URL(photo, mccSource).href });
});
await writeFile('data/mcc_councilors.json', JSON.stringify({ generatedAt: new Date().toISOString(), source: mccSource, verification: '照片僅取自苗栗縣議會指定現任議員頁；該頁未提供個別 Facebook。', councilors: mccCouncilors }, null, 2) + '\n');

const chccSource = 'https://www.chcc.gov.tw/member/index.aspx?Parser=99,6,40';
const chcc = load(await fetchText(chccSource)), raw = [];
chcc('dd').each((_, item) => {
  const node = chcc(item), detail = node.find('a[href*="details.aspx"]').first(), name = detail.text().trim();
  if (name && detail.attr('href')) raw.push({ name, detailUrl: new URL(detail.attr('href'), chccSource).href, facebook: fb(node.find('a[href*="facebook.com"]').attr('href')) });
});
const deduped = [...new Map(raw.map(row => [norm(row.name), row])).values()];
let cursor = 0;
await Promise.all(Array.from({ length: 2 }, async () => {
  while (cursor < deduped.length) {
    const member = deduped[cursor++];
    try {
      const page = load(await fetchText(member.detailUrl));
      const photo = page('#member_img img').filter((_, img) => !/bn_fb|map/i.test(page(img).attr('src') || '')).first().attr('src');
      if (photo) member.photoUrl = new URL(photo, member.detailUrl).href;
      member.facebook = member.facebook || fb(page('a.bn_facebook').attr('href'));
    } catch (error) { member.error = error.message; }
  }
}));
await writeFile('data/chcc_councilors.json', JSON.stringify({ generatedAt: new Date().toISOString(), source: chccSource, verification: '照片與 Facebook 僅取自彰化縣議會議員一覽表及個別官方介紹頁。', councilors: deduped }, null, 2) + '\n');
console.log(JSON.stringify({ miaoli: mccCouncilors.length, changhua: deduped.length, changhuaFacebook: deduped.filter(row => row.facebook).length, changhuaPhotos: deduped.filter(row => row.photoUrl).length }));
