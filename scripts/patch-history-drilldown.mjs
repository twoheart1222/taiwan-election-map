import fs from 'node:fs/promises';
import path from 'node:path';
import process from 'node:process';

const file = path.join(process.cwd(), 'history/index.html');
let html = await fs.readFile(file, 'utf8');

const start = html.indexOf('function renderCounty(name,result){');
const boundary = html.indexOf('\n}\n\nfunction paintMap(){', start);
if (start < 0 || boundary < 0) throw new Error('Could not locate renderCounty() insertion point');

const insertion = `
  if([2020,2024].includes(Number(current.year))){
    const link=document.createElement('a');
    link.dataset.historyTownDrilldown='true';
    link.href=\`./town.html?year=\${current.year}&county=\${encodeURIComponent(name)}\`;
    link.textContent=\`查看 \${name} 鄉鎮市區 →\`;
    link.style.cssText='display:block;margin:12px 18px 16px;padding:12px 14px;border:1px solid #493d38;border-radius:12px;background:#211a18;color:#f4f1ea;font-size:12px;font-weight:900;text-align:center;transition:.15s';
    link.addEventListener('mouseenter',()=>{link.style.borderColor='#E4022B';link.style.color='#E4022B'});
    link.addEventListener('mouseleave',()=>{link.style.borderColor='#493d38';link.style.color='#f4f1ea'});
    $('county-detail').appendChild(link);
  }
`;

// Rebuild the renderCounty() tail deterministically so repeated/racing workflows
// cannot append a second drilldown CTA.
let renderCounty = html.slice(start, boundary);
const blockPattern = /\n  if\(\[2020,2024\]\.includes\(Number\(current\.year\)\)\)\{\n    const link=document\.createElement\('a'\);\n    link\.dataset\.historyTownDrilldown='true';[\s\S]*?\n  \}\n/g;
renderCounty = renderCounty.replace(blockPattern, '');
html = html.slice(0, start) + renderCounty + insertion + html.slice(boundary);

const markerCount = (html.match(/link\.dataset\.historyTownDrilldown='true'/g) || []).length;
if (markerCount !== 1) throw new Error(`Expected exactly one township drilldown block, found ${markerCount}`);

html = html.replace(
  '1996–2016 縣市層級由中選會原始格式鏡像自動建置並以全國票數交叉驗證；本站為非官方整理。',
  '1996–2024 縣市層級皆經逐候選人票數加總驗證；2020、2024 另提供鄉鎮市區下探。本站為非官方整理。',
);

await fs.writeFile(file, html, 'utf8');
console.log('history/index.html township drilldown link is present exactly once.');
