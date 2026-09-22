(()=>{
  const YEARS=[2014,2018,2022];
  const COUNTIES=['臺北市','新北市','桃園市','臺中市','臺南市','高雄市','基隆市','新竹市','嘉義市','新竹縣','苗栗縣','彰化縣','南投縣','雲林縣','嘉義縣','屏東縣','宜蘭縣','花蓮縣','臺東縣','澎湖縣','金門縣','連江縣'];
  const ISLANDS=['澎湖縣','金門縣','連江縣'];
  const COLORS={DPP:'#2daf5d',KMT:'#3b82f6',TPP:'#28c4c7',PFP:'#f59e0b',NP:'#f6c945',IND:'#9b948a',OTHER:'#b79c78'};
  const PARTY_LABEL={DPP:'民主進步黨',KMT:'中國國民黨',TPP:'台灣民眾黨',IND:'其他／無黨籍',OTHER:'其他政黨'};
  const LAYER_LABEL={winner:'勝方版圖',share:'得票率變化',swing:'藍綠 Swing'};
  const $=s=>document.querySelector(s);
  const $$=s=>[...document.querySelectorAll(s)];
  const fmt=new Intl.NumberFormat('zh-TW');
  const normalize=v=>String(v||'').replaceAll('台','臺').replace(/\s+/g,'').trim();
  const esc=v=>String(v??'').replace(/[&<>"']/g,ch=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[ch]));
  const partyKey=party=>{party=String(party||'');if(party==='民主進步黨')return'DPP';if(party==='中國國民黨')return'KMT';if(party==='台灣民眾黨')return'TPP';if(party==='親民黨')return'PFP';if(party==='新黨')return'NP';if(party.includes('無黨籍'))return'IND';return'OTHER'};
  const partyColor=key=>COLORS[key]||COLORS.OTHER;
  const signed=(v,d=2)=>v==null||!Number.isFinite(v)?'—':`${v>=0?'+':''}${v.toFixed(d)}`;
  const pct=v=>v==null||!Number.isFinite(v)?'—':`${Number(v).toFixed(2)}%`;
  const mobile=()=>matchMedia('(max-width:660px)').matches;

  const SOURCES=Object.fromEntries(YEARS.map(year=>[year,[
    `https://raw.githubusercontent.com/kiang/db.cec.gov.tw/master/data/${year}/直轄市長.csv`,
    `https://raw.githubusercontent.com/kiang/db.cec.gov.tw/master/data/${year}/縣市長.csv`
  ]]));
  const cache=new Map();
  let topology=null,features=[],svg=null,path=null;
  let mode='single',year=2022,level='national',region='',compareA=2018,compareB=2022,layer='winner',party='DPP',compareSelection='';
  let renderToken=0;

  async function fetchText(url){const r=await fetch(url,{cache:'force-cache'});if(!r.ok)throw new Error(`${r.status} ${url}`);return r.text()}
  async function loadYear(target){
    target=Number(target);if(cache.has(target))return cache.get(target);
    const promise=(async()=>{
      const texts=await Promise.all(SOURCES[target].map(fetchText));
      const rows=texts.flatMap(text=>d3.csvParse(text)).map(row=>({
        area:normalize(row.area),no:String(row.cand_no),name:String(row.cand_name||'').trim(),party:String(row.party||'').trim(),partyKey:partyKey(row.party),votes:Number(row.ticket_num||0),elected:String(row.is_victor||'').toUpperCase()==='Y'
      })).filter(row=>row.area&&row.name&&Number.isFinite(row.votes));
      const races={};
      for(const row of rows)(races[row.area]??=[]).push(row);
      for(const [area,candidates] of Object.entries(races)){
        candidates.sort((a,b)=>b.votes-a.votes);
        const validVotes=candidates.reduce((sum,c)=>sum+c.votes,0);
        candidates.forEach(c=>c.share=validVotes?c.votes/validVotes*100:0);
        let winner=candidates.find(c=>c.elected)||candidates[0];
        candidates.forEach(c=>c.elected=c===winner);
        races[area]={area,candidates,validVotes,winner,margin:candidates.length>1?winner.votes-candidates[1].votes:winner.votes};
      }
      const missing=COUNTIES.filter(name=>!races[name]);
      if(missing.length)throw new Error(`${target} 縣市長資料不完整：${missing.join('、')}`);
      return{year:target,races};
    })();
    cache.set(target,promise);return promise;
  }
  function raceShare(race,key){if(!race)return null;const matches=race.candidates.filter(c=>c.partyKey===key);if(!matches.length)return null;return matches.reduce((s,c)=>s+c.votes,0)/race.validVotes*100}
  function raceMargin(race){const d=raceShare(race,'DPP'),k=raceShare(race,'KMT');return d==null||k==null?null:d-k}
  function comparison(aData,bData,name){const a=aData.races[name],b=bData.races[name];if(!a||!b)return null;const ma=raceMargin(a),mb=raceMargin(b);return{name,a,b,aParty:a.winner.partyKey,bParty:b.winner.partyKey,flip:a.winner.partyKey!==b.winner.partyKey,dA:raceShare(a,'DPP'),dB:raceShare(b,'DPP'),kA:raceShare(a,'KMT'),kB:raceShare(b,'KMT'),swing:ma==null||mb==null?null:mb-ma}}
  function seatCounts(data){const counts={};COUNTIES.forEach(name=>{const key=data.races[name].winner.partyKey;counts[key]=(counts[key]||0)+1});return counts}
  function seatLabel(key){if(key==='IND'||key==='OTHER')return key==='IND'?'無黨籍':'其他政黨';return PARTY_LABEL[key]||key}

  function parseQuery(){
    const q=new URLSearchParams(location.search);const requested=Number(q.get('year'));year=YEARS.includes(requested)?requested:2022;
    mode=q.get('mode')==='compare'?'compare':'single';
    const a=Number(q.get('compareA')),b=Number(q.get('compareB'));if(YEARS.includes(a)&&YEARS.includes(b)&&a!==b){compareA=a;compareB=b}
    layer=['winner','share','swing'].includes(q.get('layer'))?q.get('layer'):'winner';party=q.get('party')==='KMT'?'KMT':'DPP';
    level=q.get('level')==='county'?'county':'national';region=normalize(q.get('region'));if(!COUNTIES.includes(region))region='';if(level==='county'&&!region)level='national';
  }
  function syncUrl(){
    const u=new URL(location.href);u.searchParams.set('type','local-executive');u.searchParams.set('year',String(year));
    if(mode==='compare'){
      u.searchParams.set('mode','compare');u.searchParams.set('compareA',String(compareA));u.searchParams.set('compareB',String(compareB));u.searchParams.set('layer',layer);if(layer==='share')u.searchParams.set('party',party);else u.searchParams.delete('party');u.searchParams.delete('level');u.searchParams.delete('region');
    }else{
      u.searchParams.delete('mode');u.searchParams.delete('compareA');u.searchParams.delete('compareB');u.searchParams.delete('layer');u.searchParams.delete('party');u.searchParams.set('level',level);if(level==='county'&&region)u.searchParams.set('region',region);else u.searchParams.delete('region');
    }
    history.replaceState(null,'',u);
  }
  function renderState(){
    const chips=mode==='compare'?['縣市長',`${compareA} → ${compareB}`,LAYER_LABEL[layer]||layer,...(layer==='share'?[PARTY_LABEL[party]]:[])]:['縣市長',String(year),level==='county'?'縣市':'全台概覽',...(level==='county'&&region?[region]:[])];
    $('#local-state-path').innerHTML=chips.map((c,i)=>`<span class="local-chip${i===0?' type':''}">${esc(c)}</span>`).join('<span class="local-sep">›</span>');
    document.title=mode==='compare'?`${compareA}→${compareB} 縣市長選舉比較｜島民觀察室`:`${year} 縣市長選舉${region?`・${region}`:''}｜島民觀察室`;
  }
  function syncControls(){
    $('#local-year').innerHTML=YEARS.map(y=>`<option value="${y}"${y===year?' selected':''}>${y}</option>`).join('');
    $('#local-region').innerHTML='<option value="">全台概覽</option>'+COUNTIES.map(name=>`<option value="${name}"${name===region?' selected':''}>${name}</option>`).join('');
    $$('#local-mode-switch [data-mode]').forEach(b=>b.classList.toggle('on',b.dataset.mode===mode));
    $$('#local-level-switch [data-level]').forEach(b=>b.classList.toggle('on',b.dataset.level===level));
    $$('.local-single-field').forEach(el=>el.style.display=mode==='single'?'':'none');
    $('#local-compare-controls').classList.toggle('on',mode==='compare');
    $('#local-party-switch').classList.toggle('on',mode==='compare'&&layer==='share');
    $('#local-compare-a').innerHTML=YEARS.map(y=>`<option value="${y}"${y===compareA?' selected':''}${y===compareB?' disabled':''}>${y}</option>`).join('');
    $('#local-compare-b').innerHTML=YEARS.map(y=>`<option value="${y}"${y===compareB?' selected':''}${y===compareA?' disabled':''}>${y}</option>`).join('');
    $$('#local-layer-switch [data-layer]').forEach(b=>b.classList.toggle('on',b.dataset.layer===layer));
    $$('#local-party-switch [data-party]').forEach(b=>b.classList.toggle('on',b.dataset.party===party));
    $('#local-single-result').style.display=mode==='single'?'':'none';$('#local-compare-result').classList.toggle('on',mode==='compare');
  }

  function winnerText(race){return `${race.winner.name} · ${race.winner.party}`}
  function overviewNote(data){const winners=COUNTIES.map(name=>data.races[name].winner);const total=winners.reduce((s,c)=>s+c.votes,0);return `本頁的「全台概覽」是 22 場地方首長選舉的席次分布，不把不同縣市候選人合併成一場全國選舉。22 位當選者合計取得 ${fmt.format(total)} 張候選人票。`}
  function renderSeats(data){
    const counts=seatCounts(data);const keys=Object.keys(counts).sort((a,b)=>(counts[b]-counts[a])||a.localeCompare(b));
    $('#local-seat-grid').style.display='grid';$('#local-seat-grid').className='local-seat-grid';
    $('#local-seat-grid').innerHTML=keys.map(key=>`<div class="local-seat-card"><div class="seat-top"><b><i class="local-dot" style="background:${partyColor(key)}"></i>${esc(seatLabel(key))}</b><strong>${counts[key]}</strong></div><small>22 席中的 ${((counts[key]/22)*100).toFixed(1)}%</small></div>`).join('');
    $('#local-overview-note').style.display='block';$('#local-overview-note').textContent=overviewNote(data);
  }
  function renderRace(race){
    $('#local-seat-grid').style.display='none';$('#local-overview-note').style.display='none';
    const detail=$('#local-county-detail');detail.className='local-candidates';detail.innerHTML=race.candidates.map(c=>`<article class="local-candidate${c.elected?' elected':''}"><div class="local-candidate-head"><div><div class="local-name"><span class="local-number">${esc(c.no)}</span>${esc(c.name)}</div><div class="local-party">${esc(c.party)}</div></div><div class="local-vote">${fmt.format(c.votes)}<small>${pct(c.share)}</small></div></div><div class="local-bar"><i style="width:${Math.max(0,Math.min(100,c.share))}%;background:${partyColor(c.partyKey)}"></i></div></article>`).join('');
  }
  function showOverviewEmpty(){const detail=$('#local-county-detail');detail.className='local-empty';detail.innerHTML='<strong>目前顯示全台概覽</strong>選擇「縣市」層級、地區下拉選單，或直接點擊地圖查看候選人得票。'}

  async function renderSingle(){
    const token=++renderToken;setLoading(`正在載入 ${year} 縣市長資料…`);
    try{
      const data=await loadYear(year);if(token!==renderToken||mode!=='single')return;
      $('#local-term').textContent=`LOCAL EXECUTIVE / ${year}`;$('#local-result-title').textContent=level==='county'&&region?`${year} ${region}首長選舉`:`${year} 縣市長選舉`;$('#local-map-heading').textContent=level==='county'&&region?`${year} ${region}`:`${year} 縣市長選舉`;
      if(level==='county'&&region){const race=data.races[region];$('#local-head-number').textContent=pct(race.winner.share);$('#local-head-label').textContent='當選者有效票得票率';renderRace(race)}else{$('#local-head-number').textContent='22';$('#local-head-label').textContent='縣市首長席次';renderSeats(data);showOverviewEmpty()}
      $('#local-map-status').innerHTML='<b>2014、2018、2022 皆具完整 22 縣市。</b> 地圖顏色表示該縣市當選者政黨；點擊縣市查看候選人票數。';
      await paintSingle(data);renderInsets(data);renderState();syncUrl();
    }catch(err){showError(err)}
  }

  function comparisonColor(rows,key){const vals=rows.map(r=>key==='swing'?r.swing:(party==='DPP'?(r.dA==null||r.dB==null?null:r.dB-r.dA):(r.kA==null||r.kB==null?null:r.kB-r.kA))).filter(Number.isFinite);const max=Math.max(1,...vals.map(Math.abs));return{max,scale:key==='swing'?d3.scaleLinear().domain([-max,0,max]).range([COLORS.KMT,'#28231f',COLORS.DPP]):d3.scaleLinear().domain([-max,0,max]).range(['#45515e','#27231f','#eee4d6'])}}
  function seatFor(rows,which,key){return rows.filter(r=>(which==='a'?r.aParty:r.bParty)===key).length}
  async function renderCompare(){
    const token=++renderToken;setLoading(`正在比較 ${compareA} → ${compareB}…`);
    try{
      const [aData,bData]=await Promise.all([loadYear(compareA),loadYear(compareB)]);if(token!==renderToken||mode!=='compare')return;
      year=compareB;const rows=COUNTIES.map(name=>comparison(aData,bData,name)).filter(Boolean),flips=rows.filter(r=>r.flip);
      $('#local-term').textContent='CROSS-ELECTION COMPARISON';$('#local-result-title').textContent=`${compareA} → ${compareB} 縣市長比較`;$('#local-map-heading').textContent=`${compareA} → ${compareB} ${LAYER_LABEL[layer]}`;$('#local-head-number').textContent=String(flips.length);$('#local-head-label').textContent='勝方政黨改變縣市';
      $('#local-compare-stats').innerHTML=`<div class="local-compare-stat"><strong>${rows.length}</strong><span>比較縣市</span></div><div class="local-compare-stat"><strong>${seatFor(rows,'a','DPP')}→${seatFor(rows,'b','DPP')}</strong><span>DPP 席次</span></div><div class="local-compare-stat"><strong>${seatFor(rows,'a','KMT')}→${seatFor(rows,'b','KMT')}</strong><span>KMT 席次</span></div>`;
      $('#local-flips').innerHTML=flips.length?flips.map(r=>`<button type="button" class="local-flip-chip" data-county="${esc(r.name)}">${esc(r.name)}</button>`).join(''):'<span class="local-flip-chip">沒有勝方政黨改變</span>';
      $$('#local-flips [data-county]').forEach(b=>b.addEventListener('click',()=>{compareSelection=b.dataset.county;renderCompareDetail(rows.find(r=>r.name===compareSelection));paintCompare(rows);renderCompareInsets(rows)}));
      renderLegend(rows);renderCompareDetail(compareSelection?rows.find(r=>r.name===compareSelection):null);await paintCompare(rows);renderCompareInsets(rows);
      $('#local-map-status').innerHTML=layer==='winner'?'<b>勝方版圖：</b>B 年份以當選者政黨色填滿；金色外框表示相較 A 年份勝方政黨不同。':layer==='share'?`<b>${PARTY_LABEL[party]}得票率變化：</b>顯示 B − A 百分點；灰階只代表數值方向，不代表政治評價。`:'<b>藍綠 Swing：</b>顯示（DPP − KMT）得票率差的 B − A；缺少任一主要政黨候選人的縣市不計算。';
      renderState();syncUrl();
    }catch(err){showError(err)}
  }
  function renderLegend(rows){
    if(layer==='winner'){$('#local-legend').innerHTML='<span><i style="background:#f6c945"></i>金框＝勝方政黨改變</span><span><i style="background:#2daf5d"></i>DPP</span><span><i style="background:#3b82f6"></i>KMT</span><span><i style="background:#9b948a"></i>其他／無黨籍</span>';return}
    const {max}=comparisonColor(rows,layer);$('#local-legend').innerHTML=layer==='share'?`<span><i style="background:#45515e"></i>−${max.toFixed(1)} pp</span><span><i style="background:#27231f"></i>0</span><span><i style="background:#eee4d6"></i>+${max.toFixed(1)} pp</span>`:`<span><i style="background:${COLORS.KMT}"></i>KMT 方向</span><span><i style="background:#27231f"></i>0</span><span><i style="background:${COLORS.DPP}"></i>DPP 方向</span>`;
  }
  function renderCompareDetail(r){
    const box=$('#local-compare-detail');if(!r){box.innerHTML='點擊地圖查看縣市變化。';return}
    const dDelta=r.dA==null||r.dB==null?null:r.dB-r.dA,kDelta=r.kA==null||r.kB==null?null:r.kB-r.kA;
    box.innerHTML=`<h3>${esc(r.name)}</h3><div><strong>${compareA}</strong>：${esc(winnerText(r.a))}（${pct(r.a.winner.share)}）</div><div><strong>${compareB}</strong>：${esc(winnerText(r.b))}（${pct(r.b.winner.share)}）</div><div style="margin-top:8px">DPP：${pct(r.dA)} → ${pct(r.dB)}　${signed(dDelta)} pp</div><div>KMT：${pct(r.kA)} → ${pct(r.kB)}　${signed(kDelta)} pp</div><div>Swing：${signed(r.swing)} pp</div>`;
  }

  function featureName(f){return normalize(f?.properties?.name||f?.properties?.COUNTYNAME||f?.properties?.COUNTY||'')}
  async function ensureMap(){
    if(topology)return;topology=await fetch('../data/counties.json').then(r=>{if(!r.ok)throw new Error('counties.json');return r.json()});const obj=topology.objects[Object.keys(topology.objects)[0]];features=topojson.feature(topology,obj).features;svg=d3.select('#local-map');drawMap();new ResizeObserver(()=>drawMap()).observe($('#local-map'));
  }
  function drawMap(){if(!svg||!features.length)return;const node=$('#local-map'),w=node.clientWidth||700,h=node.clientHeight||520;svg.attr('viewBox',`0 0 ${w} ${h}`);const shown=mobile()?features.filter(f=>!ISLANDS.includes(featureName(f))):features;const projection=d3.geoMercator().fitExtent([[18,10],[w-18,h-10]],{type:'FeatureCollection',features:shown});path=d3.geoPath(projection);svg.selectAll('path.local-county').data(shown,d=>featureName(d)).join('path').attr('class','local-county').attr('data-county',d=>featureName(d)).attr('d',path).on('mousemove',handleTooltip).on('mouseleave',()=>$('#local-tooltip').style.display='none').on('click',(_,d)=>selectCounty(featureName(d)));requestAnimationFrame(()=>mode==='compare'?renderCompare():renderSingle())}
  function handleTooltip(event,d){const name=featureName(d),tip=$('#local-tooltip');tip.style.display='block';tip.style.left=`${event.clientX+14}px`;tip.style.top=`${event.clientY+14}px`;tip.innerHTML=`${esc(name)}<br>點擊查看結果`}
  async function paintSingle(data){await ensureMap();svg.selectAll('path.local-county').attr('class',d=>`local-county${region===featureName(d)?' selected':''}`).style('fill',d=>{const race=data.races[featureName(d)];return race?partyColor(race.winner.partyKey):'#201d1a'}).style('opacity',1).style('stroke',null).style('stroke-width',null)}
  async function paintCompare(rows){await ensureMap();const by=new Map(rows.map(r=>[r.name,r])),color=comparisonColor(rows,layer);svg.selectAll('path.local-county').each(function(d){const r=by.get(featureName(d)),sel=d3.select(this);if(!r){sel.style('fill','#201d1a').style('opacity',.3);return}let fill='#201d1a',opacity=1,stroke=null,width=null;if(layer==='winner'){fill=partyColor(r.bParty);if(r.flip){stroke='#f6c945';width=2.2}else opacity=.8}else if(layer==='share'){const val=party==='DPP'?(r.dA==null||r.dB==null?null:r.dB-r.dA):(r.kA==null||r.kB==null?null:r.kB-r.kA);fill=Number.isFinite(val)?color.scale(val):'#201d1a';opacity=Number.isFinite(val)?1:.32}else{fill=Number.isFinite(r.swing)?color.scale(r.swing):'#201d1a';opacity=Number.isFinite(r.swing)?1:.32}sel.attr('class',`local-county${compareSelection===r.name?' selected':''}`).style('fill',fill).style('opacity',opacity).style('stroke',compareSelection===r.name?'#fff':stroke).style('stroke-width',compareSelection===r.name?2.3:width)})}
  function renderInsets(data){const box=$('#local-mobile-insets');box.innerHTML=ISLANDS.map(name=>{const race=data.races[name];return`<button class="local-inset${region===name?' selected':''}" data-county="${name}" type="button"><b>${name}</b><span><i style="background:${partyColor(race.winner.partyKey)}"></i>${esc(race.winner.name)}</span></button>`}).join('');$$('#local-mobile-insets [data-county]').forEach(b=>b.addEventListener('click',()=>selectCounty(b.dataset.county)))}
  function renderCompareInsets(rows){const by=new Map(rows.map(r=>[r.name,r]));$('#local-mobile-insets').innerHTML=ISLANDS.map(name=>{const r=by.get(name),label=layer==='winner'?r.b.winner.name:layer==='share'?`${signed(party==='DPP'?(r.dA==null||r.dB==null?null:r.dB-r.dA):(r.kA==null||r.kB==null?null:r.kB-r.kA))} pp`:`${signed(r.swing)} pp`;return`<button class="local-inset" data-county="${name}" type="button"><b>${name}</b><span><i style="background:${layer==='winner'?partyColor(r.bParty):'#9b948a'}"></i>${esc(label)}</span></button>`}).join('');$$('#local-mobile-insets [data-county]').forEach(b=>b.addEventListener('click',()=>{compareSelection=b.dataset.county;renderCompare()}))}

  function selectCounty(name){name=normalize(name);if(!COUNTIES.includes(name))return;if(mode==='compare'){compareSelection=name;renderCompare();return}level='county';region=name;syncControls();renderSingle()}
  function setLoading(text){$('#local-map-status').textContent=text}
  function showError(err){console.error(err);$('#local-map-status').innerHTML='<b>資料載入失敗。</b> 請重新整理；若持續發生，可能是外部資料鏡像暫時無法連線。';$('#local-county-detail').className='local-empty';$('#local-county-detail').innerHTML=`<strong>無法載入選舉資料</strong>${esc(err?.message||err)}`}

  function bind(){
    $('#local-election-type').addEventListener('change',e=>{if(e.target.value==='president'){location.href='./?type=president&year=2024&level=national'}else e.target.value='local-executive'});
    $$('#local-mode-switch [data-mode]').forEach(b=>b.addEventListener('click',()=>{mode=b.dataset.mode;compareSelection='';syncControls();render()}));
    $('#local-year').addEventListener('change',e=>{year=Number(e.target.value);render()});
    $$('#local-level-switch [data-level]').forEach(b=>b.addEventListener('click',()=>{level=b.dataset.level;if(level==='national')region='';else if(!region)region=COUNTIES[0];syncControls();render()}));
    $('#local-region').addEventListener('change',e=>{region=normalize(e.target.value);level=region?'county':'national';syncControls();render()});
    $('#local-compare-a').addEventListener('change',e=>{const next=Number(e.target.value);if(next!==compareB)compareA=next;syncControls();render()});
    $('#local-compare-b').addEventListener('change',e=>{const next=Number(e.target.value);if(next!==compareA)compareB=next;year=compareB;syncControls();render()});
    $('#local-swap').addEventListener('click',()=>{[compareA,compareB]=[compareB,compareA];year=compareB;compareSelection='';syncControls();render()});
    $$('#local-layer-switch [data-layer]').forEach(b=>b.addEventListener('click',()=>{layer=b.dataset.layer;compareSelection='';syncControls();render()}));
    $$('#local-party-switch [data-party]').forEach(b=>b.addEventListener('click',()=>{party=b.dataset.party;syncControls();render()}));
    $('#local-reset').addEventListener('click',()=>{mode='single';year=2022;level='national';region='';compareA=2018;compareB=2022;layer='winner';party='DPP';compareSelection='';syncControls();render()});
  }
  async function render(){syncControls();renderState();syncUrl();if(mode==='compare')await renderCompare();else await renderSingle()}
  async function init(){parseQuery();bind();syncControls();try{await ensureMap();await render()}catch(err){showError(err)}}
  init();
})();
