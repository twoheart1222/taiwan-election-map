// Build factual, source-linked election notes from the checked-in CEC history data.
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const mayor = JSON.parse(fs.readFileSync(path.join(root, 'data/history/local-executive.json'), 'utf8')).years;
const council = JSON.parse(fs.readFileSync(path.join(root, 'data/history/councilor.json'), 'utf8')).years;
const date = new Date().toISOString().slice(0, 10);
const site = 'https://formosaobservatory.com';
const fmt = value => Number(value).toLocaleString('zh-TW');
const signed = value => `${value > 0 ? '+' : ''}${fmt(value)}`;
const percentagePoints = value => `${value > 0 ? '+' : ''}${value.toFixed(2)} 個百分點`;
const esc = value => String(value).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
const source = `<a href="https://db.cec.gov.tw/ElecTable/Election" rel="noopener noreferrer">中央選舉委員會選舉資料庫</a>`;
const methodology = '本站以中選會歷屆投開票結果的候選人紀錄重新加總，採同屆、同選舉類型比較。數字為歷史正式投開票資料，不代表 2026 年登記、審定或正式候選人數。2018 與 2022 年縣市長皆以現行 22 縣市作比較單位；2022 年嘉義市納入 12 月 18 日重行選舉。';

const mayorRows = Object.keys(mayor['2022'].races).map(name => ({ name, a: mayor['2018'].races[name].candidates.length, b: mayor['2022'].races[name].candidates.length }));
const mayorA = mayorRows.reduce((sum, row) => sum + row.a, 0);
const mayorB = mayorRows.reduce((sum, row) => sum + row.b, 0);
const councilRows = Object.keys(council['2022'].counties).map(name => ({ name, a: council['2018'].counties[name].stats.candidateCount, b: council['2022'].counties[name].stats.candidateCount, turnoutA: council['2018'].counties[name].stats.turnout, turnoutB: council['2022'].counties[name].stats.turnout }));
const councilA = council['2018'].stats.candidateCount;
const councilB = council['2022'].stats.candidateCount;
if (mayorRows.length !== 22 || mayorA !== 93 || mayorB !== 94 || councilRows.length !== 22 || councilRows.reduce((s, r) => s + r.a, 0) !== councilA || councilRows.reduce((s, r) => s + r.b, 0) !== councilB) {
  throw new Error('Historical comparison inputs changed; review article text before rebuilding.');
}

