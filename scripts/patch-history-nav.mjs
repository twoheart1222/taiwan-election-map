import fs from 'node:fs/promises';
import process from 'node:process';

const file = 'index.html';
let html = await fs.readFile(file, 'utf8');

const desktopNeedle = '<a href="#" data-view="map" class="navlink on">選舉地圖</a>';
const desktopInsert = `${desktopNeedle}\n        <a href="./history/" class="navlink">歷年選舉</a>`;
const mobileNeedle = '<a href="#" data-view="map">選舉地圖 <span aria-hidden="true">→</span></a>';
const mobileInsert = `${mobileNeedle}\n        <a href="./history/">歷年選舉 <span aria-hidden="true">→</span></a>`;

if (!html.includes('href="./history/" class="navlink"')) {
  if (!html.includes(desktopNeedle)) throw new Error('Desktop nav anchor changed; refusing to patch index.html.');
  html = html.replace(desktopNeedle, desktopInsert);
}

if (!html.includes('href="./history/">歷年選舉 <span')) {
  if (!html.includes(mobileNeedle)) throw new Error('Mobile nav anchor changed; refusing to patch index.html.');
  html = html.replace(mobileNeedle, mobileInsert);
}

await fs.writeFile(file, html, 'utf8');
console.log('index.html history navigation is present.');
