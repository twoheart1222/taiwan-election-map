import fs from 'node:fs/promises';
import path from 'node:path';
import process from 'node:process';

const ROOT = process.cwd();
const NATIONAL_PATH = path.join(ROOT, 'data/history/presidential.json');
const COUNTY_PATH = path.join(ROOT, 'data/history/presidential-counties.json');
const BASE = 'https://db.cec.gov.tw/static/elections';
const LEGACY_TO_CURRENT = new Map([
  ['臺北縣', '新北市'], ['桃園縣', '桃園市'], ['臺中縣', '臺中市'],
  ['臺南縣', '臺南市'], ['高雄縣', '高雄市'],
]);

const normalizeCounty = value => {
  const name = String(value || '').replaceAll('台', '臺').trim();
  return LEGACY_TO_CURRENT.get(name) || name;
};
const profileUrl = (theme, level) => `${BASE}/data/profiles/ELC/P0/00/${theme}/${level}/00_000_00_000_0000.json`;

async function json(url) {
  const response = await fetch(url, { headers: { 'user-agent': 'Formosa-Observatory-profile-builder/1.0' } });
  if (!response.ok) throw new Error(`HTTP ${response.status}: ${url}`);
  return response.json();
}

function rows(payload) {
  return Object.values(payload || {}).flat().filter(Boolean);
}

function compact(row) {
  return {
    population: Number(row.population) || 0,
    electors: Number(row.votable_population) || 0,
    votesCast: Number(row.vote_ticket) || 0,
    validVotes: Number(row.valid_ticket) || 0,
    invalidVotes: Number(row.invalid_ticket) || 0,
    turnout: Number(row.vote_to_elect) || 0,
  };
}

function add(target, incoming) {
  for (const key of ['population', 'electors', 'votesCast', 'validVotes', 'invalidVotes']) {
    target[key] = (target[key] || 0) + (incoming[key] || 0);
  }
  target.turnout = target.electors ? Number((target.votesCast / target.electors * 100).toFixed(2)) : 0;
  return target;
}

async function main() {
  const [list, national, counties] = await Promise.all([
    json(`${BASE}/list/ELC_P0.json`),
    fs.readFile(NATIONAL_PATH, 'utf8').then(JSON.parse),
    fs.readFile(COUNTY_PATH, 'utf8').then(JSON.parse),
  ]);
  const themes = (list.find(item => item.area_name === '全國')?.theme_items || [])
    .filter(item => item.has_data && item.vote_date)
    .map(item => ({ ...item, year: Number(String(item.vote_date).slice(0, 4)) }));
  const elections = new Map(national.elections.map(e => [Number(e.year), e]));

  for (const theme of themes) {
    const election = elections.get(theme.year);
    const countyYear = counties.years?.[String(theme.year)];
    if (!election || !countyYear) continue;
    const [nationalProfile, countyProfiles] = await Promise.all([
      json(profileUrl(theme.theme_id, 'N')),
      json(profileUrl(theme.theme_id, 'C')),
    ]);
    const nationalRow = rows(nationalProfile)[0];
    if (!nationalRow) throw new Error(`${theme.year}: missing national profile`);
    Object.assign(election, compact(nationalRow));

    const merged = new Map();
    for (const row of rows(countyProfiles)) {
      const county = normalizeCounty(row.area_name);
      if (!county) continue;
      merged.set(county, add(merged.get(county) || {}, compact(row)));
    }
    for (const [county, profile] of merged) {
      const result = countyYear.counties?.[county];
      if (!result) throw new Error(`${theme.year}: CEC profile has unmatched county ${county}`);
      if (result.validVotes !== profile.validVotes) {
        throw new Error(`${theme.year} ${county}: profile valid votes ${profile.validVotes} != result ${result.validVotes}`);
      }
      Object.assign(result, profile);
    }
    console.log(`${theme.year}: national profile and ${merged.size} normalized county profiles`);
  }

  national.source.profileApi = `${BASE}/elections/data/profiles/ELC/P0/00/{theme}/{level}/00_000_00_000_0000.json`;
  counties.source.profileApi = national.source.profileApi;
  await Promise.all([
    fs.writeFile(NATIONAL_PATH, `${JSON.stringify(national, null, 2)}\n`, 'utf8'),
    fs.writeFile(COUNTY_PATH, `${JSON.stringify(counties, null, 2)}\n`, 'utf8'),
  ]);
}

main().catch(error => { console.error(error.stack || error); process.exitCode = 1; });
