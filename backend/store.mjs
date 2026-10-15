import { DatabaseSync } from 'node:sqlite';
import { mkdirSync, chmodSync } from 'node:fs';
import { dirname } from 'node:path';
import { randomBytes } from 'node:crypto';

export class Store {
  constructor(path) {
    if (path !== ':memory:') mkdirSync(dirname(path), { recursive: true, mode: 0o700 });
    this.db = new DatabaseSync(path);
    if (path !== ':memory:') chmodSync(path, 0o600);
    this.db.exec(`PRAGMA journal_mode=WAL;
      CREATE TABLE IF NOT EXISTS meta (key TEXT PRIMARY KEY, value TEXT NOT NULL);
      CREATE TABLE IF NOT EXISTS cache (key TEXT PRIMARY KEY, value TEXT NOT NULL, expires INTEGER NOT NULL, revision INTEGER NOT NULL);
      CREATE TABLE IF NOT EXISTS records (key TEXT PRIMARY KEY, request TEXT NOT NULL, result TEXT NOT NULL, status TEXT NOT NULL, first_seen TEXT NOT NULL, last_seen TEXT NOT NULL, hits INTEGER NOT NULL DEFAULT 1);
      CREATE TABLE IF NOT EXISTS metrics (kind TEXT NOT NULL, identity TEXT NOT NULL, scheme TEXT NOT NULL, year INTEGER NOT NULL, value TEXT NOT NULL, PRIMARY KEY(kind,identity,scheme,year));
      CREATE TABLE IF NOT EXISTS imports (id INTEGER PRIMARY KEY, imported_at TEXT NOT NULL, source TEXT NOT NULL, rows INTEGER NOT NULL);
      CREATE TABLE IF NOT EXISTS usage (day TEXT PRIMARY KEY, calls INTEGER NOT NULL DEFAULT 0, input_tokens INTEGER NOT NULL DEFAULT 0, output_tokens INTEGER NOT NULL DEFAULT 0);`);
    for (const key of ['adminToken', 'extensionToken']) if (!this.get(key)) this.set(key, randomBytes(32).toString('hex'));
  }
  get(key, fallback = null) { const row = this.db.prepare('SELECT value FROM meta WHERE key=?').get(key); return row ? JSON.parse(row.value) : fallback; }
  set(key, value) { this.db.prepare('INSERT INTO meta VALUES (?,?) ON CONFLICT(key) DO UPDATE SET value=excluded.value').run(key, JSON.stringify(value)); }
  venueRows() { return this.db.prepare('SELECT value FROM metrics').all().map(row => JSON.parse(row.value)); }
  revision() { return this.get('revision', 0); }
  cached(key) {
    const row = this.db.prepare('SELECT value,expires,revision FROM cache WHERE key=?').get(key);
    return row && row.expires > Date.now() && row.revision === this.revision() ? JSON.parse(row.value) : null;
  }
  saveResult(key, request, result) {
    const now = new Date().toISOString();
    // Outages are retried sooner than genuine missing metadata. Imported rankings
    // invalidate cached results through the revision column immediately.
    const ttl = result.status === 'unavailable' ? 60_000 : result.identity ? 30 * 86400_000 : 86400_000;
    this.db.prepare('INSERT INTO cache VALUES (?,?,?,?) ON CONFLICT(key) DO UPDATE SET value=excluded.value,expires=excluded.expires,revision=excluded.revision').run(key, JSON.stringify(result), Date.now() + ttl, this.revision());
    this.db.prepare(`INSERT INTO records VALUES (?,?,?,?,?,?,1) ON CONFLICT(key) DO UPDATE SET request=excluded.request,result=excluded.result,status=excluded.status,last_seen=excluded.last_seen,hits=records.hits+1`).run(key, JSON.stringify(request), JSON.stringify(result), result.status, now, now);
  }
  touch(key) { this.db.prepare('UPDATE records SET hits=hits+1,last_seen=? WHERE key=?').run(new Date().toISOString(), key); }
  records({ status = '', limit = 100, offset = 0 } = {}) {
    const where = status === 'missing' ? "WHERE status!='complete'" : status ? 'WHERE status=?' : '';
    const params = status && status !== 'missing' ? [status] : [];
    return this.db.prepare(`SELECT * FROM records ${where} ORDER BY last_seen DESC LIMIT ? OFFSET ?`).all(...params, limit, offset).map(r => ({ ...r, request: JSON.parse(r.request), result: JSON.parse(r.result) }));
  }
  importMetrics(rows, source) {
    this.db.exec('BEGIN IMMEDIATE');
    try {
      const stmt = this.db.prepare('INSERT INTO metrics VALUES (?,?,?,?,?) ON CONFLICT(kind,identity,scheme,year) DO UPDATE SET value=excluded.value');
      for (const row of rows) stmt.run(row.kind, row.identity, row.scheme, row.year, JSON.stringify(row));
      this.db.prepare('INSERT INTO imports(imported_at,source,rows) VALUES (?,?,?)').run(new Date().toISOString(), source, rows.length);
      this.set('revision', this.revision() + 1);
      this.db.exec('COMMIT');
    } catch (err) { this.db.exec('ROLLBACK'); throw err; }
  }
  metrics(kind, identities, year) {
    const found = new Map();
    for (const identity of identities) {
      const sql = 'SELECT * FROM metrics WHERE kind=? AND identity=?' + (year ? ' AND year=?' : '') + ' ORDER BY year DESC';
      for (const row of this.db.prepare(sql).all(kind, identity, ...(year ? [year] : []))) {
        const current = found.get(row.scheme);
        if (!current || current.year < row.year) found.set(row.scheme, JSON.parse(row.value));
        else if (current.year === row.year && JSON.stringify(current.value) !== JSON.stringify(JSON.parse(row.value).value)) throw new Error('Conflicting imported metrics for linked journal identifiers');
      }
    }
    return [...found.values()];
  }
  reserveAgentCall(max) {
    const day = new Date().toISOString().slice(0, 10);
    this.db.prepare('INSERT OR IGNORE INTO usage(day) VALUES (?)').run(day);
    return Number(this.db.prepare('UPDATE usage SET calls=calls+1 WHERE day=? AND calls<?').run(day, max).changes) === 1;
  }
  addUsage(usage = {}) { this.db.prepare('UPDATE usage SET input_tokens=input_tokens+?,output_tokens=output_tokens+? WHERE day=?').run(Number(usage.prompt_tokens) || 0, Number(usage.completion_tokens) || 0, new Date().toISOString().slice(0, 10)); }
  stats() {
    return { cache: this.db.prepare('SELECT COUNT(*) AS count FROM cache').get().count,
      missing: this.db.prepare("SELECT COUNT(*) AS count FROM records WHERE status!='complete'").get().count,
      records: this.db.prepare('SELECT COUNT(*) AS count FROM records').get().count,
      metrics: this.db.prepare('SELECT COUNT(*) AS count FROM metrics').get().count,
      revision: this.revision(), usage: this.db.prepare('SELECT * FROM usage WHERE day=?').get(new Date().toISOString().slice(0, 10)) || { calls: 0, input_tokens: 0, output_tokens: 0 },
      imports: this.db.prepare('SELECT * FROM imports ORDER BY id DESC LIMIT 10').all() };
  }
  close() { this.db.close(); }
}
