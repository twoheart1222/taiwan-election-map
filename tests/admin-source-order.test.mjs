import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import test from 'node:test';
import * as cheerio from 'cheerio';
const read = name => fs.readFileSync(new URL('../' + name, import.meta.url), 'utf8');
function setup() {
  const emitter = () => ({ handlers: new Map(), addEventListener(type, fn) { if (!this.handlers.has(type)) this.handlers.set(type, new Set()); this.handlers.get(type).add(fn); }, removeEventListener(type, fn) { this.handlers.get(type)?.delete(fn); }, fire(type, event) { for (const fn of this.handlers.get(type) || []) fn(event); } });
  const document = emitter();
  const container = { ...emitter(), rows: [], querySelectorAll: () => container.rows.slice(), contains: handle => container.rows.some(row => row.handle === handle), insertBefore(row, before) { this.rows.splice(this.rows.indexOf(row), 1); this.rows.splice(before ? this.rows.indexOf(before) : this.rows.length, 0, row); }, appendChild(row) { this.insertBefore(row, null); } };
  container.rows = ['甲', '乙', '丙'].map(name => {
    const row = { name, value: name + '未儲存修改', open: name === '甲', classList: { add() {}, remove() {} }, getBoundingClientRect: () => ({ top: container.rows.indexOf(row) * 40, height: 40 }) };
    row.handle = { focus() {}, closest: () => row, hasAttribute: () => false };
    return row;
  });
  const context = vm.createContext({ document, window: { scrollBy() {}, innerHeight: 1000 } });
  vm.runInContext(read('admin-source-order.js'), context);
  let changes = 0;
  const api = context.SourceOrder;
  api.attach(container, () => changes++);
  const event = (handle, extra) => ({ target: { closest: () => handle }, preventDefault() {}, ...extra });
  return { api, document, container, event, names: () => container.rows.map(row => row.name), changes: () => changes };
}

test('reordering preserves unsaved values and drawer state without recreating nodes', () => {
  const { api, container, names } = setup();
  const row = container.rows[0];
  assert.equal(api.move(container, row, 2), true);
  assert.deepEqual(names(), ['乙', '丙', '甲']);
  assert.equal(container.rows[2], row);
  assert.equal(row.open, true);
  assert.equal(row.value, '甲未儲存修改');
  assert.equal(api.move(container, row, 99), false);
  api.move(container, row, -10);
  assert.deepEqual(names(), ['甲', '乙', '丙']);
});

test('pointer dragging and keyboard movement adjust one position and cancellation restores order', () => {
  const { document, container, event, names } = setup();
  const handle = container.rows[0].handle;
  document.fire('keydown', event(handle, { key: 'ArrowDown' }));
  assert.deepEqual(names(), ['乙', '甲', '丙']);
  document.fire('keydown', event(handle, { key: 'Home' }));
  container.fire('pointerdown', event(handle, { button: 0, clientY: 10 }));
  document.fire('pointermove', event(handle, { clientY: 130 }));
  assert.deepEqual(names(), ['乙', '丙', '甲']);
  document.fire('pointercancel', event(handle, {}));
  assert.deepEqual(names(), ['甲', '乙', '丙']);
  container.fire('pointerdown', event(handle, { button: 0, clientY: 10 }));
  document.fire('pointermove', event(handle, { clientY: 130 }));
  document.fire('pointerup', event(handle, {}));
  assert.deepEqual(names(), ['乙', '丙', '甲']);
});

test('rebinding source rows does not duplicate keyboard listeners', () => {
  const { api, container, document, event, names } = setup();
  api.attach(container, () => {});
  api.attach(container, () => {});
  document.fire('keydown', event(container.rows[0].handle, { key: 'ArrowDown' }));
  assert.deepEqual(names(), ['乙', '甲', '丙']);
});

test('source manager and individual source editors start collapsed', () => {
  const html = read('admin.html');
  const $ = cheerio.load(html);
  assert.equal($('#sources-manager').is('details'), true);
  assert.equal($('#sources-manager').attr('open'), undefined);
  assert.equal($('#sources-manager > summary').length, 1);
  const start = html.indexOf('    function renderSources()');
  const render = html.slice(start, html.indexOf('    function collectSources()', start));
  const box = { innerHTML: '' };
  const context = vm.createContext({ sourceItems: [{ n: '測試來源', url: 'https://example.com', note: '修改後仍保留' }], document: { getElementById: () => box }, escapeHTML: value => value || '', window: { SourceOrder: { attach() {} } }, updateSourceOrder() {}, lucide: { createIcons() {} } });
  vm.runInContext(render + ';renderSources()', context);
  const row = cheerio.load(box.innerHTML)('.src-row');
  assert.equal(row.is('details'), true);
  assert.equal(row.attr('open'), undefined);
  assert.equal(row.find('[data-source-drag]').length, 1);
  assert.equal(row.find('[data-source-move]').length, 2);
});

test('homepage renders sources in saved array order', async () => {
  const html = read('index.html');
  const method = html.slice(html.indexOf('  async _loadSources()'), html.indexOf('  // ---------- CONTACT'));
  const rendered = [];
  const items = ['丙', '甲', '乙'].map(n => ({ n, url: 'https://example.org/' + n, note: n }));
  const document = {
    querySelector: () => ({ replaceChildren: fragment => rendered.push(...fragment.childNodes) }),
    createDocumentFragment: () => ({ childNodes: [], appendChild(child) { this.childNodes.push(child); } }),
    createElement: () => ({}),
  };
  const app = vm.runInNewContext(`new class {${method}}`, { document, fetch: async () => ({ ok: true, json: async () => ({ items }) }) });
  await app._loadSources();
  assert.deepEqual(rendered.map(a => a.textContent), ['丙 ↗', '甲 ↗', '乙 ↗']);
});
