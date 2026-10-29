import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import test from 'node:test';
import * as cheerio from 'cheerio';
const read = name => fs.readFileSync(new URL('../' + name, import.meta.url), 'utf8');
const html = read('admin.html');

test('related websites manager and individual links start collapsed with ordering controls', () => {
  const $ = cheerio.load(html);
  assert.equal($('#observatory-manager').is('details'), true);
  assert.equal($('#observatory-manager').attr('open'), undefined);
  assert.equal($('#observatory-manager > summary').length, 1);
  const start = html.indexOf('    function renderObservatoryLinks()');
  const method = html.slice(start, html.indexOf('    function collectObservatoryLinks()', start));
  const escape = html.slice(html.indexOf('    function escapeHTML(value)'), html.indexOf('    function updateObservatoryOrder('));
  const box = { innerHTML: '' };
  const context = vm.createContext({ observatoryLinks: [{ n: '<script>測試連結</script>', cat: '分類', url: 'https://example.org', d: '第一行\n第二行' }], document: { getElementById: () => box }, window: { SourceOrder: { attach() {} } }, updateObservatoryOrder() {}, lucide: { createIcons() {} } });
  vm.runInContext(escape + method + ';renderObservatoryLinks()', context);
  const row = cheerio.load(box.innerHTML)('.obs-link-row');
  assert.equal(row.is('details.src-row'), true);
  assert.equal(row.attr('open'), undefined);
  assert.equal(row.find('script').length, 0);
  assert.equal(row.find('[data-source-drag]').length, 1);
  assert.equal(row.find('[data-source-move]').length, 2);
  assert.equal(row.find('textarea[data-field="d"]').text(), '第一行\n第二行');
});

test('saving and reloading keeps DOM order, edited fields and multiline descriptions', async () => {
  const expected = [
    { n: '觀察丙', cat: '公民科技', url: 'https://example.org/c', d: '第一行\n第二行' },
    { n: '觀察甲', cat: '官方資料', url: 'https://example.org/a', d: '未儲存編輯' },
    { n: '觀察乙', cat: '問政紀錄', url: 'https://example.org/b', d: '保留說明' },
  ];
  const rows = expected.map(item => ({ querySelector: selector => ({ value: item[selector.match(/data-field="([^"]+)"/)[1]] }) }));
  const status = {};
  let saved = [];
  const context = vm.createContext({ observatoryLinks: [], document: { querySelectorAll: selector => { assert.equal(selector, '#observatory-links-editor .obs-link-row'); return rows; }, getElementById: () => status }, renderObservatoryLinks() {}, apiFetch: async (path, options = {}) => {
    assert.equal(path, '/api/admin/observatory-links');
    if (options.method) { assert.equal(options.method, 'PUT'); saved = JSON.parse(options.body).links; }
    return { links: structuredClone(saved) };
  } });
  const start = html.indexOf('    function collectObservatoryLinks()');
  const methods = html.slice(start, html.indexOf('    window.loadContactSubmissions', start));
  vm.runInContext('window=globalThis;' + methods, context);
  await context.saveObservatoryLinks();
  assert.deepEqual(saved, expected);
  await context.loadObservatoryLinks();
  assert.deepEqual(context.observatoryLinks, expected);
});

test('related websites page renders managed links in the saved order', async () => {
  const box = { children: [], replaceChildren(...children) { this.children = children; } };
  const links = ['丙', '甲', '乙'].map(n => ({ n, cat: '測試', url: 'https://example.org/' + n, d: n }));
  const createElement = tagName => ({ tagName, children: [], append(...children) { this.children.push(...children); } });
  await vm.runInNewContext(read('related/links.js'), { URL, document: { getElementById: () => box, createElement }, fetch: async () => ({ ok: true, json: async () => ({ links }) }) });
  assert.deepEqual(box.children.map(card => card.href), links.map(link => new URL(link.url).href));
  assert.deepEqual(box.children.map(card => card.children[1].textContent), links.map(link => link.n));
});
