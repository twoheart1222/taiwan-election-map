import { readFile, writeFile } from 'node:fs/promises';

const inputPath = process.argv[2];
const outputPath = process.argv[3];

if (!inputPath || !outputPath) {
  console.error('Usage: node scripts/build-overrides-kv-bulk.mjs <overrides.json> <bulk.json>');
  process.exit(1);
}

const overrides = JSON.parse(await readFile(inputPath, 'utf8'));
const countyDocuments = Object.entries(overrides)
  .filter(([key, value]) => /^\d{5}$/.test(key) && value?.councilors)
  .map(([key, value]) => ({ key: `override:${key}`, value: JSON.stringify(value) }));

const bulk = [
  { key: 'overrides', value: JSON.stringify(overrides) },
  ...countyDocuments,
];

await writeFile(outputPath, `${JSON.stringify(bulk)}\n`, 'utf8');
console.log(JSON.stringify({ keys: bulk.length, countyKeys: countyDocuments.length }, null, 2));