const table = (rows, aLabel, bLabel, value = r => [r.a, r.b], difference = r => r.b - r.a, formatDifference = signed) => `<div class="table-wrap"><table><thead><tr><th scope="col">縣市</th><th scope="col">${aLabel}</th><th scope="col">${bLabel}</th><th scope="col">差異</th></tr></thead><tbody>${rows.map(r => { const [a, b] = value(r); const delta = difference(r); return `<tr><th scope="row">${esc(r.name)}</th><td>${typeof a === 'number' ? fmt(a) : esc(a)}</td><td>${typeof b === 'number' ? fmt(b) : esc(b)}</td><td class="${delta > 0 ? 'up' : delta < 0 ? 'down' : ''}">${formatDifference(delta)}</td></tr>`; }).join('')}</tbody></table></div>`;
const articles = [
  {
    slug: 'mayor-candidates-2018-2022',
    category: '參選人數',
    title: '2018 到 2022：縣市長選舉參選人數如何變化？',
    desc: '依中選會投開票資料，比較 2018 與 2022 年 22 縣市首長選舉的參選人數與縣市差異。',
    lead: `全臺 22 縣市的縣市長選舉，2018 年共有 ${fmt(mayorA)} 位參選人，2022 年共有 ${fmt(mayorB)} 位，增加 ${fmt(mayorB - mayorA)} 位。全國總數接近，不表示每個地方都沒有變動。`,
    body: `<h2>哪些地方增加，哪些地方減少？</h2><p>臺北市由 5 人變為 12 人，增加 7 人，是增加最多的縣市；基隆市由 2 人變為 5 人，增加 3 人。澎湖縣由 7 人變為 3 人，減少 4 人，是減少最多的縣市。這些數字僅描述參選人數，不用來推論競爭程度或選民偏好。</p><p>下表列出全部 22 縣市。表格依 2022 年縣市名稱排列；若比較特定縣市的政黨得票與投票率，可前往<a href="/history/local-executive.html">歷年縣市長選舉</a>查看。</p>${table(mayorRows, '2018 人數', '2022 人數')}<h2>統計口徑</h2><p>${methodology}</p>`,
    data: 'data/history/local-executive.json'
  },
  {
    slug: 'councilor-candidates-2018-2022',
    category: '議員選舉',
    title: '議員參選人數：2022 年比 2018 年少了多少？',
    desc: '整理中選會歷屆議員選舉資料，比較 2018 與 2022 年 22 縣市參選人數及席次。',
    lead: `22 縣市議員選舉的參選人數，2018 年為 ${fmt(councilA)} 人，2022 年為 ${fmt(councilB)} 人，減少 ${fmt(councilA - councilB)} 人。同期當選席次由 ${fmt(council['2018'].stats.electedSeats)} 席變為 ${fmt(council['2022'].stats.electedSeats)} 席。`,
    body: `<h2>縣市差異</h2><p>宜蘭縣由 73 人降至 58 人，減少 15 人；花蓮縣由 69 人降至 58 人，減少 11 人。南投縣由 61 人升至 68 人，增加 7 人；新北市由 120 人升至 126 人，增加 6 人。全國減少 74 人，但並非每個縣市都減少。</p><p>本表包含資料庫收錄的區域、平地原住民與山地原住民議員選舉；不是只計算一般行政區。席次是當選席次，不能直接以參選人數變化推論選區競爭程度。各縣市與選區結果可在<a href="/history/councilor.html">歷年議員選舉</a>查核。</p>${table(councilRows, '2018 人數', '2022 人數')}<h2>統計口徑</h2><p>候選人數取自中選會選舉資料庫的歷屆正式結果，各縣市加總與本站歷史資料檔的全國總數一致。${methodology}</p>`,
    data: 'data/history/councilor.json'
  },
  {
    slug: 'councilor-turnout-2018-2022',
    category: '投票率',
    title: '2018 與 2022 年議員選舉：各縣市投票率變化',
    desc: '比較 2018 與 2022 年議員選舉全國及 22 縣市投票率，說明百分點差異。',
    lead: `議員選舉全國投票率由 2018 年的 ${council['2018'].stats.turnout.toFixed(2)}% 變為 2022 年的 ${council['2022'].stats.turnout.toFixed(2)}%，差異為 ${percentagePoints(council['2022'].stats.turnout - council['2018'].stats.turnout)}。`,
    body: `<h2>各地變化並不相同</h2><p>22 縣市中，臺北市從 65.94% 升至 67.71%，連江縣從 71.34% 升至 72.97%；其餘 20 縣市的議員選舉投票率下降。高雄市從 73.55% 降至 58.71%，差異為 -14.84 個百分點。這是兩次選舉結果的比較，不足以單獨說明變化原因。</p><p>下表顯示每個縣市的兩屆投票率及「2022 減 2018」的百分點；百分點與百分比變化率不同。詳細票數可至<a href="/history/councilor.html">歷年議員選舉</a>查看。</p>${table(councilRows, '2018 投票率', '2022 投票率', r => [`${r.turnoutA.toFixed(2)}%`, `${r.turnoutB.toFixed(2)}%`], r => Number((r.turnoutB - r.turnoutA).toFixed(2)), percentagePoints)}<h2>統計口徑</h2><p>採中選會歷屆議員選舉投開票概況；全國投票率取資料檔的全國統計欄位，不把縣市百分比直接平均。縣市數字為該縣市議員選舉的統計值，包含區域與原住民選舉資料。2018 與 2022 年縣市均以資料庫的現行 22 縣市單位整理。</p>`,
    data: 'data/history/councilor.json'
  }
];

