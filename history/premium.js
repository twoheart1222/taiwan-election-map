/* Premium interaction layer for every 歷年選舉 page.
   - Sliding segmented-control thumb
   - Count-up for key figures, draw-on turnout line, scroll reveal
   - Hovered map region is raised so its outline is never hidden (no glow) */
(()=>{
  const body=document.body;if(!body)return;
  const reduce=matchMedia('(prefers-reduced-motion: reduce)').matches;

  /* ---------- Segmented controls ---------- */
  const segs=new WeakSet();
  function placeThumb(seg,instant){
    const thumb=seg.querySelector(':scope>.pm-seg-thumb');if(!thumb)return;
    const on=seg.querySelector(':scope>button.on');
    if(!on||!on.offsetWidth){thumb.style.opacity='0';return}
    if(instant)thumb.classList.add('pm-instant');
    thumb.style.opacity='1';thumb.style.width=`${on.offsetWidth}px`;thumb.style.transform=`translateX(${on.offsetLeft}px)`;
    if(instant)requestAnimationFrame(()=>requestAnimationFrame(()=>thumb.classList.remove('pm-instant')));
  }
  function enhanceSeg(seg){
    if(segs.has(seg)||!seg.querySelector(':scope>button'))return;segs.add(seg);
    seg.classList.add('pm-seg');
    const thumb=document.createElement('span');thumb.className='pm-seg-thumb';thumb.setAttribute('aria-hidden','true');seg.prepend(thumb);
    placeThumb(seg,true);
    new MutationObserver(()=>placeThumb(seg,false)).observe(seg,{subtree:true,attributes:true,attributeFilter:['class'],childList:true});
    if('ResizeObserver' in window)new ResizeObserver(()=>placeThumb(seg,true)).observe(seg);
  }
  const scanSegs=root=>root.querySelectorAll?.('.archive-segment,.local-segment').forEach(enhanceSeg);

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
    const final=node.textContent;const token={};running.set(el,token);
    const dur=target>1000?1100:800,t0=performance.now();
    const step=t=>{
      if(running.get(el)!==token||!node.isConnected)return;
      const p=Math.min(1,(t-t0)/dur),e=1-Math.pow(1-p,4);
      node.textContent=p<1?`${m[1]}${fmt(target*e)}${m[3]}`:final;
      if(p<1)requestAnimationFrame(step);
    };
    requestAnimationFrame(step);
  }

  /* ---------- Reveal ---------- */
  const REVEAL_SEL='.insight-card,.party-vote-card,.overview-stat,.election-overview-stat,.local-seat-card,.county-card,.councilor-district,.paired-compare-chart,.local-compare-detail';
  const io='IntersectionObserver' in window?new IntersectionObserver(entries=>{
    entries.forEach(entry=>{
      if(!entry.isIntersecting)return;
      const el=entry.target;io.unobserve(el);
      if(el.classList.contains('pm-reveal'))requestAnimationFrame(()=>el.classList.add('pm-in'));
      el.querySelectorAll?.(COUNT_SEL).forEach(countUp);
      if(el.matches?.(COUNT_SEL))countUp(el);
    });
  },{rootMargin:'0px 0px -6% 0px',threshold:.08}):null;

  function reveal(el,i){
    if(reduce||!io)return;
    if(el.closest('.pm-reveal:not(.pm-in)'))return;
    const r=el.getBoundingClientRect();
    // Items already on screen only count up; items below the fold rise in as they arrive.
    if(r.top<innerHeight*.92&&r.bottom>0){el.querySelectorAll(COUNT_SEL).forEach(countUp);return}
    el.style.setProperty('--pm-d',`${Math.min(i,6)*55}ms`);el.classList.add('pm-reveal');io.observe(el);
  }

  function drawTrend(root){
    root.querySelectorAll?.('.trend-line:not([pathLength])').forEach(p=>p.setAttribute('pathLength','1'));
    root.querySelectorAll?.('.trend-point').forEach((g,i)=>g.style.setProperty('--pm-i',i));
  }

  function process(root){
    if(!(root instanceof Element))return;
    scanSegs(root);drawTrend(root);
    const groups=new Map();
    const list=[...(root.matches(REVEAL_SEL)?[root]:[]),...root.querySelectorAll(REVEAL_SEL)];
    list.forEach(el=>{const k=el.parentElement;const n=groups.get(k)||0;groups.set(k,n+1);reveal(el,n)});
    const counts=[...(root.matches(COUNT_SEL)?[root]:[]),...root.querySelectorAll(COUNT_SEL)].filter(el=>!el.closest(REVEAL_SEL));
    counts.forEach(el=>{const r=el.getBoundingClientRect();if(r.top<innerHeight&&r.bottom>0)countUp(el);else if(io)io.observe(el)});
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
      if(n.nodeType!==1||n.classList?.contains('pm-seg-thumb'))continue;
      pending.add(n);
    }
    if(pending.size&&!queued){queued=true;requestAnimationFrame(flush)}
  }).observe(body,{childList:true,subtree:true});
  const boot=()=>process(body);
  if(document.readyState==='loading')addEventListener('DOMContentLoaded',boot,{once:true});else boot();
})();
