import fs from 'node:fs/promises';
import path from 'node:path';
import process from 'node:process';

const ROOT = process.cwd();
const BASE = 'https://db.cec.gov.tw/static/elections';
const LIST_API = `${BASE}/list/ELC_L0.json`;
const OFFICIAL_PAGE = 'https://db.cec.gov.tw/ElecTable/Election?type=ELC';
const OUTPUT = path.join(ROOT, 'data', 'history', 'legislator.json');
const NATIONAL_KEY = '00_000_00_000_0000';

const number = value => Number(value) || 0;
const round = (value, digits = 4) => Number(Number(value || 0).toFixed(digits));
const rows = payload => Object.values(payload || {}).flat().filter(Boolean);
const elected = value => ['*', 'Y', 'YES', 'TRUE', '1'].includes(String(value ?? '').trim().toUpperCase()) || value === true;
const areaKey = row => [row.prv_code, row.city_code, row.area_code || '00', '000', '0000'].join('_');
const districtCode = row => [row.prv_code, row.city_code, row.area_code].join('-');

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

async function json(url) {
  let lastError;
  for (let attempt = 1; attempt <= 5; attempt += 1) {
    try {
      const response = await fetch(url, {
        headers: {
          accept: 'application/json, text/plain, */*',
          referer: OFFICIAL_PAGE,
          'user-agent': 'Mozilla/5.0',
        },
      });
      if (!response.ok) throw new Error(`HTTP ${response.status}: ${url}`);
      return JSON.parse(await response.text());
    } catch (error) {
      lastError = error;
      if (attempt < 5) await new Promise(resolve => setTimeout(resolve, attempt * 400));
    }
  }
  throw lastError;
}

const apiUrl = (kind, category, theme, level, key = NATIONAL_KEY) =>
  `${BASE}/data/${kind}/ELC/L0/${category}/${theme}/${level}/${key}.json`;

function profile(row) {
  return {
    population: number(row.population),
    electors: number(row.votable_population),
    votesCast: number(row.vote_ticket),
    validVotes: number(row.valid_ticket),
    invalidVotes: number(row.invalid_ticket),
    turnout: round(row.vote_to_elect, 2),
    candidateCount: number(row.cand_num),
    electedSeats: number(row.elected_num),
  };
}

function candidate(row, validVotes) {
  return {
    no: number(row.cand_no),
    name: String(row.cand_name || '').trim(),
    party: String(row.party_name || '').trim(),
    sex: String(row.cand_sex || '').trim(),
    birthYear: number(row.cand_birthyear) || null,
    education: String(row.cand_edu || '').trim(),
    incumbent: String(row.is_current || '').trim().toUpperCase() === 'Y',
    elected: elected(row.is_victor),
    votes: number(row.ticket_num),
    share: validVotes ? round(number(row.ticket_num) / validVotes * 100) : 0,
  };
}

async function mapLimit(items, limit, mapper) {
  const output = new Array(items.length);
  let next = 0;
  async function worker() {
    while (next < items.length) {
      const index = next;
      next += 1;
      output[index] = await mapper(items[index], index);
    }
  }
  await Promise.all(Array.from({ length: Math.min(limit, items.length) }, worker));
  return output;
}

