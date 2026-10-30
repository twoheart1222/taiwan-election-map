import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

// Present in the 115/10/27 draw, missing from the GitHub candidate baseline.
// Existing candidate records are retained for back-office review.
const additions = [
  ['66000150012', '曾銪寫'], // 后里區聯合里，PDF 第 24 頁；Markdown font mapping is corrupted.
  ['66000230014', '楊文慶'], // 烏日區北里里，PDF 第 32 頁。
  ['66000230014', '林耀南'],
];
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
for (const [villageId, name] of additions) {
  const townId = villageId.slice(0, 8);
  const filename = path.join(root, `data/villages/villages-${townId}.json`);
  const topology = JSON.parse(fs.readFileSync(filename, 'utf8'));
  const village = topology.objects.map.geometries.find(geometry => geometry.properties.id === villageId)?.properties;
  if (!village) throw new Error(`Unknown village ${villageId}`);
  if ((village.candidates || []).some(candidate => candidate.name === name)) continue;
  village.candidates ||= [];
  village.candidates.push({ name, party: '無', role: '里長候選人', registeredDate: '',
    gazetteUrl: null, facebook: null, instagram: null, threads: null, youtube: null, photoUrl: null });
  fs.writeFileSync(filename, JSON.stringify(topology) + '\n');
  console.log(`Added ${villageId} ${name}; preserved other candidates.`);
}
