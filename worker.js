import { EmailMessage } from 'cloudflare:email';

const JSON_HEADERS = {
  'Content-Type': 'application/json; charset=utf-8',
  'Cache-Control': 'no-store',
};

const SECURITY_HEADERS = {
  'X-Content-Type-Options': 'nosniff',
  'Referrer-Policy': 'no-referrer',
  'Cross-Origin-Resource-Policy': 'cross-origin',
  'Strict-Transport-Security': 'max-age=31536000; includeSubDomains',
};

// 公開 GET 允許讀取的 KV key（前端與 scripts/ 實際用到的只有這幾個）
const PUBLIC_KEYS = new Set(['overrides', 'observatory_links', 'election_summary', 'site_announcement']);

// 資料內容中會被當成連結/圖片網址渲染的欄位，寫入時強制過濾協定
const URL_FIELDS = new Set([
  'photoUrl', 'facebook', 'instagram', 'threads', 'youtube',
  'gazetteUrl', 'taiwanGoGoUrl', 'url', 'website', 'olcPhotoUrl',
]);

const MAX_ADMIN_BODY = 10 * 1024 * 1024; // 整包 overrides 可能較大
const MAX_SINGLE_BODY = 512 * 1024;
const MAX_CONTACT_BODY = 16 * 1024;
const MAX_STRING = 4000;
const MAX_DEPTH = 12;

const ANNOUNCEMENT_PAGES = ['map', 'observatory', 'support', 'contact'];
const DEFAULT_ANNOUNCEMENT = {
  enabled: true,
  title: '金流審核中',
  message: '「支持島民觀察室」的金流服務正在審核中，暫時無法使用。開放後會在這裡公告，感謝你的關心與支持。',
  pages: { map: false, observatory: false, support: true, contact: false },
  supportLock: true,
};

const DEFAULT_OBSERVATORY_LINKS = [
  { n: '中選會選舉資料庫', cat: '官方數據庫', url: 'https://db.cec.gov.tw/', d: '歷屆公職選舉、登記名冊與官方選舉公報查詢。' },
  { n: '立法院議事轉播 IVOD', cat: '政見與法案監督', url: 'https://ivod.ly.gov.tw/', d: '國會院會與各委員會即時視訊轉播與歷史隨選隨播系統。' },
  { n: '監察院政治獻金公開平臺', cat: '陽光法案開放', url: 'https://ardata.cy.gov.tw/', d: '檢驗各政黨與候選人合法申報之收支帳冊與競選資金流向。' },
  { n: '沃草 Watchout 國會觀測', cat: '公民科技媒體', url: 'https://watchout.tw/', d: '以圖文與資訊設計降低公民政治參與門檻的獨立媒體平台。' },
  { n: '政治開箱 Politics Design', cat: '政治視覺研究', url: 'https://politicsdesign.tw/', d: '台灣當代政治競選美學與民主視覺溝通研究平台。' },
];

/* ------------------------------ helpers ------------------------------ */

class HttpError extends Error {
  constructor(status, message) {
    super(message);
    this.status = status;
    this.expose = true; // 這種錯誤訊息可以回給使用者
  }
}

function allowedOrigins(env) {
  return (env.ALLOWED_ORIGINS || '').split(',').map((s) => s.trim()).filter(Boolean);
}

function corsHeaders(request, env) {
  const origin = request.headers.get('Origin');
  const allowed = allowedOrigins(env);
  const headers = {
    'Access-Control-Allow-Methods': 'GET, POST, PUT, DELETE, OPTIONS',
    'Access-Control-Allow-Headers': 'Authorization, Content-Type',
    'Access-Control-Max-Age': '600',
    'Vary': 'Origin',
  };
  if (origin && allowed.includes(origin)) {
    headers['Access-Control-Allow-Origin'] = origin;
    headers['Access-Control-Allow-Credentials'] = 'true';
  }
  // 不在白名單的 Origin：不回 Allow-Origin，瀏覽器會擋下跨站讀取。
  return headers;
}

function jsonResponse(request, env, body, init = {}) {
  return new Response(JSON.stringify(body), {
    ...init,
    headers: {
      ...JSON_HEADERS,
      ...SECURITY_HEADERS,
      'Content-Security-Policy': "default-src 'none'",
      ...corsHeaders(request, env),
      ...(init.headers || {}),
    },
  });
}

