import fs from 'node:fs/promises';
import path from 'node:path';

const ROOT=process.cwd();
const files=['history/index.html','history/town.html'];

function patch(html,file){
  if(!html.includes('<meta name="color-scheme" content="dark">')){
    html=html.replace('<meta name="theme-color" content="#0d0d0d">','<meta name="theme-color" content="#0d0d0d">\n<meta name="color-scheme" content="dark">');
  }
  if(!html.includes('href="./product-ui.css"')){
    const needle='</style>\n</head>';
    if(!html.includes(needle))throw new Error(`${file}: missing </style> anchor`);
    html=html.replace(needle,'</style>\n<link rel="stylesheet" href="./product-ui.css">\n</head>');
  }
  if(!html.includes('cdnjs.cloudflare.com/ajax/libs/gsap/3.12.5/gsap.min.js')){
    const needle='</body>';
    if(!html.includes(needle))throw new Error(`${file}: missing </body>`);
    html=html.replace(needle,'<script src="https://cdnjs.cloudflare.com/ajax/libs/gsap/3.12.5/gsap.min.js"></script>\n<script src="./product-ui.js"></script>\n</body>');
  }

  // The archive's base CSS provides a neutral fallback `fill` on .county.
  // A CSS fill property outranks an SVG presentation attribute, so D3 must
  // write winner colors as an inline style rather than attr('fill', ...).
  if(file==='history/index.html'){
    html=html.replace(
      ".attr('fill',d=>{const r=countyResult(current,featureName(d));return r?partyColor(current,r.winnerNo):'#201d1a'});",
      ".style('fill',d=>{const r=countyResult(current,featureName(d));return r?partyColor(current,r.winnerNo):'#201d1a'});",
    );
    if(!html.includes(".style('fill',d=>{const r=countyResult(current,featureName(d));return r?partyColor(current,r.winnerNo):'#201d1a'});")){
      throw new Error(`${file}: dynamic county fill patch is missing`);
    }
  }
  return html;
}

for(const rel of files){
  const p=path.join(ROOT,rel);
  const before=await fs.readFile(p,'utf8');
  const after=patch(before,rel);
  if(after!==before){await fs.writeFile(p,after,'utf8');console.log(`patched ${rel}`)}else console.log(`${rel} product UI is present`);
}
