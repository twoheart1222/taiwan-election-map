// Shared by the map, search and editor. v2 documents are explicit snapshots:
// empty values and missing candidates are intentional, never filled back in.
(() => {
  const clone = value => structuredClone(value);
  const nameKey = value => String(value || '').normalize('NFKC').replace(/[・．·‧\s\u3000]/g, '');
  const blocksOf = value => Array.isArray(value) ? value : (value?.blocks || []);
  const blank = value => value == null || value === '';
  // TopoJSON also contains unnamed offshore shapes (for example 09007010S01).
  // Keep their geometry, but never count or list them as administrative villages.
  const isAdministrativeVillage = area => /^\d{11}$/.test(String(area?.id || '')) && Boolean(String(area?.name || '').trim());
  const qualificationFields = ['qualificationStatus', 'qualificationReason', 'qualificationDate', 'qualificationSourceUrl'];
  const ineligibleLast = candidates => [...candidates].sort((a, b) => Number(a.qualificationStatus === 'ineligible') - Number(b.qualificationStatus === 'ineligible'));
  function applyQualificationReview(snapshot, review) {
    const overrides = {}, expectedRevisions = {}, matched = [];
    for (const entry of review.ineligible) {
      const code = entry.countyCode;
      const current = snapshot[code];
      if (!current || !current._revision) throw new Error(`${code} 缺少目前後台紀錄或版本，請重新匯出。`);
      const document = overrides[code] || (overrides[code] = clone(current));
      const candidates = blocksOf(document.councilors)
        .filter(b => String(b.district) === String(entry.district))
        .flatMap(b => b.candidates || []).filter(c => c.name === entry.name);
      if (candidates.length !== 1) throw new Error(`${entry.county}第 ${entry.district} 選舉區 ${entry.name} 比對不唯一，停止更新。`);
      const candidate = candidates[0];
      const fields = {
        qualificationStatus: 'ineligible',
        qualificationReason: `依中選會 ${review.reviewedAt} 審定公告：${entry.reason}依${entry.legalBasis}規定，不得登記為候選人。`,
        qualificationDate: review.reviewedAt,
        qualificationSourceUrl: review.sourceUrl,
      };
      if (qualificationFields.some(field => Object.hasOwn(candidate, field) && candidate[field] != null && candidate[field] !== '' && candidate[field] !== fields[field])) {
        throw new Error(`${entry.name} 已有不同資格註記，請人工核對，勿自動覆蓋。`);
      }
      Object.assign(candidate, fields);
      expectedRevisions[code] = current._revision;
      matched.push({ ...entry, status: fields.qualificationStatus });
    }
    return { overrides, expectedRevisions, matched };
  }
  function applyRepresentativeIncumbents(snapshot, review, baseAreas = {}) {
    if (!Array.isArray(review.records) || !review.records.length) throw new Error('現任代表核對檔沒有紀錄');
    const overrides = {}, expectedRevisions = {}, matched = [];
    const seen = new Set();
    for (const record of review.records) {
      const { areaId, field, district, name, role, fields, before } = record;
      const identity = [areaId, field, district ?? '', nameKey(name)].join('|');
      if (seen.has(identity)) throw new Error(`${name} 核對紀錄重複`);
      seen.add(identity);
      if (!['candidates', 'councilors', 'representatives'].includes(field) || !/^\d{5}(?:\d{3}(?:\d{3})?)?$/.test(areaId)) throw new Error('現任代表核對範圍無效');
      const original = snapshot[areaId] || baseAreas[areaId];
      if (!original || (snapshot[areaId] && !original._revision)) throw new Error(`${areaId} 缺少原始資料或目前版本`);
      const document = overrides[areaId] || clone(original);
      const list = field === 'candidates' ? document.candidates || [] : blocksOf(document[field]).filter(b => String(b.district) === String(district)).flatMap(b => b.candidates || []);
      const candidates = list.filter(c => nameKey(c.name) === nameKey(name) && c.role === role);
      if (candidates.length !== 1) throw new Error(`${areaId} ${name} 比對不唯一或名單已變動，請重新核對`);
      const candidate = candidates[0];
      let changed = !snapshot[areaId];
      for (const [key, value] of Object.entries(fields)) {
        if (!['isIncumbent', 'isCareerMove', 'priorRace', 'incumbentOffice', 'incumbentSourceUrl'].includes(key)) throw new Error('不允許的現任更新欄位');
        if (candidate[key] === value) continue;
        if (candidate[key] !== before[key]) throw new Error(`${name} 的 ${key} 已被修改，未寫入任何資料，請重新核對`);
        candidate[key] = value;
        changed = true;
      }
      matched.push({ areaId, name, kind: record.kind, changed });
      if (!changed) continue;
      document.schemaVersion = 2;
      overrides[areaId] = document;
      expectedRevisions[areaId] = snapshot[areaId]?._revision || '0';
    }
    return { overrides, expectedRevisions, matched };
  }
  function planGazettePreviews(snapshot, records) {
    if (!Array.isArray(records) || !records.length) throw new Error('公報切圖清單沒有資料');
    const overrides = {}, expectedRevisions = {}, skipped = [];
    const identities = new Set();
    let updated = 0;
    for (const record of records) {
      const { areaId, field, district, name, gazetteUrl, gazettePreviewUrl, gazettePage, gazetteAlt } = record;
      const identity = [areaId, field, district ?? '', nameKey(name)].join('|');
      if (identities.has(identity)) throw new Error(`${name} 的公報切圖重複`);
      identities.add(identity);
      if (!/^\d{5}(?:\d{3}(?:\d{3})?)?$/.test(areaId) || !nameKey(name)
        || !['candidates', 'councilors', 'representatives'].includes(field)
        || !/^https:\/\/(?:ee)?bulletin\.cec\.gov\.tw\/(?:[^\s?#]+)\.pdf$/i.test(gazetteUrl)
        || !/^\/assets\/gazettes\/2026\/[\w-]+\.webp$/.test(gazettePreviewUrl)
        || !/^\d+$/.test(gazettePage) || Number(gazettePage) < 1 || typeof gazetteAlt !== 'string') {
        throw new Error(`${name} 的公報切圖資料無效`);
      }
      const original = snapshot[areaId];
      if (!original?._revision) {
        skipped.push(`${areaId} ${name}：找不到可更新的後台紀錄`);
        continue;
      }
      const document = overrides[areaId] || clone(original);
      const candidates = field === 'candidates' ? document.candidates || []
        : blocksOf(document[field]).filter(block => String(block.district) === String(district))
          .flatMap(block => block.candidates || []);
      const matches = candidates.filter(candidate => nameKey(candidate.name) === nameKey(name));
      if (matches.length !== 1 || matches[0].qualificationStatus === 'ineligible') {
        skipped.push(`${areaId} ${name}：無唯一且符合資格的候選人`);
        continue;
      }
      const candidate = matches[0];
      if (candidate.gazettePreviewUrl === gazettePreviewUrl) continue;
      if (candidate.gazettePreviewUrl || (candidate.gazetteUrl && candidate.gazetteUrl !== gazetteUrl)
        || (candidate.gazettePage && String(candidate.gazettePage) !== String(gazettePage))) {
        skipped.push(`${areaId} ${name}：已設定公報，保留現有資料`);
        continue;
      }
      Object.assign(candidate, {
        gazetteUrl, gazettePreviewUrl, gazettePage, gazetteAlt: candidate.gazetteAlt || gazetteAlt,
      });
      overrides[areaId] = document;
      expectedRevisions[areaId] = original._revision;
      updated++;
    }
    return { overrides, expectedRevisions, updated, skipped };
  }
  const fallbackFields = ['facebook', 'instagram', 'threads', 'youtube', 'photoUrl', 'gazetteUrl', 'gazettePreviewUrl', 'gazettePage', 'gazetteAlt', 'taiwanGoGoUrl', 'local2026Url', 'reporterUrl', 'votes', 'prevVotes', 'elected', 'priorRace', 'isCareerMove'];
  function uniqueNames(list) {
    const result = new Map();
    for (const item of list) {
      const key = nameKey(item?.name);
      result.set(key, result.has(key) ? null : item);
    }
    return result;
  }
  function mergeCandidates(local, remote, append = false, fallback = new Map()) {
    const byName = uniqueNames(local);
    const result = remote.map(candidate => {
      const base = byName.get(nameKey(candidate.name)) || fallback.get(nameKey(candidate.name)) || {};
      const merged = { ...base, ...candidate };
      for (const field of fallbackFields) {
        if (blank(merged[field]) && !blank(base[field])) merged[field] = base[field];
      }
      return merged;
    });
    if (append) {
      const names = new Set(remote.map(c => nameKey(c.name)));
      result.push(...local.filter(c => !names.has(nameKey(c.name))));
    }
    return result;
  }
  function mergeArea(base, override) {
    if (!override) return clone(base);
    const result = { ...base, ...override };
    if (override.schemaVersion === 2) return clone(result);
    if (Array.isArray(override.candidates)) {
      result.candidates = mergeCandidates(base.candidates || [], override.candidates, true);
    }
    for (const field of ['councilors', 'representatives']) {
      if (!Object.hasOwn(override, field)) continue;
      const local = blocksOf(base[field]);
      const byDistrict = new Map(local.map(b => [String(b.district), b]));
      const byName = uniqueNames(local.flatMap(b => b.candidates || []));
      result[field] = blocksOf(override[field]).map(block => ({ ...block,
        candidates: mergeCandidates(byDistrict.get(String(block.district))?.candidates || [], block.candidates || [], false, byName),
      }));
    }
    return clone(result);
  }
  globalThis.ElectionData = { mergeArea, blocksOf, isAdministrativeVillage, qualificationFields, ineligibleLast, applyQualificationReview, applyRepresentativeIncumbents, planGazettePreviews };
})();
