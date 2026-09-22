throw new Error('此歷史修補工具已停用，避免覆蓋統一儲存版本。請閱讀 STORAGE.md。');
import { readFile, writeFile } from 'node:fs/promises';

const path = 'admin.html';
const html = await readFile(path, 'utf8');
const marker = '  <script src="./admin-kv-sync.js"></script>\n';

if (html.includes(marker.trim())) {
  console.log('admin-kv-sync.js already mounted');
  process.exit(0);
}

const target = '</body>\n</html>';
if (!html.includes(target)) {
  throw new Error('安全中止：找不到 admin.html 結尾標記，不自動修改。');
}

const next = html.replace(target, `${marker}</body>\n</html>`);
await writeFile(path, next, 'utf8');
console.log('Mounted admin-kv-sync.js in admin.html');
