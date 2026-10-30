// Curated reading notes for representative areas. Candidate records are read-only.
const esc = value => String(value ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
export function countyReadingGuide(county, blocks, quotas) {
  if (county.id !== '63000') return '';
  const normal = blocks.filter(b => Number(b.district) <= 6);
  const indigenous = blocks.filter(b => Number(b.district) > 6);
  const seats = Object.values(quotas || {}).reduce((sum, n) => sum + (Number(n) || 0), 0);
  return `<section class="answer reading-guide" aria-labelledby="county-reading"><h2 id="county-reading">臺北市名單怎麼讀？</h2>
<p>本頁把全市市長與各議員選區放在一起，方便查詢，但不表示每位選民會對全部名單投票。市長名單以全市為範圍；議員則分選舉區。本頁收錄 ${normal.length} 個一般區域議員選區及 ${indigenous.length} 個原住民議員選區，本站席次對照表合計 ${seats} 席；不同類別的選票與資格須依選委會公告確認。</p>
<p>例如松山區與信義區同屬一般區域議員第 3 選舉區；若只以行政區名稱找議員，容易漏看另一個行政區的共同選區名單。可以先進入<a href="/election/63000010">松山區</a>看選區閱讀說明，再回來核對本頁第 3 選舉區。第 7、8 選舉區為原住民選區，不能只依居住行政區套用一般區域名單。</p>
<p>「2022 得票」是上屆參選紀錄；「現任」與本次號次是不同欄位。即使同一位人物再次參選，也應先核對上屆職務與選區，不能把歷史票數當作本期預測。資格不符註記保留原因與官方來源，仍列入本站收錄名單，因此總紀錄數不一定等於具有投票號次的正式候選人數。</p>
<p>名單產製與更正方式見<a href="/about/#workflow">資料核對說明</a>；歷年比較可查<a href="/history/councilor">議員結果</a>及<a href="/history/local-executive">市長結果</a>。個別號次請以本頁上方註明的地方選委會公告為準。</p></section>`;
}
export function townReadingGuide({ county, town, villages, districtBlocks, districtMap, quotas, mayors, representatives }) {
  const key = String(town.id);
  if (!['09007010', '63000010', '10002010'].includes(key)) return '';
  const scoped = districtBlocks.map(block => {
    const mapping = districtMap?.[String(block.district)] || {};
    const coverage = mapping.villages?.length ? `${(mapping.towns || []).join('、')}：${mapping.villages.join('、')}` : (mapping.towns || []).join('、');
    const seats = quotas?.[String(block.district)];
    return `第 ${esc(block.district)} 選舉區（${esc(coverage)}${seats ? `；本站席次表 ${esc(seats)} 席` : ''}）`;
  }).join('、');
  const counts = villages.map(v => (v.candidates || []).length);
  const one = counts.filter(n => n === 1).length;
  const multiple = counts.filter(n => n > 1).length;
  const missing = counts.filter(n => n === 0).length;
  let text = '';
  if (key === '09007010') text = `<p>南竿鄉需要分開閱讀鄉長、縣議員、鄉民代表與村長四類地方名單；連江縣長則請到<a href="/election/09007">全縣頁</a>查看。本頁鄉長收錄 ${mayors.length} 筆、鄉民代表涵蓋 ${representatives.length} 個名冊區塊；各職務是分開的選舉，不應將四類人數加起來當作同一場選舉的對手。</p>
<p>本站的議員選區對照將南竿鄉列入${scoped}。南竿的村界圖資另含沒有村名的離岸圖形，本頁只計算具有正式村名與行政代碼的 ${villages.length} 個村；地圖中看見的島礁形狀數量，不能拿來當作村數或村長席次。</p>`;
  if (key === '63000010') text = `<p>松山區的一般區域議員查詢對應${scoped}。這個選區與信義區共用名單，所以兩區頁面會出現相同議員，並不是本站重複登記兩次。全市加總以縣市頁的選區紀錄為準，不應把各行政區重複顯示的議員表再相加。</p>
<p>本頁的 ${villages.length} 個里各自列出里長參選人，與議員的共同選區不同。臺北市長請到<a href="/election/63000">全市頁</a>查詢。本頁未列一般行政區區長的競選名單，不可把一般行政區與直轄市山地原住民區的選舉制度混為一談；實際應領選票仍應核對選委會通知。</p>`;
  if (key === '10002010') text = `<p>宜蘭市是宜蘭縣內的縣轄市；本頁「市長」是宜蘭市長，不是宜蘭縣長。宜蘭縣長候選人請到<a href="/election/10002">縣級頁</a>查看。本頁另收錄市民代表 ${representatives.length} 個名冊區塊，以及 ${villages.length} 個里的里長名單，代表與里長的選區層級不同。</p>
<p>本站的一般區域議員對照為${scoped}。這張議員表對應縣議會席次，而不是市民代表會席次；閱讀「應選席次」或比較上屆票數時，必須先分清楚職務。原住民等不同選舉類別請另依縣級名單與主管機關公告核對。</p>`;
  return `<section class="answer reading-guide" aria-labelledby="town-reading"><h2 id="town-reading">${esc(town.name)}選區閱讀筆記</h2>${text}
<h3>村里名單與缺漏如何判讀？</h3><p>以本次產製名單計算，${one} 個村里目前收錄 1 人、${multiple} 個收錄 2 人以上${missing ? `，另有 ${missing} 個尚未收錄參選人` : ''}。這是本站的資料狀態，不是正式當選判定；一人登記不代表已當選，也不能將未收錄解讀為沒有候選人。村里名單以各自的村里為單位，不能把全鄉鎮市區的人選當成同一張選票。</p>
<h3>號次、資格與歷史票數</h3><p>號次只在資料已有收錄時顯示；空白不等於 0 號或資格不符。資格註記另附原因與來源；「2022 得票」也只代表本站找到的歷史參選紀錄，不是本期得票、民調或勝選機率。跨屆比較前請先核對職務與選區。</p>
<p>本頁對照採本站<a href="/data/district_town_map.json">議員選區範圍整理檔</a>、<a href="/data/district_quota.json">席次整理檔</a>及目前候選人名單；正式邊界、席次、資格與號次以<a href="https://web.cec.gov.tw/">中選會及地方選委會公告</a>為準。資料產製日期不代表逐筆重新查核日期。來源流程與更正管道見<a href="/about/#workflow">關於我們與資料核對</a>。</p></section>`;
}
