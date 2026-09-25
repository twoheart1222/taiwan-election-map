// 產生 SEO 靜態頁：election/index.html、election/<縣市ID>.html、election/<鄉鎮ID>.html，
// 以及 sitemap.xml、robots.txt、llms.txt、llms-full.txt。資料更新後請重新執行：npm run build:seo
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const SITE = 'https://formosaobservatory.com';
const NAME = 'Formosa Observatory｜島民觀察室';
const ELECTION_DATE = '2026-11-28';
const ADSENSE_CLIENT = 'ca-pub-5043287080308993';
const today = new Date().toISOString().slice(0, 10);
const readJson = (p) => JSON.parse(fs.readFileSync(path.join(ROOT, p), 'utf8'));
const esc = (s) => String(s ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
const feats = (topo) => topo.objects.map.geometries.map((g) => g.properties);
const party = (p) => (p && p !== '無' ? p : '無黨籍');
const flatCouncil = (c) => (c.councilors || []).flatMap((b) => b.candidates || []);

const counties = feats(readJson('data/counties.json'));
const dmap = readJson('data/district_town_map.json');
const quota = readJson('data/district_quota.json');

const CSS = `*{box-sizing:border-box}body{margin:0;background:#0d0d0d;color:#e9e5dc;font:16px/1.75 "Noto Sans TC",system-ui,sans-serif}a{color:#ff5a72}main{max-width:960px;margin:0 auto;padding:28px 18px 64px}nav.top{display:flex;align-items:center;gap:14px;flex-wrap:wrap;font-size:14px;margin-bottom:22px}.brand{display:inline-flex;align-items:center;gap:9px;color:#f4f1ea;text-decoration:none;font-weight:800}.brand img{width:40px;height:34px;object-fit:contain;padding:4px 5px;background:#f4f1ea;border-radius:7px}h1{font-size:clamp(26px,5vw,42px);line-height:1.2;margin:.2em 0 .4em}h2{font-size:22px;margin:2em 0 .5em;border-left:4px solid #E4022B;padding-left:10px}h3{font-size:17px;margin:1.4em 0 .4em}table{border-collapse:collapse;width:100%;font-size:15px}th,td{border-bottom:1px solid #2b2b2b;padding:6px 8px;text-align:left;vertical-align:top}th{color:#a29c92;font-weight:600}.note{color:#a29c92;font-size:14px}.answer{margin:22px 0;padding:20px 22px;background:#171411;border:1px solid #302c27;border-left:5px solid #E4022B;border-radius:14px}.answer h2{border:0;padding:0;margin:0 0 8px}.answer p{margin:8px 0}.stats{display:grid;grid-template-columns:repeat(auto-fit,minmax(140px,1fr));gap:10px;margin:18px 0}.stat{padding:14px;background:#171411;border:1px solid #302c27;border-radius:12px}.stat strong{display:block;color:#fff;font-size:24px;line-height:1.1}.stat span{display:block;color:#a29c92;font-size:13px;margin-top:5px}.updated{color:#a29c92;font-size:14px}.cta{display:inline-block;margin:10px 8px 10px 0;padding:10px 20px;background:#E4022B;color:#fff;border-radius:999px;text-decoration:none;font-weight:700}.cta.secondary{background:#25211d}ul.links{columns:3 150px;padding-left:18px}.county-candidates{margin:.45em 0 1.2em}.faq-answer{margin:.4em 0 1.2em;color:#c9c3ba}footer{margin-top:48px;color:#8a857c;font-size:13px;border-top:1px solid #2b2b2b;padding-top:16px}`;

function shell({ title, desc, canon, h1, body, ld, crumbs, pageType = 'WebPage' }) {
  const bc = {
    '@context': 'https://schema.org', '@type': 'BreadcrumbList',
    itemListElement: crumbs.map((c, i) => ({ '@type': 'ListItem', position: i + 1, name: c[0], item: SITE + c[1] })),
  };
  const page = {
    '@context': 'https://schema.org', '@type': pageType, name: title, description: desc, url: SITE + canon,
    inLanguage: 'zh-TW', dateModified: today, isAccessibleForFree: true, isPartOf: { '@type': 'WebSite', name: NAME, alternateName: ['島民觀察室', '島民選舉地圖'], url: SITE + '/' },
    about: { '@type': 'Event', name: '2026 年中華民國地方公職人員選舉', startDate: ELECTION_DATE, location: { '@type': 'Country', name: '臺灣' } },
  };
  const organization = {
    '@context': 'https://schema.org', '@type': 'Organization', name: NAME, alternateName: ['島民觀察室', '島民選舉地圖'], url: SITE + '/', logo: { '@type': 'ImageObject', url: SITE + '/favicon.png', width: 512, height: 512 }, email: 'contact@formosaobservatory.com',
  };
  const ldAll = [bc, page, organization, ...(ld || [])].map((o) => `<script type="application/ld+json">${JSON.stringify(o).replace(/</g, '\\u003c')}</script>`).join('\n');
  return `<!DOCTYPE html>
<html lang="zh-TW">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>${esc(title)}</title>
<meta name="description" content="${esc(desc)}">
<meta name="author" content="${esc(NAME)}">
<link rel="canonical" href="${SITE}${canon}">
<link rel="sitemap" type="application/xml" href="/sitemap.xml">
<link rel="alternate" type="text/plain" title="AI-readable site summary" href="/llms.txt">
<link rel="icon" type="image/png" sizes="512x512" href="/favicon.png">
<link rel="icon" type="image/png" sizes="48x48" href="/favicon-48.png">
<link rel="shortcut icon" href="/favicon.ico">
<link rel="apple-touch-icon" sizes="180x180" href="/apple-touch-icon.png">
<link rel="manifest" href="/site.webmanifest">
<meta name="robots" content="index,follow,max-snippet:-1,max-image-preview:large">
<meta name="theme-color" content="#0d0d0d">
<meta property="og:type" content="article"><meta property="og:locale" content="zh_TW">
<meta property="og:site_name" content="${esc(NAME)}"><meta property="og:title" content="${esc(title)}">
<meta property="og:description" content="${esc(desc)}"><meta property="og:url" content="${SITE}${canon}">
<meta property="og:image" content="${SITE}/social-preview.png">
<meta property="og:image:alt" content="島民觀察室 2026 選舉地圖與候選人名單">
<meta name="twitter:card" content="summary_large_image">
<meta name="twitter:image" content="${SITE}/social-preview.png"><meta name="twitter:image:alt" content="島民觀察室 2026 選舉地圖與候選人名單">
<script async src="https://pagead2.googlesyndication.com/pagead/js/adsbygoogle.js?client=${ADSENSE_CLIENT}" crossorigin="anonymous"></script>
<style>${CSS}</style>
${ldAll}
</head>
<body>
<main>
<nav class="top" aria-label="導覽"><a class="brand" href="/"><img src="/assets/brand/formosa-mark.png" alt=""><span>島民觀察室</span></a><a href="/election/">全台縣市</a>${crumbs.slice(2).map((c) => `<a href="${c[1]}">${esc(c[0])}</a>`).join('')}</nav>
<h1>${esc(h1)}</h1>
${body}
<footer>資料整理：${esc(NAME)}（<a href="/">${SITE.replace('https://', '')}</a>），最後更新 <time datetime="${today}">${today}</time>。資料來源包含<a href="https://web.cec.gov.tw/" rel="nofollow">中央選舉委員會</a>、內政部與各縣市議會公開資料。本站為獨立民間資訊平台；資格審查、正式候選人名單、選區與票數以中選會公告為準。聯絡：<a href="mailto:contact@formosaobservatory.com">contact@formosaobservatory.com</a></footer>
</main>
</body>
</html>
`;
}

const candTable = (list, cols = ['姓名', '政黨', '備註']) => list.length
  ? `<table><thead><tr>${cols.map((c) => `<th>${c}</th>`).join('')}</tr></thead><tbody>${list.map((c) => `<tr><td>${esc(c.name)}</td><td>${esc(party(c.party))}</td><td>${[c.registeredDate ? `登記 ${esc(c.registeredDate)}` : '', c.isIncumbent ? '現任' : '', c.elected ? '當選' : '', c.prevVotes ? `2022 得票 ${esc(c.prevVotes)}` : ''].filter(Boolean).join('、')}</td></tr>`).join('')}</tbody></table>`
  : '<p class="note">目前尚無登記資料。</p>';

fs.mkdirSync(path.join(ROOT, 'election'), { recursive: true });
const urls = [
  { loc: '/', pri: '1.0', freq: 'daily' },
  { loc: '/election/', pri: '0.9', freq: 'daily' },
  { loc: '/history/', pri: '0.8', freq: 'monthly' },
  { loc: '/history/local-executive', pri: '0.7', freq: 'monthly' },
  { loc: '/history/councilor', pri: '0.7', freq: 'monthly' },
  { loc: '/history/town', pri: '0.6', freq: 'monthly' },
];
const countyRows = [];
let townTotal = 0;
const coverage = { countyHeads: 0, councilors: 0, townHeads: 0, representatives: 0, villageHeads: 0, villages: 0 };

for (const c of counties) {
  const mayors = c.candidates || [];
  const blocks = c.councilors || [];
  const allC = flatCouncil(c);
  coverage.countyHeads += mayors.length;
  coverage.councilors += allC.length;
  const cq = quota[c.id] || {};
  const towns = fs.existsSync(path.join(ROOT, `data/towns/towns-${c.id}.json`)) ? feats(readJson(`data/towns/towns-${c.id}.json`)) : [];
  const isCity = ['63000', '64000', '65000', '66000', '67000', '68000'].includes(c.id);
  const head = isCity ? '市長' : '縣市長';
  const cPath = `/election/${c.id}`;
  const title = `${c.name} 2026 地方選舉候選人名單：${head}、議員、村里長｜島民觀察室`;
  const desc = `${c.name} 2026 年 11 月 28 日地方選舉：${head}候選人 ${mayors.length} 人、議員候選人 ${allC.length} 人，含各選區涵蓋地區、政黨與 2022 得票，並可查詢${towns.length} 個${isCity ? '行政區' : '鄉鎮市區'}的村里長候選人。`;
  let body = `<section class="answer" aria-labelledby="quick-${c.id}"><h2 id="quick-${c.id}">${esc(c.name)} 2026 候選人快速答案</h2><p>截至 <time datetime="${today}">${today}</time>，本站收錄${esc(c.name)}${head}登記參選人 <strong>${mayors.length} 人</strong>、議員登記參選人 <strong>${allC.length} 人</strong>（${blocks.length} 個選舉區），並整理轄內 ${towns.length} 個${isCity ? '行政區' : '鄉鎮市區'}的地方候選人。</p><p class="updated">登記後仍須經資格審查與抽籤；正式候選人名單與號次以中央選舉委員會公告為準。</p></section>
<a class="cta" href="/?county=${c.id}">在互動地圖中查看${esc(c.name)}</a><a class="cta secondary" href="/election/">查看全台候選人</a>`;
  body += `<h2>${esc(c.name)}${head}候選人</h2>${candTable(mayors)}`;
  body += `<h2>${esc(c.name)}議員候選人（依選舉區）</h2>`;
  if (!blocks.length) body += '<p class="note">目前尚無議員候選人資料。</p>';
  for (const b of blocks) {
    const cover = (dmap[c.id]?.districts?.[b.district]?.towns || []).join('、');
    const q = cq[b.district];
    body += `<h3>第 ${esc(b.district)} 選舉區${cover ? `（${esc(cover)}）` : ''}${q ? `｜應選 ${q} 席` : ''}</h3>${candTable(b.candidates || [])}`;
  }
  body += `<h2>${esc(c.name)}各${isCity ? '行政區' : '鄉鎮市區'}</h2><ul class="links">${towns.map((t) => `<li><a href="/election/${t.id}">${esc(t.name)}</a></li>`).join('')}</ul>`;
  const ld = [{
    '@context': 'https://schema.org', '@type': 'ItemList', name: `${c.name}${head}候選人`,
    itemListElement: mayors.map((m, i) => ({ '@type': 'ListItem', position: i + 1, item: { '@type': 'Person', name: m.name, affiliation: { '@type': 'Organization', name: party(m.party) } } })),
  }];
  fs.writeFileSync(path.join(ROOT, `election/${c.id}.html`), shell({ title, desc, canon: cPath, h1: `${c.name} 2026 地方選舉候選人名單`, body, ld, crumbs: [['首頁', '/'], ['全台縣市', '/election/'], [c.name, cPath]] }));
  urls.push({ loc: cPath, pri: '0.8', freq: 'daily' });
  countyRows.push({ c, mayors: mayors.length, mayorList: mayors, council: allC.length, towns: towns.length });

  for (const t of towns) {
    townTotal++;
    const tPath = `/election/${t.id}`;
    const tMayors = t.candidates || [];
    const reps = t.representatives || [];
    const repList = reps.flatMap((r) => r.candidates || []);
    coverage.townHeads += tMayors.length;
    coverage.representatives += repList.length;
    let villages = [];
    const vf = path.join(ROOT, `data/villages/villages-${t.id}.json`);
    if (fs.existsSync(vf)) villages = feats(JSON.parse(fs.readFileSync(vf, "utf8")));
    const vCands = villages.reduce((n, v) => n + (v.candidates || []).length, 0);
    coverage.villages += villages.length;
    coverage.villageHeads += vCands;
    const distBlocks = blocks.filter((b) => (dmap[c.id]?.districts?.[b.district]?.towns || []).includes(t.name));
    const tHead = tMayors.length ? (t.name.endsWith('區') ? '區長' : '鄉鎮市長') : '';
    const tt = `${c.name}${t.name} 2026 地方選舉候選人：${[tHead && `${tHead}、`, '議員、', repList.length ? '民代、' : '', '村里長'].join('').replace(/、$/, '')}｜島民觀察室`;
    const td = `${c.name}${t.name} 2026 年 11 月 28 日地方選舉：${villages.length ? `${villages.length} 個村里、村里長候選人 ${vCands} 人` : '候選人名單'}${tMayors.length ? `、${tHead}候選人 ${tMayors.length} 人` : ''}${distBlocks.length ? `，議員選舉區：第 ${distBlocks.map((b) => b.district).join('、')} 選舉區` : ''}。`;
    let tb = `<p>${esc(c.name)}${esc(t.name)}於 <time datetime="${ELECTION_DATE}">2026 年 11 月 28 日</time>舉行地方選舉。${villages.length ? `轄內共 ${villages.length} 個村里，村里長候選人 ${vCands} 人。` : ''}</p><a class="cta" href="/?town=${t.id}">在互動地圖中查看${esc(t.name)}</a>`;
    if (tMayors.length) tb += `<h2>${esc(t.name)}${tHead}候選人</h2>${candTable(tMayors)}`;
    for (const b of distBlocks) {
      tb += `<h2>${esc(c.name)}議員第 ${esc(b.district)} 選舉區候選人</h2><p class="note">${esc(t.name)}屬${esc(c.name)}議員第 ${esc(b.district)} 選舉區（涵蓋：${esc((dmap[c.id].districts[b.district].towns || []).join('、'))}）。</p>${candTable(b.candidates || [])}`;
    }
    for (const r of reps) if ((r.candidates || []).length) tb += `<h2>${esc(t.name)}民代候選人（第 ${esc(r.district)} 選舉區）</h2>${candTable(r.candidates)}`;
    if (villages.length) {
      tb += `<h2>${esc(t.name)}村里長候選人</h2><table><thead><tr><th>村里</th><th>候選人（政黨）</th></tr></thead><tbody>${villages.map((v) => `<tr><td>${esc(v.name)}</td><td>${(v.candidates || []).map((x) => `${esc(x.name)}（${esc(party(x.party))}）${x.isIncumbent ? '現任' : ''}`).join('、') || '<span class="note">尚無登記</span>'}</td></tr>`).join('')}</tbody></table>`;
    }
    tb += `<p class="note">回到 <a href="${cPath}">${esc(c.name)}候選人名單</a></p>`;
    fs.writeFileSync(path.join(ROOT, `election/${t.id}.html`), shell({ title: tt, desc: td, canon: tPath, h1: `${c.name}${t.name} 2026 地方選舉候選人名單`, body: tb, crumbs: [['首頁', '/'], ['全台縣市', '/election/'], [c.name, cPath], [t.name, tPath]] }));
    urls.push({ loc: tPath, pri: '0.6', freq: 'weekly' });
  }
}

// 全台索引頁
{
  const totalRegistrations = Object.values(coverage).slice(0, 5).reduce((sum, value) => sum + value, 0);
  const quickAnswer = `截至 ${today}，本站收錄 2026 地方選舉登記參選資料 ${totalRegistrations.toLocaleString('zh-TW')} 人次：22 縣市首長 ${coverage.countyHeads} 人、議員 ${coverage.councilors.toLocaleString('zh-TW')} 人、鄉鎮市長與原民區長 ${coverage.townHeads} 人、鄉鎮市民代表與原民區民代表 ${coverage.representatives.toLocaleString('zh-TW')} 人、村里長 ${coverage.villageHeads.toLocaleString('zh-TW')} 人。`;
  const body = `<section class="answer" aria-labelledby="candidate-answer"><h2 id="candidate-answer">2026 地方選舉候選人有哪些？</h2><p>${quickAnswer}</p><p>投票日是 <time datetime="${ELECTION_DATE}">2026 年 11 月 28 日</time>。你可以從下方 22 縣市名單進入各選區，或使用互動地圖依地址查詢自己能投票的候選人。</p><p class="updated">這是本站目前收錄的登記資料；登記後仍須經資格審查與抽籤，正式候選人名單與號次以中央選舉委員會公告為準。</p></section>
<a class="cta" href="/">開啟 2026 互動選舉地圖</a><a class="cta secondary" href="#county-heads">直接看縣市長人選</a>
<h2>目前資料涵蓋範圍</h2><div class="stats"><div class="stat"><strong>${totalRegistrations.toLocaleString('zh-TW')}</strong><span>登記參選人次</span></div><div class="stat"><strong>22</strong><span>縣市</span></div><div class="stat"><strong>${townTotal}</strong><span>鄉鎮市區</span></div><div class="stat"><strong>${coverage.villages.toLocaleString('zh-TW')}</strong><span>村里</span></div></div>
<h2>全台 22 縣市候選人入口</h2><table><thead><tr><th>縣市</th><th>縣市長登記參選人</th><th>議員登記參選人</th><th>鄉鎮市區</th></tr></thead><tbody>${countyRows.map((r) => `<tr><td><a href="/election/${r.c.id}">${esc(r.c.name)}</a></td><td>${r.mayors}</td><td>${r.council}</td><td>${r.towns}</td></tr>`).join('')}</tbody></table>
<h2 id="county-heads">2026 縣市長登記參選人名單</h2>${countyRows.map((r) => `<h3><a href="/election/${r.c.id}">${esc(r.c.name)}</a>（${r.mayors} 人）</h3><p class="county-candidates">${r.mayorList.map((candidate) => `${esc(candidate.name)}（${esc(party(candidate.party))}）`).join('、') || '<span class="note">目前尚無登記資料</span>'}</p>`).join('')}
<h2>如何查詢今年選舉的候選人？</h2><h3>可以用地址查詢嗎？</h3><p class="faq-answer">可以。回到<a href="/">島民選舉地圖</a>輸入縣市、鄉鎮市區或完整地址，即可查看該地區的縣市長、議員、鄉鎮市長、代表與村里長登記參選人。</p><h3>這份名單是官方最終名單嗎？</h3><p class="faq-answer">不是。本頁整理目前公開的登記資料並持續更新；資格審查、候選人號次與最終名單仍以中央選舉委員會公告為準。</p><h3>資料從哪裡來？</h3><p class="faq-answer">資料來源包含<a href="https://web.cec.gov.tw/">中央選舉委員會</a>、內政部地方公職人員資訊、各縣市議會公開名冊與可核對的公開來源。</p>`;
  const desc = `2026 選舉地圖與全台候選人名單：截至 ${today} 收錄 ${totalRegistrations.toLocaleString('zh-TW')} 筆登記資料，可依 22 縣市、鄉鎮市區與地址查詢縣市長、議員、鄉鎮市長、代表及村里長。`;
  const faq = {
    '@context': 'https://schema.org', '@type': 'FAQPage', mainEntity: [
      { '@type': 'Question', name: '2026 地方選舉候選人有哪些？', acceptedAnswer: { '@type': 'Answer', text: quickAnswer } },
      { '@type': 'Question', name: '可以用地址查詢 2026 地方選舉候選人嗎？', acceptedAnswer: { '@type': 'Answer', text: '可以。在島民選舉地圖輸入縣市、鄉鎮市區或完整地址，可查看該地區各類地方公職登記參選人。' } },
      { '@type': 'Question', name: '這份 2026 候選人名單是官方最終名單嗎？', acceptedAnswer: { '@type': 'Answer', text: '不是。本頁整理目前公開的登記資料；資格審查、候選人號次與最終名單仍以中央選舉委員會公告為準。' } },
    ],
  };
  const dataset = {
    '@context': 'https://schema.org', '@type': 'Dataset', name: '2026 臺灣地方選舉候選人與選區資料集', description: desc,
    url: SITE + '/election/', inLanguage: 'zh-TW', dateModified: today, temporalCoverage: `2026-01-01/${ELECTION_DATE}`,
    spatialCoverage: { '@type': 'Place', name: '臺灣' }, isAccessibleForFree: true,
    creator: { '@type': 'Organization', name: NAME, url: SITE + '/' },
    citation: ['https://web.cec.gov.tw/', 'https://www.moi.gov.tw/LocalOfficial.aspx'],
    keywords: ['2026 地方選舉', '2026 九合一選舉', '選舉地圖', '候選人名單', '縣市長候選人', '議員候選人', '村里長候選人'],
    includedInDataCatalog: { '@type': 'DataCatalog', name: '島民觀察室選舉資料庫', url: SITE + '/election/' },
  };
  const countyList = {
    '@context': 'https://schema.org', '@type': 'ItemList', name: '2026 全台 22 縣市候選人頁面', numberOfItems: countyRows.length,
    itemListElement: countyRows.map((row, index) => ({ '@type': 'ListItem', position: index + 1, name: `${row.c.name} 2026 地方選舉候選人`, url: `${SITE}/election/${row.c.id}` })),
  };
  fs.writeFileSync(path.join(ROOT, 'election/index.html'), shell({ title: '2026 選舉地圖與候選人名單｜全台 22 縣市｜島民觀察室', desc, canon: '/election/', h1: '2026 選舉地圖與全台候選人名單', body, ld: [dataset, countyList, faq], pageType: 'CollectionPage', crumbs: [['首頁', '/'], ['全台縣市', '/election/']] }));
}

fs.writeFileSync(path.join(ROOT, 'sitemap.xml'), `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n${urls.map((u) => `<url><loc>${SITE}${u.loc}</loc><lastmod>${today}</lastmod><changefreq>${u.freq}</changefreq><priority>${u.pri}</priority></url>`).join('\n')}\n</urlset>\n`);
fs.writeFileSync(path.join(ROOT, 'robots.txt'), `# 歡迎搜尋引擎與 AI 搜尋／回答引擎收錄本站公開內容
User-agent: *
Allow: /

User-agent: GPTBot
Allow: /
User-agent: OAI-SearchBot
Allow: /
User-agent: ChatGPT-User
Allow: /
User-agent: ClaudeBot
Allow: /
User-agent: Claude-SearchBot
Allow: /
User-agent: Claude-User
Allow: /
User-agent: PerplexityBot
Allow: /
User-agent: Google-Extended
Allow: /
User-agent: Applebot-Extended
Allow: /

Sitemap: ${SITE}/sitemap.xml
`);
fs.writeFileSync(path.join(ROOT, 'llms.txt'), `# ${NAME}

> 2026 年（中華民國 115 年）11 月 28 日臺灣地方公職人員選舉的互動地圖與候選人資料庫，涵蓋 22 縣市的縣市長、議員、鄉鎮市長、鄉鎮市民代表與村里長。獨立民間資訊平台，非官方機構；資料以中央選舉委員會公告為準。

## 快速答案
截至 ${today}，本站收錄 2026 地方選舉登記參選資料 ${Object.values(coverage).slice(0, 5).reduce((sum, value) => sum + value, 0).toLocaleString('zh-TW')} 人次，其中縣市首長 ${coverage.countyHeads} 人、議員 ${coverage.councilors.toLocaleString('zh-TW')} 人、鄉鎮市長與原民區長 ${coverage.townHeads} 人、鄉鎮市民代表與原民區民代表 ${coverage.representatives.toLocaleString('zh-TW')} 人、村里長 ${coverage.villageHeads.toLocaleString('zh-TW')} 人。登記後仍須經資格審查與抽籤，正式候選人名單與號次以中選會公告為準。

## 主要頁面
- [互動選舉地圖](${SITE}/): 從全台逐層下探到縣市、鄉鎮市區、村里，支援候選人姓名與地址搜尋
- [全台候選人名單索引](${SITE}/election/): 22 縣市入口
- [歷年總統選舉](${SITE}/history/): 1996–2024 總統副總統選舉結果、地圖與跨屆比較
- [歷年縣市長選舉](${SITE}/history/local-executive): 1994–2022 縣市長選舉結果與跨屆比較

## 2026 各縣市首長登記參選人
${countyRows.map((r) => `- [${r.c.name}](${SITE}/election/${r.c.id}): ${r.mayorList.map((candidate) => `${candidate.name}（${party(candidate.party)}）`).join('、') || '目前尚無登記資料'}；另收錄 ${r.council} 位議員登記參選人與 ${r.towns} 個鄉鎮市區入口`).join('\n')}

## 資料來源
中央選舉委員會、內政部地方公職人員資訊、各縣市議會公開名冊與可核對的公開來源。最後更新：${today}。本站不是政府機關；資格審查、正式候選人名單、號次與投票資訊以中央選舉委員會公告為準。

## 聯絡
contact@formosaobservatory.com
`);

fs.writeFileSync(path.join(ROOT, 'llms-full.txt'), `# ${NAME}：2026 地方選舉資料說明

## 這個網站提供什麼？
島民觀察室提供 2026 年 11 月 28 日臺灣地方公職人員選舉的互動地圖、登記參選人名單與選區查詢。使用者可輸入候選人姓名或地址，從全台 22 縣市下探至 368 個鄉鎮市區與 ${coverage.villages.toLocaleString('zh-TW')} 個村里。

## 截至 ${today} 的收錄統計
- 縣市首長登記參選人：${coverage.countyHeads} 人
- 直轄市及縣市議員登記參選人：${coverage.councilors.toLocaleString('zh-TW')} 人
- 鄉鎮市長及直轄市山地原住民區長登記參選人：${coverage.townHeads} 人
- 鄉鎮市民代表及直轄市山地原住民區民代表登記參選人：${coverage.representatives.toLocaleString('zh-TW')} 人
- 村里長登記參選人：${coverage.villageHeads.toLocaleString('zh-TW')} 人

## 22 縣市首長登記參選人與入口
${countyRows.map((r) => `### ${r.c.name}\n候選人：${r.mayorList.map((candidate) => `${candidate.name}（${party(candidate.party)}）`).join('、') || '目前尚無登記資料'}\n詳細頁：${SITE}/election/${r.c.id}\n議員登記參選人：${r.council} 人；鄉鎮市區：${r.towns} 個`).join('\n\n')}

## 查詢入口
- 全台互動地圖：${SITE}/
- 全台候選人索引：${SITE}/election/
- 歷年總統選舉：${SITE}/history/
- 歷年縣市長選舉：${SITE}/history/local-executive

## 引用與資料限制
資料來源包含中央選舉委員會、內政部地方公職人員資訊、各縣市議會公開名冊與可核對的公開來源。本站是獨立民間資訊平台，不是政府機關。登記後仍須經資格審查與抽籤；正式候選人名單、號次、選區與投票資訊以中央選舉委員會公告為準。引用本站時，請標示「Formosa Observatory｜島民觀察室」與對應頁面網址。

聯絡：contact@formosaobservatory.com
`);
console.log(`county ${counties.length}, towns ${townTotal}, urls ${urls.length}`);
