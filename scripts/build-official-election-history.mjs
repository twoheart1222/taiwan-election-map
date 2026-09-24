import fs from 'node:fs/promises';
import path from 'node:path';
import process from 'node:process';

const ROOT = process.cwd();
const BASE = 'https://db.cec.gov.tw/static/elections';
const OFFICIAL_PAGE = 'https://db.cec.gov.tw/ElecTable/Election?type=President';
const OUT = name => path.join(ROOT, 'data', 'history', name);
const CURRENT_COUNTIES = ['臺北市','新北市','桃園市','臺中市','臺南市','高雄市','基隆市','新竹市','嘉義市','新竹縣','苗栗縣','彰化縣','南投縣','雲林縣','嘉義縣','屏東縣','宜蘭縣','花蓮縣','臺東縣','澎湖縣','金門縣','連江縣'];
const LEGACY_COUNTIES = new Map([
  ['臺北縣','新北市'],['桃園縣','桃園市'],['臺中縣','臺中市'],
  ['臺南縣','臺南市'],['高雄縣','高雄市'],
]);
const MUNICIPALITIES = new Set(['臺北市','新北市','桃園市','臺中市','臺南市','高雄市']);

const normalizeText = value => String(value ?? '').replaceAll('台', '臺').trim();
const normalizeCounty = value => {
  const name = normalizeText(value);
  return LEGACY_COUNTIES.get(name) || name;
};
function normalizeTown(county, value) {
  let name = normalizeText(value);
  if (county === '高雄市' && name === '三民鄉') return '那瑪夏區';
  if (county === '臺南市' && (name === '中區' || name === '西區')) return '中西區';
  if (MUNICIPALITIES.has(county)) name = name.replace(/[市鎮鄉]$/, '區');
  return name;
}
const rows = payload => Object.values(payload || {}).flat().filter(Boolean);
const number = value => Number(value) || 0;
const round = (value, digits = 2) => Number(Number(value || 0).toFixed(digits));
const won = value => ['*','Y','YES','TRUE','1'].includes(String(value ?? '').trim().toUpperCase()) || value === true;
const partyKey = value => {
  const party = String(value || '');
  if (party === '民主進步黨') return 'DPP';
  if (party === '中國國民黨') return 'KMT';
  if (party === '台灣民眾黨') return 'TPP';
  if (party === '親民黨') return 'PFP';
  if (party === '新黨') return 'NP';
  if (party === '時代力量') return 'NPP';
  if (party.includes('無黨籍') || party === '無') return 'IND';
  return 'OTHER';
};

async function json(url) {
  let last;
  for (let attempt = 1; attempt <= 5; attempt += 1) {
    try {
      const response = await fetch(url, { headers: {
        accept: 'application/json, text/plain, */*',
        referer: 'https://db.cec.gov.tw/Visual/President?dataLevel=N&legisId=00&typeId=ELC&subjectId=P0&themeId=4d83db17c1707e3defae5dc4d4e9c800',
        'user-agent': 'Mozilla/5.0',
      } });
      if (!response.ok) throw new Error(`HTTP ${response.status}: ${url}`);
      const text = await response.text();
      try { return JSON.parse(text); }
      catch { throw new Error(`Invalid JSON from ${url}: ${text.slice(0, 60).replace(/\s+/g, ' ')}`); }
    } catch (error) {
      last = error;
      if (attempt < 5) await new Promise(resolve => setTimeout(resolve, attempt * 500));
    }
  }
  throw last;
}

const apiUrl = (kind, subject, theme, level, key = '00_000_00_000_0000') =>
  `${BASE}/data/${kind}/ELC/${subject}/00/${theme}/${level}/${key}.json`;
