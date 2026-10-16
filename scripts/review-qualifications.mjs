import fs from 'node:fs';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import '../election-data.js';

export function compareReview(snapshot, counties, review) {
  const mayorDifferences = [], councilorDifferences = [];
  let mayorCount = 0, councilorCount = 0;
  for (const county of counties) {
    const actual = snapshot[county.id] || county;
    const names = (actual.candidates || []).map(c => c.name);
    const expected = review.approvedMayors[county.id] || [];
    const baseNames = ElectionData.blocksOf(county.councilors).flatMap(b => b.candidates.map(c => `${b.district}|${c.name}`));
    const actualNames = ElectionData.blocksOf(actual.councilors).flatMap(b => b.candidates.map(c => `${b.district}|${c.name}`));
    const added = actualNames.filter(n => !baseNames.includes(n));
    const missingRows = baseNames.filter(n => !actualNames.includes(n));
    if (added.length || missingRows.length) councilorDifferences.push({ county: county.name, added, missing: missingRows });
    mayorCount += names.length;
    councilorCount += ElectionData.blocksOf(actual.councilors).reduce((n, b) => n + b.candidates.length, 0);
    const missing = expected.filter(n => !names.includes(n));
    const extra = names.filter(n => !expected.includes(n));
    if (missing.length || extra.length) mayorDifferences.push({ county: county.name, missing, extra });
  }
  return { sourceUrl: review.sourceUrl, reviewedAt: review.reviewedAt, mayorCount, councilorCount, mayorDifferences, councilorDifferences,
    ...ElectionData.applyQualificationReview(snapshot, review) };
}

if (process.argv[1] && import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href) {
  const input = process.argv[2];
  const output = process.argv[3];
  if (!input || !output) throw new Error('Usage: node scripts/review-qualifications.mjs <current-overrides.json> <output-directory>');
  const review = JSON.parse(fs.readFileSync(new URL('../data/qualification-review-20261016.json', import.meta.url)));
  const counties = JSON.parse(fs.readFileSync(new URL('../data/counties.json', import.meta.url))).objects.map.geometries.map(g => g.properties);
  const report = compareReview(JSON.parse(fs.readFileSync(input)), counties, review);
  report.countWarning = report.councilorCount === review.councilorTotals.registered ? null : `後台議員 ${report.councilorCount} 筆，公告登記 ${review.councilorTotals.registered} 人；僅標註逐名核對的 10 人，其餘紀錄保留待核對。`;
  fs.mkdirSync(output, { recursive: true });
  fs.writeFileSync(path.join(output, 'desired-overrides.json'), JSON.stringify(report.overrides, null, 2));
  fs.writeFileSync(path.join(output, 'review-report.json'), JSON.stringify(report, (key, value) => key === 'overrides' ? undefined : value, 2));
  console.log(JSON.stringify({ mayorCount: report.mayorCount, councilorCount: report.councilorCount, ineligible: report.matched.length, mayorDifferences: report.mayorDifferences, countWarning: report.countWarning, mode: 'preview; no remote data written' }, null, 2));
}
