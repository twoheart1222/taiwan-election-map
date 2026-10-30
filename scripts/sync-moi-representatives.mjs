import fs from 'node:fs';
import path from 'node:path';
import { load } from 'cheerio';
import '../election-data.js';
import { overridesUrl } from './_api-url.mjs';

// Audit-only by default. Official sources never add candidates or write production storage.
const sourceUrl = 'https://www.moi.gov.tw/LocalOfficial.aspx?n=575&TYP=KND0003';
const outputArg = process.argv.indexOf('--output');
const directory = path.resolve(outputArg === -1 ? 'work/representative-sync' : process.argv[outputArg + 1]);
fs.mkdirSync(directory, { recursive: true });
const clean = text => String(text || '').normalize('NFKC').replace(/[\s\u3000]/g, '').replaceAll('台', '臺');
async function html(url, filename) {
  if (process.argv.includes('--cached-source') && fs.existsSync(filename)) return fs.readFileSync(filename, 'utf8');
  const response = await fetch(url, { signal: AbortSignal.timeout(30000) });
  if (!response.ok) throw Error(`Official source failed: ${response.status} ${url}`);
  const body = await response.text(); fs.writeFileSync(filename, body); return body;
}
const first = await html(sourceUrl + '&page=1&PageSize=200', directory + '/moi-1.html');
const firstDoc = load(first);
const pages = Math.max(1, ...firstDoc('a[href*="page="]').map((_, a) => Number(new URL(firstDoc(a).attr('href'), sourceUrl).searchParams.get('page')) || 1).get());
const officials = [];
for (let n = 1; n <= pages; n++) {
  const $ = load(n === 1 ? first : await html(sourceUrl + `&page=${n}&PageSize=200`, directory + `/moi-${n}.html`));
  $('.serv-group .result-list .block').each((_, el) => {
    const b = $(el), spans = b.find('.essay .position span');
    officials.push({ name: clean(b.find('.caption span').text()), county: clean(b.find('.locate span').text()), body: clean(spans.first().text()), title: clean(spans.last().text()), party: clean(b.find('.group span').text()), url: new URL(b.find('.more-btn a').attr('href'), sourceUrl).href });
  });
}
if (officials.length < 1500 || officials.some(o => !o.name || !o.county) || new Set(officials.map(o => o.url)).size !== officials.length) throw Error('Incomplete or duplicate official source; no candidate updates produced');
const towns = fs.readdirSync('data/towns').filter(f => f.endsWith('.json')).flatMap(f => Object.values(JSON.parse(fs.readFileSync('data/towns/' + f)).objects)[0].geometries.map(g => g.properties));
for (const official of officials) {
  let matches = towns.filter(t => [official.county + t.name + '民代表會', official.county + t.name + '公所'].includes(official.body));
  if (matches.length !== 1) {
    const id = new URL(official.url).searchParams.get('_PARENT_ID');
    const text = clean(load(await html(official.url, directory + '/detail-' + id + '.html'))('body').text());
    matches = towns.filter(t => text.includes(official.county + t.name));
    official.resolvedBy = 'official-detail-office-address';
  }
  if (matches.length !== 1) throw Error(`${official.name}: official town is ambiguous; stop for review`);
  official.townId = matches[0].id; official.town = matches[0].name; official.body = official.county + official.town + '民代表會';
}
fs.writeFileSync(directory + '/officials-resolved.json', JSON.stringify(officials, null, 2));
if (!process.argv.includes('--cached-source')) {
  const response = await fetch(overridesUrl(), { cache: 'no-store', signal: AbortSignal.timeout(30000) });
  if (!response.ok) throw Error(`Snapshot failed: ${response.status}`);
  fs.writeFileSync(directory + '/current-overrides.json', await response.text());
}
const dir=directory,snapshot=JSON.parse(fs.readFileSync(dir+'/current-overrides.json')),districts=JSON.parse(fs.readFileSync('data/district_town_map.json')),base=new Map();
const norm=s=>String(s||'').normalize('NFKC').replace(/[\s\u3000・·‧]/g,'').replaceAll('台','臺');
for(const file of ['data/counties.json',...['towns','villages'].flatMap(d=>fs.readdirSync('data/'+d).filter(f=>f.endsWith('.json')).map(f=>'data/'+d+'/'+f))])for(const g of Object.values(JSON.parse(fs.readFileSync(file)).objects)[0].geometries)base.set(String(g.properties.id),g.properties);
const rows=[];for(const[id,b]of base){const a=ElectionData.mergeArea(b,snapshot[id]);for(const field of ['candidates','councilors','representatives']){const blocks=field==='candidates'?[{district:null,candidates:a.candidates||[]}]:ElectionData.blocksOf(a[field]);for(const block of blocks)for(const c of block.candidates||[])rows.push({areaId:id,county:base.get(id.slice(0,5))?.name,field,district:block.district??null,c})}}
const byName=new Map();for(const r of rows){const k=norm(r.county)+'|'+norm(r.c.name);if(!byName.has(k))byName.set(k,[]);byName.get(k).push(r)}
const records=[],review=[],unmatched=[];for(const o of officials){const same=(byName.get(norm(o.county)+'|'+norm(o.name))||[]);const local=same.filter(r=>r.areaId.slice(0,8)===o.townId||r.field==='councilors'&&(districts[r.areaId]?.districts?.[r.district]?.towns||[]).some(t=>norm(t)===norm(o.town)));const incumbent=local.filter(r=>r.field==='representatives'&&r.areaId===o.townId);const eligible=incumbent.length?incumbent:local;
 if(eligible.length!==1){(eligible.length?review:unmatched).push({official:o,candidates:same.map(({c,...r})=>({...r,name:c.name,role:c.role}))});continue}
 const r=eligible[0];if(incumbent.length&&(r.c.isCareerMove||r.c.priorRace)){review.push({official:o,candidates:[{areaId:r.areaId,field:r.field,name:r.c.name,priorRace:r.c.priorRace}],reason:'既有轉職註記與現任同職比對衝突，保留人工資料待核對'});continue}const kind=incumbent.length?'incumbent':'careerMove',office=o.title==='代表'?o.county+o.town+'民代表':o.body+o.title,fields={isIncumbent:kind==='incumbent',incumbentOffice:office,incumbentSourceUrl:o.url};if(kind==='careerMove'){fields.isCareerMove=true;fields.priorRace='現任'+office}
 // Never label a different-town namesake just because the county and name match.
 for(const excluded of same.filter(x=>x!==r))review.push({official:o,excluded:{areaId:excluded.areaId,field:excluded.field,district:excluded.district,name:excluded.c.name,role:excluded.c.role},reason:'同名候選人，未依姓名自動套用'});
 records.push({areaId:r.areaId,field:r.field,district:r.district,name:r.c.name,role:r.c.role,kind,official:{townId:o.townId,town:o.town,county:o.county,office,url:o.url},before:Object.fromEntries(Object.keys(fields).map(k=>[k,r.c[k]])),fields});
}
fs.writeFileSync(dir+'/plan.json',JSON.stringify({reviewedAt:new Date().toISOString(),sourceUrl,officialCount:officials.length,records},null,2));fs.writeFileSync(dir+'/needs-review.json',JSON.stringify({review,unmatched},null,2));console.log({records:records.length,incumbents:records.filter(r=>r.kind==='incumbent').length,career:records.filter(r=>r.kind==='careerMove').length,review:review.length,unmatched:unmatched.length});console.log('review',JSON.stringify(review.map(x=>({name:x.official.name,town:x.official.town,candidates:x.candidates,excluded:x.excluded})),null,2));console.log('career',JSON.stringify(records.filter(r=>r.kind==='careerMove').map(r=>({name:r.name,from:r.official.office,to:r.role,id:r.areaId,district:r.district})),null,2));

if (process.argv.includes('--write-review')) fs.copyFileSync(dir + '/plan.json', 'data/representative-incumbent-review-20261030.json');