const countyKey = row => [row.prv_code, row.city_code, row.area_code || '00', '000', '0000'].join('_');
const profile = row => ({
  population: number(row.population),
  electors: number(row.votable_population),
  votesCast: number(row.vote_ticket),
  validVotes: number(row.valid_ticket),
  invalidVotes: number(row.invalid_ticket),
  turnout: round(row.vote_to_elect),
});
function addProfile(target, incoming) {
  for (const key of ['population','electors','votesCast','validVotes','invalidVotes']) target[key] = number(target[key]) + number(incoming[key]);
  target.turnout = target.electors ? round(target.votesCast / target.electors * 100) : 0;
  return target;
}
function finalizeResult(bucket) {
  const candidates = [...bucket.candidates.values()]
    .sort((a,b) => Number(a.no) - Number(b.no))
    .map(candidate => ({ ...candidate, share: bucket.validVotes ? round(candidate.votes / bucket.validVotes * 100, 4) : 0 }));
  const ranking = [...candidates].sort((a,b) => b.votes - a.votes);
  return {
    validVotes: bucket.validVotes,
    winnerNo: String(ranking[0]?.no ?? ''),
    margin: number(ranking[0]?.votes) - number(ranking[1]?.votes),
    candidates,
    ...(bucket.stats || {}),
  };
}
function assert(condition, message) { if (!condition) throw new Error(message); }

async function presidentialThemes() {
  const list = await json(`${BASE}/list/ELC_P0.json`);
  return (list.find(item => item.area_name === '全國')?.theme_items || [])
    .filter(item => item.has_data && Number(String(item.vote_date).slice(0,4)) >= 1996)
    .map(item => ({ ...item, year: Number(String(item.vote_date).slice(0,4)) }));
}

