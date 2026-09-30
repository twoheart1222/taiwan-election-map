(() => {
  const nav = document.querySelector('.directory-nav');
  if (!nav) return;
  const toggle = nav.querySelector('.directory-menu-toggle');
  const menu = nav.querySelector('.directory-mobile-menu');
  const mobile = matchMedia('(max-width:660px)');
  const setOpen = open => {
    toggle.classList.toggle('open', open);
    menu.classList.toggle('open', open);
    menu.inert = !open;
    toggle.setAttribute('aria-expanded', String(open));
    toggle.setAttribute('aria-label', open ? '關閉頁面選單' : '開啟頁面選單');
  };
  toggle.hidden = false;
  nav.classList.add('is-enhanced');
  toggle.addEventListener('click', () => setOpen(toggle.getAttribute('aria-expanded') !== 'true'));
  document.addEventListener('pointerdown', event => {
    if (!menu.contains(event.target) && !toggle.contains(event.target)) setOpen(false);
  });
  document.addEventListener('keydown', event => {
    if (event.key === 'Escape' && toggle.getAttribute('aria-expanded') === 'true') {
      setOpen(false);
      toggle.focus();
    }
  });
  menu.addEventListener('click', event => { if (event.target.closest('a')) setOpen(false); });
  mobile.addEventListener('change', () => setOpen(false));
  const target = new Date('2026-11-28T08:00:00+08:00').getTime();
  const updateCountdown = () => {
    const days = Math.floor(Math.max(0, target - Date.now()) / 86400000);
    nav.querySelector('#directory-days').textContent = String(days).padStart(3, '0');
    if (Date.now() >= target) {
      nav.querySelector('.directory-countdown-label').textContent = '2026 地方選舉已完成';
    }
  };
  updateCountdown();
  setInterval(updateCountdown, 60000);
})();
