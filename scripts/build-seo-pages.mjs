// 產生 SEO 靜態頁：election/index.html、election/<縣市ID>.html、election/<鄉鎮ID>.html，
// 以及 sitemap.xml、robots.txt、llms.txt。資料更新後請重新執行：npm run build:seo
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

const CSS = `*{box-sizing:border-box}body{margin:0;background:#0d0d0d;color:#e9e5dc;font:16px/1.75 "Noto Sans TC",system-ui,sans-serif}a{color:#ff5a72}main{max-width:960px;margin:0 auto;padding:28px 18px 64px}nav.top{display:flex;align-items:center;gap:14px;flex-wrap:wrap;font-size:14px;margin-bottom:22px}.brand{display:inline-flex;align-items:center;gap:9px;color:#f4f1ea;text-decoration:none;font-weight:800}.brand img{width:40px;height:34px;object-fit:contain;padding:4px 5px;background:#f4f1ea;border-radius:7px}h1{font-size:clamp(26px,5vw,42px);line-height:1.2;margin:.2em 0 .4em}h2{font-size:22px;margin:2em 0 .5em;border-left:4px solid #E4022B;padding-left:10px}h3{font-size:17px;margin:1.4em 0 .4em}table{border-collapse:collapse;width:100%;font-size:15px}th,td{border-bottom:1px solid #2b2b2b;padding:6px 8px;text-align:left;vertical-align:top}th{color:#a29c92;font-weight:600}.note{color:#a29c92;font-size:14px}.cta{display:inline-block;margin:10px 0;padding:10px 20px;background:#E4022B;color:#fff;border-radius:999px;text-decoration:none;font-weight:700}ul.links{columns:3 150px;padding-left:18px}footer{margin-top:48px;color:#8a857c;font-size:13px;border-top:1px solid #2b2b2b;padding-top:16px}`;

function shell({ title, desc, canon, h1, body, ld, crumbs }) {
  const bc = {
    '@context': 'https://schema.org', '@type': 'BreadcrumbList',
    itemListElement: crumbs.map((c, i) => ({ '@type': 'ListItem', position: i + 1, name: c[0], item: SITE + c[1] })),
  };
  const page = {
    '@context': 'https://schema.org', '@type': 'WebPage', name: title, description: desc, url: SITE + canon,
    inLanguage: 'zh-TW', dateModified: today, isPartOf: { '@type': 'WebSite', name: NAME, url: SITE + '/' },
    about: { '@type': 'Event', name: '2026 年中華民國地方公職人員選舉', startDate: ELECTION_DATE, location: { '@type': 'Country', name: '臺灣' } },
  };
  const organization = {
    '@context': 'https://schema.org', '@type': 'Organization', name: NAME, url: SITE + '/', logo: SITE + '/favicon.png',
  };
  const ldAll = [bc, page, organization, ...(ld || [])].map((o) => `<script type="application/ld+json">${JSON.stringify(o).replace(/</g, '\\u003c')}</script>`).join('\n');
  return `<!DOCTYPE html>
<html lang="zh-TW">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>${esc(title)}</title>
<meta name="description" content="${esc(desc)}">
<link rel="canonical" href="${SITE}${canon}">
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
<meta name="twitter:card" content="summary_large_image">
<script async src="https://pagead2.googlesyndication.com/pagead/js/adsbygoogle.js?client=${ADSENSE_CLIENT}" crossorigin="anonymous"></script>
<style>${CSS}</style>
${ldAll}
</head>
<body>
<main>
<nav class="top" aria-label="導覽"><a class="brand" href="/"><img src="/assets/brand/formosa-mark.png" alt=""><span>島民觀察室</span></a><a href="/election/">全台縣市</a>${crumbs.slice(2).map((c) => `<a href="${c[1]}">${esc(c[0])}</a>`).join('')}</nav>
<h1>${esc(h1)}</h1>
${body}
<footer>資料整理：${esc(NAME)}（<a href="/">${SITE.replace('https://', '')}</a>），最後更新 ${today}。本站為獨立民間資訊平台，非中央選舉委員會或任何政黨、候選人之官方網站；候選人名單、選區與票數以中央選舉委員會公告為準。聯絡：<a href="mailto:contact@formosaobservatory.com">contact@formosaobservatory.com</a></footer>
</main>
</body>
</html>
`;
}

const candTable = (list, cols = ['姓名', '政黨', '備註']) => list.length
  ? `<table><thead><tr>${cols.map((c) => `<th>${c}</th>`).join('')}</tr></thead><tbody>${list.map((c) => `<tr><td>${esc(c.name)}</td><td>${esc(party(c.party))}</td><td>${[c.isIncumbent ? '現任' : '', c.elected ? '當選' : '', c.prevVotes ? `2022 得票 ${esc(c.prevVotes)}` : ''].filter(Boolean).join('、')}</td></tr>`).join('')}</tbody></table>`
  : '<p class="note">目前尚無登記資料。</p>';

fs.mkdirSync(path.join(ROOT, 'election'), { recursive: true });
const urls = [{ loc: '/', pri: '1.0', freq: 'daily' }, { loc: '/election/', pri: '0.9', freq: 'daily' }];
const countyRows = [];
let townTotal = 0;

