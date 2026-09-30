export function isBlank(value) {
  return value == null || (typeof value === 'string' && value.trim() === '');
}

// Automated sources may supplement a candidate, but a saved backend snapshot is
// authoritative. In a v2 snapshot even an explicit null/empty string is a manual
// choice, so the source must not fill it back in.
export function fillFromAutomatedSource(target, source, fields, { explicitSnapshot = false } = {}) {
  const result = { filled: [], preserved: [], conflicts: [] };

  for (const field of fields) {
    const incoming = source?.[field];
    if (isBlank(incoming)) continue;

    const ownsField = Object.hasOwn(target, field);
    const current = target?.[field];
    const protectedByManualData = (explicitSnapshot && ownsField) || !isBlank(current);

    if (protectedByManualData) {
      result.preserved.push(field);
      if (!isBlank(current) && current !== incoming) result.conflicts.push(field);
      continue;
    }

    target[field] = structuredClone(incoming);
    result.filled.push(field);
  }

  return result;
}