function textResponse(request, env, body, init = {}) {
  return new Response(body, {
    ...init,
    headers: {
      ...SECURITY_HEADERS,
      'Content-Security-Policy': "default-src 'none'",
      ...corsHeaders(request, env),
      ...(init.headers || {}),
    },
  });
}

function normalizeKey(key) {
  return String(key || '').replace(/^\/+/, '').trim();
}

async function readJsonKV(env, key, fallback = null) {
  const raw = await env.ELECTION_KV.get(key);
  if (!raw) return fallback;
  try {
    return JSON.parse(raw);
  } catch (err) {
    throw new Error(`KV key ${key} is not valid JSON`);
  }
}

async function writeJsonKV(env, key, value) {
  await env.ELECTION_KV.put(key, JSON.stringify(value, null, 2));
}

// 常數時間字串比對（避免 timing attack）
function timingSafeEqual(a, b) {
  const enc = new TextEncoder();
  const x = enc.encode(String(a));
  const y = enc.encode(String(b));
  let diff = x.length ^ y.length;
  const len = Math.max(x.length, y.length);
  for (let i = 0; i < len; i++) diff |= (x[i] || 0) ^ (y[i] || 0);
  return diff === 0;
}

async function readJsonBody(request, maxBytes) {
  const declared = Number(request.headers.get('content-length') || 0);
  if (declared > maxBytes) throw new HttpError(413, '請求內容過大');
  const text = await request.text();
  if (text.length > maxBytes) throw new HttpError(413, '請求內容過大');
  try {
    return JSON.parse(text);
  } catch (_) {
    throw new HttpError(400, '請求內容不是有效的 JSON');
  }
}

