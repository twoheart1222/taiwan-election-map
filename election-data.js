// Shared by the map, search and editor. v2 documents are explicit snapshots:
// empty values and missing candidates are intentional, never filled back in.
(() => {
  const clone = value => structuredClone(value);
  const nameKey = value => String(value || '').normalize('NFKC').replace(/[・．·‧\s\u3000]/g, '');
  const blocksOf = value => Array.isArray(value) ? value : (value?.blocks || []);
  const blank = value => value == null || value === '';
  const fallbackFields = ['facebook', 'instagram', 'threads', 'youtube', 'photoUrl', 'gazetteUrl', 'gazettePreviewUrl', 'gazettePage', 'gazetteAlt', 'taiwanGoGoUrl', 'local2026Url', 'votes', 'prevVotes', 'elected'];
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
  globalThis.ElectionData = { mergeArea, blocksOf };
})();
