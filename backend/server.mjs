import http from 'node:http';
import { readFileSync, existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { resolve, join } from 'node:path';
import { timingSafeEqual } from 'node:crypto';
import { Store } from './store.mjs';
import { Providers } from './providers.mjs';
import { Resolver, configOf } from './resolver.mjs';
import { parseImport, requestInput } from './imports.mjs';
const base = fileURLToPath(new URL('../', import.meta.url));
const same = (a,b) => typeof a === 'string' && Buffer.byteLength(a) === Buffer.byteLength(b) && timingSafeEqual(Buffer.from(a), Buffer.from(b));
function safeConfig(store) { const { deepseekKey, openalexKey, ...config } = configOf(store); return { ...config, hasDeepseekKey: !!deepseekKey, hasOpenalexKey: !!openalexKey }; }
async function body(req) {
  if (!(req.headers['content-type'] || '').startsWith('application/json')) throw Object.assign(new Error('Use application/json'), { status: 415 });
  let size = 0; const chunks = [];
  for await (const chunk of req) { size += chunk.length; if (size > 8 * 1024 * 1024) throw Object.assign(new Error('Request exceeds 8 MB'), { status: 413 }); chunks.push(chunk); }
  try { return JSON.parse(Buffer.concat(chunks).toString()); } catch { throw new Error('Invalid JSON body'); }
}
export function createServer({ store = new Store(join(base, '.local/scholar-rank.sqlite')), providers, resolver, port = 8124 } = {}) {
  providers ||= new Providers({ config: () => configOf(store) }); resolver ||= new Resolver(store, providers);
  let active = 0;
  const server = http.createServer(async (req, res) => {
    res.setHeader('X-Content-Type-Options', 'nosniff'); res.setHeader('Cache-Control', 'no-store'); res.setHeader('Referrer-Policy', 'no-referrer');
    res.setHeader('Content-Security-Policy', "default-src 'self'; script-src 'self'; style-src 'self'; connect-src 'self'; frame-ancestors 'none'; base-uri 'none'; form-action 'self'");
    const send = (status, value) => { res.writeHead(status, { 'Content-Type': 'application/json; charset=utf-8' }); res.end(JSON.stringify(value)); };
    const allowedHost = req.headers.host === `127.0.0.1:${server.address()?.port || port}`;
    if (!allowedHost) return send(403, { error: 'Use the 127.0.0.1 loopback address' });
    const localOrigin = `http://${req.headers.host}`;
    const origin = req.headers.origin;
    const extensionOrigin = /^chrome-extension:\/\/[a-p]{32}$/.test(origin || '');
    if (origin && origin !== localOrigin && !extensionOrigin) return send(403, { error: 'Origin not permitted' });
    if (extensionOrigin) { res.setHeader('Access-Control-Allow-Origin', origin); res.setHeader('Vary', 'Origin'); }
    if (req.method === 'OPTIONS') { res.setHeader('Access-Control-Allow-Methods', 'GET,POST,OPTIONS'); res.setHeader('Access-Control-Allow-Headers', 'Content-Type,X-Scholar-Token'); return send(200, {}); }
    const url = new URL(req.url, localOrigin);
    try {
      if (req.method === 'GET' && url.pathname === '/api/health') {
        const provided = req.headers['x-scholar-token'];
        if (provided && !same(provided, store.get('extensionToken')) && !same(provided, store.get('adminToken'))) return send(401, { error: 'Invalid pairing token' });
        return send(200, { ok: true, paired: !!provided, version: '1.3.0', provider: ['Crossref','OpenAlex'], agentModel: 'deepseek-flash' });
      }
      if (req.method === 'GET' && ['/', '/app.js', '/style.css', '/import-template.csv'].includes(url.pathname)) {
        if (extensionOrigin) return send(403, { error: 'Open the dashboard directly' });
        const name = url.pathname === '/' ? 'index.html' : url.pathname.slice(1);
        let file = readFileSync(new URL(`public/${name}`, import.meta.url));
        if (name === 'index.html') file = file.toString().replace('ADMIN_TOKEN', store.get('adminToken'));
        res.writeHead(200, { 'Content-Type': name.endsWith('.html') ? 'text/html; charset=utf-8' : name.endsWith('.js') ? 'text/javascript' : name.endsWith('.csv') ? 'text/csv' : 'text/css' }); return res.end(file);
      }
      const token = req.headers['x-scholar-token']; const admin = same(token, store.get('adminToken'));
      const extension = same(token, store.get('extensionToken'));
      if (!admin && !extension) return send(401, { error: 'Pairing token required' });
      if (url.pathname === '/api/resolve' && req.method === 'POST') {
        if (active >= 8 || resolver.pending.size >= 64) return send(429, { error: 'Resolver busy; retry later' });
        active++; try { return send(200, await resolver.resolve(requestInput(await body(req)))); } finally { active--; }
      }
      if (!admin || extensionOrigin) return send(403, { error: 'Dashboard access required' });
      if (url.pathname === '/api/status' && req.method === 'GET') return send(200, { ...store.stats(), config: safeConfig(store), extensionToken: store.get('extensionToken') });
      if (url.pathname === '/api/records' && req.method === 'GET') return send(200, store.records({ status: url.searchParams.get('status') || '', limit: Math.min(1000, Math.max(1, Number(url.searchParams.get('limit')) || 100)), offset: Math.max(0, Number(url.searchParams.get('offset')) || 0) }));
      if (url.pathname === '/api/retry' && req.method === 'POST') {
        const input = await body(req); const row = store.db.prepare('SELECT request FROM records WHERE key=?').get(String(input.key));
        if (!row) return send(404, { error: 'Record not found' });
        if (active >= 8) return send(429, { error: 'Resolver busy' });
        active++; try { return send(200, await resolver.resolve(JSON.parse(row.request), { refresh: true })); } finally { active--; }
      }
      if (url.pathname === '/api/import' && req.method === 'POST') {
        const input = await body(req); const rows = parseImport(input.data);
        if (input.preview !== false) return send(200, { metrics: rows.length, venues: new Set(rows.map(r => `${r.kind}:${r.identity}`)).size, preview: rows.slice(0,20) });
        store.importMetrics(rows, String(input.filename || 'Dashboard import').slice(0,200));
        return send(200, { imported: rows.length, revision: store.revision(), note: 'Cached resolutions invalidated. Retry existing missing records to refresh them.' });
      }
      if (url.pathname === '/api/config' && req.method === 'POST') {
        const input = await body(req), config = configOf(store);
        if (input.dailyLimit != null) { const n = Number(input.dailyLimit); if (!Number.isInteger(n) || n < 0 || n > 1000) throw new Error('Daily limit must be 0–1000'); config.dailyLimit = n; }
        if (input.agentEnabled != null) { if (typeof input.agentEnabled !== 'boolean') throw new Error('agentEnabled must be boolean'); config.agentEnabled = input.agentEnabled; }
        if (input.email != null) { if (typeof input.email !== 'string' || input.email.length > 254 || (input.email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(input.email))) throw new Error('Invalid contact email'); config.email = input.email; }
        for (const key of ['deepseekKey','openalexKey']) if (input[key] != null) { if (typeof input[key] !== 'string' || input[key].length > 500 || /\s/.test(input[key])) throw new Error('Invalid API key'); if (input[key]) config[key] = input[key]; }
        if (input.removeDeepseekKey === true) delete config.deepseekKey;
        if (input.removeOpenalexKey === true) delete config.openalexKey;
        store.set('config', config); store.set('revision', store.revision() + 1); return send(200, safeConfig(store));
      }
      return send(404, { error: 'Not found' });
    } catch (error) { send(error.status || 400, { error: error.message?.slice(0,300) || 'Request failed' }); }
  });
  server.requestTimeout = 30000; server.headersTimeout = 10000;
  return { server, store, resolver };
}
if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const env = join(base, '.env'); if (existsSync(env)) process.loadEnvFile(env);
  const { server, store } = createServer();
  const config = configOf(store);
  if (process.env.DEEPSEEK_API_KEY) config.deepseekKey = process.env.DEEPSEEK_API_KEY;
  if (process.env.OPENALEX_API_KEY) config.openalexKey = process.env.OPENALEX_API_KEY;
  if (process.env.CROSSREF_MAILTO) config.email = process.env.CROSSREF_MAILTO;
  if (JSON.stringify(store.get('config', {})) !== JSON.stringify(config)) { store.set('config', config); store.set('revision', store.revision() + 1); }
  server.listen(8124, '127.0.0.1', () => console.log('Scholar Rank backend: http://127.0.0.1:8124 (local only). Open the dashboard to pair the extension.'));
  server.on('error', err => { console.error(err.code === 'EADDRINUSE' ? 'Port 8124 is already in use.' : 'Unable to start local backend: ' + err.code); store.close(); process.exitCode = 1; });
  for (const signal of ['SIGINT','SIGTERM']) process.on(signal, () => server.close(() => { store.close(); process.exit(0); }));
}
