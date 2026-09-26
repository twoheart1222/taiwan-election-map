(() => {
  const mount = () => {
    // The homepage has several views; donation/contact views do not get an ad.
    const footers = document.querySelectorAll('#view-map > footer, #view-observatory > footer, .brand-site-footer, .observatory-footer, body > main > footer');
    for (const footer of footers) {
      if (footer.previousElementSibling?.matches('[data-footer-ad]')) continue;
      const slot = document.createElement('aside');
      slot.dataset.footerAd = '';
      slot.setAttribute('aria-label', '廣告');
      slot.style.cssText = 'flex:none;width:100%;max-width:100%;box-sizing:border-box;overflow:hidden;background:#0d0d0d;padding:24px clamp(12px,4vw,54px);border-top:1px solid #26231f';
      slot.innerHTML = '<div style="max-width:1100px;margin:0 auto"><p style="margin:0 0 12px;color:#8a857c;font:600 11px/1.5 sans-serif;letter-spacing:.14em">廣告 / ADVERTISEMENT</p><iframe title="贊助廣告" loading="lazy" sandbox="allow-scripts allow-popups allow-popups-to-escape-sandbox" referrerpolicy="strict-origin-when-cross-origin" style="display:block;width:100%;height:320px;border:1px solid #302b25;border-radius:12px;background:#f4f1ea;box-sizing:border-box"></iframe></div>';
      footer.before(slot);
      const frame = slot.querySelector('iframe');
      // Hidden homepage views must not request advertising until opened and near the viewport.
      if ('IntersectionObserver' in window) {
        const observer = new IntersectionObserver(entries => {
          if (!entries.some(entry => entry.isIntersecting)) return;
          frame.src = '/ads/footer.html';
          observer.disconnect();
        }, { rootMargin: '300px' });
        observer.observe(slot);
      } else {
        frame.src = '/ads/footer.html';
      }
    }
  };
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', mount, { once: true });
  else mount();
})();
