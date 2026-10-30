import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import test from 'node:test';
import * as cheerio from 'cheerio';
const read = file => fs.readFileSync(new URL('../' + file, import.meta.url), 'utf8');
function setup({ reduced = false, throwingAnimation = false, blockedStorage = false, incoming = null } = {}) {
  const handlers = {}, events = {}, timers = new Map(), storage = new Map();
  if (incoming) storage.set('historyTransition', JSON.stringify(incoming));
  let timerId = 0;
  const assigned = [];
  const created = [];
  const make = () => ({ style: {}, textContent: '', classes: new Set(), classList: { add(name) { this.owner.classes.add(name); }, remove(name) { this.owner.classes.delete(name); }, contains() { return false; } }, setAttribute() {}, animate() { if (throwingAnimation) throw Error('animation failure'); return { finished: new Promise(() => {}), cancel() {} }; } });
  const node = () => { const n = make(); n.classList.owner = n; return n; };
  const overlay = node(), cols = Array.from({ length: 5 }, node), title = node(), rule = node(), kicker = node();
  overlay.querySelectorAll = () => cols;
  overlay.querySelector = selector => selector.endsWith('title') ? title : selector.endsWith('rule') ? rule : kicker;
  const document = { body: { appendChild: element => created.push(element), classList: { contains: () => false } }, createElement: () => overlay, addEventListener: (event, fn) => { handlers[event] = fn; }, querySelectorAll: () => [], documentElement: { classList: { remove() {} } } };
  const context = vm.createContext({ document, window: {}, URL, Element: { prototype: { animate() {} } }, matchMedia: q => ({ matches: q.includes('reduced') && reduced }), location: { href: 'https://example.org/about/', origin: 'https://example.org', pathname: '/about/', search: '', assign: url => assigned.push(url) }, sessionStorage: { getItem: key => { if (blockedStorage) throw Error('blocked'); return storage.get(key); }, removeItem: key => storage.delete(key), setItem: (key, value) => { if (blockedStorage) throw Error('blocked'); storage.set(key, value); } }, setTimeout: (fn, ms) => { timers.set(++timerId, { fn, ms }); return timerId; }, clearTimeout: id => timers.delete(id), addEventListener: (name, fn) => { events[name] = fn; } });
  vm.runInContext(read('assets/ui/page-transition.js'), context);
  const click = (href, options = {}) => {
    let prevented = false;
    const anchor = { href, target: '', textContent: '政治觀察', relList: { contains: () => false }, hasAttribute: () => false, querySelector: () => null, ...options.anchor };
    handlers.click({ button: 0, target: { closest: () => anchor }, preventDefault: () => { prevented = true; }, ...options.event });
    return prevented;
  };
  return { assigned, created, timers, storage, click, overlay, events };
}

test('shared navigation leaves external links, downloads, modifiers and same-page anchors native', () => {
  const app = setup();
  for (const href of ['https://other.org/about/', 'mailto:hello@example.org', 'https://example.org/data/test.json', 'https://example.org/about/#workflow']) assert.equal(app.click(href), false);
  assert.equal(app.click('https://example.org/observatory/', { anchor: { target: '_blank' } }), false);
  assert.equal(app.click('https://example.org/observatory/', { anchor: { hasAttribute: () => true } }), false);
  assert.equal(app.click('https://example.org/observatory/', { event: { ctrlKey: true } }), false);
  assert.equal(app.click('https://example.org/observatory/', { event: { defaultPrevented: true } }), false);
  assert.equal(app.created.length, 0);
});

test('outgoing veil has a navigation fallback and cannot commit twice', () => {
  const app = setup();
  assert.equal(app.click('https://example.org/observatory/'), true);
  assert.equal(app.overlay.classes.has('is-active'), true);
  assert.equal(app.click('https://example.org/history/'), true);
  const fallback = [...app.timers.values()].find(t => t.ms === 1000);
  fallback.fn(); fallback.fn();
  assert.deepEqual(app.assigned, ['https://example.org/observatory/']);
  const saved = JSON.parse(app.storage.get('historyTransition'));
  assert.equal(saved.label, '政治觀察');
  assert.equal(saved.destination, app.assigned[0]);
});

test('reduced motion, blocked storage and animation exceptions still allow navigation', () => {
  for (const options of [{ reduced: true }, { throwingAnimation: true }, { reduced: true, blockedStorage: true }]) {
    const app = setup(options);
    app.click('https://example.org/observatory/');
    assert.deepEqual(app.assigned, ['https://example.org/observatory/']);
  }
});

test('incoming veil expires, ignores stale state and resets on browser back', () => {
  const app = setup({ incoming: { ts: Date.now(), label: '關於我們', destination: 'https://example.org/about/' } });
  assert.equal(app.overlay.classes.has('is-active'), true);
  assert.equal(app.storage.has('historyTransition'), false);
  [...app.timers.values()].find(t => t.ms === 1100).fn();
  assert.equal(app.overlay.classes.has('is-active'), false);
  app.click('https://example.org/history/');
  app.events.pageshow({ persisted: true });
  assert.equal(app.overlay.classes.has('is-active'), false);
  assert.equal(app.click('https://example.org/observatory/'), true);
  const stale = setup({ incoming: { ts: Date.now() - 9000, label: '過期' } });
  assert.equal(stale.created.length, 0);
});

test('every public static directory and article loads the shared transition exactly once', () => {
  const election = fs.readdirSync(new URL('../election/', import.meta.url)).filter(f => f.endsWith('.html')).map(f => 'election/' + f);
  const files = [...election, 'index.html', 'privacy/index.html', 'about/index.html', 'related/index.html', 'observatory/index.html', ...['mayor-candidates-2018-2022','councilor-candidates-2018-2022','councilor-turnout-2018-2022'].map(slug => `observatory/${slug}/index.html`), ...['index','town','local-executive','councilor','legislator'].map(f => `history/${f}.html`)];
  for (const file of files) {
    const $ = cheerio.load(read(file));
    assert.equal($('script[src^="/assets/ui/page-transition.js"]').length, 1, file);
    assert.equal($('link[href^="/assets/ui/page-transition.css"]').length, 1, file);
  }
});
