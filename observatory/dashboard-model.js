// Pure rendering shared by the static build and the browser. No live candidate writes.
export const escapeHtml = value => String(value ?? '').replace(/[&<>"']/g, c => ({ '&':'&amp;', '<':'&lt;', '>':'&gt;', '"':'&quot;', "'":'&#39;' }[c]));
const number = (value, digits = 0) => Number(value).toLocaleString('zh-TW', { minimumFractionDigits: digits, maximumFractionDigits: digits });
export const delta = row => Math.round((row.b - row.a) * 100) / 100;
export const valueText = (metric, value) => number(value, metric.digits) + metric.unit;
export const deltaText = (metric, value) => `${value > 0 ? '+' : value < 0 ? '−' : ''}${number(Math.abs(value), metric.digits)} ${metric.deltaUnit}`;
export function selectRows(metric, county = 'all', sort = 'name') {
  if (county !== 'all' && !metric.rows.some(r => r.county === county)) throw Error('找不到此縣市資料');
  const rows = metric.rows.filter(r => county === 'all' || r.county === county);
  const name = (a, b) => a.county.localeCompare(b.county, 'zh-Hant');
  const orders = { name, deltaDesc: (a,b) => delta(b) - delta(a) || name(a,b), deltaAsc: (a,b) => delta(a) - delta(b) || name(a,b), valueDesc: (a,b) => b.b - a.b || name(a,b) };
  if (!orders[sort]) throw Error('不支援的排序方式');
  return [...rows].sort(orders[sort]);
}
export function validateDashboard(data) {
  if (data.schemaVersion !== 1 || data.metrics?.length !== 4) throw Error('資料格式不符');
  const ids = new Set();
  for (const metric of data.metrics) {
    if (ids.has(metric.id)) throw Error('分類重複'); ids.add(metric.id);
    if (metric.rows.length !== 22 || new Set(metric.rows.map(r => r.county)).size !== 22) throw Error('縣市資料不完整');
    for (const row of [metric.national, ...metric.rows]) {
      if (!Number.isFinite(row.a) || !Number.isFinite(row.b) || row.a < 0 || row.b < 0) throw Error('數值無效');
      if (metric.id === 'turnout' && (row.a > 100 || row.b > 100)) throw Error('投票率超出範圍');
    }
    if (metric.id !== 'turnout') for (const key of ['a','b']) {
      if (metric.rows.reduce((sum, r) => sum + r[key], 0) !== metric.national[key]) throw Error('縣市加總與全國不符');
    }
  }
  return data;
}
export function observations(metric, county = 'all') {
  const rows = metric.rows, national = metric.national, diff = delta(national);
  const up = rows.filter(r => delta(r) > 0).length, down = rows.filter(r => delta(r) < 0).length;
  const distribution = `22 縣市中，${up} 個增加、${down} 個減少、${22-up-down} 個持平。這是縣市加總的變化，不代表每一選區或每位選民都有相同變動。`;
  const focus = county === 'all' ? national : rows.find(r => r.county === county);
  const area = county === 'all' ? '全國' : county;
  let finding = `${area}從 2018 年的 ${valueText(metric, focus.a)}，變為 2022 年的 ${valueText(metric, focus.b)}；差異為 ${deltaText(metric, delta(focus))}。`;
  if (metric.id === 'turnout') finding += ' 差異採百分點，沒有把它寫成相對變化百分比。';
  else if (focus.a > 0) finding += ` 相對於 2018 年的變化為 ${number((focus.b-focus.a)/focus.a*100,2)}%。`;
  const max = Math.max(...rows.map(delta)), min = Math.min(...rows.map(delta));
  const names = amount => rows.filter(r => delta(r) === amount).map(r => r.county).join('、');
  const spread = `以「2022 減 2018」比較，變化值最高為${names(max)}（${deltaText(metric,max)}），最低為${names(min)}（${deltaText(metric,min)}）。此排序僅描述數值差異，不是治理表現或選情排名。`;
  let denominator;
  if (metric.id === 'turnout') denominator = '全國投票率以全國投票數除以選舉人數計算，未將 22 個縣市的百分比直接平均。投票數包含有效票與無效票。';
  else if (metric.id === 'seats') denominator = `${area}每一實際當選席次對應的參選紀錄，2018 年為 ${number(focus.candidatesA/focus.a,2)}，2022 年為 ${number(focus.candidatesB/focus.b,2)}。這是彙總比值，不是個人當選機率。`;
  else denominator = `全國淨變化為 ${deltaText(metric,diff)}；增加縣市合計多 ${number(rows.reduce((s,r)=>s+Math.max(0,delta(r)),0))} 人，減少縣市合計少 ${number(rows.reduce((s,r)=>s+Math.max(0,-delta(r)),0))} 人。正負變動抵銷後才得到全國淨值。`;
  return [finding, distribution, spread, denominator];
}
export function axisMaximum(metric) {
  const max = Math.max(1, ...metric.rows.map(r => Math.abs(delta(r))));
  const step = max > 10 ? 5 : max > 5 ? 2 : 1;
  return Math.ceil(max/step)*step;
}
export function renderPanel(metric, { county = 'all', sort = 'name' } = {}) {
  const esc = escapeHtml, rows = selectRows(metric,county,sort), focus = county === 'all' ? metric.national : rows[0];
  const area = county === 'all' ? '全國' : county, max = axisMaximum(metric), notes = observations(metric,county);
  const signed = value => `${value > 0 ? '+' : value < 0 ? '−' : ''}${number(Math.abs(value),metric.digits)}`;
  const bars = rows.map(r => {
    const change = delta(r), width = Math.abs(change)/max*50, left = change < 0 ? 50-width : 50;
    return `<li class="compare-row"><div class="compare-county">${esc(r.county)}<small>${esc(valueText(metric,r.a))} → ${esc(valueText(metric,r.b))}</small></div><div class="difference-track" aria-hidden="true"><span class="compare-bar ${change<0?'is-negative':change>0?'is-positive':'is-zero'}" style="left:${left.toFixed(4)}%;width:${width.toFixed(4)}%"></span></div><div class="compare-value"><strong>${signed(change)}</strong><span class="sr-only"> ${esc(metric.deltaUnit)}</span></div></li>`;
  }).join('');
  return `<div class="metric-heading"><div><p class="eyebrow">2018 → 2022 / ${esc(metric.tag)}</p><h2 id="metric-title">${esc(metric.title)}</h2></div><p>${esc(metric.description)}</p></div>
<div class="metric-stats">${[['2018',valueText(metric,focus.a)],['2022',valueText(metric,focus.b)],['兩屆差異',deltaText(metric,delta(focus))]].map(([label,value])=>`<div class="metric-stat"><span>${esc(area)} · ${label}</span><strong>${esc(value)}</strong></div>`).join('')}</div>
<figure class="comparison-figure" aria-labelledby="chart-title"><figcaption><div><h3 id="chart-title">${esc(area === '全國' ? '22 縣市的兩屆差異' : area+'的兩屆差異')}</h3><p>每縣市一根長條；右向增加、左向減少，圓點表示持平。</p></div><p class="chart-unit">單位：${esc(metric.deltaUnit)}<br>2022 − 2018</p></figcaption><div class="chart-axis" aria-hidden="true"><span>−${number(max)}</span><span>0</span><span>+${number(max)}</span></div><div class="chart-scroll" tabindex="0" aria-label="${esc(metric.title)}差異圖，單位${esc(metric.deltaUnit)}，可捲動查看 ${rows.length} 個縣市"><ol class="compare-chart">${bars}</ol></div><p class="chart-note">每列小字為 2018 → 2022 原值；右側數字為差異。同分類篩選前後固定採 −${number(max)} 至 +${number(max)} ${esc(metric.deltaUnit)}的對稱刻度，便於比較。</p></figure>
<section class="metric-analysis" aria-labelledby="analysis-title"><h3 id="analysis-title">客觀摘要</h3><p>${esc(notes[0])}</p><p>${esc(notes[1])}</p></section>
<details class="metric-method"><summary>展開完整分析與統計口徑</summary><p>${esc(notes[2])}</p><p>${esc(notes[3])}</p><h3>統計口徑</h3><p>${esc(metric.method)}</p><p><strong>解讀限制：</strong>${esc(metric.limit)}</p></details>
<details class="dashboard-table"><summary>查看原始數值表格（${rows.length} 個縣市）</summary><div class="table-wrap"><table><caption>${esc(metric.title)}｜2018、2022 年比較</caption><thead><tr><th scope="col">縣市</th><th scope="col">2018（${esc(metric.unit)}）</th><th scope="col">2022（${esc(metric.unit)}）</th><th scope="col">差異（${esc(metric.deltaUnit)}）</th></tr></thead><tbody>${rows.map(r=>`<tr><th scope="row">${esc(r.county)}</th><td>${number(r.a,metric.digits)}</td><td>${number(r.b,metric.digits)}</td><td>${esc(deltaText(metric,delta(r)))}</td></tr>`).join('')}</tbody></table></div></details>`;
}
export function csvFor(metric, county = 'all', sort = 'name') {
  const rows = [['分類','縣市','2018','2022',`差異（${metric.deltaUnit}）`,'數值單位'], ...selectRows(metric,county,sort).map(r=>[metric.title,r.county,r.a,r.b,delta(r),metric.unit])];
  return '\ufeff' + rows.map(row=>row.map(x=>'"'+String(x).replaceAll('"','""')+'"').join(',')).join('\r\n');
}