// URL 欄位：只接受 http(s)、或同站的單斜線相對路徑（例如 /api/photo/<hash>）
function isSafeUrl(value) {
  const v = String(value || '').trim();
  if (!v) return true;
  if (/^https?:\/\/[^\s"'<>]+$/i.test(v)) return true;
  if (/^\/(?!\/)[^\s"'<>\\]*$/.test(v)) return true;
  if (/^\.\/[^\s"'<>\\]*$/.test(v)) return true;
  return false;
}

// 遞迴清理寫入資料：限制深度/字串長度，URL 欄位不合格就清空，不改動其他結構。
function sanitizeData(value, depth = 0, key = '') {
  if (depth > MAX_DEPTH) throw new HttpError(400, '資料巢狀層級過深');
  if (value === null || typeof value === 'boolean' || typeof value === 'number') return value;
  if (typeof value === 'string') {
    if (value.length > MAX_STRING * 2) throw new HttpError(400, '欄位內容過長');
    if (URL_FIELDS.has(key) && !isSafeUrl(value)) return '';
    return value;
  }
  if (Array.isArray(value)) {
    if (value.length > 5000) throw new HttpError(400, '陣列過長');
    return value.map((item) => sanitizeData(item, depth + 1, key));
  }
  if (typeof value === 'object') {
    const out = {};
    for (const [k, v] of Object.entries(value)) {
      if (k === '__proto__' || k === 'constructor' || k === 'prototype') continue;
      out[k] = sanitizeData(v, depth + 1, k);
    }
    return out;
  }
  return undefined;
}

/* --------------------- Cloudflare Access JWT 驗證 --------------------- */

let jwksCache = { at: 0, keys: null, team: '' };

function b64urlToBytes(str) {
  const pad = '='.repeat((4 - (str.length % 4)) % 4);
  const bin = atob((str + pad).replace(/-/g, '+').replace(/_/g, '/'));
  return Uint8Array.from(bin, (c) => c.charCodeAt(0));
}

async function getAccessKeys(team) {
  const now = Date.now();
  if (jwksCache.keys && jwksCache.team === team && now - jwksCache.at < 60 * 60 * 1000) {
    return jwksCache.keys;
  }
  const res = await fetch(`https://${team}/cdn-cgi/access/certs`);
  if (!res.ok) throw new Error('無法取得 Access 公鑰');
  const { keys } = await res.json();
  jwksCache = { at: now, keys, team };
  return keys;
}

async function verifyAccessJwt(token, env) {
  const team = String(env.CF_ACCESS_TEAM_DOMAIN || '').replace(/^https?:\/\//, '').replace(/\/+$/, '');
  const aud = env.CF_ACCESS_AUD || '';
  const parts = token.split('.');
  if (parts.length !== 3) return null;

  const header = JSON.parse(new TextDecoder().decode(b64urlToBytes(parts[0])));
  const payload = JSON.parse(new TextDecoder().decode(b64urlToBytes(parts[1])));
  if (header.alg !== 'RS256') return null;

  const keys = await getAccessKeys(team);
  const jwk = keys.find((k) => k.kid === header.kid);
  if (!jwk) return null;

  const cryptoKey = await crypto.subtle.importKey(
    'jwk', jwk, { name: 'RSASSA-PKCS1-v1_5', hash: 'SHA-256' }, false, ['verify'],
  );
  const ok = await crypto.subtle.verify(
    'RSASSA-PKCS1-v1_5',
    cryptoKey,
    b64urlToBytes(parts[2]),
    new TextEncoder().encode(`${parts[0]}.${parts[1]}`),
  );
  if (!ok) return null;

  const nowSec = Math.floor(Date.now() / 1000);
  if (typeof payload.exp !== 'number' || payload.exp < nowSec) return null;
  if (typeof payload.nbf === 'number' && payload.nbf > nowSec + 60) return null;
  if (payload.iss !== `https://${team}`) return null;
  const audList = Array.isArray(payload.aud) ? payload.aud : [payload.aud];
  if (!audList.includes(aud)) return null;
  return payload.email || null;
}

function isAllowedAccessEmail(email, env) {
  if (!email) return false;
  const allowed = (env.ADMIN_EMAILS || '')
    .split(',')
    .map((item) => item.trim().toLowerCase())
    .filter(Boolean);
  // 沒設定白名單時一律拒絕（fail closed）
  return allowed.length > 0 && allowed.includes(email.toLowerCase());
}

function getBearerToken(request) {
  const auth = request.headers.get('Authorization') || '';
  const match = auth.match(/^Bearer\s+(.+)$/i);
  return match ? match[1].trim() : '';
}

async function getAdminSession(request, env) {
  if (env.ENABLE_CF_ACCESS_AUTH === 'true') {
    let email = '';
    if (env.CF_ACCESS_TEAM_DOMAIN && env.CF_ACCESS_AUD) {
      // 正確做法：驗證 Access 簽發的 JWT，header 可被偽造、JWT 不行
      const jwt = request.headers.get('Cf-Access-Jwt-Assertion') || '';
      if (jwt) {
        try { email = (await verifyAccessJwt(jwt, env)) || ''; } catch (_) { email = ''; }
      }
    } else {
      // 相容舊設定：尚未設定 CF_ACCESS_TEAM_DOMAIN / CF_ACCESS_AUD 時暫時沿用 header
      // （可被偽造，請儘快設定上面兩個變數，設定後這段就不會再被使用）
      email = request.headers.get('Cf-Access-Authenticated-User-Email') || '';
    }
    if (isAllowedAccessEmail(email, env)) {
      return { email, authMode: 'cloudflare-access' };
    }
  }

  const configuredToken = env.ADMIN_TOKEN || '';
  const suppliedToken = getBearerToken(request);
  if (configuredToken && suppliedToken && timingSafeEqual(suppliedToken, configuredToken)) {
    return { email: 'token-admin', authMode: 'admin-token' };
  }
  return null;
}

async function requireAdmin(request, env) {
  const session = await getAdminSession(request, env);
  if (!session) throw new HttpError(401, '未授權：請通過 Cloudflare Access，或提供有效 ADMIN_TOKEN。');

  // Cookie 型登入（Access）需要防 CSRF：寫入請求必須來自允許的 Origin
  if (session.authMode === 'cloudflare-access' && !['GET', 'HEAD', 'OPTIONS'].includes(request.method)) {
    const origin = request.headers.get('Origin');
    if (!origin || !allowedOrigins(env).includes(origin)) {
      throw new HttpError(403, '不允許的來源');
    }
  }
  return session;
}

/* ------------------------------ handlers ------------------------------ */

async function handlePublicGet(request, env, url) {
  const key = normalizeKey(url.searchParams.get('key'));
  if (!key) {
    return jsonResponse(request, env, { error: '請指定 key，例如 ?key=election_summary' }, { status: 400 });
  }
  // 白名單：其他 key（contact_submissions、contact:*、override:*、photo:* …）一律不公開
  if (!PUBLIC_KEYS.has(key)) {
    return jsonResponse(request, env, { error: '找不到資料' }, { status: 404 });
  }

  const raw = await env.ELECTION_KV.get(key);
  if (!raw) {
    return jsonResponse(request, env, { error: '找不到資料' }, { status: 404 });
  }

  // 已快取照片一律以相對路徑 /api/photo/<hash> 對外輸出，資料中不留任何網域。
  const body = raw.replace(/https?:\/\/[a-z0-9.-]+\.workers\.dev(\/api\/photo\/[0-9a-f]+)/gi, '$1');
  return textResponse(request, env, body, {
    status: 200,
    headers: {
      'Content-Type': 'application/json; charset=utf-8',
      'Cache-Control': 'no-store',
    },
  });
}

// 阻擋內網 / IP / localhost 類主機，避免 cache-photo 被拿去打內部服務（SSRF）
function isBlockedHost(hostname) {
  const h = hostname.toLowerCase();
  if (!h.includes('.')) return true; // localhost、內網短主機名
  if (/^\d{1,3}(\.\d{1,3}){3}$/.test(h)) return true; // IPv4 字面值
  if (h.startsWith('[') || h.includes(':')) return true; // IPv6
  if (/\.(local|internal|localhost|lan|home|corp)$/.test(h)) return true;
  return false;
}

async function handleAdmin(request, env, url) {
  const session = await requireAdmin(request, env);
  const path = url.pathname.replace(/^\/api\/admin\/?/, '');

  if (request.method === 'GET' && path === 'login') {
    const destination = env.ADMIN_REDIRECT_URL || '/admin.html';
    const redirectUrl = new URL(destination);
    // 只允許導向白名單網域，避免 open redirect
    if (!allowedOrigins(env).includes(redirectUrl.origin)) {
      throw new HttpError(400, '不允許的導向網址');
    }
    redirectUrl.searchParams.set('access', '1');
    return Response.redirect(redirectUrl.toString(), 302);
  }

  if (request.method === 'GET' && path === 'me') {
    return jsonResponse(request, env, session);
  }

  if (path === 'overrides') {
    if (request.method === 'GET') {
      const overrides = await readJsonKV(env, 'overrides', {});
      return jsonResponse(request, env, overrides || {});
    }
    if (request.method === 'PUT') {
      const payload = await readJsonBody(request, MAX_ADMIN_BODY);
      const overrides = payload?.overrides;
      if (!overrides || typeof overrides !== 'object' || Array.isArray(overrides)) {
        return jsonResponse(request, env, { error: '請提供有效的 overrides 物件' }, { status: 400 });
      }
      const cleaned = sanitizeData(overrides);
      await writeJsonKV(env, 'overrides', cleaned);
      return jsonResponse(request, env, { ok: true, count: Object.keys(cleaned).length, updatedAt: new Date().toISOString(), updatedBy: session.email });
    }
  }

  if (path === 'announcement') {
    if (request.method === 'GET') {
      const saved = await readJsonKV(env, 'site_announcement', null);
      return jsonResponse(request, env, saved && typeof saved === 'object' ? saved : DEFAULT_ANNOUNCEMENT);
    }
    if (request.method === 'PUT') {
      const payload = await readJsonBody(request, MAX_SINGLE_BODY);
      if (!payload || typeof payload !== 'object' || Array.isArray(payload)) {
        return jsonResponse(request, env, { error: '請提供有效的公告內容' }, { status: 400 });
      }
      const pages = {};
      ANNOUNCEMENT_PAGES.forEach((p) => { pages[p] = payload.pages?.[p] === true; });
      const next = {
        enabled: payload.enabled === true,
        title: String(payload.title || '').trim().slice(0, 80),
        message: String(payload.message || '').trim().slice(0, 600),
        pages,
        supportLock: payload.supportLock === true,
        updatedAt: new Date().toISOString(),
        updatedBy: session.email,
      };
      if (next.enabled && !next.title && !next.message) {
        return jsonResponse(request, env, { error: '啟用公告時，標題與內容至少要填一項。' }, { status: 400 });
      }
      await writeJsonKV(env, 'site_announcement', next);
      return jsonResponse(request, env, { ok: true, ...next });
    }
  }

  if (path === 'observatory-links') {
    if (request.method === 'GET') {
      const saved = await readJsonKV(env, 'observatory_links', null);
      return jsonResponse(request, env, { links: Array.isArray(saved?.links) ? saved.links : DEFAULT_OBSERVATORY_LINKS });
    }
    if (request.method === 'PUT') {
      const payload = await readJsonBody(request, MAX_SINGLE_BODY);
      const links = Array.isArray(payload?.links) ? payload.links : null;
      if (!links || links.some((item) => !item || !item.n || !item.cat || !/^https?:\/\/[^\s"'<>]+$/i.test(item.url || ''))) {
        return jsonResponse(request, env, { error: '每筆連結都需要名稱、分類與有效網址。' }, { status: 400 });
      }
      const cleaned = links.slice(0, 50).map((item) => ({
        n: String(item.n).trim().slice(0, 100),
        cat: String(item.cat).trim().slice(0, 80),
        url: String(item.url).trim().slice(0, 1000),
        d: String(item.d || '').trim().slice(0, 400),
      }));
      const next = { links: cleaned, updatedAt: new Date().toISOString(), updatedBy: session.email };
      await writeJsonKV(env, 'observatory_links', next);
      return jsonResponse(request, env, { ok: true, ...next });
    }
  }

  if (request.method === 'GET' && path === 'contact-submissions') {
    const submissions = await readJsonKV(env, 'contact_submissions', []);
    return jsonResponse(request, env, { submissions: Array.isArray(submissions) ? submissions : [] });
  }

  const overrideMatch = path.match(/^overrides\/([^/]+)$/);
  if (overrideMatch) {
    const code = decodeURIComponent(overrideMatch[1]);
    if (!/^[A-Za-z0-9_\-]{1,64}$/.test(code)) {
      return jsonResponse(request, env, { error: '無效的代碼' }, { status: 400 });
    }
    const overrides = await readJsonKV(env, 'overrides', {});

    if (request.method === 'PUT') {
      const raw = await readJsonBody(request, MAX_SINGLE_BODY);
      if (!raw || typeof raw !== 'object' || Array.isArray(raw)) {
        return jsonResponse(request, env, { error: '請提供有效的物件' }, { status: 400 });
      }
      const payload = sanitizeData(raw);
      const updatedAt = new Date().toISOString();
      const next = {
        ...payload,
        updatedAt: payload.updatedAt || updatedAt,
        updatedBy: payload.updatedBy || session.email,
      };
      overrides[code] = next;
      await writeJsonKV(env, 'overrides', overrides);
      await writeJsonKV(env, `override:${code}`, next);
      return jsonResponse(request, env, { ok: true, code, updatedAt: next.updatedAt });
    }

    if (request.method === 'DELETE') {
      delete overrides[code];
      await writeJsonKV(env, 'overrides', overrides);
      await env.ELECTION_KV.delete(`override:${code}`);
      return jsonResponse(request, env, { ok: true, code });
    }
  }

  const kvMatch = path.match(/^kv\/([^/]+)$/);
  if (kvMatch && request.method === 'PUT') {
    const key = decodeURIComponent(kvMatch[1]);
    if (!/^[A-Za-z0-9_:\-]{1,80}$/.test(key) || key.startsWith('photo:')) {
      return jsonResponse(request, env, { error: '無效的 key' }, { status: 400 });
    }
    const payload = sanitizeData(await readJsonBody(request, MAX_ADMIN_BODY));
    await writeJsonKV(env, key, payload);
    return jsonResponse(request, env, { ok: true, key, updatedAt: new Date().toISOString() });
  }

  // 手動快取一張外部照片：由後台觸發、Worker 伺服器對伺服器去抓一次存進 KV，
  // 公開網站之後都只打自己的網域。
  if (path === 'cache-photo' && request.method === 'POST') {
    try {
      const body = await readJsonBody(request, 8 * 1024);
      const sourceUrl = String(body?.url || '').trim();
      let parsed;
      try { parsed = new URL(sourceUrl); } catch (_) { parsed = null; }
      if (!parsed || parsed.protocol !== 'https:' || isBlockedHost(parsed.hostname)) {
        return jsonResponse(request, env, { error: '請提供有效的 https 圖片網址（不允許內網或 IP 位址）' }, { status: 400 });
      }

      let imgRes;
      try {
        imgRes = await fetch(sourceUrl, {
          redirect: 'follow',
          headers: {
            'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
            'Accept': 'image/avif,image/webp,image/apng,image/*,*/*;q=0.8',
            'Referer': parsed.origin + '/',
          },
        });
      } catch (err) {
        return jsonResponse(request, env, { error: `抓取來源圖片失敗（Worker連不上該網站）：${err.message}` }, { status: 502 });
      }
      if (!imgRes.ok) {
        return jsonResponse(request, env, { error: `來源圖片回應 HTTP ${imgRes.status}` }, { status: 502 });
      }

      // 只接受點陣圖；拒絕 svg / html 等可能夾帶腳本的內容
      const contentType = (imgRes.headers.get('Content-Type') || '').split(';')[0].trim().toLowerCase();
      if (!/^image\/(jpeg|jpg|png|webp|gif|avif)$/.test(contentType)) {
        return jsonResponse(request, env, { error: `來源不是支援的圖片格式（${contentType || '未知'}）` }, { status: 415 });
      }
      const bytes = await imgRes.arrayBuffer();
      if (bytes.byteLength > 5 * 1024 * 1024) {
        return jsonResponse(request, env, { error: '圖片超過 5MB，拒絕快取' }, { status: 413 });
      }

      const hashBuf = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(sourceUrl));
      const hash = [...new Uint8Array(hashBuf)].map((b) => b.toString(16).padStart(2, '0')).join('').slice(0, 32);

      await env.ELECTION_KV.put(`photo:${hash}`, bytes, { metadata: { contentType } });
      return jsonResponse(request, env, { ok: true, cachedUrl: `/api/photo/${hash}`, contentType, size: bytes.byteLength });
    } catch (err) {
      if (err instanceof HttpError) throw err;
      console.error('cache-photo error', err);
      return jsonResponse(request, env, { error: 'cache-photo 執行時發生未預期錯誤' }, { status: 500 });
    }
  }

  return jsonResponse(request, env, { error: '找不到 admin API 路由' }, { status: 404 });
}

// 把聯絡表單轉寄到站方信箱（Cloudflare Email Routing 的 send_email 綁定）。
// 收件地址必須是已在 Email Routing「Destination addresses」驗證過的信箱。
function toBase64Utf8(text) {
  const bytes = new TextEncoder().encode(text);
  let binary = '';
  for (let i = 0; i < bytes.length; i += 0x8000) binary += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
  return btoa(binary);
}
function wrap76(b64) { return b64.replace(/(.{76})/g, '$1\r\n'); }
function mimeWord(text) { return `=?UTF-8?B?${toBase64Utf8(text)}?=`; }

async function sendContactEmail(env, record) {
  const to = String(env.CONTACT_NOTIFY_TO || '').trim();
  if (!env.CONTACT_EMAIL || !to) return false;
  const from = String(env.CONTACT_FROM || 'contact@formosaobservatory.com').trim();
  const domain = from.split('@')[1] || 'formosaobservatory.com';
  const body = [
    `類型：${record.category}`,
    `姓名：${record.name}`,
    `電子郵件：${record.email}`,
    `涉及地區或候選人：${record.location || '（未填）'}`,
    `送出時間：${record.createdAt}`,
    '',
    record.message,
  ].join('\r\n');
  const raw = [
    `From: ${mimeWord('Formosa Observatory 聯絡表單')} <${from}>`,
    `To: <${to}>`,
    `Reply-To: <${record.email}>`,
    `Subject: ${mimeWord(`[聯絡表單] ${record.category}｜${record.name}`)}`,
    `Message-ID: <${record.id}@${domain}>`,
    `Date: ${new Date().toUTCString()}`,
    'MIME-Version: 1.0',
    'Content-Type: text/plain; charset=UTF-8',
    'Content-Transfer-Encoding: base64',
    '',
    wrap76(toBase64Utf8(body)),
  ].join('\r\n');
  try {
    await env.CONTACT_EMAIL.send(new EmailMessage(from, to, raw));
    return true;
  } catch (err) {
    console.error('contact email failed', err && err.message);
    return false;
  }
}

async function handleContactSubmission(request, env) {
  // 節流：同一 IP 每 60 秒最多 1 筆（KV 為最終一致，屬盡力而為；正式限速請搭配 WAF Rate Limiting）
  const ip = request.headers.get('CF-Connecting-IP') || 'unknown';
  const rlKey = `rl:contact:${ip}`;
  if (await env.ELECTION_KV.get(rlKey)) {
    throw new HttpError(429, '送出太頻繁，請稍後再試。');
  }

  const payload = await readJsonBody(request, MAX_CONTACT_BODY);
  const clean = (v, n) => String(v || '').replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F]/g, '').trim().slice(0, n);
  const name = clean(payload?.name, 80);
  const email = clean(payload?.email, 160);
  const category = clean(payload?.category, 80);
  const location = clean(payload?.location, 160);
  const message = clean(payload?.message, 4000);
  // honeypot：正常使用者不會填這個欄位，機器人常會
  if (payload && payload.website) {
    return jsonResponse(request, env, { ok: true, id: 'ok' });
  }
  if (!name || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) || !category || message.length < 10) {
    return jsonResponse(request, env, { error: '請填寫姓名、有效電子郵件、類型與至少 10 個字的說明。' }, { status: 400 });
  }

  await env.ELECTION_KV.put(rlKey, '1', { expirationTtl: 60 });

  const id = `${Date.now()}-${crypto.randomUUID().slice(0, 8)}`;
  const record = { id, name, email, category, location, message, createdAt: new Date().toISOString() };
  record.emailed = await sendContactEmail(env, record);
  await writeJsonKV(env, `contact:${id}`, record);
  const inbox = await readJsonKV(env, 'contact_submissions', []);
  await writeJsonKV(env, 'contact_submissions', [record, ...(Array.isArray(inbox) ? inbox : [])].slice(0, 200));
  return jsonResponse(request, env, { ok: true, id });
}

async function handlePhoto(request, env, url) {
  const hash = url.pathname.replace(/^\/api\/photo\/?/, '');
  if (!/^[0-9a-f]{32}$/.test(hash)) {
    return jsonResponse(request, env, { error: '無效的照片代碼' }, { status: 400 });
  }
  const { value, metadata } = await env.ELECTION_KV.getWithMetadata(`photo:${hash}`, 'arrayBuffer');
  if (!value) {
    return jsonResponse(request, env, { error: '找不到快取的照片，可能還沒被快取過' }, { status: 404 });
  }
  const type = metadata && /^image\/(jpeg|jpg|png|webp|gif|avif)$/.test(metadata.contentType || '')
    ? metadata.contentType
    : 'image/jpeg';
  return new Response(value, {
    headers: {
      ...SECURITY_HEADERS,
      'Content-Security-Policy': "default-src 'none'; sandbox",
      'Content-Type': type,
      'Cache-Control': 'public, max-age=31536000, immutable',
      ...corsHeaders(request, env),
    },
  });
}

/* ------------------------------- router ------------------------------- */

export default {
  async fetch(request, env) {
    if (!env.ELECTION_KV) {
      return jsonResponse(request, env, { error: 'Worker 尚未綁定 ELECTION_KV。' }, { status: 500 });
    }

    const url = new URL(request.url);

    if (request.method === 'OPTIONS') {
      return new Response(null, { status: 204, headers: { ...SECURITY_HEADERS, ...corsHeaders(request, env) } });
    }

    try {
      if (url.pathname.startsWith('/api/admin/')) {
        return await handleAdmin(request, env, url);
      }

      if (url.pathname.startsWith('/api/photo/')) {
        return await handlePhoto(request, env, url);
      }

      if (url.pathname === '/api/contact' && request.method === 'POST') {
        return await handleContactSubmission(request, env);
      }

      if (request.method === 'GET') {
        return await handlePublicGet(request, env, url);
      }

      return jsonResponse(request, env, { error: 'Method not allowed' }, { status: 405 });
    } catch (err) {
      if (err instanceof HttpError) {
        return jsonResponse(request, env, { error: err.message }, { status: err.status });
      }
      console.error('unhandled error', err);
      return jsonResponse(request, env, { error: 'Internal error' }, { status: 500 });
    }
  },
};
