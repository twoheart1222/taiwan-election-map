(()=>{
  if(!document.body||/town\.html$/i.test(location.pathname))return;
  // 顏色改用各黨黨徽本身的品牌色，與 history/index.html、history/local-executive.js 一致。
  const COLORS={DPP:'#00A600',KMT:'#000095',TPP:'#28C8C8',PFP:'#FF6600',NP:'#002FA7',IND:'#9D9D9D'};
  const ISLANDS=['澎湖縣','金門縣','連江縣'];
  const ELECTION_TYPES=[
    {id:'president',label:'總統副總統',available:true},
    {id:'legislator',label:'立法委員',available:false},
    {id:'local-executive',label:'縣市長',available:true},
    {id:'councilor',label:'縣市議員',available:true}
  ];
  const LAYER_LABELS={winner:'勝方版圖',share:'得票率變化',swing:'藍綠 Swing'};
  const PARTY_LABELS={DPP:'民主進步黨',KMT:'中國國民黨'};
  const $=s=>document.querySelector(s);
  const normalize=v=>String(v||'').replaceAll('台','臺').replace(/\s+/g,'').trim();
  const esc=v=>String(v??'').replace(/[&<>"']/g,ch=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[ch]));
  let national=null,counties=null,topology=null,features=[];
  let electionType='president',mode='single',level='national',compareA=2020,compareB=2024,compareLayer='winner',compareParty='DPP',compareSelection=null,availableYears=[],resizeTimer=null,queryHydrated=false;

  function currentYear(){const y=Number($('#archive-year-select')?.value);return Number.isFinite(y)?y:2024}
  function election(year){return national?.elections?.find(e=>Number(e.year)===Number(year))||null}
  function candidate(year,no){return election(year)?.candidates?.find(c=>String(c.no)===String(no))||null}
  function partyMeta(year,key){return election(year)?.candidates?.find(c=>c.partyKey===key)||null}
  function countyResult(year,name){return counties?.years?.[String(year)]?.counties?.[normalize(name)]||null}
  function featureName(f){return normalize(f?.properties?.name||f?.properties?.COUNTYNAME||f?.properties?.COUNTY||'')}
  function winnerParty(year,result){return candidate(year,result?.winnerNo)?.partyKey||'IND'}
  function winnerMeta(year,result){return candidate(year,result?.winnerNo)||null}
  function partyColor(key){return COLORS[key]||COLORS.IND}
  function shareForParty(year,result,key){const meta=partyMeta(year,key);if(!meta||!result)return null;const row=result.candidates?.find(c=>String(c.no)===String(meta.no));if(!row)return null;return Number(row.share ?? (result.validVotes?row.votes/result.validVotes*100:0))}
  function twoPartyMargin(year,result){const d=shareForParty(year,result,'DPP'),k=shareForParty(year,result,'KMT');return d==null||k==null?null:d-k}
  function signed(v,d=2){return v==null||!Number.isFinite(v)?'—':`${v>=0?'+':''}${v.toFixed(d)}`}
  function pct(v){return v==null||!Number.isFinite(v)?'—':`${v.toFixed(2)}%`}
  function compareRow(name){const rA=countyResult(compareA,name),rB=countyResult(compareB,name);if(!rA||!rB)return null;const pA=winnerParty(compareA,rA),pB=winnerParty(compareB,rB),mA=twoPartyMargin(compareA,rA),mB=twoPartyMargin(compareB,rB);return{name,rA,rB,pA,pB,flip:pA!==pB,swing:mA==null||mB==null?null:mB-mA,dA:shareForParty(compareA,rA,'DPP'),dB:shareForParty(compareB,rB,'DPP'),kA:shareForParty(compareA,rA,'KMT'),kB:shareForParty(compareB,rB,'KMT')}}
  function allComparisons(){const a=Object.keys(counties?.years?.[String(compareA)]?.counties||{}),b=new Set(Object.keys(counties?.years?.[String(compareB)]?.counties||{}));return a.filter(n=>b.has(n)).map(compareRow).filter(Boolean)}
  function swingApplicable(){return !!partyMeta(compareA,'DPP')&&!!partyMeta(compareA,'KMT')&&!!partyMeta(compareB,'DPP')&&!!partyMeta(compareB,'KMT')}

  function loadQueryStyles(){
    if(document.querySelector('link[data-history-query-refinement]'))return;
    const link=document.createElement('link');
    link.rel='stylesheet';link.href='./query-refinement.css';link.dataset.historyQueryRefinement='true';
    document.head.appendChild(link);
  }
  function buildQueryChrome(){
    const staticBox=$('.archive-query-static');
    if(staticBox&&!$('#archive-election-type')){
      const select=document.createElement('select');
      select.id='archive-election-type';select.className='archive-type-select';select.setAttribute('aria-label','選擇選舉類型');
      select.innerHTML=ELECTION_TYPES.map(type=>`<option value="${type.id}"${type.id===electionType?' selected':''}${type.available?'':' disabled'}>${esc(type.label)}${type.available?'':'｜建置中'}</option>`).join('');
      staticBox.replaceWith(select);
      const label=select.closest('.archive-query-field')?.querySelector('label');if(label)label.htmlFor=select.id;
      select.addEventListener('change',()=>{
        if(select.value==='councilor'){const url='./councilor.html?type=councilor&year=2022&level=national';if(typeof window.historyNavigate==='function')window.historyNavigate(url,'縣市議員');else location.href=url;return}
        if(select.value!=='president'){select.value='president';return}electionType='president';syncUrl();renderQuerySummary();
      });
    }
    const shell=$('.archive-query-shell');
    if(shell&&!$('#archive-query-statebar')){
      shell.insertAdjacentHTML('beforeend',`<div class="archive-query-statebar" id="archive-query-statebar"><div class="archive-query-state-label">目前查詢</div><div class="archive-query-path" id="archive-query-path" aria-live="polite"></div><button type="button" class="archive-query-reset" id="archive-query-reset">重設</button></div>`);
      $('#archive-query-reset')?.addEventListener('click',resetQuery);
    }
  }
  function queryChips(){
    if(mode==='compare'){
      const chips=['總統副總統',`${compareA} → ${compareB}`,LAYER_LABELS[compareLayer]||'勝方版圖'];
      if(compareLayer==='share')chips.push(PARTY_LABELS[compareParty]||compareParty);
      return chips;
    }
    const chips=['總統副總統',String(currentYear()),level==='county'?'縣市':'全國'];
    const region=normalize($('#archive-region-select')?.value);
    if(level==='county'&&region)chips.push(region);
    return chips;
  }
  function renderQuerySummary(){
    const path=$('#archive-query-path');if(!path)return;
    path.innerHTML=queryChips().map((chip,i)=>`<span class="archive-query-chip${i===0?' type':''}">${esc(chip)}</span>`).join('<span class="archive-query-sep" aria-hidden="true">›</span>');
    document.body.dataset.electionType=electionType;
    document.title=mode==='compare'?`${compareA}→${compareB} 總統選舉比較｜島民觀察室`:`${currentYear()} 總統選舉${level==='county'&&normalize($('#archive-region-select')?.value)?`・${normalize($('#archive-region-select').value)}`:''}｜島民觀察室`;
  }
  function resetQuery(){
    electionType='president';compareA=availableYears.includes(2020)?2020:availableYears.at(-2);compareB=availableYears.includes(2024)?2024:availableYears.at(-1);compareLayer='winner';compareParty='DPP';compareSelection=null;
    syncCompareControls();syncLayerControls();
    const type=$('#archive-election-type');if(type)type.value='president';
    setMode('single',{sync:false});
    const year=availableYears.includes(2024)?2024:availableYears.at(-1);
    if(typeof window.selectYear==='function')window.selectYear(year);
    level='national';syncLevelButtons();
    const region=$('#archive-region-select');if(region)region.value='';
    if(typeof window.renderElection==='function')window.renderElection();
    syncUrl();renderQuerySummary();
  }

  function electedStamp(){return `<svg class="archive-elected-stamp" viewBox="0 0 100 100" aria-label="當選" role="img"><defs><filter id="archive-stamp-rough" x="-10%" y="-10%" width="120%" height="120%"><feTurbulence type="fractalNoise" baseFrequency="0.85" numOctaves="2" seed="4" result="n"/><feDisplacementMap in="SourceGraphic" in2="n" scale="2.6"/></filter></defs><g filter="url(#archive-stamp-rough)" fill="none" stroke="#E4022B"><circle cx="50" cy="50" r="45" stroke-width="4.5"/><circle cx="50" cy="50" r="38" stroke-width="1.6"/><text x="50" y="66" text-anchor="middle" font-family="'Noto Serif TC','Songti TC',serif" font-weight="900" font-size="44" fill="#E4022B" stroke="none" letter-spacing="-2">當選</text><path d="M22 78 L78 78" stroke-width="1.6"/><text x="50" y="30" text-anchor="middle" font-family="Archivo,sans-serif" font-weight="900" font-size="8.5" fill="#E4022B" stroke="none" letter-spacing="3.4">ELECTED</text></g></svg>`}
  function applyElectedCards(){document.querySelectorAll('#candidates .candidate').forEach(card=>{const win=card.classList.contains('elected');card.classList.toggle('archive-elected-card',win);if(win&&!card.querySelector('.archive-elected-stamp'))card.insertAdjacentHTML('afterbegin',electedStamp());if(!win)card.querySelector('.archive-elected-stamp')?.remove()})}
  function watchElectedCards(){const list=$('#candidates');if(!list)return;applyElectedCards();new MutationObserver(()=>requestAnimationFrame(applyElectedCards)).observe(list,{childList:true,subtree:true,attributes:true,attributeFilter:['class']})}

  function buildCompareUI(){
    const slot=$('#archive-compare-slot');if(!slot||slot.firstElementChild)return;
    slot.innerHTML=`<div class="archive-compare-workspace"><div class="archive-compare-top"><label class="archive-year-select"><span>A 年份</span><select id="archive-compare-a" aria-label="比較 A 年份"></select></label><button type="button" id="archive-compare-swap" class="archive-compare-swap" aria-label="交換 A 與 B 年份">⇄</button><label class="archive-year-select"><span>B 年份</span><select id="archive-compare-b" aria-label="比較 B 年份"></select></label><div class="archive-layer-field"><span>地圖圖層</span><div class="archive-segment archive-layer-switch" role="group" aria-label="比較地圖圖層"><button type="button" data-layer="winner" class="on">勝方版圖</button><button type="button" data-layer="share">得票率變化</button><button type="button" data-layer="swing">藍綠 Swing</button></div></div></div><div class="archive-compare-body"><div class="archive-compare-summary"><div class="archive-compare-heading"><div><div class="archive-compare-kicker">CROSS-ELECTION COMPARISON</div><h3 class="archive-compare-title">跨屆比較</h3></div></div><div class="archive-segment archive-party-switch" id="archive-party-switch" role="group" aria-label="選擇得票率變化政黨"><button type="button" data-party="DPP" class="on">民主進步黨</button><button type="button" data-party="KMT">中國國民黨</button></div><div class="archive-map-legend" id="archive-map-legend"></div><div id="archive-compare-chart" class="paired-compare-chart"></div><div class="archive-compare-stats" id="archive-compare-stats"></div></div><div class="archive-compare-inspector"><div class="archive-compare-note"></div><div class="compare-region-heading"><strong>勝方政黨翻轉縣市</strong><span>僅顯示 A → B 顏色有變化</span></div><div class="archive-flips compare-region-picker" id="archive-flips" aria-label="勝方政黨翻轉縣市"></div><div class="archive-compare-detail" id="archive-compare-detail">點擊地圖查看縣市變化。</div></div></div></div>`;
    $('#archive-compare-swap').addEventListener('click',()=>setComparePair(compareB,compareA));
    $('#archive-compare-a').addEventListener('change',e=>setComparePair(Number(e.target.value),compareB));
    $('#archive-compare-b').addEventListener('change',e=>setComparePair(compareA,Number(e.target.value)));
    document.querySelectorAll('.archive-layer-switch [data-layer]').forEach(b=>b.addEventListener('click',()=>setCompareLayer(b.dataset.layer)));
    document.querySelectorAll('#archive-party-switch [data-party]').forEach(b=>b.addEventListener('click',()=>{compareParty=b.dataset.party;syncLayerControls();renderCompareSummary();styleComparisonMaps();syncUrl();renderQuerySummary()}));
  }

  function initialComparePair(q=new URLSearchParams(location.search)){const a=Number(q.get('compareA')),b=Number(q.get('compareB')),valid=y=>availableYears.includes(y);if(valid(a)&&valid(b)&&a!==b)return[a,b];const B=availableYears.includes(2024)?2024:availableYears.at(-1),A=availableYears.includes(2020)?2020:availableYears.filter(y=>y!==B).at(-1);return[A,B]}
  function selectOptions(selected,blocked){return availableYears.map(y=>`<option value="${y}"${y===selected?' selected':''}${y===blocked?' disabled':''}>${y}</option>`).join('')}
  function syncCompareControls(){const a=$('#archive-compare-a'),b=$('#archive-compare-b');if(a){a.innerHTML=selectOptions(compareA,compareB);a.value=String(compareA)}if(b){b.innerHTML=selectOptions(compareB,compareA);b.value=String(compareB)}document.body.dataset.compareA=String(compareA);document.body.dataset.compareB=String(compareB)}
  function syncUrl(){
    if(!queryHydrated)return;
    const u=new URL(location.href);
    u.searchParams.set('type',electionType);
    u.searchParams.set('year',String(currentYear()));
    if(mode==='compare'){
      u.searchParams.set('mode','compare');u.searchParams.set('compareA',String(compareA));u.searchParams.set('compareB',String(compareB));u.searchParams.set('layer',compareLayer);
      if(compareLayer==='share')u.searchParams.set('party',compareParty);else u.searchParams.delete('party');
      u.searchParams.delete('level');u.searchParams.delete('region');
    }else{
      u.searchParams.delete('mode');u.searchParams.delete('compareA');u.searchParams.delete('compareB');u.searchParams.delete('layer');u.searchParams.delete('party');
      u.searchParams.set('level',level);
      const region=normalize($('#archive-region-select')?.value);if(level==='county'&&region)u.searchParams.set('region',region);else u.searchParams.delete('region');
    }
    history.replaceState(null,'',u);
  }
  function setComparePair(a,b){a=Number(a);b=Number(b);if(!availableYears.includes(a)||!availableYears.includes(b)||a===b){syncCompareControls();return false}compareA=a;compareB=b;compareSelection=null;syncCompareControls();if(mode==='compare'&&typeof window.selectYear==='function'&&currentYear()!==compareB)window.selectYear(compareB);syncUrl();if(mode==='compare'){renderCompareSummary();styleComparisonMaps();updateMapStatus()}renderQuerySummary();return true}
  function setCompareLayer(layer){if(!['winner','share','swing'].includes(layer))return;compareLayer=layer;compareSelection=null;syncLayerControls();renderCompareSummary();styleComparisonMaps();updateMapStatus();syncUrl();renderQuerySummary()}
  function syncLayerControls(){document.body.dataset.compareLayer=compareLayer;document.querySelectorAll('.archive-layer-switch [data-layer]').forEach(b=>b.classList.toggle('on',b.dataset.layer===compareLayer));document.querySelectorAll('#archive-party-switch [data-party]').forEach(b=>b.classList.toggle('on',b.dataset.party===compareParty));$('#archive-party-switch')?.classList.toggle('show',compareLayer==='share')}

  function setMode(next,options={}){
    if(next==='compare'&&!national)return;mode=next==='compare'?'compare':'single';document.body.classList.toggle('archive-comparing',mode==='compare');document.body.dataset.archiveMode=mode;
    const single=$('#archive-mode-single'),compare=$('#archive-mode-compare');single?.classList.toggle('on',mode==='single');compare?.classList.toggle('on',mode==='compare');single?.setAttribute('aria-pressed',String(mode==='single'));compare?.setAttribute('aria-pressed',String(mode==='compare'));
    if(mode==='compare'){if(currentYear()!==compareB&&typeof window.selectYear==='function')window.selectYear(compareB);renderCompareSummary();styleComparisonMaps();updateMapStatus()}else{restoreMaps();if(typeof window.renderElection==='function')window.renderElection();syncRegionControls();applyElectedCards()}
    if(options.sync!==false)syncUrl();renderQuerySummary();
  }

  function setLevel(next,options={}){level=next==='county'?'county':'national';document.body.dataset.archiveLevel=level;document.querySelectorAll('#archive-level-switch [data-level]').forEach(b=>{const on=b.dataset.level===level;b.classList.toggle('on',on);b.setAttribute('aria-pressed',String(on))});const region=$('#archive-region-select');if(level==='national'&&region){region.value='';if(typeof window.renderElection==='function')window.renderElection()}if(level==='county'&&!region?.value){const d=$('#county-detail');if(d){d.className='county-empty';d.innerHTML='<strong>選擇一個縣市</strong>可從上方地區選單或直接點擊地圖。'}}if(options.sync!==false)syncUrl();renderQuerySummary()}
  function syncRegionControls(){const select=$('#archive-region-select');if(!select||!counties)return;const names=Object.keys(counties.years?.[String(currentYear())]?.counties||{}).sort((a,b)=>a.localeCompare(b,'zh-Hant'));const keep=normalize(select.value);select.innerHTML='<option value="">全國</option>'+names.map(n=>`<option value="${esc(n)}">${esc(n)}</option>`).join('');if(keep&&names.includes(keep))select.value=keep;else select.value='';if(!select.value&&level!=='county')level='national';syncLevelButtons()}
  function syncLevelButtons(){document.body.dataset.archiveLevel=level;document.querySelectorAll('#archive-level-switch [data-level]').forEach(b=>{const on=b.dataset.level===level;b.classList.toggle('on',on);b.setAttribute('aria-pressed',String(on))})}
  function chooseRegion(name,options={}){const n=normalize(name),select=$('#archive-region-select');if(!n){setLevel('national',options);return}level='county';syncLevelButtons();if(select)select.value=n;const result=countyResult(currentYear(),n);if(typeof window.renderCounty==='function')window.renderCounty(n,result);if(options.sync!==false)syncUrl();renderQuerySummary()}

  function valueDomain(rows,kind){const vals=rows.map(r=>kind==='share'?((compareParty==='DPP'?r.dB-r.dA:r.kB-r.kA)):r.swing).filter(Number.isFinite).map(Math.abs);return Math.max(1,...vals)}
  function mix(a,b,t){return window.d3?.interpolateRgb?window.d3.interpolateRgb(a,b)(Math.max(0,Math.min(1,t))):b}
  function changeColor(v,max){if(!Number.isFinite(v))return '#282420';const t=Math.min(1,Math.abs(v)/Math.max(1,max));return v>=0?mix('#302c28','#f4f1ea',t):mix('#302c28','#69717d',t)}
  function swingColor(v,max){if(!Number.isFinite(v))return '#282420';const t=Math.min(1,Math.abs(v)/Math.max(1,max));return v>=0?mix('#302c28',COLORS.DPP,t):mix('#302c28',COLORS.KMT,t)}
  function layerFill(r,rows){if(compareLayer==='winner')return partyColor(r.pB);if(compareLayer==='share'){const v=compareParty==='DPP'?r.dB-r.dA:r.kB-r.kA;return changeColor(v,valueDomain(rows,'share'))}return swingColor(r.swing,valueDomain(rows,'swing'))}

  function nationalShare(year,key){const e=election(year),c=partyMeta(year,key);return e&&c&&e.validVotes?Number(c.votes||0)/Number(e.validVotes)*100:0}
  function renderCompareChart(){
    const a=election(compareA),b=election(compareB),metrics=[
      {label:'民進黨得票率',a:nationalShare(compareA,'DPP'),b:nationalShare(compareB,'DPP'),format:pct},
      {label:'國民黨得票率',a:nationalShare(compareA,'KMT'),b:nationalShare(compareB,'KMT'),format:pct},
      {label:'全國投票率',a:Number(a?.turnout||0),b:Number(b?.turnout||0),format:pct}
    ];
    const box=$('#archive-compare-chart');if(!box)return;
    box.innerHTML=`<div class="paired-chart-head"><strong>全國關鍵指標</strong><span class="paired-chart-key"><span><i style="background:#b89b3f"></i>${compareA}</span><span><i style="background:#E4022B"></i>${compareB}</span></span></div>${metrics.map(m=>{const max=Math.max(m.a,m.b,1);return`<div class="paired-chart-row"><span>${m.label}</span><div class="paired-chart-bars"><div class="paired-chart-bar"><em>${compareA}</em><span class="paired-chart-track"><i style="width:${m.a/max*100}%;background:#b89b3f"></i></span><b>${m.format(m.a)}</b></div><div class="paired-chart-bar"><em>${compareB}</em><span class="paired-chart-track"><i style="width:${m.b/max*100}%;background:#E4022B"></i></span><b>${m.format(m.b)}</b></div></div></div>`}).join('')}`;
  }
  function absoluteDomain(rows,kind){const values=[];for(const r of rows){if(kind==='share')values.push(compareParty==='DPP'?r.dA:r.kA,compareParty==='DPP'?r.dB:r.kB);else values.push(twoPartyMargin(compareA,r.rA),twoPartyMargin(compareB,r.rB))}return Math.max(1,...values.filter(Number.isFinite).map(Math.abs))}
  function pairedFill(r,side,rows){
    const isA=side==='A',year=isA?compareA:compareB,result=isA?r.rA:r.rB;
    if(compareLayer==='winner')return partyColor(isA?r.pA:r.pB);
    if(compareLayer==='share'){const value=shareForParty(year,result,compareParty);return Number.isFinite(value)?mix('#e5ded2',partyColor(compareParty),.12+.88*(value/100)):'#c9c0b4'}
    const margin=twoPartyMargin(year,result),max=absoluteDomain(rows,'swing');return Number.isFinite(margin)?(margin>=0?mix('#e2d9cc',COLORS.DPP,Math.abs(margin)/max):mix('#e2d9cc',COLORS.KMT,Math.abs(margin)/max)):'#c9c0b4'
  }
  function drawComparisonMap(target,rows,side){
    const node=$(target);if(!node||!window.d3||!features.length)return;const map=window.d3.select(target),w=node.clientWidth||430,h=node.clientHeight||470,by=new Map(rows.map(r=>[r.name,r])),year=side==='A'?compareA:compareB;
    map.attr('viewBox',`0 0 ${w} ${h}`);const projection=window.d3.geoMercator().fitExtent([[12,12],[w-12,h-12]],{type:'FeatureCollection',features}),path=window.d3.geoPath(projection);
    map.selectAll('path.archive-paired-county').data(features,d=>featureName(d)).join('path').attr('class',d=>`archive-paired-county${compareSelection===featureName(d)?' selected':''}`).attr('data-county',d=>featureName(d)).attr('d',path).style('fill',d=>{const r=by.get(featureName(d));return r?pairedFill(r,side,rows):'#c9c0b4'}).style('opacity',d=>by.has(featureName(d))?1:.42).style('stroke',d=>compareSelection===featureName(d)?'#E4022B':null).style('stroke-width',d=>compareSelection===featureName(d)?2.5:null).on('mousemove',(event,d)=>{const name=featureName(d),r=by.get(name),tip=$('#tooltip');if(!tip)return;tip.style.display='block';tip.style.left=`${event.clientX+14}px`;tip.style.top=`${event.clientY+14}px`;if(!r){tip.innerHTML=`${name}<br>本年度無資料`;return}const result=side==='A'?r.rA:r.rB,winner=winnerMeta(year,result),share=compareParty==='DPP'?(side==='A'?r.dA:r.dB):(side==='A'?r.kA:r.kB),margin=twoPartyMargin(year,result);tip.innerHTML=compareLayer==='winner'?`<b>${name}・${year}</b><br>${winner?.president||'—'}・${winner?.party||''}`:compareLayer==='share'?`<b>${name}・${year}</b><br>${compareParty} 得票率 ${pct(share)}`:`<b>${name}・${year}</b><br>藍綠差距 ${signed(margin)} pp`}).on('mouseleave',()=>{const tip=$('#tooltip');if(tip)tip.style.display='none'}).on('click',(_,d)=>{const name=featureName(d);if(by.has(name))showCompareDetail(name)});
  }
  function drawComparisonMaps(rows=allComparisons()){$('#archive-map-a-year').textContent=String(compareA);$('#archive-map-b-year').textContent=String(compareB);drawComparisonMap('#archive-map-a',rows,'A');drawComparisonMap('#archive-map-b',rows,'B')}

  function renderLegend(rows){const legend=$('#archive-map-legend');if(!legend)return;legend.className='archive-map-legend '+compareLayer;if(compareLayer==='winner'){legend.innerHTML=`<span>${partyVoteBadge('DPP',18)}DPP</span><span>${partyVoteBadge('KMT',18)}KMT</span><span>${partyVoteBadge('IND',18)}其他</span><span><i style="background:#E4022B"></i>紅框＝目前選取</span>`;return}if(compareLayer==='share'){legend.innerHTML=`<span><i style="background:${partyColor(compareParty)};opacity:.35"></i>顏色越深＝該年度 ${PARTY_LABELS[compareParty]} 得票率越高</span>`;return}const max=absoluteDomain(rows,'swing');legend.innerHTML=`<span>KMT −${max.toFixed(1)}pp</span><i class="legend-bar"></i><span>DPP +${max.toFixed(1)}pp</span>`}
  function renderCompareSummary(){
    const rows=allComparisons(),flips=rows.filter(r=>r.flip),swingOK=swingApplicable(),strongest=swingOK?[...rows].filter(r=>r.swing!=null).sort((a,b)=>Math.abs(b.swing)-Math.abs(a.swing))[0]:null;
    $('.archive-compare-title').textContent=`${compareA} → ${compareB} 縣市比較`;
    const note=$('.archive-compare-note');if(note)note.textContent=compareLayer==='winner'?`左右並列 ${compareA} 與 ${compareB} 各縣市勝方。`:compareLayer==='share'?`左右顯示 ${compareParty} 在各年度的縣市得票率，顏色越深代表得票率越高。`:`左右顯示各年度 DPP−KMT 得票率差，綠色偏 DPP、藍色偏 KMT。`;
    $('#archive-compare-stats').innerHTML=`<div class="archive-compare-stat"><span>比較縣市</span><strong>${rows.length}</strong></div><div class="archive-compare-stat"><span>勝方政黨翻轉</span><strong>${flips.length}</strong></div><div class="archive-compare-stat"><span>最大藍綠差距位移</span><strong>${strongest?`${esc(strongest.name)} ${signed(strongest.swing,1)}pp`:'—'}</strong></div>`;
    $('#archive-flips').innerHTML=flips.length?flips.map(r=>`<button type="button" class="archive-flip changed" data-county="${esc(r.name)}" aria-label="${esc(r.name)}：${compareA} ${esc(r.pA)} 到 ${compareB} ${esc(r.pB)}"><i style="background:${partyColor(r.pA)}"></i><span>${esc(r.name)}</span><b>→</b><i style="background:${partyColor(r.pB)}"></i></button>`).join(''):'<span class="archive-flip archive-flip-empty">這兩屆沒有勝方政黨翻轉</span>';
    $('#archive-flips').onclick=e=>{const b=e.target.closest('[data-county]');if(b)showCompareDetail(b.dataset.county)};renderLegend(rows);renderCompareChart();
    const keep=compareSelection&&flips.some(r=>r.name===compareSelection)?compareSelection:(flips[0]?.name||rows[0]?.name);if(keep)showCompareDetail(keep);else $('#archive-compare-detail').textContent='目前沒有可比較的縣市資料。';
  }
  function showCompareDetail(name){const r=compareRow(name);if(!r)return;compareSelection=name;const wA=winnerMeta(compareA,r.rA),wB=winnerMeta(compareB,r.rB),dDelta=r.dA==null||r.dB==null?null:r.dB-r.dA,kDelta=r.kA==null||r.kB==null?null:r.kB-r.kA;$('#archive-compare-detail').innerHTML=`<strong>${esc(name)}</strong>${r.flip?'　·　勝方政黨翻轉':''}<div class="archive-compare-detail-grid"><div class="archive-compare-detail-cell"><span>${compareA} 勝方</span><b>${partyVoteBadge(wA?.partyKey||'IND',20)}<span>${esc(wA?.president||'—')} · ${esc(wA?.party||'')}</span></b></div><div class="archive-compare-detail-cell"><span>${compareB} 勝方</span><b>${partyVoteBadge(wB?.partyKey||'IND',20)}<span>${esc(wB?.president||'—')} · ${esc(wB?.party||'')}</span></b></div><div class="archive-compare-detail-cell"><span>DPP 得票率</span><b>${pct(r.dA)} → ${pct(r.dB)}${dDelta==null?'':` (${signed(dDelta)}pp)`}</b></div><div class="archive-compare-detail-cell"><span>KMT 得票率</span><b>${pct(r.kA)} → ${pct(r.kB)}${kDelta==null?'':` (${signed(kDelta)}pp)`}</b></div></div><div class="archive-compare-na">藍綠差距 Swing：${r.swing==null?'—':`${signed(r.swing)}pp`}${r.swing==null?'；此年份組合缺少完整 DPP/KMT 雙方資料。':''}</div>`;styleComparisonMaps();document.querySelectorAll('.archive-flip').forEach(b=>b.classList.toggle('selected',normalize(b.dataset.county)===name))}

  function syncBaseCountyNames(){document.querySelectorAll('#map path.county').forEach(p=>{const n=normalize(p.dataset.county||featureName(p.__data__));if(n)p.dataset.county=n})}
  function mapPaths(){syncBaseCountyNames();return[...document.querySelectorAll('#map path.county,#mobile-map path.archive-county')]}
  function clearCompareState(p){delete p.dataset.compareFlip;delete p.dataset.compareMuted;delete p.dataset.compareSelected;delete p.dataset.compareLayer;p.classList.remove('archive-flipped','archive-compare-muted','archive-compare-selected')}
  function styleComparisonMaps(){if(mode!=='compare')return;drawComparisonMaps(allComparisons())}
  function restoreMaps(){mapPaths().forEach(p=>{clearCompareState(p);p.style.opacity='';p.style.stroke='';p.style.strokeWidth='';p.style.filter=''});if(typeof window.paintMap==='function')window.paintMap();renderMobileMap()}
  function updateMapStatus(){const heading=$('#map-heading'),status=$('#map-status');if(heading)heading.textContent=`${compareA} 與 ${compareB} 縣市對比`;if(!status)return;if(compareLayer==='winner')status.innerHTML=`<b>勝方版圖：</b>左右分別呈現各年度縣市勝方，點擊任一縣市可同步查看兩屆資料。`;else if(compareLayer==='share')status.innerHTML=`<b>${compareParty} 得票率：</b>左右地圖顏色越深，代表該年度該黨在縣市的得票率越高。`;else status.innerHTML=`<b>藍綠差距：</b>左右地圖分別呈現各年度 DPP−KMT 得票率差，綠色偏 DPP、藍色偏 KMT。`}

  function comparePointer(event){if(mode!=='compare')return;const p=event.target.closest?.('path.county');if(!p)return;event.stopImmediatePropagation();const name=normalize(p.dataset.county||featureName(p.__data__)),r=compareRow(name),tip=$('#tooltip');if(!r||!tip)return;let metric='';if(compareLayer==='winner')metric=`${winnerMeta(compareB,r.rB)?.president||'—'}勝方${r.flip?' · 勝方翻轉':''}`;else if(compareLayer==='share'){const v=compareParty==='DPP'?r.dB-r.dA:r.kB-r.kA;metric=`${compareParty} 得票率 ${signed(v)}pp`}else metric=`Swing ${r.swing==null?'—':signed(r.swing)+'pp'}`;tip.style.display='block';tip.style.left=`${event.clientX+14}px`;tip.style.top=`${event.clientY+14}px`;tip.innerHTML=`${name}<br>${metric}`}
  function compareClick(event){if(mode!=='compare')return;const p=event.target.closest?.('path.county');if(!p)return;event.preventDefault();event.stopImmediatePropagation();showCompareDetail(normalize(p.dataset.county||featureName(p.__data__)))}

  function mobileSvg(){let svg=$('#mobile-map');if(svg)return svg;svg=document.createElementNS('http://www.w3.org/2000/svg','svg');svg.id='mobile-map';svg.setAttribute('role','img');svg.setAttribute('aria-label','台灣縣市選舉地圖，離島使用獨立框顯示');$('#map')?.insertAdjacentElement('afterend',svg);return svg}
  function drawCountyPath(group,feature,projection,name){const d=window.d3.geoPath(projection)(feature),result=countyResult(currentYear(),name),party=result?winnerParty(currentYear(),result):'IND';const p=group.append('path').datum(feature).attr('class','archive-county').attr('data-county',name).attr('d',d).style('fill',result?partyColor(party):'#27231f');p.on('click',event=>{event.preventDefault();if(mode==='compare'){showCompareDetail(name);return}chooseRegion(name)});return p}
  function renderMobileMap(){if(!window.d3||!window.topojson||!topology||!features.length||!matchMedia('(max-width:660px)').matches)return;const node=mobileSvg(),panel=$('.map-panel');if(!node||!panel)return;const rect=node.getBoundingClientRect(),w=Math.max(330,Math.round(rect.width||panel.clientWidth-8)),h=Math.max(360,Math.round(rect.height||panel.clientHeight-144));const svg=window.d3.select(node).attr('viewBox',`0 0 ${w} ${h}`);svg.selectAll('*').remove();const main=features.filter(f=>!ISLANDS.includes(featureName(f))),mainProjection=window.d3.geoMercator().fitExtent([[w*.12,6],[w*.88,h*.72]],{type:'FeatureCollection',features:main}),mainG=svg.append('g');main.forEach(f=>drawCountyPath(mainG,f,mainProjection,featureName(f)));const gap=6,pad=8,boxW=(w-pad*2-gap*2)/3,boxY=h*.76,boxH=h*.22;ISLANDS.forEach((name,i)=>{const f=features.find(x=>featureName(x)===name);if(!f)return;const x=pad+i*(boxW+gap),g=svg.append('g');g.append('rect').attr('class','archive-inset-box').attr('x',x).attr('y',boxY).attr('width',boxW).attr('height',boxH).attr('rx',8);g.append('text').attr('class','archive-inset-label').attr('x',x+8).attr('y',boxY+13).text(name);const projection=window.d3.geoMercator().fitExtent([[x+12,boxY+22],[x+boxW-12,boxY+boxH-8]],f);drawCountyPath(g,f,projection,name)});if(mode==='compare')styleComparisonMaps()}

  function restoreFromUrl(q){
    const requestedType=q.get('type');electionType=ELECTION_TYPES.some(t=>t.available&&t.id===requestedType)?requestedType:'president';const type=$('#archive-election-type');if(type)type.value=electionType;
    const layer=q.get('layer');if(['winner','share','swing'].includes(layer))compareLayer=layer;
    const party=q.get('party');if(['DPP','KMT'].includes(party))compareParty=party;
    [compareA,compareB]=initialComparePair(q);syncCompareControls();syncLayerControls();
    if(q.get('mode')==='compare'||(q.has('compareA')&&q.has('compareB'))){setMode('compare',{sync:false});renderQuerySummary();return}
    setMode('single',{sync:false});
    level=q.get('level')==='county'?'county':'national';syncLevelButtons();syncRegionControls();
    const region=normalize(q.get('region'));if(level==='county'&&region&&countyResult(currentYear(),region))chooseRegion(region,{sync:false});else setLevel(level,{sync:false});
    renderQuerySummary();
  }
  function bindStaticControls(){
    $('#archive-mode-single')?.addEventListener('click',()=>setMode('single'));$('#archive-mode-compare')?.addEventListener('click',()=>setMode('compare'));
    document.querySelectorAll('#archive-level-switch [data-level]').forEach(b=>b.addEventListener('click',()=>setLevel(b.dataset.level)));
    $('#archive-region-select')?.addEventListener('change',e=>chooseRegion(e.target.value));
    $('#archive-year-select')?.addEventListener('change',()=>{requestAnimationFrame(()=>{if(mode==='single'){level='national';const s=$('#archive-region-select');if(s)s.value='';syncLevelButtons();if(typeof window.renderElection==='function')window.renderElection()}syncUrl();renderQuerySummary()})});
    $('#map')?.addEventListener('click',e=>{if(mode==='single'){const p=e.target.closest('path.county');if(p){level='county';syncLevelButtons();const s=$('#archive-region-select');if(s)s.value=normalize(p.dataset.county||featureName(p.__data__));syncUrl();renderQuerySummary()}}},true);
    $('#map')?.addEventListener('mousemove',comparePointer,true);$('#map')?.addEventListener('click',compareClick,true);$('#map')?.addEventListener('mouseleave',()=>{const t=$('#tooltip');if(t)t.style.display='none'},true);
    addEventListener('archive:yearchange',()=>{syncRegionControls();renderMobileMap();applyElectedCards();if(mode==='compare'){styleComparisonMaps();updateMapStatus()}else{const region=normalize($('#archive-region-select')?.value);if(level==='county'&&region)requestAnimationFrame(()=>{if(mode==='single'&&level==='county'&&normalize($('#archive-region-select')?.value)===region)chooseRegion(region,{sync:false})})}syncUrl();renderQuerySummary()});
    addEventListener('archive:countychange',e=>{if(mode!=='single')return;level='county';syncLevelButtons();const s=$('#archive-region-select');if(s)s.value=normalize(e.detail?.county);syncUrl();renderQuerySummary()});
  }

  async function init(){
    const initialQuery=new URLSearchParams(location.search);
    loadQueryStyles();buildQueryChrome();buildCompareUI();bindStaticControls();watchElectedCards();mobileSvg();
    try{
      // 與首頁共用同一個下載與 JSON 解析 Promise，避免手機把三份資料各解析兩次。
      const shared=await window.__historyArchiveDataPromise;
      national=shared.national;counties=shared.counties;topology=shared.topology;const object=topology.objects[Object.keys(topology.objects)[0]];features=window.topojson.feature(topology,object).features;availableYears=(national.elections||[]).map(e=>Number(e.year)).filter(Number.isFinite).sort((a,b)=>a-b);
      restoreFromUrl(initialQuery);
      queryHydrated=true;syncUrl();renderQuerySummary();
      renderMobileMap();applyElectedCards();
      new MutationObserver(()=>{syncBaseCountyNames();if(mode==='compare')requestAnimationFrame(styleComparisonMaps)}).observe($('#map'),{childList:true,subtree:true});
      addEventListener('resize',()=>{clearTimeout(resizeTimer);resizeTimer=setTimeout(()=>{renderMobileMap();if(mode==='compare')styleComparisonMaps()},120)},{passive:true});
    }catch(err){console.error('archive enhancements failed',err);$('#archive-mode-compare')?.setAttribute('disabled','disabled')}
  }
  if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',init,{once:true});else init();
})();
