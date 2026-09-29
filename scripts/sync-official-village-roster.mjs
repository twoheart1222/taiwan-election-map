import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const repo = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const [rosterArg, topologyDirArg, outputDirArg, ...flags] = process.argv.slice(2);
if (!rosterArg || !topologyDirArg || !outputDirArg) {
  throw new Error('Usage: node scripts/sync-official-village-roster.mjs <roster.json> <new-topology-dir> <output-dir> [--apply-base]');
}

const rosterPath = path.resolve(rosterArg);
const topologyDir = path.resolve(topologyDirArg);
const outputDir = path.resolve(outputDirArg);
const applyBase = flags.includes('--apply-base');
const villageDir = path.join(repo, 'data', 'villages');

const normalize = value => String(value || '')
  .normalize('NFKC')
  .replaceAll('台', '臺')
  .toLowerCase()
  .replace(/[^\p{L}\p{N}]/gu, '');
const aliases = value => {
  const text = String(value || '').normalize('NFKC');
  const han = text.match(/\p{Script=Han}+/gu) || [];
  return new Set([normalize(text), normalize([...han].sort((a, b) => b.length - a.length)[0])].filter(Boolean));
};
const intersects = (left, right) => [...left].some(value => right.has(value));
const cleanVillageName = value => String(value || '').replace(/\[([^\]]+)\]/g, '$1').trim();
const readJson = file => JSON.parse(fs.readFileSync(file, 'utf8'));
const objectOf = document => Object.values(document.objects || {})[0];
const realVillage = geometry => {
  const code = String(geometry?.properties?.VILLCODE || '');
  return /^\d{11}$/.test(code) && Boolean(String(geometry?.properties?.VILLNAME || '').trim());
};
const areaKeyAliases = new Map([
  ['新北市瑞芳區濂新里', '新北市瑞芳區濓新里'],
  ['新北市瑞芳區濂洞里', '新北市瑞芳區濓洞里'],
  ['新北市坪林區石曹里', '新北市坪林區石𥕢里'],
  ['臺南市新化區那拔里', '臺南市新化區𦰡拔里'],
  ['臺南市龍崎區石曹里', '臺南市龍崎區石𥕢里'],
  ['雲林縣水林鄉欍埔村', '雲林縣水林鄉瓊埔村'],
].map(([from, to]) => [normalize(from), normalize(to)]));
const officialAreaKey = value => areaKeyAliases.get(normalize(value)) || normalize(value);

const counties = objectOf(readJson(path.join(repo, 'data', 'counties.json'))).geometries;
const countyNames = new Map(counties.map(geometry => [String(geometry.properties.id), geometry.properties.name]));
const townNames = new Map();
for (const filename of fs.readdirSync(path.join(repo, 'data', 'towns')).filter(name => name.endsWith('.json'))) {
  for (const geometry of objectOf(readJson(path.join(repo, 'data', 'towns', filename))).geometries) {
    townNames.set(String(geometry.properties.id), geometry.properties.name);
  }
}

const official = readJson(rosterPath).records.filter(record => record.category === 'village');
if (official.length !== 14100) throw new Error(`Expected 14,100 official village candidates, received ${official.length.toLocaleString()}`);
const officialByArea = new Map();
for (const record of official) {
  if (!officialByArea.has(record.areaKey)) officialByArea.set(record.areaKey, []);
  officialByArea.get(record.areaKey).push(record);
}

const enrichCandidate = (record, currentCandidates, villageName) => {
  const match = currentCandidates.find(candidate => intersects(aliases(candidate.name), new Set(record.nameAliases || [])));
  const role = villageName.endsWith('村') ? '村長候選人' : '里長候選人';
  if (match) return {
    ...match,
    name: match.name,
    party: record.party,
    role,
    registeredDate: record.registeredDate,
  };
  return {
    name: record.name,
    party: record.party,
    role,
    registeredDate: record.registeredDate,
    gazetteUrl: null,
    facebook: null,
    instagram: null,
    threads: null,
    youtube: null,
    photoUrl: null,
    isIncumbent: false,
  };
};

