// Verify the two years used in the comparison articles against CEC winning marks; --write repairs local history only.
// This script never writes the live candidate API or KV.
import fs from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { cecElected } from './cec-result-flags.mjs';
const root = new URL('../', import.meta.url);
const file = new URL('data/history/councilor.json', root);
const data = JSON.parse(await fs.readFile(file, 'utf8'));
const norm = value => String(value ?? '').replaceAll('台', '臺').trim();
const changes = [];
const reports = [];
const increment = (object, key) => { object[key] = (object[key] || 0) + 1; };
for (const year of ['2018', '2022']) {
  const entry = data.years[year];
  const official = new Map();
  const profiles = new Map();
  for (const theme of entry.themes) {
    for (const kind of ['tickets', 'profiles']) {
      const url = `https://db.cec.gov.tw/static/elections/data/${kind}/ELC/${theme.subject}/${theme.legislatorType}/${theme.themeId}/C/00_000_00_000_0000.json`;
      const response = await fetch(url, { signal: AbortSignal.timeout(30000) });
      if (!response.ok) throw new Error(`${response.status}: ${url}`);
      const payload = await response.json();
      for (const row of Object.values(payload).flat()) {
        const area = norm(row.area_name);
        if (!entry.counties[area]) continue;
        if (kind === 'profiles') { profiles.set(area, (profiles.get(area) || 0) + Number(row.elected_num || 0)); continue; }
        const district = String(row.ori_area_code || row.area_code || '00').padStart(2, '0');
        const key = [area, theme.legislatorType, district, String(row.cand_no), norm(row.cand_name)].join('|');
        if (official.has(key)) throw new Error('Duplicate source candidate: ' + key);
        official.set(key, row);
      }
    }
  }
  entry.partySeats = {};
  for (const [area, county] of Object.entries(entry.counties)) {
    county.partySeats = {};
    for (const district of county.districts) {
      for (const candidate of district.candidates) {
        const key = [area, district.legislatorType, district.areaCode, candidate.no, candidate.name].join('|');
        const row = official.get(key);
        if (!row || Number(row.ticket_num) !== candidate.votes) throw new Error('Missing match or changed votes: ' + key);
        official.delete(key);
        const elected = cecElected(row.is_victor);
        if (candidate.elected !== elected) {
          if (String(row.is_victor).trim() !== '!' || candidate.elected) throw new Error('Unexpected source change: ' + key);
          changes.push({ year, county: area, district: district.name, name: candidate.name, mark: '!', before: false, after: true });
          candidate.elected = true;
        }
        if (candidate.elected) { increment(county.partySeats, candidate.party); increment(entry.partySeats, candidate.party); }
      }
      district.electedSeats = district.candidates.filter(c => c.elected).length;
    }
    county.stats.electedSeats = county.districts.reduce((s, d) => s + d.electedSeats, 0);
    if (county.stats.electedSeats !== profiles.get(area)) throw new Error('County seats differ from official profiles: ' + year + ' ' + area);
    const leading = Object.entries(county.partySeats).sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0], 'zh-Hant'));
    county.leadingParty = leading.length && leading[0][1] !== leading[1]?.[1] ? leading[0][0] : null;
    const candidate = county.districts.flatMap(d => d.candidates).find(c => c.party === county.leadingParty);
    county.leadingPartyKey = candidate?.partyKey || 'IND';
  }
  if (official.size) throw new Error('Unmatched official rows: ' + year);
  entry.stats.electedSeats = Object.values(entry.counties).reduce((s, c) => s + c.stats.electedSeats, 0);
  reports.push({ year, counties: Object.keys(entry.counties).length, electedSeats: entry.stats.electedSeats });
  console.log(year, entry.stats.electedSeats, 'seats verified against official profiles');
}
await fs.mkdir(new URL('work/content-quality/', root), { recursive: true });
await fs.writeFile(new URL('work/content-quality/result-mark-repair.json', root), JSON.stringify({ changes, reports }, null, 2) + '\n');
if (process.argv.includes('--write')) {
  await fs.writeFile(file, JSON.stringify(data) + '\n');
  console.log('Updated local history:', fileURLToPath(file), changes.length, 'winning flags');
} else console.log('Preview only:', changes.length, 'winning flags; use --write to update the local file.');
