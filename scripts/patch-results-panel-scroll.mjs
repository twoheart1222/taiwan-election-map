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
  'results kicker',
  "let html = `<div style=\"font-family:'Archivo',sans-serif;font-weight:700;font-size:11px;letter-spacing:.24em;color:#E4022B;margin-bottom:14px\">選情數據 / RESULTS</div>`;",
  "let html = `<div class=\"results-kicker\" style=\"font-family:'Archivo',sans-serif;font-weight:700;font-size:11px;line-height:1.4;letter-spacing:.24em;color:#E4022B;min-height:16px;overflow:visible;margin-bottom:14px\">選情數據 / RESULTS</div>`;"
);

replaceOnce(
  'results async insert scroll reset',
  "    box.querySelector('.res-panel')?.remove();\n    box.insertBefore(el, box.firstChild);\n    box.scrollTop = 0;",
  "    box.querySelector('.res-panel')?.remove();\n    box.insertBefore(el, box.firstChild);\n    // 手機實際捲動容器是 .drawer-body-scroll。結果卡是非同步插入到候選人前方，\n    // 瀏覽器 scroll anchoring 會為了維持原本候選人位置而把新插入的 RESULTS 標題推到視窗上方。\n    const scrollShell = document.querySelector('.drawer-body-scroll');\n    const resetResultScroll = () => {\n      box.scrollTop = 0;\n      if (scrollShell) scrollShell.scrollTop = 0;\n    };\n    resetResultScroll();\n    requestAnimationFrame(resetResultScroll);"
);

fs.writeFileSync(file, html);
console.log('Patched election results panel scroll anchoring and heading metrics.');
