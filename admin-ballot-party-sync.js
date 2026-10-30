// Preview a one-field correction against the current, versioned admin snapshot.
// This module never sends a request; the admin applies its prepared documents through the API.
globalThis.FORegionalPartySync = Object.freeze({
  prepare(overrides, countyParties, villageParties) {
    const changes = {};
    const expectedRevisions = {};
    const differences = [];
    const nameKey = value => String(value || '').normalize('NFKC')
      .replace(/[·‧．・]/g, '.').replace(/啓/g, '啟').replace(/爲/g, '為')
      .replace(/\s+/g, '').toLowerCase();
    const partyKey = value => {
      const text = String(value || '').replace(/\s+/g, '').replace(/臺/g, '台');
      return ['無', '無黨籍'].includes(text) ? '無' : text;
    };
    const compare = (code, candidates, parties, scope) => {
      if (!parties || !candidates?.length) return;
      for (let index = 0; index < candidates.length; index++) {
        const candidate = candidates[index];
        const matches = Object.entries(parties).filter(([name]) => nameKey(name) === nameKey(candidate.name));
        if (matches.length !== 1) continue;
        const [sourceName, sourceParty] = matches[0];
        if (partyKey(candidate.party) === partyKey(sourceParty)) continue;
        const current = overrides[code];
        if (!current?._revision) throw new Error(`${code} 缺少後台版本，停止更新。`);
        if (!changes[code]) {
          changes[code] = structuredClone(current);
          expectedRevisions[code] = current._revision;
        }
        const target = scope.kind === 'councilor'
          ? changes[code].councilors.find(block => String(block.district) === scope.district)?.candidates?.[index]
          : scope.kind === 'representative'
            ? changes[code].representatives.find(block => String(block.district) === scope.district)?.candidates?.[index]
            : changes[code].candidates?.[index];
        if (!target || nameKey(target.name) !== nameKey(candidate.name)) throw new Error(`${code} ${candidate.name} 位置已變更，停止更新。`);
        target.party = sourceParty;
        differences.push({ code, scope: scope.kind, district: scope.district || null,
          name: candidate.name, sourceName, from: candidate.party || '', to: sourceParty });
      }
    };
    for (const [code, current] of Object.entries(overrides || {})) {
      const countyCode = code.slice(0, 5);
      const source = countyParties?.[countyCode];
      if (!source) continue;
      if (code.length === 5) {
        compare(code, current.candidates, source.parties, { kind: 'mayor' });
        for (const block of current.councilors || []) compare(code, block.candidates,
          source.councilorParties?.[String(block.district)], { kind: 'councilor', district: String(block.district) });
      } else if (code.length === 8) {
        compare(code, current.candidates, source.townHeadParties?.[code], { kind: 'townHead' });
        for (const block of current.representatives || []) compare(code, block.candidates,
          source.representativeParties?.[code]?.[String(block.district)], { kind: 'representative', district: String(block.district) });
      } else if (code.length === 11) {
        compare(code, current.candidates, villageParties?.[code], { kind: 'village' });
      }
    }
    return { changes, expectedRevisions, differences };
  },
});
