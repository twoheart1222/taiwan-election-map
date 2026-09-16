import { writeFile } from 'node:fs/promises';

const projectId = process.env.FIREBASE_PROJECT_ID || 'taiwan-election-map';
const apiKey = process.env.FIREBASE_API_KEY;
const outputPath = process.argv[2];

if (!apiKey || !outputPath) {
  console.error('Usage: FIREBASE_API_KEY=... node scripts/migrate-firestore-overrides.mjs <output.json>');
  process.exit(1);
}

function decodeValue(value = {}) {
  if ('nullValue' in value) return null;
  if ('stringValue' in value) return value.stringValue;
  if ('booleanValue' in value) return value.booleanValue;
  if ('integerValue' in value) return Number(value.integerValue);
  if ('doubleValue' in value) return Number(value.doubleValue);
  if ('timestampValue' in value) return value.timestampValue;
  if ('bytesValue' in value) return value.bytesValue;
  if ('referenceValue' in value) return value.referenceValue;
  if ('geoPointValue' in value) return value.geoPointValue;
  if ('arrayValue' in value) return (value.arrayValue.values || []).map(decodeValue);
  if ('mapValue' in value) return decodeFields(value.mapValue.fields || {});
  throw new Error(`Unsupported Firestore value: ${JSON.stringify(value)}`);
}

function decodeFields(fields) {
  return Object.fromEntries(Object.entries(fields).map(([key, value]) => [key, decodeValue(value)]));
}

function collectPhotoUrls(value, urls = []) {
  if (Array.isArray(value)) {
    value.forEach((item) => collectPhotoUrls(item, urls));
    return urls;
  }
  if (!value || typeof value !== 'object') return urls;
  for (const [key, child] of Object.entries(value)) {
    if (key === 'photoUrl' && typeof child === 'string' && child.trim()) urls.push(child.trim());
    collectPhotoUrls(child, urls);
  }
  return urls;
}

const overrides = {};
let pageToken = '';

do {
  const url = new URL(`https://firestore.googleapis.com/v1/projects/${projectId}/databases/(default)/documents/overrides`);
  url.searchParams.set('key', apiKey);
  url.searchParams.set('pageSize', '300');
  if (pageToken) url.searchParams.set('pageToken', pageToken);

  const response = await fetch(url);
  if (!response.ok) throw new Error(`Firestore export failed (${response.status}): ${await response.text()}`);
  const page = await response.json();

  for (const document of page.documents || []) {
    const id = decodeURIComponent(document.name.split('/').pop());
    overrides[id] = decodeFields(document.fields || {});
  }
  pageToken = page.nextPageToken || '';
} while (pageToken);

const json = `${JSON.stringify(overrides, null, 2)}\n`;
await writeFile(outputPath, json, 'utf8');

const photoUrls = collectPhotoUrls(overrides);
const domainCounts = {};
for (const photoUrl of photoUrls) {
  let domain = 'invalid-url';
  try { domain = new URL(photoUrl.replaceAll('\\', '/')).hostname; } catch {}
  domainCounts[domain] = (domainCounts[domain] || 0) + 1;
}

console.log(JSON.stringify({
  documents: Object.keys(overrides).length,
  bytes: Buffer.byteLength(json),
  photoUrls: photoUrls.length,
  uniquePhotoUrls: new Set(photoUrls).size,
  domains: Object.fromEntries(Object.entries(domainCounts).sort((a, b) => b[1] - a[1])),
}, null, 2));
