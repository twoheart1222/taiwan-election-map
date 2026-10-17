// Explicit backend settings take priority over the read-only external-profile catalog.
(() => {
  const normalize = value => String(value || '').normalize('NFKC').replace(/[\s・．·‧]/g, '');
  const validUrl = value => /^https:\/\/lawmaker\.twreporter\.org\/(?:congress\/lawmaker\/|council\/[a-z0-9-]+\/lawmaker\/)[a-z0-9-]+\/?(?:[?#][^\s"'<>\\]*)?$/.test(value || '');
  function find(candidate, countyCode, catalog) {
    // An explicit backend value takes precedence, including an intentional clear.
    if (candidate && Object.hasOwn(candidate, 'reporterUrl')) {
      const url = candidate.reporterUrl;
      return validUrl(url) ? { url, kind: url.includes('/congress/lawmaker/') ? 'congress' : 'council', manual: true } : null;
    }
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
  globalThis.ReporterLinks = { find, validUrl };
})();