async function buildPresident() {
  const themes = await presidentialThemes();
  const national = {
    schemaVersion: 2,
    type: 'president',
    source: {
      name: '中央選舉委員會選舉資料庫', url: OFFICIAL_PAGE,
      license: '政府資料開放授權條款第1版',
      listApi: `${BASE}/list/ELC_P0.json`,
      ticketApi: `${BASE}/data/tickets/ELC/P0/00/{theme}/{level}/{area}.json`,
      profileApi: `${BASE}/data/profiles/ELC/P0/00/{theme}/{level}/{area}.json`,
    },
    note: '全國、縣市與鄉鎮市區結果皆由中選會官方選舉資料庫公開 JSON 建置；跨屆比較將舊行政區正規化為現行名稱。',
    elections: [],
  };
  const counties = {
    schemaVersion: 2, generator: 'scripts/build-official-election-history.mjs',
    boundaryMode: 'current-22-normalized',
    boundaryNote: '跨屆比較使用現行 22 縣市名稱。舊臺北縣、桃園縣更名；2010 合併前的臺中、臺南、高雄縣市票數分別加總。',
    source: { primary: '中央選舉委員會選舉資料庫', url: OFFICIAL_PAGE, coverage: '1996–2024', listApi: `${BASE}/list/ELC_P0.json` },
    years: {},
  };
  const towns = {
    schemaVersion: 2, boundaryMode: 'current-townships', coverage: themes.map(t => t.year).sort((a,b) => a-b),
    note: '1996–2024 鄉鎮市區結果皆由中選會官方資料建置；直轄市改制前的市、鎮、鄉名稱正規化為現行區名。',
    topology: 'https://cdn.jsdelivr.net/npm/taiwan-atlas/towns-10t.json',
    source: { name: '中央選舉委員會選舉資料庫', url: OFFICIAL_PAGE, listApi: `${BASE}/list/ELC_P0.json` },
    years: {},
  };

  for (const theme of themes) {
    const year = theme.year;
    await new Promise(resolve => setTimeout(resolve, 350));
    const [nTicketsPayload,nProfilePayload,cTicketsPayload,cProfilesPayload] = await Promise.all([
      json(apiUrl('tickets','P0',theme.theme_id,'N')),
      json(apiUrl('profiles','P0',theme.theme_id,'N')),
      json(apiUrl('tickets','P0',theme.theme_id,'C')),
      json(apiUrl('profiles','P0',theme.theme_id,'C')),
    ]);
    const nTickets = rows(nTicketsPayload);
    const nProfile = rows(nProfilePayload)[0];
    assert(nTickets.length && nProfile, `${year}: missing national data`);
    const byNo = new Map();
    for (const row of nTickets) {
      const no = String(row.cand_no);
      const item = byNo.get(no) || { no: number(row.cand_no), president: '', vicePresident: '', party: row.party_name, partyKey: partyKey(row.party_name), votes: number(row.ticket_num) };
      if (String(row.is_vice).trim().toUpperCase() === 'Y') item.vicePresident = row.cand_name;
      else { item.president = row.cand_name; item.votes = number(row.ticket_num); if (won(row.is_victor)) item.elected = true; }
      byNo.set(no, item);
    }
    const nStats = profile(nProfile);
    const election = { year, term: number(theme.session), date: theme.vote_date, turnout: nStats.turnout, validVotes: nStats.validVotes, candidates: [...byNo.values()].sort((a,b) => a.no-b.no), countyResults: null, population: nStats.population, electors: nStats.electors, votesCast: nStats.votesCast, invalidVotes: nStats.invalidVotes };
    assert(election.candidates.reduce((sum,c) => sum+c.votes,0) === election.validVotes, `${year}: national candidate sum mismatch`);
    national.elections.push(election);

    const cProfiles = rows(cProfilesPayload);
    const cBuckets = new Map();
    const originalCounties = new Map();
    for (const row of cProfiles) {
      const original = normalizeText(row.area_name), current = normalizeCounty(original);
      originalCounties.set(`${original}|${countyKey(row)}`, { original, current, key: countyKey(row) });
      const bucket = cBuckets.get(current) || { candidates:new Map(), validVotes:0, stats:{} };
      addProfile(bucket.stats, profile(row)); bucket.validVotes = bucket.stats.validVotes; cBuckets.set(current,bucket);
    }
    for (const row of rows(cTicketsPayload)) {
      if (String(row.is_vice).trim().toUpperCase() === 'Y') continue;
      const current = normalizeCounty(row.area_name), bucket = cBuckets.get(current);
      assert(bucket, `${year}: ticket without profile for ${row.area_name}`);
      const no = String(row.cand_no), old = bucket.candidates.get(no);
      if (old) old.votes += number(row.ticket_num);
      else bucket.candidates.set(no, { no, name: row.cand_name, party: row.party_name, votes:number(row.ticket_num) });
    }
    const cOut = {};
    for (const county of CURRENT_COUNTIES) {
      const bucket = cBuckets.get(county); assert(bucket, `${year}: missing normalized county ${county}`);
      cOut[county] = finalizeResult(bucket);
      assert(cOut[county].candidates.reduce((sum,c)=>sum+c.votes,0) === cOut[county].validVotes, `${year} ${county}: county sum mismatch`);
    }
    for (const candidate of election.candidates) {
      const sum = Object.values(cOut).reduce((total,result) => total + number(result.candidates.find(c=>String(c.no)===String(candidate.no))?.votes),0);
      assert(sum === candidate.votes, `${year} candidate ${candidate.no}: counties ${sum} != national ${candidate.votes}`);
    }
    counties.years[String(year)] = { themeId: theme.theme_id, sourceUrl: OFFICIAL_PAGE, ticketApi: apiUrl('tickets','P0',theme.theme_id,'C'), profileApi: apiUrl('profiles','P0',theme.theme_id,'C'), counties: cOut };

    const townBuckets = new Map();
    const sourceCounties = [...originalCounties.values()];
    let firstPair;
    try {
      const source=sourceCounties[0];
      const [tickets,profiles]=await Promise.all([json(apiUrl('tickets','P0',theme.theme_id,'D',source.key)),json(apiUrl('profiles','P0',theme.theme_id,'D',source.key))]);
      firstPair={source,tickets:rows(tickets),profiles:rows(profiles)};
    } catch (error) {
      console.warn(`${year}: official town files are not published; town drilldown omitted for this year`);
      continue;
    }
    const pairs = [firstPair];
    for (let start = 1; start < sourceCounties.length; start += 4) {
      const batch = await Promise.all(sourceCounties.slice(start,start+4).map(async source => {
        try {
          const [tickets,profiles] = await Promise.all([
            json(apiUrl('tickets','P0',theme.theme_id,'D',source.key)),
            json(apiUrl('profiles','P0',theme.theme_id,'D',source.key)),
          ]);
          return { source, tickets:rows(tickets), profiles:rows(profiles) };
        } catch (error) {
          return { source, error };
        }
      }));
      pairs.push(...batch);
      await new Promise(resolve => setTimeout(resolve, 120));
    }
    const unavailable = pairs.filter(pair => pair.error);
    if (unavailable.length) {
      console.warn(`${year}: official town files unavailable for ${unavailable.map(x=>x.source.original).join('、')}; town drilldown omitted for this year`);
      continue;
    }
    for (const {source,tickets,profiles} of pairs) {
      for (const row of profiles) {
        const town = normalizeTown(source.current,row.area_name), id = `${source.current}|${town}`;
        const bucket = townBuckets.get(id) || { county:source.current, town, candidates:new Map(), validVotes:0, stats:{} };
        addProfile(bucket.stats,profile(row)); bucket.validVotes=bucket.stats.validVotes; townBuckets.set(id,bucket);
      }
      for (const row of tickets) {
        if (String(row.is_vice).trim().toUpperCase() === 'Y') continue;
        const town=normalizeTown(source.current,row.area_name), id=`${source.current}|${town}`, bucket=townBuckets.get(id);
        assert(bucket,`${year}: town ticket without profile ${id}`);
        const no=String(row.cand_no),old=bucket.candidates.get(no);
        if(old)old.votes+=number(row.ticket_num);else bucket.candidates.set(no,{no,name:row.cand_name,party:row.party_name,votes:number(row.ticket_num)});
      }
    }
    const townOut = Object.fromEntries(CURRENT_COUNTIES.map(county=>[county,{}]));
    for(const bucket of townBuckets.values()){
      const result=finalizeResult(bucket);
      assert(result.candidates.reduce((sum,c)=>sum+c.votes,0)===result.validVotes,`${year} ${bucket.county} ${bucket.town}: town sum mismatch`);
      townOut[bucket.county][bucket.town]=result;
    }
    for(const county of CURRENT_COUNTIES){
      const all=Object.values(townOut[county]);
      assert(all.length,`${year}: no town data for ${county}`);
      for(const candidate of cOut[county].candidates){
        const sum=all.reduce((total,result)=>total+number(result.candidates.find(c=>String(c.no)===String(candidate.no))?.votes),0);
        assert(sum===candidate.votes,`${year} ${county} candidate ${candidate.no}: towns ${sum} != county ${candidate.votes}`);
      }
    }
    towns.years[String(year)]={ themeId:theme.theme_id, counties:townOut };
    console.log(`${year}: official national + 22 counties + ${townBuckets.size} towns`);
  }
  national.elections.sort((a,b)=>b.year-a.year);
  towns.coverage = Object.keys(towns.years).map(Number).sort((a,b)=>a-b);
  towns.note = `${towns.coverage.join('、')} 鄉鎮市區結果皆由中選會官方資料建置；每屆已正規化並驗證為現行 368 區。`;
  await Promise.all([
    fs.writeFile(OUT('presidential.json'),`${JSON.stringify(national,null,2)}\n`),
    fs.writeFile(OUT('presidential-counties.json'),`${JSON.stringify(counties,null,2)}\n`),
    fs.writeFile(OUT('presidential-towns.json'),`${JSON.stringify(towns,null,2)}\n`),
  ]);
}

