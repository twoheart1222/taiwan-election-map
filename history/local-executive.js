(()=>{
  const YEARS=[1994,1998,2002,2006,2010,2014,2018,2022];
  const COUNTIES=['臺北市','新北市','桃園市','臺中市','臺南市','高雄市','基隆市','新竹市','嘉義市','新竹縣','苗栗縣','彰化縣','南投縣','雲林縣','嘉義縣','屏東縣','宜蘭縣','花蓮縣','臺東縣','澎湖縣','金門縣','連江縣'];
  const ISLANDS=['澎湖縣','金門縣','連江縣'];
  // 政黨資料：顏色取自各黨徽本身的品牌色（非中選會圖表用的淡色），黨徽圖檔直接連結各黨官網。
  // 若圖檔連結失效，badge 會自動退回「色塊＋簡稱」，不會顯示破圖。
  // 黨徽圖檔改用站內資產（/assets/party-logos/），不再連到各黨官網，避免圖檔被移除或防盜連。
  const PARTY_META={
    DPP:{name:'民主進步黨',abbr:'民',color:'#00A600',logo:'/assets/party-logos/dpp.webp'},
    KMT:{name:'中國國民黨',abbr:'國',color:'#000095',logo:'/assets/party-logos/kmt.webp'},
    TPP:{name:'台灣民眾黨',abbr:'眾',color:'#28C8C8',logo:'/assets/party-logos/tpp.png'},
    NPP:{name:'時代力量',abbr:'力',color:'#FFC400',dark:true,logo:'/assets/party-logos/npp.webp'},
    PFP:{name:'親民黨',abbr:'親',color:'#FF6600',logo:'/assets/party-logos/pfp.webp'},
    NP:{name:'新黨',abbr:'新',color:'#002FA7',logo:'/assets/party-logos/np.webp'},
    IND:{name:'其他／無黨籍',abbr:'無',color:'#9D9D9D'},
    OTHER:{name:'其他政黨',abbr:'他',color:'#B7A88E'},
    MIXED:{name:'多場選舉',abbr:'複',color:'#7D6F68'},
  };
  const COLORS=Object.fromEntries(Object.entries(PARTY_META).map(([k,v])=>[k,v.color]));
  const PARTY_LABEL=Object.fromEntries(Object.entries(PARTY_META).map(([k,v])=>[k,v.name]));
  const partyAbbr=key=>(PARTY_META[key]||PARTY_META.OTHER).abbr;
  // 圖檔載入失敗時的退回處理：用共用的全域函式操作 DOM，避免把含雙引號的 HTML
  // 字串塞進 onerror="..." 這個雙引號屬性裡（那樣會被 HTML 解析器提前截斷，
  // 產生殘缺的 JS 字面值，一旦圖片真的載入失敗就會丟出 SyntaxError）。
  window.__partyBadgeFallback=img=>{
    try{
      const span=img.closest('.party-badge');
      if(span&&span.dataset&&span.dataset.fallback){
        span.innerHTML=span.dataset.fallback;
      }
    }catch(e){}
  };
  // 產生一個政黨徽章：有黨徽圖檔就顯示圖檔，圖檔載入失敗（onerror）時自動換成色塊＋簡稱。
  function partyBadge(key,size){
    const m=PARTY_META[key]||PARTY_META.OTHER;
    const s=size||30;
    const fallback=`<b style="width:100%;height:100%;display:grid;place-items:center;color:${m.dark?'#171411':'#fff'};font:900 ${Math.round(s*0.42)}px 'Noto Sans TC',sans-serif;text-shadow:${m.dark?'none':'0 1px 2px rgba(0,0,0,.35)'}">${esc(m.abbr)}</b>`;
    const img=m.logo?`<img src="${esc(m.logo)}" alt="${esc(m.name)}" loading="lazy" style="width:100%;height:100%;object-fit:contain;padding:14%;box-sizing:border-box" onerror="window.__partyBadgeFallback(this)">`:fallback;
    return `<span class="party-badge" data-fallback="${esc(fallback)}" style="width:${s}px;height:${s}px;background:${m.color}">${img}</span>`;
  }
  const LAYER_LABEL={winner:'勝方版圖',share:'得票率變化',swing:'藍綠 Swing'};
  const DATA_URL='../data/history/local-executive.json?v=20260923-full-history';
  const $=s=>document.querySelector(s),$$=s=>[...document.querySelectorAll(s)];
  const fmt=new Intl.NumberFormat('zh-TW');
  const normalize=v=>String(v||'').replaceAll('台','臺').replace(/\s+/g,'').trim();
  const esc=v=>String(v??'').replace(/[&<>"']/g,ch=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[ch]));
  const partyKey=party=>{party=String(party||'');if(party==='民主進步黨')return'DPP';if(party==='中國國民黨')return'KMT';if(party==='台灣民眾黨')return'TPP';if(party==='親民黨')return'PFP';if(party==='新黨')return'NP';if(party==='時代力量')return'NPP';if(party.includes('無黨籍'))return'IND';return'OTHER'};
  const partyColor=key=>COLORS[key]||COLORS.OTHER;
  const signed=(v,d=2)=>v==null||!Number.isFinite(v)?'—':`${v>=0?'+':''}${v.toFixed(d)}`;
  const pct=v=>v==null||!Number.isFinite(v)?'—':`${Number(v).toFixed(2)}%`;
  const mobile=()=>matchMedia('(max-width:660px)').matches;

  const cache=new Map();
  let topology=null,features=[],svg=null,mapNode=null,lastPainter=null,resizeTimer=null;
  let mode='single',year=2022,level='national',region='',compareA=2018,compareB=2022,layer='winner',party='DPP',compareSelection='';
  let renderToken=0;

  function localElectedStamp(){return `<svg class="local-elected-stamp" viewBox="0 0 100 100" aria-label="當選" role="img"><defs><filter id="local-stamp-rough" x="-10%" y="-10%" width="120%" height="120%"><feTurbulence type="fractalNoise" baseFrequency="0.85" numOctaves="2" seed="4" result="n"/><feDisplacementMap in="SourceGraphic" in2="n" scale="2.6"/></filter></defs><g filter="url(#local-stamp-rough)" fill="none" stroke="#E4022B"><circle cx="50" cy="50" r="45" stroke-width="4.5"/><circle cx="50" cy="50" r="38" stroke-width="1.6"/><text x="50" y="66" text-anchor="middle" font-family="'Noto Serif TC','Songti TC',serif" font-weight="900" font-size="44" fill="#E4022B" stroke="none" letter-spacing="-2">當選</text><path d="M22 78 L78 78" stroke-width="1.6"/><text x="50" y="30" text-anchor="middle" font-family="Archivo,sans-serif" font-weight="900" font-size="8.5" fill="#E4022B" stroke="none" letter-spacing="3.4">ELECTED</text></g></svg>`}
  const archivePromise=fetch(DATA_URL,{cache:'no-cache'}).then(response=>{if(!response.ok)throw new Error(`${response.status} ${DATA_URL}`);return response.json()});
  async function loadYear(target){
    target=Number(target);if(cache.has(target))return cache.get(target);
    const promise=(async()=>{
      const archive=await archivePromise,data=archive.years?.[String(target)];
      if(!data?.races)throw new Error(`${target} 縣市長資料不存在`);
      if(Object.keys(data.races).length!==data.raceCount)throw new Error(`${target} 縣市長資料不完整`);
      return data;
    })();
    cache.set(target,promise);return promise;
  }
  function raceShare(race,key){if(!race)return null;const matches=race.candidates.filter(c=>c.partyKey===key);if(!matches.length)return null;return matches.reduce((sum,c)=>sum+c.votes,0)/race.validVotes*100}
  function raceMargin(race){const d=raceShare(race,'DPP'),k=raceShare(race,'KMT');return d==null||k==null?null:d-k}
  function areaEntries(data,name){return (data.currentAreas?.[name]||[]).map(area=>[area,data.races[area]]).filter(([,race])=>race)}
  function areaRace(data,name){const entries=areaEntries(data,name);return entries.length===1?entries[0][1]:null}
  function availableAreas(data){return COUNTIES.filter(name=>areaEntries(data,name).length)}
  function comparison(aData,bData,name){const a=areaRace(aData,name),b=areaRace(bData,name);if(!a||!b)return null;const ma=raceMargin(a),mb=raceMargin(b);return{name,a,b,aParty:a.winner.partyKey,bParty:b.winner.partyKey,flip:a.winner.partyKey!==b.winner.partyKey,dA:raceShare(a,'DPP'),dB:raceShare(b,'DPP'),kA:raceShare(a,'KMT'),kB:raceShare(b,'KMT'),swing:ma==null||mb==null?null:mb-ma}}
  function seatCounts(data){const counts={};Object.values(data.races).forEach(race=>{const k=race.winner.partyKey;counts[k]=(counts[k]||0)+1});return counts}
  function seatLabel(key){if(key==='IND')return'無黨籍';if(key==='OTHER')return'其他政黨';return PARTY_LABEL[key]||key}
  function partyVoteRows(candidates,validVotes){const rows=new Map();for(const c of candidates||[]){const name=c.party||'無黨籍及未經政黨推薦',row=rows.get(name)||{name,key:c.partyKey||partyKey(name),votes:0};row.votes+=Number(c.votes||0);rows.set(name,row)}return[...rows.values()].map(row=>({...row,share:validVotes?row.votes/validVotes*100:0})).sort((a,b)=>b.votes-a.votes)}
  function partyVoteCards(candidates,validVotes){return`<div class="party-vote-card-grid">${partyVoteRows(candidates,validVotes).map(row=>`<article class="party-vote-card" style="--party-color:${partyColor(row.key)}"><div class="party-vote-card__head">${partyBadge(row.key,30)}<strong>${esc(row.name)}</strong></div><b>${fmt.format(row.votes)}</b><small>${pct(row.share)}</small></article>`).join('')}</div>`}

  function parseQuery(){
    const q=new URLSearchParams(location.search),requested=Number(q.get('year'));year=YEARS.includes(requested)?requested:2022;
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
      ['mode','compareA','compareB','layer','party'].forEach(k=>u.searchParams.delete(k));u.searchParams.set('level',level);if(level==='county'&&region)u.searchParams.set('region',region);else u.searchParams.delete('region');
    }
    history.replaceState(null,'',u);
  }
  function renderState(){
    const chips=mode==='compare'?['縣市長',`${compareA} → ${compareB}`,LAYER_LABEL[layer],...(layer==='share'?[PARTY_LABEL[party]]:[])]:['縣市長',String(year),level==='county'?'縣市':'全台概覽',...(level==='county'&&region?[region]:[])];
    $('#local-state-path').innerHTML=chips.map((c,i)=>`<span class="local-chip${i===0?' type':''}">${esc(c)}</span>`).join('<span class="local-sep">›</span>');
    document.title=mode==='compare'?`${compareA}→${compareB} 縣市長選舉比較｜島民觀察室`:`${year} 縣市長選舉${region?`・${region}`:''}｜島民觀察室`;
  }
  function syncControls(){
    document.body.classList.toggle('local-compare-active',mode==='compare');
    $('#local-year').innerHTML=YEARS.map(y=>`<option value="${y}"${y===year?' selected':''}>${y}</option>`).join('');
    const yearRail=$('#local-years');if(yearRail){yearRail.innerHTML=YEARS.map(y=>`<button class="year-btn${y===year?' on':''}" data-local-year="${y}" aria-current="${y===year?'true':'false'}"><span>${y}</span><small>縣市長</small></button>`).join('');$$('#local-years [data-local-year]').forEach(b=>b.addEventListener('click',()=>changeYear(Number(b.dataset.localYear))))}
    if(!$('#local-region').options.length)$('#local-region').innerHTML='<option value="">全台概覽</option>';
    $$('#local-mode-switch [data-mode]').forEach(b=>b.classList.toggle('on',b.dataset.mode===mode));
    $$('#local-level-switch [data-level]').forEach(b=>b.classList.toggle('on',b.dataset.level===level));
    $$('.local-single-field').forEach(el=>el.style.display=mode==='single'?'':'none');
    $('#local-compare-controls').classList.toggle('on',mode==='compare');$('#local-party-switch').classList.toggle('on',mode==='compare'&&layer==='share');
    $('#local-compare-a').innerHTML=YEARS.map(y=>`<option value="${y}"${y===compareA?' selected':''}${y===compareB?' disabled':''}>${y}</option>`).join('');
    $('#local-compare-b').innerHTML=YEARS.map(y=>`<option value="${y}"${y===compareB?' selected':''}${y===compareA?' disabled':''}>${y}</option>`).join('');
    $$('#local-layer-switch [data-layer]').forEach(b=>b.classList.toggle('on',b.dataset.layer===layer));$$('#local-party-switch [data-party]').forEach(b=>b.classList.toggle('on',b.dataset.party===party));
    $('#local-single-result').style.display=mode==='single'?'':'none';$('#local-compare-result').classList.toggle('on',mode==='compare');
  }

  function syncRegionOptions(data){
    const areas=availableAreas(data);if(region&&!areas.includes(region)){region='';level='national'}
    const options='<option value="">全台概覽</option>'+areas.map(name=>`<option value="${name}"${name===region?' selected':''}>${name}</option>`).join('');
    $('#local-region').innerHTML=options;$('#local-area-select').innerHTML=options;
  }
  function aggregateStats(data,entries){const races=(entries?.length?entries.map(([,race])=>race):Object.values(data.races)),stats={population:0,electors:0,votesCast:0,validVotes:0,invalidVotes:0};for(const race of races)for(const key of Object.keys(stats))stats[key]+=Number(race[key]||0);stats.turnout=stats.electors?stats.votesCast/stats.electors*100:0;return stats}
  function renderElectionStats(data,entries){const stats=aggregateStats(data,entries),rows=[['選舉人數','ELECTORS',stats.electors],['投票數','BALLOTS',stats.votesCast],['有效票','VALID',stats.validVotes],['無效票','INVALID',stats.invalidVotes],['投票率','TURNOUT',pct(stats.turnout)]];$('#local-election-stats').innerHTML=rows.map(([label,en,value])=>`<div class="election-overview-stat"><span>${label}<small>${en}</small></span><strong>${typeof value==='number'?fmt.format(value):value}</strong></div>`).join('')}
  function overviewNote(data){const races=Object.values(data.races),total=races.reduce((sum,race)=>sum+race.winner.votes,0),dates=(data.dates||[]).join('、');return `本頁的「全台概覽」是 ${races.length} 場地方首長選舉的席次分布，不把不同地區候選人合併成一場全國選舉。${races.length} 位當選者合計取得 ${fmt.format(total)} 張候選人票。投票日期：${dates}。`}
  function renderSeats(data){
    const counts=seatCounts(data),keys=Object.keys(counts).sort((a,b)=>counts[b]-counts[a]||a.localeCompare(b));
    const total=Object.keys(data.races).length;$('#local-seat-grid').style.display='grid';$('#local-seat-grid').innerHTML=keys.map(key=>`<div class="local-seat-card" style="--seat-color:${partyColor(key)}"><div class="seat-top">${partyBadge(key,30)}<b>${esc(seatLabel(key))}</b></div><strong>${counts[key]}</strong><small>${total} 席中的 ${((counts[key]/total)*100).toFixed(1)}%</small></div>`).join('');
    $('#local-overview-note').style.display='block';$('#local-overview-note').textContent=overviewNote(data);
  }
  function renderRace(entries){
    $('#local-seat-grid').style.display='none';$('#local-overview-note').style.display='none';const detail=$('#local-county-detail');detail.className='local-candidates';
    detail.innerHTML=entries.map(([area,race])=>`<section class="local-historical-race">${entries.length>1||area!==region?`<h3>${esc(area)}首長選舉</h3>`:''}<div class="party-vote-section-title"><strong>${esc(area)}政黨得票數／得票率</strong><span>${fmt.format(race.validVotes)} 張有效票</span></div>${partyVoteCards(race.candidates,race.validVotes)}<div class="candidate-section-title">候選人得票</div>${race.candidates.map(c=>`<article class="local-candidate${c.elected?' elected':''}">${c.elected?localElectedStamp():''}<div class="local-candidate-head"><div><div class="local-name"><span class="local-number">${esc(c.no)}</span>${esc(c.name)}</div><div class="local-party">${partyBadge(c.partyKey,18)}${esc(c.party)}</div></div><div class="local-vote">${fmt.format(c.votes)}<small>${pct(c.share)}</small></div></div><div class="local-bar"><i style="width:${Math.max(0,Math.min(100,c.share))}%;background:${partyColor(c.partyKey)}"></i></div></article>`).join('')}${race.note?`<div class="local-overview-note" style="display:block">資料註記：${esc(race.note)}</div>`:''}</section>`).join('');
  }
  function showOverviewEmpty(){const d=$('#local-county-detail');d.className='local-empty';d.innerHTML='<strong>目前顯示全台概覽</strong>選擇「縣市」層級、地區下拉選單，或直接點擊地圖查看候選人得票。'}

  async function renderSingle(){
    const token=++renderToken;setLoading(`正在載入 ${year} 縣市長資料…`);
    try{
      const data=await loadYear(year);if(token!==renderToken||mode!=='single')return;syncRegionOptions(data);
      const entries=level==='county'&&region?areaEntries(data,region):[];
      renderElectionStats(data,entries);$('#local-national-overview').hidden=Boolean(entries.length);
      $('#local-term').textContent=`LOCAL EXECUTIVE / ${year}`;$('#local-result-title').textContent=entries.length?`${year} ${region}地方首長選舉`:`${year} 地方首長選舉`;$('#local-map-heading').textContent=entries.length?`${year} ${region}`:`${year} 地方首長選舉`;
      if(entries.length){const best=[...entries].sort((a,b)=>b[1].winner.share-a[1].winner.share)[0][1];$('#local-head-number').textContent=entries.length===1?pct(best.winner.share):String(entries.length);$('#local-head-label').textContent=entries.length===1?'當選者有效票得票率':'合併前獨立選舉';renderRace(entries)}else{$('#local-head-number').textContent=String(data.raceCount);$('#local-head-label').textContent='地方首長席次';renderSeats(data);showOverviewEmpty()}
      $('#local-map-status').innerHTML=year===1994?'<b>1994 為中選會現有部分資料：</b>僅收錄臺北市與高雄市兩場直轄市長選舉。':year<2010?`<b>${year} 週期共 ${data.raceCount} 場：</b>保留縣市合併前的行政區；同一現行縣市若含多場舊制選舉，地圖以中性色呈現，點擊後可逐場查看。`:year===2010?'<b>2009–2010 地方首長週期共 22 場：</b>縣市長於 2009 年、直轄市長於 2010 年投票。':'<b>2014、2018、2022 各具完整 22 縣市。</b> 2022 嘉義市採 12 月 18 日重行選舉結果；地圖顏色表示該縣市當選者政黨。';
      paintSingle(data);renderInsets(data);lastPainter=()=>paintSingle(data);renderState();syncUrl();
    }catch(err){showError(err)}
  }

  function comparisonColor(rows,key){const vals=rows.map(r=>key==='swing'?r.swing:(party==='DPP'?(r.dA==null||r.dB==null?null:r.dB-r.dA):(r.kA==null||r.kB==null?null:r.kB-r.kA))).filter(Number.isFinite),max=Math.max(1,...vals.map(Math.abs));return{max,scale:key==='swing'?d3.scaleLinear().domain([-max,0,max]).range([COLORS.KMT,'#28231f',COLORS.DPP]):d3.scaleLinear().domain([-max,0,max]).range(['#45515e','#27231f','#eee4d6'])}}
  function seatFor(rows,which,key){return rows.filter(r=>(which==='a'?r.aParty:r.bParty)===key).length}
  function renderLegend(rows){
    if(layer==='winner'){$('#local-legend').innerHTML=`<span><i style="background:${COLORS.DPP}"></i>DPP</span><span><i style="background:${COLORS.KMT}"></i>KMT</span><span><i style="background:${COLORS.IND}"></i>其他／無黨籍</span><span><i style="background:#E4022B"></i>紅框＝目前選取</span>`;return}
    $('#local-legend').innerHTML=layer==='share'?`<span><i style="background:${partyColor(party)};opacity:.35"></i>顏色越深＝該年度 ${PARTY_LABEL[party]} 得票率越高</span>`:`<span><i style="background:${COLORS.KMT}"></i>KMT 方向</span><span><i style="background:#e2d9cc"></i>接近</span><span><i style="background:${COLORS.DPP}"></i>DPP 方向</span>`;
  }
  function renderCompareDetail(r){
    const box=$('#local-compare-detail');if(!r){box.innerHTML='點擊地圖查看縣市變化。';return}const dDelta=r.dA==null||r.dB==null?null:r.dB-r.dA,kDelta=r.kA==null||r.kB==null?null:r.kB-r.kA;
    box.innerHTML=`<h3>${esc(r.name)}</h3><div><strong>${compareA}</strong>：${esc(r.a.winner.name)} · ${esc(r.a.winner.party)}（${pct(r.a.winner.share)}）</div><div><strong>${compareB}</strong>：${esc(r.b.winner.name)} · ${esc(r.b.winner.party)}（${pct(r.b.winner.share)}）</div><div style="margin-top:8px">DPP：${pct(r.dA)} → ${pct(r.dB)}　${signed(dDelta)} pp</div><div>KMT：${pct(r.kA)} → ${pct(r.kB)}　${signed(kDelta)} pp</div><div>Swing：${signed(r.swing)} pp</div>${r.b.note?`<div style="margin-top:8px">${esc(r.b.note)}</div>`:''}`;$$('#local-flips [data-county]').forEach(button=>button.classList.toggle('selected',button.dataset.county===r.name));
  }
  function renderCompareChart(aData,bData,rows){
    const aStats=aggregateStats(aData),bStats=aggregateStats(bData),metrics=[
      {label:'民進黨席次',a:seatFor(rows,'a','DPP'),b:seatFor(rows,'b','DPP'),format:v=>`${fmt.format(v)} 席`},
      {label:'國民黨席次',a:seatFor(rows,'a','KMT'),b:seatFor(rows,'b','KMT'),format:v=>`${fmt.format(v)} 席`},
      {label:'全台投票率',a:aStats.turnout,b:bStats.turnout,format:pct}
    ];
    $('#local-exec-compare-chart').innerHTML=`<div class="paired-chart-head"><strong>全台關鍵指標</strong><span class="paired-chart-key"><span><i style="background:#b89b3f"></i>${compareA}</span><span><i style="background:#E4022B"></i>${compareB}</span></span></div>${metrics.map(m=>{const max=Math.max(m.a,m.b,1);return`<div class="paired-chart-row"><span>${m.label}</span><div class="paired-chart-bars"><div class="paired-chart-bar"><em>${compareA}</em><span class="paired-chart-track"><i style="width:${m.a/max*100}%;background:#b89b3f"></i></span><b>${m.format(m.a)}</b></div><div class="paired-chart-bar"><em>${compareB}</em><span class="paired-chart-track"><i style="width:${m.b/max*100}%;background:#E4022B"></i></span><b>${m.format(m.b)}</b></div></div></div>`}).join('')}`;
  }
  function pairedMarginMax(rows){return Math.max(1,...rows.flatMap(r=>[raceMargin(r.a),raceMargin(r.b)]).filter(Number.isFinite).map(Math.abs))}
  function pairedRaceFill(race,rows){
    if(!race)return'#c9c0b4';if(layer==='winner')return partyColor(race.winner.partyKey);
    if(layer==='share'){const value=raceShare(race,party);return Number.isFinite(value)?d3.interpolateRgb('#e5ded2',partyColor(party))(.12+.88*(value/100)):'#c9c0b4'}
    const margin=raceMargin(race),max=pairedMarginMax(rows);return Number.isFinite(margin)?(margin>=0?d3.interpolateRgb('#e2d9cc',COLORS.DPP)(Math.abs(margin)/max):d3.interpolateRgb('#e2d9cc',COLORS.KMT)(Math.abs(margin)/max)):'#c9c0b4'
  }
  // 跨屆並排地圖：以本島＋澎湖決定比例尺，金門、連江移到左上角小圖，本島放大到可閱讀的尺寸。
  const OFFSHORE=['連江縣','金門縣'];
  // 高雄市含東沙、太平島，直接 fit 會讓本島縮得很小；改用本島＋澎湖的經緯度框決定比例尺。
  const PAIRED_FRAME={type:'Feature',geometry:{type:'MultiPoint',coordinates:[[119.3,21.87],[122.02,25.32]]}};
  const OFFSHORE_FRAME={'連江縣':[[119.86,25.92],[120.52,26.4]],'金門縣':[[118.19,24.37],[118.5,24.53]]};
  function pairedCore(){return [PAIRED_FRAME]}
  function placeOffshore(map,path,list,w,h,selector){
    const bw=Math.round(Math.max(52,Math.min(112,w*.24))),bh=Math.round(bw*.7),x=12,place=[],uid=(map.attr('id')||'paired')+'-offshore';let y=12;
    OFFSHORE.forEach((name,i)=>{const f=list.find(item=>featureName(item)===name);if(!f)return;place.push({name,f,x,y,clip:`${uid}-${i}`});y+=bh+8});
    let defs=map.select('defs.paired-offshore-defs');if(defs.empty())defs=map.insert('defs',':first-child').attr('class','paired-offshore-defs');
    defs.selectAll('clipPath').data(place,d=>d.name).join(enter=>{const c=enter.append('clipPath');c.append('rect');return c}).attr('id',d=>d.clip).select('rect').attr('x',d=>d.x).attr('y',d=>d.y).attr('width',bw).attr('height',bh).attr('rx',10);
    map.selectAll('rect.paired-offshore-box').data(place,d=>d.name).join(enter=>enter.insert('rect','defs + *').attr('class','paired-offshore-box')).attr('x',d=>d.x).attr('y',d=>d.y).attr('width',bw).attr('height',bh).attr('rx',10);
    map.selectAll(selector).each(function(d){const hit=place.find(p=>p.name===featureName(d));if(!hit){this.removeAttribute('clip-path');return}const frame={type:'Feature',geometry:{type:'MultiPoint',coordinates:OFFSHORE_FRAME[hit.name]}},projection=d3.geoMercator().fitExtent([[hit.x+10,hit.y+20],[hit.x+bw-10,hit.y+bh-8]],frame);this.setAttribute('d',d3.geoPath(projection)(hit.f));this.setAttribute('clip-path',`url(#${hit.clip})`)});
    map.selectAll('text.paired-offshore-label').data(place,d=>d.name).join('text').attr('class','paired-offshore-label').attr('x',d=>d.x+9).attr('y',d=>d.y+14).text(d=>d.name.replace(/縣$/,''));
  }



  function drawLocalComparisonMap(target,rows,side){
    const node=$(target);if(!node||!features.length)return;const map=d3.select(target),w=node.clientWidth||430,h=node.clientHeight||470,by=new Map(rows.map(r=>[r.name,r])),sideYear=side==='A'?compareA:compareB;
    map.attr('viewBox',`0 0 ${w} ${h}`).attr('preserveAspectRatio','xMidYMid meet');const projection=d3.geoMercator().fitExtent([[24,26],[w-24,h-34]],{type:'FeatureCollection',features:pairedCore(features)}),path=d3.geoPath(projection);
    map.selectAll('path.local-county').data(features,d=>featureName(d)).join('path').attr('class',d=>`local-county${compareSelection===featureName(d)?' selected':''}`).attr('data-county',d=>featureName(d)).attr('d',path).style('fill',d=>{const r=by.get(featureName(d));return pairedRaceFill(r?(side==='A'?r.a:r.b):null,rows)}).style('opacity',d=>by.has(featureName(d))?1:.42).style('stroke',d=>compareSelection===featureName(d)?'#E4022B':null).style('stroke-width',d=>compareSelection===featureName(d)?2.5:null).on('mousemove',(event,d)=>{const name=featureName(d),r=by.get(name),race=r?(side==='A'?r.a:r.b):null,tip=$('#local-tooltip');tip.style.display='block';tip.style.left=`${event.clientX+14}px`;tip.style.top=`${event.clientY+14}px`;if(!race){tip.innerHTML=`${name}<br>本年度無資料`;return}tip.innerHTML=layer==='winner'?`<b>${name}・${sideYear}</b><br>${esc(race.winner.name)}・${esc(race.winner.party)}`:layer==='share'?`<b>${name}・${sideYear}</b><br>${PARTY_LABEL[party]} ${pct(raceShare(race,party))}`:`<b>${name}・${sideYear}</b><br>藍綠差距 ${signed(raceMargin(race))} pp`}).on('mouseleave',()=>$('#local-tooltip').style.display='none').on('click',(_,d)=>{const name=featureName(d);if(!by.has(name))return;compareSelection=name;renderCompareDetail(by.get(name));drawLocalComparisonMaps(rows)});
    placeOffshore(map,path,features,w,h,'path.local-county');
  }
  function drawLocalComparisonMaps(rows){$('#local-exec-map-a-year').textContent=String(compareA);$('#local-exec-map-b-year').textContent=String(compareB);drawLocalComparisonMap('#local-exec-map-a',rows,'A');drawLocalComparisonMap('#local-exec-map-b',rows,'B')}
  async function renderCompare(){
    const token=++renderToken;setLoading(`正在比較 ${compareA} → ${compareB}…`);
    try{
      const [aData,bData]=await Promise.all([loadYear(compareA),loadYear(compareB)]);if(token!==renderToken||mode!=='compare')return;year=compareB;
      const rows=COUNTIES.map(name=>comparison(aData,bData,name)).filter(Boolean),flips=rows.filter(r=>r.flip);
      $('#local-term').textContent='CROSS-ELECTION COMPARISON';$('#local-result-title').textContent=`${compareA} → ${compareB} 縣市長比較`;$('#local-map-heading').textContent=`${compareA} → ${compareB} ${LAYER_LABEL[layer]}`;$('#local-head-number').textContent=String(flips.length);$('#local-head-label').textContent='勝方政黨改變縣市';
      $('#local-compare-stats').innerHTML=`<div class="local-compare-stat"><strong>${rows.length}</strong><span>比較縣市</span></div><div class="local-compare-stat"><strong>${seatFor(rows,'a','DPP')}→${seatFor(rows,'b','DPP')}</strong><span>DPP 席次</span></div><div class="local-compare-stat"><strong>${seatFor(rows,'a','KMT')}→${seatFor(rows,'b','KMT')}</strong><span>KMT 席次</span></div>`;
      $('#local-flips').innerHTML=flips.length?flips.map(r=>`<button type="button" class="local-flip-chip changed" data-county="${esc(r.name)}"><i style="background:${partyColor(r.aParty)}"></i><span>${esc(r.name)}</span><b>→</b><i style="background:${partyColor(r.bParty)}"></i></button>`).join(''):'<span class="local-flip-chip">這兩屆沒有勝方政黨翻轉</span>';
      $$('#local-flips [data-county]').forEach(b=>b.addEventListener('click',()=>{compareSelection=b.dataset.county;renderCompareDetail(rows.find(r=>r.name===compareSelection));drawLocalComparisonMaps(rows)}));
      if(!flips.some(r=>r.name===compareSelection))compareSelection=(flips[0]||rows[0])?.name||'';
      renderLegend(rows);renderCompareChart(aData,bData,rows);renderCompareDetail(rows.find(r=>r.name===compareSelection));renderCompareInsets(rows);lastPainter=()=>drawLocalComparisonMaps(rows);requestAnimationFrame(lastPainter);
      const boundaryNote=rows.length<22?` 早期合併前有獨立縣、市選舉，本次僅比較行政區可一對一對應的 ${rows.length} 個地區。`:'';
      $('#local-map-status').innerHTML=(layer==='winner'?'<b>勝方版圖：</b>左右分別呈現各年度縣市當選者政黨，點擊任一縣市可同步查看兩屆資料。':layer==='share'?`<b>${PARTY_LABEL[party]}得票率：</b>左右地圖顏色越深，代表該年度該黨在縣市的得票率越高。`:'<b>藍綠差距：</b>左右地圖分別呈現各年度 DPP − KMT 得票率差，綠色偏 DPP、藍色偏 KMT。')+boundaryNote;
      renderState();syncUrl();
    }catch(err){showError(err)}
  }

  function featureName(f){return normalize(f?.properties?.name||f?.properties?.COUNTYNAME||f?.properties?.COUNTY||'')}
  async function ensureMap(){
    if(topology)return;topology=await fetch('../data/history/counties.topo.json').then(r=>{if(!r.ok)throw new Error('counties.topo.json');return r.json()});const obj=topology.objects[Object.keys(topology.objects)[0]];features=topojson.feature(topology,obj).features;svg=d3.select('#local-map');mapNode=$('#local-map');drawMap();const observer=new ResizeObserver(()=>{clearTimeout(resizeTimer);resizeTimer=setTimeout(()=>{drawMap();lastPainter?.()},80)});observer.observe(mapNode);observer.observe($('#local-exec-compare-maps'));
  }
  function drawMap(){
    if(!svg||!features.length)return;const w=mapNode.clientWidth||700,h=mapNode.clientHeight||520,shown=mobile()?features.filter(f=>!ISLANDS.includes(featureName(f))):features;svg.attr('viewBox',`0 0 ${w} ${h}`);const projection=d3.geoMercator().fitExtent([[18,10],[w-18,h-10]],{type:'FeatureCollection',features:shown}),geo=d3.geoPath(projection);
    svg.selectAll('path.local-county').data(shown,d=>featureName(d)).join('path').attr('class','local-county').attr('data-county',d=>featureName(d)).attr('d',geo).on('mousemove',(event,d)=>{const tip=$('#local-tooltip');tip.style.display='block';tip.style.left=`${event.clientX+14}px`;tip.style.top=`${event.clientY+14}px`;tip.innerHTML=`${esc(featureName(d))}<br>點擊查看結果`}).on('mouseleave',()=>$('#local-tooltip').style.display='none').on('click',(_,d)=>selectCounty(featureName(d)));
  }
  function paintSingle(data){if(!svg)return;svg.selectAll('path.local-county').attr('class',d=>`local-county${region===featureName(d)?' selected':''}`).style('fill',d=>{const entries=areaEntries(data,featureName(d));if(!entries.length)return'#201d1a';const parties=new Set(entries.map(([,race])=>race.winner.partyKey));return parties.size===1?partyColor([...parties][0]):partyColor('MIXED')}).style('opacity',d=>areaEntries(data,featureName(d)).length?1:.3).style('stroke',d=>region===featureName(d)?'#fff':null).style('stroke-width',d=>region===featureName(d)?2.3:null)}
  function paintCompare(rows){if(!svg)return;const by=new Map(rows.map(r=>[r.name,r])),color=comparisonColor(rows,layer);svg.selectAll('path.local-county').each(function(d){const r=by.get(featureName(d)),sel=d3.select(this);if(!r){sel.style('fill','#201d1a').style('opacity',.3);return}let fill='#201d1a',opacity=1,stroke=null,width=null;if(layer==='winner'){fill=partyColor(r.bParty);if(r.flip){stroke='#f6c945';width=2.2}else opacity=.82}else if(layer==='share'){const val=party==='DPP'?(r.dA==null||r.dB==null?null:r.dB-r.dA):(r.kA==null||r.kB==null?null:r.kB-r.kA);fill=Number.isFinite(val)?color.scale(val):'#201d1a';opacity=Number.isFinite(val)?1:.3}else{fill=Number.isFinite(r.swing)?color.scale(r.swing):'#201d1a';opacity=Number.isFinite(r.swing)?1:.3}sel.attr('class',`local-county${compareSelection===r.name?' selected':''}`).style('fill',fill).style('opacity',opacity).style('stroke',compareSelection===r.name?'#fff':stroke).style('stroke-width',compareSelection===r.name?2.3:width)})}
  function renderInsets(data){const box=$('#local-mobile-insets');box.innerHTML=ISLANDS.map(name=>[name,areaEntries(data,name)]).filter(([,entries])=>entries.length).map(([name,entries])=>{const race=entries[0][1],mixed=entries.length>1;return`<button class="local-inset" data-county="${name}" type="button"><b>${name}</b><span><i style="background:${mixed?partyColor('MIXED'):partyColor(race.winner.partyKey)}"></i>${mixed?`${entries.length} 場選舉`:esc(race.winner.name)}</span></button>`}).join('');$$('#local-mobile-insets [data-county]').forEach(b=>b.addEventListener('click',()=>selectCounty(b.dataset.county)))}
  function renderCompareInsets(rows){const by=new Map(rows.map(r=>[r.name,r]));$('#local-mobile-insets').innerHTML=ISLANDS.map(name=>[name,by.get(name)]).filter(([,r])=>r).map(([name,r])=>{const val=layer==='share'?(party==='DPP'?(r.dA==null||r.dB==null?null:r.dB-r.dA):(r.kA==null||r.kB==null?null:r.kB-r.kA)):r.swing,label=layer==='winner'?r.b.winner.name:`${signed(val)} pp`;return`<button class="local-inset" data-county="${name}" type="button"><b>${name}</b><span><i style="background:${layer==='winner'?partyColor(r.bParty):'#9b948a'}"></i>${esc(label)}</span></button>`}).join('');$$('#local-mobile-insets [data-county]').forEach(b=>b.addEventListener('click',()=>{compareSelection=b.dataset.county;renderCompare()}))}

  function selectCounty(name){name=normalize(name);if(!COUNTIES.includes(name))return;if(mode==='compare'){compareSelection=name;renderCompare();return}level='county';region=name;syncControls();renderSingle()}
  function setLoading(text){$('#local-map-status').textContent=text}
  async function changeYear(next){if(!YEARS.includes(next)||next===year)return;year=next;await render();window.dispatchEvent(new CustomEvent('history:contentchange',{detail:{label:`${year} 縣市長選舉`}}))}
  function showError(err){console.error(err);$('#local-map-status').innerHTML='<b>資料載入失敗。</b> 請重新整理；若持續發生，請回報島民觀察室。';const d=$('#local-county-detail');d.className='local-empty';d.innerHTML=`<strong>無法載入選舉資料</strong>${esc(err?.message||err)}`}
  function bind(){
    $('#local-election-type').addEventListener('change',e=>{if(e.target.value==='president'){const url='./?type=president&year=2024&level=national';if(typeof window.historyNavigate==='function')window.historyNavigate(url,'總統副總統');else location.href=url}else if(e.target.value==='councilor'){const url='./councilor.html?type=councilor&year=2022&level=national';if(typeof window.historyNavigate==='function')window.historyNavigate(url,'縣市議員');else location.href=url}else e.target.value='local-executive'});
    $$('#local-mode-switch [data-mode]').forEach(b=>b.addEventListener('click',()=>{mode=b.dataset.mode;compareSelection='';syncControls();render()}));
    $('#local-year').addEventListener('change',e=>changeYear(Number(e.target.value)));
    $$('#local-level-switch [data-level]').forEach(b=>b.addEventListener('click',()=>{level=b.dataset.level;if(level==='national')region='';else if(!region)region=$('#local-region option:not([value=""])')?.value||'';syncControls();render()}));
    const selectArea=e=>{region=normalize(e.target.value);level=region?'county':'national';syncControls();render()};
    $('#local-region').addEventListener('change',selectArea);$('#local-area-select').addEventListener('change',selectArea);
    $('#local-compare-a').addEventListener('change',e=>{const v=Number(e.target.value);if(v!==compareB)compareA=v;syncControls();render()});
    $('#local-compare-b').addEventListener('change',e=>{const v=Number(e.target.value);if(v!==compareA)compareB=v;year=compareB;syncControls();render()});
    $('#local-swap').addEventListener('click',()=>{[compareA,compareB]=[compareB,compareA];year=compareB;compareSelection='';syncControls();render()});
    $$('#local-layer-switch [data-layer]').forEach(b=>b.addEventListener('click',()=>{layer=b.dataset.layer;compareSelection='';syncControls();render()}));
    $$('#local-party-switch [data-party]').forEach(b=>b.addEventListener('click',()=>{party=b.dataset.party;syncControls();render()}));
    $('#local-reset').addEventListener('click',()=>{mode='single';year=2022;level='national';region='';compareA=2018;compareB=2022;layer='winner';party='DPP';compareSelection='';syncControls();render()});
  }
  async function render(){syncControls();renderState();syncUrl();if(mode==='compare')await renderCompare();else await renderSingle()}
  async function init(){parseQuery();bind();syncControls();try{await ensureMap();await render()}catch(err){showError(err)}}
  init();
})();
