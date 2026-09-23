(() => {
  // GitHub → Cloudflare KV 可同步欄位。
  // votes / prevVotes / elected 加入後，111 年歷史得票才會進入後台的 KV。
  const SYNC_FIELDS = [
    'facebook',
    'instagram',
    'threads',
    'youtube',
    'photoUrl',
    'votes',
    'prevVotes',
    'elected',
  ];

  const cleanName = value => String(value || '').normalize('NFKC').replace(/[・．·‧\s\u3000]/g, '').trim();
  const clone = value => JSON.parse(JSON.stringify(value ?? null));
  const isBlank = value => value == null || String(value).trim() === '';

  function blocksOf(value) {
    if (Array.isArray(value)) return value;
    if (value && Array.isArray(value.blocks)) return value.blocks;
    return [];
  }

  function mergeCandidateFields(baseCandidates, targetCandidates, stats, fallbackByName) {
    if (!Array.isArray(baseCandidates) || !Array.isArray(targetCandidates)) return;

    const targetByName = new Map(
      targetCandidates
        .filter(c => cleanName(c?.name))
        .map(c => [cleanName(c.name), c])
    );

    for (const source of baseCandidates) {
      const target = targetByName.get(cleanName(source?.name)) || fallbackByName?.get(cleanName(source?.name));

      if (!target) {
        stats.missingInKv.push(source?.name || '(未命名)');
        continue;
      }

      for (const field of SYNC_FIELDS) {
        const sourceValue = source?.[field];

        // elected 是布林值，false 本身也是有效資料，不應被視為空值。
        const sourceHasValue = field === 'elected'
          ? typeof sourceValue === 'boolean'
          : !isBlank(sourceValue);

        const targetIsBlank = field === 'elected'
          ? typeof target[field] !== 'boolean'
          : isBlank(target[field]);

        if (targetIsBlank && sourceHasValue && !(stats.explicitSnapshot && Object.hasOwn(target, field))) {
          target[field] = clone(sourceValue);
          stats.fieldsFilled += 1;

          if (field === 'photoUrl') {
            stats.photosFilled += 1;
          } else if (['facebook', 'instagram', 'threads', 'youtube'].includes(field)) {
            stats.socialFieldsFilled += 1;
          } else {
            stats.electionFieldsFilled += 1;
          }

          stats.changed = true;
          stats.updated.push(`${source.name}:${field}`);
        }
      }
    }
  }

  function mergeBlocks(baseBlocks, targetBlocks, stats) {
    const baseList = blocksOf(baseBlocks);
    const targetList = blocksOf(targetBlocks);

    const targetByDistrict = new Map(
      targetList.map(block => [String(block?.district ?? ''), block])
    );

    // 選區編號在 KV 與 GitHub 不一致時，改用同縣市內的姓名對應，避免整個選區同步不到。
    const allTargetByName = new Map();
    for (const block of targetList) {
      for (const c of block?.candidates || []) {
        if (cleanName(c?.name) && !allTargetByName.has(cleanName(c.name))) allTargetByName.set(cleanName(c.name), c);
      }
    }

    for (const baseBlock of baseList) {
      const targetBlock = targetByDistrict.get(String(baseBlock?.district ?? ''));
      if (!targetBlock) stats.missingBlocks += 1;

      mergeCandidateFields(
        baseBlock?.candidates || [],
        targetBlock?.candidates || [],
        stats,
        allTargetByName
      );
    }
  }

  function countFields(props) {
    const result = {
      total: 0,
      social: 0,
      photos: 0,
      election: 0,
    };

    const countCandidate = candidate => {
      for (const field of SYNC_FIELDS) {
        const value = candidate?.[field];

        const hasValue = field === 'elected'
          ? typeof value === 'boolean'
          : !isBlank(value);

        if (!hasValue) continue;

        result.total += 1;

        if (field === 'photoUrl') {
          result.photos += 1;
        } else if (['facebook', 'instagram', 'threads', 'youtube'].includes(field)) {
          result.social += 1;
        } else {
          result.election += 1;
        }
      }
    };

    for (const candidate of props?.candidates || []) {
      countCandidate(candidate);
    }

    for (const block of blocksOf(props?.councilors)) {
      for (const candidate of block?.candidates || []) {
        countCandidate(candidate);
      }
    }

    for (const block of blocksOf(props?.representatives)) {
      for (const candidate of block?.candidates || []) {
        countCandidate(candidate);
      }
    }

    return result;
  }

  function countyGeometries() {
    if (!countiesTopo?.objects) return [];

    const key = Object.keys(countiesTopo.objects)[0];
    return countiesTopo.objects[key]?.geometries || [];
  }

  async function syncGitHubFieldsToKv() {
    const status = document.getElementById('kv-social-sync-status');
    const button = document.getElementById('kv-social-sync-btn');

    if (!currentUser) {
      alert('請先使用 Cloudflare Access 登入後台，再執行同步。');
      return;
    }

    if (!countiesTopo || !overridesLoaded || typeof allOverrides !== 'object') {
      alert('基礎資料或 KV 覆寫尚未載入完成，請重新整理後再試一次。');
      return;
    }

    const confirmed = confirm(
      '這個同步會把 GitHub data/counties.json 裡已有的資料補到 KV 的空欄位：\n\n' +
      'Facebook / Instagram / Threads / YouTube / 照片\n' +
      '本期得票 / 上期得票 / 當選狀態\n\n' +
      '完整紀錄只補缺少的欄位，已儲存的空白也會保留。\n' +
      '因此你手動修改過的資料會保留。\n\n' +
      '確定開始同步嗎？'
    );

    if (!confirmed) return;

    if (mutationBusy) return;
    mutationBusy = true;
    button.disabled = true;
    button.textContent = '同步中…';
    status.textContent = '正在比較 GitHub 基礎資料與 Cloudflare KV…';

    const summary = {
      countiesChecked: 0,
      countiesChanged: 0,
      fieldsFilled: 0,
      socialFieldsFilled: 0,
      electionFieldsFilled: 0,
      photosFilled: 0,
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
        const baseCounts = countFields(base);
        const baseHasSyncData = baseCounts.total > 0;

        if (!existing && !baseHasSyncData) continue;

        let next;

        const stats = {
          changed: false,
          explicitSnapshot: existing?.schemaVersion === 2,
          fieldsFilled: 0,
          socialFieldsFilled: 0,
          electionFieldsFilled: 0,
          photosFilled: 0,
          updated: [],
          missingInKv: [],
          missingBlocks: 0,
        };

        if (!existing) {
          // 沒有 override 時，建立完整可編輯副本。
          // 這樣 votes / prevVotes / elected 也會一起進入 KV。
          next = {
            candidates: clone(base.candidates || []),
            councilors: clone(base.councilors || []),
            representatives: clone(base.representatives || []),
            voters: base.voters ?? null,
            quota: base.quota ?? null,
            updatedAt: new Date().toISOString(),
            updatedBy: currentUser.email || 'admin-kv-data-sync',
          };

          stats.changed = true;
          stats.fieldsFilled = baseCounts.total;
          stats.socialFieldsFilled = baseCounts.social;
          stats.electionFieldsFilled = baseCounts.election;
          stats.photosFilled = baseCounts.photos;

          summary.newCountyOverrides += 1;
        } else {
          next = clone(existing);

          mergeCandidateFields(
            base.candidates || [],
            next.candidates || [],
            stats
          );

          mergeBlocks(
            base.councilors || [],
            next.councilors || [],
            stats
          );

          mergeBlocks(
            base.representatives || [],
            next.representatives || [],
            stats
          );

          if (stats.changed) {
            next.updatedAt = new Date().toISOString();
            next.updatedBy = currentUser.email || 'admin-kv-data-sync';
          }
        }

        summary.missingInKv.push(
          ...stats.missingInKv.map(
            name => `${base.name || code}:${name}`
          )
        );

        if (!stats.changed) continue;

        try {
          await persistOverride(code, next);
          summary.countiesChanged += 1;
          summary.fieldsFilled += stats.fieldsFilled;
          summary.socialFieldsFilled += stats.socialFieldsFilled;
          summary.electionFieldsFilled += stats.electionFieldsFilled;
          summary.photosFilled += stats.photosFilled;
        } catch (err) {
          summary.errors.push(`${base.name || code}: ${err.message}`);
        }
      }

      if (typeof renderOverrideList === 'function') {
        renderOverrideList();
      }

      const parts = [
        `檢查 ${summary.countiesChecked} 個縣市`,
        `更新 ${summary.countiesChanged} 個縣市`,
        `補入 ${summary.electionFieldsFilled} 個選舉欄位`,
        `補入 ${summary.socialFieldsFilled} 個社群欄位`,
        `補入 ${summary.photosFilled} 張照片`,
      ];

      if (summary.newCountyOverrides) {
        parts.push(`新建 ${summary.newCountyOverrides} 個 KV 縣市覆寫`);
      }

      if (summary.errors.length) {
        parts.push(`失敗 ${summary.errors.length} 個`);
      }

      status.textContent = parts.join(' · ');

      let message = `同步完成。\n\n${parts.join('\n')}`;

      if (summary.missingInKv.length) {
        message +=
          `\n\n注意：有 ${summary.missingInKv.length} 位 GitHub 候選人在既有 KV 名冊中找不到，` +
          '因此沒有自動新增，以避免覆蓋你手動維護的名冊。';
      }

      if (summary.errors.length) {
        message += `\n\n錯誤：\n${summary.errors.join('\n')}`;
      }

      alert(message);
    } catch (err) {
      console.error('GitHub → KV sync failed', err);

      status.textContent = `同步中止：${err.message}`;

      alert(
        'GitHub → Cloudflare KV 同步失敗。\n\n' +
        err.message +
        '\n\n請確認 API Worker、Cloudflare Access 與 ADMIN_TOKEN 設定。'
      );
    } finally {
      mutationBusy = false;
      button.disabled = false;
      button.textContent = '同步 GitHub 選舉資料＋社群＋照片到 KV';
    }
  }

  async function syncVillageIncumbentsToKv() {
    const status = document.getElementById('kv-village-incumbent-status');
    const button = document.getElementById('kv-village-incumbent-btn');

    if (!currentUser) {
      alert('請先使用 Cloudflare Access 登入後台，再同步村里長連任標記。');
      return;
    }
    if (!overridesLoaded || typeof allOverrides !== 'object') {
      alert('KV 覆寫尚未載入完成，請重新整理後再試一次。');
      return;
    }
    if (!confirm(
      '這個同步會依中選會 115 年村里長候選人登記名單，搭配內政部現任村里長名冊，' +
      '把可核對的「爭取連任」標記補進 Cloudflare KV。\n\n' +
      '只會把 false 補成 true，不會取消既有標記，也不會改動候選人名單或其他手動資料。\n\n' +
      '確定開始同步嗎？'
    )) return;

    if (mutationBusy) return;
    mutationBusy = true;
    button.disabled = true;
    button.textContent = '同步中…';
    status.textContent = '正在載入村里長連任比對結果…';

    try {
      const response = await fetch('./data/village_incumbent_sync.json', { cache: 'no-store' });
      if (!response.ok) throw new Error(`連任資料讀取失敗（${response.status}）`);
      const source = await response.json();
      const records = Array.isArray(source.records) ? source.records : [];
      const namesByArea = new Map();
      for (const record of records) {
        const areaId = String(record?.areaId || '');
        const name = cleanName(record?.name);
        if (!/^\d{11}$/.test(areaId) || !name) continue;
        if (!namesByArea.has(areaId)) namesByArea.set(areaId, new Set());
        namesByArea.get(areaId).add(name);
      }

      const changes = {};
      const expectedRevisions = {};
      let candidatesUpdated = 0;
      let overrideCandidatesMissing = 0;

      for (const [areaId, incumbentNames] of namesByArea) {
        const existing = allOverrides[areaId];
        if (!existing || !Array.isArray(existing.candidates)) continue;
        const next = clone(existing);
        let changed = false;
        const found = new Set();

        for (const candidate of next.candidates) {
          const name = cleanName(candidate?.name);
          if (!incumbentNames.has(name)) continue;
          found.add(name);
          if (candidate.isIncumbent === true) continue;
          candidate.isIncumbent = true;
          candidatesUpdated += 1;
          changed = true;
        }
        overrideCandidatesMissing += [...incumbentNames].filter(name => !found.has(name)).length;
        if (!changed) continue;

        next.updatedAt = new Date().toISOString();
        next.updatedBy = currentUser.email || 'admin-village-incumbent-sync';
        changes[areaId] = next;
        expectedRevisions[areaId] = existing._revision || '0';
      }

      const changedAreas = Object.keys(changes).length;
      if (changedAreas) {
        const saved = await apiFetch('/api/admin/overrides', {
          method: 'PUT',
          body: JSON.stringify({ overrides: changes, expectedRevisions }),
        });
        Object.assign(allOverrides, saved.overrides || {});
        if (typeof renderOverrideList === 'function') renderOverrideList();
      }

      status.textContent = `已更新 ${candidatesUpdated} 位候選人、${changedAreas} 個村里 ✓`;
      alert(
        `村里長連任標記同步完成。\n\n` +
        `候選人範圍：中選會 115 年登記名單\n` +
        `現任身分：內政部現任村里長名冊\n` +
        `新增連任標記：${candidatesUpdated} 位\n` +
        `更新村里：${changedAreas} 個` +
        (overrideCandidatesMissing ? `\n既有 KV 名冊未找到：${overrideCandidatesMissing} 位` : '')
      );
    } catch (err) {
      console.error('Village incumbent sync failed', err);
      status.textContent = `同步失敗：${err.message}`;
      alert(`村里長連任標記同步失敗。\n\n${err.message}`);
    } finally {
      mutationBusy = false;
      button.disabled = false;
      button.textContent = '同步村里長爭取連任標記';
    }
  }

  function mountSyncCard() {
    const editor = document.getElementById('editor');

    if (!editor || document.getElementById('kv-social-sync-card')) return;

    const card = document.createElement('section');

    card.id = 'kv-social-sync-card';
    card.className =
      'bg-surface p-5 rounded-2xl border editorial-border ' +
      'shadow-[4px_4px_0px_#141517] space-y-3';

    card.innerHTML = `
      <div class="flex flex-wrap items-start justify-between gap-3">
        <div>
          <div class="text-[10px] font-black uppercase tracking-wider text-accent-orange">
            GitHub → Cloudflare KV
          </div>

          <h3 class="text-base font-black mt-1">
            同步選舉資料＋社群＋照片
          </h3>

          <p class="text-xs text-ink-500 font-medium mt-1 leading-relaxed max-w-2xl">
            將 GitHub data/counties.json 中已有的
            Facebook / Instagram / Threads / YouTube / 照片 /
            本期得票 / 上期得票 / 當選狀態
            補進尚未建立的欄位。
            後台已儲存的值與刻意清空的欄位都會保留。
          </p>
        </div>

        <button
          id="kv-social-sync-btn"
          type="button"
          class="px-4 py-2.5 rounded-xl bg-ink-900 text-surface text-xs font-bold hover:bg-accent-orange transition shadow-[2px_2px_0px_#141517]"
        >
          同步 GitHub 選舉資料＋社群＋照片到 KV
        </button>
      </div>

      <div
        id="kv-social-sync-status"
        class="text-xs font-bold text-ink-500"
        role="status"
      >
        尚未執行同步
      </div>

      <div class="border-t border-ink-200 pt-3 mt-3 flex flex-wrap items-center justify-between gap-3">
        <div>
          <div class="text-xs font-black">村里長爭取連任</div>
          <p class="text-[11px] text-ink-500 mt-1">以中選會登記名單為候選人範圍，和內政部現任名冊交叉比對後補進 KV。</p>
          <div id="kv-village-incumbent-status" class="text-[11px] font-bold text-ink-500 mt-1" role="status">尚未執行同步</div>
        </div>
        <button
          id="kv-village-incumbent-btn"
          type="button"
          class="px-4 py-2.5 rounded-xl bg-accent-orange text-white text-xs font-bold hover:bg-ink-900 transition shadow-[2px_2px_0px_#141517]"
        >
          同步村里長爭取連任標記
        </button>
      </div>
    `;

    const firstCard = editor.firstElementChild;

    if (firstCard?.nextSibling) {
      editor.insertBefore(card, firstCard.nextSibling);
    } else {
      editor.appendChild(card);
    }

    document
      .getElementById('kv-social-sync-btn')
      .addEventListener('click', syncGitHubFieldsToKv);
    document
      .getElementById('kv-village-incumbent-btn')
      .addEventListener('click', syncVillageIncumbentsToKv);
  }

  if (document.readyState === 'loading') {
    document.addEventListener(
      'DOMContentLoaded',
      mountSyncCard,
      { once: true }
    );
  } else {
    mountSyncCard();
  }
})();
