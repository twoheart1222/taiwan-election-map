const JSON_HEADERS = {
  'Content-Type': 'application/json; charset=utf-8',
  'Cache-Control': 'no-store',
};

function corsHeaders(request, env) {
  const origin = request.headers.get('Origin');
  const allowed = (env.ALLOWED_ORIGINS || '')
    .split(',')
    .map((item) => item.trim())
    .filter(Boolean);
  const allowOrigin = !origin
    ? '*'
    : allowed.length === 0 || allowed.includes(origin)
      ? origin
      : allowed[0] || origin;

  return {
    'Access-Control-Allow-Origin': allowOrigin,
    'Access-Control-Allow-Methods': 'GET, PUT, DELETE, OPTIONS',
    'Access-Control-Allow-Headers': 'Authorization, Content-Type',
    'Access-Control-Allow-Credentials': 'true',
    'Vary': 'Origin',
  };
}

function jsonResponse(request, env, body, init = {}) {
  return new Response(JSON.stringify(body), {
    ...init,
    headers: {
      ...JSON_HEADERS,
      ...corsHeaders(request, env),
      ...(init.headers || {}),
    },
  });
}

function textResponse(request, env, body, init = {}) {
  return new Response(body, {
    ...init,
    headers: {
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

function getBearerToken(request) {
  const auth = request.headers.get('Authorization') || '';
  const match = auth.match(/^Bearer\s+(.+)$/i);
  return match ? match[1].trim() : '';
}

function getAccessEmail(request) {
  return request.headers.get('Cf-Access-Authenticated-User-Email') ||
    request.headers.get('CF-Access-Authenticated-User-Email') ||
    '';
}

function isAllowedAccessEmail(email, env) {
  if (!email) return false;
  const allowed = (env.ADMIN_EMAILS || '')
    .split(',')
    .map((item) => item.trim().toLowerCase())
    .filter(Boolean);
  return allowed.length === 0 || allowed.includes(email.toLowerCase());
}

function getAdminSession(request, env) {
  const accessEmail = getAccessEmail(request);
  if (env.ENABLE_CF_ACCESS_AUTH === 'true' && isAllowedAccessEmail(accessEmail, env)) {
    return { email: accessEmail, authMode: 'cloudflare-access' };
  }

  const configuredToken = env.ADMIN_TOKEN || '';
  const suppliedToken = getBearerToken(request);
  if (configuredToken && suppliedToken && suppliedToken === configuredToken) {
    return { email: 'token-admin', authMode: 'admin-token' };
  }

  return null;
}

function requireAdmin(request, env) {
  const session = getAdminSession(request, env);
  if (!session) {
    const err = new Error('未授權：請通過 Cloudflare Access，或提供有效 ADMIN_TOKEN。');
    err.status = 401;
    throw err;
  }
  return session;
}

async function handlePublicGet(request, env, url) {
  const key = normalizeKey(url.searchParams.get('key'));
  if (!key) {
    return jsonResponse(request, env, { error: '請指定 key，例如 ?key=election_summary' }, { status: 400 });
  }

  const raw = await env.ELECTION_KV.get(key);
  if (!raw) {
    return jsonResponse(request, env, { error: `在 KV 中找不到 key: ${key}` }, { status: 404 });
  }

  return textResponse(request, env, raw, {
    status: 200,
    headers: {
      'Content-Type': 'application/json; charset=utf-8',
      'Cache-Control': 'public, max-age=600',
    },
  });
}

async function handleAdmin(request, env, url) {
  const session = requireAdmin(request, env);
  const path = url.pathname.replace(/^\/api\/admin\/?/, '');

  if (request.method === 'GET' && path === 'login') {
    const destination = env.ADMIN_REDIRECT_URL || 'https://taiwan-election-map.uprisevideoproduction.workers.dev/admin.html';
    const redirectUrl = new URL(destination);
    redirectUrl.searchParams.set('access', '1');
    return Response.redirect(redirectUrl.toString(), 302);
  }

  if (request.method === 'GET' && path === 'me') {
    return jsonResponse(request, env, session);
  }

  if (request.method === 'GET' && path === 'overrides') {
    const overrides = await readJsonKV(env, 'overrides', {});
    return jsonResponse(request, env, overrides || {});
  }

  const overrideMatch = path.match(/^overrides\/([^/]+)$/);
  if (overrideMatch) {
    const code = decodeURIComponent(overrideMatch[1]);
    const overrides = await readJsonKV(env, 'overrides', {});

    if (request.method === 'PUT') {
      const payload = await request.json();
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
    const payload = await request.json();
    await writeJsonKV(env, key, payload);
    return jsonResponse(request, env, { ok: true, key, updatedAt: new Date().toISOString() });
  }

  return jsonResponse(request, env, { error: '找不到 admin API 路由' }, { status: 404 });
}

export default {
  async fetch(request, env) {
    if (!env.ELECTION_KV) {
      return jsonResponse(request, env, { error: 'Worker 尚未綁定 ELECTION_KV。' }, { status: 500 });
    }

    const url = new URL(request.url);

    if (request.method === 'OPTIONS') {
      return new Response(null, { status: 204, headers: corsHeaders(request, env) });
    }

    try {
      if (url.pathname.startsWith('/api/admin/')) {
        return await handleAdmin(request, env, url);
      }

      if (request.method === 'GET') {
        return await handlePublicGet(request, env, url);
      }

      return jsonResponse(request, env, { error: 'Method not allowed' }, { status: 405 });
    } catch (err) {
      return jsonResponse(request, env, { error: err.message || 'Internal error' }, { status: err.status || 500 });
    }
  },
};
