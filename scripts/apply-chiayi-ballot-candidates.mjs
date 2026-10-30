import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

// Present in the supplied 115/10/27 嘉義縣抽籤表, absent from the GitHub baseline.
// Existing candidates are retained for manual comparison in the admin.
const additions = [
  ['10010110012', '林正德'], ['10010030017', '楊麗玉'],
  ['10010060007', '陳文俊'], ['10010060007', '蘇緗瀅'],
  ['10010090010', '林秀汝'], ['10010100008', '翁盈盈'],
  ['10010130003', '張志峯'], ['10010130003', '張嘉樺'],
];
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
for (const [villageId, name] of additions) {
  const filename = path.join(root, `data/villages/villages-${villageId.slice(0, 8)}.json`);
  const topology = JSON.parse(fs.readFileSync(filename, 'utf8'));
  const village = topology.objects.map.geometries.find(g => g.properties.id === villageId)?.properties;
  if (!village) throw new Error(`Unknown village ${villageId}`);
  if ((village.candidates || []).some(c => c.name === name)) continue;
  village.candidates ||= [];
  village.candidates.push({ name, party: '無', role: village.name.endsWith('里') ? '里長候選人' : '村長候選人', registeredDate: '',
    gazetteUrl: null, facebook: null, instagram: null, threads: null, youtube: null, photoUrl: null });
  fs.writeFileSync(filename, JSON.stringify(topology) + '\n');
  console.log(`Added ${villageId} ${name}; retained existing candidates.`);
}
