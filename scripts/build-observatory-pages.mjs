// Build factual, source-linked election notes from the checked-in CEC history data.
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const mayor = JSON.parse(fs.readFileSync(path.join(root, 'data/history/local-executive.json'), 'utf8')).years;
const council = JSON.parse(fs.readFileSync(path.join(root, 'data/history/councilor.json'), 'utf8')).years;
const date = '2026-10-30'; // Editorial revision date; do not refresh on unrelated rebuilds.
const site = 'https://formosaobservatory.com';
const fmt = value => Number(value).toLocaleString('zh-TW');
const signed = value => `${value > 0 ? '+' : ''}${fmt(value)}`;
const percentagePoints = value => `${value > 0 ? '+' : ''}${value.toFixed(2)} 個百分點`;
const esc = value => String(value).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
const source = `<a href="https://db.cec.gov.tw/ElecTable/Election" rel="noopener noreferrer">中央選舉委員會選舉資料庫</a>`;
const mayorMethodology = '本站以中選會歷屆投開票結果的候選人紀錄重新加總，採同屆、同選舉類型比較。數字為歷史正式投開票資料，不代表 2026 年登記、審定或正式候選人數。2018 與 2022 年縣市長皆以現行 22 縣市作比較單位；2022 年嘉義市納入 12 月 18 日重行選舉。';

const mayorRows = Object.keys(mayor['2022'].races).map(name => ({ name, a: mayor['2018'].races[name].candidates.length, b: mayor['2022'].races[name].candidates.length }));
const mayorA = mayorRows.reduce((sum, row) => sum + row.a, 0);
const mayorB = mayorRows.reduce((sum, row) => sum + row.b, 0);
const councilRows = Object.keys(council['2022'].counties).map(name => ({ name, a: council['2018'].counties[name].stats.candidateCount, b: council['2022'].counties[name].stats.candidateCount, turnoutA: council['2018'].counties[name].stats.turnout, turnoutB: council['2022'].counties[name].stats.turnout }));
const councilA = council['2018'].stats.candidateCount;
const councilB = council['2022'].stats.candidateCount;
if (mayorRows.length !== 22 || mayorA !== 93 || mayorB !== 94 || councilRows.length !== 22 || councilRows.reduce((s, r) => s + r.a, 0) !== councilA || councilRows.reduce((s, r) => s + r.b, 0) !== councilB) {
  throw new Error('Historical comparison inputs changed; review article text before rebuilding.');
}

if (council['2018'].stats.electedSeats !== 912 || council['2022'].stats.electedSeats !== 910) throw new Error('Historical elected-seat totals changed; review the correction note before rebuilding.');

