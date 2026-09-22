import fs from 'node:fs';

const file = 'index.html';
let html = fs.readFileSync(file, 'utf8');

const from = "const wrap = win ? 'padding:10px 12px;margin:2px -12px;border-radius:14px;background:linear-gradient(90deg,rgba(228,2,43,.20),rgba(228,2,43,.05));box-shadow:inset 0 0 0 1px rgba(228,2,43,.45)' : 'padding:9px 0;border-top:1px solid #2a2723';";
const to = "const wrap = win ? 'padding:10px 12px;margin:2px 0;border-radius:14px;background:linear-gradient(90deg,rgba(228,2,43,.20),rgba(228,2,43,.05));box-shadow:inset 0 0 0 1px rgba(228,2,43,.45)' : 'padding:9px 0;border-top:1px solid #2a2723';";

if (!html.includes(from)) throw new Error('elected row negative-margin target not found');
if (html.indexOf(from) !== html.lastIndexOf(from)) throw new Error('elected row target is not unique');
html = html.replace(from, to);

fs.writeFileSync(file, html);
console.log('Removed negative horizontal margin from elected result row.');
