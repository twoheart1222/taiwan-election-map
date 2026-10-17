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
  globalThis.ElectionData = { mergeArea, blocksOf, isAdministrativeVillage, qualificationFields, ineligibleLast, applyQualificationReview };
})();