const report = {
  source: path.basename(rosterPath),
  officialVillageCandidates: official.length,
  officialVillageAreas: officialByArea.size,
  currentVillageCandidates: 0,
  finalVillageCandidates: 0,
  addedVillageCandidates: 0,
  removedVillageCandidates: 0,
  addedVillageIds: [],
  removedVillageIds: [],
  renamedVillageIds: [],
  geometryUpdatedTowns: [],
  candidateUpdatedTowns: [],
  unmatchedOfficialAreas: [],
};
const matchedOfficialAreaKeys = new Set();
const writes = new Map();

for (const filename of fs.readdirSync(topologyDir).filter(name => name.endsWith('.json')).sort()) {
  const newPath = path.join(topologyDir, filename);
  const newDocument = readJson(newPath);
  const newObject = objectOf(newDocument);
  const newAllGeometries = newObject.geometries || [];
  const newGeometries = newAllGeometries.filter(realVillage);
  if (!newGeometries.length) continue;
  const townCode = String(newGeometries[0].properties.TOWNCODE || path.basename(filename, '.json'));
  const currentPath = path.join(villageDir, `villages-${townCode}.json`);
  if (!fs.existsSync(currentPath)) throw new Error(`Missing current town topology: ${path.relative(repo, currentPath)}`);
  const currentDocument = readJson(currentPath);
  const currentObject = objectOf(currentDocument);
  const currentById = new Map(currentObject.geometries.map(geometry => [String(geometry.properties.id), geometry]));
  const newIds = new Set(newGeometries.map(geometry => String(geometry.properties.VILLCODE)));
  const currentIds = new Set([...currentById.keys()].filter(id => /^\d{11}$/.test(id)));
  const addedIds = [...newIds].filter(id => !currentIds.has(id));
  const removedIds = [...currentIds].filter(id => !newIds.has(id));
  const namesChanged = newGeometries.filter(geometry => {
    const id = String(geometry.properties.VILLCODE);
    const current = currentById.get(id)?.properties?.name;
    return current != null && normalize(current) !== normalize(cleanVillageName(geometry.properties.VILLNAME));
  });
  const countyNameForTown = countyNames.get(townCode.slice(0, 5)) || '';
  const townNameForTown = townNames.get(townCode) || '';
  const newAreaKeys = new Set(newGeometries.map(geometry => officialAreaKey(
    `${geometry.properties.COUNTYNAME || countyNameForTown}${geometry.properties.TOWNNAME || townNameForTown}${cleanVillageName(geometry.properties.VILLNAME)}`,
  )));
  const protectedRemovedIds = removedIds.filter(id => {
    const villageName = currentById.get(id)?.properties?.name || '';
    const areaKey = officialAreaKey(`${countyNameForTown}${townNameForTown}${villageName}`);
    return officialByArea.has(areaKey) && !newAreaKeys.has(areaKey);
  });
  if (protectedRemovedIds.length && addedIds.length) {
    throw new Error(`Town ${townCode} has both newly added villages and official villages missing from the new geometry: ${protectedRemovedIds.join(', ')}`);
  }
  const useNewGeometry = !protectedRemovedIds.length && (addedIds.length > 0 || removedIds.length > 0 || namesChanged.length > 0);
  const targetDocument = useNewGeometry ? newDocument : currentDocument;
  const targetObject = objectOf(targetDocument);
  if (useNewGeometry) {
    targetDocument.objects = { map: targetObject };
    targetObject.geometries = newAllGeometries;
  }

  let candidatesChanged = false;
  for (const geometry of targetObject.geometries) {
    const sourceProperties = geometry.properties || {};
    const id = String(sourceProperties.VILLCODE || sourceProperties.id || '');
    if (!/^\d{11}$/.test(id)) {
      geometry.properties = { id, name: '', candidates: [] };
      continue;
    }
    const sourceName = cleanVillageName(sourceProperties.VILLNAME || sourceProperties.name);
    const currentProperties = currentById.get(id)?.properties || {};
    const villageName = normalize(currentProperties.name) === normalize(sourceName) ? currentProperties.name : sourceName;
    const countyName = sourceProperties.COUNTYNAME || countyNames.get(id.slice(0, 5)) || '';
    const townName = sourceProperties.TOWNNAME || townNames.get(id.slice(0, 8)) || '';
    const areaKey = officialAreaKey(`${countyName}${townName}${villageName}`);
    const records = officialByArea.get(areaKey) || [];
    if (records.length) matchedOfficialAreaKeys.add(areaKey);
    const officialName = records[0]?.area?.startsWith(`${countyName}${townName}`)
      ? records[0].area.slice(`${countyName}${townName}`.length)
      : villageName;
    const currentCandidates = currentProperties.candidates || [];
    report.currentVillageCandidates += currentCandidates.length;
    const candidates = records.map(record => enrichCandidate(record, currentCandidates, officialName));
    report.finalVillageCandidates += candidates.length;
    report.addedVillageCandidates += candidates.filter(candidate => !currentCandidates.some(current => intersects(aliases(candidate.name), aliases(current.name)))).length;
    report.removedVillageCandidates += currentCandidates.filter(candidate => !candidates.some(next => intersects(aliases(candidate.name), aliases(next.name)))).length;
    if (JSON.stringify(currentCandidates) !== JSON.stringify(candidates)) candidatesChanged = true;
    geometry.properties = { id, name: officialName, candidates };
  }

  if (useNewGeometry) {
    report.geometryUpdatedTowns.push(townCode);
    report.addedVillageIds.push(...addedIds);
    report.removedVillageIds.push(...removedIds);
    report.renamedVillageIds.push(...namesChanged.map(geometry => String(geometry.properties.VILLCODE)));
  }
  if (candidatesChanged) report.candidateUpdatedTowns.push(townCode);
  if (useNewGeometry || candidatesChanged) writes.set(currentPath, targetDocument);
}

