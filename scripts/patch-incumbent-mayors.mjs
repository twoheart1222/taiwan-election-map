import fs from 'node:fs';

const file = 'data/counties.json';
const topo = JSON.parse(fs.readFileSync(file, 'utf8'));

const patches = {
  '09007': { county: '連江縣', name: '王忠銘', facebook: 'https://www.facebook.com/people/%E7%8E%8B%E5%BF%A0%E9%8A%98/100071514671190/' },
  '10008': { county: '南投縣', name: '許淑華', facebook: 'https://www.facebook.com/130771133668155' },
  '10013': { county: '屏東縣', name: '周春米', facebook: 'https://www.facebook.com/RiceChouChunMi' },
  '10017': { county: '基隆市', name: '謝國樑', facebook: 'https://www.facebook.com/hsieh.kuo.liang' },
  '10018': { county: '新竹市', name: '高虹安', facebook: 'https://www.facebook.com/DrAnnKao' },
  '63000': { county: '臺北市', name: '蔣萬安', facebook: 'https://www.facebook.com/chiangwanan' },
  '68000': { county: '桃園市', name: '張善政', facebook: 'https://www.facebook.com/SanCheng624' },
  '10005': { county: '苗栗縣', name: '鍾東錦', facebook: 'https://www.facebook.com/DongJinZhong' },
};

const geometries = topo?.objects?.map?.geometries;
if (!Array.isArray(geometries)) throw new Error('Unexpected counties.json structure: objects.map.geometries missing');

const found = [];
for (const geometry of geometries) {
  const props = geometry?.properties;
  const id = String(props?.id || '');
  const patch = patches[id];
  if (!patch) continue;

  if (props.name !== patch.county) {
    throw new Error(`County mismatch for ${id}: expected ${patch.county}, got ${props.name}`);
  }

  const candidates = Array.isArray(props.candidates) ? props.candidates : [];
  const candidate = candidates.find((row) => row?.name === patch.name);
  if (!candidate) throw new Error(`Candidate not found: ${patch.county} ${patch.name}`);

  candidate.isIncumbent = true;
  candidate.facebook = patch.facebook;
  found.push(`${patch.county}:${patch.name}`);
}

if (found.length !== Object.keys(patches).length) {
  const missing = Object.values(patches)
    .filter((p) => !found.includes(`${p.county}:${p.name}`))
    .map((p) => `${p.county}:${p.name}`);
  throw new Error(`Expected ${Object.keys(patches).length} incumbent candidates, found ${found.length}. Missing: ${missing.join(', ')}`);
}

fs.writeFileSync(file, JSON.stringify(topo), 'utf8');
console.log(`Patched ${found.length} incumbent mayor candidates:`);
for (const row of found) console.log(`- ${row}`);
