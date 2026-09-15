// 使用相對路徑載入 data/ 下的檔案
async function initSupportData() {
  const quotaEl = document.getElementById('quotaContainer');
  const townEl = document.getElementById('townMapContainer');

  try {
    const quotaRes = await fetch('data/district_quota.json');
    if (quotaRes.ok) {
      const quotaData = await quotaRes.json();
      if (quotaEl) {
        quotaEl.innerHTML = `<pre class="bg-slate-900/80 p-4 rounded-xl overflow-x-auto text-xs text-slate-300">${JSON.stringify(quotaData, null, 2)}</pre>`;
      }
    }
  } catch (e) {
    if (quotaEl) quotaEl.innerHTML = '<span class="text-red-400">配額資料載入失敗</span>';
  }

  try {
    const townRes = await fetch('data/district_town_map.json');
    if (townRes.ok) {
      const townData = await townRes.json();
      if (townEl) {
        townEl.innerHTML = `<pre class="bg-slate-900/80 p-4 rounded-xl overflow-x-auto text-xs text-slate-300">${JSON.stringify(townData, null, 2)}</pre>`;
      }
    }
  } catch (e) {
    if (townEl) townEl.innerHTML = '<span class="text-red-400">鄉鎮對照資料載入失敗</span>';
  }
}

document.addEventListener('DOMContentLoaded', initSupportData);