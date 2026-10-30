// Uses the same revision-checked candidate write API as the editor.
(() => {
  const reviewUrl = '/data/representative-incumbent-review-20261030.json';
  let plan;
  const setup = () => {
    const host = document.getElementById('kv-social-sync-card');
    if (!host) return;
    const section = document.createElement('section');
    section.id = 'representative-incumbent-manager';
    section.className = 'mt-5 border-t border-ink-200 pt-5';
    section.innerHTML = '<h3 class="font-black text-sm mb-2">鄉鎮市民代表：現任與轉職核對</h3><p class="text-xs text-ink-500 mb-3">依內政部現任名冊、鄉鎮與姓名核對。原職參選標記連任；其他職位標記現任轉職。同名或既有註記衝突另列待核對，不新增候選人。</p><div class="flex flex-wrap gap-2"><button type="button" id="representative-incumbent-preview" class="px-4 py-2 bg-ink-900 text-white rounded-lg text-xs font-black">核對現任代表標記</button><button type="button" id="representative-incumbent-apply" class="px-4 py-2 bg-accent-orange text-white rounded-lg text-xs font-black" hidden>儲存現任與轉職標記</button></div><p id="representative-incumbent-status" role="status" class="text-xs mt-3 font-bold">尚未核對；儲存時保留其他欄位，並檢查後台資料版本。</p><details class="mt-3"><summary class="text-xs font-bold cursor-pointer">查看核對名單與來源</summary><ul id="representative-incumbent-list" class="text-xs mt-2 max-h-80 overflow-y-auto"></ul></details>';
    host.appendChild(section);
    const preview = section.querySelector('#representative-incumbent-preview');
    const apply = section.querySelector('#representative-incumbent-apply');
    const status = section.querySelector('#representative-incumbent-status');
    const list = section.querySelector('#representative-incumbent-list');
    preview.addEventListener('click', async () => {
      if (!currentUser || mutationBusy || editorTouched) { status.textContent = '請先登入、儲存目前編輯並重新載入後台。'; return; }
      preview.disabled = true; apply.hidden = true; plan = null;
      try {
        const [snapshot, response] = await Promise.all([apiFetch('/api/admin/overrides'), fetch(reviewUrl, { cache: 'no-store' })]);
        if (!response.ok) throw Error(`讀取核對檔失敗 ${response.status}`);
        const review = await response.json();
        const bases = {};
        const files = [...new Set(review.records.filter(r => !snapshot[r.areaId]).map(r => r.areaId.length === 5 ? '/data/counties.json' : r.areaId.length === 8 ? `/data/towns/towns-${r.areaId.slice(0, 5)}.json` : `/data/villages/villages-${r.areaId.slice(0, 8)}.json`))];
        for (const file of files) {
          const res = await fetch(file, { cache: 'no-store' });
          if (!res.ok) throw Error(`基礎資料讀取失敗 ${file}`);
          const topology = await res.json();
          for (const g of Object.values(topology.objects)[0].geometries) bases[g.properties.id] = g.properties;
        }
        plan = ElectionData.applyRepresentativeIncumbents(snapshot, review, bases);
        list.replaceChildren(...review.records.map(record => {
          const item = document.createElement('li');
          const link = document.createElement('a');
          link.href = record.official.url; link.target = '_blank'; link.rel = 'noopener noreferrer';
          link.textContent = `${record.name}｜${record.kind === 'incumbent' ? '現任爭取連任' : '現任轉職'}｜${record.official.office} → ${record.role}`;
          item.appendChild(link); return item;
        }));
        const changed = plan.matched.filter(r => r.changed);
        status.textContent = `核對 ${review.officialCount} 位現任代表；確認 ${review.records.filter(r => r.kind === 'incumbent').length} 位同職參選、${review.records.filter(r => r.kind === 'careerMove').length} 位現任轉職。本次待更新 ${changed.length} 位、${Object.keys(plan.overrides).length} 個地區。`;
        apply.hidden = !changed.length;
      } catch (error) { status.textContent = `未寫入：${error.message}`; }
      finally { preview.disabled = false; }
    });
    apply.addEventListener('click', async () => {
      if (!plan || mutationBusy || editorTouched) return;
      mutationBusy = true; apply.disabled = true; preview.disabled = true;
      const pending = plan;
      try {
        const saved = await apiFetch('/api/admin/overrides', { method: 'PUT', body: JSON.stringify({ overrides: pending.overrides, expectedRevisions: pending.expectedRevisions }) });
        const fresh = await apiFetch('/api/admin/overrides');
        for (const [code, expected] of Object.entries(pending.overrides)) {
          const actual = fresh[code];
          if (!actual || !actual._revision) throw Error(`${code} 寫入後無法確認`);
          for (const key of ['candidates', 'councilors', 'representatives']) if (JSON.stringify(actual[key]) !== JSON.stringify(expected[key])) throw Error(`${code} 重新讀取結果不同，請核對`);
        }
        allOverrides = fresh;
        if (typeof renderOverrideList === 'function') renderOverrideList();
        status.textContent = `已儲存並重新讀取確認：${pending.matched.filter(r => r.changed).length} 位、${Object.keys(saved.overrides || {}).length} 個地區。前台與後台共用紀錄已更新。`;
        apply.hidden = true; plan = null;
      } catch (error) { status.textContent = `更新未完成：${error.message}。請重新核對版本，勿重複覆蓋。`; plan = null; apply.hidden = true; }
      finally { mutationBusy = false; apply.disabled = false; preview.disabled = false; }
    });
  };
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', setup, { once: true }); else setup();
})();
