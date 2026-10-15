import { BrowserStore } from './browser-store.js';
import { Providers } from './providers.js';
import { createResolverClass } from './resolver.js';
import { parseImport } from './imports.js';
import '../normalize.js';
import '../ranking.js';
const defaults = { directEnabled: false, agentEnabled: false, dailyLimit: 20, deepseekModel: 'deepseek-flash' };
export function publicConfig(config) { const { deepseekKey, openalexKey, ...safe } = { ...defaults, ...config }; return { ...safe, hasDeepseekKey: !!deepseekKey, hasOpenalexKey: !!openalexKey }; }
export function configPatch(input) {
  if (!input || typeof input !== 'object' || Array.isArray(input)) throw new Error('Expected settings');
  const patch = {};
  for (const key of ['directEnabled','agentEnabled']) if (input[key] != null) { if (typeof input[key] !== 'boolean') throw new Error(`${key} must be boolean`); patch[key] = input[key]; }
  if (input.dailyLimit != null) { const n = Number(input.dailyLimit); if (!Number.isInteger(n) || n < 0 || n > 1000) throw new Error('Daily limit must be 0–1000'); patch.dailyLimit = n; }
  if (input.email != null) { if (typeof input.email !== 'string' || input.email.length > 254 || (input.email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(input.email))) throw new Error('Invalid contact email'); patch.email = input.email; }
  for (const key of ['deepseekKey','openalexKey']) if (input[key] != null) { if (typeof input[key] !== 'string' || input[key].length > 500 || /\s/.test(input[key])) throw new Error('Invalid API key'); if (input[key]) patch[key] = input[key]; }
  if (input.removeDeepseekKey === true) patch.deepseekKey = '';
  if (input.removeOpenalexKey === true) patch.openalexKey = '';
  return patch;
}
export function createDirectService({ chromeApi = globalThis.chrome, store = new BrowserStore(), fetcher = fetch, datasets, providerGap = 1100 } = {}) {
  let resolver, tail = Promise.resolve();
  const ready = store.open();
  async function getResolver() {
    if (!resolver) {
      const data = datasets || Object.fromEntries(await Promise.all(['ccf','core','journals','aliases'].map(async name => {
        const response = await fetcher(chromeApi.runtime.getURL(`src/data/${name}.json`));
        if (!response.ok) throw new Error('Unable to load bundled rankings'); return [name, await response.json()];
      })));
      const Resolver = createResolverClass(data, globalThis.SRRanking);
      resolver = new Resolver(store, new Providers({ config: () => store.config, fetcher, gap: providerGap, userAgent: false }), { agentFetch: fetcher });
    }
    return resolver;
  }
  async function operation(action, input = {}) {
    await ready;
    try {
      if (action === 'status') return { ...store.stats(), config: publicConfig(store.config) };
      if (action === 'config') { await store.configure(configPatch(input)); return publicConfig(store.config); }
      if (action === 'records') return store.records({ status: input.status || '', limit: Math.min(1000, Math.max(1, Number(input.limit) || 100)), offset: Math.max(0, Number(input.offset) || 0) });
      if (action === 'import') {
        if (typeof input.data === 'string' && input.data.length > 7 * 1024 * 1024) throw new Error('Import must be smaller than 7 MB');
        const rows = parseImport(input.data);
        if (input.preview !== false) return { metrics: rows.length, venues: new Set(rows.map(row => `${row.kind}:${row.identity}`)).size, preview: rows.slice(0,20) };
        store.importMetrics(rows, String(input.filename || 'Browser import').slice(0,200));
        return { imported: rows.length, revision: store.revision(), note: 'Retry missing records and refresh Scholar to update badges.' };
      }
      if (action === 'resolve') return await (await getResolver()).resolve(input);
      if (action === 'retry') { const row = store.state.records[input.key]; if (!row) throw new Error('Record not found'); return await (await getResolver()).resolve(row.request, { refresh: true }); }
      if (action === 'check-key') {
        if (!store.config.deepseekKey) throw new Error('Enter a DeepSeek API key first');
        const response = await fetcher('https://api.deepseek.com/models', { headers: { Authorization: `Bearer ${store.config.deepseekKey}` }, signal: AbortSignal.timeout(10000) });
        if (!response.ok) throw new Error(`DeepSeek key check failed (HTTP ${response.status})`);
        const data = await response.json();
        if (!data.data?.some(model => model.id === 'deepseek-flash')) throw new Error('This key does not list access to deepseek-flash');
        return { ok: true, model: 'deepseek-flash', note: 'Authenticated successfully; no completion tokens used.' };
      }
      throw new Error('Unknown metadata operation');
    } finally { await store.flush(); }
  }
  // Serialize mutations and paid-call reservations across every Scholar tab.
  // A worker restart reloads IndexedDB before allowing another operation.
  return { run(action, input) { const result = tail.then(() => operation(action,input)); tail = result.catch(() => {}); return result; } };
}
