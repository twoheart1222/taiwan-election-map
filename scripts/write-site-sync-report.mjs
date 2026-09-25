import fs from 'node:fs/promises';
import { execFileSync } from 'node:child_process';

const input = process.argv[2] || 'work/manual-site-sync/changes.tsv';
const output = process.argv[3] || 'data/site-sync-report.json';
const base = process.argv[4] || process.env.SITE_SYNC_BASE || 'HEAD';
let text = '';
if (input === '--git-diff') {
  try { text = execFileSync('git', ['diff', '--name-status', `${base}..HEAD`], { encoding: 'utf8' }); } catch (_) {}
} else {
  try { text = await fs.readFile(input, 'utf8'); } catch (_) {}
}
const changedFiles = text.trim().split('\n').filter(Boolean).map(line => {
  const [status, ...rest] = line.split('\t');
  return { status, path: rest.join('\t') };
}).filter(item => item.path !== output);
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

async function readJson(path) {
  try { return JSON.parse(await fs.readFile(path, 'utf8')); } catch (_) { return null; }
}

function readBaseJson(path) {
  try {
    return JSON.parse(execFileSync('git', ['show', `${base}:${path}`], { encoding: 'utf8' }));
  } catch (_) { return null; }
}

function personLabel(item) {
  return [item.city, item.district, item.name].filter(Boolean).join('・');
}

const contentSummary = [];
const changedPaths = new Set(changedFiles.map(item => item.path));

if (changedPaths.has('data/taiwangogo_links.json')) {
  const before = readBaseJson('data/taiwangogo_links.json') || { links: [] };
  const after = await readJson('data/taiwangogo_links.json') || { links: [] };
  const beforeIds = new Set((before.links || []).map(item => item.personId));
  const afterIds = new Set((after.links || []).map(item => item.personId));
  const added = (after.links || []).filter(item => !beforeIds.has(item.personId)).map(personLabel);
  const removed = (before.links || []).filter(item => !afterIds.has(item.personId)).map(personLabel);
  contentSummary.push({
    title: 'Taiwan GoGo 候選人名單',
    description: `候選人資料由 ${before.count ?? before.links?.length ?? 0} 筆更新為 ${after.count ?? after.links?.length ?? 0} 筆。`,
    added,
    removed,
  });
}

const historyFiles = changedFiles.filter(item => item.path.startsWith('data/history/')).map(item => item.path);
if (historyFiles.length) {
  const labels = [...new Set(historyFiles.map(path => {
    if (/legislator/i.test(path)) return '立法委員';
    if (/councilor/i.test(path)) return '縣市議員';
    if (/local-executive/i.test(path)) return '縣市首長';
    if (/president/i.test(path)) return '總統副總統';
    return '歷屆選舉';
  }))];
  contentSummary.push({ title: '中選會歷屆選舉資料', description: `重新核對並更新：${labels.join('、')}。` });
}

const villageFiles = changedFiles.filter(item => /^data\/(villages\/|towns\/|counties\.json|village_)/.test(item.path));
if (villageFiles.length) {
  contentSummary.push({ title: '村里與候選人資料', description: `重新核對候選人、村里長、照片與在任／轉任標記，共有 ${villageFiles.length} 組資料內容更新。` });
}

const electionPages = changedFiles.filter(item => /^election\//.test(item.path)).length;
const indexParts = [
  changedPaths.has('data/candidate_search.json') ? '候選人搜尋索引' : '',
  electionPages ? `${electionPages} 個選舉導覽頁` : '',
  changedPaths.has('sitemap.xml') ? '網站地圖' : '',
  [...changedPaths].some(path => /^llms/.test(path)) ? 'AI／搜尋引擎導覽資料' : '',
].filter(Boolean);
if (indexParts.length) {
  contentSummary.push({ title: '搜尋與公開頁面', description: `已依最新選舉資料重建${indexParts.join('、')}。` });
}

if (changedFiles.length && !contentSummary.length) {
  contentSummary.push({ title: '網站資料', description: '已完成資料核對與內容更新。' });
}
const report = {
  checkedAt: new Date().toISOString(),
  changed: changedFiles.length > 0,
  changedFiles,
  groups,
  contentSummary,
  sources: ['中央選舉委員會選舉資料庫', 'local2026.taiwangogo.tw', 'council2026.taiwangogo.tw'],
};
await fs.writeFile(output, `${JSON.stringify(report, null, 2)}\n`);
console.log(JSON.stringify(report, null, 2));
