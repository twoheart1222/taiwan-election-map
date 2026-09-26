/* Premium interaction layer for every 歷年選舉 page.
   Motion comes from /assets/ui/fo-motion.js (closed-form springs):
   - segmented controls get a liquid thumb (bound automatically by fo-motion)
   - key figures count up, bars grow, cards rise in — each a spring step response
   - hovered map region is raised so its outline is never hidden (no glow) */
(()=>{
  const body=document.body;if(!body)return;
  const M=window.FOMotion;
  const reduce=!M||M.reduce;
  const NUMBER={w:9,z:1},RISE={w:15,z:.9},GROW={w:12,z:.95};

  // One spring job per element; value(t) is a pure function of time.
  function animate(el,preset,delay,apply,done){
    if(reduce){apply(1);done&&done();return}
    const s=new M.Spring(0),t0=performance.now()/1000+(delay||0);s.to(1,preset,t0);
    apply(0);
    M.run(t=>{if(!el.isConnected)return false;apply(Math.max(0,s.value(t)));if(s.settled(t)){apply(1);done&&done();return false}});
  }

  /* ---------- Count-up ---------- */
  const COUNT_SEL='.party-vote-card>b,.overview-stat strong,.election-overview-stat strong,.meta-stats strong,.local-head-stat strong,.local-seat-card>strong,.cand-votes,.local-vote';
  const NUM=/^(\s*)([\d,]+(?:\.\d+)?)(%?\s*)$/;
  const running=new WeakMap();
  function countUp(el){
    if(reduce)return;
    const node=[...el.childNodes].find(n=>n.nodeType===3&&n.textContent.trim());if(!node)return;
    const m=node.textContent.match(NUM);if(!m)return;
    const target=Number(m[2].replace(/,/g,''));if(!Number.isFinite(target)||target===0)return;
    const decimals=(m[2].split('.')[1]||'').length,grouped=m[2].includes(',');
    const fmt=v=>grouped?v.toLocaleString('en-US',{minimumFractionDigits:decimals,maximumFractionDigits:decimals}):v.toFixed(decimals);
    const final=node.textContent,token={};running.set(el,token);
    animate(el,NUMBER,0,p=>{if(running.get(el)!==token||!node.isConnected)return;node.textContent=p>=1?final:`${m[1]}${fmt(Math.min(target,target*p))}${m[3]}`},()=>{if(running.get(el)===token)node.textContent=final});
  }

  /* ---------- Bars ---------- */
  const BAR_SEL='.bar>i,.local-bar>i,.local-bar i,.paired-chart-track i,.councilor-chart-track i';
  function grow(bar,i){if(bar._pmGrown)return;bar._pmGrown=true;animate(bar,GROW,Math.min(i,8)*.04,p=>{bar.style.scale=p>=1?'':`${Math.min(1.004,p).toFixed(4)} 1`})}

  /* ---------- Reveal ---------- */
  const REVEAL_SEL='.insight-card,.party-vote-card,.overview-stat,.election-overview-stat,.local-seat-card,.county-card,.councilor-district,.paired-compare-chart,.local-compare-detail';
  function rise(el,i){
    animate(el,RISE,Math.min(i,6)*.05,p=>{el.style.opacity=p>=1?'':String(Math.min(1,p*1.4).toFixed(3));el.style.translate=p>=1?'':`0 ${((1-p)*14).toFixed(2)}px`});
    el.querySelectorAll(COUNT_SEL).forEach(countUp);if(el.matches(COUNT_SEL))countUp(el);
    el.querySelectorAll(BAR_SEL).forEach(grow);
  }
  const pendingRise=new WeakMap();
  const io='IntersectionObserver' in window?new IntersectionObserver(entries=>{
    entries.forEach(entry=>{
      if(!entry.isIntersecting)return;const el=entry.target;io.unobserve(el);
      if(pendingRise.has(el)){rise(el,pendingRise.get(el));pendingRise.delete(el)}
      else{if(el.matches(COUNT_SEL))countUp(el);el.querySelectorAll?.(COUNT_SEL).forEach(countUp)}
    });
  },{rootMargin:'0px 0px -6% 0px',threshold:.08}):null;

  function reveal(el,i){
    if(reduce||!io)return;
    const r=el.getBoundingClientRect();
    if(r.top<innerHeight*.92&&r.bottom>0){el.querySelectorAll(COUNT_SEL).forEach(countUp);return}
    el.style.opacity='0';pendingRise.set(el,i);io.observe(el);
  }

  function drawTrend(root){
    root.querySelectorAll?.('.trend-line:not([pathLength])').forEach(p=>{
      p.setAttribute('pathLength','1');
      if(reduce)return;p.style.strokeDasharray='1';
      animate(p,{w:7,z:1},.1,v=>{p.style.strokeDashoffset=String(Math.max(0,1-v).toFixed(4));if(v>=1){p.style.strokeDasharray='';p.style.strokeDashoffset=''}});
    });
  }

  function process(root){
    if(!(root instanceof Element))return;
    drawTrend(root);
    const groups=new Map();
    const list=[...(root.matches(REVEAL_SEL)?[root]:[]),...root.querySelectorAll(REVEAL_SEL)];
    list.forEach(el=>{const k=el.parentElement;const n=groups.get(k)||0;groups.set(k,n+1);reveal(el,n)});
    const counts=[...(root.matches(COUNT_SEL)?[root]:[]),...root.querySelectorAll(COUNT_SEL)].filter(el=>!el.closest(REVEAL_SEL));
    counts.forEach(el=>{const r=el.getBoundingClientRect();if(r.top<innerHeight&&r.bottom>0)countUp(el);else if(io)io.observe(el)});
    const bars=[...(root.matches(BAR_SEL)?[root]:[]),...root.querySelectorAll(BAR_SEL)].filter(b=>!b.closest(REVEAL_SEL)||!pendingRise.has(b.closest(REVEAL_SEL)));
    bars.forEach(grow);
  }

  /* ---------- Map: raise hovered region (outline stays whole, no glow) ---------- */
  const MAP_SEL='.county,.local-county,.town,.archive-county,.paired-compare-maps path,.councilor-compare-maps path';
  document.addEventListener('pointerover',e=>{
    if(e.pointerType&&e.pointerType!=='mouse')return;
    const p=e.target.closest?.(MAP_SEL);if(!p||p.tagName!=='path')return;
    const parent=p.parentNode;if(parent&&parent.lastElementChild!==p)parent.appendChild(p);
  },{passive:true});

  /* ---------- Boot ---------- */
  let pending=new Set(),queued=false;
  const flush=()=>{queued=false;const roots=[...pending];pending=new Set();roots.forEach(r=>r.isConnected&&process(r))};
  new MutationObserver(records=>{
    for(const rec of records)for(const n of rec.addedNodes){
      if(n.nodeType!==1||n.classList?.contains('fo-liquid'))continue;
      pending.add(n);
    }
    if(pending.size&&!queued){queued=true;requestAnimationFrame(flush)}
  }).observe(body,{childList:true,subtree:true});
  // Map entrance: one rise per page load, spring-driven.
  function mapIn(){document.querySelectorAll('#map,#local-map').forEach(m=>animate(m,{w:11,z:.95},.12,p=>{m.style.opacity=p>=1?'':String(Math.min(1,p*1.25).toFixed(3));m.style.translate=p>=1?'':`0 ${((1-p)*10).toFixed(2)}px`}))}
  const boot=()=>{mapIn();process(body)};
  if(document.readyState==='loading')addEventListener('DOMContentLoaded',boot,{once:true});else boot();
})();
