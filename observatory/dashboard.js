import { renderPanel, validateDashboard, csvFor } from './dashboard-model.js?v=20261104-difference';
const root = document.getElementById('data-observatory');
(async () => {
if (root) {
  const status = root.querySelector('#dashboard-status');
  try {
    const response = await fetch('/observatory/dashboard-data.json?v=20261104', { cache: 'no-cache' });
    if (!response.ok) throw Error('資料載入失敗');
    const data = validateDashboard(await response.json());
    const tabs = [...root.querySelectorAll('[role="tab"]')];
    const panel = root.querySelector('#metric-panel');
    const county = root.querySelector('#dashboard-county');
    const sort = root.querySelector('#dashboard-sort');
    const download = root.querySelector('#dashboard-csv');
    let active = data.metrics[0].id;
    const metric = () => data.metrics.find(m => m.id === active);
    const refresh = () => {
      panel.innerHTML = renderPanel(metric(), { county: county.value, sort: sort.value });
      status.textContent = `目前顯示：${metric().title}｜${county.value === 'all' ? '全部 22 縣市' : county.value}。圖表、分析與表格已同步更新。`;
    };
    const selectTab = id => {
      active = id;
      for (const tab of tabs) { const selected = tab.dataset.metric === id; tab.setAttribute('aria-selected', String(selected)); tab.tabIndex = selected ? 0 : -1; }
      panel.setAttribute('aria-labelledby', `metric-tab-${id}`);
      refresh();
    };
    for (const tab of tabs) {
      tab.addEventListener('click', () => selectTab(tab.dataset.metric));
      tab.addEventListener('keydown', event => {
        if (!['ArrowLeft','ArrowRight','Home','End'].includes(event.key)) return;
        event.preventDefault();
        const i = tabs.indexOf(tab);
        const next = event.key === 'Home' ? 0 : event.key === 'End' ? tabs.length-1 : (i+(event.key === 'ArrowRight'?1:-1)+tabs.length)%tabs.length;
        tabs[next].focus(); selectTab(tabs[next].dataset.metric);
      });
    }
    county.addEventListener('change',refresh); sort.addEventListener('change',refresh);
    download.addEventListener('click', () => {
      const href = URL.createObjectURL(new Blob([csvFor(metric(),county.value,sort.value)], {type:'text/csv;charset=utf-8'}));
      const link = document.createElement('a');link.href=href;link.download=`formosa-${active}-${county.value==='all'?'22-counties':county.value}-2018-2022.csv`;document.body.appendChild(link);link.click();link.remove();setTimeout(()=>URL.revokeObjectURL(href),1000);
    });
    root.querySelector('#dashboard-controls').hidden = false;
    root.querySelector('#metric-tabs').hidden = false;
    refresh();
  } catch (_) {
    status.textContent = '互動資料暫時無法載入，下方仍保留完整的投票率圖表、分析與表格。可使用文末整理檔核對。';
  }
}

})();
