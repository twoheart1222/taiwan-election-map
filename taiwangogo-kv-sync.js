// Match the source to existing registered candidates. The source is a
// criminal-record directory, not an authoritative list of election registrants.
const COUNTIES = Object.fromEntries([
  ['連江縣', '09007'], ['金門縣', '09020'], ['宜蘭縣', '10002'],
  ['彰化縣', '10007'], ['南投縣', '10008'], ['雲林縣', '10009'],
  ['屏東縣', '10013'], ['臺東縣', '10014'], ['花蓮縣', '10015'],
  ['澎湖縣', '10016'], ['基隆市', '10017'], ['新竹市', '10018'],
  ['臺北市', '63000'], ['新北市', '65000'], ['臺中市', '66000'],
  ['臺南市', '67000'], ['桃園市', '68000'], ['苗栗縣', '10005'],
  ['新竹縣', '10004'], ['嘉義市', '10020'], ['嘉義縣', '10010'],
  ['高雄市', '64000'],
].map(([name, code]) => [normalize(name), code]));

function normalize(value) {
  return String(value || '').normalize('NFKC').replaceAll('臺', '台').replace(/[・．·‧\s]/g, '');
}

function districtNumber(value) {
  return String(value || '').match(/\d+/)?.[0] || '';
}

function sourcePerson(person) {
  return {
    id: String(person.id || ''),
    name: String(person.name || ''),
    city: String(person.city || ''),
    district: String(person.district || ''),
    level: String(person.level || ''),
  };
}

export function taiwanGoGoSourceSnapshot(people) {
  return { people: people.map(sourcePerson) };
}

export function taiwanGoGoSourceSnapshotFromLinks(report) {
  if (!Array.isArray(report?.links) || !report.links.length) return null;
  return {
    capturedAt: String(report.generatedAt || ''),
    people: report.links.filter(link => link?.personId).map(link => sourcePerson({
      id: link.personId, name: link.name, city: link.city, district: link.district,
      level: String(link.personId).includes('|縣市首長|') ? '縣市長' : '議員',
    })),
  };
}

function linkedPeopleMissingFromSource(snapshot, sourceIds) {
  const missing = [];
  for (const [code, document] of Object.entries(snapshot || {})) {
    const groups = [
      { district: '', candidates: document?.candidates },
      ...(document?.councilors || []).map(block => ({ district: String(block.district || ''), candidates: block.candidates })),
    ];
    for (const group of groups) {
      for (const candidate of group.candidates || []) {
        const link = String(candidate.taiwanGoGoUrl || '').trim();
        if (!link) continue;
        let url;
        try { url = new URL(link); } catch { continue; }
        if (url.hostname !== 'council2026.taiwangogo.tw') continue;
        const id = url.searchParams.get('person');
        if (!id || sourceIds.has(id)) continue;
        const [sourceCity, sourceDistrict] = id.split('|');
        missing.push({
          id, name: String(candidate.name || ''),
          city: sourceCity || code,
          district: sourceDistrict || group.district, url: link,
          manual: candidate.manualFieldLocks?.taiwanGoGoUrl === true,
        });
      }
    }
  }
  return missing;
}

export function planTaiwanGoGoSync(snapshot, people, districts, previousSource = null) {
  if (!Array.isArray(people) || !people.length || !Array.isArray(districts?.cities)) {
    throw new Error('Taiwan GoGo 來源資料不完整，沒有修改候選人紀錄。');
  }
  const sourceIds = new Set(people.map(person => String(person.id || '')).filter(Boolean));
  const previousPeople = Array.isArray(previousSource?.people) ? previousSource.people : null;
  const sourceRemoved = (previousPeople || [])
    .filter(person => person?.id && !sourceIds.has(String(person.id)))
    .map(sourcePerson);
  const linkedMissing = linkedPeopleMissingFromSource(snapshot, sourceIds);
  const locationByPerson = new Map();
  for (const city of districts.cities) {
    for (const id of city.mayorPeopleIds || []) locationByPerson.set(id, { city: city.id });
    for (const district of city.districts || []) {
      for (const id of district.peopleIds || []) locationByPerson.set(id, { city: city.id, district: district.id });
    }
  }
  const changes = {}, expected = {}, unmatched = [];
  let matched = 0, filled = 0, preserved = 0;
  for (const person of people) {
    const code = COUNTIES[normalize(person.city)];
    const original = snapshot[code];
    const location = locationByPerson.get(person.id);
    if (!code || !original || !location || !person.id || !person.name) {
      unmatched.push(person.id || person.name || '未知');
      continue;
    }
    const isMayor = person.level === '縣市長';
    const group = isMayor ? original.candidates : (original.councilors || [])
      .find(block => String(block.district) === districtNumber(person.district))?.candidates;
    const matches = (group || []).filter(candidate => normalize(candidate.name) === normalize(person.name));
    if (matches.length !== 1) {
      unmatched.push(person.id);
      continue;
    }
    matched++;
    const current = matches[0];
    if (current.manualFieldLocks?.taiwanGoGoUrl || String(current.taiwanGoGoUrl || '').trim()) {
      preserved++;
      continue;
    }
    const url = new URL('https://council2026.taiwangogo.tw/');
    if (!isMayor) {
      if (!location.district) { unmatched.push(person.id); matched--; continue; }
      url.searchParams.set('city', location.city);
      url.searchParams.set('district', location.district);
    }
    url.searchParams.set('person', person.id);
    if (!changes[code]) {
      changes[code] = structuredClone(original);
      expected[code] = original._revision || '0';
    }
    const target = isMayor ? changes[code].candidates : changes[code].councilors
      .find(block => String(block.district) === districtNumber(person.district)).candidates;
    target.find(candidate => normalize(candidate.name) === normalize(person.name)).taiwanGoGoUrl = url.href;
    filled++;
  }
  return {
    changes, expected,
    summary: {
      sourcePeople: people.length, matched, filled, preserved, unmatched,
      comparedWithPrevious: previousPeople !== null,
      previousSourcePeople: previousPeople?.length ?? null,
      previousSourceAt: previousSource?.capturedAt || null,
      sourceRemoved, linkedMissing,
    },
  };
}
