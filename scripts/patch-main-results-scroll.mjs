import fs from 'node:fs';

const file = 'index.html';
let html = fs.readFileSync(file, 'utf8');

function replaceOnce(label, from, to) {
  if (!html.includes(from)) throw new Error(`${label}: target not found`);
  if (html.indexOf(from) !== html.lastIndexOf(from)) throw new Error(`${label}: target is not unique`);
  html = html.replace(from, to);
}

replaceOnce(
  'mobile drawer scroll anchor',
  ".drawer-body-scroll{flex:1 !important;min-height:0 !important;overflow-y:scroll !important;overscroll-behavior-y:contain;touch-action:pan-y;-webkit-overflow-scrolling:touch;padding-top:2px}",
  ".drawer-body-scroll{flex:1 !important;min-height:0 !important;overflow-y:scroll !important;overscroll-behavior-y:contain;touch-action:pan-y;-webkit-overflow-scrolling:touch;padding-top:2px;overflow-anchor:none}"
);

replaceOnce(
  'results toggle metrics',
  ".res-panel-toggle{width:100%;display:flex;align-items:center;justify-content:space-between;gap:14px;border:0;background:transparent;color:#E4022B;padding:0;cursor:pointer;text-align:left;font:700 11px 'Archivo','Noto Sans TC',sans-serif;letter-spacing:.2em}",
  ".res-panel-toggle{width:100%;display:flex;align-items:center;justify-content:space-between;gap:14px;border:0;background:transparent;color:#E4022B;padding:0;cursor:pointer;text-align:left;font:700 11px 'Archivo','Noto Sans TC',sans-serif;letter-spacing:.2em;line-height:1.4;min-height:18px;overflow:visible}"
);

replaceOnce(
  'results async insert scroll reset',
  "    box.querySelector('.res-panel')?.remove();\n    box.insertBefore(el, box.firstChild);\n    box.scrollTop = 0;",
  "    box.querySelector('.res-panel')?.remove();\n    box.insertBefore(el, box.firstChild);\n    // RESULTS 會非同步插到候選人前面；手機瀏覽器的 scroll anchoring 可能保留舊視角，\n    // 讓新插入的標題落到捲動視窗上方，因此同時重設實際 drawer 捲動容器。\n    const scrollShell = document.querySelector('.drawer-body-scroll');\n    const resetResultScroll = () => {\n      box.scrollTop = 0;\n      if (scrollShell) scrollShell.scrollTop = 0;\n    };\n    resetResultScroll();\n    requestAnimationFrame(resetResultScroll);"
);

fs.writeFileSync(file, html);
console.log('Patched main mobile RESULTS scroll anchoring and heading metrics.');
