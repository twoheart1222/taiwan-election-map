// One authoritative, transactional store. Existing KV data is imported once and
// backed up before migration. Never merge stale override:<code> keys.
import baseline from './storage-baseline.json';
import './election-data.js';

export class OverrideStore {
  constructor(ctx, env) {
    this.ctx = ctx;
    this.env = env;
    this.sql = ctx.storage.sql;
    this.sql.exec('CREATE TABLE IF NOT EXISTS documents (code TEXT PRIMARY KEY, body TEXT NOT NULL)');
    this.sql.exec('CREATE TABLE IF NOT EXISTS meta (key TEXT PRIMARY KEY, value TEXT NOT NULL)');
  }

  async initialize() {
    let failure;
    await this.ctx.blockConcurrencyWhile(async () => {
      try {
        if ([...this.sql.exec("SELECT value FROM meta WHERE key = 'initialized'")].length) return;
        const raw = await this.env.ELECTION_KV.get('overrides');
        // A missing/broken binding must not silently initialize an empty database.
        if (raw === null) throw new Error('KV overrides 不存在；請先確認 namespace 或明確建立初始資料。');
        const data = JSON.parse(raw);
        validateMap(data);
        if (!await this.env.ELECTION_KV.get('backup:overrides:before-unified-store')) {
          await this.env.ELECTION_KV.put('backup:overrides:before-unified-store', raw);
        }
        this.ctx.storage.transactionSync(() => {
          for (const [code, value] of Object.entries(data)) {
            this.sql.exec('INSERT INTO documents VALUES (?, ?)', code,
              encode({ ...ElectionData.mergeArea(baseline[code] || {}, value),
                schemaVersion: 2, _revision: crypto.randomUUID() }));
          }
          this.sql.exec('INSERT INTO meta VALUES (?, ?)', 'initialized', new Date().toISOString());
          this.sql.exec('INSERT INTO meta VALUES (?, ?)', 'pending', '1');
        });
      } catch (err) { failure = err; }
    });
    if (failure) throw failure;
  }

  snapshot() {
    return Object.fromEntries([...this.sql.exec('SELECT code, body FROM documents ORDER BY code')]
      .map(row => [row.code, JSON.parse(row.body)]));
  }

  async fetch(request) {
    try {
      await this.initialize();
      return await this.ctx.blockConcurrencyWhile(async () => {
        try {
        await this.publish();
        if (request.method === 'GET') return Response.json(this.snapshot());
        const command = await request.json();
        const { changes, expected, actor } = command;
        validateMap(changes, true);
        if (!expected || typeof expected !== 'object') return failure(428, '缺少版本資訊，請重新載入後台。');
        // No awaits inside this transaction: comparison and all writes are atomic.
        const result = this.ctx.storage.transactionSync(() => {
          const current = this.snapshot();
          for (const code of Object.keys(changes)) {
            if (!Object.hasOwn(expected, code)) return failure(428, '缺少版本資訊，請重新載入後台。');
            if (expected[code] !== (current[code]?._revision || '0')) {
              return failure(409, `資料 ${code} 已被更新，請先下載目前編輯的 JSON 備份，再重新整理後比較。`);
            }
          }
          const saved = {};
          for (const [code, value] of Object.entries(changes)) {
            if (value === null) {
              this.sql.exec('DELETE FROM documents WHERE code = ?', code);
              saved[code] = null;
            } else {
              saved[code] = JSON.parse(encode({ ...baseline[code], ...current[code], ...value,
                schemaVersion: 2, _revision: crypto.randomUUID(),
                updatedAt: new Date().toISOString(), updatedBy: actor }));
              this.sql.exec('INSERT OR REPLACE INTO documents VALUES (?, ?)', code, JSON.stringify(saved[code]));
            }
          }
          this.sql.exec("INSERT OR REPLACE INTO meta VALUES ('pending', '1')");
          return Response.json({ ok: true, overrides: saved });
        });
        if (result.ok) await this.publish();
        return result;
        } catch (err) {
          console.error('override publication failed', err);
          return failure(503, 'KV 同步尚未完成，系統會自動重試。請保留編輯備份並重新載入確認，勿用舊資料覆蓋。');
        }
      });
    } catch (err) {
      console.error('override store failed', err);
      return failure(503, '候選人儲存服務未就緒；請檢查 KV 初始資料與儲存服務設定。');
    }
  }

  async publish() {
    if (![...this.sql.exec("SELECT value FROM meta WHERE key = 'pending'")].length) return;
    const last = Number([...this.sql.exec("SELECT value FROM meta WHERE key = 'publishedAt'")][0]?.value || 0);
    // KV allows at most one write/second/key, including across object restarts.
    const delay = 1100 - (Date.now() - last);
    if (delay > 0) await new Promise(resolve => setTimeout(resolve, delay));
    // Retry automatically after a transient KV outage, even if the client leaves.
    await this.ctx.storage.setAlarm(Date.now() + 60000);
    await this.env.ELECTION_KV.put('overrides', JSON.stringify(this.snapshot()));
    this.ctx.storage.transactionSync(() => {
      this.sql.exec("DELETE FROM meta WHERE key = 'pending'");
      this.sql.exec("INSERT OR REPLACE INTO meta VALUES ('publishedAt', ?)", String(Date.now()));
    });
    await this.ctx.storage.deleteAlarm();
  }

  async alarm() {
    await this.ctx.blockConcurrencyWhile(() => this.publish());
  }
}

export function validateMap(data, allowDelete = false) {
  if (!data || typeof data !== 'object' || Array.isArray(data)) throw new Error('Invalid overrides map');
  for (const [code, value] of Object.entries(data)) {
    if (!/^[A-Za-z0-9_-]{1,64}$/.test(code) || ['__proto__', 'constructor', 'prototype'].includes(code)) throw new Error('Invalid code');
    if (allowDelete && value === null) continue;
    if (!value || typeof value !== 'object' || Array.isArray(value)) throw new Error('Invalid override document');
    for (const field of ['candidates', 'councilors', 'representatives']) {
      if (!Object.hasOwn(value, field)) continue;
      const list = field === 'candidates' ? value[field] : (Array.isArray(value[field]) ? value[field] : value[field]?.blocks);
      if (!Array.isArray(list) || list.some(item => !item || typeof item !== 'object' || Array.isArray(item))) throw new Error('Invalid roster');
      if (field !== 'candidates' && list.some(block => !Array.isArray(block.candidates))) throw new Error('Invalid district candidates');
    }
  }
}

function failure(status, error) { return Response.json({ error }, { status }); }

function encode(value) {
  return JSON.stringify(value).replace(/https?:\/\/[a-z0-9.-]+\.workers\.dev(\/api\/photo\/[0-9a-f]+)/gi, '$1');
}
