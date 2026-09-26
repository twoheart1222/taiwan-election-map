/* Formosa Observatory — motion engine
   ---------------------------------------------------------------------------
   Every primary motion on the site is a closed-form damped-spring step
   response. A property that is retargeted several times is the SUM of one
   independent step response per retarget, so the value is always a pure
   function of time and velocity stays continuous between retargets.

     x(t) = base + Σ Δi · S(t − ti ; ωi, ζi)
     S(τ) = 1 − e^(−ζωτ) · ( cos(ωd τ) + (ζω/ωd) · sin(ωd τ) ),   ωd = ω√(1−ζ²)

   Character: fast, precise, slightly physical, ≤ ~1% overshoot.
   Components: liquid indicators (independent leading/trailing edges),
   drawer, disclosures, search-pill morph, press feedback, container scroll.
*/
(function () {
  if (window.FOMotion) return;
  const reduce = matchMedia('(prefers-reduced-motion: reduce)').matches;
  const now = () => performance.now() / 1000;

  // ---- presets: ω (rad/s), ζ ------------------------------------------------
  const P = {
    snap:  { w: 22, z: 0.86 },   // general UI
    lead:  { w: 27, z: 0.84 },   // leading edge of a liquid indicator
    trail: { w: 16, z: 0.93 },   // trailing edge (slower → temporary stretch)
    cross: { w: 21, z: 0.9 },    // vertical travel of an indicator
    panel: { w: 17, z: 0.92 },   // drawer / large surfaces
    size:  { w: 20, z: 0.9 },    // width / height morphs
    press: { w: 34, z: 0.72 },   // tactile press
    scroll:{ w: 13, z: 1 }       // container scroll (critically damped)
  };

  function step(tau, w, z) {
    if (tau <= 0) return 0;
    if (z >= 1) return 1 - Math.exp(-w * tau) * (1 + w * tau);
    const wd = w * Math.sqrt(1 - z * z), e = Math.exp(-z * w * tau);
    return 1 - e * (Math.cos(wd * tau) + (z * w / wd) * Math.sin(wd * tau));
  }
  const settleTime = (w, z) => 7 / (Math.min(z, 1) * w);

  class Spring {
    constructor(value) { this.base = value; this.target = value; this.segs = []; }
    to(target, preset = P.snap, t = now()) {
      if (reduce) { this.jump(target); return this; }
      const d = target - this.target;
      if (Math.abs(d) < 1e-4) return this;
      this.segs.push({ t0: t, d, w: preset.w, z: preset.z, end: t + settleTime(preset.w, preset.z) });
      this.target = target; return this;
    }
    jump(v) { this.base = v; this.target = v; this.segs.length = 0; return this; }
    value(t = now()) {
      let v = this.base;
      for (const s of this.segs) v += s.d * step(t - s.t0, s.w, s.z);
      return v;
    }
    settled(t = now()) {
      // fold finished responses into the base so the sum stays short
      const keep = [];
      for (const s of this.segs) { if (t >= s.end) this.base += s.d; else keep.push(s); }
      this.segs = keep; return keep.length === 0;
    }
  }

  // ---- single rAF ticker ------------------------------------------------------
  const jobs = new Set(); let raf = 0;
  function tick() {
    raf = 0; const t = now();
    for (const job of [...jobs]) { if (job(t) === false) jobs.delete(job); }
    if (jobs.size) raf = requestAnimationFrame(tick);
  }
  function run(job) { jobs.add(job); if (!raf) raf = requestAnimationFrame(tick); return job; }

  // ---- Liquid indicator -------------------------------------------------------
  // The pill under the active item has four springs (left/right/top/bottom).
  // Leading edge uses the fast preset, trailing edge the slower one, so the
  // pill stretches in the direction of travel and then converges.
  const liquids = new WeakMap();
  function liquid(container, opts) {
    if (!container || liquids.has(container)) return liquids.get(container);
    const o = Object.assign({ items: ':scope>button', active: el => el.classList.contains('on'), className: 'fo-liquid', mode: 'fill' }, opts);
    if (getComputedStyle(container).position === 'static') container.style.position = 'relative';
    container.classList.add('fo-liquid-host');
    const ind = document.createElement('span');
    ind.className = o.className; ind.setAttribute('aria-hidden', 'true');
    const S = { l: new Spring(0), r: new Spring(0), t: new Spring(0), b: new Spring(0) };
    let current = null, visible = false, job = null, own = false;

    const mount = () => { if (ind.parentNode !== container) { own = true; container.prepend(ind); } };
    const geom = el => {
      const c = container.getBoundingClientRect(), r = el.getBoundingClientRect();
      const x = r.left - c.left - container.clientLeft + container.scrollLeft, y = r.top - c.top - container.clientTop + container.scrollTop;
      return o.mode === 'underline' ? { l: x, r: x + r.width, t: y + r.height - 2, b: y + r.height } : { l: x, r: x + r.width, t: y, b: y + r.height };
    };
    const paint = t => {
      const l = S.l.value(t), r = S.r.value(t), tp = S.t.value(t), b = S.b.value(t);
      ind.style.transform = `translate3d(${l.toFixed(2)}px,${tp.toFixed(2)}px,0)`;
      ind.style.width = `${Math.max(0, r - l).toFixed(2)}px`;
      ind.style.height = `${Math.max(0, b - tp).toFixed(2)}px`;
    };
    const animate = () => { if (job) return; job = run(t => { paint(t); const done = [S.l, S.r, S.t, S.b].every(s => s.settled(t)); if (done) { paint(t); job = null; return false; } }); };

    function update(snap) {
      mount();
      const items = [...container.querySelectorAll(o.items)].filter(el => el !== ind && el.offsetParent !== null);
      const next = items.find(o.active) || null;
      if (!next) { ind.style.opacity = '0'; visible = false; current = null; return; }
      const g = geom(next);
      if (!g.r || snap || !visible || !current || !current.isConnected) {
        S.l.jump(g.l); S.r.jump(g.r); S.t.jump(g.t); S.b.jump(g.b); paint(now());
      } else {
        const t = now(), right = (g.l + g.r) > (S.l.target + S.r.target);
        S.l.to(g.l, right ? P.trail : P.lead, t); S.r.to(g.r, right ? P.lead : P.trail, t);
        const down = g.t > S.t.target;
        S.t.to(g.t, down ? P.trail : P.cross, t); S.b.to(g.b, down ? P.cross : P.trail, t);
        animate();
      }
      ind.style.opacity = '1'; visible = true; current = next;
    }
    let queued = false;
    const schedule = snap => { if (queued) return; queued = true; requestAnimationFrame(() => { queued = false; update(snap); }); };
    new MutationObserver(all => {
      const recs = all.filter(r => r.target !== ind && !(r.type === 'childList' && [...r.addedNodes, ...r.removedNodes].every(n => n === ind)));
      own = false;
      if (!recs.length) return;
      const structural = recs.some(r => r.type === 'childList' && [...r.removedNodes, ...r.addedNodes].some(n => n !== ind));
      schedule(structural && !current?.isConnected);
    }).observe(container, { subtree: true, childList: true, attributes: true, attributeFilter: ['class', 'style', 'aria-pressed', 'aria-current'] });
    if ('ResizeObserver' in window) new ResizeObserver(() => schedule(true)).observe(container);
    update(true);
    const api = { update, el: ind };
    liquids.set(container, api); return api;
  }

  // ---- Drawer ----------------------------------------------------------------
  const drawers = new WeakMap();
  function drawer(el, open) {
    if (!el) return;
    let st = drawers.get(el);
    if (!st) {
      const m = /translateX\((-?[\d.]+)%\)/.exec(el.style.transform || '');
      st = { s: new Spring(m ? +m[1] : 103), job: null }; drawers.set(el, st);
      el.style.transition = 'none';
    }
    st.s.to(open ? 0 : 103, P.panel);
    const paint = t => { el.style.transform = `translateX(${st.s.value(t).toFixed(3)}%)`; };
    if (reduce) { paint(now()); return; }
    if (!st.job) st.job = run(t => { paint(t); if (st.s.settled(t)) { paint(t); st.job = null; return false; } });
  }

  // ---- Container scroll (never scrolls the page) ----------------------------
  function scrollParent(el) {
    for (let p = el.parentElement; p && p !== document.body; p = p.parentElement) {
      const oy = getComputedStyle(p).overflowY;
      if ((oy === 'auto' || oy === 'scroll') && p.scrollHeight > p.clientHeight + 1) return p;
    }
    return null;
  }
  const scrolls = new WeakMap();
  function revealInContainer(el, block = 'center') {
    const box = scrollParent(el); if (!box) return false;
    const b = box.getBoundingClientRect(), r = el.getBoundingClientRect();
    let top = box.scrollTop + (r.top - b.top) - (block === 'center' ? (box.clientHeight - r.height) / 2 : 12);
    top = Math.max(0, Math.min(top, box.scrollHeight - box.clientHeight));
    let st = scrolls.get(box);
    if (!st) { st = { s: new Spring(box.scrollTop), job: null }; scrolls.set(box, st); }
    if (!st.job) st.s.jump(box.scrollTop);
    st.s.to(top, P.scroll);
    if (reduce) { box.scrollTop = top; return true; }
    if (!st.job) st.job = run(t => { box.scrollTop = st.s.value(t); if (st.s.settled(t)) { st.job = null; return false; } });
    return true;
  }

  // ---- Press feedback (uses the independent `scale` property) ----------------
  const PRESS = '.role-tab,.freq-btn,.crumb-btn,.search-result,.fo-btn,.mobile-county-option,.mobile-county-picker-toggle,.mobile-search-toggle,.mobile-menu-toggle,.history-mobile-toggle,.year-btn,.town-btn,.archive-segment>button,.local-segment>button,.local-flip-chip,.archive-flip,#drawer-close,#btn-back,.gazette-disclosure>summary,.map-label,#about a[href],.don-amt,[data-fo-press]';
  const pressed = new Map();
  function pressTo(el, v) {
    let st = pressed.get(el);
    if (!st) { st = { s: new Spring(1), job: null }; pressed.set(el, st); }
    st.s.to(v, P.press);
    if (!st.job) st.job = run(t => { el.style.scale = st.s.value(t).toFixed(4); if (st.s.settled(t)) { el.style.scale = st.s.target === 1 ? '' : String(st.s.target); st.job = null; if (st.s.target === 1) pressed.delete(el); return false; } });
  }
  if (!reduce) {
    document.addEventListener('pointerdown', e => {
      if (e.button !== 0) return;
      const el = e.target.closest?.(PRESS); if (!el || el.disabled) return;
      const big = el.getBoundingClientRect().width > 220;
      pressTo(el, big ? 0.985 : 0.955);
      if (e.pointerType === 'touch' && navigator.vibrate) { try { navigator.vibrate(6); } catch (_) {} }
      const release = () => { pressTo(el, 1); removeEventListener('pointerup', release, true); removeEventListener('pointercancel', release, true); };
      addEventListener('pointerup', release, true); addEventListener('pointercancel', release, true);
    }, { passive: true });
  }

  // ---- Disclosures: <details> height spring -----------------------------------
  const DETAILS = '#faq details,.gazette-disclosure,.archive-result-disclosure,.councilor-result-disclosure,.fo-details';
  document.addEventListener('click', e => {
    const summary = e.target.closest?.('summary'); if (!summary) return;
    const d = summary.parentElement; if (!d || d.tagName !== 'DETAILS' || !d.matches(DETAILS) || reduce) return;
    e.preventDefault();
    const st = d._fo || (d._fo = { s: new Spring(d.getBoundingClientRect().height), job: null });
    const from = d.getBoundingClientRect().height, closed = summary.getBoundingClientRect().height + (parseFloat(getComputedStyle(d).paddingTop) || 0) + (parseFloat(getComputedStyle(d).paddingBottom) || 0) + (parseFloat(getComputedStyle(d).borderTopWidth) || 0);
    const opening = !d.open || d.dataset.foClosing === '1';
    delete d.dataset.foClosing;
    let target;
    if (opening) { d.open = true; d.style.height = 'auto'; target = d.getBoundingClientRect().height; }
    else { target = closed; d.dataset.foClosing = '1'; }
    if (!st.job) st.s.jump(from);
    d.style.overflow = 'hidden'; d.style.height = `${from}px`;
    st.s.to(target, P.size);
    if (!st.job) st.job = run(t => {
      d.style.height = `${st.s.value(t)}px`;
      if (st.s.settled(t)) {
        st.job = null; d.style.height = ''; d.style.overflow = '';
        if (d.dataset.foClosing === '1') { delete d.dataset.foClosing; d.open = false; }
        return false;
      }
    });
  });

  // ---- Search pill morph (desktop hero) --------------------------------------
  function searchMorph(el) {
    if (!el || el._foMorph) return; el._foMorph = true;
    let last = el.getBoundingClientRect().width, st = { s: new Spring(last), job: null };
    if ('ResizeObserver' in window) new ResizeObserver(() => { if (!st.job) last = el.getBoundingClientRect().width; }).observe(el);
    new MutationObserver(() => {
      if (!matchMedia('(min-width:661px)').matches || reduce) return;
      const from = st.job ? st.s.value() : last;
      el.style.width = ''; const to = el.getBoundingClientRect().width;
      if (Math.abs(to - from) < 2) return;
      if (!st.job) st.s.jump(from);
      st.s.to(to, P.size); el.style.width = `${from}px`;
      if (!st.job) st.job = run(t => { el.style.width = `${st.s.value(t)}px`; if (st.s.settled(t)) { el.style.width = ''; last = el.getBoundingClientRect().width; st.job = null; return false; } });
    }).observe(el, { attributes: true, attributeFilter: ['class'] });
  }

  // ---- Auto-binding -----------------------------------------------------------
  const binders = [
    ['#role-tabs', el => liquid(el, { items: '.role-tab', className: 'fo-liquid fo-liquid--tab' })],
    ['.fo-navlinks', el => liquid(el, { items: '.navlink', className: 'fo-liquid fo-liquid--line', mode: 'underline' })],
    ['.fo-freq', el => liquid(el, { items: '.freq-btn', active: b => /228|e4022b/i.test(b.style.background || b.style.backgroundColor || ''), className: 'fo-liquid fo-liquid--tab' })],
    ['.archive-segment,.local-segment', el => { el.classList.add('pm-seg'); liquid(el, { items: ':scope>button', className: 'fo-liquid pm-seg-thumb' }); }],
    ['#candidate-search', searchMorph]
  ];
  function bindAll(root = document) {
    for (const [sel, fn] of binders) {
      if (root.matches?.(sel)) fn(root);
      root.querySelectorAll?.(sel).forEach(fn);
    }
  }
  function boot() {
    bindAll();
    new MutationObserver(recs => { for (const r of recs) for (const n of r.addedNodes) if (n.nodeType === 1 && !n.classList.contains('fo-liquid')) bindAll(n); })
      .observe(document.body, { childList: true, subtree: true });
    document.documentElement.classList.add('fo-motion');
  }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', boot, { once: true }); else boot();

  window.FOMotion = { Spring, P, step, run, liquid, drawer, revealInContainer, searchMorph, reduce };
})();
