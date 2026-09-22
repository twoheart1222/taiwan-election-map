(()=>{
  if(!document.body||/town\.html$/i.test(location.pathname))return;
  const COLORS={DPP:'#2daf5d',KMT:'#3b82f6',TPP:'#28c4c7',PFP:'#f59e0b',NP:'#f6c945',IND:'#9b948a'};
  const ISLANDS=['澎湖縣','金門縣','連江縣'];
  const $=s=>document.querySelector(s);
  const normalize=v=>String(v||'').replaceAll('台','臺').replace(/\s+/g,'').trim();
  const esc=v=>String(v??'').replace(/[&<>"']/g,ch=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[ch]));
  let national=null,counties=null,topology=null,features=[];
  let compareActive=false,compareSelection=null,resizeTimer=null,compareA=2020,compareB=2024,availableYears=[];

  function currentYear(){
    const on=$('.year-btn.on');
    const y=Number(on?.textContent?.match(/\d{4}/)?.[0]);
    return Number.isFinite(y)?y:2024;
  }
  function election(year){return national?.elections?.find(e=>Number(e.year)===Number(year))||null}
  function candidate(year,no){return election(year)?.candidates?.find(c=>String(c.no)===String(no))||null}
  function partyMeta(year,key){return election(year)?.candidates?.find(c=>c.partyKey===key)||null}
  function countyResult(year,name){return counties?.years?.[String(year)]?.counties?.[normalize(name)]||null}
  function featureName(f){return normalize(f?.properties?.name||f?.properties?.COUNTYNAME||f?.properties?.COUNTY||'')}
  function winnerParty(year,result){return candidate(year,result?.winnerNo)?.partyKey||'IND'}
  function winnerMeta(year,result){return candidate(year,result?.winnerNo)||null}
  function shareForParty(year,result,key){
    const meta=partyMeta(year,key);if(!meta||!result)return null;
    const row=result.candidates?.find(c=>String(c.no)===String(meta.no));if(!row)return null;
    return Number(row.share ?? (result.validVotes?row.votes/result.validVotes*100:0));
  }
  function twoPartyMargin(year,result){
    const d=shareForParty(year,result,'DPP'),k=shareForParty(year,result,'KMT');
    return d==null||k==null?null:d-k;
  }
  function hasBlueGreenPair(year){return !!partyMeta(year,'DPP')&&!!partyMeta(year,'KMT')}
  function signed(v,digits=2){if(v==null||!Number.isFinite(v))return '—';return `${v>=0?'+':''}${v.toFixed(digits)}`}
  function pct(v){return v==null||!Number.isFinite(v)?'—':`${v.toFixed(2)}%`}
  function partyColor(key){return COLORS[key]||COLORS.IND}
  function compareRow(name){
    const rA=countyResult(compareA,name),rB=countyResult(compareB,name);if(!rA||!rB)return null;
    const pA=winnerParty(compareA,rA),pB=winnerParty(compareB,rB);
    const mA=twoPartyMargin(compareA,rA),mB=twoPartyMargin(compareB,rB);
    return {name,rA,rB,pA,pB,flip:pA!==pB,swing:mA==null||mB==null?null:mB-mA,
      dA:shareForParty(compareA,rA,'DPP'),dB:shareForParty(compareB,rB,'DPP'),
      kA:shareForParty(compareA,rA,'KMT'),kB:shareForParty(compareB,rB,'KMT')};
  }
  function allComparisons(){
    const a=Object.keys(counties?.years?.[String(compareA)]?.counties||{}),b=new Set(Object.keys(counties?.years?.[String(compareB)]?.counties||{}));
    return a.filter(name=>b.has(name)).map(compareRow).filter(Boolean);
  }
  function swingApplicable(){return hasBlueGreenPair(compareA)&&hasBlueGreenPair(compareB)}

  function electedStamp(){
    return `<svg class="archive-elected-stamp" viewBox="0 0 100 100" aria-label="當選" role="img"><defs><filter id="archive-stamp-rough" x="-10%" y="-10%" width="120%" height="120%"><feTurbulence type="fractalNoise" baseFrequency="0.85" numOctaves="2" seed="4" result="n"/><feDisplacementMap in="SourceGraphic" in2="n" scale="2.6"/></filter></defs><g filter="url(#archive-stamp-rough)" fill="none" stroke="#E4022B"><circle cx="50" cy="50" r="45" stroke-width="4.5"/><circle cx="50" cy="50" r="38" stroke-width="1.6"/><text x="50" y="66" text-anchor="middle" font-family="'Noto Serif TC','Songti TC',serif" font-weight="900" font-size="44" fill="#E4022B" stroke="none" letter-spacing="-2">當選</text><path d="M22 78 L78 78" stroke-width="1.6"/><text x="50" y="30" text-anchor="middle" font-family="Archivo,sans-serif" font-weight="900" font-size="8.5" fill="#E4022B" stroke="none" letter-spacing="3.4">ELECTED</text></g></svg>`;
  }
  function applyElectedCards(){
    document.querySelectorAll('#candidates .candidate').forEach(card=>{
      const win=card.classList.contains('elected');
      card.classList.toggle('archive-elected-card',win);
      if(win&&!card.querySelector('.archive-elected-stamp'))card.insertAdjacentHTML('afterbegin',electedStamp());
      if(!win)card.querySelector('.archive-elected-stamp')?.remove();
    });
  }
  function watchElectedCards(){
    const list=$('#candidates');if(!list)return;
    applyElectedCards();
    new MutationObserver(()=>requestAnimationFrame(applyElectedCards)).observe(list,{childList:true,subtree:true,attributes:true,attributeFilter:['class']});
  }

  function buildCompareUI(){
    const row=$('.toolbar-row');if(!row||$('#archive-compare-toggle'))return;
    const btn=document.createElement('button');btn.id='archive-compare-toggle';btn.type='button';btn.className='archive-compare-toggle';btn.setAttribute('aria-expanded','false');btn.textContent='跨屆比較';btn.disabled=true;row.appendChild(btn);
    const drawer=document.createElement('section');drawer.id='archive-compare-drawer';drawer.className='archive-compare-drawer';drawer.setAttribute('aria-live','polite');
    drawer.innerHTML=`<div class="archive-compare-picker" aria-label="自由選擇比較年份"><label class="archive-year-select"><span>A 年份</span><select id="archive-compare-a" aria-label="比較 A 年份" disabled></select></label><button type="button" id="archive-compare-swap" class="archive-compare-swap" aria-label="交換 A 與 B 年份" title="交換年份" disabled>⇄</button><label class="archive-year-select"><span>B 年份</span><select id="archive-compare-b" aria-label="比較 B 年份" disabled></select></label></div><div class="archive-compare-head"><div><div class="archive-compare-kicker">ELECTION SHIFT / 跨屆比較</div><h2 class="archive-compare-title">選擇兩個年份比較縣市版圖</h2></div><div class="archive-compare-note">選擇任兩屆總統選舉。地圖以 B 年份勝方色顯示；金框代表縣市勝方政黨與 A 年份不同。</div></div><div class="archive-compare-stats" id="archive-compare-stats"></div><div class="archive-flips" id="archive-flips" aria-label="勝方翻轉縣市"></div><div class="archive-compare-detail" id="archive-compare-detail">選擇兩個年份後，點擊地圖或翻轉縣市查看變化。</div>`;
    document.querySelector('.toolbar')?.insertAdjacentElement('afterend',drawer);
    btn.addEventListener('click',()=>setCompare(!compareActive));
    $('#archive-compare-swap')?.addEventListener('click',()=>setComparePair(compareB,compareA));
    $('#archive-compare-a')?.addEventListener('change',e=>setComparePair(Number(e.target.value),compareB));
    $('#archive-compare-b')?.addEventListener('change',e=>setComparePair(compareA,Number(e.target.value)));
    $('#map')?.addEventListener('click',e=>{
      if(!compareActive)return;
      const p=e.target.closest('path.county');if(!p)return;
      e.preventDefault();e.stopImmediatePropagation();
      const name=normalize(p.dataset.county||featureName(p.__data__));if(name)showCompareDetail(name);
    },true);
  }

  function initialComparePair(){
    const params=new URLSearchParams(location.search),a=Number(params.get('compareA')),b=Number(params.get('compareB'));
    const valid=y=>availableYears.includes(y);
    if(valid(a)&&valid(b)&&a!==b)return [a,b];
    const fallbackB=availableYears.includes(2024)?2024:availableYears.at(-1);
    const fallbackA=availableYears.includes(2020)?2020:availableYears.filter(y=>y!==fallbackB).at(-1);
    return [fallbackA,fallbackB];
  }
  function selectOptions(selected,blocked){return availableYears.map(year=>`<option value="${year}"${year===selected?' selected':''}${year===blocked?' disabled':''}>${year}</option>`).join('')}
  function syncCompareControls(){
    const a=$('#archive-compare-a'),b=$('#archive-compare-b'),swap=$('#archive-compare-swap'),btn=$('#archive-compare-toggle');
    if(a){a.innerHTML=selectOptions(compareA,compareB);a.disabled=false;a.value=String(compareA)}
    if(b){b.innerHTML=selectOptions(compareB,compareA);b.disabled=false;b.value=String(compareB)}
    if(swap)swap.disabled=false;
    if(btn){btn.disabled=false;btn.textContent=`${compareA} ⇄ ${compareB}`}
    document.body.dataset.compareA=String(compareA);document.body.dataset.compareB=String(compareB);
  }
  function syncCompareUrl(){
    const u=new URL(location.href);u.searchParams.set('compareA',String(compareA));u.searchParams.set('compareB',String(compareB));history.replaceState(null,'',u);
  }
  function setComparePair(a,b){
    a=Number(a);b=Number(b);
    if(!availableYears.includes(a)||!availableYears.includes(b)||a===b){syncCompareControls();return false}
    compareA=a;compareB=b;compareSelection=null;syncCompareControls();syncCompareUrl();
    if(compareActive){renderCompareSummary();styleComparisonMaps();updateMapStatus()}
    return true;
  }
  function configureCompare(){
    availableYears=(national?.elections||[]).map(e=>Number(e.year)).filter(Number.isFinite).sort((a,b)=>a-b);
    [compareA,compareB]=initialComparePair();syncCompareControls();
  }

  function renderCompareSummary(){
    const rows=allComparisons(),flips=rows.filter(r=>r.flip),swingOK=swingApplicable();
    const strongest=swingOK?[...rows].filter(r=>r.swing!=null).sort((a,b)=>Math.abs(b.swing)-Math.abs(a.swing))[0]:null;
    const tA=Number(election(compareA)?.turnout),tB=Number(election(compareB)?.turnout),turnout=Number.isFinite(tA)&&Number.isFinite(tB)?tB-tA:null;
    $('.archive-compare-title').textContent=`${compareA} → ${compareB} 縣市版圖變化`;
    $('#archive-compare-stats').innerHTML=`<div class="archive-compare-stat"><span>比較縣市</span><strong>${rows.length}</strong></div><div class="archive-compare-stat"><span>勝方政黨翻轉</span><strong>${flips.length}</strong></div><div class="archive-compare-stat"><span>${swingOK?'最大藍綠差距位移':'藍綠差距 Swing'}</span><strong>${strongest?`${esc(strongest.name)} ${signed(strongest.swing,1)}pp`:'—'}</strong></div>`;
    $('#archive-flips').innerHTML=flips.map(r=>`<button type="button" class="archive-flip" data-county="${esc(r.name)}"><i style="background:${partyColor(r.pA)}"></i><span>${esc(r.name)}</span><b>→</b><i style="background:${partyColor(r.pB)}"></i></button>`).join('')||'<span class="archive-flip archive-flip-empty">這兩屆沒有縣市勝方政黨翻轉</span>';
    $('#archive-flips').onclick=e=>{const b=e.target.closest('[data-county]');if(b)showCompareDetail(b.dataset.county)};
    const note=$('.archive-compare-note');
    if(note){
      const swingText=swingOK?`Swing =（DPP−KMT 得票率差）${compareB} − ${compareA}。`:'這組年份缺少完整 DPP/KMT 雙方資料，因此不計算藍綠差距 Swing。';
      note.textContent=`地圖以 ${compareB} 勝方色顯示；金框代表縣市勝方政黨與 ${compareA} 不同。${swingText}${turnout==null?'':` 全國投票率變化 ${signed(turnout)}pp。`}`;
    }
    const keep=compareSelection&&rows.some(r=>r.name===compareSelection)?compareSelection:(flips[0]?.name||rows[0]?.name);
    if(keep)showCompareDetail(keep);else $('#archive-compare-detail').textContent='這組年份目前沒有可比較的縣市資料。';
  }

  function showCompareDetail(name){
    const r=compareRow(name);if(!r)return;compareSelection=name;
    const wA=winnerMeta(compareA,r.rA),wB=winnerMeta(compareB,r.rB),swingOK=r.swing!=null&&swingApplicable();
    const dDelta=r.dA==null||r.dB==null?null:r.dB-r.dA,kDelta=r.kA==null||r.kB==null?null:r.kB-r.kA;
    const headline=swingOK?`藍綠得票率差 Swing <strong>${signed(r.swing)}pp</strong>`:'藍綠得票率差 Swing <strong>—</strong>';
    $('#archive-compare-detail').innerHTML=`<strong>${esc(name)}</strong>　${headline}${r.flip?'　·　勝方政黨翻轉':''}<div class="archive-compare-detail-grid"><div class="archive-compare-detail-cell"><span>${compareA} 勝方</span><b>${esc(wA?.president||'—')} · ${esc(wA?.party||'')}</b></div><div class="archive-compare-detail-cell"><span>${compareB} 勝方</span><b>${esc(wB?.president||'—')} · ${esc(wB?.party||'')}</b></div><div class="archive-compare-detail-cell"><span>DPP 得票率</span><b>${pct(r.dA)} → ${pct(r.dB)}${dDelta==null?'':` (${signed(dDelta)}pp)`}</b></div><div class="archive-compare-detail-cell"><span>KMT 得票率</span><b>${pct(r.kA)} → ${pct(r.kB)}${kDelta==null?'':` (${signed(kDelta)}pp)`}</b></div></div>${swingOK?'':'<div class="archive-compare-na">此年份組合不具完整 DPP/KMT 雙方資料，因此不計算藍綠差距 Swing。</div>'}`;
    styleComparisonMaps();
    document.querySelectorAll('.archive-flip').forEach(b=>b.classList.toggle('selected',normalize(b.dataset.county)===name));
  }

  function syncBaseCountyNames(){document.querySelectorAll('#map path.county').forEach(p=>{const n=featureName(p.__data__);if(n)p.dataset.county=n})}
  function mapPaths(){syncBaseCountyNames();return [...document.querySelectorAll('#map path.county,#mobile-map path.archive-county')]}
  function clearCompareState(p){delete p.dataset.compareFlip;delete p.dataset.compareMuted;delete p.dataset.compareSelected;p.classList.remove('archive-flipped','archive-compare-muted','archive-compare-selected')}
  function styleComparisonMaps(){
    if(!compareActive)return;
    mapPaths().forEach(p=>{
      const name=normalize(p.dataset.county||featureName(p.__data__)),r=compareRow(name);if(!r)return;
      p.style.fill=partyColor(r.pB);p.dataset.compareFlip=String(r.flip);p.dataset.compareMuted=String(!r.flip);p.dataset.compareSelected=String(compareSelection===name);
    });
  }
  function restoreMaps(){
    mapPaths().forEach(p=>{clearCompareState(p);p.style.opacity='';p.style.stroke='';p.style.strokeWidth='';p.style.filter=''});
    if(typeof window.paintMap==='function')window.paintMap();renderMobileMap();
  }
  function updateMapStatus(){
    const heading=$('#map-heading');if(heading)heading.textContent=`${compareA} → ${compareB} 縣市比較`;
    const s=$('#map-status');if(!s)return;
    s.innerHTML=`<b>比較模式。</b> 地圖顯示 ${compareB} 勝方色；金色外框表示相較 ${compareA} 勝方政黨翻轉。點擊縣市查看兩屆得票率變化。`;
  }
  function setCompare(on){
    compareActive=!!on;compareSelection=null;document.body.classList.toggle('archive-comparing',compareActive);
    const btn=$('#archive-compare-toggle'),drawer=$('#archive-compare-drawer');btn?.classList.toggle('on',compareActive);btn?.setAttribute('aria-expanded',String(compareActive));drawer?.classList.toggle('open',compareActive);
    if(compareActive){renderCompareSummary();styleComparisonMaps();updateMapStatus()}
    else{restoreMaps();if(typeof window.renderElection==='function')window.renderElection();applyElectedCards()}
  }

  function mobileSvg(){
    let svg=$('#mobile-map');if(svg)return svg;
    svg=document.createElementNS('http://www.w3.org/2000/svg','svg');svg.id='mobile-map';svg.setAttribute('role','img');svg.setAttribute('aria-label','台灣縣市選舉地圖，離島使用獨立框顯示');$('#map')?.insertAdjacentElement('afterend',svg);return svg;
  }
  function drawCountyPath(group,feature,projection,name){
    const d=window.d3.geoPath(projection)(feature),result=countyResult(currentYear(),name),party=result?winnerParty(currentYear(),result):'IND';
    const p=group.append('path').datum(feature).attr('class','archive-county').attr('data-county',name).attr('d',d).style('fill',result?partyColor(party):'#27231f');
    p.on('click',event=>{event.preventDefault();if(compareActive){showCompareDetail(name);return}if(typeof window.renderCounty==='function')window.renderCounty(name,result)});return p;
  }
  function renderMobileMap(){
    if(!window.d3||!window.topojson||!topology||!features.length||!matchMedia('(max-width:660px)').matches)return;
    const node=mobileSvg(),panel=$('.map-panel');if(!node||!panel)return;
    const rect=node.getBoundingClientRect(),w=Math.max(330,Math.round(rect.width||panel.clientWidth-8)),h=Math.max(360,Math.round(rect.height||panel.clientHeight-144));
    const svg=window.d3.select(node).attr('viewBox',`0 0 ${w} ${h}`);svg.selectAll('*').remove();
    const main=features.filter(f=>!ISLANDS.includes(featureName(f)));const mainProjection=window.d3.geoMercator().fitExtent([[w*.12,6],[w*.88,h*.72]],{type:'FeatureCollection',features:main});
    const mainG=svg.append('g');main.forEach(f=>drawCountyPath(mainG,f,mainProjection,featureName(f)));
    const gap=6,pad=8,boxW=(w-pad*2-gap*2)/3,boxY=h*.76,boxH=h*.22;
    ISLANDS.forEach((name,i)=>{const f=features.find(x=>featureName(x)===name);if(!f)return;const x=pad+i*(boxW+gap),g=svg.append('g');g.append('rect').attr('class','archive-inset-box').attr('x',x).attr('y',boxY).attr('width',boxW).attr('height',boxH).attr('rx',8);g.append('text').attr('class','archive-inset-label').attr('x',x+8).attr('y',boxY+13).text(name);const projection=window.d3.geoMercator().fitExtent([[x+12,boxY+22],[x+boxW-12,boxY+boxH-8]],f);drawCountyPath(g,f,projection,name)});
    if(compareActive)styleComparisonMaps();
  }

  function watchYear(){
    const years=$('#years');if(!years)return;
    years.addEventListener('click',()=>{if(compareActive)return;setTimeout(()=>{renderMobileMap();applyElectedCards()},90)},true);
    new MutationObserver(()=>{if(!compareActive)requestAnimationFrame(()=>{renderMobileMap();applyElectedCards()})}).observe(years,{subtree:true,attributes:true,attributeFilter:['class']});
  }
  function watchMap(){const map=$('#map');if(!map)return;new MutationObserver(()=>{syncBaseCountyNames();if(compareActive)requestAnimationFrame(styleComparisonMaps)}).observe(map,{childList:true,subtree:true})}

  async function init(){
    buildCompareUI();mobileSvg();watchYear();watchMap();watchElectedCards();
    try{
      const [n,c,t]=await Promise.all([
        fetch('../data/history/presidential.json').then(r=>{if(!r.ok)throw new Error('national');return r.json()}),
        fetch('../data/history/presidential-counties.json').then(r=>{if(!r.ok)throw new Error('counties');return r.json()}),
        fetch('../data/counties.json').then(r=>{if(!r.ok)throw new Error('topology');return r.json()}),
      ]);
      national=n;counties=c;topology=t;const object=topology.objects[Object.keys(topology.objects)[0]];features=window.topojson.feature(topology,object).features;
      configureCompare();syncBaseCountyNames();renderMobileMap();applyElectedCards();
      addEventListener('resize',()=>{clearTimeout(resizeTimer);resizeTimer=setTimeout(renderMobileMap,120)},{passive:true});
    }catch(err){console.error('archive enhancements failed',err);const b=$('#archive-compare-toggle');if(b)b.disabled=true;}
  }
  if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',init,{once:true});else init();
})();