// Shared full-page navigation, compatible with the existing home/archive veil.
(() => {
  const key = 'historyTransition';
  const reduce = () => matchMedia('(prefers-reduced-motion: reduce)').matches;
  const mobile = () => matchMedia('(max-width:660px)').matches;
  let busy = false;
  let overlay;
  let fallback;
  const animations = new Set();
  const supported = url => url.origin === location.origin && (/^\/(?:index\.html)?$/.test(url.pathname) || /^\/(?:about|privacy|related|observatory|election|history)(?:\/|$)/.test(url.pathname)) && !/\.(?:json|pdf|txt|xml|csv|png|jpe?g|webp|zip)$/i.test(url.pathname);
  function labelFor(url, anchor) {
    if (/^\/(?:index\.html)?$/.test(url.pathname)) return ({ '#about': '關於我們', '#support': '支持島民觀察室', '#contact': '聯絡我們', '#observatory': '政治觀察' })[url.hash] || '島民選舉地圖';
    if (url.pathname.startsWith('/privacy')) return '隱私權政策';
    if (url.pathname.startsWith('/about')) return '關於我們';
    if (url.pathname.startsWith('/related')) return '相關網站';
    if (/^\/observatory\/?$/.test(url.pathname)) return '政治觀察';
    if (url.pathname.startsWith('/history')) return '歷年選舉';
    if (/^\/election\/?$/.test(url.pathname)) return '全台候選人名單';
    const text = anchor?.querySelector('h2,h3,.bn-link-title')?.textContent || anchor?.textContent || '島民觀察室';
    return text.replace(/[↗↘→↑↓]/g, '').replace(/\s+/g, ' ').trim().slice(0, 80);
  }
  function build() {
    if (overlay) return overlay;
    overlay = document.createElement('div');
    overlay.className = 'fo-page-transition';
    overlay.setAttribute('aria-hidden', 'true');
    overlay.innerHTML = '<div class="fo-page-transition-cols"><span></span><span></span><span></span><span></span><span></span></div><div class="fo-page-transition-center"><div class="fo-page-transition-kicker">FORMOSA OBSERVATORY</div><div class="fo-page-transition-mask"><div class="fo-page-transition-title"></div></div><div class="fo-page-transition-rule"></div></div>';
    document.body.appendChild(overlay);
    return overlay;
  }
  function reset() {
    clearTimeout(fallback);
    for (const animation of animations) animation.cancel();
    animations.clear();
    overlay?.classList.remove('is-active');
    busy = false;
  }
  const animate = (element, frames, options) => {
    const animation = element.animate(frames, { fill: 'both', easing: 'cubic-bezier(.65,0,.35,1)', ...options });
    animations.add(animation);
    return animation.finished.catch(() => {});
  };
  function show(label, incoming) {
    const veil = build();
    veil.querySelector('.fo-page-transition-title').textContent = label;
    veil.querySelector('.fo-page-transition-kicker').textContent = incoming ? '抵達 / FORMOSA OBSERVATORY' : '前往 / FORMOSA OBSERVATORY';
    veil.classList.add('is-active');
    return { cols: [...veil.querySelectorAll('.fo-page-transition-cols span')], title: veil.querySelector('.fo-page-transition-title'), rule: veil.querySelector('.fo-page-transition-rule') };
  }
  function navigate(url, label) {
    if (busy) return;
    busy = true;
    let committed = false;
    const commit = () => {
      if (committed) return;
      committed = true;
      clearTimeout(fallback);
      try { sessionStorage.setItem(key, JSON.stringify({ label, ts: Date.now(), destination: url.href })); } catch (_) {}
      location.assign(url.href);
    };
    if (reduce() || !Element.prototype.animate) { commit(); return; }
    // Navigation must still happen if animation support throws or stalls.
    fallback = setTimeout(commit, 1000);
    try {
      const { cols, title, rule } = show(label, false);
      const duration = mobile() ? 480 : 520;
      const jobs = cols.map((col, i) => animate(col, [{ transform: 'translateY(110%)' }, { transform: 'translateY(0)' }], { duration, delay: i * 35 }));
      jobs.push(animate(title, [{ transform: 'translateY(120%)', opacity: 0 }, { transform: 'translateY(0)', opacity: 1 }], { duration }));
      jobs.push(animate(rule, [{ transform: 'scaleX(0)' }, { transform: 'scaleX(1)' }], { duration: duration * .72, delay: duration * .46 }));
      Promise.all(jobs).then(commit);
    } catch (_) { commit(); }
  }
  function inbound() {
    let state;
    try { state = JSON.parse(sessionStorage.getItem(key) || 'null'); sessionStorage.removeItem(key); } catch (_) {}
    if (!state || Date.now() - Number(state.ts || 0) > 5000 || reduce() || !Element.prototype.animate) return;
    if (state.destination && state.destination !== location.href) return;
    try {
      const { cols, title, rule } = show(String(state.label || '島民觀察室'), true);
      fallback = setTimeout(reset, 1100);
      const duration = mobile() ? 300 : 420;
      const jobs = cols.map((col, i) => animate(col, [{ transform: 'translateY(0)' }, { transform: 'translateY(-110%)' }], { duration, delay: 120 + i * 35 }));
      jobs.push(animate(title, [{ transform: 'translateY(0)', opacity: 1 }, { transform: 'translateY(-105%)', opacity: 0 }], { duration: duration * .7, delay: 40 }));
      jobs.push(animate(rule, [{ transform: 'scaleX(1)' }, { transform: 'scaleX(0)' }], { duration: duration * .5, delay: 30 }));
      Promise.all(jobs).then(reset);
    } catch (_) { reset(); }
  }
  document.addEventListener('click', event => {
    if (event.defaultPrevented || event.button !== 0 || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return;
    const anchor = event.target.closest('a[href]');
    if (!anchor || anchor.hasAttribute('download') || (anchor.target && anchor.target.toLowerCase() !== '_self') || anchor.relList.contains('external')) return;
    let url;
    try { url = new URL(anchor.href, location.href); } catch (_) { return; }
    if (!supported(url) || (url.pathname === location.pathname && url.search === location.search)) return;
    event.preventDefault();
    navigate(url, labelFor(url, anchor));
  });
  // Browser back/forward can restore a page while the outgoing veil was visible.
  addEventListener('pageshow', event => {
    if (!event.persisted) return;
    reset();
    document.querySelectorAll('.history-transition,#page-transition').forEach(veil => { veil.style.display = 'none'; });
    document.documentElement.classList.remove('history-transition-pending');
  });
  // The legacy home/archive scripts consume their own incoming state first.
  if (!window.__historyInbound && !document.body.classList.contains('history-product')) inbound();
})();
