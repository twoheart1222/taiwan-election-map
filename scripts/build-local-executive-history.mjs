import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..');
const OUT=path.join(ROOT,'data/history/local-executive.json');
const YEARS=[2014,2018,2022];
const COUNTIES=['臺北市','新北市','桃園市','臺中市','臺南市','高雄市','基隆市','新竹市','嘉義市','新竹縣','苗栗縣','彰化縣','南投縣','雲林縣','嘉義縣','屏東縣','宜蘭縣','花蓮縣','臺東縣','澎湖縣','金門縣','連江縣'];
const SOURCE_FILES=Object.fromEntries(YEARS.map(year=>[year,[
  `https://raw.githubusercontent.com/kiang/db.cec.gov.tw/master/data/${year}/直轄市長.csv`,
  `https://raw.githubusercontent.com/kiang/db.cec.gov.tw/master/data/${year}/縣市長.csv`,
]]));
const CHIAYI_2022=[
  {area:'嘉義市',cand_no:'1',cand_name:'黃敏惠',party:'中國國民黨',ticket_num:59874,is_victor:'Y',note:'2022-12-18 重行選舉'},
  {area:'嘉義市',cand_no:'2',cand_name:'李俊俋',party:'民主進步黨',ticket_num:32790,is_victor:'N',note:'2022-12-18 重行選舉'},
  {area:'嘉義市',cand_no:'3',cand_name:'陳泰山',party:'無黨籍及未經政黨推薦',ticket_num:246,is_victor:'N',note:'2022-12-18 重行選舉'},
  {area:'嘉義市',cand_no:'4',cand_name:'黃宏成台灣阿成世界偉人財神總統',party:'無黨籍及未經政黨推薦',ticket_num:535,is_victor:'N',note:'2022-12-18 重行選舉'},
  {area:'嘉義市',cand_no:'5',cand_name:'鄭凱升',party:'無黨籍及未經政黨推薦',ticket_num:368,is_victor:'N',note:'2022-12-18 重行選舉'},
];

function normalize(value){return String(value??'').replaceAll('台','臺').replace(/\s+/g,'').trim()}
function partyKey(party){
  party=String(party||'').trim();
  if(party==='民主進步黨')return'DPP';
  if(party==='中國國民黨')return'KMT';
  if(party==='台灣民眾黨')return'TPP';
  if(party==='親民黨')return'PFP';
  if(party==='新黨')return'NP';
  if(party.includes('無黨籍'))return'IND';
  return'OTHER';
}
function parseCsv(text){
  const rows=[];let row=[],field='',quoted=false;
  for(let i=0;i<text.length;i++){
    const ch=text[i];
    if(quoted){
      if(ch==='"'&&text[i+1]==='"'){field+='"';i++;continue}
      if(ch==='"'){quoted=false;continue}
      field+=ch;continue;
    }
    if(ch==='"'){quoted=true;continue}
    if(ch===','){row.push(field);field='';continue}
    if(ch==='\n'){row.push(field.replace(/\r$/,''));rows.push(row);row=[];field='';continue}
    field+=ch;
  }
  if(field||row.length){row.push(field.replace(/\r$/,''));rows.push(row)}
  const [header,...body]=rows.filter(r=>r.some(v=>v!==''));
  return body.map(values=>Object.fromEntries(header.map((key,index)=>[key,values[index]??''])));
}
async function fetchText(url){
  const response=await fetch(url,{headers:{'user-agent':'Formosa-Observatory-history-builder'}});
  if(!response.ok)throw new Error(`${response.status} ${url}`);
  return response.text();
}
function normalizeRow(row){
  return{
    area:normalize(row.area),
    no:String(row.cand_no??row.no??'').trim(),
    name:String(row.cand_name??row.name??'').trim(),
    party:String(row.party||'').trim(),
    partyKey:partyKey(row.party),
    votes:Number(row.ticket_num??row.votes??0),
    elected:String(row.is_victor??'').toUpperCase()==='Y'||row.elected===true,
    note:String(row.note||''),
  };
}
function buildRace(area,candidates){
  candidates.sort((a,b)=>b.votes-a.votes||Number(a.no)-Number(b.no));
  const validVotes=candidates.reduce((sum,c)=>sum+c.votes,0);
  const winner=candidates.find(c=>c.elected)||candidates[0];
  const normalized=candidates.map(c=>({...c,share:Number((validVotes?c.votes/validVotes*100:0).toFixed(8)),elected:c===winner}));
  const normalizedWinner=normalized.find(c=>c.elected);
  return{
    area,
    candidates:normalized,
    validVotes,
    winner:normalizedWinner,
    margin:normalized.length>1?normalizedWinner.votes-normalized[1].votes:normalizedWinner.votes,
    note:normalized.find(c=>c.note)?.note||'',
  };
}
function assertYear(year,races){
  const missing=COUNTIES.filter(name=>!races[name]);
  const extra=Object.keys(races).filter(name=>!COUNTIES.includes(name));
  if(missing.length||extra.length)throw new Error(`${year} 縣市集合不一致；缺少：${missing.join('、')||'無'}；多出：${extra.join('、')||'無'}`);
  for(const name of COUNTIES){
    const race=races[name];
    if(!race.candidates.length)throw new Error(`${year} ${name} 沒有候選人`);
    if(race.candidates.filter(c=>c.elected).length!==1)throw new Error(`${year} ${name} 當選者數量不是 1`);
    if(race.validVotes!==race.candidates.reduce((sum,c)=>sum+c.votes,0))throw new Error(`${year} ${name} 有效票加總不一致`);
  }
}
function assertKnownFacts(elections){
  const facts=[
    [2014,'臺北市','柯文哲',853983],
    [2022,'臺北市','蔣萬安',575590],
    [2022,'嘉義市','黃敏惠',59874],
  ];
  for(const [year,county,name,votes] of facts){
    const winner=elections[String(year)]?.races?.[county]?.winner;
    if(!winner||winner.name!==name||winner.votes!==votes)throw new Error(`已知結果驗證失敗：${year} ${county} ${name} ${votes}`);
  }
}

const elections={};
for(const year of YEARS){
  console.log(`Fetching ${year} local executive sources...`);
  const texts=await Promise.all(SOURCE_FILES[year].map(fetchText));
  const rows=texts.flatMap(parseCsv).map(normalizeRow).filter(row=>row.area&&row.name&&Number.isFinite(row.votes));
  if(year===2022&&!rows.some(row=>row.area==='嘉義市'))rows.push(...CHIAYI_2022.map(normalizeRow));
  const grouped={};
  for(const row of rows)(grouped[row.area]??=[]).push(row);
  const races={};
  for(const county of COUNTIES){if(grouped[county])races[county]=buildRace(county,grouped[county])}
  assertYear(year,races);
  elections[String(year)]={year,races};
}
assertKnownFacts(elections);

const artifact={
  schemaVersion:1,
  electionType:'local-executive',
  years:YEARS,
  counties:COUNTIES,
  sources:{
    primary:'中央選舉委員會選舉資料庫（kiang/db.cec.gov.tw 原始格式鏡像）',
    sourceFiles:SOURCE_FILES,
    supplements:{'2022-嘉義市':'2022-12-18 第 11 屆嘉義市長重行選舉正式結果'},
  },
  elections,
};
await fs.mkdir(path.dirname(OUT),{recursive:true});
await fs.writeFile(OUT,JSON.stringify(artifact,null,2)+'\n','utf8');
console.log(`Wrote ${path.relative(ROOT,OUT)}: ${YEARS.length} elections, ${COUNTIES.length} counties each.`);