const shell = ({ title, desc, canon, body, type = 'WebPage' }) => `<!doctype html><html lang="zh-TW"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>${esc(title)}｜島民觀察室</title><meta name="description" content="${esc(desc)}"><meta name="robots" content="index,follow,max-snippet:-1,max-image-preview:large"><link rel="canonical" href="${site}${canon}"><link rel="icon" type="image/png" href="/favicon.png"><meta property="og:type" content="${type === 'Article' ? 'article' : 'website'}"><meta property="og:title" content="${esc(title)}"><meta property="og:description" content="${esc(desc)}"><meta property="og:url" content="${site}${canon}"><meta property="og:image" content="${site}/social-preview.png"><script async src="https://pagead2.googlesyndication.com/pagead/js/adsbygoogle.js?client=ca-pub-5043287080308993" crossorigin="anonymous"></script><script type="application/ld+json">${JSON.stringify({ '@context': 'https://schema.org', '@type': type, headline: title, description: desc, url: site + canon, datePublished: '2026-10-29', dateModified: date, inLanguage: 'zh-TW', author: { '@type': 'Organization', name: '島民觀察室', url: site }, publisher: { '@type': 'Organization', name: '島民觀察室', url: site, logo: { '@type': 'ImageObject', url: site + '/favicon.png' } } })}</script><link rel="stylesheet" href="/observatory/insights.css"></head><body><header class="site-header"><a class="brand" href="/"><img src="/assets/brand/formosa-mark.png" alt=""><span>島民觀察室</span></a><nav aria-label="主要導覽"><a href="/">選舉地圖</a><a href="/history/">歷年選舉</a><a href="/observatory/"${canon.startsWith('/observatory/') ? ' aria-current="page"' : ''}>政治觀察</a><a href="/related/"${canon.startsWith('/related/') ? ' aria-current="page"' : ''}>相關網站</a><a href="/#about">關於我們</a></nav></header>${body}<footer><a href="/"><img src="/assets/brand/formosa-lockup.png" alt="Formosa Observatory 島民觀察室"></a><p>本站為獨立民間資訊平台，非政府機關或政黨網站。資料更正：<a href="mailto:contact@formosaobservatory.com">contact@formosaobservatory.com</a>　<a href="/privacy/">隱私權政策</a></p></footer></body></html>`;

const cards = articles.map((article, i) => `<a class="story-card" href="/observatory/${article.slug}/"><span class="story-no">0${i + 1} / ${esc(article.category)}</span><h2>${esc(article.title)}</h2><p>${esc(article.lead)}</p><span class="story-link">閱讀資料觀察 →</span></a>`).join('');
const index = shell({ title: '政治觀察｜歷屆選舉資料筆記', desc: '以中選會公開資料整理臺灣歷屆選舉參選人數與投票率變化，清楚標示統計口徑、年份和來源。', canon: '/observatory/', body: `<main><div class="eyebrow">POLITICAL OBSERVATORY / DATA NOTES</div><h1>政治觀察</h1><p class="lead">用同一套口徑比較歷屆選舉。每篇列出原始來源、統計方法與完整縣市數字；只描述資料可支持的事實，不預測勝負。</p><div class="story-grid">${cards}</div><section class="note"><h2>閱讀與核對</h2><p>本站以${source}的歷史結果製作統計；本站保存的<a href="/history/">歷屆選舉互動頁</a>可用於逐屆核對。2026 年登記資料與歷史正式結果分屬不同階段，文章不直接混算。外部資料入口另見<a href="/related/">相關網站</a>。</p></section></main>` });
fs.mkdirSync(path.join(root, 'observatory'), { recursive: true });
fs.writeFileSync(path.join(root, 'observatory/index.html'), index);
for (const article of articles) {
  const dir = path.join(root, 'observatory', article.slug);
  fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(path.join(dir, 'index.html'), shell({ title: article.title, desc: article.desc, canon: `/observatory/${article.slug}/`, type: 'Article', body: `<main class="article"><a class="back" href="/observatory/">← 返回政治觀察</a><div class="eyebrow">${esc(article.category)} / 2018—2022</div><h1>${esc(article.title)}</h1><p class="article-meta">島民觀察室資料整理　·　發布日期 <time datetime="2026-10-29">2026-10-29</time>　·　資料：中選會歷屆選舉結果</p><p class="lead">${esc(article.lead)}</p>${article.body}<section class="note"><h2>資料來源與更正</h2><p>原始來源：${source}。本站整理檔：<a href="/${article.data}">${article.data}</a>。資料轉製方式見<a href="https://github.com/twoheart1222/taiwan-election-map/blob/main/data/history/README.md">歷史資料說明</a>；如果發現錯誤，請來信 <a href="mailto:contact@formosaobservatory.com">contact@formosaobservatory.com</a>。</p></section><a class="back" href="/observatory/">← 查看其他資料觀察</a></main>` }));
}
console.log(`Built ${articles.length} source-linked observatory articles and index.`);
