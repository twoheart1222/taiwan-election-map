// Read-only external resources, separate from versioned candidate records.
(() => {
  const normalize = value => String(value || '').normalize('NFKC').replace(/[\s・．·‧]/g, '');
  const validUrl = value => /^https:\/\/lawmaker\.twreporter\.org\/(?:congress\/lawmaker\/[a-z0-9-]+|council\/(?:taipei|new-taipei|taoyuan|taichung|tainan|kaohsiung)\/lawmaker\/[a-z0-9-]+)$/.test(value || '');
  function find(candidate, countyCode, catalog) {
    const role = String(candidate?.role || '');
    const source = /議員候選人/.test(role) ? 'councilors'
      : /^(?:縣市長|直轄市長|縣長|市長)候選人$/.test(role) ? 'candidates' : null;
    if (!source || !/^\d{5}$/.test(String(countyCode || ''))) return null;
    const matches = (catalog?.profiles || []).filter(profile =>
      profile.countyCode === String(countyCode) && profile.source === source
      && normalize(profile.name) === normalize(candidate.name));
    if (matches.length !== 1 || !validUrl(matches[0].url)) return null;
    return matches[0];
  }
  globalThis.ReporterLinks = { find };
})();
