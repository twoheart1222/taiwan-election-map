import fs from 'node:fs';

const file = 'index.html';
let html = fs.readFileSync(file, 'utf8');

const before = `      if (o.candidates) g.properties.candidates = o.candidates;`;
const after = `      if (o.candidates) {
        // KV 後台資料可能比 data/*.json 舊。不要整包取代候選人，否則本地已驗證的
        // Facebook / Instagram / Threads / YouTube（以及新登記候選人）會被 null 或舊名單吃掉。
        const localCandidates = Array.isArray(g.properties.candidates) ? g.properties.candidates : [];
        const localByName = new Map(localCandidates.filter(c => c?.name).map(c => [c.name, c]));
        const mergedNames = new Set();
        const fallbackFields = ['facebook', 'instagram', 'threads', 'youtube', 'photoUrl', 'gazetteUrl', 'taiwanGoGoUrl'];

        g.properties.candidates = o.candidates.map(remote => {
          const local = localByName.get(remote?.name) || {};
          const merged = { ...local, ...remote };
          fallbackFields.forEach(field => {
            if (!merged[field] && local[field]) merged[field] = local[field];
          });
          if (merged.name) mergedNames.add(merged.name);
          return merged;
        });

        // 若 KV 尚未同步到最新登記名單，保留 data/*.json 裡的新候選人。
        localCandidates.forEach(local => {
          if (local?.name && !mergedNames.has(local.name)) g.properties.candidates.push(local);
        });
      }`;

if (!html.includes(before)) {
  if (html.includes('KV 後台資料可能比 data/*.json 舊')) {
    console.log('Candidate override merge fix is already applied.');
    process.exit(0);
  }
  throw new Error('Target _applyOverrides candidate replacement line not found; refusing unsafe patch.');
}

html = html.replace(before, after);
fs.writeFileSync(file, html, 'utf8');
console.log('Patched _applyOverrides to merge candidate records and preserve local social links.');