const table = (rows, aLabel, bLabel, value = r => [r.a, r.b], difference = r => r.b - r.a, formatDifference = signed) => `<div class="table-wrap"><table><thead><tr><th scope="col">縣市</th><th scope="col">${aLabel}</th><th scope="col">${bLabel}</th><th scope="col">差異</th></tr></thead><tbody>${rows.map(r => { const [a, b] = value(r); const delta = difference(r); return `<tr><th scope="row">${esc(r.name)}</th><td>${typeof a === 'number' ? fmt(a) : esc(a)}</td><td>${typeof b === 'number' ? fmt(b) : esc(b)}</td><td class="${delta > 0 ? 'up' : delta < 0 ? 'down' : ''}">${formatDifference(delta)}</td></tr>`; }).join('')}</tbody></table></div>`;
const articles = [
  {
    slug: 'mayor-candidates-2018-2022',
    category: '參選人數',
    title: '2018 到 2022：縣市長選舉參選人數如何變化？',
    desc: '依中選會投開票資料，比較 2018 與 2022 年 22 縣市首長選舉的參選人數與縣市差異。',
    lead: `全臺 22 縣市的縣市長選舉，2018 年共有 ${fmt(mayorA)} 位參選人，2022 年共有 ${fmt(mayorB)} 位，增加 ${fmt(mayorB - mayorA)} 位。全國總數接近，不表示每個地方都沒有變動。`,
    body: `<h2>哪些地方增加，哪些地方減少？</h2><p>臺北市由 5 人變為 12 人，增加 7 人，是增加最多的縣市；基隆市由 2 人變為 5 人，增加 3 人。澎湖縣由 7 人變為 3 人，減少 4 人，是減少最多的縣市。這些數字僅描述參選人數，不用來推論競爭程度或選民偏好。</p><p>下表列出全部 22 縣市。表格依 2022 年縣市名稱排列；若比較特定縣市的政黨得票與投票率，可前往<a href="/history/local-executive.html">歷年縣市長選舉</a>查看。</p>${table(mayorRows, '2018 人數', '2022 人數')}<h2>統計口徑</h2><p>${mayorMethodology}</p>`,
    data: 'data/history/local-executive.json'
  },
  {
    slug: 'councilor-candidates-2018-2022',
    category: '議員選舉',
    title: '議員參選人數：2022 年比 2018 年少了多少？',
    desc: '整理中選會歷屆議員選舉資料，比較 2018 與 2022 年 22 縣市參選人數及席次。',
    lead: `22 縣市議員選舉的參選人數，2018 年為 ${fmt(councilA)} 人，2022 年為 ${fmt(councilB)} 人，減少 ${fmt(councilA - councilB)} 人。同期當選席次由 ${fmt(council['2018'].stats.electedSeats)} 席變為 ${fmt(council['2022'].stats.electedSeats)} 席。`,
    body: `<h2>縣市差異</h2><p>宜蘭縣由 73 人降至 58 人，減少 15 人；花蓮縣由 69 人降至 58 人，減少 11 人。南投縣由 61 人升至 68 人，增加 7 人；新北市由 120 人升至 126 人，增加 6 人。全國減少 74 人，但並非每個縣市都減少。</p><p>本表包含資料庫收錄的區域、平地原住民與山地原住民議員選舉；不是只計算一般行政區。席次是當選席次，不能直接以參選人數變化推論選區競爭程度。各縣市與選區結果可在<a href="/history/councilor.html">歷年議員選舉</a>查核。</p>${table(councilRows, '2018 人數', '2022 人數')}<h2>統計口徑</h2><p>候選人數取自中選會選舉資料庫的歷屆正式結果，各縣市加總與本站歷史資料檔的全國總數一致。議員資料以各縣市的區域、平地原住民與山地原住民選區為單位加總；2018 與 2022 年各自採當年的正式投開票結果。計數單位是參選紀錄，不用姓名去除不同選區的紀錄。兩屆資料皆有 22 縣市，但每屆選區與當選席次可能不同。資料不包含 2026 年登記人數，也不混入縣市長選舉或其重行選舉。</p>`,
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

// Derived editorial examples share the same checked-in inputs as the tables.
const countyChanges = rows => ({
  up: rows.filter(r => r.b > r.a).length,
  down: rows.filter(r => r.b < r.a).length,
  same: rows.filter(r => r.b === r.a).length,
  added: rows.reduce((s, r) => s + Math.max(0, r.b - r.a), 0),
  removed: rows.reduce((s, r) => s + Math.max(0, r.a - r.b), 0),
});
const mayorChanges = countyChanges(mayorRows);
const councilChanges = countyChanges(councilRows);
const yilan = council['2022'].counties['宜蘭縣'].stats;
const national18 = council['2018'].stats;
const national22 = council['2022'].stats;
const mayorNet = mayorB - mayorA;
articles[0].body += `<h2>全國只增加一人，為何還要分縣市看？</h2>
<p>把 22 個縣市拆開，${mayorChanges.up} 個縣市人數增加、${mayorChanges.down} 個減少、${mayorChanges.same} 個持平。增加地區合計多 ${mayorChanges.added} 人，減少地區合計少 ${mayorChanges.removed} 人，兩者抵銷後才得到全國增加 ${mayorNet} 人。全國的淨變化會掩蓋各地不同的變動方向；看自己居住地時，應先找到該縣市，而非直接套用全國趨勢。</p>
<h2>實際怎麼算：以臺北市為例</h2><p>從整理檔的 <code>years["2018"].races["臺北市"].candidates</code> 與 2022 年相同欄位，分別計算陣列長度，得到 5 人與 12 人。先算人數差：12 − 5 = 7；若要看相對增幅，則是 7 ÷ 5 × 100 = 140%。「多 7 人」與「增加 140%」回答不同問題，基期較少時，百分比也容易顯得很大。</p>
<p>接著對每一縣市重複相同計數並加總，得到 93 與 94。這裡計算的是正式投開票結果中收錄的參選紀錄，不是當選人數，也不是新聞中曾表態參選的人數。2022 年嘉義市的縣市長選舉結果納入同一年度比較，不會因投票日期不同而重複計一次。</p>
<h2>人數增加，代表選舉更激烈嗎？</h2><p>單看人數無法回答。12 位候選人的票數可能集中，也可能分散；人數較少的選舉也可能只有很小的得票差。若想理解票源分布，可在歷年縣市長頁面繼續查看有效票、各候選人得票率及前兩名得票差。使用這些指標時仍須注意：不同年份的候選人、政黨推薦與地方背景不相同。</p>
<p>本表不把人數變化歸因於政黨策略、提名制度或選民態度；要討論這些原因，需要另外蒐集可核對的資料。也不能由 2018、2022 年的人數推算 2026 年的勝負。</p>
<h2>自己重算與延伸查詢</h2><p>下載文末 JSON 整理檔，選取年份，再依縣市逐一計算 <code>candidates.length</code>，即可重算表格。原始資料入口可選擇 2018 或 2022 年直轄市長、縣市長選舉；不要誤選議員或補選類別。查詢下一次選舉時，請使用<a href="/election/">2026 名單</a>，不要把歷史正式結果與仍可能更新的登記資料混算。</p>`;
articles[1].body += `<h2>減少的人數集中在哪裡？</h2><p>22 縣市中，${councilChanges.up} 個增加、${councilChanges.down} 個減少、${councilChanges.same} 個持平。增加地區合計多 ${councilChanges.added} 人，減少地區合計少 ${councilChanges.removed} 人；兩者相抵才是全國減少 ${councilA - councilB} 人。因此，看到全國總數下降時，不能直接認定每一個議員選區都出現相同情況。</p>
<h2>實際怎麼算：宜蘭縣與全國</h2><p>整理檔中 <code>years["2018"].counties["宜蘭縣"].stats.candidateCount</code> 是 73，2022 年是 58，因此差異為 58 − 73 = −15 人；相對變化為 −15 ÷ 73 × 100，約減少 20.55%。全國則是 1,677 − 1,751 = −74 人，約減少 ${((councilA - councilB) / councilA * 100).toFixed(2)}%。單一縣市的變化幅度可以與全國不同。</p>
<p>若要從逐選區資料重算，依序讀取各縣市的 <code>districts</code>，將每區 <code>candidates.length</code> 相加，再與該縣市 <code>stats.candidateCount</code> 比較。合併時包含區域、平地原住民與山地原住民選區；同樣的縣市名稱不代表所有人都在同一張議員選票競選。</p>
<h2>用每席人數輔助閱讀，有哪些限制？</h2><p>將全國參選人數除以當選席次，2018 年為 1,751 ÷ ${fmt(council['2018'].stats.electedSeats)} ≈ ${(councilA / council['2018'].stats.electedSeats).toFixed(2)}，2022 年為 1,677 ÷ ${fmt(council['2022'].stats.electedSeats)} ≈ ${(councilB / council['2022'].stats.electedSeats).toFixed(2)}。這是全國彙總的「每一當選席次對應多少參選紀錄」，不是個人的當選機率，也不是每個選區的競爭程度。</p>
<p>議員資料包含不同大小、不同席次與不同類別的選區；全國比值會把這些差異壓成一個數字。想知道自己選區的選擇是否變多，應比較同一選區的參選人數與席次，並先核對跨屆是否改劃。若使用公告應選席次，還須區分它與本資料檔計算的實際當選席次。</p>
<h2>怎麼把表格用在自己的地方？</h2><p>先在上表找出縣市變動，再到<a href="/history/councilor">歷年議員選舉</a>選擇年份、縣市與選區，查看名單及得票。不要把縣市加總當成單一候選人必須面對的全部對手。若關心 2026 年候選人，請到<a href="/election/">當屆名單</a>另行查看資格註記與號次，歷史人數不會自動對應當屆名冊。</p>
<h2>本次更正</h2><p>2026 年 10 月 30 日：移除原本誤植於本篇的「縣市長」及「嘉義市重行選舉」統計說明，改以議員的區域與原住民選區口徑說明。另修正歷史資料轉製漏辨識婦女保障當選標記的問題：2018 年議員當選席次由 908 改為 912，2022 年由 906 改為 910。參選人數與本篇縣市人數表未變動；每席人數比值依更正後席次重算。可查閱<a href="/data/history/corrections/2026-10-30-councilor-flags.json">8 筆更正紀錄與核對來源</a>。</p>`;
articles[2].body += `<h2>投票率的分母是什麼？</h2><p>本篇採「投票數 ÷ 選舉人數 × 100」，不是用有效票除以選舉人數。以 2022 年宜蘭縣為例：投票數 ${fmt(yilan.votesCast)}、選舉人數 ${fmt(yilan.electors)}，相除後為 ${(yilan.votesCast / yilan.electors * 100).toFixed(2)}%。其中有效票為 ${fmt(yilan.validVotes)}、無效票為 ${fmt(yilan.invalidVotes)}，兩者相加等於投票數；無效票仍屬已投下的選票。</p>
<h2>百分點與百分比，差在哪裡？</h2><p>全國投票率從 66.99% 變成 61.14%，直接相減是 −5.85 個百分點。若改問「相對於原本的投票率，降低多少」，則用 (61.14 − 66.99) ÷ 66.99 × 100，約為 −${((national18.turnout - national22.turnout) / national18.turnout * 100).toFixed(2)}%。兩種數字都可以描述變化，但基準不同，因此表格一律用百分點，避免混淆。</p>
<h2>為什麼不能把 22 縣市直接平均？</h2><p>各地選舉人數不同。直接平均縣市百分比，相當於讓選舉人數很少與很多的縣市擁有相同權重。本篇全國數值使用整理檔的全國統計欄位；可用 2022 年全國投票數 ${fmt(national22.votesCast)} 除以選舉人數 ${fmt(national22.electors)} 核對，四捨五入後是 ${(national22.votesCast / national22.electors * 100).toFixed(2)}%。2018 年則是 ${fmt(national18.votesCast)} ÷ ${fmt(national18.electors)}，約 ${(national18.votesCast / national18.electors * 100).toFixed(2)}%。</p>
<h2>投票率下降，能推論什麼？</h2><p>可以描述的是：相對於當屆具有該類選票資格的選舉人，實際投票的比例下降。僅靠兩個年度的彙總數字，無法辨識哪些人沒有投票，也不能判斷變化來自候選人吸引力、天氣、人口移動或其他原因。這些解釋需要不同資料與研究設計支持。</p>
<p>不同職務選舉的選舉人範圍與投票數可能不同；本篇只比較議員選舉，不拿市長投票率代替議員投票率。也不要把議員資料中的嘉義市數字與縣市長重行選舉混用。各縣市內部仍有一般區域及原住民選區差異，縣市平均不能代表每一個社區。</p>
<h2>如何核對表中的一個數字？</h2><p>下載文末整理檔，在 <code>years["2022"].counties</code> 找到縣市，讀取 <code>stats.electors</code>、<code>stats.votesCast</code> 與 <code>stats.turnout</code>；先除後乘 100，最後才取小數點兩位。若以已取整的百分比進行其他運算，可能產生微小差異。原始中選會入口請選同一年議員選舉的投開票概況，與<a href="/history/councilor">本站歷年頁</a>交叉核對。</p>`;

const shell = ({ title, desc, canon, body, type = 'WebPage' }) => `<!doctype html><html lang="zh-TW"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>${esc(title)}｜島民觀察室</title><meta name="description" content="${esc(desc)}"><meta name="robots" content="index,follow,max-snippet:-1,max-image-preview:large"><link rel="canonical" href="${site}${canon}"><link rel="icon" type="image/png" href="/favicon.png"><meta property="og:type" content="${type === 'Article' ? 'article' : 'website'}"><meta property="og:title" content="${esc(title)}"><meta property="og:description" content="${esc(desc)}"><meta property="og:url" content="${site}${canon}"><meta property="og:image" content="${site}/social-preview.png">${type === 'Article' ? '<script async src="https://pagead2.googlesyndication.com/pagead/js/adsbygoogle.js?client=ca-pub-5043287080308993" crossorigin="anonymous"></script>' : ''}<script type="application/ld+json">${JSON.stringify({ '@context': 'https://schema.org', '@type': type, headline: title, description: desc, url: site + canon, datePublished: type === 'Article' ? '2026-10-29' : date, dateModified: date, inLanguage: 'zh-TW', author: { '@type': 'Organization', name: '島民觀察室', url: site + '/about/' }, publisher: { '@type': 'Organization', name: '島民觀察室', url: site, logo: { '@type': 'ImageObject', url: site + '/favicon.png' } } })}</script><link rel="stylesheet" href="/observatory/insights.css"><link rel="stylesheet" href="/assets/ui/page-transition.css?v=20261030"></head><body><header class="site-header"><a class="brand" href="/"><img src="/assets/brand/formosa-mark.png" alt=""><span>島民觀察室</span></a><nav aria-label="主要導覽"><a href="/">選舉地圖</a><a href="/history/">歷年選舉</a><a href="/observatory/"${canon.startsWith('/observatory/') ? ' aria-current="page"' : ''}>政治觀察</a><a href="/related/"${canon.startsWith('/related/') ? ' aria-current="page"' : ''}>相關網站</a><a href="/about/">關於我們</a></nav></header>${body}<footer><a href="/"><img src="/assets/brand/formosa-lockup.png" alt="Formosa Observatory 島民觀察室"></a><p>本站為獨立民間資訊平台，非政府機關或政黨網站。資料更正：<a href="mailto:contact@formosaobservatory.com">contact@formosaobservatory.com</a>　<a href="/privacy/">隱私權政策</a></p></footer><script defer src="/assets/ui/page-transition.js?v=20261030"></script></body></html>`;

const cards = articles.map((article, i) => `<a class="story-card" href="/observatory/${article.slug}/"><span class="story-no">0${i + 1} / ${esc(article.category)}</span><h2>${esc(article.title)}</h2><p>${esc(article.lead)}</p><span class="story-link">閱讀資料觀察 →</span></a>`).join('');
const index = shell({ title: '政治觀察｜歷屆選舉資料筆記', desc: '以中選會公開資料整理臺灣歷屆選舉參選人數與投票率變化，清楚標示統計口徑、年份和來源。', canon: '/observatory/', body: `<main><div class="eyebrow">POLITICAL OBSERVATORY / DATA NOTES</div><h1>政治觀察</h1><p class="lead">用同一套口徑比較歷屆選舉。每篇列出原始來源、統計方法與完整縣市數字；只描述資料可支持的事實，不預測勝負。</p><div class="story-grid">${cards}</div><section class="note"><h2>閱讀與核對</h2><p>本站以${source}的歷史結果製作統計；本站保存的<a href="/history/">歷屆選舉互動頁</a>可用於逐屆核對。2026 年登記資料與歷史正式結果分屬不同階段，文章不直接混算。外部資料入口另見<a href="/related/">相關網站</a>。</p></section></main>` });
fs.mkdirSync(path.join(root, 'observatory'), { recursive: true });
fs.writeFileSync(path.join(root, 'observatory/index.html'), index);
for (const article of articles) {
  const dir = path.join(root, 'observatory', article.slug);
  fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(path.join(dir, 'index.html'), shell({ title: article.title, desc: article.desc, canon: `/observatory/${article.slug}/`, type: 'Article', body: `<main class="article"><a class="back" href="/observatory/">← 返回政治觀察</a><div class="eyebrow">${esc(article.category)} / 2018—2022</div><h1>${esc(article.title)}</h1><p class="article-meta">島民觀察室資料整理　·　發布日期 <time datetime="2026-10-29">2026-10-29</time>　·　修訂日期 <time datetime="${date}">${date}</time>　·　<a href="/about/#workflow">整理與核對方式</a>　·　資料：中選會歷屆選舉結果</p><p class="lead">${esc(article.lead)}</p>${article.body}<section class="note"><h2>資料來源與更正</h2><p>原始來源：${source}。本站整理檔：<a href="/${article.data}">${article.data}</a>。資料轉製方式見<a href="https://github.com/twoheart1222/taiwan-election-map/blob/main/data/history/README.md">歷史資料說明</a>；如果發現錯誤，請來信 <a href="mailto:contact@formosaobservatory.com">contact@formosaobservatory.com</a>。</p></section><a class="back" href="/observatory/">← 查看其他資料觀察</a></main>` }));
}
console.log(`Built ${articles.length} source-linked observatory articles and index.`);

const aboutBody = `<main class="article"><div class="eyebrow">ABOUT / METHODS</div><h1>關於島民觀察室</h1><p class="lead">把分散的選舉名單、選區與歷史結果整理成可以查詢、比較，也能回到原始來源核對的公共資訊。</p>
<section class="about-mission" aria-labelledby="about-mission-title"><h2 id="about-mission-title">用資料，看懂我們<br>生活的這座島。</h2><p>Formosa Observatory 以視覺與資料整理 2026 地方選舉，從 22 縣市逐層下探至鄉鎮市區與村里，讓候選人名單、選區與可取得的官方選舉公報能從同一個入口查詢。</p><p>資料彙整自官方公開來源，並由維護團隊校閱；我們相信，清楚的公共資訊能降低公民參與的門檻。</p><nav class="about-actions" aria-label="開始查詢"><a href="/election/">2026 全台候選人名單 →</a><a href="/observatory/">政治觀察 →</a><a href="/#contact">聯絡我們 →</a></nav></section>
<h2>我們提供什麼？</h2><p>島民觀察室（Formosa Observatory）是獨立民間選舉資訊網站，非中央選舉委員會、地方選舉委員會或政黨的官方網站。網站由島民觀察室維護團隊管理，公開聯絡信箱為 <a href="mailto:contact@formosaobservatory.com">contact@formosaobservatory.com</a>。程式與整理方式可在<a href="https://github.com/twoheart1222/taiwan-election-map">公開 GitHub 專案</a>查看。</p><p>本站以 2026 地方選舉查詢、歷年結果比較及資料筆記為主要內容。互動地圖協助從地址找到地區；文字名單方便直接閱讀；資料筆記則交代數字如何計算與使用。跨網站連結是延伸查核入口，不表示本站與該網站有合作或背書關係。</p>
<h2 id="workflow">資料如何取得與核對？</h2><p>目前使用的資料來源網站清單保留在<a href="/#sources">首頁「資料來源與核對」</a>，本頁說明整理方法與限制。</p><ol><li><strong>保留來源與類別。</strong>現行名單以中選會及地方選委會公開資料為依據；歷史結果取自中選會選舉資料庫，保留年度、選舉類型及當時選區。</li><li><strong>轉成可比較欄位。</strong>整理候選人姓名、政黨、號次、選區及票數；行政邊界、當屆登記與歷史結果分開處理。姓名相同不代表同一個人，需配合地區及職務比對。</li><li><strong>檢查資料一致性。</strong>以程式檢查縣市加總、候選人紀錄、票數及統計欄位，並保留可供回溯的整理檔。程式檢查無法保證每個人名與每筆資料都完全正確。</li><li><strong>核對有疑義項目。</strong>名單衝突、資格註記及讀者回報需回到來源頁確認；無法確認時不將推測當作事實。正式資格、號次及結果仍以主管機關公告為準。</li></ol>
<h2>歷史資料與文章如何製作？</h2><p>歷史原始來源為${source}。本站使用公開整理檔計算文章表格，再補上範圍、計算範例及閱讀限制。表格是程式產生，並非逐字轉貼原始網頁；方法與已知限制見<a href="https://github.com/twoheart1222/taiwan-election-map/blob/main/data/history/README.md">歷史資料說明</a>。讀者可下載各篇文末資料檔重算，並在<a href="/history/">歷年選舉</a>逐年查詢。</p><p>文章以「島民觀察室資料整理」署名，代表網站的組織署名；文章頁另列初次發布及修訂日期。歷史數字描述已發生的結果，不用來預測當屆勝負。登記、資格審定、抽籤號次與投開票結果是不同階段，不應直接混算。</p>
<h2>更新時間與資料缺口</h2><p>本站隨公開公告與維護進度更新，並非即時同步系統。頁面標示的產製日期與來源公告日期可能不同；產製日期不表示每一筆內容都在同日重新查核。缺漏號次、照片或連結不代表當事人沒有登記或沒有相關紀錄。若官方資料與本站不同，請優先核對該職務、選區與最新公告。</p>
<h2 id="corrections">如何提出更正？</h2><p>請寄信至 <a href="mailto:contact@formosaobservatory.com">contact@formosaobservatory.com</a>，或使用<a href="/#contact">聯絡表單</a>，附上本站頁面網址、年份、地區、人物或欄位，以及可核對的官方來源。維護者可依提供的線索查核後修正；無法確認時可能需要補充資料，本站不承諾固定回覆時限。請勿提供不必要的敏感個資。</p><p>對於影響解讀的方法更正，會在相關文章留下日期與修正內容。2026 年 10 月 30 日的議員參選人數文章已列出統計口徑文字更正；參選人數表未變動，另有 2018、2022 年當選席次更正；相關紀錄見<a href="/data/history/corrections/2026-10-30-councilor-flags.json">歷史資料更正檔</a>。未來個別更正以該頁紀錄為準。</p>
<h2>廣告、支持與隱私</h2><p>網站部分內容頁設有 Google AdSense 程式碼；外部連結入口、文章索引及本說明頁不載入廣告程式。本站提供<a href="/#support">營運支持入口</a>；支持不代表對特定候選人或政黨的支持。個人資料、裝置定位、外部服務與廣告 Cookie 的處理方式，請參閱<a href="/privacy/">隱私權政策</a>。</p><p class="article-meta">本頁更新：<time datetime="${date}">${date}</time></p></main>`;
fs.mkdirSync(path.join(root, 'about'), { recursive: true });
fs.writeFileSync(path.join(root, 'about/index.html'), shell({ title: '關於我們與資料核對方式', desc: '島民觀察室的維護資訊、選舉資料取得與核對方式、更新限制及更正管道。', canon: '/about/', type: 'AboutPage', body: aboutBody }));