report.unmatchedOfficialAreas = [...officialByArea.keys()].filter(key => !matchedOfficialAreaKeys.has(key));
if (report.finalVillageCandidates !== official.length || report.unmatchedOfficialAreas.length) {
  throw new Error(`Official roster did not map completely: final=${report.finalVillageCandidates}, unmatchedAreas=${JSON.stringify(report.unmatchedOfficialAreas)}`);
}

for (const key of ['addedVillageIds', 'removedVillageIds', 'renamedVillageIds', 'geometryUpdatedTowns', 'candidateUpdatedTowns']) {
  report[key] = [...new Set(report[key])].sort();
}

fs.mkdirSync(outputDir, { recursive: true });
fs.writeFileSync(path.join(outputDir, 'official-village-sync-report.json'), `${JSON.stringify(report, null, 2)}\n`);
if (applyBase) {
  for (const [file, document] of writes) fs.writeFileSync(file, `${JSON.stringify(document)}\n`);
  fs.writeFileSync(path.join(repo, 'data', 'official-village-sync-report.json'), `${JSON.stringify(report, null, 2)}\n`);
}

console.log(JSON.stringify({
  applyBase,
  officialVillageCandidates: report.officialVillageCandidates,
  currentVillageCandidates: report.currentVillageCandidates,
  finalVillageCandidates: report.finalVillageCandidates,
  addedVillageCandidates: report.addedVillageCandidates,
  removedVillageCandidates: report.removedVillageCandidates,
  addedVillageIds: report.addedVillageIds.length,
  removedVillageIds: report.removedVillageIds.length,
  renamedVillageIds: report.renamedVillageIds.length,
  geometryUpdatedTowns: report.geometryUpdatedTowns.length,
  candidateUpdatedTowns: report.candidateUpdatedTowns.length,
  filesToWrite: writes.size,
}, null, 2));