async function buildRegional(theme) {
  const [nationalPayload, countyPayload] = await Promise.all([
    json(apiUrl('profiles', 'L1', theme.theme_id, 'N')),
    json(apiUrl('profiles', 'L1', theme.theme_id, 'C')),
  ]);
  const nationalRow = rows(nationalPayload)[0];
  const countyRows = rows(countyPayload);
  assert(nationalRow && countyRows.length, `${theme.vote_date}: missing regional profiles`);

  const counties = await mapLimit(countyRows, 5, async countyRow => {
    const key = areaKey(countyRow);
    const [districtProfilesPayload, ticketsPayload] = await Promise.all([
      json(apiUrl('profiles', 'L1', theme.theme_id, 'A', key)),
      json(apiUrl('tickets', 'L1', theme.theme_id, 'A', key)),
    ]);
    const districtProfiles = [...rows(districtProfilesPayload).reduce((map, row) => {
      const code = districtCode(row);
      const previous = map.get(code);
      // A few legacy CEC files contain a township summary under the same area
      // code as its parent electoral district. The district total is the row
      // with the larger valid-vote count.
      if (!previous || number(row.valid_ticket) > number(previous.valid_ticket)) map.set(code, row);
      return map;
    }, new Map()).values()];
    const tickets = rows(ticketsPayload);
    const ticketGroups = new Map();
    for (const row of tickets) {
      const code = districtCode(row);
      if (!ticketGroups.has(code)) ticketGroups.set(code, []);
      ticketGroups.get(code).push(row);
    }
    const districts = districtProfiles.map(row => {
      const stats = profile(row);
      const candidateRows = [...(ticketGroups.get(districtCode(row)) || []).reduce((map, item) => {
        const no = String(item.cand_no);
        const previous = map.get(no);
        if (!previous || number(item.ticket_num) > number(previous.ticket_num)) map.set(no, item);
        return map;
      }, new Map()).values()];
      const candidates = candidateRows.map(item => candidate(item, stats.validVotes)).sort((a, b) => a.no - b.no);
      assert(candidates.length === stats.candidateCount, `${theme.vote_date} ${row.area_name}: candidate count mismatch`);
      assert(candidates.reduce((sum, item) => sum + item.votes, 0) === stats.validVotes, `${theme.vote_date} ${row.area_name}: vote sum mismatch`);
      assert(candidates.filter(item => item.elected).length === stats.electedSeats, `${theme.vote_date} ${row.area_name}: elected count mismatch`);
      return {
        code: districtCode(row),
        name: row.area_name,
        ...stats,
        candidates,
      };
    });
    const stats = profile(countyRow);
    assert(districts.reduce((sum, item) => sum + item.validVotes, 0) === stats.validVotes, `${theme.vote_date} ${countyRow.area_name}: district vote sum mismatch`);
    assert(districts.reduce((sum, item) => sum + item.electedSeats, 0) === stats.electedSeats, `${theme.vote_date} ${countyRow.area_name}: district seat sum mismatch`);
    return { code: key, name: countyRow.area_name, ...stats, districts };
  });

  const stats = profile(nationalRow);
  assert(counties.reduce((sum, item) => sum + item.validVotes, 0) === stats.validVotes, `${theme.vote_date}: regional national vote sum mismatch`);
  assert(counties.reduce((sum, item) => sum + item.electedSeats, 0) === stats.electedSeats, `${theme.vote_date}: regional national seat sum mismatch`);
  return {
    id: 'regional',
    officialCode: 'L1',
    label: theme.legislator_desc,
    themeId: theme.theme_id,
    ...stats,
    countyCount: counties.length,
    districtCount: counties.reduce((sum, item) => sum + item.districts.length, 0),
    counties,
  };
}

async function buildCandidateCategory(theme) {
  const category = theme.legislator_type_id;
  const [profilePayload, ticketPayload] = await Promise.all([
    json(apiUrl('profiles', category, theme.theme_id, 'N')),
    json(apiUrl('tickets', category, theme.theme_id, 'N')),
  ]);
  const nationalRow = rows(profilePayload)[0];
  assert(nationalRow, `${theme.vote_date} ${category}: missing profile`);
  const stats = profile(nationalRow);
  const candidates = rows(ticketPayload).map(row => candidate(row, stats.validVotes)).sort((a, b) => a.no - b.no);
  assert(candidates.length === stats.candidateCount, `${theme.vote_date} ${category}: candidate count mismatch`);
  assert(candidates.reduce((sum, item) => sum + item.votes, 0) === stats.validVotes, `${theme.vote_date} ${category}: vote sum mismatch`);
  assert(candidates.filter(item => item.elected).length === stats.electedSeats, `${theme.vote_date} ${category}: elected count mismatch`);
  return {
    id: category === 'L2' ? 'plains-indigenous' : 'mountain-indigenous',
    officialCode: category,
    label: theme.legislator_desc,
    themeId: theme.theme_id,
    ...stats,
    candidates,
  };
}

async function buildPartyList(theme) {
  const [profilePayload, ticketPayload] = await Promise.all([
    json(apiUrl('profiles', 'L4', theme.theme_id, 'N')),
    json(apiUrl('tickets', 'L4', theme.theme_id, 'N')),
  ]);
  const nationalRow = rows(profilePayload)[0];
  assert(nationalRow, `${theme.vote_date} L4: missing profile`);
  const stats = profile(nationalRow);
  const parties = rows(ticketPayload).map(row => ({
    no: number(row.cand_no),
    party: String(row.party_name || '').trim(),
    votes: number(row.ticket_num),
    share: stats.validVotes ? round(number(row.ticket_num) / stats.validVotes * 100) : 0,
    electedSeats: number(row.elected_num),
  })).sort((a, b) => a.no - b.no);
  const allocatedSeats = parties.reduce((sum, item) => sum + item.electedSeats, 0);
  assert(parties.reduce((sum, item) => sum + item.votes, 0) === stats.validVotes, `${theme.vote_date} L4: vote sum mismatch`);
  assert(allocatedSeats === 34, `${theme.vote_date} L4: expected 34 allocated seats, got ${allocatedSeats}`);
  return {
    id: 'party-list',
    officialCode: 'L4',
    label: theme.legislator_desc,
    themeId: theme.theme_id,
    ...stats,
    electedSeats: allocatedSeats,
    registeredListCandidateCount: stats.candidateCount,
    parties,
  };
}

