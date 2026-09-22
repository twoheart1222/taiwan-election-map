import fs from 'node:fs';

const file = 'index.html';
let html = fs.readFileSync(file, 'utf8');

function replaceOnce(label, from, to) {
  if (!html.includes(from)) throw new Error(`${label}: target not found`);
  if (html.indexOf(from) !== html.lastIndexOf(from)) throw new Error(`${label}: target is not unique`);
  html = html.replace(from, to);
}

replaceOnce(
  'open results content overflow',
  ".res-panel.open .res-panel-content{grid-template-rows:1fr;opacity:1;margin-top:16px}",
  ".res-panel.open .res-panel-content{grid-template-rows:1fr;opacity:1;margin-top:16px}\n  .res-panel.open .res-panel-content>div{overflow:visible}"
);

replaceOnce(
  'period heading metrics',
  "const head = (t, sub) => `<div style=\"display:flex;justify-content:space-between;align-items:baseline;gap:8px;margin:0 0 10px\"><div style=\"font-family:'Noto Sans TC',sans-serif;font-weight:900;font-size:15px;color:#f4f1ea\">${t}</div><div style=\"font-size:11px;font-weight:700;color:#8a857c\">${sub}</div></div>`;",
  "const head = (t, sub, cls = '') => `<div class=\"results-period-head ${cls}\" style=\"display:flex;justify-content:space-between;align-items:baseline;gap:8px;margin:0 0 10px;min-height:22px;line-height:1.35;overflow:visible\"><div style=\"font-family:'Noto Sans TC',sans-serif;font-weight:900;font-size:15px;line-height:1.35;color:#f4f1ea\">${t}</div><div style=\"font-size:11px;font-weight:700;line-height:1.35;color:#8a857c\">${sub}</div></div>`;"
);

replaceOnce(
  'previous election section start',
  "      html += `<div style=\"height:18px\"></div>` + head('上期（2022）', `${esc(prev.voteDate).replace(/-/g, '/')} 投票`);",
  "      html += `<section class=\"prev-election-section\" style=\"margin-top:22px;padding-top:18px;border-top:1px solid #2a2723;overflow:visible\">` + head('上期（2022）', `${esc(prev.voteDate).replace(/-/g, '/')} 投票`, 'prev-results-head');"
);

replaceOnce(
  'previous election section end',
  "      html += `<div style=\"margin-top:8px;font-size:11px;font-weight:600;line-height:1.6;color:#6f6a62\">資料來源：中央選舉委員會選舉資料庫；得票率＝得票數 ÷ 有效票。</div>`;\n    }",
  "      html += `<div style=\"margin-top:8px;font-size:11px;font-weight:600;line-height:1.6;color:#6f6a62\">資料來源：中央選舉委員會選舉資料庫；得票率＝得票數 ÷ 有效票。</div></section>`;\n    }"
);

fs.writeFileSync(file, html);
console.log('Patched previous election section clipping.');