async function buildLocalExecutives() {
  const [c1List,c2List] = await Promise.all([json(`${BASE}/list/ELC_C1.json`),json(`${BASE}/list/ELC_C2.json`)]);
  const themes = [
    ...(c1List.find(x=>x.area_name==='全國')?.theme_items||[]).map(x=>({...x,subject:'C1'})),
    ...(c2List.find(x=>x.area_name==='全國')?.theme_items||[]).map(x=>({...x,subject:'C2'})),
  ].filter(x=>x.has_data)
    .map(x=>{
      const electionYear=Number(String(x.vote_date).slice(0,4));
      const cycleYear=x.subject==='C2'&&electionYear<2014?electionYear+1:electionYear;
      return {...x,electionYear,cycleYear};
    })
    .sort((a,b)=>String(a.vote_date).localeCompare(String(b.vote_date)));
  const output={
    schemaVersion:2,type:'local-executive',coverage:[1994,1998,2002,2006,2010,2014,2018,2022],
    source:{name:'中央選舉委員會選舉資料庫',url:'https://db.cec.gov.tw/ElecTable/Election',listApis:[`${BASE}/list/ELC_C1.json`,`${BASE}/list/ELC_C2.json`],ticketApi:`${BASE}/data/tickets/ELC/{C1|C2}/00/{theme}/C/00_000_00_000_0000.json`,profileApi:`${BASE}/data/profiles/ELC/{C1|C2}/00/{theme}/C/00_000_00_000_0000.json`},
    note:'收錄中選會現有全部直轄市長與縣市長官方資料。1998–2006 保留縣市合併前的 25 場選舉；2009 縣市長與 2010 直轄市長合併為同一地方首長週期；1994 因官方全國清單尚無 1993 縣市長資料，僅有臺北市、高雄市兩場直轄市長選舉。2022 嘉義市採 12 月 18 日重行選舉正式結果。',years:{}
  };
  for(const theme of themes){
    const year=theme.cycleYear;
    const [ticketsPayload,profilesPayload]=await Promise.all([json(apiUrl('tickets',theme.subject,theme.theme_id,'C')),json(apiUrl('profiles',theme.subject,theme.theme_id,'C'))]);
    const profiles=rows(profilesPayload), tickets=rows(ticketsPayload);
    const yearData=output.years[String(year)]||(output.years[String(year)]={cycleYear:year,date:theme.vote_date,dates:[],races:{},currentAreas:{},themes:[]});
    if(!yearData.dates.includes(theme.vote_date))yearData.dates.push(theme.vote_date);
    yearData.themes.push({subject:theme.subject,themeId:theme.theme_id,name:theme.theme_name,date:theme.vote_date});
    if(theme.vote_date>yearData.date)yearData.date=theme.vote_date;
    for(const row of profiles){
      const area=normalizeText(row.area_name),currentArea=normalizeCounty(area),stats=profile(row),existing=yearData.races[area]||{area,currentArea,candidates:[]};
      Object.assign(existing,stats); if(theme.theme_name.includes('重行選舉'))existing.note=`${theme.vote_date} 重行選舉`;
      yearData.races[area]=existing;
      const mapped=yearData.currentAreas[currentArea]||(yearData.currentAreas[currentArea]=[]);
      if(!mapped.includes(area))mapped.push(area);
    }
    const grouped=new Map();
    for(const row of tickets){const area=normalizeText(row.area_name);if(!grouped.has(area))grouped.set(area,[]);grouped.get(area).push({area,no:String(row.cand_no),name:row.cand_name,party:row.party_name,partyKey:partyKey(row.party_name),votes:number(row.ticket_num),elected:won(row.is_victor),...(theme.theme_name.includes('重行選舉')?{note:`${theme.vote_date} 重行選舉`}:{})});}
    for(const [area,candidates] of grouped){
      const race=yearData.races[area]||{area};race.candidates=candidates.sort((a,b)=>Number(a.no)-Number(b.no));
      race.validVotes=number(race.validVotes)||race.candidates.reduce((sum,c)=>sum+c.votes,0);
      race.candidates.forEach(candidate=>candidate.share=race.validVotes?round(candidate.votes/race.validVotes*100,4):0);
      const ranking=[...race.candidates].sort((a,b)=>b.votes-a.votes);race.winner=ranking[0]||null;race.margin=number(ranking[0]?.votes)-number(ranking[1]?.votes);yearData.races[area]=race;
    }
  }
  const expectedCounts=new Map([[1994,2],[1998,25],[2002,25],[2006,25],[2010,22],[2014,22],[2018,22],[2022,22]]);
  for(const [year,expected] of expectedCounts){
    const yearData=output.years[String(year)],races=yearData?.races||{};
    assert(Object.keys(races).length===expected,`${year}: expected ${expected} mayor races, got ${Object.keys(races).length}`);
    yearData.raceCount=expected;
    yearData.complete=year!==1994;
    yearData.dates.sort();
    for(const [area,race] of Object.entries(races)){assert(race.candidates.reduce((sum,c)=>sum+c.votes,0)===race.validVotes,`${year} ${area}: mayor sum mismatch`);assert(race.candidates.filter(c=>c.elected).length===1,`${year} ${area}: expected one elected candidate`);}
    if(year>=2010){for(const county of CURRENT_COUNTIES)assert(yearData.currentAreas[county]?.length===1,`${year}: missing unambiguous current county ${county}`);}
    console.log(`${year}: ${expected} official local executive races${year===1994?' (partial official coverage)':''}`);
  }
  await fs.writeFile(OUT('local-executive.json'),`${JSON.stringify(output,null,2)}\n`);
}

