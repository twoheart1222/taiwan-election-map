// 將 presidential-towns.json 與鄉鎮界線拆成每縣市一個檔案，供 history/town.html 使用。
// 鄉鎮頁一次只顯示一個縣市，原本卻要下載 2.8MB 的全台八屆資料與外部 CDN 的全台界線。
//
// 用法：
//   node scripts/build-history-towns.mjs                 # 從鎖定版本的 taiwan-atlas 下載界線
//   node scripts/build-history-towns.mjs --atlas <path>  # 使用本機的 towns-10t.json
import fs from 'node:fs/promises';
import path from 'node:path';
import process from 'node:process';

export const ATLAS_URL = 'https://cdn.jsdelivr.net/npm/taiwan-atlas@2021.9.20/towns-10t.json';

const ROOT = process.cwd();
const HISTORY = path.join(ROOT, 'data', 'history');
const OUT_DIR = path.join(HISTORY, 'towns');
const normalize = value => String(value ?? '').replaceAll('台', '臺').replace(/\s+/g, '').trim();
const assert = (ok, message) => { if (!ok) throw new Error(message); };

function arcIndices(geometry) {
  if (geometry.type === 'Polygon') return geometry.arcs.flat();
  if (geometry.type === 'MultiPolygon') return geometry.arcs.flat(2);
  throw new Error(`Unsupported geometry type ${geometry.type}`);
}

// 只保留該縣市用到的 arcs。arcs 以各自的 delta 編碼，取子集合不需重新量化。
function subsetTopology(atlas, geometries) {
  const used = [...new Set(geometries.flatMap(arcIndices).map(i => (i < 0 ? ~i : i)))].sort((a, b) => a - b);
  const remap = new Map(used.map((oldIndex, newIndex) => [oldIndex, newIndex]));
  const mapIndex = i => (i < 0 ? ~remap.get(~i) : remap.get(i));
  const rewrite = geometry => ({
    type: geometry.type,
    arcs: geometry.type === 'Polygon'
      ? geometry.arcs.map(ring => ring.map(mapIndex))
      : geometry.arcs.map(polygon => polygon.map(ring => ring.map(mapIndex))),
    properties: { TOWNNAME: normalize(geometry.properties.TOWNNAME), COUNTYNAME: normalize(geometry.properties.COUNTYNAME) },
  });
  return {
    type: 'Topology',
    transform: atlas.transform,
    arcs: used.map(i => atlas.arcs[i]),
    objects: { towns: { type: 'GeometryCollection', geometries: geometries.map(rewrite) } },
  };
}

async function loadAtlas() {
  const flag = process.argv.indexOf('--atlas');
  if (flag > -1) return JSON.parse(await fs.readFile(process.argv[flag + 1], 'utf8'));
  const response = await fetch(ATLAS_URL);
  assert(response.ok, `${response.status} ${ATLAS_URL}`);
  return response.json();
}

const readJson = file => fs.readFile(path.join(HISTORY, file), 'utf8').then(JSON.parse);
const [towns, counties, countyTopology, atlas] = await Promise.all([
  readJson('presidential-towns.json'),
  readJson('presidential-counties.json'),
  readJson('counties.topo.json'),
  loadAtlas(),
]);

const countyIds = Object.values(countyTopology.objects)[0].geometries.map(g => [g.properties.id, normalize(g.properties.name)]);
assert(countyIds.length === 22, `expected 22 counties, got ${countyIds.length}`);

await fs.rm(OUT_DIR, { recursive: true, force: true });
await fs.mkdir(OUT_DIR, { recursive: true });

let total = 0;
for (const [id, county] of countyIds) {
  const geometries = atlas.objects.towns.geometries.filter(g => String(g.properties.COUNTYCODE) === id);
  assert(geometries.length, `${county}: no township boundaries in atlas`);
  const boundaryNames = new Set(geometries.map(g => normalize(g.properties.TOWNNAME)));
  const years = {};
  for (const year of towns.coverage) {
    const results = towns.years[String(year)]?.counties?.[county];
    const summary = counties.years?.[String(year)]?.counties?.[county];
    assert(results && summary, `${year} ${county}: missing results`);
    for (const name of Object.keys(results)) assert(boundaryNames.has(name), `${year} ${county}: ${name} has no boundary`);
    years[String(year)] = { county: summary, towns: results };
  }
  const output = {
    schemaVersion: 1,
    countyId: id,
    county,
    coverage: towns.coverage,
    source: { results: 'data/history/presidential-towns.json', boundaries: ATLAS_URL },
    topology: subsetTopology(atlas, geometries),
    years,
  };
  const text = `${JSON.stringify(output)}\n`;
  total += text.length;
  await fs.writeFile(path.join(OUT_DIR, `${id}.json`), text);
}
console.log(`wrote ${countyIds.length} files to data/history/towns (${(total / 1024).toFixed(0)} KB total)`);