async function main() {
  const list = await json(LIST_API);
  const themes = (list.find(item => item.area_name === '全國')?.theme_items || []).filter(item => item.has_data);
  const grouped = new Map();
  for (const theme of themes) {
    const year = Number(String(theme.vote_date).slice(0, 4));
    if (!grouped.has(year)) grouped.set(year, []);
    grouped.get(year).push(theme);
  }

  const archive = {
    schemaVersion: 1,
    type: 'legislator',
    generator: 'scripts/build-official-legislator-history.mjs',
    coverage: [...grouped.keys()].sort((a, b) => a - b),
    source: {
      name: '中央選舉委員會選舉資料庫',
      url: OFFICIAL_PAGE,
      listApi: LIST_API,
      summaryApi: `${BASE}/data/summaries/L0/{themeGroup}.json`,
      ticketApi: `${BASE}/data/tickets/ELC/L0/{category}/{theme}/{level}/{area}.json`,
      profileApi: `${BASE}/data/profiles/ELC/L0/{category}/{theme}/{level}/{area}.json`,
      license: '政府資料開放授權條款第1版',
    },
    boundaryMode: 'historical-official',
    note: '選區名稱與範圍依各屆中選會原始資料保留，不正規化為現行選區。2004 年以前的中選會 L0 清單未另列不分區政黨票分類，因此不自行推算該類別席次。',
    years: {},
  };

  for (const year of [...grouped.keys()].sort((a, b) => b - a)) {
    const yearThemes = grouped.get(year);
    const byCode = new Map(yearThemes.map(item => [item.legislator_type_id, item]));
    assert(byCode.has('L1') && byCode.has('L2') && byCode.has('L3'), `${year}: incomplete official legislator categories`);
    const [regional, plains, mountain, partyList, summary] = await Promise.all([
      buildRegional(byCode.get('L1')),
      buildCandidateCategory(byCode.get('L2')),
      buildCandidateCategory(byCode.get('L3')),
      byCode.has('L4') ? buildPartyList(byCode.get('L4')) : Promise.resolve(null),
      json(`${BASE}/data/summaries/L0/${yearThemes[0].theme_group}.json`),
    ]);
    const categories = [regional, plains, mountain, ...(partyList ? [partyList] : [])];
    const directElectedSeats = regional.electedSeats + plains.electedSeats + mountain.electedSeats;
    const partyListElectedSeats = partyList?.electedSeats ?? null;
    const seatSummary = (summary.legislator_dists || []).map(item => ({
      officialCode: item.legislator_type_id,
      seats: (item.dists || []).reduce((sum, party) => sum + number(party.distribution_num), 0),
      parties: (item.dists || []).map(party => ({
        partyCode: number(party.party_code),
        party: party.party_name,
        seats: number(party.distribution_num),
      })),
    }));
    for (const category of categories) {
      const summaryCategory = seatSummary.find(item => item.officialCode === category.officialCode);
      assert(summaryCategory?.seats === category.electedSeats, `${year} ${category.officialCode}: summary seat mismatch`);
    }
    const legacyAdditionalSeats = (summary.remark || []).map(item => ({ type: item.type, seats: number(item.seat) }));
    const additionalSeatCount = legacyAdditionalSeats.reduce((sum, item) => sum + item.seats, 0);
    archive.years[String(year)] = {
      year,
      term: number(yearThemes[0].session),
      date: yearThemes[0].vote_date,
      categoryCodes: categories.map(item => item.officialCode),
      completeForPublishedCategories: true,
      districtCount: regional.districtCount + 2,
      directElectedSeats,
      partyListElectedSeats,
      publishedCategoryElectedSeats: directElectedSeats + (partyListElectedSeats || 0),
      legacyAdditionalSeats,
      totalLegislatureSeats: directElectedSeats + (partyListElectedSeats || 0) + additionalSeatCount,
      seatSummary,
      categories,
    };
    console.log(`${year}: ${regional.districtCount} regional districts, ${directElectedSeats} direct seats${partyList ? `, ${partyListElectedSeats} party-list seats` : ', no separate L4 dataset'}`);
  }

  await fs.writeFile(OUTPUT, `${JSON.stringify(archive, null, 2)}\n`);
  console.log(`Wrote ${path.relative(ROOT, OUTPUT)}`);
}

await main();
