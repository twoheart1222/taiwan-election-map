(() => {
  const SOCIAL_FIELDS = ['facebook', 'instagram', 'threads', 'youtube'];

  const cleanName = value => String(value || '').replace(/[\s\u3000]/g, '').trim();
  const clone = value => JSON.parse(JSON.stringify(value ?? null));
  const isBlank = value => value == null || String(value).trim() === '';

  function blocksOf(value) {
    if (Array.isArray(value)) return value;
    if (value && Array.isArray(value.blocks)) return value.blocks;
    return [];
  }

  function mergeCandidateSocials(baseCandidates, targetCandidates, stats) {
    if (!Array.isArray(baseCandidates) || !Array.isArray(targetCandidates)) return;
    const targetByName = new Map(
      targetCandidates
        .filter(c => cleanName(c?.name))
        .map(c => [cleanName(c.name), c])
    );

    for (const source of baseCandidates) {
      const target = targetByName.get(cleanName(source?.name));
      if (!target) {
        stats.missingInKv.push(source?.name || '(未命名)');
        continue;
      }
      for (const field of SOCIAL_FIELDS) {
        if (isBlank(target[field]) && !isBlank(source?.[field])) {
          target[field] = source[field];
          stats.fieldsFilled += 1;
          stats.changed = true;
          stats.updated.push(`${source.name}:${field}`);
        }
      }
    }
  }

  function mergeCouncilorSocials(baseCouncilors, targetCouncilors, stats) {
    const baseBlocks = blocksOf(baseCouncilors);
    const targetBlocks = blocksOf(targetCouncilors);
    const targetByDistrict = new Map(targetBlocks.map(b => [String(b?.district ?? ''), b]));

    for (const baseBlock of baseBlocks) {
      const targetBlock = targetByDistrict.get(String(baseBlock?.district ?? ''));
      if (!targetBlock) continue;
      mergeCandidateSocials(baseBlock?.candidates || [], targetBlock?.candidates || [], stats);
    }
  }

  function countSocials(props) {
    let count = 0;
    for (const c of props?.candidates || []) {
      for (const field of SOCIAL_FIELDS) if (!isBlank(c?.[field])) count += 1;
    }
    for (const block of blocksOf(props?.councilors)) {
      for (const c of block?.candidates || []) {
        for (const field of SOCIAL_FIELDS) if (!isBlank(c?.[field])) count += 1;
      }
    }
    return count;
  }

  function countyGeometries() {
    if (!countiesTopo?.objects) return [];
    const key = Object.keys(countiesTopo.objects)[0];
    return countiesTopo.objects[key]?.geometries || [];
  }

  async function syncGitHubSocialsToKv() {
    const status = document.getElementById('kv-social-sync-status');
    const button = document.getElementById('kv-social-sync-btn');

    if (!currentUser) {
      alert('請先使用 Cloudflare Access 登入後台，再執行同步。');
      return;
    }
    if (!countiesTopo || typeof allOverrides !== 'object') {
      alert('基礎資料或 KV 覆寫尚未載入完成，請重新整理後再試一次。');
      return;
    }

    if (!confirm('這個同步只會把 GitHub data/counties.json 裡「已有值」的 Facebook / Instagram / Threads / YouTube 補到 KV 的空欄位。\n\nKV 中已經有值的欄位不會被覆蓋，因此你手動修正的資料會保留。\n\n確定開始同步嗎？')) return;

    button.disabled = true;
    button.textContent = '同步中…';
    status.textContent = '正在比較 GitHub 基礎資料與 KV…';

    const summary = {
      countiesChecked: 0,
      countiesChanged: 0,
      fieldsFilled: 0,
      newCountyOverrides: 0,
      missingInKv: [],
      errors: [],
    };

    try {
      for (const geometry of countyGeometries()) {
        const base = geometry?.properties || {};
        const code = String(base.id || '');
        if (!/^\d{5}$/.test(code)) continue;
        summary.countiesChecked += 1;

        const existing = allOverrides[code];
        const baseHasSocial = countSocials(base) > 0;
        if (!existing && !baseHasSocial) continue;

        let next;
        const stats = { changed: false, fieldsFilled: 0, updated: [], missingInKv: [] };

        if (!existing) {
          // 這個縣市還沒有 KV override：建立與 GitHub 基礎資料一致的可編輯副本。
          next = {
            candidates: clone(base.candidates || []),
            councilors: clone(base.councilors || []),
            voters: base.voters ?? null,
            quota: base.quota ?? null,
            updatedAt: new Date().toISOString(),
            updatedBy: currentUser.email || 'admin-kv-social-sync',
          };
          stats.changed = true;
          stats.fieldsFilled = countSocials(base);
          summary.newCountyOverrides += 1;
        } else {
          next = clone(existing);
          mergeCandidateSocials(base.candidates || [], next.candidates || [], stats);
          mergeCouncilorSocials(base.councilors || [], next.councilors || [], stats);
          if (stats.changed) {
            next.updatedAt = new Date().toISOString();
            next.updatedBy = currentUser.email || 'admin-kv-social-sync';
          }
        }

        summary.missingInKv.push(...stats.missingInKv.map(name => `${base.name || code}:${name}`));
        if (!stats.changed) continue;

        try {
          await apiFetch(`/api/admin/overrides/${encodeURIComponent(code)}`, {
            method: 'PUT',
            body: JSON.stringify(next),
          });
          allOverrides[code] = next;
          summary.countiesChanged += 1;
          summary.fieldsFilled += stats.fieldsFilled;
        } catch (err) {
          summary.errors.push(`${base.name || code}: ${err.message}`);
        }
      }

      if (typeof renderOverrideList === 'function') renderOverrideList();

      const parts = [
        `檢查 ${summary.countiesChecked} 個縣市`,
        `更新 ${summary.countiesChanged} 個縣市`,
        `補入 ${summary.fieldsFilled} 個社群欄位`,
      ];
      if (summary.newCountyOverrides) parts.push(`新建 ${summary.newCountyOverrides} 個 KV 縣市覆寫`);
      if (summary.errors.length) parts.push(`失敗 ${summary.errors.length} 個`);
      status.textContent = parts.join(' · ');

      let message = `同步完成。\n\n${parts.join('\n')}`;
      if (summary.missingInKv.length) {
        message += `\n\n注意：有 ${summary.missingInKv.length} 位 GitHub 候選人在既有 KV 名冊中找不到，因此沒有自動新增，以避免覆蓋你手動維護的名冊。`;
      }
      if (summary.errors.length) message += `\n\n錯誤：\n${summary.errors.join('\n')}`;
      alert(message);
    } finally {
      button.disabled = false;
      button.textContent = '同步 GitHub 社群資料到 KV';
    }
  }

  function mountSyncCard() {
    const editor = document.getElementById('editor');
    if (!editor || document.getElementById('kv-social-sync-card')) return;

    const card = document.createElement('section');
    card.id = 'kv-social-sync-card';
    card.className = 'bg-surface p-5 rounded-2xl border editorial-border shadow-[4px_4px_0px_#141517] space-y-3';
    card.innerHTML = `
      <div class="flex flex-wrap items-start justify-between gap-3">
        <div>
          <div class="text-[10px] font-black uppercase tracking-wider text-accent-orange">GitHub → Cloudflare KV</div>
          <h3 class="text-base font-black mt-1">同步已驗證社群資料</h3>
          <p class="text-xs text-ink-500 font-medium mt-1 leading-relaxed max-w-2xl">只補 KV 的空白 Facebook / Instagram / Threads / YouTube。KV 已有值一律保留，因此後台手動修正優先，不會被自動同步蓋掉。</p>
        </div>
        <button id="kv-social-sync-btn" type="button" class="px-4 py-2.5 rounded-xl bg-ink-900 text-surface text-xs font-bold hover:bg-accent-orange transition shadow-[2px_2px_0px_#141517]">同步 GitHub 社群資料到 KV</button>
      </div>
      <div id="kv-social-sync-status" class="text-xs font-bold text-ink-500">尚未執行同步</div>
    `;

    const firstCard = editor.firstElementChild;
    if (firstCard?.nextSibling) editor.insertBefore(card, firstCard.nextSibling);
    else editor.appendChild(card);

    document.getElementById('kv-social-sync-btn').addEventListener('click', syncGitHubSocialsToKv);
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', mountSyncCard, { once: true });
  } else {
    mountSyncCard();
  }
})();
