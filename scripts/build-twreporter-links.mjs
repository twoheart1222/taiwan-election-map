// Build a read-only external-profile catalog; never mutate candidate records or KV.
import fs from 'node:fs';
import { fileURLToPath } from 'node:url';
import { overridesUrl } from './_api-url.mjs';
process.chdir(fileURLToPath(new URL('..', import.meta.url)));
fs.mkdirSync('work/lawmaker', { recursive: true });
import * as cheerio from 'cheerio';
const root='https://lawmaker.twreporter.org';
const cities=[['63000','taipei'],['65000','new-taipei'],['68000','taoyuan'],['66000','taichung'],['67000','tainan'],['64000','kaohsiung']];
async function json(path){const r=await fetch(root+path);if(!r.ok)throw Error(path+':'+r.status);const j=await r.json();if(j.status!=='success'||!Array.isArray(j.data))throw Error(path+' invalid');return j.data;}
const sources=[];
for(const [code,city] of cities){
 const html=await fetch(root+'/council/'+city).then(r=>r.text());const $=cheerio.load(html);let rsc='';$('script:not([src])').each((_,e)=>{const s=$(e).text();const m=s.match(/self\.__next_f\.push\((\[[\s\S]*\])\)$/);if(m){const a=JSON.parse(m[1]);if(a[0]===1)rsc+=a[1];}});
 const meetings=JSON.parse(rsc.match(/"meetings":(\[[^\]]+\])/)[1]);
 const people=await json('/api/councilor?mid='+meetings[0].id);
 fs.writeFileSync('work/lawmaker/'+city+'.json',JSON.stringify({meetings,people},null,2));
 console.log(city,people.length);
 for(const p of people)sources.push({name:p.councilor.name,countyCode:code,kind:'council',district:p.constituency,url:root+'/council/'+city+'/lawmaker/'+p.councilor.slug});
}
const terms=await json('/api/legislative-meeting');const legislators=new Map();
for(const term of terms){const people=await json('/api/legislator?mid='+term.id);for(const p of people)legislators.set(p.legislator.slug,{name:p.legislator.name,kind:'congress',constituency:p.constituency,url:root+'/congress/lawmaker/'+p.legislator.slug});console.log('term',term.term,people.length);}
sources.push(...legislators.values());fs.writeFileSync('work/lawmaker/source-people.json',JSON.stringify(sources,null,2));
const response=await fetch(overridesUrl(), { cache: 'no-store', signal: AbortSignal.timeout(30000) });
if(!response.ok)throw Error('讀取目前候選人資料失敗：'+response.status);
const snapshot=await response.json();
if(!snapshot || Array.isArray(snapshot) || !Object.keys(snapshot).length)throw Error('候選人快照格式錯誤');
const normalize=v=>String(v||'').normalize('NFKC').replace(/[\s・．·‧]/g,'');
const matches=[],unmatchedMayors=[];
for(const [code,doc]of Object.entries(snapshot)){
 if(code.length!==5)continue;
 const groups=[{source:'candidates',candidates:doc.candidates||[]},...(doc.councilors||[]).map(b=>({source:'councilors',district:b.district,candidates:b.candidates||[]}))];
 for(const group of groups)for(const c of group.candidates){
 const same=sources.filter(p=>normalize(p.name)===normalize(c.name)&&(p.kind==='congress'||p.countyCode===code));
 const eligible=group.source==='councilors'?same.filter(p=>p.kind==='council'):same;
 const urls=[...new Set(eligible.map(p=>p.url))];
 if(urls.length===1){const person=eligible[0];matches.push({countyCode:code,source:group.source,name:c.name,district:group.district??null,sourceName:person.name,kind:person.kind,url:urls[0]});}
 else if(group.source==='candidates')unmatchedMayors.push({countyCode:code,name:c.name,reason:urls.length?'多個來源待確認':'來源未收錄'});
 }
}
const catalog={source:root,checkedAt:new Intl.DateTimeFormat('en-CA', { timeZone:'Asia/Taipei', year:'numeric', month:'2-digit', day:'2-digit' }).format(new Date()),coverage:'立法院第10、11屆及六都本屆議會；僅連結已比對的人物個人頁。',profiles:matches};
// Only publish the link catalog after every source has been fetched and compared.
fs.writeFileSync('data/twreporter-links.json.tmp',JSON.stringify(catalog,null,2)+'\n');
fs.renameSync('data/twreporter-links.json.tmp','data/twreporter-links.json');
fs.writeFileSync('work/lawmaker/match-report.json',JSON.stringify({matches,unmatchedMayors},null,2));
console.log('matches',matches.length,'council',matches.filter(p=>p.source==='councilors').length,'mayors',matches.filter(p=>p.source==='candidates').map(p=>p.name));
