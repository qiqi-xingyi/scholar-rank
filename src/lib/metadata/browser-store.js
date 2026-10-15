/* Metadata persists in extension-origin IndexedDB. API keys live separately in
   trusted-only chrome.storage.local; publication exports never include them. */
const day = () => new Date().toISOString().slice(0, 10);
export class BrowserStore {
  constructor({ database = globalThis.indexedDB, storage = globalThis.chrome?.storage?.local } = {}) {
    this.database = database; this.storage = storage;
    this.state = { revision: 0, cache: {}, records: {}, metrics: {}, imports: [], usage: {} };
    this.config = {}; this.dirty = false;
  }
  async open() {
    this.db = await new Promise((resolve, reject) => {
      const request = this.database.open('scholar-rank-metadata', 1);
      request.onupgradeneeded = () => request.result.createObjectStore('state');
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(new Error('Unable to open metadata storage'));
    });
    const saved = await new Promise((resolve, reject) => { const tx = this.db.transaction('state'); const req = tx.objectStore('state').get('main'); req.onsuccess = () => resolve(req.result); req.onerror = () => reject(new Error('Unable to read metadata storage')); });
    if (saved) this.state = saved;
    await this.reloadConfig(); return this;
  }
  async reloadConfig() { const saved = await this.storage.get({ srDirectConfig: {} }); this.config = saved.srDirectConfig || {}; }
  get(key, fallback = null) { return key === 'config' ? this.config : this.state[key] ?? fallback; }
  async configure(patch) {
    this.config = { ...this.config, ...patch };
    await this.storage.set({ srDirectConfig: this.config, directEnabled: this.config.directEnabled === true });
    this.state.revision++; this.state.cache = {}; this.dirty = true; await this.flush();
  }
  revision() { return this.state.revision; }
  venueRows() { return Object.values(this.state.metrics); }
  cached(key) { const row = this.state.cache[key]; return row && row.expires > Date.now() && row.revision === this.revision() ? structuredClone(row.result) : null; }
  touch(key) { const row = this.state.records[key]; if (row) { row.hits++; row.last_seen = new Date().toISOString(); this.dirty = true; } }
  saveResult(key, request, result) {
    const ttl = result.status === 'unavailable' ? 60000 : result.identity ? 30 * 86400000 : 86400000;
    this.state.cache[key] = { result: structuredClone(result), expires: Date.now() + ttl, revision: this.revision() };
    const old = this.state.records[key], now = new Date().toISOString();
    this.state.records[key] = { key, request, result, status: result.status, first_seen: old?.first_seen || now, last_seen: now, hits: (old?.hits || 0) + 1 };
    // Keep diagnostic history bounded. Imported rankings and current usage are
    // retained independently; exports let users preserve older missing records.
    const rows = Object.values(this.state.records).sort((a,b) => b.last_seen.localeCompare(a.last_seen));
    for (const row of rows.slice(5000)) { delete this.state.records[row.key]; delete this.state.cache[row.key]; }
    for (const [id, row] of Object.entries(this.state.cache)) if (row.expires <= Date.now()) delete this.state.cache[id];
    this.dirty = true;
  }
  records({ status = '', limit = 100, offset = 0 } = {}) { return Object.values(this.state.records).filter(row => !status || (status === 'missing' ? row.status !== 'complete' : row.status === status)).sort((a,b) => b.last_seen.localeCompare(a.last_seen)).slice(offset, offset + limit); }
  importMetrics(rows, source) {
    for (const row of rows) this.state.metrics[JSON.stringify([row.kind,row.identity,row.scheme,row.year])] = row;
    this.state.imports.unshift({ imported_at: new Date().toISOString(), source, rows: rows.length }); this.state.imports = this.state.imports.slice(0,20);
    this.state.revision++; this.state.cache = {}; this.dirty = true;
  }
  metrics(kind, identities, year) {
    const found = new Map();
    for (const row of Object.values(this.state.metrics).filter(row => row.kind === kind && identities.includes(row.identity) && (!year || row.year === year)).sort((a,b) => b.year - a.year)) {
      const old = found.get(row.scheme);
      if (!old) found.set(row.scheme,row);
      else if (old.year === row.year && JSON.stringify(old.value) !== JSON.stringify(row.value)) throw new Error('Conflicting imported metrics for linked journal identifiers');
    }
    return [...found.values()];
  }
  async reserveAgentCall(max) {
    const current = this.state.usage[day()] ||= { calls: 0, input_tokens: 0, output_tokens: 0 };
    if (current.calls >= max) return false;
    current.calls++; this.dirty = true; await this.flush(); return true;
  }
  addUsage(usage = {}) { const current = this.state.usage[day()] ||= { calls: 0, input_tokens: 0, output_tokens: 0 }; current.input_tokens += Number(usage.prompt_tokens) || 0; current.output_tokens += Number(usage.completion_tokens) || 0; this.dirty = true; }
  stats() { const rows = Object.values(this.state.records); return { records: rows.length, missing: rows.filter(row => row.status !== 'complete').length, cache: Object.keys(this.state.cache).length, metrics: Object.keys(this.state.metrics).length, usage: this.state.usage[day()] || {calls:0,input_tokens:0,output_tokens:0}, imports: this.state.imports, revision: this.revision() }; }
  async flush() {
    if (!this.dirty) return;
    // All background mutations are serialized. Await the transaction commit
    // before acknowledging imports, reserving paid calls or returning results.
    await new Promise((resolve,reject) => { const tx = this.db.transaction('state','readwrite'); tx.objectStore('state').put(this.state,'main'); tx.oncomplete = resolve; tx.onerror = tx.onabort = () => reject(new Error('Unable to save metadata storage')); });
    this.dirty = false;
  }
}
