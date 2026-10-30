import assert from 'node:assert/strict';
import fs from 'node:fs';
import test from 'node:test';
import vm from 'node:vm';

for (const file of ['index.html', 'source/index.html']) {
  const html = fs.readFileSync(new URL('../' + file, import.meta.url), 'utf8');
  const start = html.indexOf('  _days(');
  const end = html.indexOf(file === 'index.html' ? '  _wireDrawerPlacement(' : '  // ---------- NAV / VIEWS', start);
  const methods = html.slice(start, end);
  function harness(instant) {
    let now = Date.parse(instant), nextId = 0;
    const timers = new Map(), events = {}, rendered = [];
    const document = { hidden: false, querySelectorAll: () => ['intro', 'nav'], addEventListener: (name, callback) => { events[name] = callback; } };
    const app = vm.runInNewContext(`new class {${methods}}`, {
      Date: { now: () => now }, document,
      window: { addEventListener: (name, callback) => { events[name] = callback; } },
      setTimeout: (callback, delay) => { const id = ++nextId; timers.set(id, { callback, delay }); return id; },
      clearTimeout: id => timers.delete(id),
    });
    app.target = Date.parse('2026-11-28T08:00:00+08:00');
    app._setReel = (el, days, animate) => rendered.push({ el, days, animate });
    return { app, timers, events, rendered, document, setTime: instant => { now = Date.parse(instant); } };
  }

  test(`${file}: countdown uses Taiwan calendar dates at midnight, with zero on election day`, () => {
    const { app } = harness('2026-10-30T20:54:00+08:00');
    assert.equal(app._days(), 29);
    for (const [instant, expected] of [
      ['2026-10-30T23:59:59.999+08:00', 29],
      ['2026-10-31T00:00:00+08:00', 28],
      ['2026-10-31T07:59:59+08:00', 28],
      ['2026-10-31T08:00:00+08:00', 28],
      ['2026-11-27T23:59:59.999+08:00', 1],
      ['2026-11-28T00:00:00+08:00', 0],
      ['2026-11-28T08:00:00+08:00', 0],
      ['2026-11-29T00:00:00+08:00', 0],
    ]) assert.equal(app._days(Date.parse(instant)), expected, instant);
    // The same instant on overseas devices produces the same Taiwan day count.
    assert.equal(app._days(Date.parse('2026-10-30T09:00:00-07:00')), 28);
    assert.equal(app._days(Date.parse('2026-10-30T16:00:00Z')), 28);
  });

  test(`${file}: an open page updates every countdown reel at Taiwan midnight`, () => {
    const h = harness('2026-10-30T23:59:59+08:00');
    h.app._watchCountdown();
    assert.equal(h.timers.size, 1);
    const timer = h.timers.get(h.app._countdownTimer);
    assert.equal(timer.delay, 1001);
    h.setTime('2026-10-31T00:00:00.001+08:00');
    timer.callback();
    assert.deepEqual(h.rendered, [{ el: 'intro', days: 28, animate: true }, { el: 'nav', days: 28, animate: true }]);
    assert.equal(h.timers.size, 1);
  });

  test(`${file}: returning from a suspended tab refreshes the countdown and rearms one timer`, () => {
    const h = harness('2026-10-30T20:00:00+08:00');
    h.app._watchCountdown();
    h.setTime('2026-11-01T10:00:00+08:00');
    h.document.hidden = true;
    h.events.visibilitychange();
    assert.equal(h.rendered.length, 0);
    h.document.hidden = false;
    h.events.visibilitychange();
    assert.equal(h.rendered.length, 2);
    assert.equal(h.rendered[0].days, 27);
    h.events.pageshow();
    assert.equal(h.rendered.length, 2);
    assert.equal(h.timers.size, 1);
    assert.match(html, /setTimeout\(\(\) => this\._setReel\(el, this\._days\(\), true\)/);
    assert.match(html, /this\._watchCountdown\(\);/);
  });
}
