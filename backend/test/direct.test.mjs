import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { BrowserStore } from '../../src/lib/metadata/browser-store.js';
import { createDirectService, publicConfig, configPatch } from '../../src/lib/metadata/direct-service.js';
import { createMessageHandler } from '../../src/lib/metadata/bridge.js';
const datasets = Object.fromEntries(['ccf','core','journals','aliases'].map(name => [name,JSON.parse(readFileSync(new URL(`../../src/data/${name}.json`,import.meta.url)))]));
const publication = { doi: '10.1038/nature16961' };
function environment() {
  let saved, config = {};
  const db = { createObjectStore() {}, transaction() { const tx = { objectStore() { return { get() { const req = {}; queueMicrotask(() => { req.result = saved ? structuredClone(saved) : undefined; req.onsuccess(); }); return req; }, put(value) { saved = structuredClone(value); queueMicrotask(() => tx.oncomplete()); } }; } }; return tx; } };
  const database = { open() { const req = {}; queueMicrotask(() => { req.result = db; req.onupgradeneeded?.(); req.onsuccess(); }); return req; } };
  const storage = { get: async defaults => ({ ...defaults, ...structuredClone(config) }), set: async patch => { config = { ...config,...structuredClone(patch) }; } };
  return { store: () => new BrowserStore({ database,storage }), storage, saved: () => saved };
}
const crossref = { message: { DOI: publication.doi, title: ['Mastering the game of Go with deep neural networks and tree search'], 'container-title':['Nature'],ISSN:['0028-0836','1476-4687'], type:'journal-article' } };
test('Direct mode resolves with provider APIs only and caches across worker restarts', async () => {
  const env = environment(); let calls = 0;
  const fetcher = async url => { calls++; assert(!String(url).includes('127.0.0.1')); assert(!String(url).includes('localhost')); return Response.json(String(url).includes('crossref') ? crossref : null); };
  let service = createDirectService({ store:env.store(),datasets,fetcher,providerGap:0 });
  await service.run('config',{directEnabled:true,agentEnabled:false});
  const first = await service.run('resolve',publication); assert.equal(first.status,'complete');assert(first.badges.some(b => b.text==='Nature'));
  const count = calls;
  service = createDirectService({ store:env.store(),datasets,fetcher,providerGap:0 });
  const second = await service.run('resolve',publication); assert.equal(second.cacheHit,true);assert.equal(calls,count);
});
test('Browser ranking imports are validated, persist and invalidate cache', async () => {
  const env = environment(); let service = createDirectService({store:env.store(),datasets,fetcher:async url => Response.json(String(url).includes('crossref')?crossref:null),providerGap:0});
  await service.run('resolve',publication);
  const rows = [{type:'journal',name:'Nature',issn:'0028-0836',year:2026,source:'Synthetic regression fixture',jcr:'Q2'}];
  await service.run('import',{data:rows,preview:true});assert.equal((await service.run('status')).metrics,0);
  await assert.rejects(service.run('import',{data:[{...rows[0],jcr:'Q9'}],preview:false}));assert.equal((await service.run('status')).metrics,0);
  await service.run('import',{data:rows,preview:false});
  service=createDirectService({store:env.store(),datasets,fetcher:async url => Response.json(String(url).includes('crossref')?crossref:null),providerGap:0});
  const result=await service.run('resolve',publication);assert.equal(result.cacheHit,false);assert.equal(result.metrics.find(m=>m.scheme==='jcr').year,2026);assert(result.badges.some(b=>b.text==='JCR Q2'));
});
test('Browser exports and public config never contain provider API keys', async () => {
  const env=environment(), secret='mock-private-provider-key';const service=createDirectService({store:env.store(),datasets,fetcher:async()=>Response.json(null),providerGap:0});
  await service.run('config',{directEnabled:true,deepseekKey:secret,openalexKey:secret});
  const status=await service.run('status');assert.equal(status.config.hasDeepseekKey,true);assert(!JSON.stringify(status).includes(secret));assert(!JSON.stringify(env.saved()).includes(secret));
  assert(!JSON.stringify(publicConfig({deepseekKey:secret,openalexKey:secret})).includes(secret));
  assert(!('url' in configPatch({url:'https://evil.example',dailyLimit:20})));await assert.rejects(service.run('config',{dailyLimit:-1}));
});
test('Agent budget is committed before the paid request and survives restart', async () => {
  const env=environment();let calls=0;
  const fetcher=async(url,options)=>{
    if(String(url).includes('chat/completions')) { calls++;assert.equal(env.saved().usage[new Date().toISOString().slice(0,10)].calls,1);assert.equal(options.headers.Authorization,'Bearer mock-private-key');return Response.json({choices:[{message:{content:'{"query":""}'}}]}); }
    assert(!options?.headers?.Authorization);return Response.json(String(url).includes('crossref')?{message:{items:[]}}:{results:[]});
  };
  let service=createDirectService({store:env.store(),datasets,fetcher,providerGap:0});
  await service.run('config',{directEnabled:true,agentEnabled:true,deepseekKey:'mock-private-key',dailyLimit:1});
  const request={title:'A long publication title not present in either metadata provider'};
  assert.equal((await service.run('resolve',request)).agent,'queried');
  service=createDirectService({store:env.store(),datasets,fetcher,providerGap:0});
  assert.equal((await service.run('resolve',{title:request.title+' updated'})).agent,'daily_limit');assert.equal(calls,1);
});
test('Content scripts cannot read secrets or invoke metadata administration', async () => {
  const chrome={runtime:{getURL:path=>'chrome-extension://test/'+path},storage:{local:{get:async()=>({directEnabled:true,backendEnabled:true,backendToken:'private-pairing',srDirectConfig:{deepseekKey:'private-key'}})}}};
  let action;
  const handler=createMessageHandler(chrome,async()=>{throw Error('Local server must not be called')},{run:async(...args)=>{action=args;return {ok:true};}});
  const config=await handler({type:'sr-backend-config'},{url:'https://scholar.google.com/'});assert.equal(config.directEnabled,true);assert(!JSON.stringify(config).includes('private'));
  await assert.rejects(handler({type:'sr-direct-admin',action:'status'},{url:'https://scholar.google.com/'}),/extension settings/);
  await handler({type:'sr-backend-resolve',publication},{url:'https://scholar.google.com/'});assert.deepEqual(action,['resolve',publication]);
  assert.equal((await handler({type:'sr-direct-admin',action:'status'},{url:'chrome-extension://test/src/options/options.html'})).ok,true);
});
test('Checking a saved key calls only the free authenticated models endpoint', async () => {
  const env=environment();let calls=0;
  const service=createDirectService({store:env.store(),datasets,fetcher:async(url,options)=>{calls++;assert.equal(url,'https://api.deepseek.com/models');assert.equal(options.headers.Authorization,'Bearer mock-private-key');return Response.json({data:[{id:'deepseek-flash'}]});}});
  await service.run('config',{deepseekKey:'mock-private-key'});assert.equal((await service.run('check-key')).ok,true);assert.equal(calls,1);assert.equal((await service.run('status')).usage.calls,0);
});

test('Provider outages do not consume the DeepSeek budget', async () => {
  const env=environment();let paid=0;
  const service=createDirectService({store:env.store(),datasets,providerGap:0,fetcher:async url=>{if(String(url).includes('deepseek'))paid++;throw new Error('Offline');}});
  await service.run('config',{directEnabled:true,agentEnabled:true,deepseekKey:'mock-private-key',dailyLimit:20});
  const result=await service.run('resolve',{title:'A publication that cannot be looked up during a network outage'});
  assert.equal(result.status,'unavailable');assert.equal(result.agent,'provider_unavailable');assert.equal(paid,0);assert.equal((await service.run('status')).usage.calls,0);
});

test('Native browser fetch is called without a custom object receiver', async () => {
  const { Providers } = await import('../../src/lib/metadata/providers.js');
  const provider = new Providers({ gap:0, fetcher: function () { assert.equal(this,undefined); return Promise.resolve(Response.json({ok:true})); } });
  assert.equal((await provider.json('https://api.crossref.org/works')).ok,true);
});
