import { copyFile, readFile, writeFile } from 'node:fs/promises';

const COUNTY_DATA_PATH = 'data/counties.json';
const PREVIEW_PATH = 'data/ntp_councilors.json';
const BACKUP_PATH = 'data/counties.before-ntp-facebook.json';

function cleanText(value) {
  return String(value || '').replace(/[\s\u3000]+/g, ' ').trim();
}

function normalizeName(value) {
  return cleanText(value)
    .replace(/^(?:新北市議會|新北市|議員)\s*/u, '')
    .replace(/\s*(?:議員|委員|Councilor).*$/iu, '')
    .replace(/[\s\u3000．.・·‧]/g, '')
    .trim();
}

function findNewTaipeiProperties(topo) {
  const geometries = [];
  for (const object of Object.values(topo?.objects || {})) {
    if (Array.isArray(object?.geometries)) geometries.push(...object.geometries);
    else if (object) geometries.push(object);
  }
  return geometries.find((g) => {
    const p = g?.properties || {};
    return String(p.id || '') === '65000' || cleanText(p.name) === '新北市';
  })?.properties || null;
}

function councilorCandidates(properties) {
  const raw = properties?.councilors;
  const blocks = Array.isArray(raw?.blocks) ? raw.blocks : Array.isArray(raw) ? raw : [];
  const rows = [];
  for (const block of blocks) {
    for (const candidate of block?.candidates || []) rows.push(candidate);
  }
  return rows;
}

const preview = JSON.parse(await readFile(PREVIEW_PATH, 'utf8'));
if (preview?.mode !== 'preview-only') {
  throw new Error('安全中止：ntp_councilors.json 不是 preview-only 預覽檔。');
}
if (preview?.requestFailures !== 0) {
  throw new Error(`安全中止：預覽仍有 ${preview?.requestFailures ?? '未知'} 筆抓取失敗。`);
}
if (!Array.isArray(preview?.councilors)) {
  throw new Error('安全中止：預覽檔缺少 councilors 陣列。');
}

const incumbentRows = preview.councilors.filter((row) => row?.matchedOfficialRoster);
const facebookRows = preview.councilors.filter((row) => row?.officialFacebook && row?.safeToApply);
if (!incumbentRows.length) {
  throw new Error('安全中止：沒有任何與官方現任議員名單吻合的人員。');
}

const seenPreviewNames = new Set();
for (const row of incumbentRows) {
  const key = normalizeName(row.name);
  if (!key) throw new Error('安全中止：預覽中出現空白姓名。');
  if (seenPreviewNames.has(key)) throw new Error(`安全中止：預覽中姓名重複：${row.name}`);
  seenPreviewNames.add(key);
}

const topo = JSON.parse(await readFile(COUNTY_DATA_PATH, 'utf8'));
const ntp = findNewTaipeiProperties(topo);
if (!ntp) throw new Error('找不到 data/counties.json 內的新北市資料');

const roster = councilorCandidates(ntp);
const byName = new Map();
for (const candidate of roster) {
  const key = normalizeName(candidate?.name);
  if (!key) continue;
  if (byName.has(key)) throw new Error(`安全中止：網站名單姓名重複：${candidate?.name}`);
  byName.set(key, candidate);
}

const facebookByName = new Map(facebookRows.map((row) => [normalizeName(row.name), row]));
const changed = [];
const missing = [];
let facebookChanged = 0;
let facebookSame = 0;
let incumbentChanged = 0;
let incumbentAlreadyChecked = 0;

for (const row of incumbentRows) {
  const key = normalizeName(row.name);
  const candidate = byName.get(key);
  if (!candidate) {
    missing.push(row.name);
    continue;
  }

  const before = {
    facebook: String(candidate.facebook || '').trim(),
    isIncumbent: Boolean(candidate.isIncumbent),
  };

  const fbRow = facebookByName.get(key);
  if (fbRow) {
    const nextFacebook = String(fbRow.officialFacebook || '').trim();
    if (before.facebook !== nextFacebook) {
      candidate.facebook = nextFacebook;
      facebookChanged += 1;
    } else {
      facebookSame += 1;
    }
  }

  if (candidate.isIncumbent !== true) {
    candidate.isIncumbent = true;
    incumbentChanged += 1;
  } else {
    incumbentAlreadyChecked += 1;
  }

  const after = {
    facebook: String(candidate.facebook || '').trim(),
    isIncumbent: Boolean(candidate.isIncumbent),
  };

  if (before.facebook !== after.facebook || before.isIncumbent !== after.isIncumbent) {
    changed.push({
      name: candidate.name,
      facebookBefore: before.facebook,
      facebookAfter: after.facebook,
      incumbentBefore: before.isIncumbent,
      incumbentAfter: after.isIncumbent,
    });
  }
}

if (missing.length) {
  throw new Error(`安全中止：${missing.length} 位預覽姓名已不在網站名單：${missing.join('、')}`);
}

await copyFile(COUNTY_DATA_PATH, BACKUP_PATH);
await writeFile(COUNTY_DATA_PATH, `${JSON.stringify(topo, null, 2)}\n`, 'utf8');

console.log('新北市現任議員資料安全寫回完成。');
console.log(`官方現任名單命中：${incumbentRows.length} 筆`);
console.log(`官方 FB 可套用：${facebookRows.length} 筆`);
console.log(`FB 實際更新：${facebookChanged} 筆`);
console.log(`FB 原本相同：${facebookSame} 筆`);
console.log(`「現任爭取連任」新勾選：${incumbentChanged} 筆`);
console.log(`「現任爭取連任」原本已勾：${incumbentAlreadyChecked} 筆`);
console.log(`備份：${BACKUP_PATH}`);
console.log(`已寫入：${COUNTY_DATA_PATH}`);
console.log('沒有新增、刪除或改名任何議員。');

if (changed.length) {
  console.table(changed);
}
