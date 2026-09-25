import fs from 'node:fs/promises';

const input = process.argv[2] || 'work/manual-site-sync/changes.tsv';
const output = process.argv[3] || 'data/site-sync-report.json';
let text = '';
try { text = await fs.readFile(input, 'utf8'); } catch (_) {}
const changedFiles = text.trim().split('\n').filter(Boolean).map(line => {
  const [status, ...rest] = line.split('\t');
  return { status, path: rest.join('\t') };
});
const definitions = [
  ['歷屆選舉', path => path.startsWith('data/history/')],
  ['村里與候選人', path => /^data\/(villages\/|towns\/|counties\.json|village_|taiwangogo_)/.test(path)],
  ['搜尋與網站索引', path => /^(data\/candidate_search\.json|election\/|sitemap\.xml|llms)/.test(path)],
  ['其他資料', () => true],
];
const remaining = new Set(changedFiles.map(item => item.path));
const groups = [];
for (const [label, match] of definitions) {
  const files = [...remaining].filter(match);
  if (!files.length) continue;
  files.forEach(file => remaining.delete(file));
  groups.push({ label, files });
}
const report = {
  checkedAt: new Date().toISOString(),
  changed: changedFiles.length > 0,
  changedFiles,
  groups,
  sources: ['中央選舉委員會選舉資料庫', 'local2026.taiwangogo.tw', 'council2026.taiwangogo.tw'],
};
await fs.writeFile(output, `${JSON.stringify(report, null, 2)}\n`);
console.log(JSON.stringify(report, null, 2));
