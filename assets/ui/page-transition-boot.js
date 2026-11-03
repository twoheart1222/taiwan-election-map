// Run in the document head so the destination cannot paint before its incoming veil.
(() => {
  try {
    const state = JSON.parse(sessionStorage.getItem('historyTransition') || 'null');
    if (!state || Date.now() - Number(state.ts || 0) > 5000) return;
    if (state.destination && state.destination !== location.href) return;
    if (matchMedia('(prefers-reduced-motion: reduce)').matches) return;
    document.documentElement.classList.add('fo-transition-pending');
    // A failed or blocked transition script must never leave the page hidden.
    setTimeout(() => document.documentElement.classList.remove('fo-transition-pending'), 2500);
  } catch (_) {}
})();
