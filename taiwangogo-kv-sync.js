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

export function planTaiwanGoGoSync(snapshot, people, districts) {
  if (!Array.isArray(people) || !people.length || !Array.isArray(districts?.cities)) {
    throw new Error('Taiwan GoGo 來源資料不完整，沒有修改候選人紀錄。');
  }
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
  return { changes, expected, summary: { sourcePeople: people.length, matched, filled, preserved, unmatched } };
}
