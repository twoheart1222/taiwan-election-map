import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..');
const DATA=path.join(ROOT,'data/history/local-executive.json');
const RUNTIME=path.join(ROOT,'history/local-executive.js');
const YEARS=[2014,2018,2022];
const COUNTIES=['臺北市','新北市','桃園市','臺中市','臺南市','高雄市','基隆市','新竹市','嘉義市','新竹縣','苗栗縣','彰化縣','南投縣','雲林縣','嘉義縣','屏東縣','宜蘭縣','花蓮縣','臺東縣','澎湖縣','金門縣','連江縣'];
function assert(ok,message){if(!ok)throw new Error(message)}

const artifact=JSON.parse(await fs.readFile(DATA,'utf8'));
assert(artifact.schemaVersion===1,'schemaVersion must be 1');
assert(artifact.electionType==='local-executive','wrong electionType');
assert(JSON.stringify(artifact.years)===JSON.stringify(YEARS),'year catalog mismatch');
assert(JSON.stringify(artifact.counties)===JSON.stringify(COUNTIES),'county catalog mismatch');

for(const year of YEARS){
  const election=artifact.elections?.[String(year)];
  assert(election?.year===year,`${year}: election payload missing`);
  const names=Object.keys(election.races||{});
  assert(names.length===22,`${year}: expected 22 races, got ${names.length}`);
  assert(COUNTIES.every(name=>names.includes(name)),`${year}: county set incomplete`);
  for(const county of COUNTIES){
    const race=election.races[county];
    assert(race.area===county,`${year} ${county}: area mismatch`);
    assert(Array.isArray(race.candidates)&&race.candidates.length>=1,`${year} ${county}: candidate list missing`);
    const elected=race.candidates.filter(c=>c.elected);
    assert(elected.length===1,`${year} ${county}: expected exactly one winner`);
    assert(race.winner?.no===elected[0].no,`${year} ${county}: winner object mismatch`);
    const sum=race.candidates.reduce((total,c)=>total+Number(c.votes||0),0);
    assert(sum===race.validVotes,`${year} ${county}: validVotes mismatch`);
    const ranked=[...race.candidates].sort((a,b)=>b.votes-a.votes);
    assert(race.margin===(ranked.length>1?ranked[0].votes-ranked[1].votes:ranked[0].votes),`${year} ${county}: margin mismatch`);
  }
}

const facts=[
  [2014,'臺北市','柯文哲',853983],
  [2022,'臺北市','蔣萬安',575590],
  [2022,'嘉義市','黃敏惠',59874],
];
for(const [year,county,name,votes] of facts){
  const winner=artifact.elections[String(year)].races[county].winner;
  assert(winner.name===name&&winner.votes===votes,`known result mismatch: ${year} ${county}`);
}
assert(artifact.elections['2022'].races['嘉義市'].note.includes('2022-12-18'),'Chiayi rerun note missing');

const runtime=await fs.readFile(RUNTIME,'utf8');
assert(runtime.includes('../data/history/local-executive.json'),'runtime must load same-origin static history JSON');
assert(!runtime.includes('raw.githubusercontent.com'),'runtime must not depend on GitHub raw CSV');

console.log('Local executive static history validation passed: 3 elections × 22 counties, known results, Chiayi supplement, no runtime GitHub raw dependency.');
