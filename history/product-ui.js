(()=>{
  const body=document.body;
  if(!body)return;
  const isTown=/\/town(?:\.html)?\/?$/i.test(location.pathname);
  body.classList.add('history-product',isTown?'history-town':'history-archive');
  const reduce=matchMedia('(prefers-reduced-motion: reduce)').matches;
  const mobile=()=>matchMedia('(max-width:660px)').matches;
  const gs=()=>window.gsap;

  function buildMobileNav(){
    const nav=document.querySelector('.site-nav');
    if(!nav||nav.querySelector('.history-mobile-toggle'))return;
    const toggle=document.createElement('button');
    toggle.type='button';toggle.className='history-mobile-toggle';toggle.setAttribute('aria-expanded','false');toggle.setAttribute('aria-controls','history-mobile-menu');toggle.setAttribute('aria-label','開啟頁面選單');
    toggle.innerHTML='<span class="history-ham" aria-hidden="true"><i></i><i></i><i></i></span>';
    const menu=document.createElement('div');menu.id='history-mobile-menu';menu.className='history-mobile-menu';menu.setAttribute('aria-label','手機頁面選單');
    menu.innerHTML=`<a href="../#map">選舉地圖 <span aria-hidden="true">→</span></a><a class="on" href="./">歷年選舉 <span aria-hidden="true">→</span></a><a href="../#observatory">政治觀察 <span aria-hidden="true">→</span></a><a href="../#about">關於我們 <span aria-hidden="true">→</span></a>`;
    nav.append(toggle,menu);
    const setOpen=open=>{toggle.classList.toggle('open',open);menu.classList.toggle('open',open);toggle.setAttribute('aria-expanded',String(open));toggle.setAttribute('aria-label',open?'關閉頁面選單':'開啟頁面選單');};
    toggle.addEventListener('click',()=>setOpen(!menu.classList.contains('open')));
    document.addEventListener('pointerdown',e=>{if(!menu.contains(e.target)&&!toggle.contains(e.target))setOpen(false)});
    document.addEventListener('keydown',e=>{if(e.key==='Escape')setOpen(false)});
  }

  function buildNavTitle(){
    const nav=document.querySelector('.site-nav');if(!nav||nav.querySelector('.history-nav-title'))return;
    const context=document.createElement('span');context.className='history-nav-title';
    context.textContent=body.classList.contains('legislator-page')?'歷年選舉 · 立法委員':body.classList.contains('councilor-page')?'歷年選舉 · 縣市議員':body.classList.contains('local-executive-page')?'歷年選舉 · 縣市長':isTown?'歷年選舉 · 鄉鎮結果':'歷年選舉 · 總統';
    nav.insertBefore(context,nav.querySelector('.nav-right'));
  }

  function buildTransition(){
    let veil=document.querySelector('.history-transition');
    if(veil)return veil;
    veil=document.createElement('div');veil.className='history-transition';veil.setAttribute('aria-hidden','true');
    veil.innerHTML='<div class="history-transition-cols"><span></span><span></span><span></span><span></span><span></span></div><div class="history-transition-center"><div class="history-transition-kicker">FORMOSA OBSERVATORY / ARCHIVE</div><div class="history-transition-mask"><div class="history-transition-title">歷年選舉</div></div><div class="history-transition-rule"></div></div>';
    body.appendChild(veil);return veil;
  }

  function transitionLabel(url,anchor){
    if(anchor?.dataset?.historyTownDrilldown)return anchor.textContent.replace(/→/g,'').trim();
    const destination=new URL(url,location.href);
    if(!destination.pathname.includes('/history/')){
      if(destination.hash==='#observatory')return '政治觀察';
      if(destination.hash==='#about')return '關於我們';
      if(destination.hash==='#contact')return '聯絡我們';
      return '島民選舉地圖';
    }
    if(/legislator\.html/.test(url))return '立法委員';
    if(/councilor\.html/.test(url))return '縣市議員';
    if(/local-executive\.html/.test(url))return '縣市長';
    if(/town\.html/.test(url))return document.getElementById('crumb-county')?.textContent||'鄉鎮市區';
    return '歷年選舉';
  }

  function navigate(url,label='歷年選舉'){
    const commit=()=>{try{sessionStorage.setItem('historyTransition',JSON.stringify({label,ts:Date.now()}))}catch(_){}location.href=url};
    if(reduce){commit();return}
    const g=gs();if(!g){commit();return}
    const veil=buildTransition(),cols=[...veil.querySelectorAll('.history-transition-cols span')],title=veil.querySelector('.history-transition-title'),rule=veil.querySelector('.history-transition-rule');
    title.textContent=label;veil.style.display='block';
    const dur=mobile()?.48:.52;
    g.killTweensOf([...cols,title,rule]);
    g.set(cols,{yPercent:110});g.set(title,{yPercent:120,autoAlpha:0});g.set(rule,{width:0});
    g.timeline({defaults:{ease:'power3.inOut'}})
      .to(cols,{yPercent:0,duration:dur,stagger:.035},0)
      .to(title,{yPercent:0,autoAlpha:1,duration:dur*.95,ease:'expo.out'},0)
      .to(rule,{width:mobile()?72:110,duration:dur*.72,ease:'power3.out'},dur*.46)
      .add(commit,dur*1.06);
  }

  function inboundTransition(){
    let state=null;try{state=JSON.parse(sessionStorage.getItem('historyTransition')||'null');sessionStorage.removeItem('historyTransition')}catch(_){}
    const release=()=>document.documentElement.classList.remove('history-transition-pending');
    if(!state||Date.now()-Number(state.ts||0)>5000||reduce){release();return false}
    const g=gs();if(!g){release();return false}
    const veil=buildTransition(),cols=[...veil.querySelectorAll('.history-transition-cols span')],title=veil.querySelector('.history-transition-title'),rule=veil.querySelector('.history-transition-rule');
    title.textContent=state.label||'歷年選舉';veil.style.display='block';
    g.set(cols,{yPercent:0});g.set(title,{yPercent:0,autoAlpha:1});g.set(rule,{width:mobile()?72:110});
    release();
    const dur=mobile()?.3:.42;
    const finish=()=>{veil.style.display='none'};
    const fallback=setTimeout(finish,1400);
    g.timeline({defaults:{ease:'power3.inOut'},onComplete:()=>{clearTimeout(fallback);finish()}})
      .to(title,{yPercent:-105,autoAlpha:0,duration:dur*.7,ease:'power2.in'},.04)
      .to(rule,{width:0,duration:dur*.5},.03)
      .to(cols,{yPercent:-110,duration:dur,stagger:.035},.12);
    return true;
  }

  function initialReveal(fromTransition){
    if(reduce)return;
    const g=gs();if(!g)return;
    const heroBits=[...document.querySelectorAll('.hero .kicker,.hero .crumb,.hero .hero-copy,.hero p,.archive-head .archive-breadcrumb,.archive-head .archive-intro,.archive-head .archive-year-nav,.local-hero .kicker,.local-hero p,.local-hero .archive-year-nav')];
    const headings=[...document.querySelectorAll('.hero h1,.archive-head h1,.local-hero h1')];
    const panels=[...(isTown?document.querySelectorAll('.map-panel,.side'):document.querySelectorAll('.map-panel,.result-panel'))];
    g.set(heroBits,{willChange:'transform,opacity'});g.set(headings,{willChange:'transform,opacity'});g.set(panels,{willChange:'transform,opacity'});
    const timeline=g.timeline({delay:fromTransition?.22:.08,defaults:{ease:'power3.out'}});
    if(headings.length)timeline.fromTo(headings,{y:10,autoAlpha:.72},{y:0,autoAlpha:1,duration:.45,stagger:.04},0);
    if(heroBits.length)timeline.fromTo(heroBits,{y:22,autoAlpha:0},{y:0,autoAlpha:1,duration:.72,stagger:.07},0);
    if(panels.length)timeline.fromTo(panels,{y:18,autoAlpha:0},{y:0,autoAlpha:1,duration:.82,stagger:.08,ease:'expo.out'},.18);
    timeline.add(()=>{g.set([...heroBits,...headings,...panels],{clearProps:'willChange'})});
  }

  function animateReplacement(target,selector){
    if(!target||reduce)return;
    const g=gs();if(!g)return;
    requestAnimationFrame(()=>{
      const nodes=selector?[...target.querySelectorAll(selector)]:[...target.children];
      if(!nodes.length)return;
      g.fromTo(nodes,{y:10,autoAlpha:0},{y:0,autoAlpha:1,duration:.42,stagger:.045,ease:'power3.out',overwrite:true});
    });
  }

  function watchDynamic(){
    const candidateBox=document.getElementById('candidates');
    if(candidateBox)new MutationObserver(()=>animateReplacement(candidateBox,'.candidate')).observe(candidateBox,{childList:true});
    const county=document.getElementById('county-detail');
    if(county)new MutationObserver(()=>animateReplacement(county)).observe(county,{childList:true,subtree:false});
    const town=document.getElementById('town-detail');
    if(town)new MutationObserver(()=>animateReplacement(town)).observe(town,{childList:true,subtree:false});
  }

  function enhanceYearSwitch(){
    const years=document.getElementById('years');if(!years)return;
    years.addEventListener('click',e=>{
      const btn=e.target.closest('.year-btn');if(!btn||reduce)return;
      const g=gs();if(!g)return;
      const targets=[document.querySelector('.map-panel'),document.querySelector('.result-panel')].filter(Boolean);
      g.to(targets,{autoAlpha:.5,y:5,duration:.12,ease:'power1.out',overwrite:true});
      setTimeout(()=>g.fromTo(targets,{autoAlpha:.56,y:7},{autoAlpha:1,y:0,duration:.46,ease:'power3.out',overwrite:true}),30);
      setTimeout(()=>btn.scrollIntoView({behavior:'smooth',block:'nearest',inline:'center'}),40);
    },true);
  }

  function animateContentChange(){
    if(reduce)return;
    const targets=[document.querySelector('.result-panel'),document.querySelector('.map-panel')].filter(Boolean);
    const g=gs();
    if(g){g.killTweensOf(targets);g.fromTo(targets,{autoAlpha:.42,y:14},{autoAlpha:1,y:0,duration:.58,stagger:.07,ease:'power3.out',overwrite:true});return}
    targets.forEach((target,index)=>target.animate([{opacity:.42,transform:'translateY(14px)'},{opacity:1,transform:'translateY(0)'}],{duration:520,delay:index*55,easing:'cubic-bezier(.16,1,.3,1)'}));
  }

  function enableElectionTypeRouting(){
    if(isTown||body.classList.contains('local-executive-page')||body.classList.contains('councilor-page'))return;
    const enable=()=>{
      const select=document.getElementById('archive-election-type');
      const option=select?.querySelector('option[value="local-executive"]');
      const legislator=select?.querySelector('option[value="legislator"]');
      if(!option||!legislator)return false;
      if(option.disabled)option.disabled=false;
      if(option.textContent!=='縣市長')option.textContent='縣市長';
      if(legislator.disabled)legislator.disabled=false;
      if(legislator.textContent!=='立法委員')legislator.textContent='立法委員';
      return true;
    };
    enable();
    const observer=new MutationObserver(()=>{if(enable())observer.disconnect()});
    observer.observe(document.documentElement,{childList:true,subtree:true});
    document.addEventListener('change',e=>{
      const select=e.target;
      if(!(select instanceof HTMLSelectElement)||select.id!=='archive-election-type'||!['local-executive','legislator'].includes(select.value))return;
      e.preventDefault();e.stopImmediatePropagation();
      const isLegislator=select.value==='legislator';
      const url=new URL(isLegislator?'./legislator.html':'./local-executive.html',location.href);url.search=isLegislator?'?type=legislator&year=2024&level=national':'?type=local-executive&year=2022&level=national';
      navigate(url.href,isLegislator?'立法委員':'縣市長');
    },true);
  }

  function interceptNavigation(){
    document.addEventListener('click',e=>{
      if(e.defaultPrevented||e.button!==0||e.metaKey||e.ctrlKey||e.shiftKey||e.altKey)return;
      const a=e.target.closest('a');if(!a)return;
      const href=a.getAttribute('href');if(!href||href.startsWith('#')||a.target==='_blank'||href.startsWith('http'))return;
      const url=new URL(a.href,location.href);
      if(url.origin!==location.origin)return;
      const isHistory=url.pathname.includes('/history/')||/\/history$/.test(url.pathname);
      const isHome=/\/(?:index\.html)?$/.test(url.pathname)&&['#map','#observatory','#about','#contact',''].includes(url.hash);
      if(!isHistory&&!isHome)return;
      e.preventDefault();navigate(url.href,transitionLabel(url.href,a));
    });
  }

  function navScroll(){
    const nav=document.querySelector('.site-nav');if(!nav)return;
    const update=()=>nav.classList.toggle('nav-scrolled',scrollY>12);update();addEventListener('scroll',update,{passive:true});
  }

  function mobileSafety(){
    const check=()=>{
      const overflow=document.documentElement.scrollWidth-document.documentElement.clientWidth;
      document.documentElement.dataset.horizontalOverflow=overflow>2?'true':'false';
    };
    requestAnimationFrame(check);addEventListener('resize',check,{passive:true});setTimeout(check,800);
  }

  function buildMobileRegionPicker(){
    const title=document.querySelector('.map-title,.local-map-title');
    const panel=title?.closest('.map-panel,.local-map-panel');
    const source=document.querySelector('#president-area-select,#local-area-select,#councilor-area-select,#legislator-area-select');
    if(!title||!panel||!source||title.querySelector('.history-mobile-region-picker'))return;

    const copy=document.createElement('span');copy.className='history-map-title-copy';
    [...title.children].filter(child=>child.matches('small,strong')).forEach(child=>copy.appendChild(child));
    title.prepend(copy);
    const label=document.createElement('label');label.className='history-mobile-region-picker';
    label.innerHTML='<span>快速選擇縣市</span><select aria-label="快速選擇縣市"><option value="">選擇縣市</option></select>';
    title.appendChild(label);
    const select=label.querySelector('select');

    const optionMarkup=option=>`<option value="${option.value.replace(/&/g,'&amp;').replace(/"/g,'&quot;').replace(/</g,'&lt;')}">${option.textContent}</option>`;
    const syncOptions=()=>{const keep=select.value,options=[...source.options].filter(option=>option.value);select.innerHTML='<option value="">選擇縣市</option>'+options.map(optionMarkup).join('');select.value=options.some(option=>option.value===keep)?keep:''};
    syncOptions();
    new MutationObserver(syncOptions).observe(source,{childList:true,subtree:true});
    source.addEventListener('change',()=>{select.value=source.value||''});

    const compareActive=()=>body.classList.contains('archive-comparing')||body.classList.contains('local-compare-active')||body.classList.contains('compare-map-active');
    const resultTarget=()=>compareActive()?document.querySelector('#archive-compare-detail,#local-compare-detail'):document.querySelector('.archive-area-section,.councilor-area-section,#county-detail,#local-county-detail');
    const scrollToResult=()=>requestAnimationFrame(()=>requestAnimationFrame(()=>{const target=resultTarget();if(target)target.scrollIntoView({behavior:reduce?'auto':'smooth',block:'start'})}));

    select.addEventListener('change',()=>{const name=select.value;if(!name)return;dispatchEvent(new CustomEvent('history:regionselect',{detail:{name,mode:compareActive()?'compare':'single'}}));scrollToResult()});
    document.addEventListener('click',event=>{const region=event.target.closest?.('[data-county]')?.dataset?.county;if(region&&[...select.options].some(option=>option.value===region))select.value=region},true);
    document.querySelectorAll('#archive-mode-single,#archive-mode-compare,#local-mode-switch [data-mode]').forEach(button=>button.addEventListener('click',()=>{select.value=''}));
  }

  function interactiveFeedback(){
    if(reduce)return;
    const cardSelector='.overview-stat,.insight-card,.local-seat-card,.county-card,.county-summary,.archive-compare-stat,.local-compare-stat,.local-compare-detail,.paired-compare-chart,.councilor-district,.councilor-town-votes';
    const revealSelector='.archive-result-disclosure,.overview-stat,.insight-card,.local-seat-card,.councilor-area,.paired-compare-chart';
    const revealObserver='IntersectionObserver' in window?new IntersectionObserver(entries=>entries.forEach(entry=>{
      if(!entry.isIntersecting)return;
      entry.target.classList.add('history-in-view');
      revealObserver.unobserve(entry.target);
    }),{threshold:.08,rootMargin:'0px 0px -28px'}):null;
    body.classList.add('history-motion-ready');
    const enhance=root=>{
      const scope=root instanceof Element?root:document;
      const cards=[...(scope.matches?.(cardSelector)?[scope]:[]),...scope.querySelectorAll(cardSelector)];
      cards.forEach(card=>{
        if(card.classList.contains('history-interactive-card'))return;
        card.classList.add('history-interactive-card');
        card.addEventListener('pointermove',event=>{
          if(event.pointerType==='touch')return;
          const rect=card.getBoundingClientRect();
          card.style.setProperty('--history-spot-x',`${event.clientX-rect.left}px`);
          card.style.setProperty('--history-spot-y',`${event.clientY-rect.top}px`);
        },{passive:true});
      });
      const reveals=[...(scope.matches?.(revealSelector)?[scope]:[]),...scope.querySelectorAll(revealSelector)];
      reveals.forEach(item=>{
        if(item.classList.contains('history-reveal-item'))return;
        item.classList.add('history-reveal-item');
        if(revealObserver)revealObserver.observe(item);else item.classList.add('history-in-view');
      });
    };
    enhance(document);
    new MutationObserver(records=>records.forEach(record=>record.addedNodes.forEach(node=>{if(node instanceof Element)enhance(node)}))).observe(body,{childList:true,subtree:true});
    document.querySelectorAll('.map-panel,.local-map-panel').forEach(panel=>{
      panel.classList.add('history-map-atmosphere');
      panel.addEventListener('pointermove',event=>{
        if(event.pointerType==='touch')return;
        const rect=panel.getBoundingClientRect();
        panel.style.setProperty('--history-map-x',`${event.clientX-rect.left}px`);
        panel.style.setProperty('--history-map-y',`${event.clientY-rect.top}px`);
        panel.classList.add('pointer-active');
      },{passive:true});
      panel.addEventListener('pointerleave',()=>panel.classList.remove('pointer-active'));
    });
    document.addEventListener('pointerdown',event=>{
      const button=event.target.closest('.year-btn,.town-btn,.archive-segment button,.local-segment button,.local-layer-switch button,.archive-flip,.local-reset,.archive-query-reset,.local-inset');
      if(!button||event.pointerType==='touch'&&button.disabled)return;
      button.classList.add('history-ripple-host');
      const rect=button.getBoundingClientRect(),ripple=document.createElement('span');
      ripple.className='history-ripple';ripple.style.left=`${event.clientX-rect.left}px`;ripple.style.top=`${event.clientY-rect.top}px`;
      button.appendChild(ripple);setTimeout(()=>ripple.remove(),650);
    },{passive:true});
  }

  window.historyNavigate=navigate;
  addEventListener('history:contentchange',animateContentChange);
  buildNavTitle();buildMobileNav();buildTransition();watchDynamic();enhanceYearSwitch();enableElectionTypeRouting();interceptNavigation();navScroll();mobileSafety();buildMobileRegionPicker();interactiveFeedback();
  const fromTransition=inboundTransition();
  if(document.readyState==='complete')initialReveal(fromTransition);else addEventListener('load',()=>initialReveal(fromTransition),{once:true});
})();
