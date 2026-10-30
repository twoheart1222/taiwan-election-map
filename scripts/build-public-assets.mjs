import { createHash } from 'node:crypto';
import { cp, mkdir, readFile, readdir, rm, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { transform } from 'esbuild';
import * as parse5 from 'parse5';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const output = path.join(root, '.public-deploy');
const rootFiles = [
  '_headers', 'admin-ballot-party-sync.js', 'admin-kv-sync.js', 'admin-source-order.js', 'admin.html', 'ads.txt',
  'apple-touch-icon.png', 'counties.json', 'election-data.js', 'favicon-192.png',
  'favicon-48.png', 'favicon.ico', 'favicon.png', 'index.html', 'llms-full.txt',
  'llms.txt', 'observatory.dc.html', 'reporter-links.js', 'robots.txt',
  'site-config.js', 'site.webmanifest', 'sitemap.xml', 'social-preview.png',
  'support.dc.html', 'support.js', 'taiwangogo-kv-sync.js',
];
const directories = ['.well-known', 'about', 'assets', 'data', 'election', 'history', 'observatory', 'privacy', 'related', 'source', 'vendor'];
const extensions = new Set(['.html', '.js', '.css', '.json', '.png', '.jpg', '.jpeg', '.svg', '.ico', '.webp', '.avif', '.gif', '.woff', '.woff2', '.ttf', '.xml', '.txt', '.pdf', '.webmanifest']);
const files = [];

async function walk(relative) {
  for (const entry of await readdir(path.join(root, relative), { withFileTypes: true })) {
    const next = path.posix.join(relative, entry.name);
    if (entry.isDirectory()) await walk(next);
    else if (entry.isFile() && extensions.has(path.extname(entry.name).toLowerCase())) files.push(next);
  }
}
for (const directory of directories) await walk(directory);
files.push(...rootFiles);

function locations(document, visit) {
  function walkNode(node) {
    visit(node);
    for (const child of node.childNodes || []) walkNode(child);
    if (node.content) walkNode(node.content);
  }
  walkNode(document);
}
function applyReplacements(source, replacements) {
  return replacements.sort((a, b) => b.start - a.start).reduce((text, item) => text.slice(0, item.start) + item.text + text.slice(item.end), source);
}
async function cleanCode(source, loader) {
  const result = await transform(source, {
    loader, target: 'es2020', charset: 'utf8', legalComments: 'none',
    minifyWhitespace: true, minifySyntax: true, minifyIdentifiers: false,
  });
  return result.code;
}

await rm(output, { recursive: true, force: true });
await mkdir(output, { recursive: true });
const assetHashes = new Map();
for (const relative of files) {
  const sourcePath = path.join(root, relative);
  const targetPath = path.join(output, relative);
  await mkdir(path.dirname(targetPath), { recursive: true });
  if (relative === '_headers' || relative === 'robots.txt') {
    const text = (await readFile(sourcePath, 'utf8')).split(/\r?\n/).filter(line => !/^\s*#/.test(line)).join('\n');
    await writeFile(targetPath, text);
  } else if (relative.startsWith('vendor/')) {
    // Preserve pinned third-party files byte for byte so their integrity hashes remain valid.
    await cp(sourcePath, targetPath);
  } else if (relative.endsWith('.js') || relative.endsWith('.css')) {
    const loader = relative.endsWith('.js') ? 'js' : 'css';
    const code = await cleanCode(await readFile(sourcePath, 'utf8'), loader);
    await writeFile(targetPath, code);
  } else if (!relative.endsWith('.html')) {
    await cp(sourcePath, targetPath);
  }
  if (relative.endsWith('.js') || relative.endsWith('.css')) {
    const bytes = await readFile(targetPath);
    assetHashes.set('/' + relative.replaceAll('\\', '/'), createHash('sha256').update(bytes).digest('hex').slice(0, 12));
  }
}

function versionedUrl(value, relative) {
  if (!value || /^(?:[a-z][a-z\d+.-]*:|\/\/)/i.test(value)) return null;
  const url = new URL(value, `https://example.test/${relative}`);
  const hash = assetHashes.get(url.pathname);
  if (!hash || url.pathname.startsWith('/vendor/')) return null;
  url.searchParams.set('b', hash);
  return url.pathname.startsWith('/') && value.startsWith('/')
    ? url.pathname + url.search + url.hash
    : path.posix.relative(path.posix.dirname(relative) || '.', url.pathname.slice(1)) + url.search + url.hash;
}
function attrReplacement(node, key, relative) {
  const attr = node.attrs?.find(item => item.name === key);
  const location = node.sourceCodeLocation?.attrs?.[key];
  if (!attr || !location) return null;
  const value = versionedUrl(attr.value, relative);
  if (!value) return null;
  return { start: location.startOffset, end: location.endOffset, text: `${key}="${value.replaceAll('&', '&amp;').replaceAll('"', '&quot;')}"` };
}
let removedComments = 0;
for (const relative of files.filter(file => file.endsWith('.html'))) {
  const html = await readFile(path.join(root, relative), 'utf8');
  const document = parse5.parse(html, { sourceCodeLocationInfo: true });
  const replacements = [];
  const pending = [];
  locations(document, node => {
    if (node.nodeName === '#comment' && node.sourceCodeLocation) {
      removedComments++;
      replacements.push({ start: node.sourceCodeLocation.startOffset, end: node.sourceCodeLocation.endOffset, text: '' });
    }
    if (node.nodeName === 'script') {
      const type = node.attrs?.find(item => item.name === 'type')?.value || '';
      const src = attrReplacement(node, 'src', relative);
      if (src) replacements.push(src);
      if (!node.attrs?.some(item => item.name === 'src') && ['', 'text/javascript', 'module'].includes(type)) {
        for (const child of node.childNodes || []) {
          if (child.nodeName !== '#text' || !child.sourceCodeLocation) continue;
          pending.push(cleanCode(child.value, 'js').then(code => replacements.push({ start: child.sourceCodeLocation.startOffset, end: child.sourceCodeLocation.endOffset, text: code })));
        }
      }
    }
    if (node.nodeName === 'style') {
      for (const child of node.childNodes || []) {
        if (child.nodeName !== '#text' || !child.sourceCodeLocation) continue;
        pending.push(cleanCode(child.value, 'css').then(code => replacements.push({ start: child.sourceCodeLocation.startOffset, end: child.sourceCodeLocation.endOffset, text: code })));
      }
    }
    if (node.nodeName === 'link') {
      const href = attrReplacement(node, 'href', relative);
      if (href) replacements.push(href);
    }
  });
  await Promise.all(pending);
  await writeFile(path.join(output, relative), applyReplacements(html, replacements));
}
console.log(`Built ${files.length} public assets in .public-deploy; removed ${removedComments} HTML comments.`);
