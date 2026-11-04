// Filter complete editorial reports; the reports and charts remain readable without JS.
const filters=document.querySelector('.report-filters');
if(filters){
  const buttons=[...filters.querySelectorAll('button')];
  const reports=[...document.querySelectorAll('.report-card')];
  const status=document.getElementById('report-filter-status');
  for(const button of buttons)button.addEventListener('click',()=>{
    const category=button.dataset.reportFilter;
    for(const b of buttons)b.setAttribute('aria-pressed',String(b===button));
    for(const report of reports)report.hidden=category!=='全部'&&report.dataset.reportCategory!==category;
    status.textContent=`${category} · ${reports.filter(r=>!r.hidden).length} 篇圖表短報`;
  });
  filters.hidden=false;
}
