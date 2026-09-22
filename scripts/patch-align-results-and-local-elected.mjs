import fs from 'node:fs';

function replaceOnce(text, label, from, to) {
  if (!text.includes(from)) throw new Error(`${label}: target not found`);
  if (text.indexOf(from) !== text.lastIndexOf(from)) throw new Error(`${label}: target is not unique`);
  return text.replace(from, to);
}

// 1) 主頁：所有候選人列使用相同左右內距。
{
  const file = 'index.html';
  let html = fs.readFileSync(file, 'utf8');
  const from = "const wrap = win ? 'padding:10px 12px;margin:2px 0;border-radius:14px;background:linear-gradient(90deg,rgba(228,2,43,.20),rgba(228,2,43,.05));box-shadow:inset 0 0 0 1px rgba(228,2,43,.45)' : 'padding:9px 0;border-top:1px solid #2a2723';";
  const to = "const wrap = win ? 'padding:10px 12px;margin:2px 0;border-radius:14px;background:linear-gradient(90deg,rgba(228,2,43,.20),rgba(228,2,43,.05));box-shadow:inset 0 0 0 1px rgba(228,2,43,.45)' : 'padding:9px 12px;border-top:1px solid #2a2723';";
  html = replaceOnce(html, 'main result row horizontal alignment', from, to);
  fs.writeFileSync(file, html);
}

// 2) 歷年縣市長：當選樣式與總統頁一致（深色卡＋右上黃色「當選」角標）。
{
  const file = 'history/local-executive.css';
  let css = fs.readFileSync(file, 'utf8');
  const from = ".local-candidates{display:grid;gap:10px}.local-candidate{position:relative;overflow:hidden;border:1px solid #35302b;background:#171411;border-radius:15px;padding:16px}.local-candidate.elected{background:#f4f1ea;color:#171411;border-color:#f4f1ea;box-shadow:0 12px 32px rgba(0,0,0,.24)}.local-candidate.elected .local-party,.local-candidate.elected .local-vote small{color:#655e56}.local-candidate.elected:after{content:'當選 / ELECTED';position:absolute;right:-22px;top:17px;transform:rotate(8deg);border:2px solid #E4022B;color:#E4022B;border-radius:999px;padding:4px 25px;font:900 9px 'Archivo','Noto Sans TC';letter-spacing:.08em}.local-candidate-head{display:flex;align-items:flex-start;justify-content:space-between;gap:14px}.local-name{font-size:17px;font-weight:900}.local-number{display:inline-grid;place-items:center;width:24px;height:24px;border-radius:50%;margin-right:8px;background:#2a2622;color:#eee8df;font:900 11px 'Archivo'}.local-candidate.elected .local-number{background:#1a1714;color:#fff}.local-party{margin-top:5px;color:#8c857d;font-size:10px;font-weight:700}.local-vote{text-align:right;flex:none;font:900 18px 'Archivo'}.local-vote small{display:block;margin-top:3px;color:#817a72;font:700 10px 'Archivo'}.local-bar{height:5px;margin-top:12px;border-radius:999px;background:#292521;overflow:hidden}.local-bar i{display:block;height:100%;border-radius:999px}.local-candidate.elected .local-bar{background:#ddd6cd}";
  const to = ".local-candidates{display:grid;gap:10px}.local-candidate{position:relative;overflow:hidden;border:1px solid #35302b;background:#171411;border-radius:15px;padding:16px}.local-candidate.elected{border-color:#5b5147}.local-candidate.elected:before{content:'當選';position:absolute;right:0;top:0;background:var(--yellow);color:#0d0d0d;padding:5px 10px;border-bottom-left-radius:10px;font-size:10px;font-weight:900}.local-candidate-head{display:flex;align-items:flex-start;justify-content:space-between;gap:14px}.local-name{font-size:17px;font-weight:900}.local-number{display:inline-grid;place-items:center;width:24px;height:24px;border-radius:50%;margin-right:8px;background:#2a2622;color:#eee8df;font:900 11px 'Archivo'}.local-party{margin-top:5px;color:#8c857d;font-size:10px;font-weight:700}.local-vote{text-align:right;flex:none;font:900 18px 'Archivo'}.local-vote small{display:block;margin-top:3px;color:#817a72;font:700 10px 'Archivo'}.local-bar{height:5px;margin-top:12px;border-radius:999px;background:#292521;overflow:hidden}.local-bar i{display:block;height:100%;border-radius:999px}";
  css = replaceOnce(css, 'local executive elected style', from, to);
  fs.writeFileSync(file, css);
}

console.log('Patched result-row alignment and unified local-executive elected styling with president archive.');
