import fs from 'node:fs';

const fixes = [
  {
    file: 'data/villages/villages-66000220.json',
    areaId: '66000220004',
    candidates: [
      { name: '洪正義', registeredDate: '115/09/02', isIncumbent: true, photoUrl: 'https://ws.moi.gov.tw/001/Upload/localofficial/urllink/ea299685-43de-4242-b700-f8ec61d8b5b7.jpg' },
      { name: '余連銓', registeredDate: '115/09/04', isIncumbent: false },
    ],
  },
  {
    file: 'data/villages/villages-67000350.json',
    areaId: '67000350003',
    candidates: [
      { name: '蘇龍池', registeredDate: '115/09/02', isIncumbent: false },
      { name: '林同寳', registeredDate: '115/09/02', isIncumbent: true, photoUrl: 'https://ws.moi.gov.tw/001/Upload/localofficial/urllink/b1d6f6c7-0659-428b-9cb9-f83f5f85b0ef.jpg' },
    ],
  },
  {
    file: 'data/villages/villages-67000350.json',
    areaId: '67000350024',
    candidates: [
      { name: '林宏男', registeredDate: '115/09/01', isIncumbent: true, photoUrl: 'https://ws.moi.gov.tw/001/Upload/localofficial/urllink/16ddd65f-7804-422c-9d31-643163a36fc2.jpg' },
    ],
  },
];

const byFile = Map.groupBy(fixes, fix => fix.file);
for (const [file, fileFixes] of byFile) {
  const topology = JSON.parse(fs.readFileSync(file, 'utf8'));
  for (const fix of fileFixes) {
    const village = topology.objects.map.geometries.find(geometry => String(geometry.properties.id) === fix.areaId);
    if (!village) throw new Error(`Missing village ${fix.areaId} in ${file}`);
    if ((village.properties.candidates || []).length > 0) {
      const current = village.properties.candidates.map(candidate => candidate.name);
      const expected = fix.candidates.map(candidate => candidate.name);
      if (JSON.stringify(current) !== JSON.stringify(expected)) throw new Error(`Refusing to overwrite candidates in ${fix.areaId}`);
      continue;
    }
    village.properties.candidates = fix.candidates.map(candidate => ({
      name: candidate.name,
      party: '無',
      role: '里長候選人',
      registeredDate: candidate.registeredDate,
      gazetteUrl: null,
      facebook: null,
      instagram: null,
      threads: null,
      youtube: null,
      photoUrl: candidate.photoUrl || null,
      isIncumbent: candidate.isIncumbent,
    }));
  }
  fs.writeFileSync(file, `${JSON.stringify(topology)}\n`);
}

const incumbentSyncFile = 'data/village_incumbent_sync.json';
const incumbentSync = JSON.parse(fs.readFileSync(incumbentSyncFile, 'utf8'));
for (const fix of fixes) {
  for (const candidate of fix.candidates.filter(candidate => candidate.isIncumbent)) {
    if (!incumbentSync.records.some(record => record.areaId === fix.areaId && record.name === candidate.name)) {
      incumbentSync.records.push({ areaId: fix.areaId, name: candidate.name });
    }
  }
}
incumbentSync.records.sort((a, b) => a.areaId.localeCompare(b.areaId, 'en') || a.name.localeCompare(b.name, 'zh-TW'));
fs.writeFileSync(incumbentSyncFile, `${JSON.stringify(incumbentSync, null, 2)}\n`);

console.log(`Patched ${fixes.reduce((sum, fix) => sum + fix.candidates.length, 0)} official registrations in ${fixes.length} villages.`);