function councilorCycleYear(subject, electionYear) {
  if (subject === 'T2' && (electionYear === 2005 || electionYear === 2009)) return electionYear + 1;
  return electionYear;
}

function blankCouncilorStats() {
  return { population:0, electors:0, votesCast:0, validVotes:0, invalidVotes:0, candidateCount:0, electedSeats:0 };
}

function addCouncilorStats(target, incoming) {
  target.population += number(incoming.population);
  target.electors += number(incoming.electors);
  target.votesCast += number(incoming.votesCast);
  target.validVotes += number(incoming.validVotes);
  target.invalidVotes += number(incoming.invalidVotes);
  target.candidateCount += number(incoming.candidateCount);
  target.electedSeats += number(incoming.electedSeats);
  target.turnout = target.electors ? round(target.votesCast / target.electors * 100) : 0;
  return target;
}

function councilorProfile(row) {
  return {
    ...profile(row),
    candidateCount:number(row.cand_num),
    electedSeats:number(row.elected_num),
  };
}

async function buildCouncilors() {
  const [t1List,t2List] = await Promise.all([json(`${BASE}/list/ELC_T1.json`),json(`${BASE}/list/ELC_T2.json`)]);
  const themes = [
    ...(t1List.find(x=>x.area_name==='全國')?.theme_items||[]).map(x=>({...x,subject:'T1'})),
    ...(t2List.find(x=>x.area_name==='全國')?.theme_items||[]).map(x=>({...x,subject:'T2'})),
  ].filter(x=>x.has_data).map(x=>{
    const electionYear=Number(String(x.vote_date).slice(0,4));
    return {...x,electionYear,cycleYear:councilorCycleYear(x.subject,electionYear)};
  }).sort((a,b)=>String(a.vote_date).localeCompare(String(b.vote_date))||String(a.legislator_type_id).localeCompare(String(b.legislator_type_id)));
  const output={
    schemaVersion:1,
    type:'councilor',
    coverage:[1994,1998,2002,2006,2010,2014,2018,2022],
    source:{
      name:'中央選舉委員會選舉資料庫',
      url:'https://db.cec.gov.tw/ElecTable/Election',
      listApis:[`${BASE}/list/ELC_T1.json`,`${BASE}/list/ELC_T2.json`],
      ticketApi:`${BASE}/data/tickets/ELC/{T1|T2}/{T1|T2|T3}/{theme}/C/00_000_00_000_0000.json`,
      profileApi:`${BASE}/data/profiles/ELC/{T1|T2}/{T1|T2|T3}/{theme}/C/00_000_00_000_0000.json`,
    },
    note:'收錄中選會現有全部直轄市議員與縣市議員官方結果，合併區域、平地原住民及山地原住民選舉。1994 僅有臺北市、高雄市直轄市議員資料；1998–2006 保留縣市合併前行政區；2009 縣市議員與 2010 直轄市議員合併為同一地方選舉週期。',
    years:{},
  };
  for(const theme of themes){
    const legis=theme.legislator_type_id;
    const [ticketsPayload,profilesPayload]=await Promise.all([
      json(`${BASE}/data/tickets/ELC/${theme.subject}/${legis}/${theme.theme_id}/C/00_000_00_000_0000.json`),
      json(`${BASE}/data/profiles/ELC/${theme.subject}/${legis}/${theme.theme_id}/C/00_000_00_000_0000.json`),
    ]);
    const tickets=rows(ticketsPayload),countyProfiles=rows(profilesPayload),year=theme.cycleYear;
    const yearData=output.years[String(year)]||(output.years[String(year)]={cycleYear:year,dates:[],themes:[],counties:{},currentAreas:{}});
    if(!yearData.dates.includes(theme.vote_date))yearData.dates.push(theme.vote_date);
    yearData.themes.push({subject:theme.subject,legislatorType:legis,category:theme.legislator_desc,themeId:theme.theme_id,date:theme.vote_date});
    const districtProfiles=[];
    if((theme.data_prof_seq||[]).includes('A')){
      for(let start=0;start<countyProfiles.length;start+=6){
        const batch=await Promise.all(countyProfiles.slice(start,start+6).map(async row=>{
          const key=[row.prv_code,row.city_code,row.area_code||'00','000','0000'].join('_');
          return {area:normalizeText(row.area_name),rows:rows(await json(`${BASE}/data/profiles/ELC/${theme.subject}/${legis}/${theme.theme_id}/A/${key}.json`))};
        }));
        districtProfiles.push(...batch);
        await new Promise(resolve=>setTimeout(resolve,60));
      }
    }else{
      for(const row of countyProfiles){
        const area=normalizeText(row.area_name);
        const codes=[...new Set(tickets.filter(ticket=>normalizeText(ticket.area_name)===area).map(ticket=>String(ticket.ori_area_code||ticket.area_code||'00').padStart(2,'0')))];
        assert(codes.length===1,`${year} ${area} ${theme.legislator_desc}: no district profiles and ${codes.length} candidate districts`);
        districtProfiles.push({area,rows:[{...row,area_code:codes[0]}]});
      }
    }
    const profileByArea=new Map(),districtStats=new Map();
    for(const entry of districtProfiles){
      const stats=blankCouncilorStats();
      for(const row of entry.rows){
        const item=councilorProfile(row),areaCode=String(row.area_code||'00').padStart(2,'0');
        addCouncilorStats(stats,item);districtStats.set(`${entry.area}|${areaCode}`,item);
      }
      profileByArea.set(entry.area,stats);
    }
    for(const [area,stats] of profileByArea){
      const currentArea=normalizeCounty(area);
      const county=yearData.counties[area]||(yearData.counties[area]={area,currentArea,stats:blankCouncilorStats(),categories:[],districts:[]});
      county.categories.push({id:legis,label:theme.legislator_desc,...stats});
      addCouncilorStats(county.stats,stats);
      const mapped=yearData.currentAreas[currentArea]||(yearData.currentAreas[currentArea]=[]);
      if(!mapped.includes(area))mapped.push(area);
    }
    const grouped=new Map();
    for(const row of tickets){
      const area=normalizeText(row.area_name),areaCode=String(row.ori_area_code||row.area_code||'00').padStart(2,'0');
      const key=`${area}|${legis}|${areaCode}`;
      if(!grouped.has(key))grouped.set(key,{area,areaCode,category:theme.legislator_desc,legislatorType:legis,candidates:[]});
      grouped.get(key).candidates.push({
        no:String(row.cand_no),name:normalizeText(row.cand_name),party:normalizeText(row.party_name),partyKey:partyKey(row.party_name),
        votes:number(row.ticket_num),elected:won(row.is_victor),incumbent:String(row.is_current||'').trim().toUpperCase()==='Y',
        sex:String(row.cand_sex||''),birthYear:number(row.cand_birthyear)||null,education:normalizeText(row.cand_edu),
      });
    }
    const ticketSums=new Map();
    for(const district of grouped.values()){
      const county=yearData.counties[district.area];
      assert(county,`${year} ${district.area} ${district.category}: tickets without profile`);
      district.candidates.sort((a,b)=>Number(a.no)-Number(b.no));
      const calculatedValidVotes=district.candidates.reduce((sum,c)=>sum+c.votes,0);
      const officialDistrict=districtStats.get(`${district.area}|${district.areaCode}`);
      assert(officialDistrict,`${year} ${district.area} ${district.category} ${district.areaCode}: missing district profile`);
      Object.assign(district,officialDistrict);
      if(officialDistrict.validVotes!==calculatedValidVotes)district.reportedValidVotes=officialDistrict.validVotes;
      district.validVotes=calculatedValidVotes;
      district.votesCast=district.validVotes+district.invalidVotes;
      district.turnout=district.electors?round(district.votesCast/district.electors*100):0;
      district.candidateCount=district.candidates.length;
      district.electedSeats=district.candidates.filter(c=>c.elected).length;
      district.candidates.forEach(c=>c.share=district.validVotes?round(c.votes/district.validVotes*100,4):0);
      district.id=`${district.legislatorType}-${district.areaCode}`;
      district.name=district.category==='區域'?`第${district.areaCode}選舉區`:`${district.category}${district.areaCode==='00'?'':`第${district.areaCode}選舉區`}`;
      county.districts.push(district);
      const sumKey=`${district.area}|${legis}`;ticketSums.set(sumKey,number(ticketSums.get(sumKey))+district.validVotes);
    }
    await new Promise(resolve=>setTimeout(resolve,80));
  }
  for(const [year,yearData] of Object.entries(output.years)){
    const national=blankCouncilorStats(),partySeats={},partyVotes={};
    for(const county of Object.values(yearData.counties)){
      county.districts.sort((a,b)=>a.legislatorType.localeCompare(b.legislatorType)||a.areaCode.localeCompare(b.areaCode));
      county.stats=blankCouncilorStats();
      for(const district of county.districts)addCouncilorStats(county.stats,district);
      county.partySeats={};county.partyVotes={};
      for(const district of county.districts){
        for(const candidate of district.candidates){
          county.partyVotes[candidate.party]=(county.partyVotes[candidate.party]||0)+candidate.votes;
          partyVotes[candidate.party]=(partyVotes[candidate.party]||0)+candidate.votes;
          if(candidate.elected){county.partySeats[candidate.party]=(county.partySeats[candidate.party]||0)+1;partySeats[candidate.party]=(partySeats[candidate.party]||0)+1;}
        }
      }
      const leading=[...Object.entries(county.partySeats)].sort((a,b)=>b[1]-a[1]||a[0].localeCompare(b[0],'zh-Hant'));
      county.leadingParty=leading.length&&leading[0][1]!==leading[1]?.[1]?leading[0][0]:null;
      county.leadingPartyKey=county.leadingParty?partyKey(county.leadingParty):'IND';
      assert(county.districts.reduce((sum,d)=>sum+d.validVotes,0)===county.stats.validVotes,`${year} ${county.area}: district sum mismatch`);
      assert(county.districts.reduce((sum,d)=>sum+d.electedSeats,0)===county.stats.electedSeats,`${year} ${county.area}: seat sum mismatch`);
      addCouncilorStats(national,county.stats);
    }
    yearData.dates.sort();
    yearData.countyCount=Object.keys(yearData.counties).length;
    yearData.districtCount=Object.values(yearData.counties).reduce((sum,c)=>sum+c.districts.length,0);
    yearData.stats=national;yearData.partySeats=partySeats;yearData.partyVotes=partyVotes;yearData.complete=Number(year)!==1994;
    console.log(`${year}: ${yearData.countyCount} councils, ${yearData.districtCount} districts, ${national.electedSeats} elected seats`);
  }
  assert(JSON.stringify(output).includes('db.cec.gov.tw'),'councilor source metadata missing');
  await fs.writeFile(OUT('councilor.json'),`${JSON.stringify(output)}\n`);
}

if(process.argv.includes('--councilor-only')) await buildCouncilors();
else {
  if(!process.argv.includes('--local-only'))await buildPresident();
  await buildLocalExecutives();
  await buildCouncilors();
}
