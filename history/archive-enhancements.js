(()=>{
  if(!document.body||/town\.html$/i.test(location.pathname))return;
  const COLORS={DPP:'#2daf5d',KMT:'#3b82f6',TPP:'#28c4c7',PFP:'#f59e0b',NP:'#f6c945',IND:'#9b948a'};
  const ISLANDS=['澎湖縣','金門縣','連江縣'];
  const $=s=>document.querySelector(s);
  const normalize=v=>String(v||'').replaceAll('台','臺').replace(/\s+/g,'').trim();
  const fmt=new Intl.NumberFormat('zh-TW');
  let national=null,counties=null,topology=null,features=[];
  let compareActive=false,compareSelection=null,resizeTimer=null;

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
  function signed(v,digits=2){if(v==null||!Number.isFinite(v))return '—';return `${v>=0?'+':''}${v.toFixed(digits)}`}
  function partyColor(key){return COLORS[key]||COLORS.IND}
  function compareRow(name){
    const r20=countyResult(2020,name),r24=countyResult(2024,name);if(!r20||!r24)return null;
    const p20=winnerParty(2020,r20),p24=winnerParty(2024,r24);
    const m20=twoPartyMargin(2020,r20),m24=twoPartyMargin(2024,r24);
    return {name,r20,r24,p20,p24,flip:p20!==p24,swing:m20==null||m24==null?null:m24-m20,
      d20:shareForParty(2020,r20,'DPP'),d24:shareForParty(2024,r24,'DPP'),
      k20:shareForParty(2020,r20,'KMT'),k24:shareForParty(2024,r24,'KMT')};
  }
  function allComparisons(){
    const names=Object.keys(counties?.years?.['2024']?.counties||{});
    return names.map(compareRow).filter(Boolean);
  }

  function buildCompareUI(){
    const row=$('.toolbar-row');if(!row||$('#archive-compare-toggle'))return;
    const btn=document.createElement('button');btn.id='archive-compare-toggle';btn.type='button';btn.className='archive-compare-toggle';btn.setAttribute('aria-expanded','false');btn.textContent='2020 ↔ 2024';row.appendChild(btn);
    const drawer=document.createElement('section');drawer.id='archive-compare-drawer';drawer.className='archive-compare-drawer';drawer.setAttribute('aria-live','polite');
    drawer.innerHTML='<div class="archive-compare-head"><div><div class="archive-compare-kicker">ELECTION SHIFT / 跨屆比較</div><h2 class="archive-compare-title">2020 → 2024 縣市版圖變化</h2></div><div class="archive-compare-note">地圖以 2024 勝方色顯示；金框代表縣市勝方政黨與 2020 不同。Swing 定義為「DPP 得票率 − KMT 得票率」的跨屆差，單位為百分點。</div></div><div class="archive-compare-stats" id="archive-compare-stats"></div><div class="archive-flips" id="archive-flips" aria-label="勝方翻轉縣市"></div><div class="archive-compare-detail" id="archive-compare-detail">點擊地圖或翻轉縣市，查看兩屆得票率變化。</div>';
    document.querySelector('.toolbar')?.insertAdjacentElement('afterend',drawer);
    btn.addEventListener('click',()=>setCompare(!compareActive));
    $('#map')?.addEventListener('click',e=>{
      if(!compareActive)return;
      const p=e.target.closest('path.county');if(!p)return;
      e.preventDefault();e.stopImmediatePropagation();
      const name=normalize(p.dataset.county||featureName(p.__data__));if(name)showCompareDetail(name);
    },true);
  }

  function renderCompareSummary(){
    const rows=allComparisons(),flips=rows.filter(r=>r.flip);
    const strongest=[...rows].filter(r=>r.swing!=null).sort((a,b)=>Math.abs(b.swing)-Math.abs(a.swing))[0];
    const t20=Number(election(2020)?.turnout),t24=Number(election(2024)?.turnout),turnout=Number.isFinite(t20)&&Number.isFinite(t24)?t24-t20:null;
    $('#archive-compare-stats').innerHTML=`<div class="archive-compare-stat"><span>比較縣市</span><strong>${rows.length}</strong></div><div class="archive-compare-stat"><span>勝方政黨翻轉</span><strong>${flips.length}</strong></div><div class="archive-compare-stat"><span>最大藍綠差距位移</span><strong>${strongest?`${strongest.name} ${signed(strongest.swing,1)}pp`:'—'}</strong></div>`;
    $('#archive-flips').innerHTML=flips.map(r=>`<button type="button" class="archive-flip" data-county="${r.name}"><i style="background:${partyColor(r.p20)}"></i><span>${r.name}</span><b>→</b><i style="background:${partyColor(r.p24)}"></i></button>`).join('')||'<span class="archive-flip">本次沒有縣市勝方政黨翻轉</span>';
    $('#archive-flips').onclick=e=>{const b=e.target.closest('[data-county]');if(b)showCompareDetail(b.dataset.county)};
    const note=$('.archive-compare-note');if(note&&turnout!=null)note.textContent=`地圖以 2024 勝方色顯示；金框代表縣市勝方政黨與 2020 不同。Swing =（DPP−KMT 得票率差）2024 − 2020。全國投票率變化 ${signed(turnout)}pp。`;
    if(flips[0])showCompareDetail(flips[0].name);
  }

  function showCompareDetail(name){
    const r=compareRow(name);if(!r)return;compareSelection=name;
    const w20=winnerMeta(2020,r.r20),w24=winnerMeta(2024,r.r24);
    const dDelta=r.d20==null||r.d24==null?null:r.d24-r.d20,kDelta=r.k20==null||r.k24==null?null:r.k24-r.k20;
    $('#archive-compare-detail').innerHTML=`<strong>${name}</strong>　藍綠得票率差 Swing <strong>${signed(r.swing)}pp</strong>${r.flip?'　·　勝方政黨翻轉':''}<div class="archive-compare-detail-grid"><div class="archive-compare-detail-cell"><span>2020 勝方</span><b>${w20?.president||'—'} · ${w20?.party||''}</b></div><div class="archive-compare-detail-cell"><span>2024 勝方</span><b>${w24?.president||'—'} · ${w24?.party||''}</b></div><div class="archive-compare-detail-cell"><span>DPP 得票率</span><b>${r.d20?.toFixed(2)??'—'}% → ${r.d24?.toFixed(2)??'—'}% (${signed(dDelta)}pp)</b></div><div class="archive-compare-detail-cell"><span>KMT 得票率</span><b>${r.k20?.toFixed(2)??'—'}% → ${r.k24?.toFixed(2)??'—'}% (${signed(kDelta)}pp)</b></div></div>`;
    styleComparisonMaps();
    document.querySelectorAll('.archive-flip').forEach(b=>b.classList.toggle('selected',normalize(b.dataset.county)===name));
  }

  function syncBaseCountyNames(){
    document.querySelectorAll('#map path.county').forEach(p=>{const n=featureName(p.__data__);if(n)p.dataset.county=n});
  }
  function mapPaths(){syncBaseCountyNames();return [...document.querySelectorAll('#map path.county,#mobile-map path.archive-county')]}
  function clearCompareClasses(p){p.classList.remove('archive-flipped','archive-compare-muted','archive-compare-selected')}
  function styleComparisonMaps(){
    if(!compareActive)return;
    mapPaths().forEach(p=>{
      const name=normalize(p.dataset.county||featureName(p.__data__)),r=compareRow(name);if(!r)return;
      p.style.fill=partyColor(r.p24);
      p.classList.toggle('archive-flipped',r.flip);
      p.classList.toggle('archive-compare-muted',!r.flip);
      p.classList.toggle('archive-compare-selected',compareSelection===name);
    });
  }
  function restoreMaps(){
    mapPaths().forEach(p=>{clearCompareClasses(p);p.style.opacity='';p.style.stroke='';p.style.strokeWidth='';p.style.filter=''});
    if(typeof window.paintMap==='function')window.paintMap();
    renderMobileMap();
  }
  function setCompare(on){
    compareActive=!!on;compareSelection=null;
    document.body.classList.toggle('archive-comparing',compareActive);
    const btn=$('#archive-compare-toggle'),drawer=$('#archive-compare-drawer');
    btn?.classList.toggle('on',compareActive);btn?.setAttribute('aria-expanded',String(compareActive));drawer?.classList.toggle('open',compareActive);
    if(compareActive){renderCompareSummary();styleComparisonMaps();const s=$('#map-status');if(s)s.innerHTML='<b>比較模式。</b> 2024 勝方色＋金色外框表示相較 2020 勝方政黨翻轉；點擊縣市查看得票率變化。';}
    else{restoreMaps();if(typeof window.renderElection==='function')window.renderElection();}
  }

  function mobileSvg(){
    let svg=$('#mobile-map');if(svg)return svg;
    svg=document.createElementNS('http://www.w3.org/2000/svg','svg');svg.id='mobile-map';svg.setAttribute('role','img');svg.setAttribute('aria-label','台灣縣市選舉地圖，離島使用獨立框顯示');
    $('#map')?.insertAdjacentElement('afterend',svg);return svg;
  }
  function drawCountyPath(group,feature,projection,name){
    const d=window.d3.geoPath(projection)(feature),result=countyResult(currentYear(),name),party=result?winnerParty(currentYear(),result):'IND';
    const p=group.append('path').datum(feature).attr('class','archive-county').attr('data-county',name).attr('d',d).style('fill',result?partyColor(party):'#27231f');
    p.on('click',event=>{event.preventDefault();if(compareActive){showCompareDetail(name);return}if(typeof window.renderCounty==='function')window.renderCounty(name,result)});
    return p;
  }
  function renderMobileMap(){
    if(!window.d3||!window.topojson||!topology||!features.length||!matchMedia('(max-width:660px)').matches)return;
    const node=mobileSvg(),panel=$('.map-panel');if(!node||!panel)return;
    const rect=node.getBoundingClientRect(),w=Math.max(330,Math.round(rect.width||panel.clientWidth-8)),h=Math.max(360,Math.round(rect.height||panel.clientHeight-144));
    const svg=window.d3.select(node).attr('viewBox',`0 0 ${w} ${h}`);svg.selectAll('*').remove();
    const main=features.filter(f=>!ISLANDS.includes(featureName(f)));
    const mainProjection=window.d3.geoMercator().fitExtent([[w*.12,6],[w*.88,h*.72]],{type:'FeatureCollection',features:main});
    const mainG=svg.append('g');main.forEach(f=>drawCountyPath(mainG,f,mainProjection,featureName(f)));
    const gap=6,pad=8,boxW=(w-pad*2-gap*2)/3,boxY=h*.76,boxH=h*.22;
    ISLANDS.forEach((name,i)=>{
      const f=features.find(x=>featureName(x)===name);if(!f)return;
      const x=pad+i*(boxW+gap),g=svg.append('g');g.append('rect').attr('class','archive-inset-box').attr('x',x).attr('y',boxY).attr('width',boxW).attr('height',boxH).attr('rx',8);
      g.append('text').attr('class','archive-inset-label').attr('x',x+8).attr('y',boxY+13).text(name);
      const projection=window.d3.geoMercator().fitExtent([[x+12,boxY+22],[x+boxW-12,boxY+boxH-8]],f);drawCountyPath(g,f,projection,name);
    });
    if(compareActive)styleComparisonMaps();
  }

  function watchYear(){
    const years=$('#years');if(!years)return;
    years.addEventListener('click',()=>{if(compareActive)return;setTimeout(renderMobileMap,90)},true);
    new MutationObserver(()=>{if(!compareActive)requestAnimationFrame(renderMobileMap)}).observe(years,{subtree:true,attributes:true,attributeFilter:['class']});
  }
  function watchMap(){
    const map=$('#map');if(!map)return;
    new MutationObserver(()=>{syncBaseCountyNames();if(compareActive)requestAnimationFrame(styleComparisonMaps)}).observe(map,{childList:true,subtree:true});
  }

  async function init(){
    buildCompareUI();mobileSvg();watchYear();watchMap();
    try{
      const [n,c,t]=await Promise.all([
        fetch('../data/history/presidential.json').then(r=>{if(!r.ok)throw new Error('national');return r.json()}),
        fetch('../data/history/presidential-counties.json').then(r=>{if(!r.ok)throw new Error('counties');return r.json()}),
        fetch('../data/counties.json').then(r=>{if(!r.ok)throw new Error('topology');return r.json()}),
      ]);
      national=n;counties=c;topology=t;const object=topology.objects[Object.keys(topology.objects)[0]];features=window.topojson.feature(topology,object).features;
      syncBaseCountyNames();renderMobileMap();
      addEventListener('resize',()=>{clearTimeout(resizeTimer);resizeTimer=setTimeout(renderMobileMap,120)},{passive:true});
    }catch(err){console.error('archive enhancements failed',err);const b=$('#archive-compare-toggle');if(b)b.disabled=true;}
  }
  if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',init,{once:true});else init();
})();
