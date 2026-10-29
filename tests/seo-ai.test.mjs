import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const text = (name) => fs.readFileSync(path.join(root, name), 'utf8');

function jsonLd(html) {
  return [...html.matchAll(/<script type="application\/ld\+json">([\s\S]*?)<\/script>/g)].map((match) => JSON.parse(match[1]));
}

test('homepage exposes a crawlable candidate index and discovery files', () => {
  const html = text('index.html');
  assert.match(html, /href="\/election\/"[^>]*>2026 全台候選人名單/);
  assert.match(html, /rel="sitemap"[^>]+href="\/sitemap\.xml"/);
  assert.match(html, /href="\/llms\.txt"/);
});

test('national candidate index gives visible direct answers and matching structured data', () => {
  const html = text('election/index.html');
  assert.match(html, /2026 地方選舉候選人有哪些？/);
  assert.match(html, /2026 縣市長登記參選人名單/);
  assert.match(html, /登記參選資料 \d{1,3}(?:,\d{3})+ 人次/);
  assert.match(html, /資格審查與抽籤/);

  const graphs = jsonLd(html);
  assert.ok(graphs.some((entry) => entry['@type'] === 'CollectionPage'));
  assert.ok(graphs.some((entry) => entry['@type'] === 'Dataset'));
  assert.ok(graphs.some((entry) => entry['@type'] === 'FAQPage'));
  const counties = graphs.find((entry) => entry['@type'] === 'ItemList' && entry.numberOfItems === 22);
  assert.equal(counties.itemListElement.length, 22);
});

test('all generated pages contain valid JSON-LD and canonical metadata', () => {
  const files = fs.readdirSync(path.join(root, 'election')).filter((name) => name.endsWith('.html'));
  assert.equal(files.length, 391);
  for (const file of files) {
    const html = text(path.join('election', file));
    assert.match(html, /<link rel="canonical" href="https:\/\/formosaobservatory\.com\/election\//, file);
    assert.ok(jsonLd(html).length >= 3, file);
  }
});

test('observatory articles publish source-linked totals and every county', () => {
  const mayor = JSON.parse(text('data/history/local-executive.json')).years;
  const council = JSON.parse(text('data/history/councilor.json')).years;
  const mayorTotal = year => Object.values(mayor[year].races).reduce((sum, race) => sum + race.candidates.length, 0);
  const pages = [
    ['mayor-candidates-2018-2022', [mayorTotal('2018'), mayorTotal('2022')]],
    ['councilor-candidates-2018-2022', [council['2018'].stats.candidateCount, council['2022'].stats.candidateCount]],
    ['councilor-turnout-2018-2022', [`${council['2018'].stats.turnout.toFixed(2)}%`, `${council['2022'].stats.turnout.toFixed(2)}%`]],
  ];
  for (const [slug, totals] of pages) {
    const html = text(`observatory/${slug}/index.html`);
    assert.equal((html.match(/<tr>/g) || []).length, 23, slug);
    assert.ok(html.includes('https://db.cec.gov.tw/ElecTable/Election'), slug);
    assert.ok(jsonLd(html).some(entry => entry['@type'] === 'Article'), slug);
    for (const total of totals) assert.ok(html.includes(Number.isInteger(total) ? total.toLocaleString('zh-TW') : total), `${slug}: ${total}`);
  }
});

test('sitemap and AI summaries expose current election and history entry points', () => {
  const sitemap = text('sitemap.xml');
  assert.equal((sitemap.match(/<url>/g) || []).length, 403);
  for (const page of ['/observatory/', '/observatory/mayor-candidates-2018-2022/', '/observatory/councilor-candidates-2018-2022/', '/observatory/councilor-turnout-2018-2022/', '/related/']) {
    assert.ok(sitemap.includes(`https://formosaobservatory.com${page}`), page);
  }
  assert.match(sitemap, /https:\/\/formosaobservatory\.com\/history\/legislator/);
  assert.match(sitemap, /https:\/\/formosaobservatory\.com\/history\/local-executive</);
  assert.match(sitemap, /https:\/\/formosaobservatory\.com\/history\/councilor/);
  assert.match(sitemap, /https:\/\/formosaobservatory\.com\/history\/town</);

  for (const file of ['llms.txt', 'llms-full.txt']) {
    const summary = text(file);
    assert.match(summary, /2026 地方選舉/);
    assert.match(summary, /縣市首長/);
    assert.match(summary, /中央選舉委員會/);
  }
});