for (const c of counties) {
  const mayors = c.candidates || [];
  const blocks = c.councilors || [];
  const allC = flatCouncil(c);
  const cq = quota[c.id] || {};
  const towns = fs.existsSync(path.join(ROOT, `data/towns/towns-${c.id}.json`)) ? feats(readJson(`data/towns/towns-${c.id}.json`)) : [];
  const isCity = ['63000', '64000', '65000', '66000', '67000', '68000'].includes(c.id);
  const head = isCity ? '市長' : '縣市長';
  const cPath = `/election/${c.id}`;
  const title = `${c.name} 2026 地方選舉候選人名單：${head}、議員、村里長｜島民觀察室`;
  const desc = `${c.name} 2026 年 11 月 28 日地方選舉：${head}候選人 ${mayors.length} 人、議員候選人 ${allC.length} 人，含各選區涵蓋地區、政黨與 2022 得票，並可查詢${towns.length} 個${isCity ? '行政區' : '鄉鎮市區'}的村里長候選人。`;
  let body = `<p>${esc(c.name)}於 <time datetime="${ELECTION_DATE}">2026 年 11 月 28 日</time>舉行地方公職人員選舉。本頁整理${esc(c.name)}${head}候選人 ${mayors.length} 人、議員候選人 ${allC.length} 人（共 ${blocks.length} 個選舉區），並列出轄內 ${towns.length} 個${isCity ? '行政區' : '鄉鎮市區'}的候選人頁面。</p>
<a class="cta" href="/?county=${c.id}">在互動地圖中查看${esc(c.name)}</a>`;
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
    itemListElement: mayors.map((m, i) => ({ '@type': 'ListItem', position: i + 1, item: { '@type': 'Person', name: m.name, affiliation: party(m.party) } })),
  }];
  fs.writeFileSync(path.join(ROOT, `election/${c.id}.html`), shell({ title, desc, canon: cPath, h1: `${c.name} 2026 地方選舉候選人名單`, body, ld, crumbs: [['首頁', '/'], ['全台縣市', '/election/'], [c.name, cPath]] }));
  urls.push({ loc: cPath, pri: '0.8', freq: 'daily' });
  countyRows.push({ c, mayors: mayors.length, council: allC.length, towns: towns.length });

  for (const t of towns) {
    townTotal++;
    const tPath = `/election/${t.id}`;
    const tMayors = t.candidates || [];
    const reps = t.representatives || [];
    const repList = reps.flatMap((r) => r.candidates || []);
    let villages = [];
    const vf = path.join(ROOT, `data/villages/villages-${t.id}.json`);
    if (fs.existsSync(vf)) villages = feats(JSON.parse(fs.readFileSync(vf, "utf8")));
    const vCands = villages.reduce((n, v) => n + (v.candidates || []).length, 0);
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
  const body = `<p><time datetime="${ELECTION_DATE}">2026 年 11 月 28 日</time>將舉行地方公職人員選舉，選出直轄市長、縣市長、議員、鄉鎮市長、鄉鎮市民代表、村里長等共 11,051 名地方公職。以下依縣市整理候選人名單。</p><a class="cta" href="/">開啟互動選舉地圖</a>
<table><thead><tr><th>縣市</th><th>縣市長候選人</th><th>議員候選人</th><th>鄉鎮市區</th></tr></thead><tbody>${countyRows.map((r) => `<tr><td><a href="/election/${r.c.id}">${esc(r.c.name)}</a></td><td>${r.mayors}</td><td>${r.council}</td><td>${r.towns}</td></tr>`).join('')}</tbody></table>`;
  const desc = '2026 年 11 月 28 日地方選舉全台 22 縣市候選人名單：縣市長、議員、鄉鎮市長、村里長，依縣市與鄉鎮市區查詢。';
  fs.writeFileSync(path.join(ROOT, 'election/index.html'), shell({ title: '2026 地方選舉候選人名單｜全台 22 縣市｜島民觀察室', desc, canon: '/election/', h1: '2026 地方選舉全台候選人名單', body, crumbs: [['首頁', '/'], ['全台縣市', '/election/']] }));
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

## 主要頁面
- [互動選舉地圖](${SITE}/): 從全台逐層下探到縣市、鄉鎮市區、村里，支援候選人姓名與地址搜尋
- [全台候選人名單索引](${SITE}/election/): 22 縣市入口

## 各縣市候選人名單
${countyRows.map((r) => `- [${r.c.name}](${SITE}/election/${r.c.id}): ${r.mayors} 位${['63000','64000','65000','66000','67000','68000'].includes(r.c.id) ? '市長' : '縣市長'}候選人、${r.council} 位議員候選人、${r.towns} 個鄉鎮市區`).join('\n')}

## 資料來源
中央選舉委員會、內政部地方公職人員資訊、各縣市議會公開名冊。最後更新：${today}。

## 聯絡
contact@formosaobservatory.com
`);
console.log(`county ${counties.length}, towns ${townTotal}, urls ${urls.length}`);
