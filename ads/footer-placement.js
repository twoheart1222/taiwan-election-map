(() => {
  const mount = () => {
    if (document.querySelector('[data-native-footer-ad]')) return;
    const footers = [...document.querySelectorAll('#view-map > footer, #view-observatory > footer, .brand-site-footer, .observatory-footer, body > main > footer')];
    if (!footers.length) return;
    // Replace the previous isolated iframe, including the static homepage slot.
    document.querySelectorAll('[data-footer-ad]').forEach(slot => slot.remove());
    const slot = document.createElement('aside');
    slot.dataset.footerAd = '';
    slot.dataset.nativeFooterAd = '';
    slot.setAttribute('aria-label', '廣告');
    slot.style.cssText = 'flex:none;width:100%;max-width:100%;box-sizing:border-box;overflow:hidden;background:#0d0d0d;padding:24px clamp(12px,4vw,54px);border-top:1px solid #26231f';
    const wrap = document.createElement('div');
    wrap.style.cssText = 'max-width:1100px;margin:0 auto;min-width:0';
    const label = document.createElement('p');
    label.textContent = '廣告 / ADVERTISEMENT';
    label.style.cssText = 'margin:0 0 12px;color:#8a857c;font:600 11px/1.5 sans-serif;letter-spacing:.14em';
    const container = document.createElement('div');
    container.id = 'container-640f7266bc095f61cfa2140a5b1cfcbe';
    container.style.cssText = 'width:100%;min-width:0;max-width:100%';
    wrap.append(label, container);
    slot.append(wrap);
    let started = false;
    const load = () => {
      if (started) return;
      started = true;
      const script = document.createElement('script');
      script.async = true;
      script.dataset.cfasync = 'false';
      script.src = 'https://pl31521852.profitableratecpmnetwork.com/640f7266bc095f61cfa2140a5b1cfcbe/invoke.js';
      script.onerror = () => { slot.style.display = 'none'; };
      wrap.append(script);
      // Empty inventory must not leave a large blank frame.
      setTimeout(() => {
        if (!container.childElementCount && !container.textContent.trim()) slot.style.display = 'none';
      }, 15000);
      new MutationObserver(() => {
        if (container.childElementCount || container.textContent.trim()) slot.style.removeProperty('display');
      }).observe(container, { childList: true, subtree: true, characterData: true });
    };
    const observer = 'IntersectionObserver' in window ? new IntersectionObserver(entries => {
      if (entries.some(entry => entry.isIntersecting)) { load(); observer.disconnect(); }
    }, { rootMargin: '300px' }) : null;
    // One vendor ID and one request per document, including homepage view changes.
    const place = () => {
      const footer = footers.find(item => item.getClientRects().length);
      if (!footer) return;
      if (footer.previousElementSibling !== slot) footer.before(slot);
      if (observer && !started) observer.observe(slot);
      else if (!observer) load();
    };
    place();
    for (const view of document.querySelectorAll('#view-map, #view-observatory')) {
      new MutationObserver(place).observe(view, { attributes: true, attributeFilter: ['style', 'class'] });
    }
  };
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', mount, { once: true });
  else mount();
})();
